async function moduloEmpresa() {
  const conteudo = document.getElementById('conteudo');

  // modo de criacao: quando true, o formulario abre vazio para cadastrar
  // uma empresa NOVA (sem sobrescrever a atual). Controlado por _empNova.
  const criando = window._empNova === true;

  let emp = {};
  if (!criando) {
    // carrega a empresa ATIVA (a selecionada no seletor do topo), nao mais
    // a empresa fixa do perfil — assim a tela acompanha o multi-empresa.
    const empId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
    if (empId) {
      const { data } = await sb.from('oct_empresas').select('*').eq('id', empId).single();
      emp = data || {};
    }
  }

  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  // Calcula badge do certificado
  let certBadge = '';
  if (emp.cert_nome && emp.cert_validade) {
    const val = new Date(emp.cert_validade);
    const hoje = new Date();
    const dias = Math.floor((val - hoje) / (1000 * 60 * 60 * 24));
    if (dias < 0) {
      certBadge = `<span class="cert-badge vencido">❌ Vencido há ${Math.abs(dias)} dias</span>`;
    } else if (dias <= 30) {
      certBadge = `<span class="cert-badge alerta">⚠️ Vence em ${dias} dias</span>`;
    } else {
      certBadge = `<span class="cert-badge ok">✅ Válido por ${dias} dias</span>`;
    }
  }

  // botao "Nova empresa" so aparece para usuario master (que gerencia varias)
  const podeNova = (typeof EMPRESA !== 'undefined' && EMPRESA.ehMaster);
  const cabecalho = criando
    ? `<h2>➕ Nova Empresa</h2><button onclick="empCancelarNova()" style="padding:6px 14px;border-radius:6px;border:1px solid #888;background:transparent;color:#aaa;cursor:pointer">← Cancelar</button>`
    : `<h2>⚙️ Cadastro da Empresa</h2>` + (podeNova
        ? `<button onclick="empAbrirNova()" style="padding:6px 14px;border-radius:6px;border:none;background:#22c55e;color:#fff;cursor:pointer;font-weight:600">➕ Nova empresa</button>`
        : '');

  conteudo.innerHTML = `
    <div class="modulo-container">

      <div class="modulo-header" style="display:flex;justify-content:space-between;align-items:center">${cabecalho}</div>
      <div class="form-grid">

        <div class="form-group">
          <label>CNPJ</label>
          <div style="display:flex;gap:8px">
            <input id="emp-cnpj" type="text" value="${emp.cnpj || ''}" placeholder="00.000.000/0000-00" maxlength="18" style="flex:1" />
            <button onclick="consultarCNPJ()" style="padding:8px 12px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer;white-space:nowrap">🔍 Consultar</button>
          </div>
          <span id="cnpj-status" style="font-size:0.75rem;color:#888;margin-top:2px;display:block"></span>
        </div>

        <div class="form-group">
          <label>Inscrição Estadual</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="emp-ie" type="text" value="${emp.ie || ''}" placeholder="Preencha manualmente" style="flex:1" />
            <span title="A IE não possui consulta automática disponível" style="color:#888;cursor:help">ℹ️</span>
          </div>
          <span style="font-size:0.72rem;color:#555;margin-top:2px;display:block">Consulte no Sintegra do seu estado</span>
        </div>

        <div class="form-group span2">
          <label>Razão Social *</label>
          <input id="emp-nome" type="text" value="${emp.nome || ''}" placeholder="Razão Social completa" />
        </div>
        <div class="form-group span2">
          <label>Nome Fantasia</label>
          <input id="emp-fantasia" type="text" value="${emp.nome_fantasia || ''}" placeholder="Nome Fantasia" />
        </div>
        <div class="form-group">
          <label>Telefone</label>
          <input id="emp-telefone" type="text" value="${emp.telefone || ''}" placeholder="(00) 00000-0000" />
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input id="emp-email" type="text" value="${emp.email || ''}" placeholder="email@posto.com.br" />
        </div>
        <div class="form-group span2">
          <label>Endereço</label>
          <input id="emp-endereco" type="text" value="${emp.endereco || ''}" placeholder="Rua, número, bairro" />
        </div>
        <div class="form-group">
          <label>Cidade</label>
          <input id="emp-cidade" type="text" value="${emp.cidade || ''}" placeholder="Cidade" />
        </div>
        <div class="form-group">
          <label>UF</label>
          <select id="emp-uf">
            ${UFS.map(uf => `<option value="${uf}" ${emp.uf === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>CEP</label>
          <input id="emp-cep" type="text" value="${emp.cep || ''}" placeholder="00000-000" maxlength="9" />
        </div>
        <div class="form-group">
          <label>Regime Tributário</label>
          <select id="emp-regime">
            <option value="simples" ${emp.regime_tributario === 'simples' ? 'selected' : ''}>Simples Nacional</option>
            <option value="presumido" ${emp.regime_tributario === 'presumido' ? 'selected' : ''}>Lucro Presumido</option>
            <option value="real" ${emp.regime_tributario === 'real' ? 'selected' : ''}>Lucro Real</option>
          </select>
        </div>
      </div>

      <!-- CERTIFICADO DIGITAL -->
      <div class="modulo-header" style="margin-top:28px"><h2>🔐 Certificado Digital (NF-e)</h2></div>
      <div class="cert-box">

        ${emp.cert_nome ? `
          <div class="cert-atual">
            <span style="font-size:2rem">🔒</span>
            <div style="flex:1">
              <div class="cert-nome">${emp.cert_nome}</div>
              <div class="cert-detalhe">Titular: ${emp.cert_titular || '-'}</div>
              <div class="cert-detalhe">Validade: ${emp.cert_validade ? new Date(emp.cert_validade).toLocaleDateString('pt-BR') : '-'}</div>
              ${certBadge}
            </div>
            <button onclick="trocarCertificado()" style="padding:6px 12px;border-radius:6px;border:1px solid #f97316;background:transparent;color:#f97316;cursor:pointer;font-size:0.8rem">🔄 Trocar</button>
            <button onclick="removerCertificado()" style="padding:6px 12px;border-radius:6px;border:1px solid #f44;background:transparent;color:#f44;cursor:pointer;font-size:0.8rem">✕</button>
          </div>
        ` : ''}

        <div class="cert-upload-area" id="cert-upload-area" style="${emp.cert_nome ? 'display:none' : ''}">
          <div class="cert-drop" onclick="document.getElementById('cert-file').click()">
            <span style="font-size:2rem">📂</span>
            <p>Clique para selecionar o certificado <strong>.pfx</strong> ou <strong>.p12</strong></p>
            <p style="font-size:0.75rem;color:#555">O certificado é lido localmente e validado antes do envio</p>
          </div>
          <input type="file" id="cert-file" accept=".pfx,.p12" style="display:none" onchange="selecionouCertificado(this)" />
        </div>

        <div id="cert-senha-area" style="display:none;margin-top:14px">
          <div class="form-grid" style="max-width:500px">
            <div class="form-group span2">
              <label>Arquivo selecionado</label>
              <input id="cert-arquivo-nome" type="text" disabled style="opacity:0.6" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado *</label>
              <input id="cert-senha" type="password" placeholder="Digite a senha do certificado" />
            </div>
          </div>
          <div id="cert-preview" style="display:none;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px;margin:12px 0;max-width:500px">
            <div style="font-size:0.8rem;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Informações do certificado</div>
            <div id="cert-preview-content"></div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
            <button onclick="validarCertificado()" style="padding:8px 20px;border-radius:6px;border:none;background:#2a4a2a;color:#4caf50;cursor:pointer;font-weight:bold">🔍 Validar</button>
            <button id="btn-upload-cert" onclick="uploadCertificado()" class="btn-salvar" style="display:none">📤 Confirmar e salvar</button>
            <button onclick="cancelarCert()" style="padding:8px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
            <span id="cert-msg" style="font-size:0.85rem"></span>
          </div>
        </div>
      </div>

      <!-- PERFIL -->
      <div class="modulo-header" style="margin-top:28px"><h2>👤 Meu Perfil</h2></div>
      <div class="form-grid">
        <div class="form-group span2">
          <label>Nome completo *</label>
          <input id="perf-nome" type="text" value="${perfil?.nome || ''}" placeholder="Seu nome" />
        </div>
        <div class="form-group">
          <label>Perfil de acesso</label>
          <input type="text" value="${perfil?.perfil || 'master'}" disabled style="opacity:0.5" />
        </div>
        <div class="form-group">
          <label>Usuário</label>
          <input type="text" value="${session.user.email.split('@')[0]}" disabled style="opacity:0.5" />
        </div>
      </div>

      <div class="form-acoes">
        <button class="btn-salvar" onclick="salvarEmpresa()">💾 Salvar empresa</button>
        <span id="emp-msg" class="form-msg"></span>
      </div>
    </div>
  `;

  // Mascaras
  document.getElementById('emp-cnpj').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    v = v.replace(/(\d{2})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
    this.value = v;
  });
  document.getElementById('emp-cnpj').addEventListener('blur', function() {
    if (this.value.replace(/\D/g, '').length === 14) consultarCNPJ();
  });
  document.getElementById('emp-cep').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    this.value = v;
  });
}

// ─── CNPJ ────────────────────────────────────────────────────────────────────
async function consultarCNPJ() {
  const cnpj = document.getElementById('emp-cnpj').value.replace(/\D/g, '');
  const status = document.getElementById('cnpj-status');
  if (cnpj.length !== 14) { status.textContent = 'CNPJ inválido.'; status.style.color = '#f44'; return; }
  status.textContent = '🔄 Consultando Receita Federal...'; status.style.color = '#888';
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!resp.ok) throw new Error();
    const d = await resp.json();
    document.getElementById('emp-nome').value = d.razao_social || '';
    document.getElementById('emp-fantasia').value = d.nome_fantasia || d.razao_social || '';
    const end = [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ');
    document.getElementById('emp-endereco').value = end;
    document.getElementById('emp-cidade').value = d.municipio || '';
    document.getElementById('emp-cep').value = (d.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2');
    if (d.ddd_telefone_1) document.getElementById('emp-telefone').value = d.ddd_telefone_1;
    if (d.uf) {
      const sel = document.getElementById('emp-uf');
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === d.uf) { sel.selectedIndex = i; break; }
      }
    }
    if (d.opcao_pelo_simples) document.getElementById('emp-regime').value = 'simples';
    status.textContent = '✅ Dados preenchidos! Confira a IE manualmente e salve.';
    status.style.color = '#4caf50';
    document.getElementById('emp-ie').style.borderColor = '#f97316';
    document.getElementById('emp-ie').focus();
  } catch(e) {
    status.textContent = '❌ CNPJ não encontrado. Preencha manualmente.';
    status.style.color = '#f44';
  }
}

// ─── CERTIFICADO ─────────────────────────────────────────────────────────────
let certFile = null;
let certDados = null;

function selecionouCertificado(input) {
  if (!input.files.length) return;
  certFile = input.files[0];
  certDados = null;
  document.getElementById('cert-arquivo-nome').value = certFile.name;
  document.getElementById('cert-senha-area').style.display = 'block';
  document.getElementById('cert-upload-area').style.display = 'none';
  document.getElementById('cert-preview').style.display = 'none';
  document.getElementById('btn-upload-cert').style.display = 'none';
  document.getElementById('cert-msg').textContent = '';
}

function trocarCertificado() {
  document.getElementById('cert-upload-area').style.display = 'block';
}

function cancelarCert() {
  certFile = null; certDados = null;
  document.getElementById('cert-senha-area').style.display = 'none';
  document.getElementById('cert-upload-area').style.display = 'block';
  document.getElementById('cert-file').value = '';
  document.getElementById('cert-preview').style.display = 'none';
  document.getElementById('btn-upload-cert').style.display = 'none';
}

async function validarCertificado() {
  const senha = document.getElementById('cert-senha').value;
  const msg = document.getElementById('cert-msg');
  if (!certFile) return;
  if (!senha) { msg.textContent = 'Informe a senha.'; msg.style.color = '#f44'; return; }

  msg.textContent = '🔄 Lendo certificado...'; msg.style.color = '#888';

  try {
    const buffer = await certFile.arrayBuffer();
    const p12Der = forge.util.createBuffer(buffer);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

    // Extrai certificado
    let cert = null;
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.certBag) {
          cert = safeBag.cert;
          break;
        }
      }
      if (cert) break;
    }

    if (!cert) throw new Error('Certificado não encontrado no arquivo.');

    const validade = new Date(cert.validity.notAfter);
    const emissao = new Date(cert.validity.notBefore);
    const hoje = new Date();
    const dias = Math.floor((validade - hoje) / (1000 * 60 * 60 * 24));

    // Extrai CN (razão social) e serialNumber (CNPJ)
    const cn = cert.subject.getField('CN')?.value || '';
    const serial = cert.subject.getField('serialNumber')?.value || '';

    certDados = {
      cert_nome: certFile.name,
      cert_titular: cn,
      cert_validade: validade.toISOString().split('T')[0],
      cert_emissao: emissao.toISOString().split('T')[0],
    };

    let statusHtml = '';
    if (dias < 0) {
      statusHtml = `<span class="cert-badge vencido">❌ VENCIDO há ${Math.abs(dias)} dias</span>`;
    } else if (dias <= 30) {
      statusHtml = `<span class="cert-badge alerta">⚠️ Vence em ${dias} dias — renove em breve!</span>`;
    } else {
      statusHtml = `<span class="cert-badge ok">✅ Válido por ${dias} dias</span>`;
    }

    document.getElementById('cert-preview-content').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="color:#888;font-size:0.78rem">TITULAR</span><br><strong>${cn}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">CPF/CNPJ</span><br><strong>${serial}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">EMISSÃO</span><br><strong>${emissao.toLocaleDateString('pt-BR')}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">VALIDADE</span><br><strong>${validade.toLocaleDateString('pt-BR')}</strong></div>
      </div>
      <div style="margin-top:10px">${statusHtml}</div>
    `;
    document.getElementById('cert-preview').style.display = 'block';
    document.getElementById('btn-upload-cert').style.display = dias >= 0 ? 'inline-block' : 'none';
    msg.textContent = dias < 0 ? '⚠️ Certificado vencido. Não é possível salvar.' : '';
    msg.style.color = '#f44';

  } catch(e) {
    msg.textContent = '❌ Erro: ' + (e.message.includes('Invalid') ? 'Senha incorreta.' : e.message);
    msg.style.color = '#f44';
    document.getElementById('cert-preview').style.display = 'none';
  }
}

