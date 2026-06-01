// ============================================================
// GRID COMPARTILHADO — componente de listagem estilo ERP
// Usado por: nfe, contas_pagar, produtos, pessoas, lmc
//
// Uso basico:
//   octanoGrid({
//     montarEm: 'id-do-container',
//     titulo: 'Nota Fiscal Entrada',
//     dados: [ {...}, {...} ],            // array de objetos
//     colunas: [
//       { campo:'numero', titulo:'Número', largura:'80px' },
//       { campo:'valor_total', titulo:'Total', tipo:'moeda', align:'right' },
//       { campo:'emissao', titulo:'Emissão', tipo:'data' },
//       { titulo:'Forn.', valor:(linha)=>linha.oct_pessoas?.nome },  // coluna calculada
//     ],
//     acoes: [                            // botoes da toolbar (opcional)
//       { rotulo:'F1 · Incluir', ico:'＋', onClick:'minhaFuncaoIncluir()' },
//     ],
//     aoClicarLinha: (linha)=> abrirDetalhe(linha.id),   // duplo-clique
//     botaoExcluir: (linha)=> excluirAlgo(linha.id),     // opcional: coluna X
//     rodapeDireita: 'POSTO GLORIA',
//     porPagina: 200,
//   });
// ============================================================

(function(){
  // injeta o CSS uma unica vez
  if (!document.getElementById('octano-grid-css')) {
    const st = document.createElement('style');
    st.id = 'octano-grid-css';
    st.textContent = `
      .og-janela{max-width:1500px;margin:0 auto;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4)}
      .og-titulo{background:linear-gradient(180deg,#2a2d3e,#1a1d2e);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;color:#e0e0e0;border-bottom:1px solid #2a2d3e}
      .og-fechar{background:transparent;border:none;color:#888;cursor:pointer;font-size:1.1rem}
      .og-fechar:hover{color:#f44}
      .og-toolbar{display:flex;align-items:center;gap:4px;padding:8px 12px;background:#0f1117;border-bottom:1px solid #2a2d3e;flex-wrap:wrap}
      .og-tb-btn{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:58px;padding:6px 8px;background:transparent;border:1px solid transparent;border-radius:6px;color:#aaa;cursor:pointer;font-size:0.68rem;transition:all .15s}
      .og-tb-btn:hover{background:#1a1d2e;border-color:#2a4a6a;color:#60a5fa}
      .og-tb-ico{font-size:1.1rem;color:#60a5fa}
      .og-tb-sep{width:1px;height:36px;background:#2a2d3e;margin:0 6px}
      .og-paginfo{margin-left:auto;font-size:0.82rem;color:#888;padding:6px 12px;background:#1a1d2e;border-radius:6px;border:1px solid #2a2d3e}
      .og-busca-topo{display:flex;align-items:center;gap:8px;padding:8px 16px;background:#13151f;border-bottom:1px solid #2a2d3e}
      .og-busca-topo input{padding:5px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.82rem;width:300px}
      .og-extra{padding:0}
      .og-scroll{overflow:auto;max-height:60vh}
      .og-tabela{width:100%;border-collapse:collapse;font-size:0.82rem}
      .og-head th{position:sticky;top:0;background:#2a2d3e;color:#cfcfcf;text-align:left;padding:8px 10px;font-weight:600;white-space:nowrap;z-index:2;border-bottom:1px solid #1a1d2e}
      .og-filtros th{position:sticky;top:34px;background:#1e2235;padding:3px 6px;z-index:1}
      .og-filtros input{width:100%;padding:3px 6px;border-radius:4px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.76rem}
      .og-tabela tbody td{padding:6px 10px;border-bottom:1px solid #1a1d2e;white-space:nowrap;color:#d0d0d0}
      .og-tabela tbody tr:hover{background:#1a1d2e;cursor:pointer}
      .og-tabela tbody tr:nth-child(even){background:rgba(255,255,255,.012)}
      .og-tabela tbody tr:nth-child(even):hover{background:#1a1d2e}
      .og-rodape{display:flex;justify-content:space-between;padding:8px 16px;background:#1a1d2e;border-top:1px solid #2a2d3e;font-size:0.78rem;color:#888}
      .og-del{padding:2px 7px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem}
      .og-badge{padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600}
    `;
    document.head.appendChild(st);
  }

  // registro de instancias por container (para callbacks dos onclick inline)
  window._ogInstancias = window._ogInstancias || {};

  function fmtData(d){ return d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : ''; }
  function fmtMoeda(v){ return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); }
  function fmtNum(v,casas){ return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:casas??3}); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function valorCelula(col, linha){
    if (typeof col.valor === 'function') return col.valor(linha);
    let v = linha[col.campo];
    if (col.tipo === 'data')  return fmtData(v);
    if (col.tipo === 'moeda') return fmtMoeda(v);
    if (col.tipo === 'numero')return fmtNum(v, col.casas);
    return v == null ? '' : v;
  }
  // texto puro para filtrar (sem formatacao html)
  function textoFiltro(col, linha){
    const v = valorCelula(col, linha);
    return String(v==null?'':v).toLowerCase();
  }

  window.octanoGrid = function(cfg){
    const cont = document.getElementById(cfg.montarEm);
    if (!cont) { console.error('octanoGrid: container nao encontrado:', cfg.montarEm); return; }

    const idInst = cfg.montarEm;
    const porPagina = cfg.porPagina || 200;
    const inst = {
      cfg, dados: cfg.dados || [], pagina: 0, porPagina,
      filtros: {}, buscaGlobal: ''
    };
    window._ogInstancias[idInst] = inst;

    const colsComFiltro = cfg.colunas;

    cont.innerHTML = `
      <div class="og-janela">
        <div class="og-titulo">
          <span>${esc(cfg.titulo||'')}</span>
          ${cfg.aoFechar ? `<button class="og-fechar" title="Fechar" onclick="${cfg.aoFechar}">✕</button>` : ''}
        </div>
        <div class="og-toolbar">
          ${(cfg.acoes||[]).map(a=>`<button class="og-tb-btn" onclick="${a.onClick}"><div class="og-tb-ico">${a.ico||'•'}</div><div>${esc(a.rotulo)}</div></button>`).join('')}
          ${(cfg.acoes&&cfg.acoes.length)?'<div class="og-tb-sep"></div>':''}
          <button class="og-tb-btn" onclick="_ogIrPagina('${idInst}',0)"><div class="og-tb-ico">⏮</div><div>Home</div></button>
          <button class="og-tb-btn" onclick="_ogPag('${idInst}',-1)"><div class="og-tb-ico">◀◀</div><div>Pg Up</div></button>
          <button class="og-tb-btn" onclick="_ogPag('${idInst}',1)"><div class="og-tb-ico">▶▶</div><div>Pg Down</div></button>
          <button class="og-tb-btn" onclick="_ogIrPagina('${idInst}',-1)"><div class="og-tb-ico">⏭</div><div>End</div></button>
          <button class="og-tb-btn" onclick="_ogLimpar('${idInst}')"><div class="og-tb-ico">✖</div><div>Limpar</div></button>
          <div class="og-paginfo" id="og-paginfo-${idInst}">0 de 0</div>
        </div>
        <div class="og-busca-topo">
          <span style="color:#555;font-size:0.78rem">Busca rápida:</span>
          <input id="og-busca-${idInst}" type="text" placeholder="Pesquisar em tudo..." oninput="_ogRender('${idInst}')" />
        </div>
        ${cfg.htmlExtra ? `<div class="og-extra" id="og-extra-${idInst}">${cfg.htmlExtra}</div>` : ''}
        <div class="og-scroll">
          <table class="og-tabela">
            <thead>
              <tr class="og-head">
                <th style="width:54px">Seq.</th>
                ${colsComFiltro.map(c=>`<th style="${c.largura?`width:${c.largura};`:''}${c.align?`text-align:${c.align};`:''}">${esc(c.titulo)}</th>`).join('')}
                ${cfg.botaoExcluir?'<th style="width:50px"></th>':''}
              </tr>
              <tr class="og-filtros">
                <th></th>
                ${colsComFiltro.map((c,ci)=>`<th>${c.semFiltro?'':`<input data-fcol="${ci}" oninput="_ogRender('${idInst}')" />`}</th>`).join('')}
                ${cfg.botaoExcluir?'<th></th>':''}
              </tr>
            </thead>
            <tbody id="og-corpo-${idInst}"></tbody>
          </table>
        </div>
        <div class="og-rodape">
          <span id="og-contador-${idInst}">0 registros</span>
          <span>${esc(cfg.rodapeDireita||'')}</span>
        </div>
      </div>
    `;

    _ogRender(idInst);
  };

  window._ogRender = function(idInst){
    const inst = window._ogInstancias[idInst];
    if (!inst) return;
    const cfg = inst.cfg;
    const corpo = document.getElementById('og-corpo-'+idInst);
    if (!corpo) return;

    // coleta filtros (apenas inputs dentro desta janela)
    const janela = corpo.closest('.og-janela');
    const bg = (janela.querySelector('#og-busca-'+idInst)?.value||'').toLowerCase().trim();
    const fcols = {};
    janela.querySelectorAll('.og-filtros input[data-fcol]').forEach(inp=>{
      fcols[inp.getAttribute('data-fcol')] = (inp.value||'').toLowerCase().trim();
    });

    const filtradas = inst.dados.filter(linha=>{
      if (bg){
        const blob = cfg.colunas.map(c=>textoFiltro(c,linha)).join(' ');
        if (!blob.includes(bg)) return false;
      }
      for (const ci in fcols){
        if (!fcols[ci]) continue;
        if (!textoFiltro(cfg.colunas[ci],linha).includes(fcols[ci])) return false;
      }
      return true;
    });

    const totalPag = Math.max(1, Math.ceil(filtradas.length/inst.porPagina));
    if (inst.pagina > totalPag-1) inst.pagina = totalPag-1;
    if (inst.pagina < 0) inst.pagina = 0;
    const ini = inst.pagina*inst.porPagina;
    const pagina = filtradas.slice(ini, ini+inst.porPagina);

    const nCols = cfg.colunas.length + 1 + (cfg.botaoExcluir?1:0);
    if (pagina.length===0){
      corpo.innerHTML = `<tr><td colspan="${nCols}" style="text-align:center;padding:40px;color:#555">Nenhum registro encontrado.</td></tr>`;
    } else {
      corpo.innerHTML = pagina.map((linha,idx)=>{
        const seq = ini+idx+1;
        const tds = cfg.colunas.map(c=>{
          const v = valorCelula(c, linha);
          const render = c.render ? c.render(v, linha) : esc(v);
          const align = c.align ? `text-align:${c.align};` : '';
          const extra = c.tdStyle ? c.tdStyle : '';
          return `<td style="${align}${extra}">${render}</td>`;
        }).join('');
        const dbl = cfg.aoClicarLinha ? `ondblclick="_ogClicarLinha('${idInst}',${ini+idx})"` : '';
        const del = cfg.botaoExcluir ? `<td><button class="og-del" onclick="event.stopPropagation();_ogExcluir('${idInst}',${ini+idx})">✕</button></td>` : '';
        return `<tr ${dbl}><td style="color:#666;text-align:center">${seq}</td>${tds}${del}</tr>`;
      }).join('');
    }
    // guarda a lista filtrada atual para os callbacks de indice
    inst._filtradas = filtradas;

    const cont = document.getElementById('og-contador-'+idInst);
    if (cont) cont.textContent = `${filtradas.length} registro${filtradas.length!==1?'s':''}`;
    const pinfo = document.getElementById('og-paginfo-'+idInst);
    if (pinfo) pinfo.textContent = `${inst.pagina+1} de ${totalPag}`;
  };

  window._ogPag = function(idInst, dir){
    const inst = window._ogInstancias[idInst]; if(!inst) return;
    inst.pagina += dir;
    _ogRender(idInst);
  };
  window._ogIrPagina = function(idInst, p){
    const inst = window._ogInstancias[idInst]; if(!inst) return;
    if (p<0){
      const totalPag = Math.max(1, Math.ceil((inst._filtradas||inst.dados).length/inst.porPagina));
      inst.pagina = totalPag-1;
    } else inst.pagina = 0;
    _ogRender(idInst);
  };
  window._ogLimpar = function(idInst){
    const inst = window._ogInstancias[idInst]; if(!inst) return;
    const janela = document.getElementById('og-corpo-'+idInst).closest('.og-janela');
    janela.querySelectorAll('.og-filtros input').forEach(i=>i.value='');
    const g = janela.querySelector('#og-busca-'+idInst); if(g) g.value='';
    inst.pagina = 0;
    _ogRender(idInst);
  };
  window._ogClicarLinha = function(idInst, idxFiltrado){
    const inst = window._ogInstancias[idInst]; if(!inst||!inst.cfg.aoClicarLinha) return;
    const linha = (inst._filtradas||inst.dados)[idxFiltrado];
    if (linha) inst.cfg.aoClicarLinha(linha);
  };
  window._ogExcluir = function(idInst, idxFiltrado){
    const inst = window._ogInstancias[idInst]; if(!inst||!inst.cfg.botaoExcluir) return;
    const linha = (inst._filtradas||inst.dados)[idxFiltrado];
    if (linha) inst.cfg.botaoExcluir(linha);
  };

})();
