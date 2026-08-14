// ============================================================
//  SPED ECD (Escrituração Contábil Digital) — gerador
//  Layouts dos registros extraídos do ACBr (ACBrSPEDContabil).
//  Função pura spedEcdMontar(d) -> { texto, nome, avisos, contagem }.
//  Fonte de dados: oct_contabil_contas / _lancamentos / _partidas (motor contábil).
//  REGRA: o arquivo é gerado para o CONTADOR validar/assinar no PVA da ECD.
// ============================================================

// contagem de campos por registro (autoverificação do bloco 9, como no sped_fiscal)
const ECD_CAMPOS_REF = {
  "0000": 22, "0001": 1, "0007": 2, "0990": 1,
  "I001": 1, "I010": 2, "I030": 12, "I050": 7, "I051": 3, "I052": 2,
  "I150": 2, "I155": 14, "I200": 6, "I250": 10, "I990": 1,
  "J001": 1, "J005": 4, "J100": 14, "J150": 17, "J900": 3, "J930": 10, "J990": 1,
  "9001": 1, "9900": 2, "9990": 1, "9999": 1,
};

function _ecdData(iso) {            // yyyy-mm-dd... -> DDMMAAAA
  const s = String(iso || "").slice(0, 10);
  if (!s || s.indexOf("-") < 0) return "";
  const [a, m, dd] = s.split("-");
  return `${dd}${m}${a}`;
}
function _ecdNum(v) {               // 1234.5 -> "1234,50" (2 casas, vírgula)
  return (Number(v || 0)).toFixed(2).replace(".", ",");
}
function _ecdTxt(s) {               // remove pipe/quebra que quebrariam o registro
  return String(s == null ? "" : s).replace(/[|\r\n]/g, " ").trim();
}
// COD_NAT da ECD a partir da natureza da conta do motor
function _ecdCodNat(natureza) {
  const n = String(natureza || "").toLowerCase();
  if (n.indexOf("ativo") >= 0) return "01";
  if (n.indexOf("passivo") >= 0) return "02";
  if (n.indexOf("patrim") >= 0 || n === "pl") return "03";
  if (n.indexOf("result") >= 0 || n.indexOf("receita") >= 0 ||
      n.indexOf("despesa") >= 0 || n.indexOf("custo") >= 0) return "04";
  if (n.indexOf("compens") >= 0) return "05";
  return "09";
}

