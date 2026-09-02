// ============================================================
// MÓDULO FATURAR — nota a prazo → fatura (réplica TecnoX, dark)
// Fase A: Títulos em Aberto (fiado agrupado por cliente), lê oct_pdv_notas_prazo.
// Fase B: gera/lista Faturas — usa oct_faturas (acende quando a migração rodar).
// Abas: Títulos em Aberto · Faturas em Aberto · Faturas Liquidadas.
// ============================================================

function _fatEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function _fatMoney(v) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fatData(v) {
  if (!v) return "";
  // "AAAA-MM-DD" sem hora: new Date() le como UTC e o Brasil (UTC-3) volta um
  // dia -- vencimento 31/08 aparecia 30/08. Data pura se formata na mao.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return m[3] + "/" + m[2] + "/" + m[1];
  return new Date(v).toLocaleDateString("pt-BR");
}
// prazo padrão da empresa (dias) — TecnoX define o vencimento no faturamento; aqui
// estimamos por prazo padrão para mostrar vencimento/atraso do título em aberto.
function _fatPrazoDias() { return Number(window._fatPrazo || 30); }
function _fatVencDe(t) {
  if (t && t.vencimento) return new Date(t.vencimento + "T00:00:00");
  const base = t && (t.registrado_em || t.criado_em);
  if (!base) return null;
  const d = new Date(base); d.setDate(d.getDate() + _fatPrazoDias());
  return d;
}
function _fatAtrasoDias(venc) {
  if (!venc) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const v = new Date(venc); v.setHours(0, 0, 0, 0);
  return Math.round((hoje - v) / 86400000);   // >0 vencido
}

async function moduloFaturar() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = "<p style='color:#888;padding:20px'>Carregando...</p>";
  const session = await getSession();
  const { data: perfil } = await sb.from("oct_perfis").select("empresa_id").eq("id", session.user.id).single();
  const eid = (typeof empresaAtiva === "function") ? empresaAtiva() : perfil?.empresa_id;
  if (!eid) { conteudo.innerHTML = "<p style='color:#f44;padding:20px'>Configure sua empresa.</p>"; return; }
  window._fatEid = eid;
  window._fatSel = window._fatSel || new Set();
  window._fatAba = window._fatAba || "abertos";
  conteudo.innerHTML = `
    ${_fatEstilo()}
    <div class="fat-janela">
      <div class="fat-titbar">🧾 Faturamento — Notas a Prazo</div>
      <div class="fat-abas">
        <button class="fat-aba" id="fat-aba-abertos" onclick="fatAba('abertos')">Notas/Títulos em Aberto</button>
        <button class="fat-aba" id="fat-aba-faturas" onclick="fatAba('faturas')">Faturas em Aberto</button>
        <button class="fat-aba" id="fat-aba-liquidadas" onclick="fatAba('liquidadas')">Faturas Liquidadas</button>
      </div>
      <div id="fat-corpo" style="padding:0"></div>
    </div>`;
  fatAba(window._fatAba);
}

function fatAba(aba) {
  window._fatAba = aba;
  clearTimeout(_fatAutoTimer);      // troca de aba cancela a reconferencia
  ["abertos", "faturas", "liquidadas"].forEach(a => {
    const el = document.getElementById("fat-aba-" + a);
    if (el) el.classList.toggle("ativa", a === aba);
  });
  if (aba === "abertos") fatListarTitulos();
  else fatListarFaturas(aba === "liquidadas" ? "liquidada" : "aberta");
}

// ---------- Aba: Títulos em Aberto ----------
async function fatListarTitulos() {
  const corpo = document.getElementById("fat-corpo");
  corpo.innerHTML = "<p style='color:#888;padding:20px'>Carregando títulos...</p>";
  const eid = window._fatEid;
  const [tiRes, cliRes, empRes] = await Promise.all([
    sb.from("oct_pdv_notas_prazo").select("*").eq("empresa_id", eid).order("registrado_em", { ascending: false }),
    sb.from("oct_pessoas").select("id,nome").eq("empresa_id", eid).order("nome"),
    sb.from("oct_empresas").select("prazo_padrao_dias").eq("id", eid).single().then(r => r, () => ({ data: null })),
  ]);
  window._fatPrazo = (empRes.data && empRes.data.prazo_padrao_dias) || 30;
  const todos = (tiRes.data || []);
  const F = window._fatF = window._fatF || { cli: "", forma: "", status: "aberto", de: "", ate: "", busca: "" };
  const ehAberto = t => !t.status || t.status === "aberto";
  // aplica filtros (client-side sobre o carregado)
  let titulos = todos.filter(t => {
    // status
    if (F.status === "aberto" && !ehAberto(t)) return false;
    if (F.status === "vencido") { if (!ehAberto(t)) return false; const a = _fatAtrasoDias(_fatVencDe(t)); if (!(a > 0)) return false; }
    if (F.status === "pago" && t.status !== "pago") return false;
    if (F.status === "parcelado" && t.status !== "parcelado") return false;
    if (F.cli && t.cliente_id !== F.cli) return false;
    if (F.forma) { const fn = (t.forma_nome || "").toLowerCase(); if (fn.indexOf(F.forma.toLowerCase()) < 0) return false; }
    const emi = String(t.registrado_em || t.criado_em || "").slice(0, 10);
    if (F.de && emi && emi < F.de) return false;
    if (F.ate && emi && emi > F.ate) return false;
    if (F.busca) { const b = F.busca.toLowerCase(); const alvo = ((t.cliente_nome || "") + " " + (t.numero_nfe || "")).toLowerCase(); if (alvo.indexOf(b) < 0) return false; }
    return true;
  });
  titulos = _fatOrdenar(titulos, window._fatOrdT, _FAT_ORD_T);
  window._fatTitulos = titulos;
  const filtroCli = F.cli;
  // formas distintas p/ o seletor
  const formasSet = Array.from(new Set(todos.map(t => (t.forma_nome || "").trim()).filter(Boolean))).sort();

  // resumo por cliente (quem deve quanto)
  const porCli = {};
  titulos.forEach(t => {
    const k = t.cliente_id || "_scli";
    if (!porCli[k]) porCli[k] = { id: t.cliente_id || null, nome: t.cliente_nome || "Sem cliente", total: 0, qtd: 0 };
    porCli[k].total += Number(t.valor || 0); porCli[k].qtd++;
  });
  const devedores = Object.values(porCli).sort((a, b) => b.total - a.total);
  const totalGeral = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const selTotal = titulos.filter(t => window._fatSel.has(t.id)).reduce((s, t) => s + Number(t.valor || 0), 0);

  const cliOpts = "<option value=''>Todos os clientes</option>" +
    (cliRes.data || []).map(c => `<option value='${c.id}' ${filtroCli === c.id ? "selected" : ""}>${_fatEsc(c.nome)}</option>`).join("");

  const linhas = titulos.map((t, i) => {
    const venc = _fatVencDe(t);
    const atr = _fatAtrasoDias(venc);
    const vencCor = atr > 0 ? "#f87171" : atr >= -3 ? "#fbbf24" : "#9aa";
    const atrTxt = atr == null ? "—" : atr > 0 ? `<b style="color:#f87171">${atr}d</b>` : atr === 0 ? '<span style="color:#fbbf24">hoje</span>' : "—";
    return `<tr id="fat-tr-${t.id}" data-idx="${i}" onclick="_fatCursor(${i})">
    <td class="fat-td" style="text-align:center"><input type="checkbox" id="fat-chk-${t.id}" ${window._fatSel.has(t.id) ? "checked" : ""} onchange="fatToggle('${t.id}')"></td>
    <td class="fat-td">${_fatData(t.registrado_em || t.criado_em)}</td>
    <td class="fat-td" style="color:${vencCor}">${venc ? _fatData(venc) : "—"}</td>
    <td class="fat-td" style="text-align:center">${atrTxt}</td>
    <td class="fat-td">${_fatEsc(t.cliente_nome) || "<span style='color:#f59e0b'>Sem cliente</span>"}</td>
    <td class="fat-td">${_fatEsc(t.numero_nfe) || "—"}</td>
    <td class="fat-td">${_fatEsc(t.forma_nome) || "Prazo"}</td>
    <td class="fat-td fat-r">${_fatMoney(t.valor)}</td>
    <td class="fat-td" style="white-space:nowrap">
      <button class="fat-abtn" style="background:#166534" onclick="fatLiquidarTitulo('${t.id}')">💰 Receber</button>
      <button class="fat-abtn" style="background:#7c3aed" onclick="fatParcelar('${t.id}')">🔀 Parcelar</button>
      <button class="fat-abtn" style="background:#0e7490" onclick="fatGerarNfConsolidada(['${t.id}'])">🧾 Gerar NF</button>
      <button class="fat-abtn" style="background:#334155" onclick="fatBoleto('${t.id}')">🏦 Boleto</button>
      <button class="fat-abtn" style="background:#1d4ed8" onclick="fatVerTitulo('${t.id}')">👁 Ver</button>
    </td>
  </tr>`;
  }).join("");

  corpo.innerHTML = `
    <div class="fat-filtros" style="flex-wrap:wrap;gap:8px">
      <span>Cliente:</span>
      <select class="fat-sel" onchange="fatSetF('cli',this.value)">${cliOpts}</select>
      <span>Status:</span>
      <select class="fat-sel" onchange="fatSetF('status',this.value)">
        ${[["aberto", "Em aberto"], ["vencido", "Vencidos"], ["pago", "Pagos"], ["parcelado", "Parcelados"], ["todos", "Todos"]].map(s => `<option value="${s[0]}" ${F.status === s[0] ? "selected" : ""}>${s[1]}</option>`).join("")}
      </select>
      <span>Forma:</span>
      <select class="fat-sel" onchange="fatSetF('forma',this.value)">
        <option value="">Todas</option>
        ${formasSet.map(fn => `<option value="${_fatEsc(fn)}" ${F.forma === fn ? "selected" : ""}>${_fatEsc(fn)}</option>`).join("")}
      </select>
      <span>Emissão:</span>
      <input type="date" class="fat-inp" value="${F.de}" onchange="fatSetF('de',this.value)" title="de">
      <input type="date" class="fat-inp" value="${F.ate}" onchange="fatSetF('ate',this.value)" title="até">
      <input class="fat-inp" placeholder="🔍 cliente/NFC-e" value="${_fatEsc(F.busca)}" oninput="fatSetFBusca(this.value)" style="width:150px">
      <button class="fat-btn mini" onclick="fatLimparF()" title="Limpar filtros">🧽</button>
      <span style="margin-left:auto;color:#9aa">${titulos.length} título(s) · <strong style="color:#f59e0b">R$ ${_fatMoney(totalGeral)}</strong></span>
    </div>
    ${devedores.length ? `<div class="fat-cards">
      ${devedores.slice(0, 6).map(d => `<div class="fat-card">
        <div class="fat-card-nome">${_fatEsc(d.nome)}</div>
        <div class="fat-card-val">R$ ${_fatMoney(d.total)}</div>
        <div class="fat-card-qtd">${d.qtd} título(s)${d.id ? ` · <span style="color:#25d366;cursor:pointer" onclick="fatCobrar('${d.id}')">💬 cobrar</span>` : ""}</div></div>`).join("")}
    </div>` : ""}
    <div class="fat-gridwrap"><table class="fat-grid">
      <thead><tr><th style="width:34px;text-align:center"><input type="checkbox" id="fat-chk-todos" title="Marcar/desmarcar todos os títulos da lista" onchange="fatSelTodos(this.checked)"></th>${_fatTh("Emissão","emissao",window._fatOrdT,"fatOrdenarT")}${_fatTh("Vencimento","vencimento",window._fatOrdT,"fatOrdenarT")}${_fatTh("Atraso","atraso",window._fatOrdT,"fatOrdenarT",'style="text-align:center"')}${_fatTh("Cliente","cliente",window._fatOrdT,"fatOrdenarT")}${_fatTh("NFC-e","nfce",window._fatOrdT,"fatOrdenarT")}${_fatTh("Forma","forma",window._fatOrdT,"fatOrdenarT")}${_fatTh("Valor","valor",window._fatOrdT,"fatOrdenarT",'class="fat-r"')}<th style="text-align:center">Ações</th></tr></thead>
      <tbody id="fat-tbody">${linhas || '<tr><td colspan="9" style="padding:22px;text-align:center;color:#666">Nenhum título a prazo em aberto.</td></tr>'}</tbody>
    </table></div>
    <div class="fat-rodape">
      <span>Selecionados: <strong id="fat-selqtd">${window._fatSel.size}</strong> · Total: <strong style="color:#4ade80">R$ <span id="fat-seltot">${_fatMoney(selTotal)}</span></strong>
        <button class="fat-btn mini" style="margin-left:10px" onclick="fatSelTodos(true)">☑ Todos (${titulos.length})</button>
        <button class="fat-btn mini" onclick="fatSelTodos(false)">☐ Nenhum</button>
        <span style="color:#5b6474;font-size:11px;margin-left:10px">↑↓ navega · espaço marca · shift+↑↓ marca em sequência</span></span>
      <span style="display:flex;gap:8px">
        <button class="fat-btn azul" onclick="fatGerarFatura()">💠 Gerar Fatura</button>
        <button class="fat-btn" style="background:#0e7490" onclick="fatGerarNfConsolidada()" title="Consolida os cupons selecionados numa NF-e (modelo 55, CFOP 5929) — HOMOLOGAÇÃO">🧾 Gerar NF (consolidada)</button>
      </span>
    </div>`;

  window._fatCur = null;
  _fatSelSync();
  if (!window._fatTecladoOn) { document.addEventListener("keydown", _fatTeclado); window._fatTecladoOn = true; }
}

function fatToggle(id) {
  if (window._fatSel.has(id)) window._fatSel.delete(id); else window._fatSel.add(id);
  // o toggle agora vem tanto do clique quanto do teclado: quem manda e' o Set,
  // e o checkbox segue ele (antes o checkbox mandava e o teclado nao existia).
  const cx = document.getElementById("fat-chk-" + id);
  if (cx) cx.checked = window._fatSel.has(id);
  _fatSelSync();
}

// rodape + checkbox mestre refletindo a selecao atual
function _fatSelSync() {
  const titulos = window._fatTitulos || [];
  const marcados = titulos.filter(t => window._fatSel.has(t.id));
  const selTotal = marcados.reduce((s, t) => s + Number(t.valor || 0), 0);
  const q = document.getElementById("fat-selqtd"); if (q) q.textContent = window._fatSel.size;
  const tt = document.getElementById("fat-seltot"); if (tt) tt.textContent = _fatMoney(selTotal);
  const mestre = document.getElementById("fat-chk-todos");
  if (mestre) {
    mestre.checked = titulos.length > 0 && marcados.length === titulos.length;
    // meio-termo: o quadradinho cheio diz "tem coisa marcada, mas nao tudo"
    mestre.indeterminate = marcados.length > 0 && marcados.length < titulos.length;
  }
}

// marca/desmarca TUDO o que esta' na lista (respeita o filtro na tela --
// "todos" quer dizer os que voce esta' vendo, nao os 686 do banco)
function fatSelTodos(marcar) {
  const titulos = window._fatTitulos || [];
  titulos.forEach(t => {
    if (marcar) window._fatSel.add(t.id); else window._fatSel.delete(t.id);
    const cx = document.getElementById("fat-chk-" + t.id);
    if (cx) cx.checked = !!marcar;
  });
  _fatSelSync();
}

// ---------- NAVEGACAO POR TECLADO (02/09) ----------
// Faturar um cliente com 19 titulos custava 19 cliques em caixinhas de 13px.
// Agora: seta pra baixo anda, espaco marca, shift+seta marca em sequencia.
function _fatCursor(i) {
  const lista = window._fatTitulos || [];
  if (!lista.length) return;
  i = Math.max(0, Math.min(lista.length - 1, i));
  const ant = document.querySelector("#fat-tbody tr.fat-cursor");
  if (ant) ant.classList.remove("fat-cursor");
  const tr = document.getElementById("fat-tr-" + lista[i].id);
  if (tr) { tr.classList.add("fat-cursor"); tr.scrollIntoView({ block: "nearest" }); }
  window._fatCur = i;
}

function _fatTeclado(e) {
  // so' vale na aba de titulos, nunca com modal aberto nem enquanto se digita
  if (!document.getElementById("fat-tbody")) return;
  if (document.getElementById("fat-modal") || document.getElementById("fat-receber-modal")) return;
  const alvo = e.target || {};
  const tag = String(alvo.tagName || "").toLowerCase();
  // button tambem: com o foco num botao, o espaco pertence ao botao
  if (tag === "input" || tag === "select" || tag === "textarea" || tag === "button" || alvo.isContentEditable) return;
  const lista = window._fatTitulos || [];
  if (!lista.length) return;
  const k = e.key;

  if (k === "ArrowDown" || k === "ArrowUp") {
    e.preventDefault();
    const passo = (k === "ArrowDown") ? 1 : -1;
    const i = (window._fatCur == null)
      ? (passo > 0 ? 0 : lista.length - 1)
      : Math.max(0, Math.min(lista.length - 1, window._fatCur + passo));
    // shift arrasta a selecao junto com o cursor, como em lista de arquivos
    if (e.shiftKey && window._fatCur != null && i !== window._fatCur) fatToggle(lista[i].id);
    _fatCursor(i);
    return;
  }
  if (k === " " || k === "Spacebar" || k === "Space") {
    e.preventDefault();                       // senao a pagina rola
    if (window._fatCur == null) { _fatCursor(0); return; }
    fatToggle(lista[window._fatCur].id);
    return;
  }
  if (k === "Home") { e.preventDefault(); _fatCursor(0); return; }
  if (k === "End")  { e.preventDefault(); _fatCursor(lista.length - 1); return; }
  if ((e.ctrlKey || e.metaKey) && (k === "a" || k === "A")) { e.preventDefault(); fatSelTodos(true); return; }
  if (k === "Escape" && window._fatSel.size) { e.preventDefault(); fatSelTodos(false); }
}

// ---------- filtros ----------
function fatSetF(campo, valor) {
  window._fatF = window._fatF || {};
  window._fatF[campo] = valor;
  window._fatSel = new Set();
  fatListarTitulos();
}
let _fatBuscaTimer = null;
function fatSetFBusca(valor) {
  window._fatF = window._fatF || {};
  window._fatF.busca = valor;
  clearTimeout(_fatBuscaTimer);
  _fatBuscaTimer = setTimeout(() => {
    Promise.resolve(fatListarTitulos()).then(() => {
      const inp = document.querySelector('.fat-filtros input[placeholder^="🔍"]');
      if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} }
    });
  }, 350);
}
function fatLimparF() {
  window._fatF = { cli: "", forma: "", status: "aberto", de: "", ate: "", busca: "" };
  window._fatSel = new Set();
  fatListarTitulos();
}

