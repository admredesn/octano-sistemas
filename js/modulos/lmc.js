// ============================================================
// MÓDULO LMC — Livro de Movimentação de Combustíveis (réplica TecnoX)
// Gera o LIVRO DIÁRIO automaticamente: por tanque/dia →
//   Saída  = vendas de combustível do dia (oct_pdv_vendas.itens tipo abastecimento)
//   Entrada= descargas do dia (oct_lmc.entrada, lançamento manual/NF)
//   Saldo  = saldo_anterior + entrada − saída  (livro)
//   Medição= leitura física (oct_lmc.medicao salvo, ou sonda do tanque p/ hoje)
//   Diferença = medição − saldo
// Layout dark (padrão octano), colunas iguais ao TecnoX.
// ============================================================

const _LMC_CORES = { "GASOLINA COMUM": "#fbbf24", "GASOLINA ADITIVADA": "#f97316", "GASOLINA ADT": "#f97316", "ETANOL": "#4caf50", "DIESEL S10": "#60a5fa", "DIESEL S500": "#3b82f6", "GNV": "#a78bfa" };
function _lmcCor(c) { return _LMC_CORES[(c || "").toUpperCase()] || "#9aa"; }
function _lmc3(v) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function _lmcEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function _lmcData(d) { return d ? d.split("-").reverse().join("/") : ""; }
function _lmcHoje() { return new Date().toISOString().slice(0, 10); }

async function moduloLmc() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = "<p style='color:#888;padding:20px'>Carregando LMC...</p>";
  const session = await getSession();
  const { data: perfil } = await sb.from("oct_perfis").select("empresa_id,oct_empresas(*)").eq("id", session.user.id).single();
  const eid = (typeof empresaAtiva === "function") ? empresaAtiva() : perfil?.empresa_id;
  if (!eid) { conteudo.innerHTML = "<p style='color:#f44;padding:20px'>Configure sua empresa.</p>"; return; }
  let empresa = perfil?.oct_empresas;
  if (typeof empresaAtiva === "function" && eid) { const r = await sb.from("oct_empresas").select("*").eq("id", eid).single(); if (r.data) empresa = r.data; }
  window._lmcEid = eid; window._lmcEmpresa = empresa;
  if (!window._lmcDe || !window._lmcAte) {
    const h = _lmcHoje(); window._lmcDe = h.slice(0, 8) + "01"; window._lmcAte = h;
  }
  await _lmcRender();
}

// busca todas as vendas do período (paginado) e agrega saída por tanque/dia
async function _lmcSaidaPorTanqueDia(eid, de, ate) {
  const saida = {}; // { tanqueId: { 'YYYY-MM-DD': litros } }
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from("oct_pdv_vendas")
      .select("data_venda,itens,status")
      .eq("empresa_id", eid).gte("data_venda", de + "T00:00:00").lte("data_venda", ate + "T23:59:59")
      .order("data_venda").range(from, from + page - 1);
    if (error || !data || !data.length) break;
    data.forEach(v => {
      if (String(v.status || "").toLowerCase() === "cancelada") return;
      const dia = (v.data_venda || "").slice(0, 10);
      (v.itens || []).forEach(it => {
        if (it.tipo !== "abastecimento") return;
        const dd = it.dados || {};
        const tid = dd.tanque_id; if (!tid) return;
        const lit = Number(dd.litros || it.qtd || 0);
        (saida[tid] = saida[tid] || {})[dia] = (saida[tid][dia] || 0) + lit;
      });
    });
    if (data.length < page) break;
    from += page;
  }
  return saida;
}

