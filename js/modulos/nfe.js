
let nfeXmlDados = null;
let nfeTanques = [];
let _empresaId = null;
let _empresa = null;

const TIPOS_PAG = {
  '01':'Dinheiro','02':'Cheque','03':'CartÃ£o CrÃ©dito','04':'CartÃ£o DÃ©bito',
  '05':'CrÃ©dito Loja','10':'Vale AlimentaÃ§Ã£o','11':'Vale RefeiÃ§Ã£o',
  '13':'Vale CombustÃ­vel','15':'Boleto','17':'PIX','90':'Sem Pagamento','99':'Outros'
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>ð NF-e Entrada</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${temCert ? `<button onclick="abrirManifestar()" class="btn-manifestar">ð Manifestar NF-e</button>` : `<span style="color:#888;font-size:0.82rem;padding:8px 12px;background:#13151f;border-radius:6px;border:1px solid #2a2d3e">â ï¸ Cadastre o certificado para usar manifestaÃ§Ã£o</span>`}
          <button onclick="abrirImportarNfe()" class="btn-salvar" style="padding:8px 18px">ð Importar XML</button>
        </div>
      </div>

      <div id="nfe-manifestar-painel" style="display:none;margin-bottom:20px">
        <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="color:#60a5fa;font-size:0.95rem">ð ManifestaÃ§Ã£o do DestinatÃ¡rio â SEFAZ</h3>
            <button onclick="fecharManifestar()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">â</button>
          </div>
          <div class="form-grid" style="max-width:600px;margin-bottom:16px">
            <div class="form-group">
              <label>Ambiente</label>
              <select id="manifest-ambiente"><option value="producao">ProduÃ§Ã£o</option><option value="homologacao">HomologaÃ§Ã£o</option></select>
            </div>
            <div class="form-group">
              <label>Ãltimo NSU</label>
              <input id="manifest-nsu" type="text" value="${ultimoNsu}" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado ${senhaAtual ? 'â <span style="color:#4caf50;font-size:0.82rem">â salva na sessÃ£o</span>' : '*'}</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="manifest-senha" type="password"
                  value="${senhaAtual || ''}"
                  placeholder="${senhaAtual ? '(salva â clique em Buscar)' : 'Senha do certificado digital'}"
                  style="flex:1" />
                ${senhaAtual ? `<button onclick="limparSenhaSessao()" style="padding:6px 10px;border-radius:5px;border:1px solid #555;background:transparent;color:#888;cursor:pointer;font-size:0.78rem">ð Trocar</button>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button onclick="executarManifestar()" class="btn-salvar">ð Buscar NF-es na SEFAZ</button>
            <span id="manifest-msg" style="font-size:0.85rem"></span>
          </div>
          <div id="manifest-erro-sefaz" style="display:none;margin-top:12px;padding:12px;background:#1a1500;border:1px solid #5a4a00;border-radius:8px;font-size:0.82rem;color:#fbbf24"></div>
        </div>
      </div>

      <div id="nfe-importar" style="display:none;margin-bottom:20px">
        <div class="cert-box">
          <div class="cert-drop" onclick="document.getElementById('nfe-xml-file').click()">
            <span style="font-size:2rem">ð</span>
            <p>Clique ou arraste o <strong>XML da NF-e</strong></p>
          </div>
          <input type="file" id="nfe-xml-file" accept=".xml" style="display:none" onchange="lerXmlNfe(this)" />
        </div>
      </div>

      <div id="nfe-preview" style="display:none;margin-bottom:20px"></div>
      <div id="nfe-detalhe" style="display:none;margin-bottom:20px"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #2a4a6a;padding-bottom:8px">
            <h3 style="color:#60a5fa;font-size:0.9rem">ð¥ Manifestadas</h3>
            <span style="background:#1a2a3a;color:#60a5fa;font-size:0.75rem;padding:2px 8px;border-radius:10px;border:1px solid #2a4a6a">${(manifestadas||[]).filter(n=>!n.schema||(!n.schema.includes('resEvento')&&!n.schema.includes('procEvento'))).length}</span>
          </div>
          <div id="lista-manifestadas">
            ${(()=>{
              // Filtra apenas NF-es reais (ignora eventos resEvento, procEvento, etc)
              const nfesReais = (manifestadas||[]).filter(n =>
                !n.schema || (
                  !n.schema.includes('resEvento') &&
                  !n.schema.includes('procEvento') &&
                  !n.schema.includes('evento')
                )
              );
              if (nfesReais.length === 0) return `<div style="text-align:center;padding:30px;color:#555;border:2px dashed #2a2d3e;border-radius:10px;font-size:0.85rem">Nenhuma NF-e manifestada pendente</div>`;
              return nfesReais.map(n => `
                <div class="nfe-card manifestada" id="card-manifestada-${n.id}">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                    <div style="flex:1;min-width:0">
                      <div class="nfe-card-numero" style="color:#60a5fa">
                        ${n.numero ? `NF-e ${n.numero}/${n.serie}` : `NSU ${n.nsu}`}
                      </div>
                      <div class="nfe-card-emit" style="margin-top:3px">${n.emitente || 'â'}</div>
                      ${n.emit_cnpj ? `<div style="font-size:0.7rem;color:#555">${n.emit_cnpj}</div>` : ''}
                      ${n.nat_op ? `<div style="font-size:0.72rem;color:#888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.nat_op}</div>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                      ${n.valor ? `<div style="color:#f97316;font-weight:700;font-size:0.95rem">R$ ${Number(n.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>` : ''}
                      ${n.emissao ? `<div style="font-size:0.72rem;color:#888">${new Date(n.emissao+'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
                      <div style="font-size:0.65rem;color:#444;margin-top:2px">NSU: ${n.nsu}</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                    ${n.xml ? `<button onclick="importarDoManifestado('${n.id}')" class="btn-nfe-importar">ð¥ Importar</button>` : `<button onclick="baixarXmlManifestado('${n.id}','${n.nsu}')" class="btn-nfe-baixar">â¬ï¸ Baixar XML</button>`}
                    ${n.chave_nfe ? `<button onclick="cienciaManifestado('${n.chave_nfe}')" class="btn-nfe-ciencia">â CiÃªncia</button>` : ''}
                    <button onclick="ignorarManifestado('${n.id}')" class="btn-nfe-ignorar">â Ignorar</button>
                  </div>
                </div>`).join('');
            })()}
          </div>
        </div>

        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-bottom:1px solid #2a5a2a;padding-bottom:8px">
            <h3 style="color:#4caf50;font-size:0.9rem">â Importadas</h3>
            <span style="background:#1a3a1a;color:#4caf50;font-size:0.75rem;padding:2px 8px;border-radius:10px;border:1px solid #2a5a2a">${importadas?.length || 0}</span>
          </div>
          <div id="lista-importadas">
            ${!importadas || importadas.length === 0
              ? `<div style="text-align:center;padding:30px;color:#555;border:2px dashed #2a2d3e;border-radius:10px;font-size:0.85rem">Nenhuma NF-e importada ainda</div>`
              : importadas.map(n => `
                <div class="nfe-card importada">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div style="cursor:pointer;flex:1" onclick="abrirDetalheNfe('${n.id}')">
                      <div class="nfe-card-numero">NF-e ${n.numero||'â'}/${n.serie||'â'}</div>
                      <div class="nfe-card-emit">${n.oct_pessoas?.nome||'â'}</div>
                      <div style="font-size:0.7rem;color:#555">${n.emissao?new Date(n.emissao+'T12:00:00').toLocaleDateString('pt-BR'):'â'}${n.cfop?` Â· CFOP ${n.cfop}`:''}</div>
                    </div>
                    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                      <div style="color:#4caf50;font-weight:600;font-size:0.88rem">R$ ${Number(n.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                      <span class="nfe-status ${n.status}">${n.status}</span>
                      <button onclick="excluirNfe('${n.id}')" style="padding:3px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.72rem">ð Excluir</button>
                    </div>
                  </div>
                </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// âââ EXCLUIR âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function excluirNfe(id) {
  if (!confirm('Excluir esta NF-e do sistema?\n\nOs estoques dos tanques NAO serao revertidos automaticamente.')) return;
  const det = document.getElementById('nfe-detalhe');
  if (det) det.style.display = 'none';
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

  if (!nfe) { div.innerHTML = '<p style="color:#f44">NF-e nÃ£o encontrada.</p>'; return; }

  const itens = nfe.oct_nfe_entrada_itens || [];
  const pags  = nfe.forma_pagamento || [];
  const dups  = nfe.duplicatas || [];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #f97316;border-radius:12px;overflow:hidden">
      <div style="background:#1a1d2e;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2d3e">
        <div>
          <h3 style="color:#f97316;font-size:1rem">ð NF-e ${nfe.numero}/${nfe.serie} â ${nfe.oct_pessoas?.nome||'â'}</h3>
          <div style="font-size:0.72rem;color:#555;margin-top:2px;font-family:monospace">${nfe.chave_nfe||'â'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="nfe-status ${nfe.status}">${nfe.status}</span>
          <button onclick="fecharDetalheNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">â</button>
        </div>
      </div>

      <div style="display:flex;gap:0;border-bottom:1px solid #2a2d3e;background:#0f1117;overflow-x:auto">
        <button onclick="mostrarAba('aba-capa')" id="btn-aba-capa" class="nfe-aba ativo">ð Capa</button>
        <button onclick="mostrarAba('aba-itens')" id="btn-aba-itens" class="nfe-aba">ð¦ Itens (${itens.length})</button>
        <button onclick="mostrarAba('aba-tributacao')" id="btn-aba-tributacao" class="nfe-aba">ð° TributaÃ§Ã£o</button>
        <button onclick="mostrarAba('aba-pagamento')" id="btn-aba-pagamento" class="nfe-aba">ð³ Pagamento</button>
        <button onclick="mostrarAba('aba-transporte')" id="btn-aba-transporte" class="nfe-aba">ð Transporte</button>
        <button onclick="mostrarAba('aba-obs')" id="btn-aba-obs" class="nfe-aba">ð Obs</button>
      </div>

      <div id="aba-capa" class="nfe-aba-conteudo" style="padding:20px">
        <div class="form-grid">
          <div class="form-group"><label>NÃºmero</label><input id="edit-numero" type="text" value="${nfe.numero||''}" /></div>
          <div class="form-group"><label>SÃ©rie</label><input id="edit-serie" type="text" value="${nfe.serie||''}" /></div>
          <div class="form-group"><label>Data EmissÃ£o</label><input id="edit-emissao" type="date" value="${nfe.emissao||''}" /></div>
          <div class="form-group"><label>Data Entrada</label><input id="edit-entrada" type="date" value="${nfe.entrada||''}" /></div>
          <div class="form-group span2"><label>Fornecedor</label><input type="text" value="${nfe.oct_pessoas?.nome||'â'}" disabled style="opacity:0.6" /></div>
          <div class="form-group span2"><label>Natureza da OperaÃ§Ã£o</label><input id="edit-natureza" type="text" value="${nfe.natureza||''}" /></div>
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
            <thead><tr><th>#</th><th>CÃ³d.</th><th>DescriÃ§Ã£o</th><th>NCM</th><th>CFOP</th><th>Qtd</th><th>Un</th><th>Vl.Unit</th><th>Total</th><th>Produto vinculado</th></tr></thead>
            <tbody>
              ${itens.map((it,i) => `
                <tr class="${it.cod_anp?'item-combustivel':''}">
                  <td>${i+1}</td>
                  <td style="font-size:0.75rem;font-family:monospace">${it.codigo||'â'}</td>
                  <td><strong>${it.descricao||'â'}</strong>${it.cod_anp?`<br><span style="font-size:0.68rem;color:#888">ANP: ${it.cod_anp}</span>`:''}</td>
                  <td style="font-size:0.75rem">${it.ncm||'â'}</td>
                  <td style="font-size:0.75rem">${it.cfop||'â'}${it.cfop?`<br><span style="font-size:0.65rem;color:#60a5fa">${cfopDescricao(it.cfop)}</span>`:''}</td>
                  <td>${Number(it.quantidade||0).toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
                  <td style="font-size:0.75rem">${it.unidade||'â'}</td>
                  <td>R$ ${Number(it.valor_unitario||0).toLocaleString('pt-BR',{minimumFractionDigits:4})}</td>
                  <td><strong>R$ ${Number(it.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
                  <td>
                    ${it.oct_produtos
                      ? `<span style="color:#4caf50;font-size:0.82rem">â ${it.oct_produtos.nome}</span>`
                      : `<button onclick="abrirVinculoProduto('${it.id}','${it.descricao.replace(/'/g,"&#39;")}','${it.codigo}')" style="padding:4px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.75rem">ð Vincular</button>`}
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
          ${nfe.v_icms_mono_ret?`<div style="background:#1a2a1a;border:1px solid #2a5a2a;border-radius:8px;padding:12px;grid-column:span 3"><div class="nfe-label">â½ ICMS MonofÃ¡sico Retido</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><div><div class="nfe-label">Qtd BC</div><div style="font-weight:600">${Number(nfe.q_bc_mono_ret||0).toLocaleString('pt-BR',{minimumFractionDigits:3})} L</div></div><div><div class="nfe-label">Valor</div><div style="font-weight:600;color:#4caf50">R$ ${Number(nfe.v_icms_mono_ret||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div></div></div>`:''}
        </div>
        <table class="nfe-tabela">
          <thead><tr><th>DescriÃ§Ã£o</th><th>CST ICMS</th><th>AlÃ­q ICMS</th><th>ICMS Mono</th><th>CST PIS</th><th>AlÃ­q PIS</th><th>CST COFINS</th><th>AlÃ­q COFINS</th></tr></thead>
          <tbody>${itens.map(it=>`<tr class="${it.cod_anp?'item-combustivel':''}"><td>${it.descricao}</td><td>${it.cst_icms||'â'}</td><td>${it.aliq_icms||0}%</td><td>${it.v_icms_mono_ret?`<span style="color:#4caf50">R$ ${Number(it.v_icms_mono_ret).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`:'â'}</td><td>${it.cst_pis||'â'}</td><td>${it.aliq_pis||0}%</td><td>${it.cst_cofins||'â'}</td><td>${it.aliq_cofins||0}%</td></tr>`).join('')}</tbody>
        </table>
      </div>

      <div id="aba-pagamento" class="nfe-aba-conteudo" style="display:none;padding:20px">
        ${pags.length===0?`<p style="color:#555;text-align:center;padding:20px">Sem informaÃ§Ãµes de pagamento</p>`:`
          <table class="nfe-tabela" style="margin-bottom:16px">
            <thead><tr><th>CondiÃ§Ã£o</th><th>Forma</th><th>DescriÃ§Ã£o</th><th>Valor</th></tr></thead>
            <tbody>${pags.map(p=>`<tr><td>${p.indPag==='0'?'Ã Vista':'A Prazo'}</td><td>${TIPOS_PAG[p.tPag]||p.tPag||'â'}</td><td>${p.xPag||'â'}</td><td><strong>R$ ${Number(p.vPag||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td></tr>`).join('')}</tbody>
            <tfoot><tr style="background:#1e2235"><td colspan="3" style="font-weight:600;padding:8px 10px">Total:</td><td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${pags.reduce((s,p)=>s+Number(p.vPag||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr></tfoot>
          </table>`}
        ${dups.length>0?`<div class="modulo-header"><h2>Duplicatas</h2></div><table class="nfe-tabela"><thead><tr><th>NÂº</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${dups.map(d=>`<tr><td>${d.nDup||'â'}</td><td>${d.dVenc?new Date(d.dVenc+'T12:00:00').toLocaleDateString('pt-BR'):'â'}</td><td>R$ ${Number(d.vDup||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>`).join('')}</tbody></table>`:''}
      </div>

      <div id="aba-transporte" class="nfe-aba-conteudo" style="display:none;padding:20px">
        <div class="form-grid">
          <div class="form-group"><label>Modalidade Frete</label><input type="text" value="${MOD_FRETE[nfe.mod_frete]||nfe.mod_frete||'â'}" disabled style="opacity:0.6" /></div>
          <div class="form-group"><label>Transportadora</label><input type="text" value="${nfe.transp_nome||'â'}" disabled style="opacity:0.6" /></div>
        </div>
      </div>

      <div id="aba-obs" class="nfe-aba-conteudo" style="display:none;padding:20px">
        ${nfe.inf_cpl?`<div style="background:#0f1117;border-radius:8px;padding:14px;margin-bottom:16px;font-size:0.78rem;color:#888;line-height:1.6"><div class="nfe-label" style="margin-bottom:8px">InformaÃ§Ãµes Adicionais (XML)</div>${nfe.inf_cpl.substring(0,600)}...</div>`:''}
        <div class="form-group"><label>ObservaÃ§Ãµes internas</label><textarea id="edit-obs" rows="4" style="width:100%;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.9rem;resize:vertical">${nfe.observacoes||''}</textarea></div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #2a2d3e;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button onclick="salvarEdicaoNfe('${id}')" class="btn-salvar">ð¾ Salvar</button>
        <button onclick="fecharDetalheNfe()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Fechar</button>
        <button onclick="confirmarNfeImportada('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer">â Confirmar NF-e</button>
        <button onclick="excluirNfe('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">ð Excluir</button>
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
    <h4 style="color:#60a5fa;margin-bottom:16px">ð Vincular: <strong>${descricao}</strong></h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div class="modulo-header"><h2>Associar existente</h2></div>
        <input id="busca-produto" type="text" placeholder="Buscar produto..." oninput="filtrarProdutosModal(this.value)" style="width:100%;margin-bottom:10px" />
        <div id="lista-produtos-vinculo" style="max-height:200px;overflow-y:auto">
          ${produtos?.map(p=>`<div onclick="vincularProdutoExistente('${itemId}','${p.id}','${p.nome.replace(/'/g,"&#39;")}')" style="padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #2a2d3e;margin-bottom:6px" onmouseover="this.style.borderColor='#f97316'" onmouseout="this.style.borderColor='#2a2d3e'"><div style="font-weight:600;font-size:0.85rem">${p.nome}</div><div style="font-size:0.72rem;color:#888">${p.codigo||'â'} Â· ${p.unidade||'un'}</div></div>`).join('')||'<p style="color:#555;text-align:center;padding:16px">Nenhum produto</p>'}
        </div>
      </div>
      <div>
        <div class="modulo-header"><h2>Cadastrar novo</h2></div>
        <div class="form-group" style="margin-bottom:10px"><label>Nome *</label><input id="novo-prod-nome" type="text" value="${descricao}" /></div>
        <div class="form-group" style="margin-bottom:10px"><label>CÃ³digo</label><input id="novo-prod-codigo" type="text" value="${codigo}" /></div>
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group"><label>Unidade</label><select id="novo-prod-unidade"><option value="un">UN</option><option value="LTS">LTS</option><option value="kg">KG</option><option value="cx">CX</option><option value="pc">PC</option><option value="L">L</option></select></div>
          <div class="form-group"><label>Categoria</label><select id="novo-prod-categoria"><option value="combustivel">CombustÃ­vel</option><option value="lubrificante">Lubrificante</option><option value="mercadoria">Mercadoria</option><option value="material">Material</option></select></div>
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
    f.map(p=>`<div onclick="vincularProdutoExistente('${p._itemId||''}','${p.id}','${p.nome.replace(/'/g,"&#39;")}')" style="padding:8px 12px;cursor:pointer;border-radius:6px;border:1px solid #2a2d3e;margin-bottom:6px" onmouseover="this.style.borderColor='#f97316'" onmouseout="this.style.borderColor='#2a2d3e'"><div style="font-weight:600;font-size:0.85rem">${p.nome}</div><div style="font-size:0.72rem;color:#888">${p.codigo||'â'}</div></div>`).join('');
}

async function vincularProdutoExistente(itemId, produtoId, produtoNome) {
  await sb.from('oct_nfe_entrada_itens').update({ produto_id: produtoId }).eq('id', itemId);
  const { data: item } = await sb.from('oct_nfe_entrada_itens').select('nfe_id').eq('id', itemId).single();
  if (item) await sb.from('oct_produto_nfe').upsert({ produto_id: produtoId, nfe_id: item.nfe_id, nfe_item_id: itemId, empresa_id: _empresaId }, { onConflict: 'nfe_item_id' });
  document.getElementById('modal-vinculo-produto').style.display = 'none';
  const btn = document.querySelector(`button[onclick*="${itemId}"]`);
  if (btn) btn.closest('td').innerHTML = `<span style="color:#4caf50;font-size:0.82rem">â ${produtoNome}</span>`;
}

async function cadastrarNovoProduto(itemId) {
  const nome = document.getElementById('novo-prod-nome').value.trim();
  const msg  = document.getElementById('novo-prod-msg');
  if (!nome) { msg.textContent = 'Nome obrigatÃ³rio.'; msg.style.color = '#f44'; return; }
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
  msg.textContent='â Salvo!';msg.style.color='#4caf50';
  setTimeout(()=>moduloNfe(),1200);
}

async function confirmarNfeImportada(id){
  await sb.from('oct_nfe_entrada').update({status:'confirmada'}).eq('id',id);
  document.getElementById('nfe-detalhe-msg').textContent='â Confirmada!';
  document.getElementById('nfe-detalhe-msg').style.color='#4caf50';
  setTimeout(()=>moduloNfe(),1000);
}

// âââ MANIFESTAÃÃO ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function abrirManifestar(){const p=document.getElementById('nfe-manifestar-painel');p.style.display=p.style.display==='none'?'block':'none';}
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
  setCertSenha(senha);msg.textContent='ð Consultando SEFAZ...';msg.style.color='#888';
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/manifestar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,cert_base64:b64,cert_senha:senha,ambiente,ultimo_nsu:nsu})});
    const dados=await resp.json();
    if(dados.erro){msg.textContent='â Erro';msg.style.color='#f44';erroDiv.style.display='block';erroDiv.style.cssText='display:block;margin-top:12px;padding:12px;background:#1a1010;border:1px solid #5a2a2a;border-radius:8px;font-size:0.82rem;color:#f87171';erroDiv.innerHTML=`<strong>Erro:</strong> ${dados.erro}`;return;}
    if(dados.cstat&&dados.cstat!=='138'){erroDiv.style.display='block';erroDiv.style.cssText='display:block;margin-top:12px;padding:12px;background:#1a1500;border:1px solid #5a4a00;border-radius:8px;font-size:0.82rem;color:#fbbf24';erroDiv.innerHTML=`<strong>SEFAZ [${dados.cstat}]:</strong> ${dados.xmotivo}`;}
    if(!dados.nfes||dados.nfes.length===0){msg.textContent='â Nenhuma NF-e nova.';msg.style.color='#4caf50';if(dados.ultimo_nsu)document.getElementById('manifest-nsu').value=dados.ultimo_nsu;return;}
    let salvas=0;
    for(const n of dados.nfes){const{error}=await sb.from('oct_nfe_manifestadas').upsert({empresa_id:_empresaId,nsu:n.nsu,schema:n.schema,chave_nfe:n.chave||null,numero:n.numero||null,serie:n.serie||null,emissao:n.emissao||null,emitente:n.emitente||null,emit_cnpj:n.emitCnpj||null,valor:n.valor?parseFloat(n.valor):null,nat_op:n.natOp||null,xml:n.xml||null,tipo:n.tipo||'resumo',status:'manifestada',ultimo_nsu_consulta:dados.ultimo_nsu},{onConflict:'empresa_id,nsu',ignoreDuplicates:true});if(!error)salvas++;}
    if(dados.ultimo_nsu)document.getElementById('manifest-nsu').value=dados.ultimo_nsu;
    msg.textContent=`â ${salvas} NF-e(s) salvas!`;msg.style.color='#4caf50';
    setTimeout(()=>moduloNfe(),1000);
  }catch(e){msg.textContent='â '+e.message;msg.style.color='#f44';}
}

async function importarDoManifestado(id){
  const{data:n}=await sb.from('oct_nfe_manifestadas').select('*').eq('id',id).single();
  if(!n?.xml){alert('XML nÃ£o disponÃ­vel. Use "Baixar XML" primeiro.');return;}
  const{data:tanques}=await sb.from('oct_tanques').select('*').eq('empresa_id',_empresaId).order('numero');
  nfeTanques=tanques||[];
  const parser=new DOMParser();
  const xml=parser.parseFromString(n.xml,'text/xml');
  await processarXmlNfe(xml,`NF-e_${n.numero||n.nsu}.xml`,id);
}

async function baixarXmlManifestado(id,nsu){
  const senha=getCertSenha();const ambiente=document.getElementById('manifest-ambiente')?.value||'producao';
  if(!senha){alert('Informe a senha no painel de manifestaÃ§Ã£o.');return;}
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/xml/${nsu}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,cert_base64:b64,cert_senha:senha,ambiente,nsu})});
    const dados=await resp.json();
    if(dados.nfes?.[0]?.xml){await sb.from('oct_nfe_manifestadas').update({xml:dados.nfes[0].xml}).eq('id',id);moduloNfe();}
    else alert('NÃ£o foi possÃ­vel baixar: '+(dados.erro||JSON.stringify(dados)));
  }catch(e){alert('Erro: '+e.message);}
}

async function cienciaManifestado(chave){
  const senha=getCertSenha();const ambiente=document.getElementById('manifest-ambiente')?.value||'producao';
  if(!senha){alert('Informe a senha no painel de manifestaÃ§Ã£o.');return;}
  try{
    const{data:cb}=await sb.storage.from('octano-certs').download(_empresa.cert_path);
    const buf=await cb.arrayBuffer();const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj=_empresa.cnpj?.replace(/\D/g,'');
    const resp=await fetch(`${SEFAZ_URL}/manifestar/ciencia`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cnpj,chave_nfe:chave,cert_base64:b64,cert_senha:senha,ambiente})});
    const dados=await resp.json();alert(`SEFAZ: [${dados.cstat}] ${dados.xmotivo}`);
  }catch(e){alert('Erro: '+e.message);}
}

async function ignorarManifestado(id){if(!confirm('Ignorar esta NF-e?'))return;await sb.from('oct_nfe_manifestadas').update({status:'ignorada'}).eq('id',id);document.getElementById(`card-manifestada-${id}`)?.remove();}

function abrirImportarNfe(){const a=document.getElementById('nfe-importar');a.style.display=a.style.display==='none'?'block':'none';}
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

// âââ PREVIEW COM EDIÃÃO DE ITENS âââââââââââââââââââââââââââââââââââââââââââââ

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
        <h3 style="color:#f97316">ð NF-e ${d.numero}/${d.serie} â ${d.emitNome}</h3>
        <button onclick="cancelarNfe()" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">â</button>
      </div>

      <!-- RESUMO -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div><span class="nfe-label">NÂº/SÃ©rie</span><br><strong>${d.numero}/${d.serie}</strong></div>
        <div><span class="nfe-label">EmissÃ£o</span><br><strong>${d.dhEmi?new Date(d.dhEmi+'T12:00:00').toLocaleDateString('pt-BR'):'-'}</strong></div>
        <div><span class="nfe-label">Total</span><br><strong style="color:#f97316;font-size:1.1rem">R$ ${d.vNF.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
        <div style="grid-column:span 2"><span class="nfe-label">Fornecedor</span><br><strong>${d.emitNome}</strong><br><span style="font-size:0.72rem;color:#888">${d.emitCnpj}</span></div>
        <div><span class="nfe-label">CFOP</span><br><strong>${d.cfopCapa||d.itens[0]?.cfop||'â'}</strong>${cfopDesc?`<br><span style="font-size:0.72rem;color:#60a5fa">${cfopDesc}</span>`:''}</div>
      </div>

      <!-- FORNECEDOR -->
      <div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:14px;margin-bottom:16px">
        <div class="nfe-label" style="margin-bottom:10px">ð¤ Fornecedor</div>
        ${d.fornecedorExistente
          ? `<div style="display:flex;align-items:center;gap:10px">
              <span style="color:#4caf50">â JÃ¡ cadastrado: <strong>${d.fornecedorExistente.nome}</strong></span>
              <input type="hidden" id="forn-id" value="${d.fornecedorExistente.id}" />
            </div>`
          : `<div class="form-grid" style="max-width:600px">
              <div class="form-group"><label>Nome *</label><input id="forn-nome" type="text" value="${d.emitNome}" /></div>
              <div class="form-group"><label>IE</label><input id="forn-ie" type="text" value="${d.emitIE||''}" /></div>
            </div>`}
      </div>

      <!-- TRIBUTAÃÃO RESUMO -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;background:#0f1117;border-radius:8px;margin-bottom:16px;font-size:0.82rem">
        <div><span class="nfe-label">ICMS BC</span><br>R$ ${d.vBC.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">PIS</span><br>R$ ${d.vPIS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">COFINS</span><br>R$ ${d.vCOFINS.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        <div><span class="nfe-label">Frete</span><br>R$ ${d.vFrete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        ${d.vICMSMonoRet>0?`<div style="grid-column:span 4;background:#1a2a1a;border-radius:6px;padding:8px;border:1px solid #2a5a2a"><span class="nfe-label">â½ ICMS Mono Ret</span><span style="margin-left:12px;color:#4caf50;font-weight:600">R$ ${d.vICMSMonoRet.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${d.qBCMonoRet.toLocaleString('pt-BR',{minimumFractionDigits:3})} L)</span></div>`:''}
      </div>

      <!-- ITENS EDITÃVEIS -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>ð¦ Itens â edite quantidade/unidade se necessÃ¡rio</h2></div>
      </div>
      <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:10px;margin-bottom:12px;font-size:0.82rem;color:#fbbf24">
        ð¡ <strong>Dica:</strong> Se o item Ã© uma caixa com mÃºltiplas unidades (ex: 1 CX com 80 unidades), altere a quantidade para o total de unidades e o sistema calcularÃ¡ o custo unitÃ¡rio automaticamente.
      </div>
      <div style="overflow-x:auto;margin-bottom:16px">
        <table class="nfe-tabela">
          <thead>
            <tr>
              <th>#</th><th>DescriÃ§Ã£o / Produto</th><th>NCM / CFOP</th>
              <th>Qtd NF-e</th><th>Un NF-e</th>
              <th style="background:#1a2a1a;color:#4caf50">Qtd importar âï¸</th>
              <th style="background:#1a2a1a;color:#4caf50">Un importar âï¸</th>
              <th>Total NF-e</th>
              <th style="background:#1a2a1a;color:#4caf50">Custo unitÃ¡rio</th>
              <th>Tanque</th>
              <th>Nome no sistema</th>
              <th>AÃ§Ã£o</th>
            </tr>
          </thead>
          <tbody>
            ${d.itens.map((it,i)=>`
              <tr class="${it.precisaTanque?'item-combustivel':it.ehLubrificante?'item-lubrificante':''}">
                <td>${i+1}</td>
                <td>
                  <strong>${it.descricao}</strong>
                  ${it.codAnp?`<br><span style="font-size:0.68rem;color:${it.precisaTanque?'#4caf50':'#fbbf24'}">
                    ${it.precisaTanque?'â½':'ð¢'} ${it.codAnp} â ${it.descAnp}
                  </span>`:''}
                  <br><span style="font-size:0.68rem;padding:1px 5px;border-radius:4px;background:${it.precisaTanque?'#1a3a1a':it.ehLubrificante?'#2a2000':'#1a1d2e'};color:${it.precisaTanque?'#4caf50':it.ehLubrificante?'#fbbf24':'#888'}">
                    ${it.tipoItem}
                  </span>
                </td>
                <td style="font-size:0.75rem">${it.ncm}<br><strong>${it.cfop}</strong></td>
                <td style="color:#888">${it.quantidade.toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
                <td style="color:#888;font-size:0.82rem">${it.unidade}</td>
                <td style="background:#0f1a0f">
                  <input id="item-qtd-${i}" type="number"
                    value="${it.quantidade}"
                    step="0.001" min="0.001"
                    oninput="recalcularItem(${i})"
                    style="width:80px;padding:4px 6px;border-radius:4px;border:1px solid #2a5a2a;background:#0f1117;color:#4caf50;font-size:0.85rem;font-weight:600" />
                </td>
                <td style="background:#0f1a0f">
                  <input id="item-un-${i}" type="text"
                    value="${it.unidade}"
                    style="width:60px;padding:4px 6px;border-radius:4px;border:1px solid #2a5a2a;background:#0f1117;color:#4caf50;font-size:0.85rem;text-transform:uppercase" />
                </td>
                <td>R$ ${it.valorTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td style="background:#0f1a0f">
                  <span id="item-unit-${i}"
                    data-valor="${it.valorUnitario}"
                    style="color:#4caf50;font-weight:600;font-size:0.85rem">
                    R$ ${it.valorUnitario.toLocaleString('pt-BR',{minimumFractionDigits:4})}
                  </span>
                  <span id="item-tot-${i}" data-total="${it.valorTotal}" style="display:none"></span>
                </td>
                <td>
                  ${it.precisaTanque
                    ? `<select id="tanque-item-${i}" style="background:#0f1117;border:1px solid #2a2d3e;color:#e0e0e0;padding:4px 6px;border-radius:4px;font-size:0.78rem;min-width:110px">
                        <option value="">Selecione...</option>
                        ${nfeTanques.map(t=>`<option value="${t.id}">${t.numero} â ${t.combustivel}</option>`).join('')}
                       </select>`
                    : `<span style="color:#555;font-size:0.75rem">â</span>`}
                </td>
                <td>
                  <input id="prod-nome-${i}" type="text" value="${it.descricao}"
                    style="width:130px;padding:4px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.78rem" />
                </td>
                <td>
                  <select id="prod-acao-${i}" style="padding:4px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.75rem">
                    <option value="novo">Cadastrar novo</option>
                    <option value="ignorar">NÃ£o vincular</option>
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${d.itens.some(it=>it.precisaTanque)?`<div style="background:#0f1117;border:1px solid #f97316;border-radius:8px;padding:10px;margin-bottom:16px;font-size:0.82rem;color:#f97316">â ï¸ Vincule cada combustÃ­vel ao tanque correspondente.</div>`:''}

      <div class="form-acoes">
        <button class="btn-salvar" onclick="confirmarNfe()">â Confirmar e importar</button>
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

  // LÃª os valores editados dos itens
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

  // Fornecedor
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
  // LanÃ§a contas a pagar automaticamente
  await lancarContasPagarNfe(nfe.id, _empresaId, fornecedorId, d.numero, d.serie, d.pagamentos, d.dups);


  // LanÃ§a contas a pagar automaticamente
  await lancarContasPagarNfe(nfe.id, _empresaId, fornecedorId, d.numero, d.serie, d.pagamentos, d.dups);



  for(let i=0;i<d.itens.length;i++){
    const it=d.itens[i];
    const acao=document.getElementById(`prod-acao-${i}`)?.value||'ignorar';
    const nomeProd=document.getElementById(`prod-nome-${i}`)?.value||it.descricao;
    // Usa quantidade e custo editados
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
      unidade:unFinal,           // unidade editada
      quantidade:qtdFinal,       // quantidade editada
      valor_unitario:custoFinal, // custo recalculado
      valor_total:it.valorTotal, // total original da NF-e
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
        // Para tanque usa quantidade original da NF-e (litros reais)
        const qtdTanque = it.quantidade;
        const novoEstoque=Math.min(Number(tanque.estoque_atual)+Number(qtdTanque),Number(tanque.capacidade));
        await sb.from('oct_tanques').update({estoque_atual:novoEstoque}).eq('id',it.tanqueId);
        await sb.from('oct_lmc').insert({empresa_id:_empresaId,tanque_id:it.tanqueId,data:new Date().toISOString().split('T')[0],saldo_anterior:tanque.estoque_atual,entrada:qtdTanque,saldo_final:novoEstoque,observacoes:`NF-e ${d.numero}/${d.serie} â ${d.emitNome}`});
      }
    }
  }

  if(d.manifestadaId)await sb.from('oct_nfe_manifestadas').update({status:'importada'}).eq('id',d.manifestadaId);
  msg.textContent='â NF-e importada com sucesso!';msg.style.color='#4caf50';
  nfeXmlDados=null;
  setTimeout(()=>moduloNfe(),1500);
}
