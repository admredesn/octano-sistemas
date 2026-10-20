// ============================================================
// MÓDULO RECEBIMENTOS — portal de CONSULTA de tudo que entrou (20/10/2026, pedido do Ronan: "criarmos um portal onde copia
// todos os recebimentos, ele seria exclusivamente para consulta ... tudo separado em abas e com filtro para pesquisarmos por
// data, desse jeito íamos ter o histórico de transação de fácil acesso sem depender de api").
// SÓ LEITURA, sobre o que o Octano já guarda:
//   Cartão / Pix (maquininha) → oct_cartao_transacoes (EDI, com taxa — o núcleo de cada posto manda a cada 15 min) +
//                               oct_recebimentos pagbank_email/edi que o EDI ainda não trouxe (sem taxa)
//   Cartão frota              → pagamentos de frota dos cupons (oct_pdv_vendas) + a taxa do contrato (oct_cartao_taxas)
//   Cofre                     → oct_recebimentos cofre_brinks (um por depósito)
//   Banco                     → créditos do extrato Sicoob (oct_banco_movimentos)
//   Boletos                   → oct_boletos pagos (quem pagou, qual fatura)
// "Todos (posto)" soma só o que entrou NO POSTO (maquininha + frota + cofre): o banco recebe o repasse dessas mesmas
// vendas, e somar os dois contaria o dinheiro duas vezes.
// ============================================================
const _RCB = { de: null, ate: null, aba: 'posto', posto: '', forma: '', busca: '', dia: '', dados: {}, chave: '', empresas: [], carregando: false };
const _RCB_ABAS = [
  { id: 'posto', rot: 'Todos (posto)', fontes: ['maq', 'frota', 'cofre'] },
  { id: 'cartao', rot: 'Cartão (maquininha)', fontes: ['maq'] },
  { id: 'pix', rot: 'Pix (maquininha)', fontes: ['maq'] },
  { id: 'frota', rot: 'Cartão frota', fontes: ['frota'] },
  { id: 'cofre', rot: 'Cofre', fontes: ['cofre'] },
  { id: 'banco', rot: 'Banco (Sicoob)', fontes: ['banco'] },
  { id: 'boletos', rot: 'Boletos pagos', fontes: ['boletos'] },
];
const _RCB_FORMA = { debito: 'Débito', credito: 'Crédito', pix: 'Pix', frota: 'Frota', dinheiro: 'Dinheiro' };
const _RCB_FROTA_RE = /frota|prime|fit|ticket|good|ecx|valecard|vale card|agilli|neo|sem parar|abastece|wex/i;

