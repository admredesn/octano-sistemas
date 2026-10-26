// ============================================================
// CUPOM → NF-e (retaguarda) — 26/10/2026
// Ronan: "emitir a nota fiscal de cupons pelo retaguarda ... um campo que dá para pesquisar todos os cupons emitidos
// para um cliente, que dê para filtrar por forma de pagamento, produto e data, e que ele não fique disponível uma vez
// que já tenha sido transformado em nota fiscal".
//
// Escolhe os cupons (NFC-e do Octano) de UM cliente e sai UMA NF-e modelo 55, CFOP 5929 ("LANC DOC FISCAL REGISTRADO
// EM ECF"), na regra da NF-e de cupom do PDV (prazo_nfe.js, molde TecnoX AC): CST 61 combustível (grupo <comb>), 60
// etanol e loja com ST, 90 o resto; PIS/COFINS 49; pagamento 90 / R$ 0,00 (o pagamento está no cupom); itens agrupados
// por produto + preço como a NF-e consolidada do Faturar. NFref + "REFERENTE AOS CUPONS" só dos cupons de PRODUÇÃO
// (cupom de homologação: a nota sai inteira, sem apontar o cupom — decisão do Ronan de 17/10).
// Ambiente/série/numeração da NF-e: os do Faturar (_fatNfeConfig: oct_parametros nfe_producao/nfe_serie/
// nfe_ultimo_numero). Certificado no servidor (/emitir-empresa): o navegador não manuseia o A1.
// JÁ VIROU NF-e = oct_nfe_cupons (SQL-NFE-CUPONS.sql): esta tela grava os cupons da nota; o banco liga sozinho os
// cupons das NF-e do PDV e do Faturar (NFref, valor) e das faturas com NF-e. Cupom ligado a NF-e de produção (ou do
// ambiente atual) some da lista; NF-e cancelada solta o cupom.
// ============================================================

const _NCUP_FORMAS = { "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito",
                       "05": "A prazo / crédito", "10": "Vale alimentação", "15": "Boleto", "17": "Pix", "99": "Outros" };
const _NCUP_MAX_REFS = 500;   // NF-e: no máximo 500 NFref
window._ncup = window._ncup || { sel: new Set() };

