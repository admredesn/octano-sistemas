const DOMINIO = '@octano.interno';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (!session) {
    renderLogin();
  } else {
    await renderDashboard(session);
  }
});

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <div class="login-logo">
          <h1>OCTANO</h1>
          <span>S I S T E M A S</span>
        </div>
        <input type="text" id="usuario" placeholder="Usuário" autocomplete="username" />
        <input type="password" id="senha" placeholder="Senha" autocomplete="current-password" />
        <button onclick="fazerLogin()">Entrar</button>
        <p id="login-erro" class="erro"></p>
      </div>
    </div>
  `;
  document.getElementById('usuario').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('senha').focus();
  });
  document.getElementById('senha').addEventListener('keydown', e => {
    if (e.key === 'Enter') fazerLogin();
  });
}

async function fazerLogin() {
  const usuario = document.getElementById('usuario').value.trim();
  const password = document.getElementById('senha').value;
  if (!usuario || !password) {
    document.getElementById('login-erro').textContent = 'Preencha usuário e senha.';
    return;
  }
  const email = usuario.includes('@') ? usuario : usuario + DOMINIO;
  try {
    await login(email, password);
    location.reload();
  } catch (e) {
    document.getElementById('login-erro').textContent = 'Usuário ou senha inválidos.';
  }
}

async function renderDashboard(session) {
  const { data: perfil } = await sb
    .from('oct_perfis')
    .select('*, oct_empresas(*)')
    .eq('id', session.user.id)
    .single();

  const nomeUsuario = session.user.email.replace(DOMINIO, '');

  document.getElementById('app').innerHTML = `
    <div class="dashboard">
      <div class="topbar">
        <div class="logo">OCTANO SISTEMAS</div>
        <div class="empresa-info">
          ${perfil?.oct_empresas?.nome_fantasia || 'Configure sua empresa'}
        </div>
        <div class="usuario">
          ${nomeUsuario}
          <button onclick="logout()">Sair</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="toolbar-item ativo" onclick="abrirModulo('caixa')">
          <span>🗂</span> F.Caixa
        </div>
        <div class="toolbar-item ativo" onclick="abrirModulo('nfe')">
          <span>📄</span> NF-e
        </div>
        <div class="toolbar-item ativo" onclick="abrirModulo('tanques')">
          <span>⛽</span> Tanques
        </div>
        <div class="toolbar-item ativo" onclick="abrirModulo('pessoas')">
          <span>👤</span> Pessoas
        </div>
        <div class="toolbar-item ativo" onclick="abrirModulo('produtos')">
          <span>📦</span> Produtos
        </div>
        <div class="toolbar-item breve">
          <span>💰</span> Despesas <small>BREVE</small>
        </div>
        <div class="toolbar-item breve">
          <span>📊</span> DRE <small>BREVE</small>
        </div>
      </div>
      <div id="conteudo" class="conteudo">
        <p>Bem-vindo ao Octano Sistemas! Selecione um módulo acima.</p>
      </div>
    </div>
  `;
}

function abrirModulo(mod) {
  document.getElementById('conteudo').innerHTML = `<p>Módulo <strong>${mod}</strong> em desenvolvimento.</p>`;
}
