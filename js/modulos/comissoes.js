// ============================================================
// COMISSÕES por vendedor (item de loja + combustível)
// ------------------------------------------------------------
// Fonte: oct_fila_transmissao (status fila/transmitido) — todo casamento do
// período, com o VENDEDOR resolvido pelo núcleo (produto de loja = nome
// escolhido no lançamento; bomba = cartão convertido em nome no casamento).
// Os percentuais são da TELA (persistidos por empresa no localStorage): a
// comissão é uma política do gerente, não um dado do caixa.
// Vendedor em branco aparece como "(sem vendedor)" de propósito: é a fila de
// itens que ninguém vai receber comissão — o gerente cobra o registro.
// ============================================================

let _comDe = null, _comAte = null;
let _comDados = [];            // linhas cruas do período
let _comAberto = null;         // vendedor com detalhe expandido
let _comSemComissao = {};      // NOME (maiúsculo) -> true p/ produto com comissão DESLIGADA no cadastro

function _comBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _comHojeStr(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Percentuais guardados NA NUVEM (oct_empresas), por empresa: a política de
// comissão é uma só, não pode variar conforme o navegador que abriu a tela.
// O localStorage fica só como fallback enquanto as colunas não existirem.
let _comPctsCache = null;
function _comPctKey() { return 'oct_comissao_pct_' + (empresaAtiva() || 'x'); }
function _comPcts() {
  if (_comPctsCache) return _comPctsCache;
  try { return JSON.parse(localStorage.getItem(_comPctKey())) || { loja: 5, comb: 0 }; }
  catch (e) { return { loja: 5, comb: 0 }; }
}
async function _comCarregarPcts() {
  try {
    const { data, error } = await sb.from('oct_empresas')
      .select('comissao_pct_loja,comissao_pct_comb').eq('id', empresaAtiva()).single();
    if (!error && data && data.comissao_pct_loja != null) {
      _comPctsCache = { loja: Number(data.comissao_pct_loja), comb: Number(data.comissao_pct_comb || 0) };
    }
  } catch (e) { /* coluna ainda não criada: segue no localStorage */ }
  return _comPcts();
}
function _comLerPctsDaTela() {
  return {
    loja: Math.max(0, Number(document.getElementById('com-pct-loja')?.value || 0)),
    comb: Math.max(0, Number(document.getElementById('com-pct-comb')?.value || 0)),
  };
}
// digitou -> a tabela recalcula NA HORA (prévia), mas só vale depois do Salvar
function _comPreverPcts() {
  _comPctsCache = _comLerPctsDaTela();
  const msg = document.getElementById('com-pct-msg');
  if (msg) { msg.textContent = 'alterado — clique em Salvar'; msg.style.color = '#fbbf24'; }
  _comRenderTabela();
}
async function _comSalvarPcts() {
  const p = _comLerPctsDaTela();
  _comPctsCache = p;
  localStorage.setItem(_comPctKey(), JSON.stringify(p));   // fallback local
  const msg = document.getElementById('com-pct-msg');
  try {
    const { error } = await sb.from('oct_empresas')
      .update({ comissao_pct_loja: p.loja, comissao_pct_comb: p.comb })
      .eq('id', empresaAtiva());
    if (error) throw error;
    if (msg) { msg.textContent = '✓ salvo para a empresa'; msg.style.color = '#4ade80'; }
  } catch (e) {
    if (msg) { msg.textContent = '⚠ salvo só neste navegador (rode o SQL das colunas p/ valer em todos)'; msg.style.color = '#f59e0b'; }
  }
  _comRenderTabela();
}

async function moduloComissoes() {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  _comDe = _comDe || _comHojeStr(ini);
  _comAte = _comAte || _comHojeStr(hoje);
  const p = await _comCarregarPcts();
  document.getElementById('conteudo').innerHTML = `
    <div style="padding:20px">
      <h2 style="color:#f97316;margin-bottom:4px">💰 Comissões por vendedor</h2>
      <p style="color:#888;font-size:0.82rem;margin-bottom:14px">
        Base: itens casados no PDV (fila + transmitidos), com o vendedor registrado no lançamento.
        Combustível usa o frentista do cartão. Percentuais ficam salvos neste navegador.
      </p>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
        <div><label style="color:#888;font-size:0.72rem">De</label><br>
          <input id="com-de" type="date" value="${_comDe}" style="padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#eee"></div>
        <div><label style="color:#888;font-size:0.72rem">Até</label><br>
          <input id="com-ate" type="date" value="${_comAte}" style="padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#eee"></div>
        <div><label style="color:#888;font-size:0.72rem">% loja (itens)</label><br>
          <input id="com-pct-loja" type="number" step="0.1" min="0" value="${p.loja}" oninput="_comPreverPcts()"
            style="width:90px;padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#4ade80"></div>
        <div><label style="color:#888;font-size:0.72rem">% combustível</label><br>
          <input id="com-pct-comb" type="number" step="0.01" min="0" value="${p.comb}" oninput="_comPreverPcts()"
            style="width:90px;padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#38bdf8"></div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button onclick="_comSalvarPcts()" style="padding:9px 14px;border-radius:6px;border:none;background:#14532d;color:#4ade80;font-weight:700;cursor:pointer">💾 Salvar %</button>
          <span id="com-pct-msg" style="font-size:0.68rem;color:#667"></span>
        </div>
        <button onclick="_comBuscar()" style="padding:9px 18px;border-radius:6px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">Buscar</button>
        <button onclick="_comCategorias()" style="padding:9px 14px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#60a5fa;cursor:pointer">⚙ Comissão por categoria</button>
      </div>
      <div id="com-cats" style="display:none;margin-bottom:14px"></div>
      <div id="com-corpo"><p style="color:#666;padding:14px">Carregando…</p></div>
    </div>`;
  _comBuscar();
}

// ---------- COMISSÃO POR CATEGORIA (liga/desliga em massa) ----------
// Em vez de abrir produto por produto, o gerente decide por categoria:
// "Lubrificantes pagam, Cigarros não" — um clique atualiza todos os produtos
// daquela categoria (UPDATE em massa no paga_comissao).
async function _comCategorias() {
  const box = document.getElementById('com-cats');
  if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<p style="color:#666;padding:8px">Carregando categorias…</p>';
  const eid = empresaAtiva();
  const { data, error } = await sb.from('oct_produtos')
    .select('categoria,paga_comissao').eq('empresa_id', eid);
  if (error) { box.innerHTML = `<p style="color:#f87171;padding:8px">Erro: ${error.message} (a coluna paga_comissao existe?)</p>`; return; }
  const cats = {};
  (data || []).forEach(p => {
    const c = (p.categoria || '').trim() || '(sem categoria)';
    const g = cats[c] || (cats[c] = { total: 0, pagam: 0 });
    g.total += 1;
    if (p.paga_comissao !== false) g.pagam += 1;
  });
  const linhas = Object.keys(cats).sort().map(c => {
    const g = cats[c];
    const estado = g.pagam === g.total ? '<span style="color:#4ade80">todos pagam</span>'
      : g.pagam === 0 ? '<span style="color:#f87171">nenhum paga</span>'
      : `<span style="color:#fbbf24">${g.pagam} de ${g.total} pagam</span>`;
    const esc = c.replace(/'/g, "\\'");
    return `<tr style="border-bottom:1px solid #1c1f2e">
      <td style="padding:7px 10px;font-weight:600">${c}</td>
      <td style="padding:7px 10px;text-align:right;color:#9aa">${g.total} produto(s)</td>
      <td style="padding:7px 10px">${estado}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap">
        <button onclick="_comCategoriaSet('${esc}', true)" style="padding:5px 12px;border-radius:5px;border:none;background:#14532d;color:#4ade80;cursor:pointer;font-size:0.76rem">✓ Pagar comissão</button>
        <button onclick="_comCategoriaSet('${esc}', false)" style="padding:5px 12px;border-radius:5px;border:none;background:#450a0a;color:#f87171;cursor:pointer;font-size:0.76rem">✗ Não pagar</button>
      </td></tr>`;
  }).join('');
  box.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr style="color:#888;background:#0f1119;text-align:left">
          <th style="padding:8px 10px">Categoria</th><th style="padding:8px 10px;text-align:right">Produtos</th>
          <th style="padding:8px 10px">Situação</th><th></th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="4" style="padding:12px;color:#666">Nenhum produto cadastrado.</td></tr>'}</tbody>
      </table>
    </div>
    <p style="color:#555;font-size:0.7rem;margin-top:6px">O clique atualiza TODOS os produtos da categoria de uma vez.
    Depois dá para ajustar um produto específico no cadastro (Produtos &gt; Paga comissão).</p>`;
}

async function _comCategoriaSet(cat, paga) {
  const eid = empresaAtiva();
  let q = sb.from('oct_produtos').update({ paga_comissao: paga }).eq('empresa_id', eid);
  // "(sem categoria)" cobre NULL e vazio — dois updates, o filtro or do
  // PostgREST não mistura bem com update
  let error = null;
  if (cat === '(sem categoria)') {
    ({ error } = await sb.from('oct_produtos').update({ paga_comissao: paga }).eq('empresa_id', eid).is('categoria', null));
    if (!error) ({ error } = await sb.from('oct_produtos').update({ paga_comissao: paga }).eq('empresa_id', eid).eq('categoria', ''));
  } else {
    ({ error } = await q.eq('categoria', cat));
  }
  if (error) { alert('Erro ao atualizar: ' + error.message); return; }
  document.getElementById('com-cats').style.display = 'none';
  await _comCategorias();          // reabre com a situação nova
  _comBuscar();                    // recalcula a base da comissão
}

async function _comBuscar() {
  _comDe = document.getElementById('com-de')?.value || _comDe;
  _comAte = document.getElementById('com-ate')?.value || _comAte;
  const eid = empresaAtiva();
  const corpo = document.getElementById('com-corpo');
  if (!eid) { corpo.innerHTML = '<p style="color:#f87171;padding:14px">Selecione uma empresa.</p>'; return; }
  corpo.innerHTML = '<p style="color:#666;padding:14px">Carregando…</p>';
  // quais produtos têm a comissão DESLIGADA no cadastro (Produtos > Paga comissão)
  _comSemComissao = {};
  try {
    const { data: prods } = await sb.from('oct_produtos')
      .select('nome,paga_comissao').eq('empresa_id', eid).eq('paga_comissao', false);
    (prods || []).forEach(p => { _comSemComissao[String(p.nome || '').trim().toUpperCase()] = true; });
  } catch (e) { /* coluna ainda não criada: todo produto comissiona */ }
  // paginado: o PostgREST corta em 1000 linhas e um mês passa disso
  const linhas = [];
  for (let pg = 0; pg < 20; pg++) {
    try {
      const { data, error } = await sb.from('oct_fila_transmissao')
        .select('vendedor,descricao,litros,valor,desconto,acrescimo,ocorrido_em,criado_em,status,marca')
        .eq('empresa_id', eid).in('status', ['fila', 'transmitido'])
        .gte('criado_em', _comDe).lte('criado_em', _comAte + 'T23:59:59')
        .order('criado_em', { ascending: true })
        .range(pg * 1000, pg * 1000 + 999);
      if (error) { corpo.innerHTML = `<p style="color:#f87171;padding:14px">Erro: ${error.message}</p>`; return; }
      if (!data || !data.length) break;
      linhas.push(...data);
      if (data.length < 1000) break;
    } catch (e) { break; }
  }
  _comDados = linhas;
  _comAberto = null;
  _comRenderTabela();
}

function _comRenderTabela() {
  const corpo = document.getElementById('com-corpo');
  if (!corpo) return;
  const p = _comPcts();
  if (!_comDados.length) {
    corpo.innerHTML = '<p style="color:#666;padding:14px">Nenhum item casado no período.</p>';
    return;
  }
  // agrupa por vendedor; "(sem vendedor)" fica visível para o gerente cobrar.
  // Produto com "Paga comissão = Não" no cadastro fica FORA da base (some do
  // valor de loja do vendedor), mas é contado à parte para transparência.
  const por = {};
  let foraQtd = 0, foraVal = 0;
  _comDados.forEach(f => {
    const nome = (f.vendedor || '').trim() || '(sem vendedor)';
    const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
    const litros = Number(f.litros || 0);
    if (litros <= 0 && _comSemComissao[String(f.descricao || '').trim().toUpperCase()]) {
      foraQtd += 1; foraVal += vf;
      return;
    }
    const g = por[nome] || (por[nome] = { lojaQtd: 0, lojaVal: 0, combL: 0, combVal: 0, itens: [] });
    if (litros > 0) { g.combL += litros; g.combVal += vf; }
    else { g.lojaQtd += 1; g.lojaVal += vf; }
    g.itens.push(f);
  });
  const nomes = Object.keys(por).sort((a, b) => {
    if (a === '(sem vendedor)') return 1;
    if (b === '(sem vendedor)') return -1;
    const ca = por[a].lojaVal * p.loja + por[a].combVal * p.comb;
    const cb = por[b].lojaVal * p.loja + por[b].combVal * p.comb;
    return cb - ca;
  });
  let tLoja = 0, tComb = 0, tCom = 0;
  const linhas = nomes.map(n => {
    const g = por[n];
    const semVend = n === '(sem vendedor)';
    const comissao = semVend ? 0 : g.lojaVal * p.loja / 100 + g.combVal * p.comb / 100;
    tLoja += g.lojaVal; tComb += g.combVal; tCom += comissao;
    const aberto = _comAberto === n;
    const detalhe = !aberto ? '' : `<tr><td colspan="7" style="background:#0b0d14;padding:10px 16px">
        <table style="width:100%;border-collapse:collapse;font-size:0.76rem">
          <thead><tr style="color:#667"><th style="text-align:left;padding:4px">Data</th>
            <th style="text-align:left;padding:4px">Item</th><th style="text-align:right;padding:4px">Litros</th>
            <th style="text-align:right;padding:4px">Valor</th><th style="text-align:left;padding:4px">Marca</th></tr></thead>
          <tbody>${g.itens.map(i => {
            const dh = String(i.ocorrido_em || i.criado_em || '').slice(0, 16).replace('T', ' ');
            const vf = Number(i.valor || 0) - Number(i.desconto || 0) + Number(i.acrescimo || 0);
            return `<tr style="border-top:1px solid #1a1d2e;color:#9aa">
              <td style="padding:4px">${dh}</td><td style="padding:4px">${i.descricao || '—'}</td>
              <td style="padding:4px;text-align:right">${Number(i.litros || 0) ? Number(i.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
              <td style="padding:4px;text-align:right;color:#ddd">${_comBRL(vf)}</td>
              <td style="padding:4px;color:#667">${i.marca || ''}</td></tr>`;
          }).join('')}</tbody></table></td></tr>`;
    return `<tr onclick="_comAberto = _comAberto === '${n.replace(/'/g, "\\'")}' ? null : '${n.replace(/'/g, "\\'")}'; _comRenderTabela()"
        style="border-bottom:1px solid #1c1f2e;cursor:pointer;${semVend ? 'color:#f59e0b' : ''}">
      <td style="padding:9px 10px;font-weight:600">${aberto ? '▾' : '▸'} ${n}</td>
      <td style="padding:9px 10px;text-align:right">${g.lojaQtd}</td>
      <td style="padding:9px 10px;text-align:right">${_comBRL(g.lojaVal)}</td>
      <td style="padding:9px 10px;text-align:right">${g.combL ? g.combL.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' L' : '—'}</td>
      <td style="padding:9px 10px;text-align:right">${_comBRL(g.combVal)}</td>
      <td style="padding:9px 10px;text-align:right;color:#4ade80;font-weight:700">${semVend ? '—' : _comBRL(comissao)}</td>
      <td style="padding:9px 10px;color:#667;font-size:0.74rem">${g.itens.length} item(ns)</td>
    </tr>${detalhe}`;
  }).join('');
  corpo.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.84rem;background:#13151f;border-radius:10px;overflow:hidden">
      <thead><tr style="color:#888;background:#0f1119;text-align:left">
        <th style="padding:9px 10px">Vendedor</th>
        <th style="padding:9px 10px;text-align:right">Itens loja</th>
        <th style="padding:9px 10px;text-align:right">Valor loja</th>
        <th style="padding:9px 10px;text-align:right">Combustível</th>
        <th style="padding:9px 10px;text-align:right">Valor comb.</th>
        <th style="padding:9px 10px;text-align:right">Comissão (${p.loja}% / ${p.comb}%)</th>
        <th></th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr style="background:#0f1119;font-weight:700">
        <td style="padding:9px 10px;color:#888">TOTAL</td><td></td>
        <td style="padding:9px 10px;text-align:right">${_comBRL(tLoja)}</td><td></td>
        <td style="padding:9px 10px;text-align:right">${_comBRL(tComb)}</td>
        <td style="padding:9px 10px;text-align:right;color:#4ade80">${_comBRL(tCom)}</td><td></td>
      </tr></tfoot>
    </table>
    <p style="color:#555;font-size:0.72rem;margin-top:8px">
      Clique no vendedor para abrir o detalhe item a item. "(sem vendedor)" são itens casados sem
      registro de quem vendeu — não entram na comissão.
      ${foraQtd ? `<br><span style="color:#8a6d3b">${foraQtd} item(ns) de produtos com comissão desligada no cadastro (${_comBRL(foraVal)}) ficaram fora da base.</span>` : ''}
    </p>`;
}
