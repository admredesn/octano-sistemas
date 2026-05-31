
// Parser completo de XML NF-e versão 4.00
function nfeNs(xml) {
  return xml.documentElement?.namespaceURI || 'http://www.portalfiscal.inf.br/nfe';
}

function q(el, tag) {
  if (!el) return null;
  const ns = nfeNs(el.ownerDocument || el);
  return el.getElementsByTagNameNS(ns, tag)[0] || el.getElementsByTagName(tag)[0] || null;
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
  const ns  = nfeNs(xml);

  // IDE
  const ide     = q(nfe, 'ide');
  const numero  = qv(ide, 'nNF');
  const serie   = qv(ide, 'serie');
  const natOp   = qv(ide, 'natOp');
  const dhEmi   = qv(ide, 'dhEmi').substring(0, 10);
  const mod     = qv(ide, 'mod');
  const finNFe  = qv(ide, 'finNFe');
  const tpNF    = qv(ide, 'tpNF');

  // EMIT
  const emit     = q(nfe, 'emit');
  const emitCnpj = qv(emit, 'CNPJ') || qv(emit, 'CPF');
  const emitNome = qv(emit, 'xNome');
  const emitFant = qv(emit, 'xFant');
  const emitIE   = qv(emit, 'IE');
  const emitCRT  = qv(emit, 'CRT');
  const enderEmit = q(emit, 'enderEmit');
  const emitEnd  = [qv(enderEmit,'xLgr'),qv(enderEmit,'nro'),qv(enderEmit,'xBairro')].filter(Boolean).join(', ');
  const emitMun  = qv(enderEmit, 'xMun');
  const emitUF   = qv(enderEmit, 'UF');

  // DEST
  const dest     = q(nfe, 'dest');
  const destCnpj = qv(dest, 'CNPJ') || qv(dest, 'CPF');
  const destNome = qv(dest, 'xNome');
  const destIE   = qv(dest, 'IE');

  // TOTAL
  const tot         = q(nfe, 'ICMSTot');
  const vBC         = qf(tot, 'vBC');
  const vICMS       = qf(tot, 'vICMS');
  const vBCST       = qf(tot, 'vBCST');
  const vST         = qf(tot, 'vST');
  const vProd       = qf(tot, 'vProd');
  const vFrete      = qf(tot, 'vFrete');
  const vDesc       = qf(tot, 'vDesc');
  const vIPI        = qf(tot, 'vIPI');
  const vPIS        = qf(tot, 'vPIS');
  const vCOFINS     = qf(tot, 'vCOFINS');
  const vNF         = qf(tot, 'vNF');
  const qBCMonoRet  = qf(tot, 'qBCMonoRet');
  const vICMSMonoRet= qf(tot, 'vICMSMonoRet');

  // TRANSPORTE
  const transp     = q(nfe, 'transp');
  const modFrete   = qv(transp, 'modFrete');
  const transpNome = qv(q(transp, 'transporta'), 'xNome');

  // COBRANÇA
  const cobr   = q(nfe, 'cobr');
  const fat    = q(cobr, 'fat');
  const fatNum = qv(fat, 'nFat');
  const fatVLiq= qf(fat, 'vLiq');

  // Duplicatas
  const dups = [];
  for (const dup of (nfe.getElementsByTagNameNS ? nfe.getElementsByTagNameNS(ns,'dup') : nfe.getElementsByTagName('dup'))) {
    dups.push({ nDup: qv(dup,'nDup'), dVenc: qv(dup,'dVenc'), vDup: qf(dup,'vDup') });
  }

  // PAGAMENTO
  const pagamentos = [];
  const pagEl = q(nfe, 'pag');
  for (const p of (pagEl?.getElementsByTagNameNS ? pagEl.getElementsByTagNameNS(ns,'detPag') : pagEl?.getElementsByTagName('detPag') || [])) {
    pagamentos.push({ indPag: qv(p,'indPag'), tPag: qv(p,'tPag'), xPag: qv(p,'xPag'), vPag: qf(p,'vPag') });
  }

  // INFO ADICIONAL
  const infAdic = q(nfe, 'infAdic');
  const infCpl  = qv(infAdic, 'infCpl');

  // PROTOCOLO
  const prot    = q(xml, 'infProt');
  const chNFe   = qv(prot, 'chNFe') || (qv(nfe, 'Id') || '').replace('NFe','');
  const nProt   = qv(prot, 'nProt');

  // ITENS
  const dets = nfe.getElementsByTagNameNS ? nfe.getElementsByTagNameNS(ns,'det') : nfe.getElementsByTagName('det');
  const itens = [];
  let cfopCapa = ''; // pega CFOP do primeiro item

  for (const det of dets) {
    const prod    = q(det, 'prod');
    const imposto = q(det, 'imposto');
    const icms    = q(imposto, 'ICMS');
    const pis     = q(imposto, 'PIS');
    const cofins  = q(imposto, 'COFINS');
    const comb    = q(prod, 'comb');

    const cfopItem = qv(prod, 'CFOP');
    if (!cfopCapa && cfopItem) cfopCapa = cfopItem;

    // ICMS — pega primeiro filho
    let cstIcms='', aliqIcms=0, vBCItem=0, vICMSItem=0;
    let qBCMonoRetItem=0, adRemItem=0, vICMSMonoRetItem=0;
    const icmsChild = icms?.firstElementChild || (icms?.children?.[0]);
    if (icmsChild) {
      cstIcms           = qv(icmsChild,'CST') || qv(icmsChild,'CSOSN');
      aliqIcms          = qf(icmsChild,'pICMS');
      vBCItem           = qf(icmsChild,'vBC');
      vICMSItem         = qf(icmsChild,'vICMS');
      qBCMonoRetItem    = qf(icmsChild,'qBCMonoRet');
      adRemItem         = qf(icmsChild,'adRemICMSRet');
      vICMSMonoRetItem  = qf(icmsChild,'vICMSMonoRet');
    }

    // PIS
    let cstPis='', aliqPis=0, vPisItem=0;
    const pisChild = pis?.firstElementChild || pis?.children?.[0];
    if (pisChild) { cstPis=qv(pisChild,'CST'); aliqPis=qf(pisChild,'pPIS'); vPisItem=qf(pisChild,'vPIS'); }

    // COFINS
    let cstCofins='', aliqCofins=0, vCofinsItem=0;
    const cofinsChild = cofins?.firstElementChild || cofins?.children?.[0];
    if (cofinsChild) { cstCofins=qv(cofinsChild,'CST'); aliqCofins=qf(cofinsChild,'pCOFINS'); vCofinsItem=qf(cofinsChild,'vCOFINS'); }

    // ANP
    const codAnp  = qv(comb, 'cProdANP');
    const descAnp = qv(comb, 'descANP');
    const pBio    = qf(comb, 'pBio');
    const ufCons  = qv(comb, 'UFCons');

    itens.push({
      nItem: det.getAttribute('nItem') || String(itens.length+1),
      codigo: qv(prod,'cProd'), ean: qv(prod,'cEAN'),
      descricao: qv(prod,'xProd'), ncm: qv(prod,'NCM'), cest: qv(prod,'CEST'),
      cfop: cfopItem, unidade: qv(prod,'uCom'),
      quantidade: qf(prod,'qCom'), valorUnitario: qf(prod,'vUnCom'), valorTotal: qf(prod,'vProd'),
      vDesc: qf(prod,'vDesc'),
      cstIcms, aliqIcms, vBCItem, vICMSItem,
      qBCMonoRetItem, adRemItem, vICMSMonoRetItem,
      ehMonofasico: vICMSMonoRetItem > 0,
      cstPis, aliqPis, vPisItem,
      cstCofins, aliqCofins, vCofinsItem,
      codAnp, descAnp, pBio, ufCons,
      ehCombustivel: !!codAnp,
      tanqueId: null,
    });
  }

  return {
    chNFe, nProt,
    numero, serie, natOp, dhEmi, tpNF, finNFe, mod,
    cfopCapa, // CFOP da capa = CFOP do primeiro item
    emitCnpj, emitNome, emitFant, emitIE, emitCRT, emitEnd, emitMun, emitUF,
    destCnpj, destNome, destIE,
    vBC, vICMS, vBCST, vST, vProd, vFrete, vDesc, vIPI, vPIS, vCOFINS, vNF,
    qBCMonoRet, vICMSMonoRet,
    modFrete, transpNome,
    fatNum, fatVLiq, dups,
    pagamentos, infCpl,
    itens,
  };
}
