// ============================================================
// MOTOR CONTÁBIL — lançamentos automáticos em partidas dobradas
// ------------------------------------------------------------
// A contabilidade daqui NÃO foi inventada: os templates vêm da ECD REAL do
// posto (10.990 lançamentos de 2023, assinados pelo contador do Florestal).
// O motor lê os eventos que o Octano JÁ registra e os transforma nos mesmos
// lançamentos que o contador faria:
//
//   venda do dia (por forma)   D Caixa/Cartões/Bancos/Duplicatas  C Revenda
//   PIS/COFINS s/ vendas       D Impostos s/ vendas               C Impostos a recolher
//   taxa de cartão             D Taxas de cartão (despesa)        C Cartões a receber
//   compra (NF-e de entrada)   D Compras                          C Fornecedores
//
// DESENHO: "contabilizar o mês" é DETERMINÍSTICO e IDEMPOTENTE — cada
// lançamento tem (origem, chave_origem) únicos; regerar o mês apaga os
// automáticos e recria. Nada de gatilho em tempo real: contabilidade se
// confere fechada, não pingando.
// ============================================================

// ---- plano de contas essencial (estrutura do gabarito do contador) ----
const CTB_PLANO_PADRAO = [
  // codigo, nome, natureza, tipo, nivel, pai
  ["1", "ATIVO", "01", "S", 1, null],
  ["1.1", "ATIVO CIRCULANTE", "01", "S", 2, "1"],
  ["1.1.1", "DISPONIVEL", "01", "S", 3, "1.1"],
  ["1.1.1.01", "Caixa", "01", "S", 4, "1.1.1"],
  ["1.1.1.01.000001", "Caixa", "01", "A", 5, "1.1.1.01"],
  ["1.1.1.02", "Bancos", "01", "S", 4, "1.1.1"],
  ["1.1.1.02.000001", "Bancos conta movimento", "01", "A", 5, "1.1.1.02"],
  ["1.1.1.04", "Creditos", "01", "S", 4, "1.1.1"],
  ["1.1.1.04.000001", "Duplicatas a receber", "01", "A", 5, "1.1.1.04"],
  ["1.1.1.04.000002", "Cartoes a receber", "01", "A", 5, "1.1.1.04"],
  ["2", "PASSIVO", "02", "S", 1, null],
  ["2.1", "PASSIVO CIRCULANTE", "02", "S", 2, "2"],
  ["2.1.1", "OBRIGACOES", "02", "S", 3, "2.1"],
  ["2.1.1.01", "Fornecedores", "02", "S", 4, "2.1.1"],
  ["2.1.1.01.000001", "Fornecedores diversos", "02", "A", 5, "2.1.1.01"],
  ["2.1.1.02", "Impostos a recolher", "02", "S", 4, "2.1.1"],
  ["2.1.1.02.000001", "Impostos e contribuicoes a recolher", "02", "A", 5, "2.1.1.02"],
  ["3", "RESULTADO", "04", "S", 1, null],
  ["3.1", "RECEITAS E CUSTOS", "04", "S", 2, "3"],
  ["3.1.1", "RECEITA OPERACIONAL", "04", "S", 3, "3.1"],
  ["3.1.1.01", "Receita de revenda", "04", "S", 4, "3.1.1"],
  ["3.1.1.01.000001", "Revenda de mercadorias", "04", "A", 5, "3.1.1.01"],
  ["3.1.1.03", "Impostos sobre vendas", "04", "S", 4, "3.1.1"],
  ["3.1.1.03.000002", "COFINS s/ vendas", "04", "A", 5, "3.1.1.03"],
  ["3.1.1.03.000006", "PIS s/ vendas", "04", "A", 5, "3.1.1.03"],
  ["3.1.2", "CUSTO DAS MERCADORIAS", "04", "S", 3, "3.1"],
  ["3.1.2.01", "Compras", "04", "S", 4, "3.1.2"],
  ["3.1.2.01.000003", "Compras de mercadorias", "04", "A", 5, "3.1.2.01"],
  ["3.1.3", "DESPESAS OPERACIONAIS", "04", "S", 3, "3.1"],
  ["3.1.3.99", "Despesas gerais", "04", "S", 4, "3.1.3"],
  ["3.1.3.99.000001", "Despesas gerais", "04", "A", 5, "3.1.3.99"],
  ["3.2", "DESPESAS", "04", "S", 2, "3"],
  ["3.2.1", "DESPESAS FINANCEIRAS", "04", "S", 3, "3.2"],
  ["3.2.1.05", "Despesas financeiras", "04", "S", 4, "3.2.1"],
  ["3.2.1.05.000001", "Taxas de cartao e adquirentes", "04", "A", 5, "3.2.1.05"],
];

