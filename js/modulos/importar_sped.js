// ============================================================
// MÓDULO IMPORTAR SPED — popular o banco a partir de um arquivo SPED
// EFD Contribuições / Fiscal validado (mês anterior).
//
// Fluxo: upload -> parse -> valida CNPJ -> resumo -> preview por tipo
//        (decidindo duplicados) -> grava.
//
// Mapeamentos suportados nesta versão:
//   0150  -> oct_pessoas         (fornecedores)
//   0200  -> oct_produtos        (produtos; 0206 agrega cod_anp)
//   0500  -> oct_plano_referencial (plano de contas referencial)
//   C170  -> preview de itens de entrada / créditos (somente leitura nesta fase)
// ============================================================

const SPED_EMPRESA = () => window._imp_empresa;        // empresa logada
let _spedParsed = null;                                  // resultado do parse

async function moduloImportarSped() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis')
    .select('empresa_id, oct_empresas(*)').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._imp_empresa_id = perfil.empresa_id;
  window._imp_empresa = perfil.oct_empresas;
  _spedParsed = null;

  conteudo.innerHTML = `
    <div style="max-width:1100px;padding:18px 20px">
      <h2 style="color:#f97316;margin-bottom:4px">📥 Importar SPED</h2>
      <p style="color:#888;font-size:0.84rem;margin-bottom:18px">Carregue um arquivo SPED (.txt) validado para compor a base de dados: fornecedores, produtos, plano referencial e itens de entrada.</p>

      <div id="imp-drop" style="border:2px dashed #2a2d3e;border-radius:10px;padding:36px;text-align:center;background:#13151f;cursor:pointer">
        <div style="font-size:2rem">📄</div>
        <div style="color:#ddd;margin-top:8px">Clique para selecionar o arquivo SPED (.txt)</div>
        <div style="color:#666;font-size:0.78rem;margin-top:4px">EFD Contribuições ou EFD Fiscal</div>
        <input type="file" id="imp-file" accept=".txt" style="display:none">
      </div>

      <div id="imp-resultado" style="margin-top:18px"></div>
    </div>`;

  const drop = document.getElementById('imp-drop');
  const inp = document.getElementById('imp-file');
  drop.addEventListener('click', () => inp.click());
  inp.addEventListener('change', (e) => { if (e.target.files[0]) lerArquivoSped(e.target.files[0]); });
}

function lerArquivoSped(file) {
  const res = document.getElementById('imp-resultado');
  res.innerHTML = '<p style="color:#888">Lendo arquivo...</p>';
  const reader = new FileReader();
  reader.onload = (e) => {
    try { _spedParsed = parseSped(e.target.result); mostrarResumoSped(_spedParsed, file.name); }
    catch (err) { res.innerHTML = '<p style="color:#f44">Erro ao ler: ' + impEsc(err.message) + '</p>'; }
  };
  reader.onerror = () => { res.innerHTML = '<p style="color:#f44">Falha ao ler o arquivo.</p>'; };
  reader.readAsText(file, 'ISO-8859-1'); // SPED é latin1
}

// --- PARSE: quebra o arquivo em registros por tipo ---
function parseSped(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
  const registros = {};   // tipo -> array de arrays de campos
  const anpPorProduto = {}; // cod_item (0200) -> cod_anp (0206 seguinte)
  let header = null;
  let ultimoCodItem0200 = null;
  linhas.forEach(l => {
    const campos = l.split('|');
    const tipo = campos[1];
    if (!tipo) return;
    (registros[tipo] = registros[tipo] || []).push(campos);
    if (tipo === '0000') header = campos;
    if (tipo === '0200') ultimoCodItem0200 = campos[2];
    // 0206 vem imediatamente após o 0200 do mesmo produto
    if (tipo === '0206' && ultimoCodItem0200) anpPorProduto[ultimoCodItem0200] = campos[2];
  });
  let cnpjArq = '';
  if (header) cnpjArq = (header.find(c => /^\d{14}$/.test(c)) || '');
  return { registros, anpPorProduto, cnpjArq, totalLinhas: linhas.length };
}