// ---------- COBRAR cliente (WhatsApp via wa.me + copiar p/ e-mail) ----------
async function fatCobrar(clienteId) {
  const abertos = (window._fatTitulos || []).filter(t => t.cliente_id === clienteId && (!t.status || t.status === "aberto"));
  if (!abertos.length) { alert("Sem títulos em aberto para este cliente."); return; }
  let cli = {};
  try {
    const { data } = await sb.from("oct_pessoas").select("nome,whatsapp,telefone,email").eq("id", clienteId).single();
    cli = data || {};
  } catch (e) { cli = {}; }
  const total = abertos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const emp = (typeof PDV !== "undefined" && PDV.empresa && PDV.empresa.nome) || "Posto";
  const linhasTxt = abertos.map(t => {
    const v = _fatVencDe(t); const a = _fatAtrasoDias(v);
    return `• ${_fatData(t.registrado_em)} — R$ ${_fatMoney(t.valor)}${v ? " (venc " + _fatData(v) + (a > 0 ? ", " + a + "d atraso" : "") + ")" : ""}`;
  }).join("\n");
  const msg = `Olá ${cli.nome || abertos[0].cliente_nome || ""}! 👋\n\n` +
    `Passando para lembrar dos seus títulos em aberto:\n${linhasTxt}\n\n` +
    `*Total em aberto: R$ ${_fatMoney(total)}*\n\nQualquer dúvida, estamos à disposição. Obrigado!`;
  const numDig = String(cli.whatsapp || cli.telefone || "").replace(/\D/g, "");
  const num55 = numDig ? (numDig.length <= 11 ? "55" + numDig : numDig) : "";
  const waUrl = num55 ? `https://wa.me/${num55}?text=${encodeURIComponent(msg)}` : "";
  _fatModal(`
    <div style="background:#13151f;color:#25d366;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>💬 Cobrar — ${_fatEsc(cli.nome || abertos[0].cliente_nome)}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px">
      <div style="color:#9aa;font-size:0.8rem;margin-bottom:8px">${abertos.length} título(s) · <b style="color:#f59e0b">R$ ${_fatMoney(total)}</b>${cli.whatsapp || cli.telefone ? " · 📱 " + _fatEsc(cli.whatsapp || cli.telefone) : " · <span style='color:#f87171'>sem telefone no cadastro</span>"}</div>
      <textarea id="fcob-msg" style="width:100%;height:170px;padding:10px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#e5e7eb;font-size:0.82rem;box-sizing:border-box">${_fatEsc(msg)}</textarea>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        ${waUrl ? `<a href="${waUrl}" target="_blank" class="fat-btn" style="flex:2;background:#25d366;color:#fff;text-decoration:none;text-align:center;padding:11px">💬 Abrir WhatsApp</a>` : `<span style="flex:2;color:#f87171;font-size:0.8rem;align-self:center">Cadastre o WhatsApp do cliente para enviar.</span>`}
        <button class="fat-btn" onclick="fatCobrarCopiar()" style="flex:1">📋 Copiar</button>
        ${cli.email ? `<a href="mailto:${_fatEsc(cli.email)}?subject=Títulos em aberto&body=${encodeURIComponent(msg)}" class="fat-btn" style="flex:1;text-decoration:none;text-align:center;padding:11px">✉ E-mail</a>` : ""}
      </div>
    </div>`);
}
function fatCobrarCopiar() {
  const ta = document.getElementById("fcob-msg");
  if (!ta) return;
  ta.select();
  try { navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand("copy"); }
  alert("Mensagem copiada.");
}

// ============================================================
// GERAR NF CONSOLIDADA (modelo 55, CFOP 5929) — unifica os cupons dos títulos
// selecionados numa única NF-e que REFERENCIA as NFC-e (NFref), sem recolher
// imposto de novo (CST 90). SEMPRE em HOMOLOGAÇÃO até o contador validar.
// Só funciona para cupons DO OCTANO (chave real + itens em oct_pdv_vendas).
// ============================================================
const _FAT_SEFAZ = (typeof SEFAZ_URL !== "undefined" && SEFAZ_URL) || "https://octano-sefaz-production-66d4.up.railway.app";
async function fatGerarNfConsolidada(ids, titulosArg, silencioso) {
  // no lote quem manda no que aparece na tela e' a barra de progresso
  const recusa = (motivo) => {
    if (silencioso) return { ok: false, erro: motivo };
    alert(motivo);
    return { ok: false, erro: motivo };
  };
  let titulos;
  if (titulosArg && titulosArg.length) titulos = titulosArg;
  else {
    const alvo = (ids && ids.length) ? new Set(ids) : window._fatSel;
    titulos = (window._fatTitulos || []).filter(t => alvo.has(t.id));
  }
  if (!titulos.length) return recusa("Selecione os títulos (cupons) a consolidar.");
  const clis = new Set(titulos.map(t => t.cliente_id));
  if (clis.size !== 1 || !titulos[0].cliente_id) return recusa("Selecione títulos de UM mesmo cliente com cadastro (uma NF-e por cliente).");
  const chaves = Array.from(new Set(titulos.map(t => t.chave_nfe).filter(c => /^\d{44}$/.test(String(c || "")))));
  if (!chaves.length) return recusa("Nenhum cupom do Octano (chave de 44 dígitos). Cupom do TecnoX ainda não pode ser consolidado.");

  if (!silencioso) _fatModal(`<div style="padding:26px;text-align:center;color:#9aa"><div style="font-size:1.6rem">📡</div><p style="margin-top:8px">Montando a NF-e consolidada em <b style="color:#f59e0b">HOMOLOGAÇÃO</b>...</p><div id="fnf-msg" style="margin-top:10px;font-size:0.85rem"></div></div>`);
  const msg = () => document.getElementById("fnf-msg");
  try {
    const eid = window._fatEid;
    // empresa (emitente) + cliente (destinatário) + cupons (itens)
    const [empR, cliR, vendasR] = await Promise.all([
      sb.from("oct_empresas").select("*").eq("id", eid).single(),
      sb.from("oct_pessoas").select("*").eq("id", titulos[0].cliente_id).single(),
      sb.from("oct_pdv_vendas").select("numero,nfce_chave,itens,valor_total").eq("empresa_id", eid).in("nfce_chave", chaves),
    ]);
    const emp = empR.data, cli = cliR.data, vendas = vendasR.data || [];
    if (!emp) throw new Error("Empresa não encontrada.");
    if (!emp.cert_path) throw new Error("Certificado não configurado (tela Empresa).");
    const docDest = (cli.documento || "").replace(/\D/g, "");
    if (docDest.length !== 14) throw new Error("Consolidação exige cliente PJ (CNPJ). Este cliente não tem CNPJ.");
    const senha = (typeof getCertSenha === "function") ? getCertSenha() : null;
    if (!senha) throw new Error("Senha do certificado não encontrada (tela Empresa).");

    // itens: 1 linha por item dos cupons, CFOP 5929 + CST 90 (imposto já recolhido)
    const itens = [];
    vendas.forEach(v => (Array.isArray(v.itens) ? v.itens : []).forEach(it => {
      const f = it.fiscal || {};
      const q = Number(it.qtd || 0), unit = Number(it.unit || 0);
      const total = Number(it.total != null ? it.total : q * unit);
      itens.push({
        nItem: itens.length + 1, cProd: it.cod || ("ITEM" + (itens.length + 1)), xProd: it.desc || f.nome || "ITEM",
        cEAN: "SEM GTIN", cEANTrib: "SEM GTIN",
        ncm: f.ncm || "27111910", cest: f.cest || null, cfop: "5929",
        uCom: f.unidade || (q && it.tipo === "abastecimento" ? "L" : "UN"), uTrib: f.unidade || "UN",
        qCom: q || 1, vUnCom: unit, vProd: total,
        origem: f.origem || "0",
        cst_icms: "90", aliq_icms: 0, aliq_icms_ad_rem: 0,
        cst_pis: "49", cst_cofins: "49", aliq_pis: 0, aliq_cofins: 0,
        // NF-e consolidada (CFOP 5929) referencia NFC-e já emitidas: são linhas de
        // faturamento, NÃO dispensa de combustível — sem grupo <comb>/encerrante/cProdANP.
        ind_combustivel: "N", ind_monofasico: "N", cod_anp: null,
      });
    }));
    if (!itens.length) throw new Error("Os cupons selecionados não têm itens em oct_pdv_vendas.");

    const empresa = {
      cnpj: (emp.cnpj || "").replace(/\D/g, ""), nome: emp.nome, ie: (emp.ie || "").replace(/\D/g, ""),
      logradouro: emp.endereco || "", numero: "S/N", bairro: emp.bairro || "CENTRO",
      municipio: emp.cidade || "", c_mun: emp.c_mun || "3123205", uf: emp.uf || "MG",
      cep: (emp.cep || "").replace(/\D/g, ""), crt: emp.regime_tributario === "simples" ? "1" : "3",
    };
    // Contribuinte de ICMS? Se o cliente tem IE, indIEDest=1 + IE (senão a SEFAZ
    // rejeita CST x Não Contribuinte — rejeição 508). Cliente de frota é contribuinte.
    const cliIE = (cli.ie || "").replace(/\D/g, "");
    const contribIE = !!cliIE && cliIE !== "0" && !/isent/i.test(cli.ie || "");
    const destinatario = {
      cnpj_cpf: docDest, documento: docDest, nome: cli.nome || cli.razao_social || "CLIENTE",
      logradouro: cli.endereco || "SEM ENDERECO", numero: cli.num_endereco || "S/N", bairro: cli.bairro || "CENTRO",
      municipio: cli.cidade || "", c_mun: emp.c_mun || "3123205", uf: cli.uf || "MG",
      cep: (cli.cep || "").replace(/\D/g, ""),
      ie: contribIE ? cliIE : "", ind_ie: contribIE ? "1" : "9",
    };
    // número da NF-e 55 (série própria de faturamento)
    const { data: ult } = await sb.from("oct_nfce").select("numero").eq("empresa_id", eid).eq("modelo", "55").order("numero", { ascending: false }).limit(1);
    const numero = ((ult && ult[0] && Number(ult[0].numero)) || 0) + 1;

    const nota = {
      numero, serie: Number(emp.nfe_serie || 1), modelo: "55",
      natureza_op: "FATURAMENTO DE CUPONS FISCAIS", mod_frete: "9",
      emitente: empresa, destinatario, itens, refs: chaves,
    };
    if (msg()) msg().textContent = `Consolidando ${chaves.length} cupom(ns), ${itens.length} item(ns)...`;

    // carrega o certificado (mesmo padrão do nfce.js)
    const { data: cb } = await sb.storage.from("octano-certs").download(emp.cert_path);
    const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(await cb.arrayBuffer())));

    const resp = await fetch(`${_FAT_SEFAZ}/emitir`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cert_base64: b64, cert_senha: senha, ambiente: "homologacao", nota }),
    });
    const r = await resp.json();
    if (r.ok) {
      window._fatUltimoDanfe = r.nfe_proc || null;  // p/ imprimir a DANFE agora
      // persiste a NF-e autorizada em oct_nfce (histórico + reimpressão)
      try {
        const valorNota = itens.reduce((s, i) => s + Number(i.vProd || 0), 0);
        await sb.from("oct_nfce").insert({
          empresa_id: eid, numero, serie: Number(emp.nfe_serie || 1), modelo: "55",
          status: "autorizada", ambiente: "homologacao", valor_total: valorNota,
          cpf_consumidor: docDest, chave_nfe: r.chave, protocolo: r.protocolo,
          xml_autorizado: r.nfe_proc || null, data_emissao: new Date().toISOString(),
        });
      } catch (e) { /* não bloqueia a impressão */ }
      const btnDanfe = r.nfe_proc ? `<button class="fat-btn" onclick="fatImprimirDanfe()" style="background:#2a5a8a;margin-right:8px">📄 Imprimir DANFE</button>` : "";
      if (silencioso) return { ok: true, chave: r.chave, numero };
      if (msg()) msg().innerHTML = `<span style="color:#7ee2a0">✅ NF-e consolidada autorizada em HOMOLOGAÇÃO</span><br><span style="font-size:0.72rem;color:#667;word-break:break-all">chave ${r.chave || "—"}<br>protocolo ${r.protocolo || "—"}</span><br><br>${btnDanfe}<button class="fat-btn" onclick="_fatFechaModal()">Fechar</button><p style="font-size:0.74rem;color:#9aa;margin-top:10px">Envie esta NF-e ao contador para validar CFOP/CST/NFref antes de liberar em produção.</p>`;
    } else {
      // SEFAZ devolve cstat_nfe/cstat_lote + xmotivo; aviso_xsd quando falha no schema.
      const cstat = r.cstat_nfe || r.cstat_lote || "";
      const xsd = r.aviso_xsd ? (Array.isArray(r.aviso_xsd) ? r.aviso_xsd.join(" · ") : r.aviso_xsd) : "";
      const motivo = xsd || r.xmotivo || r.erro || r.motivo || JSON.stringify(r).slice(0, 300);
      if (silencioso) return { ok: false, erro: (cstat ? cstat + ": " : "") + motivo };
      if (msg()) msg().innerHTML = `<span style="color:#f87171;word-break:break-word;display:block">❌ Rejeitada${cstat ? " (" + _fatEsc(cstat) + ")" : ""}:<br>${_fatEsc(motivo)}</span><br><button class="fat-btn" onclick="_fatFechaModal()">Fechar</button>`;
    }
  } catch (e) {
    if (silencioso) return { ok: false, erro: String(e.message || e) };
    if (msg()) msg().innerHTML = `<span style="color:#f87171">Erro: ${_fatEsc(e.message || e)}</span><br><br><button class="fat-btn" onclick="_fatFechaModal()">Fechar</button>`;
  }
}

// ---------- IMPRIMIR DANFE (reaproveita o /danfe do sefaz) ----------
async function fatImprimirDanfe(xmlOverride) {
  const xml = xmlOverride || window._fatUltimoDanfe;
  if (!xml) { alert("XML autorizado indisponível para gerar a DANFE."); return; }
  try {
    const resp = await fetch(`${_FAT_SEFAZ}/danfe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml }),
    });
    if (!resp.ok) {
      let det = ""; try { det = (await resp.json()).erro || ""; } catch (e) {}
      alert("Erro ao gerar DANFE. " + det); return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");   // abre o PDF em nova aba: visualizar / imprimir (Ctrl+P)
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { alert("Erro ao imprimir DANFE: " + (e.message || e)); }
}

// reimprime a DANFE de uma NF-e consolidada já salva (pela chave)
async function fatReimprimirDanfe(chave) {
  const { data } = await sb.from("oct_nfce").select("xml_autorizado").eq("empresa_id", window._fatEid).eq("chave_nfe", chave).limit(1);
  if (!data || !data[0] || !data[0].xml_autorizado) { alert("XML autorizado não encontrado para esta nota."); return; }
  fatImprimirDanfe(data[0].xml_autorizado);
}

// ---------- BOLETO (placeholder — pronto p/ integração bancária) ----------
// ---------- BOLETO DA FATURA (01/09) ----------
// Fluxo: a tela grava 'pendente' em oct_boletos; o worker do gateway Sicoob
// registra no banco e devolve linha digitavel/codigo de barras. A tela fica
// olhando ate' sair do 'pendente'.
const _FAT_BOL_CAMPOS = [
  ["documento", "CPF/CNPJ"], ["endereco", "endereço"], ["bairro", "bairro"],
  ["cidade", "cidade"], ["cep", "CEP"], ["uf", "UF"],
];

function _fatBolFaltando(p) {
  if (!p) return ["cadastro do cliente não encontrado"];
  return _FAT_BOL_CAMPOS.filter(([c]) => !String(p[c] || "").trim()).map(([, r]) => r);
}

async function fatBoleto(id) {
  _fatModal(`<div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0">
      🏦 Boleto</div><div style="padding:22px;color:#9aa">Carregando...</div>`);
  // o botao aparece na lista de TITULOS e na de FATURAS: aceita os dois
  let fat = null;
  try {
    const r = await sb.from("oct_faturas").select("*").eq("id", id).maybeSingle();
    fat = r.data || null;
  } catch (e) { /* tabela pode nao existir ainda */ }
  if (!fat) {
    _fatBolCaixa(`<p style="color:#f59e0b">Boleto é emitido da <b>fatura</b>, não do título solto.</p>
      <p style="font-size:0.8rem;color:#889;margin-top:8px">Selecione os títulos do cliente na aba
      <b>Notas/Títulos em Aberto</b>, clique em <b>Gerar fatura</b> e emita o boleto por lá — assim o
      boleto cobre tudo o que o cliente deve, num documento só.</p>`);
    return;
  }

  // ja' existe boleto para esta fatura?
  let jaTem = null;
  try {
    const r = await sb.from("oct_boletos").select("*").eq("fatura_id", id)
      .order("id", { ascending: false }).limit(1);
    jaTem = (r.data || [])[0] || null;
    if (r.error) throw r.error;
  } catch (e) {
    _fatBolCaixa(`<p style="color:#f87171">A tabela de boletos ainda não existe.</p>
      <p style="font-size:0.8rem;color:#889;margin-top:8px">Rode <code>repo/sql/SQL-BOLETOS.sql</code>
      no Supabase e tente de novo.</p>`);
    return;
  }
  if (jaTem && ["registrado", "liquidado"].includes(jaTem.status)) {
    _fatBolMostrar(jaTem);
    return;
  }

  // cadastro do cliente: o Sicoob recusa sem endereco/CPF. Conferir aqui evita
  // uma ida ao banco e diz ao operador o que preencher.
  const { data: pes } = await sb.from("oct_pessoas").select("*").eq("id", fat.cliente_id).maybeSingle();
  const faltam = _fatBolFaltando(pes);
  if (faltam.length) {
    _fatBolCaixa(`<p style="color:#f59e0b">Não dá para emitir: o cadastro de
      <b>${_fatEsc(fat.cliente_nome || "")}</b> está incompleto.</p>
      <p style="margin-top:10px">Falta: <b style="color:#f87171">${faltam.join(", ")}</b></p>
      <p style="font-size:0.8rem;color:#889;margin-top:10px">Complete em <b>Pessoas</b> e volte aqui.
      O banco recusa o registro sem esses campos.</p>`);
    return;
  }
  if (!fat.vencimento) {
    _fatBolCaixa(`<p style="color:#f59e0b">A fatura está sem vencimento — o boleto precisa de uma data.</p>`);
    return;
  }

  // o banco cobra o LIQUIDO: emitir o bruto seria cobrar o desconto de volta
  const valorCobrar = _fatLiquido(fat);
  if (!confirm(`Emitir boleto de R$ ${_fatMoney(valorCobrar)} para ${fat.cliente_nome}?\n` +
               `Vencimento: ${_fatData(fat.vencimento)}`)) { _fatFechaModal(); return; }

  // enfileira (o worker do gateway e' quem fala com o Sicoob)
  const pedido = {
    empresa_id: fat.empresa_id, fatura_id: fat.id, cliente_id: fat.cliente_id,
    cliente_nome: fat.cliente_nome, valor: valorCobrar, vencimento: fat.vencimento,
    status: "pendente", criado_por: "retaguarda",
  };
  const { data: nova, error } = await sb.from("oct_boletos").insert(pedido).select("id").single();
  if (error) { _fatBolCaixa(`<p style="color:#f87171">Erro ao enfileirar: ${_fatEsc(error.message)}</p>`); return; }

  _fatBolCaixa(`<p>Registrando no Sicoob...</p>
    <p style="font-size:0.8rem;color:#889;margin-top:8px">O boleto é registrado no banco antes de
    existir — sem registro ele não é pago nem baixa.</p>`);
  const achou = await _fatBolEsperar(nova.id);
  if (achou) _fatBolMostrar(achou);
  _fatRecarregar();          // o status da linha muda no ato, sem F5
}

// olha a linha ate' sair de 'pendente' (o worker roda a cada ~20s)
async function _fatBolEsperar(boletoId) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await sb.from("oct_boletos").select("*").eq("id", boletoId).maybeSingle();
    if (data && data.status !== "pendente") return data;
  }
  _fatBolCaixa(`<p style="color:#f59e0b">O registro ainda não voltou.</p>
    <p style="font-size:0.8rem;color:#889;margin-top:8px">O pedido ficou na fila. Se o worker de
    boletos (<code>BOLETO_WORKER=1</code> no Railway) não estiver ligado, ele não sai de "pendente".</p>`);
  return null;
}

function _fatBolMostrar(b) {
  if (b.status === "simulado") {
    const p = (b.resposta && b.resposta.payload) || {};
    _fatBolCaixa(`<p style="color:#f0b45c;font-weight:600">🧪 Simulação (COBRANCA_DRY_RUN ligado)</p>
      <p style="font-size:0.8rem;color:#889;margin-top:6px">Nada foi enviado ao banco. Este é o
      conteúdo exato que o Sicoob receberia:</p>
      <pre style="text-align:left;background:#0f1520;padding:10px;border-radius:6px;font-size:0.7rem;
        white-space:pre-wrap;color:#c8d0da;margin-top:10px;max-height:300px;overflow:auto">${
        _fatEsc(JSON.stringify(p, null, 2))}</pre>`);
    return;
  }
  if (b.status === "erro") {
    _fatBolCaixa(`<p style="color:#f87171">O banco não registrou o boleto.</p>
      <pre style="text-align:left;background:#0f1520;padding:10px;border-radius:6px;font-size:0.72rem;
        white-space:pre-wrap;color:#c8d0da;margin-top:10px">${_fatEsc(b.erro || "sem detalhe")}</pre>`);
    return;
  }
  const linha = b.linha_digitavel || "—";
  window._fatBolAtual = b;
  _fatBolCaixa(`
    <p style="color:#7ee2a0;font-weight:600">✔ Boleto registrado no Sicoob</p>
    <table style="width:100%;margin-top:12px;font-size:0.85rem;text-align:left">
      <tr><td style="color:#889;padding:3px 0">Cliente</td><td>${_fatEsc(b.cliente_nome || "")}</td></tr>
      <tr><td style="color:#889;padding:3px 0">Valor</td><td><b>R$ ${_fatMoney(b.valor)}</b></td></tr>
      <tr><td style="color:#889;padding:3px 0">Vencimento</td><td>${_fatData(b.vencimento)}</td></tr>
      <tr><td style="color:#889;padding:3px 0">Nosso número</td><td>${_fatEsc(b.nosso_numero || "—")}</td></tr>
    </table>
    <p style="color:#889;font-size:0.75rem;margin:12px 0 4px">Linha digitável</p>
    <div style="background:#0f1520;padding:10px;border-radius:6px;font-family:monospace;
      font-size:0.82rem;word-break:break-all;color:#e8eef5">${_fatEsc(linha)}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="fat-btn" onclick="navigator.clipboard.writeText('${_fatEsc(linha)}')">
        📋 Copiar linha digitável</button>
      <button class="fat-btn azul" style="flex:1" onclick="fatBoletoImprimir()">
        🖨 Imprimir boleto</button>
    </div>`);
}

