
let nfeXmlDados = null;
let nfeTanques = [];
let _empresaId = null;
let _empresa = null;
let _nfeGridDados = [];      // cache das NF-es carregadas para o grid
let _nfeGridPagina = 0;      // pagina atual (0-based)
const NFE_GRID_POR_PAGINA = 200;

const TIPOS_PAG = {
  '01':'Dinheiro','02':'Cheque','03':'Cartão Crédito','04':'Cartão Débito',
  '05':'Crédito Loja','10':'Vale Alimentação','11':'Vale Refeição',
  '13':'Vale Combustível','15':'Boleto','17':'PIX','90':'Sem Pagamento','99':'Outros'
};
const MOD_FRETE = {'0':'Por conta emit.','1':'Por conta dest.','2':'Por conta terceiros','9':'Sem frete'};

async function moduloNfe() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis').select('empresa_id, oct_empresas(*)')
    .eq('id', session.user.id).single();

  _empresaId = perfil?.empresa_id;
  _empresa = perfil?.oct_empresas;

  if (!_empresaId) {
    conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>';
    return;
  }

  await carregarCfops();

  const temCert = !!_empresa?.cert_path;
  const senhaAtual = getCertSenha();

  const { data: manifestadas } = await sb
    .from('oct_nfe_manifestadas').select('*')
    .eq('empresa_id', _empresaId).eq('status', 'manifestada')
    .order('nsu', { ascending: false });

  // Carrega TODAS as importadas (com fornecedor) para o grid
  const { data: importadas } = await sb
    .from('oct_nfe_entrada').select('*, oct_pessoas(nome,documento)')
    .eq('empresa_id', _empresaId)
    .order('entrada', { ascending: false });

  _nfeGridDados = importadas || [];
  _nfeGridPagina = 0;

  const { data: ultimoNsuRow } = await sb
    .from('oct_nfe_manifestadas').select('nsu')
    .eq('empresa_id', _empresaId)
    .order('nsu', { ascending: false }).limit(1).single();
  const ultimoNsu = ultimoNsuRow?.nsu || '0';

  const nfesReaisManifest = (manifestadas||[]).filter(n =>
    !n.schema || (!n.schema.includes('resEvento') && !n.schema.includes('procEvento') && !n.schema.includes('evento'))
  );

  conteudo.innerHTML = `
    ${nfeGridStyles()}
    <div class="nfe-grid-janela">
      <div class="nfe-grid-titulo">
        <span>Nota Fiscal Entrada</span>
        <button onclick="navegarPara('empresa')" class="nfe-grid-fechar" title="Fechar">✕</button>
      </div>

      <div class="nfe-grid-toolbar">
        <button class="nfe-tb-btn" onclick="abrirImportarNfe()"><div class="nfe-tb-ico">＋</div><div>F1 · Incluir</div></button>
        <button class="nfe-tb-btn" onclick="document.getElementById('nfe-grid-busca-global').focus()"><div class="nfe-tb-ico">🔍</div><div>F4 · Pesquisar</div></button>
        <button class="nfe-tb-btn" onclick="limparFiltrosNfeGrid()"><div class="nfe-tb-ico">✖</div><div>F5 · Limpar</div></button>
        <div class="nfe-tb-sep"></div>
        <button class="nfe-tb-btn" onclick="nfeGridIrPagina(0)"><div class="nfe-tb-ico">⏮</div><div>Home</div></button>
        <button class="nfe-tb-btn" onclick="nfeGridPag(-1)"><div class="nfe-tb-ico">◀◀</div><div>Pg Up</div></button>
        <button class="nfe-tb-btn" onclick="nfeGridPag(1)"><div class="nfe-tb-ico">▶▶</div><div>Pg Down</div></button>
        <button class="nfe-tb-btn" onclick="nfeGridIrPagina(-1)"><div class="nfe-tb-ico">⏭</div><div>End</div></button>
        <button class="nfe-tb-btn" onclick="renderNfeGrid()"><div class="nfe-tb-ico">≣</div><div>F6 · Listar</div></button>
        <div class="nfe-tb-sep"></div>
        ${temCert ? `<button class="nfe-tb-btn" onclick="abrirManifestar()"><div class="nfe-tb-ico">📡</div><div>Manifestar</div></button>` : ''}
        <div class="nfe-tb-paginfo" id="nfe-grid-paginfo">0 de 0</div>
      </div>

      <div class="nfe-grid-filtros-topo">
        <span style="color:#555;font-size:0.78rem">Busca rápida:</span>
        <input id="nfe-grid-busca-global" type="text" placeholder="Fornecedor, número, chave..." oninput="renderNfeGrid()" />
        <span style="color:#555;font-size:0.78rem;margin-left:12px">Manifestadas pendentes:</span>
        <span class="nfe-grid-badge">${nfesReaisManifest.length}</span>
        ${nfesReaisManifest.length > 0 ? `<button onclick="document.getElementById('nfe-manifestadas-painel').style.display='block';document.getElementById('nfe-manifestadas-painel').scrollIntoView({behavior:'smooth'})" class="nfe-grid-link">ver</button>` : ''}
      </div>

      <div id="nfe-manifestar-painel" style="display:none;padding:16px;border-bottom:1px solid #2a2d3e">
        <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="color:#60a5fa;font-size:0.95rem">📡 Manifestação do Destinatário — SEFAZ</h3>
            <button onclick="fecharManifestar()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
          </div>
          <div class="form-grid" style="max-width:600px;margin-bottom:16px">
            <div class="form-group">
              <label>Ambiente</label>
              <select id="manifest-ambiente"><option value="producao">Produção</option><option value="homologacao">Homologação</option></select>
            </div>
            <div class="form-group">
              <label>Último NSU</label>
              <input id="manifest-nsu" type="text" value="${ultimoNsu}" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado ${senhaAtual ? '— <span style="color:#4caf50;font-size:0.82rem">salva na sessão</span>' : '*'}</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="manifest-senha" type="password" value="${senhaAtual || ''}" placeholder="${senhaAtual ? '(salva — clique em Buscar)' : 'Senha do certificado digital'}" style="flex:1" />
                ${senhaAtual ? `<button onclick="limparSenhaSessao()" style="padding:6px 10px;border-radius:5px;border:1px solid #555;background:transparent;color:#888;cursor:pointer;font-size:0.78rem">Trocar</button>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button onclick="executarManifestar()" class="btn-salvar">Buscar NF-es na SEFAZ</button>
            <span id="manifest-msg" style="font-size:0.85rem"></span>
          </div>
          <div id="manifest-erro-sefaz" style="display:none"></div>
        </div>
      </div>

      <div id="nfe-importar" style="display:none;padding:16px;border-bottom:1px solid #2a2d3e">
        <div class="cert-box">
          <div class="cert-drop" onclick="document.getElementById('nfe-xml-file').click()">
            <span style="font-size:2rem">📄</span>
            <p>Clique ou arraste o <strong>XML da NF-e</strong></p>
          </div>
          <input type="file" id="nfe-xml-file" accept=".xml" style="display:none" onchange="lerXmlNfe(this)" />
        </div>
      </div>

      <div id="nfe-preview" style="display:none;padding:16px"></div>
      <div id="nfe-detalhe" style="display:none;padding:16px"></div>

      <div class="nfe-grid-scroll">
        <table class="nfe-grid-tabela">
          <thead>
            <tr class="nfe-grid-head">
              <th style="width:54px">Seq.</th>
              <th style="width:80px">Número</th>
              <th style="width:80px">Cód. Forn.</th>
              <th style="min-width:220px">Fornecedor</th>
              <th style="width:92px">Emissão</th>
              <th style="width:92px">Entrada</th>
              <th style="width:110px;text-align:right">Total Nota</th>
              <th style="width:56px">Série</th>
              <th style="width:70px">CFOP</th>
              <th style="min-width:150px">Chave NFe</th>
              <th style="width:90px">Situação</th>
              <th style="width:60px"></th>
            </tr>
            <tr class="nfe-grid-filtros">
              <th></th>
              <th><input data-col="numero" oninput="renderNfeGrid()" /></th>
              <th><input data-col="codforn" oninput="renderNfeGrid()" /></th>
              <th><input data-col="fornecedor" oninput="renderNfeGrid()" /></th>
              <th><input data-col="emissao" oninput="renderNfeGrid()" /></th>
              <th><input data-col="entrada" oninput="renderNfeGrid()" /></th>
              <th><input data-col="valor" oninput="renderNfeGrid()" /></th>
              <th><input data-col="serie" oninput="renderNfeGrid()" /></th>
              <th><input data-col="cfop" oninput="renderNfeGrid()" /></th>
              <th><input data-col="chave" oninput="renderNfeGrid()" /></th>
              <th><input data-col="status" oninput="renderNfeGrid()" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody id="nfe-grid-corpo"></tbody>
        </table>
      </div>

      <div class="nfe-grid-rodape">
        <span id="nfe-grid-contador">0 registros</span>
        <span>${_empresa?.nome || ''}</span>
      </div>

      <div id="nfe-manifestadas-painel" style="display:none;padding:16px;border-top:1px solid #2a2d3e">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="color:#60a5fa;font-size:0.9rem">📥 Manifestadas pendentes</h3>
          <button onclick="document.getElementById('nfe-manifestadas-painel').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.1rem">✕</button>
        </div>
        <div id="lista-manifestadas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
          ${nfesReaisManifest.length === 0 ? `<div style="color:#555;padding:20px">Nenhuma NF-e manifestada pendente</div>` :
            nfesReaisManifest.map(n => `
            <div class="nfe-card manifestada" id="card-manifestada-${n.id}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="flex:1;min-width:0">
                  <div class="nfe-card-numero" style="color:#60a5fa">${n.numero ? `NF-e ${n.numero}/${n.serie}` : `NSU ${n.nsu}`}</div>
                  <div class="nfe-card-emit" style="margin-top:3px">${n.emitente || '—'}</div>
                  ${n.emit_cnpj ? `<div style="font-size:0.7rem;color:#555">${n.emit_cnpj}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0">
                  ${n.valor ? `<div style="color:#f97316;font-weight:700;font-size:0.95rem">R$ ${Number(n.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>` : ''}
                  ${n.emissao ? `<div style="font-size:0.72rem;color:#888">${new Date(n.emissao+'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
                  <div style="font-size:0.65rem;color:#444;margin-top:2px">NSU: ${n.nsu}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                ${n.xml ? `<button onclick="importarDoManifestado('${n.id}')" class="btn-nfe-importar">📥 Importar</button>` : `<button onclick="baixarXmlManifestado('${n.id}','${n.nsu}')" class="btn-nfe-baixar">⬇️ Baixar XML</button>`}
                ${n.chave_nfe ? `<button onclick="cienciaManifestado('${n.chave_nfe}')" class="btn-nfe-ciencia">✓ Ciência</button>` : ''}
                <button onclick="ignorarManifestado('${n.id}')" class="btn-nfe-ignorar">✕ Ignorar</button>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;

  renderNfeGrid();
}

function nfeGridStyles() {
  return `<style>
    .nfe-grid-janela{max-width:1500px;margin:0 auto;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4)}
    .nfe-grid-titulo{background:linear-gradient(180deg,#2a2d3e,#1a1d2e);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;color:#e0e0e0;border-bottom:1px solid #2a2d3e}
    .nfe-grid-fechar{background:transparent;border:none;color:#888;cursor:pointer;font-size:1.1rem}
    .nfe-grid-fechar:hover{color:#f44}
    .nfe-grid-toolbar{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#0f1117;border-bottom:1px solid #2a2d3e;flex-wrap:wrap}
    .nfe-tb-btn{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:58px;padding:6px 8px;background:transparent;border:1px solid transparent;border-radius:6px;color:#aaa;cursor:pointer;font-size:0.68rem;transition:all .15s}
    .nfe-tb-btn:hover{background:#1a1d2e;border-color:#2a4a6a;color:#60a5fa}
    .nfe-tb-ico{font-size:1.1rem;color:#60a5fa}
    .nfe-tb-sep{width:1px;height:36px;background:#2a2d3e;margin:0 6px}
    .nfe-tb-paginfo{margin-left:auto;font-size:0.82rem;color:#888;padding:6px 12px;background:#1a1d2e;border-radius:6px;border:1px solid #2a2d3e}
    .nfe-grid-filtros-topo{display:flex;align-items:center;gap:8px;padding:8px 16px;background:#13151f;border-bottom:1px solid #2a2d3e}
    .nfe-grid-filtros-topo input{padding:5px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.82rem;width:260px}
    .nfe-grid-badge{background:#1a2a3a;color:#60a5fa;font-size:0.75rem;padding:2px 10px;border-radius:10px;border:1px solid #2a4a6a;font-weight:600}
    .nfe-grid-link{background:transparent;border:none;color:#60a5fa;cursor:pointer;text-decoration:underline;font-size:0.78rem}
    .nfe-grid-scroll{overflow:auto;max-height:60vh}
    .nfe-grid-tabela{width:100%;border-collapse:collapse;font-size:0.82rem}
    .nfe-grid-head th{position:sticky;top:0;background:#2a2d3e;color:#cfcfcf;text-align:left;padding:8px 10px;font-weight:600;white-space:nowrap;z-index:2;border-bottom:1px solid #1a1d2e}
    .nfe-grid-filtros th{position:sticky;top:34px;background:#1e2235;padding:3px 6px;z-index:1}
    .nfe-grid-filtros input{width:100%;padding:3px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.76rem}
    .nfe-grid-tabela tbody td{padding:6px 10px;border-bottom:1px solid #1a1d2e;white-space:nowrap;color:#d0d0d0}
    .nfe-grid-tabela tbody tr:hover{background:#1a1d2e;cursor:pointer}
    .nfe-grid-tabela tbody tr:nth-child(even){background:rgba(255,255,255,.012)}
    .nfe-grid-tabela tbody tr:nth-child(even):hover{background:#1a1d2e}
    .nfe-grid-rodape{display:flex;justify-content:space-between;padding:8px 16px;background:#1a1d2e;border-top:1px solid #2a2d3e;font-size:0.78rem;color:#888}
    .nfe-gstatus{padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600}
    .nfe-gstatus.importada{background:#1a2a3a;color:#60a5fa;border:1px solid #2a4a6a}
    .nfe-gstatus.confirmada{background:#1a3a1a;color:#4caf50;border:1px solid #2a5a2a}
    .nfe-gstatus.cancelada{background:#3a1a1a;color:#f44;border:1px solid #5a2a2a}
    .nfe-gdel{padding:2px 7px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem}
  </style>`;
}

function _nfeFiltroVal(col){const el=document.querySelector(`.nfe-grid-filtros input[data-col="${col}"]`);return (el?.value||'').toLowerCase().trim();}

function limparFiltrosNfeGrid(){
  document.querySelectorAll('.nfe-grid-filtros input').forEach(i=>i.value='');
  const g=document.getElementById('nfe-grid-busca-global'); if(g) g.value='';
  _nfeGridPagina=0;
  renderNfeGrid();
}

function nfeGridPag(dir){
  const filtradas=_nfeGridFiltrar();
  const maxPag=Math.max(0,Math.ceil(filtradas.length/NFE_GRID_POR_PAGINA)-1);
  _nfeGridPagina=Math.min(maxPag,Math.max(0,_nfeGridPagina+dir));
  renderNfeGrid();
}
function nfeGridIrPagina(p){
  const filtradas=_nfeGridFiltrar();
  const maxPag=Math.max(0,Math.ceil(filtradas.length/NFE_GRID_POR_PAGINA)-1);
  _nfeGridPagina = p<0 ? maxPag : 0;
  renderNfeGrid();
}

function _nfeGridFiltrar(){
  const bg=(document.getElementById('nfe-grid-busca-global')?.value||'').toLowerCase().trim();
  const fNum=_nfeFiltroVal('numero'), fForn=_nfeFiltroVal('fornecedor'), fCod=_nfeFiltroVal('codforn');
  const fEmi=_nfeFiltroVal('emissao'), fEnt=_nfeFiltroVal('entrada'), fVal=_nfeFiltroVal('valor');
  const fSer=_nfeFiltroVal('serie'), fCfop=_nfeFiltroVal('cfop'), fChave=_nfeFiltroVal('chave'), fStatus=_nfeFiltroVal('status');
  return _nfeGridDados.filter(n=>{
    const forn=(n.oct_pessoas?.nome||'').toLowerCase();
    const doc=(n.oct_pessoas?.documento||'').toLowerCase();
    if(bg){
      const blob=`${n.numero||''} ${forn} ${n.chave_nfe||''} ${n.serie||''} ${n.cfop||''}`.toLowerCase();
      if(!blob.includes(bg)) return false;
    }
    if(fNum && !String(n.numero||'').toLowerCase().includes(fNum)) return false;
    if(fForn && !forn.includes(fForn)) return false;
    if(fCod && !doc.includes(fCod)) return false;
    if(fEmi && !_fmtData(n.emissao).includes(fEmi)) return false;
    if(fEnt && !_fmtData(n.entrada).includes(fEnt)) return false;
    if(fVal && !String(n.valor_total||'').includes(fVal)) return false;
    if(fSer && !String(n.serie||'').toLowerCase().includes(fSer)) return false;
    if(fCfop && !String(n.cfop||'').toLowerCase().includes(fCfop)) return false;
    if(fChave && !String(n.chave_nfe||'').toLowerCase().includes(fChave)) return false;
    if(fStatus && !String(n.status||'').toLowerCase().includes(fStatus)) return false;
    return true;
  });
}

function _fmtData(d){return d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'';}

function renderNfeGrid(){
  const corpo=document.getElementById('nfe-grid-corpo');
  if(!corpo) return;
  const filtradas=_nfeGridFiltrar();
  const ini=_nfeGridPagina*NFE_GRID_POR_PAGINA;
  const pagina=filtradas.slice(ini,ini+NFE_GRID_POR_PAGINA);
  const totalPag=Math.max(1,Math.ceil(filtradas.length/NFE_GRID_POR_PAGINA));

  if(pagina.length===0){
    corpo.innerHTML=`<tr><td colspan="12" style="text-align:center;padding:40px;color:#555">Nenhuma NF-e encontrada.</td></tr>`;
  } else {
    corpo.innerHTML=pagina.map((n,idx)=>{
      const chave=n.chave_nfe||'';
      const chaveCurta=chave?chave.substring(0,18)+'…':'';
      const cod=(n.oct_pessoas?.documento||'').replace(/\D/g,'').substring(0,6);
      return `<tr ondblclick="abrirDetalheNfe('${n.id}')">
        <td style="color:#666;text-align:center">${ini+idx+1}</td>
        <td><strong>${n.numero||'—'}</strong></td>
        <td style="color:#888">${cod||'—'}</td>
        <td title="${(n.oct_pessoas?.nome||'').replace(/"/g,'&quot;')}">${n.oct_pessoas?.nome||'—'}</td>
        <td>${_fmtData(n.emissao)||'—'}</td>
        <td>${_fmtData(n.entrada)||'—'}</td>
        <td style="text-align:right;font-weight:600">${Number(n.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td>${n.serie||'—'}</td>
        <td>${n.cfop||'—'}</td>
        <td style="font-family:monospace;font-size:0.72rem;color:#888" title="${chave}">${chaveCurta||'—'}</td>
        <td><span class="nfe-gstatus ${n.status||''}">${n.status||'—'}</span></td>
        <td><button class="nfe-gdel" onclick="event.stopPropagation();excluirNfe('${n.id}')">✕</button></td>
      </tr>`;
    }).join('');
  }

  const contador=document.getElementById('nfe-grid-contador');
  if(contador) contador.textContent=`${filtradas.length} registro${filtradas.length!==1?'s':''}`;
  const paginfo=document.getElementById('nfe-grid-paginfo');
  if(paginfo) paginfo.textContent=`${_nfeGridPagina+1} de ${totalPag}`;
}

// ─── EXCLUIR ────────────────────────────────────────────────

async function excluirNfe(id) {
  const reverter = confirm(
    'Excluir esta NF-e do sistema?\n\n' +
    'Clique OK para excluir E reverter o estoque dos tanques.\n' +
    'Clique Cancelar para abortar.'
  );
  if (!reverter) return;

  const det = document.getElementById('nfe-detalhe');
  if (det) det.style.display = 'none';

  const { data: itens } = await sb
    .from('oct_nfe_entrada_itens')
    .select('quantidade, cod_anp, nfe_id')
    .eq('nfe_id', id);

  const { data: lmcItens } = await sb
    .from('oct_lmc')
    .select('id, tanque_id, entrada, saldo_anterior')
    .eq('empresa_id', _empresaId)
    .like('observacoes', '%NF-e%')
    .order('criado_em', { ascending: false });

  const { data: nfe } = await sb
    .from('oct_nfe_entrada')
    .select('numero, serie')
    .eq('id', id).single();

  const numSerie = nfe ? nfe.numero + '/' + nfe.serie : '';

  if (lmcItens && numSerie) {
    const { data: lmcNota } = await sb
      .from('oct_lmc')
      .select('id, tanque_id, entrada')
      .eq('empresa_id', _empresaId)
      .ilike('observacoes', '%' + numSerie + '%');

    if (lmcNota && lmcNota.length > 0) {
      for (const lmc of lmcNota) {
        const { data: tanque } = await sb
          .from('oct_tanques').select('estoque_atual').eq('id', lmc.tanque_id).single();
        if (tanque) {
          const novoEstoque = Math.max(0, Number(tanque.estoque_atual) - Number(lmc.entrada));
          await sb.from('oct_tanques').update({ estoque_atual: novoEstoque }).eq('id', lmc.tanque_id);
        }
        await sb.from('oct_lmc').delete().eq('id', lmc.id);
      }
    }
  }

  await sb.from('oct_produto_nfe').delete().eq('nfe_id', id);
  await sb.from('oct_nfe_entrada_itens').delete().eq('nfe_id', id);
  await sb.from('oct_contas_pagar').delete().eq('nfe_id', id);
  const { error } = await sb.from('oct_nfe_entrada').delete().eq('id', id);

  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  moduloNfe();
}

async function abrirDetalheNfe(id) {
  const div = document.getElementById('nfe-detalhe');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  const { data: nfe } = await sb
    .from('oct_nfe_entrada')
    .select('*, oct_pessoas(nome,documento), oct_nfe_entrada_itens(*, oct_produtos(nome,codigo))')
    .eq('id', id).single();

  if (!nfe) { div.innerHTML = '<p style="color:#f44">NF-e não encontrada.</p>'; return; }

  const itens = nfe.oct_nfe_entrada_itens || [];
  const pags  = nfe.forma_pagamento || [];
  const dups  = nfe.duplicatas || [];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #f97316;border-radius:12px;overflow:hidden">
      <div style="background:#1a1d2e;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2d3e">
        <div>
          <h3 style="color:#f97316;font-size:1rem">📄 NF-e ${nfe.numero}/${nfe.serie} — ${nfe.oct_pessoas?.nome||'—'}</h3>
          <div style="font-size:0.72rem;color:#555;margin-top:2px;font-family:monospace">${nfe.chave_nfe||'—'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="nfe-status ${nfe.status}">${nfe.status}</span>
          <button onclick="fecharDetalheNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
        </div>
      </div>

      <div style="display:flex;gap:0;border-bottom:1px solid #2a2d3e;background:#0f1117;overflow-x:auto">
        <button onclick="mostrarAba('aba-capa')" id="btn-aba-capa" class="nfe-aba ativo">📋 Capa</button>
        <button onclick="mostrarAba('aba-itens')" id="btn-aba-itens" class="nfe-aba">📦 Itens (${itens.length})</button>
        <button onclick="mostrarAba('aba-tributacao')" id="btn-aba-tributacao" class="nfe-aba">💰 Tributação</button>
        <button onclick="mostrarAba('aba-pagamento')" id="btn-aba-pagamento" class="nfe-aba">💳 Pagamento</button>
        <button onclick="mostrarAba('aba-transporte')" id="btn-aba-transporte" class="nfe-aba">🚚 Transporte</button>
        <button onclick="mostrarAba('aba-obs')" id="btn-aba-obs" class="nfe-aba">📝 Obs</button>
      </div>

      <div id="aba-capa" class="nfe-aba-conteudo" style="padding:20px">
        <div class="form-grid">
          <div class="form-group"><label>Número</label><input id="edit-numero" type="text" value="${nfe.numero||''}" /></div>
          <div class="form-group"><label>Série</label><input id="edit-serie" type="text" value="${nfe.serie||''}" /></div>
          <div class="form-group"><label>Data Emissão</label><input id="edit-emissao" type="date" value="${nfe.emissao||''}" /></div>
          <div class="form-group"><label>Data Entrada</label><input id="edit-entrada" type="date" value="${nfe.entrada||''}" /></div>
          <div class="form-group span2"><label>Fornecedor</label><input type="text" value="${nfe.oct_pessoas?.nome||'—'}" disabled style="opacity:0.6" /></div>
          <div class="form-group span2"><label>Natureza da Operação</label><input id="edit-natureza" type="text" value="${nfe.natureza||''}" /></div>
          <div class="form-group">
            <label>CFOP</label>
            ${renderCfopInput('edit-cfop', nfe.cfop||'')}
          </div>
          <div class="form-group"><label>Valor Total NF-e</label><input id="edit-valor-total" type="number" step="0.01" value="${nfe.valor_total||0}" /></div>
          <div class="form-group"><label>Valor Frete</label><input id="edit-frete" type="number" step="0.01" value="${nfe.valor_frete||0}" /></div>
          <div class="form-group"><label>Valor Desconto</label><input id="edit-desconto" type="number" step="0.01" value="${nfe.valor_desconto||0}" /></div>
          <div class="form-group">
            <label>Status</label>
            <select id="edit-status">
              <option value="importada" ${nfe.status==='importada'?'selected':''}>Importada</option>
              <option value="confirmada" ${nfe.status==='confirmada'?'selected':''}>Confirmada</option>
              <option value="cancelada" ${nfe.status==='cancelada'?'selected':''}>Cancelada</option>
            </select>
          </div>
          <div class="form-group span2"><label>Chave NF-e</label><input id="edit-chave" type="text" value="${nfe.chave_nfe||''}" style="font-size:0.72rem;font-family:monospace" /></div>
          ${nfe.n_prot ? `<div class="form-group span2"><label>Protocolo</label><input type="text" value="${nfe.n_prot}" disabled style="opacity:0.6;font-family:monospace;font-size:0.82rem" /></div>` : ''}
        </div>
      </div>

      <div id="aba-itens" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div style="overflow-x:auto">
          <table class="nfe-tabela">
            <thead><tr><th>#</th><th>Cód.</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>Qtd</th><th>Un</th><th>Vl.Unit</th><th>Total</th><th>Produto vinculado</th></tr></thead>
            <tbody>
              ${itens.map((it,i) => `
                <tr class="${it.cod_anp?'item-combustivel':''}">
                  <td>${i+1}</td>
                  <td style="font-size:0.75rem;font-family:monospace">${it.codigo||'—'}</td>
                  <td><strong>${it.descricao||'—'}</strong>${it.cod_anp?`<br><span style="font-size:0.68rem;color:#888">ANP: ${it.cod_anp}</span>`:''}</td>
                  <td style="font-size:0.75rem">${it.ncm||'—'}</td>
                  <td style="font-size:0.75rem">${it.cfop||'—'}${it.cfop?`<br><span style="font-size:0.65rem;color:#60a5fa">${cfopDescricao(it.cfop)}</span>`:''}</td>
                  <td>${Number(it.quantidade||0).toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
                  <td style="font-size:0.75rem">${it.unidade||'—'}</td>
                  <td>R$ ${Number(it.valor_unitario||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</td>
                  <td><strong>R$ ${Number(it.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
                  <td>
                    ${it.oct_produtos
                      ? `<span style="color:#4caf50;font-size:0.82rem">✓ ${it.oct_produtos.nome}</span>`
                      : `<button onclick="abrirVinculoProduto('${it.id}','${it.descricao.replace(/'/g,"&#39;")}','${it.codigo}')" style="padding:4px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.75rem">🔗 Vincular</button>`}
                  </td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#1e2235">
                <td colspan="8" style="text-align:right;font-weight:600;padding:8px 10px">Total:</td>
                <td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${itens.reduce((s,it)=>s+Number(it.valor_total||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div id="modal-vinculo-produto" style="display:none;margin-top:16px;background:#1a1d2e;border:1px solid #2a4a6a;border-radius:10px;padding:20px"></div>
      </div>

      <div id="aba-tributacao" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          <div style="background:#0f1117;border-radius:8px;padding:12px"><div class="nfe-label">Base ICMS</div><div style="font-size:1rem;font-weight:600;margin-top:4px">R$ ${Number(nfe.valor_icms||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div>
          <div style="background:#0f1117;border-radius:8px;padding:12px"><div class="nfe-label">Valor PIS</div><div style="font-size:1rem;font-weight:600;margin-top:4px">R$ ${Number(nfe.valor_pis||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div>
          <div style="background:#0f1117;border-radius:8px;padding:12px"><div class="nfe-label">Valor COFINS</div><div style="font-size:1rem;font-weight:600;margin-top:4px">R$ ${Number(nfe.valor_cofins||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div>
          ${nfe.v_icms_mono_ret?`<div style="background:#1a2a1a;border:1px solid #2a5a2a;border-radius:8px;padding:12px;grid-column:span 3"><div class="nfe-label">⛽ ICMS Monofásico Retido</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><div><div class="nfe-label">Qtd BC</div><div style="font-weight:600">${Number(nfe.q_bc_mono_ret||0).toLocaleString('pt-BR',{minimumFractionDigits:3})} L</div></div><div><div class="nfe-label">Valor</div><div style="font-weight:600;color:#4caf50">R$ ${Number(nfe.v_icms_mono_ret||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div></div></div>`:''}
        </div>
        <table class="nfe-tabela">
          <thead><tr><th>Descrição</th><th>CST ICMS</th><th>Alíq ICMS</th><th>ICMS Mono</th><th>CST PIS</th><th>Alíq PIS</th><th>CST COFINS</th><th>Alíq COFINS</th></tr></thead>
          <tbody>${itens.map(it=>`<tr class="${it.cod_anp?'item-combustivel':''}"><td>${it.descricao}</td><td>${it.cst_icms||'—'}</td><td>${it.aliq_icms||0}%</td><td>${it.v_icms_mono_ret?`<span style="color:#4caf50">R$ ${Number(it.v_icms_mono_ret).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`:'—'}</td><td>${it.cst_pis||'—'}</td><td>${it.aliq_pis||0}%</td><td>${it.cst_cofins||'—'}</td><td>${it.aliq_cofins||0}%</td></tr>`).join('')}</tbody>
        </table>
      </div>

      <div id="aba-pagamento" class="nfe-aba-conteudo" style="display:none;padding:20px">
        ${pags.length===0?`<p style="color:#555;text-align:center;padding:20px">Sem informações de pagamento</p>`:`
          <table class="nfe-tabela" style="margin-bottom:16px">
            <thead><tr><th>Condição</th><th>Forma</th><th>Descrição</th><th>Valor</th></tr></thead>
            <tbody>${pags.map(p=>`<tr><td>${p.indPag==='0'?'À Vista':'A Prazo'}</td><td>${TIPOS_PAG[p.tPag]||p.tPag||'—'}</td><td>${p.xPag||'—'}</td><td><strong>R$ ${Number(p.vPag||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td></tr>`).join('')}</tbody>
            <tfoot><tr style="background:#1e2235"><td colspan="3" style="font-weight:600;padding:8px 10px">Total:</td><td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${pags.reduce((s,p)=>s+Number(p.vPag||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr></tfoot>
          </table>`}
        ${dups.length>0?`<div class="modulo-header"><h2>Duplicatas</h2></div><table class="nfe-tabela"><thead><tr><th>Nº</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${dups.map(d=>`<tr><td>${d.nDup||'—'}</td><td>${d.dVenc?new Date(d.dVenc+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td><td>R$ ${Number(d.vDup||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`).join('')}</tbody></table>`:''}
      </div>

      <div id="aba-transporte" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div class="form-grid">
          <div class="form-group"><label>Modalidade Frete</label><input type="text" value="${MOD_FRETE[nfe.mod_frete]||nfe.mod_frete||'—'}" disabled style="opacity:0.6" /></div>
          <div class="form-group"><label>Transportadora</label><input type="text" value="${nfe.transp_nome||'—'}" disabled style="opacity:0.6" /></div>
        </div>
      </div>

      <div id="aba-obs" class="nfe-aba-conteudo" style="display:none;padding:20px">
        ${nfe.inf_cpl?`<div style="background:#0f1117;border-radius:8px;padding:14px;margin-bottom:16px;font-size:0.78rem;color:#888;line-height:1.6"><div class="nfe-label" style="margin-bottom:8px">Informações Adicionais (XML)</div>${nfe.inf_cpl.substring(0,600)}...</div>`:''}
        <div class="form-group"><label>Observações internas</label><textarea id="edit-obs" rows="4" style="width:100%;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.9rem;resize:vertical">${nfe.observacoes||''}</textarea></div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #2a2d3e;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button onclick="salvarEdicaoNfe('${id}')" class="btn-salvar">💾 Salvar</button>
        <button onclick="fecharDetalheNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Fechar</button>
        <button onclick="confirmarNfeImportada('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer">✓ Confirmar NF-e</button>
        <button onclick="excluirNfe('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>
        <span id="nfe-detalhe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function abrirVinculoProduto(itemId, descricao, codigo) {
  const modal = document.getElementById('modal-vinculo-produto');
  modal.style.display = 'block';
  modal.innerHTML = '<p style="color:#888">Carregando...</p>';
  modal.scrollIntoView({ behavior: 'smooth' });

  const { data: produtos } = await sb
    .from('oct_produtos').select('id,nome,codigo,unidade')
    .eq('empresa_id', _empresaId).order('nome').limit(100);

  modal.innerHTML = `
    <h4 style="color:#60a5fa;margin-bottom:16px">🔗 Vincular: <strong>${descricao}</strong></h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div class="modulo-header"><h2>Associar existente</h2></div>
        <input id="busca-produto" type="text" placeholder="Buscar produto..." oninput="filtrarProdutosModal(this.value)" style="width:100%;margin-bottom:10px" />
        <div id="lista-produtos-vinculo" style="max-height:200px;overflow-y:auto">
          ${produtos?.map(p=>`<div onclick="vincularProdutoExistente('${itemId}','${p.id}','${p.nome.replace(/'/g,"&#39;")}')" style="padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #2a2d3e;margin-bottom:6px" onmouseover="this.style.borderColor='#f97316'" onmouseout="this.style.borderColor='#2a2d3e'"><div style="font-weight:600;font-size:0.85rem">${p.nome}</div><div style="font-size:0.72rem;color:#888">${p.codigo||'—'} · ${p.unidade||'un'}</div></div>`).join('')||'<p style="color:#555;text-align:center;padding:16px">Nenhum produto</p>'}
        </div>
      </div>
      <div>
        <div class="modulo-header"><h2>Cadastrar novo</h2></div>
        <div class="form-group" style="margin-bottom:10px"><label>Nome *</label><input id="novo-prod-nome" type="text" value="${descricao}" /></div>
        <div class="form-group" style="margin-bottom:10px"><label>Código</label><input id="novo-prod-codigo" type="text" value="${codigo}" /></div>
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group"><label>Unidade</label><select id="novo-prod-unidade"><option value="un">UN</option><option value="LTS">LTS</option><option value="kg">KG</option><option value="cx">CX</option><option value="pc">PC</option><option value="L">L</option></select></div>
          <div class="form-group"><label>Categoria</label><select id="novo-prod-categoria"><option value="combustivel">Combustível</option><option value="lubrificante">Lubrificante</option><option value="mercadoria">Mercadoria</option><option value="material">Material</option></select></div>
        </div>
        <button onclick="cadastrarNovoProduto('${itemId}')" class="btn-salvar" style="width:100%">+ Cadastrar e vincular</button>
        <span id="novo-prod-msg" style="font-size:0.82rem;margin-top:6px;display:block"></span>
      </div>
    </div>
    <button onclick="document.getElementById('modal-vinculo-produto').style.display='none'" style="margin-top:12px;padding:8px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
  `;
  modal._produtos = produtos || [];
}

function filtrarProdutosModal(termo) {
  const modal = document.getElementById('modal-vinculo-produto');
  const lista = document.getElementById('lista-produtos-vinculo');
  if (!modal._produtos || !lista) return;
  const f = modal._produtos.filter(p => p.nome.toLowerCase().includes(termo.toLowerCase()) || (p.codigo||'').toLowerCase().includes(termo.toLowerCase()));
  lista.innerHTML = f.length===0 ? '<p style="color:#555;text-align:center;padding:16px">Nenhum produto</p>' :
    f.map(p=>`<div onclick="vincularProdutoExistente('${p._itemId||''}','${p.id}','${p.nome.replace(/'/g,"&#39;")}')" style="padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #2a2d3e;margin-bottom:6px" onmouseover="this.style.borderColor='#f97316'" onmouseout="this.style.borderColor='#2a2d3e'"><div style="font-weight:600;font-size:0.85rem">${p.nome}</div><div style="font-size:0.72rem;color:#888">${p.codigo||'—'}</div></div>`).join('');
}

async function vincularProdutoExistente(itemId, produtoId, produtoNome) {
  await sb.from('oct_nfe_entrada_itens').update({ produto_id: produtoId }).eq('id', itemId);
  const { data: item } = await sb.from('oct_nfe_entrada_itens').select('nfe_id').eq('id', itemId).single();
  if (item) await sb.from('oct_produto_nfe').upsert({ produto_id: produtoId, nfe_id: item.nfe_id, nfe_item_id: itemId, empresa_id: _empresaId }, { onConflict: 'nfe_item_id' });
  document.getElementById('modal-vinculo-produto').style.display = 'none';
  const btn = document.querySelector(`button[onclick*="${itemId}"]`);
  if (btn) btn.closest('td').innerHTML = `<span style="color:#4caf50;font-size:0.82rem">✓ ${produtoNome}</span>`;
}

async function cadastrarNovoProduto(itemId) {
  const nome = document.getElementById('novo-prod-nome').value.trim();
  const msg  = document.getElementById('novo-prod-msg');
  if (!nome) { msg.textContent = 'Nome obrigatório.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Cadastrando...'; msg.style.color = '#888';
  const { data: novo, error } = await sb.from('oct_produtos').insert({
    empresa_id: _empresaId, nome,
    codigo: document.getElementById('novo-prod-codigo').value.trim() || null,
    unidade: document.getElementById('novo-prod-unidade').value,
    categoria: document.getElementById('novo-prod-categoria').value,
  }).select().single();
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  await vincularProdutoExistente(itemId, novo.id, novo.nome);
}

function mostrarAba(id){document.querySelectorAll('.nfe-aba-conteudo').forEach(el=>el.style.display='none');document.querySelectorAll('.nfe-aba').forEach(el=>el.classList.remove('ativo'));document.getElementById(id).style.display='block';document.getElementById('btn-'+id).classList.add('ativo');}
function fecharDetalheNfe(){document.getElementById('nfe-detalhe').style.display='none';}

async function salvarEdicaoNfe(id){
  const msg=document.getElementById('nfe-detalhe-msg');
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const{error}=await sb.from('oct_nfe_entrada').update({
    numero:document.getElementById('edit-numero').value,
    serie:document.getElementById('edit-serie').value,
    emissao:document.getElementById('edit-emissao').value||null,
    entrada:document.getElementById('edit-entrada').value||null,
    natureza:document.getElementById('edit-natureza').value,
    cfop:document.getElementById('edit-cfop').value,
    valor_total:parseFloat(document.getElementById('edit-valor-total').value)||0,
    valor_frete:parseFloat(document.getElementById('edit-frete').value)||0,
    valor_desconto:parseFloat(document.getElementById('edit-desconto').value)||0,
    chave_nfe:document.getElementById('edit-chave').value||null,
    status:document.getElementById('edit-status').value,
    observacoes:document.getElementById('edit-obs')?.value||null,
  }).eq('id',id);
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='✓ Salvo!';msg.style.color='#4caf50';
  setTimeout(()=>moduloNfe(),1200);
}

async function confirmarNfeImportada(id){
  await sb.from('oct_nfe_entrada').update({status:'confirmada'}).eq('id',id);
  document.getElementById('nfe-detalhe-msg').textContent='✓ Confirmada!';
  document.getElementById('nfe-detalhe-msg').style.color='#4caf50';
  setTimeout(()=>moduloNfe(),1000);
}

// ─── MANIFESTAÇÃO ───────────────────────────────────────────

function abrirManifestar(){const p=document.getElementById('nfe-manifestar-painel');p.style.display=p.style.display==='none'?'block':'none';if(p.style.display==='block')p.scrollIntoView({behavior:'smooth'});}
function fecharManifestar(){document.getElementById('nfe-manifestar-painel').style.display='none';}
function limparSenhaSessao(){setCertSenha(null);moduloNfe().then(()=>abrirManifestar());}

async function executarManifestar(){
  const msg=document.getElementById('manifest-msg');
  const erroDiv=document.getElementById('manifest-erro-sefaz');
  const ambiente=document.getElementById('manifest-ambiente').value;
  const nsu=document.getElementById('manifest-nsu').value||'0';
  const senha=document.getElementById('manifest-senha').value||getCertSenha();
  erroDiv.style.display='none';
  if(!senha){msg.textContent='Informe a senha.';msg.style.color='#f44';return;}
  setCertSenha(senha);msg.textContent='🔄 Consultando SEFAZ...';msg.style.color='#888';
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/manifestar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,cert_base64:b64,cert_senha:senha,ambiente,ultimo_nsu:nsu})});
    const dados=await resp.json();
    if(dados.erro){msg.textContent='✕ Erro';msg.style.color='#f44';erroDiv.style.display='block';erroDiv.style.cssText='display:block;margin-top:12px;padding:12px;background:#1a1010;border:1px solid #5a2a2a;border-radius:8px;font-size:0.82rem;color:#f87171';erroDiv.innerHTML=`<strong>Erro:</strong> ${dados.erro}`;return;}
    if(dados.cstat&&dados.cstat!=='138'){erroDiv.style.display='block';erroDiv.style.cssText='display:block;margin-top:12px;padding:12px;background:#1a1500;border:1px solid #5a4a00;border-radius:8px;font-size:0.82rem;color:#fbbf24';erroDiv.innerHTML=`<strong>SEFAZ [${dados.cstat}]:</strong> ${dados.xmotivo}`;}
    if(!dados.nfes||dados.nfes.length===0){msg.textContent='✓ Nenhuma NF-e nova.';msg.style.color='#4caf50';if(dados.ultimo_nsu)document.getElementById('manifest-nsu').value=dados.ultimo_nsu;return;}
    let salvas=0;
    for(const n of dados.nfes){const{error}=await sb.from('oct_nfe_manifestadas').upsert({empresa_id:_empresaId,nsu:n.nsu,schema:n.schema,chave_nfe:n.chave||null,numero:n.numero||null,serie:n.serie||null,emissao:n.emissao||null,emitente:n.emitente||null,emit_cnpj:n.emitCnpj||null,valor:n.valor?parseFloat(n.valor):null,nat_op:n.natOp||null,xml:n.xml||null,tipo:n.tipo||'resumo',status:'manifestada',ultimo_nsu_consulta:dados.ultimo_nsu},{onConflict:'empresa_id,nsu',ignoreDuplicates:true});if(!error)salvas++;}
    if(dados.ultimo_nsu)document.getElementById('manifest-nsu').value=dados.ultimo_nsu;
    msg.textContent=`✓ ${salvas} NF-e(s) salvas!`;msg.style.color='#4caf50';
    setTimeout(()=>moduloNfe(),1000);
  }catch(e){msg.textContent='✕ '+e.message;msg.style.color='#f44';}
}

async function importarDoManifestado(id){
  const{data:n}=await sb.from('oct_nfe_manifestadas').select('*').eq('id',id).single();
  if(!n?.xml){alert('XML não disponível. Use "Baixar XML" primeiro.');return;}
  const{data:tanques}=await sb.from('oct_tanques').select('*').eq('empresa_id',_empresaId).order('numero');
  nfeTanques=tanques||[];
  const parser=new DOMParser();
  const xml=parser.parseFromString(n.xml,'text/xml');
  await processarXmlNfe(xml,`NF-e_${n.numero||n.nsu}.xml`,id);
}

async function baixarXmlManifestado(id,nsu){
  const senha=getCertSenha();const ambiente=document.getElementById('manifest-ambiente')?.value||'producao';
  if(!senha){alert('Informe a senha no painel de manifestação.');return;}
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/xml/${nsu}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,cert_base64:b64,cert_senha:senha,ambiente,nsu})});
    const dados=await resp.json();
    if(dados.nfes?.[0]?.xml){await sb.from('oct_nfe_manifestadas').update({xml:dados.nfes[0].xml}).eq('id',id);moduloNfe();}
    else alert('Não foi possível baixar: '+(dados.erro||JSON.stringify(dados)));
  }catch(e){alert('Erro: '+e.message);}
}

async function cienciaManifestado(chave){
  const senha=getCertSenha();const ambiente=document.getElementById('manifest-ambiente')?.value||'producao';
  if(!senha){alert('Informe a senha no painel de manifestação.');return;}
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/manifestar/ciencia`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,chave_nfe:chave,cert_base64:b64,cert_senha:senha,ambiente})});
    const dados=await resp.json();alert(`SEFAZ: [${dados.cstat}] ${dados.xmotivo}`);
  }catch(e){alert('Erro: '+e.message);}
}

async function ignorarManifestado(id){if(!confirm('Ignorar esta NF-e?'))return;await sb.from('oct_nfe_manifestadas').update({status:'ignorada'}).eq('id',id);document.getElementById(`card-manifestada-${id}`)?.remove();}

function abrirImportarNfe(){const a=document.getElementById('nfe-importar');a.style.display=a.style.display==='none'?'block':'none';if(a.style.display==='block')a.scrollIntoView({behavior:'smooth'});}
function lerXmlNfe(input){if(!input.files.length)return;lerXmlNfeFile(input.files[0]);}
function lerXmlNfeFile(file){const r=new FileReader();r.onload=async(e)=>{try{const parser=new DOMParser();const xml=parser.parseFromString(e.target.result,'text/xml');const{data:tanques}=await sb.from('oct_tanques').select('*').eq('empresa_id',_empresaId).order('numero');nfeTanques=tanques||[];await processarXmlNfe(xml,file.name,null);}catch(err){alert('Erro: '+err.message);}};r.readAsText(file,'UTF-8');}

async function processarXmlNfe(xml,nomeArquivo,manifestadaId){
  const d=parseNFe(xml);
  const xmlString=new XMLSerializer().serializeToString(xml);
  nfeXmlDados={...d,nomeArquivo,manifestadaId,xmlString};
  const{data:fornExist}=await sb.from('oct_pessoas').select('id,nome').eq('empresa_id',_empresaId).eq('documento',d.emitCnpj).single();
  nfeXmlDados.fornecedorExistente=fornExist||null;
  renderPreviewNfe();
}

// ─── PREVIEW COM EDIÇÃO DE ITENS ────────────────────────────

function recalcularItem(i) {
  const qtd  = parseFloat(document.getElementById(`item-qtd-${i}`)?.value) || 0;
  const tot  = parseFloat(document.getElementById(`item-tot-${i}`)?.dataset.total) || 0;
  const unit = qtd > 0 ? tot / qtd : 0;
  const elUnit = document.getElementById(`item-unit-${i}`);
  if (elUnit) {
    elUnit.textContent = 'R$ ' + unit.toLocaleString('pt-BR', {minimumFractionDigits:4, maximumFractionDigits:4});
    elUnit.dataset.valor = unit;
  }
}

function renderPreviewNfe(){
  const d=nfeXmlDados;
  document.getElementById('nfe-importar').style.display='none';
  document.getElementById('nfe-detalhe').style.display='none';
  const preview=document.getElementById('nfe-preview');
  preview.style.display='block';
  preview.scrollIntoView({behavior:'smooth'});

  const cfopDesc=cfopDescricao(d.cfopCapa||d.itens[0]?.cfop);

  preview.innerHTML=`
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#f97316">📄 NF-e ${d.numero}/${d.serie} — ${d.emitNome}</h3>
        <button onclick="cancelarNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div><span class="nfe-label">Nº/Série</span><br><strong>${d.numero}/${d.serie}</strong></div>
        <div><span class="nfe-label">Emissão</span><br><strong>${d.dhEmi?new Date(d.dhEmi+'T12:00:00').toLocaleDateString('pt-BR'):'-'}</strong></div>
        <div><span class="nfe-label">Total</span><br><strong style="color:#f97316;font-size:1.1rem">R$ ${d.vNF.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
        <div style="grid-column:span 2"><span class="nfe-label">Fornecedor</span><br><strong>${d.emitNome}</strong><br><span style="font-size:0.72rem;color:#888">${d.emitCnpj}</span></div>
        <div><span class="nfe-label">CFOP</span><br><strong>${d.cfopCapa||d.itens[0]?.cfop||'—'}</strong>${cfopDesc?`<br><span style="font-size:0.72rem;color:#60a5fa">${cfopDesc}</span>`:''}</div>
      </div>

      <div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:14px;margin-bottom:16px">
        <div class="nfe-label" style="margin-bottom:10px">👤 Fornecedor</div>
        ${d.fornecedorExistente
          ? `<div style="display:flex;align-items:center;gap:10px">
              <span style="color:#4caf50">✓ Já cadastrado: <strong>${d.fornecedorExistente.nome}</strong></span>
              <input type="hidden" id="forn-id" value="${d.fornecedorExistente.id}" />
            </div>`
          : `<div class="form-grid" style="max-width:600px">
              <div class="form-group"><label>Nome *</label><input id="forn-nome" type="text" value="${d.emitNome}" /></div>
              <div class="form-group"><label>IE</label><input id="forn-ie" type="text" value="${d.emitIE||''}" /></div>
            </div>`}
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;background:#0f1117;border-radius:8px;margin-bottom:16px;font-size:0.82rem">
        <div><span class="nfe-label">ICMS BC</span><br>R$ ${d.vBC.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">PIS</span><br>R$ ${d.vPIS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">COFINS</span><br>R$ ${d.vCOFINS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">Frete</span><br>R$ ${d.vFrete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        ${d.vICMSMonoRet>0?`<div style="grid-column:span 4;background:#1a2a1a;border-radius:6px;padding:8px;border:1px solid #2a5a2a"><span class="nfe-label">⛽ ICMS Mono Ret</span><span style="margin-left:12px;color:#4caf50;font-weight:600">R$ ${d.vICMSMonoRet.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${d.qBCMonoRet.toLocaleString('pt-BR',{minimumFractionDigits:3})} L)</span></div>`:''}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>📦 Itens — edite quantidade/unidade se necessário</h2></div>
      </div>
      <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:10px;margin-bottom:12px;font-size:0.82rem;color:#fbbf24">
        💡 <strong>Dica:</strong> Se o item é uma caixa com múltiplas unidades (ex: 1 CX com 80 unidades), altere a quantidade para o total de unidades e o sistema calculará o custo unitário automaticamente.
      </div>
      <div style="overflow-x:auto;margin-bottom:16px">
        <table class="nfe-tabela">
          <thead>
            <tr>
              <th>#</th><th>Descrição / Produto</th><th>NCM / CFOP</th>
              <th>Qtd NF-e</th><th>Un NF-e</th>
              <th style="background:#1a2a1a;color:#4caf50">Qtd importar ✏️</th>
              <th style="background:#1a2a1a;color:#4caf50">Un importar ✏️</th>
              <th>Total NF-e</th>
              <th style="background:#1a2a1a;color:#4caf50">Custo unitário</th>
              <th>Tanque</th>
              <th>Nome no sistema</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${d.itens.map((it,i)=>`
              <tr class="${it.precisaTanque?'item-combustivel':it.ehLubrificante?'item-lubrificante':''}">
                <td>${i+1}</td>
                <td>
                  <strong>${it.descricao}</strong>
                  ${it.codAnp?`<br><span style="font-size:0.68rem;color:${it.precisaTanque?'#4caf50':'#fbbf24'}">
                    ${it.precisaTanque?'⛽':'🛢'} ${it.codAnp} — ${it.descAnp}
                  </span>`:''}
                  <br><span style="font-size:0.68rem;padding:1px 5px;border-radius:4px;background:${it.precisaTanque?'#1a3a1a':it.ehLubrificante?'#2a2000':'#1a1d2e'};color:${it.precisaTanque?'#4caf50':it.ehLubrificante?'#fbbf24':'#888'}">
                    ${it.tipoItem}
                  </span>
                </td>
                <td style="font-size:0.75rem">${it.ncm}<br><strong>${it.cfop}</strong></td>
                <td style="color:#888">${it.quantidade.toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
                <td style="color:#888;font-size:0.82rem">${it.unidade}</td>
                <td style="background:#0f1a0f">
                  <input id="item-qtd-${i}" type="number" value="${it.quantidade}" step="0.001" min="0.001" oninput="recalcularItem(${i})" style="width:80px;padding:4px 6px;border-radius:4px;border:1px solid #2a5a2a;background:#0f1117;color:#4caf50;font-size:0.85rem;font-weight:600" />
                </td>
                <td style="background:#0f1a0f">
                  <input id="item-un-${i}" type="text" value="${it.unidade}" style="width:60px;padding:4px 6px;border-radius:4px;border:1px solid #2a5a2a;background:#0f1117;color:#4caf50;font-size:0.85rem;text-transform:uppercase" />
                </td>
                <td>R$ ${it.valorTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td style="background:#0f1a0f">
                  <span id="item-unit-${i}" data-valor="${it.valorUnitario}" style="color:#4caf50;font-weight:600;font-size:0.85rem">
                    R$ ${it.valorUnitario.toLocaleString('pt-BR',{minimumFractionDigits:4})}
                  </span>
                  <span id="item-tot-${i}" data-total="${it.valorTotal}" style="display:none"></span>
                </td>
                <td>
                  ${it.precisaTanque
                    ? `<select id="tanque-item-${i}" style="background:#0f1117;border:1px solid #2a2d3e;color:#e0e0e0;padding:4px 6px;border-radius:4px;font-size:0.78rem;min-width:110px">
                        <option value="">Selecione...</option>
                        ${nfeTanques.map(t=>`<option value="${t.id}">${t.numero} — ${t.combustivel}</option>`).join('')}
                       </select>`
                    : `<span style="color:#555;font-size:0.75rem">—</span>`}
                </td>
                <td>
                  <input id="prod-nome-${i}" type="text" value="${it.descricao}" style="width:130px;padding:4px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.78rem" />
                </td>
                <td>
                  <select id="prod-acao-${i}" style="padding:4px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.75rem">
                    <option value="novo">Cadastrar novo</option>
                    <option value="ignorar">Não vincular</option>
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${d.itens.some(it=>it.precisaTanque)?`<div style="background:#0f1117;border:1px solid #f97316;border-radius:8px;padding:10px;margin-bottom:16px;font-size:0.82rem;color:#f97316">⚠️ Vincule cada combustível ao tanque correspondente.</div>`:''}

      <div class="form-acoes">
        <button class="btn-salvar" onclick="confirmarNfe()">✓ Confirmar e importar</button>
        <button onclick="cancelarNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="nfe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

function cancelarNfe(){nfeXmlDados=null;document.getElementById('nfe-preview').style.display='none';document.getElementById('nfe-importar').style.display='none';}

async function confirmarNfe(){
  const msg=document.getElementById('nfe-msg');
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const d=nfeXmlDados;

  for(let i=0;i<d.itens.length;i++){
    const qtdEl   = document.getElementById(`item-qtd-${i}`);
    const unEl    = document.getElementById(`item-un-${i}`);
    const unitEl  = document.getElementById(`item-unit-${i}`);
    if(qtdEl) d.itens[i].quantidadeImport = parseFloat(qtdEl.value) || d.itens[i].quantidade;
    if(unEl)  d.itens[i].unidadeImport    = unEl.value.trim().toUpperCase() || d.itens[i].unidade;
    if(unitEl) d.itens[i].custoUnitario   = parseFloat(unitEl.dataset.valor) || d.itens[i].valorUnitario;

    if(d.itens[i].precisaTanque){
      const sel=document.getElementById(`tanque-item-${i}`);
      if(!sel?.value){msg.textContent=`Vincule o tanque: ${d.itens[i].descricao}`;msg.style.color='#f44';return;}
      d.itens[i].tanqueId=sel.value;
    }
  }

  let fornecedorId=null;
  const fornIdEl=document.getElementById('forn-id');
  if(fornIdEl){
    fornecedorId=fornIdEl.value;
  }else if(d.emitCnpj){
    const{data:forn}=await sb.from('oct_pessoas').select('id').eq('empresa_id',_empresaId).eq('documento',d.emitCnpj).single();
    if(forn){fornecedorId=forn.id;}
    else{
      const{data:nf}=await sb.from('oct_pessoas').insert({
        empresa_id:_empresaId,nome:document.getElementById('forn-nome')?.value||d.emitNome,
        tipo:'fornecedor',documento:d.emitCnpj,
        ie:document.getElementById('forn-ie')?.value||d.emitIE,
        cidade:d.emitMun,uf:d.emitUF,
      }).select().single();
      fornecedorId=nf?.id;
    }
  }

  const{data:nfe,error:nfeErr}=await sb.from('oct_nfe_entrada').insert({
    empresa_id:_empresaId,numero:d.numero,serie:d.serie,chave_nfe:d.chNFe||null,emissao:d.dhEmi,
    entrada:new Date().toISOString().split('T')[0],fornecedor_id:fornecedorId,natureza:d.natOp,
    cfop:d.cfopCapa||d.itens[0]?.cfop||null,
    valor_total:d.vNF,valor_icms:d.vICMS,valor_pis:d.vPIS,valor_cofins:d.vCOFINS,
    valor_frete:d.vFrete,valor_desconto:d.vDesc,status:'importada',
    forma_pagamento:d.pagamentos,duplicatas:d.dups,xml_completo:d.xmlString,
    n_prot:d.nProt,q_bc_mono_ret:d.qBCMonoRet||null,v_icms_mono_ret:d.vICMSMonoRet||null,
    transp_nome:d.transpNome||null,mod_frete:d.modFrete||null,inf_cpl:d.infCpl||null,
  }).select().single();

  if(nfeErr){msg.textContent='Erro: '+nfeErr.message;msg.style.color='#f44';return;}

  // Lança contas a pagar automaticamente (uma única vez)
  await lancarContasPagarNfe(nfe.id, _empresaId, fornecedorId, d.numero, d.serie, d.pagamentos, d.dups);

  for(let i=0;i<d.itens.length;i++){
    const it=d.itens[i];
    const acao=document.getElementById(`prod-acao-${i}`)?.value||'ignorar';
    const nomeProd=document.getElementById(`prod-nome-${i}`)?.value||it.descricao;
    const qtdFinal   = it.quantidadeImport   || it.quantidade;
    const unFinal    = it.unidadeImport      || it.unidade;
    const custoFinal = it.custoUnitario      || it.valorUnitario;

    let produtoId=null;
    if(acao==='novo'){
      const{data:np}=await sb.from('oct_produtos').insert({
        empresa_id:_empresaId,nome:nomeProd,codigo:it.codigo||null,
        unidade:unFinal,
        categoria:it.precisaTanque?'combustivel':it.ehLubrificante?'lubrificante':'mercadoria',
        ncm:it.ncm||null,cfop:it.cfop||null,
        preco_custo:custoFinal,
        tanque_id:it.tanqueId||null,
      }).select().single();
      produtoId=np?.id||null;
    }

    const{data:itemSalvo}=await sb.from('oct_nfe_entrada_itens').insert({
      nfe_id:nfe.id,codigo:it.codigo,descricao:it.descricao,
      ncm:it.ncm,cest:it.cest,cfop:it.cfop,
      unidade:unFinal,
      quantidade:qtdFinal,
      valor_unitario:custoFinal,
      valor_total:it.valorTotal,
      cod_anp:it.codAnp,desc_anp:it.descAnp,perc_bio:it.pBio||0,
      cst_icms:it.cstIcms,aliq_icms:it.aliqIcms,
      v_icms_mono_ret:it.vICMSMonoRetItem||null,q_bc_mono_ret:it.qBCMonoRetItem||null,
      cst_pis:it.cstPis,aliq_pis:it.aliqPis,cst_cofins:it.cstCofins,aliq_cofins:it.aliqCofins,
      produto_id:produtoId,
    }).select().single();

    if(produtoId&&itemSalvo){
      await sb.from('oct_produto_nfe').insert({
        produto_id:produtoId,nfe_id:nfe.id,nfe_item_id:itemSalvo.id,empresa_id:_empresaId
      });
    }

    if(it.precisaTanque&&it.tanqueId){
      const{data:tanque}=await sb.from('oct_tanques').select('estoque_atual,capacidade').eq('id',it.tanqueId).single();
      if(tanque){
        const qtdTanque = it.quantidade;
        const novoEstoque=Math.min(Number(tanque.estoque_atual)+Number(qtdTanque),Number(tanque.capacidade));
        await sb.from('oct_tanques').update({estoque_atual:novoEstoque}).eq('id',it.tanqueId);
        await sb.from('oct_lmc').insert({empresa_id:_empresaId,tanque_id:it.tanqueId,data:new Date().toISOString().split('T')[0],saldo_anterior:tanque.estoque_atual,entrada:qtdTanque,saldo_final:novoEstoque,observacoes:`NF-e ${d.numero}/${d.serie} — ${d.emitNome}`});
      }
    }
  }

  if(d.manifestadaId)await sb.from('oct_nfe_manifestadas').update({status:'importada'}).eq('id',d.manifestadaId);
  msg.textContent='✓ NF-e importada com sucesso!';msg.style.color='#4caf50';
  nfeXmlDados=null;
  setTimeout(()=>moduloNfe(),1500);
}
