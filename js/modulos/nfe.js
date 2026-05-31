
const SEFAZ_URL = 'https://octano-sefaz-production.up.railway.app';

const ANP_COMBUSTIVEIS = {
  '130401001': 'GASOLINA COMUM',
  '130401002': 'GASOLINA ADITIVADA',
  '130201001': 'ETANOL',
  '130101001': 'DIESEL S500',
  '130101002': 'DIESEL S10',
  '130302010': 'GNV',
  '320101100': 'ARLA 32',
};

let nfeXmlDados = null;
let nfeTanques = [];
let nfesManifestadasCache = [];

async function moduloNfe() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis').select('empresa_id, oct_empresas(*)').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  const empresa = perfil?.oct_empresas;

  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }

  const { data: nfes } = await sb
    .from('oct_nfe_entrada').select('*, oct_pessoas(nome)')
    .eq('empresa_id', empresaId)
    .order('entrada', { ascending: false }).limit(30);

  const temCert = !!empresa?.cert_path;

  conteudo.innerHTML = `
    <div class="modulo-container" style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>📄 Entradas NF-e</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${temCert ? `
            <button onclick="abrirManifestar()" class="btn-manifestar">
              🔄 Manifestar NF-e <span style="font-size:0.72rem;opacity:0.8">(busca automática)</span>
            </button>
          ` : `
            <span style="color:#888;font-size:0.82rem;padding:8px 12px;background:#13151f;border-radius:6px;border:1px solid #2a2d3e">
              ⚠️ Cadastre o certificado digital para usar a manifestação automática
            </span>
          `}
          <button onclick="abrirImportarNfe()" class="btn-salvar" style="padding:8px 18px">📂 Importar XML</button>
        </div>
      </div>

      <!-- PAINEL MANIFESTAÇÃO -->
      <div id="nfe-manifestar-painel" style="display:none;margin-bottom:20px">
        <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="color:#60a5fa;font-size:0.95rem">🔄 Manifestação do Destinatário — SEFAZ</h3>
            <button onclick="fecharManifestar()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
          </div>
          <div class="form-grid" style="max-width:500px;margin-bottom:16px">
            <div class="form-group">
              <label>Ambiente</label>
              <select id="manifest-ambiente">
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção</option>
              </select>
            </div>
            <div class="form-group">
              <label>Último NSU consultado</label>
              <input id="manifest-nsu" type="text" value="0" placeholder="0" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado *</label>
              <input id="manifest-senha" type="password" placeholder="Senha do certificado digital" />
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <button onclick="executarManifestar()" class="btn-salvar">🔍 Buscar NF-es na SEFAZ</button>
            <span id="manifest-msg" style="font-size:0.85rem"></span>
          </div>
          <div id="manifest-resultado" style="display:none;margin-top:16px"></div>
        </div>
      </div>

      <!-- AREA DE IMPORTACAO XML -->
      <div id="nfe-importar" style="display:none;margin-bottom:20px">
        <div class="cert-box">
          <div class="cert-drop" id="nfe-drop-area" onclick="document.getElementById('nfe-xml-file').click()">
            <span style="font-size:2rem">📄</span>
            <p>Clique para selecionar o <strong>XML da NF-e</strong></p>
            <p style="font-size:0.75rem;color:#555">Arraste ou clique para selecionar o arquivo .xml</p>
          </div>
          <input type="file" id="nfe-xml-file" accept=".xml" style="display:none" onchange="lerXmlNfe(this)" />
        </div>
      </div>

      <!-- PREVIEW DA NF-e -->
      <div id="nfe-preview" style="display:none;margin-bottom:20px"></div>

      <!-- LISTA NF-es -->
      <div class="modulo-header"><h2>Últimas entradas</h2></div>
      ${!nfes || nfes.length === 0 ? `
        <div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:12px">
          <div style="font-size:2.5rem">📄</div>
          <p style="margin-top:8px">Nenhuma NF-e importada ainda</p>
          ${temCert ? '<p style="margin-top:4px;font-size:0.82rem">Use "Manifestar NF-e" para buscar automaticamente na SEFAZ</p>' : ''}
        </div>
      ` : `
        <div style="overflow-x:auto">
          <table class="nfe-tabela">
            <thead>
              <tr>
                <th>NF-e</th>
                <th>Fornecedor</th>
                <th>Emissão</th>
                <th>Entrada</th>
                <th>Valor Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${nfes.map(n => `
                <tr>
                  <td><strong>${n.numero || '-'}/${n.serie || '-'}</strong><br>
                    <span style="font-size:0.7rem;color:#555">${(n.chave_nfe || '').substring(0,20)}...</span>
                  </td>
                  <td>${n.oct_pessoas?.nome || n.fornecedor_id || '-'}</td>
                  <td>${n.emissao ? new Date(n.emissao + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                  <td>${n.entrada ? new Date(n.entrada + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                  <td>R$ ${Number(n.valor_total || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                  <td><span class="nfe-status ${n.status}">${n.status}</span></td>
                  <td>
                    ${n.chave_nfe ? `<button onclick="manifestarCiencia('${n.chave_nfe}')" style="font-size:0.72rem;padding:3px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer">Ciência</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // Drag and drop
  const dropArea = document.getElementById('nfe-drop-area');
  if (dropArea) {
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = '#f97316'; });
    dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = '#2a2d3e'; });
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.style.borderColor = '#2a2d3e';
      const file = e.dataTransfer.files[0];
      if (file) lerXmlNfeFile(file);
    });
  }
}