async function uploadCertificado() {
  if (!certFile || !certDados) return;
  const senha = document.getElementById('cert-senha').value;
  const msg = document.getElementById('cert-msg');
  msg.textContent = '📤 Enviando...'; msg.style.color = '#888';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { msg.textContent = 'Salve os dados da empresa primeiro.'; msg.style.color = '#f44'; return; }

  const path = `certificados/${empresaId}/${certFile.name}`;
  const { error: upErr } = await sb.storage.from('octano-certs').upload(path, certFile, { upsert: true });
  if (upErr) { msg.textContent = 'Erro no upload: ' + upErr.message; msg.style.color = '#f44'; return; }

  await sb.from('oct_empresas').update({
    ...certDados,
    cert_path: path,
  }).eq('id', empresaId);

  // guarda a senha do certificado para reaproveitar na manifestacao de NF-e
  if (typeof setCertSenha === 'function') setCertSenha(senha);

  msg.textContent = '✅ Certificado salvo com sucesso!';
  msg.style.color = '#4caf50';
  setTimeout(() => location.reload(), 1200);
}

async function removerCertificado() {
  if (!confirm('Remover certificado digital?')) return;
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  await sb.from('oct_empresas').update({
    cert_nome: null, cert_path: null, cert_validade: null, cert_titular: null, cert_emissao: null
  }).eq('id', perfil.empresa_id);
  // limpa a senha guardada ao remover o certificado
  if (typeof setCertSenha === 'function') setCertSenha(null);
  location.reload();
}

