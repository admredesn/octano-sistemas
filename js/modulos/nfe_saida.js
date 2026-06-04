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
let _saidaAbaForm = 'capa';    // aba interna ativa: capa|itens|transporte|cupom
let _saidaCupons = [];         // cupons vinculados na nota em edição
let _saidaNotaAtual = null;    // dados da nota em edição (cabeçalho)
let _saidaCacheEmpresa = null; // empresa cujos caches já foram carregados

async function moduloNfeSaida() {
  const conteudo = document.getElementById('conteudo');

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

  // carrega caches (reaproveita se já carregou antes — troca de aba fica instantânea)
  if (!_saidaProdutos.length || !_saidaPessoas.length || _saidaCacheEmpresa !== _saidaEmpresaId) {
    const [{ data: prods }, { data: pess }] = await Promise.all([
      sb.from('oct_produtos').select('id,nome,codigo,unidade,preco_venda_a,preco_custo,ncm,cest,cfop,cfop_ecf,cod_anp,desc_anp,ind_combustivel,ind_monofasico,origem,cst_icms,csosn,aliq_icms,aliq_icms_ad_rem,cst_pis,aliq_pis,cst_cofins,aliq_cofins,perc_bio,pmpf,unidade_tributavel').eq('empresa_id', _saidaEmpresaId).eq('ativo', true).order('nome'),
      sb.from('oct_pessoas').select('id,nome,documento,ie,email,endereco,cidade,uf,tipo').eq('empresa_id', _saidaEmpresaId).eq('ativo', true).order('nome'),
    ]);
    _saidaProdutos = prods || [];
    _saidaPessoas = pess || [];
    _saidaCacheEmpresa = _saidaEmpresaId;
  }

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
    .ns-subabas{display:flex;gap:4px;border-bottom:1px solid #2a2d3e}
    .ns-subaba{display:flex;align-items:center;gap:6px;padding:9px 16px;cursor:pointer;color:#aaa;font-size:0.82rem;border-bottom:2px solid transparent;margin-bottom:-1px}
    .ns-subaba:hover{color:#e0e0e0}
    .ns-subaba.ativo{color:#60a5fa;border-bottom-color:#60a5fa;font-weight:600}
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
  _saidaCupons = [];
  _saidaNotaAtual = null;
  _saidaAbaForm = 'capa';
  nfeSaidaRenderForm(null);
}

async function nfeSaidaEditar(id) {
  _saidaEditId = id;
  _saidaAbaForm = 'capa';
  const { data: nota } = await sb.from('oct_nfe_saida').select('*').eq('id', id).single();
  const { data: itens } = await sb.from('oct_nfe_saida_itens').select('*').eq('nfe_saida_id', id).order('numero_item');
  _saidaItens = (itens || []).map(it => ({
    produto_id: it.produto_id, codigo: it.codigo, descricao: it.descricao,
    ncm: it.ncm, cest: it.cest, cfop: it.cfop, unidade: it.unidade,
    quantidade: Number(it.quantidade), valor_unitario: Number(it.valor_unitario),
    valor_total: Number(it.valor_total), cfop_edit: it.cfop,
    cst_icms: it.cst_icms, cod_anp: it.cod_anp, desc_anp: it.desc_anp,
    ind_combustivel: it.ind_combustivel || 'N',
    ind_monofasico: it.ind_monofasico || 'N',
    origem: it.origem || '0',
    csosn: it.csosn || null,
    aliq_icms: Number(it.aliq_icms) || 0,
    aliq_icms_ad_rem: Number(it.aliq_icms_ad_rem) || 0,
    cst_pis: it.cst_pis || null,
    aliq_pis: Number(it.aliq_pis) || 0,
    cst_cofins: it.cst_cofins || null,
    aliq_cofins: Number(it.aliq_cofins) || 0,
    perc_bio: Number(it.perc_bio) || 0,
    pmpf: Number(it.pmpf) || 0,
    unidade_tributavel: it.unidade_tributavel || null,
  }));
  let cupons = [];
  try { const r = await sb.from('oct_nfe_saida_cupons').select('*').eq('nfe_saida_id', id); cupons = r.data || []; } catch(e){}
  _saidaCupons = cupons;
  _saidaNotaAtual = nota;
  nfeSaidaRenderForm(nota);
}

function nfeSaidaRenderForm(nota) {
  const area = document.getElementById('ns-conteudo');
  if (!area) return;
  const somenteLeitura = nota && nota.status !== 'rascunho';
  _saidaNotaAtual = nota;

  const titulo = nota ? (somenteLeitura ? '👁 NF-e Saída ' + (nota.numero || '') : '✏️ Editar rascunho') : '＋ Nova NF-e de Saída';
  const abas = [
    { id: 'capa',       ico: '📄', label: 'Capa' },
    { id: 'itens',      ico: '📦', label: 'Itens' },
    { id: 'transporte', ico: '🚚', label: 'Transporte' },
    { id: 'cupom',      ico: '🧾', label: 'Cupom Fiscal' },
  ];

  area.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="color:#e0e0e0;font-size:1rem;margin:0">${titulo}</h2>
      <div style="display:flex;gap:8px;align-items:center">
        ${somenteLeitura ? '' : `<button class="ns-btn-novo" onclick="nfeSaidaSalvar()">💾 Salvar rascunho</button>`}
        ${(!somenteLeitura && _saidaEditId) ? `<button class="ns-btn-novo" style="background:#1f6f43" onclick="nfeSaidaTransmitir()">📡 Transmitir SEFAZ</button>
        <select id="ns-ambiente" class="manif-input-sm" title="Ambiente SEFAZ" style="padding:4px 6px;border-radius:6px;background:#0f1117;color:#e0e0e0;border:1px solid #2a2d3e;font-size:0.8rem">
          <option value="homologacao" selected>Homologação</option>
          <option value="producao">Produção</option>
        </select>` : ''}
        <span id="ns-msg" style="font-size:0.85rem"></span>
        <button class="ns-btn-linha" onclick="nfeSaidaCarregarLista()">← Voltar à lista</button>
      </div>
    </div>

    <div class="ns-subabas">
      ${abas.map(a => `<div class="ns-subaba ${a.id===_saidaAbaForm?'ativo':''}" onclick="nfeSaidaTrocarAba('${a.id}')"><span>${a.ico}</span><span>${a.label}</span></div>`).join('')}
    </div>

    <div id="ns-aba-conteudo" style="padding-top:14px"></div>
  `;
  nfeSaidaRenderAba(somenteLeitura);
}

function nfeSaidaTrocarAba(aba) {
  nfeSaidaCapturarCampos();
  _saidaAbaForm = aba;
  const somenteLeitura = _saidaNotaAtual && _saidaNotaAtual.status !== 'rascunho';
  nfeSaidaRenderForm(_saidaNotaAtual);
}

// Lê os inputs da aba visível e guarda no estado, para não perder ao trocar de aba
function nfeSaidaCapturarCampos() {
  const n = _saidaNotaAtual || {};
  const g = id => document.getElementById(id);
  if (g('ns-dest'))   n.destinatario_id = g('ns-dest').value;
  if (g('ns-serie'))  n.serie = parseInt(g('ns-serie').value) || 1;
  if (g('ns-natop'))  n.natureza_op = g('ns-natop').value;
  if (g('ns-emissao'))n.data_emissao = g('ns-emissao').value || null;
  if (g('ns-saida'))  n.data_saida = g('ns-saida').value || null;
  if (g('ns-cfop'))   n.cfop_padrao = g('ns-cfop').value;
  if (g('ns-inf'))    n.inf_complementar = g('ns-inf').value;
  // transporte
  const frete = document.querySelector('input[name="ns-frete"]:checked');
  if (frete) n.mod_frete = frete.value;
  if (g('ns-transp-nome')) n.transp_nome = g('ns-transp-nome').value;
  if (g('ns-transp-placa'))n.transp_placa = g('ns-transp-placa').value;
  if (g('ns-transp-doc'))  n.transp_documento = g('ns-transp-doc').value;
  if (g('ns-emb-unid')) n.emb_unidade = g('ns-emb-unid').value;
  if (g('ns-emb-qtd'))  n.emb_quantidade = parseFloat(g('ns-emb-qtd').value) || 0;
  if (g('ns-emb-pb'))   n.emb_peso_bruto = parseFloat(g('ns-emb-pb').value) || 0;
  if (g('ns-emb-pl'))   n.emb_peso_liquido = parseFloat(g('ns-emb-pl').value) || 0;
  _saidaNotaAtual = n;
}

function nfeSaidaRenderAba(somenteLeitura) {
  const c = document.getElementById('ns-aba-conteudo');
  if (!c) return;
  if (_saidaAbaForm === 'capa')        c.innerHTML = nfeSaidaAbaCapa(_saidaNotaAtual, somenteLeitura);
  else if (_saidaAbaForm === 'itens')  { c.innerHTML = nfeSaidaAbaItens(somenteLeitura); nfeSaidaRenderItens(somenteLeitura); }
  else if (_saidaAbaForm === 'transporte') c.innerHTML = nfeSaidaAbaTransporte(_saidaNotaAtual, somenteLeitura);
  else if (_saidaAbaForm === 'cupom')  c.innerHTML = nfeSaidaAbaCupom(somenteLeitura);
}

// ---------- ABA CAPA ----------
function nfeSaidaAbaCapa(nota, somenteLeitura) {
  const dest = nota?.destinatario_id || '';
  return `
    <div class="ns-form-sec">
      <h3>👤 Destinatário e identificação</h3>
      <div class="ns-grid">
        <div class="ns-fg span2">
          <label>Cliente / Destinatário *</label>
          <select id="ns-dest" ${somenteLeitura?'disabled':''}>
            <option value="">— Selecione —</option>
            ${_saidaPessoas.map(p=>`<option value="${p.id}" ${p.id===dest?'selected':''}>${p.nome}${p.documento?' ('+p.documento+')':''}</option>`).join('')}
          </select>
        </div>
        <div class="ns-fg">
          <label>Série</label>
          <input id="ns-serie" type="number" value="${nota?.serie||1}" ${somenteLeitura?'disabled':''} />
        </div>
        <div class="ns-fg">
          <label>Nº Nota</label>
          <input id="ns-numero" value="${nota?.numero||''}" disabled placeholder="(gerado na emissão)" />
        </div>
        <div class="ns-fg span2">
          <label>Natureza da operação</label>
          <input id="ns-natop" value="${nota?.natureza_op||'VENDA DE MERCADORIA'}" ${somenteLeitura?'disabled':''} />
        </div>
        <div class="ns-fg">
          <label>Emissão</label>
          <input id="ns-emissao" type="date" value="${nota?.data_emissao?String(nota.data_emissao).substring(0,10):''}" ${somenteLeitura?'disabled':''} />
        </div>
        <div class="ns-fg">
          <label>Saída</label>
          <input id="ns-saida" type="date" value="${nota?.data_saida?String(nota.data_saida).substring(0,10):''}" ${somenteLeitura?'disabled':''} />
        </div>
        <div class="ns-fg span2">
          <label>CFOP padrão da nota</label>
          <input id="ns-cfop" value="${nota?.cfop_padrao||'5102'}" ${somenteLeitura?'disabled':''} placeholder="ex 5102, 5656" />
        </div>
        <div class="ns-fg span2">
          <label>Chave NF-e (após autorização)</label>
          <input value="${nota?.chave_nfe||''}" disabled placeholder="—" />
        </div>
        <div class="ns-fg span2" style="grid-column:span 4">
          <label>Mensagem / Inf. complementar</label>
          <input id="ns-inf" value="${(nota?.inf_complementar||'').replace(/"/g,'&quot;')}" ${somenteLeitura?'disabled':''} />
        </div>
      </div>
    </div>
    <div class="ns-form-sec">
      <h3>💰 Totais</h3>
      <div id="ns-totais" style="font-size:0.9rem"></div>
    </div>
    ${nfeSaidaRodapeStatus(nota, somenteLeitura)}
  `;
}

function nfeSaidaRodapeStatus(nota, somenteLeitura) {
  if (somenteLeitura) {
    return `<div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:12px;color:#fbbf24;font-size:0.84rem">
        Esta nota está com status <strong>${nota.status}</strong>${nota.protocolo?' (protocolo '+nota.protocolo+')':''}. ${nota.motivo_rejeicao?'<br>Motivo: '+nota.motivo_rejeicao:''}
      </div>`;
  }
  return `<div style="background:#0f1a2a;border:1px solid #2a4a6a;border-radius:8px;padding:10px;font-size:0.78rem;color:#7cc4ff">
      ℹ️ A nota é salva como <strong>rascunho</strong>. A transmissão à SEFAZ (assinatura + envio) será adicionada na próxima etapa, no servidor.
    </div>`;
}

// ---------- ABA ITENS ----------
function nfeSaidaAbaItens(somenteLeitura) {
  return `
    <div class="ns-form-sec">
      <h3>📦 Itens da nota</h3>
      ${somenteLeitura?'':`
      <div class="ns-grid" style="margin-bottom:12px;align-items:end">
        <div class="ns-fg span2">
          <label>Produto</label>
          <select id="ns-item-prod">
            <option value="">— Selecione um produto —</option>
            ${_saidaProdutos.map(p=>`<option value="${p.id}">${p.nome}${p.codigo?' ['+p.codigo+']':''}</option>`).join('')}
          </select>
        </div>
        <div class="ns-fg"><label>Quantidade</label><input id="ns-item-qtd" type="number" step="0.001" value="1" /></div>
        <div class="ns-fg"><label>Vlr unitário</label><input id="ns-item-vlr" type="number" step="0.0001" value="0" /></div>
      </div>
      <button class="ns-btn-linha" style="border-color:#2a5a2a;color:#4caf50" onclick="nfeSaidaAddItem()">＋ Adicionar item</button>
      `}
      <div id="ns-itens-lista" style="margin-top:12px"></div>
    </div>
  `;
}

// ---------- ABA TRANSPORTE ----------
function nfeSaidaAbaTransporte(nota, somenteLeitura) {
  const mf = nota?.mod_frete || '9';
  const ro = somenteLeitura?'disabled':'';
  return `
    <div class="ns-form-sec">
      <h3>🚚 Transporte</h3>
      <div class="ns-fg" style="margin-bottom:12px">
        <label>Tipo de frete</label>
        <div style="display:flex;gap:18px;padding-top:4px">
          <label style="font-size:0.84rem;color:#ccc;display:flex;gap:6px;align-items:center"><input type="radio" name="ns-frete" value="0" ${mf==='0'?'checked':''} ${ro} style="width:auto"> Emitente</label>
          <label style="font-size:0.84rem;color:#ccc;display:flex;gap:6px;align-items:center"><input type="radio" name="ns-frete" value="1" ${mf==='1'?'checked':''} ${ro} style="width:auto"> Destinatário</label>
          <label style="font-size:0.84rem;color:#ccc;display:flex;gap:6px;align-items:center"><input type="radio" name="ns-frete" value="9" ${mf==='9'?'checked':''} ${ro} style="width:auto"> Sem frete</label>
        </div>
      </div>
      <div class="ns-grid">
        <div class="ns-fg span2"><label>Transportadora</label><input id="ns-transp-nome" value="${(nota?.transp_nome||'').replace(/"/g,'&quot;')}" ${ro} /></div>
        <div class="ns-fg"><label>Placa</label><input id="ns-transp-placa" value="${nota?.transp_placa||''}" ${ro} /></div>
        <div class="ns-fg"><label>Documento transp.</label><input id="ns-transp-doc" value="${nota?.transp_documento||''}" ${ro} /></div>
      </div>
    </div>
    <div class="ns-form-sec">
      <h3>📦 Embalagens</h3>
      <div class="ns-grid">
        <div class="ns-fg span2"><label>Unidade</label><input id="ns-emb-unid" value="${nota?.emb_unidade||''}" ${ro} /></div>
        <div class="ns-fg"><label>Qtd. embalagens</label><input id="ns-emb-qtd" type="number" step="0.001" value="${nota?.emb_quantidade||0}" ${ro} /></div>
        <div class="ns-fg"></div>
        <div class="ns-fg"><label>Peso bruto (KG)</label><input id="ns-emb-pb" type="number" step="0.001" value="${nota?.emb_peso_bruto||0}" ${ro} /></div>
        <div class="ns-fg"><label>Peso líquido (KG)</label><input id="ns-emb-pl" type="number" step="0.001" value="${nota?.emb_peso_liquido||0}" ${ro} /></div>
      </div>
    </div>
  `;
}

// ---------- ABA CUPOM FISCAL ----------
function nfeSaidaAbaCupom(somenteLeitura) {
  const fmt = v => Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const avulsos = _saidaCupons.filter(c => c.tipo === 'avulsa');
  const deCupom = _saidaCupons.filter(c => c.tipo === 'cupom');
  return `
    <div class="ns-form-sec">
      <h3>🧾 Cupons NF Avulsa</h3>
      ${somenteLeitura?'':`
      <div style="display:flex;gap:8px;align-items:end;margin-bottom:10px">
        <div class="ns-fg"><label>Nº Cupom</label><input id="ns-cupom-num" /></div>
        <button class="ns-btn-linha" style="border-color:#2a5a2a;color:#4caf50" onclick="nfeSaidaAddCupomAvulso()">＋ Incluir</button>
      </div>`}
      <table class="ns-tabela">
        <thead><tr><th>Nº Cupom</th>${somenteLeitura?'':'<th style="width:40px"></th>'}</tr></thead>
        <tbody>
          ${avulsos.length ? avulsos.map((c,i)=>`<tr><td>${c.num_cupom}</td>${somenteLeitura?'':`<td><button class="ns-btn-linha" style="border-color:#5a2a2a;color:#f44;padding:2px 7px" onclick="nfeSaidaRemCupom('avulsa',${i})">✕</button></td>`}</tr>`).join('') : `<tr><td colspan="2" style="color:#888;padding:14px">Nenhum cupom avulso adicionado.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="ns-form-sec">
      <h3>🧾 Cupons NF de cupom</h3>
      <table class="ns-tabela">
        <thead><tr><th>Seq. Cupom</th><th>Nº Cupom</th><th>Data</th><th style="text-align:right">Valor</th><th>Cód. Cliente</th><th>Razão Social</th></tr></thead>
        <tbody>
          ${deCupom.length ? deCupom.map(c=>`<tr><td>${c.seq_cupom||'—'}</td><td>${c.num_cupom||'—'}</td><td>${c.data_cupom?new Date(c.data_cupom).toLocaleDateString('pt-BR'):'—'}</td><td style="text-align:right;font-weight:600">${fmt(c.valor)}</td><td>${c.cod_cliente||'—'}</td><td>${c.razao_social||'—'}</td></tr>`).join('') : `<tr><td colspan="6" style="color:#888;padding:14px">Nenhum cupom vinculado.</td></tr>`}
        </tbody>
      </table>
      <div style="background:#0f1a2a;border:1px solid #2a4a6a;border-radius:8px;padding:10px;margin-top:12px;font-size:0.78rem;color:#7cc4ff">
        ℹ️ Esta aba agrupa cupons/NFC-e numa NF-e de resumo. A busca automática dos cupons reais será habilitada quando o módulo de PDV/NFC-e existir (Fase 2). Por ora, é possível registrar cupons avulsos por número.
      </div>
    </div>
  `;
}

function nfeSaidaAddCupomAvulso() {
  const num = (document.getElementById('ns-cupom-num')?.value || '').trim();
  if (!num) { nfeSaidaMsg('Informe o número do cupom.', 'erro'); return; }
  _saidaCupons.push({ tipo: 'avulsa', num_cupom: num });
  nfeSaidaRenderAba(false);
}

function nfeSaidaRemCupom(tipo, idx) {
  const lista = _saidaCupons.filter(c => c.tipo === tipo);
  const alvo = lista[idx];
  const pos = _saidaCupons.indexOf(alvo);
  if (pos >= 0) _saidaCupons.splice(pos, 1);
  nfeSaidaRenderAba(false);
}

function nfeSaidaPreencherDest() {}

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
    // perfil fiscal herdado do produto (pré-preenche o CST; pode ser editado na grade)
    cst_icms: p.cst_icms || '', cod_anp: p.cod_anp, desc_anp: p.desc_anp,
    ind_combustivel: p.ind_combustivel || 'N',
    ind_monofasico: p.ind_monofasico || 'N',
    origem: p.origem || '0',
    csosn: p.csosn || null,
    aliq_icms: Number(p.aliq_icms) || 0,
    aliq_icms_ad_rem: Number(p.aliq_icms_ad_rem) || 0,
    cst_pis: p.cst_pis || null,
    aliq_pis: Number(p.aliq_pis) || 0,
    cst_cofins: p.cst_cofins || null,
    aliq_cofins: Number(p.aliq_cofins) || 0,
    perc_bio: Number(p.perc_bio) || 0,
    pmpf: Number(p.pmpf) || 0,
    unidade_tributavel: p.unidade_tributavel || null,
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
  nfeSaidaCapturarCampos();
  const n = _saidaNotaAtual || {};
  const destId = n.destinatario_id;
  if (!destId) { nfeSaidaMsg('Selecione o destinatário (aba Capa).', 'erro'); return; }
  if (!_saidaItens.length) { nfeSaidaMsg('Adicione ao menos um item (aba Itens).', 'erro'); return; }
  const dest = _saidaPessoas.find(p => p.id === destId);
  const vProd = _saidaItens.reduce((s,it)=>s+Number(it.valor_total||0),0);

  const cab = {
    empresa_id: _saidaEmpresaId,
    serie: n.serie || 1,
    modelo: '55',
    natureza_op: n.natureza_op || 'VENDA',
    cfop_padrao: n.cfop_padrao || null,
    data_emissao: n.data_emissao || new Date().toISOString(),
    data_saida: n.data_saida || null,
    inf_complementar: n.inf_complementar || null,
    destinatario_id: destId,
    dest_nome: dest?.nome, dest_documento: dest?.documento, dest_ie: dest?.ie, dest_email: dest?.email,
    mod_frete: n.mod_frete || '9',
    transp_nome: n.transp_nome || null, transp_placa: n.transp_placa || null, transp_documento: n.transp_documento || null,
    emb_unidade: n.emb_unidade || null, emb_quantidade: n.emb_quantidade || 0,
    emb_peso_bruto: n.emb_peso_bruto || 0, emb_peso_liquido: n.emb_peso_liquido || 0,
    valor_produtos: vProd, valor_total: vProd,
    status: 'rascunho',
    atualizado_em: new Date().toISOString(),
  };

  let nfeId = _saidaEditId;
  if (nfeId) {
    const { error } = await sb.from('oct_nfe_saida').update(cab).eq('id', nfeId);
    if (error) { nfeSaidaMsg('Erro: ' + error.message, 'erro'); return; }
    await sb.from('oct_nfe_saida_itens').delete().eq('nfe_saida_id', nfeId);
    try { await sb.from('oct_nfe_saida_cupons').delete().eq('nfe_saida_id', nfeId); } catch(e){}
  } else {
    const { data, error } = await sb.from('oct_nfe_saida').insert(cab).select().single();
    if (error) { nfeSaidaMsg('Erro: ' + error.message, 'erro'); return; }
    nfeId = data.id; _saidaEditId = nfeId;
  }

  // grava itens
  const itensRows = _saidaItens.map((it, i) => ({
    nfe_saida_id: nfeId, empresa_id: _saidaEmpresaId, produto_id: it.produto_id,
    numero_item: i + 1, codigo: it.codigo, descricao: it.descricao,
    ncm: it.ncm, cest: it.cest, cfop: it.cfop, unidade: it.unidade,
    quantidade: it.quantidade, valor_unitario: it.valor_unitario, valor_total: it.valor_total,
    cst_icms: it.cst_icms || null, cod_anp: it.cod_anp || null, desc_anp: it.desc_anp || null,
    ind_combustivel: it.ind_combustivel || 'N', ind_monofasico: it.ind_monofasico || 'N',
    origem: it.origem || '0', csosn: it.csosn || null,
    aliq_icms: it.aliq_icms || 0, aliq_icms_ad_rem: it.aliq_icms_ad_rem || 0,
    cst_pis: it.cst_pis || null, aliq_pis: it.aliq_pis || 0,
    cst_cofins: it.cst_cofins || null, aliq_cofins: it.aliq_cofins || 0,
    perc_bio: it.perc_bio || 0, pmpf: it.pmpf || 0,
    unidade_tributavel: it.unidade_tributavel || null,
  }));
  const { error: errIt } = await sb.from('oct_nfe_saida_itens').insert(itensRows);
  if (errIt) { nfeSaidaMsg('Nota salva, mas erro nos itens: ' + errIt.message, 'erro'); return; }

  // grava cupons vinculados (se houver)
  if (_saidaCupons.length) {
    const cupRows = _saidaCupons.map(c => ({
      nfe_saida_id: nfeId, empresa_id: _saidaEmpresaId, tipo: c.tipo || 'avulsa',
      seq_cupom: c.seq_cupom || null, num_cupom: c.num_cupom || null,
      data_cupom: c.data_cupom || null, valor: c.valor || 0,
      cod_cliente: c.cod_cliente || null, razao_social: c.razao_social || null,
    }));
    try { await sb.from('oct_nfe_saida_cupons').insert(cupRows); } catch(e){}
  }

  nfeSaidaMsg('✓ Rascunho salvo!', 'ok');
  setTimeout(() => nfeSaidaCarregarLista(), 800);
}