// contas usadas pelos templates (apelidos legiveis)
const CTB = {
  CAIXA: "1.1.1.01.000001",
  BANCOS: "1.1.1.02.000001",
  DUPLICATAS: "1.1.1.04.000001",
  CARTOES: "1.1.1.04.000002",
  FORNECEDORES: "2.1.1.01.000001",
  IMPOSTOS_REC: "2.1.1.02.000001",
  RECEITA: "3.1.1.01.000001",
  COFINS_VENDAS: "3.1.1.03.000002",
  PIS_VENDAS: "3.1.1.03.000006",
  COMPRAS: "3.1.2.01.000003",
  TAXA_CARTAO: "3.2.1.05.000001",
  DESPESAS_GERAIS: "3.1.3.99.000001",
};

// forma de pagamento (tpag da NFC-e) -> conta que recebe o dinheiro.
// Mesma leitura do contador: dinheiro no Caixa, cartao vira direito a
// receber, Pix cai no banco, prazo vira duplicata.
function ctbContaDaForma(tpag) {
  const t = String(tpag || "").padStart(2, "0");
  if (t === "01" || t === "02") return CTB.CAIXA;
  if (t === "03" || t === "04") return CTB.CARTOES;
  if (t === "17" || t === "20") return CTB.BANCOS;
  if (t === "05") return CTB.DUPLICATAS;
  return CTB.CAIXA;
}

