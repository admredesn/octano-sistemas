
async function moduloProdutos() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._produtosEmpresaId = empresaId;

  const { data: produtos } = await sb
    .from('oct_produtos').select('*, oct_tanques(numero,combustivel)')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('nome');

  window._todosProdutos = produtos || [];

  // containers: janela do grid + areas para form/detalhe que ficam acima
  conteudo.innerHTML = `
    <div id="form-produto" style="display:none;margin-bottom:16px"></div>
    <div id="detalhe-produto" style="display:none;margin-bottom:16px"></div>
    <div id="grid-produtos"></div>
  `;

  const CORES_CAT = { combustivel:'#4caf50', lubrificante:'#fbbf24', mercadoria:'#60a5fa', material:'#a78bfa', servico:'#f97316' };
  const badge = (cat) => {
    const c = CORES_CAT[cat] || '#888';
    return `<span class="og-badge" style="background:#1e2235;color:${c}">${cat||'—'}</span>`;
  };

  octanoGrid({
    montarEm: 'grid-produtos',
    titulo: 'Produtos',
    aoFechar: "navegarPara('empresa')",
    rodapeDireita: perfil?.oct_empresas?.nome || '',
    dados: window._todosProdutos,
    selecaoMultipla: true,
    aoEditarLote: (selecionados) => abrirEdicaoLote(selecionados, empresaId),
    acoes: [
      { rotulo: 'Novo Produto', ico: '＋', onClick: `abrirFormProduto(null,'${empresaId}')` },
    ],
    colunas: [
      { campo: 'nome', titulo: 'Nome', largura: '220px' },
      { campo: 'codigo', titulo: 'Código', largura: '110px', render: (v)=> v||'—' },
      { titulo: 'Categoria', largura: '110px', valor: (p)=> p.categoria||'', render: (v)=> badge(v), filtroOpcoes: ['combustivel','lubrificante','filtro','aditivo','mercadoria','material','servico'] },
      { campo: 'unidade', titulo: 'Un', largura: '60px', render: (v)=> v||'un' },
      { campo: 'preco_custo', titulo: 'Custo', align: 'right', largura: '110px', render: (v)=> 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:4}) },
      { campo: 'preco_venda_a', titulo: 'Venda', align: 'right', largura: '100px', render: (v)=> 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2}) },
      { campo: 'estoque', titulo: 'Estoque', align: 'right', largura: '110px', valor:(p)=>p.estoque, render: (v,p)=> Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:3})+' '+(p.unidade||'un') },
      { campo: 'ncm', titulo: 'NCM', largura: '90px', render: (v)=> v||'—' },
      { titulo: 'Tanque', largura: '150px', valor: (p)=> p.oct_tanques ? ('T'+p.oct_tanques.numero+' '+p.oct_tanques.combustivel) : '', render: (v)=> v ? `<span style="color:#4caf50">⛽ ${v}</span>` : '—' },
    ],
    aoClicarLinha: (p) => abrirDetalheProduto(p.id),
    botaoExcluir: (p) => excluirProduto(p.id),
  });
}

