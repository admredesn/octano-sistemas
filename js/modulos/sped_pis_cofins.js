// ============================================================
// SPED EFD-Contribuições (PIS/COFINS) — Layout 006
// Reconstrução Fase 1: baseado em SAÍDAS (NFC-e mod 65 + NF-e saída mod 55),
// com tratamento monofásico de combustível (CST 04 = alíquota zero na revenda).
//
// Referência: arquivos validados do contador (jan e dez/2024).
// Lê itens fiscais de oct_nfce.itens (JSON) e oct_nfe_saida(_itens).
// ============================================================

// formata número no padrão SPED: vírgula decimal, sem separador de milhar,
// sem zeros à direita desnecessários ("120" e não "120,00"; "23,9" e não "23,90")
function spedNum(v) {
  const n = Number(v || 0);
  if (n === 0) return '0';
  let s = n.toFixed(2);          // 2 casas
  s = s.replace(/0+$/, '').replace(/\.$/, ''); // tira zeros à direita
  return s.replace('.', ',');
}

// data ISO (yyyy-mm-dd...) -> DDMMAAAA
function spedData(iso) {
  if (!iso) return '';
  const d = String(iso).substring(0, 10).split('-'); // [yyyy,mm,dd]
  if (d.length !== 3) return '';
  return d[2] + d[1] + d[0];
}

// agrupa itens por (CFOP + CST_PIS + alíq_PIS + CST_COFINS + alíq_COFINS)
// que é exatamente a chave de consolidação do registro C175.
function chaveC175(it) {
  return [it.cfop || '', it.cst_pis || '49', it.aliq_pis || 0,
          it.cst_cofins || '49', it.aliq_cofins || 0].join('#');
}

