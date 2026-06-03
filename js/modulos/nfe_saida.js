// ============================================================
// MÓDULO NF-e DE SAÍDA (modelo 55) — emissão de venda para PJ
// Etapa 1: modelagem e tela de rascunho (SEM transmissão à SEFAZ ainda)
// ============================================================

let _saidaEmpresaId = null;
let _saidaEmpresa = null;
let _saidaDados = [];          // lista de notas de saída
let _saidaItens = [];          // itens da nota em edição
let _saidaProdutos = [];       // cache de produtos da empresa
let _saidaPessoas = [];        // cache de pessoas (destinatários)
let _saidaEditId = null;       // id da nota sendo editada (null = nova)

async function moduloNfeSaida() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis').select('empresa_id, oct_empresas(*)')
    .eq('id', session.user.id).single();
  _saidaEmpresaId = perfil?.empresa_id;
  _saidaEmpresa = perfil?.oct_empresas;
  if (!_saidaEmpresaId) {
    conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>';
    return;
  }

  // carrega caches
  const [{ data: prods }, { data: pess }] = await Promise.all([
    sb.from('oct_produtos').select('id,nome,codigo,unidade,preco_venda_a,preco_custo,ncm,cest,cfop,cod_anp,desc_anp').eq('empresa_id', _saidaEmpresaId).eq('ativo', true).order('nome'),
    sb.from('oct_pessoas').select('id,nome,documento,ie,email,endereco,cidade,uf,tipo').eq('empresa_id', _saidaEmpresaId).eq('ativo', true).order('nome'),
  ]);
  _saidaProdutos = prods || [];
  _saidaPessoas = pess || [];

  conteudo.innerHTML = `
    ${nfeSaidaStyles()}
    <div class="ns-janela">
      <div class="ns-titulo">
        <span>Movimento nota fiscal</span>
        <button onclick="navegarPara('empresa')" class="ns-fechar" title="Fechar">✕</button>
      </div>
      <div class="ns-toolbar-top">
        <button class="ns-tb-btn" onclick="nfeSaidaNova()"><div class="ns-tb-ico">＋</div><div>F1 · Incluir</div></button>
        <button class="ns-tb-btn" onclick="nfeSaidaCarregarLista()"><div class="ns-tb-ico">≣</div><div>F6 · Listar</div></button>
        <div class="ns-tb-paginfo" id="ns-paginfo">${_saidaDados.length} nota(s)</div>
      </div>
      <div class="ns-filtros-topo">
        <span style="color:#555;font-size:0.78rem">Busca rápida:</span>
        <input id="ns-busca" type="text" placeholder="Seq, número, destinatário..." oninput="nfeSaidaRenderLista()" />
      </div>
      <div class="ns-corpo">
        <div class="ns-abas">
          <div class="ns-aba" onclick="navegarPara('nfe')">
            <span class="ns-aba-ico">📥</span><span>Nota fiscal de entrada</span>
          </div>
          <div class="ns-aba ativo">
            <span class="ns-aba-ico">📤</span><span>Nota fiscal de saída</span>
          </div>
        </div>
        <div class="ns-painel" id="ns-conteudo">
          <p style="color:#888;padding:20px">Carregando notas...</p>
        </div>
      </div>
    </div>
  `;
  await nfeSaidaCarregarLista();
}

async function nfeSaidaCarregarLista() {
  const area = document.getElementById('ns-conteudo');
  if (!area) return;
  const { data } = await sb.from('oct_nfe_saida')
    .select('*, oct_pessoas(nome,documento)')
    .eq('empresa_id', _saidaEmpresaId)
    .order('criado_em', { ascending: false });
  _saidaDados = data || [];
  nfeSaidaRenderLista();
}

function nfeSaidaStatusBadge(s) {
  const map = {
    rascunho:   ['#2a2d3e', '#aaa', 'Rascunho'],
    validada:   ['#1a2a3a', '#60a5fa', 'Validada'],
    transmitida:['#2a2300', '#fbbf24', 'Transmitida'],
    autorizada: ['#0f2a0f', '#4caf50', 'Autorizada'],
    rejeitada:  ['#2a0f0f', '#f87171', 'Rejeitada'],
    cancelada:  ['#2a0f0f', '#f87171', 'Cancelada'],
  };
  const c = map[s] || map.rascunho;
  return `<span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;background:${c[0]};color:${c[1]}">${c[2]}</span>`;
}