function abrirManifestar() {
  document.getElementById('nfe-manifestar-painel').style.display = 'block';
  document.getElementById('nfe-manifestar-painel').scrollIntoView({ behavior: 'smooth' });
}

function fecharManifestar() {
  document.getElementById('nfe-manifestar-painel').style.display = 'none';
}

async function executarManifestar() {
  const msg = document.getElementById('manifest-msg');
  const resultado = document.getElementById('manifest-resultado');
  const ambiente = document.getElementById('manifest-ambiente').value;
  const nsu = document.getElementById('manifest-nsu').value || '0';
  const senha = document.getElementById('manifest-senha').value;

  if (!senha) { msg.textContent = 'Informe a senha do certificado.'; msg.style.color = '#f44'; return; }

  msg.textContent = '🔄 Consultando SEFAZ...'; msg.style.color = '#888';
  resultado.style.display = 'none';

  try {
    // Busca certificado do Supabase Storage
    const session = await getSession();
    const { data: perfil } = await sb
      .from('oct_perfis').select('empresa_id, oct_empresas(cnpj, cert_path)')
      .eq('id', session.user.id).single();

    const certPath = perfil?.oct_empresas?.cert_path;
    const cnpj = perfil?.oct_empresas?.cnpj?.replace(/\D/g, '');

    if (!certPath) { msg.textContent = 'Certificado não encontrado. Cadastre em Empresa.'; msg.style.color = '#f44'; return; }

    // Baixa o certificado do Storage
    const { data: certBlob, error: certErr } = await sb.storage.from('octano-certs').download(certPath);
    if (certErr) { msg.textContent = 'Erro ao carregar certificado: ' + certErr.message; msg.style.color = '#f44'; return; }

    const certBuffer = await certBlob.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certBuffer)));

    msg.textContent = '🔄 Comunicando com SEFAZ...'; msg.style.color = '#888';

    const resp = await fetch(`${SEFAZ_URL}/manifestar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, cert_base64: certBase64, cert_senha: senha, ambiente, ultimo_nsu: nsu })
    });

    const dados = await resp.json();

    if (dados.erro) {
      msg.textContent = '❌ ' + dados.erro;
      msg.style.color = '#f44'; return;
    }

    msg.textContent = `✅ ${dados.total || 0} documento(s) encontrado(s)`;
    msg.style.color = '#4caf50';

    if (dados.ultimo_nsu) {
      document.getElementById('manifest-nsu').value = dados.ultimo_nsu;
    }

    renderResultadoManifestacao(dados);

  } catch(e) {
    msg.textContent = '❌ Erro: ' + e.message;
    msg.style.color = '#f44';
  }
}

function renderResultadoManifestacao(dados) {
  const resultado = document.getElementById('manifest-resultado');
  resultado.style.display = 'block';

  if (!dados.nfes || dados.nfes.length === 0) {
    resultado.innerHTML = '<p style="color:#555;padding:16px;text-align:center">Nenhuma NF-e nova encontrada.</p>';
    return;
  }

  resultado.innerHTML = `
    <div style="margin-bottom:10px;font-size:0.82rem;color:#888">
      NSU atual: <strong>${dados.ultimo_nsu}</strong> / Máximo: <strong>${dados.max_nsu}</strong>
      — Status SEFAZ: <strong>${dados.cstat}</strong> ${dados.xmotivo}
    </div>
    <div style="overflow-x:auto">
      <table class="nfe-tabela">
        <thead>
          <tr>
            <th>NSU</th>
            <th>NF-e</th>
            <th>Emitente</th>
            <th>Emissão</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${dados.nfes.map(n => `
            <tr>
              <td>${n.nsu}</td>
              <td>${n.numero ? `${n.numero}/${n.serie}` : n.schema}</td>
              <td>${n.emitente || '-'}<br><span style="font-size:0.7rem;color:#555">${n.emitCnpj || ''}</span></td>
              <td>${n.emissao || '-'}</td>
              <td>${n.valor ? 'R$ ' + Number(n.valor).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '-'}</td>
              <td style="display:flex;gap:4px;flex-wrap:wrap">
                ${n.xml ? `<button onclick="importarNfeManifestaDA(${JSON.stringify(n).replace(/"/g, '&quot;')})" style="font-size:0.72rem;padding:3px 8px;border-radius:4px;border:none;background:#f97316;color:#fff;cursor:pointer">📥 Importar</button>` : ''}
                ${n.chave ? `<button onclick="registrarCienciaSEFAZ('${n.chave}')" style="font-size:0.72rem;padding:3px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer">✓ Ciência</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function importarNfeManifestaDA(nfeObj) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(nfeObj.xml, 'text/xml');
    await processarXmlNfe(xml, `NF-e_${nfeObj.numero || nfeObj.nsu}.xml`);
    fecharManifestar();
  } catch(e) {
    alert('Erro ao importar: ' + e.message);
  }
}

async function registrarCienciaSEFAZ(chave) {
  const senha = document.getElementById('manifest-senha')?.value;
  const ambiente = document.getElementById('manifest-ambiente')?.value || 'homologacao';
  if (!senha) { alert('Informe a senha do certificado primeiro.'); return; }

  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis').select('empresa_id, oct_empresas(cnpj, cert_path)')
    .eq('id', session.user.id).single();

  const certPath = perfil?.oct_empresas?.cert_path;
  const cnpj = perfil?.oct_empresas?.cnpj?.replace(/\D/g, '');
  const { data: certBlob } = await sb.storage.from('octano-certs').download(certPath);
  const certBuffer = await certBlob.arrayBuffer();
  const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certBuffer)));

  const resp = await fetch(`${SEFAZ_URL}/manifestar/ciencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cnpj, chave_nfe: chave, cert_base64: certBase64, cert_senha: senha, ambiente })
  });
  const dados = await resp.json();
  alert(`SEFAZ: ${dados.cstat} — ${dados.xmotivo}`);
}

