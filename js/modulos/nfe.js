
let nfeXmlDados = null;
let nfeTanques = [];
let _empresaId = null;
let _empresa = null;

const TIPOS_PAG = {
  '01':'Dinheiro','02':'Cheque','03':'Cartão Crédito','04':'Cartão Débito',
  '05':'Crédito Loja','10':'Vale Alimentação','11':'Vale Refeição',
  '13':'Vale Combustível','15':'Boleto','90':'Sem Pagamento','99':'Outros'
};

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

  const temCert = !!_empresa?.cert_path;
  const senhaAtual = getCertSenha();

  const { data: manifestadas } = await sb
    .from('oct_nfe_manifestadas').select('*')
    .eq('empresa_id', _empresaId).eq('status', 'manifestada')
    .order('nsu', { ascending: false });

  const { data: importadas } = await sb
    .from('oct_nfe_entrada').select('*, oct_pessoas(nome)')
    .eq('empresa_id', _empresaId)
    .order('entrada', { ascending: false }).limit(50);

  const { data: ultimoNsuRow } = await sb
    .from('oct_nfe_manifestadas').select('nsu')
    .eq('empresa_id', _empresaId)
    .order('nsu', { ascending: false }).limit(1).single();
  const ultimoNsu = ultimoNsuRow?.nsu || '0';

  conteudo.innerHTML = `
    <div style="max-width:1200px">

      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>📄 NF-e Entrada</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${temCert ? `<button onclick="abrirManifestar()" class="btn-manifestar">🔄 Manifestar NF-e</button>` : `<span style="color:#888;font-size:0.82rem;padding:8px 12px;background:#13151f;border-radius:6px;border:1px solid #2a2d3e">⚠️ Cadastre o certificado para usar manifestação</span>`}
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
          <div class="form-grid" style="max-width:600px;margin-bottom:16px">
            <div class="form-group">
              <label>Ambiente</label>
              <select id="manifest-ambiente">
                <option value="producao">Produção</option>
                <option value="homologacao">Homologação (teste)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Último NSU consultado</label>
              <input id="manifest-nsu" type="text" value="${ultimoNsu}" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado ${senhaAtual ? '— <span style="color:#4caf50;font-size:0.82rem">✅ salva na sessão</span>' : '*'}</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="manifest-senha" type="password" placeholder="${senhaAtual ? '••••••• (salva)' : 'Senha do certificado digital'}" style="flex:1" />
                ${senhaAtual ? `<button onclick="limparSenhaSessao()" style="padding:6px 10px;border-radius:5px;border:1px solid #555;background:transparent;color:#888;cursor:pointer;font-size:0.78rem;white-space:nowrap">🔄 Trocar</button>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button onclick="executarManifestar()" class="btn-salvar">🔍 Buscar NF-es na SEFAZ</button>
            <span id="manifest-msg" style="font-size:0.85rem"></span>
          </div>
          <div id="manifest-erro-sefaz" style="display:none;margin-top:12px;padding:12px;background:#1a1500;border:1px solid #5a4a00;border-radius:8px;font-size:0.82rem;color:#fbbf24"></div>
        </div>
      </div>

      <!-- IMPORTAR XML -->
      <div id="nfe-importar" style="display:none;margin-bottom:20px">
        <div class="cert-box">
          <div class="cert-drop" onclick="document.getElementById('nfe-xml-file').click()">
            <span style="font-size:2rem">📄</span>
            <p>Clique ou arraste o <strong>XML da NF-e</strong></p>
          </div>
          <input type="file" id="nfe-xml-file" accept=".xml" style="display:none" onchange="lerXmlNfe(this)" />
        </div>
      </div>

      <!-- PREVIEW -->
      <div id="nfe-preview" style="display:none;margin-bottom:20px"></div>

      <!-- DETALHE NF-e -->
      <div id="nfe-detalhe" style="display:none;margin-bottom:20px"></div>

      <!-- PAINEL DUPLO -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <!-- MANIFESTADAS -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #2a4a6a;padding-bottom:8px">
            <h3 style="color:#60a5fa;font-size:0.9rem">📥 Manifestadas</h3>
            <span style="background:#1a2a3a;color:#60a5fa;font-size:0.75rem;padding:2px 8px;border-radius:10px;border:1px solid #2a4a6a">${manifestadas?.length || 0}</span>
          </div>
          <div id="lista-manifestadas">
            ${!manifestadas || manifestadas.length === 0
              ? `<div style="text-align:center;padding:30px;color:#555;border:2px dashed #2a2d3e;border-radius:10px;font-size:0.85rem">Nenhuma NF-e manifestada pendente</div>`
              : manifestadas.map(n => `
              <div class="nfe-card manifestada" id="card-manifestada-${n.id}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div class="nfe-card-numero">${n.numero ? `NF-e ${n.numero}/${n.serie}` : n.schema || 'Resumo'}</div>
                    <div class="nfe-card-emit">${n.emitente || '—'}</div>
                    ${n.emit_cnpj ? `<div style="font-size:0.7rem;color:#555">${n.emit_cnpj}</div>` : ''}
                  </div>
                  <div style="text-align:right">
                    ${n.valor ? `<div style="color:#f97316;font-weight:600;font-size:0.88rem">R$ ${Number(n.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>` : ''}
                    ${n.emissao ? `<div style="font-size:0.72rem;color:#888">${new Date(n.emissao+'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
                    <div style="font-size:0.65rem;color:#555">NSU: ${n.nsu}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                  ${n.xml ? `<button onclick="importarDoManifestado('${n.id}')" class="btn-nfe-importar">📥 Importar</button>` : `<button onclick="baixarXmlManifestado('${n.id}','${n.nsu}')" class="btn-nfe-baixar">⬇️ Baixar XML</button>`}
                  ${n.chave_nfe ? `<button onclick="cienciaManifestado('${n.chave_nfe}')" class="btn-nfe-ciencia">✓ Ciência</button>` : ''}
                  <button onclick="ignorarManifestado('${n.id}')" class="btn-nfe-ignorar">✕</button>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- IMPORTADAS -->
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #2a5a2a;padding-bottom:8px">
            <h3 style="color:#4caf50;font-size:0.9rem">✅ Importadas</h3>
            <span style="background:#1a3a1a;color:#4caf50;font-size:0.75rem;padding:2px 8px;border-radius:10px;border:1px solid #2a5a2a">${importadas?.length || 0}</span>
          </div>
          <div id="lista-importadas">
            ${!importadas || importadas.length === 0
              ? `<div style="text-align:center;padding:30px;color:#555;border:2px dashed #2a2d3e;border-radius:10px;font-size:0.85rem">Nenhuma NF-e importada ainda</div>`
              : importadas.map(n => `
              <div class="nfe-card importada" onclick="abrirDetalheNfe('${n.id}')" style="cursor:pointer">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div class="nfe-card-numero">NF-e ${n.numero||'—'}/${n.serie||'—'}</div>
                    <div class="nfe-card-emit">${n.oct_pessoas?.nome||'—'}</div>
                    <div style="font-size:0.7rem;color:#555">${n.emissao ? new Date(n.emissao+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="color:#4caf50;font-weight:600;font-size:0.88rem">R$ ${Number(n.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                    <span class="nfe-status importada">importada</span>
                    <div style="font-size:0.68rem;color:#555;margin-top:2px">🔍 ver detalhes</div>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── DETALHE / EDIÇÃO NF-e ────────────────────────────────────────────────────

async function abrirDetalheNfe(id) {
  const detalheDiv = document.getElementById('nfe-detalhe');
  detalheDiv.style.display = 'block';
  detalheDiv.innerHTML = '<p style="color:#888;padding:16px">Carregando detalhes...</p>';
  detalheDiv.scrollIntoView({ behavior: 'smooth' });

  const { data: nfe } = await sb
    .from('oct_nfe_entrada')
    .select('*, oct_pessoas(nome,documento), oct_nfe_entrada_itens(*)')
    .eq('id', id).single();

  if (!nfe) { detalheDiv.innerHTML = '<p style="color:#f44">NF-e não encontrada.</p>'; return; }

  const itens = nfe.oct_nfe_entrada_itens || [];
  const pags = nfe.forma_pagamento || [];

  detalheDiv.innerHTML = `
    <div style="background:#13151f;border:1px solid #f97316;border-radius:12px;padding:0;overflow:hidden">

      <!-- HEADER -->
      <div style="background:#1a1d2e;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2d3e">
        <div>
          <h3 style="color:#f97316;font-size:1rem">📄 NF-e ${nfe.numero}/${nfe.serie}</h3>
          <div style="font-size:0.78rem;color:#888;margin-top:2px">${nfe.chave_nfe || 'Chave não disponível'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="nfe-status importada">${nfe.status}</span>
          <button onclick="fecharDetalheNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem;line-height:1">✕</button>
        </div>
      </div>

      <!-- ABAS -->
      <div style="display:flex;gap:0;border-bottom:1px solid #2a2d3e;background:#13151f">
        <button onclick="mostrarAba('aba-capa')" id="btn-aba-capa" class="nfe-aba ativo">📋 Capa</button>
        <button onclick="mostrarAba('aba-itens')" id="btn-aba-itens" class="nfe-aba">📦 Itens (${itens.length})</button>
        <button onclick="mostrarAba('aba-tributacao')" id="btn-aba-tributacao" class="nfe-aba">💰 Tributação</button>
        <button onclick="mostrarAba('aba-pagamento')" id="btn-aba-pagamento" class="nfe-aba">💳 Pagamento</button>
        <button onclick="mostrarAba('aba-obs')" id="btn-aba-obs" class="nfe-aba">📝 Obs</button>
      </div>

      <!-- ABA CAPA -->
      <div id="aba-capa" class="nfe-aba-conteudo" style="padding:20px">
        <div class="form-grid">
          <div class="form-group">
            <label>Número</label>
            <input id="edit-numero" type="text" value="${nfe.numero||''}" />
          </div>
          <div class="form-group">
            <label>Série</label>
            <input id="edit-serie" type="text" value="${nfe.serie||''}" />
          </div>
          <div class="form-group">
            <label>Data Emissão</label>
            <input id="edit-emissao" type="date" value="${nfe.emissao||''}" />
          </div>
          <div class="form-group">
            <label>Data Entrada</label>
            <input id="edit-entrada" type="date" value="${nfe.entrada||''}" />
          </div>
          <div class="form-group span2">
            <label>Fornecedor</label>
            <input type="text" value="${nfe.oct_pessoas?.nome||'—'}" disabled style="opacity:0.6" />
          </div>
          <div class="form-group span2">
            <label>Natureza da Operação</label>
            <input id="edit-natureza" type="text" value="${nfe.natureza||''}" />
          </div>
          <div class="form-group">
            <label>CFOP</label>
            <input id="edit-cfop" type="text" value="${nfe.cfop||''}" />
          </div>
          <div class="form-group">
            <label>Valor Total</label>
            <input id="edit-valor-total" type="number" step="0.01" value="${nfe.valor_total||0}" />
          </div>
          <div class="form-group">
            <label>Valor Frete</label>
            <input id="edit-frete" type="number" step="0.01" value="${nfe.valor_frete||0}" />
          </div>
          <div class="form-group">
            <label>Valor Desconto</label>
            <input id="edit-desconto" type="number" step="0.01" value="${nfe.valor_desconto||0}" />
          </div>
          <div class="form-group">
            <label>Chave NF-e</label>
            <input id="edit-chave" type="text" value="${nfe.chave_nfe||''}" style="font-size:0.72rem" />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="edit-status">
              <option value="importada" ${nfe.status==='importada'?'selected':''}>Importada</option>
              <option value="confirmada" ${nfe.status==='confirmada'?'selected':''}>Confirmada</option>
              <option value="cancelada" ${nfe.status==='cancelada'?'selected':''}>Cancelada</option>
            </select>
          </div>
        </div>
      </div>

      <!-- ABA ITENS -->
      <div id="aba-itens" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div style="overflow-x:auto">
          <table class="nfe-tabela">
            <thead>
              <tr>
                <th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th>
                <th>Qtd</th><th>Un</th><th>Vl.Unit</th><th>Total</th><th>ANP</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map((it,i) => `
                <tr class="${it.cod_anp ? 'item-combustivel' : ''}">
                  <td>${i+1}</td>
                  <td style="font-size:0.75rem">${it.codigo||'—'}</td>
                  <td>
                    <strong>${it.descricao||'—'}</strong>
                    ${it.cod_anp ? `<br><span style="font-size:0.68rem;color:#888">ANP: ${it.cod_anp} — ${it.desc_anp||''}</span>` : ''}
                  </td>
                  <td style="font-size:0.75rem">${it.ncm||'—'}</td>
                  <td style="font-size:0.75rem">${it.cfop||'—'}</td>
                  <td>${Number(it.quantidade||0).toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
                  <td style="font-size:0.75rem">${it.unidade||'—'}</td>
                  <td>R$ ${Number(it.valor_unitario||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</td>
                  <td><strong>R$ ${Number(it.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
                  <td>${it.cod_anp ? '<span class="nfe-badge-anp">⛽</span>' : '—'}</td>
                </tr>
              `).join('')}
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
      </div>

      <!-- ABA TRIBUTAÇÃO -->
      <div id="aba-tributacao" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div class="form-grid">
          <div class="form-group">
            <label>Base ICMS</label>
            <input id="edit-base-icms" type="number" step="0.01" value="${nfe.valor_icms||0}" />
          </div>
          <div class="form-group">
            <label>Valor ICMS</label>
            <input id="edit-icms" type="number" step="0.01" value="${nfe.valor_icms||0}" />
          </div>
          <div class="form-group">
            <label>Valor PIS</label>
            <input id="edit-pis" type="number" step="0.01" value="${nfe.valor_pis||0}" />
          </div>
          <div class="form-group">
            <label>Valor COFINS</label>
            <input id="edit-cofins" type="number" step="0.01" value="${nfe.valor_cofins||0}" />
          </div>
        </div>
        <div class="modulo-header" style="margin-top:20px"><h2>Tributação por item</h2></div>
        <div style="overflow-x:auto">
          <table class="nfe-tabela">
            <thead>
              <tr><th>Descrição</th><th>CST ICMS</th><th>Alíq ICMS</th><th>CST PIS</th><th>Alíq PIS</th><th>Alíq COFINS</th></tr>
            </thead>
            <tbody>
              ${itens.map(it => `
                <tr>
                  <td>${it.descricao}</td>
                  <td>${it.cst_icms||'—'}</td>
                  <td>${it.aliq_icms||0}%</td>
                  <td>${it.cst_pis||'—'}</td>
                  <td>${it.aliq_pis||0}%</td>
                  <td>${it.aliq_cofins||0}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ABA PAGAMENTO -->
      <div id="aba-pagamento" class="nfe-aba-conteudo" style="display:none;padding:20px">
        ${pags.length === 0
          ? `<p style="color:#555;text-align:center;padding:20px">Nenhuma forma de pagamento registrada</p>`
          : `<table class="nfe-tabela">
              <thead><tr><th>Forma de Pagamento</th><th>Valor</th></tr></thead>
              <tbody>
                ${pags.map(p => `
                  <tr>
                    <td>${TIPOS_PAG[p.tPag]||p.tPag||'—'}</td>
                    <td>R$ ${Number(p.vPag||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background:#1e2235">
                  <td style="font-weight:600;padding:8px 10px">Total pago:</td>
                  <td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${pags.reduce((s,p)=>s+Number(p.vPag||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                </tr>
              </tfoot>
            </table>`}
        <div style="margin-top:16px;padding:12px;background:#0f1117;border-radius:8px;font-size:0.82rem;color:#888">
          Para alterar a forma de pagamento, importe novamente o XML da nota.
        </div>
      </div>

      <!-- ABA OBSERVAÇÕES -->
      <div id="aba-obs" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div class="form-group">
          <label>Observações internas</label>
          <textarea id="edit-obs" rows="5" style="width:100%;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.9rem;resize:vertical">${nfe.observacoes||''}</textarea>
        </div>
      </div>

      <!-- FOOTER AÇÕES -->
      <div style="padding:16px 20px;border-top:1px solid #2a2d3e;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button onclick="salvarEdicaoNfe('${id}')" class="btn-salvar">💾 Salvar alterações</button>
        <button onclick="fecharDetalheNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Fechar</button>
        <button onclick="confirmarNfeImportada('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer">✅ Confirmar NF-e</button>
        <span id="nfe-detalhe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

function mostrarAba(id) {
  document.querySelectorAll('.nfe-aba-conteudo').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nfe-aba').forEach(el => el.classList.remove('ativo'));
  document.getElementById(id).style.display = 'block';
  document.getElementById('btn-' + id).classList.add('ativo');
}

function fecharDetalheNfe() {
  document.getElementById('nfe-detalhe').style.display = 'none';
}

async function salvarEdicaoNfe(id) {
  const msg = document.getElementById('nfe-detalhe-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const { error } = await sb.from('oct_nfe_entrada').update({
    numero: document.getElementById('edit-numero').value,
    serie: document.getElementById('edit-serie').value,
    emissao: document.getElementById('edit-emissao').value || null,
    entrada: document.getElementById('edit-entrada').value || null,
    natureza: document.getElementById('edit-natureza').value,
    cfop: document.getElementById('edit-cfop').value,
    valor_total: parseFloat(document.getElementById('edit-valor-total').value) || 0,
    valor_frete: parseFloat(document.getElementById('edit-frete').value) || 0,
    valor_desconto: parseFloat(document.getElementById('edit-desconto').value) || 0,
    chave_nfe: document.getElementById('edit-chave').value || null,
    status: document.getElementById('edit-status').value,
    observacoes: document.getElementById('edit-obs')?.value || null,
  }).eq('id', id);

  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloNfe(), 1200);
}

async function confirmarNfeImportada(id) {
  await sb.from('oct_nfe_entrada').update({ status: 'confirmada' }).eq('id', id);
  document.getElementById('nfe-detalhe-msg').textContent = '✅ NF-e confirmada!';
  document.getElementById('nfe-detalhe-msg').style.color = '#4caf50';
  setTimeout(() => moduloNfe(), 1000);
}

// ─── MANIFESTAÇÃO ────────────────────────────────────────────────────────────

function abrirManifestar() {
  const p = document.getElementById('nfe-manifestar-painel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
function fecharManifestar() {
  document.getElementById('nfe-manifestar-painel').style.display = 'none';
}
function limparSenhaSessao() {
  setCertSenha(null);
  moduloNfe().then(() => abrirManifestar());
}

async function executarManifestar() {
  const msg = document.getElementById('manifest-msg');
  const erroDiv = document.getElementById('manifest-erro-sefaz');
  const ambiente = document.getElementById('manifest-ambiente').value;
  const nsu = document.getElementById('manifest-nsu').value || '0';
  const senhaInput = document.getElementById('manifest-senha').value;
  const senha = senhaInput || getCertSenha();

  erroDiv.style.display = 'none';
  if (!senha) { msg.textContent = 'Informe a senha do certificado.'; msg.style.color = '#f44'; return; }
  setCertSenha(senha);
  msg.textContent = '🔄 Consultando SEFAZ...'; msg.style.color = '#888';

  try {
    const { data: certBlob } = await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const certBuffer = await certBlob.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certBuffer)));
    const cnpj = _empresa.cnpj?.replace(/\D/g, '');

    const resp = await fetch(`${SEFAZ_URL}/manifestar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, cert_base64: certBase64, cert_senha: senha, ambiente, ultimo_nsu: nsu })
    });
    const dados = await resp.json();

    if (dados.erro) {
      msg.textContent = '❌ Erro'; msg.style.color = '#f44';
      erroDiv.style.display = 'block';
      erroDiv.style.cssText = 'display:block;margin-top:12px;padding:12px;background:#1a1010;border:1px solid #5a2a2a;border-radius:8px;font-size:0.82rem;color:#f87171';
      erroDiv.innerHTML = `<strong>Erro:</strong> ${dados.erro}`;
      return;
    }

    if (dados.cstat && dados.cstat !== '138') {
      erroDiv.style.display = 'block';
      erroDiv.style.cssText = 'display:block;margin-top:12px;padding:12px;background:#1a1500;border:1px solid #5a4a00;border-radius:8px;font-size:0.82rem;color:#fbbf24';
      erroDiv.innerHTML = `<strong>SEFAZ [${dados.cstat}]:</strong> ${dados.xmotivo}`;
    }

    if (!dados.nfes || dados.nfes.length === 0) {
      msg.textContent = '✅ Nenhuma NF-e nova encontrada.'; msg.style.color = '#4caf50';
      if (dados.ultimo_nsu) document.getElementById('manifest-nsu').value = dados.ultimo_nsu;
      return;
    }

    let salvas = 0;
    for (const n of dados.nfes) {
      const { error } = await sb.from('oct_nfe_manifestadas').upsert({
        empresa_id: _empresaId, nsu: n.nsu, schema: n.schema,
        chave_nfe: n.chave||null, numero: n.numero||null, serie: n.serie||null,
        emissao: n.emissao||null, emitente: n.emitente||null, emit_cnpj: n.emitCnpj||null,
        valor: n.valor ? parseFloat(n.valor) : null, nat_op: n.natOp||null,
        xml: n.xml||null, tipo: n.tipo||'resumo', status: 'manifestada',
        ultimo_nsu_consulta: dados.ultimo_nsu,
      }, { onConflict: 'empresa_id,nsu', ignoreDuplicates: true });
      if (!error) salvas++;
    }

    if (dados.ultimo_nsu) document.getElementById('manifest-nsu').value = dados.ultimo_nsu;
    msg.textContent = `✅ ${salvas} NF-e(s) salvas!`; msg.style.color = '#4caf50';
    setTimeout(() => moduloNfe(), 1000);

  } catch(e) {
    msg.textContent = '❌ ' + e.message; msg.style.color = '#f44';
  }
}

async function importarDoManifestado(id) {
  const { data: n } = await sb.from('oct_nfe_manifestadas').select('*').eq('id', id).single();
  if (!n?.xml) { alert('XML não disponível. Use "Baixar XML" primeiro.'); return; }
  const { data: tanques } = await sb.from('oct_tanques').select('*').eq('empresa_id', _empresaId).order('numero');
  nfeTanques = tanques || [];
  const parser = new DOMParser();
  const xml = parser.parseFromString(n.xml, 'text/xml');
  await processarXmlNfe(xml, `NF-e_${n.numero||n.nsu}.xml`, id);
}

async function baixarXmlManifestado(id, nsu) {
  const senha = getCertSenha();
  const ambiente = document.getElementById('manifest-ambiente')?.value || 'producao';
  if (!senha) { alert('Informe a senha no painel de manifestação primeiro.'); return; }
  try {
    const { data: certBlob } = await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const certBuffer = await certBlob.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certBuffer)));
    const cnpj = _empresa.cnpj?.replace(/\D/g, '');
    const resp = await fetch(`${SEFAZ_URL}/xml/${nsu}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, cert_base64: certBase64, cert_senha: senha, ambiente, nsu })
    });
    const dados = await resp.json();
    if (dados.nfes?.[0]?.xml) {
      await sb.from('oct_nfe_manifestadas').update({ xml: dados.nfes[0].xml }).eq('id', id);
      moduloNfe();
    } else { alert('Não foi possível baixar: ' + (dados.erro || JSON.stringify(dados))); }
  } catch(e) { alert('Erro: ' + e.message); }
}

async function cienciaManifestado(chave) {
  const senha = getCertSenha();
  const ambiente = document.getElementById('manifest-ambiente')?.value || 'producao';
  if (!senha) { alert('Informe a senha no painel de manifestação.'); return; }
  try {
    const { data: certBlob } = await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const certBuffer = await certBlob.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certBuffer)));
    const cnpj = _empresa.cnpj?.replace(/\D/g, '');
    const resp = await fetch(`${SEFAZ_URL}/manifestar/ciencia`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj, chave_nfe: chave, cert_base64: certBase64, cert_senha: senha, ambiente })
    });
    const dados = await resp.json();
    alert(`SEFAZ: [${dados.cstat}] ${dados.xmotivo}`);
  } catch(e) { alert('Erro: ' + e.message); }
}

