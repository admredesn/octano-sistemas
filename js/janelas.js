// ============================================================
// octano-retaguarda  -  JANELAS (várias telas abertas ao mesmo tempo)
// ------------------------------------------------------------
// Pedido do Ronan (23/09/2026): trabalhar em mais de uma tela ao mesmo tempo,
// como no TecnoX (Fechamento de Caixa e Faturamento abertos lado a lado).
//
// COMO FUNCIONA. Os módulos escrevem no mesmo #conteudo, usam ids fixos
// (faturar.js tem 92 getElementById) e estado global (_cb, _fat*, timers em
// window): dois módulos no mesmo documento se atropelam. Por isso cada janela
// é um IFRAME do próprio sistema em modo janela (index.html?janela=1&modulo=X):
// documento e JS próprios, sem topbar/toolbar, MESMA sessão (localStorage) e
// MESMA empresa ativa (sessionStorage é compartilhado com iframes da mesma
// origem na mesma aba). A tela principal continua como sempre — as abas
// trocam o módulo no lugar.
//
// Abrir uma janela: o ⧉ que aparece ao passar o mouse na aba, ou Ctrl+clique,
// botão do meio ou botão direito na aba. As abertas ficam na barra de baixo
// (como o "Menu Telas" do TecnoX): clique traz pra frente, ✕ fecha. Na janela:
// arrasta pelo título, redimensiona pela borda/canto, ─ minimiza, ☐ maximiza
// (duplo clique no título também), ✕ fecha. F5 reabre as janelas (sessionStorage).
//
// Arrasto e redimensionamento usam setPointerCapture: os eventos continuam
// chegando ao alvo mesmo com o mouse por cima de um iframe (que senão os
// engole). Foco: clique dentro do iframe não borbulha pro pai — como é a
// mesma origem, o gerenciador escuta pointerdown DENTRO de cada iframe.
// Trocar a empresa ativa recarrega todas as janelas (elas leem a empresa no
// boot). Tela estreita (<900px) não tem janelas: cai na navegação normal.
// ============================================================
(function () {
  'use strict';
  // dentro de uma janela este arquivo também carrega (é o mesmo index.html):
  // lá não há gerenciador, só o miolo
  const CHAVE_EMP = (typeof _EMP_KEY !== 'undefined') ? _EMP_KEY : 'octano_empresa_ativa';
  try {
    if (new URLSearchParams(location.search).get('janela') === '1' && window.parent !== window) {
      // A empresa ativa vive no sessionStorage, compartilhado com o pai e as
      // outras janelas. Se mudou em OUTRO documento (troca no pai, empresa
      // criada em outra janela), esta janela esta' na empresa errada: recarrega.
      window.addEventListener('storage', ev => {
        if (ev.storageArea === sessionStorage && ev.key === CHAVE_EMP && ev.newValue) location.reload();
      });
      return;
    }
  } catch (e) { /* segue */ }

  const LARGURA_MIN_TELA = 900;   // abaixo disso (celular/tablet) não há janelas
  const TASKBAR_H = 36;
  const MIN_W = 480, MIN_H = 320;
  const MAX_JANELAS = 8;
  const CHAVE = 'oct_janelas';    // sessionStorage: as abertas sobrevivem ao F5
  const JAN = { lista: [], z: 100, seq: 0, ativa: null };

  function rotulo(modulo) {
    const m = (typeof MODULOS !== 'undefined' ? MODULOS : []).find(x => x.id === modulo);
    return m ? m.label : modulo;
  }
  // borda de baixo da toolbar: as janelas nascem e maximizam abaixo dela, e o
  // arrasto não deixa a barra de título subir por cima das abas
  function topoArea() {
    const tb = document.getElementById('toolbar');
    const r = tb && tb.getBoundingClientRect();
    return r ? Math.round(r.bottom) : 0;
  }
  function podeJanela() { return window.innerWidth >= LARGURA_MIN_TELA; }
  function zDe(j) { return Number(j.el.style.zIndex) || 0; }
  function maisAlta() { return JAN.lista.filter(x => !x.min).sort((a, b) => zDe(b) - zDe(a))[0] || null; }

  // ---------- "mexendo" (arrastando / redimensionando) ----------
  // Enquanto mexe, os iframes ficam surdos ao mouse (cinto e suspensório: o
  // titulo ja' tem pointer capture) e a selecao de texto e' desligada.
  // ARMADILHA (23/09): se a classe FICA no body, o scroll do mouse por cima de
  // qualquer janela vai pra pagina de tras. Por isso ela cai em QUALQUER
  // pointerup/pointercancel (no pai ou dentro das janelas), no blur e no wheel
  // -- nao so' no pointerup do titulo.
  let _arrastando = false;
  function mexendo(on) {
    _arrastando = !!on;
    document.body.classList.toggle('oct-jan-mexendo', !!on);
  }
  document.addEventListener('pointerup', () => mexendo(false), true);
  document.addEventListener('pointercancel', () => mexendo(false), true);
  window.addEventListener('blur', () => mexendo(false));
  document.addEventListener('wheel', () => { if (!_arrastando) mexendo(false); }, { capture: true, passive: true });

  // ---------- geometria ----------
  function aplicarRect(j) {
    const r = j.rect, s = j.el.style, topo = topoArea();
    r.width = Math.max(MIN_W, Math.min(r.width, window.innerWidth));
    r.height = Math.max(MIN_H, Math.min(r.height, window.innerHeight - topo - TASKBAR_H));
    r.left = Math.round(Math.min(Math.max(r.left, 120 - r.width), window.innerWidth - 120));
    r.top = Math.round(Math.min(Math.max(r.top, topo), window.innerHeight - TASKBAR_H - 40));
    s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px';
  }
  function aplicarMax(j) {
    const topo = topoArea(), s = j.el.style;
    s.left = '0px'; s.top = topo + 'px';
    s.width = window.innerWidth + 'px';
    s.height = Math.max(MIN_H, window.innerHeight - topo - TASKBAR_H) + 'px';
  }

  // ---------- barra de baixo ----------
  function barra() {
    let b = document.getElementById('oct-taskbar');
    if (!b) {
      b = document.createElement('div');
      b.id = 'oct-taskbar';
      const rot = document.createElement('span');
      rot.className = 'oct-tb-rot'; rot.textContent = 'JANELAS';
      b.appendChild(rot);
      document.body.appendChild(b);
    }
    return b;
  }
  function renderBarra() {
    const b = barra();
    Array.from(b.querySelectorAll('.oct-tb-item')).forEach(x => x.remove());
    JAN.lista.forEach(j => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'oct-tb-item' + (j === JAN.ativa && !j.min ? ' ativa' : '') + (j.min ? ' min' : '');
      it.title = j.nome + (j.min ? ' (minimizada) — clique para restaurar' : '');
      const nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = j.nome;
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.title = 'Fechar ' + j.nome;
      it.append(nome, x);
      it.addEventListener('click', ev => {
        if (ev.target === x) { fechar(j); return; }
        focar(j);   // minimizada: focar restaura
      });
      b.appendChild(it);
    });
    const tem = JAN.lista.length > 0;
    b.style.display = tem ? '' : 'none';
    document.body.classList.toggle('com-janelas', tem);
  }

  // ---------- ações ----------
  function focar(j) {
    if (j.min) { j.min = false; j.el.style.display = ''; }
    JAN.ativa = j;
    if (JAN.z > 4000) {   // renormaliza antes de encostar na barra (z 5000)
      JAN.z = 100;
      JAN.lista.slice().sort((a, b) => zDe(a) - zDe(b)).forEach(x => { x.el.style.zIndex = ++JAN.z; });
    }
    j.el.style.zIndex = ++JAN.z;
    JAN.lista.forEach(x => x.el.classList.toggle('ativa', x === j));
    renderBarra(); salvar();
  }
  function minimizar(j) {
    j.min = true; j.el.style.display = 'none'; j.el.classList.remove('ativa');
    if (JAN.ativa === j) { JAN.ativa = null; const o = maisAlta(); if (o) { focar(o); return; } }
    renderBarra(); salvar();
  }
  function maximizar(j) {
    j.max = !j.max;
    j.el.classList.toggle('max', j.max);
    if (j.max) aplicarMax(j); else aplicarRect(j);
    j.el.querySelector('.maximizar').textContent = j.max ? '❐' : '☐';
    j.el.querySelector('.maximizar').title = j.max ? 'Restaurar tamanho' : 'Maximizar';
    focar(j);
  }
  function fechar(j) {
    const i = JAN.lista.indexOf(j);
    if (i >= 0) JAN.lista.splice(i, 1);
    j.el.remove();
    if (JAN.ativa === j) { JAN.ativa = null; const o = maisAlta(); if (o) { focar(o); return; } }
    renderBarra(); salvar();
  }
  // manter=true: tira as janelas da tela SEM apagar o arranjo salvo (login de
  // novo na mesma aba reabre). So' o usuario fechando e' que apaga.
  function fecharTodas(manter) {
    JAN.lista.slice().forEach(j => j.el.remove());
    JAN.lista = []; JAN.ativa = null;
    renderBarra();
    if (!manter) salvar();
  }

  // ---------- arrastar / redimensionar (com pointer capture) ----------
  function arrastavel(j) {
    const tit = j.el.querySelector('.oct-jan-tit');
    let ativo = false, dx = 0, dy = 0, deMax = false, x0 = 0, y0 = 0;
    tit.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) maximizar(j); });
    tit.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest('button')) return;
      ativo = true; deMax = j.max; x0 = ev.clientX; y0 = ev.clientY;
      dx = ev.clientX - j.rect.left; dy = ev.clientY - j.rect.top;
      try { tit.setPointerCapture(ev.pointerId); } catch (e) { /* segue sem captura */ }
      mexendo(true);
      ev.preventDefault();
    });
    tit.addEventListener('pointermove', ev => {
      if (!ativo) return;
      if (deMax) {
        // maximizada so' restaura depois de o mouse ANDAR uns pixels: se
        // restaurasse ja' no pointerdown, o duplo clique (restaurar) virava
        // restaura-e-maximiza-de-novo -- a janela nunca saia do maximo.
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 8) return;
        const prop = x0 / Math.max(1, window.innerWidth);   // mouse continua na barra de título
        j.max = false; j.el.classList.remove('max');
        j.el.querySelector('.maximizar').textContent = '☐';
        j.el.querySelector('.maximizar').title = 'Maximizar';
        j.rect.left = Math.round(x0 - j.rect.width * prop);
        j.rect.top = y0 - 17;
        dx = x0 - j.rect.left; dy = y0 - j.rect.top;
        deMax = false;
      }
      j.rect.left = ev.clientX - dx; j.rect.top = ev.clientY - dy;
      aplicarRect(j);
    });
    const fim = ev => {
      mexendo(false);
      if (!ativo) return;
      ativo = false;
      try { tit.releasePointerCapture(ev.pointerId); } catch (e) { /* já solta */ }
      salvar();
    };
    tit.addEventListener('pointerup', fim);
    tit.addEventListener('pointercancel', fim);
  }
  function redimensionavel(j) {
    j.el.querySelectorAll('.oct-jan-red').forEach(h => {
      const modo = h.classList.contains('c') ? 'c' : h.classList.contains('r') ? 'r' : 'd';
      let ativo = false, x0 = 0, y0 = 0, w0 = 0, h0 = 0;
      h.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 || j.max) return;
        ativo = true; x0 = ev.clientX; y0 = ev.clientY; w0 = j.rect.width; h0 = j.rect.height;
        try { h.setPointerCapture(ev.pointerId); } catch (e) { /* segue */ }
        mexendo(true);
        ev.preventDefault(); ev.stopPropagation();
        focar(j);
      });
      h.addEventListener('pointermove', ev => {
        if (!ativo) return;
        if (modo !== 'd') j.rect.width = w0 + (ev.clientX - x0);
        if (modo !== 'r') j.rect.height = h0 + (ev.clientY - y0);
        aplicarRect(j);
      });
      const fim = ev => {
        mexendo(false);
        if (!ativo) return;
        ativo = false;
        try { h.releasePointerCapture(ev.pointerId); } catch (e) { /* já solta */ }
        salvar();
      };
      h.addEventListener('pointerup', fim);
      h.addEventListener('pointercancel', fim);
    });
  }

  // ---------- abrir ----------
  function abrir(modulo) {
    if (typeof navegarPara !== 'function') return null;
    if (!podeJanela()) { navegarPara(modulo); return null; }
    if (typeof podeVer === 'function' && !podeVer(modulo)) return null;
    if (JAN.lista.length >= MAX_JANELAS) {
      alert('Já há ' + MAX_JANELAS + ' janelas abertas. Feche alguma antes de abrir outra.');
      return null;
    }
    const j = { id: ++JAN.seq, modulo, nome: rotulo(modulo), min: false, max: false, rect: null };
    const el = document.createElement('div');
    el.className = 'oct-jan'; el.id = 'oct-jan-' + j.id;
    el.innerHTML =
      '<div class="oct-jan-tit"><span class="oct-jan-nome"></span>' +
        '<span class="oct-jan-botoes">' +
          '<button type="button" class="minimizar" title="Minimizar">─</button>' +
          '<button type="button" class="maximizar" title="Maximizar">☐</button>' +
          '<button type="button" class="fechar" title="Fechar">✕</button>' +
        '</span></div>' +
      '<iframe class="oct-jan-corpo"></iframe>' +
      '<div class="oct-jan-red r"></div><div class="oct-jan-red d"></div><div class="oct-jan-red c"></div>';
    el.querySelector('.oct-jan-nome').textContent = j.nome;
    const iframe = el.querySelector('iframe');
    iframe.title = j.nome;
    j.el = el; j.iframe = iframe;
    // clique DENTRO do iframe não chega ao pai; mesma origem, então escuta lá.
    // (re-liga a cada load: a troca de empresa recarrega a janela)
    iframe.addEventListener('load', () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          doc.addEventListener('pointerdown', () => { if (JAN.ativa !== j) focar(j); }, true);
          // soltou o botao em cima da janela: garante que o "mexendo" cai
          doc.addEventListener('pointerup', () => mexendo(false), true);
          doc.addEventListener('pointercancel', () => mexendo(false), true);
        }
      } catch (e) { /* origem diferente: não acontece */ }
    });
    // cascata, abaixo da toolbar
    const n = JAN.lista.length % 8, topo = topoArea();
    j.rect = {
      left: 48 + 28 * n, top: topo + 12 + 28 * n,
      width: Math.max(MIN_W, Math.round(window.innerWidth * 0.72)),
      height: Math.max(MIN_H, Math.round((window.innerHeight - topo - TASKBAR_H) * 0.82)),
    };
    aplicarRect(j);
    el.querySelector('.minimizar').addEventListener('click', ev => { ev.stopPropagation(); minimizar(j); });
    el.querySelector('.maximizar').addEventListener('click', ev => { ev.stopPropagation(); maximizar(j); });
    el.querySelector('.fechar').addEventListener('click', ev => { ev.stopPropagation(); fechar(j); });
    el.addEventListener('pointerdown', () => { if (JAN.ativa !== j) focar(j); }, true);
    arrastavel(j); redimensionavel(j);
    document.body.appendChild(el);
    JAN.lista.push(j);
    iframe.src = location.pathname + '?janela=1&modulo=' + encodeURIComponent(modulo);
    focar(j);
    return j;
  }

  // ---------- lembrar as abertas (F5) ----------
  function salvar() {
    try {
      // da mais atras para a mais na frente: o F5 reabre nessa ordem e a
      // ultima aberta (a da frente) volta na frente
      const ordem = JAN.lista.slice().sort((a, b) => zDe(a) - zDe(b));
      sessionStorage.setItem(CHAVE, JSON.stringify(ordem.map(j => ({ modulo: j.modulo, rect: j.rect, min: j.min, max: j.max }))));
    } catch (e) { /* storage indisponível: só perde o F5 */ }
  }
  let _restaurou = false;
  function restaurarSalvas() {
    if (_restaurou) return;
    _restaurou = true;
    let lst = [];
    try { lst = JSON.parse(sessionStorage.getItem(CHAVE) || '[]'); } catch (e) { lst = []; }
    if (!Array.isArray(lst) || !lst.length || !podeJanela()) return;
    lst.slice(0, MAX_JANELAS).forEach(s => {
      if (!s || typeof s.modulo !== 'string') return;
      const j = abrir(s.modulo);
      if (!j) return;
      if (s.rect && typeof s.rect.left === 'number') { Object.assign(j.rect, s.rect); aplicarRect(j); }
      if (s.max) maximizar(j);
      if (s.min) minimizar(j);
    });
  }

  // ---------- integração com o shell (app.js) ----------
  // As abas da toolbar ganham o ⧉ e os atalhos; renderToolbar roda a cada
  // login, então o enfeite é reposto sempre.
  const _renderToolbar0 = window.renderToolbar;
  window.renderToolbar = function () {
    if (typeof _renderToolbar0 === 'function') _renderToolbar0.apply(this, arguments);
    const tb = document.getElementById('toolbar');
    if (!tb) return;
    tb.querySelectorAll('.toolbar-item:not(.breve)').forEach(item => {
      if (item.querySelector('.oct-abrir-jan')) return;
      const b = document.createElement('span');
      b.className = 'oct-abrir-jan';
      b.textContent = '⧉';
      b.title = 'Abrir em janela separada (ou Ctrl+clique / botão do meio na aba)';
      b.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); abrir(item.id.slice(4)); });
      item.appendChild(b);
    });
    restaurarSalvas();
  };
  function abaDe(ev) {
    const item = ev.target && ev.target.closest && ev.target.closest('#toolbar .toolbar-item:not(.breve)');
    return item && item.id && item.id.indexOf('tab-') === 0 ? item : null;
  }
  // Ctrl+clique: intercepta na captura, antes do onclick inline da aba
  document.addEventListener('click', ev => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const item = abaDe(ev); if (!item) return;
    ev.stopPropagation(); ev.preventDefault();
    abrir(item.id.slice(4));
  }, true);
  document.addEventListener('mousedown', ev => { if (ev.button === 1 && abaDe(ev)) ev.preventDefault(); });   // sem auto-rolagem
  document.addEventListener('auxclick', ev => {
    if (ev.button !== 1) return;
    const item = abaDe(ev); if (!item) return;
    ev.preventDefault(); abrir(item.id.slice(4));
  });
  document.addEventListener('contextmenu', ev => {
    const item = abaDe(ev); if (!item) return;
    ev.preventDefault(); abrir(item.id.slice(4));
  });

  // sair / sessão caiu: a tela de login substitui o #app, mas as janelas moram
  // no body -- sem isto ficariam flutuando por cima do login
  const _renderLogin0 = window.renderLogin;
  window.renderLogin = function () {
    fecharTodas(true);        // arranjo fica salvo: ao entrar de novo, reabre
    _restaurou = false;
    if (typeof _renderLogin0 === 'function') return _renderLogin0.apply(this, arguments);
  };
  // EMPRESA ATIVA. Ela vive no sessionStorage (empresa_ativa.js), compartilhado
  // entre o pai e as janelas. Quem muda nao recebe o evento 'storage'; todos os
  // OUTROS documentos recebem -- entao cada um cuida de si: as janelas se
  // recarregam (acima, no modo janela) e o pai recarrega o contexto e a tela.
  // Cobre qualquer caminho (empresaTrocar do seletor, empresa criada em
  // empresa.js), em qualquer direcao, sem depender de embrulhar funcao.
  window.addEventListener('storage', ev => {
    if (ev.storageArea !== sessionStorage || ev.key !== CHAVE_EMP || !ev.newValue) return;
    if (typeof EMPRESA !== 'undefined' && EMPRESA.ativaId === ev.newValue) return;
    (async () => {
      try {
        if (typeof getSession === 'function' && typeof empresaCarregarContexto === 'function') {
          const s = await getSession();
          if (s) await empresaCarregarContexto(s);   // le a empresa salva e refaz a lista
        }
      } catch (e) { /* segue com o que tem */ }
      if (typeof empresaRenderSeletor === 'function') empresaRenderSeletor();
      if (typeof navegarPara === 'function' && typeof _moduloAtual !== 'undefined') navegarPara(_moduloAtual);
    })();
  });
  // recados das janelas (app.js: _janelaAvisar)
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || !ev.data || typeof ev.data.oct !== 'string') return;
    const j = JAN.lista.find(x => x.iframe.contentWindow === ev.source);
    if (ev.data.oct === 'janela-modulo' && j) {
      if (typeof ev.data.modulo === 'string') j.modulo = ev.data.modulo;
      j.nome = rotulo(j.modulo);
      j.el.querySelector('.oct-jan-nome').textContent = j.nome;
      j.iframe.title = j.nome;
      renderBarra(); salvar();
    } else if (ev.data.oct === 'janela-sessao') {
      fecharTodas(true);
      if (typeof _sessaoExpirou === 'function') _sessaoExpirou();
    }
  });
  window.addEventListener('resize', () => JAN.lista.forEach(j => (j.max ? aplicarMax(j) : aplicarRect(j))));

  window.octJanelaAbrir = abrir;
  window.octJanelasFecharTodas = fecharTodas;
})();
