
const MODULOS = [
  { id: 'empresa',       label: 'Empresa',       breve: false },
  { id: 'fcaixa',        label: 'F.Caixa',       breve: false },
  { id: 'nfe',           label: 'NF-e',          breve: false },
  { id: 'nfce',          label: 'NFC-e',         breve: false },
  { id: 'manifestacao',  label: 'Manifestação',   breve: false },
  { id: 'tanques',       label: 'Tanques',        breve: false },
  { id: 'pessoas',       label: 'Pessoas',        breve: false },
  { id: 'ponto',         label: 'Ponto',          breve: false },
  { id: 'produtos',      label: 'Produtos',       breve: false },
  { id: 'contas_pagar',  label: 'Ctas.Pagar',     breve: false },
  { id: 'contabilidade', label: 'Contabilidade',  breve: false },
  { id: 'lmc',           label: 'LMC',            breve: false },
  { id: 'despesas',      label: 'Despesas',       breve: true  },
  { id: 'dre',           label: 'DRE',            breve: true  },
];

let _moduloAtual = 'nfe';

async function getSession(){
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function init(){
  const session = await getSession();
  if(!session){ renderLogin(); return; }
  renderApp(session);
  navegarPara(_moduloAtual);
}

function renderLogin(){
  document.getElementById('app').innerHTML =
    '<div class="login-container"><div class="login-box">' +
    '<div class="login-logo"><h1>OCTANO</h1><span>SISTEMAS</span></div>' +
    '<input id="login-user" type="text" placeholder="Usuario" autocomplete="username" />' +
    '<input id="login-senha" type="password" placeholder="Senha" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')fazerLogin()" />' +
    '<button onclick="fazerLogin()">Entrar</button>' +
    '<div id="login-erro" class="erro"></div>' +
    '</div></div>';
}

async function fazerLogin(){
  const u = document.getElementById('login-user').value.trim();
  const s = document.getElementById('login-senha').value;
  const e = document.getElementById('login-erro');
  if(!u||!s){ e.textContent='Preencha usuario e senha.'; return; }
  const email = u.includes('@') ? u : u+'@octano.interno';
  const { error } = await sb.auth.signInWithPassword({ email, password: s });
  if(error){ e.textContent='Usuario ou senha invalidos.'; return; }
  init();
}

async function fazerLogout(){
  await sb.auth.signOut();
  renderLogin();
}

async function renderApp(session){
  const { data: perfil } = await sb
    .from('oct_perfis')
    .select('empresa_id, oct_empresas(nome, nome_fantasia)')
    .eq('id', session.user.id).single();
  const emp = perfil?.oct_empresas;
  const nomeEmpresa = emp?.nome_fantasia || emp?.nome || 'Minha Empresa';
  document.getElementById('app').innerHTML =
    '<div class="topbar">' +
      '<div class="logo">OCTANO SISTEMAS</div>' +
      '<div class="empresa-info" onclick="navegarPara(\'empresa\')">🏢 ' + nomeEmpresa + '</div>' +
      '<div class="usuario"><span>' + (session.user.email?.replace('@octano.interno','')) + '</span>' +
      '<button onclick="fazerLogout()">Sair</button></div>' +
    '</div>' +
    '<div class="toolbar" id="toolbar"></div>' +
    '<div class="conteudo" id="conteudo"></div>';
  renderToolbar();
  if(!document.getElementById('style-extra')){
    const s=document.createElement('style');s.id='style-extra';
    s.textContent='.prod-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;transition:all 0.2s;cursor:pointer;}.prod-card:hover{border-color:#f97316;transform:translateY(-2px);}';
    document.head.appendChild(s);
  }
}

function renderToolbar(){
  const tb = document.getElementById('toolbar');
  if(!tb) return;
  tb.innerHTML = MODULOS.map(m =>
    '<div class="toolbar-item ' + (m.id===_moduloAtual?'ativo':'') + ' ' + (m.breve?'breve':'') + '" ' +
    'id="tab-' + m.id + '" onclick="' + (m.breve ? '' : 'navegarPara_' + m.id + '()') + '">' +
    m.label + (m.breve ? ' <small>BREVE</small>' : '') +
    '</div>'
  ).join('');
}

function navegarPara(modulo){
  _moduloAtual = modulo;
  document.querySelectorAll('.toolbar-item').forEach(el => el.classList.remove('ativo'));
  const tab = document.getElementById('tab-' + modulo);
  if(tab) tab.classList.add('ativo');
  const conteudo = document.getElementById('conteudo');
  if(!conteudo) return;
  const fns = {
    empresa:       moduloEmpresa,
    fcaixa:        moduloFCaixa,
    nfe:           moduloNfe,
    nfce:          moduloNfce,
    nfe_saida:     moduloNfeSaida,
    manifestacao:  moduloManifestacao,
    tanques:       moduloTanques,
    pessoas:       moduloPessoas,
    ponto:         moduloPonto,
    produtos:      moduloProdutos,
    contas_pagar:  moduloContasPagar,
    contabilidade: moduloContabilidade,
    lmc:           moduloLmc,
  };
  if(fns[modulo]) fns[modulo]();
  else conteudo.innerHTML = '<p style="color:#888;padding:24px">Modulo <strong>' + modulo + '</strong> em breve.</p>';
}

MODULOS.forEach(m => {
  if(!m.breve) window['navegarPara_' + m.id] = () => navegarPara(m.id);
});

function moduloFCaixa(){ document.getElementById('conteudo').innerHTML = '<p style="color:#888;padding:24px">F.Caixa em desenvolvimento.</p>'; }

init();