// gera as linhas do livro (por tanque/dia) para o período
async function _lmcGerarLivro() {
  const eid = window._lmcEid, de = window._lmcDe, ate = window._lmcAte;
  const [tqRes, lmcRes] = await Promise.all([
    sb.from("oct_tanques").select("id,numero,combustivel,volume_sonda,medicao_ativa,medido_em").eq("empresa_id", eid).order("numero"),
    sb.from("oct_lmc").select("*").eq("empresa_id", eid).order("data"),
  ]);
  const tanques = tqRes.data || [];
  const lmcRows = lmcRes.data || [];
  const saida = await _lmcSaidaPorTanqueDia(eid, de, ate);
  window._lmcTanques = tanques;

  // indexa lançamentos persistidos por tanque+dia (entrada manual e medição salva)
  const persist = {}; // tid -> dia -> row
  lmcRows.forEach(r => { (persist[r.tanque_id] = persist[r.tanque_id] || {})[r.data] = r; });

  // saldo de abertura por tanque = último saldo_final persistido ANTES de 'de' (senão 0)
  const abertura = {};
  tanques.forEach(t => {
    let melhor = null;
    lmcRows.filter(r => r.tanque_id === t.id && r.data < de).forEach(r => { if (!melhor || r.data > melhor.data) melhor = r; });
    abertura[t.id] = melhor ? Number(melhor.saldo_final || 0) : 0;
  });

  // dias do período
  const dias = [];
  for (let d = new Date(de + "T12:00:00"); d <= new Date(ate + "T12:00:00"); d.setDate(d.getDate() + 1)) dias.push(d.toISOString().slice(0, 10));
  const hoje = _lmcHoje();

  const linhas = [];
  tanques.forEach(t => {
    let saldo = abertura[t.id];
    dias.forEach(dia => {
      const pr = (persist[t.id] || {})[dia] || {};
      const ent = Number(pr.entrada || 0);
      const sai = Number((saida[t.id] || {})[dia] || 0);
      saldo = saldo + ent - sai;
      // medição: salva no lmc; senão, se hoje e sonda ativa, usa a sonda
      let med = (pr.medicao != null && Number(pr.medicao) > 0) ? Number(pr.medicao)
        : (dia === hoje && t.medicao_ativa && t.volume_sonda != null ? Number(t.volume_sonda) : null);
      const dif = (med != null) ? (med - saldo) : null;
      if (ent === 0 && sai === 0 && med == null) return; // pula dia sem movimento
      linhas.push({ tanque: t, dia, saldo, medicao: med, diferenca: dif, entrada: ent, saida: sai, obs: pr.observacoes || "", persistId: pr.id || null });
    });
  });
  return { tanques, linhas };
}

async function _lmcRender() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = "<p style='color:#888;padding:20px'>Gerando livro diário...</p>";
  const { tanques, linhas } = await _lmcGerarLivro();
  window._lmcLinhas = linhas;

  const tOpts = "<option value=''>TODOS</option>" + tanques.map(t => `<option value='${t.id}'>T${t.numero} - ${_lmcEsc(t.combustivel)}</option>`).join("");
  const combustiveis = [...new Set(tanques.map(t => t.combustivel))];
  const iOpts = "<option value=''>TODOS</option>" + combustiveis.map(c => `<option value='${_lmcEsc(c)}'>${_lmcEsc(c)}</option>`).join("");

  conteudo.innerHTML = `
    ${_lmcEstilo()}
    <div class="lmc-janela">
      <div class="lmc-titbar">⛽ LMC — Livro de Movimentação de Combustíveis</div>
      <div class="lmc-filtros">
        <span>Tanque:</span>
        <select id="lmc-f-tanque" onchange="_lmcAplicar()" class="lmc-sel">${tOpts}</select>
        <span>Item:</span>
        <select id="lmc-f-item" onchange="_lmcAplicar()" class="lmc-sel">${iOpts}</select>
        <span>Período:</span>
        <input type="date" id="lmc-de" value="${window._lmcDe}" class="lmc-inp">
        <span>até</span>
        <input type="date" id="lmc-ate" value="${window._lmcAte}" class="lmc-inp">
        <button class="lmc-btn azul" onclick="_lmcPesquisar()">🔍 Pesquisar</button>
      </div>
      <div class="lmc-gridwrap"><table class="lmc-grid" id="lmc-tabela"></table></div>
      <div class="lmc-rodape">
        <button class="lmc-btn" onclick="_lmcFormEntrada()">➕ F1 - Lançar Descarga</button>
        <button class="lmc-btn" onclick="_lmcRelMedicoes()">📏 F3 - Relatório de Medições</button>
        <button class="lmc-btn" onclick="_lmcSalvarLivro()">💾 Salvar Livro do Período</button>
        <button class="lmc-btn" onclick="_lmcImprimir()">🖨️ F5 - Imprimir Livro</button>
      </div>
      <div id="lmc-form" style="display:none"></div>
    </div>`;
  _lmcAplicar();
}