// ---------- IMPRESSÃO DO BOLETO (02/09) ----------
// Mesmo layout do modelo do posto: RECIBO DO PAGADOR em cima, linha de corte,
// FICHA DE COMPENSAÇÃO embaixo. Abre em janela própria para a impressão sair
// limpa, sem o menu do sistema em volta.
const _I25 = { "0": "00110", "1": "10001", "2": "01001", "3": "11000", "4": "00101",
               "5": "10100", "6": "01100", "7": "00011", "8": "10010", "9": "01010" };

// Interleaved 2 of 5 (FEBRABAN, 44 dígitos): barras finas e largas 1:3.
function _fatBarras(codigo) {
  if (!codigo || codigo.length !== 44) return "";
  let fluxo = "0000";                                   // start
  for (let i = 0; i < codigo.length; i += 2) {
    const a = _I25[codigo[i]], b = _I25[codigo[i + 1]];
    if (!a || !b) return "";
    for (let j = 0; j < 5; j++) fluxo += a[j] + b[j];   // barra + espaço
  }
  fluxo += "100";                                       // stop
  let html = "";
  for (let i = 0; i < fluxo.length; i++) {
    const larg = (fluxo[i] === "1" ? 3 : 1);            // múltiplos da barra fina
    const cor = (i % 2 === 0) ? "#000" : "transparent"; // par = barra preta
    html += `<i style="width:${larg}px;background:${cor}"></i>`;
  }
  return html;
}

function _fatLdFmt(ld) {
  ld = String(ld || "").replace(/\D/g, "");
  if (ld.length !== 47) return ld;
  return `${ld.slice(0,5)}.${ld.slice(5,10)}  ${ld.slice(10,15)}.${ld.slice(15,21)}  ` +
         `${ld.slice(21,26)}.${ld.slice(26,32)}  ${ld.slice(32,33)}  ${ld.slice(33)}`;
}

// nosso número: posições 34-41 do campo livre. É o que o banco gravou —
// calcular o DV por conta própria deu resultado diferente do boleto real.
function _fatNossoNumero(cb, fallback) {
  cb = String(cb || "");
  if (cb.length === 44) {
    const nn = cb.slice(19).slice(14, 22);
    if (/^\d+$/.test(nn)) return String(parseInt(nn, 10));
  }
  return String(fallback || "");
}

async function fatBoletoImprimir() {
  const b = window._fatBolAtual;
  if (!b) { alert("Nenhum boleto carregado."); return; }
  const d = (b.resposta && (b.resposta.resultado || b.resposta)) || {};
  const [{ data: emp }, { data: conta }] = await Promise.all([
    sb.from("oct_empresas").select("nome,cnpj,endereco,cidade,uf,cep")
      .eq("id", b.empresa_id).maybeSingle(),
    sb.from("oct_sicoob_contas").select("numero_cliente,cobranca_modalidade,agencia")
      .eq("empresa_id", b.empresa_id).maybeSingle(),
  ]);
  const w = window.open("", "_blank", "width=900,height=1150");
  if (!w) { alert("O navegador bloqueou a janela de impressão. Libere o pop-up e tente de novo."); return; }
  w.document.write(_fatBoletoHtml(b, d, emp || {}, conta || {}));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

function _fatBoletoHtml(b, d, emp, conta) {
  const E = _fatEsc;
  const pag = d.pagador || {};
  const coop = String(conta.agencia || "4208");
  const coopBen = `${coop}/${conta.numero_cliente || ""}`;
  const nn = _fatNossoNumero(d.codigoBarras, d.nossoNumero || b.nosso_numero);
  const venc = _fatData(b.vencimento || d.dataVencimento);
  const emiss = _fatData(d.dataEmissao || b.criado_em);
  const val = _fatMoney(b.valor != null ? b.valor : d.valor);
  const instr = (d.mensagensInstrucao && d.mensagensInstrucao.length)
    ? d.mensagensInstrucao : ["Não cobrar encargos por atraso.", "Não conceder desconto."];
  const cx = (rot, v, cls) => `<td class="cx ${cls || ""}"><b class="rot">${E(rot)}</b>
      <span class="val">${v == null ? "" : E(v)}</span></td>`;
  const logo = `<div class="logo"><svg viewBox="0 0 26 20" width="26" height="20">
      <polygon points="0,0 17,0 8.5,20" fill="#00ae9d"/>
      <polygon points="8.5,0 17,0 12.7,10" fill="#ffc72c"/></svg><span>SICOOB</span></div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Boleto ${E(nn)} — ${E(b.cliente_nome || "")}</title>
<style>
  @page { size: A4; margin: 10mm 8mm; }
  body { font: 11px Arial, Helvetica, sans-serif; color:#000; margin:0; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td.cx { border:1px solid #000; padding:1px 3px 3px; vertical-align:top; height:26px; }
  .rot { font-size:8px; font-weight:normal; display:block; line-height:11px; }
  .val { font-size:11px; font-weight:bold; display:block; text-align:right; padding-top:2px; }
  .val.esq { text-align:left; }
  .val.cen { text-align:center; }
  .cinza { background:#e9e9e9; }
  .semborda { border:0; }
  .logo { display:flex; align-items:center; gap:6px; margin:2px 0 4px; }
  .logo span { font-size:22px; font-weight:bold; color:#00766a; letter-spacing:.5px; }
  .topo { display:flex; align-items:center; gap:10px; margin:6px 0 4px; }
  .banco { font-size:20px; font-weight:bold; padding:0 10px;
           border-left:2px solid #000; border-right:2px solid #000; }
  .ld { flex:1; text-align:right; font-size:15px; font-weight:bold; letter-spacing:.3px; }
  .corte { border-top:1px dashed #777; margin:10px 0 6px; }
  .recibo-rod { display:flex; gap:10px; align-items:flex-start; margin-top:4px; }
  .recibo-rod .txt { background:#e9e9e9; padding:5px 6px; font-size:8.5px;
                     line-height:12px; width:58%; }
  .recibo-rod .aut { flex:1; text-align:right; font-size:9px; padding-top:4px;
                     border-left:1px solid #666; border-right:1px solid #666; min-height:34px; }
  .barras { margin-top:8px; height:44px; display:flex; align-items:flex-end; }
  .barras i { display:inline-block; height:44px; }
  .rodape { display:flex; justify-content:space-between; align-items:flex-end; }
  .peq { font-size:7.5px; line-height:10px; color:#000; }
  .lin { font-size:10.5px; font-weight:bold; line-height:14px; }
  .titulo { text-align:right; font-weight:bold; font-size:12px; margin-bottom:2px; }
  @media print { .naoimprime { display:none; } }
</style></head><body>

<div class="naoimprime" style="text-align:right;margin-bottom:6px">
  <button onclick="window.print()" style="padding:6px 14px;font-size:13px;cursor:pointer">🖨 Imprimir</button>
</div>

<div class="titulo">RECIBO DO PAGADOR</div>
${logo}
<table>
  <tr>
    <td class="cx" rowspan="4" colspan="4"><b class="rot">Beneficiário</b>
      <div class="lin">${E(emp.nome || "")} &nbsp;&nbsp; ${E(emp.cnpj || "")}</div>
      <div class="lin">${E(emp.endereco || "")}</div>
      <div class="lin">${E(emp.cidade || "")} - ${E(emp.uf || "")} &nbsp;&nbsp; ${E(emp.cep || "")}</div>
    </td>
    ${cx("Vencimento", venc)}${cx("Valor do Documento", val)}
  </tr>
  <tr>${cx("(+) Outros acréscimos", "")}${cx("(+) Mora / Multa", "")}</tr>
  <tr>${cx("(-) Desconto / Abatimento", "")}${cx("(-) Outras deduções", "")}</tr>
  <tr>${cx("Data de Emissão", emiss)}${cx("(=) Valor cobrado", "")}</tr>
  <tr>
    <td class="cx" colspan="4"><b class="rot">Instruções (texto de responsabilidade do beneficiário)</b>
      ${instr.map(t => `<div class="lin">${E(t)}</div>`).join("")}</td>
    <td class="cx" colspan="2"><b class="rot">Coop Contr/Cód. Beneficiário</b>
      <span class="val">${E(coopBen)}</span>
      <b class="rot" style="margin-top:4px">Nosso Número</b><span class="val">${E(nn)}</span></td>
  </tr>
</table>

<div style="font-size:8px;margin:6px 0 1px">Dados do Pagador</div>
<table>
  <tr>${cx("Nome do pagador", null)}<td class="cx" style="width:70px"><b class="rot">Número do Documento</b>
      <span class="val">${E(d.seuNumero || "")}</span></td></tr>
</table>
<table>
  <tr><td class="cx"><b class="rot">Nome do pagador</b>
    <span class="val esq">${E(pag.nome || b.cliente_nome || "")}</span></td></tr>
  <tr><td class="cx"><b class="rot">Endereço</b>
    <span class="val esq">${E(pag.endereco || "")}</span></td></tr>
  <tr><td class="cx"><b class="rot">Bairro / Distrito</b>
    <span class="val esq">${E(pag.bairro || "")}</span></td></tr>
</table>
<table>
  <tr>
    <td class="cx"><b class="rot">Munícipio</b><span class="val esq">${E(pag.cidade || "")}</span></td>
    <td class="cx" style="width:60px"><b class="rot">UF</b><span class="val cen">${E(pag.uf || "")}</span></td>
    <td class="cx" style="width:110px"><b class="rot">CEP</b><span class="val">${E(pag.cep || "")}</span></td>
  </tr>
  <tr><td class="cx" colspan="3" style="height:34px"><b class="rot">Mensagem Pagador</b></td></tr>
</table>

<div class="recibo-rod">
  <div class="txt">Este recibo somente terá validade com a autenticação mecânica ou acompanhado do
    recibo de pagamento emitido pelo Banco. Recebimento através do cheque n.________ do
    banco________ Esta quitação só terá validade após o pagamento do cheque pelo banco pagador.</div>
  <div class="aut">Autenticação mecânica &nbsp;-&nbsp; <b>Recibo do pagador</b></div>
</div>

<div class="corte"></div>

<div class="topo">${logo}<span class="banco">756</span>
  <span class="ld">${E(_fatLdFmt(d.linhaDigitavel || b.linha_digitavel))}</span></div>
<table>
  <tr>
    <td class="cx" colspan="5"><b class="rot">Local de pagamento</b>
      <span class="val esq">PAGAVEL PREFERENCIALMENTE NO SICOOB</span></td>
    <td class="cx cinza" style="width:150px"><b class="rot">Vencimento</b>
      <span class="val">${E(venc)}</span></td>
  </tr>
  <tr>
    <td class="cx" colspan="5"><b class="rot">Beneficiário</b>
      <span class="val esq">${E(emp.nome || "")} &nbsp;&nbsp; ${E(emp.cnpj || "")}</span></td>
    <td class="cx"><b class="rot">Cooperativa contratante/Cód. Beneficiário</b>
      <span class="val">${E(coopBen)}</span></td>
  </tr>
  <tr>
    ${cx("Data do documento", emiss, "")}${cx("N. documento", d.seuNumero || "")}
    ${cx("Espécie", d.codigoEspecieDocumento || "DM")}${cx("Aceite", "N")}
    ${cx("Data processamento", emiss)}
    <td class="cx"><b class="rot">Nosso número</b><span class="val">${E(nn)}</span></td>
  </tr>
  <tr>
    <td class="cx cinza"><b class="rot">Uso do Banco</b></td>
    ${cx("Carteira", String(conta.cobranca_modalidade || 1))}${cx("Espécie", "R$")}
    ${cx("Quantidade", "")}${cx("Valor", "")}
    <td class="cx"><b class="rot">Valor documento</b><span class="val">${E(val)}</span></td>
  </tr>
  <tr>
    <td class="cx" colspan="5" rowspan="5" style="height:96px">
      <b class="rot">Instruções (texto de responsabilidade do beneficiário)</b>
      ${instr.map(t => `<div class="lin">${E(t)}</div>`).join("")}
      <div class="peq" style="margin-top:34px">
        EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB<br>
        COOPERATIVA CONTRATANTE ${E(coop)} SICOOB UFVCREDI</div></td>
    ${cx("(-) Desconto / Abatimento", "")}
  </tr>
  <tr>${cx("(-) Outras deduções", "")}</tr>
  <tr>${cx("(+) Mora / Multa", "")}</tr>
  <tr>${cx("(+) Outros acréscimos", "")}</tr>
  <tr>${cx("(=) Valor cobrado", "")}</tr>
  <tr>
    <td class="cx" colspan="5" style="height:64px"><b class="rot">Pagador</b>
      <div class="lin">${E(pag.nome || b.cliente_nome || "")} &nbsp;&nbsp; ${E(pag.numeroCpfCnpj || "")}</div>
      <div class="lin">${E(pag.endereco || "")}</div>
      <div class="lin">${E(pag.bairro || "")}</div>
      <div class="lin">${E(pag.cidade || "")} - ${E(pag.uf || "")} &nbsp;&nbsp; ${E(pag.cep || "")}</div></td>
    <td class="cx"></td>
  </tr>
  <tr><td class="cx" colspan="6" style="height:20px"><b class="rot">Beneficiário final</b></td></tr>
</table>

<div class="rodape">
  <div class="barras">${_fatBarras(d.codigoBarras || b.codigo_barras)}</div>
  <div style="font-size:9px;padding-bottom:4px">Autenticação mecânica &nbsp;-&nbsp;
    <b>Ficha de compensação</b></div>
</div>
</body></html>`;
}

function _fatBolCaixa(html) {
  _fatModal(`<div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;
      border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>🏦 Boleto</span><span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:22px;color:#cdd6e0">${html}
      <div style="margin-top:16px"><button class="fat-btn" onclick="_fatFechaModal()">Fechar</button></div>
    </div>`);
}

// ---------- DETALHES DA FATURA (os títulos que a compõem, modelo TecnoX) ----------
async function fatFaturaDetalhes(faturaId) {
  const { data: ts } = await sb.from("oct_pdv_notas_prazo").select("*")
    .eq("empresa_id", window._fatEid).eq("fatura_id", faturaId).order("registrado_em");
  const titulos = ts || [];
  const tot = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const linhas = titulos.map(t => `<tr style="border-bottom:1px solid #1c2130">
    <td style="padding:5px 7px">${_fatData(t.registrado_em)}</td>
    <td style="padding:5px 7px">${_fatEsc(t.numero_nfe) || "—"}</td>
    <td style="padding:5px 7px">${_fatEsc(t.forma_nome) || "Prazo"}</td>
    <td style="padding:5px 7px;text-align:right;color:#fff">${_fatMoney(t.valor)}</td></tr>`).join("");
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>👁 Detalhes da Fatura — ${titulos.length} título(s)</span><span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px">
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;color:#cdd6e0">
        <thead><tr style="background:#1a1d2e;color:#9fb0c4;text-align:left"><th style="padding:6px 7px">Emissão</th><th style="padding:6px 7px">NFC-e</th><th style="padding:6px 7px">Forma</th><th style="padding:6px 7px;text-align:right">Valor</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="4" style="padding:14px;text-align:center;color:#667">Sem títulos.</td></tr>'}</tbody>
        <tfoot><tr style="border-top:2px solid #2a2d3e"><td colspan="3" style="padding:7px;font-weight:700">Total</td><td style="padding:7px;text-align:right;font-weight:700;color:#f59e0b">${_fatMoney(tot)}</td></tr></tfoot>
      </table>
      <div style="text-align:right;margin-top:12px"><button class="fat-btn" onclick="_fatFechaModal()">Fechar</button></div>
    </div>`);
}

// Gerar NF consolidada a partir de uma FATURA (usa os títulos dela)
async function fatGerarNfFatura(faturaId) {
  const { data: ts } = await sb.from("oct_pdv_notas_prazo").select("*")
    .eq("empresa_id", window._fatEid).eq("fatura_id", faturaId);
  if (!ts || !ts.length) { alert("Fatura sem títulos."); return; }
  fatGerarNfConsolidada(null, ts);
}

// ================= ANEXAR NF-e (arquivo na nuvem) — 02/09 =================
// Enquanto a emissao propria nao liga, a NF-e da fatura e' a que o TecnoX emitiu.
// O operador anexa o XML aqui; o sistema NAO pede os dados digitados -- le' tudo
// do proprio arquivo (chave, numero, serie, emissao, valor). Digitar abriria a
// porta para a fatura dizer um numero e o arquivo dizer outro.
//
// O arquivo vai para o bucket octano-documentos (privado). Isso resolve o achado
// que motivou tudo: das 800 notas do Florestal so' 49 tem xml_autorizado -- 94%
// dos documentos fiscais so' existem no disco do posto, e a guarda legal e' 5 anos.
//
// Quando a emissao passar a ser nossa, os mesmos campos recebem o documento que o
// Octano gerar (nfe_origem = 'octano'): a tela e o envio nao mudam.
const _FAT_BUCKET = "octano-documentos";

function _fatNfeLerXml(txt) {
  let doc;
  try { doc = new DOMParser().parseFromString(txt, "application/xml"); }
  catch (e) { return { erro: "não consegui abrir o arquivo como XML" }; }
  if (doc.getElementsByTagName("parsererror").length) return { erro: "o arquivo não é um XML válido" };

  const infs = doc.getElementsByTagName("infNFe");
  if (!infs.length) return { erro: "não é um XML de nota fiscal (não encontrei infNFe)" };
  if (infs.length > 1) return { erro: `o arquivo tem ${infs.length} notas (lote). Anexe uma nota por fatura.` };
  const inf = infs[0];
  const T = (pai, tag) => {
    if (!pai) return "";
    const e = pai.getElementsByTagName(tag)[0];
    return e ? String(e.textContent || "").trim() : "";
  };
  const chave = String(inf.getAttribute("Id") || "").replace(/\D/g, "");
  if (chave.length !== 44) return { erro: "a chave da nota não tem 44 dígitos" };

  const ide  = inf.getElementsByTagName("ide")[0];
  const emit = inf.getElementsByTagName("emit")[0];
  const dest = inf.getElementsByTagName("dest")[0];
  const tot  = inf.getElementsByTagName("ICMSTot")[0];
  const dh   = T(ide, "dhEmi") || T(ide, "dEmi");

  return {
    chave,
    numero:  T(ide, "nNF"),
    serie:   T(ide, "serie"),
    modelo:  T(ide, "mod"),
    emissao: dh ? dh.slice(0, 10) : "",
    valor:   Number(T(tot, "vNF") || 0),
    emit_doc:  T(emit, "CNPJ") || T(emit, "CPF"),
    emit_nome: T(emit, "xNome"),
    dest_doc:  T(dest, "CNPJ") || T(dest, "CPF"),
    dest_nome: T(dest, "xNome"),
    // sem protNFe/nProt o arquivo e' o que foi ENVIADO, nao o AUTORIZADO --
    // guardar esse nao cumpre a obrigacao fiscal.
    protocolo: T(doc.documentElement, "nProt"),
  };
}

function _fatSoDig(v) { return String(v || "").replace(/\D/g, ""); }

async function fatAnexarNfe(faturaId) {
  const { data: fat } = await sb.from("oct_faturas").select("*").eq("id", faturaId).maybeSingle();
  if (!fat) { alert("Fatura não encontrada."); return; }
  window._fatNfe = { fatura: fat, dados: null, xml: null, pdf: null };
  const jaTem = fat.nfe_chave
    ? `<p style="color:#f59e0b;font-size:0.8rem;margin:0 0 10px">
         ⚠ Esta fatura já tem a NF-e ${_fatEsc(fat.nfe_numero || "")} anexada. Anexar de novo substitui.</p>` : "";
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>📎 Anexar NF-e — fatura ${fat.numero ?? ""} · ${_fatEsc(fat.cliente_nome || "")}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px;color:#cdd6e0">
      ${jaTem}
      <p style="font-size:0.8rem;color:#889;margin:0 0 14px">Anexe o XML <b>autorizado</b> da nota emitida
        no TecnoX. Os dados são lidos do arquivo — nada é digitado.</p>
      <label style="color:#9aa;font-size:0.76rem">XML da NF-e (obrigatório)</label>
      <input type="file" accept=".xml,text/xml,application/xml" onchange="_fatNfeSelXml(this)"
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#ccc;margin-bottom:12px">
      <label style="color:#9aa;font-size:0.76rem">DANFE em PDF (opcional — é o que o cliente lê)</label>
      <input type="file" accept=".pdf,application/pdf" onchange="_fatNfeSelPdf(this)"
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#ccc">
      <div id="fat-nfe-prev" style="margin-top:14px"></div>
      <div id="fat-nfe-msg" style="font-size:0.8rem;min-height:18px;margin-top:8px"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="fat-btn" style="flex:1" onclick="_fatFechaModal()">Cancelar</button>
        <button class="fat-btn azul" style="flex:2" id="fat-nfe-ok" disabled
          onclick="fatAnexarNfeConfirmar()">Anexar e arquivar na nuvem</button>
      </div>
    </div>`);
}

