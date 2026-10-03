// ============================================================
// CALENDÁRIO DOS CAMPOS DE DATA (03/10/2026)
// ------------------------------------------------------------
// O calendário nativo do Chrome, no tema escuro, pinta os dias do mês anterior e
// do seguinte na MESMA cor dos dias do mês: 30, 31 e 1..10 lado a lado, sem saber
// de que mês são. E o "hoje" (contorno) e o dia escolhido (preenchido) viravam dois
// "3" marcados na mesma tela. O popup nativo não aceita CSS, então este substitui:
//   - só os dias do mês aparecem (o resto fica vazio);
//   - dia escolhido = laranja cheio; hoje = contorno com "hoje" escrito embaixo;
//   - respeita min/max; dispara 'input' e 'change' como o nativo (as telas
//     continuam ouvindo os mesmos eventos).
// Vale para TODO input[type=date], inclusive os criados depois (delegação de
// eventos). Digitar a data no campo continua funcionando.
// ============================================================
(function () {
  if (window.__octDatepicker) return;
  window.__octDatepicker = true;

  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                 "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
  const ICONE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2' stroke-linecap='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M3 10h18M8 3v4M16 3v4'/%3E%3C/svg%3E\")";

  const css = document.createElement("style");
  css.textContent = `
    input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
    input[type="date"] { background-image: ${ICONE} !important; background-repeat: no-repeat !important;
      background-position: right 10px center !important; background-size: 16px !important;
      padding-right: 34px !important; cursor: pointer; }
    #oct-dp { position: fixed; z-index: 2147483000; width: 268px; background: #13151f; color: #e5e7eb;
      border: 1px solid #2f3446; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.55);
      padding: 10px 10px 8px; font: 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; user-select: none; }
    #oct-dp .dp-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    #oct-dp .dp-tit { font-weight: 700; font-size: 0.95rem; text-transform: capitalize; }
    #oct-dp .dp-tit small { color: #94a3b8; font-weight: 600; margin-left: 4px; }
    #oct-dp .dp-nav { width: 30px; height: 28px; border-radius: 6px; border: 1px solid #2a2d3e; background: #0b0d14;
      color: #e5e7eb; cursor: pointer; font-size: 1rem; line-height: 1; }
    #oct-dp .dp-nav:hover { border-color: #f97316; color: #f97316; }
    #oct-dp .dp-grade { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
    #oct-dp .dp-sem { text-align: center; color: #64748b; font-size: 0.72rem; font-weight: 700; padding: 2px 0 4px; }
    #oct-dp .dp-dia { position: relative; height: 32px; border-radius: 7px; border: 1px solid transparent; background: #0b0d14;
      color: #e5e7eb; cursor: pointer; font-size: 0.86rem; font-variant-numeric: tabular-nums; }
    #oct-dp .dp-dia:hover:not(:disabled) { border-color: #f97316; }
    #oct-dp .dp-dia.fds { color: #a5b4c8; }
    #oct-dp .dp-dia.hoje { border-color: #38bdf8; color: #7dd3fc; font-weight: 700; }
    #oct-dp .dp-dia.hoje::after { content: "hoje"; position: absolute; left: 0; right: 0; bottom: 1px;
      font-size: 0.5rem; letter-spacing: .04em; color: #7dd3fc; }
    #oct-dp .dp-dia.sel { background: #f97316; border-color: #f97316; color: #111; font-weight: 800; }
    #oct-dp .dp-dia.sel::after { color: #111; }
    #oct-dp .dp-dia:disabled { opacity: .25; cursor: not-allowed; }
    #oct-dp .dp-vazio { height: 32px; }
    #oct-dp .dp-pe { display: flex; justify-content: space-between; align-items: center; margin-top: 8px;
      padding-top: 8px; border-top: 1px solid #22263a; }
    #oct-dp .dp-pe button { background: none; border: none; color: #7dd3fc; cursor: pointer; font-size: 0.8rem; padding: 4px 6px; }
    #oct-dp .dp-pe button:hover { text-decoration: underline; }
    #oct-dp .dp-pe .dp-escolha { color: #94a3b8; font-size: 0.74rem; }`;
  (document.head || document.documentElement).appendChild(css);

  const p2 = n => String(n).padStart(2, "0");
  const iso = (a, m, d) => `${a}-${p2(m + 1)}-${p2(d)}`;
  const hojeIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
  const br = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";

  let alvo = null, ano = 0, mes = 0, caixa = null;

  function fechar() {
    if (caixa) caixa.remove();
    caixa = null; alvo = null;
  }

  function escolher(valor) {
    if (!alvo) return;
    const inp = alvo;
    inp.value = valor;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    fechar();
    try { inp.focus(); } catch (e) { /* ok */ }
  }

  function desenhar() {
    if (!caixa || !alvo) return;
    const sel = alvo.value || "", hoje = hojeIso();
    const min = alvo.min || "", max = alvo.max || "";
    const primeiro = new Date(ano, mes, 1).getDay();
    const dias = new Date(ano, mes + 1, 0).getDate();
    let h = `<div class="dp-top">
        <button type="button" class="dp-nav" data-nav="-1" title="mês anterior">‹</button>
        <div class="dp-tit">${MESES[mes]}<small>${ano}</small></div>
        <button type="button" class="dp-nav" data-nav="1" title="próximo mês">›</button></div>
      <div class="dp-grade">${SEMANA.map(s => `<div class="dp-sem">${s}</div>`).join("")}`;
    for (let i = 0; i < primeiro; i++) h += `<div class="dp-vazio"></div>`;
    for (let d = 1; d <= dias; d++) {
      const v = iso(ano, mes, d), dow = (primeiro + d - 1) % 7;
      const fora = (min && v < min) || (max && v > max);
      const cls = ["dp-dia", dow === 0 || dow === 6 ? "fds" : "", v === hoje ? "hoje" : "", v === sel ? "sel" : ""]
        .filter(Boolean).join(" ");
      h += `<button type="button" class="${cls}" data-v="${v}"${fora ? " disabled" : ""}>${d}</button>`;
    }
    h += `</div><div class="dp-pe">
        <button type="button" data-acao="limpar">Limpar</button>
        <span class="dp-escolha">${sel ? "escolhido: " + br(sel) : "sem data"}</span>
        <button type="button" data-acao="hoje">Hoje</button></div>`;
    caixa.innerHTML = h;
  }

  function posicionar() {
    if (!caixa || !alvo) return;
    const r = alvo.getBoundingClientRect(), alt = caixa.offsetHeight || 330, larg = 268;
    let top = r.bottom + 4;
    if (top + alt > window.innerHeight - 6) {
      // nao cabe embaixo: abre em cima; se tambem nao couber (tela baixa), encosta no fim da tela
      top = r.top - alt - 4 > 6 ? r.top - alt - 4 : window.innerHeight - alt - 6;
    }
    let left = Math.min(r.left, window.innerWidth - larg - 6);
    caixa.style.top = Math.max(6, top) + "px";
    caixa.style.left = Math.max(6, left) + "px";
  }

  function abrir(inp) {
    if (alvo === inp && caixa) return;
    fechar();
    alvo = inp;
    const base = /^\d{4}-\d{2}-\d{2}$/.test(inp.value || "") ? inp.value : hojeIso();
    ano = +base.slice(0, 4); mes = +base.slice(5, 7) - 1;
    caixa = document.createElement("div");
    caixa.id = "oct-dp";
    // mousedown dentro do calendário não pode tirar o foco nem fechar nada por baixo
    caixa.addEventListener("mousedown", e => e.preventDefault());
    caixa.addEventListener("click", e => {
      e.stopPropagation();
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.nav) {
        mes += Number(b.dataset.nav);
        if (mes < 0) { mes = 11; ano--; } else if (mes > 11) { mes = 0; ano++; }
        desenhar();
        return;
      }
      if (b.dataset.v) return escolher(b.dataset.v);
      if (b.dataset.acao === "hoje") return escolher(hojeIso());
      if (b.dataset.acao === "limpar") return escolher("");
    });
    document.body.appendChild(caixa);
    desenhar();
    posicionar();
  }

  // clique em qualquer campo de data abre o calendário (digitar continua valendo)
  document.addEventListener("click", e => {
    const inp = e.target && e.target.closest ? e.target.closest('input[type="date"]') : null;
    if (inp && !inp.disabled && !inp.readOnly) { abrir(inp); return; }
    if (caixa && !caixa.contains(e.target)) fechar();
  }, true);
  document.addEventListener("keydown", e => {
    if (!caixa) return;
    if (e.key === "Escape") { e.stopPropagation(); fechar(); }
    else if (e.key === "Tab") fechar();
  }, true);
  // a tela rolou ou mudou de tamanho: o calendário acompanha o campo (ou some com ele)
  window.addEventListener("resize", () => posicionar());
  document.addEventListener("scroll", e => {
    if (!caixa || !alvo) return;
    if (!document.contains(alvo)) return fechar();
    if (e.target === caixa || (caixa.contains && caixa.contains(e.target))) return;
    posicionar();
  }, true);
  // o campo saiu da tela (modal fechado): fecha junto
  setInterval(() => { if (caixa && alvo && !document.contains(alvo)) fechar(); }, 500);
})();