function _lmcPesquisar() {
  const de = document.getElementById("lmc-de")?.value, ate = document.getElementById("lmc-ate")?.value;
  if (de) window._lmcDe = de; if (ate) window._lmcAte = ate; _lmcRender();
}

function _lmcAplicar() {
  const tid = document.getElementById("lmc-f-tanque")?.value || "";
  const item = document.getElementById("lmc-f-item")?.value || "";
  let ls = window._lmcLinhas || [];
  if (tid) ls = ls.filter(l => l.tanque.id === tid);
  if (item) ls = ls.filter(l => l.tanque.combustivel === item);
  const tb = document.getElementById("lmc-tabela"); if (!tb) return;
  const rows = ls.map(l => {
    const cor = _lmcCor(l.tanque.combustivel);
    const difTxt = l.diferenca == null ? "<span style='color:#5a6472'>—</span>"
      : `<span style="color:${l.diferenca < -0.001 ? "#f87171" : l.diferenca > 0.001 ? "#4ade80" : "#9aa"}">${_lmc3(l.diferenca)}</span>`;
    const medTxt = l.medicao == null ? "<span style='color:#5a6472'>—</span>" : _lmc3(l.medicao);
    return `<tr>
      <td class="lmc-td"><span style="color:${cor};font-weight:600">${_lmcEsc(l.tanque.combustivel)}</span></td>
      <td class="lmc-td" style="text-align:center">${String(l.tanque.numero).padStart(2, "0")}</td>
      <td class="lmc-td">${_lmcData(l.dia)}</td>
      <td class="lmc-td lmc-r">${_lmc3(l.saldo)}</td>
      <td class="lmc-td lmc-r">${medTxt}</td>
      <td class="lmc-td lmc-r">${difTxt}</td>
      <td class="lmc-td lmc-r">${l.entrada > 0 ? _lmc3(l.entrada) : "0,000"}</td>
      <td class="lmc-td">${_lmcEsc(l.obs)}</td>
    </tr>`;
  }).join("");
  tb.innerHTML = `
    <thead><tr>
      <th>Combustível</th><th>Tanque</th><th>Data</th>
      <th class="lmc-r">Saldo</th><th class="lmc-r">Medição</th><th class="lmc-r">Diferença</th><th class="lmc-r">Entrada</th><th>Obs</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8" style="padding:22px;text-align:center;color:#666">Nenhum movimento no período.</td></tr>'}</tbody>`;
}

// ---- lançar descarga (entrada) ----
function _lmcFormEntrada() {
  const div = document.getElementById("lmc-form"); div.style.display = "block"; div.scrollIntoView({ behavior: "smooth" });
  const tOpts = "<option value=''>Selecione...</option>" + (window._lmcTanques || []).map(t => `<option value='${t.id}'>T${t.numero} - ${_lmcEsc(t.combustivel)}</option>`).join("");
  div.innerHTML = `<div class="lmc-card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="color:#f97316;margin:0">➕ Lançar Descarga (entrada) / Medição</h3>
      <button onclick="document.getElementById('lmc-form').style.display='none'" style="background:none;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;max-width:760px">
      <div><label class="lmc-lbl">Data *</label><input id="lmc-i-data" type="date" value="${_lmcHoje()}" class="lmc-inp2"></div>
      <div><label class="lmc-lbl">Tanque *</label><select id="lmc-i-tanque" class="lmc-inp2">${tOpts}</select></div>
      <div><label class="lmc-lbl">Entrada (L)</label><input id="lmc-i-entrada" type="number" step="0.001" placeholder="0,000" class="lmc-inp2"></div>
      <div><label class="lmc-lbl">Medição física (L)</label><input id="lmc-i-medicao" type="number" step="0.001" placeholder="opcional" class="lmc-inp2"></div>
      <div style="grid-column:1/-1"><label class="lmc-lbl">Observação (NF, etc.)</label><input id="lmc-i-obs" type="text" class="lmc-inp2" style="width:100%"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
      <button class="lmc-btn azul" onclick="_lmcSalvarEntrada()">Salvar lançamento</button>
      <button class="lmc-btn" onclick="document.getElementById('lmc-form').style.display='none'">Cancelar</button>
      <span id="lmc-i-msg" style="font-size:0.82rem"></span>
    </div></div>`;
}