function _ncupSefaz() { return (typeof SEFAZ_URL !== "undefined" && SEFAZ_URL) || "https://www.redesn.com.br"; }
function _ncupEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function _ncupMoney(v) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _ncupDig(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
// texto que vai cru no XML do servidor (nome, endereço, produto): sem & < > " ' e no tamanho do campo
function _ncupTxt(s, max) { return String(s == null ? "" : s).replace(/&/g, "E").replace(/[<>"']/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 60); }
function _ncupNorm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim(); }
// data NO BRASIL (toISOString vira o dia às 21h)
function _ncupDia(d) {
  const p = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d || new Date()).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
function _ncupHora(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function _ncupDocFmt(d) {
  d = _ncupDig(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}
// filtro de pagamento pelo que a forma É, não só pelo código: há cupom "NOTA A PRAZO" gravado com o código 01 (o do
// dinheiro), cartão frota é 03 e o nome varia de posto para posto (CARTÃO DE DEBITO / DEBITO / 04)
function _ncupFormaCat(p) {
  const n = _ncupNorm(p.nome), c = String(p.forma || "").padStart(2, "0");
  if (/PRAZO/.test(n)) return "A prazo (nota)";
  if (/FROTA/.test(n)) return "Cartão frota";
  if (c === "02" || /CHEQUE/.test(n)) return "Cheque";
  if (/CREDITO DO CLIENTE|HAVER|\bVALE\b/.test(n)) return "Crédito do cliente / vale";
  if (c === "17" || /PIX/.test(n)) return "Pix";
  if (c === "03" || /CREDITO/.test(n)) return "Cartão de crédito";
  if (c === "04" || /DEBITO/.test(n)) return "Cartão de débito";
  if (c === "01" || /DINHEIRO/.test(n)) return "Dinheiro";
  if (c === "05") return "A prazo (nota)";
  return p.nome || _NCUP_FORMAS[c] || "Outros";
}
function _ncupFormas(v) { return (Array.isArray(v.pagamentos) ? v.pagamentos : []).map(_ncupFormaCat); }
function _ncupFormasTxt(v) {
  return (Array.isArray(v.pagamentos) ? v.pagamentos : []).map(p => p.nome || _NCUP_FORMAS[String(p.forma || "").padStart(2, "0")] || p.forma || "?").join(" + ");
}

// ---------- a NF-e (pura: dá para testar fora do navegador) ----------
// vendas     linhas de oct_pdv_vendas (itens, nfce_chave, numero, valor_total, placa)
// dest       { doc, nome, ie, logradouro, numero, bairro, municipio, uf, cep, c_mun }
// cfg        _fatNfeConfig()   prodSet  chaves dos cupons autorizados em PRODUÇÃO (entram na referência)
// emp        oct_empresas      prods    oct_produtos do posto (completa o fiscal que o cupom não gravou)
function _ncupMontarNota(vendas, dest, cfg, prodSet, emp, prods) {
  const prod = cfg.ambiente === "producao";
  const _cst = c => String(c || "").replace(/^0(?=\d\d$)/, "");
  // o cupom guarda o retrato fiscal da venda; o que faltar vem do cadastro: pelo código, pelo id do produto e — só o %
  // de biodiesel/etanol anidro — pelo código ANP (Florestal 26/10: diesel S500 vendido com o código antigo ODMB, que
  // não existe mais; o mesmo diesel é o "6" do cadastro, com 13%; sem o índice a SEFAZ recusa: 908)
  const porCod = {}, porId = {}, porAnp = {};
  (prods || []).forEach(p => {
    if (p.codigo != null && (!porCod[String(p.codigo)] || p.ativo !== false)) porCod[String(p.codigo)] = p;
    if (p.id) porId[p.id] = p;
    if (p.cod_anp && Number(p.perc_bio) > 0 && (!porAnp[p.cod_anp] || p.ativo !== false)) porAnp[p.cod_anp] = p;
  });
  const ordem = vendas.slice().sort((a, b) => String(a.data_venda || "").localeCompare(String(b.data_venda || "")));
  const semNcm = [], naoFecha = [], semBio = new Set(), grupos = new Map();
  ordem.forEach(v => {
    let somaV = 0;
    (Array.isArray(v.itens) ? v.itens : []).forEach(it => {
      const f = Object.assign({}, it.fiscal || {});
      [porCod[String(it.cod || "")], porId[it.produto_id], porId[f.id]].forEach(pc => {
        if (!pc) return;
        ["ncm", "cest", "unidade", "origem", "cst_icms", "aliq_icms_ad_rem", "cod_anp", "desc_anp", "perc_bio"].forEach(c => {
          if ((f[c] == null || f[c] === "") && pc[c] != null && pc[c] !== "") f[c] = pc[c];
        });
      });
      if (!(Number(f.perc_bio) > 0) && f.cod_anp && porAnp[f.cod_anp]) f.perc_bio = porAnp[f.cod_anp].perc_bio;
      const q = Number(it.qtd || 0) || 1;
      const total = Math.round(Number(it.total != null ? it.total : q * Number(it.unit || 0)) * 100) / 100;
      if (!(total > 0)) return;
      somaV += total;
      const ncm = _ncupDig(f.ncm);
      if (!ncm) { semNcm.push(`${it.desc || "item"} (cupom ${v.numero})`); return; }
      // CST como na NF-e do TecnoX da AC: 61 combustível monofásico, 60 etanol (o cadastro da AC traz 10) e loja com ST
      const c0 = _cst(f.cst_icms);
      const cst = c0 === "61" ? "61" : ((c0 === "60" || /^2207/.test(ncm)) ? "60" : "90");
      // diesel B e gasolina C: a SEFAZ exige o índice de mistura (pBio)
      if (cst === "61" && /^(8201|3201)/.test(String(f.cod_anp || "")) && !(Number(f.perc_bio) > 0)) semBio.add(it.desc || f.nome || "combustível");
      const preco = Math.round(total / q * 100) / 100;
      const ch = [String(it.cod || it.desc || ""), ncm, cst, preco.toFixed(2)].join("|");
      const g = grupos.get(ch) || { it, f, ncm, cst, q: 0, v: 0 };
      g.q += q; g.v += total;
      grupos.set(ch, g);
    });
    if (Math.abs(somaV - Number(v.valor_total || 0)) > 0.05) naoFecha.push(`cupom ${v.numero} (itens R$ ${_ncupMoney(somaV)} × cupom R$ ${_ncupMoney(v.valor_total)})`);
  });
  if (semNcm.length) throw new Error(`Item sem NCM no cadastro: ${semNcm.slice(0, 5).join("; ")}${semNcm.length > 5 ? "…" : ""}. Complete o NCM em Produtos e gere de novo.`);
  if (naoFecha.length) throw new Error(`Os itens não fecham com o valor do cupom: ${naoFecha.slice(0, 5).join("; ")}${naoFecha.length > 5 ? "…" : ""}. Tire esse(s) cupom(ns) da seleção.`);
  if (semBio.size) throw new Error(`Combustível sem o % de biodiesel/etanol anidro ("% Bio" em Produtos) no cadastro: ${Array.from(semBio).join(", ")}. Complete em Produtos e gere de novo.`);
  if (!grupos.size) throw new Error("Os cupons escolhidos não têm itens com valor.");
  const itens = [];
  grupos.forEach(g => {
    const f = g.f, cst = g.cst, ncm = g.ncm;
    const comb = (cst === "61" || /^2207/.test(ncm)) && !!f.cod_anp;   // grupo <comb>: gasolina, diesel, etanol
    const un = (cst === "61" || /^2207/.test(ncm)) ? "L" : (/^(L|LT|LTS|LITRO|LITROS)$/i.test(String(f.unidade || "")) ? "L" : (f.unidade || "UN"));
    const qCom = Math.round(g.q * 10000) / 10000, vProd = Math.round(g.v * 100) / 100;
    itens.push({
      nItem: itens.length + 1, cProd: String(g.it.cod || "") || ("ITEM" + (itens.length + 1)), xProd: _ncupTxt(g.it.desc || f.nome || "ITEM", 120),
      cEAN: "SEM GTIN", cEANTrib: "SEM GTIN",
      ncm, cest: f.cest || null, cfop: "5929",
      uCom: un, uTrib: un,
      qCom, vUnCom: vProd / qCom, vProd, vDesc: 0,
      origem: String(f.origem || "0"),
      cst_icms: cst, aliq_icms: 0, aliq_icms_ad_rem: cst === "61" ? Number(f.aliq_icms_ad_rem || 0) : 0,
      cst_pis: "49", cst_cofins: "49", aliq_pis: 0, aliq_cofins: 0,
      ind_combustivel: comb ? "S" : "N", ind_monofasico: "N",
      // 1229: em HOMOLOGAÇÃO a SEFAZ cobra a monofasia retida no leiaute novo; em produção vai como a NF-e do TecnoX
      gmono_ret: cst === "61" && !prod,
      cod_anp: comb ? f.cod_anp : null, desc_anp: comb ? (f.desc_anp || null) : null,
      perc_bio: cst === "61" && Number(f.perc_bio) > 0 ? Number(f.perc_bio) : null, uf_cons: (emp && emp.uf) || "MG",
    });
  });
  const semAnp = itens.filter(i => i.cst_icms === "61" && !i.cod_anp).map(i => i.xProd);
  if (semAnp.length) throw new Error(`Combustível sem código ANP no cadastro: ${semAnp.join(", ")}.`);

  const e = emp || {};
  const emitente = {
    cnpj: _ncupDig(e.cnpj), nome: e.nome, ie: _ncupDig(e.ie),
    logradouro: e.endereco || "", numero: "S/N", bairro: e.bairro || "CENTRO",
    municipio: e.cidade || "", c_mun: e.c_mun || "3123205", uf: e.uf || "MG",
    cep: _ncupDig(e.cep), crt: e.regime_tributario === "simples" ? "1" : "3",
  };
  const doc = _ncupDig(dest.doc), ie = _ncupDig(dest.ie);
  const contrib = !!ie && ie !== "0" && !/isent/i.test(String(dest.ie || ""));   // IE de verdade -> contribuinte (1)
  const destinatario = {
    cnpj_cpf: doc, documento: doc, nome: _ncupTxt(dest.nome),
    logradouro: _ncupTxt(dest.logradouro), numero: _ncupTxt(dest.numero) || "S/N",
    bairro: _ncupTxt(dest.bairro) || "CENTRO",
    municipio: _ncupTxt(dest.municipio), c_mun: _ncupDig(dest.c_mun), uf: _ncupTxt(dest.uf || "MG", 2).toUpperCase(),
    cep: _ncupDig(dest.cep), ie: contrib ? ie : "", ind_ie: contrib ? "1" : "9",
  };
  const refs = [], nums = [], placas = [];
  ordem.forEach(v => {
    const ch = _ncupDig(v.nfce_chave);
    if (/^\d{44}$/.test(ch) && prodSet && prodSet.has(ch) && !refs.includes(ch)) { refs.push(ch); nums.push(String(Number(ch.slice(25, 34)))); }
    const pl = String(v.placa || (v.prazo_dados && v.prazo_dados.placa) || "").trim().toUpperCase();
    if (pl && !placas.includes(pl)) placas.push(pl);
  });
  const compl = [];
  if (nums.length === 1) compl.push("NOTA FISCAL REFERENTE A NFCE: " + nums[0]);
  else if (nums.length > 1) compl.push("NOTA FISCAL REFERENTE AOS CUPONS: " + nums.join(", "));
  if (placas.length) compl.push((placas.length > 1 ? "Placas: " : "Placa: ") + placas.slice(0, 20).join(", ") + (placas.length > 20 ? "…" : ""));
  return {
    numero: 0, serie: cfg.serie, modelo: "55",
    natureza_op: "LANC DOC FISCAL REGISTRADO EM ECF", mod_frete: "9",
    emitente, destinatario, itens, refs,
    dh_sai_ent: true, inf_ibpt: true,
    t_pag: "90",     // sem pagamento: o pagamento está no cupom (servidor manda vPag 0,00)
    inf_complementar: compl.join(" | ").slice(0, 4900),
  };
}

// ---------- tela ----------
async function moduloNfeCupons() {
  const conteudo = document.getElementById("conteudo");
  const st = window._ncup;
  const session = await getSession();
  st.usuario = (session && session.user && session.user.email) || null;
  st.eid = (typeof empresaAtiva === "function") ? empresaAtiva() : null;
  if (!st.eid) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Escolha o posto primeiro.</p>'; return; }
  if (typeof pode === "function" && !pode("nfe_saida.ver")) { conteudo.innerHTML = '<p style="color:#f87171;padding:20px">Sem permissão para NF-e de saída.</p>'; return; }
  if (st.eidTela !== st.eid) { st.vendas = null; st.sel = new Set(); st.eidTela = st.eid; }
  const { data: emp } = await sb.from("oct_empresas").select("*").eq("id", st.eid).single();
  st.emp = emp || {};
  st.cfg = (typeof _fatNfeConfig === "function") ? await _fatNfeConfig(st.eid) : { ambiente: "homologacao", serie: 1, ultimo: 0 };
  const hoje = _ncupDia();
  st.de = st.de || _ncupDia(new Date(Date.now() - 30 * 86400000));
  st.ate = st.ate || hoje;
  const prodAmb = st.cfg.ambiente === "producao";
  conteudo.innerHTML = `
    ${typeof nfeSaidaStyles === "function" ? nfeSaidaStyles() : ""}
    <style>
      .ncup-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px}
      .ncup-filtros label{display:block;font-size:0.72rem;color:#888;margin-bottom:3px}
      .ncup-filtros input,.ncup-filtros select{padding:7px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem}
      .ncup-btn{padding:8px 14px;border-radius:7px;border:1px solid #2a4a6a;background:#16304a;color:#93c5fd;cursor:pointer;font-size:0.84rem;font-weight:600}
      .ncup-btn:hover{background:#1d3d5e}
      .ncup-btn:disabled{opacity:.45;cursor:default}
      .ncup-emitir{border-color:#2a5a2a;background:#1a3a1a;color:#4ade80}
      .ncup-emitir:hover{background:#224a22}
      .ncup-tab td{white-space:nowrap}
      .ncup-tab td.ncup-itens{white-space:normal;min-width:220px;max-width:380px;color:#bbb;font-size:0.78rem}
      .ncup-tab tr.ncup-ja td{color:#666}
      .ncup-tab tr.ncup-marcado td{background:#14263a}
      .ncup-selo{font-size:0.7rem;padding:2px 7px;border-radius:9px;white-space:nowrap}
      .ncup-rodape{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;margin-top:10px;background:#1a1d2e;border:1px solid #2a2d3e;border-radius:8px}
      .ncup-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:9000;overflow:auto;padding:30px 12px}
      .ncup-caixa{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;width:100%;max-width:720px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
      .ncup-caixa h3{margin:0;color:#e0e0e0;font-size:1rem}
      .ncup-linha{display:flex;gap:10px;margin-top:9px}
      .ncup-linha > div{flex:1;min-width:0}
      .ncup-linha label{display:block;font-size:0.72rem;color:#888;margin-bottom:3px}
      .ncup-linha input{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem}
    </style>
    <div class="ns-janela">
      <div class="ns-titulo">
        <span>Movimento nota fiscal</span>
        <button onclick="navegarPara('empresa')" class="ns-fechar" title="Fechar">✕</button>
      </div>
      <div class="ns-corpo">
        <div class="ns-abas">
          <div class="ns-aba" onclick="navegarPara('nfe')"><span class="ns-aba-ico">📥</span><span>Nota fiscal de entrada</span></div>
          <div class="ns-aba" onclick="navegarPara('nfe_saida')"><span class="ns-aba-ico">📤</span><span>Nota fiscal de saída</span></div>
          <div class="ns-aba ativo"><span class="ns-aba-ico">🧾</span><span>Cupom → NF-e</span></div>
        </div>
        <div class="ns-painel">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div>
              <div style="color:#e0e0e0;font-weight:600">NF-e dos cupons de um cliente</div>
              <div style="color:#888;font-size:0.78rem;margin-top:2px">Escolha os cupons e gere uma NF-e (modelo 55, CFOP 5929) com os itens e o valor deles. Cupom que já virou NF-e sai da lista.</div>
            </div>
            <div style="font-size:0.8rem;color:#aaa">${_ncupEsc(st.emp.nome || "")} · NF-e em <b style="color:${prodAmb ? "#4ade80" : "#f59e0b"}">${prodAmb ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</b> · série ${_ncupEsc(st.cfg.serie)}</div>
          </div>
          <div class="ncup-filtros">
            <div style="flex:1;min-width:220px"><label>Cliente (nome ou CPF/CNPJ)</label><input id="ncup-cli" style="width:100%;box-sizing:border-box" placeholder="ex.: SABOR REAL ou 31960588000159" value="${_ncupEsc(st.cli || "")}"></div>
            <div><label>De</label><input id="ncup-de" type="date" value="${st.de}" max="${hoje}"></div>
            <div><label>Até</label><input id="ncup-ate" type="date" value="${st.ate}" max="${hoje}"></div>
            <div><button class="ncup-btn" onclick="ncupBuscar()">🔍 Buscar</button></div>
          </div>
          <div class="ncup-filtros">
            <div><label>Forma de pagamento</label><select id="ncup-forma" onchange="ncupFiltrar()"><option value="">Todas</option></select></div>
            <div style="min-width:220px"><label>Produto</label><select id="ncup-prod" onchange="ncupFiltrar()" style="max-width:320px"><option value="">Todos</option></select></div>
            <div style="align-self:center;padding-top:16px"><label style="display:flex;gap:6px;align-items:center;cursor:pointer;color:#aaa;font-size:0.8rem;margin:0"><input id="ncup-ja" type="checkbox" onchange="ncupFiltrar()" ${st.mostrarJa ? "checked" : ""}> mostrar os que já viraram NF-e</label></div>
          </div>
          <div id="ncup-lista"><p style="color:#888;padding:16px">Informe o cliente e/ou o período e clique em Buscar.</p></div>
          <div class="ncup-rodape">
            <div id="ncup-resumo" style="color:#aaa;font-size:0.84rem">Nenhum cupom escolhido.</div>
            <button id="ncup-gerar" class="ncup-btn ncup-emitir" onclick="ncupAbrirEmissao()" disabled>📄 Gerar NF-e</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById("ncup-cli").addEventListener("keydown", e => { if (e.key === "Enter") ncupBuscar(); });
  if (st.vendas) { _ncupMontarFiltros(); ncupFiltrar(); }
  else if (st.cli) ncupBuscar();
}

async function _ncupTodas(montar) {
  const tudo = [];
  for (let pag = 0; pag < 15; pag++) {
    const { data, error } = await montar().range(pag * 1000, pag * 1000 + 999);
    if (error) throw error;
    tudo.push(...(data || []));
    if (!data || data.length < 1000) return { linhas: tudo, cortou: false };
  }
  return { linhas: tudo, cortou: true };
}

async function ncupBuscar() {
  const st = window._ncup;
  const lista = document.getElementById("ncup-lista");
  st.cli = String((document.getElementById("ncup-cli") || {}).value || "").trim();
  st.de = (document.getElementById("ncup-de") || {}).value || st.de;
  st.ate = (document.getElementById("ncup-ate") || {}).value || st.ate;
  if (st.de > st.ate) { lista.innerHTML = '<p style="color:#f87171;padding:16px">A data inicial é depois da final.</p>'; return; }
  const dias = (new Date(st.ate) - new Date(st.de)) / 86400000;
  if (!st.cli && dias > 62) { lista.innerHTML = '<p style="color:#f59e0b;padding:16px">Sem cliente, busque no máximo 2 meses por vez.</p>'; return; }
  lista.innerHTML = '<p style="color:#888;padding:16px">Buscando os cupons…</p>';
  st.sel = new Set();
  try {
    const doc = _ncupDig(st.cli), soDigitos = !!st.cli && /^[\d.\-\/\s]+$/.test(st.cli);
    const consulta = () => {
      let q = sb.from("oct_pdv_vendas")
        .select("id,numero,data_venda,cliente_nome,cliente_cpf,valor_total,nfce_chave,status,itens,pagamentos,placa,odometro,prazo_dados")
        .eq("empresa_id", st.eid).not("nfce_chave", "is", null).neq("status", "cancelada")
        .gte("data_venda", st.de + "T00:00:00-03:00").lte("data_venda", st.ate + "T23:59:59.999-03:00")
        .order("data_venda", { ascending: false });
      if (soDigitos && doc.length >= 11) q = q.in("cliente_cpf", [doc, _ncupDocFmt(doc)]);
      else if (soDigitos && doc.length >= 3) q = q.ilike("cliente_cpf", `%${doc}%`);
      else if (st.cli) q = q.ilike("cliente_nome", `%${st.cli}%`);
      return q;
    };
    const [rv, rl, rn] = await Promise.all([
      _ncupTodas(consulta),
      _ncupTodas(() => sb.from("oct_nfe_cupons").select("cupom_chave,nfe_chave,nfe_numero,nfe_serie,ambiente,origem").eq("empresa_id", st.eid).order("criado_em")),
      sb.from("oct_nfce").select("numero,serie,ambiente,cpf_consumidor,valor_total,chave_nfe,data_emissao").eq("empresa_id", st.eid)
        .eq("modelo", "55").eq("status", "autorizada").gte("data_emissao", st.de + "T00:00:00-03:00").limit(1000),
    ]);
    st.vendas = rv.linhas.filter(v => /^\d{44}$/.test(_ncupDig(v.nfce_chave)));
    st.cortou = rv.cortou;
    st.links = {};
    rl.linhas.forEach(l => { (st.links[l.cupom_chave] = st.links[l.cupom_chave] || []).push(l); });
    const comVinculo = new Set(rl.linhas.map(l => l.nfe_chave));
    st.nfesSemVinculo = ((rn && rn.data) || []).filter(n => n.chave_nfe && !comVinculo.has(n.chave_nfe));
    _ncupMontarFiltros();
    ncupFiltrar();
  } catch (e) {
    lista.innerHTML = `<p style="color:#f87171;padding:16px">Não consegui ler os cupons: ${_ncupEsc(e.message || e)}</p>`;
  }
}

function _ncupMontarFiltros() {
  const st = window._ncup;
  const formas = new Set(), prods = new Set();
  (st.vendas || []).forEach(v => {
    _ncupFormas(v).forEach(c => formas.add(c));
    (Array.isArray(v.itens) ? v.itens : []).forEach(it => { if (it.desc) prods.add(String(it.desc)); });
  });
  const sf = document.getElementById("ncup-forma"), sp = document.getElementById("ncup-prod");
  if (sf) {
    const atual = st.forma || "";
    sf.innerHTML = '<option value="">Todas</option>' + Array.from(formas).sort()
      .map(c => `<option value="${_ncupEsc(c)}"${c === atual ? " selected" : ""}>${_ncupEsc(c)}</option>`).join("");
  }
  if (sp) {
    const atual = st.prod || "";
    sp.innerHTML = '<option value="">Todos</option>' + Array.from(prods).sort()
      .map(p => `<option value="${_ncupEsc(p)}"${p === atual ? " selected" : ""}>${_ncupEsc(p)}</option>`).join("");
  }
}

// cupom coberto por NF-e: de produção sempre; de homologação só quando o posto ainda emite NF-e em homologação
function _ncupNfeDo(v) {
  const st = window._ncup;
  const ls = (st.links && st.links[_ncupDig(v.nfce_chave)]) || [];
  return ls.find(l => l.ambiente === "producao") || ls.find(l => l.ambiente === st.cfg.ambiente) || null;
}
// NF-e do posto sem cupom ligado, mesmo cliente e mesmo valor (o banco não ligou por ter dois candidatos)
function _ncupTalvez(v) {
  const d = _ncupDig(v.cliente_cpf);
  return (window._ncup.nfesSemVinculo || []).find(n =>
    Math.abs(Number(n.valor_total) - Number(v.valor_total)) < 0.01 && (!d || _ncupDig(n.cpf_consumidor) === d)
    && String(n.data_emissao || "") >= String(v.data_venda || "")) || null;
}

function _ncupVisiveis() {
  const st = window._ncup;
  st.forma = (document.getElementById("ncup-forma") || {}).value || "";
  st.prod = (document.getElementById("ncup-prod") || {}).value || "";
  st.mostrarJa = !!(document.getElementById("ncup-ja") || {}).checked;
  return (st.vendas || []).filter(v => {
    if (st.forma && !_ncupFormas(v).includes(st.forma)) return false;
    if (st.prod && !(Array.isArray(v.itens) ? v.itens : []).some(it => String(it.desc || "") === st.prod)) return false;
    if (!st.mostrarJa && _ncupNfeDo(v)) return false;
    return true;
  });
}

function ncupFiltrar() {
  const st = window._ncup;
  const el = document.getElementById("ncup-lista");
  if (!el || !st.vendas) return;
  const vs = _ncupVisiveis();
  // o que saiu do filtro sai da seleção
  const ids = new Set(vs.filter(v => !_ncupNfeDo(v)).map(v => v.id));
  Array.from(st.sel).forEach(id => { if (!ids.has(id)) st.sel.delete(id); });
  if (!vs.length) {
    el.innerHTML = `<p style="color:#888;padding:16px">Nenhum cupom ${st.mostrarJa ? "" : "disponível "}com esses filtros.${st.vendas.length ? ` (${st.vendas.length} cupom(ns) no período, os outros não batem com o filtro ou já viraram NF-e.)` : ""}</p>`;
    _ncupResumo(); return;
  }
  const disp = vs.filter(v => !_ncupNfeDo(v));
  const tot = vs.reduce((s, v) => s + Number(v.valor_total || 0), 0);
  const MAX = 600;
  const linhas = vs.slice(0, MAX).map(v => {
    const ja = _ncupNfeDo(v), talvez = !ja && _ncupTalvez(v);
    const itens = (Array.isArray(v.itens) ? v.itens : []).map(it => `${_ncupEsc(it.desc || "")} <span style="color:#777">${Number(it.qtd || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</span>`).join(" · ");
    const marcado = st.sel.has(v.id);
    const situ = ja
      ? `<span class="ncup-selo" style="background:#0f2a0f;color:#4caf50">NF-e nº ${_ncupEsc(ja.nfe_numero || "?")}${ja.ambiente !== "producao" ? " (homolog.)" : ""}</span>`
      : (talvez ? `<span class="ncup-selo" style="background:#2a2300;color:#fbbf24" title="Há uma NF-e deste posto com o mesmo valor${_ncupDig(v.cliente_cpf) ? " e cliente" : ""} sem cupom ligado">⚠ talvez NF-e nº ${_ncupEsc(talvez.numero)}</span>` : "");
    return `<tr class="${ja ? "ncup-ja" : ""}${marcado ? " ncup-marcado" : ""}" ${ja ? "" : `onclick="ncupMarcar('${v.id}', event)" style="cursor:pointer"`}>
      <td>${ja ? "" : `<input type="checkbox" ${marcado ? "checked" : ""} onclick="event.stopPropagation();ncupMarcar('${v.id}')">`}</td>
      <td>${_ncupHora(v.data_venda)}</td>
      <td><b>${_ncupEsc(v.numero)}</b></td>
      <td title="${_ncupEsc(v.cliente_nome || "")}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${_ncupEsc(v.cliente_nome || "— sem identificação")}</td>
      <td>${_ncupEsc(_ncupDocFmt(v.cliente_cpf) || "")}</td>
      <td class="ncup-itens">${itens}</td>
      <td style="font-size:0.78rem">${_ncupEsc(_ncupFormasTxt(v))}</td>
      <td style="text-align:right;font-weight:600">${_ncupMoney(v.valor_total)}</td>
      <td>${situ}</td>
    </tr>`;
  }).join("");
  el.innerHTML = `
    <div class="ns-grid-scroll" style="max-height:56vh">
      <table class="ns-tabela ns-grid-tabela ncup-tab">
        <thead class="ns-grid-head"><tr>
          <th><input type="checkbox" title="Marcar todos os disponíveis da lista" onclick="ncupMarcarTodos(this.checked)" ${disp.length && disp.every(v => st.sel.has(v.id)) ? "checked" : ""}></th>
          <th>Data</th><th>Cupom</th><th>Cliente</th><th>CPF/CNPJ</th><th>Itens</th><th>Pagamento</th><th style="text-align:right">Valor (R$)</th><th>NF-e</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;color:#888;font-size:0.76rem;padding:6px 2px">
      <span>${vs.length} cupom(ns) · R$ ${_ncupMoney(tot)} · ${disp.length} disponível(is)${vs.length > MAX ? ` · mostrando ${MAX} — refine a busca` : ""}${st.cortou ? " · ⚠ busca cortada em 15 mil: diminua o período" : ""}</span>
      <span>A NF-e leva o cupom inteiro (todos os itens dele).</span>
    </div>`;
  _ncupResumo();
}

function ncupMarcar(id, ev) {
  const st = window._ncup;
  if (ev && ev.target && /^(INPUT|BUTTON|A)$/.test(ev.target.tagName)) return;
  if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
  ncupFiltrar();
}
function ncupMarcarTodos(marcar) {
  const st = window._ncup;
  _ncupVisiveis().filter(v => !_ncupNfeDo(v)).forEach(v => { if (marcar) st.sel.add(v.id); else st.sel.delete(v.id); });
  ncupFiltrar();
}
function _ncupSelecionados() {
  const st = window._ncup;
  return (st.vendas || []).filter(v => st.sel.has(v.id));
}
function _ncupResumo() {
  const sel = _ncupSelecionados();
  const r = document.getElementById("ncup-resumo"), b = document.getElementById("ncup-gerar");
  if (!r || !b) return;
  if (!sel.length) { r.textContent = "Nenhum cupom escolhido."; b.disabled = true; return; }
  const docs = Array.from(new Set(sel.map(v => _ncupDig(v.cliente_cpf)).filter(Boolean)));
  const tot = sel.reduce((s, v) => s + Number(v.valor_total || 0), 0);
  let aviso = "";
  if (docs.length > 1) aviso = ` <span style="color:#f87171">· cupons de ${docs.length} clientes diferentes: uma NF-e é de um cliente só</span>`;
  else if (sel.length > _NCUP_MAX_REFS) aviso = ` <span style="color:#f87171">· no máximo ${_NCUP_MAX_REFS} cupons por NF-e</span>`;
  r.innerHTML = `<b style="color:#e0e0e0">${sel.length}</b> cupom(ns) escolhido(s) · <b style="color:#4ade80">R$ ${_ncupMoney(tot)}</b>${aviso}`;
  b.disabled = docs.length > 1 || sel.length > _NCUP_MAX_REFS;
}

// ---------- destinatário + conferência ----------
function _ncupFechar() { const m = document.getElementById("ncup-modal"); if (m) m.remove(); }
function _ncupMsg(html, cor) { const el = document.getElementById("ncup-msg"); if (el) { el.style.color = cor || "#aaa"; el.innerHTML = html; } }

async function ncupAbrirEmissao() {
  if (!podeOuAvisa("nfe_saida.transmitir")) return;
  const st = window._ncup;
  const sel = _ncupSelecionados();
  if (!sel.length) return;
  const docs = Array.from(new Set(sel.map(v => _ncupDig(v.cliente_cpf)).filter(Boolean)));
  if (docs.length > 1) { alert("Os cupons escolhidos são de clientes diferentes. Uma NF-e é de um cliente só."); return; }
  st.confirmar = false; st.pessoa = null;
  const prod = st.cfg.ambiente === "producao";
  const tot = sel.reduce((s, v) => s + Number(v.valor_total || 0), 0);
  const inp = (id, rot, extra) => `<div style="${(extra && extra.w) || ""}"><label>${rot}</label><input id="${id}" ${(extra && extra.attr) || ""}></div>`;
  _ncupFechar();
  const m = document.createElement("div");
  m.id = "ncup-modal"; m.className = "ncup-modal";
  m.innerHTML = `
    <div class="ncup-caixa">
      <div class="ns-titulo"><h3>NF-e de ${sel.length} cupom(ns) · R$ ${_ncupMoney(tot)}</h3><button class="ns-fechar" onclick="_ncupFechar()">✕</button></div>
      <div style="padding:16px">
        <div style="font-size:0.8rem;color:#aaa">NF-e em <b style="color:${prod ? "#4ade80" : "#f59e0b"}">${prod ? "PRODUÇÃO (vale fiscalmente)" : "HOMOLOGAÇÃO (teste)"}</b> · série ${_ncupEsc(st.cfg.serie)} · CFOP 5929 · sem pagamento (está nos cupons)</div>
        <div id="ncup-itens-prev" style="margin-top:10px;font-size:0.8rem;color:#ccc">Montando os itens…</div>
        <div class="ncup-linha" style="align-items:flex-end">
          ${inp("ncup-doc", "CPF/CNPJ do cliente *", { attr: 'inputmode="numeric" placeholder="só números"' })}
          <div style="flex:0 0 auto"><button class="ncup-btn" onclick="_ncupBuscarCliente()">🔍 Buscar</button></div>
        </div>
        <div id="ncup-achados" style="font-size:0.78rem;margin-top:4px"></div>
        <div class="ncup-linha">${inp("ncup-nome", "Nome / razão social *")}${inp("ncup-ie", "Inscrição estadual", { w: "flex:0 0 160px", attr: 'placeholder="vazio ou ISENTO"' })}</div>
        <div class="ncup-linha">${inp("ncup-lgr", "Endereço (rua, fazenda…) *")}${inp("ncup-nro", "Número", { w: "flex:0 0 90px", attr: 'placeholder="S/N"' })}</div>
        <div class="ncup-linha">${inp("ncup-bairro", "Bairro")}${inp("ncup-cep", "CEP *", { w: "flex:0 0 120px", attr: 'inputmode="numeric"' })}</div>
        <div class="ncup-linha">${inp("ncup-mun", "Município *")}${inp("ncup-uf", "UF *", { w: "flex:0 0 60px", attr: 'maxlength="2"' })}${inp("ncup-cmun", "Cód. IBGE *", { w: "flex:0 0 110px", attr: 'inputmode="numeric" maxlength="7"' })}</div>
        <div id="ncup-msg" style="margin-top:12px;font-size:0.84rem;min-height:1.2em"></div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="ncup-btn" style="flex:1;background:#1a1d2e;border-color:#2a2d3e;color:#aaa" onclick="_ncupFechar()">Voltar</button>
          <button id="ncup-emitir" class="ncup-btn ncup-emitir" style="flex:2" onclick="_ncupEmitir()">Emitir NF-e em ${prod ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  document.getElementById("ncup-cep").addEventListener("change", () => _ncupCep());
  document.getElementById("ncup-mun").addEventListener("change", () => {
    const emp = st.emp || {}, mun = document.getElementById("ncup-mun").value;
    if (!String(mun).trim() || _ncupNorm(mun) === _ncupNorm(emp.cidade)) { _ncupPadraoPosto(); return; }
    const c = document.getElementById("ncup-cmun"), cep = document.getElementById("ncup-cep");
    if (c && c.value === String(emp.c_mun || "")) c.value = "";
    if (cep && _ncupDig(cep.value) === _ncupDig(emp.cep)) cep.value = "";
  });
  // mexeu nos dados depois da conferência: confere de novo antes de emitir
  m.querySelectorAll("input").forEach(el => el.addEventListener("input", () => {
    if (!st.confirmar) return;
    st.confirmar = false;
    const b = document.getElementById("ncup-emitir");
    if (b && !b.disabled) b.textContent = `Emitir NF-e em ${prod ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}`;
    _ncupMsg("");
  }));
  const nome = (sel.find(v => v.cliente_nome) || {}).cliente_nome || "";
  if (docs[0]) document.getElementById("ncup-doc").value = docs[0];
  if (nome) document.getElementById("ncup-nome").value = nome;
  _ncupPadraoPosto();
  if (docs[0]) _ncupBuscarCliente();
  else document.getElementById("ncup-doc").focus();
  _ncupPrevia();
}

// cadastro de produtos (o fiscal que o cupom não gravou) + ambiente de cada cupom (oct_nfce)
async function _ncupPreparar(sel) {
  const st = window._ncup;
  const itens = sel.flatMap(v => (Array.isArray(v.itens) ? v.itens : []));
  const cods = Array.from(new Set(itens.map(it => String(it.cod || "")).filter(Boolean)));
  const ids = Array.from(new Set(itens.flatMap(it => [it.produto_id, it.fiscal && it.fiscal.id]).filter(x => /^[0-9a-f-]{36}$/i.test(String(x || "")))));
  const campos = "id,codigo,nome,ncm,cest,unidade,origem,cst_icms,aliq_icms_ad_rem,cod_anp,desc_anp,perc_bio,ativo";
  const [r1, r2, r3] = await Promise.all([
    cods.length ? sb.from("oct_produtos").select(campos).eq("empresa_id", st.eid).in("codigo", cods) : { data: [] },
    ids.length ? sb.from("oct_produtos").select(campos).eq("empresa_id", st.eid).in("id", ids.slice(0, 150)) : { data: [] },
    sb.from("oct_produtos").select(campos).eq("empresa_id", st.eid).gt("perc_bio", 0),   // combustíveis com o % de mistura
  ]);
  const prods = [].concat(r1.data || [], r2.data || [], r3.data || []);
  const chaves = Array.from(new Set(sel.map(v => _ncupDig(v.nfce_chave))));
  const prodSet = new Set();
  for (let i = 0; i < chaves.length; i += 80) {
    const { data: ns, error } = await sb.from("oct_nfce").select("chave_nfe,ambiente,status").eq("empresa_id", st.eid).in("chave_nfe", chaves.slice(i, i + 80));
    if (error) throw new Error("Não consegui conferir o ambiente dos cupons (" + (error.message || error) + ").");
    (ns || []).forEach(n => { if (n.ambiente === "producao" && n.status !== "cancelada") prodSet.add(String(n.chave_nfe)); });
  }
  return { prods, prodSet };
}

async function _ncupPrevia() {
  const st = window._ncup, el = document.getElementById("ncup-itens-prev");
  const sel = _ncupSelecionados();
  try {
    st.prep = await _ncupPreparar(sel);
    const nota = _ncupMontarNota(sel, { doc: "", nome: "" }, st.cfg, st.prep.prodSet, st.emp, st.prep.prods);
    const homolog = sel.length - nota.refs.length;
    if (el) el.innerHTML = `
      <table class="ns-tabela" style="font-size:0.78rem">
        <thead><tr><th>Produto</th><th>CST</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor (R$)</th></tr></thead>
        <tbody>${nota.itens.map(i => `<tr><td>${_ncupEsc(i.xProd)}</td><td>${i.cst_icms}</td><td style="text-align:right">${i.qCom.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${_ncupEsc(i.uCom)}</td><td style="text-align:right">${_ncupMoney(i.vProd)}</td></tr>`).join("")}</tbody>
      </table>
      ${homolog > 0 && st.cfg.ambiente === "producao" ? `<div style="margin-top:8px;background:#2a2300;border-radius:6px;padding:7px 10px;color:#fbbf24;font-size:0.76rem">${homolog} cupom(ns) emitido(s) em homologação: entram no valor da NF-e, mas não na referência (a SEFAZ não os conhece).</div>` : ""}`;
  } catch (e) {
    st.prep = null;
    if (el) el.innerHTML = `<span style="color:#f87171">${_ncupEsc(e.message || e)}</span>`;
    const b = document.getElementById("ncup-emitir"); if (b) b.disabled = true;
  }
}

function _ncupPreencher(p) {
  const st = window._ncup, emp = st.emp || {};
  st.pessoa = p;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null && String(val).trim() !== "") el.value = String(val).trim(); };
  set("ncup-doc", _ncupDig(p.documento)); set("ncup-nome", p.razao_social || p.nome); set("ncup-ie", p.ie);
  set("ncup-lgr", p.endereco); set("ncup-nro", p.num_endereco); set("ncup-bairro", p.bairro);
  set("ncup-cep", p.cep); set("ncup-mun", p.cidade); set("ncup-uf", p.uf || emp.uf || "MG");
  // mesmo município do posto -> o IBGE do posto; outro município -> pelo CEP (ViaCEP)
  if (p.cidade && _ncupNorm(p.cidade) === _ncupNorm(emp.cidade) && emp.c_mun) set("ncup-cmun", emp.c_mun);
  else if (p.cidade) {
    const c = document.getElementById("ncup-cmun"), cep = document.getElementById("ncup-cep");
    if (c) c.value = "";
    if (cep && !_ncupDig(p.cep) && _ncupDig(cep.value) === _ncupDig(emp.cep)) cep.value = "";   // não fica o CEP do posto
    if (_ncupDig(p.cep).length === 8) _ncupCep();
  }
  _ncupPadraoPosto();
  const a = document.getElementById("ncup-achados");
  if (a) a.innerHTML = `<span style="color:#4ade80">✓ ${_ncupEsc(p.nome)}</span>`
    + (p.empresa_id && p.empresa_id !== st.eid ? ' <span style="color:#60a5fa">— cadastro de outro posto</span>' : "")
    + (!p.endereco ? ' <span style="color:#f59e0b">— cadastro sem endereço: preencha abaixo (fica salvo no cadastro).</span>' : "");
}

// município do posto como padrão: o que ficou vazio (município, UF, CEP, IBGE) vem do posto
function _ncupPadraoPosto() {
  const emp = window._ncup.emp || {};
  const el = id => document.getElementById(id);
  const vazio = id => el(id) && !String(el(id).value || "").trim();
  const mun = el("ncup-mun") ? String(el("ncup-mun").value || "").trim() : "";
  if (mun && _ncupNorm(mun) !== _ncupNorm(emp.cidade)) return;
  if (vazio("ncup-mun") && emp.cidade) el("ncup-mun").value = emp.cidade;
  if (vazio("ncup-uf") && emp.uf) el("ncup-uf").value = emp.uf;
  if (vazio("ncup-cep") && emp.cep) el("ncup-cep").value = emp.cep;
  if (vazio("ncup-cmun") && emp.c_mun) el("ncup-cmun").value = emp.c_mun;
}

// cliente pelo CPF/CNPJ (ou parte do nome): o cadastro deste posto primeiro; sem endereço aqui, o de outro posto
async function _ncupBuscarCliente() {
  const st = window._ncup;
  const a = document.getElementById("ncup-achados");
  const termo = String((document.getElementById("ncup-doc") || {}).value || "").trim();
  const doc = _ncupDig(termo);
  if (!doc && termo.length < 3) { if (a) a.innerHTML = '<span style="color:#f87171">Digite o CPF/CNPJ (ou parte do nome).</span>'; return; }
  if (a) a.innerHTML = '<span style="color:#888">Buscando…</span>';
  const campos = "id,empresa_id,nome,razao_social,documento,ie,endereco,num_endereco,bairro,cidade,uf,cep";
  try {
    let q = sb.from("oct_pessoas").select(campos).eq("ativo", true).limit(30);
    if (doc.length === 11 || doc.length === 14) q = q.in("documento", [doc, _ncupDocFmt(doc)]);
    else q = q.ilike("nome", `%${termo}%`).eq("empresa_id", st.eid);
    const { data, error } = await q;
    if (error) throw error;
    let lista = data || [];
    if (doc.length === 11 || doc.length === 14) {
      // um só: o deste posto (endereço do de outro posto se o daqui não tem)
      const local = lista.find(p => p.empresa_id === st.eid) || null;
      const comEnd = lista.find(p => String(p.endereco || "").trim()) || null;
      const esc = local && !String(local.endereco || "").trim() && comEnd
        ? Object.assign({}, comEnd, { id: local.id, empresa_id: local.empresa_id, nome: local.nome || comEnd.nome })
        : (local || comEnd || lista[0] || null);
      lista = esc ? [esc] : [];
    }
    st.achados = lista;
    if (!lista.length) { _ncupPadraoPosto(); if (a) a.innerHTML = '<span style="color:#f59e0b">Não achei no cadastro — preencha os dados abaixo.</span>'; return; }
    if (lista.length === 1) { _ncupPreencher(lista[0]); return; }
    if (a) a.innerHTML = lista.map((p, i) => `<div onclick="_ncupPreencher(window._ncup.achados[${i}])" style="padding:5px 4px;border-bottom:1px solid #2a2d3e;cursor:pointer;color:#e0e0e0">${_ncupEsc(p.nome)} <span style="color:#888">${_ncupEsc(p.documento || "")} · ${_ncupEsc(p.cidade || "")}</span></div>`).join("");
  } catch (e) {
    if (a) a.innerHTML = `<span style="color:#f87171">Erro na busca: ${_ncupEsc(e.message || e)}</span>`;
  }
}

// CEP -> endereço + código IBGE (ViaCEP); só completa o que está vazio, o IBGE sempre
async function _ncupCep() {
  const cep = _ncupDig((document.getElementById("ncup-cep") || {}).value);
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const j = await r.json();
    if (!j || j.erro) { _ncupMsg("CEP não encontrado — confira o CEP ou digite o código IBGE.", "#f59e0b"); return; }
    const vazio = id => !String((document.getElementById(id) || {}).value || "").trim();
    if (vazio("ncup-lgr") && j.logradouro) document.getElementById("ncup-lgr").value = j.logradouro;
    if (vazio("ncup-bairro") && j.bairro) document.getElementById("ncup-bairro").value = j.bairro;
    if (vazio("ncup-mun") && j.localidade) document.getElementById("ncup-mun").value = j.localidade;
    if (vazio("ncup-uf") && j.uf) document.getElementById("ncup-uf").value = j.uf;
    if (j.ibge) document.getElementById("ncup-cmun").value = j.ibge;
  } catch (e) { /* sem ViaCEP: digita o IBGE */ }
}

function _ncupLerDest() {
  const g = id => String((document.getElementById(id) || {}).value || "").trim();
  return { doc: g("ncup-doc"), nome: g("ncup-nome"), ie: g("ncup-ie"), logradouro: g("ncup-lgr"), numero: g("ncup-nro"),
           bairro: g("ncup-bairro"), cep: g("ncup-cep"), municipio: g("ncup-mun"), uf: g("ncup-uf"), c_mun: g("ncup-cmun") };
}

// ---------- emissão ----------
async function _ncupEmitir() {
  if (!podeOuAvisa("nfe_saida.transmitir")) return;
  const st = window._ncup, sel = _ncupSelecionados();
  const btn = document.getElementById("ncup-emitir");
  if (!sel.length || !btn || btn.disabled) return;
  const dest = _ncupLerDest();
  const doc = _ncupDig(dest.doc);
  const falta = [];
  if (doc.length !== 11 && doc.length !== 14) falta.push("CPF/CNPJ");
  if (!dest.nome) falta.push("nome");
  if (!dest.logradouro) falta.push("endereço");
  if (_ncupDig(dest.cep).length !== 8) falta.push("CEP");
  if (!dest.municipio) falta.push("município");
  if (!/^[A-Za-z]{2}$/.test(dest.uf)) falta.push("UF");
  if (_ncupDig(dest.c_mun).length !== 7) falta.push("código IBGE do município (7 dígitos)");
  if (falta.length) { _ncupMsg("Falta: " + falta.join(", ") + ".", "#f87171"); return; }
  const docCupom = Array.from(new Set(sel.map(v => _ncupDig(v.cliente_cpf)).filter(Boolean)));
  const cfg = st.cfg, prod = cfg.ambiente === "producao";
  let nota;
  try {
    if (!st.prep) st.prep = await _ncupPreparar(sel);
    nota = _ncupMontarNota(sel, dest, cfg, st.prep.prodSet, st.emp, st.prep.prods);
  } catch (e) { _ncupMsg(_ncupEsc(e.message || e), "#f87171"); return; }
  const vNF = +nota.itens.reduce((s, i) => s + i.vProd, 0).toFixed(2);

  // 1º clique: confere (cupom que outra tela transformou enquanto esta estava aberta para aqui); 2º clique: emite
  if (!st.confirmar) {
    try {
      const chaves = sel.map(v => _ncupDig(v.nfce_chave));
      const ja = [];
      for (let i = 0; i < chaves.length; i += 80) {
        const { data } = await sb.from("oct_nfe_cupons").select("cupom_chave,nfe_numero,ambiente").in("cupom_chave", chaves.slice(i, i + 80));
        (data || []).filter(l => l.ambiente === "producao" || l.ambiente === cfg.ambiente).forEach(l => ja.push(l));
      }
      if (ja.length) {
        const nums = Array.from(new Set(ja.map(l => l.nfe_numero))).join(", ");
        _ncupMsg(`<b style="color:#f87171">⚠ ${ja.length} cupom(ns) da seleção já viraram NF-e (nº ${_ncupEsc(nums)}).</b> Feche, busque de novo e escolha só os que faltam.`);
        return;
      }
    } catch (e) { /* sem a conferência: o banco ainda liga tudo depois */ }
    const outroDoc = docCupom.length && docCupom[0] !== doc
      ? `<br><b style="color:#f59e0b">⚠ O CPF/CNPJ da NF-e (${_ncupEsc(_ncupDocFmt(doc))}) é diferente do que está nos cupons (${_ncupEsc(_ncupDocFmt(docCupom[0]))}).</b>` : "";
    st.confirmar = true;
    _ncupMsg(`Conferir: NF-e em <b style="color:${prod ? "#4ade80" : "#f59e0b"}">${prod ? "PRODUÇÃO (vale fiscalmente)" : "HOMOLOGAÇÃO"}</b>, série ${_ncupEsc(cfg.serie)}, `
      + `R$ ${_ncupMoney(vNF)}, ${nota.itens.length} item(ns), ${sel.length} cupom(ns) (${nota.refs.length} referenciado(s)), para <b>${_ncupEsc(dest.nome)}</b> (${_ncupEsc(_ncupDocFmt(doc))}).${outroDoc}`);
    btn.textContent = "✔ Confirmar e emitir";
    return;
  }
  btn.disabled = true; btn.style.opacity = "0.6";
  const reabrir = () => { st.confirmar = false; btn.disabled = false; btn.style.opacity = "1"; btn.textContent = `Emitir NF-e em ${prod ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}`; };
  try {
    // número: maior NF-e deste ambiente/série (com data: sem ela o oct_nfce estoura o tempo); em produção nunca abaixo
    // do último do TecnoX (nfe_ultimo_numero). Número já usado (539): a SEFAZ diz a chave da nota que tem o número e vai
    // para o seguinte (produção: até 20 vezes, como no Faturar).
    _ncupMsg("Buscando o número da NF-e…");
    const desde = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    const { data: ult } = await sb.from("oct_nfce").select("numero").eq("empresa_id", st.eid).eq("modelo", "55")
      .eq("ambiente", cfg.ambiente).eq("serie", cfg.serie).gte("data_emissao", desde).order("numero", { ascending: false }).limit(1);
    nota.numero = Math.max((ult && ult[0] && Number(ult[0].numero)) || 0, prod ? cfg.ultimo : 0) + 1;
    let r = null;
    for (let tent = 0; tent < (prod ? 20 : 5); tent++) {
      _ncupMsg(`Transmitindo a NF-e nº ${nota.numero} série ${_ncupEsc(cfg.serie)}…`);
      const resp = await fetch(`${_ncupSefaz()}/emitir-empresa`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: st.eid, ambiente: cfg.ambiente, nota }),
      });
      r = await resp.json().catch(() => ({ erro: "resposta inválida do servidor (HTTP " + resp.status + ")" }));
      const cst = String(r.cstat_nfe || r.cstat_lote || "");
      const mDup = /chNFe:\s*(\d{44})/.exec(String(r.xmotivo || r.motivo || r.erro || ""));
      if (r.ok || cst !== "539" || !mDup) break;
      nota.numero = Math.max(Number(nota.numero), Number(mDup[1].slice(25, 34))) + 1;
    }
    if (!r || !r.ok) {
      const cstat = (r && (r.cstat_nfe || r.cstat_lote)) || "";
      const xsd = r && r.aviso_xsd ? (Array.isArray(r.aviso_xsd) ? r.aviso_xsd.join(" · ") : r.aviso_xsd) : "";
      const motivo = (r && (r.xmotivo || r.erro || r.motivo)) || xsd || JSON.stringify(r || {}).slice(0, 300);
      _ncupMsg(`❌ Rejeitada${cstat ? " (" + _ncupEsc(cstat) + ")" : ""}: ${_ncupEsc(motivo)}`, "#f87171");
      reabrir(); return;
    }
    st.ultimoXml = r.nfe_proc || null;
    const avisos = [];
    // 1º os cupons da nota (antes do oct_nfce: o gatilho do banco não tenta adivinhar o cupom de uma NF-e já ligada)
    try {
      const linhas = sel.map(v => ({
        empresa_id: st.eid, cupom_chave: _ncupDig(v.nfce_chave), venda_id: v.id, nfe_chave: r.chave,
        nfe_numero: nota.numero, nfe_serie: cfg.serie, ambiente: cfg.ambiente, origem: "retaguarda", criado_por: st.usuario,
      }));
      const { error: el } = await sb.from("oct_nfe_cupons").upsert(linhas, { onConflict: "cupom_chave,nfe_chave", ignoreDuplicates: true });
      if (el) avisos.push("não marcou os cupons como transformados (" + (el.message || el) + ")");
    } catch (e) { avisos.push("não marcou os cupons como transformados"); }
    try {
      const { error: ei } = await sb.from("oct_nfce").insert({
        empresa_id: st.eid, numero: nota.numero, serie: cfg.serie, modelo: "55",
        status: "autorizada", ambiente: cfg.ambiente, valor_total: vNF,
        cpf_consumidor: doc, chave_nfe: r.chave, protocolo: r.protocolo,
        xml_autorizado: r.nfe_proc || null, data_emissao: new Date().toISOString(),
      });
      if (ei) avisos.push("não gravou no histórico de notas (" + (ei.message || ei) + ")");
    } catch (e) { avisos.push("não gravou no histórico de notas"); }
    // cadastro do cliente DESTE posto sem endereço: guarda o que foi digitado (só os campos vazios)
    try {
      const p = st.pessoa;
      if (p && p.id && p.empresa_id === st.eid) {
        const { data: atual } = await sb.from("oct_pessoas").select("endereco,num_endereco,bairro,cidade,uf,cep").eq("id", p.id).maybeSingle();
        const patch = {}, novo = { endereco: dest.logradouro, num_endereco: dest.numero, bairro: dest.bairro, cidade: dest.municipio, uf: dest.uf.toUpperCase(), cep: dest.cep };
        Object.keys(novo).forEach(k => { if (atual && !String(atual[k] || "").trim() && String(novo[k] || "").trim()) patch[k] = novo[k]; });
        if (Object.keys(patch).length) await sb.from("oct_pessoas").update(patch).eq("id", p.id);
      }
    } catch (e) { /* o cadastro fica como estava; a nota já saiu */ }
    // os cupons da nota saem da lista
    sel.forEach(v => {
      const ch = _ncupDig(v.nfce_chave);
      (st.links[ch] = st.links[ch] || []).push({ cupom_chave: ch, nfe_chave: r.chave, nfe_numero: nota.numero, nfe_serie: cfg.serie, ambiente: cfg.ambiente, origem: "retaguarda" });
    });
    st.sel = new Set();
    ncupFiltrar();
    const caixa = document.querySelector("#ncup-modal .ncup-caixa > div:last-child");
    if (caixa) caixa.innerHTML = `
      <div style="text-align:center;padding:12px 4px">
        <div style="font-size:1.8rem">✅</div>
        <h3 style="color:#4ade80;margin:6px 0">NF-e nº ${_ncupEsc(nota.numero)} autorizada</h3>
        <p style="color:#aaa;font-size:0.84rem">${prod ? "PRODUÇÃO" : "HOMOLOGAÇÃO"} · série ${_ncupEsc(cfg.serie)} · R$ ${_ncupMoney(vNF)} · ${sel.length} cupom(ns) · ${_ncupEsc(dest.nome)}</p>
        <p style="color:#777;font-size:0.72rem;word-break:break-all;margin-top:6px">chave ${_ncupEsc(r.chave || "—")}<br>protocolo ${_ncupEsc(r.protocolo || "—")}</p>
        ${avisos.length ? `<p style="color:#f59e0b;font-size:0.78rem;margin-top:6px">⚠ ${_ncupEsc(avisos.join(" · "))}</p>` : ""}
        <div id="ncup-msg" style="margin-top:8px;font-size:0.8rem"></div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="ncup-btn" style="flex:1;background:#1a1d2e;border-color:#2a2d3e;color:#aaa" onclick="_ncupFechar()">Fechar</button>
          ${r.nfe_proc ? `<button class="ncup-btn" style="flex:2" onclick="_ncupDanfe()">📄 DANFE (imprimir)</button>` : ""}
        </div>
      </div>`;
  } catch (e) {
    _ncupMsg("Erro: " + _ncupEsc(e.message || e) + " — confira na lista de NF-e antes de tentar de novo.", "#f87171");
    reabrir();
  }
}

async function _ncupDanfe() {
  const xml = window._ncup.ultimoXml;
  if (!xml) { _ncupMsg("XML da NF-e indisponível.", "#f87171"); return; }
  _ncupMsg("Gerando a DANFE…");
  try {
    const resp = await fetch(`${_ncupSefaz()}/danfe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xml }) });
    if (!resp.ok) { let d = ""; try { d = (await resp.json()).erro || ""; } catch (e) {} throw new Error(d || ("HTTP " + resp.status)); }
    const url = URL.createObjectURL(await resp.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    _ncupMsg("✓ DANFE aberta.", "#4ade80");
  } catch (e) { _ncupMsg("Erro ao gerar a DANFE: " + _ncupEsc(e.message || e), "#f87171"); }
}