// mantida por compatibilidade (nao mais usada pela tela em grid)
function filtrarListaProdutos(termo) {
  const cat = document.getElementById('filtro-categoria')?.value || '';
  let lista = window._todosProdutos || [];
  if (termo) lista = lista.filter(p => p.nome.toLowerCase().includes(termo.toLowerCase()) || (p.codigo||'').toLowerCase().includes(termo.toLowerCase()));
  if (cat)   lista = lista.filter(p => p.categoria === cat);
  return lista;
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
          <button onclick="abrirFormProduto('${id}','${(typeof empresaAtiva==="function")?empresaAtiva():perfil.empresa_id}')" style="padding:6px 14px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.82rem">✏️ Editar</button>
          <button onclick="document.getElementById('detalhe-produto').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
        </div>
      </div>

      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div class="modulo-header"><h2>Dados do produto</h2></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.85rem">
            <div><span class="nfe-label">Nome</span><br><strong>${p.nome}</strong></div>
            <div><span class="nfe-label">Código</span><br>${p.codigo||'—'}</div>
            <div><span class="nfe-label">Cód. barras (EAN)</span><br>${p.ean||'—'}</div>
            <div><span class="nfe-label">Unidade</span><br>${p.unidade||'—'}</div>
            <div><span class="nfe-label">Categoria</span><br>${p.categoria||'—'}</div>
            <div><span class="nfe-label">NCM</span><br>${p.ncm||'—'}</div>
            <div><span class="nfe-label">CFOP</span><br>${p.cfop||'—'}</div>
            <div><span class="nfe-label">Preço custo</span><br><strong>R$ ${Number(p.preco_custo||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</strong></div>
            <div><span class="nfe-label">Preço venda</span><br><strong style="color:#f97316">R$ ${Number(p.preco_venda_a||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
            <div><span class="nfe-label">Estoque atual</span><br><strong>${Number(p.estoque||0).toLocaleString('pt-BR',{minimumFractionDigits:3})} ${p.unidade||'un'}</strong></div>
            <div><span class="nfe-label">Estoque mínimo</span><br>${Number(p.estoque_minimo||0).toLocaleString('pt-BR',{minimumFractionDigits:3})}</div>
            ${p.oct_tanques ? `<div style="grid-column:span 2"><span class="nfe-label">Tanque vinculado</span><br><span style="color:#4caf50">⛽ Tanque ${p.oct_tanques.numero} — ${p.oct_tanques.combustivel}</span></div>` : ''}
          </div>
        </div>

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
        <div class="form-group"><label>Código de barras (EAN)</label><input id="fp-ean" type="text" value="${p?.ean||''}" placeholder="leitor / código de barras" /></div>
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
        <div class="form-group"><label>Preço custo</label><input id="fp-custo" type="number" step="0.0001" value="${p?.preco_custo||0}" oninput="produtoCalcMargem()" /></div>
        <div class="form-group">
          <label>Margem (%)</label>
          <div style="display:flex;gap:6px">
            <input id="fp-margem" type="number" step="0.01" value="" placeholder="ex: 30" style="flex:1" />
            <button type="button" onclick="produtoAplicarMargem()" title="Calcular preço de venda pela margem" style="padding:0 12px;border-radius:6px;border:1px solid #2a5a3a;background:transparent;color:#7be0a0;cursor:pointer;white-space:nowrap">💰 Aplicar</button>
          </div>
        </div>
        <div class="form-group"><label>Preço venda</label><input id="fp-venda" type="number" step="0.01" value="${p?.preco_venda_a||0}" oninput="produtoCalcMargem()" /></div>
        <div class="form-group"><label>Estoque atual</label><input id="fp-estoque" type="number" step="0.001" value="${p?.estoque||0}" /></div>
        <div class="form-group"><label>Estoque mínimo</label><input id="fp-estoque-min" type="number" step="0.001" value="${p?.estoque_minimo||0}" /></div>
        <div class="form-group">
          <label>Tanque vinculado (opcional)</label>
          <select id="fp-tanque">
            <option value="">Nenhum</option>
            ${(tanques||[]).map(t=>`<option value="${t.id}" ${p?.tanque_id===t.id?'selected':''}>${t.numero} — ${t.combustivel}</option>`).join('')}
          </select>
        </div>
      </div>

      <details style="margin-top:16px;border:1px solid #2a2d3e;border-radius:8px;padding:0" id="fp-fiscal-bloco">
        <summary style="padding:12px 16px;cursor:pointer;color:#60a5fa;font-weight:600;font-size:0.9rem">📊 Perfil fiscal (NF-e / tributação)</summary>
        <div style="padding:0 16px 16px">
          <div style="background:#0f1a2a;border:1px solid #2a4a6a;border-radius:6px;padding:8px 10px;margin-bottom:14px;font-size:0.76rem;color:#7cc4ff">
            ℹ️ Preencha conforme orientação do contador. Combustível usa ICMS monofásico (CST 61) com alíquota em <strong>R$/litro</strong> (ad rem), não percentual.
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>É combustível?</label>
              <select id="fp-ind-comb" onchange="produtoToggleComb()">
                <option value="N" ${(p?.ind_combustivel||'N')==='N'?'selected':''}>Não</option>
                <option value="S" ${p?.ind_combustivel==='S'?'selected':''}>Sim</option>
              </select>
            </div>
            <div class="form-group">
              <label>Monofásico?</label>
              <select id="fp-ind-mono">
                <option value="N" ${(p?.ind_monofasico||'N')==='N'?'selected':''}>Não</option>
                <option value="S" ${p?.ind_monofasico==='S'?'selected':''}>Sim</option>
              </select>
            </div>
            <div class="form-group"><label>Código ANP</label><input id="fp-anp" type="text" value="${p?.cod_anp||''}" placeholder="9 dígitos" /></div>
            <div class="form-group"><label>Descrição ANP</label><input id="fp-anp-desc" type="text" value="${(p?.desc_anp||'').replace(/"/g,'&quot;')}" /></div>
            <div class="form-group"><label>CEST</label><input id="fp-cest" type="text" value="${p?.cest||''}" /></div>
            <div class="form-group"><label>Origem</label><input id="fp-origem" type="text" value="${p?.origem||'0'}" placeholder="0=nacional" /></div>
            <div class="form-group"><label>CFOP venda</label><input id="fp-cfop" type="text" value="${p?.cfop||''}" placeholder="ex 5102, 5656" /></div>
            <div class="form-group"><label>CFOP cupom/ECF</label><input id="fp-cfop-ecf" type="text" value="${p?.cfop_ecf||''}" placeholder="ex 5929" /></div>
            <div class="form-group"><label>CST ICMS</label><input id="fp-cst-icms" type="text" value="${p?.cst_icms||''}" placeholder="ex 00, 60, 61" /></div>
            <div class="form-group"><label>CSOSN (Simples)</label><input id="fp-csosn" type="text" value="${p?.csosn||''}" placeholder="ex 102, 500" /></div>
            <div class="form-group"><label>Alíq. ICMS (%)</label><input id="fp-aliq-icms" type="number" step="0.0001" value="${p?.aliq_icms||0}" /></div>
            <div class="form-group" id="fp-adrem-grp"><label>ICMS ad rem (R$/L)</label><input id="fp-adrem" type="number" step="0.00001" value="${p?.aliq_icms_ad_rem||0}" placeholder="combustível monofásico" /></div>
            <div class="form-group"><label>CST PIS</label><input id="fp-cst-pis" type="text" value="${p?.cst_pis||''}" placeholder="ex 01, 04" /></div>
            <div class="form-group"><label>Alíq. PIS (%)</label><input id="fp-aliq-pis" type="number" step="0.0001" value="${p?.aliq_pis||0}" /></div>
            <div class="form-group"><label>CST COFINS</label><input id="fp-cst-cofins" type="text" value="${p?.cst_cofins||''}" placeholder="ex 01, 04" /></div>
            <div class="form-group"><label>Alíq. COFINS (%)</label><input id="fp-aliq-cofins" type="number" step="0.0001" value="${p?.aliq_cofins||0}" /></div>
            <div class="form-group"><label>% Bio (combustível)</label><input id="fp-perc-bio" type="number" step="0.01" value="${p?.perc_bio||0}" /></div>
            <div class="form-group"><label>PMPF (R$)</label><input id="fp-pmpf" type="number" step="0.001" value="${p?.pmpf||0}" /></div>
            <div class="form-group"><label>Unid. tributável</label><input id="fp-unid-trib" type="text" value="${p?.unidade_tributavel||''}" placeholder="ex LT" /></div>
          </div>
        </div>
      </details>

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
    ean:           document.getElementById('fp-ean')?.value.trim() || null,
    categoria:     document.getElementById('fp-categoria').value,
    unidade:       document.getElementById('fp-unidade').value,
    ncm:           document.getElementById('fp-ncm').value.trim() || null,
    preco_custo:   parseFloat(document.getElementById('fp-custo').value) || 0,
    preco_venda_a:   parseFloat(document.getElementById('fp-venda').value) || 0,
    estoque: parseFloat(document.getElementById('fp-estoque').value) || 0,
    estoque_minimo:parseFloat(document.getElementById('fp-estoque-min').value) || 0,
    tanque_id:     document.getElementById('fp-tanque').value || null,
    // perfil fiscal
    ind_combustivel: document.getElementById('fp-ind-comb')?.value || 'N',
    ind_monofasico:  document.getElementById('fp-ind-mono')?.value || 'N',
    cod_anp:       document.getElementById('fp-anp')?.value.trim() || null,
    desc_anp:      document.getElementById('fp-anp-desc')?.value.trim() || null,
    cest:          document.getElementById('fp-cest')?.value.trim() || null,
    origem:        document.getElementById('fp-origem')?.value.trim() || null,
    cfop:          document.getElementById('fp-cfop')?.value.trim() || null,
    cfop_ecf:      document.getElementById('fp-cfop-ecf')?.value.trim() || null,
    cst_icms:      document.getElementById('fp-cst-icms')?.value.trim() || null,
    csosn:         document.getElementById('fp-csosn')?.value.trim() || null,
    aliq_icms:     parseFloat(document.getElementById('fp-aliq-icms')?.value) || 0,
    aliq_icms_ad_rem: parseFloat(document.getElementById('fp-adrem')?.value) || 0,
    cst_pis:       document.getElementById('fp-cst-pis')?.value.trim() || null,
    aliq_pis:      parseFloat(document.getElementById('fp-aliq-pis')?.value) || 0,
    cst_cofins:    document.getElementById('fp-cst-cofins')?.value.trim() || null,
    aliq_cofins:   parseFloat(document.getElementById('fp-aliq-cofins')?.value) || 0,
    perc_bio:      parseFloat(document.getElementById('fp-perc-bio')?.value) || 0,
    pmpf:          parseFloat(document.getElementById('fp-pmpf')?.value) || 0,
    unidade_tributavel: document.getElementById('fp-unid-trib')?.value.trim() || null,
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

// Ao marcar "é combustível", sugere monofásico=Sim (combustível em geral é monofásico)
function produtoToggleComb() {
  const comb = document.getElementById('fp-ind-comb')?.value;
  const mono = document.getElementById('fp-ind-mono');
  const adremGrp = document.getElementById('fp-adrem-grp');
  if (comb === 'S') {
    if (mono && mono.value === 'N') mono.value = 'S';
    if (adremGrp) adremGrp.style.outline = '1px solid #2a5a2a';
  } else {
    if (adremGrp) adremGrp.style.outline = 'none';
  }
}

// ---------- #3 PRECIFICAÇÃO POR MARGEM ----------
// Margem sobre o custo: venda = custo * (1 + margem/100)
function produtoAplicarMargem() {
  const custo = parseFloat(document.getElementById('fp-custo')?.value) || 0;
  const margem = parseFloat(document.getElementById('fp-margem')?.value);
  const vendaEl = document.getElementById('fp-venda');
  if (!vendaEl) return;
  if (isNaN(margem)) { alert('Informe a margem (%) desejada.'); return; }
  if (custo <= 0) { alert('Informe o preço de custo antes de calcular pela margem.'); return; }
  const venda = custo * (1 + margem / 100);
  vendaEl.value = venda.toFixed(2);
  produtoCalcMargem();
}
// Mostra a margem atual (a partir de custo e venda já preenchidos)
function produtoCalcMargem() {
  const custo = parseFloat(document.getElementById('fp-custo')?.value) || 0;
  const venda = parseFloat(document.getElementById('fp-venda')?.value) || 0;
  const margemEl = document.getElementById('fp-margem');
  if (!margemEl) return;
  if (custo > 0 && venda > 0) {
    const m = ((venda / custo) - 1) * 100;
    margemEl.placeholder = `atual: ${m.toFixed(1)}%`;
  }
}

// ---------- #5 EDIÇÃO EM LOTE ----------
async function abrirEdicaoLote(selecionados, empresaId) {
  if (!selecionados || !selecionados.length) return;
  const div = document.getElementById('form-produto');
  div.style.display = 'block';
  div.scrollIntoView({ behavior: 'smooth' });

  const ids = selecionados.map(p => p.id);
  window._loteIds = ids;
  const nomes = selecionados.slice(0, 8).map(p => '• ' + p.nome).join('<br>') + (selecionados.length > 8 ? `<br>… e mais ${selecionados.length - 8}` : '');

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a5a3a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="color:#7be0a0;font-size:0.95rem">✏️ Editar ${ids.length} produtos em lote</h3>
        <button onclick="document.getElementById('form-produto').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
      </div>
      <div style="background:#0f1a14;border:1px solid #2a5a3a;border-radius:6px;padding:8px 10px;margin-bottom:14px;font-size:0.74rem;color:#9fd0b0;max-height:90px;overflow:auto">${nomes}</div>
      <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:6px;padding:8px 10px;margin-bottom:14px;font-size:0.76rem;color:#fbbf24">
        ⚠️ Só os campos marcados serão alterados. Os demais permanecem como estão em cada produto.
      </div>
      <div class="form-grid">
        ${loteCampo('cat', 'Categoria', `<select id="lote-categoria">
          ${['combustivel','lubrificante','filtro','aditivo','mercadoria','material','servico'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>`)}
        ${loteCampo('uni', 'Unidade', `<select id="lote-unidade">${['UN','LTS','KG','CX','PC','M','L','ML','G'].map(u=>`<option value="${u}">${u}</option>`).join('')}</select>`)}
        ${loteCampo('cfop', 'CFOP venda', `<input id="lote-cfop" type="text" placeholder="ex 5102, 5656" />`)}
        ${loteCampo('cst', 'CST ICMS', `<input id="lote-cst-icms" type="text" placeholder="ex 60, 61" />`)}
        ${loteCampo('pis', 'CST PIS', `<input id="lote-cst-pis" type="text" placeholder="ex 01, 04" />`)}
        ${loteCampo('cofins', 'CST COFINS', `<input id="lote-cst-cofins" type="text" placeholder="ex 01, 04" />`)}
        ${loteCampo('ncm', 'NCM', `<input id="lote-ncm" type="text" />`)}
        ${loteCampo('origem', 'Origem', `<input id="lote-origem" type="text" placeholder="0=nacional" />`)}
        ${loteCampo('margem', 'Margem % (recalcula venda p/ cada custo)', `<input id="lote-margem" type="number" step="0.01" placeholder="ex 30" />`)}
      </div>
      <div class="form-acoes" style="margin-top:16px">
        <button onclick="salvarEdicaoLote('${empresaId}')" class="btn-salvar">💾 Aplicar aos ${ids.length} produtos</button>
        <button onclick="document.getElementById('form-produto').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="lote-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}
// monta um campo com checkbox de "alterar este campo"
function loteCampo(key, label, inputHtml) {
  return `<div class="form-group">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
      <input type="checkbox" id="lote-chk-${key}" /> <span>${label}</span>
    </label>
    ${inputHtml}
  </div>`;
}
async function salvarEdicaoLote(empresaId) {
  const msg = document.getElementById('lote-msg');
  const ids = window._loteIds || [];
  if (!ids.length) { msg.textContent = 'Nenhum produto selecionado.'; msg.style.color = '#f44'; return; }

  const set = {};
  const chk = (k) => document.getElementById('lote-chk-' + k)?.checked;
  if (chk('cat'))    set.categoria   = document.getElementById('lote-categoria').value;
  if (chk('uni'))    set.unidade     = document.getElementById('lote-unidade').value;
  if (chk('cfop'))   set.cfop        = document.getElementById('lote-cfop').value.trim() || null;
  if (chk('cst'))    set.cst_icms    = document.getElementById('lote-cst-icms').value.trim() || null;
  if (chk('pis'))    set.cst_pis     = document.getElementById('lote-cst-pis').value.trim() || null;
  if (chk('cofins')) set.cst_cofins  = document.getElementById('lote-cst-cofins').value.trim() || null;
  if (chk('ncm'))    set.ncm         = document.getElementById('lote-ncm').value.trim() || null;
  if (chk('origem')) set.origem      = document.getElementById('lote-origem').value.trim() || null;

  const aplicarMargem = chk('margem');
  const margem = parseFloat(document.getElementById('lote-margem')?.value);

  if (Object.keys(set).length === 0 && !aplicarMargem) {
    msg.textContent = 'Marque ao menos um campo para alterar.'; msg.style.color = '#fbbf24'; return;
  }
  if (aplicarMargem && isNaN(margem)) {
    msg.textContent = 'Informe a margem (%) ou desmarque o campo.'; msg.style.color = '#f44'; return;
  }

  if (!confirm(`Aplicar as alterações marcadas a ${ids.length} produtos?`)) return;
  msg.textContent = 'Aplicando...'; msg.style.color = '#aaa';

  try {
    // campos comuns: um único update para todos os ids
    if (Object.keys(set).length > 0) {
      const { error } = await sb.from('oct_produtos').update(set).in('id', ids);
      if (error) throw error;
    }
    // margem: cada produto recalcula venda a partir do seu custo
    if (aplicarMargem) {
      const { data: prods } = await sb.from('oct_produtos').select('id,preco_custo').in('id', ids);
      for (const p of (prods || [])) {
        const custo = Number(p.preco_custo) || 0;
        if (custo > 0) {
          const venda = +(custo * (1 + margem / 100)).toFixed(2);
          await sb.from('oct_produtos').update({ preco_venda_a: venda }).eq('id', p.id);
        }
      }
    }
    msg.textContent = `✅ ${ids.length} produtos atualizados!`; msg.style.color = '#4caf50';
    setTimeout(() => moduloProdutos(), 1000);
  } catch (e) {
    msg.textContent = 'Erro: ' + (e.message || e); msg.style.color = '#f44';
  }
}