async function gerarSpedPisCofinsV2() {
  const ano = parseInt(document.getElementById('spis-ano').value);
  const mes = parseInt(document.getElementById('spis-mes').value);
  const empresaId = window._contab_empresa_id;
  const empresa = window._contab_empresa;
  const div = document.getElementById('sped-pis-preview');
  div.innerHTML = '<p style="color:#888">Gerando...</p>';

  // pré-validação de cadastro da empresa
  const faltas = [];
  const cnpj = (empresa?.cnpj || '').replace(/\D/g, '');
  if (!cnpj) faltas.push('CNPJ da empresa');
  const codMun = empresa?.cod_municipio || empresa?.codigo_ibge || empresa?.cod_mun || '';
  if (!codMun) faltas.push('Código IBGE do município (cod_municipio)');
  if (faltas.length) {
    div.innerHTML = '<div style="background:#2a1a1a;border:1px solid #5a2a2a;border-radius:8px;padding:16px;color:#f88">'
      + '<strong>Não é possível gerar o SPED.</strong><br>Faltam dados no cadastro da empresa:<ul style="margin:8px 0 0 18px">'
      + faltas.map(f => '<li>' + f + '</li>').join('') + '</ul></div>';
    return;
  }

  const dtIni = ano + '-' + String(mes).padStart(2, '0') + '-01';
  const dtFimD = new Date(ano, mes, 0);
  const dtFim = ano + '-' + String(mes).padStart(2, '0') + '-' + String(dtFimD.getDate()).padStart(2, '0');
  const dtIniFmt = spedData(dtIni);
  const dtFimFmt = spedData(dtFim);

  // ---- busca as vendas do período ----
  // NFC-e: data_emissao é timestamp; filtra pelo range do mês e status autorizada
  const [nfceRes, saidaRes, prodRes] = await Promise.all([
    sb.from('oct_nfce').select('numero,serie,modelo,status,valor_total,data_emissao,chave_nfe,itens,cpf_consumidor')
      .eq('empresa_id', empresaId).eq('status', 'autorizada')
      .gte('data_emissao', dtIni + 'T00:00:00').lte('data_emissao', dtFim + 'T23:59:59'),
    sb.from('oct_nfe_saida').select('*, oct_nfe_saida_itens(*)')
      .eq('empresa_id', empresaId).in('status', ['autorizada', 'transmitida'])
      .gte('emissao', dtIni).lte('emissao', dtFim),
    sb.from('oct_produtos').select('id,codigo,descricao,ncm,unidade,cod_anp').eq('empresa_id', empresaId),
  ]);

  const nfces = nfceRes.data || [];
  const saidas = saidaRes.data || [];
  const prods = prodRes.data || [];

  // junta todas as "notas de saída" num formato único {tipo, mod, ...itens[]}
  const docs = [];
  nfces.forEach(n => docs.push({
    mod: '65', serie: n.serie, numero: n.numero, chave: n.chave_nfe,
    emissao: n.data_emissao, valor_total: n.valor_total,
    itens: (n.itens || []).map(it => ({
      cfop: it.cfop, cst_pis: it.cst_pis, aliq_pis: it.aliq_pis,
      cst_cofins: it.cst_cofins, aliq_cofins: it.aliq_cofins,
      valor_total: it.valor_total, codigo: it.codigo, ncm: it.ncm,
      cod_anp: it.cod_anp, ind_monofasico: it.ind_monofasico,
    })),
  }));
  saidas.forEach(n => docs.push({
    mod: '55', serie: n.serie, numero: n.numero, chave: n.chave_nfe || n.chave,
    emissao: n.emissao, valor_total: n.valor_total,
    itens: (n.oct_nfe_saida_itens || []).map(it => ({
      cfop: it.cfop, cst_pis: it.cst_pis, aliq_pis: it.aliq_pis,
      cst_cofins: it.cst_cofins, aliq_cofins: it.aliq_cofins,
      valor_total: it.valor_total, codigo: it.codigo, ncm: it.ncm,
      cod_anp: it.cod_anp, ind_monofasico: it.ind_monofasico,
    })),
  }));

  // ---- montagem dos registros ----
  const linhas = [];
  const L = (txt) => linhas.push(txt);
  const ie = empresa?.ie || '';
  const nome = empresa?.nome || empresa?.razao_social || empresa?.nome_fantasia || 'EMPRESA';
  const uf = empresa?.uf || 'MG';

  // ---- BLOCO 0 ----
  // |0000|COD_VER|TIPO_ESCRIT|...|DT_INI|DT_FIN|NOME|CNPJ|UF|COD_MUN|SUFRAMA|IND_NAT_PJ|IND_ATIV|
  L(`|0000|006|0|||${dtIniFmt}|${dtFimFmt}|${nome}|${cnpj}|${uf}|${codMun}||00|0|`);
  L('|0001|0|');
  // 0110: COD_INC_TRIB | IND_APRO_CRED | COD_TIPO_CONT | IND_REG_CUM
  L('|0110|1|1|1||');
  // 0140: estabelecimento
  L(`|0140|01|${nome}|${cnpj}|${uf}|${ie}|${codMun}|||`);
  // 0190: unidades
  const unidades = [...new Set(prods.map(p => (p.unidade || 'UN')).concat(docs.flatMap(d => d.itens.map(i => 'UN'))))];
  unidades.forEach(u => L(`|0190|${u}|${u}|`));
  // 0200: produtos (com 0206 quando houver cod_anp)
  prods.forEach(p => {
    L(`|0200|${p.codigo}|${(p.descricao || '').substring(0, 100)}|||${p.unidade || 'UN'}|00|${p.ncm || ''}||||0|`);
    if (p.cod_anp) L(`|0206|${p.cod_anp}|`);
  });
  L(`|0990|${contarBloco(linhas, '0')}|`);

  // ---- BLOCO A (serviços) — vazio ----
  L('|A001|1|');
  L(`|A990|${contarBloco(linhas, 'A')}|`);

  // ---- BLOCO C (documentos fiscais — saídas) ----
  const cStart = linhas.length;
  L('|C001|0|');
  L(`|C010|${cnpj}|0|`);
  // acumuladores de apuração por CST/alíquota
  const apuracaoPis = {};    // chave aliq -> {base, valor}
  const apuracaoCof = {};
  let receitaMonofasica = 0; // CST 04 (e 06/07/08/09 sem incidência)

  docs.forEach(doc => {
    const vTot = Number(doc.valor_total || 0);
    const emi = spedData(doc.emissao);
    // C100: |C100|IND_OPER(1=saída)|IND_EMIT(0=própria)|COD_PART||COD_MOD|COD_SIT|SER|NUM|CHV|DT_DOC|DT_E_S|VL_DOC|...
    L(`|C100|1|0||${doc.mod}|00|${doc.serie || ''}|${doc.numero || ''}|${doc.chave || ''}|${emi}|${emi}|${spedNum(vTot)}|0|0|0|${spedNum(vTot)}|9|0|0|0|0|0||||0|0|||`);
    // consolida itens por chave C175
    const grupos = {};
    (doc.itens || []).forEach(it => {
      const k = chaveC175(it);
      if (!grupos[k]) grupos[k] = { it, vl: 0 };
      grupos[k].vl += Number(it.valor_total || 0);
    });
    Object.values(grupos).forEach(({ it, vl }) => {
      const cstP = it.cst_pis || '49';
      const cstC = it.cst_cofins || '49';
      const aliqP = Number(it.aliq_pis || 0);
      const aliqC = Number(it.aliq_cofins || 0);
      // valor de PIS/COFINS só quando há incidência (CST 01/02); monofásico (04) = 0
      const incideP = ['01', '02'].includes(cstP);
      const incideC = ['01', '02'].includes(cstC);
      const vPis = incideP ? vl * aliqP / 100 : 0;
      const vCof = incideC ? vl * aliqC / 100 : 0;
      // C175: |C175|CFOP|VL_OPR|VL_DESC|CST_PIS|VL_BC_PIS|ALIQ_PIS|...|VL_PIS|CST_COFINS|VL_BC_COFINS|ALIQ_COFINS|...|VL_COFINS|COD_CTA|INFO|
      L(`|C175|${it.cfop || ''}|${spedNum(vl)}|0|${cstP}|${spedNum(incideP ? vl : 0)}|${spedNum(aliqP)}|||${spedNum(vPis)}|${cstC}|${spedNum(incideC ? vl : 0)}|${spedNum(aliqC)}|||${spedNum(vCof)}|200000000||`);
      // acumula apuração
      if (incideP) {
        const a = apuracaoPis[aliqP] || { base: 0, valor: 0 };
        a.base += vl; a.valor += vPis; apuracaoPis[aliqP] = a;
      } else { receitaMonofasica += vl; }
      if (incideC) {
        const a = apuracaoCof[aliqC] || { base: 0, valor: 0 };
        a.base += vl; a.valor += vCof; apuracaoCof[aliqC] = a;
      }
    });
  });
  L(`|C990|${linhas.length - cStart + 1}|`);

  // ---- BLOCOS D, F, I (vazios nesta fase) ----
  ['D', 'F', 'I'].forEach(b => {
    const s = linhas.length;
    L(`|${b}001|1|`);
    L(`|${b}990|${linhas.length - s + 1}|`);
  });

  // ---- BLOCO M (apuração) ----
  const mStart = linhas.length;
  L('|M001|0|');
  // PIS
  const totPis = Object.values(apuracaoPis).reduce((s, a) => s + a.valor, 0);
  L(`|M200|${spedNum(totPis)}|0|0|${spedNum(totPis)}|0|0|${spedNum(totPis)}|0|0|0|0|${spedNum(totPis)}|`);
  if (totPis > 0) L(`|M205|08|691201|${spedNum(totPis)}|`);
  Object.entries(apuracaoPis).forEach(([aliq, a]) => {
    L(`|M210|01|${spedNum(a.base)}|${spedNum(a.base)}|0|0|${spedNum(a.base)}|${spedNum(aliq)}|0||${spedNum(a.valor)}|0|0|0|0|${spedNum(a.valor)}|`);
  });
  if (receitaMonofasica > 0) {
    L(`|M400|04|${spedNum(receitaMonofasica)}|100000000||`);
    L(`|M410|001|${spedNum(receitaMonofasica)}|100000000||`);
  }
  // COFINS
  const totCof = Object.values(apuracaoCof).reduce((s, a) => s + a.valor, 0);
  L(`|M600|${spedNum(totCof)}|0|0|${spedNum(totCof)}|0|0|${spedNum(totCof)}|0|0|0|0|${spedNum(totCof)}|`);
  if (totCof > 0) L(`|M605|08|585601|${spedNum(totCof)}|`);
  Object.entries(apuracaoCof).forEach(([aliq, a]) => {
    L(`|M610|01|${spedNum(a.base)}|${spedNum(a.base)}|0|0|${spedNum(a.base)}|${spedNum(aliq)}|0||${spedNum(a.valor)}|0|0|0|0|${spedNum(a.valor)}|`);
  });
  if (receitaMonofasica > 0) {
    L(`|M800|04|${spedNum(receitaMonofasica)}|100000000||`);
    L(`|M810|001|${spedNum(receitaMonofasica)}|100000000||`);
  }
  L(`|M990|${linhas.length - mStart + 1}|`);

  // ---- BLOCO 1 (vazio) ----
  const um0 = linhas.length;
  L('|1001|0|');
  L(`|1990|${linhas.length - um0 + 1}|`);

  // ---- BLOCO 9 (controle) ----
  montarBloco9PisV2(linhas);

  const txt = linhas.join('\r\n') + '\r\n';
  window._spedPisTxt = txt;
  window._spedPisNome = 'PISCOFINS_' + ano + String(mes).padStart(2, '0') + '_' + cnpj + '.txt';

  // ---- preview ----
  const totalV = docs.reduce((s, d) => s + Number(d.valor_total || 0), 0);
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div><strong style="color:#4caf50">EFD Contribuições gerado — ' + linhas.length + ' registros</strong>'
    + '<div style="font-size:0.78rem;color:#888;margin-top:2px">Período: ' + dtIniFmt + ' a ' + dtFimFmt
    + ' | Docs saída: ' + docs.length + ' | Receita: R$ ' + spedNum(totalV)
    + ' | PIS: R$ ' + spedNum(totPis) + ' | COFINS: R$ ' + spedNum(totCof)
    + ' | Monofásica: R$ ' + spedNum(receitaMonofasica) + '</div></div>'
    + '<button onclick="downloadSped(\'pis\')" class="btn-salvar">Baixar TXT</button></div>'
    + '<div style="background:#0a0c12;border-radius:6px;padding:12px;font-family:monospace;font-size:0.72rem;color:#4caf50;max-height:400px;overflow-y:auto;line-height:1.6">'
    + linhas.slice(0, 100).map((l, i) => '<div style="border-bottom:1px solid #0f1117;padding:2px 0"><span style="color:#555;margin-right:8px;min-width:40px;display:inline-block">' + (i + 1) + '</span>' + escHtml(l) + '</div>').join('')
    + (linhas.length > 100 ? '<div style="color:#555;padding:8px 0">... mais ' + (linhas.length - 100) + ' registros (baixe o TXT)</div>' : '')
    + '</div>';
}

