
// Abas em ORDEM ALFABÉTICA pelo rótulo (pedido do Ronan, 18/08) — ao criar
// módulo novo, inserir na posição alfabética certa.
const MODULOS = [
  { id: 'afericoes',     label: 'Aferições',      breve: false },
  { id: 'bi',            label: '📈 B.I',        breve: false },
  { id: 'cashback',      label: '💸 Cashback',    breve: false },
  { id: 'comissoes',     label: '💰 Comissões',   breve: false },
  { id: 'conc_banco',    label: '🏦 Conciliação', breve: false },
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
  { id: 'parametros',    label: '⚙️ Parâmetros',  breve: false },
  { id: 'config_fiscal', label: '🧾 Config. Fiscal', breve: false },
  { id: 'pessoas',       label: 'Pessoas',        breve: false },
  { id: 'ponto',         label: 'Ponto',          breve: false },
  { id: 'prontidao',     label: '🎯 Prontidão',   breve: false },
  { id: 'produtos',      label: 'Produtos',       breve: false },
  { id: 'relatorios',    label: '📊 Relatórios',  breve: false },
  { id: 'servicos',      label: '🔧 Serviços',    breve: false },
  { id: 'tanques',       label: 'Tanques',        breve: false },
  { id: 'whatsapp',      label: '📱 WhatsApp',    breve: false },
];

// ── PAPEIS do gerencial ─────────────────────────────────────────────────────
// O papel define o conjunto de telas; oct_perfis.modulos_mais/menos ajusta por
// pessoa. Mudar um papel aqui vale para todo mundo que o usa -- que e' o motivo
// de existir papel em vez de marcar 31 caixinhas por usuario.
//
// ATENCAO: isto organiza, NAO protege. Esconder o menu evita o engano honesto;
// com RLS desligado e a chave anon no navegador, quem souber usar o F12 le'
// qualquer tabela. A trava de verdade e' RLS por empresa, que segue pendente.
const PAPEIS = {
  gerente: { rot: 'Gerente — tudo', modulos: '*' },
  financeiro: {
    rot: 'Financeiro — faturar, pagar, conciliar',
    modulos: ['faturar', 'contas_pagar', 'conc_banco', 'fcaixa', 'notas_prazo',
              'pessoas', 'relatorios', 'bi', 'comissoes', 'cashback'],
  },
  fiscal: {
    rot: 'Fiscal — notas e livros',
    modulos: ['nfe', 'nfce', 'manifestacao', 'lmc', 'importar_sped', 'contabilidade',
              'config_fiscal', 'produtos', 'pessoas', 'relatorios'],
  },
  pista: {
    rot: 'Pista — tanques, aferição, monitor',
    modulos: ['afericoes', 'tanques', 'monitor', 'prontidao', 'ponto', 'servicos',
              'produtos', 'relatorios'],
  },
  consulta: {
    rot: 'Consulta — só olhar',
    modulos: ['bi', 'monitor', 'relatorios', 'notas_prazo'],
  },
};

// perfil do usuario logado (preenchido por empresaCarregarContexto)
let _acesso = { master: false, papel: null, mais: [], menos: [], carregado: false };

function podeVer(idModulo) {
  // enquanto o perfil nao chegou, nao esconde nada: piscar o menu e' pior que
  // mostrar por um instante o que a pessoa ja' via ontem
  if (!_acesso.carregado) return true;
  if (_acesso.master) return true;
  if (_acesso.menos.includes(idModulo)) return false;
  if (_acesso.mais.includes(idModulo)) return true;
  const p = PAPEIS[_acesso.papel || ''];
  if (!p) return false;                    // sem papel definido = sem acesso
  return p.modulos === '*' || p.modulos.includes(idModulo);
}

function modulosPermitidos() {
  return MODULOS.filter(m => podeVer(m.id));
}

let _moduloAtual = 'nfe';