async function nfeSaidaTransmitir() {
  const ambiente = document.getElementById('ns-ambiente')?.value || 'homologacao';
  if (!_saidaEditId) { nfeSaidaMsg('Salve o rascunho antes de transmitir.', 'erro'); return; }
  if (!_saidaItens.length) { nfeSaidaMsg('Adicione ao menos um item.', 'erro'); return; }
  if (!_saidaEmpresa?.cert_path) { nfeSaidaMsg('Certificado não configurado (tela Empresa).', 'erro'); return; }
  const senha = (typeof getCertSenha === 'function') ? getCertSenha() : null;
  if (!senha) { nfeSaidaMsg('Senha do certificado não encontrada (tela Empresa).', 'erro'); return; }

  const n = _saidaNotaAtual || {};
  const dest = _saidaPessoas.find(p => p.id === n.destinatario_id);
  if (!dest) { nfeSaidaMsg('Destinatário não encontrado.', 'erro'); return; }

  if (!confirm(`Transmitir NF-e em ${ambiente.toUpperCase()}?`)) return;
  nfeSaidaMsg('📡 Transmitindo à SEFAZ...', 'info');

  try {
    // certificado do app (mesmo padrao da manifestacao)
    const { data: cb } = await sb.storage.from('octano-certs').download(_saidaEmpresa.cert_path);
    const buf = await cb.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    // monta itens no formato do /emitir
    const itens = _saidaItens.map((it, i) => ({
      nItem: i + 1,
      cProd: it.codigo || ('ITEM' + (i + 1)),
      xProd: it.descricao,
      cEAN: 'SEM GTIN', cEANTrib: 'SEM GTIN',
      ncm: it.ncm, cest: it.cest || null, cfop: it.cfop,
      uCom: it.unidade || 'LT', uTrib: it.unidade_tributavel || it.unidade || 'LT',
      qCom: Number(it.quantidade), vUnCom: Number(it.valor_unitario), vProd: Number(it.valor_total),
      ind_combustivel: it.ind_combustivel || 'N',
      ind_monofasico: it.ind_monofasico || 'N',
      cod_anp: it.cod_anp || null, desc_anp: it.desc_anp || null,
      perc_bio: Number(it.perc_bio) || 0, uf_cons: dest.uf || 'MG',
      origem: it.origem || '0',
      cst_icms: it.cst_icms || null, aliq_icms: Number(it.aliq_icms) || 0,
      aliq_icms_ad_rem: Number(it.aliq_icms_ad_rem) || 0,
      cst_pis: it.cst_pis || '04', cst_cofins: it.cst_cofins || '04',
    }));

    const nota = {
      numero: n.numero || Date.now() % 1000000,
      serie: n.serie || 1,
      natureza_op: n.natureza_op || 'VENDA',
      id_lote: '1',
      mod_frete: n.mod_frete || '9',
      emitente: {
        cnpj: (_saidaEmpresa.cnpj || '').replace(/\D/g, ''),
        nome: _saidaEmpresa.nome,
        ie: (_saidaEmpresa.ie || '').replace(/\D/g, ''),
        logradouro: _saidaEmpresa.endereco || '',
        numero: 'S/N', bairro: 'CENTRO',
        municipio: _saidaEmpresa.cidade || '', c_mun: _saidaEmpresa.c_mun || '3123205',
        uf: _saidaEmpresa.uf || 'MG', cep: (_saidaEmpresa.cep || '').replace(/\D/g, ''),
        crt: _saidaEmpresa.regime_tributario === 'simples' ? '1' : '3',
      },
      destinatario: {
        cnpj_cpf: (dest.documento || '').replace(/\D/g, ''),
        nome: ambiente === 'homologacao'
          ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : dest.nome,
        ie: (dest.ie || '').replace(/\D/g, '') || null,
        ind_ie: dest.ie ? '1' : '9',
        uf: dest.uf || 'MG',
      },
      itens,
    };

    const cnpj = nota.emitente.cnpj;
    const resp = await fetch(`${SEFAZ_URL}/emitir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, cert_base64: b64, cert_senha: senha, ambiente, nota }),
    });
    const r = await resp.json();

    if (r.ok) {
      nfeSaidaMsg(`✓ AUTORIZADA! Protocolo ${r.protocolo} — chave ${r.chave}`, 'ok');
      try {
        await sb.from('oct_nfe_saida').update({
          status: 'transmitida', chave_nfe: r.chave, protocolo: r.protocolo,
          xml_autorizado: r.xml_assinado || null, atualizado_em: new Date().toISOString(),
        }).eq('id', _saidaEditId);
      } catch (e) {}
      setTimeout(() => nfeSaidaCarregarLista(), 2500);
    } else {
      const motivo = r.xmotivo || r.erro || (r.erros ? r.erros.join(' | ') : 'sem detalhe');
      nfeSaidaMsg(`❌ [${r.etapa || '?'}] ${r.cstat_nfe || r.cstat_lote || ''} ${motivo}`, 'erro');
    }
  } catch (e) {
    nfeSaidaMsg('Erro ao transmitir: ' + e.message, 'erro');
  }
}

async function nfeSaidaExcluir(id) {
  if (!confirm('Excluir este rascunho de NF-e de saída?')) return;
  await sb.from('oct_nfe_saida_itens').delete().eq('nfe_saida_id', id);
  await sb.from('oct_nfe_saida').delete().eq('id', id);
  nfeSaidaCarregarLista();
}