function abrirImportarNfe() {
  const area = document.getElementById('nfe-importar');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

function lerXmlNfe(input) {
  if (!input.files.length) return;
  lerXmlNfeFile(input.files[0]);
}

function lerXmlNfeFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(e.target.result, 'text/xml');
      await processarXmlNfe(xml, file.name);
    } catch(err) { alert('Erro ao ler XML: ' + err.message); }
  };
  reader.readAsText(file, 'UTF-8');
}

function getXmlVal(xml, tag) {
  const el = xml.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}

async function processarXmlNfe(xml, nomeArquivo) {
  const chave = getXmlVal(xml, 'chNFe');
  const numero = getXmlVal(xml, 'nNF');
  const serie = getXmlVal(xml, 'serie');
  const emissao = getXmlVal(xml, 'dhEmi').substring(0, 10);
  const natOp = getXmlVal(xml, 'natOp');
  const emitNome = getXmlVal(xml, 'xNome');
  const emitCnpj = getXmlVal(xml, 'CNPJ');
  const vNF = parseFloat(getXmlVal(xml, 'vNF')) || 0;
  const vICMS = parseFloat(getXmlVal(xml, 'vICMS')) || 0;
  const vPIS = parseFloat(getXmlVal(xml, 'vPIS')) || 0;
  const vCOFINS = parseFloat(getXmlVal(xml, 'vCOFINS')) || 0;
  const vFrete = parseFloat(getXmlVal(xml, 'vFrete')) || 0;

  const dets = xml.getElementsByTagName('det');
  const itens = [];
  for (const det of dets) {
    const item = {
      codigo: det.querySelector('cProd')?.textContent || '',
      descricao: det.querySelector('xProd')?.textContent || '',
      ncm: det.querySelector('NCM')?.textContent || '',
      cfop: det.querySelector('CFOP')?.textContent || '',
      unidade: det.querySelector('uCom')?.textContent || '',
      quantidade: parseFloat(det.querySelector('qCom')?.textContent || '0'),
      valorUnitario: parseFloat(det.querySelector('vUnCom')?.textContent || '0'),
      valorTotal: parseFloat(det.querySelector('vProd')?.textContent || '0'),
      codAnp: det.querySelector('cProdANP')?.textContent || '',
      descAnp: det.querySelector('xProdANP')?.textContent || '',
      percBio: parseFloat(det.querySelector('pGLP')?.textContent || det.querySelector('pBioGasolina')?.textContent || '0'),
      cstIcms: det.querySelector('CST')?.textContent || det.querySelector('CSOSN')?.textContent || '',
      aliqIcms: parseFloat(det.querySelector('pICMS')?.textContent || '0'),
      aliqPis: parseFloat(det.querySelector('pPIS')?.textContent || '0'),
      aliqCofins: parseFloat(det.querySelector('pCOFINS')?.textContent || '0'),
      tanqueId: null,
      ehCombustivel: !!det.querySelector('cProdANP'),
    };
    itens.push(item);
  }

  nfeXmlDados = { chave, numero, serie, emissao, natOp, emitNome, emitCnpj, vNF, vICMS, vPIS, vCOFINS, vFrete, itens, nomeArquivo };

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const { data: tanques } = await sb.from('oct_tanques').select('*').eq('empresa_id', perfil.empresa_id).order('numero');
  nfeTanques = tanques || [];
  renderPreviewNfe();
}

