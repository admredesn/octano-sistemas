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
  // SAÍDA = tudo que saiu da bomba (regra imutável, Ronan 19/08): fonte é a
  // PISTA (oct_pdv_abastecimentos), não oct_pdv_vendas.itens.dados — esse
  // só existia p/ vendas nativas do PDV e via 26 L onde a pista tinha 1.714
  // (bug 20/08, batido contra o TecnoX). Aferição (tipo=afericao) fica de fora.
  // FUSO: data_abast é hora local com +00:00 falso → o dia sai direto do
  // prefixo (slice 0-10), sem reconverter.
  const saida = {}; // { tanqueId: { 'YYYY-MM-DD': litros } }
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from("oct_pdv_abastecimentos")
      .select("tanque_id,litros,tipo,data_abast")
      .eq("empresa_id", eid).or("tipo.is.null,tipo.neq.afericao")
      .gte("data_abast", de + "T00:00:00").lte("data_abast", ate + "T23:59:59")
      .order("data_abast").range(from, from + page - 1);
    if (error || !data || !data.length) break;
    data.forEach(a => {
      const tid = a.tanque_id; if (!tid) return;
      const dia = (a.data_abast || "").slice(0, 10);
      const lit = Number(a.litros || 0);
      (saida[tid] = saida[tid] || {})[dia] = (saida[tid][dia] || 0) + lit;
    });
    if (data.length < page) break;
    from += page;
  }
  return saida;
}

// MEDIÇÃO FÍSICA por tanque/dia = ÚLTIMA leitura da sonda do dia (oct_medicoes).
// É a mesma régua do TecnoX ("Medição"), só que automática — lá alguém digita
// a régua, e foi assim que o tanque 1 do Tijuco passou dias com ~7.000 L
// fantasma no livro (20/08: sonda 1.400 × TecnoX 8.376, corrigido só na
// descarga seguinte). Aqui a leitura vem da sonda, sem digitação.
async function _lmcMedicaoPorTanqueDia(eid, de, ate) {
  const out = {};   // { tanqueNumero: { dia: litros } }
  let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from("oct_medicoes")
      .select("tanque_numero,volume,medido_em").eq("empresa_id", eid)
      .gte("medido_em", de + "T00:00:00").lte("medido_em", ate + "T23:59:59")
      .order("medido_em").range(from, from + page - 1);
    if (error || !data || !data.length) break;
    data.forEach(m => {
      const dia = (m.medido_em || "").slice(0, 10);
      const t = m.tanque_numero;
      if (t == null || !dia) return;
      (out[t] = out[t] || {})[dia] = Number(m.volume || 0);   // ordenado: fica a ÚLTIMA
    });
    if (data.length < page) break;
    from += page;
  }
  return out;
}

