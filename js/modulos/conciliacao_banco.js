// ============================================================
// CONCILIAÇÃO BANCÁRIA — livro financeiro por conta × espelho do banco
// ------------------------------------------------------------
// Pedido do Ronan (15/09/2026): a tela serve para COMPROVAR a movimentação
// financeira do posto. Por conta (Sicoob, PagBank, Caixa/Cofre, BB):
//   esquerda  LIVRO do posto (oct_fin_lancamentos) com saldo corrido —
//             navegar, alterar, excluir, lançar (despesa/receita, saque,
//             depósito, transferência), conciliar
//   direita   ESPELHO do extrato (oct_banco_movimentos), que não se perde
// Conciliar = ligar lançamento(s) do livro à linha do banco que os comprova.
// O livro recebe sozinho (oct_fin_sincronizar) as contas pagas e os títulos
// recebidos; o resto se lança aqui, de preferência a partir da linha do banco.
// Etapa 2: cada Pix e cada cartão das vendas entram detalhados.
// ============================================================

const CB_TARIFA_BOLETO = 3.72;   // tarifa do Sicoob por boleto liquidado
const _CB_INICIO = '2026-07-01'; // o livro começa aqui (decisão do Ronan)
const _CB_MAX_LINHAS = 2000;     // cada Pix/cartão é uma linha: a tabela mostra por partes
const _CB_TIPOS = {
  despesa_financeira: { rot: 'Despesa financeira', nat: 'D' },
  receita_financeira: { rot: 'Receita financeira', nat: 'C' },
  despesa_adm:        { rot: 'Despesa administrativa', nat: 'D' },
  receita_adm:        { rot: 'Receita administrativa', nat: 'C' },
  pagamento_titulo:   { rot: 'Pagamento de título', nat: 'D' },
  venda_maquininha:   { rot: 'Venda na maquininha', nat: 'C' },
  taxa_maquininha:    { rot: 'Taxa da maquininha', nat: 'D' },
  deposito_cofre:     { rot: 'Depósito no cofre', nat: 'C' },
  recebimento_pix:    { rot: 'Recebimento Pix/transferência', nat: 'C' },
  liberacao_cheque:   { rot: 'Liberação de cheque', nat: 'C' },
  recebimento_titulo: { rot: 'Recebimento de título', nat: 'C' },
  transferencia:      { rot: 'Transferência entre contas', nat: null },
  saque:              { rot: 'Saque (banco → caixa)', nat: null },
  deposito:           { rot: 'Depósito (caixa → banco)', nat: null },
  ajuste:             { rot: 'Ajuste', nat: null },
};

const _cb = { contas: [], contaId: null, lanc: [], movs: [], saldoAntes: 0, selL: new Set(), selM: null,
              filtro: { status: 'todos', nat: 'todos', busca: '' }, sincronizado: {},
              cursor: null, visIds: [], sug: {}, ocupado: false };   // cursor = linha do teclado

