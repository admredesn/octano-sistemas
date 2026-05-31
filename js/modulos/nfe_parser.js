
// Parser completo de XML NF-e versão 4.00
// Suporta ICMS normal, ICMS Monofásico (combustíveis), ICMSST, etc.

function nfeNs(xml) {
  // Retorna namespace correto
  const root = xml.documentElement;
  return root.namespaceURI || 'http://www.portalfiscal.inf.br/nfe';
}

function q(el, tag) {
  // Busca tag com ou sem namespace
  if (!el) return null;
  const ns = nfeNs(el.ownerDocument || el);
  let found = el.getElementsByTagNameNS(ns, tag)[0];
  if (!found) found = el.getElementsByTagName(tag)[0];
  return found || null;
}

function qv(el, tag, def = '') {
  const node = q(el, tag);
  return node ? node.textContent.trim() : def;
}

function qf(el, tag, def = 0) {
  return parseFloat(qv(el, tag, String(def))) || def;
}

function parseNFe(xml) {
  const nfe = q(xml, 'infNFe') || xml;

  // ─── IDE ────────────────────────────────────────────────────────────────
  const ide = q(nfe, 'ide');
  const numero    = qv(ide, 'nNF');
  const serie     = qv(ide, 'serie');
  const natOp     = qv(ide, 'natOp');
  const dhEmi     = qv(ide, 'dhEmi').substring(0, 10);
  const dhEntSai  = qv(ide, 'dhSaiEnt').substring(0, 10) || dhEmi;
  const tpNF      = qv(ide, 'tpNF'); // 0=entrada 1=saída
  const finNFe    = qv(ide, 'finNFe');
  const mod       = qv(ide, 'mod');

  // ─── EMIT ───────────────────────────────────────────────────────────────
  const emit = q(nfe, 'emit');
  const emitCnpj  = qv(emit, 'CNPJ') || qv(emit, 'CPF');
  const emitNome  = qv(emit, 'xNome');
  const emitFant  = qv(emit, 'xFant');
  const emitIE    = qv(emit, 'IE');
  const emitCRT   = qv(emit, 'CRT');
  const enderEmit = q(emit, 'enderEmit');
  const emitEnd   = [qv(enderEmit,'xLgr'), qv(enderEmit,'nro'), qv(enderEmit,'xBairro')].filter(Boolean).join(', ');
  const emitMun   = qv(enderEmit, 'xMun');
  const emitUF    = qv(enderEmit, 'UF');

  // ─── DEST ───────────────────────────────────────────────────────────────
  const dest = q(nfe, 'dest');
  const destCnpj  = qv(dest, 'CNPJ') || qv(dest, 'CPF');
  const destNome  = qv(dest, 'xNome');
  const destIE    = qv(dest, 'IE');

  // ─── TOTAL ──────────────────────────────────────────────────────────────
  const tot    = q(nfe, 'ICMSTot');
  const vBC    = qf(tot, 'vBC');
  const vICMS  = qf(tot, 'vICMS');
  const vBCST  = qf(tot, 'vBCST');
  const vST    = qf(tot, 'vST');
  const vProd  = qf(tot, 'vProd');
  const vFrete = qf(tot, 'vFrete');
  const vSeg   = qf(tot, 'vSeg');
  const vDesc  = qf(tot, 'vDesc');
  const vIPI   = qf(tot, 'vIPI');
  const vPIS   = qf(tot, 'vPIS');
  const vCOFINS= qf(tot, 'vCOFINS');
  const vNF    = qf(tot, 'vNF');
  // ICMS Monofásico (combustíveis)
  const qBCMonoRet   = qf(tot, 'qBCMonoRet');
  const vICMSMonoRet = qf(tot, 'vICMSMonoRet');

  // ─── TRANSPORTE ─────────────────────────────────────────────────────────
  const transp = q(nfe, 'transp');
  const modFrete   = qv(transp, 'modFrete');
  const transpNome = qv(q(transp, 'transporta'), 'xNome');

  // ─── COBRANÇA ───────────────────────────────────────────────────────────
  const cobr  = q(nfe, 'cobr');
  const fat   = q(cobr, 'fat');
  const fatNum  = qv(fat, 'nFat');
  const fatVOrig = qf(fat, 'vOrig');
  const fatVLiq  = qf(fat, 'vLiq');

  // Duplicatas
  const dups = [];
  const dupEls = nfe.getElementsByTagName ? nfe.getElementsByTagName('dup') : [];
  for (const dup of dupEls) {
    dups.push({
      nDup: qv(dup, 'nDup'),
      dVenc: qv(dup, 'dVenc'),
      vDup: qf(dup, 'vDup'),
    });
  }

  // ─── PAGAMENTO ──────────────────────────────────────────────────────────
  const pagamentos = [];
  const pagEl = q(nfe, 'pag');
  const detPags = pagEl ? (pagEl.getElementsByTagName ? pagEl.getElementsByTagName('detPag') : []) : [];
  for (const p of detPags) {
    pagamentos.push({
      indPag: qv(p, 'indPag'), // 0=à vista 1=a prazo
      tPag:   qv(p, 'tPag'),
      xPag:   qv(p, 'xPag'),
      vPag:   qf(p, 'vPag'),
    });
  }

  // ─── INFO ADICIONAL ─────────────────────────────────────────────────────
  const infAdic = q(nfe, 'infAdic');
  const infCpl  = qv(infAdic, 'infCpl');

  // ─── PROTOCOLO ──────────────────────────────────────────────────────────
  const prot    = q(xml, 'infProt');
  const chNFe   = qv(prot, 'chNFe') || qv(nfe, 'Id').replace('NFe','');
  const nProt   = qv(prot, 'nProt');
  const dhRecbto= qv(prot, 'dhRecbto').substring(0, 10);
  const cStat   = qv(prot, 'cStat');
  const xMotivo = qv(prot, 'xMotivo');

  // ─── ITENS ──────────────────────────────────────────────────────────────
  const ns = nfeNs(xml);
  const dets = xml.getElementsByTagNameNS ? xml.getElementsByTagNameNS(ns, 'det') : xml.getElementsByTagName('det');
  const itens = [];

  for (const det of dets) {
    const prod    = q(det, 'prod');
    const imposto = q(det, 'imposto');
    const icms    = q(imposto, 'ICMS');
    const pis     = q(imposto, 'PIS');
    const cofins  = q(imposto, 'COFINS');
    const comb    = q(prod, 'comb');

    // CST ICMS — pode estar em vários elementos filho
    let cstIcms = '', aliqIcms = 0, vBCItem = 0, vICMSItem = 0;
    let qBCMonoRetItem = 0, adRemItem = 0, vICMSMonoRetItem = 0;
    let icmsElem = null;
    if (icms) {
      // Pega primeiro filho do ICMS
      for (const child of icms.children || []) {
        icmsElem = child;
        break;
      }
      if (!icmsElem && icms.firstElementChild) icmsElem = icms.firstElementChild;
    }
    if (icmsElem) {
      cstIcms          = qv(icmsElem, 'CST') || qv(icmsElem, 'CSOSN');
      aliqIcms         = qf(icmsElem, 'pICMS');
      vBCItem          = qf(icmsElem, 'vBC');
      vICMSItem        = qf(icmsElem, 'vICMS');
      // Monofásico
      qBCMonoRetItem   = qf(icmsElem, 'qBCMonoRet');
      adRemItem        = qf(icmsElem, 'adRemICMSRet');
      vICMSMonoRetItem = qf(icmsElem, 'vICMSMonoRet');
    }

    // PIS
    let cstPis = '', aliqPis = 0, vPisItem = 0;
    const pisElem = pis?.firstElementChild || (pis ? pis.children?.[0] : null);
    if (pisElem) {
      cstPis   = qv(pisElem, 'CST');
      aliqPis  = qf(pisElem, 'pPIS');
      vPisItem = qf(pisElem, 'vPIS');
    }

    // COFINS
    let cstCofins = '', aliqCofins = 0, vCofinsItem = 0;
    const cofinsElem = cofins?.firstElementChild || (cofins ? cofins.children?.[0] : null);
    if (cofinsElem) {
      cstCofins   = qv(cofinsElem, 'CST');
      aliqCofins  = qf(cofinsElem, 'pCOFINS');
      vCofinsItem = qf(cofinsElem, 'vCOFINS');
    }

    // Combustível ANP
    const codAnp  = qv(comb, 'cProdANP');
    const descAnp = qv(comb, 'descANP');
    const pBio    = qf(comb, 'pBio');
    const ufCons  = qv(comb, 'UFCons');

    itens.push({
      nItem:         det.getAttribute('nItem') || String(itens.length + 1),
      codigo:        qv(prod, 'cProd'),
      ean:           qv(prod, 'cEAN'),
      descricao:     qv(prod, 'xProd'),
      ncm:           qv(prod, 'NCM'),
      cest:          qv(prod, 'CEST'),
      cfop:          qv(prod, 'CFOP'),
      unidade:       qv(prod, 'uCom'),
      quantidade:    qf(prod, 'qCom'),
      valorUnitario: qf(prod, 'vUnCom'),
      valorTotal:    qf(prod, 'vProd'),
      vDesc:         qf(prod, 'vDesc'),
      // ICMS
      cstIcms, aliqIcms, vBCItem, vICMSItem,
      // ICMS Monofásico
      qBCMonoRetItem, adRemItem, vICMSMonoRetItem,
      ehMonofasico:  vICMSMonoRetItem > 0,
      // PIS/COFINS
      cstPis, aliqPis, vPisItem,
      cstCofins, aliqCofins, vCofinsItem,
      // Combustível
      codAnp, descAnp, pBio, ufCons,
      ehCombustivel: !!codAnp,
      tanqueId: null,
    });
  }

  return {
    // Identificação
    chNFe, nProt, dhRecbto, cStat, xMotivo,
    numero, serie, natOp, dhEmi, dhEntSai, tpNF, finNFe, mod,
    // Emitente
    emitCnpj, emitNome, emitFant, emitIE, emitCRT,
    emitEnd, emitMun, emitUF,
    // Destinatário
    destCnpj, destNome, destIE,
    // Totais
    vBC, vICMS, vBCST, vST, vProd, vFrete, vSeg, vDesc, vIPI,
    vPIS, vCOFINS, vNF,
    // ICMS Monofásico (combustíveis)
    qBCMonoRet, vICMSMonoRet,
    // Transporte
    modFrete, transpNome,
    // Cobrança
    fatNum, fatVOrig, fatVLiq, dups,
    // Pagamento
    pagamentos,
    // Info adicional
    infCpl,
    // Itens
    itens,
  };
}