// ENTRADA por tanque/dia a partir das NF-e de entrada já importadas.
// GOTCHA (21/08): oct_nfe_entrada_itens NÃO tem tanque_id — o vínculo é
// item.produto_id → oct_produtos.tanque_id. E a data usada é a EMISSÃO, não
// o campo `entrada`: a nota é lançada no dia seguinte (entrada = emissão+1),
// enquanto a descarga física (o salto da sonda) acontece no dia da emissão —
// era assim que a entrada caía um dia depois da medição que a comprova.
async function _lmcEntradaNfePorTanqueDia(eid, de, ate) {
  const out = {};   // { tanqueId: { dia: litros } }
  try {
    const [rProd, rNf] = await Promise.all([
      sb.from("oct_produtos").select("id,tanque_id").eq("empresa_id", eid),
      sb.from("oct_nfe_entrada").select("id,emissao,entrada").eq("empresa_id", eid)
        .gte("emissao", de).lte("emissao", ate),
    ]);
    const tqDoProduto = {};
    (rProd.data || []).forEach(p => { if (p.tanque_id) tqDoProduto[p.id] = p.tanque_id; });
    const notas = rNf.data || [];
    if (!notas.length) return out;
    const { data: itens } = await sb.from("oct_nfe_entrada_itens")
      .select("nfe_id,produto_id,quantidade")
      .in("nfe_id", notas.map(n => n.id));
    const diaDaNota = {};
    notas.forEach(n => { diaDaNota[n.id] = String(n.emissao || n.entrada || "").slice(0, 10); });
    (itens || []).forEach(it => {
      const tid = tqDoProduto[it.produto_id];
      const dia = diaDaNota[it.nfe_id];
      if (!tid || !dia) return;
      (out[tid] = out[tid] || {})[dia] = (out[tid][dia] || 0) + Number(it.quantidade || 0);
    });
  } catch (e) { /* sem vínculo produto→tanque: livro segue com entrada manual */ }
  return out;
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
  const medSonda = await _lmcMedicaoPorTanqueDia(eid, de, ate);   // histórico da sonda
  const entNfe = await _lmcEntradaNfePorTanqueDia(eid, de, ate);  // descargas com NF-e
  window._lmcTanques = tanques;

  // indexa lançamentos persistidos por tanque+dia (entrada manual e medição salva)
  // CONSOLIDA DUPLICATAS (21/08): oct_lmc não tem chave única por tanque+dia e
  // dois processos gravam o mesmo dia (um a medição, outro a entrada da
  // descarga) — 11 dias duplicados só no Tijuco. Sem consolidar, a última
  // linha lida vencia e a ENTRADA da descarga sumia do livro (ou aparecia
  // sozinha, sem medição). Régua: soma as entradas, mantém a medição informada.
  const persist = {}; // tid -> dia -> {entrada, medicao, observacoes, id}
  lmcRows.forEach(r => {
    const porTanque = (persist[r.tanque_id] = persist[r.tanque_id] || {});
    const atual = porTanque[r.data];
    if (!atual) {
      porTanque[r.data] = { entrada: Number(r.entrada || 0), medicao: r.medicao,
                            observacoes: r.observacoes, id: r.id, saldo_final: r.saldo_final };
      return;
    }
    atual.entrada = Number(atual.entrada || 0) + Number(r.entrada || 0);
    if (atual.medicao == null || Number(atual.medicao) <= 0) atual.medicao = r.medicao;
    if (!atual.observacoes) atual.observacoes = r.observacoes;
    atual._duplicado = true;
  });

  // SALDO DE ABERTURA por tanque:
  //   1º) último saldo_final persistido no livro ANTES do período (o correto
  //       quando o livro já vem sendo fechado dia a dia);
  //   2º) senão, a PRIMEIRA MEDIÇÃO DA SONDA do período — o estoque físico real
  //       no início (é o "estoque inicial" do TecnoX).
  // Antes caía em ZERO e o saldo escritural nascia NEGATIVO (−977, −2.608...),
  // com a coluna Diferença carregando o saldo que faltava (bug visto 21/08).
  const abertura = {};
  tanques.forEach(t => {
    let melhor = null;
    lmcRows.filter(r => r.tanque_id === t.id && r.data < de).forEach(r => { if (!melhor || r.data > melhor.data) melhor = r; });
    // saldo_final persistido só serve se for POSITIVO: há linhas antigas
    // gravadas com 0 (o mesmo defeito da duplicata), e aceitar zero fazia o
    // livro nascer sem estoque e ir para o negativo.
    if (melhor && Number(melhor.saldo_final || 0) > 0) { abertura[t.id] = Number(melhor.saldo_final); return; }
    const porDia = medSonda[t.numero] || {};
    const primeiroDia = Object.keys(porDia).sort()[0];
    // a abertura é o estoque ANTES do movimento do 1º dia: medição do dia
    // + o que saiu nele − o que entrou nele
    if (primeiroDia != null) {
      const saiDia = Number(((saida[t.id] || {})[primeiroDia]) || 0);
      const entDia = Number(((entNfe[t.id] || {})[primeiroDia]) || 0);
      abertura[t.id] = Number(porDia[primeiroDia] || 0) + saiDia - entDia;
    } else {
      abertura[t.id] = 0;
    }
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
      // ENTRADA: lançamento manual do livro OU a NF-e de entrada daquele dia
      // (20/08 — antes só entrava o que alguém digitasse, e a descarga com nota
      // ficava fora do livro).
      // ENTRADA — a NF-e MANDA (21/08). Regra descoberta na marra:
      //   • a NF-e traz o combustível certo e vai para o tanque certo
      //     (item.produto_id → oct_produtos.tanque_id);
      //   • o lançamento manual do oct_lmc é frágil: no Florestal as 4 notas de
      //     um mesmo dia (gasolina+etanol+2 dieseis) estavam TODAS gravadas no
      //     tanque 1, o que dava 20.000 L de entrada num tanque de 15.000;
      //   • então: havendo NF-e para o tanque/dia, ela é a entrada. O manual só
      //     vale quando NÃO há nota naquele tanque em D±2 (descarga sem nota
      //     lançada ainda) — e nunca se soma aos dois.
      const entNf = Number(((entNfe[t.id] || {})[dia]) || 0);
      const entMan = Number(pr.entrada || 0);
      let ent = entNf;
      if (!entNf && entMan > 0) {
        const temNotaPerto = Object.keys(entNfe[t.id] || {}).some(d2 => {
          const dd = Math.abs((new Date(d2 + "T12:00:00") - new Date(dia + "T12:00:00")) / 86400e3);
          return dd <= 2;
        });
        if (!temNotaPerto) ent = entMan;
      }
      const sai = Number((saida[t.id] || {})[dia] || 0);
      saldo = saldo + ent - sai;
      // MEDIÇÃO: manual do livro > última leitura da SONDA daquele dia > sonda
      // de agora (só p/ hoje). Antes a sonda só valia p/ HOJE — nos dias
      // anteriores a coluna ficava vazia mesmo com o histórico todo gravado
      // em oct_medicoes, e o livro não conseguia acusar diferença nenhuma.
      let med = (pr.medicao != null && Number(pr.medicao) > 0) ? Number(pr.medicao)
        : (((medSonda[t.numero] || {})[dia] != null) ? Number(medSonda[t.numero][dia])
        : (dia === hoje && t.medicao_ativa && t.volume_sonda != null ? Number(t.volume_sonda) : null));
      const dif = (med != null) ? (med - saldo) : null;
      if (ent === 0 && sai === 0 && med == null) return; // pula dia sem movimento
      linhas.push({ tanque: t, dia, saldo, medicao: med, diferenca: dif, entrada: ent, saida: sai, obs: pr.observacoes || "", persistId: pr.id || null });
    });
  });
  // ordena por DATA (todo o movimento do dia junto), depois por tanque —
  // facilita ler o movimento diário (antes agrupava por produto/tanque)
  linhas.sort((a, b) => a.dia === b.dia
    ? (Number(a.tanque.numero) || 0) - (Number(b.tanque.numero) || 0)
    : a.dia.localeCompare(b.dia));
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