function _fatNfeSelPdf(input) {
  window._fatNfe.pdf = (input.files || [])[0] || null;
}

function _fatNfeSelXml(input) {
  const f = (input.files || [])[0];
  const prev = document.getElementById("fat-nfe-prev");
  const btn = document.getElementById("fat-nfe-ok");
  window._fatNfe.dados = null; window._fatNfe.xml = null;
  if (btn) btn.disabled = true;
  if (!f) { if (prev) prev.innerHTML = ""; return; }
  const rd = new FileReader();
  rd.onload = () => {
    const txt = String(rd.result || "");
    const d = _fatNfeLerXml(txt);
    if (d.erro) {
      prev.innerHTML = `<p style="color:#f87171">❌ ${_fatEsc(d.erro)}</p>`;
      return;
    }
    window._fatNfe.dados = d; window._fatNfe.xml = txt;

    const fat = window._fatNfe.fatura;
    const avisos = [];
    if (!d.protocolo) avisos.push("este XML <b>não tem protocolo de autorização</b> — é o arquivo enviado, não o autorizado. O que vale para o fisco é o com protocolo.");
    if (d.modelo && d.modelo !== "55") avisos.push(`o modelo é <b>${_fatEsc(d.modelo)}</b>${d.modelo === "65" ? " (NFC-e, cupom)" : ""} — a fatura do cliente costuma ser NF-e modelo 55.`);
    const dif = Math.abs(Number(d.valor || 0) - _fatLiquido(fat));
    if (dif > 0.005) avisos.push(`o valor da nota (<b>R$ ${_fatMoney(d.valor)}</b>) não bate com o da fatura (<b>R$ ${_fatMoney(_fatLiquido(fat))}</b>) — diferença de R$ ${_fatMoney(dif)}.`);

    prev.innerHTML = `
      <table style="width:100%;font-size:0.84rem;text-align:left;background:#13151f;border-radius:8px;padding:6px">
        <tr><td style="color:#889;padding:3px 8px">Nota</td><td style="padding:3px 8px"><b>nº ${_fatEsc(d.numero)}</b> · série ${_fatEsc(d.serie)} · modelo ${_fatEsc(d.modelo)}</td></tr>
        <tr><td style="color:#889;padding:3px 8px">Emissão</td><td style="padding:3px 8px">${_fatData(d.emissao)}</td></tr>
        <tr><td style="color:#889;padding:3px 8px">Valor</td><td style="padding:3px 8px;color:#f59e0b;font-weight:700">R$ ${_fatMoney(d.valor)}</td></tr>
        <tr><td style="color:#889;padding:3px 8px">Destinatário</td><td style="padding:3px 8px">${_fatEsc(d.dest_nome || "—")}</td></tr>
        <tr><td style="color:#889;padding:3px 8px;vertical-align:top">Chave</td><td style="padding:3px 8px;font-family:monospace;font-size:0.72rem;word-break:break-all">${_fatEsc(d.chave)}</td></tr>
      </table>
      ${avisos.length ? `<div style="margin-top:10px;background:#2a2010;border:1px solid #63501f;border-radius:8px;padding:10px;font-size:0.78rem;color:#f0c98a">
         ⚠ ${avisos.join("<br>⚠ ")}<br><span style="color:#998">Dá para anexar assim mesmo — confira antes.</span></div>` : ""}`;
    if (btn) btn.disabled = false;
  };
  rd.onerror = () => { prev.innerHTML = `<p style="color:#f87171">Não consegui ler o arquivo.</p>`; };
  rd.readAsText(f, "UTF-8");
}

// caminho no bucket: <empresa>/<ano>/<mes>/nfe-<chave>.<ext>
function _fatDocPath(empresaId, dataIso, nome) {
  const d = String(dataIso || "").slice(0, 10);
  const ano = d.slice(0, 4) || String(new Date().getFullYear());
  const mes = d.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, "0");
  return `${empresaId}/${ano}/${mes}/${nome}`;
}

async function fatAnexarNfeConfirmar() {
  const st = window._fatNfe || {};
  const d = st.dados, fat = st.fatura;
  const msg = document.getElementById("fat-nfe-msg");
  const btn = document.getElementById("fat-nfe-ok");
  if (!d || !st.xml) { return; }

  // a mesma nota em duas faturas seria a mesma receita cobrada duas vezes
  const { data: outra } = await sb.from("oct_faturas").select("id,numero")
    .eq("nfe_chave", d.chave).neq("id", fat.id).limit(1);
  if (outra && outra.length) {
    msg.style.color = "#f87171";
    msg.innerHTML = `Esta NF-e já está anexada à fatura ${outra[0].numero ?? outra[0].id}. Uma nota não cobre duas faturas.`;
    return;
  }

  if (btn) btn.disabled = true;
  msg.style.color = "#9aa"; msg.textContent = "Enviando para a nuvem...";

  const xmlPath = _fatDocPath(fat.empresa_id, d.emissao, `nfe-${d.chave}.xml`);
  const pdfPath = st.pdf ? _fatDocPath(fat.empresa_id, d.emissao, `nfe-${d.chave}.pdf`) : null;
  try {
    const up1 = await sb.storage.from(_FAT_BUCKET).upload(
      xmlPath, new Blob([st.xml], { type: "application/xml" }),
      { upsert: true, contentType: "application/xml" });
    if (up1.error) throw up1.error;
    if (pdfPath) {
      const up2 = await sb.storage.from(_FAT_BUCKET).upload(
        pdfPath, st.pdf, { upsert: true, contentType: "application/pdf" });
      if (up2.error) throw up2.error;
    }
  } catch (e) {
    msg.style.color = "#f87171";
    const m = String(e.message || e);
    msg.innerHTML = /not found|does not exist|Bucket/i.test(m)
      ? `O bucket <code>${_FAT_BUCKET}</code> não existe ou não está liberado para gravar.`
      : "Erro ao enviar: " + _fatEsc(m);
    if (btn) btn.disabled = false;
    return;
  }

  msg.textContent = "Gravando na fatura...";
  const { error } = await sb.from("oct_faturas").update({
    nfe_chave: d.chave, nfe_numero: d.numero, nfe_serie: d.serie,
    nfe_emissao: d.emissao || null, nfe_valor: d.valor || null,
    nfe_origem: "tecnox", nfe_xml_path: xmlPath, nfe_pdf_path: pdfPath,
  }).eq("id", fat.id);
  if (error) {
    msg.style.color = "#f87171";
    msg.innerHTML = /nfe_chave|column/i.test(error.message || "")
      ? "Faltam as colunas da NF-e — rode <code>repo/sql/SQL-DOCUMENTOS-FATURA.sql</code>."
      : "Erro ao gravar: " + _fatEsc(error.message);
    if (btn) btn.disabled = false;
    return;
  }
  _fatFechaModal();
  alert(`NF-e ${d.numero} anexada e arquivada na nuvem.`);
  _fatRecarregar();
}

// link assinado e temporario: documento fiscal nao fica em URL publica eterna
async function fatVerDoc(path) {
  if (!path) return;
  // a janela abre AGORA, junto ao clique: se abrisse depois do await o Chrome
  // trataria como pop-up e bloquearia calado
  const w = window.open("", "_blank");
  const { data, error } = await sb.storage.from(_FAT_BUCKET).createSignedUrl(path, 600);
  if (error || !data) {
    if (w) w.close();
    alert("Não consegui abrir o arquivo: " + (error?.message || "sem link"));
    return;
  }
  if (w) w.location = data.signedUrl; else window.open(data.signedUrl, "_blank");
}

// ---------- ENVIAR FATURA AO CLIENTE (03/09) ----------
// Mesmo padrao do boleto e do PDF: a tela nao fala com o gateway. Marca o
// pedido na fatura e espera -- a senha do SMTP e o token do WhatsApp ficam no
// servidor, longe do navegador.
async function fatEnviar(faturaId) {
  const { data: f } = await sb.from("oct_faturas").select("*").eq("id", faturaId).maybeSingle();
  if (!f) { alert("Fatura não encontrada."); return; }
  const { data: cli } = f.cliente_id
    ? await sb.from("oct_pessoas").select("nome,email,telefone,whatsapp").eq("id", f.cliente_id).maybeSingle()
    : { data: null };

  let bol = null;
  try {
    const r = await sb.from("oct_boletos").select("nosso_numero,status")
      .eq("fatura_id", faturaId).order("id", { ascending: false }).limit(1);
    bol = (r.data || [])[0] || null;
  } catch (e) { /* sem boletos */ }
  const temBol = !!(bol && ["registrado", "liquidado"].includes(bol.status));

  const email = (cli && cli.email || "").trim();
  const zap = (cli && (cli.whatsapp || cli.telefone) || "").trim();
  const item = (ok, txt, falta) => `<li style="color:${ok ? "#86efac" : "#6b7688"};margin:2px 0">
      ${ok ? "✔" : "○"} ${txt}${ok ? "" : ` <span style="color:#f0b45c">(${falta})</span>`}</li>`;

  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>📤 Enviar fatura ${f.numero ?? ""} — ${_fatEsc(f.cliente_nome || "")}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px;color:#cdd6e0" id="fen-corpo">
      ${f.enviada_em ? `<p style="color:#f0b45c;font-size:0.82rem;margin:0 0 10px">
        ⚠ Já foi enviada em ${_fatData(f.enviada_em)} por ${_fatEsc(f.enviada_por || "—")}. Enviar de novo é reenvio.</p>` : ""}
      <p style="color:#889;font-size:0.8rem;margin:0 0 6px">Vai anexado:</p>
      <ul style="list-style:none;padding:0;margin:0 0 14px;font-size:0.84rem">
        ${item(!!f.fatura_pdf_path, "Fatura detalhada (PDF)", "ainda sendo gerada")}
        ${item(temBol, "Boleto", "sem boleto registrado")}
        ${item(!!f.nfe_pdf_path, "NF-e em PDF (DANFE)", "não anexada")}
        ${item(!!f.nfe_xml_path, "NF-e em XML", "não anexada")}
      </ul>
      <p style="color:#889;font-size:0.8rem;margin:0 0 6px">Para onde:</p>
      <ul style="list-style:none;padding:0;margin:0 0 12px;font-size:0.84rem">
        ${item(!!email, "E-mail: " + (_fatEsc(email) || "—"), "cliente sem e-mail no cadastro")}
        ${item(!!zap, "WhatsApp: " + (_fatEsc(zap) || "—"), "cliente sem telefone no cadastro")}
      </ul>
      <label style="color:#9aa;font-size:0.78rem">Canais</label>
      <select id="fen-canais" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee">
        <option value="ambos">E-mail e WhatsApp</option>
        <option value="email">Só e-mail</option>
        <option value="whatsapp">Só WhatsApp</option>
      </select>
      ${(!email && !zap) ? `<p style="color:#f87171;font-size:0.8rem;margin-top:10px">
        O cliente não tem e-mail nem telefone no cadastro — não há para onde enviar.</p>` : ""}
      <div id="fen-msg" style="font-size:0.8rem;min-height:18px;margin-top:8px;color:#f87171"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="fat-btn" style="flex:1" onclick="_fatFechaModal()">Cancelar</button>
        <button class="fat-btn azul" style="flex:2" id="fen-ok" ${(!email && !zap) ? "disabled" : ""}
          onclick="fatEnviarOk('${faturaId}')">📤 Enviar agora</button>
      </div>
    </div>`);
}

async function fatEnviarOk(faturaId) {
  const canais = document.getElementById("fen-canais").value;
  const btn = document.getElementById("fen-ok");
  const msg = document.getElementById("fen-msg");
  if (btn) btn.disabled = true;
  msg.style.color = "#9aa"; msg.textContent = "Enviando...";

  const { error } = await sb.from("oct_faturas").update({
    envio_canais: canais, envio_tipo: "fatura",
    envio_pedido_em: new Date().toISOString(),
    // enviada_em NAO e' zerado: era so' para driblar o filtro do worker, e
    // apagava a data do envio anterior antes de o novo dar certo
    envio_erro: null,
  }).eq("id", faturaId);
  if (error) {
    msg.style.color = "#f87171";
    msg.innerHTML = /envio_pedido_em|envio_canais|column/i.test(error.message || "")
      ? "Falta rodar <code>repo/sql/SQL-ENVIO-FATURA.sql</code>."
      : "Erro: " + _fatEsc(error.message);
    if (btn) btn.disabled = false;
    return;
  }

  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data: at } = await sb.from("oct_faturas")
      .select("enviada_em,enviada_por,envio_destino,envio_erro,envio_pedido_em")
      .eq("id", faturaId).maybeSingle();
    if (at && at.enviada_em && !at.envio_pedido_em) {
      _fatEnvCaixa(`<p style="color:#7ee2a0;font-weight:600">✔ Fatura enviada</p>
        <table style="width:100%;margin-top:10px;font-size:0.84rem;text-align:left">
          <tr><td style="color:#889;padding:3px 0">Quando</td><td>${new Date(at.enviada_em).toLocaleString("pt-BR")}</td></tr>
          <tr><td style="color:#889;padding:3px 0">Por</td><td>${_fatEsc(at.enviada_por || "")}</td></tr>
          <tr><td style="color:#889;padding:3px 0">Para</td><td>${_fatEsc(at.envio_destino || "—")}</td></tr>
        </table>
        ${at.envio_erro ? `<p style="color:#f0b45c;font-size:0.78rem;margin-top:10px">
          Um dos canais falhou: ${_fatEsc(at.envio_erro)}</p>` : ""}
        <button class="fat-btn azul" style="margin-top:12px;width:100%"
          onclick="_fatFechaModal();_fatRecarregar()">Fechar</button>`);
      return;
    }
    if (at && !at.envio_pedido_em && at.envio_erro) {
      _fatEnvCaixa(`<p style="color:#f87171;font-weight:600">Não consegui enviar</p>
        <pre style="text-align:left;background:#0f1520;padding:10px;border-radius:6px;font-size:0.74rem;
          white-space:pre-wrap;color:#c8d0da;margin-top:8px">${_fatEsc(at.envio_erro)}</pre>
        <button class="fat-btn" style="margin-top:12px;width:100%" onclick="_fatFechaModal()">Fechar</button>`);
      return;
    }
  }
  _fatEnvCaixa(`<p style="color:#f59e0b">O envio ainda não voltou.</p>
    <p style="font-size:0.8rem;color:#889;margin-top:8px">O pedido está na fila. Se o worker do gateway
    (<code>BOLETO_WORKER=1</code> no Railway) não estiver ligado, ele não sai da fila.</p>
    <button class="fat-btn" style="margin-top:12px;width:100%" onclick="_fatFechaModal()">Fechar</button>`);
}

function _fatEnvCaixa(html) {
  const c = document.getElementById("fen-corpo");
  if (c) c.innerHTML = html;
}

// ---------- VER A FATURA (o documento que o cliente recebe) ----------
// A tela nao chama o gateway: marca o pedido na fatura e o worker do
// octano-sicoob gera o PDF, guarda no bucket e devolve o caminho. E' o MESMO
// arquivo que o envio vai anexar -- desenhar a fatura aqui tambem criaria dois
// documentos para divergirem.
async function fatVerFatura(faturaId) {
  const { data: f } = await sb.from("oct_faturas").select("*").eq("id", faturaId).maybeSingle();
  if (!f) { alert("Fatura não encontrada."); return; }
  if (f.fatura_pdf_path) { fatVerDoc(f.fatura_pdf_path); return; }
  // ja' pedida (nasce assim): so' espera, nao pede de novo
  const jaNaFila = !!f.fatura_pdf_pedido_em;

  _fatModal(`<div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0">
      📄 Fatura ${f.numero ?? ""}</div>
    <div style="padding:22px;color:#cdd6e0" id="fvf-corpo">
      <p>Gerando a fatura...</p>
      <p style="font-size:0.8rem;color:#889;margin-top:8px">O extrato traz um abastecimento por linha,
      com placa, odômetro e cupom. Fica arquivado na nuvem — na próxima vez abre na hora.</p></div>`);

  const { error } = jaNaFila ? { error: null } : await sb.from("oct_faturas")
    .update({ fatura_pdf_pedido_em: new Date().toISOString() }).eq("id", faturaId);
  if (error) {
    _fatVfCaixa(/fatura_pdf_pedido_em|column/i.test(error.message || "")
      ? `<p style="color:#f87171">Falta rodar <code>repo/sql/SQL-FATURA-PDF.sql</code>.</p>`
      : `<p style="color:#f87171">Erro: ${_fatEsc(error.message)}</p>`);
    return;
  }
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data: at } = await sb.from("oct_faturas")
      .select("fatura_pdf_path,fatura_pdf_pedido_em,envio_erro").eq("id", faturaId).maybeSingle();
    if (at && at.fatura_pdf_path) {
      // o botao e' de proposito: abrir sozinho aqui seria pop-up bloqueado
      _fatRecarregar();
      _fatVfCaixa(`<p style="color:#7ee2a0">✔ Fatura pronta.</p>
        <button class="fat-btn azul" style="margin-top:12px;width:100%"
          onclick="_fatFechaModal();fatVerDoc('${_fatEsc(at.fatura_pdf_path)}')">📄 Abrir a fatura</button>`);
      return;
    }
    if (at && !at.fatura_pdf_pedido_em && at.envio_erro) {
      _fatVfCaixa(`<p style="color:#f87171">Não consegui gerar:</p>
        <pre style="text-align:left;background:#0f1520;padding:10px;border-radius:6px;font-size:0.72rem;
          white-space:pre-wrap;color:#c8d0da;margin-top:8px">${_fatEsc(at.envio_erro)}</pre>`);
      return;
    }
  }
  _fatVfCaixa(`<p style="color:#f59e0b">A fatura ainda não ficou pronta.</p>
    <p style="font-size:0.8rem;color:#889;margin-top:8px">O pedido está na fila. Se o worker do gateway
    (<code>BOLETO_WORKER=1</code> no Railway) não estiver ligado, ele não sai da fila.</p>`);
}