// ============================================================
// NÚCLEO PURO: eventos -> lançamentos. Sem rede; testável no V8.
// d = { competencia:'AAAA-MM', nfces:[{data_emissao,valor_total,forma_pagamento,status}],
//       taxasDia:[{dia,taxa}], entradas:[{id,numero,emissao,valor_total,fornecedor_id,fornecedor_nome}],
//       pagamentos:[{id,data_pagamento,valor_pago,forma_pagamento,nfe_id,fornecedor_id,descricao}],
//       sangrias:[{valor,recebido_em}], fornecedorConta:{<fornecedor_id>:'2.1.1.01.NNNNNN'},
//       aliqPis:0.65?|1.65, aliqCofins:3|7.6 }  — aliquotas: informadas pela tela
// devolve { lancamentos: [{data,valor,historico,origem,chave,partidas:[{conta,dc,valor,hist}]}], avisos }
// ============================================================
function ctbMontarLancamentos(d) {
  const L = [], A = [];
  const comp = d.competencia;

  // ---- 1. VENDAS: consolidado por DIA × FORMA (o padrão do contador:
  //         2.771 lançamentos "VR <dia>" D Caixa C Revenda) ----
  const porDiaForma = new Map();
  (d.nfces || []).forEach(n => {
    if (String(n.status || "") === "cancelada") return;
    const dia = String(n.data_emissao || "").slice(0, 10);
    if (!dia) return;
    const tpag = String(n.forma_pagamento || "01");
    const k = dia + "|" + tpag;
    porDiaForma.set(k, (porDiaForma.get(k) || 0) + Number(n.valor_total || 0));
  });
  porDiaForma.forEach((valor, k) => {
    if (valor <= 0.004) return;
    const [dia, tpag] = k.split("|");
    const conta = ctbContaDaForma(tpag);
    L.push({
      data: dia, valor: Number(valor.toFixed(2)),
      historico: "Vendas do dia " + dia.split("-").reverse().join("/") + " (tpag " + tpag + ")",
      origem: "nfce-dia", chave: k, competencia: comp,
      partidas: [
        { conta, dc: "D", valor: Number(valor.toFixed(2)) },
        { conta: CTB.RECEITA, dc: "C", valor: Number(valor.toFixed(2)) },
      ],
    });
  });

  // ---- 2. PIS/COFINS sobre as vendas TRIBUTADAS (produtos de loja).
  //         Combustível é monofásico (CST 04, alíquota zero) e fica de fora —
  //         a base tributada vem calculada pela tela (itens CST 01). ----
  (d.pisCofinsDia || []).forEach(x => {
    const base = Number(x.base || 0);
    if (base <= 0.004) return;
    const pis = Number((base * (d.aliqPis == null ? 1.65 : d.aliqPis) / 100).toFixed(2));
    const cof = Number((base * (d.aliqCofins == null ? 7.6 : d.aliqCofins) / 100).toFixed(2));
    if (pis + cof <= 0) return;
    L.push({
      data: x.dia, valor: Number((pis + cof).toFixed(2)),
      historico: "PIS/COFINS s/ vendas tributadas de " + x.dia.split("-").reverse().join("/"),
      origem: "piscofins-dia", chave: x.dia, competencia: comp,
      partidas: [
        { conta: CTB.PIS_VENDAS, dc: "D", valor: pis },
        { conta: CTB.COFINS_VENDAS, dc: "D", valor: cof },
        { conta: CTB.IMPOSTOS_REC, dc: "C", valor: Number((pis + cof).toFixed(2)) },
      ],
    });
  });

  // ---- 3. TAXA DE CARTÃO por dia (padrão Edenred/Ticket do gabarito:
  //         D despesa C cartões a receber) ----
  (d.taxasDia || []).forEach(x => {
    const t = Number(x.taxa || 0);
    if (t <= 0.004) return;
    L.push({
      data: x.dia, valor: Number(t.toFixed(2)),
      historico: "Taxas de cartao do dia " + x.dia.split("-").reverse().join("/"),
      origem: "taxa-cartao", chave: x.dia, competencia: comp,
      partidas: [
        { conta: CTB.TAXA_CARTAO, dc: "D", valor: Number(t.toFixed(2)) },
        { conta: CTB.CARTOES, dc: "C", valor: Number(t.toFixed(2)) },
      ],
    });
  });

  // ---- 4. COMPRAS: uma por NF-e de entrada. Com CONTA PRÓPRIA do fornecedor
  //         (v2): o gabarito tem uma analítica 2.1.1.01.NNNNNN por fornecedor —
  //         d.fornecedorConta traz o de-para; sem ele, cai na genérica. ----
  const contaForn = (fid) => (d.fornecedorConta && d.fornecedorConta[fid]) || CTB.FORNECEDORES;
  (d.entradas || []).forEach(n => {
    const v = Number(n.valor_total || 0);
    if (v <= 0.004) return;
    L.push({
      data: String(n.emissao || "").slice(0, 10), valor: Number(v.toFixed(2)),
      historico: "Compra NF " + (n.numero || "") + " " + (n.fornecedor_nome || ""),
      origem: "entrada", chave: String(n.id || n.chave_nfe || n.numero), competencia: comp,
      partidas: [
        { conta: CTB.COMPRAS, dc: "D", valor: Number(v.toFixed(2)) },
        { conta: contaForn(n.fornecedor_id), dc: "C", valor: Number(v.toFixed(2)), hist: n.fornecedor_nome },
      ],
    });
  });

  // ---- 5. PAGAMENTOS de contas a pagar (v2). Padrão do gabarito (127×):
  //         conta ligada a NF-e = quita o FORNECEDOR; conta avulsa (energia,
  //         aluguel) = vira DESPESA. Sai do Caixa se pagou em dinheiro,
  //         senão do banco. ----
  (d.pagamentos || []).forEach(p => {
    const v = Number(p.valor_pago || p.valor || 0);
    if (v <= 0.004) return;
    const ehCompra = !!p.nfe_id;
    const debito = ehCompra ? contaForn(p.fornecedor_id) : CTB.DESPESAS_GERAIS;
    const credito = /dinheiro/i.test(String(p.forma_pagamento || "")) ? CTB.CAIXA : CTB.BANCOS;
    L.push({
      data: String(p.data_pagamento || "").slice(0, 10), valor: Number(v.toFixed(2)),
      historico: "Pagamento " + (p.descricao || "conta") + (p.fornecedor_nome ? " - " + p.fornecedor_nome : ""),
      origem: "cta-pagar", chave: String(p.id), competencia: comp,
      partidas: [
        { conta: debito, dc: "D", valor: Number(v.toFixed(2)), hist: p.fornecedor_nome },
        { conta: credito, dc: "C", valor: Number(v.toFixed(2)) },
      ],
    });
  });

  // ---- 6. SANGRIAS/DEPÓSITOS (v2). O padrão MAIS FREQUENTE do gabarito
  //         (3.014×/ano): D Banco C Caixa. A sangria do PDV é a retirada do
  //         dinheiro do caixa — contabilmente o valor sai do Caixa rumo ao
  //         depósito. Consolidado por dia, como o contador faz. ----
  const sangriaDia = new Map();
  (d.sangrias || []).forEach(s => {
    const dia = String(s.recebido_em || s.dia || "").slice(0, 10);
    if (dia) sangriaDia.set(dia, (sangriaDia.get(dia) || 0) + Number(s.valor || 0));
  });
  sangriaDia.forEach((v, dia) => {
    if (v <= 0.004) return;
    L.push({
      data: dia, valor: Number(v.toFixed(2)),
      historico: "Sangria/deposito do dia " + dia.split("-").reverse().join("/"),
      origem: "sangria-dia", chave: dia, competencia: comp,
      partidas: [
        { conta: CTB.BANCOS, dc: "D", valor: Number(v.toFixed(2)) },
        { conta: CTB.CAIXA, dc: "C", valor: Number(v.toFixed(2)) },
      ],
    });
  });

  // ---- verificação: TODO lançamento fecha D = C (partida dobrada não é opcional) ----
  L.forEach(l => {
    const deb = l.partidas.filter(p => p.dc === "D").reduce((s, p) => s + p.valor, 0);
    const cred = l.partidas.filter(p => p.dc === "C").reduce((s, p) => s + p.valor, 0);
    if (Math.abs(deb - cred) > 0.009)
      A.push("DESEQUILÍBRIO em '" + l.historico + "': D " + deb.toFixed(2) + " x C " + cred.toFixed(2));
  });
  return { lancamentos: L, avisos: A };
}

