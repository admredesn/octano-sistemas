// ============================================================
// MÓDULO FATURAR — nota a prazo → fatura (réplica TecnoX, dark)
// Fase A: Títulos em Aberto (fiado agrupado por cliente), lê oct_pdv_notas_prazo.
// Fase B: gera/lista Faturas — usa oct_faturas (acende quando a migração rodar).
// Abas: Títulos em Aberto · Faturas em Aberto · Faturas Liquidadas.
// ============================================================

function _fatEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function _fatMoney(v) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _fatData(v) { return v ? new Date(v).toLocaleDateString("pt-BR") : ""; }

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
  const [tiRes, cliRes] = await Promise.all([
    sb.from("oct_pdv_notas_prazo").select("*").eq("empresa_id", eid).order("registrado_em", { ascending: false }),
    sb.from("oct_pessoas").select("id,nome").eq("empresa_id", eid).order("nome"),
  ]);
  // "em aberto" = ainda não faturado (coluna status pode não existir ainda → trata como aberto)
  let titulos = (tiRes.data || []).filter(t => !t.status || t.status === "aberto");
  window._fatTitulos = titulos;
  const filtroCli = window._fatFiltroCli || "";
  if (filtroCli) titulos = titulos.filter(t => t.cliente_id === filtroCli);

  // resumo por cliente (quem deve quanto)
  const porCli = {};
  titulos.forEach(t => {
    const k = t.cliente_id || "_scli";
    if (!porCli[k]) porCli[k] = { nome: t.cliente_nome || "Sem cliente", total: 0, qtd: 0 };
    porCli[k].total += Number(t.valor || 0); porCli[k].qtd++;
  });
  const devedores = Object.values(porCli).sort((a, b) => b.total - a.total);
  const totalGeral = titulos.reduce((s, t) => s + Number(t.valor || 0), 0);
  const selTotal = titulos.filter(t => window._fatSel.has(t.id)).reduce((s, t) => s + Number(t.valor || 0), 0);

  const cliOpts = "<option value=''>Todos os clientes</option>" +
    (cliRes.data || []).map(c => `<option value='${c.id}' ${filtroCli === c.id ? "selected" : ""}>${_fatEsc(c.nome)}</option>`).join("");

  const linhas = titulos.map(t => `<tr>
    <td class="fat-td" style="text-align:center"><input type="checkbox" ${window._fatSel.has(t.id) ? "checked" : ""} onchange="fatToggle('${t.id}')"></td>
    <td class="fat-td">${_fatData(t.registrado_em || t.criado_em)}</td>
    <td class="fat-td">${_fatEsc(t.cliente_nome) || "<span style='color:#f59e0b'>Sem cliente</span>"}</td>
    <td class="fat-td">${_fatEsc(t.numero_nfe) || "—"}</td>
    <td class="fat-td">${_fatEsc(t.forma_nome) || "Prazo"}</td>
    <td class="fat-td fat-r">${_fatMoney(t.valor)}</td>
  </tr>`).join("");

  corpo.innerHTML = `
    <div class="fat-filtros">
      <span>Cliente:</span>
      <select class="fat-sel" onchange="window._fatFiltroCli=this.value;fatListarTitulos()">${cliOpts}</select>
      <span style="margin-left:auto;color:#9aa">Total em aberto: <strong style="color:#f59e0b">R$ ${_fatMoney(totalGeral)}</strong></span>
    </div>
    ${devedores.length ? `<div class="fat-cards">
      ${devedores.slice(0, 6).map(d => `<div class="fat-card">
        <div class="fat-card-nome">${_fatEsc(d.nome)}</div>
        <div class="fat-card-val">R$ ${_fatMoney(d.total)}</div>
        <div class="fat-card-qtd">${d.qtd} título(s)</div></div>`).join("")}
    </div>` : ""}
    <div class="fat-gridwrap"><table class="fat-grid">
      <thead><tr><th style="width:34px"></th><th>Data</th><th>Cliente</th><th>NFC-e</th><th>Forma</th><th class="fat-r">Valor</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhum título a prazo em aberto.</td></tr>'}</tbody>
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
    <td class="fat-td">${status === "aberta" ? `<button class="fat-btn mini" onclick="fatLiquidar('${fatr.id}')">✔ Liquidar</button>` : `<span style="color:#4ade80">${_fatData(fatr.liquidado_em)}</span>`}</td>
  </tr>`).join("");
  const total = faturas.reduce((s, fr) => s + Number(fr.valor || 0), 0);
  corpo.innerHTML = `
    <div class="fat-gridwrap"><table class="fat-grid">
      <thead><tr><th>Nº</th><th>Cliente</th><th>Emissão</th><th>Vencimento</th><th class="fat-r">Valor</th><th>${status === "aberta" ? "Ação" : "Liquidada em"}</th></tr></thead>
      <tbody>${linhas || `<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhuma fatura ${status === "aberta" ? "em aberto" : "liquidada"}.</td></tr>`}</tbody>
    </table></div>
    <div class="fat-rodape"><span>${faturas.length} fatura(s) · Total: <strong style="color:#f59e0b">R$ ${_fatMoney(total)}</strong></span></div>`;
}

async function fatLiquidar(id) {
  if (!confirm("Marcar esta fatura como liquidada (paga)?")) return;
  const { error } = await sb.from("oct_faturas").update({ status: "liquidada", liquidado_em: new Date().toISOString() }).eq("id", id);
  if (error) { alert("Erro: " + error.message); return; }
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
