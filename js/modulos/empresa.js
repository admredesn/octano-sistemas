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
      <div class="modulo-header">
        <h2>⚙️ Cadastro da Empresa</h2>
      </div>
      <div class="form-grid">

        <div class="form-group" style="position:relative">
          <label>CNPJ</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="emp-cnpj" type="text" value="${emp.cnpj || ''}" placeholder="00.000.000/0000-00" maxlength="18" style="flex:1" />
            <button id="btn-cnpj" onclick="consultarCNPJ()" title="Consultar CNPJ" style="padding:8px 12px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer;font-size:0.85rem;white-space:nowrap">🔍 Consultar</button>
          </div>
          <span id="cnpj-status" style="font-size:0.75rem;color:#888;margin-top:2px"></span>
        </div>

        <div class="form-group">
          <label>Inscrição Estadual</label>
          <input id="emp-ie" type="text" value="${emp.ie || ''}" placeholder="IE" />
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

      <div class="modulo-header" style="margin-top:24px">
        <h2>👤 Meu Perfil</h2>
      </div>
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
        <button class="btn-salvar" onclick="salvarEmpresa()">💾 Salvar</button>
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

  // Consulta automatica ao sair do campo CNPJ
  document.getElementById('emp-cnpj').addEventListener('blur', function() {
    const cnpj = this.value.replace(/\D/g, '');
    if (cnpj.length === 14) consultarCNPJ();
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
  const btn = document.getElementById('btn-cnpj');

  if (cnpj.length !== 14) {
    status.textContent = 'CNPJ inválido — deve ter 14 dígitos.';
    status.style.color = '#f44';
    return;
  }

  status.textContent = '🔄 Consultando...';
  status.style.color = '#888';
  btn.disabled = true;

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!resp.ok) throw new Error('CNPJ não encontrado');
    const d = await resp.json();

    // Preenche os campos
    document.getElementById('emp-nome').value = d.razao_social || '';
    document.getElementById('emp-fantasia').value = d.nome_fantasia || d.razao_social || '';

    const logradouro = [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ');
    document.getElementById('emp-endereco').value = logradouro;
    document.getElementById('emp-cidade').value = d.municipio || '';
    document.getElementById('emp-cep').value = (d.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2');

    const ufEl = document.getElementById('emp-uf');
    if (d.uf) {
      for (let i = 0; i < ufEl.options.length; i++) {
        if (ufEl.options[i].value === d.uf) { ufEl.selectedIndex = i; break; }
      }
    }

    // Telefone
    if (d.ddd_telefone_1) {
      document.getElementById('emp-telefone').value = d.ddd_telefone_1;
    }

    // Simples Nacional
    if (d.opcao_pelo_simples) {
      document.getElementById('emp-regime').value = 'simples';
    }

    status.textContent = '✅ Dados preenchidos! Confira e salve.';
    status.style.color = '#4caf50';
  } catch (e) {
    status.textContent = '❌ CNPJ não encontrado. Preencha manualmente.';
    status.style.color = '#f44';
  }

  btn.disabled = false;
}

async function salvarEmpresa() {
  const msg = document.getElementById('emp-msg');
  msg.textContent = 'Salvando...';
  msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb
    .from('oct_perfis')
    .select('*')
    .eq('id', session.user.id)
    .single();

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

  if (!dadosEmpresa.nome) {
    msg.textContent = 'Razão Social é obrigatória.';
    msg.style.color = '#f44';
    return;
  }

  let empresaId = perfil?.empresa_id;

  if (empresaId) {
    const { error } = await sb.from('oct_empresas').update(dadosEmpresa).eq('id', empresaId);
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  } else {
    const { data: novaEmpresa, error } = await sb.from('oct_empresas').insert(dadosEmpresa).select().single();
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
    empresaId = novaEmpresa.id;
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
