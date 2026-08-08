// ============================================================
// octano-retaguarda  -  NAVEGAÇÃO POR TECLADO + MODAIS ARRASTÁVEIS
// ------------------------------------------------------------
// Pedido do Ronan (08/08/2026), nos dois lados (PDV e retaguarda):
//  1. nas buscas, andar com as setas ↓/↑ e selecionar com Enter, sem mouse;
//  2. poder ARRASTAR o balão que abre, para ver o que está atrás dele.
// No PDV isto vive no core/router.js; aqui é o equivalente do retaguarda.
//
// TECLADO — a busca do retaguarda é a "Busca rápida" das grades (grid.js,
// input og-busca-N). Os "itens" são as LINHAS da tabela com onclick
// (aoClicarLinha): ↓/↑ destacam a linha, Enter abre o cadastro.
// Enter só é interceptado DEPOIS de usar as setas — sem seta, tudo como antes.
//
// ARRASTO — qualquer balão no padrão overlay-de-tela-inteira + caixa (é o
// padrão de todos os modais do retaguarda) arrasta segurando a FAIXA SUPERIOR
// (primeiros 46px, onde fica o título — como numa janela do Windows). Não
// arrasta a partir de input/botão/select, senão clicar num campo perto do topo
// moveria a janela. Handler global: modal novo herda sem código.
// ============================================================

(function () {
  "use strict";

  // ---------- teclado nas grades ----------
  function linhasDe(input) {
    if (!/^og-busca-/.test(input.id || "")) return null;
    const janela = input.closest(".og-janela");
    if (!janela) return null;
    return Array.from(janela.querySelectorAll("tbody tr")).filter(tr => tr.onclick);
  }
  function marcar(input, idx) {
    const linhas = linhasDe(input) || [];
    if (input._navEl) { input._navEl.style.outline = ""; input._navEl.style.outlineOffset = ""; }
    input._navIdx = idx;
    input._navEl = linhas[idx] || null;
    if (input._navEl) {
      input._navEl.style.outline = "2px solid #f97316";
      input._navEl.style.outlineOffset = "-2px";
      input._navEl.scrollIntoView({ block: "nearest" });
    }
  }
  document.addEventListener("keydown", function (e) {
    const input = document.activeElement;
    if (!input || input.tagName !== "INPUT") return;
    const linhas = linhasDe(input);
    if (!linhas || !linhas.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const atual = (typeof input._navIdx === "number") ? input._navIdx : -1;
      marcar(input, e.key === "ArrowDown"
        ? Math.min(atual + 1, linhas.length - 1)
        : Math.max(atual - 1, 0));
    } else if (e.key === "Enter" && typeof input._navIdx === "number" && input._navEl) {
      e.preventDefault();
      e.stopPropagation();
      input._navEl.click();
    } else if (e.key === "Escape" && typeof input._navIdx === "number") {
      marcar(input, -1);
      input._navIdx = null;
    }
  }, true);
  // digitou = a grade re-renderiza (oninput chama _ogRender): marcação caduca
  document.addEventListener("input", function (e) {
    if (e.target && /^og-busca-/.test(e.target.id || "")) {
      e.target._navIdx = null; e.target._navEl = null;
    }
  }, true);

  // ---------- modais arrastáveis ----------
  let box = null, dx = 0, dy = 0;
  document.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest("input,button,select,textarea,a,label,[contenteditable]")) return;
    let el = e.target, alvo = null;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed") {
        const r = el.getBoundingClientRect();
        if (r.width >= innerWidth - 4 && r.height >= innerHeight - 4) {
          alvo = Array.from(el.children).find(c => c.nodeType === 1 && c.contains(e.target)) || null;
        }
        break;   // fixo mas não-overlay (barra, toast): não mexe
      }
      el = el.parentElement;
    }
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    if (e.clientY - r.top > 46) return;          // só a faixa do título
    box = alvo; dx = e.clientX - r.left; dy = e.clientY - r.top;
    box.style.position = "fixed";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.margin = "0";
    e.preventDefault();
  }, true);
  document.addEventListener("pointermove", function (e) {
    if (!box) return;
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.min(Math.max(e.clientX - dx, 8 - w * 0.8), innerWidth - w * 0.2) + "px";
    box.style.top = Math.min(Math.max(e.clientY - dy, 0), innerHeight - 40) + "px";
  }, true);
  document.addEventListener("pointerup", function () { box = null; }, true);
})();