async function ignorarManifestado(id) {
  if (!confirm('Ignorar esta NF-e?')) return;
  await sb.from('oct_nfe_manifestadas').update({ status: 'ignorada' }).eq('id', id);
  document.getElementById(`card-manifestada-${id}`)?.remove();
}

function abrirImportarNfe() {
  const a = document.getElementById('nfe-importar');
  a.style.display = a.style.display === 'none' ? 'block' : 'none';
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
      const { data: tanques } = await sb.from('oct_tanques').select('*').eq('empresa_id', _empresaId).order('numero');
      nfeTanques = tanques || [];
      await processarXmlNfe(xml, file.name, null);
    } catch(err) { alert('Erro ao ler XML: ' + err.message); }
  };
  reader.readAsText(file, 'UTF-8');
}

function getXmlVal(xml, tag) {
  const el = xml.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}

async function processarXmlNfe(xml, nomeArquivo, manifestadaId) {
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

  const pagamentos = [];
  for (const p of xml.getElementsByTagName('detPag')) {
    pagamentos.push({ tPag: p.querySelector('tPag')?.textContent||'', vPag: parseFloat(p.querySelector('vPag')?.textContent||'0') });
  }
  if (pagamentos.length === 0 && getXmlVal(xml, 'tPag')) {
    pagamentos.push({ tPag: getXmlVal(xml,'tPag'), vPag: parseFloat(getXmlVal(xml,'vPag'))||vNF });
  }

  const itens = [];
  for (const det of xml.getElementsByTagName('det')) {
    itens.push({
      codigo: det.querySelector('cProd')?.textContent||'',
      descricao: det.querySelector('xProd')?.textContent||'',
      ncm: det.querySelector('NCM')?.textContent||'',
      cfop: det.querySelector('CFOP')?.textContent||'',
      unidade: det.querySelector('uCom')?.textContent||'',
      quantidade: parseFloat(det.querySelector('qCom')?.textContent||'0'),
      valorUnitario: parseFloat(det.querySelector('vUnCom')?.textContent||'0'),
      valorTotal: parseFloat(det.querySelector('vProd')?.textContent||'0'),
      codAnp: det.querySelector('cProdANP')?.textContent||'',
      descAnp: det.querySelector('xProdANP')?.textContent||'',
      cstIcms: det.querySelector('CST')?.textContent||det.querySelector('CSOSN')?.textContent||'',
      aliqIcms: parseFloat(det.querySelector('pICMS')?.textContent||'0'),
      aliqPis: parseFloat(det.querySelector('pPIS')?.textContent||'0'),
      aliqCofins: parseFloat(det.querySelector('pCOFINS')?.textContent||'0'),
      tanqueId: null,
      ehCombustivel: !!det.querySelector('cProdANP'),
    });
  }

  // Armazena XML como string para salvar
  const xmlString = new XMLSerializer().serializeToString(xml);

  nfeXmlDados = { chave, numero, serie, emissao, natOp, emitNome, emitCnpj, vNF, vICMS, vPIS, vCOFINS, vFrete, itens, pagamentos, nomeArquivo, manifestadaId, xmlString };
  renderPreviewNfe();
}