// ─── SALVAR EMPRESA ───────────────────────────────────────────────────────────
async function salvarEmpresa() {
  const msg = document.getElementById('emp-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';
  const session = await getSession();

  const dadosEmpresa = {
    nome: document.getElementById('emp-nome').value.trim(),
    nome_fantasia: document.getElementById('emp-fantasia').value.trim(),
    cnpj: document.getElementById('emp-cnpj').value.trim(),
    ie: document.getElementById('emp-ie').value.trim(),
    telefone: document.getElementById('emp-telefone').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    endereco: document.getElementById('emp-endereco').value.trim(),
    cidade: document.getElementById('emp-cidade').value.trim(),
    uf: document.getElementById('emp-uf').value,
    cep: document.getElementById('emp-cep').value.trim(),
    regime_tributario: document.getElementById('emp-regime').value,
  };

  if (!dadosEmpresa.nome) { msg.textContent = 'Razão Social é obrigatória.'; msg.style.color = '#f44'; return; }

  const criando = window._empNova === true;

  if (criando) {
    // CRIA empresa nova. NAO mexe no perfil (o master nao fica preso a ela).
    const { data: nova, error } = await sb.from('oct_empresas').insert(dadosEmpresa).select().single();
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
    window._empNova = false;
    // recarrega a lista de empresas e ja deixa a nova como ativa
    msg.textContent = '✅ Empresa criada! Atualizando lista...'; msg.style.color = '#4caf50';
    const sess = await getSession();
    if (typeof empresaCarregarContexto === 'function') await empresaCarregarContexto(sess);
    if (typeof EMPRESA !== 'undefined') { EMPRESA.ativaId = nova.id; sessionStorage.setItem('octano_empresa_ativa', nova.id); }
    if (typeof empresaRenderSeletor === 'function') empresaRenderSeletor();
    setTimeout(() => navegarPara('empresa'), 800);
    return;
  }

  // EDITA a empresa ATIVA (a selecionada no seletor)
  const empresaId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!empresaId) { msg.textContent = 'Nenhuma empresa ativa para editar.'; msg.style.color = '#f44'; return; }
  const { error } = await sb.from('oct_empresas').update(dadosEmpresa).eq('id', empresaId);
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }

  // atualiza so o nome do perfil (NAO muda mais a empresa do perfil)
  const nomePerfil = (document.getElementById('perf-nome') || {}).value;
  if (nomePerfil != null) {
    await sb.from('oct_perfis').update({ nome: nomePerfil.trim() }).eq('id', session.user.id);
  }
  // atualiza o rotulo do seletor (nome/fantasia podem ter mudado)
  if (typeof empresaCarregarContexto === 'function') { await empresaCarregarContexto(session); empresaRenderSeletor(); }

  msg.textContent = '✅ Salvo com sucesso!'; msg.style.color = '#4caf50';
}

// abre o formulario em modo "nova empresa" (vazio)
function empAbrirNova() {
  window._empNova = true;
  navegarPara('empresa');
}
// cancela a criacao e volta para a empresa ativa
function empCancelarNova() {
  window._empNova = false;
  navegarPara('empresa');
}
