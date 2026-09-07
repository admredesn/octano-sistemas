// ============================================================
//  CENTRAL DE RELATÓRIOS  -  hub extensível
// ------------------------------------------------------------
//  Cada relatório se registra em RELATORIOS_REG (id/ícone/título/descrição/fn).
//  Adicionar um relatório novo = criar a função e incluir uma entrada aqui.
// ============================================================

const RELATORIOS_REG = [
  {
    id: 'recebimentos', icone: '💰', titulo: 'Recebimentos',
    descricao: 'Dinheiro, cartão, Pix e frota recebidos (cofre / EDI / Prime), com status de conciliação.',
    fn: () => relatorioRecebimentos(),
  },
  {
    id: 'estoque', icone: '📦', titulo: 'Estoque',
    descricao: 'Posição do estoque em qualquer data, com custo, código de barras e preço de venda. Colunas escolhidas por você.',
    fn: () => relatorioEstoque(),
  },
  // >>> novos relatórios entram aqui <<<
];

function moduloRelatorios() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const cards = RELATORIOS_REG.map(r => `
    <div class="prod-card" onclick="relatorioAbrir('${r.id}')" style="min-height:120px">
      <div style="font-size:1.9rem;line-height:1">${r.icone}</div>
      <h3 style="color:#e6e6e6;margin:10px 0 4px;font-size:1.02rem">${r.titulo}</h3>
      <p style="color:#8a8f98;font-size:.8rem;margin:0;line-height:1.35">${r.descricao}</p>
    </div>`).join('');
  c.innerHTML = `
    <div style="padding:24px">
      <h2 style="color:#f97316;margin:0 0 4px">📊 Central de Relatórios</h2>
      <p style="color:#888;margin:0 0 20px;font-size:.9rem">Escolha um relatório para visualizar.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">
        ${cards || '<p style="color:#888">Nenhum relatório disponível ainda.</p>'}
      </div>
    </div>`;
}

function relatorioAbrir(id) {
  const r = RELATORIOS_REG.find(x => x.id === id);
  if (r && typeof r.fn === 'function') r.fn();
}

