// ============================================================
// REQUISIÇÕES DE COMPRA — fase 1 (13/10/2026, pedido do Ronan)
// ------------------------------------------------------------
// Toda compra de MERCADORIA (combustível, lubrificante, loja) é lançada aqui quando é feita. O título a
// pagar (Contas a pagar) é ligado à requisição e só é "liberado" quando a mercadoria chega ao posto.
// Objetivo: não pagar sem a mercadoria no posto e não pagar em duplicidade.
//
//   pedida -> (parcial) -> recebida -> paga          (+ divergente / cancelada)
//
// ALERTA, NÃO BLOQUEIO (decisão do Ronan): baixar título de requisição ainda não recebida é possível,
// mas pede MOTIVO e fica no histórico; a requisição segue "paga e ainda não chegou" até a chegada.
// Tabelas: repo/sql/SQL-REQUISICAO-COMPRA.sql. O Contas a pagar usa rqMapaDosTitulos /
// rqPrepararAlertaPagamento / rqValidarPagamento / rqRegistrarPagamento (definidas aqui embaixo).
// ============================================================

const RQ_STATUS = {
  pedida:     { rot: 'Aguardando chegada', cor: '#fbbf24', bg: '#2a1a00' },
  parcial:    { rot: 'Chegou em parte',    cor: '#60a5fa', bg: '#10243a' },
  recebida:   { rot: 'Recebida',           cor: '#4ade80', bg: '#12301a' },
  divergente: { rot: 'Divergente',         cor: '#fb923c', bg: '#3a1e0a' },
  paga:       { rot: 'Paga',               cor: '#9ca3af', bg: '#1d2230' },
  cancelada:  { rot: 'Cancelada',          cor: '#6b7280', bg: '#1a1d26' },
};
const RQ_CATEGORIAS = { combustivel: 'Combustível', lubrificante: 'Lubrificante', loja: 'Loja / conveniência', outros: 'Outra mercadoria' };
const RQ_FORMAS = ['Boleto', 'PIX', 'TED/DOC', 'Cartão', 'Dinheiro', 'A combinar'];
const RQ_PENDENTES = ['pedida', 'parcial', 'divergente'];
const RQ_INPUT = 'background:#0f1117;color:#e0e0e0;border:1px solid #2a2d3e;border-radius:6px;padding:8px 10px;font-size:0.88rem;width:100%;box-sizing:border-box';

let _rq = { empresaId: null, lista: [], titulos: {}, filtro: 'abertas', busca: '', itensForm: 0 };

