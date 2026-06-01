
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MODULOS = [
  { id: 'empresa',       label: 'Empresa',     icone: '⚙️',  breve: false },
  { id: 'fcaixa',        label: 'F.Caixa',     icone: '📋',  breve: false },
  { id: 'nfe',           label: 'NF-e',        icone: '📄',  breve: false },
  { id: 'tanques',       label: 'Tanques',     icone: '⛽',  breve: false },
  { id: 'pessoas',       label: 'Pessoas',     icone: '👥',  breve: false },
  { id: 'produtos',      label: 'Produtos',    icone: '📦',  breve: false },
  { id: 'contas_pagar',  label: 'Ctas.Pagar',  icone: '💳',  breve: false },
  { id: 'despesas',      label: 'Despesas',    icone: '💰',  breve: true  },
  { id: 'dre',           label: 'DRE',         icone: '📊',  breve: true  },
];

let _moduloAtual = 'nfe';

async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function init() {
  const session = await getSession();
  if (!session) { renderLogin(); return; }
  renderApp(session);
  navegarPara(_moduloAtual);
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-container">
      <div class="login-box">
        <div class="login-logo">
          <h1>OCTANO</h1>
          <span>SISTEMAS</span>
        </div>
        <input id="login-user" type="text" placeholder="Usuário" autocomplete="username" />
        <input id="login-senha" type="password" placeholder="Senha" autocomplete="current-password"
          onkeydown="if(event.key==='Enter')fazerLogin()" />
        <button onclick="fazerLogin()">Entrar</button>
        <div id="login-erro" class="erro"></div>
      </div>
    </div>
  `;
}

async function fazerLogin() {
  const usuario = document.getElementById('login-user').value.trim();
  const senha   = document.getElementById('login-senha').value;
  const erro    = document.getElementById('login-erro');
  if (!usuario || !senha) { erro.textContent = 'Preencha usuário e senha.'; return; }
  const email = usuario.includes('@') ? usuario : `${usuario}@octano.interno`;
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) { erro.textContent = 'Usuário ou senha inválidos.'; return; }
  init();
}

async function fazerLogout() {
  await sb.auth.signOut();
  renderLogin();
}

async function renderApp(session) {
  const { data: perfil } = await sb.from('oct_perfis')
    .select('oct_empresas(nome_fantasia,razao_social)')
    .eq('id', session.user.id).single();
  const empresa = perfil?.oct_empresas;
  const nomeEmpresa = empresa?.nome_fantasia || empresa?.razao_social || 'Minha Empresa';
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <div class="logo">OCTANO SISTEMAS</div>
      <div class="empresa-info" onclick="navegarPara('empresa')">🏢 ${nomeEmpresa}</div>
      <div class="usuario">
        <span>${session.user.email?.replace('@octano.interno','')}</span>
        <button onclick="fazerLogout()">Sair</button>
      </div>
    </div>
    <div class="toolbar" id="toolbar"></div>
    <div class="conteudo" id="conteudo"></div>
  `;
  renderToolbar();
  // CSS extra para cards de produto
  if (!document.getElementById('style-extra')) {
    const s = document.createElement('style');
    s.id = 'style-extra';
    s.textContent = `
      .prod-card { background:#13151f; border:1px solid #2a2d3e; border-radius:10px; padding:16px; transition:all 0.2s; }
      .prod-card:hover { border-color:#f97316; transform:translateY(-2px); box-shadow:0 4px 20px rgba(249,115,22,0.1); }
    `;
    document.head.appendChild(s);
  }
}

function renderToolbar() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  toolbar.innerHTML = MODULOS.map(m => `
    <div class="toolbar-item ${m.id === _moduloAtual ? 'ativo' : ''} ${m.breve ? 'breve' : ''}"
      id="tab-${m.id}"
      onclick="${m.breve ? '' : `navegarPara('${m.id}')`}">
      ${m.icone} ${m.label}${m.breve ? ' <small>BREVE</small>' : ''}
    </div>
  `).join('');
}

function navegarPara(modulo) {
  _moduloAtual = modulo;
  document.querySelectorAll('.toolbar-item').forEach(el => el.classList.remove('ativo'));
  const tab = document.getElementById(`tab-${modulo}`);
  if (tab) tab.classList.add('ativo');
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;
  switch (modulo) {
    case 'empresa':      moduloEmpresa();       break;
    case 'fcaixa':       moduloFCaixa();        break;
    case 'nfe':          moduloNfe();           break;
    case 'tanques':      moduloTanques();       break;
    case 'pessoas':      moduloPessoas();       break;
    case 'produtos':     moduloProdutos();      break;
    case 'contas_pagar': moduloContasPagar();   break;
    default:
      conteudo.innerHTML = `<p style="color:#888;padding:24px">Módulo <strong>${modulo}</strong> em breve.</p>`;
  }
}

function moduloFCaixa() {
  document.getElementById('conteudo').innerHTML =
    '<p style="color:#888;padding:24px">Módulo <strong>F.Caixa</strong> em desenvolvimento.</p>';
}

function moduloPessoas() {
  document.getElementById('conteudo').innerHTML =
    '<p style="color:#888;padding:24px">Módulo <strong>Pessoas</strong> em desenvolvimento.</p>';
}

init();
