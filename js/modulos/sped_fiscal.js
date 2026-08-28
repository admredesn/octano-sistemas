// ============================================================
// SPED FISCAL (EFD ICMS/IPI) — gerador do arquivo mensal
// ------------------------------------------------------------
// GABARITO: os EFD reais do posto (CNPJ 17644709000122), entregues e baixados
// do ReceitanetBX (Documents\Arquivos ReceitanetBX). Cada registro daqui foi
// moldado numa linha daquele arquivo — inclusive a contagem de campos, que
// vira AUTOVERIFICAÇÃO no fim (SPED_CAMPOS_REF).
//
// O QUE ESTA FASE COBRE
//   bloco 0  cadastros do período (empresa, contador, participantes das
//            entradas, unidades, produtos movimentados, cód. ANP)
//   bloco C  saídas NFC-e (C100+C190) e entradas NF-e (C100+C170+C171+C190)
//   bloco E  apuração do ICMS (E100/E110/E116) + ST zerada (E200/E210)
//   bloco 1  combustíveis: 1300/1310/1320 por produto/tanque/bico/DIA, com
//            encerrantes e aferições; 1350/1360/1370 se as bombas estiverem
//            cadastradas no sped_config
//   B/D/G/H/K sem movimento (abertura=1) — frete/energia/telecom (D100/C500)
//            ficam para o contador complementar, avisado na tela
//
// A REGRA DE OURO: este arquivo NÃO vai direto para a Receita. Ele é gerado
// para o CONTADOR validar no PVA (o validador oficial) — a tela avisa isso.
// ============================================================

// contagem de campos por registro, EXTRAÍDA do EFD real do posto.
// Linha gerada com contagem diferente = bug na certa; vira aviso na tela.
const SPED_CAMPOS_REF = {
  "0000": 14, "0001": 1, "0005": 9, "0100": 13, "0150": 12, "0190": 2,
  "0200": 12, "0206": 1, "0990": 1,
  "B001": 1, "B990": 1,
  "C001": 1, "C100": 28, "C170": 37, "C171": 2, "C190": 11, "C990": 1,
  "D001": 1, "D990": 1,
  "E001": 1, "E100": 2, "E110": 14, "E116": 9, "E200": 3, "E210": 14, "E990": 1,
  "G001": 1, "G990": 1, "H001": 1, "H990": 1, "K001": 1, "K990": 1,
  "1001": 1, "1010": 13, "1300": 10, "1310": 9, "1320": 10,
  "1350": 4, "1360": 2, "1370": 3, "1990": 1,
  "9001": 1, "9900": 2, "9990": 1, "9999": 1,
};

// número no padrão SPED: vírgula decimal, sem zeros à direita ("529,61"; "2848"; "0")
function _sfNum(v, casas) {
  const n = Number(v || 0);
  if (!isFinite(n) || n === 0) return "0";
  let s = n.toFixed(casas == null ? 2 : casas);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",");
}
function _sfData(iso) {          // yyyy-mm-dd... -> DDMMAAAA
  if (!iso) return "";
  const s = String(iso).slice(0, 10).split("-");
  return s.length === 3 ? s[2] + s[1] + s[0] : "";
}
// texto: sem acento e sem pipe — o download sai UTF-8 e o PVA lê ANSI; acento
// viraria lixo. Transliterar é a saída segura (o conteúdo continua legível).
function _sfTxt(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\|/g, " ").replace(/[\r\n]+/g, " ").trim();
}
function _sfDia(iso) { return String(iso || "").slice(0, 10); }

