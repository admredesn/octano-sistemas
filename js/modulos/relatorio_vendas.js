// ============================================================
//  RELATÓRIOS DE VENDAS (27/10/2026)
// ------------------------------------------------------------
//  Ronan: "nessa tela precisamos de mais opções de relatório, vendas durante período,
//  vendas por funcionário, relatório por placa, por cliente".
//
//  Régua da venda (Ronan 22/10): vale o CUPOM (tem acréscimo de tabela a prazo, desconto);
//  o que saiu da bomba e nenhum cupom citou entra pelo valor da bomba, destacado "sem cupom"
//  — a mesma conta do B.I, do F.Caixa e do Monitor.
//
//  Fontes (posto ativo):
//   • oct_pdv_vendas — o cupom. Cada item de combustível traz o abastecimento (id, bico) e o
//     frentista; prazo_dados traz placa, km e motorista da nota a prazo.
//   • oct_pdv_abastecimentos — a pista. O que nenhum cupom citou = sem cupom.
//   • oct_pessoas.cartao_idf — cartão do frentista na bomba -> nome (o AC grava só o cartão).
//  Cópia do TecnoX (status 'tecnox', antes da virada do caixa): fora dos totais (a bomba
//  cobre esses dias), mas entra em placa e cliente, marcada "TecnoX".
//
//  Quatro entradas na Central de Relatórios = uma tela com abas e a mesma carga de dados.
// ============================================================

const _RV_ABAS = [
  { id: 'periodo', icone: '🧾', titulo: 'Vendas no período', curto: 'Período',
    descricao: 'Quanto vendeu por dia, por produto e por forma de pagamento, pelo valor do cupom. O que saiu da bomba sem cupom aparece à parte.' },
  { id: 'funcionario', icone: '👷', titulo: 'Vendas por funcionário', curto: 'Funcionário',
    descricao: 'Por frentista (cartão na bomba): abastecimentos, litros e valor. Por operador do caixa: cupons, ticket médio e cancelamentos.' },
  { id: 'placa', icone: '🚚', titulo: 'Vendas por placa', curto: 'Placa',
    descricao: 'Abastecimentos de cada veículo (placa e km da nota a prazo): litros, valor, km rodados e média km/L.' },
  { id: 'cliente', icone: '👤', titulo: 'Vendas por cliente', curto: 'Cliente',
    descricao: 'O que cada cliente comprou no período: cupons, litros, valor, quanto foi a prazo e a última compra.' },
];

if (typeof RELATORIOS_REG !== 'undefined') {
  // vendas = o relatório mais usado: abre a Central
  _RV_ABAS.slice().reverse().forEach(a => {
    if (!RELATORIOS_REG.some(r => r.id === 'vendas_' + a.id)) {
      RELATORIOS_REG.unshift({ id: 'vendas_' + a.id, icone: a.icone, titulo: a.titulo, descricao: a.descricao, fn: () => relatorioVendas(a.id) });
    }
  });
}

window._rv = window._rv || { aba: 'periodo', func: 'frentista', tipo: '', busca: '', aberto: null, dados: null };
const _RV_TD = 'padding:7px 8px';
const _RV_SEM_ID = 'Sem identificação';