function _fatVfCaixa(html) {
  const c = document.getElementById("fvf-corpo");
  if (c) c.innerHTML = html;
}

// ---------- modal genérico (self-contained) ----------
function _fatModal(html) {
  let m = document.getElementById("fat-modal");
  if (!m) { m = document.createElement("div"); m.id = "fat-modal"; document.body.appendChild(m); }
  m.innerHTML = `<div onclick="document.getElementById('fat-modal').remove()" style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9998"></div>
    <div style="position:fixed;top:8vh;left:50%;transform:translateX(-50%);width:min(560px,94vw);max-height:84vh;overflow:auto;background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.6)">${html}</div>`;
  return m;
}
function _fatFechaModal() { const m = document.getElementById("fat-modal"); if (m) m.remove(); }

// ---------- LIQUIDAR TÍTULO na linha (receber direto) ----------
async function fatLiquidarTitulo(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id);
  if (!t) return;
  const saldo = Number(t.valor || 0);
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>💰 Receber título — ${_fatEsc(t.cliente_nome) || "Cliente"}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px">
      <div style="color:#9aa;font-size:0.82rem;margin-bottom:12px">Saldo do título: <b style="color:#f59e0b">R$ ${_fatMoney(saldo)}</b> · NFC-e ${_fatEsc(t.numero_nfe) || "—"} · emissão ${_fatData(t.registrado_em)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="color:#9aa;font-size:0.74rem">Valor a receber (R$)</label>
          <input id="flt-valor" type="number" step="0.01" min="0" value="${saldo.toFixed(2)}" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:1.1rem"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Forma</label>
          <select id="flt-forma" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option>Dinheiro</option><option>Pix</option><option>Cartão</option><option>Cheque</option><option>Boleto</option><option>Transferência</option></select></div>
        <div><label style="color:#9aa;font-size:0.74rem">Juros/multa (R$)</label>
          <input id="flt-juros" type="number" step="0.01" min="0" value="0" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Desconto (R$)</label>
          <input id="flt-desc" type="number" step="0.01" min="0" value="0" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <label style="color:#9aa;font-size:0.74rem;display:block;margin-top:10px">Quem recebeu</label>
      <input id="flt-autor" placeholder="nome" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
      <div id="flt-msg" style="color:#f87171;font-size:0.78rem;text-align:center;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="fat-btn" onclick="_fatFechaModal()" style="flex:1">Cancelar</button>
        <button class="fat-btn azul" onclick="fatLiquidarTituloOk('${id}')" style="flex:2">Confirmar recebimento</button>
      </div>
    </div>`);
}

async function fatLiquidarTituloOk(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id); if (!t) return;
  const msg = document.getElementById("flt-msg");
  const valor = parseFloat((document.getElementById("flt-valor").value || "0").replace(",", "."));
  const juros = parseFloat((document.getElementById("flt-juros").value || "0").replace(",", ".")) || 0;
  const desconto = parseFloat((document.getElementById("flt-desc").value || "0").replace(",", ".")) || 0;
  const forma = document.getElementById("flt-forma").value;
  const autor = (document.getElementById("flt-autor").value || "").trim();
  if (!(valor > 0)) { msg.textContent = "Informe o valor recebido."; return; }
  if (!autor) { msg.textContent = "Informe quem recebeu."; return; }
  const saldo = Number(t.valor || 0);
  if (valor > saldo + 0.005) { msg.textContent = "Valor maior que o saldo do título."; return; }
  msg.style.color = "#9aa"; msg.textContent = "Registrando...";
  try {
    // 1) baixa vinculada ao título
    await sb.from("oct_recebimentos_titulo").insert({
      empresa_id: window._fatEid, nota_prazo_id: id, cliente_id: t.cliente_id || null,
      cliente_nome: t.cliente_nome, valor: Number(valor.toFixed(2)), juros, desconto, forma,
      data_recebimento: new Date().toISOString().slice(0, 10), autor, origem: "faturar",
    });
    // 2) atualiza o título (reduz saldo; quita se zerou)
    const novoSaldo = Number((saldo - valor).toFixed(2));
    const patch = novoSaldo <= 0.005
      ? { valor: 0, status: "pago", pago_em: new Date().toISOString() }
      : { valor: novoSaldo };
    await sb.from("oct_pdv_notas_prazo").update(patch).eq("id", id);
  } catch (e) {
    msg.style.color = "#f87171";
    msg.textContent = /nota_prazo_id|column|does not exist/i.test(e.message || "")
      ? "Rode a migração SQL (SQL-FATURAR-FASE1.sql) e tente de novo." : "Erro: " + (e.message || e);
    return;
  }
  _fatFechaModal();
  fatListarTitulos();
}

// ---------- VER TÍTULO (detalhe + histórico de baixas) ----------
async function fatVerTitulo(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id); if (!t) return;
  let baixas = [];
  try {
    const { data } = await sb.from("oct_recebimentos_titulo").select("*")
      .eq("empresa_id", window._fatEid).eq("nota_prazo_id", id).order("data_recebimento");
    baixas = data || [];
  } catch (e) { baixas = []; }
  const venc = _fatVencDe(t); const atr = _fatAtrasoDias(venc);
  const orig = t.valor_original != null ? Number(t.valor_original) : Number(t.valor || 0);
  const recebido = baixas.reduce((s, b) => s + Number(b.valor || 0), 0);
  const campo = (r, v) => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem"><span style="color:#8aa">${r}</span><span style="color:#e5e7eb">${v}</span></div>`;
  const linhasB = baixas.map(b => `<tr style="border-bottom:1px solid #1c2130">
    <td style="padding:5px 7px">${_fatData(b.data_recebimento)}</td>
    <td style="padding:5px 7px">${_fatEsc(b.forma) || "—"}</td>
    <td style="padding:5px 7px;text-align:right">${(Number(b.juros || 0) || Number(b.desconto || 0)) ? "+" + _fatMoney(b.juros) + " / -" + _fatMoney(b.desconto) : "—"}</td>
    <td style="padding:5px 7px;text-align:right;color:#7ee2a0">${_fatMoney(b.valor)}</td>
    <td style="padding:5px 7px;color:#9aa">${_fatEsc(b.autor) || "—"}</td></tr>`).join("");
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>👁 Título — ${_fatEsc(t.cliente_nome) || "Cliente"}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px">
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:12px">
        ${campo("NFC-e", _fatEsc(t.numero_nfe) || "—")}
        ${campo("Forma", _fatEsc(t.forma_nome) || "Nota a prazo")}
        ${campo("Emissão", _fatData(t.registrado_em))}
        ${campo("Vencimento", venc ? _fatData(venc) + (atr > 0 ? ` <b style="color:#f87171">(${atr}d atraso)</b>` : "") : "—")}
        ${campo("Status", t.status === "pago" ? '<span style="color:#7ee2a0">PAGO</span>' : '<span style="color:#f59e0b">ABERTO</span>')}
        ${campo("Valor original", "R$ " + _fatMoney(orig))}
        ${campo("Já recebido", "R$ " + _fatMoney(recebido))}
        ${campo("Saldo atual", '<b style="color:#f59e0b">R$ ' + _fatMoney(t.valor) + "</b>")}
      </div>
      <div style="color:#f97316;font-size:0.76rem;font-weight:700;margin-bottom:5px">HISTÓRICO DE RECEBIMENTOS</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;color:#cdd6e0">
        <thead><tr style="background:#1a1d2e;color:#9fb0c4;text-align:left"><th style="padding:6px 7px">Data</th><th style="padding:6px 7px">Forma</th><th style="padding:6px 7px;text-align:right">Juros/Desc</th><th style="padding:6px 7px;text-align:right">Valor</th><th style="padding:6px 7px">Recebeu</th></tr></thead>
        <tbody>${linhasB || '<tr><td colspan="5" style="padding:14px;text-align:center;color:#667">Nenhum recebimento ainda.</td></tr>'}</tbody>
      </table>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="fat-btn" onclick="_fatFechaModal()" style="flex:1">Fechar</button>
        ${t.status !== "pago" ? `<button class="fat-btn azul" onclick="_fatFechaModal();fatLiquidarTitulo('${id}')" style="flex:1">💰 Receber</button>` : ""}
      </div>
    </div>`);
}

// ---------- PARCELAR título (divide o saldo em N parcelas) ----------
function _fatParcelas(saldo, n, primeiroVenc, intervalo) {
  const parc = [];
  const base = Math.floor((saldo / n) * 100) / 100;   // valor por parcela (2 casas)
  let acumulado = 0;
  for (let k = 1; k <= n; k++) {
    const val = (k === n) ? Number((saldo - acumulado).toFixed(2)) : base;   // última absorve arredondamento
    acumulado = Number((acumulado + val).toFixed(2));
    const d = new Date(primeiroVenc + "T00:00:00");
    d.setDate(d.getDate() + intervalo * (k - 1));
    parc.push({ k, valor: val, venc: d.toISOString().slice(0, 10) });
  }
  return parc;
}
function fatParcelar(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id); if (!t) return;
  const saldo = Number(t.valor || 0);
  const hoje = new Date(); hoje.setDate(hoje.getDate() + _fatPrazoDias());
  const primeiro = hoje.toISOString().slice(0, 10);
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>🔀 Parcelar título — ${_fatEsc(t.cliente_nome) || "Cliente"}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px">
      <div style="color:#9aa;font-size:0.82rem;margin-bottom:12px">Saldo a parcelar: <b style="color:#f59e0b">R$ ${_fatMoney(saldo)}</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><label style="color:#9aa;font-size:0.74rem">Nº parcelas</label>
          <input id="fpc-n" type="number" min="2" max="60" value="2" oninput="fatParcelarPreview('${id}')" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#9aa;font-size:0.74rem">1º vencimento</label>
          <input id="fpc-venc" type="date" value="${primeiro}" oninput="fatParcelarPreview('${id}')" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Intervalo (dias)</label>
          <input id="fpc-int" type="number" min="1" value="30" oninput="fatParcelarPreview('${id}')" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="color:#f97316;font-size:0.76rem;font-weight:700;margin:12px 0 5px">PARCELAS</div>
      <div id="fpc-preview" style="max-height:34vh;overflow:auto"></div>
      <div id="fpc-msg" style="color:#f87171;font-size:0.78rem;text-align:center;margin-top:8px"></div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="fat-btn" onclick="_fatFechaModal()" style="flex:1">Cancelar</button>
        <button class="fat-btn azul" onclick="fatParcelarOk('${id}')" style="flex:2">Confirmar parcelamento</button>
      </div>
    </div>`);
  fatParcelarPreview(id);
}
function fatParcelarPreview(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id); if (!t) return;
  const saldo = Number(t.valor || 0);
  const n = Math.max(2, Math.min(60, parseInt(document.getElementById("fpc-n").value || "2", 10)));
  const venc = document.getElementById("fpc-venc").value || new Date().toISOString().slice(0, 10);
  const intervalo = Math.max(1, parseInt(document.getElementById("fpc-int").value || "30", 10));
  const parc = _fatParcelas(saldo, n, venc, intervalo);
  document.getElementById("fpc-preview").innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;color:#cdd6e0">
      <thead><tr style="background:#1a1d2e;color:#9fb0c4;text-align:left"><th style="padding:5px 7px">Parcela</th><th style="padding:5px 7px">Vencimento</th><th style="padding:5px 7px;text-align:right">Valor</th></tr></thead>
      <tbody>${parc.map(p => `<tr style="border-bottom:1px solid #1c2130"><td style="padding:5px 7px">${p.k}/${n}</td><td style="padding:5px 7px">${_fatData(p.venc)}</td><td style="padding:5px 7px;text-align:right;color:#fff">${_fatMoney(p.valor)}</td></tr>`).join("")}</tbody>
    </table>`;
}
async function fatParcelarOk(id) {
  const t = (window._fatTitulos || []).find(x => x.id === id); if (!t) return;
  const msg = document.getElementById("fpc-msg");
  const saldo = Number(t.valor || 0);
  const n = Math.max(2, Math.min(60, parseInt(document.getElementById("fpc-n").value || "2", 10)));
  const venc = document.getElementById("fpc-venc").value;
  const intervalo = Math.max(1, parseInt(document.getElementById("fpc-int").value || "30", 10));
  if (!venc) { msg.textContent = "Informe o 1º vencimento."; return; }
  if (t.status === "pago") { msg.textContent = "Título já quitado."; return; }
  msg.style.color = "#9aa"; msg.textContent = "Criando parcelas...";
  const parc = _fatParcelas(saldo, n, venc, intervalo);
  const rows = parc.map(p => ({
    empresa_id: window._fatEid, cliente_id: t.cliente_id || null, cliente_nome: t.cliente_nome,
    valor: p.valor, valor_original: p.valor, vencimento: p.venc,
    forma_nome: "Nota a prazo (parcela " + p.k + "/" + n + ")",
    numero_nfe: t.numero_nfe || null,
    chave_nfe: "parcela-" + id + "-" + p.k,
    registrado_em: t.registrado_em || new Date().toISOString(),
    status: "aberto",
    observacao: "Parcela " + p.k + "/" + n + " do título " + (t.numero_nfe || id),
  }));
  try {
    // apaga parcelas antigas deste título (idempotência) e recria
    await sb.from("oct_pdv_notas_prazo").delete().eq("empresa_id", window._fatEid).like("chave_nfe", "parcela-" + id + "-%");
    await sb.from("oct_pdv_notas_prazo").insert(rows);
    // marca o título original como parcelado (sai da lista de abertos)
    await sb.from("oct_pdv_notas_prazo").update({ status: "parcelado", observacao: "Parcelado em " + n + "x" }).eq("id", id);
  } catch (e) {
    msg.style.color = "#f87171";
    msg.textContent = "Erro: " + (e.message || e);
    return;
  }
  _fatFechaModal();
  fatListarTitulos();
}

// ---------- Gerar Fatura (Fase B — precisa da migração oct_faturas) ----------
// ---------- VENCIMENTO DA FATURA (02/09) ----------
// O vencimento saia' de um campo de data solto no rodape que quase nunca era
// preenchido -- as duas faturas existentes nasceram sem vencimento. Agora o
// prazo e' do CLIENTE (oct_pessoas.prazo_dias) e a geracao PEDE confirmacao com
// a data ja' proposta. Sem prazo cadastrado, propoe o dia da geracao: data
// errada na tela o operador ve', data em branco ninguem ve'.
function _fatHojeIso() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// soma dias sem passar por UTC (new Date("2026-09-02") volta um dia no Brasil)
function _fatSomaDias(iso, dias) {
  const p = String(iso).split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + Number(dias || 0));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function _fatDiasEntre(isoA, isoB) {
  const a = String(isoA).split("-").map(Number), b = String(isoB).split("-").map(Number);
  return Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000);
}

async function fatGerarFatura() {
  const sel = [...window._fatSel];
  if (!sel.length) { alert("Selecione ao menos um título."); return; }
  const titulos = (window._fatTitulos || []).filter(t => sel.includes(t.id));
  const cliIds = [...new Set(titulos.map(t => t.cliente_id))];
  if (cliIds.length > 1) { alert("Selecione títulos de UM cliente só por fatura."); return; }
  const total = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const cliId = titulos[0].cliente_id || null;

  // prazo do cadastro. Le' a pessoa inteira de proposito: se a coluna
  // prazo_dias ainda nao existir (SQL nao rodado), isso nao quebra a geracao.
  let prazo = null, cliNome = titulos[0].cliente_nome || "";
  if (cliId) {
    const { data: p } = await sb.from("oct_pessoas").select("*").eq("id", cliId).maybeSingle();
    if (p) {
      if (p.prazo_dias != null && p.prazo_dias !== "") prazo = Number(p.prazo_dias);
      cliNome = p.nome || cliNome;
    }
  }
  const hoje = _fatHojeIso();
  const venc = (prazo != null && !isNaN(prazo)) ? _fatSomaDias(hoje, prazo) : hoje;
  window._fatNovaFat = { sel, titulos, total, cliId, cliNome, prazo, hoje };

  const origem = (prazo != null && !isNaN(prazo))
    ? `<span style="color:#7ee2a0">prazo de ${prazo} dia(s) do cadastro de ${_fatEsc(cliNome)}</span>`
    : `<span style="color:#f0b45c">${_fatEsc(cliNome) || "Este cliente"} não tem prazo cadastrado — proposto o dia de hoje. Ajuste abaixo.</span>`;

  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>💠 Gerar fatura</span><span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px;color:#cdd6e0">
      <table style="width:100%;font-size:0.86rem;text-align:left;margin-bottom:14px">
        <tr><td style="color:#889;padding:3px 0">Cliente</td><td><b>${_fatEsc(cliNome) || "—"}</b></td></tr>
        <tr><td style="color:#889;padding:3px 0">Títulos</td><td>${titulos.length}</td></tr>
        <tr><td style="color:#889;padding:3px 0">Total</td><td style="color:#f59e0b;font-weight:700">R$ ${_fatMoney(total)}</td></tr>
        <tr><td style="color:#889;padding:3px 0">Emissão</td><td>${_fatData(hoje)}</td></tr>
      </table>
      <label style="color:#9aa;font-size:0.78rem">Vencimento</label>
      <input type="date" id="fgf-venc" value="${venc}" oninput="_fatVencDica()"
        style="width:100%;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:1.05rem">
      <p id="fgf-dica" style="font-size:0.78rem;margin:6px 0 0">${origem}</p>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:0.8rem;color:#9aa;cursor:pointer">
        <input type="checkbox" id="fgf-salvar" ${prazo == null ? "checked" : ""} style="width:auto">
        <span id="fgf-salvar-txt">Gravar este prazo no cadastro do cliente</span></label>
      <div id="fgf-msg" style="font-size:0.8rem;min-height:18px;margin-top:8px;color:#f87171"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="fat-btn" style="flex:1" onclick="_fatFechaModal()">Cancelar</button>
        <button class="fat-btn azul" style="flex:2" id="fgf-ok" onclick="fatGerarFaturaOk()">Gerar fatura</button>
      </div>
    </div>`);
  _fatVencDica();
}