// ---------------- utilitários ----------------
function rqEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rqBRL(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function rqQtd(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }); }
function rqCent(v) { return Math.round((Number(v) || 0) * 100); }
function rqNumero(n) { return 'REQ-' + String(n || 0).padStart(6, '0'); }
function rqData(d) { return d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'; }
function rqQuando(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function rqHojeISO() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function rqSomaDias(iso, dias) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }
function rqDiasEntre(a, b) { return Math.abs(Math.round((new Date(String(a).slice(0, 10) + 'T12:00:00') - new Date(String(b).slice(0, 10) + 'T12:00:00')) / 864e5)); }

// ---------------- regras (funções puras: testadas no V8) ----------------
// Estado da requisição pelo que CHEGOU. divergenciaManual: o operador marcou "chegou diferente do pedido".
function rqStatusPeloRecebimento(itens, divergenciaManual) {
  const tol = 0.0005;
  const l = (itens || []);
  if (!l.length) return 'pedida';
  const excesso = l.some(i => Number(i.qtd_recebida || 0) > Number(i.qtd_pedida || 0) + tol);
  if (divergenciaManual || excesso) return 'divergente';
  if (l.every(i => Number(i.qtd_recebida || 0) <= tol)) return 'pedida';
  if (l.every(i => Number(i.qtd_recebida || 0) >= Number(i.qtd_pedida || 0) - tol)) return 'recebida';
  return 'parcial';
}
function rqPendente(status) { return RQ_PENDENTES.includes(status); }

// Possíveis duplicidades de uma requisição nova contra requisições e títulos já existentes (mesmo fornecedor).
// nova: { id?, fornecedor_id, valor_total, documento, vencimento_previsto }
function rqDuplicatas(nova, requisicoes, titulos, hojeISO) {
  const hoje = hojeISO || rqHojeISO();
  const achados = [];
  const v = rqCent(nova.valor_total);
  const doc = String(nova.documento || '').trim().toLowerCase();
  const mesmoValor = x => Math.abs(rqCent(x) - v) <= 2;
  (requisicoes || []).forEach(r => {
    if (!r || r.status === 'cancelada' || (nova.id && r.id === nova.id)) return;
    if (!nova.fornecedor_id || r.fornecedor_id !== nova.fornecedor_id) return;
    if (doc && String(r.documento || '').trim().toLowerCase() === doc) {
      achados.push({ tipo: 'requisicao', forte: true, motivo: 'mesmo fornecedor e mesmo documento', ref: rqNumero(r.numero), valor: Number(r.valor_total), data: String(r.criado_em || '').slice(0, 10), status: r.status });
    } else if (mesmoValor(r.valor_total) && rqDiasEntre(String(r.criado_em || hoje).slice(0, 10), hoje) <= 20) {
      achados.push({ tipo: 'requisicao', forte: false, motivo: 'mesmo fornecedor e mesmo valor nos últimos 20 dias', ref: rqNumero(r.numero), valor: Number(r.valor_total), data: String(r.criado_em || '').slice(0, 10), status: r.status });
    }
  });
  (titulos || []).forEach(t => {
    if (!t || !nova.fornecedor_id || t.fornecedor_id !== nova.fornecedor_id) return;
    if (t.requisicao_id && nova.id && t.requisicao_id === nova.id) return;
    const docT = String(t.n_documento || '').trim().toLowerCase();
    const ref = 'título ' + (t.n_documento || String(t.id || '').slice(0, 8));
    const quando = t.status === 'pago' ? (t.data_pagamento || t.vencimento) : t.vencimento;
    if (doc && docT && (docT === doc || docT.split('/')[0] === doc)) {
      achados.push({ tipo: 'titulo', forte: true, motivo: 'título do mesmo fornecedor com o mesmo documento (' + (t.status === 'pago' ? 'JÁ PAGO' : 'em aberto') + ')', ref, valor: Number(t.valor), data: String(quando || '').slice(0, 10), status: t.status });
    } else if (mesmoValor(t.valor) && quando && rqDiasEntre(String(quando).slice(0, 10), nova.vencimento_previsto || hoje) <= 30) {
      achados.push({ tipo: 'titulo', forte: false, motivo: 'título do mesmo fornecedor com o mesmo valor (' + (t.status === 'pago' ? 'já pago' : 'em aberto') + ')', ref, valor: Number(t.valor), data: String(quando || '').slice(0, 10), status: t.status });
    }
  });
  return achados.sort((a, b) => (b.forte ? 1 : 0) - (a.forte ? 1 : 0));
}

// ---------------- tela principal ----------------
async function moduloRequisicoes() {
  const c = document.getElementById('conteudo');
  c.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const empresaId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!empresaId) { c.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  _rq.empresaId = empresaId;
  const r = await sb.from('oct_requisicoes_compra').select('*').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(1500);
  if (r.error) {
    const semTabela = /relation|does not exist|schema cache/i.test(r.error.message || '');
    c.innerHTML = '<div style="padding:24px;color:' + (semTabela ? '#fbbf24' : '#f44') + '">' +
      (semTabela ? '⚠ As tabelas de requisição ainda não existem. Rode <b>repo/sql/SQL-REQUISICAO-COMPRA.sql</b> no SQL Editor do Supabase e abra de novo.'
                 : 'Erro ao carregar: ' + rqEsc(r.error.message)) + '</div>';
    return;
  }
  _rq.lista = r.data || [];
  _rq.titulos = {};
  const ids = _rq.lista.map(x => x.id);
  if (ids.length) {
    try {
      const t = await sb.from('oct_contas_pagar').select('id,requisicao_id,valor,status,vencimento,n_documento,data_pagamento').in('requisicao_id', ids.slice(0, 400));
      (t.data || []).forEach(x => { (_rq.titulos[x.requisicao_id] = _rq.titulos[x.requisicao_id] || []).push(x); });
    } catch (e) { /* coluna ainda não existe: segue sem os títulos */ }
  }
  rqRender();
}

function rqFiltrar(l) {
  const q = (_rq.busca || '').trim().toLowerCase();
  let r = l;
  const f = _rq.filtro;
  if (f === 'abertas') r = r.filter(x => rqPendente(x.status));
  else if (f === 'recebidas') r = r.filter(x => x.status === 'recebida');
  else if (f === 'pagas_sem_chegar') r = r.filter(x => rqPendente(x.status) && x.pago_em);
  else if (f === 'pagas') r = r.filter(x => x.status === 'paga');
  else if (f === 'canceladas') r = r.filter(x => x.status === 'cancelada');
  if (q) r = r.filter(x => [x.fornecedor_nome, x.descricao, x.documento, rqNumero(x.numero)].join(' ').toLowerCase().includes(q));
  return r;
}

function rqRender() {
  const c = document.getElementById('conteudo');
  const L = _rq.lista;
  const soma = a => a.reduce((s, x) => s + Number(x.valor_total || 0), 0);
  const aguard = L.filter(x => rqPendente(x.status) && !x.pago_em);
  const semChegar = L.filter(x => rqPendente(x.status) && x.pago_em);
  const recebidas = L.filter(x => x.status === 'recebida');
  const mes = rqHojeISO().slice(0, 7);
  const pagasMes = L.filter(x => x.status === 'paga' && String(x.pago_em || '').slice(0, 7) === mes);
  const card = (id, titulo, a, cor, dica) =>
    '<div onclick="rqFiltro(\'' + id + '\')" title="' + rqEsc(dica) + '" style="cursor:pointer;flex:1;min-width:170px;background:#13151f;border:1px solid ' + (_rq.filtro === id ? cor : '#2a2d3e') + ';border-radius:10px;padding:12px 14px">' +
    '<div style="font-size:0.74rem;color:#888">' + titulo + '</div>' +
    '<div style="font-size:1.35rem;font-weight:800;color:' + cor + '">' + a.length + '</div>' +
    '<div style="font-size:0.8rem;color:#9aa">R$ ' + rqBRL(soma(a)) + '</div></div>';
  const lista = rqFiltrar(L);
  const tabs = [['abertas', 'Em aberto'], ['pagas_sem_chegar', '⚠ Pagas sem chegar'], ['recebidas', 'Recebidas'], ['pagas', 'Pagas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']];
  c.innerHTML =
    '<div class="og-janela">' +
      '<div class="og-titulo"><span>📋 Requisições de compra</span><button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button></div>' +
      '<div class="og-toolbar">' +
        '<button class="og-tb-btn" onclick="rqNova()"><div class="og-tb-ico">＋</div><div>Lançar</div></button>' +
        '<button class="og-tb-btn" onclick="moduloRequisicoes()"><div class="og-tb-ico">↻</div><div>Atualizar</div></button>' +
      '</div>' +
      '<div style="padding:12px 14px">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
          card('abertas', 'Aguardando chegada', aguard, '#fbbf24', 'Pedidas que ainda não chegaram (e ainda não foram pagas)') +
          card('pagas_sem_chegar', '⚠ Pagas e não chegaram', semChegar, '#f87171', 'Alguém baixou o título com a mercadoria ainda fora do posto') +
          card('recebidas', 'Recebidas — liberadas p/ pagar', recebidas, '#4ade80', 'Chegaram e ainda não foram pagas') +
          card('pagas', 'Pagas no mês', pagasMes, '#9ca3af', 'Chegaram e foram pagas neste mês') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
          tabs.map(t => '<button onclick="rqFiltro(\'' + t[0] + '\')" style="padding:5px 12px;border-radius:14px;border:1px solid ' + (_rq.filtro === t[0] ? '#f97316' : '#2a2d3e') + ';background:' + (_rq.filtro === t[0] ? '#2a1a0a' : 'transparent') + ';color:' + (_rq.filtro === t[0] ? '#f97316' : '#9aa') + ';cursor:pointer;font-size:0.78rem">' + t[1] + '</button>').join('') +
          '<input id="rq-busca" placeholder="Buscar fornecedor, descrição, documento ou REQ-…" value="' + rqEsc(_rq.busca) + '" oninput="rqBuscar(this.value)" style="margin-left:auto;min-width:260px;padding:6px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" />' +
        '</div>' +
        '<div id="rq-form" style="display:none;margin-bottom:14px"></div>' +
        rqTabela(lista) +
      '</div>' +
    '</div>';
}

function rqFiltro(f) { _rq.filtro = f; rqRender(); }
function rqBuscar(v) { _rq.busca = v; const pos = v.length; rqRender(); const el = document.getElementById('rq-busca'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }

function rqTabela(lista) {
  if (!lista.length) return '<p style="color:#666;padding:26px;text-align:center">Nenhuma requisição neste filtro.</p>';
  const rows = lista.map(x => {
    const st = RQ_STATUS[x.status] || RQ_STATUS.pedida;
    const tits = _rq.titulos[x.id] || [];
    const tAb = tits.filter(t => t.status !== 'pago').length, tPg = tits.length - tAb;
    const atraso = rqPendente(x.status) && x.previsao_chegada && x.previsao_chegada < rqHojeISO();
    const selo = x.pago_em && rqPendente(x.status) ? '<div style="color:#f87171;font-size:0.7rem;font-weight:700">⚠ paga e ainda não chegou</div>' : '';
    return '<tr style="border-bottom:1px solid #1a1d2e">' +
      '<td style="padding:7px 8px;font-family:monospace;font-size:0.78rem;color:#9aa;white-space:nowrap">' + rqNumero(x.numero) + '</td>' +
      '<td style="padding:7px 8px;font-size:0.78rem;color:#9aa;white-space:nowrap">' + rqData(x.criado_em) + '</td>' +
      '<td style="padding:7px 8px;font-size:0.84rem;font-weight:600">' + rqEsc(x.fornecedor_nome || '—') + '<div style="font-size:0.72rem;color:#777;font-weight:400">' + rqEsc(x.descricao || '') + '</div></td>' +
      '<td style="padding:7px 8px;font-size:0.76rem;color:#9aa">' + rqEsc(RQ_CATEGORIAS[x.categoria] || x.categoria) + '</td>' +
      '<td style="padding:7px 8px;font-size:0.76rem;color:#9aa">' + rqEsc(x.documento || '—') + '</td>' +
      '<td style="padding:7px 8px;font-weight:700;text-align:right;white-space:nowrap">R$ ' + rqBRL(x.valor_total) + '</td>' +
      '<td style="padding:7px 8px;font-size:0.78rem;color:' + (atraso ? '#f87171' : '#9aa') + '">' + rqData(x.previsao_chegada) + (atraso ? ' <b>atrasada</b>' : '') + '</td>' +
      '<td style="padding:7px 8px"><span style="font-size:0.72rem;padding:2px 9px;border-radius:10px;font-weight:700;background:' + st.bg + ';color:' + st.cor + '">' + st.rot + '</span>' + selo + '</td>' +
      '<td style="padding:7px 8px;font-size:0.76rem;color:#9aa">' + (tits.length ? tits.length + ' título(s)' + (tPg ? ' · ' + tPg + ' pago(s)' : '') : '<span style="color:#666">sem título</span>') + '</td>' +
      '<td style="padding:7px 8px;white-space:nowrap">' +
        '<button onclick="rqVer(\'' + x.id + '\')" title="Ver" style="padding:3px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.74rem">👁</button> ' +
        (rqPendente(x.status) ? '<button onclick="rqReceber(\'' + x.id + '\')" title="Confirmar chegada da mercadoria" style="padding:3px 8px;border-radius:4px;border:none;background:#16a34a;color:#fff;cursor:pointer;font-size:0.74rem;font-weight:700">✔ Chegou</button> ' : '') +
        (x.status !== 'cancelada' && x.status !== 'paga' ? '<button onclick="rqVincular(\'' + x.id + '\')" title="Ligar título do Contas a pagar" style="padding:3px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.74rem">🔗</button> ' : '') +
        (x.status !== 'cancelada' && x.status !== 'paga' ? '<button onclick="rqCancelar(\'' + x.id + '\')" title="Cancelar" style="padding:3px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.74rem">✕</button>' : '') +
      '</td></tr>';
  }).join('');
  return '<div style="overflow-x:auto"><table class="nfe-tabela" style="min-width:1050px;border-collapse:collapse;width:100%">' +
    '<thead><tr style="background:#1a1d2e"><th>Nº</th><th>Lançada</th><th>Fornecedor / o que foi comprado</th><th>Tipo</th><th>Documento</th><th style="text-align:right">Valor</th><th>Previsão</th><th>Situação</th><th>Títulos</th><th>Ações</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

// ---------------- lançar ----------------
async function rqNova() {
  if (!podeOuAvisa('requisicoes.incluir')) return;
  const box = document.getElementById('rq-form');
  box.style.display = 'block';
  box.innerHTML = '<p style="color:#888;padding:12px">Carregando fornecedores...</p>';
  const fR = await sb.from('oct_pessoas').select('id,nome').eq('empresa_id', _rq.empresaId).eq('tipo', 'fornecedor').order('nome');
  const opt = (fR.data || []).map(f => '<option value="' + f.id + '">' + rqEsc(f.nome) + '</option>').join('');
  _rq.itensForm = 0;
  box.innerHTML =
    '<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="color:#60a5fa">＋ Nova requisição de compra</h3>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button></div>' +
      '<div class="form-grid">' +
        '<div class="form-group"><label>Fornecedor *</label><select id="rq-forn"><option value="">Selecione…</option>' + opt + '</select></div>' +
        '<div class="form-group"><label>…ou digite o nome (sem cadastro)</label><input id="rq-forn-nome" placeholder="Nome do fornecedor" /></div>' +
        '<div class="form-group"><label>Tipo de mercadoria *</label><select id="rq-cat">' + Object.keys(RQ_CATEGORIAS).map(k => '<option value="' + k + '">' + RQ_CATEGORIAS[k] + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label>Nº do documento (pedido / orçamento / NF)</label><input id="rq-doc" placeholder="opcional, mas ajuda a evitar duplicidade" /></div>' +
        '<div class="form-group"><label>Forma de pagamento</label><select id="rq-forma">' + RQ_FORMAS.map(f => '<option>' + f + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label>Vencimento previsto</label><input id="rq-venc" type="date" /></div>' +
        '<div class="form-group"><label>Previsão de chegada</label><input id="rq-prev" type="date" value="' + rqSomaDias(rqHojeISO(), 1) + '" /></div>' +
        '<div class="form-group" style="grid-column:1/-1"><label>Descrição (o que foi comprado, em uma frase)</label><input id="rq-desc" placeholder="Ex.: 5.000 L de gasolina comum / 20 caixas de óleo 15W40" /></div>' +
      '</div>' +
      '<div style="margin:12px 0 4px;font-size:0.82rem;color:#9aa;font-weight:700">Itens *</div>' +
      '<div id="rq-itens"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
        '<button onclick="rqAddItem()" style="padding:5px 12px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer">＋ item</button>' +
        '<div style="font-size:1rem">Total: <b id="rq-total" style="color:#f97316">R$ 0,00</b></div>' +
      '</div>' +
      '<div class="form-group" style="margin-top:10px"><label>Observações</label><input id="rq-obs" /></div>' +
      '<div id="rq-dup"></div>' +
      '<div class="form-acoes"><button class="btn-salvar" onclick="rqSalvar()">💾 Lançar requisição</button>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>' +
        '<span id="rq-msg" class="form-msg"></span></div>' +
    '</div>';
  rqAddItem();
  box.scrollIntoView({ behavior: 'smooth' });
}

function rqAddItem() {
  const i = _rq.itensForm++;
  const w = document.getElementById('rq-itens');
  if (!w) return;
  const d = document.createElement('div');
  d.className = 'rq-it';
  d.style.cssText = 'display:grid;grid-template-columns:3fr 70px 90px 110px 110px 30px;gap:6px;margin-bottom:6px;align-items:center';
  d.innerHTML =
    '<input data-f="desc" placeholder="Item (ex.: Gasolina comum)" style="' + RQ_INPUT + '" />' +
    '<input data-f="un" value="UN" style="' + RQ_INPUT + '" />' +
    '<input data-f="qtd" type="number" step="0.001" min="0" placeholder="Qtd" value="1" oninput="rqRecalcular()" style="' + RQ_INPUT + ';text-align:right" />' +
    '<input data-f="unit" type="number" step="0.0001" min="0" placeholder="Valor unit." oninput="rqRecalcular()" style="' + RQ_INPUT + ';text-align:right" />' +
    '<div data-f="tot" style="text-align:right;font-weight:700;color:#e0e0e0">R$ 0,00</div>' +
    '<button onclick="this.parentNode.remove();rqRecalcular()" title="Remover" style="border:none;background:transparent;color:#f44;cursor:pointer">✕</button>';
  w.appendChild(d);
}

function rqLerItens() {
  return Array.from(document.querySelectorAll('#rq-itens .rq-it')).map(row => {
    const g = f => row.querySelector('[data-f="' + f + '"]');
    const qtd = Number(g('qtd').value) || 0, unit = Number(g('unit').value) || 0;
    return { descricao: (g('desc').value || '').trim(), unidade: (g('un').value || 'UN').trim() || 'UN', qtd_pedida: qtd, valor_unit: unit, valor_total: Math.round(qtd * unit * 100) / 100 };
  }).filter(i => i.descricao || i.qtd_pedida || i.valor_unit);
}

function rqRecalcular() {
  let total = 0;
  document.querySelectorAll('#rq-itens .rq-it').forEach(row => {
    const q = Number(row.querySelector('[data-f="qtd"]').value) || 0, u = Number(row.querySelector('[data-f="unit"]').value) || 0;
    const t = Math.round(q * u * 100) / 100;
    row.querySelector('[data-f="tot"]').textContent = 'R$ ' + rqBRL(t);
    total += t;
  });
  const el = document.getElementById('rq-total');
  if (el) el.textContent = 'R$ ' + rqBRL(total);
  return total;
}

async function rqQuem() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('sessão expirada — entre de novo');
  let nome = user.email;
  try { const pr = await sb.from('oct_perfis').select('nome').eq('id', user.id).maybeSingle(); if (pr.data && pr.data.nome) nome = pr.data.nome; } catch (e) { /* fica o e-mail */ }
  return { id: user.id, nome };
}

async function rqEvento(requisicaoId, tipo, detalhe, quem) {
  try {
    await sb.from('oct_requisicoes_compra_eventos').insert({ requisicao_id: requisicaoId, empresa_id: _rq.empresaId || null, tipo, detalhe: detalhe || null, por: quem ? quem.id : null, por_nome: quem ? quem.nome : null });
  } catch (e) { /* o histórico não pode derrubar a ação */ }
}

async function rqSalvar() {
  if (!podeOuAvisa('requisicoes.incluir')) return;
  const msg = document.getElementById('rq-msg');
  const erro = t => { msg.textContent = t; msg.style.color = '#f44'; };
  const fornId = document.getElementById('rq-forn').value || null;
  const fornSel = document.getElementById('rq-forn');
  const fornNome = fornId ? (fornSel.options[fornSel.selectedIndex].textContent || '').trim() : (document.getElementById('rq-forn-nome').value || '').trim();
  if (!fornNome) return erro('Informe o fornecedor.');
  const itens = rqLerItens();
  if (!itens.length) return erro('Lance pelo menos um item.');
  if (itens.some(i => !i.descricao || !(i.qtd_pedida > 0))) return erro('Cada item precisa de descrição e quantidade.');
  const total = Math.round(itens.reduce((s, i) => s + i.valor_total, 0) * 100) / 100;
  if (!(total > 0)) return erro('O valor total não pode ser zero.');
  const doc = (document.getElementById('rq-doc').value || '').trim() || null;
  const venc = document.getElementById('rq-venc').value || null;

  // possíveis duplicidades: requisições do mesmo fornecedor + títulos já lançados/pagos
  if (fornId) {
    msg.textContent = 'Conferindo duplicidade…'; msg.style.color = '#aaa';
    const t = await sb.from('oct_contas_pagar').select('id,fornecedor_id,valor,vencimento,status,data_pagamento,n_documento,requisicao_id')
      .eq('empresa_id', _rq.empresaId).eq('fornecedor_id', fornId).order('vencimento', { ascending: false }).limit(200);
    const dup = rqDuplicatas({ fornecedor_id: fornId, valor_total: total, documento: doc, vencimento_previsto: venc }, _rq.lista, t.data || [], rqHojeISO());
    if (dup.length) {
      const linhas = dup.slice(0, 6).map(d => '• ' + d.ref + ' — R$ ' + rqBRL(d.valor) + ' (' + d.motivo + ')').join('\n');
      if (!confirm('⚠ POSSÍVEL DUPLICIDADE\n\n' + linhas + '\n\nLançar mesmo assim?')) { msg.textContent = 'Lançamento cancelado.'; msg.style.color = '#fbbf24'; return; }
    }
  }
  msg.textContent = 'Salvando…'; msg.style.color = '#aaa';
  let quem;
  try { quem = await rqQuem(); } catch (e) { return erro(e.message); }
  const cab = {
    empresa_id: _rq.empresaId, fornecedor_id: fornId, fornecedor_nome: fornNome,
    categoria: document.getElementById('rq-cat').value, descricao: (document.getElementById('rq-desc').value || '').trim() || null,
    valor_total: total, forma_pagamento: document.getElementById('rq-forma').value, vencimento_previsto: venc,
    previsao_chegada: document.getElementById('rq-prev').value || null, documento: doc,
    observacoes: (document.getElementById('rq-obs').value || '').trim() || null,
    status: 'pedida', criado_por: quem.id, criado_por_nome: quem.nome,
  };
  const ins = await sb.from('oct_requisicoes_compra').insert(cab).select('id,numero').single();
  if (ins.error) {
    return erro(/ux_rqc_documento|duplicate key/i.test(ins.error.message || '') ? 'Já existe requisição deste fornecedor com este documento.' : 'Erro: ' + ins.error.message);
  }
  const itensIns = itens.map(i => Object.assign({ requisicao_id: ins.data.id, empresa_id: _rq.empresaId, qtd_recebida: 0 }, i));
  const it = await sb.from('oct_requisicoes_compra_itens').insert(itensIns);
  if (it.error) return erro('A requisição ' + rqNumero(ins.data.numero) + ' foi criada, mas os itens falharam: ' + it.error.message);
  await rqEvento(ins.data.id, 'criada', 'R$ ' + rqBRL(total) + ' · ' + itens.length + ' item(ns)', quem);
  msg.textContent = 'Lançada: ' + rqNumero(ins.data.numero); msg.style.color = '#4caf50';
  setTimeout(moduloRequisicoes, 700);
}

// ---------------- ver / receber / vincular / cancelar ----------------
async function rqVer(id) {
  const x = _rq.lista.find(r => r.id === id);
  if (!x) return;
  const box = document.getElementById('rq-form');
  box.style.display = 'block';
  box.innerHTML = '<p style="color:#888;padding:12px">Carregando…</p>';
  const [iR, eR, tR] = await Promise.all([
    sb.from('oct_requisicoes_compra_itens').select('*').eq('requisicao_id', id).order('descricao'),
    sb.from('oct_requisicoes_compra_eventos').select('*').eq('requisicao_id', id).order('em'),
    sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento,status,data_pagamento,n_documento').eq('requisicao_id', id).order('vencimento'),
  ]);
  const st = RQ_STATUS[x.status] || RQ_STATUS.pedida;
  const itens = iR.data || [], evs = eR.data || [], tits = tR.data || [];
  box.innerHTML =
    '<div style="background:#13151f;border:1px solid ' + st.cor + ';border-radius:10px;padding:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<h3 style="color:' + st.cor + '">' + rqNumero(x.numero) + ' — ' + st.rot + '</h3>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button></div>' +
      '<div style="font-size:0.88rem;margin-bottom:10px"><b>' + rqEsc(x.fornecedor_nome || '—') + '</b> · ' + rqEsc(RQ_CATEGORIAS[x.categoria] || '') + ' · documento <b>' + rqEsc(x.documento || '—') + '</b> · ' +
        rqEsc(x.forma_pagamento || '') + (x.vencimento_previsto ? ' · vence ' + rqData(x.vencimento_previsto) : '') + ' · chegada prevista ' + rqData(x.previsao_chegada) + '</div>' +
      (x.descricao ? '<div style="color:#9aa;font-size:0.84rem;margin-bottom:8px">' + rqEsc(x.descricao) + '</div>' : '') +
      '<table class="nfe-tabela" style="width:100%;border-collapse:collapse;margin-bottom:10px"><thead><tr style="background:#1a1d2e"><th>Item</th><th style="text-align:right">Pedido</th><th style="text-align:right">Chegou</th><th style="text-align:right">Valor</th></tr></thead><tbody>' +
        itens.map(i => '<tr><td style="padding:6px 8px">' + rqEsc(i.descricao) + '</td><td style="text-align:right;padding:6px 8px">' + rqQtd(i.qtd_pedida) + ' ' + rqEsc(i.unidade || '') + '</td>' +
          '<td style="text-align:right;padding:6px 8px;color:' + (Number(i.qtd_recebida) >= Number(i.qtd_pedida) ? '#4ade80' : Number(i.qtd_recebida) > 0 ? '#60a5fa' : '#777') + '">' + rqQtd(i.qtd_recebida) + '</td>' +
          '<td style="text-align:right;padding:6px 8px">R$ ' + rqBRL(i.valor_total) + '</td></tr>').join('') +
        '<tr style="border-top:2px solid #2a2d3e"><td colspan="3" style="text-align:right;padding:6px 8px;color:#888">Total</td><td style="text-align:right;padding:6px 8px;font-weight:800;color:#f97316">R$ ' + rqBRL(x.valor_total) + '</td></tr></tbody></table>' +
      '<div style="font-size:0.8rem;color:#888;margin-bottom:6px">Títulos ligados</div>' +
      (tits.length ? '<div style="margin-bottom:10px">' + tits.map(t => '<div style="font-size:0.82rem;padding:3px 0">' + rqEsc(t.n_documento || t.descricao || '') + ' · R$ ' + rqBRL(t.valor) + ' · vence ' + rqData(t.vencimento) + ' · ' +
        (t.status === 'pago' ? '<span style="color:#4ade80">pago ' + rqData(t.data_pagamento) + '</span>' : '<span style="color:#fbbf24">em aberto</span>') + '</div>').join('') + '</div>'
        : '<div style="color:#666;font-size:0.82rem;margin-bottom:10px">Nenhum título ligado ainda (use 🔗).</div>') +
      '<div style="font-size:0.8rem;color:#888;margin-bottom:6px">Histórico</div>' +
      evs.map(e => '<div style="font-size:0.8rem;color:#9aa;padding:2px 0">' + rqQuando(e.em) + ' · <b>' + rqEsc(e.tipo.replace(/_/g, ' ')) + '</b> · ' + rqEsc(e.detalhe || '') + ' <span style="color:#666">— ' + rqEsc(e.por_nome || '') + '</span></div>').join('') +
      (x.status === 'cancelada' ? '<div style="color:#f87171;font-size:0.82rem;margin-top:8px">Cancelada: ' + rqEsc(x.cancelado_motivo || '') + '</div>' : '') +
    '</div>';
  box.scrollIntoView({ behavior: 'smooth' });
}

async function rqReceber(id) {
  if (!podeOuAvisa('requisicoes.receber')) return;
  const x = _rq.lista.find(r => r.id === id);
  if (!x) return;
  const box = document.getElementById('rq-form');
  box.style.display = 'block';
  const iR = await sb.from('oct_requisicoes_compra_itens').select('*').eq('requisicao_id', id).order('descricao');
  const itens = iR.data || [];
  box.innerHTML =
    '<div style="background:#13151f;border:1px solid #16a34a;border-radius:10px;padding:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="color:#4ade80">✔ Chegada da mercadoria — ' + rqNumero(x.numero) + ' · ' + rqEsc(x.fornecedor_nome || '') + '</h3>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button></div>' +
      '<div style="color:#9aa;font-size:0.82rem;margin-bottom:8px">Informe o que CHEGOU no posto. Já vem com a quantidade pedida; ajuste o que veio diferente.</div>' +
      '<table class="nfe-tabela" style="width:100%;border-collapse:collapse"><thead><tr style="background:#1a1d2e"><th>Item</th><th style="text-align:right">Pedido</th><th style="text-align:right;width:140px">Chegou</th></tr></thead><tbody>' +
        itens.map(i => '<tr data-id="' + i.id + '" data-ped="' + i.qtd_pedida + '"><td style="padding:6px 8px">' + rqEsc(i.descricao) + '</td>' +
          '<td style="text-align:right;padding:6px 8px">' + rqQtd(i.qtd_pedida) + ' ' + rqEsc(i.unidade || '') + '</td>' +
          '<td style="text-align:right;padding:4px 8px"><input data-f="rec" type="number" step="0.001" min="0" value="' + (Number(i.qtd_recebida) > 0 ? i.qtd_recebida : i.qtd_pedida) + '" style="' + RQ_INPUT + ';width:130px;text-align:right" /></td></tr>').join('') +
      '</tbody></table>' +
      '<label style="display:block;margin-top:10px;font-size:0.84rem;color:#fb923c"><input id="rq-div" type="checkbox" /> Chegou diferente do pedido (marcar como DIVERGENTE)</label>' +
      '<div class="form-group" style="margin-top:8px"><label>Observação do recebimento (nota, conferência, avaria…)</label><input id="rq-recobs" /></div>' +
      '<div class="form-acoes"><button class="btn-salvar" style="background:#16a34a" onclick="rqConfirmarRecebimento(\'' + id + '\')">✔ Confirmar chegada</button>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>' +
        '<span id="rq-msg" class="form-msg"></span></div>' +
    '</div>';
  box.scrollIntoView({ behavior: 'smooth' });
}

async function rqConfirmarRecebimento(id) {
  if (!podeOuAvisa('requisicoes.receber')) return;
  const msg = document.getElementById('rq-msg');
  const x = _rq.lista.find(r => r.id === id);
  const linhas = Array.from(document.querySelectorAll('#rq-form tbody tr[data-id]')).map(tr => ({
    id: tr.getAttribute('data-id'), qtd_pedida: Number(tr.getAttribute('data-ped')), qtd_recebida: Number(tr.querySelector('[data-f="rec"]').value) || 0,
  }));
  const divManual = document.getElementById('rq-div').checked;
  const obs = (document.getElementById('rq-recobs').value || '').trim();
  if (divManual && !obs) { msg.textContent = 'Explique a divergência na observação.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando…'; msg.style.color = '#aaa';
  let quem;
  try { quem = await rqQuem(); } catch (e) { msg.textContent = e.message; msg.style.color = '#f44'; return; }
  let status = rqStatusPeloRecebimento(linhas, divManual);
  if (!linhas.length) status = divManual ? 'divergente' : 'recebida';   // requisição sem itens (legado/falha ao gravar): "chegou" vale como total
  const jaPaga = !!(x && x.pago_em);
  if (status === 'recebida' && jaPaga) status = 'paga';          // pagou antes e agora chegou: fecha
  const rs = await Promise.all(linhas.map(l => sb.from('oct_requisicoes_compra_itens').update({ qtd_recebida: l.qtd_recebida }).eq('id', l.id)));
  const e1 = rs.find(r => r.error);
  if (e1) { msg.textContent = 'Erro nos itens: ' + e1.error.message; msg.style.color = '#f44'; return; }
  const upd = { status, recebido_em: new Date().toISOString(), recebido_por: quem.id, recebido_por_nome: quem.nome, recebido_obs: obs || null, atualizado_em: new Date().toISOString() };
  const u = await sb.from('oct_requisicoes_compra').update(upd).eq('id', id);
  if (u.error) { msg.textContent = 'Erro: ' + u.error.message; msg.style.color = '#f44'; return; }
  await rqEvento(id, status === 'divergente' ? 'divergente' : (status === 'parcial' ? 'parcial' : 'recebida'),
    linhas.map(l => rqQtd(l.qtd_recebida) + '/' + rqQtd(l.qtd_pedida)).join(' · ') + (obs ? ' — ' + obs : ''), quem);
  msg.textContent = 'Chegada registrada: ' + (RQ_STATUS[status] || {}).rot; msg.style.color = '#4caf50';
  setTimeout(moduloRequisicoes, 700);
}

async function rqVincular(id) {
  if (!podeOuAvisa('requisicoes.vincular')) return;
  const x = _rq.lista.find(r => r.id === id);
  if (!x) return;
  const box = document.getElementById('rq-form');
  box.style.display = 'block';
  box.innerHTML = '<p style="color:#888;padding:12px">Procurando títulos…</p>';
  let q = sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento,status,n_documento,requisicao_id,fornecedor_id')
    .eq('empresa_id', _rq.empresaId).eq('status', 'aberto').is('requisicao_id', null).order('vencimento').limit(300);
  if (x.fornecedor_id) q = q.eq('fornecedor_id', x.fornecedor_id);
  const r = await q;
  const lista = r.data || [];
  const perto = t => Math.abs(rqCent(t.valor) - rqCent(x.valor_total)) <= 2;
  box.innerHTML =
    '<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="color:#60a5fa">🔗 Ligar título a ' + rqNumero(x.numero) + ' — ' + rqEsc(x.fornecedor_nome || '') + ' (R$ ' + rqBRL(x.valor_total) + ')</h3>' +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button></div>' +
      (lista.length ? lista.map(t => '<label style="display:flex;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid #1a1d2e;font-size:0.84rem"><input type="checkbox" class="rq-vinc" value="' + t.id + '" ' + (perto(t) ? 'checked' : '') + ' /> ' +
          '<span style="flex:1">' + rqEsc(t.n_documento || '—') + ' · ' + rqEsc(t.descricao || '') + '</span><span>vence ' + rqData(t.vencimento) + '</span><b>R$ ' + rqBRL(t.valor) + '</b>' + (perto(t) ? ' <span style="color:#4ade80">≈ valor</span>' : '') + '</label>').join('')
        : '<p style="color:#666;padding:10px">Nenhum título em aberto sem requisição' + (x.fornecedor_id ? ' deste fornecedor' : '') + '. Lance o título em Contas a pagar (ou espere a NF-e) e volte aqui.</p>') +
      '<div class="form-acoes">' + (lista.length ? '<button class="btn-salvar" onclick="rqConfirmarVinculo(\'' + id + '\')">🔗 Ligar selecionados</button>' : '') +
        '<button onclick="document.getElementById(\'rq-form\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Fechar</button><span id="rq-msg" class="form-msg"></span></div>' +
    '</div>';
}

async function rqConfirmarVinculo(id) {
  if (!podeOuAvisa('requisicoes.vincular')) return;
  const msg = document.getElementById('rq-msg');
  const sel = Array.from(document.querySelectorAll('.rq-vinc:checked')).map(i => i.value);
  if (!sel.length) { msg.textContent = 'Marque pelo menos um título.'; msg.style.color = '#f44'; return; }
  const quem = await rqQuem();
  const u = await sb.from('oct_contas_pagar').update({ requisicao_id: id }).in('id', sel).is('requisicao_id', null);
  if (u.error) { msg.textContent = 'Erro: ' + u.error.message; msg.style.color = '#f44'; return; }
  await rqEvento(id, 'titulo_vinculado', sel.length + ' título(s) ligado(s)', quem);
  msg.textContent = 'Ligado.'; msg.style.color = '#4caf50';
  setTimeout(moduloRequisicoes, 600);
}

async function rqCancelar(id) {
  if (!podeOuAvisa('requisicoes.cancelar')) return;
  const x = _rq.lista.find(r => r.id === id);
  const motivo = (prompt('Cancelar ' + rqNumero(x ? x.numero : 0) + '?\n\nMotivo (obrigatório):') || '').trim();
  if (!motivo) return;
  const quem = await rqQuem();
  const u = await sb.from('oct_requisicoes_compra').update({ status: 'cancelada', cancelado_em: new Date().toISOString(), cancelado_por_nome: quem.nome, cancelado_motivo: motivo, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (u.error) { alert('Erro: ' + u.error.message); return; }
  await rqEvento(id, 'cancelada', motivo, quem);
  moduloRequisicoes();
}

// ============================================================
// INTEGRAÇÃO COM O CONTAS A PAGAR (selo no título + alerta/motivo ao baixar)
// Tudo com guarda: sem o SQL rodado, o Contas a pagar segue exatamente como era.
// ============================================================
async function rqMapaDosTitulos(contas) {
  const ids = Array.from(new Set((contas || []).map(c => c.requisicao_id).filter(Boolean)));
  if (!ids.length) return {};
  const r = await sb.from('oct_requisicoes_compra').select('id,numero,status,valor_total,fornecedor_nome,pago_em').in('id', ids.slice(0, 400));
  const m = {};
  (r.data || []).forEach(x => { m[x.id] = x; });
  return m;
}

let _rqPag = null;   // estado do alerta do título que está sendo baixado

async function rqPrepararAlertaPagamento(conta) {
  _rqPag = { conta, req: null, dups: [] };
  const el = document.getElementById('pg-alerta');
  if (!el || !conta) return;
  try {
    if (conta.requisicao_id) {
      const r = await sb.from('oct_requisicoes_compra').select('id,numero,status,valor_total,fornecedor_nome,previsao_chegada,pago_em').eq('id', conta.requisicao_id).maybeSingle();
      _rqPag.req = r.data || null;
    }
    if (conta.fornecedor_id) {
      const t = await sb.from('oct_contas_pagar').select('id,fornecedor_id,valor,vencimento,status,data_pagamento,n_documento,requisicao_id')
        .eq('empresa_id', conta.empresa_id).eq('fornecedor_id', conta.fornecedor_id).neq('id', conta.id).order('vencimento', { ascending: false }).limit(120);
      const hoje = rqHojeISO();
      _rqPag.dups = (t.data || []).filter(o => {
        const q = rqCent(o.valor) - rqCent(conta.valor);
        const mesmoDoc = conta.n_documento && o.n_documento && String(o.n_documento).trim() === String(conta.n_documento).trim();
        const quando = o.status === 'pago' ? (o.data_pagamento || o.vencimento) : o.vencimento;
        return o.status === 'pago' && (mesmoDoc || (Math.abs(q) <= 2 && quando && rqDiasEntre(String(quando).slice(0, 10), hoje) <= 30));
      });
    }
  } catch (e) { return; }   // sem as tabelas/colunas novas: segue como sempre
  let h = '';
  const req = _rqPag.req;
  if (req && rqPendente(req.status)) {
    h += '<div style="background:#2a0e0e;border:1px solid #f87171;border-radius:8px;padding:10px 12px;margin-bottom:12px">' +
      '<div style="color:#f87171;font-weight:800;margin-bottom:4px">⛔ A mercadoria desta compra AINDA NÃO CHEGOU (' + rqNumero(req.numero) + ' — ' + (RQ_STATUS[req.status] || {}).rot + ')</div>' +
      '<div style="font-size:0.82rem;color:#e0b0b0;margin-bottom:6px">Pagar agora fica registrado no histórico da requisição. Informe o motivo para continuar.</div>' +
      '<input id="pg-motivo" placeholder="Motivo para pagar antes da chegada (obrigatório)" style="' + RQ_INPUT + ';border-color:#7f1d1d" /></div>';
  } else if (req) {
    h += '<div style="background:#0e2a14;border:1px solid #2f7a45;border-radius:8px;padding:8px 12px;margin-bottom:12px;color:#86efac;font-size:0.84rem">✔ Mercadoria recebida — ' + rqNumero(req.numero) + '</div>';
  }
  if (_rqPag.dups.length) {
    h += '<div style="background:#2a2208;border:1px solid #fbbf24;border-radius:8px;padding:10px 12px;margin-bottom:12px">' +
      '<div style="color:#fbbf24;font-weight:800;margin-bottom:4px">⚠ Possível pagamento em duplicidade</div>' +
      _rqPag.dups.slice(0, 5).map(o => '<div style="font-size:0.82rem;color:#e8d9a0">• ' + rqEsc(o.n_documento || '—') + ' — R$ ' + rqBRL(o.valor) + ' pago em ' + rqData(o.data_pagamento || o.vencimento) + '</div>').join('') +
      '<label style="display:block;margin-top:6px;font-size:0.84rem"><input id="pg-dup-ok" type="checkbox" /> Conferi: este pagamento NÃO é duplicado</label></div>';
  }
  el.innerHTML = h;
}

async function rqValidarPagamento(id) {
  if (!_rqPag || !_rqPag.conta || _rqPag.conta.id !== id) return { ok: true, motivo: '' };
  const req = _rqPag.req;
  let motivo = '';
  if (req && rqPendente(req.status)) {
    motivo = ((document.getElementById('pg-motivo') || {}).value || '').trim();
    if (!motivo) return { ok: false, erro: 'A mercadoria ainda não chegou: informe o motivo para pagar assim mesmo.' };
  }
  if (_rqPag.dups.length) {
    const ok = document.getElementById('pg-dup-ok');
    if (!ok || !ok.checked) return { ok: false, erro: 'Possível pagamento em duplicidade: confira e marque a caixa.' };
  }
  return { ok: true, motivo };
}

// depois da baixa: histórico + estado da requisição (todos os títulos pagos -> paga, se a mercadoria já chegou)
async function rqRegistrarPagamento(id, motivo, valorPago) {
  const conta = _rqPag && _rqPag.conta && _rqPag.conta.id === id ? _rqPag.conta : null;
  if (!conta || !conta.requisicao_id) return;
  _rq.empresaId = _rq.empresaId || conta.empresa_id;
  const quem = await rqQuem();
  const rq = await sb.from('oct_requisicoes_compra').select('id,status,pago_em').eq('id', conta.requisicao_id).maybeSingle();
  const req = rq.data;
  if (!req) return;
  const t = await sb.from('oct_contas_pagar').select('id,status').eq('requisicao_id', conta.requisicao_id);
  const todosPagos = (t.data || []).length > 0 && (t.data || []).every(x => x.status === 'pago' || x.id === id);
  const antes = rqPendente(req.status);
  const upd = { atualizado_em: new Date().toISOString() };
  if (todosPagos) {
    upd.pago_em = new Date().toISOString();
    if (antes) upd.pago_antes_do_recebimento = true; else if (req.status === 'recebida') upd.status = 'paga';
  }
  await sb.from('oct_requisicoes_compra').update(upd).eq('id', conta.requisicao_id);
  await rqEvento(conta.requisicao_id, antes ? 'pago_antes' : 'pago',
    'R$ ' + rqBRL(valorPago) + (antes ? ' — MERCADORIA AINDA NÃO CHEGOU. Motivo: ' + (motivo || '—') : ''), quem);
}
