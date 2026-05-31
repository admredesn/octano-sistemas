async function moduloEmpresa() {
  const conteudo = document.getElementById('conteudo');
  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis')
    .select('*, oct_empresas(*)')
    .eq('id', session.user.id)
    .single();

  const emp = perfil?.oct_empresas || {};
  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  conteudo.innerHTML = `
    <div class="modulo-container">

      <div class="modulo-header"><h2>⚙️ Cadastro da Empresa</h2></div>
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
            <span title="A IE não possui consulta automática disponível" style="color:#888;cursor:help;font-size:1rem">ℹ️</span>
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
        <div id="cert-info">
          ${emp.cert_nome ? `
            <div class="cert-atual">
              <span class="cert-icone">🔒</span>
              <div>
                <div class="cert-nome">${emp.cert_nome}</div>
                <div class="cert-validade" id="cert-validade-display">Validade: ${emp.cert_validade || 'não informada'}</div>
              </div>
              <button onclick="removerCertificado()" class="btn-remover-cert">✕ Remover</button>
            </div>
          ` : `<div class="cert-vazio">Nenhum certificado cadastrado</div>`}
        </div>

        <div class="cert-upload-area" id="cert-upload-area">
          <div class="cert-drop" onclick="document.getElementById('cert-file').click()">
            <span style="font-size:2rem">📂</span>
            <p>Clique para selecionar o certificado <strong>.pfx</strong> ou <strong>.p12</strong></p>
            <p style="font-size:0.75rem;color:#555">O arquivo ficará armazenado de forma segura</p>
          </div>
          <input type="file" id="cert-file" accept=".pfx,.p12" style="display:none" onchange="selecionouCertificado(this)" />
        </div>

        <div id="cert-senha-area" style="display:none;margin-top:12px">
          <div class="form-grid" style="max-width:400px">
            <div class="form-group span2">
              <label>Arquivo selecionado</label>
              <input id="cert-arquivo-nome" type="text" disabled style="opacity:0.6" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado *</label>
              <input id="cert-senha" type="password" placeholder="Digite a senha do certificado" />
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
            <button onclick="uploadCertificado()" class="btn-salvar">📤 Enviar certificado</button>
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

  // Mascara CNPJ
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

  // Mascara CEP
  document.getElementById('emp-cep').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    this.value = v;
  });
}

async function consultarCNPJ() {
  const cnpj = document.getElementById('emp-cnpj').value.replace(/\D/g, '');
  const status = document.getElementById('cnpj-status');
  if (cnpj.length !== 14) { status.textContent = 'CNPJ inválido.'; status.style.color = '#f44'; return; }
  status.textContent = '🔄 Consultando Receita Federal...';
  status.style.color = '#888';
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
    // Destaca campo IE
    document.getElementById('emp-ie').style.borderColor = '#f97316';
    document.getElementById('emp-ie').focus();
  } catch(e) {
    status.textContent = '❌ CNPJ não encontrado. Preencha manualmente.';
    status.style.color = '#f44';
  }
}

let certFile = null;

function selecionouCertificado(input) {
  if (!input.files.length) return;
  certFile = input.files[0];
  document.getElementById('cert-arquivo-nome').value = certFile.name;
  document.getElementById('cert-senha-area').style.display = 'block';
  document.getElementById('cert-upload-area').style.display = 'none';
}

function cancelarCert() {
  certFile = null;
  document.getElementById('cert-senha-area').style.display = 'none';
  document.getElementById('cert-upload-area').style.display = 'block';
  document.getElementById('cert-file').value = '';
}

async function uploadCertificado() {
  const senha = document.getElementById('cert-senha').value;
  const msg = document.getElementById('cert-msg');
  if (!certFile) return;
  if (!senha) { msg.textContent = 'Informe a senha do certificado.'; msg.style.color = '#f44'; return; }

  msg.textContent = '📤 Enviando...';
  msg.style.color = '#888';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { msg.textContent = 'Salve os dados da empresa primeiro.'; msg.style.color = '#f44'; return; }

  // Upload para Supabase Storage
  const path = `certificados/${empresaId}/${certFile.name}`;
  const { error: upErr } = await sb.storage.from('octano-certs').upload(path, certFile, { upsert: true });
  if (upErr) { msg.textContent = 'Erro no upload: ' + upErr.message; msg.style.color = '#f44'; return; }

  // Salva referencia na empresa (sem salvar a senha em texto puro no banco)
  await sb.from('oct_empresas').update({
    cert_nome: certFile.name,
    cert_path: path,
    cert_validade: 'verificar manualmente',
  }).eq('id', empresaId);

  msg.textContent = '✅ Certificado enviado com sucesso!';
  msg.style.color = '#4caf50';
  setTimeout(() => location.reload(), 1200);
}

async function removerCertificado() {
  if (!confirm('Remover certificado digital?')) return;
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  await sb.from('oct_empresas').update({ cert_nome: null, cert_path: null, cert_validade: null }).eq('id', perfil.empresa_id);
  location.reload();
}

async function salvarEmpresa() {
  const msg = document.getElementById('emp-msg');
  msg.textContent = 'Salvando...';
  msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('*').eq('id', session.user.id).single();

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

  let empresaId = perfil?.empresa_id;
  if (empresaId) {
    const { error } = await sb.from('oct_empresas').update(dadosEmpresa).eq('id', empresaId);
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  } else {
    const { data: nova, error } = await sb.from('oct_empresas').insert(dadosEmpresa).select().single();
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
    empresaId = nova.id;
  }

  const nomePerfil = document.getElementById('perf-nome').value.trim();
  if (perfil) {
    await sb.from('oct_perfis').update({ nome: nomePerfil, empresa_id: empresaId }).eq('id', session.user.id);
  } else {
    await sb.from('oct_perfis').insert({ id: session.user.id, nome: nomePerfil, empresa_id: empresaId, perfil: 'master', master: true });
  }

  msg.textContent = '✅ Salvo com sucesso!';
  msg.style.color = '#4caf50';
  setTimeout(() => location.reload(), 1000);
}