function _fatVencDica() {
  const st = window._fatNovaFat; if (!st) return;
  const v = document.getElementById("fgf-venc")?.value;
  const dica = document.getElementById("fgf-dica");
  const txt = document.getElementById("fgf-salvar-txt");
  if (!v || !dica) return;
  const d = _fatDiasEntre(st.hoje, v);
  dica.innerHTML = d < 0
    ? `<span style="color:#f87171">⚠ ${-d} dia(s) ANTES de hoje — a fatura já nasceria vencida.</span>`
    : d === 0
      ? `<span style="color:#f0b45c">Vence hoje mesmo (sem prazo).</span>`
      : `<span style="color:#7ee2a0">${d} dia(s) de prazo.</span>` +
        (st.prazo != null && st.prazo !== d ? `<span style="color:#889"> · cadastro diz ${st.prazo}</span>` : "");
  if (txt) txt.textContent = d > 0
    ? `Gravar ${d} dia(s) como prazo padrão deste cliente`
    : "Gravar este prazo no cadastro do cliente";
}

// numeracao propria: o TecnoX numera as faturas dele, a nossa serie comeca do 1
// por posto. O indice unico (empresa_id, numero) e' a garantia de verdade.
async function _fatProximoNumero() {
  const { data } = await sb.from("oct_faturas").select("numero")
    .eq("empresa_id", window._fatEid).not("numero", "is", null)
    .order("numero", { ascending: false }).limit(1);
  return ((data && data[0] && Number(data[0].numero)) || 0) + 1;
}

async function fatGerarFaturaOk() {
  const st = window._fatNovaFat; if (!st) return;
  const msg = document.getElementById("fgf-msg");
  const btn = document.getElementById("fgf-ok");
  const venc = document.getElementById("fgf-venc").value || "";
  if (!venc) { msg.textContent = "Informe o vencimento."; return; }
  if (venc < st.hoje && !confirm("O vencimento é anterior a hoje — a fatura nasce vencida. Gerar assim mesmo?")) return;

  btn.disabled = true;
  msg.style.color = "#9aa"; msg.textContent = "Gerando...";

  const base = {
    empresa_id: window._fatEid, cliente_id: st.cliId,
    cliente_nome: st.cliNome || null, valor: st.total,
    vencimento: venc, status: "aberta",
    // ja' nasce pedindo o PDF: o worker gera em segundos e o documento existe
    // desde o comeco, em vez de so' quando alguem lembra de abrir a fatura
    fatura_pdf_pedido_em: new Date().toISOString(),
  };
  let nova = null, erro = null;
  for (let tent = 0; tent < 3 && !nova; tent++) {
    const numero = await _fatProximoNumero();
    const r = await sb.from("oct_faturas").insert({ ...base, numero }).select("id,numero").single();
    if (!r.error) { nova = r.data; break; }
    erro = r.error;
    // 23505 = outro faturamento pegou o mesmo numero; tenta o proximo
    if (String(r.error.code) !== "23505") break;
  }
  if (!nova) {
    // sem a coluna numero (SQL nao rodado) a fatura ainda tem de sair
    const r = await sb.from("oct_faturas").insert(base).select("id,numero").single();
    if (r.error) {
      msg.style.color = "#f87171";
      msg.textContent = /oct_faturas|does not exist|relation|PGRST/i.test(String(erro?.message || r.error.message))
        ? "A tabela de faturas ainda não existe — rode a migração SQL."
        : "Erro ao gerar fatura: " + (r.error.message || r.error.code);
      btn.disabled = false;
      return;
    }
    nova = r.data;
  }

  await sb.from("oct_pdv_notas_prazo").update({ fatura_id: nova.id, status: "faturado" }).in("id", st.sel);

  // grava o prazo no cadastro (falha aqui nao desfaz a fatura -- so' avisa)
  let avisoPrazo = "";
  const dias = _fatDiasEntre(st.hoje, venc);
  if (document.getElementById("fgf-salvar")?.checked && st.cliId && dias > 0) {
    const { error } = await sb.from("oct_pessoas").update({ prazo_dias: dias }).eq("id", st.cliId);
    if (error) avisoPrazo = /prazo_dias|column/i.test(error.message || "")
      ? "\n\n(O prazo não foi salvo no cadastro: falta rodar SQL-PRAZO-CLIENTE.sql.)"
      : "\n\n(O prazo não foi salvo no cadastro: " + error.message + ")";
  }
  window._fatSel.clear();
  _fatFechaModal();
  alert(`Fatura ${nova.numero ?? ""} gerada — vence em ${_fatData(venc)}.` + avisoPrazo);
  fatAba("faturas");
}

// ---------- VER/EDITAR FATURA (03/09) — desconto, acrescimo, vencimento ----------
// Equivalente ao "Ver Titulo" do TecnoX: bruto, desconto, acrescimo e liquido na
// mesma tela. O bruto NAO se edita -- ele e' a soma dos titulos e tem de
// continuar batendo com os cupons. O desconto entra ao lado.
function _fatLiquido(f) {
  if (!f) return 0;
  // o banco calcula (coluna gerada); a conta local so' vale enquanto o SQL
  // de desconto nao rodou -- sem ela a tela mostraria o bruto como se fosse tudo
  if (f.valor_liquido != null) return Number(f.valor_liquido);
  return +(Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)).toFixed(2);
}

async function _fatUsuario() {
  if (window._fatUser) return window._fatUser;
  try {
    const { data } = await sb.auth.getSession();
    window._fatUser = (data?.session?.user?.email || "").replace("@octano.interno", "") || "retaguarda";
  } catch (e) { window._fatUser = "retaguarda"; }
  return window._fatUser;
}

async function fatEditarFatura(faturaId) {
  const { data: f } = await sb.from("oct_faturas").select("*").eq("id", faturaId).maybeSingle();
  if (!f) { alert("Fatura não encontrada."); return; }
  const recebido = await _fatRecebidoDa(faturaId);
  let bol = null;
  try {
    const r = await sb.from("oct_boletos").select("nosso_numero,status,vencimento,valor")
      .eq("fatura_id", faturaId).order("id", { ascending: false }).limit(1);
    bol = (r.data || [])[0] || null;
  } catch (e) { /* tabela pode nao existir */ }
  const temBoleto = bol && ["registrado", "liquidado"].includes(bol.status);
  window._fatEdit = { f, recebido, temBoleto };

  const campo = (id, rot, val, cor) => `
    <div><label style="color:#9aa;font-size:0.74rem">${rot}</label>
      <input id="${id}" type="number" step="0.01" min="0" value="${val}" oninput="_fatEditCalc()"
        style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:${cor};font-weight:700"></div>`;

  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>✏ Fatura ${f.numero ?? ""} — ${_fatEsc(f.cliente_nome || "")}</span>
      <span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:18px;color:#cdd6e0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="color:#9aa;font-size:0.74rem">Valor bruto (soma dos títulos)</label>
          <div style="padding:9px;background:#13151f;border-radius:6px;color:#cdd6e0;font-weight:700">R$ ${_fatMoney(f.valor)}</div></div>
        <div><label style="color:#9aa;font-size:0.74rem">Vencimento</label>
          <input type="date" id="fed-venc" value="${f.vencimento ? String(f.vencimento).slice(0, 10) : _fatHojeIso()}"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        ${campo("fed-desc", "Desconto (R$)", Number(f.desconto || 0).toFixed(2), "#4ade80")}
        ${campo("fed-acr", "Acréscimo (R$)", Number(f.acrescimo || 0).toFixed(2), "#f0b45c")}
      </div>
      <div style="margin-top:12px;background:#13151f;border-radius:8px;padding:11px;display:flex;justify-content:space-between;align-items:center">
        <span style="color:#9aa;font-size:0.82rem">Valor líquido — é o que se cobra</span>
        <b id="fed-liq" style="color:#f59e0b;font-size:1.25rem">R$ ${_fatMoney(_fatLiquido(f))}</b></div>
      <label style="color:#9aa;font-size:0.74rem;display:block;margin-top:12px">Observação <span style="color:#667">(por que o desconto — fica registrado)</span></label>
      <input id="fed-obs" value="${_fatEsc(f.observacao || "")}" placeholder="ex.: preço negociado R$ 5,79/L"
        style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee">
      ${recebido > 0 ? `<p style="color:#889;font-size:0.78rem;margin-top:10px">Já recebido nesta fatura: <b style="color:#4ade80">${_fatBRL(recebido)}</b>.</p>` : ""}
      ${temBoleto ? `<div style="margin-top:12px;background:#2a2010;border:1px solid #63501f;border-radius:8px;padding:10px;font-size:0.78rem;color:#f0c98a">
        ⚠ Já existe o boleto <b>${_fatEsc(bol.nosso_numero || "")}</b> registrado no Sicoob
        (R$ ${_fatMoney(bol.valor)}, vence ${_fatData(bol.vencimento)}). Alterar aqui <b>não altera no banco</b> —
        o boleto que o cliente tem continua com o valor e a data antigos. Para valer, o título tem de ser
        alterado no Sicoob.</div>` : ""}
      <div id="fed-msg" style="font-size:0.8rem;min-height:18px;margin-top:8px;color:#f87171"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="fat-btn" style="flex:1" onclick="_fatFechaModal()">Cancelar</button>
        <button class="fat-btn azul" style="flex:2" onclick="fatEditarFaturaOk('${faturaId}')">Salvar</button>
      </div>
    </div>`);
  _fatEditCalc();
}

function _fatEditCalc() {
  const st = window._fatEdit; if (!st) return;
  const d = Number(document.getElementById("fed-desc")?.value || 0);
  const a = Number(document.getElementById("fed-acr")?.value || 0);
  const liq = +(Number(st.f.valor || 0) - d + a).toFixed(2);
  const el = document.getElementById("fed-liq");
  if (el) { el.textContent = "R$ " + _fatMoney(liq); el.style.color = liq < 0 ? "#f87171" : "#f59e0b"; }
  const msg = document.getElementById("fed-msg");
  if (!msg) return;
  if (liq < 0) msg.textContent = "O desconto é maior que a fatura — o líquido ficaria negativo.";
  else if (st.recebido > liq + 0.005) msg.textContent = `Atenção: já foram recebidos ${_fatBRL(st.recebido)}, mais que o líquido. Sobraria crédito para o cliente.`;
  else msg.textContent = "";
}

async function fatEditarFaturaOk(faturaId) {
  const st = window._fatEdit; if (!st) return;
  const msg = document.getElementById("fed-msg");
  const venc = document.getElementById("fed-venc").value || null;
  const desc = +Number(document.getElementById("fed-desc").value || 0).toFixed(2);
  const acr = +Number(document.getElementById("fed-acr").value || 0).toFixed(2);
  const obs = (document.getElementById("fed-obs").value || "").trim() || null;
  const liq = +(Number(st.f.valor || 0) - desc + acr).toFixed(2);
  if (liq < 0) { msg.textContent = "O desconto é maior que a fatura."; return; }
  if (desc > 0 && !obs && !confirm("Salvar o desconto sem escrever o motivo?")) return;

  msg.style.color = "#9aa"; msg.textContent = "Salvando...";
  const patch = {
    vencimento: venc, desconto: desc, acrescimo: acr, observacao: obs,
    alterado_por: await _fatUsuario(), alterado_em: new Date().toISOString(),
    // o PDF guardado virou mentira: joga fora e ja' pede outro -- pior que nao
    // ter a fatura e' ter a fatura errada, e pior ainda e' nao ter nenhuma
    fatura_pdf_path: null,
    fatura_pdf_pedido_em: new Date().toISOString(),
  };
  let { error } = await sb.from("oct_faturas").update(patch).eq("id", faturaId);
  if (error && /desconto|acrescimo|observacao|alterado_|column/i.test(error.message || "")) {
    // sem o SQL de desconto ainda da' para corrigir a data, que ja' funcionava
    const r2 = await sb.from("oct_faturas").update({ vencimento: venc }).eq("id", faturaId);
    if (!r2.error) {
      _fatFechaModal();
      alert("Vencimento salvo. O desconto NÃO foi salvo: falta rodar repo/sql/SQL-DESCONTO-FATURA.sql.");
      fatListarFaturas(st.f.status || "aberta");
      return;
    }
    error = r2.error;
  }
  if (error) { msg.style.color = "#f87171"; msg.textContent = "Erro: " + error.message; return; }
  _fatFechaModal();
  _fatRecarregar();
}

// redesenha a aba que esta' aberta (sem F5, sem perder o lugar)
function _fatRecarregar() {
  if (!document.getElementById("fat-corpo")) return;   // saiu da tela
  if (window._fatAba === "abertos") fatListarTitulos();
  else fatListarFaturas(window._fatAba === "liquidadas" ? "liquidada" : "aberta");
}

// enquanto o gateway estiver trabalhando em alguma linha, a lista se reconfere
// sozinha. Um timer so' -- cada render cancela o anterior.
let _fatAutoTimer = null;
function _fatAutoAtualizar(temPendente, status) {
  clearTimeout(_fatAutoTimer);
  if (!temPendente) return;
  _fatAutoTimer = setTimeout(() => {
    // nao redesenha por baixo de um modal aberto: tenta de novo depois
    if (document.getElementById("fat-modal") || document.getElementById("fat-receber-modal")) {
      _fatAutoAtualizar(true, status);
      return;
    }
    if (window._fatAba !== "faturas" && window._fatAba !== "liquidadas") return;
    if (!document.getElementById("fat-corpo")) return;
    _fatReconferir(status);
  }, 10000);
}

// Reconferencia sem piscar: busca os dados e troca so' o que mudou. Trocar o
// innerHTML da tabela inteira a cada 10s fazia a tela tremer, perder a rolagem
// e reabrir os selects -- o operador achava que o sistema estava com defeito.
async function _fatReconferir(status) {
  const corpo = document.getElementById("fat-corpo");
  if (!corpo) return;
  const { data, error } = await sb.from("oct_faturas").select("*")
    .eq("empresa_id", window._fatEid).eq("status", status).order("emissao", { ascending: false });
  if (error) return;

  const antes = window._fatFaturas || [];
  const novas = _fatOrdenar(data || [], window._fatOrdF, _FAT_ORD_F);
  // a lista mudou de composicao? ai' redesenhar e' o certo -- linha nova nao
  // nasce de uma troca de celula
  const mesmas = antes.length === novas.length &&
                 antes.every((f, i) => f.id === novas[i].id);
  if (!mesmas) { fatListarFaturas(status); return; }

  let bolPorFat = {};
  try {
    const r = await sb.from("oct_boletos").select("fatura_id,nosso_numero,status")
      .in("fatura_id", novas.map(x => x.id));
    (r.data || []).forEach(b => { bolPorFat[b.fatura_id] = b; });
  } catch (e) { /* segue sem */ }

  window._fatFaturas = novas;
  novas.forEach(f => {
    _fatTrocaCel("fatf-st-" + f.id, _fatStatusCel(f, bolPorFat[f.id]));
    _fatTrocaCel("fatf-dc-" + f.id, _fatDocsCol(f));
    _fatTrocaCel("fatf-vl-" + f.id, _fatValorCel(f));
  });
  _fatSelFSync();

  const emAndamento = novas.some(fr => fr.fatura_pdf_pedido_em || fr.envio_pedido_em) ||
    Object.values(bolPorFat).some(b => b && b.status === "pendente");
  _fatAutoAtualizar(emAndamento, status);
}

// so' escreve se mudou: escrever igual pisca do mesmo jeito
function _fatTrocaCel(id, html) {
  const el = document.getElementById(id);
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

// ---------- ORDENAÇÃO das listas (03/09) ----------
// Clicar no cabecalho ordena; clicar de novo inverte. Vazio vai sempre para o
// FIM, nos dois sentidos: uma fatura sem vencimento no topo esconderia as que
// vencem amanha, que e' justamente o que se procura ao ordenar por vencimento.
function _fatCmp(a, b) {
  const va = (a === null || a === undefined || a === "");
  const vb = (b === null || b === undefined || b === "");
  if (va && vb) return 0;
  if (va) return 1;          // vazio depois, independente da direcao
  if (vb) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

function _fatOrdenar(lista, ord, campos) {
  if (!ord || !ord.campo || !campos[ord.campo]) return lista;
  const val = campos[ord.campo];
  const sinal = ord.dir === "asc" ? 1 : -1;
  return lista.slice().sort((x, y) => {
    const c = _fatCmp(val(x), val(y));
    return c === 0 ? 0 : c * sinal;   // o "vazio por ultimo" ja' saiu do _fatCmp
  });
}

// cabecalho clicavel, com a seta de quem esta' mandando na ordem
function _fatTh(rot, campo, ord, fn, extra) {
  const ativo = ord && ord.campo === campo;
  const seta = ativo ? (ord.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th ${extra || ""} onclick="${fn}('${campo}')" title="Ordenar por ${rot}"
    style="cursor:pointer;user-select:none;${ativo ? "color:#f97316" : ""}">${rot}${seta}</th>`;
}

