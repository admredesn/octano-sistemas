
async function moduloProdutos() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }

  const { data: produtos } = await sb
    .from('oct_produtos').select('*, oct_tanques(numero,combustivel)')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('nome');

  conteudo.innerHTML = `
    <div style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>📦 Produtos</h2></div>
        <button onclick="abrirFormProduto(null,'${empresaId}')" class="btn-salvar">+ Novo Produto</button>
      </div>

      <!-- FORM CADASTRO/EDIÇÃO -->
      <div id="form-produto" style="display:none;margin-bottom:20px"></div>

      <!-- DETALHE PRODUTO -->
      <div id="detalhe-produto" style="display:none;margin-bottom:20px"></div>

      <!-- FILTROS -->
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <input id="busca-produto-txt" type="text" placeholder="🔍 Buscar por nome ou código..."
          oninput="filtrarListaProdutos(this.value)"
          style="flex:1;min-width:200px;padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0" />
        <select id="filtro-categoria" onchange="filtrarListaProdutos(document.getElementById('busca-produto-txt').value)"
          style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="">Todas categorias</option>
          <option value="combustivel">Combustível</option>
          <option value="lubrificante">Lubrificante</option>
          <option value="mercadoria">Mercadoria</option>
          <option value="material">Material</option>
          <option value="servico">Serviço</option>
        </select>
      </div>

      <!-- LISTA -->
      <div id="lista-produtos-grid">
        ${!produtos || produtos.length === 0
          ? `<div style="text-align:center;padding:60px;color:#555;border:2px dashed #2a2d3e;border-radius:12px">
              <div style="font-size:2rem;margin-bottom:12px">📦</div>
              <p>Nenhum produto cadastrado ainda.</p>
              <p style="font-size:0.82rem;margin-top:6px">Importe uma NF-e para cadastrar produtos automaticamente.</p>
            </div>`
          : renderListaProdutos(produtos)}
      </div>
    </div>
  `;

  // Guarda produtos para filtro
  window._todosProdutos = produtos || [];
}

