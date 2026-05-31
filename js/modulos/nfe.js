
// Códigos ANP para identificar combustíveis
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

async function moduloNfe() {
  const conteudo = document.getElementById('conteudo');
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;

  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44">Configure sua empresa primeiro.</p>'; return; }

  // Carrega NF-es anteriores
  const { data: nfes } = await sb
    .from('oct_nfe_entrada')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('entrada', { ascending: false })
    .limit(20);

  conteudo.innerHTML = `
    <div class="modulo-container" style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>📄 Entradas NF-e</h2></div>
        <button onclick="abrirImportarNfe()" class="btn-salvar" style="padding:8px 18px">📂 Importar XML</button>
      </div>

      <!-- AREA DE IMPORTACAO -->
      <div id="nfe-importar" style="display:none;margin-bottom:24px">
        <div class="cert-box">
          <div class="cert-drop" id="nfe-drop-area" onclick="document.getElementById('nfe-xml-file').click()">
            <span style="font-size:2rem">📄</span>
            <p>Clique para selecionar o <strong>XML da NF-e</strong></p>
            <p style="font-size:0.75rem;color:#555">Arquivo .xml da nota fiscal de entrada</p>
          </div>
          <input type="file" id="nfe-xml-file" accept=".xml" style="display:none" onchange="lerXmlNfe(this)" />
        </div>
      </div>

      <!-- PREVIEW DA NF-e -->
      <div id="nfe-preview" style="display:none;margin-bottom:24px"></div>

      <!-- LISTA DE NF-es -->
      <div class="modulo-header"><h2>Últimas entradas</h2></div>
      ${!nfes || nfes.length === 0 ? `
        <div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:12px">
          <p>Nenhuma NF-e importada ainda</p>
        </div>
      ` : `
        <table class="nfe-tabela">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Emissão</th>
              <th>Entrada</th>
              <th>Valor Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${nfes.map(n => `
              <tr>
                <td>${n.numero || '-'}/${n.serie || '-'}</td>
                <td>${n.fornecedor_id || '-'}</td>
                <td>${n.emissao ? new Date(n.emissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                <td>${n.entrada ? new Date(n.entrada + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                <td>R$ ${Number(n.valor_total || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td><span class="nfe-status ${n.status}">${n.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
    } catch(err) {
      alert('Erro ao ler XML: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function getXmlVal(xml, tag) {
  const el = xml.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}

async function processarXmlNfe(xml, nomeArquivo) {
  // Dados da NF-e
  const chave = getXmlVal(xml, 'chNFe');
  const numero = getXmlVal(xml, 'nNF');
  const serie = getXmlVal(xml, 'serie');
  const emissao = getXmlVal(xml, 'dhEmi').substring(0, 10);
  const natOp = getXmlVal(xml, 'natOp');
  const cfop = getXmlVal(xml, 'CFOP');

  // Fornecedor
  const emitNome = getXmlVal(xml, 'xNome') || getXmlVal(xml, 'xFant');
  const emitCnpj = getXmlVal(xml, 'CNPJ');

  // Totais
  const vNF = parseFloat(getXmlVal(xml, 'vNF')) || 0;
  const vICMS = parseFloat(getXmlVal(xml, 'vICMS')) || 0;
  const vPIS = parseFloat(getXmlVal(xml, 'vPIS')) || 0;
  const vCOFINS = parseFloat(getXmlVal(xml, 'vCOFINS')) || 0;
  const vFrete = parseFloat(getXmlVal(xml, 'vFrete')) || 0;

  // Itens
  const dets = xml.getElementsByTagName('det');
  const itens = [];
  for (const det of dets) {
    const prod = det.getElementsByTagName('prod')[0];
    const imposto = det.getElementsByTagName('imposto')[0];
    const codAnp = prod ? getXmlVal(prod.parentNode, 'cProdANP') || getXmlVal(det, 'cProdANP') : '';
    const item = {
      codigo: prod ? getXmlVal(prod.parentNode, 'cProd') || det.querySelector('cProd')?.textContent : '',
      descricao: prod ? det.querySelector('xProd')?.textContent || '' : '',
      ncm: prod ? det.querySelector('NCM')?.textContent || '' : '',
      cfop: prod ? det.querySelector('CFOP')?.textContent || '' : '',
      unidade: prod ? det.querySelector('uCom')?.textContent || '' : '',
      quantidade: parseFloat(prod ? det.querySelector('qCom')?.textContent || '0' : '0'),
      valorUnitario: parseFloat(prod ? det.querySelector('vUnCom')?.textContent || '0' : '0'),
      valorTotal: parseFloat(prod ? det.querySelector('vProd')?.textContent || '0' : '0'),
      codAnp: det.querySelector('cProdANP')?.textContent || '',
      descAnp: det.querySelector('xProdANP')?.textContent || '',
      percBio: parseFloat(det.querySelector('pGLP')?.textContent || det.querySelector('pBioGasolina')?.textContent || det.querySelector('pBioEtanol')?.textContent || '0'),
      cstIcms: det.querySelector('CST') ? det.querySelector('CST').textContent : (det.querySelector('CSOSN')?.textContent || ''),
      aliqIcms: parseFloat(det.querySelector('pICMS')?.textContent || '0'),
      cstPis: det.querySelector('CSTPIS') ? det.querySelector('CSTPIS').textContent : (imposto?.querySelector('CST')?.textContent || ''),
      aliqPis: parseFloat(det.querySelector('pPIS')?.textContent || '0'),
      cstCofins: '',
      aliqCofins: parseFloat(det.querySelector('pCOFINS')?.textContent || '0'),
      tanqueId: null,
      ehCombustivel: !!det.querySelector('cProdANP'),
    };
    itens.push(item);
  }

  nfeXmlDados = { chave, numero, serie, emissao, natOp, cfop, emitNome, emitCnpj, vNF, vICMS, vPIS, vCOFINS, vFrete, itens, nomeArquivo };

  // Carrega tanques para vinculação
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const { data: tanques } = await sb.from('oct_tanques').select('*').eq('empresa_id', perfil.empresa_id).order('numero');
  nfeTanques = tanques || [];

  renderPreviewNfe();
}

function renderPreviewNfe() {
  const d = nfeXmlDados;
  const preview = document.getElementById('nfe-preview');
  preview.style.display = 'block';
  document.getElementById('nfe-importar').style.display = 'none';

  preview.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:20px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div><span class="nfe-label">NF-e Nº</span><br><strong>${d.numero}/${d.serie}</strong></div>
        <div><span class="nfe-label">Emissão</span><br><strong>${d.emissao ? new Date(d.emissao + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</strong></div>
        <div><span class="nfe-label">Valor Total</span><br><strong style="color:#f97316">R$ ${d.vNF.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong></div>
        <div style="grid-column:span 2"><span class="nfe-label">Fornecedor</span><br><strong>${d.emitNome}</strong> — ${d.emitCnpj}</div>
        <div><span class="nfe-label">Natureza</span><br><strong>${d.natOp}</strong></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;background:#0f1117;border-radius:8px;margin-bottom:16px">
        <div><span class="nfe-label">ICMS</span><br>R$ ${d.vICMS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">PIS</span><br>R$ ${d.vPIS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">COFINS</span><br>R$ ${d.vCOFINS.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">Frete</span><br>R$ ${d.vFrete.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
      </div>

      <div class="modulo-header"><h2>Itens da NF-e</h2></div>
      <table class="nfe-tabela" style="margin-bottom:16px">
        <thead>
          <tr>
            <th>#</th>
            <th>Descrição</th>
            <th>Qtd</th>
            <th>Vlr Unit</th>
            <th>Total</th>
            <th>ANP</th>
            <th>Vincular Tanque</th>
          </tr>
        </thead>
        <tbody>
          ${d.itens.map((it, i) => `
            <tr class="${it.ehCombustivel ? 'item-combustivel' : ''}">
              <td>${i+1}</td>
              <td>
                <strong>${it.descricao}</strong>
                ${it.codAnp ? `<br><span style="font-size:0.72rem;color:#888">ANP: ${it.codAnp} — ${it.descAnp}</span>` : ''}
              </td>
              <td>${it.quantidade.toLocaleString('pt-BR', {minimumFractionDigits:3})} ${it.unidade}</td>
              <td>R$ ${it.valorUnitario.toLocaleString('pt-BR', {minimumFractionDigits:4})}</td>
              <td>R$ ${it.valorTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
              <td>${it.codAnp ? `<span class="nfe-badge-anp">⛽ Combustível</span>` : '-'}</td>
              <td>
                ${it.ehCombustivel ? `
                  <select id="tanque-item-${i}" style="background:#0f1117;border:1px solid #2a2d3e;color:#e0e0e0;padding:4px 8px;border-radius:4px;font-size:0.8rem">
                    <option value="">Selecione o tanque...</option>
                    ${nfeTanques.map(t => `<option value="${t.id}">${t.numero} — ${t.combustivel}</option>`).join('')}
                  </select>
                ` : '<span style="color:#555">—</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="background:#0f1117;border:1px solid #f97316;border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.85rem;color:#f97316">
        ⚠️ Vincule cada combustível ao tanque correspondente antes de confirmar. O estoque será atualizado automaticamente.
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
  document.getElementById('nfe-xml-file').value = '';
}

async function confirmarNfe() {
  const msg = document.getElementById('nfe-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil.empresa_id;
  const d = nfeXmlDados;

  // Valida vínculos de combustível
  const combustiveis = d.itens.filter(it => it.ehCombustivel);
  for (let i = 0; i < d.itens.length; i++) {
    if (d.itens[i].ehCombustivel) {
      const sel = document.getElementById(`tanque-item-${i}`);
      if (!sel?.value) {
        msg.textContent = `Vincule o tanque para: ${d.itens[i].descricao}`;
        msg.style.color = '#f44'; return;
      }
      d.itens[i].tanqueId = sel.value;
    }
  }

  // Salva fornecedor se não existir
  let fornecedorId = null;
  if (d.emitCnpj) {
    const { data: forn } = await sb.from('oct_pessoas').select('id').eq('empresa_id', empresaId).eq('documento', d.emitCnpj).single();
    if (forn) {
      fornecedorId = forn.id;
    } else {
      const { data: novoForn } = await sb.from('oct_pessoas').insert({
        empresa_id: empresaId, nome: d.emitNome, tipo: 'fornecedor', documento: d.emitCnpj
      }).select().single();
      fornecedorId = novoForn?.id;
    }
  }

  // Salva NF-e
  const { data: nfe, error: nfeErr } = await sb.from('oct_nfe_entrada').insert({
    empresa_id: empresaId,
    numero: d.numero,
    serie: d.serie,
    chave_nfe: d.chave || null,
    emissao: d.emissao,
    entrada: new Date().toISOString().split('T')[0],
    fornecedor_id: fornecedorId,
    cfop: d.cfop,
    natureza: d.natOp,
    valor_total: d.vNF,
    valor_icms: d.vICMS,
    valor_pis: d.vPIS,
    valor_cofins: d.vCOFINS,
    valor_frete: d.vFrete,
    status: 'importada',
  }).select().single();

  if (nfeErr) { msg.textContent = 'Erro ao salvar NF-e: ' + nfeErr.message; msg.style.color = '#f44'; return; }

  // Salva itens e atualiza tanques
  for (let i = 0; i < d.itens.length; i++) {
    const it = d.itens[i];

    await sb.from('oct_nfe_entrada_itens').insert({
      nfe_id: nfe.id,
      codigo: it.codigo,
      descricao: it.descricao,
      ncm: it.ncm,
      cfop: it.cfop,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valor_unitario: it.valorUnitario,
      valor_total: it.valorTotal,
      cst_icms: it.cstIcms,
      aliq_icms: it.aliqIcms,
      cst_pis: it.cstPis,
      aliq_pis: it.aliqPis,
      aliq_cofins: it.aliqCofins,
      cod_anp: it.codAnp,
      desc_anp: it.descAnp,
      perc_bio: it.percBio,
    });

    // Atualiza estoque do tanque
    if (it.ehCombustivel && it.tanqueId) {
      const { data: tanque } = await sb.from('oct_tanques').select('estoque_atual, capacidade').eq('id', it.tanqueId).single();
      if (tanque) {
        const novoEstoque = Math.min(
          Number(tanque.estoque_atual) + Number(it.quantidade),
          Number(tanque.capacidade)
        );
        await sb.from('oct_tanques').update({ estoque_atual: novoEstoque }).eq('id', it.tanqueId);

        // Registra no LMC
        await sb.from('oct_lmc').insert({
          empresa_id: empresaId,
          tanque_id: it.tanqueId,
          data: new Date().toISOString().split('T')[0],
          saldo_anterior: tanque.estoque_atual,
          entrada: it.quantidade,
          saldo_final: novoEstoque,
          observacoes: `NF-e ${d.numero}/${d.serie} — ${d.emitNome}`,
        });
      }
    }
  }

  msg.textContent = '✅ NF-e importada e estoques atualizados!';
  msg.style.color = '#4caf50';
  nfeXmlDados = null;
  setTimeout(() => moduloNfe(), 1500);
}