// ---- faturas ----
const _FAT_ORD_F = {
  numero:     f => Number(f.numero || 0),
  cliente:    f => f.cliente_nome || "",
  emissao:    f => String(f.emissao || f.criado_em || "").slice(0, 10),
  vencimento: f => String(f.vencimento || "").slice(0, 10),
  valor:      f => _fatLiquido(f),
};

function fatOrdenarF(campo) {
  const o = window._fatOrdF || {};
  // mesma coluna inverte; coluna nova comeca decrescente em numero/valor/data,
  // crescente em texto -- e' o que a pessoa espera em cada caso
  window._fatOrdF = (o.campo === campo)
    ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
    : { campo, dir: campo === "cliente" ? "asc" : "desc" };
  fatListarFaturas(window._fatAba === "liquidadas" ? "liquidada" : "aberta");
}

// ---- titulos ----
const _FAT_ORD_T = {
  emissao:    t => String(t.registrado_em || t.criado_em || "").slice(0, 10),
  vencimento: t => { const v = _fatVencDe(t); return v ? v.toISOString().slice(0, 10) : ""; },
  atraso:     t => { const a = _fatAtrasoDias(_fatVencDe(t)); return a == null ? null : Number(a); },
  cliente:    t => t.cliente_nome || "",
  nfce:       t => Number(String(t.numero_nfe || "").replace(/\D/g, "")) || null,
  forma:      t => t.forma_nome || "",
  valor:      t => Number(t.valor || 0),
};

function fatOrdenarT(campo) {
  const o = window._fatOrdT || {};
  window._fatOrdT = (o.campo === campo)
    ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
    : { campo, dir: (campo === "cliente" || campo === "forma") ? "asc" : "desc" };
  fatListarTitulos();
}

// ============================================================
// AÇÃO EM MASSA nas faturas (03/09)
// ------------------------------------------------------------
// Faturar dez clientes custava trinta cliques em botões de 11px, um por linha,
// sem nenhuma noção de quanto falta. Agora: marca as faturas e manda a ação uma
// vez, com barra de progresso e o resultado de CADA uma no fim.
//
// Regra que vale para as três ações: o que já está pronto é PULADO, não refeito.
// Reemitir boleto de quem já tem seria um segundo título no banco; reenviar para
// quem já recebeu é cobrança em duplicidade.
// ============================================================
function _fatSelF() {
  if (!window._fatSelFat) window._fatSelFat = new Set();
  return window._fatSelFat;
}

function fatToggleF(id) {
  const s = _fatSelF();
  if (s.has(id)) s.delete(id); else s.add(id);
  const cx = document.getElementById("fatf-chk-" + id);
  if (cx) cx.checked = s.has(id);
  _fatSelFSync();
}

function fatSelTodasF(marcar) {
  const s = _fatSelF();
  (window._fatFaturas || []).forEach(f => {
    if (marcar) s.add(f.id); else s.delete(f.id);
    const cx = document.getElementById("fatf-chk-" + f.id);
    if (cx) cx.checked = !!marcar;
  });
  _fatSelFSync();
}

function _fatSelFSync() {
  const s = _fatSelF();
  const lista = window._fatFaturas || [];
  const marcadas = lista.filter(f => s.has(f.id));
  const tot = marcadas.reduce((a, f) => a + _fatLiquido(f), 0);
  const el = document.getElementById("fatf-selinfo");
  if (el) {
    el.innerHTML = marcadas.length
      ? `<b style="color:#4ade80">${marcadas.length}</b> selecionada(s) · <b style="color:#f59e0b">R$ ${_fatMoney(tot)}</b>`
      : `<span style="color:#6b7688">nenhuma selecionada</span>`;
  }
  ["fatf-btn-boleto", "fatf-btn-nf", "fatf-btn-enviar", "fatf-btn-cobrar"].forEach(b => {
    const x = document.getElementById(b);
    if (x) x.disabled = !marcadas.length;
  });
  const mestre = document.getElementById("fatf-chk-todas");
  if (mestre) {
    mestre.checked = lista.length > 0 && marcadas.length === lista.length;
    mestre.indeterminate = marcadas.length > 0 && marcadas.length < lista.length;
  }
}

function _fatBarraLote(faturas, status) {
  const b = (id, cor, rot, fn) =>
    `<button id="${id}" disabled onclick="${fn}" style="background:${cor};border:none;border-radius:6px;
      padding:7px 13px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;margin-left:6px"
      class="fat-lote">${rot}</button>`;
  return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:9px 14px;
      background:#141824;border-bottom:1px solid #2a2d3e">
    <button class="fat-btn mini" onclick="fatSelTodasF(true)">☑ Marcar todas (${faturas.length})</button>
    <button class="fat-btn mini" onclick="fatSelTodasF(false)">☐ Desmarcar</button>
    <span id="fatf-selinfo" style="margin-left:10px;font-size:12px;color:#9aa"></span>
    <span style="margin-left:auto">
      ${status === "aberta" ? b("fatf-btn-nf", "#0e7490", "🧾 Gerar NF", "fatLoteNf()") +
        b("fatf-btn-boleto", "#334155", "🏦 Gerar boletos", "fatLoteBoleto()") +
        b("fatf-btn-enviar", "#15803d", "📤 Enviar faturas", "fatLoteEnviar()") +
        b("fatf-btn-cobrar", "#b45309", "📣 Cobrar", "fatLoteCobrar()") : ""}
    </span></div>`;
}

// ---------- barra de progresso ----------
function _fatProgAbrir(titulo, total) {
  window._fatProg = { total, feitos: 0, linhas: [], cancelar: false };
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:700;border-radius:12px 12px 0 0">
      ${titulo}</div>
    <div style="padding:18px;color:#cdd6e0">
      <div style="display:flex;justify-content:space-between;font-size:0.84rem;margin-bottom:6px">
        <span id="fatp-atual">Começando...</span>
        <span id="fatp-cont" style="color:#9aa">0 de ${total}</span></div>
      <div style="height:12px;background:#0b0d14;border-radius:8px;overflow:hidden;border:1px solid #2a2d3e">
        <div id="fatp-barra" style="height:100%;width:0%;background:linear-gradient(90deg,#f97316,#fbbf24);
          transition:width .25s"></div></div>
      <div id="fatp-lista" style="margin-top:12px;max-height:240px;overflow:auto;font-size:0.8rem"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="fat-btn" style="flex:1" onclick="_fatProgCancelar()" id="fatp-cancelar">Parar depois desta</button>
        <button class="fat-btn azul" style="flex:1;display:none" id="fatp-fechar"
          onclick="_fatFechaModal();_fatRecarregar()">Fechar</button>
      </div>
    </div>`);
}

function _fatProgCancelar() {
  if (window._fatProg) window._fatProg.cancelar = true;
  const b = document.getElementById("fatp-cancelar");
  if (b) { b.disabled = true; b.textContent = "Parando..."; }
}

function _fatProgPasso(nome, resultado, detalhe) {
  const p = window._fatProg; if (!p) return;
  p.feitos++;
  const pct = Math.round((p.feitos / p.total) * 100);
  const barra = document.getElementById("fatp-barra");
  if (barra) barra.style.width = pct + "%";
  const cont = document.getElementById("fatp-cont");
  if (cont) cont.textContent = `${p.feitos} de ${p.total} · ${pct}%`;
  const cor = resultado === "ok" ? "#7ee2a0" : resultado === "pulou" ? "#8b93a3" : "#f87171";
  const icone = resultado === "ok" ? "✔" : resultado === "pulou" ? "○" : "✕";
  const lista = document.getElementById("fatp-lista");
  if (lista) {
    lista.insertAdjacentHTML("beforeend",
      `<div style="padding:3px 0;border-bottom:1px solid #1c2130;color:${cor}">
        ${icone} ${_fatEsc(nome)}${detalhe ? ` <span style="color:#6b7688">— ${_fatEsc(detalhe)}</span>` : ""}</div>`);
    lista.scrollTop = lista.scrollHeight;
  }
}

function _fatProgAgora(nome) {
  const el = document.getElementById("fatp-atual");
  if (el) el.textContent = nome;
}

function _fatProgFim() {
  const p = window._fatProg || {};
  _fatProgAgora(p.cancelar ? "Parado pelo operador." : "Concluído.");
  const c = document.getElementById("fatp-cancelar");
  if (c) c.style.display = "none";
  const f = document.getElementById("fatp-fechar");
  if (f) f.style.display = "";
}

function _fatSelecionadas() {
  const s = _fatSelF();
  return (window._fatFaturas || []).filter(f => s.has(f.id));
}

// ---------- LOTE: gerar NF-e ----------
async function fatLoteNf() {
  const alvo = _fatSelecionadas();
  if (!alvo.length) return;
  if (!confirm(`Emitir NF-e de ${alvo.length} fatura(s), em HOMOLOGAÇÃO?\n\n` +
               `Faturas que já têm NF-e anexada serão puladas.`)) return;
  _fatProgAbrir("🧾 Emitindo NF-e", alvo.length);
  for (const f of alvo) {
    if (window._fatProg.cancelar) { _fatProgPasso(f.cliente_nome || "", "pulou", "cancelado"); continue; }
    _fatProgAgora(`${f.cliente_nome || ""} — fatura ${f.numero ?? ""}`);
    if (f.nfe_chave) { _fatProgPasso(f.cliente_nome || "", "pulou", "já tem NF-e"); continue; }
    const { data: ts } = await sb.from("oct_pdv_notas_prazo").select("*")
      .eq("empresa_id", window._fatEid).eq("fatura_id", f.id);
    if (!ts || !ts.length) { _fatProgPasso(f.cliente_nome || "", "erro", "fatura sem títulos"); continue; }
    const r = await fatGerarNfConsolidada(null, ts, true) || {};
    _fatProgPasso(f.cliente_nome || "", r.ok ? "ok" : "erro",
                  r.ok ? ("NF-e " + (r.numero || "")) : (r.erro || "falhou"));
  }
  _fatProgFim();
}

// ---------- LOTE: boletos ----------
// Enfileira TODOS e depois acompanha. Um a um seria 20s de espera vezes o número
// de faturas -- o worker do gateway processa a fila em paralelo com a espera.
async function fatLoteBoleto() {
  const alvo = _fatSelecionadas();
  if (!alvo.length) return;
  const semVenc = alvo.filter(f => !f.vencimento);
  if (semVenc.length) {
    alert(`${semVenc.length} fatura(s) sem vencimento. O banco recusa boleto sem data — ` +
          `ajuste pelo ✏ Editar antes.`);
    return;
  }
  if (!confirm(`Emitir boleto de ${alvo.length} fatura(s) no Sicoob?\n\n` +
               `Faturas que já têm boleto registrado serão puladas.`)) return;
  _fatProgAbrir("🏦 Registrando boletos no Sicoob", alvo.length);

  const naFila = [];
  for (const f of alvo) {
    _fatProgAgora(`${f.cliente_nome || ""} — enfileirando`);
    const { data: ja } = await sb.from("oct_boletos").select("id,status")
      .eq("fatura_id", f.id).in("status", ["registrado", "liquidado", "pendente"]).limit(1);
    if (ja && ja.length) { _fatProgPasso(f.cliente_nome || "", "pulou", "já tem boleto"); continue; }
    const { data: nova, error } = await sb.from("oct_boletos").insert({
      empresa_id: f.empresa_id, fatura_id: f.id, cliente_id: f.cliente_id,
      cliente_nome: f.cliente_nome, valor: _fatLiquido(f), vencimento: f.vencimento,
      status: "pendente", criado_por: "retaguarda-lote",
    }).select("id").single();
    if (error) { _fatProgPasso(f.cliente_nome || "", "erro", error.message); continue; }
    naFila.push({ id: nova.id, nome: f.cliente_nome || "" });
  }
  if (!naFila.length) { _fatProgFim(); return; }

  _fatProgAgora(`Aguardando o banco registrar ${naFila.length}...`);
  const pendentes = new Map(naFila.map(x => [x.id, x.nome]));
  for (let volta = 0; volta < 40 && pendentes.size; volta++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await sb.from("oct_boletos").select("id,status,nosso_numero,erro")
      .in("id", [...pendentes.keys()]);
    (data || []).forEach(b => {
      if (b.status === "pendente") return;
      const nome = pendentes.get(b.id);
      pendentes.delete(b.id);
      _fatProgPasso(nome, b.status === "registrado" ? "ok" : "erro",
                    b.status === "registrado" ? ("nosso nº " + b.nosso_numero) : (b.erro || b.status));
    });
  }
  pendentes.forEach(nome => _fatProgPasso(nome, "erro", "o banco não respondeu a tempo (segue na fila)"));
  _fatProgFim();
}

// ---------- LOTE: cobrar ----------
// Mesmos anexos do envio normal, texto diferente. Reaproveita a mesma fila --
// o que muda e' envio_tipo, que diz ao nucleo qual modelo usar.
//
// Ao contrario do "Enviar", aqui NAO pula quem ja' recebeu: cobrar e' justamente
// insistir com quem ja' recebeu a fatura e nao pagou. O que se pula e' quem nao
// deve mais nada.
async function fatLoteCobrar() {
  const alvo = _fatSelecionadas();
  if (!alvo.length) return;
  const hoje = _fatHojeIso();
  const vencidas = alvo.filter(f => f.vencimento && String(f.vencimento).slice(0, 10) < hoje).length;
  const aVencer = alvo.length - vencidas;
  const semDoc = alvo.filter(f => !f.fatura_pdf_path).length;
  const jaCobradas = alvo.filter(f => Number(f.cobrancas || 0) > 0).length;

  if (!confirm(
      `Enviar COBRANÇA de ${alvo.length} fatura(s) ao cliente?\n\n` +
      `${vencidas} vencida(s)` + (aVencer ? ` e ${aVencer} ainda a vencer (vai como lembrete)` : "") + `.\n` +
      (jaCobradas ? `${jaCobradas} já receberam cobrança antes.\n` : "") +
      (semDoc ? `${semDoc} sem fatura em PDF serão puladas.\n` : "") +
      `\nIsto manda mensagem de verdade para os clientes.`)) return;

  _fatProgAbrir("📣 Enviando cobranças", alvo.length);
  const naFila = [];
  for (const f of alvo) {
    if (!f.fatura_pdf_path) { _fatProgPasso(f.cliente_nome || "", "pulou", "sem fatura em PDF"); continue; }
    const recebido = await _fatRecebidoDa(f.id);
    if (recebido + 0.005 >= _fatLiquido(f)) {
      _fatProgPasso(f.cliente_nome || "", "pulou", "já está paga");
      continue;
    }
    const { error } = await sb.from("oct_faturas").update({
      envio_canais: "ambos", envio_tipo: "cobranca",
      envio_pedido_em: new Date().toISOString(), envio_erro: null,
    }).eq("id", f.id);
    if (error) {
      _fatProgPasso(f.cliente_nome || "", "erro",
        /envio_tipo|column/i.test(error.message || "") ? "falta rodar SQL-COBRANCA.sql" : error.message);
      continue;
    }
    naFila.push({ id: f.id, nome: f.cliente_nome || "", antes: Number(f.cobrancas || 0) });
  }
  if (!naFila.length) { _fatProgFim(); return; }

  _fatProgAgora(`Aguardando o posto enviar ${naFila.length}...`);
  const pend = new Map(naFila.map(x => [x.id, x]));
  for (let volta = 0; volta < 60 && pend.size; volta++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await sb.from("oct_faturas")
      .select("id,cobrancas,cobrada_em,envio_pedido_em,envio_erro").in("id", [...pend.keys()]);
    (data || []).forEach(f => {
      const x = pend.get(f.id);
      if (!x) return;
      if (Number(f.cobrancas || 0) > x.antes) {
        _fatProgPasso(x.nome, "ok", "cobrança nº " + f.cobrancas);
        pend.delete(f.id);
      } else if (!f.envio_pedido_em && f.envio_erro) {
        _fatProgPasso(x.nome, "erro", f.envio_erro);
        pend.delete(f.id);
      }
    });
  }
  pend.forEach(x => _fatProgPasso(x.nome, "erro", "não voltou a tempo (o posto pode estar desligado)"));
  _fatProgFim();
}

// ---------- LOTE: enviar ----------
async function fatLoteEnviar() {
  const alvo = _fatSelecionadas();
  if (!alvo.length) return;
  const jaEnviadas = alvo.filter(f => f.enviada_em).length;
  const semDoc = alvo.filter(f => !f.fatura_pdf_path).length;
  if (!confirm(
      `Enviar ${alvo.length} fatura(s) AO CLIENTE por e-mail e WhatsApp?\n\n` +
      (jaEnviadas ? `${jaEnviadas} já foram enviadas antes e serão PULADAS.\n` : "") +
      (semDoc ? `${semDoc} ainda estão sem a fatura em PDF e serão puladas.\n` : "") +
      `\nIsto manda mensagem de verdade para os clientes.`)) return;
  _fatProgAbrir("📤 Enviando faturas", alvo.length);

  const naFila = [];
  for (const f of alvo) {
    if (f.enviada_em) { _fatProgPasso(f.cliente_nome || "", "pulou", "já enviada"); continue; }
    if (!f.fatura_pdf_path) { _fatProgPasso(f.cliente_nome || "", "pulou", "sem fatura em PDF"); continue; }
    const { error } = await sb.from("oct_faturas").update({
      envio_canais: "ambos", envio_tipo: "fatura",
      envio_pedido_em: new Date().toISOString(), envio_erro: null,
    }).eq("id", f.id);
    if (error) { _fatProgPasso(f.cliente_nome || "", "erro", error.message); continue; }
    naFila.push({ id: f.id, nome: f.cliente_nome || "" });
  }
  if (!naFila.length) { _fatProgFim(); return; }

  _fatProgAgora(`Aguardando o posto enviar ${naFila.length}...`);
  const pendentes = new Map(naFila.map(x => [x.id, x.nome]));
  for (let volta = 0; volta < 60 && pendentes.size; volta++) {
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await sb.from("oct_faturas")
      .select("id,enviada_em,enviada_por,envio_pedido_em,envio_erro").in("id", [...pendentes.keys()]);
    (data || []).forEach(f => {
      if (f.enviada_em) {
        _fatProgPasso(pendentes.get(f.id), "ok", "por " + (f.enviada_por || ""));
        pendentes.delete(f.id);
      } else if (!f.envio_pedido_em && f.envio_erro) {
        _fatProgPasso(pendentes.get(f.id), "erro", f.envio_erro);
        pendentes.delete(f.id);
      }
    });
  }
  pendentes.forEach(nome => _fatProgPasso(nome, "erro", "não voltou a tempo (o posto pode estar desligado)"));
  _fatProgFim();
}