function _cbMoney(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _cbNum(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _cbDt(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
function _cbEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _cbIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _cbInfo(m) { return String(m.info || '').replace(/\|@/g, ' · ').replace(/\s+/g, ' ').trim(); }
function _cbConta() { return _cb.contas.find(c => c.id === _cb.contaId) || null; }
function _cbSinal(l) { return (l.natureza === 'C' ? 1 : -1) * Number(l.valor || 0); }
function _cbSinalMov(m) { return (m.tipo === 'debito' ? -1 : 1) * Number(m.valor || 0); }

// PostgREST devolve no máximo 1000 linhas: pagina com ordem estável
async function _cbTudo(montar) {
  const out = [];
  for (let off = 0; off < 200000; off += 1000) {
    const { data, error } = await montar().range(off, off + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function moduloConcBanco() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando conciliação...</p>';
  try { await _cbCarregar(true); }
  catch (e) {
    const falta = /oct_fin_/.test(String(e.message || e));
    conteudo.innerHTML = '<div style="padding:24px;color:#f87171">' +
      (falta ? 'Falta rodar o <b>SQL-LIVRO-FINANCEIRO.sql</b> no Supabase.' : 'Erro: ' + _cbEsc(e.message || e)) +
      ' <button onclick="moduloConcBanco()" style="margin-left:10px;padding:6px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Tentar de novo</button></div>';
  }
}

function _cbPeriodo() {
  const p = window._cbPer || {};
  const hoje = new Date();
  return { ini: p.ini || _cbIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: p.fim || _cbIso(hoje) };
}

// ---------- dados ----------
async function _cbCarregar(sincronizar) {
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { document.getElementById('conteudo').innerHTML = '<p style="color:#f87171;padding:20px">Selecione a empresa.</p>'; return; }
  if (_cb.eid !== eid) { _cb.eid = eid; _cb.contaId = null; _cb.selL.clear(); _cb.selM = null; }

  const { data: contas, error: eC } = await sb.from('oct_fin_contas').select('*').eq('empresa_id', eid).eq('ativo', true).order('ordem');
  if (eC) throw eC;
  _cb.contas = contas || [];
  if (!_cb.contas.length) {
    document.getElementById('conteudo').innerHTML = '<p style="color:#fbbf24;padding:20px">Este posto ainda não tem contas cadastradas (SQL-LIVRO-FINANCEIRO.sql).</p>';
    return;
  }
  if (!_cb.contaId || !_cbConta()) _cb.contaId = _cb.contas[0].id;

  // traz para o livro o que o sistema já sabe (1× por abertura, ou no ↻)
  if (sincronizar || !_cb.sincronizado[eid]) {
    const { error } = await sb.rpc('oct_fin_sincronizar', { p_empresa: eid, p_desde: _CB_INICIO });
    if (error) console.warn('oct_fin_sincronizar:', error.message);
    // etapa 2: vendas na maquininha, taxa do dia, cofre e Pix de cliente do extrato
    const { error: eV } = await sb.rpc('oct_fin_sincronizar_vendas', { p_empresa: eid, p_desde: _CB_INICIO });
    if (eV) console.warn('oct_fin_sincronizar_vendas:', eV.message);
    _cb.sincronizado[eid] = Date.now();
  }

  const conta = _cbConta();
  const per = _cbPeriodo();
  const desdeSaldo = conta.saldo_inicial_em || _CB_INICIO;
  const [lanc, movs] = await Promise.all([
    _cbTudo(() => sb.from('oct_fin_lancamentos').select('*').eq('conta_id', conta.id).eq('excluido', false)
      .gte('data', desdeSaldo).lte('data', per.fim).order('data').order('criado_em').order('id')),
    conta.extrato_banco
      ? _cbTudo(() => sb.from('oct_banco_movimentos').select('*').eq('empresa_id', eid).eq('banco', conta.extrato_banco)
          .gte('data', per.ini).lte('data', per.fim).order('data').order('id'))
      : Promise.resolve([]),
  ]);
  // cheque bloqueado não é movimento (o crédito vem na liberação) — fora do espelho
  _cb.movs = movs.filter(m => !/^DEP\.CHEQUE BLOQ/i.test(m.descricao || ''));
  _cb.saldoAntes = Number(conta.saldo_inicial || 0) + lanc.filter(l => l.data < per.ini).reduce((s, l) => s + _cbSinal(l), 0);
  _cb.lanc = lanc.filter(l => l.data >= per.ini);

  // saldo do banco (Sicoob, gateway 10/10 min)
  _cb.saldoBanco = null;
  if (conta.extrato_banco === 'sicoob') {
    const { data: s } = await sb.from('oct_banco_saldos').select('saldo,consultado_em').eq('empresa_id', eid).maybeSingle();
    _cb.saldoBanco = s || null;
  }
  _cbRender();
}

// sugestão: lançamento sem comprovante × linha do banco livre, mesmo valor e sinal, até 3 dias
function _cbSugestoes() {
  const usados = new Set(_cb.lanc.filter(l => l.banco_mov_id).map(l => l.banco_mov_id));
  const livres = _cb.movs.filter(m => !usados.has(m.id) && !m.conciliado);
  const sug = {};
  const dias = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);
  _cb.lanc.filter(l => !l.conciliado).forEach(l => {
    const c = livres.filter(m => Math.abs(_cbSinalMov(m) - _cbSinal(l)) < 0.005 && dias(m.data, l.data) <= 3);
    if (c.length === 1) sug[l.id] = c[0];
  });
  // a mesma linha do banco não pode ser sugerida para dois lançamentos
  const cont = {};
  Object.values(sug).forEach(m => { cont[m.id] = (cont[m.id] || 0) + 1; });
  Object.keys(sug).forEach(k => { if (cont[sug[k].id] > 1) delete sug[k]; });
  return sug;
}

// ---------- tela ----------
function _cbRender() {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  const conta = _cbConta();
  const per = _cbPeriodo();
  const f = _cb.filtro;
  const sug = _cbSugestoes();
  const movPorId = {}; _cb.movs.forEach(m => { movPorId[m.id] = m; });
  const lancPorMov = {}; _cb.lanc.forEach(l => { if (l.banco_mov_id) (lancPorMov[l.banco_mov_id] = lancPorMov[l.banco_mov_id] || []).push(l); });

  // saldo corrido sobre TODOS os lançamentos do período; filtro só esconde
  let saldo = _cb.saldoAntes, cred = 0, deb = 0, conc = 0, naoConc = 0;
  const linhas = _cb.lanc.map((l, i) => {
    saldo += _cbSinal(l);
    if (l.natureza === 'C') cred += Number(l.valor); else deb += Number(l.valor);
    if (l.conciliado) conc += _cbSinal(l); else naoConc += _cbSinal(l);
    return { l, saldo, seq: i + 1 };
  });
  const busca = f.busca.toLowerCase();
  const vis = linhas.filter(({ l }) =>
    (f.status === 'todos' || (f.status === 'conc' ? l.conciliado : !l.conciliado)) &&
    (f.nat === 'todos' || l.natureza === f.nat) &&
    (!busca || [l.pessoa, l.descricao, l.detalhe, l.documento, _cbNum(l.valor)].join(' ').toLowerCase().includes(busca)));

  const tipoRot = t => (_CB_TIPOS[t] && _CB_TIPOS[t].rot) || t || '';
  // milhares de vendas por mês: a tabela mostra até 2.000 linhas por vez
  const cortou = vis.length > _CB_MAX_LINHAS;
  const trL = vis.slice(0, _CB_MAX_LINHAS).map(({ l, saldo: s, seq }) => {
    const sel = _cb.selL.has(l.id);
    const sg = sug[l.id];
    const cls = 'cbl-lin' + (l.conciliado ? ' conc' : sg ? ' sug' : '') + (sel ? ' sel' : '') + (l.id === _cb.cursor ? ' cur' : '');
    return `<tr data-id="${l.id}" class="${cls}" style="cursor:pointer" onclick="cbSelLanc('${l.id}', event)" ondblclick="cbEditar('${l.id}')">
      <td class="cbl-td"><input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation();cbSelLanc('${l.id}', event, true)"></td>
      <td class="cbl-td cbl-mut">${seq}</td>
      <td class="cbl-td" title="${_cbEsc(l.pessoa)}">${_cbEsc(l.pessoa || '')}</td>
      <td class="cbl-td cbl-mut" title="${_cbEsc(tipoRot(l.tipo) + (l.detalhe ? ' · ' + l.detalhe : ''))}">${_cbEsc(tipoRot(l.tipo))}${l.detalhe ? '<br><span style="font-size:0.66rem">' + _cbEsc(l.detalhe) + '</span>' : ''}</td>
      <td class="cbl-td" title="${_cbEsc(l.descricao)}">${_cbEsc(l.descricao || '')}${l.origem !== 'manual' ? ' <span class="cbl-tag">auto</span>' : ''}${l.editado ? ' <span class="cbl-tag">editado</span>' : ''}</td>
      <td class="cbl-td cbl-mut">${_cbEsc(l.documento || '')}</td>
      <td class="cbl-td">${_cbDt(l.data)}</td>
      <td class="cbl-td cbl-r" style="color:#4ade80">${l.natureza === 'C' ? _cbNum(l.valor) : ''}</td>
      <td class="cbl-td cbl-r" style="color:#f87171">${l.natureza === 'D' ? _cbNum(l.valor) : ''}</td>
      <td class="cbl-td cbl-r" style="color:${s >= 0 ? '#86efac' : '#fca5a5'};font-weight:600">${_cbNum(s)}</td>
      <td class="cbl-td" style="text-align:center">${l.conciliado ? '<b style="color:#facc15" title="conciliado — espaço desfaz">S</b>'
        : sg ? `<button class="cbl-mini" title="Sugestão: ${_cbEsc(sg.descricao)} ${_cbDt(sg.data)}" onclick="event.stopPropagation();cbConciliarPar('${l.id}','${sg.id}')">✓?</button>` : '<span style="color:#667">N</span>'}</td>
    </tr>`;
  }).join('');

  const trM = _cb.movs.map(m => {
    const ligados = lancPorMov[m.id] || [];
    const sel = _cb.selM === m.id;
    const bg = sel ? '#1e3a5f' : ligados.length ? '#3d3108' : m.conciliado ? '#161a22' : 'transparent';
    const v = _cbSinalMov(m);
    const st = ligados.length ? `<span style="color:#facc15" title="${_cbEsc(ligados.map(x => x.descricao).join(' | '))}">✓ ${ligados.length > 1 ? ligados.length + ' lanç.' : 'livro'}</span>`
      : m.conciliado ? '<span style="color:#889" title="conciliado fora do livro (antes de 01/07 ou por outra tela)">✓</span>'
      : `<button class="cbl-mini" onclick="event.stopPropagation();cbLancarDoBanco('${m.id}')">＋ Lançar</button>`;
    return `<tr style="background:${bg};cursor:pointer" onclick="cbSelMov('${m.id}')">
      <td class="cbl-td">${_cbDt(m.data)}</td>
      <td class="cbl-td" title="${_cbEsc(_cbInfo(m))}">${_cbEsc(m.descricao || '')}<br><span class="cbl-mut" style="font-size:0.68rem">${_cbEsc(_cbInfo(m).slice(0, 70))}</span></td>
      <td class="cbl-td cbl-mut">${_cbEsc(m.documento || '')}</td>
      <td class="cbl-td cbl-r" style="color:${v >= 0 ? '#4ade80' : '#f87171'};font-weight:600">${v >= 0 ? '+' : '−'}${_cbNum(Math.abs(v))}</td>
      <td class="cbl-td" style="text-align:center;white-space:nowrap">${st}</td>
    </tr>`;
  }).join('');

  _cb.sug = sug;
  _cb.visIds = vis.slice(0, _CB_MAX_LINHAS).map(x => x.l.id);
  if (_cb.cursor && !_cb.visIds.includes(_cb.cursor)) _cb.cursor = null;
  const nSug = Object.keys(sug).length;
  const saldoFim = saldo;
  const selSoma = _cb.lanc.filter(l => _cb.selL.has(l.id)).reduce((s, l) => s + _cbSinal(l), 0);
  const selMov = _cb.selM ? _cb.movs.find(m => m.id === _cb.selM) : null;
  const banco = _cb.saldoBanco;
  const difBanco = banco && per.fim >= _cbIso(new Date()) ? Number(banco.saldo) - saldoFim : null;

  // tela cheia: ocupa do fim do menu até o rodapé da janela
  const topo = Math.max(0, Math.round(raiz.getBoundingClientRect().top + window.scrollY));
  const rolL = document.getElementById('cb-scrL')?.scrollTop || 0, rolM = document.getElementById('cb-scrM')?.scrollTop || 0;
  raiz.innerHTML = `
  <style>
    #cb-raiz{position:fixed;left:0;right:0;bottom:0;top:${topo}px;z-index:20;background:#0b0d13;display:flex;flex-direction:column;color:#e0e0e0;font-size:0.8rem}
    .cbl-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 14px;background:#13151f;border-bottom:1px solid #2a2d3e}
    .cbl-conta{padding:6px 12px;border-radius:7px;border:1px solid #2a2d3e;background:#0f1117;color:#9aa;cursor:pointer;text-align:left;line-height:1.2}
    .cbl-conta.on{border-color:#f97316;color:#fdba74;background:#1f1a14}
    .cbl-in{padding:5px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.78rem}
    .cbl-btn{padding:6px 11px;border-radius:6px;border:1px solid #2a2d3e;background:#161a26;color:#cbd5e1;cursor:pointer;font-size:0.76rem;white-space:nowrap}
    .cbl-btn:hover{border-color:#3b82f6;color:#93c5fd}
    .cbl-btn:disabled{opacity:.4;cursor:default}
    .cbl-pane{display:flex;flex-direction:column;min-height:0;border:1px solid #2a2d3e;border-radius:8px;overflow:hidden;background:#0d1017}
    .cbl-scroll{overflow:auto;flex:1;min-height:0}
    .cbl-tab{width:100%;border-collapse:collapse;table-layout:fixed}
    .cbl-tab th{position:sticky;top:0;background:#1a1d2e;color:#94a3b8;font-weight:600;font-size:0.7rem;text-align:left;padding:6px;border-bottom:1px solid #2a2d3e;z-index:1}
    .cbl-td{padding:4px 6px;border-bottom:1px solid #161a24;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top}
    .cbl-r{text-align:right;font-variant-numeric:tabular-nums}
    .cbl-mut{color:#7c8698}
    .cbl-tag{font-size:0.6rem;padding:0 4px;border-radius:3px;background:#1f2937;color:#94a3b8}
    .cbl-mini{padding:1px 6px;border-radius:4px;border:1px solid #3a3320;background:#221d10;color:#fbbf24;cursor:pointer;font-size:0.68rem}
    .cbl-tot{display:flex;gap:6px;flex-wrap:wrap;padding:8px 14px;background:#13151f;border-top:1px solid #2a2d3e}
    .cbl-tot div{background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;padding:4px 10px;min-width:130px}
    .cbl-tot span{display:block;color:#7c8698;font-size:0.64rem;text-transform:uppercase;letter-spacing:.3px}
    .cbl-tot b{font-variant-numeric:tabular-nums}
    .cbl-lin.conc{background:#3d3108}
    .cbl-lin.conc .cbl-td{color:#fde68a}
    .cbl-lin.sug{background:#1b1830}
    .cbl-lin.sel{background:#1e3a5f}
    .cbl-lin.conc.sel{background:#5c4a0c}
    .cbl-lin.cur .cbl-td{box-shadow:inset 0 2px 0 #f97316,inset 0 -2px 0 #f97316}
    .cbl-lin.cur .cbl-td:first-child{box-shadow:inset 3px 0 0 #f97316,inset 0 2px 0 #f97316,inset 0 -2px 0 #f97316}
    .cbl-kbd{font-size:0.62rem;color:#7c8698}
    .cbl-kbd kbd{background:#1f2937;border:1px solid #334155;border-radius:3px;padding:0 4px;color:#cbd5e1;font-family:inherit}
    .cbl-menu{position:absolute;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:4px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.5)}
    .cbl-menu button{display:block;width:100%;text-align:left;padding:6px 12px;background:none;border:none;color:#cbd5e1;cursor:pointer;border-radius:5px;font-size:0.78rem}
    .cbl-menu button:hover{background:#1e293b}
  </style>
  <div id="cb-raiz">
    <div class="cbl-bar" style="justify-content:space-between">
      <b style="color:#f97316;font-size:0.95rem">🏦 Conciliação bancária</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${_cb.contas.map(c => `
        <button class="cbl-conta ${c.id === _cb.contaId ? 'on' : ''}" onclick="cbTrocarConta(${c.id})">
          ${_cbEsc(c.nome)}${c.numero ? ' <span style="color:#667">' + _cbEsc(c.numero) + '</span>' : ''}</button>`).join('')}
        <button class="cbl-btn" title="Saldo inicial da conta" onclick="cbSaldoInicial()">⚙ Saldo inicial</button>
      </div>
      <button onclick="navegarPara('empresa')" style="background:none;border:none;color:#888;font-size:1.1rem;cursor:pointer" title="Fechar">✕</button>
    </div>
    <div class="cbl-bar">
      <span class="cbl-mut">Período</span>
      <input type="date" id="cb-ini" class="cbl-in" value="${per.ini}" min="${_CB_INICIO}"> até
      <input type="date" id="cb-fim" class="cbl-in" value="${per.fim}">
      <select id="cb-st" class="cbl-in" onchange="cbFiltro()">
        <option value="todos" ${f.status === 'todos' ? 'selected' : ''}>Todos</option>
        <option value="nao" ${f.status === 'nao' ? 'selected' : ''}>Não conciliados</option>
        <option value="conc" ${f.status === 'conc' ? 'selected' : ''}>Conciliados</option></select>
      <select id="cb-nat" class="cbl-in" onchange="cbFiltro()">
        <option value="todos" ${f.nat === 'todos' ? 'selected' : ''}>Créditos e débitos</option>
        <option value="C" ${f.nat === 'C' ? 'selected' : ''}>Só créditos</option>
        <option value="D" ${f.nat === 'D' ? 'selected' : ''}>Só débitos</option></select>
      <input id="cb-busca" class="cbl-in" style="width:190px" placeholder="Pessoa, descrição, valor..." value="${_cbEsc(f.busca)}" oninput="cbFiltro(true)">
      <button class="cbl-btn" onclick="cbAplicarPeriodo()">🔍 Pesquisar</button>
      <button class="cbl-btn" onclick="_cbCarregar(true)" title="Traz de novo contas pagas e títulos recebidos">↻ Atualizar</button>
    </div>
    <div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,58fr) minmax(0,42fr);gap:10px;padding:10px 14px">
      <div class="cbl-pane">
        <div class="cbl-bar" style="border-radius:0;gap:6px">
          <b style="color:#fdba74">📒 Livro — ${_cbEsc(conta.nome)}</b>
          <span class="cbl-mut">${vis.length} de ${_cb.lanc.length}</span>
          <span class="cbl-kbd"><kbd>↑</kbd><kbd>↓</kbd> navega · <kbd>Shift</kbd> marca vários · <kbd>Espaço</kbd> concilia / desfaz</span>
          <span style="flex:1"></span>
          <button class="cbl-btn" onclick="cbMenuNovo(this)">＋ Novo ▾</button>
          <button id="cb-bt-alt" class="cbl-btn" ${_cb.selL.size === 1 ? '' : 'disabled'} onclick="cbEditar()">✏️ Alterar</button>
          <button id="cb-bt-exc" class="cbl-btn" ${_cb.selL.size ? '' : 'disabled'} onclick="cbExcluir()">🗑 Excluir</button>
          <button id="cb-bt-conc" class="cbl-btn" ${_cb.selL.size && selMov ? '' : 'disabled'} onclick="cbConciliar()" title="Liga os lançamentos marcados à linha do banco selecionada">🔗 Conciliar</button>
          <button id="cb-bt-desc" class="cbl-btn" ${_cb.lanc.some(l => _cb.selL.has(l.id) && l.conciliado) ? '' : 'disabled'} onclick="cbDesconciliar()">↩ Desconciliar</button>
          <button class="cbl-btn" ${nSug ? '' : 'disabled'} onclick="cbAprovarSugestoes()" style="${nSug ? 'border-color:#a16207;color:#fbbf24' : ''}">✓ Sugestões (${nSug})</button>
        </div>
        <div class="cbl-scroll" id="cb-scrL"><table class="cbl-tab">
          <colgroup><col style="width:26px"><col style="width:42px"><col style="width:17%"><col style="width:13%"><col><col style="width:70px"><col style="width:78px"><col style="width:86px"><col style="width:86px"><col style="width:92px"><col style="width:42px"></colgroup>
          <thead><tr><th></th><th>Seq</th><th>Pessoa</th><th>Detalhe</th><th>Descrição</th><th>Doc</th><th>Data</th><th style="text-align:right">Crédito</th><th style="text-align:right">Débito</th><th style="text-align:right">Saldo</th><th>Conc</th></tr></thead>
          <tbody>
            <tr><td class="cbl-td" colspan="9" style="color:#7c8698">Saldo anterior a ${_cbDt(per.ini)}</td><td class="cbl-td cbl-r" style="font-weight:600">${_cbNum(_cb.saldoAntes)}</td><td></td></tr>
            ${trL || '<tr><td class="cbl-td" colspan="11" style="color:#777;padding:14px">Nenhum lançamento no período.</td></tr>'}
            ${cortou ? `<tr><td class="cbl-td" colspan="11" style="color:#fbbf24;padding:10px">Mostrando as ${_CB_MAX_LINHAS} primeiras de ${vis.length} linhas — refine pelo período ou pela busca. Os totais abaixo consideram todas.</td></tr>` : ''}
          </tbody></table></div>
      </div>
      <div class="cbl-pane">
        <div class="cbl-bar" style="border-radius:0">
          <b style="color:#60a5fa">🏦 Banco — ${conta.extrato_banco ? 'extrato ' + _cbEsc(conta.nome) : 'sem extrato automático'}</b>
          <span class="cbl-mut">${_cb.movs.length} movimentos</span>
          ${selMov ? `<span style="flex:1"></span><span class="cbl-mut">selecionado: <b style="color:#e0e0e0">${_cbMoney(_cbSinalMov(selMov))}</b> · marcados no livro: <b style="color:${Math.abs(selSoma - _cbSinalMov(selMov)) < 0.005 ? '#4ade80' : '#fbbf24'}">${_cbMoney(selSoma)}</b></span>` : ''}
        </div>
        <div class="cbl-scroll" id="cb-scrM">${conta.extrato_banco ? `<table class="cbl-tab">
          <colgroup><col style="width:80px"><col><col style="width:78px"><col style="width:100px"><col style="width:76px"></colgroup>
          <thead><tr><th>Data</th><th>Descrição</th><th>Doc</th><th style="text-align:right">Valor</th><th></th></tr></thead>
          <tbody>${trM || '<tr><td class="cbl-td" colspan="5" style="color:#777;padding:14px">Sem movimentos no período.</td></tr>'}</tbody></table>`
          : `<p style="padding:18px;color:#7c8698;line-height:1.5">Esta conta não tem extrato automático. O livro ao lado é o controle dela:
             lance as entradas e saídas e informe o saldo inicial (⚙). As vendas no cartão e Pix da maquininha entram sozinhas na etapa 2.</p>`}</div>
      </div>
    </div>
    <div class="cbl-tot">
      <div><span>Saldo anterior</span><b>${_cbMoney(_cb.saldoAntes)}</b></div>
      <div><span>Créditos</span><b style="color:#4ade80">${_cbMoney(cred)}</b></div>
      <div><span>Débitos</span><b style="color:#f87171">${_cbMoney(deb)}</b></div>
      <div><span>Saldo do livro</span><b>${_cbMoney(saldoFim)}</b></div>
      <div><span>Conciliado no período</span><b style="color:#4ade80">${_cbMoney(conc)}</b></div>
      <div><span>Não conciliado</span><b style="color:${Math.abs(naoConc) > 0.004 ? '#fbbf24' : '#94a3b8'}">${_cbMoney(naoConc)}</b></div>
      ${banco ? `<div><span>Saldo no banco (${new Date(banco.consultado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</span><b>${_cbMoney(banco.saldo)}</b></div>` : ''}
      ${difBanco !== null ? `<div><span>Banco − livro</span><b style="color:${Math.abs(difBanco) < 0.01 ? '#4ade80' : '#f87171'}">${_cbMoney(difBanco)}</b></div>` : ''}
    </div>
  </div>`;
  const sL = document.getElementById('cb-scrL'), sM = document.getElementById('cb-scrM');
  if (sL) sL.scrollTop = rolL;
  if (sM) sM.scrollTop = rolM;
}

// ---------- navegação / seleção ----------
function cbTrocarConta(id) { _cb.contaId = id; _cb.selL.clear(); _cb.selM = null; _cb.cursor = null; _cbCarregar(false); }
function cbAplicarPeriodo() {
  const ini = document.getElementById('cb-ini').value, fim = document.getElementById('cb-fim').value;
  window._cbPer = { ini: ini < _CB_INICIO ? _CB_INICIO : ini, fim };
  _cb.selL.clear(); _cb.selM = null;
  _cbCarregar(false);
}
function cbFiltro(digitando) {
  _cb.filtro = { status: document.getElementById('cb-st').value, nat: document.getElementById('cb-nat').value, busca: document.getElementById('cb-busca').value };
  _cbRender();
  if (digitando) { const b = document.getElementById('cb-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
}
function cbSelLanc(id, ev, soToggle) {
  _cb.cursor = id;
  if (soToggle || (ev && (ev.ctrlKey || ev.metaKey))) { _cb.selL.has(id) ? _cb.selL.delete(id) : _cb.selL.add(id); }
  else { const so = _cb.selL.size === 1 && _cb.selL.has(id); _cb.selL.clear(); if (!so) _cb.selL.add(id); }
  _cbRender();
}
function cbSelMov(id) { _cb.selM = _cb.selM === id ? null : id; _cbRender(); }

// ---------- teclado (17/09/2026, pedido do Ronan) ----------
// ↑/↓ andam no livro (PgUp/PgDn de 20 em 20), Shift+seta marca vários,
// Espaço concilia a linha e pula para a próxima; na linha conciliada, desfaz.
function _cbRepintarSelecao() {
  document.querySelectorAll('#cb-raiz tr.cbl-lin').forEach(tr => {
    const id = tr.dataset.id;
    tr.classList.toggle('sel', _cb.selL.has(id));
    tr.classList.toggle('cur', id === _cb.cursor);
    const ck = tr.querySelector('input[type=checkbox]');
    if (ck) ck.checked = _cb.selL.has(id);
  });
  const lancs = _cb.lanc.filter(l => _cb.selL.has(l.id));
  const liga = (id, on) => { const b = document.getElementById(id); if (b) b.disabled = !on; };
  liga('cb-bt-alt', _cb.selL.size === 1);
  liga('cb-bt-exc', _cb.selL.size > 0);
  liga('cb-bt-conc', _cb.selL.size > 0 && !!_cb.selM);
  liga('cb-bt-desc', lancs.some(l => l.conciliado));
}

function _cbMostrarCursor() {
  if (!_cb.cursor) return;
  const tr = document.querySelector(`#cb-raiz tr.cbl-lin[data-id="${CSS.escape(String(_cb.cursor))}"]`);
  if (tr) tr.scrollIntoView({ block: 'nearest' });
}

function _cbMoverCursor(passo, somar) {
  const ids = _cb.visIds;
  if (!ids.length) return;
  let i = ids.indexOf(_cb.cursor);
  i = i < 0 ? (passo > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + passo));
  _cb.cursor = ids[i];
  if (!somar) _cb.selL.clear();
  _cb.selL.add(_cb.cursor);
  _cbRepintarSelecao();
  _cbMostrarCursor();
}

// Espaço: com a linha do banco selecionada (ou a sugestão única de mesmo valor)
// liga as duas; sem ela, só marca como conferido (dinheiro, conta sem extrato).
async function cbAlternarConciliado() {
  const l = _cb.lanc.find(x => x.id === _cb.cursor);
  if (!l || _cb.ocupado) return;
  _cb.ocupado = true;
  const ids = _cb.visIds, pos = ids.indexOf(l.id);
  try {
    if (l.conciliado) {
      await _cbDesligar([l]);
    } else {
      const mov = (_cb.selM && _cb.movs.find(m => m.id === _cb.selM)) || _cb.sug[l.id] || null;
      if (mov) {
        await _cbLigar([l], mov);
        l.banco_mov_id = mov.id; mov.conciliado = true;
        _cb.selM = null;
      } else {
        const { error } = await sb.from('oct_fin_lancamentos').update({ conciliado: true, atualizado_em: new Date().toISOString() }).eq('id', l.id);
        if (error) throw error;
      }
      l.conciliado = true;
      // pula para a próxima linha (na lista "não conciliados" a atual some)
      const prox = ids[pos + 1] || null;
      if (prox) _cb.cursor = prox;
    }
  } catch (e) {
    alert('Erro: ' + (e.message || e));
  } finally {
    _cb.ocupado = false;
  }
  _cb.selL.clear();
  if (_cb.cursor) _cb.selL.add(_cb.cursor);
  _cbRender();
  _cbMostrarCursor();
}

if (!window._cbTeclado) {
  window._cbTeclado = true;
  document.addEventListener('keydown', ev => {
    if (!document.getElementById('cb-raiz') || document.getElementById('cb-modal') || document.getElementById('cb-menu')) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const t = ev.target;
    const campo = t && (t.isContentEditable || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' ||
      (t.tagName === 'INPUT' && t.type !== 'checkbox'));
    if (campo) return;
    const passo = { ArrowDown: 1, ArrowUp: -1, PageDown: 20, PageUp: -20 }[ev.key];
    if (passo) { ev.preventDefault(); _cbMoverCursor(passo, ev.shiftKey); return; }
    if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) t.blur();   // espaço não "clica" o botão/checkbox focado
      if (!_cb.cursor && _cb.visIds.length) { _cbMoverCursor(1); return; }
      cbAlternarConciliado();
    }
  });
}

// ---------- conciliar ----------
async function _cbLigar(lancs, mov) {
  const autor = await _cbAutor();
  for (const l of lancs) {
    const { error } = await sb.from('oct_fin_lancamentos').update({ conciliado: true, banco_mov_id: mov.id, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    if (error) throw error;
    // título pago: o comprovante também fica no próprio título (robô e B.I usam)
    if (l.origem === 'contas_pagar' && lancs.length === 1) {
      await sb.from('oct_banco_movimentos').update({ conta_pagar_id: null, conciliado: false }).eq('conta_pagar_id', l.origem_id).neq('id', mov.id);
      await sb.from('oct_banco_movimentos').update({ conciliado: true, conta_pagar_id: l.origem_id }).eq('id', mov.id);
    }
  }
  if (!(lancs.length === 1 && lancs[0].origem === 'contas_pagar'))
    await sb.from('oct_banco_movimentos').update({ conciliado: true }).eq('id', mov.id);
  console.info('conciliado por', autor, lancs.map(l => l.id), '→', mov.id);
}

async function cbConciliar() {
  const lancs = _cb.lanc.filter(l => _cb.selL.has(l.id));
  const mov = _cb.movs.find(m => m.id === _cb.selM);
  if (!lancs.length || !mov) return;
  if (lancs.some(l => l.conciliado)) { alert('Há lançamento já conciliado na seleção — desconcilie antes.'); return; }
  const soma = lancs.reduce((s, l) => s + _cbSinal(l), 0);
  const dif = Math.round((_cbSinalMov(mov) - soma) * 100) / 100;
  if (Math.abs(dif) >= 0.01 && !confirm(`Os ${lancs.length} lançamento(s) somam ${_cbMoney(soma)} e o banco mostra ${_cbMoney(_cbSinalMov(mov))} (diferença ${_cbMoney(dif)}). Conciliar mesmo assim?`)) return;
  try { await _cbLigar(lancs, mov); } catch (e) { alert('Erro: ' + (e.message || e)); return; }
  _cb.selL.clear(); _cb.selM = null;
  _cbCarregar(false);
}

async function cbConciliarPar(lancId, movId) {
  const l = _cb.lanc.find(x => x.id === lancId), m = _cb.movs.find(x => x.id === movId);
  if (!l || !m) return;
  try { await _cbLigar([l], m); } catch (e) { alert('Erro: ' + (e.message || e)); return; }
  _cbCarregar(false);
}

async function cbAprovarSugestoes() {
  const sug = _cbSugestoes();
  const pares = Object.entries(sug);
  if (!pares.length || !confirm(`Conciliar ${pares.length} lançamento(s) com a linha do banco de mesmo valor (até 3 dias de diferença)?`)) return;
  try {
    for (const [lid, m] of pares) await _cbLigar([_cb.lanc.find(l => l.id === lid)], m);
  } catch (e) { alert('Erro: ' + (e.message || e)); }
  _cbCarregar(false);
}

async function _cbDesligar(lancs) {
  const ids = new Set(lancs.map(l => l.id));
  for (const l of lancs) {
    const { error } = await sb.from('oct_fin_lancamentos').update({ conciliado: false, banco_mov_id: null, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    if (error) throw error;
    if (l.banco_mov_id) {
      const outros = _cb.lanc.filter(x => x.banco_mov_id === l.banco_mov_id && !ids.has(x.id));
      if (!outros.length) {
        await sb.from('oct_banco_movimentos').update({ conciliado: false, conta_pagar_id: null }).eq('id', l.banco_mov_id);
        const m = _cb.movs.find(x => x.id === l.banco_mov_id);
        if (m) { m.conciliado = false; m.conta_pagar_id = null; }
      }
    }
    l.conciliado = false; l.banco_mov_id = null;
  }
}

async function cbDesconciliar() {
  const lancs = _cb.lanc.filter(l => _cb.selL.has(l.id) && l.conciliado);
  if (!lancs.length || !confirm(`Desfazer a conciliação de ${lancs.length} lançamento(s)? O lançamento continua no livro.`)) return;
  try { await _cbDesligar(lancs); } catch (e) { alert('Erro: ' + (e.message || e)); }
  _cb.selL.clear();
  _cbCarregar(false);
}

// ---------- lançar / alterar / excluir ----------
async function _cbAutor() {
  try { const s = await getSession(); return (s && s.user && (s.user.email || s.user.id)) || null; } catch (e) { return null; }
}

function cbMenuNovo(btn) {
  document.getElementById('cb-menu')?.remove();
  const r = btn.getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'cb-menu'; m.className = 'cbl-menu';
  m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.style.position = 'fixed';
  m.innerHTML = ['despesa_financeira', 'receita_financeira', 'despesa_adm', 'receita_adm', 'saque', 'deposito', 'transferencia']
    .map(t => `<button onclick="document.getElementById('cb-menu').remove();cbAbrirForm({tipo:'${t}'})">${_CB_TIPOS[t].rot}</button>`).join('');
  document.body.appendChild(m);
  setTimeout(() => document.addEventListener('click', function fecha(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', fecha); } }), 0);
}

// Lançar a partir da linha do banco: já nasce conciliado com ela
async function cbLancarDoBanco(movId) {   // eslint: async por causa dos títulos
  const m = _cb.movs.find(x => x.id === movId);
  if (!m) return;
  const info = _cbInfo(m).toUpperCase();
  const deb = m.tipo === 'debito';
  const interno = /MESMA TIT|FAV\.: SN |REM\.: SN /.test(info);
  const pessoa = (_cbInfo(m).split(' · ').find(p => /[A-Za-z]{3}/.test(p) && !/Pagamento Pix|Recebimento Pix|Transfer/i.test(p)) || '').replace(/^(FAV|REM)\.: /, '');
  // débito: oferece baixar um título em aberto (o mais parecido primeiro)
  let titulos = [];
  if (deb && !interno) {
    const { data } = await sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento,competencia,observacoes')
      .eq('empresa_id', _cb.eid).eq('status', 'aberto').lte('competencia', m.data).order('vencimento').limit(500);
    titulos = (data || []).map(c => Object.assign(c, { dif: Math.round((Number(m.valor) - Number(c.valor)) * 100) / 100 }))
      .sort((a, b) => Math.abs(a.dif) - Math.abs(b.dif)).slice(0, 40);
  }
  cbAbrirForm({
    tipo: interno ? 'transferencia' : deb ? 'despesa_adm' : 'receita_adm',
    natureza: deb ? 'D' : 'C', valor: Number(m.valor), data: m.data, pessoa,
    descricao: m.descricao, documento: m.documento && m.documento !== 'Pix' ? m.documento : '', movId, titulos,
  });
}

// TARIFA x JUROS: tarifa só com certeza (R$ 3,72 exato ou pago até o vencimento)
function _cbClassificaEncargo(dif, vencimento, dataPgto) {
  if (!(dif > 0.004)) return { juros: 0, tarifa: 0 };
  const d = Math.round(dif * 100) / 100;
  if (Math.abs(d - CB_TARIFA_BOLETO) < 0.015) return { juros: 0, tarifa: d };
  const v = Date.parse(String(vencimento || '').slice(0, 10));
  const p = Date.parse(String(dataPgto || '').slice(0, 10));
  if (v && p && p <= v) return { juros: 0, tarifa: d };
  return { juros: d, tarifa: 0 };
}

// baixa o título com o débito do banco: vale o que SAIU DA CONTA, encargo no
// próprio título, observação acrescentada (nunca apagada — a chave da NF mora lá)
async function cbBaixarTitulo() {
  const d = window._cbForm || {};
  const id = document.getElementById('cbf-titulo').value;
  const m = _cb.movs.find(x => x.id === d.movId);
  if (!id || !m) return;
  const { data: c } = await sb.from('oct_contas_pagar').select('*').eq('id', id).single();
  if (!c || c.status !== 'aberto') { alert('O título mudou — recarregando.'); _cbCarregar(false); return; }
  const dif = Math.round((Number(m.valor) - Number(c.valor)) * 100) / 100;
  const enc = _cbClassificaEncargo(dif, c.vencimento, m.data);
  const rot = enc.tarifa > 0 ? ` + tarifa R$ ${_cbNum(enc.tarifa)}` : enc.juros > 0 ? ` + juros R$ ${_cbNum(enc.juros)}` : dif < 0 ? ` − desconto R$ ${_cbNum(-dif)}` : '';
  if (!confirm(`Baixar "${c.descricao}" (${_cbMoney(c.valor)}) com o débito de ${_cbMoney(m.valor)} de ${_cbDt(m.data)}${rot}?`)) return;
  const obs = `conciliação na tela — pagamento de ${_cbMoney(m.valor)} em ${m.data} (mov ${m.id})${rot}`;
  const { error } = await sb.from('oct_contas_pagar').update({
    status: 'pago', data_pagamento: m.data, valor_pago: Number(m.valor),
    juros: enc.juros, tarifa: enc.tarifa, desconto: dif < 0 ? -dif : 0, forma_pagamento: 'Sicoob',
    observacoes: (c.observacoes ? c.observacoes + ' | ' : '') + obs,
  }).eq('id', id).eq('status', 'aberto');
  if (error) { alert('Erro: ' + error.message); return; }
  await sb.from('oct_banco_movimentos').update({ conciliado: true, conta_pagar_id: id, dif_encargos: dif || null }).eq('id', m.id);
  document.getElementById('cb-modal')?.remove();
  _cb.selL.clear(); _cb.selM = null;
  _cbCarregar(true);   // a sincronização põe o pagamento no livro, já conciliado
}

function cbEditar(id) {
  const lid = id || [..._cb.selL][0];
  const l = _cb.lanc.find(x => x.id === lid);
  if (!l) return;
  cbAbrirForm(Object.assign({}, l, { editar: true }));
}

async function cbAbrirForm(d) {
  document.getElementById('cb-modal')?.remove();
  const conta = _cbConta();
  const auto = d.editar && d.origem !== 'manual';
  const transf = ['transferencia', 'saque', 'deposito'].includes(d.tipo) && !d.editar;
  let planos = window._cbPlanos;
  if (!planos) {
    const { data } = await sb.from('oct_plano_contas').select('id,codigo,descricao,subtipo').eq('empresa_id', _cb.eid).eq('ativo', true).order('codigo');
    planos = window._cbPlanos = (data || []).filter(p => !p.subtipo || p.subtipo === 'analitica');
  }
  // saque/depósito: contas sugeridas (banco ↔ caixa)
  const caixa = _cb.contas.find(c => c.tipo === 'caixa');
  let origem = conta.id, destino = (_cb.contas.find(c => c.id !== conta.id) || conta).id;
  if (d.tipo === 'saque' && caixa) { destino = caixa.id; if (conta.id === caixa.id) origem = (_cb.contas.find(c => c.tipo !== 'caixa') || conta).id; }
  if (d.tipo === 'deposito' && caixa) { origem = caixa.id; if (conta.id === caixa.id) destino = (_cb.contas.find(c => c.tipo !== 'caixa') || conta).id; }
  if (d.movId && d.tipo === 'transferencia') {           // do banco: esta conta é o lado da linha
    if (d.natureza === 'C') { destino = conta.id; origem = (_cb.contas.find(c => c.id !== conta.id) || conta).id; }
    else { origem = conta.id; destino = (_cb.contas.find(c => c.id !== conta.id) || conta).id; }
  }
  const optContas = sel => _cb.contas.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${_cbEsc(c.nome)}</option>`).join('');
  const optTipos = Object.entries(_CB_TIPOS).filter(([k]) => d.editar || !['pagamento_titulo', 'recebimento_titulo', 'ajuste'].includes(k))
    .map(([k, v]) => `<option value="${k}" ${k === d.tipo ? 'selected' : ''}>${v.rot}</option>`).join('');
  const nat = d.natureza || (_CB_TIPOS[d.tipo] && _CB_TIPOS[d.tipo].nat) || 'D';
  const bloq = auto ? 'disabled title="Vem de outra tela — altere na origem"' : '';
  const campo = (rot, html, span) => `<label style="display:flex;flex-direction:column;gap:3px;${span ? 'grid-column:span ' + span : ''}"><span class="cbl-mut" style="font-size:0.7rem">${rot}</span>${html}</label>`;

  const div = document.createElement('div');
  div.id = 'cb-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `<div id="cb-modal-cx" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:12px;width:640px;max-width:95%;padding:18px;color:#e0e0e0;font-size:0.82rem">
    <div id="cb-modal-tit" style="display:flex;justify-content:space-between;margin-bottom:12px;cursor:move">
      <b style="color:#f97316">${d.editar ? '✏️ Alterar lançamento' : d.movId ? '＋ Lançar a partir do banco' : '＋ Novo lançamento'}</b>
      <button onclick="document.getElementById('cb-modal').remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:1.1rem">✕</button></div>
    ${auto ? `<p style="color:#fbbf24;font-size:0.74rem;margin:0 0 10px">Lançamento automático (${d.origem === 'contas_pagar' ? 'Contas a pagar' : 'título recebido'}): valor, data e natureza vêm da origem.</p>` : ''}
    ${d.movId ? `<p style="color:#93c5fd;font-size:0.74rem;margin:0 0 10px">Vai nascer conciliado com a linha do banco de ${_cbDt(d.data)} · ${_cbMoney((d.natureza === 'D' ? -1 : 1) * d.valor)}.</p>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      ${campo('Tipo', `<select id="cbf-tipo" class="cbl-in" ${auto ? 'disabled' : ''} onchange="cbFormTipo()">${optTipos}</select>`, 2)}
      ${campo('Data', `<input id="cbf-data" type="date" class="cbl-in" value="${d.data || _cbIso(new Date())}" ${bloq}>`)}
      <div id="cbf-simples" style="display:${transf ? 'none' : 'contents'}">
        ${campo('Conta', `<select id="cbf-conta" class="cbl-in">${optContas(d.conta_id || conta.id)}</select>`)}
        ${campo('Natureza', `<select id="cbf-nat" class="cbl-in" ${bloq}><option value="C" ${nat === 'C' ? 'selected' : ''}>Crédito (entrada)</option><option value="D" ${nat === 'D' ? 'selected' : ''}>Débito (saída)</option></select>`)}
      </div>
      <div id="cbf-transf" style="display:${transf ? 'contents' : 'none'}">
        ${campo('Sai da conta', `<select id="cbf-origem" class="cbl-in">${optContas(origem)}</select>`)}
        ${campo('Entra na conta', `<select id="cbf-destino" class="cbl-in">${optContas(destino)}</select>`)}
      </div>
      ${campo('Valor (R$)', `<input id="cbf-valor" type="number" step="0.01" min="0" class="cbl-in" value="${d.valor || ''}" ${bloq}>`)}
      ${campo('Pessoa', `<input id="cbf-pessoa" class="cbl-in" value="${_cbEsc(d.pessoa || '')}">`, 2)}
      ${campo('Documento', `<input id="cbf-doc" class="cbl-in" value="${_cbEsc(d.documento || '')}">`)}
      ${campo('Descrição', `<input id="cbf-desc" class="cbl-in" value="${_cbEsc(d.descricao || '')}">`, 3)}
      ${campo('Detalhe', `<input id="cbf-det" class="cbl-in" value="${_cbEsc(d.detalhe || '')}">`, 2)}
      ${campo('Plano de contas', `<select id="cbf-plano" class="cbl-in"><option value="">—</option>${planos.map(p => `<option value="${p.id}" ${p.id === d.plano_conta_id ? 'selected' : ''}>${_cbEsc(p.codigo + ' ' + p.descricao)}</option>`).join('')}</select>`)}
    </div>
    ${d.titulos && d.titulos.length ? `<div style="margin-top:12px;padding:10px;border:1px solid #2a3a2a;border-radius:8px;background:#0f1a12">
      <div class="cbl-mut" style="font-size:0.72rem;margin-bottom:6px">…ou este débito é o pagamento de um título em aberto?</div>
      <div style="display:flex;gap:8px"><select id="cbf-titulo" class="cbl-in" style="flex:1">${d.titulos.map(t => `<option value="${t.id}">${_cbEsc(t.descricao)} · venc ${_cbDt(t.vencimento)} · ${_cbMoney(t.valor)} · ${t.dif === 0 ? 'exato' : (t.dif > 0 ? '+' : '') + _cbNum(t.dif)}</option>`).join('')}</select>
      <button class="cbl-btn" style="border-color:#2f6f3f;color:#86efac" onclick="cbBaixarTitulo()">✓ Baixar título</button></div></div>` : ''}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <span id="cbf-msg" style="flex:1;color:#f87171;font-size:0.76rem;align-self:center"></span>
      <button class="cbl-btn" onclick="document.getElementById('cb-modal').remove()">Cancelar</button>
      <button class="cbl-btn" style="background:#1f6f43;border-color:#1f6f43;color:#fff" onclick="cbSalvarForm()">💾 Salvar</button>
    </div></div>`;
  document.body.appendChild(div);
  window._cbForm = d;
  if (typeof octArrastavel === 'function') octArrastavel(document.getElementById('cb-modal-cx'), document.getElementById('cb-modal-tit'));
}

function cbFormTipo() {
  const d = window._cbForm || {};
  const t = document.getElementById('cbf-tipo').value;
  const transf = ['transferencia', 'saque', 'deposito'].includes(t) && !d.editar;
  document.getElementById('cbf-simples').style.display = transf ? 'none' : 'contents';
  document.getElementById('cbf-transf').style.display = transf ? 'contents' : 'none';
  const n = _CB_TIPOS[t] && _CB_TIPOS[t].nat;
  if (n && !d.movId) document.getElementById('cbf-nat').value = n;
}

async function cbSalvarForm() {
  const d = window._cbForm || {};
  const g = id => document.getElementById(id);
  const msg = t => { g('cbf-msg').textContent = t; };
  const tipo = g('cbf-tipo').value;
  const valor = Math.round(Number(g('cbf-valor').value) * 100) / 100;
  const data = g('cbf-data').value;
  if (!(valor > 0)) return msg('Informe o valor.');
  if (!data) return msg('Informe a data.');
  if (data < _CB_INICIO) return msg('O livro começa em 01/07/2026.');
  const comum = {
    empresa_id: _cb.eid, data, valor, tipo,
    pessoa: g('cbf-pessoa').value.trim() || null, descricao: g('cbf-desc').value.trim() || null,
    detalhe: g('cbf-det').value.trim() || null, documento: g('cbf-doc').value.trim() || null,
    plano_conta_id: g('cbf-plano').value || null, atualizado_em: new Date().toISOString(),
  };
  const transf = ['transferencia', 'saque', 'deposito'].includes(tipo) && !d.editar;
  try {
    if (d.editar) {
      const patch = d.origem !== 'manual'
        ? { conta_id: Number(g('cbf-conta').value), pessoa: comum.pessoa, descricao: comum.descricao, detalhe: comum.detalhe, documento: comum.documento, plano_conta_id: comum.plano_conta_id, editado: true, atualizado_em: comum.atualizado_em }
        : Object.assign({}, comum, { conta_id: Number(g('cbf-conta').value), natureza: g('cbf-nat').value });
      const { error } = await sb.from('oct_fin_lancamentos').update(patch).eq('id', d.id);
      if (error) throw error;
      if (d.transferencia_id && d.origem === 'manual') {   // a outra perna acompanha valor/data/descrição
        await sb.from('oct_fin_lancamentos').update({ valor, data, descricao: comum.descricao, atualizado_em: comum.atualizado_em })
          .eq('transferencia_id', d.transferencia_id).neq('id', d.id);
      }
    } else if (transf) {
      const o = Number(g('cbf-origem').value), de = Number(g('cbf-destino').value);
      if (o === de) return msg('Escolha contas diferentes.');
      const tid = (crypto.randomUUID && crypto.randomUUID()) || null;
      const nomeO = (_cb.contas.find(c => c.id === o) || {}).nome, nomeD = (_cb.contas.find(c => c.id === de) || {}).nome;
      const autor = await _cbAutor();
      const pernas = [
        Object.assign({}, comum, { conta_id: o, natureza: 'D', transferencia_id: tid, autor, descricao: comum.descricao || `${_CB_TIPOS[tipo].rot.split(' (')[0].toUpperCase()} PARA ${nomeD}` }),
        Object.assign({}, comum, { conta_id: de, natureza: 'C', transferencia_id: tid, autor, descricao: comum.descricao || `${_CB_TIPOS[tipo].rot.split(' (')[0].toUpperCase()} DE ${nomeO}` }),
      ];
      if (d.movId) { const lado = pernas.find(p => p.conta_id === _cb.contaId); if (lado) { lado.conciliado = true; lado.banco_mov_id = d.movId; } }
      const { error } = await sb.from('oct_fin_lancamentos').insert(pernas);
      if (error) throw error;
      if (d.movId) await sb.from('oct_banco_movimentos').update({ conciliado: true }).eq('id', d.movId);
    } else {
      const novo = Object.assign({}, comum, { conta_id: Number(g('cbf-conta').value), natureza: g('cbf-nat').value, autor: await _cbAutor() });
      if (d.movId) { novo.conciliado = true; novo.banco_mov_id = d.movId; }
      const { error } = await sb.from('oct_fin_lancamentos').insert(novo);
      if (error) throw error;
      if (d.movId) await sb.from('oct_banco_movimentos').update({ conciliado: true }).eq('id', d.movId);
    }
  } catch (e) { return msg('Erro: ' + (e.message || e)); }
  g('cb-modal').remove();
  _cb.selL.clear(); _cb.selM = null;
  _cbCarregar(false);
}

async function cbExcluir() {
  const lancs = _cb.lanc.filter(l => _cb.selL.has(l.id));
  if (!lancs.length) return;
  if (lancs.some(l => l.conciliado)) { alert('Desconcilie antes de excluir.'); return; }
  const autos = lancs.filter(l => l.origem !== 'manual').length;
  if (!confirm(`Excluir ${lancs.length} lançamento(s)?` + (autos ? `\n${autos} vem(vêm) de Contas a pagar / títulos: some(m) do livro, mas o título continua como está na origem.` : '') +
    (lancs.some(l => l.transferencia_id) ? '\nTransferência: as duas pernas são excluídas.' : ''))) return;
  for (const l of lancs) {
    if (l.origem !== 'manual') await sb.from('oct_fin_lancamentos').update({ excluido: true, atualizado_em: new Date().toISOString() }).eq('id', l.id);
    else if (l.transferencia_id) await sb.from('oct_fin_lancamentos').delete().eq('transferencia_id', l.transferencia_id).eq('conciliado', false);
    else await sb.from('oct_fin_lancamentos').delete().eq('id', l.id);
  }
  _cb.selL.clear();
  _cbCarregar(false);
}

async function cbSaldoInicial() {
  const c = _cbConta();
  const v = prompt(`Saldo de "${c.nome}" no INÍCIO do dia ${_cbDt(c.saldo_inicial_em || _CB_INICIO)} (R$):`, String(c.saldo_inicial || 0).replace('.', ','));
  if (v === null) return;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n)) { alert('Valor inválido.'); return; }
  const { error } = await sb.from('oct_fin_contas').update({ saldo_inicial: n, saldo_inicial_em: c.saldo_inicial_em || _CB_INICIO }).eq('id', c.id);
  if (error) { alert('Erro: ' + error.message); return; }
  _cbCarregar(false);
}