function renderListaProdutos(produtos) {
  const CORES_CAT = {
    combustivel: '#4caf50', lubrificante: '#fbbf24',
    mercadoria: '#60a5fa', material: '#a78bfa', servico: '#f97316'
  };
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${produtos.map(p => `
        <div class="prod-card" onclick="abrirDetalheProduto('${p.id}')" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <div style="font-weight:600;font-size:0.95rem">${p.nome}</div>
              <div style="font-size:0.75rem;color:#888;margin-top:2px">${p.codigo||'—'} · ${p.unidade||'un'}</div>
            </div>
            <span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;background:#1e2235;color:${CORES_CAT[p.categoria]||'#888'};border:1px solid ${CORES_CAT[p.categoria]||'#444'}22;white-space:nowrap">${p.categoria||'—'}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">
            <div><span class="nfe-label">Custo</span><br><strong>R$ ${Number(p.preco_custo||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</strong></div>
            <div><span class="nfe-label">Venda</span><br><strong style="color:#f97316">R$ ${Number(p.preco_venda||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
            <div><span class="nfe-label">Estoque</span><br><strong>${Number(p.estoque_atual||0).toLocaleString('pt-BR',{minimumFractionDigits:3})} ${p.unidade||'un'}</strong></div>
            <div><span class="nfe-label">NCM</span><br>${p.ncm||'—'}</div>
          </div>
          ${p.oct_tanques ? `<div style="margin-top:8px;font-size:0.75rem;color:#4caf50">⛽ Tanque ${p.oct_tanques.numero} — ${p.oct_tanques.combustivel}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function filtrarListaProdutos(termo) {
  const cat = document.getElementById('filtro-categoria')?.value || '';
  let lista = window._todosProdutos || [];
  if (termo) lista = lista.filter(p => p.nome.toLowerCase().includes(termo.toLowerCase()) || (p.codigo||'').toLowerCase().includes(termo.toLowerCase()));
  if (cat)   lista = lista.filter(p => p.categoria === cat);
  const grid = document.getElementById('lista-produtos-grid');
  if (grid) grid.innerHTML = lista.length === 0
    ? '<p style="color:#555;text-align:center;padding:30px">Nenhum produto encontrado.</p>'
    : renderListaProdutos(lista);
}

async function abrirDetalheProduto(id) {
  const div = document.getElementById('detalhe-produto');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();

  const { data: p } = await sb.from('oct_produtos')
    .select('*, oct_tanques(numero,combustivel)')
    .eq('id', id).single();

  // NF-es vinculadas
  const { data: nfes } = await sb
    .from('oct_produto_nfe')
    .select('*, oct_nfe_entrada(numero,serie,emissao,valor_total,oct_pessoas(nome))')
    .eq('produto_id', id).order('criado_em', { ascending: false });

  const CORES_CAT = { combustivel:'#4caf50',lubrificante:'#fbbf24',mercadoria:'#60a5fa',material:'#a78bfa',servico:'#f97316' };

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #f97316;border-radius:12px;overflow:hidden">
      <div style="background:#1a1d2e;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2d3e">
        <div>
          <h3 style="color:#f97316;font-size:1rem">📦 ${p.nome}</h3>
          <div style="font-size:0.75rem;color:#888;margin-top:2px">${p.codigo||'Sem código'} · <span style="color:${CORES_CAT[p.categoria]||'#888'}">${p.categoria||'—'}</span></div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="abrirFormProduto('${id}','${perfil.empresa_id}')" style="padding:6px 14px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.82rem">✏️ Editar</button>
          <button onclick="document.getElementById('detalhe-produto').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
        </div>
      </div>

      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <!-- DADOS -->
        <div>
          <div class="modulo-header"><h2>Dados do produto</h2></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.85rem">
            <div><span class="nfe-label">Nome</span><br><strong>${p.nome}</strong></div>
            <div><span class="nfe-label">Código</span><br>${p.codigo||'—'}</div>
            <div><span class="nfe-label">Unidade</span><br>${p.unidade||'—'}</div>
            <div><span class="nfe-label">Categoria</span><br>${p.categoria||'—'}</div>
            <div><span class="nfe-label">NCM</span><br>${p.ncm||'—'}</div>
            <div><span class="nfe-label">CFOP</span><br>${p.cfop||'—'}</div>
            <div><span class="nfe-label">Preço custo</span><br><strong>R$ ${Number(p.preco_custo||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</strong></div>
            <div><span class="nfe-label">Preço venda</span><br><strong style="color:#f97316">R$ ${Number(p.preco_venda||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
            <div><span class="nfe-label">Estoque atual</span><br><strong>${Number(p.estoque_atual||0).toLocaleString('pt-BR',{minimumFractionDigits:3})} ${p.unidade||'un'}</strong></div>
            <div><span class="nfe-label">Estoque mínimo</span><br>${Number(p.estoque_minimo||0).toLocaleString('pt-BR',{minimumFractionDigits:3})}</div>
            ${p.oct_tanques ? `<div style="grid-column:span 2"><span class="nfe-label">Tanque vinculado</span><br><span style="color:#4caf50">⛽ Tanque ${p.oct_tanques.numero} — ${p.oct_tanques.combustivel}</span></div>` : ''}
          </div>
        </div>

        <!-- NF-es vinculadas -->
        <div>
          <div class="modulo-header"><h2>NF-es vinculadas (${nfes?.length||0})</h2></div>
          ${!nfes || nfes.length === 0
            ? '<p style="color:#555;font-size:0.85rem">Nenhuma NF-e vinculada.</p>'
            : `<div style="max-height:250px;overflow-y:auto">
                ${nfes.map(v => `
                  <div style="padding:10px;background:#0f1117;border-radius:8px;margin-bottom:8px;border:1px solid #2a2d3e">
                    <div style="display:flex;justify-content:space-between">
                      <strong style="font-size:0.85rem">NF-e ${v.oct_nfe_entrada?.numero||'—'}/${v.oct_nfe_entrada?.serie||'—'}</strong>
                      <span style="color:#f97316;font-size:0.85rem">R$ ${Number(v.oct_nfe_entrada?.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style="font-size:0.75rem;color:#888;margin-top:3px">
                      ${v.oct_nfe_entrada?.oct_pessoas?.nome||'—'} · 
                      ${v.oct_nfe_entrada?.emissao?new Date(v.oct_nfe_entrada.emissao+'T12:00:00').toLocaleDateString('pt-BR'):'—'}
                    </div>
                  </div>`).join('')}
              </div>`}
        </div>
      </div>
    </div>
  `;
}

async function abrirFormProduto(id, empresaId) {
  const div = document.getElementById('form-produto');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  let p = null;
  if (id) {
    const { data } = await sb.from('oct_produtos').select('*').eq('id', id).single();
    p = data;
  }

  const { data: tanques } = await sb.from('oct_tanques').select('id,numero,combustivel').eq('empresa_id', empresaId).order('numero');

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa;font-size:0.95rem">${id ? '✏️ Editar produto' : '+ Novo produto'}</h3>
        <button onclick="document.getElementById('form-produto').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Nome *</label><input id="fp-nome" type="text" value="${p?.nome||''}" /></div>
        <div class="form-group"><label>Código</label><input id="fp-codigo" type="text" value="${p?.codigo||''}" /></div>
        <div class="form-group">
          <label>Categoria</label>
          <select id="fp-categoria">
            <option value="combustivel" ${p?.categoria==='combustivel'?'selected':''}>Combustível</option>
            <option value="lubrificante" ${p?.categoria==='lubrificante'?'selected':''}>Lubrificante</option>
            <option value="mercadoria" ${p?.categoria==='mercadoria'?'selected':''}>Mercadoria</option>
            <option value="material" ${p?.categoria==='material'?'selected':''}>Material</option>
            <option value="servico" ${p?.categoria==='servico'?'selected':''}>Serviço</option>
          </select>
        </div>
        <div class="form-group">
          <label>Unidade</label>
          <select id="fp-unidade">
            ${['UN','LTS','KG','CX','PC','M','L','ML','G'].map(u=>`<option value="${u}" ${(p?.unidade||'UN').toUpperCase()===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>NCM</label><input id="fp-ncm" type="text" value="${p?.ncm||''}" /></div>
        <div class="form-group"><label>Preço custo</label><input id="fp-custo" type="number" step="0.0001" value="${p?.preco_custo||0}" /></div>
        <div class="form-group"><label>Preço venda</label><input id="fp-venda" type="number" step="0.01" value="${p?.preco_venda||0}" /></div>
        <div class="form-group"><label>Estoque atual</label><input id="fp-estoque" type="number" step="0.001" value="${p?.estoque_atual||0}" /></div>
        <div class="form-group"><label>Estoque mínimo</label><input id="fp-estoque-min" type="number" step="0.001" value="${p?.estoque_minimo||0}" /></div>
        <div class="form-group">
          <label>Tanque vinculado (opcional)</label>
          <select id="fp-tanque">
            <option value="">Nenhum</option>
            ${(tanques||[]).map(t=>`<option value="${t.id}" ${p?.tanque_id===t.id?'selected':''}>${t.numero} — ${t.combustivel}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-acoes">
        <button onclick="salvarProduto('${id||''}','${empresaId}')" class="btn-salvar">💾 Salvar produto</button>
        <button onclick="document.getElementById('form-produto').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        ${id ? `<button onclick="excluirProduto('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>` : ''}
        <span id="fp-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function salvarProduto(id, empresaId) {
  const msg = document.getElementById('fp-msg');
  const nome = document.getElementById('fp-nome').value.trim();
  if (!nome) { msg.textContent = 'Nome obrigatório.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const dados = {
    empresa_id: empresaId, nome,
    codigo:        document.getElementById('fp-codigo').value.trim() || null,
    categoria:     document.getElementById('fp-categoria').value,
    unidade:       document.getElementById('fp-unidade').value,
    ncm:           document.getElementById('fp-ncm').value.trim() || null,
    preco_custo:   parseFloat(document.getElementById('fp-custo').value) || 0,
    preco_venda:   parseFloat(document.getElementById('fp-venda').value) || 0,
    estoque_atual: parseFloat(document.getElementById('fp-estoque').value) || 0,
    estoque_minimo:parseFloat(document.getElementById('fp-estoque-min').value) || 0,
    tanque_id:     document.getElementById('fp-tanque').value || null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('oct_produtos').update(dados).eq('id', id));
  } else {
    ({ error } = await sb.from('oct_produtos').insert(dados));
  }

  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloProdutos(), 1000);
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  await sb.from('oct_produto_nfe').delete().eq('produto_id', id);
  await sb.from('oct_produtos').update({ ativo: false }).eq('id', id);
  moduloProdutos();
}