// ============================================================
// TELA + PERSISTÊNCIA (aba Contabilidade › Motor contábil)
// ============================================================
async function ctbAbrir() {
  const div = document.getElementById('contab-conteudo');
  const eId = window._contab_empresa_id;
  const hoje = new Date();
  const comp = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  div.innerHTML = '<div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
    + '<div><h3 style="color:#38bdf8;margin-bottom:4px">🧮 Motor contábil</h3>'
    + '<p style="color:#888;font-size:0.82rem">Partidas dobradas geradas dos eventos do posto — templates extraídos da ECD real do contador.</p></div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input id="ctb-comp" value="' + comp + '" style="width:110px;padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0" />'
    + '<button onclick="ctbContabilizar()" class="btn-salvar">Contabilizar mês</button>'
    + '<button onclick="ctbBalancete()" class="btn-salvar" style="background:#1a3a5c">Balancete</button>'
    + '</div></div>'
    + '<div id="ctb-out" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:16px;min-height:160px">'
    + '<p style="color:#555;text-align:center;padding:30px">Escolha a competência (AAAA-MM) e clique em Contabilizar.</p></div></div>';
  // semeia o plano de contas — só as que FALTAM, para que versões novas do
  // gabarito (ex.: 3.1.3 Despesas gerais do v2) entrem em empresa já semeada
  try {
    const tem = new Set((await sb.from('oct_contabil_contas')
      .select('codigo').eq('empresa_id', eId).then(r => r.data || [])).map(c => c.codigo));
    const linhas = CTB_PLANO_PADRAO.filter(c => !tem.has(c[0])).map(c => ({
      empresa_id: eId, codigo: c[0], nome: c[1], natureza: c[2],
      tipo: c[3], nivel: c[4], conta_pai: c[5],
    }));
    if (linhas.length) await sb.from('oct_contabil_contas').insert(linhas);
  } catch (e) { /* tabela pode nao existir ainda: o contabilizar avisa */ }
}

