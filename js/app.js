
// Abas em ORDEM ALFABÉTICA pelo rótulo (pedido do Ronan, 18/08) — ao criar
// módulo novo, inserir na posição alfabética certa.
const MODULOS = [
  { id: 'afericoes',     label: 'Aferições',      breve: false },
  { id: 'bi',            label: '📈 B.I',        breve: false },
  { id: 'cashback',      label: '💸 Cashback',    breve: false },
  { id: 'comissoes',     label: '💰 Comissões',   breve: false },
  { id: 'contabilidade', label: 'Contabilidade',  breve: false },
  { id: 'contas_pagar',  label: 'Ctas.Pagar',     breve: false },
  { id: 'despesas',      label: 'Despesas',       breve: true  },
  { id: 'dre',           label: 'DRE',            breve: true  },
  { id: 'empresa',       label: 'Empresa',       breve: false },
  { id: 'fcaixa',        label: 'F.Caixa',       breve: false },
  { id: 'faturar',       label: 'Faturar',       breve: false },
  { id: 'formas_pagamento', label: 'Formas de Pagamento', breve: false },
  { id: 'importar_sped', label: 'Importar SPED', breve: false },
  { id: 'lmc',           label: 'LMC',            breve: false },
  { id: 'manifestacao',  label: 'Manifestação',   breve: false },
  { id: 'monitor',       label: '🛢️ Monitor',     breve: false },
  { id: 'nfe',           label: 'NF-e',          breve: false },
  { id: 'nfce',          label: 'NFC-e',         breve: false },
  { id: 'notas_prazo',   label: 'Notas a Prazo',  breve: false },
  { id: 'operadores',    label: 'Operadores',     breve: false },
  { id: 'pessoas',       label: 'Pessoas',        breve: false },
  { id: 'ponto',         label: 'Ponto',          breve: false },
  { id: 'produtos',      label: 'Produtos',       breve: false },
  { id: 'relatorios',    label: '📊 Relatórios',  breve: false },
  { id: 'servicos',      label: '🔧 Serviços',    breve: false },
  { id: 'tanques',       label: 'Tanques',        breve: false },
  { id: 'whatsapp',      label: '📱 WhatsApp',    breve: false },
];

let _moduloAtual = 'nfe';

async function getSession(){
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function init(){
  // MODO TV (link ?tv=1 ou #tv): monitor de tanques em tela cheia, SEM login.
  const _params = new URLSearchParams(location.search);
  if((_params.get('tv') === '1' || location.hash === '#tv') && typeof monitorTvBoot === 'function'){
    monitorTvBoot();
    return;
  }
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
  // carrega o contexto multi-empresa (perfil, lista de empresas, empresa ativa)
  await empresaCarregarContexto(session);
  document.getElementById('app').innerHTML =
    '<div class="topbar">' +
      '<div class="logo">OCTANO SISTEMAS</div>' +
      '<div class="empresa-info" id="empresa-seletor"></div>' +
      '<div class="usuario"><span>' + (session.user.email?.replace('@octano.interno','')) + '</span>' +
      '<button onclick="fazerLogout()">Sair</button></div>' +
    '</div>' +
    '<div class="toolbar" id="toolbar"></div>' +
    '<div class="conteudo" id="conteudo"></div>';
  empresaRenderSeletor();
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

// ── AUTO-REFRESH das telas (a lista se atualiza sozinha) ────────────────────
// Cada modulo que quer atualizar sozinho chama octAutoRefresh(fn, ms) no fim do
// seu render. O timer e trocado a cada navegacao e PAUSA quando: a aba do
// navegador esta oculta, o usuario esta digitando (input/select/textarea em foco),
// ou um modal esta aberto -> nunca atrapalha quem esta preenchendo/filtrando.
let _autoRefreshTimer = null;
function octAutoRefreshParar(){
  if(_autoRefreshTimer){ clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
}
function octAutoRefresh(fn, ms){
  octAutoRefreshParar();
  if(typeof fn !== 'function') return;
  _autoRefreshTimer = setInterval(() => {
    if(document.hidden) return;                       // aba nao visivel
    const a = document.activeElement;
    if(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName || '')) return;  // digitando
    if(document.querySelector('.modal-overlay, .modal.aberto, [role="dialog"]')) return;  // modal aberto
    try { fn(); } catch(e){ /* silencioso: refresh nunca quebra a tela */ }
  }, ms || 15000);
}

function navegarPara(modulo){
  octAutoRefreshParar();   // para o auto-refresh da tela anterior
  _moduloAtual = modulo;
  document.querySelectorAll('.toolbar-item').forEach(el => el.classList.remove('ativo'));
  const tab = document.getElementById('tab-' + modulo);
  if(tab) tab.classList.add('ativo');
  const conteudo = document.getElementById('conteudo');
  if(!conteudo) return;
  const fns = {
    empresa:       moduloEmpresa,
    bi:            moduloBi,
    fcaixa:        moduloFCaixa,
    faturar:       moduloFaturar,
    nfe:           moduloNfe,
    nfce:          moduloNfce,
    nfe_saida:     moduloNfeSaida,
    manifestacao:  moduloManifestacao,
    tanques:       moduloTanques,
    monitor:       moduloMonitor,
    pessoas:       moduloPessoas,
    ponto:         moduloPonto,
    produtos:      moduloProdutos,
    servicos:      moduloServicos,
    contas_pagar:  moduloContasPagar,
    contabilidade: moduloContabilidade,
    importar_sped: moduloImportarSped,
    operadores: moduloOperadores,
    afericoes: moduloAfericoes,
    notas_prazo: moduloNotasPrazo,
    formas_pagamento: moduloFormasPagamento,
    lmc:           moduloLmc,
    relatorios:    moduloRelatorios,
    whatsapp:      moduloWhatsapp,
    cashback:      moduloCashback,
    comissoes:     moduloComissoes,
  };
  if(fns[modulo]) fns[modulo]();
  else conteudo.innerHTML = '<p style="color:#888;padding:24px">Modulo <strong>' + modulo + '</strong> em breve.</p>';
}

MODULOS.forEach(m => {
  if(!m.breve) window['navegarPara_' + m.id] = () => navegarPara(m.id);
});

// moduloFCaixa() agora é implementado em modulos/fechamento_caixa.js

init();
