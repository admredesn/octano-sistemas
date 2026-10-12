// ============================================================
// 💳 CARTÕES — pré-conferência das taxas ANTES da Conciliação (11/10/2026, pedido do Ronan)
// ------------------------------------------------------------
// "todos os recebimentos via cartão vão passar por ela; o objetivo é analisarmos as taxas e
//  deixar explícito se alguma taxa ou pagamento está divergente do acordado com as adquirentes"
// "o valor que vai para essa aba tem que vir necessariamente do fechamento de caixa, não
//  puxar direto do banco"  (correção dele no mesmo dia)
//
// FONTE = o CAIXA: cada recebimento em cartão/Pix registrado na venda (oct_fila_transmissao,
// um por abastecimento, com a forma, a bandeira e a taxa que a maquininha informou na hora do
// casamento). O extrato EDI do PagBank (oct_cartao_transacoes, baixado pelo servidor) entra só
// como RETORNO da adquirente: completa taxa/líquido/parcelas/previsão de pagamento do item do
// caixa e aponta venda que está na maquininha e não no caixa. Taxas negociadas: oct_cartao_taxas
// (Formas de Pagamento › Taxas dos cartões). Conferência de cada item: oct_cartao_caixa.
// Depois de conferir, "Enviar para a Conciliação" grava no livro da conta PagBank (bruto como
// crédito e taxa como débito, por venda, na data prevista de pagamento).
// ============================================================
const _CTZ = { de: null, ate: null, forma: '', bandeira: '', status: '', conf: '', caixa: 'conf', busca: '',
  sel: new Set(), itens: [], fora: [], txs: [], taxas: [], contas: [], turnos: [], confs: {}, controle: null, carregando: false };
const _CTZ_FORMA = { credito: 'Crédito', debito: 'Débito', pix: 'Pix' };
const _CTZ_STATUS = {
  ok:          { rot: '✓ confere',                 cor: '#7ee2a0' },
  maior:       { rot: '⚠ taxa maior',              cor: '#f87171' },
  menor:       { rot: '⚠ taxa menor',              cor: '#fbbf24' },
  sem_regra:   { rot: '? sem taxa cadastrada',     cor: '#8892a0' },
  sem_retorno: { rot: '⚠ maquininha não informou', cor: '#f0b45c' },
};
const _CTZ_TOL = 0.01;          // centavo de arredondamento da adquirente
const _CTZ_CASA_MIN = 20;       // caixa × EDI: mesma venda = mesmo valor e forma, até 20 min de diferença

function _ctzEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ctzNum(v, dec) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }); }
function _ctzDt(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
function _ctzIso(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function _ctzDias(a, b) { return (!a || !b) ? null : Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 864e5); }
// a fila do núcleo grava a hora LOCAL com "+00:00" falso (ver fechamento_caixa.js): tira o fuso e lê como local
function _ctzTsLocal(iso) { const s = String(iso || '').replace(/(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/, ''); const t = Date.parse(s); return isNaN(t) ? null : t; }
function _ctzDiaLocal(iso) { return String(iso || '').slice(0, 10); }
function _ctzHora(iso) { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; }
function _ctzSomaDias(iso, n) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + Number(n || 0)); return _ctzIso(d); }

