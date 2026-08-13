// ============================================================
// MÓDULO FATURAR — nota a prazo → fatura (réplica TecnoX, dark)
// Fase A: Títulos em Aberto (fiado agrupado por cliente), lê oct_pdv_notas_prazo.
// Fase B: gera/lista Faturas — usa oct_faturas (acende quando a migração rodar).
// Abas: Títulos em Aberto · Faturas em Aberto · Faturas Liquidadas.
// ============================================================

function _fatEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function _fatMoney(v) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fatData(v) { return v ? new Date(v).toLocaleDateString("pt-BR") : ""; }
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

  const linhas = titulos.map(t => {
    const venc = _fatVencDe(t);
    const atr = _fatAtrasoDias(venc);
    const vencCor = atr > 0 ? "#f87171" : atr >= -3 ? "#fbbf24" : "#9aa";
    const atrTxt = atr == null ? "—" : atr > 0 ? `<b style="color:#f87171">${atr}d</b>` : atr === 0 ? '<span style="color:#fbbf24">hoje</span>' : "—";
    return `<tr>
    <td class="fat-td" style="text-align:center"><input type="checkbox" ${window._fatSel.has(t.id) ? "checked" : ""} onchange="fatToggle('${t.id}')"></td>
    <td class="fat-td">${_fatData(t.registrado_em || t.criado_em)}</td>
    <td class="fat-td" style="color:${vencCor}">${venc ? _fatData(venc) : "—"}</td>
    <td class="fat-td" style="text-align:center">${atrTxt}</td>
    <td class="fat-td">${_fatEsc(t.cliente_nome) || "<span style='color:#f59e0b'>Sem cliente</span>"}</td>
    <td class="fat-td">${_fatEsc(t.numero_nfe) || "—"}</td>
    <td class="fat-td">${_fatEsc(t.forma_nome) || "Prazo"}</td>
    <td class="fat-td fat-r">${_fatMoney(t.valor)}</td>
    <td class="fat-td" style="text-align:center;white-space:nowrap">
      <button class="fat-btn mini" style="background:#166534" onclick="fatLiquidarTitulo('${t.id}')" title="Receber/Liquidar">💰</button>
      <button class="fat-btn mini" style="background:#7c3aed;margin-left:4px" onclick="fatParcelar('${t.id}')" title="Parcelar">🔀</button>
      <button class="fat-btn mini" style="background:#334155;margin-left:4px" onclick="fatBoleto('${t.id}')" title="Boleto">🏦</button>
      <button class="fat-btn mini" style="background:#0e7490;margin-left:4px" onclick="fatVerTitulo('${t.id}')" title="Ver título">👁</button>
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
      <thead><tr><th style="width:34px"></th><th>Emissão</th><th>Vencimento</th><th>Atraso</th><th>Cliente</th><th>NFC-e</th><th>Forma</th><th class="fat-r">Valor</th><th style="text-align:center">Ações</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="9" style="padding:22px;text-align:center;color:#666">Nenhum título a prazo em aberto.</td></tr>'}</tbody>
    </table></div>
    <div class="fat-rodape">
      <span>Selecionados: <strong id="fat-selqtd">${window._fatSel.size}</strong> · Total: <strong style="color:#4ade80">R$ <span id="fat-seltot">${_fatMoney(selTotal)}</span></strong></span>
      <span style="display:flex;gap:8px">
        <input type="date" id="fat-venc" class="fat-inp" title="Vencimento da fatura">
        <button class="fat-btn azul" onclick="fatGerarFatura()">💠 Gerar Fatura</button>
      </span>
    </div>`;
}

function fatToggle(id) {
  if (window._fatSel.has(id)) window._fatSel.delete(id); else window._fatSel.add(id);
  const titulos = window._fatTitulos || [];
  const selTotal = titulos.filter(t => window._fatSel.has(t.id)).reduce((s, t) => s + Number(t.valor || 0), 0);
  const q = document.getElementById("fat-selqtd"); if (q) q.textContent = window._fatSel.size;
  const tt = document.getElementById("fat-seltot"); if (tt) tt.textContent = _fatMoney(selTotal);
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

// ---------- BOLETO (placeholder — pronto p/ integração bancária) ----------
function fatBoleto(id) {
  _fatModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:600;border-radius:12px 12px 0 0;display:flex;justify-content:space-between">
      <span>🏦 Boleto</span><span onclick="_fatFechaModal()" style="cursor:pointer">✕</span></div>
    <div style="padding:22px;text-align:center;color:#9aa">
      <div style="font-size:2rem;margin-bottom:10px">🏦</div>
      <p style="margin-bottom:6px">A geração de boleto está <b style="color:#f59e0b">pronta para receber a integração bancária</b>.</p>
      <p style="font-size:0.8rem;color:#667">Quando o convênio de cobrança (ex.: Sicoob) for configurado, este botão passa a gerar o boleto do título/fatura direto aqui — a estrutura já espera por ele.</p>
      <button class="fat-btn" onclick="_fatFechaModal()" style="margin-top:14px">Fechar</button>
    </div>`);
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
async function fatGerarFatura() {
  const sel = [...window._fatSel];
  if (!sel.length) { alert("Selecione ao menos um título."); return; }
  const titulos = (window._fatTitulos || []).filter(t => sel.includes(t.id));
  const cliIds = [...new Set(titulos.map(t => t.cliente_id))];
  if (cliIds.length > 1) { alert("Selecione títulos de UM cliente só por fatura."); return; }
  const total = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const venc = document.getElementById("fat-venc")?.value || null;
  if (!confirm(`Gerar fatura de ${titulos.length} título(s), total R$ ${_fatMoney(total)}?`)) return;

  const fatura = {
    empresa_id: window._fatEid, cliente_id: titulos[0].cliente_id || null,
    cliente_nome: titulos[0].cliente_nome || null, valor: total,
    vencimento: venc, status: "aberta",
  };
  const { data: nova, error } = await sb.from("oct_faturas").insert(fatura).select("id").single();
  if (error) {
    if (String(error.message || error.code || "").match(/oct_faturas|does not exist|not exist|relation|404|PGRST/i))
      alert("A tabela de faturas ainda não existe. Rode a migração SQL que te enviei (oct_faturas) no Supabase e tente de novo.");
    else alert("Erro ao gerar fatura: " + (error.message || error.code));
    return;
  }
  // vincula os títulos à fatura (best-effort — colunas fatura_id/status vêm da migração)
  await sb.from("oct_pdv_notas_prazo").update({ fatura_id: nova.id, status: "faturado" }).in("id", sel);
  window._fatSel.clear();
  alert("Fatura gerada!");
  fatAba("faturas");
}

// ---------- Abas: Faturas em Aberto / Liquidadas ----------
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
  const faturas = data || [];
  const linhas = faturas.map(fatr => `<tr>
    <td class="fat-td">${fatr.numero ?? "—"}</td>
    <td class="fat-td">${_fatEsc(fatr.cliente_nome) || "—"}</td>
    <td class="fat-td">${_fatData(fatr.emissao)}</td>
    <td class="fat-td">${_fatData(fatr.vencimento) || "—"}</td>
    <td class="fat-td fat-r">${_fatMoney(fatr.valor)}</td>
    <td class="fat-td" id="fat-saldo-${fatr.id}" style="color:#9aa">—</td>
    <td class="fat-td">${status === "aberta" ? `<button class="fat-btn mini" onclick="fatLiquidar('${fatr.id}')">💰 Receber</button>` : `<span style="color:#4ade80">${_fatData(fatr.liquidado_em)}</span>`}</td>
  </tr>`).join("");
  const total = faturas.reduce((s, fr) => s + Number(fr.valor || 0), 0);
  corpo.innerHTML = `
    <div class="fat-gridwrap"><table class="fat-grid">
      <thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Vencimento</th><th class="fat-r">Valor</th><th>Recebido/Saldo</th><th>${status === "aberta" ? "Ação" : "Liquidada em"}</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="7" style="padding:22px;text-align:center;color:#666">Nenhuma fatura ${status === "aberta" ? "em aberto" : "liquidada"}.</td></tr>`}</tbody>
    </table></div>
    <div class="fat-rodape"><span>${faturas.length} fatura(s) · Total: <strong style="color:#f59e0b">R$ ${_fatMoney(total)}</strong></span></div>`;
  // saldo por fatura (recebimentos parciais) — assíncrono, não trava a lista
  faturas.forEach(async fr => {
    const rec = await _fatRecebidoDa(fr.id);
    const el = document.getElementById("fat-saldo-" + fr.id);
    if (!el) return;
    if (rec <= 0) { el.textContent = "—"; return; }
    const saldo = Number(fr.valor || 0) - rec;
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
  const saldo = +(Number(f.valor || 0) - jaRecebido).toFixed(2);
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
        ${f.cliente_nome || "cliente"} · fatura de ${_fatBRL(f.valor)}
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
  const { data: f } = await sb.from("oct_faturas").select("valor").eq("id", faturaId).single();
  const recebido = await _fatRecebidoDa(faturaId);
  const quitou = recebido + 0.005 >= Number(f?.valor || 0);
  if (quitou) {
    await sb.from("oct_faturas").update({ status: "liquidada", liquidado_em: new Date().toISOString() }).eq("id", faturaId);
  }
  document.getElementById("fat-receber-modal")?.remove();
  alert(quitou
    ? `Título quitado! Recebido ${_fatBRL(recebido)}.`
    : `Recebimento parcial registrado. Saldo: ${_fatBRL(Number(f?.valor || 0) - recebido)}.`);
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
  .fat-td{padding:6px 8px;border-bottom:1px solid #1c2130}
  .fat-r{text-align:right;font-variant-numeric:tabular-nums}
  .fat-grid tbody tr:nth-child(even){background:#141824}
  .fat-rodape{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:11px 14px;background:#13151f;border-top:1px solid #2a2d3e}
  .fat-btn{background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:7px 12px;font-size:12px;color:#c7d0dc;cursor:pointer}
  .fat-btn:hover{background:#242c3e;color:#fff}
  .fat-btn.azul{background:#f97316;color:#fff;border-color:#f97316}.fat-btn.azul:hover{background:#ea6a0c}
  .fat-btn.mini{padding:4px 9px;font-size:11px}
  </style>`;
}