function mostrarResumoSped(parsed, nomeArq) {
  const res = document.getElementById('imp-resultado');
  const emp = SPED_EMPRESA();
  const cnpjEmp = (emp?.cnpj || '').replace(/\D/g, '');
  const cnpjArq = parsed.cnpjArq;

  // TRAVA: só importa SPED da própria empresa
  if (cnpjEmp && cnpjArq && cnpjEmp !== cnpjArq) {
    res.innerHTML = `<div style="background:#2a1a1a;border:1px solid #5a2a2a;border-radius:8px;padding:18px;color:#f88">
      <strong>Importação bloqueada.</strong><br>
      O CNPJ do arquivo (<b>${impFmtCnpj(cnpjArq)}</b>) não corresponde ao da empresa logada (<b>${impFmtCnpj(cnpjEmp)}</b>).<br>
      <span style="color:#caa;font-size:0.82rem">Só é permitido importar SPED da própria empresa.</span>
    </div>`;
    return;
  }

  const r = parsed.registros;
  const cont = (t) => (r[t] || []).length;
  const tipos = [
    { reg: '0150', label: 'Fornecedores / Participantes', destino: 'oct_pessoas', qtd: cont('0150') },
    { reg: '0200', label: 'Produtos', destino: 'oct_produtos', qtd: cont('0200') },
    { reg: '0500', label: 'Plano de contas referencial', destino: 'oct_plano_referencial', qtd: cont('0500') },
    { reg: 'C170', label: 'Itens de entrada (créditos)', destino: '(preview)', qtd: cont('C170') },
  ];

  res.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div><strong style="color:#4caf50">Arquivo lido</strong>
        <div style="color:#888;font-size:0.8rem">${impEsc(nomeArq)} — ${parsed.totalLinhas} linhas — CNPJ ${impFmtCnpj(cnpjArq)} ✓</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
        <thead><tr style="color:#888;text-align:left;border-bottom:1px solid #2a2d3e">
          <th style="padding:8px">Importar</th><th style="padding:8px">Tipo</th><th style="padding:8px">Destino</th><th style="padding:8px;text-align:right">Registros</th><th></th>
        </tr></thead>
        <tbody>
        ${tipos.map(t => `
          <tr style="border-bottom:1px solid #1c1f2e;color:#ddd">
            <td style="padding:8px"><input type="checkbox" class="imp-chk" data-reg="${t.reg}" ${t.qtd && t.destino !== '(preview)' ? 'checked' : ''} ${t.qtd ? '' : 'disabled'}></td>
            <td style="padding:8px">${t.label}</td>
            <td style="padding:8px;color:#888;font-family:monospace;font-size:0.8rem">${t.destino}</td>
            <td style="padding:8px;text-align:right;font-weight:600">${t.qtd}</td>
            <td style="padding:8px;text-align:right"><button onclick="previewSped('${t.reg}')" class="nfe-aba" style="font-size:0.76rem" ${t.qtd ? '' : 'disabled'}>Ver</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:14px;text-align:right">
        <button onclick="importarSpedSelecionados()" class="btn-salvar">Importar selecionados →</button>
      </div>
    </div>
    <div id="imp-preview" style="margin-top:16px"></div>`;
}

// --- MAPEADORES: registro SPED -> objeto do banco ---
function mapear0150(campos, empresaId) {
  // |0150|COD_PART|NOME|COD_PAIS|CNPJ|CPF|IE|COD_MUN|SUFRAMA|END|NUM|COMPL|BAIRRO|
  const cnpj = campos[5] || '';
  const cpf = campos[6] || '';
  const endereco = [campos[10], campos[11], campos[13]].filter(Boolean).join(', ');
  return {
    empresa_id: empresaId,
    nome: campos[3] || '',
    documento: (cnpj || cpf).replace(/\D/g, ''),
    ie: campos[7] || null,
    endereco: endereco || null,
    tipo: 'fornecedor',
    classificacoes: ['fornecedor'],
    ativo: true,
    _cod_part: campos[2],   // referência interna (não vai pro banco)
  };
}
function mapear0200(campos, empresaId, cod_anp) {
  // |0200|COD_ITEM|DESCR|COD_BARRA|COD_ANT|UNID_INV|TIPO_ITEM|COD_NCM|EX_IPI|COD_GEN|COD_LST|ALIQ_ICMS|
  return {
    empresa_id: empresaId,
    codigo: campos[2] || '',
    nome: campos[3] || '',
    ean: campos[4] || null,
    unidade: campos[6] || 'UN',
    ncm: campos[8] || null,
    aliq_icms: parseFloat((campos[12] || '0').replace(',', '.')) || 0,
    cod_anp: cod_anp || null,
    ativo: true,
  };
}
function mapear0500(campos, empresaId) {
  // |0500|DT_ALT|COD_NAT_CC|IND_CTA|NIVEL|COD_CTA|NOME_CTA|COD_CTA_REF|CNPJ_EST|
  const dt = campos[2] || ''; // DDMMAAAA
  const dataIso = dt.length === 8 ? `${dt.substring(4)}-${dt.substring(2, 4)}-${dt.substring(0, 2)}` : null;
  return {
    empresa_id: empresaId,
    data_inclusao: dataIso,
    cod_nat_cc: campos[3] || null,
    ind_cta: campos[4] || null,
    nivel: parseInt(campos[5]) || null,
    cod_cta: campos[6] || '',
    nome_cta: campos[7] || null,
    cod_cta_ref: campos[8] || null,
    cnpj_estrut: campos[9] || null,
  };
}

// --- PREVIEW de um tipo ---
async function previewSped(reg) {
  const div = document.getElementById('imp-preview');
  const empresaId = window._imp_empresa_id;
  const registros = _spedParsed.registros[reg] || [];
  div.innerHTML = '<p style="color:#888">Montando preview...</p>';

  let linhas = [];
  let colunas = [];
  if (reg === '0150') {
    colunas = ['Nome', 'Documento', 'IE', 'Endereço', 'Situação'];
    const docsBanco = await buscarDocsExistentes('oct_pessoas', 'documento', empresaId);
    linhas = registros.map(c => {
      const o = mapear0150(c, empresaId);
      const existe = docsBanco.has(o.documento);
      return [o.nome, impFmtCnpj(o.documento), o.ie || '—', o.endereco || '—', existe ? '⚠ já existe' : '✓ novo'];
    });
  } else if (reg === '0200') {
    colunas = ['Código', 'Descrição', 'Unid', 'NCM', 'Cód. ANP', 'Situação'];
    const anpMap = _spedParsed.anpPorProduto || {};
    const codsBanco = await buscarDocsExistentes('oct_produtos', 'codigo', empresaId);
    linhas = registros.map(c => {
      const o = mapear0200(c, empresaId, anpMap[c[2]]);
      const existe = codsBanco.has(o.codigo);
      return [o.codigo, o.nome, o.unidade, o.ncm || '—', o.cod_anp || '—', existe ? '⚠ já existe' : '✓ novo'];
    });
  } else if (reg === '0500') {
    colunas = ['Conta', 'Nome', 'Nível', 'Ref. RFB', 'Natureza'];
    linhas = registros.map(c => { const o = mapear0500(c, empresaId); return [o.cod_cta, o.nome_cta || '—', o.nivel || '—', o.cod_cta_ref || '—', o.cod_nat_cc || '—']; });
  } else if (reg === 'C170') {
    colunas = ['Item', 'Cód', 'Qtd', 'Unid', 'Vlr', 'CST PIS', 'Vlr PIS', 'CST COFINS', 'Vlr COFINS'];
    linhas = registros.slice(0, 200).map(c => [c[2], c[3], c[5], c[6], c[7], c[25] || '', c[30] || '', c[31] || '', c[36] || '']);
  }

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;background:#1a1d2e;border-bottom:1px solid #2a2d3e;color:#ddd"><strong>Preview — ${reg}</strong> <span style="color:#888;font-size:0.8rem">(${registros.length} registros${reg === 'C170' && registros.length > 200 ? ', exibindo 200' : ''})</span></div>
      <div style="max-height:420px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
          <thead><tr style="color:#888;text-align:left;position:sticky;top:0;background:#0f1119">${colunas.map(c => '<th style="padding:7px 10px">' + c + '</th>').join('')}</tr></thead>
          <tbody>${linhas.map(l => '<tr style="border-top:1px solid #1c1f2e;color:#ddd">' + l.map(v => '<td style="padding:6px 10px">' + impEsc(String(v == null ? '' : v)) + '</td>').join('') + '</tr>').join('')}</tbody>
        </table>
      </div>
    </div>`;
}

async function buscarDocsExistentes(tabela, coluna, empresaId) {
  const { data } = await sb.from(tabela).select(coluna).eq('empresa_id', empresaId);
  return new Set((data || []).map(d => d[coluna]).filter(Boolean));
}

// --- GRAVAÇÃO ---
async function importarSpedSelecionados() {
  const chks = [...document.querySelectorAll('.imp-chk:checked')].map(c => c.dataset.reg);
  if (!chks.length) { alert('Selecione ao menos um tipo para importar.'); return; }
  const div = document.getElementById('imp-preview');
  const empresaId = window._imp_empresa_id;
  div.innerHTML = '<p style="color:#888">Importando...</p>';
  const log = [];

  for (const reg of chks) {
    const registros = _spedParsed.registros[reg] || [];
    if (reg === '0150') {
      const existentes = await buscarDocsExistentes('oct_pessoas', 'documento', empresaId);
      const novos = registros.map(c => { const o = mapear0150(c, empresaId); delete o._cod_part; return o; })
        .filter(o => o.documento && !existentes.has(o.documento));
      log.push(await gravarLote('oct_pessoas', novos, registros.length));
    } else if (reg === '0200') {
      const existentes = await buscarDocsExistentes('oct_produtos', 'codigo', empresaId);
      const anpMap = _spedParsed.anpPorProduto || {};
      const novos = registros.map(c => mapear0200(c, empresaId, anpMap[c[2]])).filter(o => o.codigo && !existentes.has(o.codigo));
      log.push(await gravarLote('oct_produtos', novos, registros.length));
    } else if (reg === '0500') {
      const existentes = await buscarDocsExistentes('oct_plano_referencial', 'cod_cta', empresaId);
      const novos = registros.map(c => mapear0500(c, empresaId)).filter(o => o.cod_cta && !existentes.has(o.cod_cta));
      log.push(await gravarLote('oct_plano_referencial', novos, registros.length));
    } else if (reg === 'C170') {
      log.push('C170: ' + registros.length + ' itens (preview apenas — gravação na Fase 2)');
    }
  }

  div.innerHTML = `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px">
    <strong style="color:#4caf50">Importação concluída</strong>
    <ul style="margin:10px 0 0 18px;color:#ddd;font-size:0.86rem">${log.map(l => '<li style="margin-bottom:4px">' + impEsc(l) + '</li>').join('')}</ul></div>`;
}

async function gravarLote(tabela, novos, totalArquivo) {
  if (!novos.length) return tabela + ': nenhum novo (todos os ' + totalArquivo + ' já existiam)';
  const { error } = await sb.from(tabela).insert(novos);
  if (error) return tabela + ': ERRO — ' + error.message;
  return tabela + ': ' + novos.length + ' inseridos, ' + (totalArquivo - novos.length) + ' já existiam';
}

// --- utils ---
function impEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function impFmtCnpj(d) {
  d = (d || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d || '—';
}