async function _lmcSalvarEntrada() {
  const msg = document.getElementById("lmc-i-msg");
  const data = document.getElementById("lmc-i-data").value;
  const tid = document.getElementById("lmc-i-tanque").value;
  const ent = parseFloat(document.getElementById("lmc-i-entrada").value) || 0;
  const med = parseFloat(document.getElementById("lmc-i-medicao").value) || 0;
  const obs = document.getElementById("lmc-i-obs").value.trim();
  if (!data || !tid || (!ent && !med)) { msg.textContent = "Informe tanque, data e entrada ou medição."; msg.style.color = "#f87171"; return; }
  msg.textContent = "Salvando..."; msg.style.color = "#9aa";
  // procura linha existente (tanque+data) para atualizar; senão insere
  const { data: ex } = await sb.from("oct_lmc").select("id,entrada,medicao").eq("empresa_id", window._lmcEid).eq("tanque_id", tid).eq("data", data).limit(1);
  const patch = {};
  if (ent) patch.entrada = ent;
  if (med) patch.medicao = med;
  if (obs) patch.observacoes = obs;
  let err;
  if (ex && ex.length) ({ error: err } = await sb.from("oct_lmc").update(patch).eq("id", ex[0].id));
  else ({ error: err } = await sb.from("oct_lmc").insert({ empresa_id: window._lmcEid, tanque_id: tid, data, entrada: ent, medicao: med, saida: 0, saldo_anterior: 0, saldo_final: 0, observacoes: obs }));
  if (err) { msg.textContent = "Erro: " + err.message; msg.style.color = "#f87171"; return; }
  msg.textContent = "Salvo!"; msg.style.color = "#4ade80";
  setTimeout(() => moduloLmc(), 600);
}

// salva as linhas geradas (saldo/saída/medição/diferença) em oct_lmc — preserva entrada manual
async function _lmcSalvarLivro() {
  if (!confirm("Gravar o livro do período em oct_lmc (uma linha por tanque/dia)? A medição de hoje é capturada da sonda.")) return;
  const linhas = window._lmcLinhas || [];
  let ok = 0;
  for (const l of linhas) {
    const rec = { empresa_id: window._lmcEid, tanque_id: l.tanque.id, data: l.dia, entrada: l.entrada, saida: l.saida, saldo_final: l.saldo, medicao: l.medicao || 0, diferenca: l.diferenca || 0, observacoes: l.obs || "" };
    let err;
    if (l.persistId) ({ error: err } = await sb.from("oct_lmc").update(rec).eq("id", l.persistId));
    else ({ error: err } = await sb.from("oct_lmc").insert(rec));
    if (!err) ok++;
  }
  alert(`Livro salvo: ${ok}/${linhas.length} linhas gravadas.`);
  moduloLmc();
}

function _lmcRelMedicoes() {
  const ls = (window._lmcLinhas || []).filter(l => l.medicao != null);
  const rows = ls.map(l => `<tr><td class="lmc-td">${_lmcData(l.dia)}</td><td class="lmc-td">T${l.tanque.numero} ${_lmcEsc(l.tanque.combustivel)}</td>
    <td class="lmc-td lmc-r">${_lmc3(l.saldo)}</td><td class="lmc-td lmc-r">${_lmc3(l.medicao)}</td>
    <td class="lmc-td lmc-r" style="color:${l.diferenca < 0 ? "#f87171" : "#4ade80"}">${_lmc3(l.diferenca)}</td></tr>`).join("");
  _lmcModal("Relatório de Medições", `<table class="lmc-grid"><thead><tr><th>Data</th><th>Tanque</th><th class="lmc-r">Saldo</th><th class="lmc-r">Medição</th><th class="lmc-r">Diferença</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="padding:18px;text-align:center;color:#666">Sem medições no período.</td></tr>'}</tbody></table>`);
}

