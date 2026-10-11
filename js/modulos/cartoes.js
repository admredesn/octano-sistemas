// ============================================================
// 💳 CARTÕES — pré-conferência das taxas ANTES da Conciliação (11/10/2026, pedido do Ronan)
// ------------------------------------------------------------
// "todos os recebimentos via cartão vão passar por ela; o objetivo é analisarmos as taxas e
//  deixar explícito se alguma taxa ou pagamento está divergente do acordado com as adquirentes"
// Fonte: oct_cartao_transacoes — o extrato EDI do PagBank baixado pelo servidor fiscal
// (sefaz/cartoes_edi.py), uma linha por venda com bruto, taxa, tarifa, líquido, parcelas,
// bandeira, maquininha e previsão de pagamento. Taxas negociadas: oct_cartao_taxas (Formas de
// Pagamento › Taxas dos cartões). A conta é feita aqui, na hora: cobrado × negociado.
// Depois de conferir, "Enviar para a Conciliação" grava no livro da conta PagBank (bruto como
// crédito e taxa como débito, por transação, na data prevista de pagamento).
// ============================================================
const _CTZ = { de: null, ate: null, campo: 'venda', forma: '', bandeira: '', maq: '', status: '', conf: '', busca: '',
  semPosto: false, sel: new Set(), txs: [], taxas: [], contas: [], nomes: {}, controle: null, carregando: false };
const _CTZ_FORMA = { credito: 'Crédito', debito: 'Débito', pix: 'Pix' };
const _CTZ_STATUS = {
  ok:        { rot: '✓ confere',      cor: '#7ee2a0' },
  maior:     { rot: '⚠ taxa maior',   cor: '#f87171' },
  menor:     { rot: '⚠ taxa menor',   cor: '#fbbf24' },
  sem_regra: { rot: '? sem taxa cadastrada', cor: '#8892a0' },
};
const _CTZ_TOL = 0.01;   // centavo de arredondamento da adquirente