// CST com origem na frente (3 dígitos): origem "0" + cst "61" -> "061"
function _sfCst(fiscal) {
  const orig = String((fiscal && fiscal.origem) || "0").slice(0, 1);
  const cst = String((fiscal && fiscal.cst_icms) || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
  return orig + (cst || "00");
}

// ============================================================
// MONTADOR PURO: recebe todos os dados já carregados, devolve
// { linhas, avisos, resumo }. Sem rede aqui dentro — dá para testar.
// ============================================================
function spedFiscalMontar(d) {
  const A = [];                 // avisos para a tela
  const L = [];                 // linhas do arquivo
  const emp = d.empresa || {};
  const cfg = d.cfg || {};
  const ctd = cfg.contador || {};
  const dtIni = _sfData(d.dtIni), dtFim = _sfData(d.dtFim);

  // ---------- BLOCO 0 ----------
  const cnpj = String(emp.cnpj || "").replace(/\D/g, "");
  const ie = String(emp.ie || "").replace(/\D/g, "");
  const codMun = String(cfg.cod_mun || emp.c_mun || "").replace(/\D/g, "");
  if (!codMun) A.push("Sem código IBGE do município (sped_config.cod_mun) — o PVA vai recusar o 0000.");
  if (!ctd.nome) A.push("Dados do CONTADOR não preenchidos (registro 0100) — preencha e salve na tela.");
  // perfil B = o do posto no gabarito; COD_VER na tela (018/019/020)
  L.push(`|0000|${d.codVer || "019"}|0|${dtIni}|${dtFim}|${_sfTxt(emp.nome)}|${cnpj}||${emp.uf || "MG"}|${ie}|${codMun}|||B|1|`);
  L.push("|0001|0|");
  L.push(`|0005|${_sfTxt(emp.nome_fantasia || emp.nome)}|${String(emp.cep || "").replace(/\D/g, "")}|${_sfTxt(emp.endereco || "")}|S/N||${_sfTxt(emp.bairro || "CENTRO")}|${String(emp.telefone || "").replace(/\D/g, "")}||${_sfTxt(emp.email || "")}|`);
  L.push(`|0100|${_sfTxt(ctd.nome)}|${String(ctd.cpf || "").replace(/\D/g, "")}|${_sfTxt(ctd.crc || "")}|${String(ctd.cnpj || "").replace(/\D/g, "")}|${String(ctd.cep || "").replace(/\D/g, "")}|${_sfTxt(ctd.endereco || "")}|${_sfTxt(ctd.numero || "")}||${_sfTxt(ctd.bairro || "")}|${String(ctd.fone || "").replace(/\D/g, "")}||${_sfTxt(ctd.email || "")}|${String(ctd.cod_mun || codMun).replace(/\D/g, "")}|`);

  // participantes = fornecedores das entradas do período
  const parts = new Map();      // cod_part -> pessoa
  (d.entradas || []).forEach(n => {
    const p = n.fornecedor || {};
    const doc = String(p.documento || "").replace(/\D/g, "");
    if (!doc) { A.push(`Entrada ${n.numero || "?"} sem documento do fornecedor — ficará sem participante.`); return; }
    if (!parts.has(doc)) parts.set(doc, p);
  });
  parts.forEach((p, doc) => {
    const ehCnpj = doc.length === 14;
    L.push(`|0150|F${doc}|${_sfTxt(p.nome)}|1058|${ehCnpj ? doc : ""}|${ehCnpj ? "" : doc}|${String(p.ie || "").replace(/\D/g, "")}|${String(p.cod_mun || "").replace(/\D/g, "") || codMun}||${_sfTxt(p.endereco || p.cidade || "")}|||${_sfTxt(p.bairro || "")}|`);
  });

  // produtos MOVIMENTADOS no período (saídas por produto_id; entradas idem)
  const prodPorId = new Map();
  (d.produtos || []).forEach(p => prodPorId.set(p.id, p));
  const usados = new Map();     // codigo -> produto
  const _usar = (pid, fallback) => {
    const p = prodPorId.get(pid);
    if (p && p.codigo) { usados.set(String(p.codigo), p); return p; }
    if (fallback && fallback.codigo) { usados.set(String(fallback.codigo), fallback); return fallback; }
    return null;
  };
  (d.nfces || []).forEach(n => (n.itens || []).forEach(it => _usar(it.produto_id, null)));
  (d.entradas || []).forEach(n => (n.itens || []).forEach(it =>
    _usar(it.produto_id, { codigo: it.codigo, nome: it.descricao, unidade: it.unidade, ncm: it.ncm, cest: it.cest, cod_anp: it.cod_anp, aliq_icms: it.aliq_icms })));

  const unidades = new Map();
  usados.forEach(p => { const u = String(p.unidade || "UN").toUpperCase(); if (!unidades.has(u)) unidades.set(u, u === "L" ? "LITRO" : (u === "UN" ? "UNIDADE" : u)); });
  unidades.forEach((desc, u) => L.push(`|0190|${u}|${desc}|`));

  // guarda o que o 0200 DECLAROU: o 1370 (bico) precisa apontar para um destes
  const itensDeclarados = new Set();
  usados.forEach((p, cod) => {
    itensDeclarados.add(String(cod));
    const ncm = String(p.ncm || "").replace(/\D/g, "");
    L.push(`|0200|${cod}|${_sfTxt(p.nome)}|||${String(p.unidade || "UN").toUpperCase()}|00|${ncm}||${ncm.slice(0, 2)}||${_sfNum(p.aliq_icms || 0)}|${String(p.cest || "").replace(/\D/g, "")}|`);
    if (p.cod_anp) L.push(`|0206|${String(p.cod_anp).replace(/\D/g, "")}|`);
  });
  L.push(`|0990|${L.length + 1}|`);

  // ---------- BLOCO B (sem movimento) ----------
  L.push("|B001|1|"); L.push("|B990|2|");

  // ---------- BLOCO C ----------
  const c0 = L.length;
  L.push("|C001|0|");
  let debitos = 0, creditos = 0;
  let vSaidas = 0, vEntradas = 0, nSaidas = 0, nCancel = 0;

  // SAÍDAS: uma C100 por NFC-e; canceladas em forma curta (só identificação)
  (d.nfces || []).forEach(n => {
    const dt = _sfData(n.data_emissao || n.criado_em);
    const cancel = String(n.status || "") === "cancelada";
    if (cancel) {
      nCancel++;
      L.push(`|C100|1|0||65|02|${n.serie || 1}|${n.numero}|${n.chave_nfe || ""}|${dt}||||||||||||||||||||`);
      return;
    }
    nSaidas++;
    const vDoc = Number(n.valor_total || 0);
    vSaidas += vDoc;
    // C190 por combinação CST/CFOP/alíquota dos itens DESTA nota
    const grupos = new Map();
    (n.itens || []).forEach(it => {
      const f = it.fiscal || {};
      const cst = _sfCst(f);
      const cfop = String(f.cfop || "5656").replace(/\D/g, "");
      const aliq = Number(f.aliq_icms || 0);
      const k = cst + "|" + cfop + "|" + aliq;
      const g = grupos.get(k) || { cst, cfop, aliq, vl: 0, bc: 0, icms: 0 };
      const tot = Number(it.total || 0);
      g.vl += tot;
      if (cst.slice(1) === "00") { g.bc += tot; g.icms += tot * aliq / 100; }
      grupos.set(k, g);
    });
    // capa: BC/ICMS somados dos grupos (combustível monofásico dá zero)
    let bc = 0, icms = 0;
    grupos.forEach(g => { bc += g.bc; icms += g.icms; });
    debitos += icms;
    L.push(`|C100|1|0||65|00|${n.serie || 1}|${n.numero}|${n.chave_nfe || ""}|${dt}|${dt}|${_sfNum(vDoc)}|0|0|0|${_sfNum(vDoc)}|9|0|0|0|${_sfNum(bc)}|${_sfNum(icms)}|0|0|0|0|0|0|0|`);
    grupos.forEach(g => L.push(`|C190|${g.cst}|${g.cfop}|${_sfNum(g.aliq)}|${_sfNum(g.vl)}|${_sfNum(g.bc)}|${_sfNum(g.icms)}|0|0|0|0||`));
  });

  // ENTRADAS: C100 + C170 (itens) + C171 (combustível -> tanque) + C190
  const tqPorProduto = new Map();     // produto_id -> numero do tanque
  (d.tanques || []).forEach(t => { if (t.produto_id) tqPorProduto.set(t.produto_id, t.numero); });
  (d.produtos || []).forEach(p => { if (p.tanque_id) { const t = (d.tanques || []).find(x => x.id === p.tanque_id); if (t) tqPorProduto.set(p.id, t.numero); } });

  (d.entradas || []).forEach(n => {
    const p = n.fornecedor || {};
    const doc = String(p.documento || "").replace(/\D/g, "");
    const dtEmi = _sfData(n.emissao), dtEnt = _sfData(n.entrada || n.emissao);
    const vDoc = Number(n.valor_total || 0);
    vEntradas += vDoc;
    const grupos = new Map();
    let bcCapa = 0, icmsCapa = 0;
    L.push(`|C100|0|1|${doc ? "F" + doc : ""}|55|00|${n.serie || 1}|${n.numero}|${n.chave_nfe || ""}|${dtEmi}|${dtEnt}|${_sfNum(vDoc)}|2|${_sfNum(n.valor_desconto || 0)}|0|${_sfNum(vDoc)}|9|${_sfNum(n.valor_frete || 0)}|0|0|BCTMP|ICMSTMP|0|0|0|${_sfNum(n.valor_pis || 0)}|${_sfNum(n.valor_cofins || 0)}|0|0|`);
    const idxCapa = L.length - 1;
    (n.itens || []).forEach((it, i) => {
      const cst = _sfCst(it);
      // CFOP DE ENTRADA. O XML traz o CFOP do FORNECEDOR, que é a saída DELE
      // (5xxx/6xxx). Num documento de entrada o PVA exige 1xxx/2xxx/3xxx — o
      // primeiro dígito é a origem da operação, não o código todo. Sem isto o
      // C170 saía com 5102/5655 onde o EFD real do posto traz 1102/1652.
      let cfop = String(it.cfop || "1652").replace(/\D/g, "");
      if (/^[567]/.test(cfop)) {
        // A família 565x NÃO converte dígito a dígito: na saída ela distingue o
        // destino (industrialização/comercialização/consumidor) em 5654/5655/5656,
        // e na entrada isso vira 1651/1652/1653. Traduzir "5655" para "1655"
        // produzia um CFOP QUE NÃO EXISTE na tabela — o EFD real do posto traz
        // 1652 nessas mesmas notas.
        const par = { "654": "651", "655": "652", "656": "653" }[cfop.slice(1)];
        cfop = String(Number(cfop[0]) - 4) + (par || cfop.slice(1));
      }
      const aliq = Number(it.aliq_icms || 0);
      const tot = Number(it.valor_total || 0);
      const bc = aliq > 0 ? tot : 0;
      const icms = bc * aliq / 100;
      // COMBUSTÍVEL NÃO DÁ CRÉDITO ao posto revendedor: é monofásico/ST, o
      // imposto já foi retido na origem. Creditar aqui inverteu a apuração de
      // julho/2026 do Florestal -- R$ 2.096,70 de saldo CREDOR onde o EFD real
      // acusa R$ 152,20 A RECOLHER. A nota 358897 (etanol) veio com CST 10 e
      // ICMS destacado, e as outras onze com CST 61; a regra que vale para as
      // duas é a mesma: item com código ANP não credita.
      // Também não creditam os CST de ST/isento/não-tributado.
      const semCredito = !!it.cod_anp || /^(10|30|40|41|50|60|61|90)$/.test(cst.slice(-2));
      bcCapa += bc; icmsCapa += icms;
      if (!semCredito) creditos += icms;
      // 37 campos, posição a posição do gabarito
      L.push(`|C170|${i + 1}|${it.codigo || ""}||${_sfNum(it.quantidade, 3)}|${String(it.unidade || "UN").toUpperCase()}|${_sfNum(tot)}|0|0|${cst}|${cfop}||${_sfNum(bc)}|${_sfNum(aliq)}|${_sfNum(icms)}|0|0|0||||0|0|0||0|0||0|0||0|0||0|0|||`);
      const nTq = tqPorProduto.get(it.produto_id);
      if (nTq != null && it.cod_anp) L.push(`|C171|${nTq}|${_sfNum(it.quantidade, 3)}|`);
      const k = cst + "|" + cfop + "|" + aliq;
      const g = grupos.get(k) || { cst, cfop, aliq, vl: 0, bc: 0, icms: 0 };
      g.vl += tot; g.bc += bc; g.icms += icms;
      grupos.set(k, g);
    });
    L[idxCapa] = L[idxCapa].replace("BCTMP", _sfNum(bcCapa)).replace("ICMSTMP", _sfNum(icmsCapa));
    grupos.forEach(g => L.push(`|C190|${g.cst}|${g.cfop}|${_sfNum(g.aliq)}|${_sfNum(g.vl)}|${_sfNum(g.bc)}|${_sfNum(g.icms)}|0|0|0|0||`));
  });
  L.push(`|C990|${L.length - c0 + 1}|`);

  // ---------- BLOCO D (sem movimento — fretes/telecom com o contador) ----------
  L.push("|D001|1|"); L.push("|D990|2|");
  if ((d.entradas || []).some(n => Number(n.valor_frete || 0) > 0))
    A.push("Há frete nas entradas: os CT-e (registro D100) não são gerados nesta fase — o contador complementa.");

  // ---------- BLOCO E ----------
  const e0 = L.length;
  L.push("|E001|0|");
  L.push(`|E100|${dtIni}|${dtFim}|`);
  const sld = debitos - creditos;
  const aRecolher = Math.max(0, sld);
  const credorTransportar = Math.max(0, -sld);
  L.push(`|E110|${_sfNum(debitos)}|0|0|0|${_sfNum(creditos)}|0|0|0|0|${_sfNum(aRecolher)}|0|${_sfNum(aRecolher)}|${_sfNum(credorTransportar)}|0|`);
  if (aRecolher > 0.005) {
    // vencimento: dia N do mês seguinte (padrão do gabarito: 8) — contador confere
    const fim = new Date(d.dtFim + "T12:00:00");
    const venc = new Date(fim.getFullYear(), fim.getMonth() + 1, Number(cfg.dia_venc || 8));
    const vencStr = String(venc.getDate()).padStart(2, "0") + String(venc.getMonth() + 1).padStart(2, "0") + venc.getFullYear();
    // MES_REF no formato MMAAAA (gabarito: "012024") — dtIni é DDMMAAAA
    L.push(`|E116|000|${_sfNum(aRecolher)}|${vencStr}|${cfg.cod_rec || "1057"}|||||${dtIni.slice(2)}|`);
  }
  L.push(`|E200|${emp.uf || "MG"}|${dtIni}|${dtFim}|`);
  L.push("|E210|0|0|0|0|0|0|0|0|0|0|0|0|0|0|");
  L.push(`|E990|${L.length - e0 + 1}|`);

  // ---------- BLOCOS G/H/K (sem movimento) ----------
  L.push("|G001|1|"); L.push("|G990|2|");
  L.push("|H001|1|"); L.push("|H990|2|");
  if (String(d.dtFim).slice(5, 7) === "02")
    A.push("Período de FEVEREIRO: o inventário (bloco H) é obrigatório e não é gerado nesta fase — contador.");
  L.push("|K001|1|"); L.push("|K990|2|");

  // ---------- BLOCO 1: COMBUSTÍVEIS ----------
  const b1 = L.length;
  L.push("|1001|0|");
  // tanque -> produto combustível (só quem tem cod_anp entra no 1300)
  const combys = [];            // {produto, tanques:[{numero,id}]}
  const porProd = new Map();
  (d.produtos || []).forEach(p => {
    if (!p.tanque_id || !p.cod_anp) return;
    const t = (d.tanques || []).find(x => x.id === p.tanque_id);
    if (!t) return;
    const g = porProd.get(p.codigo) || { produto: p, tanques: [] };
    // MESMO TANQUE SO' UMA VEZ. O cadastro repete o codigo do produto (no
    // Florestal ha' dois "OB10", um ativo e um inativo, os DOIS no tanque 4) e
    // sem esta trava o tanque entrava duas vezes no grupo: o 1300 somava o
    // volume EM DOBRO e saiam dois 1310 iguais. O percentual do livro
    // disfarcava -- entrada e saida dobravam juntas -- mas o volume declarado
    // ficava com o dobro do que passou pelo tanque.
    if (!g.tanques.some(x => x.id === t.id)) g.tanques.push(t);
    porProd.set(p.codigo, g);
  });
  porProd.forEach(g => combys.push(g));
  L.push(`|1010|N|N|${combys.length ? "S" : "N"}|N|N|N|N|N|N|N|N|N|N|`);
  if (!combys.length) A.push("Nenhum produto de tanque com código ANP — bloco 1300 vazio (confira o cadastro).");

  // BICO -> TANQUE: a pista grava o BICO sempre, e o tanque_id só às vezes.
  // No Antônio Carlos os 9.638 abastecimentos de julho/2026 vieram TODOS com
  // tanque_id nulo: o 1320 (indexado por bico) saía certo e o 1300/1310
  // (indexado por tanque) saía ZERADO — metade do bloco 1 em branco, com o
  // arquivo parecendo íntegro. Resolver pelo bico fecha esse buraco sem
  // depender de um campo que a pista nem sempre preenche.
  // SO' BICO DESTE POSTO. oct_bicos guarda os bicos dos 4 postos e o NUMERO se
  // repete entre eles (todo posto tem bico 1, 5, 6...). Indexar por numero sem
  // filtrar deixava o bico 5 de um posto sobrescrever o do outro: as vendas
  // iam para um tanque de OUTRA empresa e sumiam do 1300. No AC de julho/2026
  // foram 15.440 L de diesel evaporados -- entrou 14.000 L e o livro dizia que
  // nao se vendeu uma gota. Filtrar pelos tanques da empresa e' a trava certa:
  // vale mesmo se empresa_id do bico estiver nulo.
  const idsTanque = new Set((d.tanques || []).map(t => t.id));
  const tanqueDoBico = new Map();
  (d.bicos || []).forEach(b => {
    if (b.numero != null && b.tanque_id && idsTanque.has(b.tanque_id)) {
      tanqueDoBico.set(String(b.numero), b.tanque_id);
    }
  });

  // índices por dia
  const vendasDia = new Map();    // "tanqueId|dia" -> litros
  const vendasBico = new Map();   // "bico|dia" -> {vendas, aferi, encIni, encFim}
  let semTanque = 0;
  (d.abastecimentos || []).forEach(a => {
    const dia = _sfDia(a.data_abast);
    const lit = Number(a.litros || 0);
    const ehAferi = String(a.tipo || "") === "afericao";
    const tqId = a.tanque_id || (a.bico != null ? tanqueDoBico.get(String(a.bico)) : null);
    if (!a.tanque_id && tqId) semTanque++;
    if (tqId && !ehAferi) {
      const k = tqId + "|" + dia;
      vendasDia.set(k, (vendasDia.get(k) || 0) + lit);
    }
    if (a.bico != null) {
      const kb = a.bico + "|" + dia;
      const b = vendasBico.get(kb) || { vendas: 0, aferi: 0, encIni: null, encFim: null };
      if (ehAferi) b.aferi += lit; else b.vendas += lit;
      const vi = Number(a.venc_ini), vf = Number(a.venc_fin);
      if (isFinite(vi) && vi > 0 && (b.encIni == null || vi < b.encIni)) b.encIni = vi;
      if (isFinite(vf) && vf > 0 && (b.encFim == null || vf > b.encFim)) b.encFim = vf;
      vendasBico.set(kb, b);
    }
  });
  const entradasDia = new Map();  // "tanqueNumero|dia" -> litros
  (d.entradas || []).forEach(n => {
    const dia = _sfDia(n.entrada || n.emissao);
    (n.itens || []).forEach(it => {
      const nTq = tqPorProduto.get(it.produto_id);
      if (nTq == null || !it.cod_anp) return;
      const k = nTq + "|" + dia;
      entradasDia.set(k, (entradasDia.get(k) || 0) + Number(it.quantidade || 0));
    });
  });
  const medicaoDia = new Map();   // "tanqueNumero|dia" -> ultimo volume medido no dia
  (d.medicoes || []).forEach(m => {
    const k = m.tanque_numero + "|" + _sfDia(m.medido_em);
    const atual = medicaoDia.get(k);
    if (!atual || String(m.medido_em) > atual.q) medicaoDia.set(k, { v: Number(m.volume || 0), q: String(m.medido_em) });
  });
  const bicosPorTanque = new Map();
  (d.bicos || []).forEach(b => {
    if (!b.tanque_id) return;
    const arr = bicosPorTanque.get(b.tanque_id) || [];
    arr.push(b); bicosPorTanque.set(b.tanque_id, arr);
  });

  // dias do período
  const dias = [];
  {
    const ini = new Date(d.dtIni + "T12:00:00"), fim = new Date(d.dtFim + "T12:00:00");
    for (let x = new Date(ini); x <= fim; x.setDate(x.getDate() + 1)) dias.push(x.toISOString().slice(0, 10));
  }
  const diaAnterior = (dia) => { const x = new Date(dia + "T12:00:00"); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };

  if (semTanque > 0) {
    A.push(semTanque + " abastecimento(s) sem tanque no registro — o tanque foi deduzido pelo BICO "
           + "(oct_bicos). Confira o cadastro de bicos se algum volume parecer trocado de produto.");
  }
  let semMedicao = 0;
  combys.forEach(g => {
    // ESTOQUE DE ABERTURA DO 1º DIA
    // Ideal: a medição da sonda no dia anterior ao período. Quando ela não
    // existe -- sonda instalada no meio do mês, como no Antônio Carlos, cuja
    // primeira medição de julho/2026 é do dia 13 -- a abertura ficava ZERO e o
    // estoque escritural saía NEGATIVO nos primeiros dias, o que o PVA rejeita.
    // Aqui se RETROAGE da primeira medição real do período, desfazendo o que
    // se moveu no meio: abertura = medição(D) + saídas(ini..D-1) - entradas(ini..D-1).
    // É a mesma reconstrução que o contador faz à mão.
    const abertIni = new Map();   // tanqueNumero -> volume
    g.tanques.forEach(t => {
      const m = medicaoDia.get(t.numero + "|" + diaAnterior(dias[0]));
      if (m) { abertIni.set(t.numero, m.v); return; }
      let achou = null;
      for (let i = 0; i < dias.length; i++) {
        const mm = medicaoDia.get(t.numero + "|" + dias[i]);
        if (mm) { achou = { v: mm.v, i: i }; break; }
      }
      if (!achou) { abertIni.set(t.numero, null); return; }
      let volta = achou.v;
      for (let i = 0; i <= achou.i; i++) {
        volta += (vendasDia.get(t.id + "|" + dias[i]) || 0);
        volta -= (entradasDia.get(t.numero + "|" + dias[i]) || 0);
      }
      abertIni.set(t.numero, Math.max(0, volta));
      if (achou.i > 0) {
        A.push("Tanque " + t.numero + ": sem medição até " + dias[achou.i]
             + " — a abertura do período foi RECONSTITUÍDA a partir dela (confira com o contador).");
      }
    });
    let abertProd = null;
    dias.forEach(dia => {
      let entr = 0, said = 0, fech = 0, abert = 0, temFech = true;
      const porTanque = [];
      g.tanques.forEach(t => {
        const e = entradasDia.get(t.numero + "|" + dia) || 0;
        const s = vendasDia.get(t.id + "|" + dia) || 0;
        const mFech = medicaoDia.get(t.numero + "|" + dia);
        const mAbertPrev = abertIni.get(t.numero);
        const ab = mAbertPrev != null ? mAbertPrev : 0;
        const fc = mFech ? mFech.v : null;
        if (fc == null) { temFech = false; semMedicao++; }
        porTanque.push({ t, e, s, ab, fc: fc != null ? fc : Math.max(0, ab + e - s) });
        abertIni.set(t.numero, fc != null ? fc : Math.max(0, ab + e - s));   // vira abertura de amanhã
        entr += e; said += s; abert += ab; fech += (fc != null ? fc : Math.max(0, ab + e - s));
      });
      const disp = abert + entr;
      const escr = disp - said;
      const perda = Math.max(0, escr - fech);
      const ganho = Math.max(0, fech - escr);
      L.push(`|1300|${g.produto.codigo}|${_sfData(dia)}|${_sfNum(abert, 3)}|${_sfNum(entr, 3)}|${_sfNum(disp, 3)}|${_sfNum(said, 3)}|${_sfNum(escr, 3)}|${_sfNum(perda, 3)}|${_sfNum(ganho, 3)}|${_sfNum(fech, 3)}|`);
      porTanque.forEach(pt => {
        const dispT = pt.ab + pt.e, escrT = dispT - pt.s;
        L.push(`|1310|${pt.t.numero}|${_sfNum(pt.ab, 3)}|${_sfNum(pt.e, 3)}|${_sfNum(dispT, 3)}|${_sfNum(pt.s, 3)}|${_sfNum(escrT, 3)}|${_sfNum(Math.max(0, escrT - pt.fc), 3)}|${_sfNum(Math.max(0, pt.fc - escrT), 3)}|${_sfNum(pt.fc, 3)}|`);
        (bicosPorTanque.get(pt.t.id) || []).forEach(b => {
          const kb = vendasBico.get(b.numero + "|" + dia) || { vendas: 0, aferi: 0, encIni: null, encFim: null };
          L.push(`|1320|${b.numero}||||||${_sfNum(kb.encFim || 0, 3)}|${_sfNum(kb.encIni || 0, 3)}|${_sfNum(kb.aferi, 3)}|${_sfNum(kb.vendas, 3)}|`);
        });
      });
    });
  });
  if (semMedicao > 0)
    A.push(`${semMedicao} tanque(s)×dia sem medição física — o fechamento saiu pelo estoque escritural nesses dias.`);

  // bombas (1350/1360/1370) só se cadastradas no sped_config
  const bombas = cfg.bombas || [];
  bombas.forEach(bm => {
    L.push(`|1350|${_sfTxt(bm.serie)}|${_sfTxt(bm.fabricante)}|${_sfTxt(bm.modelo)}|${bm.medicao || 1}|`);
    (bm.lacres || []).forEach(lc => L.push(`|1360|${_sfTxt(lc.numero)}|${_sfData(lc.data)}|`));
    (bm.bicos || []).forEach(bi => {
      // o COD_ITEM do 1370 tem de existir no 0200 -- o PVA cruza os dois.
      // O sped_config do AC trazia os codigos do EFD antigo ("1","2","6") e o
      // 0200 declara os do Octano ("01","0301","00514"): 6 bicos apontavam para
      // item inexistente e o arquivo passava na contagem de campos mesmo assim.
      if (bi.cod_item && !itensDeclarados.has(String(bi.cod_item))) {
        A.push(`Bico ${bi.numero}: o 1370 aponta para o item "${bi.cod_item}", que NÃO está no 0200 `
             + `(itens declarados: ${Array.from(itensDeclarados).join(", ")}). `
             + `Corrija em Config. Fiscal — o PVA cruza os dois registros.`);
      }
      L.push(`|1370|${bi.numero}|${bi.cod_item}|${bi.tanque}|`);
    });
  });
  if (combys.length && !bombas.length)
    A.push("Bombas/lacres (1350-1370) não cadastrados no sped_config — o gabarito do posto os informa; confirme com o contador se são exigidos.");
  // Crédito de ICMS-ST na ENTRADA de combustível (registros 0400/0450/0460/0500 +
  // C110/C113/C195/C197): o gabarito do TecnoX os traz, mas dependem do ICMS-ST
  // destacado e dos documentos referenciados de CADA nota de compra — dado que
  // o Octano ainda não coleta do XML de entrada. Ficam para o contador
  // complementar no PVA (não afetam a apuração de saída, que é ST/monofásica).
  if ((d.entradas || []).length)
    A.push("Crédito de ICMS-ST das entradas (0400/0450/0460/0500, C110/C113/C195/C197) NÃO gerado — depende do ST destacado por nota; o contador complementa no PVA.");
  L.push(`|1990|${L.length - b1 + 1}|`);

  // ---------- BLOCO 9 ----------
  const t9 = L.length;
  L.push("|9001|0|");
  const cont = {};
  L.forEach(l => { const t = l.split("|")[1]; cont[t] = (cont[t] || 0) + 1; });
  const tipos = Object.keys(cont).sort();
  const n9900 = tipos.length + 3;              // os proprios 9900+9990+9999 tambem contam
  tipos.forEach(t => {
    let q = cont[t];
    if (t === "9001") q = 1;
    L.push(`|9900|${t}|${q}|`);
  });
  L.push(`|9900|9900|${n9900}|`);
  L.push("|9900|9990|1|");
  L.push("|9900|9999|1|");
  // 9990 = total de registros do bloco 9, contando o próprio 9990 e o 9999
  L.push(`|9990|${L.length - t9 + 2}|`);
  L.push(`|9999|${L.length + 1}|`);

  // ---------- AUTOVERIFICAÇÃO: contagem de campos vs o EFD real ----------
  const errCampos = new Map();
  L.forEach(l => {
    const p = l.split("|");
    const t = p[1], n = p.length - 3;
    const esperado = SPED_CAMPOS_REF[t];
    if (esperado != null && n !== esperado)
      errCampos.set(t, `${t}: gerado com ${n} campo(s), o arquivo real tem ${esperado}`);
  });
  errCampos.forEach(msg => A.push("ESTRUTURA: " + msg));

  return {
    linhas: L,
    avisos: A,
    resumo: {
      saidas: nSaidas, canceladas: nCancel, vSaidas, entradas: (d.entradas || []).length,
      vEntradas, debitos, creditos, aRecolher, combustiveis: combys.length,
    },
  };
}