function nfeSaidaRenderLista() {
  const area = document.getElementById('ns-conteudo');
  if (!area) return;
  const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const fmtData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

  // filtro pela busca rápida do topo
  const termo = (document.getElementById('ns-busca')?.value || '').toLowerCase().trim();
  const dados = !termo ? _saidaDados : _saidaDados.filter(n => {
    const alvo = [n.numero, n.serie, n.oct_pessoas?.nome, n.dest_nome, n.dest_documento, n.chave_nfe]
      .filter(Boolean).join(' ').toLowerCase();
    return alvo.includes(termo);
  });

  const pag = document.getElementById('ns-paginfo');
  if (pag) pag.textContent = `${dados.length} nota(s)`;

  const linhas = dados.map(n => `
    <tr>
      <td><strong>${n.numero || '—'}</strong></td>
      <td>${n.serie || 1}</td>
      <td>${fmtData(n.data_emissao)}</td>
      <td title="${(n.oct_pessoas?.nome||n.dest_nome||'').replace(/"/g,'&quot;')}">${n.oct_pessoas?.nome || n.dest_nome || '—'}</td>
      <td style="text-align:right;font-weight:600">${fmt(n.valor_total)}</td>
      <td>${nfeSaidaStatusBadge(n.status)}</td>
      <td>
        <button class="ns-btn-linha" onclick="nfeSaidaEditar('${n.id}')">${n.status==='rascunho'?'✏️ Editar':'👁 Ver'}</button>
        ${n.status==='rascunho'?`<button class="ns-btn-linha" style="border-color:#5a2a2a;color:#f44" onclick="nfeSaidaExcluir('${n.id}')">🗑 Excluir</button>`:''}
      </td>
    </tr>`).join('');

  area.innerHTML = `
    <div style="overflow-x:auto">
      <table class="ns-tabela">
        <thead>
          <tr>
            <th style="width:80px">Nº</th>
            <th style="width:50px">Série</th>
            <th style="width:100px">Emissão</th>
            <th>Destinatário</th>
            <th style="width:120px;text-align:right">Valor</th>
            <th style="width:100px">Status</th>
            <th style="width:160px">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${linhas || `<tr><td colspan="7" style="text-align:center;color:#888;padding:30px">${termo?'Nenhuma nota encontrada para a busca.':'Nenhuma nota de saída. Clique em "Incluir" para começar.'}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function nfeSaidaStyles() {
  return `<style>
    .ns-janela{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;max-width:1500px;margin:0 auto;box-shadow:0 8px 30px rgba(0,0,0,.4)}
    .ns-titulo{background:linear-gradient(180deg,#2a2d3e,#1a1d2e);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;color:#e0e0e0;border-bottom:1px solid #2a2d3e}
    .ns-fechar{background:transparent;border:none;color:#888;cursor:pointer;font-size:1.1rem}
    .ns-toolbar-top{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#0f1117;border-bottom:1px solid #2a2d3e;flex-wrap:wrap}
    .ns-tb-btn{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:58px;padding:6px 8px;background:transparent;border:1px solid transparent;border-radius:6px;color:#aaa;cursor:pointer;font-size:0.68rem}
    .ns-tb-btn:hover{background:#1a1d2e;color:#e0e0e0}
    .ns-tb-ico{font-size:1.1rem}
    .ns-tb-paginfo{margin-left:auto;color:#666;font-size:0.75rem;padding-right:8px}
    .ns-filtros-topo{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#10121a;border-bottom:1px solid #2a2d3e}
    .ns-filtros-topo input{flex:1;max-width:400px;padding:6px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.82rem}
    .ns-corpo{display:flex;min-height:400px}
    .ns-abas{width:230px;background:#0f1117;border-right:1px solid #2a2d3e;padding:8px 0;flex-shrink:0}
    .ns-aba{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;color:#aaa;font-size:0.86rem;border-left:3px solid transparent}
    .ns-aba:hover{background:#1a1d2e;color:#e0e0e0}
    .ns-aba.ativo{background:#13151f;color:#60a5fa;border-left-color:#60a5fa;font-weight:600}
    .ns-aba-ico{font-size:1.1rem}
    .ns-painel{flex:1;min-width:0;padding:16px;overflow:auto}
    .ns-btn-novo{background:#1a3a1a;border:1px solid #2a5a2a;color:#4caf50;padding:9px 16px;border-radius:7px;cursor:pointer;font-size:0.86rem;font-weight:600}
    .ns-btn-novo:hover{background:#224a22}
    .ns-tabela{width:100%;border-collapse:collapse;font-size:0.84rem}
    .ns-tabela th{text-align:left;padding:8px 10px;color:#888;font-weight:500;border-bottom:1px solid #2a2d3e;font-size:0.76rem}
    .ns-tabela td{padding:9px 10px;border-bottom:1px solid #1a1d2e;color:#ddd}
    .ns-tabela tbody tr:hover{background:#1a1d2e}
    .ns-btn-linha{background:#1a1d2e;border:1px solid #2a2d3e;color:#ccc;padding:4px 9px;border-radius:5px;cursor:pointer;font-size:0.74rem;margin-right:4px}
    .ns-btn-linha:hover{background:#2a2d3e}
    .ns-form-sec{background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:14px;margin-bottom:14px}
    .ns-form-sec h3{color:#60a5fa;font-size:0.9rem;margin:0 0 12px}
    .ns-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .ns-fg{display:flex;flex-direction:column;gap:4px}
    .ns-fg.span2{grid-column:span 2}
    .ns-fg label{font-size:0.74rem;color:#888}
    .ns-fg input,.ns-fg select{padding:7px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem}
  </style>`;
}

// ============================================================
// FORMULÁRIO DE EMISSÃO (nova nota / editar rascunho)
// ============================================================

function nfeSaidaNova() {
  _saidaEditId = null;
  _saidaItens = [];
  nfeSaidaRenderForm(null);
}

async function nfeSaidaEditar(id) {
  _saidaEditId = id;
  const { data: nota } = await sb.from('oct_nfe_saida').select('*').eq('id', id).single();
  const { data: itens } = await sb.from('oct_nfe_saida_itens').select('*').eq('nfe_saida_id', id).order('numero_item');
  _saidaItens = (itens || []).map(it => ({
    produto_id: it.produto_id, codigo: it.codigo, descricao: it.descricao,
    ncm: it.ncm, cest: it.cest, cfop: it.cfop, unidade: it.unidade,
    quantidade: Number(it.quantidade), valor_unitario: Number(it.valor_unitario),
    valor_total: Number(it.valor_total), cfop_edit: it.cfop,
    cst_icms: it.cst_icms, cod_anp: it.cod_anp, desc_anp: it.desc_anp,
  }));
  nfeSaidaRenderForm(nota);
}

function nfeSaidaRenderForm(nota) {
  const area = document.getElementById('ns-conteudo');
  if (!area) return;
  const somenteLeitura = nota && nota.status !== 'rascunho';
  const dest = nota?.destinatario_id || '';

  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h2 style="color:#e0e0e0;font-size:1rem;margin:0">${nota ? (somenteLeitura?'👁 NF-e Saída '+(nota.numero||''):'✏️ Editar rascunho') : '＋ Nova NF-e de Saída'}</h2>
      <button class="ns-btn-linha" onclick="nfeSaidaCarregarLista()">← Voltar à lista</button>
    </div>

    <div class="ns-form-sec">
      <h3>👤 Destinatário</h3>
      <div class="ns-grid">
        <div class="ns-fg span2">
          <label>Cliente / Destinatário *</label>
          <select id="ns-dest" ${somenteLeitura?'disabled':''} onchange="nfeSaidaPreencherDest()">
            <option value="">— Selecione —</option>
            ${_saidaPessoas.map(p=>`<option value="${p.id}" ${p.id===dest?'selected':''}>${p.nome}${p.documento?' ('+p.documento+')':''}</option>`).join('')}
          </select>
        </div>
        <div class="ns-fg">
          <label>Natureza da operação</label>
          <input id="ns-natop" value="${nota?.natureza_op||'VENDA DE MERCADORIA'}" ${somenteLeitura?'disabled':''} />
        </div>
        <div class="ns-fg">
          <label>Série</label>
          <input id="ns-serie" type="number" value="${nota?.serie||1}" ${somenteLeitura?'disabled':''} />
        </div>
      </div>
    </div>

    <div class="ns-form-sec">
      <h3>📦 Itens</h3>
      ${somenteLeitura?'':`
      <div class="ns-grid" style="margin-bottom:12px;align-items:end">
        <div class="ns-fg span2">
          <label>Produto</label>
          <select id="ns-item-prod">
            <option value="">— Selecione um produto —</option>
            ${_saidaProdutos.map(p=>`<option value="${p.id}">${p.nome}${p.codigo?' ['+p.codigo+']':''}</option>`).join('')}
          </select>
        </div>
        <div class="ns-fg">
          <label>Quantidade</label>
          <input id="ns-item-qtd" type="number" step="0.001" value="1" />
        </div>
        <div class="ns-fg">
          <label>Vlr unitário</label>
          <input id="ns-item-vlr" type="number" step="0.0001" value="0" />
        </div>
      </div>
      <button class="ns-btn-linha" style="border-color:#2a5a2a;color:#4caf50" onclick="nfeSaidaAddItem()">＋ Adicionar item</button>
      `}
      <div id="ns-itens-lista" style="margin-top:12px"></div>
    </div>

    <div class="ns-form-sec">
      <h3>💰 Totais</h3>
      <div id="ns-totais" style="font-size:0.9rem"></div>
    </div>

    ${somenteLeitura ? `
      <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:12px;color:#fbbf24;font-size:0.84rem">
        Esta nota está com status <strong>${nota.status}</strong>${nota.protocolo?' (protocolo '+nota.protocolo+')':''}. ${nota.motivo_rejeicao?'<br>Motivo: '+nota.motivo_rejeicao:''}
      </div>
    ` : `
      <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
        <button class="ns-btn-novo" onclick="nfeSaidaSalvar()">💾 Salvar rascunho</button>
        <span id="ns-msg" style="font-size:0.85rem"></span>
      </div>
      <div style="background:#0f1a2a;border:1px solid #2a4a6a;border-radius:8px;padding:10px;margin-top:12px;font-size:0.78rem;color:#7cc4ff">
        ℹ️ Por enquanto a nota é salva como <strong>rascunho</strong>. A transmissão à SEFAZ (assinatura + envio) será adicionada na próxima etapa, no servidor.
      </div>
    `}
  `;
  nfeSaidaRenderItens(somenteLeitura);
}

function nfeSaidaPreencherDest() {
  // (placeholder) — poderia mostrar dados do destinatário; o id é lido ao salvar
}

function nfeSaidaAddItem() {
  const prodId = document.getElementById('ns-item-prod')?.value;
  const qtd = parseFloat(document.getElementById('ns-item-qtd')?.value) || 0;
  const vlr = parseFloat(document.getElementById('ns-item-vlr')?.value) || 0;
  if (!prodId) { nfeSaidaMsg('Selecione um produto.', 'erro'); return; }
  if (qtd <= 0) { nfeSaidaMsg('Quantidade deve ser maior que zero.', 'erro'); return; }
  const p = _saidaProdutos.find(x => x.id === prodId);
  if (!p) return;
  _saidaItens.push({
    produto_id: p.id, codigo: p.codigo, descricao: p.nome,
    ncm: p.ncm, cest: p.cest, cfop: p.cfop || '5102', unidade: p.unidade || 'UN',
    quantidade: qtd, valor_unitario: vlr || Number(p.preco_venda_a) || 0,
    valor_total: qtd * (vlr || Number(p.preco_venda_a) || 0),
    cst_icms: '', cod_anp: p.cod_anp, desc_anp: p.desc_anp,
  });
  // reset campos
  document.getElementById('ns-item-prod').value = '';
  document.getElementById('ns-item-qtd').value = '1';
  document.getElementById('ns-item-vlr').value = '0';
  nfeSaidaRenderItens(false);
}

function nfeSaidaRemItem(idx) {
  _saidaItens.splice(idx, 1);
  nfeSaidaRenderItens(false);
}

function nfeSaidaRenderItens(somenteLeitura) {
  const div = document.getElementById('ns-itens-lista');
  if (!div) return;
  const fmt = v => Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  if (!_saidaItens.length) {
    div.innerHTML = `<p style="color:#888;font-size:0.82rem">Nenhum item adicionado.</p>`;
    nfeSaidaCalcTotais();
    return;
  }
  div.innerHTML = `
    <table class="ns-tabela">
      <thead><tr>
        <th>Produto</th><th style="width:80px">CFOP</th><th style="width:70px">Un</th>
        <th style="width:90px;text-align:right">Qtd</th><th style="width:110px;text-align:right">Vlr Unit</th>
        <th style="width:110px;text-align:right">Total</th>${somenteLeitura?'':'<th style="width:40px"></th>'}
      </tr></thead>
      <tbody>
        ${_saidaItens.map((it,i)=>`
          <tr>
            <td>${it.descricao}${it.cod_anp?`<br><span style="font-size:0.66rem;color:#fbbf24">⛽ ANP ${it.cod_anp}</span>`:''}</td>
            <td>${somenteLeitura?(it.cfop||'—'):`<input value="${it.cfop||''}" style="width:60px;padding:3px 5px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.8rem" onchange="_saidaItens[${i}].cfop=this.value" />`}</td>
            <td>${it.unidade}</td>
            <td style="text-align:right">${fmt(it.quantidade)}</td>
            <td style="text-align:right">${fmt(it.valor_unitario)}</td>
            <td style="text-align:right;font-weight:600">${fmt(it.valor_total)}</td>
            ${somenteLeitura?'':`<td><button class="ns-btn-linha" style="border-color:#5a2a2a;color:#f44;padding:2px 7px" onclick="nfeSaidaRemItem(${i})">✕</button></td>`}
          </tr>`).join('')}
      </tbody>
    </table>
  `;
  nfeSaidaCalcTotais();
}

function nfeSaidaCalcTotais() {
  const div = document.getElementById('ns-totais');
  if (!div) return;
  const vProd = _saidaItens.reduce((s,it)=>s+Number(it.valor_total||0),0);
  const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  div.innerHTML = `
    <div style="display:flex;gap:30px;flex-wrap:wrap">
      <div><span style="color:#888;font-size:0.78rem">Valor dos produtos</span><br><strong>${fmt(vProd)}</strong></div>
      <div><span style="color:#888;font-size:0.78rem">Total da nota</span><br><strong style="color:#4caf50;font-size:1.1rem">${fmt(vProd)}</strong></div>
    </div>
  `;
  div.dataset.vprod = vProd;
}

function nfeSaidaMsg(txt, tipo) {
  const el = document.getElementById('ns-msg');
  if (!el) return;
  const cor = tipo==='erro'?'#f87171':tipo==='ok'?'#4caf50':'#7cc4ff';
  el.textContent = txt; el.style.color = cor;
}

async function nfeSaidaSalvar() {
  const destId = document.getElementById('ns-dest')?.value;
  if (!destId) { nfeSaidaMsg('Selecione o destinatário.', 'erro'); return; }
  if (!_saidaItens.length) { nfeSaidaMsg('Adicione ao menos um item.', 'erro'); return; }
  const dest = _saidaPessoas.find(p => p.id === destId);
  const vProd = _saidaItens.reduce((s,it)=>s+Number(it.valor_total||0),0);

  const cab = {
    empresa_id: _saidaEmpresaId,
    serie: parseInt(document.getElementById('ns-serie')?.value) || 1,
    modelo: '55',
    natureza_op: document.getElementById('ns-natop')?.value || 'VENDA',
    destinatario_id: destId,
    dest_nome: dest?.nome, dest_documento: dest?.documento, dest_ie: dest?.ie, dest_email: dest?.email,
    valor_produtos: vProd, valor_total: vProd,
    status: 'rascunho',
    atualizado_em: new Date().toISOString(),
  };

  let nfeId = _saidaEditId;
  if (nfeId) {
    const { error } = await sb.from('oct_nfe_saida').update(cab).eq('id', nfeId);
    if (error) { nfeSaidaMsg('Erro: ' + error.message, 'erro'); return; }
    await sb.from('oct_nfe_saida_itens').delete().eq('nfe_saida_id', nfeId);
  } else {
    const { data, error } = await sb.from('oct_nfe_saida').insert(cab).select().single();
    if (error) { nfeSaidaMsg('Erro: ' + error.message, 'erro'); return; }
    nfeId = data.id;
  }

  // grava itens
  const itensRows = _saidaItens.map((it, i) => ({
    nfe_saida_id: nfeId, empresa_id: _saidaEmpresaId, produto_id: it.produto_id,
    numero_item: i + 1, codigo: it.codigo, descricao: it.descricao,
    ncm: it.ncm, cest: it.cest, cfop: it.cfop, unidade: it.unidade,
    quantidade: it.quantidade, valor_unitario: it.valor_unitario, valor_total: it.valor_total,
    cst_icms: it.cst_icms || null, cod_anp: it.cod_anp || null, desc_anp: it.desc_anp || null,
  }));
  const { error: errIt } = await sb.from('oct_nfe_saida_itens').insert(itensRows);
  if (errIt) { nfeSaidaMsg('Nota salva, mas erro nos itens: ' + errIt.message, 'erro'); return; }

  nfeSaidaMsg('✓ Rascunho salvo!', 'ok');
  setTimeout(() => nfeSaidaCarregarLista(), 800);
}

async function nfeSaidaExcluir(id) {
  if (!confirm('Excluir este rascunho de NF-e de saída?')) return;
  await sb.from('oct_nfe_saida_itens').delete().eq('nfe_saida_id', id);
  await sb.from('oct_nfe_saida').delete().eq('id', id);
  nfeSaidaCarregarLista();
}