// cabeçalho padrão dos relatórios (título + botão voltar pra central)
function _relHeader(titulo) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="color:#f97316;margin:0">${titulo}</h2>
      <button onclick="moduloRelatorios()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer;font-size:.85rem">← Central de Relatórios</button>
    </div>`;
}

function _relEid() {
  return (typeof empresaAtiva === 'function') ? empresaAtiva() : (window._perfilEmpresaId || null);
}

// ============================================================
//  RELATÓRIO: RECEBIMENTOS
// ============================================================
const _REL_ORIGEM_LABEL = {
  cofre_brinks: '🔒 Cofre', pagbank_edi: '💳 EDI PagBank', prime_frota: '🚚 Frota (Prime)',
  ticketlog: '🚚 TicketLog', extrato: '📄 Extrato', manual: '✍️ Manual',
};

function _relDataHoje() { return new Date().toISOString().slice(0, 10); }
function _relDataInicioMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function _relBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

async function relatorioRecebimentos() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const ini = _relDataInicioMes(), fim = _relDataHoje();
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('💰 Recebimentos')}
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
      <label style="color:#9fb3c8;font-size:.8rem">De<br><input type="date" id="rel-rc-ini" value="${ini}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Até<br><input type="date" id="rel-rc-fim" value="${fim}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Origem<br>
        <select id="rel-rc-origem" style="margin-top:3px">
          <option value="">Todas</option>
          <option value="cofre_brinks">Cofre</option>
          <option value="pagbank_edi">EDI PagBank</option>
          <option value="prime_frota">Frota (Prime)</option>
          <option value="ticketlog">TicketLog</option>
          <option value="extrato">Extrato</option>
        </select></label>
      <button onclick="relatorioRecebimentosCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
    </div>
    <div id="rel-rc-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioRecebimentosCarregar();
  // atualiza sozinho a cada 20s (silencioso, preserva os filtros)
  if (typeof octAutoRefresh === 'function') octAutoRefresh(() => relatorioRecebimentosCarregar(true), 20000);
}

async function relatorioRecebimentosCarregar(silencioso) {
  const box = document.getElementById('rel-rc-corpo');
  if (!box) return;
  const eid = _relEid();
  if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
  const ini = document.getElementById('rel-rc-ini')?.value || _relDataInicioMes();
  const fim = document.getElementById('rel-rc-fim')?.value || _relDataHoje();
  const origem = document.getElementById('rel-rc-origem')?.value || '';
  if (!silencioso) box.innerHTML = '<p style="color:#888">Carregando…</p>';

  let q = sb.from('oct_recebimentos').select('*').eq('empresa_id', eid)
    .gte('recebido_em', ini + 'T00:00:00').lte('recebido_em', fim + 'T23:59:59');
  if (origem) q = q.eq('origem', origem);
  q = q.order('recebido_em', { ascending: false }).limit(3000);
  const { data, error } = await q;
  if (error) { box.innerHTML = `<p style="color:#f87171">Erro: ${error.message}</p><p style="color:#666;font-size:.8rem">A tabela oct_recebimentos já foi criada no Supabase?</p>`; return; }
  const recs = data || [];
  if (!recs.length) { box.innerHTML = '<p style="color:#888">Nenhum recebimento no período.</p>'; return; }

  // resumo
  const total = recs.reduce((s, r) => s + Number(r.valor || 0), 0);
  const porForma = {}, porOrigem = {};
  let concQtd = 0, concValor = 0;
  recs.forEach(r => {
    const f = (r.forma || '—');
    porForma[f] = (porForma[f] || 0) + Number(r.valor || 0);
    porOrigem[r.origem] = (porOrigem[r.origem] || 0) + Number(r.valor || 0);
    if (r.conciliado) { concQtd++; concValor += Number(r.valor || 0); }
  });
  const cardResumo = (titulo, valor, cor) => `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
      <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${titulo}</div>
      <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px">${valor}</div>
    </div>`;
  const chips = (obj, mapa) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<span style="display:inline-block;background:#0f1a2a;border:1px solid #2a4a6a;border-radius:20px;padding:4px 10px;margin:3px;color:#cbd5e1;font-size:.78rem">${(mapa && mapa[k]) || k}: <strong style="color:#5dca9a">${_relBRL(v)}</strong></span>`).join('');

  const linhas = recs.map(r => {
    const dh = r.recebido_em ? new Date(r.recebido_em).toLocaleString('pt-BR') : (r.dia || '');
    return `<tr style="border-bottom:1px solid #1e2233">
      <td style="padding:7px 8px;color:#9ca3af;font-size:.78rem">${dh}</td>
      <td style="padding:7px 8px">${_REL_ORIGEM_LABEL[r.origem] || r.origem}</td>
      <td style="padding:7px 8px;color:#cbd5e1">${r.forma || '—'}${r.bandeira ? ' · <span style="color:#8a8f98">' + r.bandeira + '</span>' : ''}</td>
      <td style="padding:7px 8px;text-align:right;color:#5dca9a;font-weight:600">${_relBRL(r.valor)}</td>
      <td style="padding:7px 8px;text-align:center">${r.conciliado ? '<span style="color:#4ade80">✓</span>' : '<span style="color:#6b7280">—</span>'}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${cardResumo('Total recebido', _relBRL(total), '#5dca9a')}
      ${cardResumo('Transações', recs.length, '#e6e6e6')}
      ${cardResumo('Conciliados', concQtd + ' · ' + _relBRL(concValor), '#4ade80')}
    </div>
    <div style="margin-bottom:6px;color:#8a8f98;font-size:.78rem">Por forma:</div>
    <div style="margin-bottom:10px">${chips(porForma)}</div>
    <div style="margin-bottom:6px;color:#8a8f98;font-size:.78rem">Por origem:</div>
    <div style="margin-bottom:16px">${chips(porOrigem, _REL_ORIGEM_LABEL)}</div>
    <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:58vh">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">
          <th style="padding:8px">Data/Hora</th><th style="padding:8px">Origem</th>
          <th style="padding:8px">Forma</th><th style="padding:8px;text-align:right">Valor</th>
          <th style="padding:8px;text-align:center">Conc.</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

// ============================================================
//  RELATÓRIO: ESTOQUE — posição em qualquer data
// ------------------------------------------------------------
//  O saldo NÃO vem de oct_produtos.estoque. Aquele campo só é somado pela
//  entrada de NF-e e nunca é baixado por venda: ele vale "tudo que já comprei".
//  Aqui o saldo é a SOMA DO MOVIMENTO (oct_estoque_mov) até a data pedida —
//  inventário de abertura + entradas − vendas ± ajustes. É o que permite
//  responder "qual era meu estoque em 03/09" em vez de só "quanto tem agora".
//
//  Combustível fica fora de propósito: o saldo dele é o TANQUE, medido por
//  sonda, com o LMC por cima.
// ============================================================

// colunas opcionais — o Ronan liga/desliga e a escolha fica salva no navegador
const _EST_COLUNAS = [
  { id: 'ean', rot: 'Cód. barras', padrao: true },
  { id: 'categoria', rot: 'Categoria', padrao: false },
  { id: 'unidade', rot: 'Unidade', padrao: true },
  { id: 'custo', rot: 'Custo unit.', padrao: true },
  { id: 'custoTotal', rot: 'Custo total', padrao: true },
  { id: 'venda', rot: 'Preço venda', padrao: false },
  { id: 'vendaTotal', rot: 'Valor de venda', padrao: false },
  { id: 'margem', rot: 'Margem %', padrao: false },
  { id: 'ultimo', rot: 'Últ. movimento', padrao: false },
];

function _estColsAtivas() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem('oct_rel_estoque_cols') || 'null'); } catch (e) { salvo = null; }
  const set = {};
  _EST_COLUNAS.forEach(c => { set[c.id] = salvo && (c.id in salvo) ? !!salvo[c.id] : c.padrao; });
  return set;
}

function _estColsSalvar() {
  const set = {};
  _EST_COLUNAS.forEach(c => { set[c.id] = !!document.getElementById('est-col-' + c.id)?.checked; });
  try { localStorage.setItem('oct_rel_estoque_cols', JSON.stringify(set)); } catch (e) { /* aba anônima */ }
  relatorioEstoqueCarregar();
}

function _estNum(v, casas) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

async function relatorioEstoque() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const cols = _estColsAtivas();
  const chks = _EST_COLUNAS.map(x => `
    <label style="display:inline-flex;align-items:center;gap:5px;background:#0f1a2a;border:1px solid #2a4a6a;border-radius:20px;padding:4px 11px;margin:3px;color:#cbd5e1;font-size:.78rem;cursor:pointer">
      <input type="checkbox" id="est-col-${x.id}" ${cols[x.id] ? 'checked' : ''} onchange="_estColsSalvar()" style="cursor:pointer">${x.rot}</label>`).join('');
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('📦 Estoque')}
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
      <label style="color:#9fb3c8;font-size:.8rem">Posição em<br><input type="date" id="est-data" value="${_relDataHoje()}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Categoria<br>
        <select id="est-cat" style="margin-top:3px"><option value="">Todas</option></select></label>
      <label style="color:#9fb3c8;font-size:.8rem">Mostrar<br>
        <select id="est-filtro" style="margin-top:3px">
          <option value="saldo">Só com saldo</option>
          <option value="tudo">Todos os produtos</option>
          <option value="neg">Só saldo negativo</option>
          <option value="zero">Só zerados</option>
        </select></label>
      <label style="color:#9fb3c8;font-size:.8rem">Buscar<br>
        <input id="est-busca" placeholder="nome, código ou barras" onkeydown="if(event.key==='Enter')relatorioEstoqueCarregar()" style="margin-top:3px;width:210px"></label>
      <button onclick="relatorioEstoqueCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
      <button onclick="relatorioEstoqueXLSX()" style="padding:8px 14px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#16a34a;cursor:pointer;font-weight:600">⬇ Excel</button>
      <button onclick="relatorioEstoqueCSV()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;cursor:pointer;font-weight:600">⬇ CSV</button>
      <button onclick="window.print()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;cursor:pointer;font-weight:600">🖨 Imprimir</button>
    </div>
    <div style="margin-bottom:12px">
      <span style="color:#8a8f98;font-size:.75rem;margin-right:4px">Colunas:</span>${chks}
    </div>
    <div id="est-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioEstoqueCarregar();
}

// PostgREST devolve no máximo 1000 linhas por chamada. Sem paginar, o relatório
// de um posto grande sairia truncado sem avisar — e um estoque truncado parece
// certo, só que menor.
async function _estLerMovimento(eid, ateISO) {
  const linhas = [];
  for (let off = 0; off < 200000; off += 1000) {
    const { data, error } = await sb.from('oct_estoque_mov')
      .select('produto_id,qtd,tipo,ocorrido_em')
      .eq('empresa_id', eid).lte('ocorrido_em', ateISO)
      .order('id').range(off, off + 999);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

async function relatorioEstoqueCarregar() {
  const box = document.getElementById('est-corpo');
  if (!box) return;
  const eid = _relEid();
  if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
  const dia = document.getElementById('est-data')?.value || _relDataHoje();
  box.innerHTML = '<p style="color:#888">Carregando…</p>';

  let movs, prods;
  try {
    const ate = dia + 'T23:59:59-03:00';
    const r = await Promise.all([
      _estLerMovimento(eid, ate),
      sb.from('oct_produtos').select('id,codigo,nome,ean,unidade,categoria,preco_custo,preco_venda_a,ativo')
        .eq('empresa_id', eid).limit(20000),
    ]);
    movs = r[0];
    if (r[1].error) throw r[1].error;
    prods = r[1].data || [];
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171">Erro: ${e.message || e}</p>`;
    return;
  }

  if (!movs.length) {
    // saber se o posto NUNCA teve movimento ou se so' nao tinha ate' esta data
    // muda o que a pessoa precisa fazer -- entao pergunta em vez de supor
    const { count } = await sb.from('oct_estoque_mov')
      .select('id', { count: 'exact', head: true }).eq('empresa_id', eid);
    const nunca = !count;
    box.innerHTML = `
      <div style="background:#2a1f0a;border:1px solid #7c5e18;border-radius:8px;padding:14px 18px;max-width:680px">
        <div style="color:#fbbf24;font-weight:700;margin-bottom:8px">
          ${nunca ? 'Este posto ainda não tem inventário de abertura.' : 'Nenhum movimento até ' + _estDataBr(dia) + '.'}
        </div>
        <p style="color:#c8b88a;font-size:.84rem;line-height:1.55;margin:0">
          O saldo aqui é a soma do movimento — inventário de abertura + entradas − vendas —, não o campo
          <code>estoque</code> do cadastro, que só é somado pela nota e nunca baixado pela venda.
          ${nunca
            ? 'Sem um ponto de partida não há de onde contar, e inventar um número seria pior que não ter relatório. Gere no TecnoX o <strong>Saldo de estoque sintético com preço</strong> deste posto e peça a importação.'
            : 'Escolha uma data a partir do inventário de abertura.'}
        </p>
      </div>`;
    return;
  }

  // saldo e data do último movimento, por produto
  const saldo = {}, ultimo = {}, temInv = {};
  let inventarioEm = null;
  movs.forEach(m => {
    saldo[m.produto_id] = (saldo[m.produto_id] || 0) + Number(m.qtd || 0);
    if (!ultimo[m.produto_id] || m.ocorrido_em > ultimo[m.produto_id]) ultimo[m.produto_id] = m.ocorrido_em;
    if (m.tipo === 'inventario') {
      temInv[m.produto_id] = true;
      if (!inventarioEm || m.ocorrido_em > inventarioEm) inventarioEm = m.ocorrido_em;
    }
  });

  const cols = _estColsAtivas();
  const filtro = document.getElementById('est-filtro')?.value || 'saldo';
  const cat = document.getElementById('est-cat')?.value || '';
  const busca = (document.getElementById('est-busca')?.value || '').trim().toLowerCase();

  const cats = {};
  const linhas = [];
  prods.forEach(p => {
    const q = +(saldo[p.id] || 0).toFixed(3);
    if (!(p.id in saldo) && filtro !== 'tudo') return;
    if (filtro === 'saldo' && q === 0) return;
    if (filtro === 'neg' && q >= 0) return;
    if (filtro === 'zero' && q !== 0) return;
    const categoria = p.categoria || 'sem categoria';
    cats[categoria] = true;
    if (cat && categoria !== cat) return;
    if (busca && !((p.nome || '') + ' ' + (p.codigo || '') + ' ' + (p.ean || '')).toLowerCase().includes(busca)) return;
    const custo = Number(p.preco_custo || 0), venda = Number(p.preco_venda_a || 0);
    linhas.push({
      id: p.id, categoria, ean: p.ean || '', codigo: p.codigo || '', nome: p.nome || '',
      unidade: p.unidade || '', saldo: q, custo, custoTotal: +(q * custo).toFixed(2),
      venda, vendaTotal: +(q * venda).toFixed(2),
      margem: custo > 0 && venda > 0 ? +(((venda - custo) / custo) * 100).toFixed(1) : null,
      ultimo: ultimo[p.id] || null, semInv: !temInv[p.id],
    });
  });
  linhas.sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  window._estLinhas = linhas;
  window._estDia = dia;

  // preenche o seletor de categoria mantendo a escolha
  const selCat = document.getElementById('est-cat');
  if (selCat && selCat.options.length <= 1) {
    Object.keys(cats).sort().forEach(k => selCat.add(new Option(k, k)));
    selCat.value = cat;
  }

  const totQtd = linhas.reduce((s, l) => s + l.saldo, 0);
  const totCusto = linhas.reduce((s, l) => s + l.custoTotal, 0);
  const totVenda = linhas.reduce((s, l) => s + l.vendaTotal, 0);
  const neg = linhas.filter(l => l.saldo < 0);
  const semCusto = linhas.filter(l => l.saldo > 0 && !l.custo);

  const card = (t, v, cor) => `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
      <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${t}</div>
      <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px">${v}</div>
    </div>`;

  const th = (t, dir) => `<th style="padding:8px;text-align:${dir || 'left'};white-space:nowrap">${t}</th>`;
  const cab = th('Descrição')
    + (cols.ean ? th('Cód. barras') : '') + th('Código')
    + (cols.categoria ? th('Categoria') : '') + (cols.unidade ? th('Un') : '')
    + th('Saldo', 'right')
    + (cols.custo ? th('Custo unit.', 'right') : '') + (cols.custoTotal ? th('Custo total', 'right') : '')
    + (cols.venda ? th('Preço venda', 'right') : '') + (cols.vendaTotal ? th('Valor venda', 'right') : '')
    + (cols.margem ? th('Margem', 'right') : '') + (cols.ultimo ? th('Últ. mov.', 'right') : '');

  let corpo = '', grupoAtual = null, gQtd = 0, gCusto = 0, gN = 0;
  const nCols = cab.split('<th').length - 1;
  const fechaGrupo = () => grupoAtual === null ? '' : `
    <tr style="background:#10131d;border-bottom:2px solid #2a2d3e">
      <td colspan="${nCols}" style="padding:6px 8px;color:#7ec5a8;font-size:.78rem">
        ${gN} item(ns) · saldo <strong>${_estNum(gQtd, 3)}</strong> · custo <strong>${_relBRL(gCusto)}</strong>
      </td></tr>`;

  linhas.forEach(l => {
    if (l.categoria !== grupoAtual) {
      corpo += fechaGrupo();
      grupoAtual = l.categoria; gQtd = 0; gCusto = 0; gN = 0;
      corpo += `<tr style="background:#161b2b"><td colspan="${nCols}" style="padding:7px 8px;color:#f97316;font-weight:700;font-size:.82rem;text-transform:uppercase">${l.categoria}</td></tr>`;
    }
    gQtd += l.saldo; gCusto += l.custoTotal; gN++;
    const corSaldo = l.saldo < 0 ? '#f87171' : '#cbd5e1';
    // o produto que não tem inventário de abertura só enxerga o movimento novo:
    // marcar isso evita que um saldo parcial passe por saldo real
    const aviso = l.semInv ? ' <span title="sem inventário de abertura — só o movimento do Octano" style="color:#fbbf24">⚠</span>' : '';
    corpo += `<tr style="border-bottom:1px solid #1e2233">
      <td style="padding:6px 8px;color:#e6e6e6">${l.nome}${aviso}</td>
      ${cols.ean ? `<td style="padding:6px 8px;color:#8a8f98;font-size:.76rem">${l.ean}</td>` : ''}
      <td style="padding:6px 8px;color:#9ca3af;font-size:.78rem">${l.codigo}</td>
      ${cols.categoria ? `<td style="padding:6px 8px;color:#8a8f98;font-size:.76rem">${l.categoria}</td>` : ''}
      ${cols.unidade ? `<td style="padding:6px 8px;color:#8a8f98;font-size:.76rem">${l.unidade}</td>` : ''}
      <td style="padding:6px 8px;text-align:right;color:${corSaldo};font-weight:600">${_estNum(l.saldo, 3)}</td>
      ${cols.custo ? `<td style="padding:6px 8px;text-align:right;color:#9ca3af">${l.custo ? _estNum(l.custo, 3) : '<span style="color:#fbbf24">—</span>'}</td>` : ''}
      ${cols.custoTotal ? `<td style="padding:6px 8px;text-align:right;color:#cbd5e1">${_relBRL(l.custoTotal)}</td>` : ''}
      ${cols.venda ? `<td style="padding:6px 8px;text-align:right;color:#9ca3af">${l.venda ? _estNum(l.venda, 2) : '<span style="color:#fbbf24">—</span>'}</td>` : ''}
      ${cols.vendaTotal ? `<td style="padding:6px 8px;text-align:right;color:#5dca9a">${_relBRL(l.vendaTotal)}</td>` : ''}
      ${cols.margem ? `<td style="padding:6px 8px;text-align:right;color:${l.margem === null ? '#6b7280' : (l.margem < 0 ? '#f87171' : '#5dca9a')}">${l.margem === null ? '—' : l.margem + '%'}</td>` : ''}
      ${cols.ultimo ? `<td style="padding:6px 8px;text-align:right;color:#8a8f98;font-size:.76rem">${l.ultimo ? new Date(l.ultimo).toLocaleDateString('pt-BR') : '—'}</td>` : ''}
    </tr>`;
  });
  corpo += fechaGrupo();

  const diaInv = _estDiaLocal(inventarioEm);
  const avisoData = diaInv && dia < diaInv
    ? `<div style="background:#2a1f0a;border:1px solid #7c5e18;border-radius:8px;padding:10px 14px;margin-bottom:12px;color:#fbbf24;font-size:.82rem">
         A data pedida é <strong>anterior ao inventário de abertura</strong> (${_estDataBr(diaInv)}).
         Antes dele o Octano só enxerga o movimento que ele mesmo registrou — o número abaixo está incompleto.
       </div>` : '';

  box.innerHTML = `
    ${avisoData}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${card('Posição em', _estDataBr(dia), '#f97316')}
      ${card('Itens', linhas.length, '#e6e6e6')}
      ${card('Saldo total', _estNum(totQtd, 3), '#e6e6e6')}
      ${card('Custo total', _relBRL(totCusto), '#5dca9a')}
      ${cols.vendaTotal ? card('Valor de venda', _relBRL(totVenda), '#5dca9a') : ''}
      ${neg.length ? card('Saldo negativo', neg.length + ' item(ns)', '#f87171') : ''}
      ${semCusto.length ? card('Sem custo', semCusto.length + ' item(ns)', '#fbbf24') : ''}
    </div>
    ${neg.length ? `<div style="color:#f87171;font-size:.78rem;margin-bottom:10px">⚠ ${neg.length} item(ns) com saldo negativo — vendidos sem terem entrado. Aparecem em vermelho e somam no total.</div>` : ''}
    <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:60vh">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">${cab}</tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;
}

// O banco guarda timestamptz e devolve em UTC. O inventario carimbado em
// 03/09 23:59:59-03:00 volta como 04/09T02:59:59Z: comparar a string crua
// atrasa/adianta o dia em um. Aqui vira o dia LOCAL, que e' o que o operador
// tem na cabeca quando digita a data.
function _estDiaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString('sv-SE');
}

function _estDataBr(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(d || '');
}

// ---- exportação ----
function _estMatriz() {
  const cols = _estColsAtivas();
  const linhas = window._estLinhas || [];
  const cab = ['Descrição'];
  if (cols.ean) cab.push('Cód. barras');
  cab.push('Código');
  if (cols.categoria) cab.push('Categoria');
  if (cols.unidade) cab.push('Unidade');
  cab.push('Saldo');
  if (cols.custo) cab.push('Custo unit.');
  if (cols.custoTotal) cab.push('Custo total');
  if (cols.venda) cab.push('Preço venda');
  if (cols.vendaTotal) cab.push('Valor de venda');
  if (cols.margem) cab.push('Margem %');
  if (cols.ultimo) cab.push('Últ. movimento');
  const m = [cab];
  linhas.forEach(l => {
    const r = [l.nome];
    if (cols.ean) r.push(l.ean);
    r.push(l.codigo);
    if (cols.categoria) r.push(l.categoria);
    if (cols.unidade) r.push(l.unidade);
    r.push(l.saldo);
    if (cols.custo) r.push(l.custo || '');
    if (cols.custoTotal) r.push(l.custoTotal);
    if (cols.venda) r.push(l.venda || '');
    if (cols.vendaTotal) r.push(l.vendaTotal);
    if (cols.margem) r.push(l.margem === null ? '' : l.margem);
    if (cols.ultimo) r.push(l.ultimo ? new Date(l.ultimo).toLocaleDateString('pt-BR') : '');
    m.push(r);
  });
  return m;
}

function relatorioEstoqueCSV() {
  const m = _estMatriz();
  if (m.length < 2) { alert('Nada para exportar.'); return; }
  const cel = v => {
    const s = String(v === null || v === undefined ? '' : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // ; e BOM porque o Excel em pt-BR abre CSV com vírgula tudo numa coluna só
  const txt = '﻿' + m.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = 'estoque_' + (window._estDia || '') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// a biblioteca do Excel só é baixada AO CLICAR: 900 KB em toda abertura da tela,
// para um botão usado de vez em quando, não se paga
function _relCarregarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (window._relXlsxCarregando) return window._relXlsxCarregando;
  window._relXlsxCarregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => falha(new Error('não consegui baixar a biblioteca do Excel (sem internet?)'));
    document.head.appendChild(s);
  });
  return window._relXlsxCarregando;
}

async function relatorioEstoqueXLSX() {
  const m = _estMatriz();
  if (m.length < 2) { alert('Nada para exportar.'); return; }
  let XLSX;
  try { XLSX = await _relCarregarXLSX(); } catch (e) { alert(e.message); return; }
  const ws = XLSX.utils.aoa_to_sheet(m);
  ws['!cols'] = m[0].map((h, i) => ({ wch: i === 0 ? 44 : Math.max(11, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estoque ' + _estDataBr(window._estDia || ''));
  XLSX.writeFile(wb, 'estoque_' + (window._estDia || '') + '.xlsx');
}