// v2: garante uma conta analítica 2.1.1.01.NNNNNN por fornecedor citado nos
// documentos do mês. O elo fornecedor→conta fica em cod_cta_sped ('forn:<uuid>'),
// então regerar o mês reaproveita a mesma conta em vez de criar outra.
// Devolve o de-para { fornecedor_id: codigo }.
async function ctbGarantirContasFornecedor(eId, docs) {
  const mapa = {};
  const querem = new Map();       // fornecedor_id -> nome
  (docs || []).forEach(d => {
    if (d.fornecedor_id && !querem.has(d.fornecedor_id))
      querem.set(d.fornecedor_id, d.fornecedor_nome || '');
  });
  if (!querem.size) return mapa;
  try {
    const existentes = await sb.from('oct_contabil_contas')
      .select('codigo,cod_cta_sped').eq('empresa_id', eId)
      .like('codigo', '2.1.1.01.%').then(r => r.data || []);
    let maxSeq = 1;               // .000001 é a genérica "Fornecedores"
    existentes.forEach(c => {
      const seq = Number(String(c.codigo).slice(-6));
      if (seq > maxSeq) maxSeq = seq;
      const m = /^forn:(.+)$/.exec(String(c.cod_cta_sped || ''));
      if (m) mapa[m[1]] = c.codigo;
    });
    const novas = [];
    querem.forEach((nomeForn, fid) => {
      if (mapa[fid]) return;
      maxSeq += 1;
      const codigo = '2.1.1.01.' + String(maxSeq).padStart(6, '0');
      mapa[fid] = codigo;
      novas.push({
        empresa_id: eId, codigo: codigo,
        nome: (nomeForn || 'Fornecedor').slice(0, 80).toUpperCase(),
        natureza: '02', tipo: 'A', nivel: 5, conta_pai: '2.1.1.01',
        cod_cta_sped: 'forn:' + fid,
      });
    });
    if (novas.length) {
      const { error } = await sb.from('oct_contabil_contas').insert(novas);
      if (error) throw error;
    }
  } catch (e) {
    // sem o de-para tudo cai na genérica — o balancete continua fechando
    console.warn('ctbGarantirContasFornecedor:', e);
    return {};
  }
  return mapa;
}

