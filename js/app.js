
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
  { id: 'perfis',        label: '🛡️ Perfis',      breve: false },
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
  // 17/09/2026: com o SQL de perfis rodado, vale a permissão "<tela>.ver"
  if (typeof PERM !== 'undefined' && PERM.carregado && !PERM.legado) {
    if (idModulo === 'perfis') return PERM.master;
    return pode(idModulo + '.ver');
  }
  if (idModulo === 'perfis') return false;
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
  let email = u.includes('@') ? u : u+'@octano.interno';
  // operador criado na tela Operadores tem e-mail interno próprio
  // (usuario.empresa@octano.local): acha pelo usuário, como o PDV faz
  if (!u.includes('@')) {
    try {
      const { data: lk } = await sb.from('oct_login_lookup').select('email_login').eq('usuario', u.toLowerCase()).limit(1).maybeSingle();
      if (lk && lk.email_login) email = lk.email_login;
    } catch (_) { /* segue com @octano.interno */ }
  }
  const { error } = await sb.auth.signInWithPassword({ email, password: octSenhaAuth(s) });
  if(error){ e.textContent='Usuario ou senha invalidos.'; return; }
  init();
}

async function fazerLogout(){
  await sb.auth.signOut();
  renderLogin();
}

// canto superior direito: o nome da pessoa (oct_perfis.nome), não o e-mail interno
function _nomeUsuarioTopo(session) {
  const nome = (typeof EMPRESA !== 'undefined' && EMPRESA.usuarioNome) || String(session.user.email || '').split('@')[0];
  return String(nome).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderApp(session){
  // carrega o contexto multi-empresa (perfil, lista de empresas, empresa ativa)
  await empresaCarregarContexto(session);
  document.getElementById('app').innerHTML =
    '<div class="topbar">' +
      '<div class="logo">OCTANO SISTEMAS</div>' +
      '<div class="empresa-info" id="empresa-seletor"></div>' +
      '<div class="usuario"><span>' + _nomeUsuarioTopo(session) + '</span>' +
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
    perfis:        moduloPerfis,
  };
  if(fns[modulo]) _abrirModulo(modulo, fns[modulo], conteudo);
  else conteudo.innerHTML = '<p style="color:#888;padding:24px">Modulo <strong>' + modulo + '</strong> em breve.</p>';
}

// POR QUE ISTO EXISTE (12/09/2026)
// navegarPara chamava `fns[modulo]()` solto. Modulo e' async e os 24 comecam
// igual:  const session = await getSession();
//         ... .eq('id', session.user.id)
// Quando a sessao morre, getSession() devolve NULL e `session.user` estoura um
// TypeError. Sem ninguem escutando a promise, a rejeicao sumia: a tela ficava
// no "Carregando...", nenhuma aba abria e so' fechando o navegador resolvia --
// e ao reabrir vinha a tela de login, que fazia parecer "desloga sozinho".
// Agora a rejeicao e' ouvida: se a sessao caiu, volta ao login DIZENDO o que
// houve; se foi outro erro, a tela mostra o erro em vez de congelar.
function _abrirModulo(modulo, fn, conteudo){
  Promise.resolve().then(fn).catch(async err => {
    let viva = false;
    try { viva = !!(await sb.auth.getSession()).data.session; } catch(e) {}
    if(!viva){ _sessaoExpirou(); return; }
    console.error('modulo ' + modulo + ':', err);
    if(conteudo) conteudo.innerHTML =
      '<div style="padding:24px;color:#f87171">Erro ao abrir <strong>' + modulo + '</strong>.'
      + '<div style="color:#8892a0;font-size:0.82rem;margin-top:8px">' + String((err && err.message) || err) + '</div>'
      + '<button onclick="navegarPara(&quot;' + modulo + '&quot;)" style="margin-top:14px;padding:8px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Tentar de novo</button></div>';
  });
}