function _ctzEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ctzNum(v, dec) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }); }
function _ctzDt(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
function _ctzIso(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function _ctzDias(a, b) { return (!a || !b) ? null : Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }

// ---------- regras (puras) ----------
// A regra que vale para a transação: mesma adquirente e forma, parcelas na faixa, vigente na data
// da venda; bandeira igual ou regra "qualquer bandeira"; do posto ou da rede. A mais específica ganha
// (bandeira certa > qualquer; do posto > da rede; vigência mais nova).
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
// cobrado (taxa + tarifa do EDI) × esperado (bruto × % + tarifa fixa). Tolerância de 1 centavo.
function ctzAvaliar(tx, regra, tol) {
  tol = tol == null ? _CTZ_TOL : tol;
  const bruto = Number(tx.valor_bruto || 0);
  const cobrada = Math.round((Number(tx.taxa_valor || 0) + Number(tx.tarifa_valor || 0)) * 100) / 100;
  const pctCobrada = bruto > 0 ? cobrada / bruto * 100 : 0;
  const prazo = _ctzDias(tx.data_venda, tx.data_prevista_pagamento);
  if (!regra) return { status: 'sem_regra', cobrada, pctCobrada, esperada: null, pctEsperada: null, dif: null, prazo, prazoDiverge: false, regra: null };
  const esperada = Math.round((bruto * Number(regra.taxa_pct || 0) / 100 + Number(regra.tarifa_fixa || 0)) * 100) / 100;
  const dif = Math.round((cobrada - esperada) * 100) / 100;
  const status = Math.abs(dif) <= tol + 1e-9 ? 'ok' : dif > 0 ? 'maior' : 'menor';
  const prazoDiverge = regra.prazo_dias != null && prazo != null && Number(regra.prazo_dias) !== prazo;
  return { status, cobrada, pctCobrada, esperada, pctEsperada: Number(regra.taxa_pct || 0), dif, prazo, prazoDiverge, regra };
}
function ctzResumo(lista) {
  const r = { n: 0, bruto: 0, taxas: 0, liquido: 0, esperado: 0, dif: 0, nDiv: 0, difDiv: 0, nSem: 0, nConf: 0, nLivro: 0, nPrazo: 0, porForma: {} };
  (lista || []).forEach(x => {
    const a = x._av || {};
    r.n++; r.bruto += Number(x.valor_bruto || 0); r.taxas += a.cobrada || 0; r.liquido += Number(x.valor_liquido || 0);
    if (a.status === 'sem_regra') r.nSem++;
    else { r.esperado += a.esperada || 0; r.dif += a.dif || 0; if (a.status !== 'ok') { r.nDiv++; r.difDiv += a.dif || 0; } }
    if (a.prazoDiverge) r.nPrazo++;
    if (x.conferido) r.nConf++;
    if (x.livro_em) r.nLivro++;
    const f = _CTZ_FORMA[String(x.forma || '').toLowerCase()] || 'Outro';
    const pf = r.porForma[f] = r.porForma[f] || { n: 0, bruto: 0, taxas: 0, liquido: 0 };
    pf.n++; pf.bruto += Number(x.valor_bruto || 0); pf.taxas += a.cobrada || 0; pf.liquido += Number(x.valor_liquido || 0);
  });
  ['bruto', 'taxas', 'liquido', 'esperado', 'dif', 'difDiv'].forEach(k => { r[k] = Math.round(r[k] * 100) / 100; });
  r.pctMedia = r.bruto > 0 ? r.taxas / r.bruto * 100 : 0;
  return r;
}
// linhas do livro (puras): bruto como crédito e taxa como débito, por transação, na data prevista
function ctzLinhasLivro(tx, contaId, autor, agora) {
  const data = tx.data_prevista_pagamento || tx.data_venda;
  const forma = _CTZ_FORMA[String(tx.forma || '').toLowerCase()] || 'Cartão';
  const quem = [forma.toUpperCase(), tx.bandeira, Number(tx.parcelas || 1) > 1 ? tx.parcelas + 'x' : ''].filter(Boolean).join(' ');
  const venda = `venda ${_ctzDt(tx.data_venda)}${tx.hora ? ' ' + tx.hora : ''}`;
  const detalhe = [venda, tx.maquininha ? 'maq. ' + tx.maquininha : '', tx.nsu ? 'NSU ' + tx.nsu : ''].filter(Boolean).join(' · ');
  const comum = { empresa_id: tx.empresa_id, conta_id: contaId, data, autor: autor || null, atualizado_em: agora, documento: tx.nsu || null };
  const out = [Object.assign({}, comum, { natureza: 'C', valor: Number(tx.valor_bruto || 0), tipo: 'venda_cartao', descricao: 'CARTÃO ' + quem, detalhe, origem: 'cartoes', origem_id: tx.id })];
  const taxa = Math.round((Number(tx.taxa_valor || 0) + Number(tx.tarifa_valor || 0)) * 100) / 100;
  if (taxa > 0) out.push(Object.assign({}, comum, { natureza: 'D', valor: taxa, tipo: 'taxa_cartao', descricao: 'TAXA ' + quem, detalhe, origem: 'cartoes_taxa', origem_id: tx.id }));
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
function _ctzMaster() { return !!(window.PERM && (PERM.master || PERM.papel === 'master')); }
async function _ctzCarregar() {
  const eid = _ctzEid();
  if (!eid) { document.getElementById('conteudo').innerHTML = '<p style="color:#f87171;padding:20px">Selecione a empresa.</p>'; return; }
  _CTZ.carregando = true;
  try {
    const campo = _CTZ.campo === 'prevista' ? 'data_prevista_pagamento' : 'data_venda';
    const txs = [];
    for (let de = 0; ; de += 1000) {
      let q = sb.from('oct_cartao_transacoes').select('*').gte(campo, _CTZ.de).lte(campo, _CTZ.ate)
        .order('data_venda', { ascending: false }).order('hora', { ascending: false }).order('id').range(de, de + 999);
      q = (_CTZ.semPosto && _ctzMaster()) ? q.or(`empresa_id.eq.${eid},empresa_id.is.null`) : q.eq('empresa_id', eid);
      const { data, error } = await q;
      if (error) throw error;
      txs.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const [rT, rC, rK, rE] = await Promise.all([
      sb.from('oct_cartao_taxas').select('*').or(`empresa_id.is.null,empresa_id.eq.${eid}`).order('forma').order('bandeira').order('parcelas_de'),
      sb.from('oct_fin_contas').select('id,nome,tipo,ativo,ordem').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
      sb.from('oct_cartao_controle').select('*').eq('adquirente', 'pagbank').maybeSingle(),
      sb.from('oct_empresas').select('id,nome,nome_fantasia').or('ativo.is.null,ativo.eq.true'),
    ]);
    _CTZ.taxas = rT.data || []; _CTZ.contas = rC.data || []; _CTZ.controle = rK.data || null;
    _CTZ.nomes = {}; (rE.data || []).forEach(e => { _CTZ.nomes[e.id] = e.nome_fantasia || e.nome; });
    txs.forEach(t => { t._av = ctzAvaliar(t, ctzRegra(t, _CTZ.taxas)); });
    _CTZ.txs = txs;
    _CTZ.sel = new Set([..._CTZ.sel].filter(id => txs.some(t => t.id === id)));
  } catch (e) {
    const falta = /oct_cartao_/.test(String(e.message || ''));
    document.getElementById('conteudo').innerHTML = `<div style="padding:24px;max-width:720px"><p style="color:#fbbf24;margin:0 0 8px">${falta ? 'Falta rodar <b>repo/sql/SQL-CARTOES.sql</b> no Supabase.' : 'Erro ao carregar: ' + _ctzEsc(e.message || e)}</p></div>`;
    _CTZ.carregando = false; return;
  }
  _CTZ.carregando = false;
  _ctzRender();
}
function _ctzVisiveis() {
  const b = _CTZ.busca.toLowerCase();
  return _CTZ.txs.filter(t => (!_CTZ.forma || String(t.forma) === _CTZ.forma)
    && (!_CTZ.bandeira || String(t.bandeira || '') === _CTZ.bandeira)
    && (!_CTZ.maq || String(t.maquininha || '') === _CTZ.maq)
    && (!_CTZ.status || (_CTZ.status === 'div' ? (t._av.status === 'maior' || t._av.status === 'menor' || t._av.prazoDiverge) : t._av.status === _CTZ.status))
    && (!_CTZ.conf || (_CTZ.conf === 'sim' ? !!t.conferido : _CTZ.conf === 'nao' ? !t.conferido : _CTZ.conf === 'livro' ? !!t.livro_em : !t.livro_em))
    && (!b || [t.bandeira, t.maquininha, t.nsu, t.codigo_autorizacao, t.codigo_venda, _ctzNum(t.valor_bruto), _ctzNum(t.valor_liquido), t.hora].join(' ').toLowerCase().includes(b)));
}
function _ctzRender() {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  const vis = _ctzVisiveis();
  const r = ctzResumo(vis);
  const bandeiras = [...new Set(_CTZ.txs.map(t => t.bandeira).filter(Boolean))].sort();
  const maqs = [...new Set(_CTZ.txs.map(t => t.maquininha).filter(Boolean))].sort();
  const contaPag = _CTZ.contas.find(c => c.tipo === 'pagbank');
  const sel = (id, v, opts) => `<select onchange="ctzFiltro('${id}', this.value)" class="ctz-inp">${opts.map(o => `<option value="${_ctzEsc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${_ctzEsc(o[1])}</option>`).join('')}</select>`;
  const card = (rot, val, sub, cor) => `<div class="ctz-card"><div class="ctz-card-rot">${rot}</div><div class="ctz-card-val" style="color:${cor || '#e5e7eb'}">${val}</div>${sub ? `<div class="ctz-card-sub">${sub}</div>` : ''}</div>`;
  const ctrl = _CTZ.controle;
  const ctrlTxt = ctrl ? (ctrl.erro ? `<span style="color:#f87171">robô parado: ${_ctzEsc(ctrl.erro)}</span>` : `última baixa automática ${ctrl.ultima_consulta ? new Date(ctrl.ultima_consulta).toLocaleString('pt-BR') : '—'}`) : '<span style="color:#fbbf24">o servidor ainda não baixou nada (variáveis do EDI no Railway)</span>';
  const linhas = vis.map(t => {
    const a = t._av; const st = _CTZ_STATUS[a.status];
    const nomePosto = t.empresa_id ? (_CTZ.nomes[t.empresa_id] || '') : '<span style="color:#fbbf24" title="Número de série não cadastrado em Parâmetros › Recebimentos">sem posto</span>';
    const marcado = _CTZ.sel.has(t.id);
    return `<tr class="ctz-lin ${marcado ? 'sel' : ''} ${a.status}" onclick="ctzSel('${t.id}', event)">
      <td class="ctz-td"><input type="checkbox" ${marcado ? 'checked' : ''} onclick="event.stopPropagation();ctzSel('${t.id}', event, true)"></td>
      <td class="ctz-td">${_ctzDt(t.data_venda)}</td><td class="ctz-td ctz-mut">${_ctzEsc(t.hora || '')}</td>
      <td class="ctz-td" title="${_ctzEsc(t.maquininha || '')}">${nomePosto}<br><span class="ctz-mut" style="font-size:0.66rem">${_ctzEsc(t.maquininha || '')}</span></td>
      <td class="ctz-td">${_CTZ_FORMA[t.forma] || _ctzEsc(t.forma || '')}</td><td class="ctz-td">${_ctzEsc(t.bandeira || '')}</td>
      <td class="ctz-td ctz-r">${Number(t.parcelas || 1) > 1 ? t.parcelas + 'x' : '—'}</td>
      <td class="ctz-td ctz-r">${_ctzNum(t.valor_bruto)}</td>
      <td class="ctz-td ctz-r" style="color:#f0b45c">${_ctzNum(a.cobrada)}</td>
      <td class="ctz-td ctz-r ctz-mut">${_ctzNum(a.pctCobrada, 2)}%</td>
      <td class="ctz-td ctz-r">${a.pctEsperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.pctEsperada, 2) + '%'}</td>
      <td class="ctz-td ctz-r">${a.esperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.esperada)}</td>
      <td class="ctz-td ctz-r" style="color:${a.dif == null ? '#667' : Math.abs(a.dif) <= _CTZ_TOL ? '#7ee2a0' : a.dif > 0 ? '#f87171' : '#fbbf24'};font-weight:${a.dif != null && Math.abs(a.dif) > _CTZ_TOL ? 700 : 400}">${a.dif == null ? '—' : (a.dif > 0 ? '+' : '') + _ctzNum(a.dif)}</td>
      <td class="ctz-td ctz-r" style="font-weight:600">${_ctzNum(t.valor_liquido)}</td>
      <td class="ctz-td ${a.prazoDiverge ? 'ctz-prazo' : ''}" title="${a.prazoDiverge ? 'Combinado: D+' + a.regra.prazo_dias : ''}">${_ctzDt(t.data_prevista_pagamento)}${a.prazo != null ? ` <span class="ctz-mut" style="font-size:0.66rem">D+${a.prazo}</span>` : ''}</td>
      <td class="ctz-td ctz-mut" style="font-size:0.7rem">${_ctzEsc(t.nsu || '')}</td>
      <td class="ctz-td" style="color:${st.cor};white-space:nowrap">${st.rot}${a.prazoDiverge ? ' <span title="prazo diferente do combinado" style="color:#fbbf24">⏱</span>' : ''}</td>
      <td class="ctz-td" style="text-align:center">${t.conferido ? `<span style="color:#7ee2a0" title="por ${_ctzEsc(t.conferido_por || '')} em ${t.conferido_em ? new Date(t.conferido_em).toLocaleString('pt-BR') : ''}">✓</span>` : '<span class="ctz-mut">·</span>'}${t.livro_em ? ' <span style="color:#7ea8d8" title="já na Conciliação (livro da conta PagBank)">📒</span>' : ''}</td>
    </tr>`;
  }).join('');
  raiz.innerHTML = `
  <style>
    .ctz-inp{padding:6px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#e5e7eb;font-size:0.8rem}
    .ctz-btn{padding:7px 12px;border-radius:7px;border:1px solid #2a3a4a;background:#161a26;color:#cbd5e1;cursor:pointer;font-size:0.8rem;white-space:nowrap}
    .ctz-btn:hover{border-color:#4a6a8a}.ctz-btn.azul{border-color:#2a4a6a;color:#93c5fd}.ctz-btn.verde{border-color:#2a5a3a;color:#7be0a0}
    .ctz-card{background:#0f1520;border:1px solid #2a3a4a;border-radius:10px;padding:10px 14px;min-width:150px}
    .ctz-card-rot{color:#8892a0;font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em}.ctz-card-val{font-size:1.15rem;font-weight:800}.ctz-card-sub{color:#667;font-size:0.68rem;margin-top:2px}
    .ctz-td{padding:5px 7px;border-bottom:1px solid #1c1f2e;font-size:0.76rem;vertical-align:top}.ctz-r{text-align:right;white-space:nowrap}.ctz-mut{color:#8892a0}
    .ctz-lin{cursor:pointer}.ctz-lin:hover td{background:#141826}.ctz-lin.sel td{background:#1e3a5f}.ctz-lin.maior td:first-child{box-shadow:inset 3px 0 #f87171}.ctz-lin.menor td:first-child{box-shadow:inset 3px 0 #fbbf24}
    .ctz-prazo{color:#fbbf24}
    .ctz-th{position:sticky;top:0;background:#0f1119;color:#888;text-align:left;padding:8px 7px;font-size:0.72rem;white-space:nowrap}
  </style>
  <div style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <h2 style="margin:0;color:#e5e7eb;font-size:1.1rem">💳 Cartões — pré-conferência das taxas</h2>
      <span style="color:#667;font-size:0.72rem">${ctrlTxt}</span>
      <span style="flex:1"></span>
      <button class="ctz-btn" onclick="ctzTaxas()" title="Taxas negociadas com a adquirente">% Taxas negociadas (${_CTZ.taxas.length})</button>
      <button class="ctz-btn azul" onclick="ctzBaixar()" title="Baixa do EDI do PagBank o período da tela (até 62 dias)">⬇ Baixar cartões</button>
      <button class="ctz-btn" onclick="ctzCsv()">📄 Planilha (CSV)</button>
      <button class="ctz-btn" onclick="_ctzCarregar()">↻</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      ${sel('campo', _CTZ.campo, [['venda', 'Data da venda'], ['prevista', 'Previsão de pagamento']])}
      <input type="date" class="ctz-inp" value="${_CTZ.de}" onchange="ctzFiltro('de', this.value)"> <span style="color:#667">a</span>
      <input type="date" class="ctz-inp" value="${_CTZ.ate}" onchange="ctzFiltro('ate', this.value)">
      ${sel('forma', _CTZ.forma, [['', 'Crédito + Débito + Pix'], ['credito', 'Crédito'], ['debito', 'Débito'], ['pix', 'Pix (maquininha)']])}
      ${sel('bandeira', _CTZ.bandeira, [['', 'Todas as bandeiras']].concat(bandeiras.map(b => [b, b])))}
      ${sel('maq', _CTZ.maq, [['', 'Todas as maquininhas']].concat(maqs.map(m => [m, m])))}
      ${sel('status', _CTZ.status, [['', 'Tudo'], ['div', 'Só divergentes'], ['ok', 'Só o que confere'], ['sem_regra', 'Sem taxa cadastrada']])}
      ${sel('conf', _CTZ.conf, [['', 'Conferidos e não'], ['nao', 'Não conferidos'], ['sim', 'Conferidos'], ['semlivro', 'Ainda fora da Conciliação'], ['livro', 'Já na Conciliação']])}
      <input class="ctz-inp" placeholder="NSU, valor, bandeira…" value="${_ctzEsc(_CTZ.busca)}" oninput="ctzFiltro('busca', this.value, true)" style="width:170px">
      ${_ctzMaster() ? `<label style="color:#9aa;font-size:0.75rem"><input type="checkbox" ${_CTZ.semPosto ? 'checked' : ''} onchange="ctzFiltro('semPosto', this.checked)"> incluir maquininhas sem posto</label>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${card('Transações', _ctzNum(r.n, 0), Object.entries(r.porForma).map(([f, v]) => `${f} ${v.n}`).join(' · '))}
      ${card('Bruto', 'R$ ' + _ctzNum(r.bruto))}
      ${card('Taxas cobradas', 'R$ ' + _ctzNum(r.taxas), 'média ' + _ctzNum(r.pctMedia, 2) + '%', '#f0b45c')}
      ${card('Líquido', 'R$ ' + _ctzNum(r.liquido), null, '#7ee2a0')}
      ${card('Divergentes', _ctzNum(r.nDiv, 0), r.nDiv ? ('diferença ' + (r.difDiv > 0 ? '+' : '') + 'R$ ' + _ctzNum(r.difDiv)) : 'nenhuma taxa fora do negociado', r.nDiv ? '#f87171' : '#7ee2a0')}
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
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:70vh">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="ctz-th"></th><th class="ctz-th">Data</th><th class="ctz-th">Hora</th><th class="ctz-th">Posto · maquininha</th><th class="ctz-th">Forma</th><th class="ctz-th">Bandeira</th>
          <th class="ctz-th" style="text-align:right">Parc.</th><th class="ctz-th" style="text-align:right">Bruto</th><th class="ctz-th" style="text-align:right">Taxa cobrada</th><th class="ctz-th" style="text-align:right">%</th>
          <th class="ctz-th" style="text-align:right">Negociada</th><th class="ctz-th" style="text-align:right">Taxa esperada</th><th class="ctz-th" style="text-align:right">Diferença</th><th class="ctz-th" style="text-align:right">Líquido</th>
          <th class="ctz-th">Previsão pagto</th><th class="ctz-th">NSU</th><th class="ctz-th">Situação</th><th class="ctz-th">Conf.</th>
        </tr></thead>
        <tbody>${linhas || `<tr><td colspan="18" style="padding:24px;text-align:center;color:#667">Nenhuma transação no período${_CTZ.txs.length ? ' com estes filtros' : ' — use ⬇ Baixar cartões'}.</td></tr>`}</tbody>
      </table>
    </div>
    <p style="color:#667;font-size:0.7rem;margin:8px 0 0">Taxa cobrada = taxa de intermediação + tarifa do extrato EDI. Esperada = bruto × % negociado (+ tarifa fixa). Tolerância de R$ 0,01. Linha vermelha: taxa maior que o negociado; amarela: menor. ⏱ = previsão de pagamento diferente do prazo combinado.</p>
  </div>`;
}
function ctzFiltro(k, v, digitando) {
  if (k === 'semPosto') _CTZ.semPosto = !!v; else _CTZ[k] = v;
  if (['de', 'ate', 'campo', 'semPosto'].includes(k)) { _ctzCarregar(); return; }
  if (digitando) { clearTimeout(window._ctzT); window._ctzT = setTimeout(_ctzRender, 250); return; }
  _ctzRender();
}
function ctzSel(id, ev, soToggle) {
  if (_CTZ.sel.has(id)) _CTZ.sel.delete(id); else _CTZ.sel.add(id);
  _ctzRender();
}
function ctzSelTodas(marcar) { _CTZ.sel = marcar ? new Set(_ctzVisiveis().map(t => t.id)) : new Set(); _ctzRender(); }
async function ctzBaixar() {
  if (!podeOuAvisa('cartoes.baixar')) return;
  const de = _CTZ.de, ate = _CTZ.ate;
  if (!confirm(`Baixar do EDI do PagBank as vendas de ${_ctzDt(de)} a ${_ctzDt(ate)}?\n(o dia de hoje vem parcial e completa ao longo do dia)`)) return;
  const btns = document.querySelectorAll('.ctz-btn'); btns.forEach(b => { b.disabled = true; });
  try {
    const r = await fetch((typeof SEFAZ_URL !== 'undefined' ? SEFAZ_URL : 'https://octano-sefaz-production-66d4.up.railway.app') + '/cartoes/baixar',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ de, ate }) });
    const j = await r.json();
    if (!j.ok) { alert('Não baixou: ' + (j.motivo || 'erro')); return; }
    alert(`✔ ${j.vendas} transação(ões) baixada(s)${j.sem_posto ? `\n⚠ ${j.sem_posto} de maquininha sem posto cadastrado (Parâmetros › Recebimentos)` : ''}`);
    await _ctzCarregar();
  } catch (e) { alert('Erro: ' + (e.message || e)); }
  finally { btns.forEach(b => { b.disabled = false; }); }
}
async function _ctzAutor() { try { const s = await getSession(); return (s && s.user && (s.user.email || s.user.id)) || null; } catch (e) { return null; } }
async function ctzConferir(valor) {
  if (!podeOuAvisa('cartoes.conferir')) return;
  const ids = [..._CTZ.sel];
  if (!ids.length) { alert('Marque as transações.'); return; }
  const por = await _ctzAutor(); const em = new Date().toISOString();
  const patch = valor ? { conferido: true, conferido_por: por, conferido_em: em, atualizado_em: em } : { conferido: false, conferido_por: null, conferido_em: null, atualizado_em: em };
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from('oct_cartao_transacoes').update(patch).in('id', ids.slice(i, i + 200));
    if (error) { alert('Erro: ' + error.message); return; }
  }
  _CTZ.sel.clear();
  await _ctzCarregar();
}
async function ctzEnviarLivro() {
  if (!podeOuAvisa('cartoes.livro')) return;
  const conta = _CTZ.contas.find(c => c.tipo === 'pagbank');
  if (!conta) { alert('Cadastre a conta PagBank (maquininha) em Conciliação › 🏦 Contas.'); return; }
  const base = _CTZ.sel.size ? _CTZ.txs.filter(t => _CTZ.sel.has(t.id)) : _ctzVisiveis();
  const alvo = base.filter(t => t.conferido && !t.livro_em && t.empresa_id);
  const pulou = base.length - alvo.length;
  if (!alvo.length) { alert('Nada a enviar: só vão as transações CONFERIDAS que ainda não estão na Conciliação.'); return; }
  const bruto = alvo.reduce((s, t) => s + Number(t.valor_bruto || 0), 0), taxa = alvo.reduce((s, t) => s + Number(t.taxa_valor || 0) + Number(t.tarifa_valor || 0), 0);
  if (!confirm(`Enviar ${alvo.length} transação(ões) para a Conciliação (conta ${conta.nome})?\nBruto R$ ${_ctzNum(bruto)} como crédito e taxas R$ ${_ctzNum(taxa)} como débito, na data prevista de pagamento.${pulou ? `\n${pulou} ficam de fora (não conferidas, já enviadas ou sem posto).` : ''}`)) return;
  const por = await _ctzAutor(); const em = new Date().toISOString();
  try {
    for (let i = 0; i < alvo.length; i += 100) {
      const lote = alvo.slice(i, i + 100);
      const ids = lote.map(t => t.id);
      // gerar de novo não duplica: apaga o que este lote já tinha no livro (se não conciliado)
      const { data: conc } = await sb.from('oct_fin_lancamentos').select('origem_id').in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', ids).eq('conciliado', true);
      const presos = new Set((conc || []).map(x => x.origem_id));
      const livres = lote.filter(t => !presos.has(t.id));
      if (livres.length) {
        await sb.from('oct_fin_lancamentos').delete().in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', livres.map(t => t.id)).eq('conciliado', false);
        const linhas = livres.flatMap(t => ctzLinhasLivro(t, conta.id, por, em));
        const { error } = await sb.from('oct_fin_lancamentos').insert(linhas);
        if (error) throw error;
      }
      const { error: e2 } = await sb.from('oct_cartao_transacoes').update({ livro_em: em, atualizado_em: em }).in('id', ids);
      if (e2) throw e2;
    }
  } catch (e) { alert('Erro ao enviar: ' + (e.message || e)); return; }
  _CTZ.sel.clear();
  alert(`✔ ${alvo.length} transação(ões) na Conciliação (${conta.nome}).`);
  await _ctzCarregar();
}
function ctzTaxas() {
  // atalho para o cadastro (Formas de Pagamento › Taxas dos cartões)
  if (typeof navegarPara === 'function') { navegarPara('formas_pagamento'); setTimeout(() => { if (typeof fpAba === 'function' && document.getElementById('fp-tab-taxas')) fpAba('taxas'); }, 500); }
  else alert('Cadastre em Formas de Pagamento › Taxas dos cartões.');
}
function ctzCsv() {
  const vis = _ctzVisiveis();
  const br = v => v == null ? '' : String(Number(v)).replace('.', ',');
  const cab = ['Data', 'Hora', 'Posto', 'Maquininha', 'Forma', 'Bandeira', 'Parcelas', 'Bruto', 'Taxa cobrada', '% cobrada', '% negociada', 'Taxa esperada', 'Diferença', 'Liquido', 'Previsao pagamento', 'D+', 'NSU', 'Autorizacao', 'Situacao', 'Conferido', 'Na conciliacao'];
  const linhas = vis.map(t => { const a = t._av; return [_ctzDt(t.data_venda), t.hora || '', _CTZ.nomes[t.empresa_id] || '', t.maquininha || '', _CTZ_FORMA[t.forma] || t.forma || '', t.bandeira || '', t.parcelas || 1,
    br(t.valor_bruto), br(a.cobrada), br(Math.round(a.pctCobrada * 100) / 100), a.pctEsperada == null ? '' : br(a.pctEsperada), a.esperada == null ? '' : br(a.esperada), a.dif == null ? '' : br(a.dif), br(t.valor_liquido),
    _ctzDt(t.data_prevista_pagamento), a.prazo == null ? '' : a.prazo, t.nsu || '', t.codigo_autorizacao || '', _CTZ_STATUS[a.status].rot.replace(/^[✓⚠?] /, ''), t.conferido ? 'sim' : 'nao', t.livro_em ? 'sim' : 'nao']; });
  const csv = [cab].concat(linhas).map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `cartoes_${_CTZ.de}_${_CTZ.ate}.csv`; a.click();
}