// STATUS do ciclo da fatura: gerada -> NF-e -> boleto -> enviada.
// Nao e' um campo guardado: e' lido do que existe. Se o boleto for cancelado no
// banco ou o XML trocado, a etiqueta acompanha sem ninguem ter de "corrigir o
// status" na mao.
function _fatStatusCel(f, bol) {
  const temNf  = !!f.nfe_chave;
  const temBol = !!(bol && ["registrado", "liquidado"].includes(bol.status));
  const env    = !!f.enviada_em;
  const sel = (ok, txt, tit) => `<span title="${tit}" style="display:inline-block;padding:1px 5px;` +
    `border-radius:4px;font-size:9.5px;font-weight:700;margin-right:3px;` +
    (ok ? "background:#14532d;color:#86efac" : "background:#1f2430;color:#5b6474") + `">${txt}</span>`;

  let rot, cor;
  if (env)                   { rot = "Enviada " + _fatData(f.enviada_em); cor = "#4ade80"; }
  else if (temNf && temBol)  { rot = "Pronta p/ enviar";                  cor = "#60a5fa"; }
  else if (temBol)           { rot = "Falta a NF-e";                      cor = "#f0b45c"; }
  else if (temNf)            { rot = "Falta o boleto";                    cor = "#f0b45c"; }
  else                       { rot = "Sem NF-e nem boleto";               cor = "#8b93a3"; }
  const cob = Number(f.cobrancas || 0)
    ? `<div style="font-size:9.5px;color:#f0b45c" title="Última em ${_fatData(f.cobrada_em)}">📣 ${f.cobrancas} cobrança(s)</div>` : "";
  const erro = f.envio_erro
    ? `<div style="font-size:9.5px;color:#f87171" title="${_fatEsc(f.envio_erro)}">⚠ última tentativa falhou</div>` : "";
  return sel(temNf, "NF", "NF-e anexada à fatura") +
         sel(temBol, "BOL", temBol ? "Boleto " + _fatEsc(bol.nosso_numero || "") + " registrado" : "Sem boleto registrado") +
         sel(env, "ENV", env ? "Enviada por " + _fatEsc(f.enviada_por || "—") : "Ainda não enviada ao cliente") +
         `<div style="font-size:10px;color:${cor};margin-top:2px">${rot}</div>` + cob + erro;
}

// o numero grande e' o que se cobra; o bruto so' aparece quando ha' abatimento,
// senao a coluna viraria duas linhas em toda fatura sem desconto
function _fatValorCel(f) {
  const liq = _fatLiquido(f);
  const d = Number(f.desconto || 0), a = Number(f.acrescimo || 0);
  if (!d && !a) return _fatMoney(liq);
  const det = (d ? `<span style="color:#4ade80">-${_fatMoney(d)}</span>` : "") +
              (a ? `<span style="color:#f0b45c"> +${_fatMoney(a)}</span>` : "");
  return `${_fatMoney(liq)}<br><span style="font-size:10px;color:#6b7688">${_fatMoney(f.valor)} ${det}</span>`;
}

// o que ja' esta' arquivado na nuvem desta fatura. Enquanto o campo estiver
// vazio o documento so' existe no disco do posto -- que e' exatamente o que
// estamos deixando de aceitar.
function _fatDocsCol(f) {
  const ic = [];
  if (f.nfe_xml_path) ic.push(`<span title="XML da NF-e ${_fatEsc(f.nfe_numero || "")}" style="cursor:pointer" onclick="fatVerDoc('${_fatEsc(f.nfe_xml_path)}')">🧾</span>`);
  if (f.nfe_pdf_path) ic.push(`<span title="DANFE em PDF" style="cursor:pointer" onclick="fatVerDoc('${_fatEsc(f.nfe_pdf_path)}')">📄</span>`);
  if (f.boleto_pdf_path) ic.push(`<span title="Boleto" style="cursor:pointer" onclick="fatVerDoc('${_fatEsc(f.boleto_pdf_path)}')">🏦</span>`);
  if (f.fatura_pdf_path) ic.push(`<span title="Fatura detalhada" style="cursor:pointer" onclick="fatVerDoc('${_fatEsc(f.fatura_pdf_path)}')">📑</span>`);
  return ic.length ? ic.join(" ") : '<span style="color:#4a5160">—</span>';
}

async function fatListarFaturas(status) {
  const corpo = document.getElementById("fat-corpo");
  corpo.innerHTML = "<p style='color:#888;padding:20px'>Carregando faturas...</p>";
  const { data, error } = await sb.from("oct_faturas").select("*")
    .eq("empresa_id", window._fatEid).eq("status", status).order("emissao", { ascending: false });
  if (error) {
    corpo.innerHTML = `<div style="padding:26px;text-align:center;color:#9aa">
      <p>A tabela de <strong>faturas</strong> ainda não existe.</p>
      <p style="color:#666;font-size:0.85rem">Rode a migração SQL (oct_faturas) no Supabase para ativar o faturamento. A aba "Títulos em Aberto" já funciona.</p></div>`;
    return;
  }
  const faturas = _fatOrdenar(data || [], window._fatOrdF, _FAT_ORD_F);
  window._fatFaturas = faturas;
  // a selecao vale para a lista que esta' na tela: ids de outra aba viram lixo
  const idsAqui = new Set(faturas.map(x => x.id));
  [..._fatSelF()].forEach(id => { if (!idsAqui.has(id)) _fatSelF().delete(id); });
  // um boleto por fatura numa consulta so' -- 20 faturas nao podem virar 20 idas
  const bolPorFat = {};
  if (faturas.length) {
    try {
      const r = await sb.from("oct_boletos").select("fatura_id,nosso_numero,status")
        .in("fatura_id", faturas.map(x => x.id));
      (r.data || []).forEach(b => { bolPorFat[b.fatura_id] = b; });
    } catch (e) { /* tabela de boletos pode nao existir */ }
  }
  const linhas = faturas.map(fatr => `<tr>
    <td class="fat-td" style="text-align:center"><input type="checkbox" id="fatf-chk-${fatr.id}"
      ${_fatSelF().has(fatr.id) ? "checked" : ""} onchange="fatToggleF('${fatr.id}')"></td>
    <td class="fat-td">${fatr.numero ?? "—"}</td>
    <td class="fat-td">${_fatEsc(fatr.cliente_nome) || "—"}</td>
    <td class="fat-td">${_fatData(fatr.emissao)}</td>
    <td class="fat-td">${_fatData(fatr.vencimento) || "—"}</td>
    <td class="fat-td fat-r" id="fatf-vl-${fatr.id}">${_fatValorCel(fatr)}</td>
    <td class="fat-td" id="fat-saldo-${fatr.id}" style="color:#9aa">—</td>
    <td class="fat-td" id="fatf-st-${fatr.id}">${_fatStatusCel(fatr, bolPorFat[fatr.id])}</td>
    <td class="fat-td" id="fatf-dc-${fatr.id}" style="white-space:nowrap">${_fatDocsCol(fatr)}</td>
    <td class="fat-td" style="white-space:nowrap">
      ${status === "aberta" ? `<button class="fat-abtn" style="background:#166534" onclick="fatLiquidar('${fatr.id}')">💰 Receber</button>` : `<span style="color:#4ade80">liquidada ${_fatData(fatr.liquidado_em)}</span>`}
      <button class="fat-abtn" style="background:#b45309" onclick="fatVerFatura('${fatr.id}')">📄 Fatura</button>
      <button class="fat-abtn" style="background:#1d4ed8" onclick="fatFaturaDetalhes('${fatr.id}')">👁 Detalhes</button>
      ${status === "aberta" ? `<button class="fat-abtn" style="background:#0e7490" onclick="fatGerarNfFatura('${fatr.id}')">🧾 Gerar NF</button>
      <button class="fat-abtn" style="background:#334155" onclick="fatBoleto('${fatr.id}')">🏦 Boleto</button>
      <button class="fat-abtn" style="background:#4c1d95" onclick="fatAnexarNfe('${fatr.id}')">📎 NF-e</button>
      <button class="fat-abtn" style="background:#7c2d12" onclick="fatEditarFatura('${fatr.id}')">✏ Editar</button>
      <button class="fat-abtn" style="background:#15803d" onclick="fatEnviar('${fatr.id}')">📤 Enviar</button>` : ""}
    </td>
  </tr>`).join("");
  const total = faturas.reduce((s, fr) => s + _fatLiquido(fr), 0);
  corpo.innerHTML = `
    ${_fatBarraLote(faturas, status)}
    <div class="fat-gridwrap"><table class="fat-grid">
      <thead><tr><th style="width:34px;text-align:center"><input type="checkbox" id="fatf-chk-todas" title="Marcar/desmarcar todas as faturas da lista" onchange="fatSelTodasF(this.checked)"></th>${_fatTh("Nº","numero",window._fatOrdF,"fatOrdenarF")}${_fatTh("Cliente","cliente",window._fatOrdF,"fatOrdenarF")}${_fatTh("Emissão","emissao",window._fatOrdF,"fatOrdenarF")}${_fatTh("Vencimento","vencimento",window._fatOrdF,"fatOrdenarF")}${_fatTh("Valor","valor",window._fatOrdF,"fatOrdenarF",'class="fat-r"')}<th>Recebido/Saldo</th><th>Status</th><th>Docs</th><th>Ações</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="10" style="padding:22px;text-align:center;color:#666">Nenhuma fatura ${status === "aberta" ? "em aberto" : "liquidada"}.</td></tr>`}</tbody>
    </table></div>
    <div class="fat-rodape"><span>${faturas.length} fatura(s) · Total: <strong style="color:#f59e0b">R$ ${_fatMoney(total)}</strong></span></div>`;
  _fatSelFSync();

  // algo ainda em andamento no gateway? entao a tela se reconfere sozinha
  const emAndamento = faturas.some(fr =>
    fr.fatura_pdf_pedido_em || fr.envio_pedido_em) ||
    Object.values(bolPorFat).some(b => b && b.status === "pendente");
  _fatAutoAtualizar(emAndamento, status);

  // saldo por fatura (recebimentos parciais) — assíncrono, não trava a lista
  faturas.forEach(async fr => {
    const rec = await _fatRecebidoDa(fr.id);
    const el = document.getElementById("fat-saldo-" + fr.id);
    if (!el) return;
    if (rec <= 0) { el.textContent = "—"; return; }
    const saldo = _fatLiquido(fr) - rec;
    el.innerHTML = `<span style="color:#4ade80">${_fatBRL(rec)}</span>` +
      (saldo > 0.005 ? ` <span style="color:#f59e0b">(falta ${_fatBRL(saldo)})</span>` : "");
  });
}

// ---------- RECEBIMENTO DE TÍTULO (baixa parcial, juros/multa, forma) ----------
// Antes a baixa era um sim/não: "liquidada" e pronto — sem quanto, sem como, sem
// quando, e sem aceitar pagamento parcial (o cliente que paga metade hoje e
// metade sexta não cabia no sistema). Agora cada recebimento é um lançamento em
// oct_recebimentos_titulo, e a fatura só fecha quando a soma quita o saldo.
async function fatLiquidar(id) {
  const { data: f } = await sb.from("oct_faturas").select("*").eq("id", id).single();
  if (!f) { alert("Fatura não encontrada."); return; }
  const jaRecebido = await _fatRecebidoDa(id);
  const saldo = +(_fatLiquido(f) - jaRecebido).toFixed(2);
  const hoje = new Date().toISOString().slice(0, 10);
  const venc = f.vencimento ? String(f.vencimento).slice(0, 10) : null;
  const diasAtraso = venc && hoje > venc
    ? Math.round((new Date(hoje) - new Date(venc)) / 86400000) : 0;

  const box = document.getElementById("conteudo");
  const div = document.createElement("div");
  div.id = "fat-receber-modal";
  div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999";
  div.innerHTML = `
    <div style="background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;padding:22px;max-width:480px;width:92%;color:#dbe2ea">
      <h2 style="color:#f97316;margin:0 0 4px">Receber título</h2>
      <p style="color:#9aa;font-size:0.84rem;margin:0 0 14px">
        ${f.cliente_nome || "cliente"} · fatura de ${_fatBRL(_fatLiquido(f))}${Number(f.desconto || 0) ? ` <span style="color:#4ade80">(bruto ${_fatBRL(f.valor)} − desconto ${_fatBRL(f.desconto)})</span>` : ""}
        ${jaRecebido > 0 ? `· já recebido ${_fatBRL(jaRecebido)}` : ""}
        ${diasAtraso > 0 ? `<br><span style="color:#f59e0b">⚠ ${diasAtraso} dia(s) em atraso</span>` : ""}
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="color:#9aa;font-size:0.74rem">Saldo devedor</label>
          <div style="padding:9px;background:#13151f;border-radius:6px;color:#f59e0b;font-weight:700">${_fatBRL(saldo)}</div></div>
        <div><label style="color:#9aa;font-size:0.74rem">Valor recebido</label>
          <input id="fr-valor" type="number" step="0.01" min="0" value="${saldo.toFixed(2)}"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#4ade80;font-weight:700"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Juros/multa (R$)</label>
          <input id="fr-juros" type="number" step="0.01" min="0" value="0"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Desconto (R$)</label>
          <input id="fr-desc" type="number" step="0.01" min="0" value="0"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee"></div>
        <div><label style="color:#9aa;font-size:0.74rem">Forma</label>
          <select id="fr-forma" style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee">
            <option>Dinheiro</option><option>Pix</option><option>Transferência</option>
            <option>Cartão de débito</option><option>Cartão de crédito</option>
            <option>Cheque</option><option>Boleto</option><option>Outro</option>
          </select></div>
        <div><label style="color:#9aa;font-size:0.74rem">Data</label>
          <input id="fr-data" type="date" value="${hoje}"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee"></div>
      </div>
      <label style="color:#9aa;font-size:0.74rem;display:block;margin-top:10px">Quem recebeu</label>
      <input id="fr-autor" placeholder="seu nome (fica registrado)"
        style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee">
      <div id="fr-msg" style="color:#f87171;font-size:0.78rem;min-height:18px;margin-top:6px"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="document.getElementById('fat-receber-modal').remove()"
          style="flex:1;padding:11px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#aaa;cursor:pointer">Cancelar</button>
        <button onclick="fatConfirmarRecebimento('${id}')"
          style="flex:2;padding:11px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Confirmar recebimento</button>
      </div>
    </div>`;
  (box || document.body).appendChild(div);
  document.getElementById("fr-valor").focus();
  document.getElementById("fr-valor").select();
}

function _fatBRL(v) { return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function _fatRecebidoDa(faturaId) {
  try {
    const { data } = await sb.from("oct_recebimentos_titulo").select("valor").eq("fatura_id", faturaId);
    return (data || []).reduce((s, x) => s + Number(x.valor || 0), 0);
  } catch (e) { return 0; }   // tabela ainda não criada
}

async function fatConfirmarRecebimento(faturaId) {
  const msg = document.getElementById("fr-msg");
  const valor = Number(document.getElementById("fr-valor").value || 0);
  const juros = Number(document.getElementById("fr-juros").value || 0);
  const desconto = Number(document.getElementById("fr-desc").value || 0);
  const forma = document.getElementById("fr-forma").value;
  const dataRec = document.getElementById("fr-data").value;
  const autor = (document.getElementById("fr-autor").value || "").trim();
  if (!(valor > 0)) { msg.textContent = "Informe o valor recebido."; return; }
  if (!autor) { msg.textContent = "Informe quem recebeu (fica registrado)."; return; }
  msg.style.color = "#9aa"; msg.textContent = "Registrando...";

  const { error } = await sb.from("oct_recebimentos_titulo").insert({
    empresa_id: window._fatEid, fatura_id: faturaId,
    valor, juros, desconto, forma, data_recebimento: dataRec, autor,
  });
  if (error) {
    msg.style.color = "#f87171";
    msg.textContent = /oct_recebimentos_titulo|does not exist|relation/i.test(error.message || "")
      ? "Falta a tabela oct_recebimentos_titulo (rode a migração SQL)."
      : "Erro: " + error.message;
    return;
  }
  // a fatura só fecha quando a soma dos recebimentos quita o valor
  const { data: f } = await sb.from("oct_faturas").select("*").eq("id", faturaId).single();
  const recebido = await _fatRecebidoDa(faturaId);
  const quitou = recebido + 0.005 >= _fatLiquido(f);
  if (quitou) {
    await sb.from("oct_faturas").update({ status: "liquidada", liquidado_em: new Date().toISOString() }).eq("id", faturaId);
  }
  document.getElementById("fat-receber-modal")?.remove();
  alert(quitou
    ? `Título quitado! Recebido ${_fatBRL(recebido)}.`
    : `Recebimento parcial registrado. Saldo: ${_fatBRL(_fatLiquido(f) - recebido)}.`);
  fatListarFaturas("aberta");
}

function _fatEstilo() {
  return `<style>
  .fat-janela{background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;margin:16px;color:#dbe2ea;font-size:12px;overflow:hidden}
  .fat-titbar{background:#13151f;color:#f97316;padding:11px 16px;font-weight:600;font-size:15px;border-bottom:1px solid #2a2d3e}
  .fat-abas{display:flex;gap:2px;background:#13151f;border-bottom:1px solid #2a2d3e;padding:0 10px}
  .fat-aba{background:transparent;border:none;border-bottom:2px solid transparent;color:#9aa;padding:10px 16px;cursor:pointer;font-size:12px}
  .fat-aba:hover{color:#fff}.fat-aba.ativa{color:#f97316;border-bottom-color:#f97316}
  .fat-filtros{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #2a2d3e;color:#9aa}
  .fat-sel,.fat-inp{border:1px solid #2a2d3e;border-radius:6px;padding:6px 9px;font-size:12px;background:#0b0d14;color:#e5e7eb}
  .fat-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;padding:12px 14px}
  .fat-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px}
  .fat-card-nome{color:#cdd6e0;font-weight:600;font-size:0.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fat-card-val{color:#f59e0b;font-weight:700;font-size:1.05rem;margin-top:3px}
  .fat-card-qtd{color:#6b7688;font-size:0.72rem;margin-top:2px}
  .fat-gridwrap{overflow:auto;max-height:52vh;background:#0f1119}
  .fat-grid{width:100%;border-collapse:collapse;font-size:12px;color:#cdd6e0}
  .fat-grid th{background:#1a1d2e;color:#9fb0c4;text-align:left;padding:8px;border-bottom:1px solid #2a2d3e;position:sticky;top:0}
  .fat-grid th[onclick]:hover{background:#232840;color:#fff}
  .fat-td{padding:6px 8px;border-bottom:1px solid #1c2130}
  .fat-r{text-align:right;font-variant-numeric:tabular-nums}
  .fat-grid tbody tr:nth-child(even){background:#141824}
  .fat-grid tbody tr.fat-cursor{background:#1f2a3d !important;box-shadow:inset 3px 0 0 #f97316}
  .fat-grid tbody tr:hover{background:#1a2130}
  .fat-rodape{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:11px 14px;background:#13151f;border-top:2px solid #f97316;position:sticky;bottom:0;z-index:6}
  .fat-btn{background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:7px 12px;font-size:12px;color:#c7d0dc;cursor:pointer}
  .fat-btn:hover{background:#242c3e;color:#fff}
  .fat-btn.azul{background:#f97316;color:#fff;border-color:#f97316}.fat-btn.azul:hover{background:#ea6a0c}
  .fat-btn.mini{padding:4px 9px;font-size:11px}
  .fat-btn:disabled,.fat-grid button:disabled{opacity:.35;cursor:not-allowed;filter:grayscale(.6)}
  .fat-lote:disabled{opacity:.35;cursor:not-allowed;filter:grayscale(.6)}
  .fat-grid thead th:first-child input,.fat-td input[type=checkbox]{cursor:pointer}
  .fat-abtn{border:none;border-radius:5px;padding:5px 8px;font-size:10.5px;color:#fff;cursor:pointer;margin:1px 2px;white-space:nowrap;font-weight:600}
  .fat-abtn:hover{filter:brightness(1.15)}
  </style>`;
}

// build faturar-actions-v2