// conta registros de um bloco (primeiro caractere do tipo após o |)
function contarBloco(linhas, bloco) {
  return linhas.filter(l => l.charAt(1) === bloco).length;
}

// Bloco 9: controle. Gera um 9900 para CADA tipo de registro do arquivo
// (incluindo os próprios 9001/9900/9990/9999), depois 9990 e 9999.
function montarBloco9PisV2(linhas) {
  // 1) conta todos os registros já existentes (blocos 0 a 1)
  const cont = {};
  linhas.forEach(l => {
    const tipo = l.split('|')[1];
    cont[tipo] = (cont[tipo] || 0) + 1;
  });

  // 2) os registros do próprio bloco 9 também entram na contagem 9900.
  //    quantidade de tipos distintos = tipos já existentes + 9001 + 9900 + 9990 + 9999
  const tiposExistentes = Object.keys(cont);
  const numTiposTotal = tiposExistentes.length + 4; // 9001, 9900, 9990, 9999
  cont['9001'] = 1;
  cont['9990'] = 1;
  cont['9999'] = 1;
  // há um 9900 para cada tipo distinto (= numTiposTotal linhas 9900)
  cont['9900'] = numTiposTotal;

  // 3) emite os registros do bloco 9
  linhas.push('|9001|0|');
  Object.keys(cont).sort().forEach(t => linhas.push(`|9900|${t}|${cont[t]}|`));
  // 9990 = total de registros do bloco 9 = 9001 + (linhas 9900) + 9990 + 9999
  const qtdBloco9 = 1 + numTiposTotal + 1 + 1;
  linhas.push(`|9990|${qtdBloco9}|`);
  // 9999 = total de linhas do arquivo inteiro (incluindo o próprio 9999)
  linhas.push(`|9999|${linhas.length + 1}|`);
}