// ---------- puras ----------
function ctzFormaDe(f) {
  const n = String((f && f.forma_nome) || '').toLowerCase(); const c = String((f && f.forma) || '').padStart(2, '0');
  if (/pix/.test(n) || ['17', '18', '19'].includes(c)) return 'pix';
  if (/déb|deb/.test(n) || c === '04') return 'debito';
  if (/créd|cred/.test(n) || c === '03') return 'credito';
  return null;
}
function ctzBruto(f) {
  if (f.valor_final != null && Number(f.valor_final) > 0) return Math.round(Number(f.valor_final) * 100) / 100;
  return Math.round((Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)) * 100) / 100;
}
// turno do item: pelo turno_id; sem ele (postos v2), pela janela de abertura/fechamento
function ctzTurnoDe(f, turnos) {
  if (f.turno_id) { const t = (turnos || []).find(x => x.id === f.turno_id); if (t) return t; }
  const ts = _ctzTsLocal(f.ocorrido_em);
  if (ts == null) return null;
  return (turnos || []).find(t => { const a = Date.parse(t.aberto_em), b = t.fechado_em ? Date.parse(t.fechado_em) : Infinity; return ts >= a - 5 * 60e3 && ts <= b + 5 * 60e3; }) || null;
}
// A regra que vale: mesma adquirente e forma, parcelas na faixa, vigente na data da venda; bandeira
// igual ou "qualquer"; do posto ou da rede. A mais específica ganha (bandeira certa > qualquer;
// do posto > da rede; vigência mais nova).
function ctzRegra(tx, taxas) {
  const forma = String(tx.forma || '').toLowerCase();
  const band = String(tx.bandeira || '').trim().toLowerCase();
  const parc = Number(tx.parcelas || 1);
  const dia = String(tx.data_venda || '');
  const adq = String(tx.adquirente || 'pagbank').toLowerCase();
  const cands = (taxas || []).filter(r => r && r.ativo !== false
    && String(r.adquirente || 'pagbank').toLowerCase() === adq
    && String(r.forma || '').toLowerCase() === forma
    && parc >= Number(r.parcelas_de || 1) && parc <= Number(r.parcelas_ate || r.parcelas_de || 1)
    && (!r.vigencia_de || String(r.vigencia_de) <= dia) && (!r.vigencia_ate || String(r.vigencia_ate) >= dia)
    && (!String(r.bandeira || '').trim() || String(r.bandeira).trim().toLowerCase() === band)
    && (!r.empresa_id || r.empresa_id === tx.empresa_id));
  cands.sort((a, b) => ((String(b.bandeira || '').trim() ? 1 : 0) - (String(a.bandeira || '').trim() ? 1 : 0))
    || ((b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0))
    || String(b.vigencia_de || '').localeCompare(String(a.vigencia_de || '')));
  return cands[0] || null;
}
// cobrado (o que a maquininha informou) × esperado (bruto × % + tarifa fixa). Tolerância de 1 centavo.
// cobrada == null = a maquininha não informou taxa nenhuma para esta venda (e-mail sem taxa, ou sem retorno).
function ctzAvaliar(it, regra, tol) {
  tol = tol == null ? _CTZ_TOL : tol;
  const bruto = Number(it.valor_bruto || 0);
  const cobrada = it.taxa_cobrada == null ? null : Math.round(Number(it.taxa_cobrada) * 100) / 100;
  const pctCobrada = (cobrada != null && bruto > 0) ? cobrada / bruto * 100 : null;
  const prazo = _ctzDias(it.data_venda, it.data_prevista_pagamento);
  const base = { cobrada, pctCobrada, prazo, regra: regra || null, esperada: null, pctEsperada: null, dif: null, prazoDiverge: false };
  if (!regra) return Object.assign(base, { status: cobrada == null ? 'sem_retorno' : 'sem_regra' });
  const esperada = Math.round((bruto * Number(regra.taxa_pct || 0) / 100 + Number(regra.tarifa_fixa || 0)) * 100) / 100;
  base.esperada = esperada; base.pctEsperada = Number(regra.taxa_pct || 0);
  if (cobrada == null) return Object.assign(base, { status: 'sem_retorno' });
  const dif = Math.round((cobrada - esperada) * 100) / 100;
  const prazoDiverge = regra.prazo_dias != null && prazo != null && Number(regra.prazo_dias) !== prazo;
  return Object.assign(base, { dif, prazoDiverge, status: Math.abs(dif) <= tol + 1e-9 ? 'ok' : dif > 0 ? 'maior' : 'menor' });
}
// casa cada item do caixa com a transação do EDI: mesma forma, mesmo valor, até 20 min de distância,
// bandeira igual quando as duas existem; cada transação serve a um item só (a mais próxima no tempo).
function ctzCasarEdi(itens, txs) {
  const livres = (txs || []).map(t => ({ t, ts: Date.parse(t.recebido_em), usado: false }));
  (itens || []).forEach(it => {
    it.transacao = null;
    const ts = _ctzTsLocal(it.ocorrido_em);
    if (ts == null) return;
    let melhor = null;
    livres.forEach(c => {
      if (c.usado || isNaN(c.ts)) return;
      const t = c.t;
      if (String(t.forma || '') !== it.forma) return;
      if (Math.abs(Number(t.valor_bruto || 0) - it.valor_bruto) > 0.005) return;
      const dmin = Math.abs(c.ts - ts) / 60e3;
      if (dmin > _CTZ_CASA_MIN) return;
      if (it.bandeira && t.bandeira && String(it.bandeira).toLowerCase() !== String(t.bandeira).toLowerCase()) return;
      if (!melhor || dmin < melhor.dmin) melhor = { c, dmin };
    });
    if (melhor) { melhor.c.usado = true; it.transacao = melhor.c.t; }
  });
  return (txs || []).filter(t => !livres.find(c => c.t === t).usado);   // o que a maquininha tem e o caixa não
}
// o item da aba a partir da linha do caixa (+ turno, + transação do EDI quando casou)
function ctzItem(f, turno, taxas, empresaId) {
  const it = {
    id: f.id, empresa_id: empresaId, adquirente: 'pagbank', forma: ctzFormaDe(f), bandeira: f.bandeira || null,
    data_venda: _ctzDiaLocal(f.ocorrido_em), hora: _ctzHora(f.ocorrido_em), ocorrido_em: f.ocorrido_em,
    valor_bruto: ctzBruto(f), taxa_fila: Number(f.taxa || 0) > 0 ? Math.round(Number(f.taxa) * 100) / 100 : null,
    descricao: f.descricao || '', litros: Number(f.litros || 0), vendedor: f.vendedor || '', status_fila: f.status || '', nfce: f.numero_nfce || null,
    turno, turno_num: turno ? turno.numero : null, caixa_confirmado: !!(turno && turno.conferido_em),
    parcelas: 1, taxa_cobrada: null, data_prevista_pagamento: null, nsu: null, transacao: null,
  };
  return it;
}
function ctzCompletar(it, taxas) {
  const tx = it.transacao;
  if (tx) {
    it.parcelas = Number(tx.parcelas || 1);
    it.taxa_cobrada = Math.round((Number(tx.taxa_valor || 0) + Number(tx.tarifa_valor || 0)) * 100) / 100;
    it.data_prevista_pagamento = tx.data_prevista_pagamento || null;
    it.nsu = tx.nsu || null;
    if (!it.bandeira && tx.bandeira) it.bandeira = tx.bandeira;
  } else {
    it.taxa_cobrada = it.taxa_fila;      // a taxa que a maquininha informou ao casar (EDI); e-mail não traz
  }
  it.valor_liquido = it.taxa_cobrada == null ? null : Math.round((it.valor_bruto - it.taxa_cobrada) * 100) / 100;
  it.regra = ctzRegra(it, taxas);
  if (!it.data_prevista_pagamento && it.regra && it.regra.prazo_dias != null) it.data_prevista_pagamento = _ctzSomaDias(it.data_venda, it.regra.prazo_dias);
  it._av = ctzAvaliar(it, it.regra);
  return it;
}
function ctzResumo(lista) {
  const r = { n: 0, bruto: 0, taxas: 0, liquido: 0, esperado: 0, dif: 0, nDiv: 0, difDiv: 0, nSem: 0, nSemRet: 0, nConf: 0, nLivro: 0, nPrazo: 0, nCaixa: 0, porForma: {} };
  (lista || []).forEach(x => {
    const a = x._av || {};
    r.n++; r.bruto += Number(x.valor_bruto || 0);
    if (a.cobrada != null) { r.taxas += a.cobrada; r.liquido += Number(x.valor_liquido || 0); } else r.liquido += Number(x.valor_bruto || 0);
    if (a.status === 'sem_regra') r.nSem++;
    else if (a.status === 'sem_retorno') r.nSemRet++;
    else { r.esperado += a.esperada || 0; r.dif += a.dif || 0; if (a.status !== 'ok') { r.nDiv++; r.difDiv += a.dif || 0; } }
    if (a.prazoDiverge) r.nPrazo++;
    if (x.conferido) r.nConf++;
    if (x.livro_em) r.nLivro++;
    if (x.caixa_confirmado) r.nCaixa++;
    const f = _CTZ_FORMA[String(x.forma || '')] || 'Outro';
    const pf = r.porForma[f] = r.porForma[f] || { n: 0, bruto: 0 };
    pf.n++; pf.bruto += Number(x.valor_bruto || 0);
  });
  ['bruto', 'taxas', 'liquido', 'esperado', 'dif', 'difDiv'].forEach(k => { r[k] = Math.round(r[k] * 100) / 100; });
  r.pctMedia = r.bruto > 0 ? r.taxas / r.bruto * 100 : 0;
  return r;
}
// linhas do livro (puras): bruto como crédito e taxa como débito, por venda, na data prevista
function ctzLinhasLivro(it, contaId, autor, agora) {
  const data = it.data_prevista_pagamento || it.data_venda;
  const forma = _CTZ_FORMA[String(it.forma || '')] || 'Cartão';
  const quem = [forma.toUpperCase(), it.bandeira, Number(it.parcelas || 1) > 1 ? it.parcelas + 'x' : ''].filter(Boolean).join(' ');
  const venda = `venda ${_ctzDt(it.data_venda)}${it.hora ? ' ' + it.hora : ''}`;
  const detalhe = [venda, it.turno_num ? 'turno ' + it.turno_num : '', it.nsu ? 'NSU ' + it.nsu : '', it.descricao ? it.descricao : ''].filter(Boolean).join(' · ');
  const comum = { empresa_id: it.empresa_id, conta_id: contaId, data, autor: autor || null, atualizado_em: agora, documento: it.nsu || (it.nfce ? 'NFC-e ' + it.nfce : null) };
  const out = [Object.assign({}, comum, { natureza: 'C', valor: Number(it.valor_bruto || 0), tipo: 'venda_cartao', descricao: 'CARTÃO ' + quem, detalhe, origem: 'cartoes', origem_id: it.id })];
  const taxa = it.taxa_cobrada == null ? 0 : Math.round(Number(it.taxa_cobrada) * 100) / 100;
  if (taxa > 0) out.push(Object.assign({}, comum, { natureza: 'D', valor: taxa, tipo: 'taxa_cartao', descricao: 'TAXA ' + quem, detalhe, origem: 'cartoes_taxa', origem_id: it.id }));
  return out.filter(l => l.valor > 0);
}