function spedEcdMontar(d) {
  const emp = d.empresa || {};
  const cfg = d.spedConfig || {};
  const contador = cfg.contador || {};
  const contas = (d.contas || []).slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  const lancs = (d.lancamentos || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const partidas = d.partidas || [];
  const signatarios = d.signatarios && d.signatarios.length ? d.signatarios : _ecdSignatariosPadrao(emp, contador);
  const avisos = [];

  const cnpj = (emp.cnpj || "").replace(/\D/g, "");
  const ie = (emp.ie || "").replace(/\D/g, "");
  const codMun = String(cfg.cod_mun || emp.c_mun || "").replace(/\D/g, "");
  const dtIni = _ecdData(d.dtIni), dtFim = _ecdData(d.dtFim);
  const anoFim = String(d.dtFim || "").slice(0, 4);

  // partidas por lançamento (para I200/I250)
  const partPorLanc = new Map();
  partidas.forEach(p => {
    if (!partPorLanc.has(p.lancamento_id)) partPorLanc.set(p.lancamento_id, []);
    partPorLanc.get(p.lancamento_id).push(p);
  });

  // saldos por conta analítica (I155) — inicial (antes de dtIni), débito, crédito, final
  const contaByCod = new Map(contas.map(c => [String(c.codigo), c]));
  const lancById = new Map(lancs.map(l => [l.id, l]));
  const saldos = new Map(); // cod -> {ini, deb, cred}
  const _acc = (cod) => { if (!saldos.has(cod)) saldos.set(cod, { ini: 0, deb: 0, cred: 0 }); return saldos.get(cod); };
  partidas.forEach(p => {
    const l = lancById.get(p.lancamento_id); if (!l) return;
    const dia = String(l.data || "").slice(0, 10);
    const cod = String(p.conta_codigo);
    const val = Number(p.valor || 0);
    const s = _acc(cod);
    const antes = dia < String(d.dtIni).slice(0, 10);
    if (antes) { s.ini += (p.dc === "D" ? val : -val); }
    else if (dia <= String(d.dtFim).slice(0, 10)) { if (p.dc === "D") s.deb += val; else s.cred += val; }
  });

  const L = [];

  // ---------------- BLOCO 0 ----------------
  // 0000: DT_INI DT_FIN NOME CNPJ UF IE COD_MUN IM IND_SIT_ESP IND_SIT_INI_PER IND_NIRE
  //       IND_FIN_ESC COD_HASH_SUB NIRE_SUBST IND_EMP_GRD_PRT TIP_ECD COD_SCP IDENT_MF
  //       IND_ESC_CONS IND_CENTRALIZADA IND_MUDANC_PC COD_PLAN_REF
  L.push(`|0000|${dtIni}|${dtFim}|${_ecdTxt(emp.nome)}|${cnpj}|${emp.uf || "MG"}|${ie}|${codMun}|${(emp.inscricao_municipal || "").replace(/\D/g, "")}|0|0|0|0|||N|0|0|N|N|N|N|${cfg.cod_plan_ref || ""}|`);
  L.push(`|0001|0|`);
  // 0007: outras inscrições (IE) — informa a IE estadual
  if (ie) L.push(`|0007|${emp.uf || "MG"}|${ie}|`);
  // 0990: total de linhas do bloco 0 (inclui o próprio 0990)
  const q0 = L.filter(x => x.startsWith("|0")).length + 1;
  L.push(`|0990|${q0}|`);

  // ---------------- BLOCO I ----------------
  const i0 = L.length;
  L.push(`|I001|0|`);
  // I010: IND_ESC (G=completa) COD_VER_LC (leiaute vigente)
  L.push(`|I010|G|${cfg.cod_ver_lc || "9.00"}|`);
  // I030: termo de abertura do livro Diário
  const qtdLin = 0; // preenchido no fim
  const idxI030 = L.length;
  L.push(`|I030|TERMO DE ABERTURA|LIVRO DIÁRIO|QTDLIN|${_ecdTxt(emp.nome)}||${cnpj}|${dtFim}|${dtFim}|${_ecdTxt(emp.cidade || "")}||${_ecdTxt(contador.nome || "")}||`);
  // I050: plano de contas
  contas.forEach(c => {
    const indCta = String(c.tipo || "").toUpperCase() === "S" ? "S" : "A";
    L.push(`|I050|${dtIni}|${_ecdCodNat(c.natureza)}|${indCta}|${c.nivel || ""}|${c.codigo}|${c.conta_pai || ""}|${_ecdTxt(c.nome)}|`);
  });
  // I150 + I155: saldos periódicos (um período: dtIni..dtFim)
  L.push(`|I150|${dtIni}|${dtFim}|`);
  contas.filter(c => String(c.tipo || "").toUpperCase() !== "S").forEach(c => {
    const s = saldos.get(String(c.codigo)); if (!s) return;
    if (!s.ini && !s.deb && !s.cred) return; // sem movimento e sem saldo → omite
    const ini = s.ini, fin = s.ini + s.deb - s.cred;
    const dcIni = ini >= 0 ? "D" : "C", dcFim = fin >= 0 ? "D" : "C";
    L.push(`|I155|${c.codigo}||${_ecdNum(Math.abs(ini))}|${dcIni}|${_ecdNum(s.deb)}|${_ecdNum(s.cred)}|${_ecdNum(Math.abs(fin))}|${dcFim}|||||||`);
  });
  // I200 + I250: lançamentos e partidas
  let numLcto = 0;
  lancs.forEach(l => {
    const ps = partPorLanc.get(l.id) || [];
    if (!ps.length) return;
    numLcto++;
    const dtL = _ecdData(l.data);
    const valL = ps.filter(p => p.dc === "D").reduce((a, p) => a + Number(p.valor || 0), 0);
    L.push(`|I200|${numLcto}|${dtL}|${_ecdNum(valL)}|N|||`);
    ps.forEach(p => {
      L.push(`|I250|${p.conta_codigo}||${_ecdNum(p.valor)}|${p.dc}|||||${_ecdTxt(p.historico || l.historico || "")}||`);
    });
  });
  // I990
  const qI = L.length - i0 + 1;
  L.push(`|I990|${qI}|`);
  // preenche QTD_LIN do termo de abertura (linhas do bloco I)
  L[idxI030] = L[idxI030].replace("QTDLIN", String(qI));

  // ---------------- BLOCO J (Balanço + DRE, rascunho p/ o contador) ----------------
  const j0 = L.length;
  L.push(`|J001|0|`);
  // Balanço Patrimonial (J005 ID_DEM=1 + J100)
  L.push(`|J005|${dtIni}|${dtFim}|1|BALANÇO PATRIMONIAL|`);
  const balanco = contas.filter(c => ["01", "02", "03"].indexOf(_ecdCodNat(c.natureza)) >= 0);
  balanco.forEach(c => {
    const s = saldos.get(String(c.codigo));
    const fin = s ? (s.ini + s.deb - s.cred) : 0;
    if (String(c.tipo || "").toUpperCase() !== "S" && !fin) return;
    const indAgl = String(c.tipo || "").toUpperCase() === "S" ? "S" : "A";
    const grpBal = _ecdCodNat(c.natureza) === "01" ? "A" : "P"; // Ativo / Passivo(+PL)
    const dc = fin >= 0 ? "D" : "C";
    // J100: COD_AGL IND_COD_AGL NIVEL_AGL COD_AGL_SUP IND_GRP_BAL DESCR_COD_AGL VL_CTA IND_DC_BAL VL_CTA_INI IND_DC_BAL_INI IND_DC_CTA_INI VL_CTA_FIN IND_DC_CTA_FIN NOTAS
    L.push(`|J100|${c.codigo}|${indAgl}|${c.nivel || ""}|${c.conta_pai || ""}|${grpBal}|${_ecdTxt(c.nome)}|${_ecdNum(Math.abs(fin))}|${dc}|0,00|${dc}|${dc}|${_ecdNum(Math.abs(fin))}|${dc}||`);
  });
  // DRE (J005 ID_DEM=3 + J150)
  L.push(`|J005|${dtIni}|${dtFim}|3|DEMONSTRAÇÃO DO RESULTADO|`);
  let ordem = 0;
  contas.filter(c => _ecdCodNat(c.natureza) === "04").forEach(c => {
    const s = saldos.get(String(c.codigo));
    const mov = s ? (s.cred - s.deb) : 0; // resultado: crédito = receita
    if (String(c.tipo || "").toUpperCase() !== "S" && !mov && !(s && (s.deb || s.cred))) return;
    ordem++;
    const dc = mov >= 0 ? "C" : "D";
    const indAgl = String(c.tipo || "").toUpperCase() === "S" ? "S" : "A";
    // J150: NU_ORDEM COD_AGL IND_COD_AGL NIVEL_AGL COD_AGL_SUP DESCR_COD_AGL VL_CTA_INI IND_DC_CTA_INI VL_CTA_FIN IND_DC_CTA_FIN VL_CTA IND_DC_CTA IND_GRP_DRE IND_VL VL_CTA_ULT_DRE IND_VL_ULT_DRE NOTAS
    L.push(`|J150|${ordem}|${c.codigo}|${indAgl}|${c.nivel || ""}|${c.conta_pai || ""}|${_ecdTxt(c.nome)}|0,00|${dc}|${_ecdNum(Math.abs(mov))}|${dc}|${_ecdNum(Math.abs(mov))}|${dc}|R|0|0,00|0||`);
  });
  // J900 termo de encerramento + J930 signatários
  L.push(`|J900|TERMO DE ENCERRAMENTO|LIVRO DIÁRIO|${anoFim}|`);
  signatarios.forEach(sig => {
    // J930: IDENT_NOM IDENT_CPF IDENT_QUALIF COD_ASSIN EMAIL FONE UF_CRC NUM_SEQ_CRC DT_CRC IND_RESP_LEGAL
    L.push(`|J930|${_ecdTxt(sig.nome)}|${(sig.cpf || "").replace(/\D/g, "")}|${sig.qualif || "900"}|${sig.cod_assin || "900"}|${_ecdTxt(sig.email || "")}|${(sig.fone || "").replace(/\D/g, "")}|${sig.uf_crc || ""}|${sig.num_crc || ""}|${sig.dt_crc ? _ecdData(sig.dt_crc) : ""}|${sig.resp_legal || "S"}|`);
  });
  const qJ = L.length - j0 + 1;
  L.push(`|J990|${qJ}|`);

  // ---------------- BLOCO 9 (contadores) ----------------
  const cont9 = new Map();
  L.forEach(l => { const r = l.split("|")[1]; cont9.set(r, (cont9.get(r) || 0) + 1); });
  const j9 = L.length;
  L.push(`|9001|0|`);
  cont9.set("9001", 1);
  // total de registros DISTINTOS = 1 linha 9900 por registro (incl. 9900/9990/9999)
  const total9900 = cont9.size + 3;   // + 9900 + 9990 + 9999
  cont9.set("9900", total9900);
  cont9.set("9990", 1);
  cont9.set("9999", 1);
  Array.from(cont9.keys()).sort().forEach(r => L.push(`|9900|${r}|${cont9.get(r)}|`));
  const q9 = (L.length - j9) + 1;
  L.push(`|9990|${q9}|`);
  // 9999: total de linhas do arquivo (inclui o próprio 9999)
  L.push(`|9999|${L.length + 1}|`);

  // ---------------- autoverificação de campos ----------------
  L.forEach((linha, i) => {
    const campos = linha.split("|");
    const reg = campos[1];
    const nCampos = campos.length - 3; // campos de dados (tira REG e os 2 pipes das pontas)
    if (ECD_CAMPOS_REF[reg] != null && nCampos !== ECD_CAMPOS_REF[reg]) {
      avisos.push(`Registro ${reg} (linha ${i + 1}): ${nCampos} campos, esperado ${ECD_CAMPOS_REF[reg]}.`);
    }
  });
  if (!contas.length) avisos.push("Plano de contas contábil vazio — rode o Motor Contábil antes de gerar a ECD.");
  if (!numLcto) avisos.push("Nenhum lançamento contábil no período — a ECD sairá sem escrituração.");
  avisos.push("Balanço (J100) e DRE (J150) saem em RASCUNHO a partir do balancete — o contador precisa revisar a aglutinação antes de assinar.");

  const texto = L.join("\r\n") + "\r\n";
  const nome = `ECD_${cnpj}_${anoFim}.txt`;
  return { texto, nome, avisos, contagem: { registros: L.length, contas: contas.length, lancamentos: numLcto } };
}

function _ecdSignatariosPadrao(emp, contador) {
  const sig = [];
  // responsável legal (empresa) — o contador ajusta o CPF/qualificação
  sig.push({ nome: emp.nome, cpf: "", qualif: "205", resp_legal: "S" });
  if (contador && contador.nome) {
    sig.push({ nome: contador.nome, cpf: contador.cpf || "", qualif: "900",
               email: contador.email || "", uf_crc: contador.uf_crc || "", num_crc: contador.crc || "",
               resp_legal: "N" });
  }
  return sig;
}