function renderPreviewNfe() {
  const d = nfeXmlDados;
  document.getElementById('nfe-importar').style.display = 'none';
  document.getElementById('nfe-detalhe').style.display = 'none';
  const preview = document.getElementById('nfe-preview');
  preview.style.display = 'block';
  preview.scrollIntoView({ behavior: 'smooth' });

  preview.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#f97316;font-size:0.95rem">📄 NF-e ${d.numero}/${d.serie} — ${d.emitNome}</h3>
        <button onclick="cancelarNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div><span class="nfe-label">Nº</span><br><strong>${d.numero}/${d.serie}</strong></div>
        <div><span class="nfe-label">Emissão</span><br><strong>${d.emissao?new Date(d.emissao+'T12:00:00').toLocaleDateString('pt-BR'):'-'}</strong></div>
        <div><span class="nfe-label">Total</span><br><strong style="color:#f97316">R$ ${d.vNF.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
        <div style="grid-column:span 2"><span class="nfe-label">Fornecedor</span><br><strong>${d.emitNome}</strong><br><span style="font-size:0.72rem;color:#888">${d.emitCnpj}</span></div>
        <div><span class="nfe-label">Pagamento</span><br>${d.pagamentos.map(p=>`${TIPOS_PAG[p.tPag]||p.tPag}: R$ ${p.vPag.toLocaleString('pt-BR',{minimumFractionDigits:2})}`).join('<br>')||'—'}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;background:#0f1117;border-radius:8px;margin-bottom:16px;font-size:0.82rem">
        <div><span class="nfe-label">ICMS</span><br>R$ ${d.vICMS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">PIS</span><br>R$ ${d.vPIS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">COFINS</span><br>R$ ${d.vCOFINS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">Frete</span><br>R$ ${d.vFrete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
      </div>
      <div class="modulo-header"><h2>Itens</h2></div>
      <div style="overflow-x:auto">
        <table class="nfe-tabela" style="margin-bottom:16px">
          <thead><tr><th>#</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>Qtd</th><th>Vl.Unit</th><th>Total</th><th>CST/Alíq</th><th>ANP</th><th>Tanque</th></tr></thead>
          <tbody>
            ${d.itens.map((it,i)=>`
              <tr class="${it.ehCombustivel?'item-combustivel':''}">
                <td>${i+1}</td>
                <td><strong>${it.descricao}</strong>${it.codAnp?`<br><span style="font-size:0.68rem;color:#888">${it.codAnp}</span>`:''}</td>
                <td style="font-size:0.75rem">${it.ncm}</td>
                <td style="font-size:0.75rem">${it.cfop}</td>
                <td>${it.quantidade.toLocaleString('pt-BR',{minimumFractionDigits:3})} ${it.unidade}</td>
                <td>R$ ${it.valorUnitario.toLocaleString('pt-BR',{minimumFractionDigits:4})}</td>
                <td>R$ ${it.valorTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td style="font-size:0.75rem">${it.cstIcms}/${it.aliqIcms}%</td>
                <td>${it.ehCombustivel?'<span class="nfe-badge-anp">⛽</span>':'—'}</td>
                <td>${it.ehCombustivel?`<select id="tanque-item-${i}" style="background:#0f1117;border:1px solid #2a2d3e;color:#e0e0e0;padding:4px 6px;border-radius:4px;font-size:0.78rem;min-width:110px"><option value="">Selecione...</option>${nfeTanques.map(t=>`<option value="${t.id}">${t.numero} — ${t.combustivel}</option>`).join('')}</select>`:'—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="background:#0f1117;border:1px solid #f97316;border-radius:8px;padding:10px;margin-bottom:16px;font-size:0.82rem;color:#f97316">
        ⚠️ Vincule cada combustível ao tanque. O estoque será atualizado automaticamente.
      </div>
      <div class="form-acoes">
        <button class="btn-salvar" onclick="confirmarNfe()">✅ Confirmar e atualizar estoque</button>
        <button onclick="cancelarNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="nfe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

function cancelarNfe() {
  nfeXmlDados = null;
  document.getElementById('nfe-preview').style.display = 'none';
  document.getElementById('nfe-importar').style.display = 'none';
}

async function confirmarNfe() {
  const msg = document.getElementById('nfe-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';
  const d = nfeXmlDados;

  for (let i = 0; i < d.itens.length; i++) {
    if (d.itens[i].ehCombustivel) {
      const sel = document.getElementById(`tanque-item-${i}`);
      if (!sel?.value) { msg.textContent = `Vincule o tanque: ${d.itens[i].descricao}`; msg.style.color = '#f44'; return; }
      d.itens[i].tanqueId = sel.value;
    }
  }

  let fornecedorId = null;
  if (d.emitCnpj) {
    const { data: forn } = await sb.from('oct_pessoas').select('id').eq('empresa_id',_empresaId).eq('documento',d.emitCnpj).single();
    if (forn) { fornecedorId = forn.id; }
    else {
      const { data: nf } = await sb.from('oct_pessoas').insert({ empresa_id:_empresaId, nome:d.emitNome, tipo:'fornecedor', documento:d.emitCnpj }).select().single();
      fornecedorId = nf?.id;
    }
  }

  const { data: nfe, error: nfeErr } = await sb.from('oct_nfe_entrada').insert({
    empresa_id: _empresaId, numero: d.numero, serie: d.serie,
    chave_nfe: d.chave||null, emissao: d.emissao,
    entrada: new Date().toISOString().split('T')[0],
    fornecedor_id: fornecedorId, natureza: d.natOp,
    valor_total: d.vNF, valor_icms: d.vICMS, valor_pis: d.vPIS,
    valor_cofins: d.vCOFINS, valor_frete: d.vFrete, status: 'importada',
    forma_pagamento: d.pagamentos,
    xml_completo: d.xmlString,
  }).select().single();

  if (nfeErr) { msg.textContent = 'Erro: ' + nfeErr.message; msg.style.color = '#f44'; return; }

  for (const it of d.itens) {
    await sb.from('oct_nfe_entrada_itens').insert({
      nfe_id: nfe.id, codigo: it.codigo, descricao: it.descricao,
      ncm: it.ncm, cfop: it.cfop, unidade: it.unidade,
      quantidade: it.quantidade, valor_unitario: it.valorUnitario,
      valor_total: it.valorTotal, cod_anp: it.codAnp, desc_anp: it.descAnp,
      cst_icms: it.cstIcms, aliq_icms: it.aliqIcms,
      aliq_pis: it.aliqPis, aliq_cofins: it.aliqCofins,
    });
    if (it.ehCombustivel && it.tanqueId) {
      const { data: tanque } = await sb.from('oct_tanques').select('estoque_atual,capacidade').eq('id',it.tanqueId).single();
      if (tanque) {
        const novoEstoque = Math.min(Number(tanque.estoque_atual)+Number(it.quantidade), Number(tanque.capacidade));
        await sb.from('oct_tanques').update({ estoque_atual: novoEstoque }).eq('id', it.tanqueId);
        await sb.from('oct_lmc').insert({
          empresa_id: _empresaId, tanque_id: it.tanqueId,
          data: new Date().toISOString().split('T')[0],
          saldo_anterior: tanque.estoque_atual, entrada: it.quantidade, saldo_final: novoEstoque,
          observacoes: `NF-e ${d.numero}/${d.serie} — ${d.emitNome}`,
        });
      }
    }
  }

  if (d.manifestadaId) await sb.from('oct_nfe_manifestadas').update({ status: 'importada' }).eq('id', d.manifestadaId);
  msg.textContent = '✅ NF-e importada!'; msg.style.color = '#4caf50';
  nfeXmlDados = null;
  setTimeout(() => moduloNfe(), 1200);
}