async function ctbContabilizar() {
  const out = document.getElementById('ctb-out');
  const eId = window._contab_empresa_id;
  const comp = (document.getElementById('ctb-comp').value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(comp)) { out.innerHTML = '<p style="color:#f44;padding:16px">Competência no formato AAAA-MM.</p>'; return; }
  out.innerHTML = '<p style="color:#888;padding:16px">Lendo os eventos de ' + comp + '...</p>';
  const dtIni = comp + '-01';
  const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0).getDate();
  const dtFim = comp + '-' + String(fim).padStart(2, '0');
  try {
    // eventos do período
    const nfces = await _spedTudo(q => sb.from('oct_nfce')
      .select('data_emissao,valor_total,forma_pagamento,status,itens')
      .eq('empresa_id', eId).gte('data_emissao', dtIni).lte('data_emissao', dtFim + 'T23:59:59')
      .order('data_emissao').range(q * 1000, q * 1000 + 999));
    const fila = await _spedTudo(q => sb.from('oct_fila_transmissao')
      .select('criado_em,taxa').eq('empresa_id', eId)
      .gte('criado_em', dtIni).lte('criado_em', dtFim + 'T23:59:59')
      .order('criado_em').range(q * 1000, q * 1000 + 999));
    const entradas = await sb.from('oct_nfe_entrada')
      .select('id,numero,chave_nfe,emissao,valor_total,fornecedor_id,oct_pessoas(nome)')
      .eq('empresa_id', eId).gte('emissao', dtIni).lte('emissao', dtFim)
      .then(r => (r.data || []).map(n => Object.assign({}, n, { fornecedor_nome: (n.oct_pessoas || {}).nome })));

    // v2: pagamentos do mês (pago = tem data_pagamento) e sangrias do PDV
    const pagamentos = await sb.from('oct_contas_pagar')
      .select('id,descricao,valor,valor_pago,data_pagamento,forma_pagamento,nfe_id,fornecedor_id,oct_pessoas(nome)')
      .eq('empresa_id', eId).not('data_pagamento', 'is', null)
      .gte('data_pagamento', dtIni).lte('data_pagamento', dtFim)
      .then(r => (r.data || []).map(p => Object.assign({}, p, { fornecedor_nome: (p.oct_pessoas || {}).nome })));
    const sangrias = await sb.from('oct_recebimentos')
      .select('valor,dia,recebido_em').eq('empresa_id', eId).eq('origem', 'sangria')
      .gte('dia', dtIni).lte('dia', dtFim).then(r => r.data || []);

    // v2: conta analítica por fornecedor (padrão do contador: uma
    // 2.1.1.01.NNNNNN por casa; a genérica .000001 fica de fallback)
    const fornecedorConta = await ctbGarantirContasFornecedor(eId,
      entradas.concat(pagamentos.filter(p => p.nfe_id)));

    // base tributada de PIS/COFINS por dia = itens SEM cod_anp (loja)
    const prodAnp = {};
    (await sb.from('oct_produtos').select('id,cod_anp').eq('empresa_id', eId)
      .then(r => r.data || [])).forEach(p => { prodAnp[p.id] = !!p.cod_anp; });
    const basePorDia = new Map();
    nfces.forEach(n => {
      if (String(n.status || '') === 'cancelada') return;
      const dia = String(n.data_emissao || '').slice(0, 10);
      (n.itens || []).forEach(it => {
        if (prodAnp[it.produto_id]) return;         // combustível: monofásico, fora
        basePorDia.set(dia, (basePorDia.get(dia) || 0) + Number(it.total || 0));
      });
    });
    const taxasDia = new Map();
    fila.forEach(f => {
      const dia = String(f.criado_em || '').slice(0, 10);
      const t = Number(f.taxa || 0);
      if (t > 0) taxasDia.set(dia, (taxasDia.get(dia) || 0) + t);
    });

    const r = ctbMontarLancamentos({
      competencia: comp, nfces, entradas, pagamentos, sangrias, fornecedorConta,
      pisCofinsDia: Array.from(basePorDia, ([dia, base]) => ({ dia, base })),
      taxasDia: Array.from(taxasDia, ([dia, taxa]) => ({ dia, taxa })),
    });
    if (r.avisos.length) {
      out.innerHTML = '<p style="color:#f44;padding:16px">' + r.avisos.map(escHtml).join('<br>') + '</p>';
      return;
    }

    // idempotência: apaga os automáticos da competência e regrava
    out.innerHTML = '<p style="color:#888;padding:16px">Gravando ' + r.lancamentos.length + ' lançamentos...</p>';
    await sb.from('oct_contabil_lancamentos').delete()
      .eq('empresa_id', eId).eq('competencia', comp).neq('origem', 'manual');
    for (const l of r.lancamentos) {
      const { data: cab, error } = await sb.from('oct_contabil_lancamentos').insert({
        empresa_id: eId, data: l.data, valor: l.valor, historico: l.historico,
        origem: l.origem, chave_origem: l.chave, competencia: comp,
      }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await sb.from('oct_contabil_partidas').insert(
        l.partidas.map(p => ({
          lancamento_id: cab.id, empresa_id: eId,
          conta_codigo: p.conta, dc: p.dc, valor: p.valor, historico: p.hist || null,
        })));
      if (e2) throw e2;
    }
    const tot = r.lancamentos.reduce((s, l) => s + l.valor, 0);
    out.innerHTML = '<div style="color:#4caf50;font-weight:600;margin-bottom:8px">✓ ' + r.lancamentos.length
      + ' lançamentos gravados em ' + comp + ' — R$ ' + tot.toFixed(2) + '</div>'
      + '<div style="color:#888;font-size:0.8rem">Regerar o mês é seguro: os automáticos são apagados e recriados; lançamentos manuais ficam.</div>'
      + '<div style="margin-top:10px"><button onclick="ctbBalancete()" class="btn-salvar" style="background:#1a3a5c">Ver balancete</button></div>';
  } catch (e) {
    console.error('ctbContabilizar:', e);
    const m = String((e && e.message) || e);
    out.innerHTML = '<p style="color:#f44;padding:16px">Erro: ' + escHtml(m)
      + (m.indexOf('oct_contabil') >= 0 ? '<br>Rode o SQL do motor contábil (SQL-MOTOR-CONTABIL.sql).' : '') + '</p>';
  }
}