// ============================================================
// VER FOTO sem sair do sistema (14/09/2026, pedido do Ronan)
// ------------------------------------------------------------
// Ponto e Notas a Prazo abriam a foto com window.open: uma aba nova por foto,
// e para conferir dez pontos eram dez abas. Agora abre por cima da tela.
// Clique na foto amplia para o tamanho real (conferir rosto, assinatura);
// Esc, o X ou clique no fundo fecham. "Abrir em nova aba" continua ali para
// quem quiser baixar.
// Tudo montado com textContent/src, nunca innerHTML: a URL e a legenda (nome
// de cliente, de funcionario) nao passam por HTML nem por string de JS.
// ============================================================
function verFoto(url, legenda) {
  if (!url) return;
  fecharFoto();
  const ov = document.createElement('div');
  ov.id = 'oct-foto';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(6,7,12,.92);display:flex;flex-direction:column';

  const topo = document.createElement('div');
  topo.style.cssText = 'display:flex;align-items:center;gap:14px;padding:12px 16px;flex:0 0 auto';
  const leg = document.createElement('div');
  leg.style.cssText = 'flex:1;min-width:0;color:#ddd;font-size:0.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  leg.textContent = legenda || '';
  const aba = document.createElement('a');
  aba.href = url; aba.target = '_blank'; aba.rel = 'noopener';
  aba.textContent = 'Abrir em nova aba ↗';
  aba.style.cssText = 'color:#8892a0;font-size:0.78rem;text-decoration:none;white-space:nowrap';
  const x = document.createElement('button');
  x.type = 'button'; x.textContent = '✕'; x.title = 'Fechar (Esc)';
  x.setAttribute('aria-label', 'Fechar foto');
  x.style.cssText = 'flex:0 0 auto;width:36px;height:36px;border-radius:8px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;font-size:1rem;cursor:pointer';
  topo.append(leg, aba, x);

  const palco = document.createElement('div');
  palco.style.cssText = 'flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:0 16px 16px';
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#8892a0;font-size:0.86rem';
  msg.textContent = 'Carregando foto…';
  const img = document.createElement('img');
  img.alt = legenda || 'Foto';
  img.style.cssText = 'display:none;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.55)';
  // TAMANHO: o ponto grava 320x240 (e' o que a webcam do posto aceita) e o
  // comprovante da nota a prazo pode vir em 1920x1080. Foto pequena e' ampliada
  // para ocupar a tela, ate' 3x -- acima disso so' borra. Foto maior que a tela
  // cabe inteira, e o clique mostra no tamanho real para ler a assinatura.
  let ampliada = false, podeAmpliar = false;
  const ajustar = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    const areaW = Math.max(100, palco.clientWidth - 32), areaH = Math.max(100, palco.clientHeight - 16);
    const cabe = Math.min(areaW / w, areaH / h, 3);
    podeAmpliar = cabe < 1;
    if (!podeAmpliar) ampliada = false;
    const k = ampliada ? 1 : cabe;
    img.style.width = Math.round(w * k) + 'px';
    img.style.height = Math.round(h * k) + 'px';
    img.style.cursor = podeAmpliar ? (ampliada ? 'zoom-out' : 'zoom-in') : 'default';
    img.title = podeAmpliar ? (ampliada ? 'Clique para ajustar à tela' : 'Clique para ver no tamanho real') : '';
    // no tamanho real, centralizar cortaria o canto de cima -- ancora no topo p/ rolar
    palco.style.alignItems = ampliada ? 'flex-start' : 'center';
    palco.style.justifyContent = ampliada ? 'flex-start' : 'center';
  };
  img.onload = () => { msg.remove(); img.style.display = 'block'; ajustar(); };
  img.onerror = () => { msg.style.color = '#f87171'; msg.textContent = 'Não foi possível carregar a foto.'; };
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!podeAmpliar) return;
    ampliada = !ampliada;
    ajustar();
  });
  ov._ajustar = ajustar;
  palco.append(msg, img);
  ov.append(topo, palco);

  ov.addEventListener('click', (e) => { if (e.target === ov || e.target === palco || e.target === topo) fecharFoto(); });
  x.addEventListener('click', fecharFoto);
  document.addEventListener('keydown', _fotoTecla);
  window.addEventListener('resize', _fotoRedim);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  img.src = url;
  x.focus();
}
function _fotoTecla(e) { if (e.key === 'Escape') fecharFoto(); }
function _fotoRedim() { const ov = document.getElementById('oct-foto'); if (ov && ov._ajustar) ov._ajustar(); }
function fecharFoto() {
  const ov = document.getElementById('oct-foto');
  if (!ov) return;
  ov.remove();
  document.removeEventListener('keydown', _fotoTecla);
  window.removeEventListener('resize', _fotoRedim);
  document.body.style.overflow = '';
}

// sessao caiu: mostra o login UMA vez, com o motivo. Sem o aviso o usuario acha
// que o sistema perdeu o trabalho dele.
let _avisouSessao = false;
function _sessaoExpirou(){
  if(_avisouSessao) return;
  _avisouSessao = true;
  try { octAutoRefreshParar(); } catch(e) {}
  renderLogin();
  const box = document.querySelector('.login-box');
  if(!box) return;
  const p = document.createElement('p');
  p.style.cssText = 'color:#fbbf24;font-size:0.8rem;margin-top:12px;text-align:center;line-height:1.4';
  p.textContent = 'Sua sessao expirou. Entre de novo para continuar.';
  box.appendChild(p);
}

MODULOS.forEach(m => {
  if(!m.breve) window['navegarPara_' + m.id] = () => navegarPara(m.id);
});

// moduloFCaixa() agora é implementado em modulos/fechamento_caixa.js

// a sessao pode morrer com a tela parada (token nao renovou, refresh recusado).
// Sem isto o usuario so' descobre no proximo clique -- que era o clique que
// travava a tela.
try {
  sb.auth.onAuthStateChange((evento, sessao) => {
    if(!sessao && (evento === 'SIGNED_OUT' || evento === 'TOKEN_REFRESHED')) _sessaoExpirou();
  });
} catch(e) {}

init();
