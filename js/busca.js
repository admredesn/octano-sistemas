// ============================================================
// octano-retaguarda  -  BUSCA NO SISTEMA (caixa de pesquisa da barra de cima)
// ------------------------------------------------------------
// Pedido do Ronan (10/10/2026): "uma caixa de pesquisa: eu digito 'banco' e o
// sistema me mostra tudo relacionado a banco".
//
// O índice é montado na hora, a partir do que o sistema já descreve de si:
//   · as TELAS (MODULOS de app.js) + sinônimos de cada uma (TELAS_K abaixo);
//   · as AÇÕES de cada tela (PERM_CATALOGO de permissoes.js: "Baixar título
//     pelo extrato", "Reajustar preço na bomba"…);
//   · os PARÂMETROS (PAR_ABAS / PARAM_DEFS de parametros.js), com a sub-aba;
//   · ATALHOS escritos à mão para o que não tem nome próprio em lugar nenhum
//     ("conta bancária" → Conciliação › Contas).
// Tudo filtrado pela permissão de quem está logado (podeVer / pode).
// Enter abre na tela principal; Ctrl+Enter (ou o ⧉) abre em janela separada.
// Atalho: Ctrl+K, ou "/" fora de um campo de texto.
// ============================================================
(function () {
  'use strict';
  try { if (new URLSearchParams(location.search).get('janela') === '1' && window.parent !== window) return; } catch (e) { /* segue */ }

  const MAX = 14;
  // sinônimos por tela (o que a pessoa digita × o nome da aba)
  const TELAS_K = {
    afericoes: 'afericao aferir bico bomba 20 litros medida autorizar',
    automacao_cfg: 'automacao concentrador bomba bico protocolo companytec horustech configurar endereco',
    bi: 'indicadores lucro margem venda do dia meta disponivel saldo banco grafico resultado',
    cashback: 'cashback pix sicoob cliente credito bonus centavos por litro',
    comissoes: 'comissao vendedor frentista percentual loja produto',
    conc_banco: 'banco bancaria extrato sicoob livro financeiro conciliar conciliacao conta corrente saldo lancamento deposito saque transferencia maquininha pagbank',
    contabilidade: 'contabil plano de contas sped ecd contador lancamento contabil fiscal',
    contas_pagar: 'contas a pagar fornecedor boleto vencimento banco despesa titulo pagar conta fixa',
    empresa: 'empresa posto cnpj certificado digital inscricao estadual endereco dados do posto regime',
    fcaixa: 'fechamento de caixa turno sangria dinheiro resultado conferencia sobra falta deposito cofre troco operador caixa',
    faturar: 'faturar fatura boleto nota a prazo cliente cobranca receber titulo nf-e parcelar',
    formas_pagamento: 'formas de pagamento cartao pix prazo negociado tabela de preco bandeira',
    importar_sped: 'sped importar arquivo fiscal',
    lmc: 'lmc livro movimentacao combustivel estoque tanque descarga',
    manifestacao: 'manifestacao nfe sefaz ciencia nota fornecedor xml',
    marketing: 'marketing app campanha notificacao parceiro premio clientes',
    monitor: 'monitor tanques sonda estoque venda ao vivo bomba litros',
    nfe: 'nota fiscal entrada xml fornecedor nfe nf-e saida devolucao',
    nfce: 'nfce cupom fiscal fila transmissao sefaz cancelar recebimento orfao',
    notas_prazo: 'nota a prazo cliente fiado titulo em aberto',
    operadores: 'operador usuario senha login acesso bloquear pin',
    parametros: 'parametros configuracao posto pdv camera ponto edi cofre sangria sicoob cashback cobranca e-mail whatsapp integracoes',
    perfis: 'perfil permissao acesso usuario master gerente financeiro liberar',
    config_fiscal: 'fiscal bomba bico lacre tanque sped',
    pessoas: 'pessoas cliente fornecedor funcionario cadastro cpf cnpj placa frota limite de credito lista negra',
    ponto: 'ponto marcacao funcionario horario jornada exportar',
    preco_bomba: 'preco na bomba reajuste combustivel gasolina etanol diesel',
    prontidao: 'prontidao checklist pista',
    produtos: 'produtos cadastro preco custo margem estoque codigo de barras ean ncm lubrificante loja',
    relatorios: 'relatorios vendas excel exportar impressao estoque descargas entregas',
    servicos: 'servicos lavagem troca de oleo',
    tanques: 'tanques bicos estoque capacidade qr cashback',
    whatsapp: 'whatsapp conectar numero qr code mensagem',
  };
  // o que não tem nome próprio em nenhum catálogo
  const ATALHOS = [
    { t: 'Contas do posto — cadastrar / alterar conta bancária', onde: 'Conciliação › 🏦 Contas', m: 'conc_banco', acao: 'cbContas', perm: 'conc_banco.saldo_inicial',
      k: 'banco bancaria conta corrente cadastro cadastrar nova conta sicoob bb banco do brasil pagbank caixa cofre' },
    { t: 'Saldo inicial da conta', onde: 'Conciliação › ⚙ Saldo inicial', m: 'conc_banco', perm: 'conc_banco.saldo_inicial', k: 'banco saldo inicial conta' },
    { t: 'Extrato do banco × livro do posto (conciliar)', onde: 'Conciliação', m: 'conc_banco', k: 'banco extrato sicoob conciliar comprovar pix cartao maquininha' },
    { t: 'Saldo disponível nas contas (Sicoob em tempo real)', onde: 'B.I › Disponível', m: 'bi', perm: 'bi.disponivel', k: 'banco saldo disponivel dinheiro sicoob caixa' },
    { t: 'Sicoob — leitura do extrato e baixa automática', onde: 'Parâmetros › 🏦 Banco', m: 'parametros', aba: 'banco', k: 'banco sicoob extrato api chave certificado baixa automatica contas a pagar' },
    { t: 'Sangria do caixa → depósito em conta', onde: 'F.Caixa › 💵 Dinheiro / Sangria › 🏦 Gerar depósito', m: 'fcaixa', k: 'sangria deposito banco dinheiro cofre gerar deposito envelope' },
    { t: 'Maquininhas deste posto (PagBank, número de série)', onde: 'Parâmetros › 💳 Recebimentos', m: 'parametros', aba: 'receb', k: 'maquininha pagbank edi serie numero de serie conta unica' },
    { t: 'E-mail de venda aprovada do PagBank', onde: 'Parâmetros › 💳 Recebimentos', m: 'parametros', aba: 'receb', k: 'pagbank email venda aprovada gmail senha de app imap' },
    { t: 'Envio de fatura por e-mail / WhatsApp', onde: 'Parâmetros › 📧 Cobrança', m: 'parametros', aba: 'cobranca', k: 'cobranca fatura email whatsapp smtp boleto enviar' },
    { t: 'Chave geral do cashback', onde: 'Parâmetros › 🎁 Cashback', m: 'parametros', aba: 'cashback', k: 'cashback ligar desligar chave' },
    { t: 'Reajuste de preço na bomba (troca o preço nos bicos)', onde: '⛽ Preço na bomba', m: 'preco_bomba', k: 'preco bomba reajuste gasolina etanol diesel aumentar baixar' },
    { t: 'Prêmio do app (pontos dos clientes)', onde: '📣 Marketing', m: 'marketing', k: 'premio app pontos cliente trocar' },
  ];

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function semEmoji(s) { return String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, '').trim(); }
  function rotTela(id) {
    const m = (typeof MODULOS !== 'undefined' ? MODULOS : []).find(x => x.id === id);
    return m ? semEmoji(m.label) : id;
  }
  function veTela(id) { try { return typeof podeVer === 'function' ? podeVer(id) : true; } catch (e) { return true; }
  }
  function temPerm(c) { try { return !c || typeof pode !== 'function' || pode(c); } catch (e) { return true; } }

  // ---------- índice ----------
  function indice() {
    const out = [];
    const mods = (typeof MODULOS !== 'undefined' ? MODULOS : []).filter(m => !m.breve && veTela(m.id));
    const ids = new Set(mods.map(m => m.id));
    mods.forEach(m => out.push({ t: semEmoji(m.label), onde: 'Tela', m: m.id, k: m.id + ' ' + (TELAS_K[m.id] || ''), peso: 2 }));
    // ações (catálogo de permissões — só retaguarda, sem o ".ver" que é a própria tela)
    const PREFIXO = { nfe_saida: 'nfe', empresa: 'empresa' };
    (typeof PERM_CATALOGO !== 'undefined' ? PERM_CATALOGO : []).forEach(g => {
      if (g.area !== 'Retaguarda') return;
      g.itens.forEach(i => {
        if (/\.ver$/.test(i.c)) return;
        const pre = i.c.split('.')[0];
        let m = PREFIXO[pre] || pre;
        if (i.c === 'empresa.integracoes') m = 'parametros';
        if (!ids.has(m) || !temPerm(i.c)) return;
        out.push({ t: i.d, onde: rotTela(m) + ' › ' + g.grupo, m, k: i.c.replace(/[._]/g, ' ') + ' ' + (TELAS_K[m] || ''), peso: 1 });
      });
    });
    // parâmetros: sub-abas, grupos e cada chave
    if (ids.has('parametros')) {
      const abas = typeof PAR_ABAS !== 'undefined' ? PAR_ABAS : [];
      abas.forEach(a => out.push({ t: 'Parâmetros › ' + semEmoji(a.rot), onde: a.desc || 'Parâmetros', m: 'parametros', aba: a.id, k: a.id, peso: 1 }));
      (typeof PARAM_DEFS !== 'undefined' ? PARAM_DEFS : []).forEach(g => {
        const aba = abas.find(a => a.id === (g.aba || 'pdv'));
        const ondeG = 'Parâmetros › ' + (aba ? semEmoji(aba.rot) : 'PDV');
        out.push({ t: semEmoji(g.grupo), onde: ondeG, m: 'parametros', aba: g.aba || 'pdv', k: (g.itens || []).map(i => i.rot + ' ' + i.chave).join(' '), peso: 1 });
        (g.itens || []).forEach(i => out.push({ t: i.rot, onde: ondeG + ' › ' + semEmoji(g.grupo), m: 'parametros', aba: g.aba || 'pdv', k: i.chave.replace(/_/g, ' ') + ' ' + (i.desc || '').slice(0, 160), peso: 0 }));
      });
    }
    ATALHOS.forEach(a => { if (ids.has(a.m) && temPerm(a.perm)) out.push(Object.assign({ peso: 3 }, a)); });
    out.forEach(e => { e._t = norm(e.t); e._h = norm(e.t + ' ' + e.onde + ' ' + (e.k || '') + ' ' + rotTela(e.m)); });
    return out;
  }
  let _idx = null, _idxEm = 0;
  function idx() {
    // o índice depende das permissões (que chegam depois do login): refaz a cada 30 s
    if (!_idx || Date.now() - _idxEm > 30000) { _idx = indice(); _idxEm = Date.now(); }
    return _idx;
  }

  function buscar(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const res = [];
    idx().forEach(e => {
      let pts = 0;
      for (const t of toks) {
        if (!e._h.includes(t)) return;          // toda palavra tem de aparecer
        if (e._t.startsWith(t)) pts += 6;
        else if (e._t.includes(' ' + t)) pts += 4;
        else if (e._t.includes(t)) pts += 3;
        else pts += 1;
      }
      res.push({ e, pts: pts + e.peso });
    });
    res.sort((a, b) => b.pts - a.pts || a.e.t.localeCompare(b.e.t, 'pt-BR'));
    // a mesma tela não precisa aparecer duas vezes com o mesmo título
    const vistos = new Set();
    return res.filter(r => { const k = r.e.m + '|' + r.e._t; if (vistos.has(k)) return false; vistos.add(k); return true; })
      .slice(0, MAX).map(r => r.e);
  }

  // ---------- executar ----------
  function executar(e, emJanela) {
    fechar();
    if (!e || !e.m) return;
    if (e.aba) { try { sessionStorage.setItem('octano_par_aba', e.aba); } catch (x) { /* ok */ } }
    if (emJanela && typeof octJanelaAbrir === 'function' && window.innerWidth >= 900) { octJanelaAbrir(e.m); return; }
    // abrir na tela principal = mesma regra do clique na aba: as janelas abertas vão para a barra
    if (typeof octJanelasMinimizarTodas === 'function') octJanelasMinimizarTodas();
    if (e.aba && typeof parTrocarAba === 'function' && typeof _moduloAtual !== 'undefined' && _moduloAtual === 'parametros') {
      parTrocarAba(e.aba);   // já está na tela: só troca a sub-aba
    } else if (typeof navegarPara === 'function') {
      navegarPara(e.m);
    }
    if (e.acao && typeof window[e.acao] === 'function') {
      try { window[e.acao](); } catch (x) { console.warn('busca:', e.acao, x); }
    }
  }

  // ---------- caixa e lista ----------
  let _sel = -1, _res = [];
  function css() {
    if (document.getElementById('busca-css')) return;
    const s = document.createElement('style'); s.id = 'busca-css';
    s.textContent = `
      .bg-caixa{position:relative;flex:1;max-width:460px;margin:0 18px}
      .bg-caixa input{width:100%;box-sizing:border-box;padding:6px 10px 6px 30px;border-radius:7px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem;outline:none}
      .bg-caixa input:focus{border-color:#f97316}
      .bg-caixa .bg-lupa{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#7c8698;font-size:0.9rem;pointer-events:none}
      .bg-caixa .bg-kbd{position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#4b5563;font-size:0.62rem;pointer-events:none}
      .bg-lista{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;z-index:6000;max-height:70vh;overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.55);padding:4px}
      .bg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;cursor:pointer}
      .bg-item.sel,.bg-item:hover{background:#1e293b}
      .bg-item .bg-txt{flex:1;min-width:0}
      .bg-item .bg-t{color:#e5e7eb;font-size:0.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bg-item .bg-t b{color:#fdba74;font-weight:600}
      .bg-item .bg-onde{color:#7c8698;font-size:0.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bg-item .bg-jan{color:#64748b;font-size:0.9rem;padding:2px 6px;border-radius:5px;opacity:0}
      .bg-item.sel .bg-jan,.bg-item:hover .bg-jan{opacity:1}
      .bg-item .bg-jan:hover{background:#334155;color:#fff}
      .bg-vazio{padding:10px 12px;color:#7c8698;font-size:0.78rem}
      .bg-rodape{padding:6px 10px 3px;color:#4b5563;font-size:0.64rem;border-top:1px solid #1f2430;margin-top:4px}
      @media (max-width:900px){.bg-caixa{display:none}}`;
    document.head.appendChild(s);
  }
  function montar() {
    const tb = document.querySelector('.topbar');
    if (!tb || tb.querySelector('.bg-caixa')) return;
    css();
    const cx = document.createElement('div');
    cx.className = 'bg-caixa';
    cx.innerHTML = '<span class="bg-lupa">🔍</span><input id="busca-global" type="search" placeholder="Pesquisar no sistema… (tela, ação, parâmetro)" autocomplete="off" spellcheck="false"><span class="bg-kbd">Ctrl+K</span>';
    const usu = tb.querySelector('.usuario');
    if (usu) tb.insertBefore(cx, usu); else tb.appendChild(cx);
    const inp = cx.querySelector('input');
    inp.addEventListener('input', () => render(inp.value));
    inp.addEventListener('focus', () => { if (inp.value.trim()) render(inp.value); });
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!_res.length) return;
        ev.preventDefault();
        _sel = ev.key === 'ArrowDown' ? Math.min(_sel + 1, _res.length - 1) : Math.max(_sel - 1, 0);
        marcar();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        const e = _res[_sel >= 0 ? _sel : 0];
        if (e) { inp.value = ''; executar(e, ev.ctrlKey || ev.metaKey); inp.blur(); }
      } else if (ev.key === 'Escape') {
        fechar(); inp.value = ''; inp.blur();
      }
    });
  }
  function realce(txt, q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // marca as palavras digitadas no título (comparando sem acento, posição a posição)
    const n = norm(txt);
    if (n.length !== txt.length) return esc(txt);   // normalização mudou o tamanho: sem realce
    const marcas = new Array(txt.length).fill(false);
    toks.forEach(t => { let i = n.indexOf(t); while (i >= 0) { for (let j = i; j < i + t.length; j++) marcas[j] = true; i = n.indexOf(t, i + 1); } });
    let out = '', aberto = false;
    for (let i = 0; i < txt.length; i++) {
      if (marcas[i] && !aberto) { out += '<b>'; aberto = true; }
      if (!marcas[i] && aberto) { out += '</b>'; aberto = false; }
      out += esc(txt[i]);
    }
    return out + (aberto ? '</b>' : '');
  }
  function render(q) {
    const cx = document.querySelector('.bg-caixa'); if (!cx) return;
    let l = cx.querySelector('.bg-lista');
    if (!q.trim()) { fechar(); return; }
    _res = buscar(q); _sel = _res.length ? 0 : -1;
    if (!l) { l = document.createElement('div'); l.className = 'bg-lista'; cx.appendChild(l); }
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    l.innerHTML = (_res.length
      ? _res.map((e, i) => `<div class="bg-item${i === _sel ? ' sel' : ''}" data-i="${i}">
          <div class="bg-txt"><div class="bg-t">${realce(e.t, q)}</div><div class="bg-onde">${esc(e.onde)}</div></div>
          <span class="bg-jan" title="Abrir em janela separada (Ctrl+Enter)">⧉</span></div>`).join('')
      : `<div class="bg-vazio">Nada encontrado para "${esc(q)}". Tente outra palavra (ex.: banco, sangria, boleto, maquininha).</div>`)
      + '<div class="bg-rodape">↑↓ escolhe · Enter abre · Ctrl+Enter abre em janela · Esc fecha</div>';
    l.querySelectorAll('.bg-item').forEach(it => {
      it.addEventListener('mousedown', ev => {
        ev.preventDefault();   // não tira o foco do campo antes de executar
        const e = _res[Number(it.dataset.i)];
        const inp = document.getElementById('busca-global'); if (inp) inp.value = '';
        executar(e, !!(ev.target.closest && ev.target.closest('.bg-jan')) || ev.ctrlKey);
      });
    });
  }
  function marcar() {
    document.querySelectorAll('.bg-lista .bg-item').forEach((it, i) => {
      it.classList.toggle('sel', i === _sel);
      if (i === _sel) it.scrollIntoView({ block: 'nearest' });
    });
  }
  function fechar() {
    const l = document.querySelector('.bg-lista'); if (l) l.remove();
    _res = []; _sel = -1;
  }
  document.addEventListener('mousedown', ev => {
    if (!ev.target.closest || !ev.target.closest('.bg-caixa')) fechar();
  });
  document.addEventListener('keydown', ev => {
    const inp = document.getElementById('busca-global'); if (!inp) return;
    const alvo = ev.target;
    const digitando = alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || '') || alvo.isContentEditable);
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault(); inp.focus(); inp.select();
    } else if (ev.key === '/' && !digitando && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      ev.preventDefault(); inp.focus(); inp.select();
    }
  });

  // a barra de cima é montada a cada login (renderApp → renderToolbar): engancha ali
  const _rt0 = window.renderToolbar;
  window.renderToolbar = function () {
    if (typeof _rt0 === 'function') _rt0.apply(this, arguments);
    montar();
  };
  window.octBusca = buscar;      // p/ teste: octBusca('banco')
  window.octBuscaAbrir = executar;
})();