function _lmcImprimir() {
  const emp = window._lmcEmpresa || {};
  const ls = window._lmcLinhas || [];
  let txt = "LMC - LIVRO DE MOVIMENTACAO DE COMBUSTIVEIS\n";
  txt += (emp.nome || emp.razao_social || "") + " | CNPJ: " + (emp.cnpj || "") + "\n";
  txt += "Periodo: " + _lmcData(window._lmcDe) + " a " + _lmcData(window._lmcAte) + "\n\n";
  txt += "DATA".padEnd(12) + "COMBUSTIVEL".padEnd(20) + "TQ".padEnd(4) + "SALDO".padStart(14) + "MEDICAO".padStart(14) + "DIFERENCA".padStart(14) + "ENTRADA".padStart(14) + "\n";
  ls.forEach(l => {
    txt += _lmcData(l.dia).padEnd(12) + (l.tanque.combustivel || "").padEnd(20) + String(l.tanque.numero).padEnd(4) +
      _lmc3(l.saldo).padStart(14) + (l.medicao == null ? "-" : _lmc3(l.medicao)).padStart(14) +
      (l.diferenca == null ? "-" : _lmc3(l.diferenca)).padStart(14) + _lmc3(l.entrada).padStart(14) + "\n";
  });
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "LMC.txt"; a.click(); URL.revokeObjectURL(a.href);
}

function _lmcModal(titulo, html) {
  let m = document.getElementById("lmc-modal");
  if (!m) { m = document.createElement("div"); m.id = "lmc-modal"; document.body.appendChild(m); }
  m.innerHTML = `<div class="lmc-modal-bg" onclick="document.getElementById('lmc-modal').remove()"></div>
    <div class="lmc-modal-cx"><div class="lmc-modal-tit">${_lmcEsc(titulo)}<span onclick="document.getElementById('lmc-modal').remove()" style="cursor:pointer;float:right">✕</span></div>
    <div style="padding:12px">${html}</div></div>`;
}

function _lmcEstilo() {
  return `<style>
  .lmc-janela{background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;margin:16px;color:#dbe2ea;font-size:12px;overflow:hidden}
  .lmc-titbar{background:#13151f;color:#f97316;padding:11px 16px;font-weight:600;font-size:15px;border-bottom:1px solid #2a2d3e}
  .lmc-filtros{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#13151f;border-bottom:1px solid #2a2d3e;color:#9aa}
  .lmc-sel,.lmc-inp{border:1px solid #2a2d3e;border-radius:6px;padding:6px 9px;font-size:12px;background:#0b0d14;color:#e5e7eb}
  .lmc-btn{background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:7px 12px;font-size:12px;color:#c7d0dc;cursor:pointer}
  .lmc-btn:hover{background:#242c3e;color:#fff}
  .lmc-btn.azul{background:#f97316;color:#fff;border-color:#f97316}.lmc-btn.azul:hover{background:#ea6a0c}
  .lmc-gridwrap{overflow:auto;max-height:64vh;background:#0f1119}
  .lmc-grid{width:100%;border-collapse:collapse;font-size:12px;color:#cdd6e0}
  .lmc-grid th{background:#1a1d2e;color:#9fb0c4;text-align:left;padding:8px;border-bottom:1px solid #2a2d3e;position:sticky;top:0;white-space:nowrap}
  .lmc-td{padding:6px 8px;border-bottom:1px solid #1c2130;white-space:nowrap}
  .lmc-r{text-align:right;font-variant-numeric:tabular-nums}
  .lmc-grid tbody tr:nth-child(even){background:#141824}
  .lmc-rodape{display:flex;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#13151f;border-top:1px solid #2a2d3e}
  .lmc-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin:12px}
  .lmc-lbl{display:block;color:#8aa;font-size:11px;margin-bottom:4px}
  .lmc-inp2{border:1px solid #2a2d3e;border-radius:6px;padding:7px 9px;font-size:12px;background:#0b0d14;color:#e5e7eb;box-sizing:border-box}
  #lmc-modal .lmc-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998}
  #lmc-modal .lmc-modal-cx{position:fixed;top:8vh;left:50%;transform:translateX(-50%);width:min(700px,92vw);max-height:80vh;overflow:auto;background:#13151f;border:1px solid #2a2d3e;border-radius:12px;z-index:9999}
  #lmc-modal .lmc-modal-tit{background:#1a1d2e;color:#f97316;padding:10px 16px;font-weight:600;border-radius:12px 12px 0 0}
  </style>`;
}