function _rvEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _rvNum(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
function _rvBRL(v) { return _relBRL(Math.round(Number(v || 0) * 100) / 100); }
function _rvNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function _rvDig(s) { return String(s || '').replace(/\D/g, ''); }
function _rvDoc(d) {
  d = _rvDig(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}
function _rvPlaca(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function _rvPlacaFmt(p) { return /^[A-Z]{3}\d/.test(p) && p.length === 7 ? p.slice(0, 3) + '-' + p.slice(3) : p; }
function _rvDiaLocal(dt) { const p = n => String(n).padStart(2, '0'); return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()); }
function _rvSomaDias(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return _rvDiaLocal(d); }
function _rvDiaBr(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : ''; }
function _rvSemana(d) { return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00').getDay()]; }
function _rvHora(dt) { return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function _rvAnonimo(nome, doc) { return !doc && (!nome || /^CONSUMIDOR|NAO IDENTIFICADO/.test(_rvNorm(nome))); }

// forma de pagamento por CATEGORIA (o cupom grava "NOTA A PRAZO" com código 05 e às vezes 01; Pix com 17 e vários nomes)
function _rvFormaCat(p) {
  const n = _rvNorm(p.nome), c = String(p.forma || '').padStart(2, '0');
  if (/PRAZO/.test(n)) return 'A prazo (nota)';
  if (p.frota || /FROTA/.test(n)) return 'Cartão frota';
  if (c === '02' || /CHEQUE/.test(n)) return 'Cheque';
  if (/CREDITO DO CLIENTE|HAVER|\bVALE\b/.test(n)) return 'Crédito do cliente / vale';
  if (c === '17' || /PIX/.test(n)) return 'Pix';
  if (c === '03' || /CREDITO/.test(n)) return 'Cartão de crédito';
  if (c === '04' || /DEBITO/.test(n)) return 'Cartão de débito';
  if (c === '01' || /DINHEIRO/.test(n)) return 'Dinheiro';
  if (c === '05') return 'A prazo (nota)';
  return p.nome || 'Outros';
}

async function _rvTudo(fazQuery) {
  const PAG = 1000; let tudo = [], de = 0;
  for (;;) {
    const { data, error } = await fazQuery().range(de, de + PAG - 1);
    if (error) throw new Error(error.message);
    tudo = tudo.concat(data || []);
    if (!data || data.length < PAG) return tudo;
    de += PAG;
  }
}

// ---------- carga (uma por posto + período; as abas só reagrupam) ----------
async function _rvCarregar(eid, ini, fim) {
  const st = window._rv;
  const chave = eid + '|' + ini + '|' + fim;
  if (st.dados && st.dados.chave === chave) return st.dados;
  const de = new Date(ini + 'T00:00:00');
  // cupom feito logo depois do fim (abastecimento às 23:50) ainda "usa" o abastecimento do período
  const ateLig = new Date(new Date(fim + 'T23:59:59.999').getTime() + 2 * 864e5);
  const [vendas, pista, pesR, empR] = await Promise.all([
    _rvTudo(() => sb.from('oct_pdv_vendas')
      .select('id,numero,status,operador,cliente_nome,cliente_cpf,itens,pagamentos,valor_total,data_venda,prazo_dados,placa,odometro,veiculo')
      .eq('empresa_id', eid).gte('data_venda', de.toISOString()).lte('data_venda', ateLig.toISOString())
      .order('data_venda').order('id')),
    // data_abast = hora LOCAL do posto gravada com rótulo +00:00 (filtra e mostra como está)
    _rvTudo(() => sb.from('oct_pdv_abastecimentos')
      .select('id,data_abast,litros,valor_total,valor,bico,vendedor,combustivel,produto_nome,status,tipo')
      .eq('empresa_id', eid).gte('data_abast', ini + 'T00:00:00').lte('data_abast', fim + 'T23:59:59.999')
      .or('tipo.is.null,tipo.neq.afericao').order('data_abast').order('id')),
    sb.from('oct_pessoas').select('nome,cartao_idf').eq('empresa_id', eid).not('cartao_idf', 'is', null),
    sb.from('oct_empresas').select('nome').eq('id', eid).maybeSingle(),
  ]);

  // cartão do frentista -> nome
  const idf = {};
  ((pesR && pesR.data) || []).forEach(p => { const k = String(p.cartao_idf || '').trim().toUpperCase(); if (k) idf[k] = String(p.nome || '').trim(); });
  const ehCartao = s => /^[0-9A-F]{10,}$/i.test(s);
  const nomeFunc = s => { s = String(s || '').trim(); return !s ? '' : (ehCartao(s) ? (idf[s.toUpperCase()] || '') : s); };
  const abIdDe = it => String(it.abastecimento_id || (it.dados && it.dados.id) || '');

  const abVend = {};
  pista.forEach(a => { abVend[a.id] = a.vendedor; });
  const usados = new Set(), faltam = new Set();
  vendas.forEach(v => {
    if (String(v.status || '').toLowerCase() === 'cancelada') return;
    (Array.isArray(v.itens) ? v.itens : []).forEach(it => {
      const id = abIdDe(it);
      if (!id || id.startsWith('prod-')) return;
      usados.add(id);
      const d = it.dados || {};
      if (!nomeFunc(d.vendedor_nome || d.vendedor || it.vendedor) && !(id in abVend)) faltam.add(id);
    });
  });
  // item sem o nome do frentista e abastecimento de antes do período: o cartão vem do abastecimento
  const lf = [...faltam].filter(id => /^[0-9a-f-]{36}$/i.test(id));
  for (let i = 0; i < lf.length; i += 100) {
    const { data } = await sb.from('oct_pdv_abastecimentos').select('id,vendedor').in('id', lf.slice(i, i + 100));
    (data || []).forEach(a => { abVend[a.id] = a.vendedor; });
  }

  const cupons = [], cancelados = [];
  vendas.forEach(v => {
    const quando = new Date(v.data_venda);
    const dia = _rvDiaLocal(quando);
    if (dia < ini || dia > fim) return;
    const stt = String(v.status || '').toLowerCase();
    if (stt === 'cancelada') {
      cancelados.push({ numero: v.numero, dia, quando, operador: String(v.operador || '').trim(), valor: Number(v.valor_total || 0), cliente: String(v.cliente_nome || '').trim() });
      return;
    }
    const pz = v.prazo_dados || {};
    const itens = (Array.isArray(v.itens) ? v.itens : []).map(it => {
      const id = abIdDe(it), d = it.dados || {}, f = it.fiscal || {};
      const comb = it.tipo === 'abastecimento' && !id.startsWith('prod-');
      const valor = Number(it.total != null ? it.total : Number(it.qtd || 0) * Number(it.unit || 0)) || 0;
      let func = nomeFunc(d.vendedor_nome || d.vendedor || it.vendedor);
      if (!func && comb && id) func = nomeFunc(abVend[id]);
      return {
        tipo: comb ? 'comb' : 'loja', produto: String(it.desc || f.nome || d.produto_nome || 'Item').trim(),
        qtd: Number(it.qtd || 0), un: comb ? 'L' : (f.unidade || 'UN'), valor,
        bomba: comb ? Number(it._totalOriginal || d.valor_total || valor) : valor,
        func, bico: it.n_bico || d.bico || '',
      };
    });
    cupons.push({
      id: v.id, numero: v.numero, dia, quando, tecnox: stt === 'tecnox', operador: String(v.operador || '').trim(),
      cliente: String(v.cliente_nome || '').trim(), doc: _rvDig(v.cliente_cpf),
      placa: _rvPlaca(v.placa || pz.placa), km: Number(_rvDig(pz.km) || v.odometro || 0) || null,
      motorista: String(pz.motorista || '').trim(), veiculo: String(v.veiculo || pz.veiculo || '').trim(),
      pags: (Array.isArray(v.pagamentos) ? v.pagamentos : []).map(p => ({ cat: _rvFormaCat(p), valor: Number(p.valor || 0) })),
      itens,
    });
  });

  // pista que nenhum cupom citou. Em dia de caixa no TecnoX a bomba não casa com a cópia do TecnoX: marca.
  const diasTecnox = new Set(cupons.filter(c => c.tecnox).map(c => c.dia));
  // (bomba que gravou 0 L / R$ 0,00 = bico tirado sem abastecer: não é venda)
  const semCupom = pista.filter(a => !usados.has(a.id) && (Number(a.valor_total || a.valor || 0) > 0.005 || Number(a.litros || 0) > 0.001)).map(a => {
    const s = String(a.data_abast || '');
    return {
      dia: s.slice(0, 10), hora: s.slice(11, 16), bico: a.bico, produto: String(a.combustivel || a.produto_nome || 'Combustível').trim(),
      litros: Number(a.litros || 0), valor: Number(a.valor_total || a.valor || 0), func: nomeFunc(a.vendedor),
      status: a.status, tecnoxDia: diasTecnox.has(s.slice(0, 10)),
    };
  });
  const tecnoxAte = [...diasTecnox].sort().pop() || '';
  st.dados = { chave, cupons, cancelados, semCupom, tecnoxAte, posto: (empR && empR.data && empR.data.nome) || '', ini, fim };
  return st.dados;
}

// ---------- filtros: tipo (combustível/loja) e busca ----------
// a busca vale para o cupom (número, cliente, documento, placa, operador) ou para o item (produto, frentista)
function _rvItensDe(c) {
  const st = window._rv, q = _rvNorm(st.busca);
  const doCupom = !q || _rvNorm([c.numero, c.cliente, c.doc, c.placa, c.operador, c.motorista].join(' ')).includes(q);
  return c.itens.filter(i => (!st.tipo || i.tipo === st.tipo) && (doCupom || _rvNorm(i.produto + ' ' + i.func).includes(q)));
}
function _rvSemCupomFiltrado(D) {
  const st = window._rv, q = _rvNorm(st.busca);
  if (st.tipo === 'loja') return [];
  return D.semCupom.filter(s => !q || _rvNorm(s.produto + ' ' + s.func + ' bico ' + s.bico).includes(q));
}
// formas do cupom proporcionais ao que passou no filtro (cupom misto: combustível + loja)
function _rvFormasDe(c, valorFiltrado) {
  const tot = c.itens.reduce((s, i) => s + i.valor, 0);
  const r = tot ? valorFiltrado / tot : 0;
  return c.pags.length ? c.pags.map(p => ({ cat: p.cat, valor: p.valor * r })) : [{ cat: c.tecnox ? 'TecnoX' : 'Não informado', valor: valorFiltrado }];
}
function _rvFormasTxt(c) { return [...new Set(c.pags.map(p => p.cat))].join(' + ') || (c.tecnox ? 'TecnoX' : '—'); }

// ---------- tela ----------
async function relatorioVendas(aba) {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const st = window._rv;
  if (aba) { st.aba = aba; st.aberto = null; }
  if (!st.ini) { const h = _rvDiaLocal(new Date()); st.ini = h.slice(0, 8) + '01'; st.fim = h; }
  const pill = (id, txt, ativo, fn) => `<button onclick="${fn}" style="padding:7px 14px;border-radius:18px;cursor:pointer;font-size:.84rem;font-weight:600;border:1px solid ${ativo ? '#f97316' : '#2a2d3e'};background:${ativo ? '#f97316' : '#13151f'};color:${ativo ? '#fff' : '#9fb3c8'}">${txt}</button>`;
  const atalho = (txt, fn) => `<button onclick="_rvAtalho('${fn}')" style="padding:4px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer;font-size:.74rem">${txt}</button>`;
  const lbl = 'color:#9fb3c8;font-size:.8rem';
  const ph = { periodo: 'produto, cliente, frentista…', funcionario: 'nome do funcionário…', placa: 'placa, cliente, motorista…', cliente: 'nome, CPF/CNPJ ou placa…' }[st.aba];
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('🧾 Vendas')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${_RV_ABAS.map(a => pill(a.id, a.icone + ' ' + a.curto, st.aba === a.id, `_rvAba('${a.id}')`)).join('')}
    </div>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px">
      <label style="${lbl}">De<br><input type="date" id="rv-ini" value="${st.ini}" style="margin-top:3px"></label>
      <label style="${lbl}">Até<br><input type="date" id="rv-fim" value="${st.fim}" style="margin-top:3px"></label>
      <label style="${lbl}">Tipo<br><select id="rv-tipo" onchange="_rvFiltro()" style="margin-top:3px">
        <option value=""${!st.tipo ? ' selected' : ''}>Tudo</option>
        <option value="comb"${st.tipo === 'comb' ? ' selected' : ''}>Combustível</option>
        <option value="loja"${st.tipo === 'loja' ? ' selected' : ''}>Loja (produtos)</option></select></label>
      ${st.aba === 'funcionario' ? `<label style="${lbl}">Por<br><select id="rv-func" onchange="_rvFiltro()" style="margin-top:3px">
        <option value="frentista"${st.func === 'frentista' ? ' selected' : ''}>Frentista (quem abasteceu)</option>
        <option value="operador"${st.func === 'operador' ? ' selected' : ''}>Operador do caixa (quem emitiu o cupom)</option></select></label>` : ''}
      <label style="${lbl};flex:1;min-width:200px">Procurar<br><input id="rv-busca" value="${_rvEsc(st.busca)}" placeholder="${ph}" oninput="_rvBuscaDigitou()" style="margin-top:3px;width:100%;box-sizing:border-box"></label>
      <button onclick="_rvBuscar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
      <button onclick="_rvCSV()" title="Planilha (abre no Excel)" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer">⬇ CSV</button>
      <button onclick="_rvImprimir()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer">🖨 Imprimir</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      ${atalho('Hoje', 'hoje')}${atalho('Ontem', 'ontem')}${atalho('Últimos 7 dias', '7')}${atalho('Este mês', 'mes')}${atalho('Mês passado', 'mespass')}
    </div>
    <div id="rv-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  _rvRender();
}

function _rvAba(id) {
  const st = window._rv;
  st.aba = id; st.aberto = null;
  const b = document.getElementById('rv-busca'); if (b) st.busca = b.value;
  relatorioVendas();
}
function _rvAtalho(q) {
  const st = window._rv, h = _rvDiaLocal(new Date());
  if (q === 'hoje') { st.ini = st.fim = h; }
  else if (q === 'ontem') { st.ini = st.fim = _rvSomaDias(h, -1); }
  else if (q === '7') { st.ini = _rvSomaDias(h, -6); st.fim = h; }
  else if (q === 'mes') { st.ini = h.slice(0, 8) + '01'; st.fim = h; }
  else if (q === 'mespass') { const fimPass = _rvSomaDias(h.slice(0, 8) + '01', -1); st.ini = fimPass.slice(0, 8) + '01'; st.fim = fimPass; }
  const i = document.getElementById('rv-ini'), f = document.getElementById('rv-fim');
  if (i) i.value = st.ini; if (f) f.value = st.fim;
  st.aberto = null;
  _rvRender();
}
function _rvBuscar() {
  const st = window._rv;
  st.ini = (document.getElementById('rv-ini') || {}).value || st.ini;
  st.fim = (document.getElementById('rv-fim') || {}).value || st.fim;
  if (st.ini > st.fim) { const t = st.ini; st.ini = st.fim; st.fim = t; }
  st.busca = (document.getElementById('rv-busca') || {}).value || '';
  st.aberto = null;
  st.dados = null;            // Buscar = dados novos do banco (venda de agora)
  _rvRender();
}
function _rvFiltro() {
  const st = window._rv;
  st.tipo = (document.getElementById('rv-tipo') || {}).value || '';
  const f = document.getElementById('rv-func'); if (f) st.func = f.value;
  st.aberto = null;
  _rvRender();
}
function _rvBuscaDigitou() {
  const st = window._rv;
  clearTimeout(st.buscaT);
  st.buscaT = setTimeout(() => { st.busca = (document.getElementById('rv-busca') || {}).value || ''; st.aberto = null; _rvRender(); }, 300);
}
function _rvAbrir(k) {
  const st = window._rv;
  st.aberto = st.aberto === k ? null : k;
  _rvRender();
  if (st.aberto) setTimeout(() => { const d = document.getElementById('rv-det'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
}

async function _rvRender() {
  const box = document.getElementById('rv-corpo');
  if (!box) return;
  const st = window._rv;
  const eid = _relEid();
  if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
  if (st.dados && st.dados.chave !== eid + '|' + st.ini + '|' + st.fim) box.innerHTML = '<p style="color:#888">Carregando…</p>';
  try {
    const D = await _rvCarregar(eid, st.ini, st.fim);
    if (document.getElementById('rv-corpo') !== box) return;
    st.tabs = []; st.csvDet = null; st.chaves = [];
    const html = { periodo: _rvPeriodo, funcionario: _rvFuncionario, placa: _rvPlacas, cliente: _rvClientes }[st.aba](D);
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171">Não consegui montar o relatório: ${_rvEsc(e.message || e)}</p>`;
  }
}

// ---------- peças de tela ----------
function _rvCard(t, v, cor, sub) {
  return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
    <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${t}</div>
    <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums">${v}</div>
    ${sub ? `<div style="color:#6b7280;font-size:.72rem;margin-top:2px">${sub}</div>` : ''}</div>`;
}
// cols: [{t, a:'r'|'c'}]; linhas: [{c:[html...], k?: chave p/ abrir, cls?}]; rodape: [html...]
function _rvTabela(cols, linhas, rodape, opts) {
  opts = opts || {};
  const al = a => a === 'r' ? 'right' : (a === 'c' ? 'center' : 'left');
  const st = window._rv;
  const corpo = linhas.map(l => {
    const aberto = l.k && st.aberto === l.k;
    const n = l.k ? st.chaves.push(l.k) - 1 : -1;
    return `<tr style="border-bottom:1px solid #1e2233;${l.k ? 'cursor:pointer;' : ''}${aberto ? 'background:#1d2235;' : ''}${l.estilo || ''}"${l.k ? ` onclick="_rvAbrir(window._rv.chaves[${n}])"` : ''}>
      ${l.c.map((x, i) => `<td style="${_RV_TD};text-align:${al(cols[i].a)}${cols[i].a === 'r' ? ';white-space:nowrap;font-variant-numeric:tabular-nums' : ''}">${x}</td>`).join('')}</tr>`;
  }).join('');
  return `<div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;${opts.alt ? 'max-height:' + opts.alt : ''}">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">
        ${cols.map(c => `<th style="${_RV_TD};text-align:${al(c.a)};white-space:nowrap">${c.t}</th>`).join('')}</tr></thead>
      <tbody>${corpo || `<tr><td colspan="${cols.length}" style="${_RV_TD};color:#888">Nada no período.</td></tr>`}</tbody>
      ${rodape ? `<tfoot><tr style="background:#141828;color:#e6e6e6;font-weight:700">${rodape.map((x, i) => `<td style="${_RV_TD};text-align:${al(cols[i].a)};white-space:nowrap;font-variant-numeric:tabular-nums">${x}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>`;
}
const _rvTxt = h => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
// guarda a tabela (texto) para CSV e impressão
function _rvGuardar(qual, titulo, cols, linhas, rodape) {
  const t = { titulo, cab: cols.map(c => _rvTxt(c.t)), alin: cols.map(c => c.a || ''), linhas: linhas.map(l => l.c.map(_rvTxt)), rodape: rodape ? rodape.map(_rvTxt) : null };
  if (qual === 'det') window._rv.csvDet = t; else (window._rv.tabs = window._rv.tabs || []).push(t);
}
function _rvDetalhe(titulo, cols, linhas, rodape, nota) {
  _rvGuardar('det', titulo, cols, linhas, rodape);
  const mostra = linhas.slice(0, 2000);
  return `<div id="rv-det" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
      <h3 style="color:#e6e6e6;margin:0;font-size:1rem">${titulo}</h3>
      <div style="display:flex;gap:6px">
        <button onclick="_rvCSV('det')" style="padding:5px 11px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer;font-size:.78rem">⬇ CSV do detalhe</button>
        <button onclick="_rvAbrir(window._rv.aberto)" style="padding:5px 11px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer;font-size:.78rem">✕ Fechar</button>
      </div></div>
    ${_rvTabela(cols, mostra, rodape, { alt: '55vh' })}
    ${linhas.length > mostra.length ? `<p style="color:#fbbf24;font-size:.76rem">Mostrando ${mostra.length} de ${linhas.length} linhas — o CSV leva todas.</p>` : ''}
    ${nota ? `<p style="color:#6b7280;font-size:.75rem;margin-top:6px">${nota}</p>` : ''}</div>`;
}
const _rvTag = (t, cor) => ` <span style="font-size:.68rem;padding:1px 6px;border-radius:9px;border:1px solid ${cor};color:${cor};white-space:nowrap">${t}</span>`;
function _rvItensTxt(itens) {
  return itens.map(i => `${_rvEsc(i.produto)} <span style="color:#6b7280">${_rvNum(i.qtd, i.un === 'L' ? 2 : 0)}${i.un === 'L' ? ' L' : ''}</span>`).join(' · ');
}
function _rvAvisoTecnox(D) {
  return D.tecnoxAte ? `<div style="background:#2a2300;border-radius:8px;padding:8px 12px;color:#fbbf24;font-size:.8rem;margin-bottom:12px">
    Até ${_rvDiaBr(D.tecnoxAte)} o caixa deste posto era o TecnoX: o combustível desses dias entra pelo valor da bomba e a loja vendida no TecnoX fica de fora.</div>` : '';
}
// linhas de cupons (detalhe por dia e por operador)
function _rvLinhasCupons(cups, semCup, cancel) {
  const ls = [];
  cups.forEach(c => {
    const its = _rvItensDe(c); if (!its.length) return;
    const v = its.reduce((s, i) => s + i.valor, 0);
    const funcs = [...new Set(its.map(i => i.func).filter(Boolean))].join(', ');
    ls.push({ t: c.quando.getTime(), c: [_rvDiaBr(c.dia) + ' ' + _rvHora(c.quando), String(c.numero || '') + (c.tecnox ? _rvTag('TecnoX', '#a78bfa') : ''),
      _rvEsc(c.cliente || '—') + (c.placa ? ` <span style="color:#6b7280">${_rvPlacaFmt(c.placa)}</span>` : ''), _rvEsc(c.operador), _rvEsc(funcs || '—'),
      _rvItensTxt(its), _rvEsc(_rvFormasTxt(c)), `<span style="color:#5dca9a;font-weight:600">${_rvBRL(v)}</span>`] });
  });
  (semCup || []).forEach(s => {
    ls.push({ t: new Date(s.dia + 'T' + (s.hora || '00:00') + ':00').getTime(), estilo: 'background:#221d0d;',
      c: [_rvDiaBr(s.dia) + ' ' + s.hora, s.tecnoxDia ? _rvTag('bomba · TecnoX', '#a78bfa') : _rvTag('sem cupom', '#fbbf24'), '—', '—', _rvEsc(s.func || _RV_SEM_ID),
        `${_rvEsc(s.produto)} <span style="color:#6b7280">${_rvNum(s.litros, 2)} L · bico ${_rvEsc(s.bico)}</span>`, '—', `<span style="color:#fbbf24;font-weight:600">${_rvBRL(s.valor)}</span>`] });
  });
  (cancel || []).forEach(x => {
    ls.push({ t: x.quando.getTime(), estilo: 'opacity:.6;',
      c: [_rvDiaBr(x.dia) + ' ' + _rvHora(x.quando), String(x.numero || '') + _rvTag('cancelado', '#f87171'), _rvEsc(x.cliente || '—'), _rvEsc(x.operador), '—', '—', '—',
        `<span style="text-decoration:line-through;color:#9ca3af">${_rvBRL(x.valor)}</span>`] });
  });
  return ls.sort((a, b) => a.t - b.t);
}
const _RV_COLS_CUPOM = [{ t: 'Data' }, { t: 'Cupom' }, { t: 'Cliente' }, { t: 'Operador' }, { t: 'Frentista' }, { t: 'Itens' }, { t: 'Pagamento' }, { t: 'Valor', a: 'r' }];

// ============================================================
//  ABA 1 — VENDAS NO PERÍODO
// ============================================================
function _rvPeriodo(D) {
  const st = window._rv;
  const dias = {}, prods = {}, formas = {};
  const dia = d => (dias[d] = dias[d] || { cupons: 0, litros: 0, comb: 0, loja: 0, sem: 0, semTx: 0, n: 0 });
  let nCup = 0;
  D.cupons.forEach(c => {
    if (c.tecnox) return;                       // a bomba cobre os dias do TecnoX
    const its = _rvItensDe(c); if (!its.length) return;
    const x = dia(c.dia); x.cupons++; nCup++;
    let v = 0;
    its.forEach(i => {
      v += i.valor;
      if (i.tipo === 'comb') { x.comb += i.valor; x.litros += i.qtd; } else x.loja += i.valor;
      const k = _rvNorm(i.produto);
      const p = (prods[k] = prods[k] || { nome: i.produto, qtd: 0, un: i.un, valor: 0, comb: i.tipo === 'comb' });
      p.qtd += i.qtd; p.valor += i.valor;
    });
    const cats = new Set();
    _rvFormasDe(c, v).forEach(f => { const m = (formas[f.cat] = formas[f.cat] || { valor: 0, cupons: 0 }); m.valor += f.valor; if (!cats.has(f.cat)) { m.cupons++; cats.add(f.cat); } });
  });
  const sem = _rvSemCupomFiltrado(D);
  sem.forEach(s => { const x = dia(s.dia); x.litros += s.litros; if (s.tecnoxDia) x.semTx += s.valor; else { x.sem += s.valor; x.n++; } });
  const ks = Object.keys(dias).sort();
  const T = ks.reduce((t, k) => { const x = dias[k]; ['cupons', 'litros', 'comb', 'loja', 'sem', 'semTx', 'n'].forEach(f => { t[f] += x[f]; }); return t; },
    { cupons: 0, litros: 0, comb: 0, loja: 0, sem: 0, semTx: 0, n: 0 });
  const total = T.comb + T.loja + T.sem + T.semTx;

  const cols = [{ t: 'Dia' }, { t: 'Cupons', a: 'r' }, { t: 'Litros', a: 'r' }, { t: 'Combustível', a: 'r' }, { t: 'Loja', a: 'r' }, { t: 'Sem cupom (bomba)', a: 'r' }, { t: 'Total', a: 'r' }];
  const linhas = ks.map(k => {
    const x = dias[k], semV = x.sem + x.semTx;
    return { k: 'dia:' + k, c: [`${_rvDiaBr(k)} <span style="color:#6b7280">${_rvSemana(k)}</span>`, x.cupons, _rvNum(x.litros, 2), _rvBRL(x.comb), _rvBRL(x.loja),
      semV ? `<span style="color:${x.semTx ? '#a78bfa' : '#fbbf24'}">${_rvBRL(semV)}${x.semTx ? ' · TecnoX' : ''}</span>` : '—',
      `<b style="color:#5dca9a">${_rvBRL(x.comb + x.loja + semV)}</b>`] };
  });
  const rod = ['Total', T.cupons, _rvNum(T.litros, 2), _rvBRL(T.comb), _rvBRL(T.loja), _rvBRL(T.sem + T.semTx), _rvBRL(total)];
  _rvGuardar('csv', 'Vendas por dia', cols, linhas, rod);

  const pl = Object.values(prods).sort((a, b) => b.valor - a.valor);
  const somaP = pl.reduce((s, p) => s + p.valor, 0) + T.sem + T.semTx;
  const pct = v => somaP ? _rvNum(v / somaP * 100, 1) + '%' : '—';
  const colsP = [{ t: 'Produto' }, { t: 'Quantidade', a: 'r' }, { t: 'Valor', a: 'r' }, { t: '%', a: 'r' }];
  const linP = pl.map(p => ({ c: [_rvEsc(p.nome), _rvNum(p.qtd, p.comb ? 2 : 0) + (p.comb ? ' L' : ' ' + _rvEsc(p.un)), _rvBRL(p.valor), pct(p.valor)] }));
  if (T.sem + T.semTx) linP.push({ estilo: 'background:#221d0d;', c: ['Sem cupom (valor da bomba)', _rvNum(sem.reduce((s, x) => s + x.litros, 0), 2) + ' L', _rvBRL(T.sem + T.semTx), pct(T.sem + T.semTx)] });
  _rvGuardar('tab', 'Por produto', colsP, linP, null);
  const fl = Object.entries(formas).sort((a, b) => b[1].valor - a[1].valor);
  const somaF = fl.reduce((s, f) => s + f[1].valor, 0);
  const colsF = [{ t: 'Forma de pagamento' }, { t: 'Cupons', a: 'r' }, { t: 'Valor', a: 'r' }, { t: '%', a: 'r' }];
  const linF = fl.map(([k, f]) => ({ c: [_rvEsc(k), f.cupons, _rvBRL(f.valor), somaF ? _rvNum(f.valor / somaF * 100, 1) + '%' : '—'] }));
  _rvGuardar('tab', 'Por forma de pagamento', colsF, linF, ['Total', '', _rvBRL(somaF), '']);

  let det = '';
  if (st.aberto && st.aberto.startsWith('dia:')) {
    const d = st.aberto.slice(4);
    const ls = _rvLinhasCupons(D.cupons.filter(c => c.dia === d && !c.tecnox), sem.filter(s => s.dia === d));
    det = _rvDetalhe(`Cupons de ${_rvDiaBr(d)} (${_rvSemana(d)})`, _RV_COLS_CUPOM, ls, null,
      'Linha amarela = saiu da bomba e não virou cupom (valor da bomba). Clique no dia de novo para fechar.');
  }
  return `${_rvAvisoTecnox(D)}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${_rvCard('Vendido', _rvBRL(total), '#5dca9a', `${_rvDiaBr(st.ini)} a ${_rvDiaBr(st.fim)}`)}
      ${st.tipo !== 'loja' ? _rvCard('Combustível', _rvBRL(T.comb + T.sem + T.semTx), '#e6e6e6', _rvNum(T.litros, 2) + ' L') : ''}
      ${st.tipo !== 'comb' ? _rvCard('Loja', _rvBRL(T.loja), '#e6e6e6') : ''}
      ${_rvCard('Cupons', nCup, '#e6e6e6', nCup ? 'ticket médio ' + _rvBRL((T.comb + T.loja) / nCup) : '')}
      ${T.sem ? _rvCard('Sem cupom', _rvBRL(T.sem), '#fbbf24', T.n + ' abastecimento(s) pela bomba') : ''}
      ${T.semTx ? _rvCard('Dias do TecnoX', _rvBRL(T.semTx), '#a78bfa', 'pela bomba') : ''}
    </div>
    ${_rvTabela(cols, linhas, rod, { alt: '46vh' })}
    <p style="color:#6b7280;font-size:.75rem;margin:6px 0 16px">Clique num dia para ver os cupons. Valor = o que o cupom cobrou (acréscimo de tabela e desconto inclusos); o que saiu da bomba e não virou cupom entra pelo valor da bomba.</p>
    ${det}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-top:16px">
      <div><h3 style="color:#e6e6e6;margin:0 0 8px;font-size:1rem">Por produto</h3>${_rvTabela(colsP, linP, null, { alt: '50vh' })}</div>
      <div><h3 style="color:#e6e6e6;margin:0 0 8px;font-size:1rem">Por forma de pagamento</h3>${_rvTabela(colsF, linF, ['Total', '', _rvBRL(somaF), ''])}
        <p style="color:#6b7280;font-size:.75rem;margin-top:6px">Cupom pago em mais de uma forma conta em cada uma, pelo valor de cada parte.${st.tipo ? ' Com o filtro de tipo, a parte de cada forma é proporcional.' : ''} Sem cupom não tem forma.</p></div>
    </div>`;
}

// ============================================================
//  ABA 2 — VENDAS POR FUNCIONÁRIO
// ============================================================
function _rvFuncionario(D) {
  const st = window._rv;
  const g = {};
  const pessoa = n => { const k = _rvNorm(n) || _RV_SEM_ID.toUpperCase(); return (g[k] = g[k] || { nome: n || _RV_SEM_ID, k, ab: 0, litros: 0, comb: 0, loja: 0, cupons: 0, semN: 0, semV: 0, canN: 0, canV: 0 }); };
  let lojaSemVend = 0, semCaixa = 0, semCaixaN = 0;
  const frent = st.func === 'frentista';
  D.cupons.forEach(c => {
    if (c.tecnox) return;
    const its = _rvItensDe(c); if (!its.length) return;
    if (frent) {
      its.forEach(i => {
        if (i.tipo === 'loja' && !i.func) { lojaSemVend += i.valor; return; }
        const p = pessoa(i.func);
        if (i.tipo === 'comb') { p.ab++; p.litros += i.qtd; p.comb += i.valor; } else p.loja += i.valor;
      });
    } else {
      const p = pessoa(c.operador); p.cupons++;
      its.forEach(i => { if (i.tipo === 'comb') { p.litros += i.qtd; p.comb += i.valor; } else p.loja += i.valor; });
    }
  });
  const sem = _rvSemCupomFiltrado(D);
  sem.forEach(s => {
    if (frent) { const p = pessoa(s.func); p.ab++; p.litros += s.litros; p.semN++; p.semV += s.valor; }
    else { semCaixa += s.valor; semCaixaN++; }
  });
  if (!frent) {
    const q = _rvNorm(st.busca);
    D.cancelados.filter(x => !q || _rvNorm(x.operador + ' ' + x.numero + ' ' + x.cliente).includes(q)).forEach(x => { const p = pessoa(x.operador); p.canN++; p.canV += x.valor; });
  }
  const lst = Object.values(g).map(p => Object.assign(p, { total: p.comb + p.loja + p.semV }))
    .sort((a, b) => (a.nome === _RV_SEM_ID) - (b.nome === _RV_SEM_ID) || b.total - a.total);
  const soma = lst.reduce((s, p) => s + p.total, 0);
  const pct = v => soma ? _rvNum(v / soma * 100, 1) + '%' : '—';
  let cols, linhas, rod;
  if (frent) {
    cols = [{ t: 'Frentista' }, { t: 'Abastecimentos', a: 'r' }, { t: 'Litros', a: 'r' }, { t: 'Combustível', a: 'r' }, { t: 'Loja', a: 'r' }, { t: 'Sem cupom', a: 'r' }, { t: 'Total', a: 'r' }, { t: '%', a: 'r' }];
    linhas = lst.map(p => ({ k: 'f:' + p.k, c: [_rvEsc(p.nome) + (p.nome === _RV_SEM_ID ? ' <span style="color:#6b7280;font-size:.72rem">(sem cartão na bomba)</span>' : ''),
      p.ab, _rvNum(p.litros, 2), _rvBRL(p.comb), p.loja ? _rvBRL(p.loja) : '—',
      p.semN ? `<span style="color:#fbbf24">${p.semN} · ${_rvBRL(p.semV)}</span>` : '—', `<b style="color:#5dca9a">${_rvBRL(p.total)}</b>`, pct(p.total)] }));
    const T = lst.reduce((t, p) => { t.ab += p.ab; t.l += p.litros; t.c += p.comb; t.lj += p.loja; t.sn += p.semN; t.sv += p.semV; return t; }, { ab: 0, l: 0, c: 0, lj: 0, sn: 0, sv: 0 });
    rod = ['Total', T.ab, _rvNum(T.l, 2), _rvBRL(T.c), _rvBRL(T.lj), T.sn ? T.sn + ' · ' + _rvBRL(T.sv) : '—', _rvBRL(soma), ''];
  } else {
    cols = [{ t: 'Operador do caixa' }, { t: 'Cupons', a: 'r' }, { t: 'Litros', a: 'r' }, { t: 'Combustível', a: 'r' }, { t: 'Loja', a: 'r' }, { t: 'Total', a: 'r' }, { t: 'Ticket médio', a: 'r' }, { t: 'Cancelados', a: 'r' }, { t: '%', a: 'r' }];
    linhas = lst.map(p => ({ k: 'o:' + p.k, c: [_rvEsc(p.nome), p.cupons, _rvNum(p.litros, 2), _rvBRL(p.comb), _rvBRL(p.loja), `<b style="color:#5dca9a">${_rvBRL(p.total)}</b>`,
      p.cupons ? _rvBRL(p.total / p.cupons) : '—', p.canN ? `<span style="color:#f87171">${p.canN} · ${_rvBRL(p.canV)}</span>` : '—', pct(p.total)] }));
    const T = lst.reduce((t, p) => { t.cu += p.cupons; t.l += p.litros; t.c += p.comb; t.lj += p.loja; t.cn += p.canN; t.cv += p.canV; return t; }, { cu: 0, l: 0, c: 0, lj: 0, cn: 0, cv: 0 });
    rod = ['Total', T.cu, _rvNum(T.l, 2), _rvBRL(T.c), _rvBRL(T.lj), _rvBRL(soma), T.cu ? _rvBRL(soma / T.cu) : '—', T.cn ? T.cn + ' · ' + _rvBRL(T.cv) : '—', ''];
  }
  _rvGuardar('csv', frent ? 'Vendas por frentista' : 'Vendas por operador do caixa', cols, linhas, rod);

  let det = '';
  if (st.aberto && /^[fo]:/.test(st.aberto)) {
    const k = st.aberto.slice(2), p = g[k];
    if (p && frent) {
      const ls = [];
      D.cupons.forEach(c => {
        if (c.tecnox) return;
        _rvItensDe(c).forEach(i => {
          if ((_rvNorm(i.func) || _RV_SEM_ID.toUpperCase()) !== k || (i.tipo === 'loja' && !i.func)) return;
          ls.push({ t: c.quando.getTime(), c: [_rvDiaBr(c.dia) + ' ' + _rvHora(c.quando), String(c.numero || ''), i.bico ? String(i.bico) : '—', _rvEsc(i.produto),
            _rvNum(i.qtd, i.un === 'L' ? 2 : 0) + ' ' + _rvEsc(i.un), `<span style="color:#5dca9a;font-weight:600">${_rvBRL(i.valor)}</span>`, _rvEsc(c.cliente || '—'), _rvEsc(_rvFormasTxt(c))] });
        });
      });
      sem.forEach(s => {
        if ((_rvNorm(s.func) || _RV_SEM_ID.toUpperCase()) !== k) return;
        ls.push({ t: new Date(s.dia + 'T' + (s.hora || '00:00') + ':00').getTime(), estilo: 'background:#221d0d;',
          c: [_rvDiaBr(s.dia) + ' ' + s.hora, s.tecnoxDia ? _rvTag('bomba · TecnoX', '#a78bfa') : _rvTag('sem cupom', '#fbbf24'), String(s.bico || '—'), _rvEsc(s.produto),
            _rvNum(s.litros, 2) + ' L', `<span style="color:#fbbf24;font-weight:600">${_rvBRL(s.valor)}</span>`, '—', '—'] });
      });
      ls.sort((a, b) => a.t - b.t);
      det = _rvDetalhe(`${_rvEsc(p.nome)} — abastecimentos e produtos`, [{ t: 'Data' }, { t: 'Cupom' }, { t: 'Bico', a: 'c' }, { t: 'Produto' }, { t: 'Qtd', a: 'r' }, { t: 'Valor', a: 'r' }, { t: 'Cliente' }, { t: 'Pagamento' }], ls,
        ['', '', '', '', '', _rvBRL(p.total), '', '']);
    } else if (p) {
      const ls = _rvLinhasCupons(D.cupons.filter(c => !c.tecnox && (_rvNorm(c.operador) || _RV_SEM_ID.toUpperCase()) === k), null,
        D.cancelados.filter(x => (_rvNorm(x.operador) || _RV_SEM_ID.toUpperCase()) === k));
      det = _rvDetalhe(`${_rvEsc(p.nome)} — cupons emitidos`, _RV_COLS_CUPOM, ls, null, 'Cupons cancelados aparecem riscados e não somam.');
    }
  }
  const nota = frent
    ? `Frentista = quem estava com o cartão na bomba (o nome vem do PDV ou do cartão cadastrado em Pessoas). "${_RV_SEM_ID}" = abastecimento sem cartão.`
      + (lojaSemVend ? ` Produtos de loja sem vendedor registrado: ${_rvBRL(lojaSemVend)} (não entram aqui; veja "Operador do caixa").` : '')
    : 'Operador = quem estava no caixa quando o cupom saiu.' + (semCaixaN ? ` ${semCaixaN} abastecimento(s) sem cupom (${_rvBRL(semCaixa)}) não passaram pelo caixa e não entram aqui; veja "Frentista".` : '');
  return `${_rvAvisoTecnox(D)}
    ${_rvTabela(cols, linhas, rod, { alt: '55vh' })}
    <p style="color:#6b7280;font-size:.75rem;margin:6px 0 0">Clique num nome para ver o detalhe. ${nota}</p>
    ${det}`;
}

// ============================================================
//  ABA 3 — VENDAS POR PLACA
// ============================================================
function _rvPlacas(D) {
  const st = window._rv;
  const g = {};
  D.cupons.forEach(c => {
    if (!c.placa) return;
    const its = _rvItensDe(c); if (!its.length) return;
    const p = (g[c.placa] = g[c.placa] || { placa: c.placa, veiculo: '', clientes: new Set(), cups: [], litros: 0, valor: 0, ultKm: null, ultima: null, tecnox: false });
    const litros = its.filter(i => i.tipo === 'comb').reduce((s, i) => s + i.qtd, 0), valor = its.reduce((s, i) => s + i.valor, 0);
    p.cups.push({ c, its, litros, valor });
    p.litros += litros; p.valor += valor;
    if (c.cliente) p.clientes.add(c.cliente);
    if (c.veiculo) p.veiculo = c.veiculo;
    if (c.tecnox) p.tecnox = true;
    if (!p.ultima || c.quando > p.ultima) { p.ultima = c.quando; if (c.km) p.ultKm = c.km; }
  });
  // km rodados e média: entre dois abastecimentos com km, o litro do SEGUNDO é o que o trecho gastou
  Object.values(g).forEach(p => {
    p.cups.sort((a, b) => a.c.quando - b.c.quando);
    p.kmRod = 0; p.litrosKm = 0; let ant = null;
    p.cups.forEach(x => {
      x.delta = null; x.kml = null;
      if (x.c.km && ant && ant.c.km && x.c.km > ant.c.km && x.c.km - ant.c.km < 5000 && x.litros > 0) {
        x.delta = x.c.km - ant.c.km; x.kml = x.delta / x.litros;
        p.kmRod += x.delta; p.litrosKm += x.litros;
      }
      if (x.c.km) ant = x;
    });
  });
  const lst = Object.values(g).sort((a, b) => b.valor - a.valor);
  const cols = [{ t: 'Placa' }, { t: 'Cliente' }, { t: 'Abastecimentos', a: 'r' }, { t: 'Litros', a: 'r' }, { t: 'Valor', a: 'r' }, { t: 'Último km', a: 'r' }, { t: 'Km rodados', a: 'r' }, { t: 'Média km/L', a: 'r' }, { t: 'Última vez' }];
  const linhas = lst.map(p => ({ k: 'p:' + p.placa, c: [`<b>${_rvPlacaFmt(p.placa)}</b>${p.veiculo ? ` <span style="color:#6b7280">${_rvEsc(p.veiculo)}</span>` : ''}${p.tecnox ? _rvTag('TecnoX', '#a78bfa') : ''}`,
    _rvEsc([...p.clientes].join(', ') || '—'), p.cups.length, _rvNum(p.litros, 2), `<b style="color:#5dca9a">${_rvBRL(p.valor)}</b>`,
    p.ultKm ? _rvNum(p.ultKm, 0) : '—', p.kmRod ? _rvNum(p.kmRod, 0) : '—', p.litrosKm ? _rvNum(p.kmRod / p.litrosKm, 2) : '—', p.ultima ? _rvDiaBr(_rvDiaLocal(p.ultima)) : ''] }));
  const T = lst.reduce((t, p) => { t.n += p.cups.length; t.l += p.litros; t.v += p.valor; return t; }, { n: 0, l: 0, v: 0 });
  const rod = [lst.length + ' placa(s)', '', T.n, _rvNum(T.l, 2), _rvBRL(T.v), '', '', '', ''];
  _rvGuardar('csv', 'Vendas por placa', cols, linhas, rod);

  let det = '';
  if (st.aberto && st.aberto.startsWith('p:')) {
    const p = g[st.aberto.slice(2)];
    if (p) {
      const ls = p.cups.map(x => ({ c: [_rvDiaBr(x.c.dia) + ' ' + _rvHora(x.c.quando), String(x.c.numero || '') + (x.c.tecnox ? _rvTag('TecnoX', '#a78bfa') : ''), _rvEsc(x.c.cliente || '—'),
        _rvEsc(x.c.motorista || '—'), x.c.km ? _rvNum(x.c.km, 0) : '—', x.delta ? _rvNum(x.delta, 0) : '—', _rvItensTxt(x.its), _rvNum(x.litros, 2),
        x.kml ? _rvNum(x.kml, 2) : '—', `<span style="color:#5dca9a;font-weight:600">${_rvBRL(x.valor)}</span>`, _rvEsc(_rvFormasTxt(x.c))] }));
      det = _rvDetalhe(`Placa ${_rvPlacaFmt(p.placa)}${p.veiculo ? ' — ' + _rvEsc(p.veiculo) : ''}`,
        [{ t: 'Data' }, { t: 'Cupom' }, { t: 'Cliente' }, { t: 'Motorista' }, { t: 'Km', a: 'r' }, { t: 'Km rodados', a: 'r' }, { t: 'Itens' }, { t: 'Litros', a: 'r' }, { t: 'Km/L', a: 'r' }, { t: 'Valor', a: 'r' }, { t: 'Pagamento' }],
        ls, ['', '', '', '', '', p.kmRod ? _rvNum(p.kmRod, 0) : '', '', _rvNum(p.litros, 2), p.litrosKm ? _rvNum(p.kmRod / p.litrosKm, 2) : '', _rvBRL(p.valor), ''],
        'Km/L = km rodados desde o abastecimento anterior ÷ litros deste. Só conta quando os dois têm km informado.');
    }
  }
  const semPlaca = D.cupons.filter(c => !c.placa && !c.tecnox).length;
  return `${_rvTabela(cols, linhas, rod, { alt: '55vh' })}
    <p style="color:#6b7280;font-size:.75rem;margin:6px 0 0">Clique numa placa para ver os abastecimentos. A placa e o km vêm da nota a prazo (o PDV pede na hora); venda à vista não grava placa (${semPlaca} cupom(ns) no período sem placa).${D.tecnoxAte ? ' Cupons do TecnoX (antes da virada) aparecem marcados.' : ''}</p>
    ${det}`;
}

// ============================================================
//  ABA 4 — VENDAS POR CLIENTE
// ============================================================
function _rvClientes(D) {
  const st = window._rv;
  const g = {};
  let anonN = 0, anonV = 0;
  D.cupons.forEach(c => {
    const its = _rvItensDe(c); if (!its.length) return;
    const valor = its.reduce((s, i) => s + i.valor, 0);
    if (_rvAnonimo(c.cliente, c.doc)) { if (!c.tecnox) { anonN++; anonV += valor; } return; }
    const k = c.doc || 'N:' + _rvNorm(c.cliente);
    const p = (g[k] = g[k] || { k, nome: c.cliente, doc: c.doc, cups: [], litros: 0, comb: 0, loja: 0, prazo: 0, ultima: null, placas: new Set(), tecnox: false });
    p.cups.push({ c, its, valor });
    its.forEach(i => { if (i.tipo === 'comb') { p.litros += i.qtd; p.comb += i.valor; } else p.loja += i.valor; });
    _rvFormasDe(c, valor).forEach(f => { if (f.cat === 'A prazo (nota)') p.prazo += f.valor; });
    if (c.placa) p.placas.add(c.placa);
    if (c.tecnox) p.tecnox = true;
    if (!p.ultima || c.quando > p.ultima) { p.ultima = c.quando; if (c.cliente) p.nome = c.cliente; }
  });
  const lst = Object.values(g).map(p => Object.assign(p, { total: p.comb + p.loja })).sort((a, b) => b.total - a.total);
  const cols = [{ t: 'Cliente' }, { t: 'CPF/CNPJ' }, { t: 'Cupons', a: 'r' }, { t: 'Litros', a: 'r' }, { t: 'Combustível', a: 'r' }, { t: 'Loja', a: 'r' }, { t: 'Total', a: 'r' }, { t: 'A prazo', a: 'r' }, { t: 'Última compra' }];
  const linhas = lst.map(p => ({ k: 'c:' + p.k, c: [_rvEsc(p.nome) + (p.tecnox ? _rvTag('TecnoX', '#a78bfa') : ''), _rvDoc(p.doc) || '—', p.cups.length, _rvNum(p.litros, 2), _rvBRL(p.comb),
    p.loja ? _rvBRL(p.loja) : '—', `<b style="color:#5dca9a">${_rvBRL(p.total)}</b>`, p.prazo ? _rvBRL(p.prazo) : '—', p.ultima ? _rvDiaBr(_rvDiaLocal(p.ultima)) : ''] }));
  const T = lst.reduce((t, p) => { t.n += p.cups.length; t.l += p.litros; t.c += p.comb; t.lj += p.loja; t.v += p.total; t.pz += p.prazo; return t; }, { n: 0, l: 0, c: 0, lj: 0, v: 0, pz: 0 });
  const rod = [lst.length + ' cliente(s)', '', T.n, _rvNum(T.l, 2), _rvBRL(T.c), _rvBRL(T.lj), _rvBRL(T.v), _rvBRL(T.pz), ''];
  _rvGuardar('csv', 'Vendas por cliente', cols, linhas, rod);

  let det = '';
  if (st.aberto && st.aberto.startsWith('c:')) {
    const p = g[st.aberto.slice(2)];
    if (p) {
      const ls = p.cups.slice().sort((a, b) => a.c.quando - b.c.quando).map(x => ({ c: [_rvDiaBr(x.c.dia) + ' ' + _rvHora(x.c.quando), String(x.c.numero || '') + (x.c.tecnox ? _rvTag('TecnoX', '#a78bfa') : ''),
        x.c.placa ? _rvPlacaFmt(x.c.placa) : '—', _rvEsc(x.c.motorista || '—'), _rvItensTxt(x.its), _rvEsc(_rvFormasTxt(x.c)), _rvEsc(x.c.operador),
        `<span style="color:#5dca9a;font-weight:600">${_rvBRL(x.valor)}</span>`] }));
      det = _rvDetalhe(`${_rvEsc(p.nome)}${p.doc ? ' — ' + _rvDoc(p.doc) : ''}`,
        [{ t: 'Data' }, { t: 'Cupom' }, { t: 'Placa' }, { t: 'Motorista' }, { t: 'Itens' }, { t: 'Pagamento' }, { t: 'Operador' }, { t: 'Valor', a: 'r' }], ls,
        ['', '', '', '', '', '', '', _rvBRL(p.total)]);
    }
  }
  return `${_rvTabela(cols, linhas, rod, { alt: '55vh' })}
    <p style="color:#6b7280;font-size:.75rem;margin:6px 0 0">Clique num cliente para ver as compras. Cliente = o informado no cupom (CPF/CNPJ ou nome).
      ${anonN ? `${anonN} cupom(ns) sem cliente identificado (${_rvBRL(anonV)}) ficam de fora.` : ''}${D.tecnoxAte ? ' Cupons do TecnoX (antes da virada) aparecem marcados.' : ''}</p>
    ${det}`;
}

// ---------- CSV e impressão ----------
function _rvCSV(qual) {
  if (typeof podeOuAvisa === 'function' && !podeOuAvisa('relatorios.exportar')) return;
  const st = window._rv;
  const ts = (qual === 'det' ? [st.csvDet] : (st.tabs || [])).filter(t => t && t.linhas.length);
  if (!ts.length) { alert('Nada para exportar — busque o relatório antes.'); return; }
  const cel = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  // número no padrão do Excel brasileiro: "R$ 1.234,56" -> 1234,56
  const num = s => /^-?R\$\s?[\d.]+,\d{2}$/.test(s) ? s.replace(/R\$\s?/, '').replace(/\./g, '') : s;
  const linhas = [];
  ts.forEach((t, i) => {
    if (ts.length > 1) { if (i) linhas.push([]); linhas.push([t.titulo]); }
    linhas.push(t.cab, ...t.linhas.map(l => l.map(num)));
    if (t.rodape) linhas.push(t.rodape.map(num));
  });
  const txt = '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = (_rvNorm(ts[0].titulo).toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'vendas') + '_' + st.ini + '_a_' + st.fim + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function _rvImprimir() {
  if (typeof podeOuAvisa === 'function' && !podeOuAvisa('relatorios.exportar')) return;
  const st = window._rv, D = st.dados;
  const ts = (st.tabs || []).concat(st.aberto && st.csvDet ? [st.csvDet] : []).filter(t => t && t.linhas.length);
  if (!ts.length) { alert('Nada para imprimir — busque o relatório antes.'); return; }
  const e = _rvEsc;
  const tab = t => `<h2>${e(t.titulo)}</h2><table><thead><tr>${t.cab.map((c, i) => `<th class="${t.alin[i]}">${e(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.linhas.map(l => `<tr>${l.map((c, i) => `<td class="${t.alin[i]}">${e(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${t.rodape ? `<tfoot><tr>${t.rodape.map((c, i) => `<td class="${t.alin[i]}">${e(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  const w = window.open('', '_blank');
  if (!w) { alert('O navegador bloqueou a janela de impressão — libere pop-ups para este site.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(ts[0].titulo)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:18px;font-size:11px}
    h1{font-size:15px;margin:0} .sub{color:#555;margin:2px 0 12px} h2{font-size:13px;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
    th{background:#eee} td.r,th.r{text-align:right;white-space:nowrap} td.c,th.c{text-align:center} tfoot td{font-weight:bold;border-top:2px solid #333}
    @media print{body{margin:8mm}}</style></head><body>
    <h1>${e(D ? D.posto : '')}</h1><div class="sub">${_rvDiaBr(st.ini)} a ${_rvDiaBr(st.fim)}${st.tipo ? ' · ' + (st.tipo === 'comb' ? 'só combustível' : 'só loja') : ''}${st.busca ? ' · procurando "' + e(st.busca) + '"' : ''} · impresso em ${new Date().toLocaleString('pt-BR')}</div>
    ${ts.map(tab).join('')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