function renderPreviewNfe() {
  const d = nfeXmlDados;
  document.getElementById('nfe-importar').style.display = 'none';
  const preview = document.getElementById('nfe-preview');
  preview.style.display = 'block';

  preview.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:20px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div><span class="nfe-label">NF-e Nº</span><br><strong>${d.numero}/${d.serie}</strong></div>
        <div><span class="nfe-label">Emissão</span><br><strong>${d.emissao ? new Date(d.emissao + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</strong></div>
        <div><span class="nfe-label">Valor Total</span><br><strong style="color:#f97316">R$ ${d.vNF.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong></div>
        <div style="grid-column:span 2"><span class="nfe-label">Fornecedor</span><br><strong>${d.emitNome}</strong> — ${d.emitCnpj}</div>
        <div><span class="nfe-label">Natureza</span><br>${d.natOp}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;background:#0f1117;border-radius:8px;margin-bottom:16px">
        <div><span class="nfe-label">ICMS</span><br>R$ ${d.vICMS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">PIS</span><br>R$ ${d.vPIS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">COFINS</span><br>R$ ${d.vCOFINS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">Frete</span><br>R$ ${d.vFrete.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
      </div>
      <div class="modulo-header"><h2>Itens da NF-e</h2></div>
      <div style="overflow-x:auto">
        <table class="nfe-tabela" style="margin-bottom:16px">
          <thead>
            <tr><th>#</th><th>Descrição</th><th>Qtd</th><th>Vlr Unit</th><th>Total</th><th>ANP</th><th>Vincular Tanque</th></tr>
          </thead>
          <tbody>
            ${d.itens.map((it, i) => `
              <tr class="${it.ehCombustivel ? 'item-combustivel' : ''}">
                <td>${i+1}</td>
                <td><strong>${it.descricao}</strong>${it.codAnp ? `<br><span style="font-size:0.7rem;color:#888">ANP: ${it.codAnp}</span>` : ''}</td>
                <td>${it.quantidade.toLocaleString('pt-BR', {minimumFractionDigits:3})} ${it.unidade}</td>
                <td>R$ ${it.valorUnitario.toLocaleString('pt-BR', {minimumFractionDigits:4})}</td>
                <td>R$ ${it.valorTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td>${it.ehCombustivel ? '<span class="nfe-badge-anp">⛽ Combustível</span>' : '-'}</td>
                <td>${it.ehCombustivel ? `
                  <select id="tanque-item-${i}" style="background:#0f1117;border:1px solid #2a2d3e;color:#e0e0e0;padding:4px 8px;border-radius:4px;font-size:0.8rem">
                    <option value="">Selecione...</option>
                    ${nfeTanques.map(t => `<option value="${t.id}">${t.numero} — ${t.combustivel}</option>`).join('')}
                  </select>` : '<span style="color:#555">—</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="background:#0f1117;border:1px solid #f97316;border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.85rem;color:#f97316">
        ⚠️ Vincule cada combustível ao tanque correspondente. O estoque será atualizado automaticamente.
      </div>
      <div class="form-acoes">
        <button class="btn-salvar" onclick="confirmarNfe()">✅ Confirmar entrada e atualizar estoque</button>
        <button onclick="cancelarNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="nfe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

function cancelarNfe() {
  nfeXmlDados = null;
  document.getElementById('nfe-preview').style.display = 'none';
  document.getElementById('nfe-importar').style.display = 'block';
  if (document.getElementById('nfe-xml-file')) document.getElementById('nfe-xml-file').value = '';
}

async function confirmarNfe() {
  const msg = document.getElementById('nfe-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil.empresa_id;
  const d = nfeXmlDados;

  for (let i = 0; i < d.itens.length; i++) {
    if (d.itens[i].ehCombustivel) {
      const sel = document.getElementById(`tanque-item-${i}`);
      if (!sel?.value) { msg.textContent = `Vincule o tanque para: ${d.itens[i].descricao}`; msg.style.color = '#f44'; return; }
      d.itens[i].tanqueId = sel.value;
    }
  }

  let fornecedorId = null;
  if (d.emitCnpj) {
    const { data: forn } = await sb.from('oct_pessoas').select('id').eq('empresa_id', empresaId).eq('documento', d.emitCnpj).single();
    if (forn) { fornecedorId = forn.id; }
    else {
      const { data: novoForn } = await sb.from('oct_pessoas').insert({ empresa_id: empresaId, nome: d.emitNome, tipo: 'fornecedor', documento: d.emitCnpj }).select().single();
      fornecedorId = novoForn?.id;
    }
  }

  const { data: nfe, error: nfeErr } = await sb.from('oct_nfe_entrada').insert({
    empresa_id: empresaId, numero: d.numero, serie: d.serie,
    chave_nfe: d.chave || null, emissao: d.emissao,
    entrada: new Date().toISOString().split('T')[0],
    fornecedor_id: fornecedorId, natureza: d.natOp,
    valor_total: d.vNF, valor_icms: d.vICMS, valor_pis: d.vPIS,
    valor_cofins: d.vCOFINS, valor_frete: d.vFrete, status: 'importada',
  }).select().single();

  if (nfeErr) { msg.textContent = 'Erro: ' + nfeErr.message; msg.style.color = '#f44'; return; }

  for (let i = 0; i < d.itens.length; i++) {
    const it = d.itens[i];
    await sb.from('oct_nfe_entrada_itens').insert({
      nfe_id: nfe.id, codigo: it.codigo, descricao: it.descricao,
      ncm: it.ncm, cfop: it.cfop, unidade: it.unidade,
      quantidade: it.quantidade, valor_unitario: it.valorUnitario,
      valor_total: it.valorTotal, cod_anp: it.codAnp, desc_anp: it.descAnp,
    });
    if (it.ehCombustivel && it.tanqueId) {
      const { data: tanque } = await sb.from('oct_tanques').select('estoque_atual, capacidade').eq('id', it.tanqueId).single();
      if (tanque) {
        const novoEstoque = Math.min(Number(tanque.estoque_atual) + Number(it.quantidade), Number(tanque.capacidade));
        await sb.from('oct_tanques').update({ estoque_atual: novoEstoque }).eq('id', it.tanqueId);
        await sb.from('oct_lmc').insert({
          empresa_id: empresaId, tanque_id: it.tanqueId,
          data: new Date().toISOString().split('T')[0],
          saldo_anterior: tanque.estoque_atual, entrada: it.quantidade,
          saldo_final: novoEstoque,
          observacoes: `NF-e ${d.numero}/${d.serie} — ${d.emitNome}`,
        });
      }
    }
  }

  msg.textContent = '✅ NF-e importada e estoques atualizados!'; msg.style.color = '#4caf50';
  nfeXmlDados = null;
  setTimeout(() => moduloNfe(), 1500);
}