function _rcbEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _rcbBrl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _rcbDm(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : ''; }
function _rcbIso(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function _rcbHojeBr() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
function _rcbEid() { return (typeof empresaAtiva === 'function') ? empresaAtiva() : null; }
// instante UTC (data_venda, pago_em) -> dia e hora do Brasil
function _rcbLocal(ts) {
  const t = Date.parse(ts || '');
  if (isNaN(t)) return { dia: String(ts || '').slice(0, 10), hora: '' };
  const s = new Date(t - 3 * 3600e3).toISOString();
  return { dia: s.slice(0, 10), hora: s.slice(11, 16) };
}
async function _rcbTudo(fn) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fn(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function moduloRecebimentos() {
  if (typeof podeOuAvisa === 'function' && !podeOuAvisa('recebimentos.ver')) return;
  const h = new Date(Date.now() - 3 * 3600e3); const d = new Date(h); d.setDate(d.getDate() - 6);
  _RCB.de = _RCB.de || _rcbIso(d); _RCB.ate = _RCB.ate || _rcbIso(h);
  try { const s = JSON.parse(localStorage.getItem('oct_rcb_aba') || 'null'); if (s && _RCB_ABAS.some(a => a.id === s)) _RCB.aba = s; } catch (e) {}
  // postos que esta pessoa pode ver: master vê a rede; os outros, o posto ativo
  _RCB.empresas = [];
  try {
    const master = typeof PERM !== 'undefined' && PERM.master;
    if (master) {
      const { data } = await sb.from('oct_empresas').select('id,nome,nome_fantasia,ativo').order('nome_fantasia');
      _RCB.empresas = (data || []).filter(e => e.ativo !== false).map(e => ({ id: e.id, nome: e.nome_fantasia || e.nome }));
    }
  } catch (e) { _RCB.empresas = []; }
  _rcbRender(true);
  await _rcbCarregar();
}
function _rcbIdsEmpresas() {
  const ativa = _rcbEid();
  if (_RCB.posto === '*' && _RCB.empresas.length) return _RCB.empresas.map(e => e.id);
  return [_RCB.posto && _RCB.posto !== '*' ? _RCB.posto : ativa].filter(Boolean);
}
function _rcbNomePosto(id) {
  const e = _RCB.empresas.find(x => x.id === id);
  return e ? e.nome : '';
}

// ---------- carga (por fonte, só o que a aba pede; cache por posto+período) ----------
async function _rcbCarregar() {
  const ids = _rcbIdsEmpresas();
  if (!ids.length) { document.getElementById('conteudo').innerHTML = '<p style="color:#f87171;padding:20px">Selecione a empresa.</p>'; return; }
  const chave = ids.join(',') + '|' + _RCB.de + '|' + _RCB.ate;
  if (chave !== _RCB.chave) { _RCB.dados = {}; _RCB.chave = chave; }
  const fontes = (_RCB_ABAS.find(a => a.id === _RCB.aba) || _RCB_ABAS[0]).fontes.filter(f => !_RCB.dados[f]);
  if (!fontes.length) { _rcbRender(); return; }
  _RCB.carregando = true; _rcbRender();
  try {
    await Promise.all(fontes.map(async f => { _RCB.dados[f] = await _rcbFonte(f, ids); }));
  } catch (e) {
    _RCB.erro = 'Erro ao carregar: ' + ((e && e.message) || e);
  }
  _RCB.carregando = false;
  if (_RCB.chave === chave) _rcbRender();
}

async function _rcbFonte(f, ids) {
  const de = _RCB.de, ate = _RCB.ate;
  if (f === 'maq') {
    const [txs, recs] = await Promise.all([
      _rcbTudo((a, b) => sb.from('oct_cartao_transacoes')
        .select('id,empresa_id,maquininha,data_venda,hora,forma,bandeira,parcelas,valor_bruto,taxa_valor,tarifa_valor,valor_liquido,data_prevista_pagamento,nsu,codigo_autorizacao')
        .in('empresa_id', ids).gte('data_venda', de).lte('data_venda', ate).order('id').range(a, b)),
      // o que o EDI ainda não trouxe (o e-mail do PagBank chega primeiro): recebido_em é a hora do posto
      _rcbTudo((a, b) => sb.from('oct_recebimentos').select('id,empresa_id,origem,forma,bandeira,parcelas,valor,dia,hora,recebido_em')
        .in('empresa_id', ids).in('origem', ['pagbank_email', 'pagbank_edi']).gte('recebido_em', de + 'T00:00:00').lte('recebido_em', ate + 'T23:59:59').order('id').range(a, b)),
    ]);
    const vistos = new Set(txs.map(t => t.id));
    const out = txs.map(t => {
      const forma = String(t.forma || '').toLowerCase();
      const taxa = Math.round((Number(t.taxa_valor || 0) + Number(t.tarifa_valor || 0)) * 100) / 100;
      return { aba: forma === 'pix' ? 'pix' : 'cartao', empresa_id: t.empresa_id, dia: t.data_venda, hora: t.hora || '', origem: 'EDI',
        forma, bandeira: t.bandeira || '', parcelas: Number(t.parcelas || 1), bruto: Number(t.valor_bruto || 0), taxa,
        liquido: t.valor_liquido != null ? Number(t.valor_liquido) : Number(t.valor_bruto || 0) - taxa,
        previsto: t.data_prevista_pagamento || '', nsu: t.nsu || '', aut: t.codigo_autorizacao || '', maq: t.maquininha || '' };
    });
    recs.forEach(r => {
      if (vistos.has(r.id)) return;
      const n = String(r.forma || '').toLowerCase();
      const forma = /pix/.test(n) ? 'pix' : /déb|deb/.test(n) ? 'debito' : 'credito';
      const dia = /^\d{2}\/\d{2}\/\d{4}$/.test(String(r.dia || '')) ? String(r.dia).split('/').reverse().join('-') : String(r.recebido_em || '').slice(0, 10);
      out.push({ aba: forma === 'pix' ? 'pix' : 'cartao', empresa_id: r.empresa_id, dia, hora: r.hora || String(r.recebido_em || '').slice(11, 16),
        origem: 'e-mail', forma, bandeira: r.bandeira || '', parcelas: Number(r.parcelas || 1), bruto: Number(r.valor || 0), taxa: null,
        liquido: null, previsto: '', nsu: '', aut: '', maq: '' });
    });
    return out;
  }
  if (f === 'cofre') {
    const recs = await _rcbTudo((a, b) => sb.from('oct_recebimentos').select('id,empresa_id,origem,valor,dia,hora,recebido_em,id_externo,bandeira')
      .in('empresa_id', ids).ilike('origem', '%cofre%').gte('recebido_em', de + 'T00:00:00').lte('recebido_em', ate + 'T23:59:59').order('id').range(a, b));
    return recs.map(r => ({ aba: 'cofre', empresa_id: r.empresa_id,
      dia: /^\d{2}\/\d{2}\/\d{4}$/.test(String(r.dia || '')) ? String(r.dia).split('/').reverse().join('-') : String(r.recebido_em || '').slice(0, 10),
      hora: r.hora || String(r.recebido_em || '').slice(11, 16), origem: 'cofre', forma: 'dinheiro', bandeira: r.bandeira || 'Cofre',
      bruto: Number(r.valor || 0), taxa: 0, liquido: Number(r.valor || 0), envelope: r.id_externo || String(r.id || '').replace(/^cofre-/, '') }));
  }
  if (f === 'frota') {
    const [vendas, taxas] = await Promise.all([
      _rcbTudo((a, b) => sb.from('oct_pdv_vendas').select('id,empresa_id,numero,data_venda,status,pagamentos,placa,odometro,prazo_dados,cliente_nome')
        .in('empresa_id', ids).gte('data_venda', de + 'T00:00:00-03:00').lte('data_venda', ate + 'T23:59:59-03:00').order('id').range(a, b)),
      sb.from('oct_cartao_taxas').select('*').then(r => r.data || [], () => []),
    ]);
    const out = [];
    vendas.forEach(v => {
      if (String(v.status || '').toLowerCase() === 'cancelada') return;
      let pgs = v.pagamentos;
      if (typeof pgs === 'string') { try { pgs = JSON.parse(pgs); } catch (e) { pgs = []; } }
      (pgs || []).forEach(p => {
        const nome = String(p.nome || p.forma_nome || '');
        if (!(p.frota && typeof p.frota === 'object') && !_RCB_FROTA_RE.test(nome)) return;
        const fr = (p.frota && typeof p.frota === 'object') ? p.frota : {};
        const pd = v.prazo_dados || {};
        const op = String(fr.operadora || p.bandeira || '').trim() || 'Operadora não informada';
        const bruto = Number(p.valor || 0);
        const lc = _rcbLocal(v.data_venda);
        let taxa = null;
        if (typeof ctzRegra === 'function') {
          const regra = ctzRegra({ forma: 'frota', bandeira: op, parcelas: 1, data_venda: lc.dia, adquirente: op, empresa_id: v.empresa_id }, taxas);
          if (regra) taxa = Math.round((bruto * Number(regra.taxa_pct || 0) / 100 + Number(regra.tarifa_fixa || 0)) * 100) / 100;
        }
        out.push({ aba: 'frota', empresa_id: v.empresa_id, dia: lc.dia, hora: lc.hora, origem: 'cupom', forma: 'frota', bandeira: op,
          bruto, taxa, liquido: taxa == null ? null : bruto - taxa, aut: fr.autorizacao && fr.autorizacao !== '0' ? String(fr.autorizacao) : '',
          placa: String(fr.placa || v.placa || pd.placa || '').toUpperCase(), km: fr.km || v.odometro || pd.km || '',
          cupom: v.numero, cliente: v.cliente_nome || '' });
      });
    });
    return out;
  }
  if (f === 'banco') {
    const movs = await _rcbTudo((a, b) => sb.from('oct_banco_movimentos').select('id,empresa_id,banco,tipo,data,descricao,valor,documento,info,cpf_cnpj')
      .in('empresa_id', ids).eq('tipo', 'credito').gte('data', de).lte('data', ate).order('id').range(a, b));
    return movs.map(m => ({ aba: 'banco', empresa_id: m.empresa_id, dia: String(m.data || '').slice(0, 10), hora: '', origem: m.banco || 'banco',
      forma: /pix/i.test(m.descricao || '') ? 'pix' : '', bandeira: m.banco || '', bruto: Number(m.valor || 0), taxa: 0, liquido: Number(m.valor || 0),
      descricao: m.descricao || '', documento: m.documento || '', info: typeof m.info === 'string' ? m.info : (m.info ? JSON.stringify(m.info) : ''),
      doc: m.cpf_cnpj || '' }));
  }
  if (f === 'boletos') {
    const bols = await _rcbTudo((a, b) => sb.from('oct_boletos').select('id,empresa_id,nosso_numero,cliente_nome,valor,valor_pago,vencimento,pago_em,credito_em,fatura_id,status')
      .in('empresa_id', ids).not('pago_em', 'is', null).gte('pago_em', de).lte('pago_em', ate + 'T23:59:59').order('id').range(a, b));
    const fids = [...new Set(bols.map(x => x.fatura_id).filter(Boolean))];
    const num = {};
    for (let i = 0; i < fids.length; i += 100) {
      const { data } = await sb.from('oct_faturas').select('id,numero').in('id', fids.slice(i, i + 100));
      (data || []).forEach(x => { num[x.id] = x.numero; });
    }
    return bols.map(x => {
      const lc = String(x.pago_em || '').length > 10 ? _rcbLocal(x.pago_em) : { dia: String(x.pago_em || '').slice(0, 10), hora: '' };
      const v = Number(x.valor_pago != null ? x.valor_pago : x.valor || 0);
      return { aba: 'boletos', empresa_id: x.empresa_id, dia: lc.dia, hora: lc.hora, origem: 'Sicoob', forma: 'boleto', bandeira: 'Sicoob',
        bruto: v, taxa: 0, liquido: v, cliente: x.cliente_nome || '', nosso: x.nosso_numero || '', vencimento: x.vencimento || '',
        credito: x.credito_em || '', fatura: x.fatura_id ? (num[x.fatura_id] != null ? 'fatura ' + num[x.fatura_id] : 'fatura') : '' };
    });
  }
  return [];
}

// ---------- filtros ----------
function _rcbLinhasAba(semDia) {
  const aba = _RCB_ABAS.find(a => a.id === _RCB.aba) || _RCB_ABAS[0];
  let rows = [];
  aba.fontes.forEach(f => { rows = rows.concat(_RCB.dados[f] || []); });
  if (aba.id === 'cartao' || aba.id === 'pix') rows = rows.filter(r => r.aba === aba.id);
  const b = _RCB.busca.trim().toLowerCase();
  return rows.filter(r => (semDia || !_RCB.dia || r.dia === _RCB.dia)
    && (!_RCB.forma || r.forma === _RCB.forma || r.bandeira === _RCB.forma)
    && (!b || [_rcbBrl(r.bruto), r.nsu, r.aut, r.placa, r.cliente, r.envelope, r.maq, r.cupom, r.descricao, r.documento, r.info, r.nosso, r.fatura, r.bandeira]
      .join(' ').toLowerCase().includes(b)));
}
function _rcbFormas() {
  const aba = _RCB.aba;
  if (aba === 'cartao') return [['', 'Débito e crédito'], ['debito', 'Débito'], ['credito', 'Crédito']];
  if (aba === 'frota') {
    const ops = [...new Set((_RCB.dados.frota || []).map(r => r.bandeira))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [['', 'Todas as operadoras']].concat(ops.map(o => [o, o]));
  }
  if (aba === 'posto') return [['', 'Todas as formas'], ['debito', 'Débito'], ['credito', 'Crédito'], ['pix', 'Pix'], ['frota', 'Frota'], ['dinheiro', 'Cofre (dinheiro)']];
  if (aba === 'banco') return [['', 'Todos os créditos'], ['pix', 'Só Pix']];
  return [['', 'Todas']];
}

// ---------- tela ----------
function _rcbRender(soCasca) {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  const master = typeof PERM !== 'undefined' && PERM.master;
  const sel = (id, v, opts, extra) => `<select id="rcb-${id}" class="rcb-inp" onchange="rcbFiltro('${id}', this.value)" ${extra || ''}>${opts.map(o => `<option value="${_rcbEsc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${_rcbEsc(o[1])}</option>`).join('')}</select>`;
  const postos = master && _RCB.empresas.length ? sel('posto', _RCB.posto, [['', 'Posto ativo'], ['*', 'Todos os postos']].concat(_RCB.empresas.map(e => [e.id, e.nome]))) : '';
  const linhas = soCasca ? [] : _rcbLinhasAba(false);
  const todasAba = soCasca ? [] : _rcbLinhasAba(true);
  const varios = _rcbIdsEmpresas().length > 1;
  // resumo
  const bruto = linhas.reduce((s, r) => s + r.bruto, 0);
  const comTaxa = linhas.filter(r => r.taxa != null);
  const taxa = comTaxa.reduce((s, r) => s + r.taxa, 0);
  const semTaxa = linhas.filter(r => r.taxa == null);
  const card = (rot, val, sub, cor) => `<div class="rcb-card"><div class="rcb-rot">${rot}</div><div class="rcb-val" style="color:${cor || '#e5e7eb'}">${val}</div>${sub ? `<div class="rcb-sub">${sub}</div>` : ''}</div>`;
  const cards = soCasca ? '' : [
    card('Recebimentos', linhas.length.toLocaleString('pt-BR'), _RCB.dia ? 'em ' + _rcbDm(_RCB.dia) : 'no período'),
    card('Bruto', 'R$ ' + _rcbBrl(bruto)),
    ['banco', 'boletos', 'cofre'].includes(_RCB.aba) ? '' : card('Taxas', 'R$ ' + _rcbBrl(taxa), bruto && comTaxa.length ? (taxa / comTaxa.reduce((s, r) => s + r.bruto, 0) * 100).toFixed(2).replace('.', ',') + '% do bruto com taxa' : '', '#fbbf24'),
    ['banco', 'boletos', 'cofre'].includes(_RCB.aba) ? '' : card('Líquido', 'R$ ' + _rcbBrl(bruto - taxa), semTaxa.length ? `${semTaxa.length} sem taxa informada ainda` : 'o que cai na conta', '#4ade80'),
  ].join('');
  // barras por dia
  const porDia = {};
  todasAba.forEach(r => { porDia[r.dia] = (porDia[r.dia] || 0) + r.bruto; });
  const dias = [];
  for (let d = new Date(_RCB.de + 'T12:00:00'); _rcbIso(d) <= _RCB.ate; d.setDate(d.getDate() + 1)) dias.push(_rcbIso(d));
  const max = Math.max(1, ...Object.values(porDia));
  const barras = soCasca || dias.length > 62 ? '' : `<div class="rcb-dias"><div class="rcb-rot" style="margin-bottom:6px">Por dia — clique num dia para ver só ele</div>
    <div class="rcb-barras" style="grid-template-columns:repeat(${dias.length},minmax(0,1fr))">${dias.map(d => `<div class="rcb-barra${_RCB.dia === d ? ' on' : ''}" onclick="rcbDia('${d}')" title="${_rcbDm(d)}: R$ ${_rcbBrl(porDia[d] || 0)}">
      ${dias.length <= 16 ? `<span>${porDia[d] ? (porDia[d] >= 1000 ? (porDia[d] / 1000).toFixed(1).replace('.', ',') + ' mil' : _rcbBrl(porDia[d])) : '—'}</span>` : ''}<i style="height:${Math.max(2, (porDia[d] || 0) / max * 60)}px"></i><span>${_rcbDm(d)}</span></div>`).join('')}</div></div>`;
  // tabela
  const P = r => varios ? `<td class="rcb-td">${_rcbEsc(_rcbNomePosto(r.empresa_id))}</td>` : '';
  const PH = varios ? '<th class="rcb-th">Posto</th>' : '';
  const R = (v, cls) => `<td class="rcb-td rcb-r${cls ? ' ' + cls : ''}">${v}</td>`;
  const T = (v, cls) => `<td class="rcb-td${cls ? ' ' + cls : ''}">${v}</td>`;
  const tx = v => v == null ? '<span class="rcb-mut" title="a maquininha ainda não informou a taxa desta venda">—</span>' : `<span class="rcb-taxa">${_rcbBrl(v)}</span>`;
  const chip = (t, c) => `<span class="rcb-chip ${c}">${_rcbEsc(t)}</span>`;
  const origem = r => chip(r.origem, r.origem === 'EDI' ? 'edi' : r.origem === 'e-mail' ? 'mail' : r.origem === 'cofre' ? 'cofre' : r.origem === 'cupom' ? 'oper' : 'banco');
  const COLS = {
    posto: [['Data', r => T(_rcbDm(r.dia))], ['Hora', r => T(r.hora)], ['Origem', r => T(origem(r))], ['Forma', r => T(_RCB_FORMA[r.forma] || r.forma)],
      ['Bandeira / operadora', r => T(_rcbEsc(r.bandeira))], ['Bruto', r => R(_rcbBrl(r.bruto)), 1], ['Taxa', r => R(tx(r.taxa)), 1], ['Líquido', r => R(r.liquido == null ? '—' : _rcbBrl(r.liquido)), 1],
      ['Detalhe', r => T(_rcbEsc(r.nsu ? 'NSU ' + r.nsu : r.placa ? 'placa ' + r.placa + (r.cupom ? ' · cupom ' + r.cupom : '') : r.envelope ? 'depósito ' + r.envelope : ''), 'rcb-mut')]],
    cartao: [['Data', r => T(_rcbDm(r.dia))], ['Hora', r => T(r.hora)], ['Maquininha', r => T(_rcbEsc(r.maq), 'rcb-mono')], ['Origem', r => T(origem(r))],
      ['Forma', r => T(_RCB_FORMA[r.forma] || r.forma)], ['Bandeira', r => T(_rcbEsc(r.bandeira))], ['Parc.', r => R(r.parcelas + 'x'), 1], ['Bruto', r => R(_rcbBrl(r.bruto)), 1],
      ['Taxa', r => R(tx(r.taxa)), 1], ['%', r => R(r.taxa == null || !r.bruto ? '—' : (r.taxa / r.bruto * 100).toFixed(2).replace('.', ',')), 1],
      ['Líquido', r => R(r.liquido == null ? '—' : _rcbBrl(r.liquido)), 1], ['Previsão', r => T(_rcbDm(r.previsto))], ['NSU', r => T(_rcbEsc(r.nsu), 'rcb-mono')], ['Aut.', r => T(_rcbEsc(r.aut), 'rcb-mono')]],
    pix: [['Data', r => T(_rcbDm(r.dia))], ['Hora', r => T(r.hora)], ['Maquininha', r => T(_rcbEsc(r.maq), 'rcb-mono')], ['Origem', r => T(origem(r))],
      ['Bruto', r => R(_rcbBrl(r.bruto)), 1], ['Taxa', r => R(tx(r.taxa)), 1], ['Líquido', r => R(r.liquido == null ? '—' : _rcbBrl(r.liquido)), 1],
      ['Previsão', r => T(_rcbDm(r.previsto))], ['NSU', r => T(_rcbEsc(r.nsu), 'rcb-mono')]],
    frota: [['Data', r => T(_rcbDm(r.dia))], ['Hora', r => T(r.hora)], ['Operadora', r => T(chip(r.bandeira, 'oper'))], ['Autorização', r => T(_rcbEsc(r.aut), 'rcb-mono')],
      ['Placa', r => T(_rcbEsc(r.placa))], ['KM', r => R(r.km ? Number(r.km).toLocaleString('pt-BR') : ''), 1], ['Cliente', r => T(_rcbEsc(r.cliente))], ['Cupom', r => T(_rcbEsc(r.cupom))],
      ['Bruto', r => R(_rcbBrl(r.bruto)), 1], ['Taxa do contrato', r => R(r.taxa == null ? '<span class="rcb-mut" title="cadastre a taxa em Cartões › Taxas negociadas">sem taxa</span>' : `<span class="rcb-taxa">${_rcbBrl(r.taxa)}</span>`), 1],
      ['Líquido', r => R(r.liquido == null ? '—' : _rcbBrl(r.liquido)), 1]],
    cofre: [['Data', r => T(_rcbDm(r.dia))], ['Hora', r => T(r.hora)], ['Cofre', r => T(chip(r.bandeira, 'cofre'))], ['Depósito', r => T(_rcbEsc(r.envelope), 'rcb-mono')], ['Valor', r => R(_rcbBrl(r.bruto)), 1]],
    banco: [['Data', r => T(_rcbDm(r.dia))], ['Banco', r => T(chip(r.bandeira || 'banco', 'banco'))], ['Descrição', r => T(_rcbEsc(r.descricao))], ['Documento', r => T(_rcbEsc(r.documento), 'rcb-mono')],
      ['Pagador / info', r => T(_rcbEsc(r.info || r.doc), 'rcb-mut')], ['Valor', r => R(_rcbBrl(r.bruto)), 1]],
    boletos: [['Pago em', r => T(_rcbDm(r.dia))], ['Cliente', r => T(_rcbEsc(r.cliente))], ['Referente a', r => T(_rcbEsc(r.fatura))], ['Nosso número', r => T(_rcbEsc(r.nosso), 'rcb-mono')],
      ['Vencimento', r => T(_rcbDm(r.vencimento))], ['Crédito na conta', r => T(_rcbDm(r.credito))], ['Valor pago', r => R(_rcbBrl(r.bruto)), 1]],
  }[_RCB.aba];
  const ord = linhas.slice().sort((a, b) => (b.dia + b.hora).localeCompare(a.dia + a.hora));
  const LIM = 1000;
  const corpo = soCasca || _RCB.carregando
    ? `<tr><td class="rcb-vazio" colspan="${COLS.length + (varios ? 1 : 0)}">Carregando recebimentos…</td></tr>`
    : (ord.length ? ord.slice(0, LIM).map(r => '<tr>' + P(r) + COLS.map(c => c[1](r)).join('') + '</tr>').join('')
      : `<tr><td class="rcb-vazio" colspan="${COLS.length + (varios ? 1 : 0)}">${_RCB.erro ? _rcbEsc(_RCB.erro) : 'Nenhum recebimento com estes filtros.'}</td></tr>`);
  const totais = !soCasca && ord.length ? `<tr class="rcb-tot">${varios ? '<td class="rcb-td"></td>' : ''}${COLS.map((c, i) => i === 0 ? `<td class="rcb-td"><b>Total (${ord.length})</b></td>`
    : c[0] === 'Bruto' || c[0] === 'Valor' || c[0] === 'Valor pago' ? `<td class="rcb-td rcb-r"><b>${_rcbBrl(bruto)}</b></td>`
    : c[0] === 'Taxa' || c[0] === 'Taxa do contrato' ? `<td class="rcb-td rcb-r"><b class="rcb-taxa">${_rcbBrl(taxa)}</b></td>`
    : c[0] === 'Líquido' ? `<td class="rcb-td rcb-r"><b>${_rcbBrl(bruto - taxa)}</b></td>` : '<td class="rcb-td"></td>').join('')}</tr>` : '';
  const notas = {
    posto: 'Tudo que entrou no posto: maquininha (cartão e Pix), cartão frota e cofre. O banco fica na aba própria: ele recebe o repasse dessas mesmas vendas, e somar os dois contaria o dinheiro duas vezes.',
    cartao: 'Origem <b>EDI</b> = extrato da maquininha, com taxa, líquido e previsão (o núcleo de cada posto copia a cada 15 min). <b>e-mail</b> = aviso de venda aprovada do PagBank, que chega antes; quando o EDI publica a mesma venda, ela passa a mostrar a taxa.',
    pix: 'Pix feito na maquininha. Pix direto na conta do posto aparece na aba Banco.',
    frota: 'A operadora não manda retorno: a taxa é a do contrato cadastrado em Cartões › Taxas negociadas. Autorização, placa e KM vêm do cupom.',
    cofre: 'Depósitos do cofre inteligente, um por envelope.',
    banco: 'Créditos do extrato do Sicoob (Pix, transferências, repasses e liquidação de boletos), como vieram do banco.',
    boletos: 'Boletos pagos no Sicoob, com quem pagou e a fatura a que se referem. O crédito destes boletos também aparece na aba Banco.',
  }[_RCB.aba];
  raiz.innerHTML = `
  <style>
    .rcb{padding:14px 18px;color:#e5e7eb}
    .rcb-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .rcb-topo h2{margin:0;color:#f97316;font-size:1.1rem}
    .rcb-selo{font-size:0.66rem;letter-spacing:.06em;text-transform:uppercase;color:#7ea8d8;border:1px solid #2c3d55;border-radius:999px;padding:3px 9px}
    .rcb-fil{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:9px 12px;margin-bottom:10px}
    .rcb-fil label{color:#8892a0;font-size:0.74rem}
    .rcb-inp{background:#0b0d14;border:1px solid #2a2d3e;color:#e5e7eb;border-radius:6px;padding:7px 9px;font-size:0.8rem}
    .rcb-btn{background:#1a2230;border:1px solid #2a3a4a;color:#e5e7eb;border-radius:6px;padding:7px 11px;font-size:0.8rem;cursor:pointer}
    .rcb-btn:hover{border-color:#3a4a6a}
    .rcb-abas{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid #2a2d3e;margin-bottom:10px}
    .rcb-aba{background:none;border:none;color:#8892a0;font-size:0.82rem;padding:8px 13px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent}
    .rcb-aba.on{color:#f97316;border-bottom-color:#f97316}
    .rcb-cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .rcb-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:9px 13px;min-width:150px}
    .rcb-rot{color:#8892a0;font-size:0.66rem;text-transform:uppercase;letter-spacing:.05em}
    .rcb-val{font-size:1.1rem;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums}
    .rcb-sub{color:#667;font-size:0.68rem;margin-top:2px}
    .rcb-dias{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:9px 13px 6px;margin-bottom:10px}
    .rcb-barras{display:grid;gap:6px;align-items:end;height:90px}
    .rcb-barra{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%;cursor:pointer;min-width:0}
    .rcb-barra i{display:block;width:100%;max-width:44px;background:#3b2a1a;border-top:2px solid #f97316;border-radius:3px 3px 0 0}
    .rcb-barra.on i{background:#6a3f14}
    .rcb-barra span{font-size:0.62rem;color:#8892a0;white-space:nowrap;font-variant-numeric:tabular-nums}
    .rcb-tab{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:58vh}
    .rcb-th{position:sticky;top:0;background:#0f1119;color:#888;text-align:left;padding:8px 7px;font-size:0.72rem;white-space:nowrap}
    .rcb-td{padding:5px 7px;border-bottom:1px solid #1c1f2e;font-size:0.77rem;white-space:nowrap;font-variant-numeric:tabular-nums}
    .rcb-r{text-align:right}.rcb-mut{color:#8892a0}.rcb-taxa{color:#f0b45c}
    .rcb-mono{font-family:Consolas,monospace;font-size:0.73rem;color:#cbd5e1}
    .rcb-chip{display:inline-block;padding:1px 7px;border-radius:999px;font-size:0.68rem;border:1px solid}
    .rcb-chip.edi{color:#93c5fd;border-color:#2c3d55}.rcb-chip.mail{color:#c4b5fd;border-color:#3b3360}
    .rcb-chip.cofre{color:#fcd34d;border-color:#5b4a1d}.rcb-chip.banco{color:#86efac;border-color:#1f4d33}.rcb-chip.oper{color:#fdba74;border-color:#5a3714}
    .rcb-vazio{padding:24px;text-align:center;color:#8892a0}
    .rcb-tot td{background:#0f1119;position:sticky;bottom:0}
    .rcb-nota{color:#667;font-size:0.7rem;margin-top:8px;max-width:120ch;line-height:1.5}
  </style>
  <div class="rcb">
    <div class="rcb-topo"><h2>🧾 Recebimentos</h2><span class="rcb-selo">somente consulta</span>
      <span style="color:#667;font-size:0.72rem">o histórico fica no Octano: a consulta não depende da adquirente nem do banco estarem no ar</span></div>
    <div class="rcb-fil">
      <label for="rcb-de">Período</label>
      <input type="date" id="rcb-de" class="rcb-inp" value="${_RCB.de}" max="${_rcbHojeBr()}" onchange="rcbFiltro('de', this.value)">
      <label for="rcb-ate">a</label>
      <input type="date" id="rcb-ate" class="rcb-inp" value="${_RCB.ate}" max="${_rcbHojeBr()}" onchange="rcbFiltro('ate', this.value)">
      ${postos}
      ${sel('forma', _RCB.forma, _rcbFormas())}
      <input id="rcb-busca" class="rcb-inp" placeholder="valor, NSU, autorização, placa, cliente…" value="${_rcbEsc(_RCB.busca)}" oninput="rcbBusca(this.value)" style="flex:1 1 200px;min-width:0">
      <button class="rcb-btn" onclick="rcbLimpar()">✖ Limpar</button>
      <button class="rcb-btn" onclick="rcbCsv()">📄 Planilha (CSV)</button>
    </div>
    <div class="rcb-abas" role="tablist">${_RCB_ABAS.map(a => `<button class="rcb-aba${a.id === _RCB.aba ? ' on' : ''}" role="tab" aria-selected="${a.id === _RCB.aba}" onclick="rcbAba('${a.id}')">${a.rot}</button>`).join('')}</div>
    <div class="rcb-cards">${cards}</div>
    ${barras}
    <div class="rcb-tab"><table style="width:100%;border-collapse:collapse"><thead><tr>${PH}${COLS.map(c => `<th class="rcb-th${c[2] ? ' rcb-r' : ''}">${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${corpo}${totais}</tbody></table></div>
    <p class="rcb-nota">${notas}${ord.length > LIM ? ` Mostrando os ${LIM} mais recentes de ${ord.length}; a planilha leva todos.` : ''}</p>
  </div>`;
}

// ---------- ações ----------
function rcbAba(id) {
  _RCB.aba = id; _RCB.forma = ''; _RCB.dia = '';
  try { localStorage.setItem('oct_rcb_aba', JSON.stringify(id)); } catch (e) {}
  _rcbCarregar();
}
function rcbFiltro(k, v) {
  if (k === 'de' || k === 'ate') {
    const de = k === 'de' ? v : _RCB.de, ate = k === 'ate' ? v : _RCB.ate;
    if (!de || !ate) return;
    if (de > ate) { alert('A data inicial é depois da final.'); _rcbRender(); return; }
    if ((Date.parse(ate) - Date.parse(de)) / 864e5 > 92) { alert('Escolha um período de até 3 meses.'); _rcbRender(); return; }
    _RCB.de = de; _RCB.ate = ate; _RCB.dia = '';
    _rcbCarregar(); return;
  }
  if (k === 'posto') { _RCB.posto = v; _RCB.dia = ''; _rcbCarregar(); return; }
  _RCB[k] = v; _rcbRender();
}
let _rcbBuscaT = null;
function rcbBusca(v) {
  _RCB.busca = v;
  clearTimeout(_rcbBuscaT);
  _rcbBuscaT = setTimeout(() => {
    const el = document.getElementById('rcb-busca'); const pos = el ? el.selectionStart : null;
    _rcbRender();
    const novo = document.getElementById('rcb-busca');
    if (novo) { novo.focus(); if (pos != null) novo.setSelectionRange(pos, pos); }
  }, 250);
}
function rcbDia(d) { _RCB.dia = _RCB.dia === d ? '' : d; _rcbRender(); }
function rcbLimpar() {
  const h = new Date(Date.now() - 3 * 3600e3); const d = new Date(h); d.setDate(d.getDate() - 6);
  _RCB.de = _rcbIso(d); _RCB.ate = _rcbIso(h); _RCB.forma = ''; _RCB.busca = ''; _RCB.dia = '';
  _rcbCarregar();
}
function rcbCsv() {
  const linhas = _rcbLinhasAba(false).slice().sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const br = v => v == null ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ',');
  const cab = ['Posto', 'Data', 'Hora', 'Aba', 'Origem', 'Forma', 'Bandeira/operadora', 'Parcelas', 'Bruto', 'Taxa', 'Liquido', 'Previsao', 'Maquininha', 'NSU', 'Autorizacao',
    'Placa', 'KM', 'Cupom', 'Cliente', 'Deposito', 'Descricao', 'Documento', 'Nosso numero', 'Referente a'];
  const out = linhas.map(r => [_rcbNomePosto(r.empresa_id) || '', r.dia.split('-').reverse().join('/'), r.hora, r.aba, r.origem, _RCB_FORMA[r.forma] || r.forma || '', r.bandeira || '',
    r.parcelas || '', br(r.bruto), br(r.taxa), br(r.liquido), r.previsto ? r.previsto.split('-').reverse().join('/') : '', r.maq || '', r.nsu || '', r.aut || '',
    r.placa || '', r.km || '', r.cupom || '', r.cliente || '', r.envelope || '', r.descricao || '', r.documento || '', r.nosso || '', r.fatura || '']);
  const csv = [cab].concat(out).map(l => l.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `recebimentos_${_RCB.aba}_${_RCB.de}_${_RCB.ate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