async function ctbBalancete() {
  const out = document.getElementById('ctb-out');
  const eId = window._contab_empresa_id;
  const comp = (document.getElementById('ctb-comp').value || '').trim();
  out.innerHTML = '<p style="color:#888;padding:16px">Somando o balancete de ' + comp + '...</p>';
  try {
    const lanc = await _spedTudo(q => sb.from('oct_contabil_lancamentos')
      .select('id').eq('empresa_id', eId).eq('competencia', comp)
      .range(q * 1000, q * 1000 + 999));
    const ids = lanc.map(l => l.id);
    const partidas = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from('oct_contabil_partidas')
        .select('conta_codigo,dc,valor').in('lancamento_id', ids.slice(i, i + 100));
      partidas.push.apply(partidas, data || []);
    }
    const contas = await sb.from('oct_contabil_contas')
      .select('codigo,nome').eq('empresa_id', eId).then(r => r.data || []);
    const nome = {}; contas.forEach(c => { nome[c.codigo] = c.nome; });
    const saldo = new Map();
    let totD = 0, totC = 0;
    partidas.forEach(p => {
      const s = saldo.get(p.conta_codigo) || { d: 0, c: 0 };
      if (p.dc === 'D') { s.d += Number(p.valor); totD += Number(p.valor); }
      else { s.c += Number(p.valor); totC += Number(p.valor); }
      saldo.set(p.conta_codigo, s);
    });
    const linhas = Array.from(saldo, ([codigo, s]) => ({ codigo, nome: nome[codigo] || codigo, d: s.d, c: s.c }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    out.innerHTML = '<strong style="color:#38bdf8">Balancete ' + comp + '</strong>'
      + '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-top:10px">'
      + '<tr style="color:#888;text-align:left;border-bottom:1px solid #2a2d3e"><th style="padding:6px">Conta</th><th></th>'
      + '<th style="text-align:right">Débito</th><th style="text-align:right">Crédito</th><th style="text-align:right">Saldo</th></tr>'
      + linhas.map(l => {
        const s = l.d - l.c;
        return '<tr style="border-bottom:1px solid #1a1d2e"><td style="padding:5px 6px;color:#9aa;font-family:monospace">' + l.codigo + '</td>'
          + '<td style="color:#ddd">' + escHtml(l.nome) + '</td>'
          + '<td style="text-align:right;color:#ddd">' + l.d.toFixed(2) + '</td>'
          + '<td style="text-align:right;color:#ddd">' + l.c.toFixed(2) + '</td>'
          + '<td style="text-align:right;color:' + (s >= 0 ? '#4ade80' : '#f87171') + '">' + s.toFixed(2) + '</td></tr>';
      }).join('')
      + '<tr style="font-weight:700;color:#ddd"><td colspan="2" style="padding:8px 6px">TOTAIS</td>'
      + '<td style="text-align:right">' + totD.toFixed(2) + '</td><td style="text-align:right">' + totC.toFixed(2) + '</td>'
      + '<td style="text-align:right;color:' + (Math.abs(totD - totC) < 0.01 ? '#4ade80' : '#f87171') + '">'
      + (Math.abs(totD - totC) < 0.01 ? 'FECHADO ✓' : 'DIFERENÇA ' + (totD - totC).toFixed(2)) + '</td></tr></table>';
  } catch (e) {
    out.innerHTML = '<p style="color:#f44;padding:16px">Erro: ' + escHtml(String((e && e.message) || e)) + '</p>';
  }
}