// ---------- tela ----------
async function moduloCartoes() {
  const conteudo = document.getElementById('conteudo');
  if (!podeOuAvisa('cartoes.ver')) { conteudo.innerHTML = ''; return; }
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando cartões...</p>';
  if (!_CTZ.de) { const h = new Date(); const d = new Date(h); d.setDate(d.getDate() - 7); _CTZ.de = _ctzIso(d); _CTZ.ate = _ctzIso(h); }
  await _ctzCarregar();
}
function _ctzEid() { return (typeof empresaAtiva === 'function') ? empresaAtiva() : null; }
async function _ctzTudo(fn) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fn(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function _ctzCarregar() {
  const eid = _ctzEid();
  if (!eid) { document.getElementById('conteudo').innerHTML = '<p style="color:#f87171;padding:20px">Selecione a empresa.</p>'; return; }
  _CTZ.carregando = true;
  try {
    const deTs = _CTZ.de + 'T00:00:00', ateTs = _CTZ.ate + 'T23:59:59';
    const [fila, turnos, txs, rT, rC, rK] = await Promise.all([
      _ctzTudo((a, b) => sb.from('oct_fila_transmissao').select('id,turno_id,descricao,litros,valor,valor_final,desconto,acrescimo,forma,forma_nome,bandeira,status,ocorrido_em,taxa,vendedor,numero_nfce')
        .eq('empresa_id', eid).in('forma_nome', ['Crédito', 'Débito', 'Pix', 'Cartão']).gte('ocorrido_em', deTs).lte('ocorrido_em', ateTs).order('ocorrido_em').order('id').range(a, b)),
      _ctzTudo((a, b) => sb.from('oct_pdv_turnos').select('id,numero,operador,aberto_em,fechado_em,conferido_em').eq('empresa_id', eid)
        .gte('aberto_em', _ctzSomaDias(_CTZ.de, -2) + 'T00:00:00Z').lte('aberto_em', ateTs + 'Z').order('aberto_em').range(a, b)),
      _ctzTudo((a, b) => sb.from('oct_cartao_transacoes').select('*').eq('empresa_id', eid).gte('data_venda', _CTZ.de).lte('data_venda', _CTZ.ate).order('recebido_em').range(a, b))
        .catch(() => []),
      sb.from('oct_cartao_taxas').select('*').or(`empresa_id.is.null,empresa_id.eq.${eid}`),
      sb.from('oct_fin_contas').select('id,nome,tipo,ativo,ordem').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
      sb.from('oct_cartao_controle').select('*').eq('adquirente', 'pagbank').maybeSingle().then(r => r, () => ({ data: null })),
    ]);
    _CTZ.taxas = rT.data || []; _CTZ.contas = rC.data || []; _CTZ.controle = (rK && rK.data) || null; _CTZ.turnos = turnos; _CTZ.txs = txs;
    const itens = fila.filter(f => ctzFormaDe(f)).map(f => ctzItem(f, ctzTurnoDe(f, turnos), _CTZ.taxas, eid));
    _CTZ.fora = ctzCasarEdi(itens, txs);
    itens.forEach(it => ctzCompletar(it, _CTZ.taxas));
    // conferência de cada item (oct_cartao_caixa)
    _CTZ.confs = {};
    _CTZ.semTabela = false;
    const ids = itens.map(i => i.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from('oct_cartao_caixa').select('*').in('fila_id', ids.slice(i, i + 200));
      if (error) { _CTZ.semTabela = /oct_cartao_caixa/.test(String(error.message || '')); break; }
      (data || []).forEach(c => { _CTZ.confs[c.fila_id] = c; });
    }
    itens.forEach(it => { const c = _CTZ.confs[it.id]; it.conferido = !!(c && c.conferido); it.conferido_por = c ? c.conferido_por : null; it.conferido_em = c ? c.conferido_em : null; it.livro_em = c ? c.livro_em : null; it.obs = c ? c.obs : null; });
    _CTZ.itens = itens;
    _CTZ.sel = new Set([..._CTZ.sel].filter(id => itens.some(t => t.id === id)));
  } catch (e) {
    document.getElementById('conteudo').innerHTML = `<div style="padding:24px;max-width:720px"><p style="color:#fbbf24;margin:0 0 8px">${/oct_cartao_taxas/.test(String(e.message || '')) ? 'Falta rodar <b>repo/sql/SQL-CARTOES.sql</b> no Supabase.' : 'Erro ao carregar: ' + _ctzEsc(e.message || e)}</p></div>`;
    _CTZ.carregando = false; return;
  }
  _CTZ.carregando = false;
  _ctzRender();
}
function _ctzVisiveis() {
  const b = _CTZ.busca.toLowerCase();
  return _CTZ.itens.filter(t => (_CTZ.caixa !== 'conf' || t.caixa_confirmado)
    && (!_CTZ.forma || t.forma === _CTZ.forma)
    && (!_CTZ.bandeira || String(t.bandeira || '') === _CTZ.bandeira)
    && (!_CTZ.status || (_CTZ.status === 'div' ? (t._av.status === 'maior' || t._av.status === 'menor' || t._av.prazoDiverge) : t._av.status === _CTZ.status))
    && (!_CTZ.conf || (_CTZ.conf === 'sim' ? !!t.conferido : _CTZ.conf === 'nao' ? !t.conferido : _CTZ.conf === 'livro' ? !!t.livro_em : !t.livro_em))
    && (!b || [t.bandeira, t.nsu, t.descricao, t.vendedor, t.turno_num, _ctzNum(t.valor_bruto), t.valor_liquido == null ? '' : _ctzNum(t.valor_liquido), t.hora].join(' ').toLowerCase().includes(b)));
}
function _ctzRender() {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  const vis = _ctzVisiveis();
  const r = ctzResumo(vis);
  const bandeiras = [...new Set(_CTZ.itens.map(t => t.bandeira).filter(Boolean))].sort();
  const contaPag = _CTZ.contas.find(c => c.tipo === 'pagbank');
  const sel = (id, v, opts) => `<select onchange="ctzFiltro('${id}', this.value)" class="ctz-inp">${opts.map(o => `<option value="${_ctzEsc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${_ctzEsc(o[1])}</option>`).join('')}</select>`;
  const card = (rot, val, sub, cor) => `<div class="ctz-card"><div class="ctz-card-rot">${rot}</div><div class="ctz-card-val" style="color:${cor || '#e5e7eb'}">${val}</div>${sub ? `<div class="ctz-card-sub">${sub}</div>` : ''}</div>`;
  const ctrl = _CTZ.controle;
  const ctrlTxt = ctrl ? (ctrl.erro ? `<span style="color:#f87171" title="${_ctzEsc(ctrl.erro)}">retorno da maquininha (EDI) parado: ${_ctzEsc(ctrl.erro)}</span>` : `retorno da maquininha (EDI) atualizado ${ctrl.ultima_consulta ? new Date(ctrl.ultima_consulta).toLocaleString('pt-BR') : '—'}`) : '<span style="color:#fbbf24">retorno da maquininha (EDI) ainda não configurado no servidor — vale a taxa que o caixa recebeu</span>';
  const naoConf = _CTZ.itens.filter(t => !t.caixa_confirmado).length;
  const linhas = vis.map(t => {
    const a = t._av; const st = _CTZ_STATUS[a.status];
    const marcado = _CTZ.sel.has(t.id);
    const turnoTxt = t.turno ? `turno ${t.turno_num}${t.caixa_confirmado ? ' <span style="color:#7ee2a0" title="caixa confirmado no F.Caixa">✓</span>' : ' <span style="color:#fbbf24" title="caixa ainda não confirmado">a conferir</span>'}` : '<span style="color:#667">sem turno</span>';
    return `<tr class="ctz-lin ${marcado ? 'sel' : ''} ${a.status}" onclick="ctzSel('${t.id}', event)">
      <td class="ctz-td"><input type="checkbox" ${marcado ? 'checked' : ''} onclick="event.stopPropagation();ctzSel('${t.id}', event, true)"></td>
      <td class="ctz-td">${_ctzDt(t.data_venda)}</td><td class="ctz-td ctz-mut">${_ctzEsc(t.hora)}</td>
      <td class="ctz-td" style="font-size:0.7rem">${turnoTxt}<br><span class="ctz-mut">${_ctzEsc((t.vendedor || '').split(' ').slice(0, 2).join(' '))}</span></td>
      <td class="ctz-td ctz-mut" style="font-size:0.7rem" title="${_ctzEsc(t.descricao)}">${_ctzEsc(t.descricao).slice(0, 18)}${t.litros ? ' · ' + _ctzNum(t.litros, 2) + ' L' : ''}</td>
      <td class="ctz-td">${_CTZ_FORMA[t.forma] || ''}</td><td class="ctz-td">${_ctzEsc(t.bandeira || '')}</td>
      <td class="ctz-td ctz-r">${Number(t.parcelas || 1) > 1 ? t.parcelas + 'x' : '—'}</td>
      <td class="ctz-td ctz-r">${_ctzNum(t.valor_bruto)}</td>
      <td class="ctz-td ctz-r" style="color:#f0b45c">${a.cobrada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.cobrada)}</td>
      <td class="ctz-td ctz-r ctz-mut">${a.pctCobrada == null ? '—' : _ctzNum(a.pctCobrada, 2) + '%'}</td>
      <td class="ctz-td ctz-r">${a.pctEsperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.pctEsperada, 2) + '%'}</td>
      <td class="ctz-td ctz-r">${a.esperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.esperada)}</td>
      <td class="ctz-td ctz-r" style="color:${a.dif == null ? '#667' : Math.abs(a.dif) <= _CTZ_TOL ? '#7ee2a0' : a.dif > 0 ? '#f87171' : '#fbbf24'};font-weight:${a.dif != null && Math.abs(a.dif) > _CTZ_TOL ? 700 : 400}">${a.dif == null ? '—' : (a.dif > 0 ? '+' : '') + _ctzNum(a.dif)}</td>
      <td class="ctz-td ctz-r" style="font-weight:600">${t.valor_liquido == null ? '<span class="ctz-mut">—</span>' : _ctzNum(t.valor_liquido)}</td>
      <td class="ctz-td ${a.prazoDiverge ? 'ctz-prazo' : ''}" title="${a.prazoDiverge ? 'Combinado: D+' + a.regra.prazo_dias : (t.transacao ? 'previsão informada pela adquirente' : 'previsão pelo prazo combinado')}">${_ctzDt(t.data_prevista_pagamento)}${a.prazo != null ? ` <span class="ctz-mut" style="font-size:0.66rem">D+${a.prazo}${t.transacao ? '' : '*'}</span>` : ''}</td>
      <td class="ctz-td ctz-mut" style="font-size:0.7rem">${t.transacao ? _ctzEsc(t.nsu || '✓') : '<span title="sem a venda correspondente no extrato EDI">—</span>'}</td>
      <td class="ctz-td" style="color:${st.cor};white-space:nowrap">${st.rot}${a.prazoDiverge ? ' <span title="prazo diferente do combinado" style="color:#fbbf24">⏱</span>' : ''}</td>
      <td class="ctz-td" style="text-align:center">${t.conferido ? `<span style="color:#7ee2a0" title="por ${_ctzEsc(t.conferido_por || '')} em ${t.conferido_em ? new Date(t.conferido_em).toLocaleString('pt-BR') : ''}">✓</span>` : '<span class="ctz-mut">·</span>'}${t.livro_em ? ' <span style="color:#7ea8d8" title="já na Conciliação (livro da conta PagBank)">📒</span>' : ''}</td>
    </tr>`;
  }).join('');
  const foraVis = _CTZ.fora.filter(t => (!_CTZ.forma || t.forma === _CTZ.forma));
  const foraHtml = foraVis.length ? `
    <div style="margin-top:16px">
      <div style="color:#f0b45c;font-weight:700;font-size:0.86rem;margin-bottom:6px">⚠ Na maquininha e fora do caixa (${foraVis.length}) — R$ ${_ctzNum(foraVis.reduce((s, t) => s + Number(t.valor_bruto || 0), 0))}</div>
      <div style="color:#8892a0;font-size:0.72rem;margin-bottom:6px">Vendas que a adquirente informou no período e que não têm um recebimento igual (mesma forma, mesmo valor, até ${_CTZ_CASA_MIN} min) registrado no caixa.</div>
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:36vh">
        <table style="width:100%;border-collapse:collapse"><thead><tr><th class="ctz-th">Data</th><th class="ctz-th">Hora</th><th class="ctz-th">Maquininha</th><th class="ctz-th">Forma</th><th class="ctz-th">Bandeira</th><th class="ctz-th" style="text-align:right">Bruto</th><th class="ctz-th" style="text-align:right">Taxa</th><th class="ctz-th" style="text-align:right">Líquido</th><th class="ctz-th">Previsão</th><th class="ctz-th">NSU</th></tr></thead>
        <tbody>${foraVis.map(t => `<tr><td class="ctz-td">${_ctzDt(t.data_venda)}</td><td class="ctz-td ctz-mut">${_ctzEsc(t.hora || '')}</td><td class="ctz-td ctz-mut" style="font-size:0.7rem">${_ctzEsc(t.maquininha || '')}</td><td class="ctz-td">${_CTZ_FORMA[t.forma] || _ctzEsc(t.forma || '')}</td><td class="ctz-td">${_ctzEsc(t.bandeira || '')}</td>
          <td class="ctz-td ctz-r">${_ctzNum(t.valor_bruto)}</td><td class="ctz-td ctz-r" style="color:#f0b45c">${_ctzNum(Number(t.taxa_valor || 0) + Number(t.tarifa_valor || 0))}</td><td class="ctz-td ctz-r">${_ctzNum(t.valor_liquido)}</td><td class="ctz-td">${_ctzDt(t.data_prevista_pagamento)}</td><td class="ctz-td ctz-mut" style="font-size:0.7rem">${_ctzEsc(t.nsu || '')}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>` : '';
  raiz.innerHTML = `
  <style>
    .ctz-inp{padding:6px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#e5e7eb;font-size:0.8rem}
    .ctz-btn{padding:7px 12px;border-radius:7px;border:1px solid #2a3a4a;background:#161a26;color:#cbd5e1;cursor:pointer;font-size:0.8rem;white-space:nowrap}
    .ctz-btn:hover{border-color:#4a6a8a}.ctz-btn.azul{border-color:#2a4a6a;color:#93c5fd}.ctz-btn.verde{border-color:#2a5a3a;color:#7be0a0}
    .ctz-card{background:#0f1520;border:1px solid #2a3a4a;border-radius:10px;padding:10px 14px;min-width:150px}
    .ctz-card-rot{color:#8892a0;font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em}.ctz-card-val{font-size:1.15rem;font-weight:800}.ctz-card-sub{color:#667;font-size:0.68rem;margin-top:2px}
    .ctz-td{padding:5px 7px;border-bottom:1px solid #1c1f2e;font-size:0.76rem;vertical-align:top}.ctz-r{text-align:right;white-space:nowrap}.ctz-mut{color:#8892a0}
    .ctz-lin{cursor:pointer}.ctz-lin:hover td{background:#141826}.ctz-lin.sel td{background:#1e3a5f}.ctz-lin.maior td:first-child{box-shadow:inset 3px 0 #f87171}.ctz-lin.menor td:first-child{box-shadow:inset 3px 0 #fbbf24}.ctz-lin.sem_retorno td:first-child{box-shadow:inset 3px 0 #f0b45c}
    .ctz-prazo{color:#fbbf24}
    .ctz-th{position:sticky;top:0;background:#0f1119;color:#888;text-align:left;padding:8px 7px;font-size:0.72rem;white-space:nowrap}
  </style>
  <div style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <h2 style="margin:0;color:#e5e7eb;font-size:1.1rem">💳 Cartões — pré-conferência das taxas</h2>
      <span style="color:#667;font-size:0.72rem">recebimentos em cartão/Pix do CAIXA · ${ctrlTxt}</span>
      <span style="flex:1"></span>
      <button class="ctz-btn" onclick="ctzTaxas()" title="Taxas negociadas com a adquirente">% Taxas negociadas (${_CTZ.taxas.length})</button>
      <button class="ctz-btn azul" onclick="ctzBaixar()" title="Baixa do EDI do PagBank o retorno da adquirente para o período da tela (até 62 dias)">⬇ Retorno da maquininha (EDI)</button>
      <button class="ctz-btn" onclick="ctzCsv()">📄 Planilha (CSV)</button>
      <button class="ctz-btn" onclick="_ctzCarregar()">↻</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <span style="color:#8892a0;font-size:0.75rem">Venda de</span>
      <input type="date" class="ctz-inp" value="${_CTZ.de}" onchange="ctzFiltro('de', this.value)"> <span style="color:#667">a</span>
      <input type="date" class="ctz-inp" value="${_CTZ.ate}" onchange="ctzFiltro('ate', this.value)">
      ${sel('caixa', _CTZ.caixa, [['conf', 'Só caixa confirmado (F.Caixa)'], ['todos', 'Todos os turnos']])}
      ${sel('forma', _CTZ.forma, [['', 'Crédito + Débito + Pix'], ['credito', 'Crédito'], ['debito', 'Débito'], ['pix', 'Pix (maquininha)']])}
      ${sel('bandeira', _CTZ.bandeira, [['', 'Todas as bandeiras']].concat(bandeiras.map(b => [b, b])))}
      ${sel('status', _CTZ.status, [['', 'Tudo'], ['div', 'Só divergentes'], ['ok', 'Só o que confere'], ['sem_retorno', 'Maquininha não informou'], ['sem_regra', 'Sem taxa cadastrada']])}
      ${sel('conf', _CTZ.conf, [['', 'Conferidos e não'], ['nao', 'Não conferidos'], ['sim', 'Conferidos'], ['semlivro', 'Ainda fora da Conciliação'], ['livro', 'Já na Conciliação']])}
      <input class="ctz-inp" placeholder="turno, vendedor, NSU, valor…" value="${_ctzEsc(_CTZ.busca)}" oninput="ctzFiltro('busca', this.value, true)" style="width:190px">
    </div>
    ${_CTZ.caixa === 'conf' && naoConf ? `<div style="color:#fbbf24;font-size:0.74rem;margin-bottom:8px">${naoConf} recebimento(s) do período estão em turnos ainda <b>não confirmados</b> no F.Caixa e ficam de fora até a conferência do caixa. (Para vê-los: "Todos os turnos".)</div>` : ''}
    ${_CTZ.semTabela ? '<div style="color:#fbbf24;font-size:0.74rem;margin-bottom:8px">Falta rodar <b>repo/sql/SQL-CARTOES-CAIXA.sql</b>: a conferência (✔) e o envio para a Conciliação ficam desligados até lá.</div>' : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${card('Recebimentos', _ctzNum(r.n, 0), Object.entries(r.porForma).map(([f, v]) => `${f} ${v.n}`).join(' · '))}
      ${card('Bruto (caixa)', 'R$ ' + _ctzNum(r.bruto))}
      ${card('Taxas cobradas', 'R$ ' + _ctzNum(r.taxas), 'média ' + _ctzNum(r.pctMedia, 2) + '%', '#f0b45c')}
      ${card('Líquido', 'R$ ' + _ctzNum(r.liquido), null, '#7ee2a0')}
      ${card('Divergentes', _ctzNum(r.nDiv, 0), r.nDiv ? ('diferença ' + (r.difDiv > 0 ? '+' : '') + 'R$ ' + _ctzNum(r.difDiv)) : 'nenhuma taxa fora do negociado', r.nDiv ? '#f87171' : '#7ee2a0')}
      ${r.nSemRet ? card('Maquininha não informou', _ctzNum(r.nSemRet, 0), 'sem taxa no caixa nem no EDI', '#f0b45c') : ''}
      ${card('Sem taxa cadastrada', _ctzNum(r.nSem, 0), r.nSem ? 'cadastre em Taxas negociadas' : '', r.nSem ? '#fbbf24' : '#8892a0')}
      ${r.nPrazo ? card('Prazo diferente', _ctzNum(r.nPrazo, 0), 'previsão ≠ combinado', '#fbbf24') : ''}
      ${card('Conferidas', `${_ctzNum(r.nConf, 0)} / ${_ctzNum(r.n, 0)}`, `${_ctzNum(r.nLivro, 0)} na Conciliação`)}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span style="color:#8892a0;font-size:0.76rem">${_CTZ.sel.size} selecionada(s)</span>
      <button class="ctz-btn" onclick="ctzSelTodas(true)">Marcar visíveis</button>
      <button class="ctz-btn" onclick="ctzSelTodas(false)">Desmarcar</button>
      <button class="ctz-btn verde" onclick="ctzConferir(true)">✔ Conferir selecionadas</button>
      <button class="ctz-btn" onclick="ctzConferir(false)">↩ Desfazer conferência</button>
      <button class="ctz-btn azul" onclick="ctzEnviarLivro()" title="${contaPag ? 'Grava no livro da conta ' + _ctzEsc(contaPag.nome) : 'Cadastre a conta PagBank em Conciliação › Contas'}">📒 Enviar conferidas para a Conciliação${contaPag ? '' : ' (sem conta PagBank)'}</button>
    </div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:60vh">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="ctz-th"></th><th class="ctz-th">Data</th><th class="ctz-th">Hora</th><th class="ctz-th">Turno · vendedor</th><th class="ctz-th">Venda</th><th class="ctz-th">Forma</th><th class="ctz-th">Bandeira</th>
          <th class="ctz-th" style="text-align:right">Parc.</th><th class="ctz-th" style="text-align:right">Bruto</th><th class="ctz-th" style="text-align:right">Taxa cobrada</th><th class="ctz-th" style="text-align:right">%</th>
          <th class="ctz-th" style="text-align:right">Negociada</th><th class="ctz-th" style="text-align:right">Taxa esperada</th><th class="ctz-th" style="text-align:right">Diferença</th><th class="ctz-th" style="text-align:right">Líquido</th>
          <th class="ctz-th">Previsão pagto</th><th class="ctz-th">EDI/NSU</th><th class="ctz-th">Situação</th><th class="ctz-th">Conf.</th>
        </tr></thead>
        <tbody>${linhas || `<tr><td colspan="19" style="padding:24px;text-align:center;color:#667">Nenhum recebimento em cartão/Pix${_CTZ.itens.length ? ' com estes filtros' : ' registrado no caixa neste período'}.</td></tr>`}</tbody>
      </table>
    </div>
    ${foraHtml}
    <p style="color:#667;font-size:0.7rem;margin:8px 0 0">Bruto = o que o caixa registrou na venda. Taxa cobrada = a que a maquininha informou (retorno EDI; sem ele, a taxa recebida pelo caixa ao casar a venda). Esperada = bruto × % negociado (+ tarifa fixa), tolerância de R$ 0,01. Previsão com * = calculada pelo prazo combinado (a adquirente ainda não informou). Linha vermelha: taxa maior; amarela: menor; laranja: a maquininha não informou taxa.</p>
  </div>`;
}
function ctzFiltro(k, v, digitando) {
  _CTZ[k] = v;
  if (['de', 'ate'].includes(k)) { _ctzCarregar(); return; }
  if (digitando) { clearTimeout(window._ctzT); window._ctzT = setTimeout(_ctzRender, 250); return; }
  _ctzRender();
}
function ctzSel(id) { if (_CTZ.sel.has(id)) _CTZ.sel.delete(id); else _CTZ.sel.add(id); _ctzRender(); }
function ctzSelTodas(marcar) { _CTZ.sel = marcar ? new Set(_ctzVisiveis().map(t => t.id)) : new Set(); _ctzRender(); }
async function ctzBaixar() {
  if (!podeOuAvisa('cartoes.baixar')) return;
  const de = _CTZ.de, ate = _CTZ.ate;
  if (!confirm(`Baixar do EDI do PagBank o retorno da adquirente de ${_ctzDt(de)} a ${_ctzDt(ate)}?\n(serve para completar taxa, líquido e previsão de pagamento dos recebimentos do caixa; o dia de hoje vem parcial)`)) return;
  const btns = document.querySelectorAll('.ctz-btn'); btns.forEach(b => { b.disabled = true; });
  try {
    const r = await fetch((typeof SEFAZ_URL !== 'undefined' ? SEFAZ_URL : 'https://octano-sefaz-production-66d4.up.railway.app') + '/cartoes/baixar',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ de, ate }) });
    const j = await r.json();
    if (!j.ok) { alert('Não baixou: ' + (j.motivo || 'erro')); return; }
    alert(`✔ ${j.vendas} transação(ões) da adquirente no período${j.sem_posto ? `\n⚠ ${j.sem_posto} de maquininha sem posto cadastrado (Parâmetros › Recebimentos)` : ''}`);
    await _ctzCarregar();
  } catch (e) { alert('Erro: ' + (e.message || e)); }
  finally { btns.forEach(b => { b.disabled = false; }); }
}
async function _ctzAutor() { try { const s = await getSession(); return (s && s.user && (s.user.email || s.user.id)) || null; } catch (e) { return null; } }
async function _ctzGravarConf(itens, campos) {
  const eid = _ctzEid();
  const linhas = itens.map(it => Object.assign({ fila_id: it.id, empresa_id: eid, transacao_id: it.transacao ? it.transacao.id : null, atualizado_em: new Date().toISOString() },
    _CTZ.confs[it.id] ? { conferido: _CTZ.confs[it.id].conferido, conferido_por: _CTZ.confs[it.id].conferido_por, conferido_em: _CTZ.confs[it.id].conferido_em, obs: _CTZ.confs[it.id].obs, livro_em: _CTZ.confs[it.id].livro_em } : {}, campos));
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await sb.from('oct_cartao_caixa').upsert(linhas.slice(i, i + 200), { onConflict: 'fila_id' });
    if (error) throw error;
  }
}
async function ctzConferir(valor) {
  if (!podeOuAvisa('cartoes.conferir')) return;
  if (_CTZ.semTabela) { alert('Falta rodar repo/sql/SQL-CARTOES-CAIXA.sql.'); return; }
  const alvo = _CTZ.itens.filter(t => _CTZ.sel.has(t.id));
  if (!alvo.length) { alert('Marque os recebimentos.'); return; }
  const por = await _ctzAutor(); const em = new Date().toISOString();
  try { await _ctzGravarConf(alvo, valor ? { conferido: true, conferido_por: por, conferido_em: em } : { conferido: false, conferido_por: null, conferido_em: null }); }
  catch (e) { alert('Erro: ' + (e.message || e)); return; }
  _CTZ.sel.clear();
  await _ctzCarregar();
}
async function ctzEnviarLivro() {
  if (!podeOuAvisa('cartoes.livro')) return;
  if (_CTZ.semTabela) { alert('Falta rodar repo/sql/SQL-CARTOES-CAIXA.sql.'); return; }
  const conta = _CTZ.contas.find(c => c.tipo === 'pagbank');
  if (!conta) { alert('Cadastre a conta PagBank (maquininha) em Conciliação › 🏦 Contas.'); return; }
  const base = _CTZ.sel.size ? _CTZ.itens.filter(t => _CTZ.sel.has(t.id)) : _ctzVisiveis();
  const alvo = base.filter(t => t.conferido && !t.livro_em && t.caixa_confirmado);
  const pulou = base.length - alvo.length;
  if (!alvo.length) { alert('Nada a enviar: só vão os recebimentos CONFERIDOS, de caixa confirmado, que ainda não estão na Conciliação.'); return; }
  const bruto = alvo.reduce((s, t) => s + Number(t.valor_bruto || 0), 0), taxa = alvo.reduce((s, t) => s + Number(t.taxa_cobrada || 0), 0);
  if (!confirm(`Enviar ${alvo.length} recebimento(s) para a Conciliação (conta ${conta.nome})?\nBruto R$ ${_ctzNum(bruto)} como crédito e taxas R$ ${_ctzNum(taxa)} como débito, na data prevista de pagamento.${pulou ? `\n${pulou} ficam de fora (não conferidos, caixa não confirmado ou já enviados).` : ''}`)) return;
  const por = await _ctzAutor(); const em = new Date().toISOString();
  try {
    for (let i = 0; i < alvo.length; i += 100) {
      const lote = alvo.slice(i, i + 100);
      const ids = lote.map(t => t.id);
      const { data: conc } = await sb.from('oct_fin_lancamentos').select('origem_id').in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', ids).eq('conciliado', true);
      const presos = new Set((conc || []).map(x => x.origem_id));
      const livres = lote.filter(t => !presos.has(t.id));
      if (livres.length) {
        await sb.from('oct_fin_lancamentos').delete().in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', livres.map(t => t.id)).eq('conciliado', false);
        const linhas = livres.flatMap(t => ctzLinhasLivro(t, conta.id, por, em));
        const { error } = await sb.from('oct_fin_lancamentos').insert(linhas);
        if (error) throw error;
      }
      await _ctzGravarConf(lote, { livro_em: em });
    }
  } catch (e) { alert('Erro ao enviar: ' + (e.message || e)); return; }
  _CTZ.sel.clear();
  alert(`✔ ${alvo.length} recebimento(s) na Conciliação (${conta.nome}).`);
  await _ctzCarregar();
}
function ctzTaxas() {
  if (typeof navegarPara === 'function') { navegarPara('formas_pagamento'); setTimeout(() => { if (typeof fpAba === 'function' && document.getElementById('fp-tab-taxas')) fpAba('taxas'); }, 500); }
  else alert('Cadastre em Formas de Pagamento › Taxas dos cartões.');
}
function ctzCsv() {
  const vis = _ctzVisiveis();
  const br = v => v == null ? '' : String(Number(v)).replace('.', ',');
  const cab = ['Data', 'Hora', 'Turno', 'Caixa confirmado', 'Vendedor', 'Venda', 'Forma', 'Bandeira', 'Parcelas', 'Bruto', 'Taxa cobrada', '% cobrada', '% negociada', 'Taxa esperada', 'Diferença', 'Liquido', 'Previsao pagamento', 'D+', 'NSU', 'Situacao', 'Conferido', 'Na conciliacao'];
  const linhas = vis.map(t => { const a = t._av; return [_ctzDt(t.data_venda), t.hora, t.turno_num || '', t.caixa_confirmado ? 'sim' : 'nao', t.vendedor || '', t.descricao || '', _CTZ_FORMA[t.forma] || '', t.bandeira || '', t.parcelas || 1,
    br(t.valor_bruto), a.cobrada == null ? '' : br(a.cobrada), a.pctCobrada == null ? '' : br(Math.round(a.pctCobrada * 100) / 100), a.pctEsperada == null ? '' : br(a.pctEsperada), a.esperada == null ? '' : br(a.esperada), a.dif == null ? '' : br(a.dif), t.valor_liquido == null ? '' : br(t.valor_liquido),
    _ctzDt(t.data_prevista_pagamento), a.prazo == null ? '' : a.prazo, t.nsu || '', _CTZ_STATUS[a.status].rot.replace(/^[✓⚠?] /, ''), t.conferido ? 'sim' : 'nao', t.livro_em ? 'sim' : 'nao']; });
  const csv = [cab].concat(linhas).map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `cartoes_${_CTZ.de}_${_CTZ.ate}.csv`; a.click();
}