async function getSession(){
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function init(){
  // MODO TV (link ?tv=1 ou #tv): monitor de tanques em tela cheia.
  // EXIGE sessao desde 03/09/2026: o painel mostra faturamento, lucro e margem
  // dos quatro postos, e a URL e' o endereco do sistema com ?tv=1 no fim --
  // quem viu o link uma vez veria o resultado da rede de qualquer lugar.
  // Na maquina do painel se loga UMA VEZ; o Chrome guarda a sessao no perfil do
  // atalho de quiosque e o token se renova sozinho.
  const _params = new URLSearchParams(location.search);
  const _ehTv = (_params.get('tv') === '1' || location.hash === '#tv');
  if(_ehTv && typeof monitorTvBoot === 'function'){
    const _s = await getSession();
    if(!_s){ _tvPedeLogin(); return; }
    monitorTvBoot();
    return;
  }
  const session = await getSession();
  if(!session){ renderLogin(); return; }
  await renderApp(session);
  // abrir numa tela que a pessoa nao pode ver daria "modulo nao encontrado"
  // logo no login; cai na primeira permitida
  if (!podeVer(_moduloAtual)) {
    const primeiro = modulosPermitidos().find(m => !m.breve);
    if (!primeiro) { _semAcesso(); return; }
    _moduloAtual = primeiro.id;
  }
  navegarPara(_moduloAtual);
}

// login do PAINEL: mesma tela, com o aviso de que e' uma vez so'. Sem isso, quem
// liga a TV e ve' pedir senha acha que o painel quebrou.
function _tvPedeLogin(){
  renderLogin();
  const box = document.querySelector('.login-box');
  if(!box) return;
  const p = document.createElement('p');
  p.style.cssText = 'color:#8892a0;font-size:0.78rem;margin-top:12px;text-align:center;line-height:1.4';
  p.innerHTML = '<b style="color:#f97316">Painel de tanques</b><br>' +
    'Entre uma vez nesta máquina — a sessão fica salva e o painel volta sozinho ' +
    'nas próximas vezes.';
  box.appendChild(p);
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

// quem entra sem nenhuma tela liberada nao pode ficar olhando um vazio sem
// explicacao -- ele nao sabe se e' erro do sistema ou falta de permissao
function _semAcesso() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  c.innerHTML = '<div style="padding:60px;text-align:center;color:#9aa">' +
    '<div style="font-size:2rem">🔒</div>' +
    '<h2 style="color:#f97316;margin:10px 0">Sem telas liberadas</h2>' +
    '<p>Seu usuário entrou, mas ainda não tem nenhum módulo liberado.</p>' +
    '<p style="font-size:0.85rem;color:#667">Peça ao administrador para definir o seu papel em Operadores.</p>' +
    '</div>';
}

function renderToolbar(){
  const tb = document.getElementById('toolbar');
  if(!tb) return;
  tb.innerHTML = modulosPermitidos().map(m =>
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


// ── MODAL ARRASTÁVEL (19/08 — pedido Ronan): vale para TODOS os modais ───────
// octArrastavel(caixa, barraTitulo): segura na barra e move; a caixa vira
// position:fixed no primeiro arrasto (pra enxergar o que está atrás).
function octArrastavel(cx, tit){
  if(!cx || !tit || tit.dataset.drag) return;
  tit.dataset.drag = '1';
  tit.style.cursor = 'move';
  tit.addEventListener('mousedown', function(e){
    if(e.target.closest('button,input,select,a') || (e.target.tagName === 'SPAN' && e.target.getAttribute('onclick'))) return;
    const r = cx.getBoundingClientRect();
    cx.style.position = 'fixed';
    cx.style.margin = '0';
    cx.style.transform = 'none';
    cx.style.left = r.left + 'px';
    cx.style.top = r.top + 'px';
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = function(ev){ cx.style.left = (ev.clientX - dx) + 'px'; cx.style.top = Math.max(0, ev.clientY - dy) + 'px'; };
    const up = function(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  });
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
    prontidao:     moduloProntidao,
    servicos:      moduloServicos,
    contas_pagar:  moduloContasPagar,
    conc_banco:    moduloConcBanco,
    contabilidade: moduloContabilidade,
    importar_sped: moduloImportarSped,
    operadores: moduloOperadores,
    afericoes: moduloAfericoes,
    parametros: moduloParametros,
    config_fiscal: moduloConfigFiscal,
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
