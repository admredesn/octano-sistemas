// ============================================================
// MÓDULO FECHAMENTO DE CAIXA (retaguarda) — RÉPLICA FIEL do TecnoX
// Lista de turnos + detalhe idêntico (cabeçalho, árvore de módulos, colunas
// Recebimentos × Vendas/Saídas, painel Observação/botões/Acréscimo-Desconto).
// Lê os dados próprios do octano: oct_pdv_turnos, oct_pdv_vendas (itens/pagamentos),
// oct_pdv_caixa. Combustível×produto pelos ITENS do cupom (item tipo 'abastecimento'
// = combustível), espelhando a vw_log_valores_turno do TecnoX.
// ============================================================

function _fcGrupoForma(cod) {
  const c = String(cod || '').padStart(2, '0');
  if (c === '01') return 'dinheiro';
  if (c === '02') return 'cheque';
  if (['03', '04', '10', '11', '12', '13'].includes(c)) return 'cartao';
  if (['17', '18', '19'].includes(c)) return 'pix';
  if (['15', '31'].includes(c)) return 'boleto';
  if (['05', '99', '90'].includes(c)) return 'prazo';   // 05 = crédito loja = nota a prazo
  return 'outros';
}
// A fila grava o código `forma` genérico (99) mas o `forma_nome` tem o real
// ("Cartão", "Crédito", "Pix"…). Prefere o NOME; sem nome, cai no código.
function _fcGrupoNome(nome, cod) {
  const n = String(nome || '').toLowerCase();
  if (n) {
    // FROTA antes de cartão (18/08): "cartão frota"/Prime/Fit/TicketLog/GoodCard
    // é outra natureza — liquida pela administradora, não pela adquirente.
    if (n.indexOf('frota') >= 0 || n.indexOf('prime') >= 0 || n.indexOf('fit') >= 0
        || n.indexOf('ticket') >= 0 || n.indexOf('good') >= 0) return 'frota';
    if (n.indexOf('dinheiro') >= 0) return 'dinheiro';
    if (n.indexOf('pix') >= 0) return 'pix';
    if (n.indexOf('créd') >= 0 || n.indexOf('cred') >= 0 || n === 'cartão' || n === 'cartao'
        || n.indexOf('déb') >= 0 || n.indexOf('deb') >= 0) return 'cartao';
    if (n.indexOf('prazo') >= 0) return 'prazo';
    if (n.indexOf('cheque') >= 0) return 'cheque';
  }
  return _fcGrupoForma(cod);
}
function fcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fcMoney(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fcNum(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
function _fcData(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : ''; }
function _fcHora(v) { return v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''; }

async function moduloFCaixa() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const eid = ((typeof empresaAtiva === 'function') ? empresaAtiva() : perfil?.empresa_id);
  if (!eid) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._fcEmpresaId = eid;
  if (!window._fcDe || !window._fcAte) {
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 30 * 86400000);
    window._fcAte = hoje.toISOString().slice(0, 10);
    window._fcDe = de.toISOString().slice(0, 10);
  }
  await fcListar();
}

// ---- FUSO: os dois relógios do sistema (ver comentário nas janelas) ----
// turno (aberto_em/fechado_em): UTC verdadeiro → parseia direto.
function _fcTsUtc(s) { return s ? new Date(s).getTime() : 0; }
// fila/recebimentos: hora LOCAL com +00:00 falso carimbado pelo Postgres →
// tira o sufixo e parseia como hora local do navegador.
function _fcTsLocal(s) {
  if (!s) return 0;
  const semTz = String(s).replace(/(\+00:?00|Z)$/, '');
  const t = new Date(semTz).getTime();
  return isNaN(t) ? 0 : t;
}

// Busca TODAS as páginas de uma consulta (o PostgREST corta em 1000 linhas por
// request — era isso que zerava os turnos a partir de 10/08: a fila do período
// passava de 1000 itens e os últimos dias ficavam de fora). fazQuery é uma
// função que MONTA a query (não dá p/ reusar o mesmo builder duas vezes).
async function _fcTudo(fazQuery) {
  const tudo = [];
  for (let p = 0; p < 20; p++) {               // teto de segurança: 20.000 linhas
    let lote = [];
    try {
      const { data } = await fazQuery().range(p * 1000, p * 1000 + 999);
      lote = data || [];
    } catch (e) { break; }
    tudo.push(...lote);
    if (lote.length < 1000) break;
  }
  return { data: tudo };
}

async function fcCarregarDados() {
  const eid = window._fcEmpresaId;
  const de = window._fcDe + 'T00:00:00';
  const ate = window._fcAte + 'T23:59:59';
  const { data: turnos } = await sb.from('oct_pdv_turnos').select('*')
    .eq('empresa_id', eid).gte('aberto_em', de).lte('aberto_em', ate)
    .order('aberto_em', { ascending: false });
  const lista = turnos || [];
  if (!lista.length) return { turnos: [], porTurno: {} };
  const ids = lista.map(t => t.id);
  // janela total do período p/ o que NÃO tem turno_id (recebimentos por horário)
  const janIni0 = lista.reduce((m, t) => t.aberto_em && t.aberto_em < m ? t.aberto_em : m, ate);
  const janFim0 = lista.reduce((m, t) => {
    const f = t.fechado_em || new Date().toISOString();
    return f > m ? f : m;
  }, de);
  // ±6h de folga na CONSULTA: fila/receb têm +00:00 falso (hora local gravada
  // como UTC), então o filtro do servidor cortaria a borda — a atribuição fina
  // ao turno é feita no cliente pela régua de época (_fcTsLocal).
  const janIni = new Date(_fcTsUtc(janIni0) - 6 * 3600e3).toISOString();
  const janFim = new Date(_fcTsUtc(janFim0) + 6 * 3600e3).toISOString();
  const [vRes, cRes, fRes, rRes, vlRes, tRes] = await Promise.all([
    sb.from('oct_pdv_vendas').select('id,turno_id,valor_total,pagamentos,itens,status').eq('empresa_id', eid).in('turno_id', ids),
    sb.from('oct_pdv_caixa').select('id,turno_id,tipo,forma,valor,descricao').eq('empresa_id', eid).in('turno_id', ids),
    // FILA DE TRANSMISSÃO do PDV: abastecimento baixado mas ainda sem cupom.
    // CASA POR JANELA DE HORÁRIO (12/08): o turno_id da fila é nulo em ~70% dos
    // itens (a bomba/casamento no núcleo não conhece o turno). Então buscamos por
    // ocorrido_em dentro do período e atribuímos ao turno pela hora de abertura/
    // fechamento — o horário é sempre gravado, o turno_id não.
    _fcTudo(() => sb.from('oct_fila_transmissao').select('id,bico,descricao,litros,valor,forma,forma_nome,bandeira,desconto,acrescimo,ocorrido_em,recebido_em')
      .eq('empresa_id', eid).eq('status', 'fila')
      .gte('ocorrido_em', janIni).lte('ocorrido_em', janFim).order('ocorrido_em')),
    // RECEBIMENTOS (maquininha/cofre/sangria): sem turno_id — casa por horário.
    // Inclui a SANGRIA (origem='sangria') que o PDV espelha aqui.
    _fcTudo(() => sb.from('oct_recebimentos').select('id,origem,forma,bandeira,valor,parcelas,recebido_em,conciliado,cliente')
      .eq('empresa_id', eid).gte('recebido_em', janIni).lte('recebido_em', janFim).order('recebido_em')),
    // VALES / HAVER — tem turno_id, liga direto
    sb.from('oct_vales').select('turno_id,pessoa_nome,tipo,valor,descricao,operador,criado_em')
      .eq('empresa_id', eid).in('turno_id', ids)
      .then(r => r, () => ({ data: [] })),
    // TÍTULOS RECEBIDOS — baixa de nota a prazo antiga; no TecnoX entra no lado
    // Vendas/Saídas. Tem turno_id.
    sb.from('oct_recebimentos_titulo').select('turno_id,cliente_nome,valor,forma,juros,desconto,data_recebimento')
      .eq('empresa_id', eid).in('turno_id', ids)
      .then(r => r, () => ({ data: [] })),
  ]);
  // CONFERÊNCIA/AJUSTES do gerente (15/08 — modelo TecnoX): overlay por cima
  // dos lançamentos, guardado em oct_fc_lancamentos. O dado original (fila/
  // caixa/receb, que o NÚCLEO sincroniza) nunca é alterado — o ajuste vive
  // aqui e é aplicado ANTES das somas.
  window._fcConf = {};
  let confRows = [];
  try {
    const rConf = await sb.from('oct_fc_lancamentos')
      .select('turno_id,ref_tipo,ref_id,conferido,ajuste').in('turno_id', ids);
    confRows = rConf.data || [];
    confRows.forEach(c => {
      window._fcConf[c.ref_tipo + ':' + c.ref_id] = { conferido: !!c.conferido, ajuste: c.ajuste || null };
    });
  } catch (e) { /* tabela ainda não criada: tela segue sem conferência */ }
  const _aj = (tipo, id) => (window._fcConf[tipo + ':' + id] || {}).ajuste || null;
  ((fRes && fRes.data) || []).forEach(f => {
    const a = _aj('fila', f.id); if (!a) return;
    if (a.excluido) { f._excluido = true; return; }
    if (a.valor != null) f.valor = a.valor;
    if (a.forma_nome) f.forma_nome = a.forma_nome;
    if (a.bandeira) f.bandeira = a.bandeira;
  });
  ((cRes && cRes.data) || []).forEach(m => {
    const a = _aj('caixa', m.id); if (!a) return;
    if (a.excluido) { m._excluido = true; return; }
    if (a.valor != null) m.valor = a.valor;
    if (a.descricao) m.descricao = a.descricao;
  });
  ((rRes && rRes.data) || []).forEach(x => {
    const a = _aj('receb', x.id); if (!a) return;
    if (a.excluido) { x._excluido = true; return; }
    if (a.valor != null) x.valor = a.valor;
    if (a.forma) x.forma = a.forma;
    if (a.bandeira) x.bandeira = a.bandeira;
  });

  const porTurno = {};
  ids.forEach(id => porTurno[id] = {
    venda_total: 0, venda_comb: 0, litros_comb: 0, venda_prod: 0,
    rec: { dinheiro: 0, cartao: 0, pix: 0, frota: 0, prazo: 0, cheque: 0, boleto: 0, outros: 0 },
    sangria: 0, suprimento: 0, despesa: 0, deposito: 0, receita: 0, outrosCaixa: 0, qtd_vendas: 0,
    fila_total: 0, fila_litros: 0, fila_itens: [],
    fila_sem_pgto: 0, fila_sem_pgto_itens: [],   // abastecido SEM pagamento confirmado (não entra no caixa)
    // v2 — movimentação completa
    sangria_f7: 0, sangrias_lst: [],
    vale_haver: 0, vale_desconto: 0, vales_lst: [],
    receb_ext: [], receb_ext_cartao: 0, receb_ext_pix: 0, receb_ext_cofre: 0,
    titulos: 0, titulos_lst: [],
  });
  // janela de cada turno, p/ atribuir recebimentos e fila por horário.
  // FUSO (15/08): o turno grava em UTC verdadeiro (+00:00 correto), mas fila/
  // recebimentos vêm do núcleo SEM fuso (hora local) e o Postgres carimba um
  // +00:00 FALSO neles. Comparar string com string deslocava tudo em 3h (a
  // "madrugada sumida" do dia 13 e depósito caindo no turno errado). Régua nova:
  // época real — turno parseia como UTC; fila/receb tiram o +00:00 mentiroso e
  // parseiam como hora LOCAL do navegador (postos todos em UTC-3, sem DST).
  const janelas = lista.map(t => ({ id: t.id, ini: _fcTsUtc(t.aberto_em), fim: t.fechado_em ? _fcTsUtc(t.fechado_em) : Date.now() }));
  const janOrd = janelas.slice().sort((a, b) => a.ini - b.ini);
  const _turnoDe = (iso) => {
    const ts = _fcTsLocal(iso);
    if (!ts) return null;
    const j = janelas.find(x => x.ini && ts >= x.ini && ts <= x.fim);
    return j ? j.id : null;
  };
  // FILA: janela exata; se cair num vão (bomba liberada com caixa fechado), joga
  // no PRÓXIMO turno que abrir (decisão do Ronan 12/08). Sem próximo → último.
  const _turnoFila = (iso) => {
    const ts = _fcTsLocal(iso);
    if (!ts) return janOrd.length ? janOrd[janOrd.length - 1].id : null;
    const dentro = janOrd.find(x => x.ini && ts >= x.ini && ts <= x.fim);
    if (dentro) return dentro.id;
    const prox = janOrd.find(x => x.ini && x.ini > ts);
    if (prox) return prox.id;
    return janOrd.length ? janOrd[janOrd.length - 1].id : null;
  };
  ((fRes && fRes.data) || []).forEach(f => {
    if (f._excluido) return;
    const tid = _turnoFila(f.ocorrido_em || f.recebido_em); const t = tid && porTurno[tid]; if (!t) return;
    const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
    const litros = Number(f.litros || 0);
    // REGRA (Ronan 14/08): fila só entra no CAIXA se o pagamento foi confirmado
    // (recebido_em). Abastecido sem pagamento = pendência de pista, não recebimento.
    if (!f.recebido_em) {
      t.fila_sem_pgto += vf; t.fila_sem_pgto_itens.push(f);
      return;
    }
    t.fila_total += vf; t.fila_litros += litros; t.fila_itens.push(f);
    t.venda_total += vf;
    // combustível TEM BICO; produto de loja não (o campo litros carrega a QTD
    // do produto — ex.: 1 óleo Mobil "1.0 L" — e enganava a régua até 18/08)
    const ehComb = (f.bico !== null && f.bico !== undefined && f.bico !== '') && litros > 0;
    if (ehComb) { t.venda_comb += vf; t.litros_comb += litros; } else t.venda_prod += vf;
    const g = _fcGrupoNome(f.forma_nome, f.forma);   // fila: prefere o nome (código vem 99)
    t.rec[g] = (t.rec[g] || 0) + vf;
  });
  (vRes.data || []).forEach(v => {
    const t = porTurno[v.turno_id]; if (!t) return;
    if (String(v.status || '').toLowerCase() === 'cancelada') return;
    t.qtd_vendas++;
    t.venda_total += Number(v.valor_total || 0);
    (Array.isArray(v.itens) ? v.itens : []).forEach(it => {
      const val = Math.round((Number(it.qtd || 0) * Number(it.unit || 0)) * 100) / 100;
      if (it.tipo === 'abastecimento') { t.venda_comb += val; t.litros_comb += Number(it.qtd || 0); }
      else t.venda_prod += val;
    });
    (Array.isArray(v.pagamentos) ? v.pagamentos : []).forEach(p => {
      // RECLASSIFICAÇÃO pelo ✎ (18/08): o ajuste de forma numa venda TRANSMITIDA
      // não muda a nota (fiscal já emitido), mas MUDA o grupo no fechamento —
      // caso real: cupom de cartão FROTA que sai com tpag 03 genérico.
      const ajV = _aj('venda', v.id);
      // prioridade: ajuste do gerente > NOME gravado pelo PDV (18/08) > código
      const g = (ajV && ajV.forma_nome) ? _fcGrupoNome(ajV.forma_nome, p.forma)
        : (p.nome ? _fcGrupoNome(p.nome, p.forma) : _fcGrupoForma(p.forma));
      t.rec[g] = (t.rec[g] || 0) + Number(p.valor || 0);
    });
  });
  (cRes.data || []).forEach(m => {
    if (m._excluido) return;
    const t = porTurno[m.turno_id]; if (!t) return;
    const tipo = String(m.tipo || '').toLowerCase(); const val = Number(m.valor || 0);
    if (tipo.includes('sangria')) t.sangria += val;
    else if (tipo.includes('suprim')) t.suprimento += val;
    else if (tipo.includes('desp')) t.despesa += val;
    else if (tipo.includes('depos')) t.deposito += val;
    else if (tipo.includes('receita')) t.receita += val;
    else t.outrosCaixa += val;
  });
  // RECEBIMENTOS externos (maquininha/cofre/sangria) — casa por horário no turno.
  // NÃO entram no total de recebimentos do resultado (isso viria em dobro com os
  // cupons/fila); ficam como movimentação visível e conferência.
  ((rRes && rRes.data) || []).forEach(r => {
    if (r._excluido) return;
    const tid = _turnoDe(r.recebido_em); const t = tid && porTurno[tid]; if (!t) return;
    const origem = String(r.origem || '').toLowerCase();
    const forma = String(r.forma || '').toLowerCase();
    const val = Number(r.valor || 0);
    if (origem.includes('sangria')) {
      t.sangria_f7 += val; t.sangria += val; t.sangrias_lst.push(r);
    } else {
      t.receb_ext.push(r);
      if (forma.includes('pix')) t.receb_ext_pix += val;
      else if (origem.includes('cofre') || forma.includes('dinheiro')) t.receb_ext_cofre += val;
      else t.receb_ext_cartao += val;
    }
  });
  // VALES / HAVER — por turno_id. Sinal +: posto DEVE (haver do cliente); sinal -:
  // pessoa deve (vale de funcionário/consumo). Guarda os dois lados separados.
  ((vlRes && vlRes.data) || []).forEach(v => {
    const t = porTurno[v.turno_id]; if (!t) return;
    const val = Number(v.valor || 0);
    if (val >= 0) t.vale_haver += val; else t.vale_desconto += Math.abs(val);
    t.vales_lst.push(v);
  });
  // TÍTULOS RECEBIDOS (baixa de a-prazo antigo) — por turno_id
  ((tRes && tRes.data) || []).forEach(x => {
    const t = porTurno[x.turno_id]; if (!t) return;
    t.titulos += Number(x.valor || 0);
    t.titulos_lst.push(x);
  });
  // LANÇAMENTOS MANUAIS (botão ➕ Incluir do balão): entram nas somas do lado
  // dos RECEBIMENTOS (revelam diferença contra as vendas — é essa a função) ou
  // no movimento de caixa (despesa/suprimento/depósito/receita).
  confRows.filter(c => c.ref_tipo === 'manual' && c.ajuste && !c.ajuste.excluido).forEach(c => {
    const t = porTurno[c.turno_id]; if (!t) return;
    const a = c.ajuste; const v = Number(a.valor || 0);
    t.manuais = t.manuais || [];
    t.manuais.push({ id: c.ref_id, secao: a.secao, valor: v, forma_nome: a.forma_nome, bandeira: a.bandeira, descricao: a.descricao, item_vendido: !!a.item_vendido, qtd: a.qtd });
    // ITEM VENDIDO lançado à mão (frentista esqueceu): entra também como VENDA
    // de produto — os dois lados crescem juntos e o Resultado não desequilibra.
    if (a.item_vendido) { t.venda_prod += v; t.venda_total += v; }
    // A SEÇÃO manda (18/08): despesa lançada "em Dinheiro" é DESPESA — sai da
    // gaveta e desconta do esperado. A forma só diz de onde o dinheiro saiu.
    // (antes a forma vencia e a despesa virava RECEBIMENTO de dinheiro,
    // inflando o Resultado do Caixa — caso papelaria R$30,48.)
    if (a.secao === 'despesa') t.despesa += v;
    else if (a.secao === 'suprimento') t.suprimento += v;
    else if (a.secao === 'deposito') t.deposito += v;
    else if (a.secao === 'receita') t.receita += v;
    else if (a.secao === 'sangria') t.sangria += v;
    else {
      const g = (typeof _fcGrupoNome === 'function' ? _fcGrupoNome(a.forma_nome, '') : null) || a.secao;
      const GRUPOS_REC = ['dinheiro', 'cartao', 'pix', 'frota', 'prazo', 'cheque'];
      const chave = GRUPOS_REC.includes(g) ? g : (GRUPOS_REC.includes(a.secao) ? a.secao : 'outros');
      if (chave === 'outros') t.outrosCaixa += v;
      else t.rec[chave] = (t.rec[chave] || 0) + v;
    }
  });

  // ---- CONFERÊNCIA DE CAIXA FÍSICO (dinheiro esperado × contado) ----
  // Modelo TecnoX: Falta/Sobra de Caixa = dinheiro CONTADO na gaveta − dinheiro
  // ESPERADO pelo sistema. Só DINHEIRO (cartão/pix/prazo não entram na gaveta).
  //   esperado = fundo abertura + vendas em dinheiro + suprimentos + receitas
  //              − sangrias − despesas em dinheiro − depósitos
  //   contado  = valor_fechamento (o operador informa ao fechar o turno)
  lista.forEach(t => {
    const d = porTurno[t.id]; if (!d) return;
    const abertura = Number(t.valor_abertura || 0);
    const entra = abertura + Number(d.rec.dinheiro || 0) + Number(d.suprimento || 0) + Number(d.receita || 0);
    const sai = Number(d.sangria || 0) + Number(d.despesa || 0) + Number(d.deposito || 0);
    d.dinheiro_esperado = Math.round((entra - sai) * 100) / 100;
    // CONTADO = gaveta no fechamento + DEPOSITADO NO COFRE no turno (18/08):
    // no posto com cofre Brink's o dinheiro não fica na gaveta — sem somar o
    // cofre, a "falta" era exatamente o valor depositado (1.202,08 × 1.202,00).
    d.dinheiro_contado = (t.valor_fechamento != null)
      ? Math.round((Number(t.valor_fechamento) + Number(d.receb_ext_cofre || 0)) * 100) / 100
      : null; // null = ainda não contado
    d.diferenca_caixa = (d.dinheiro_contado == null) ? null : Math.round((d.dinheiro_contado - d.dinheiro_esperado) * 100) / 100;
    d.falta_caixa = (d.diferenca_caixa != null && d.diferenca_caixa < 0) ? -d.diferenca_caixa : 0;
    d.sobra_caixa = (d.diferenca_caixa != null && d.diferenca_caixa > 0) ? d.diferenca_caixa : 0;
  });
  return { turnos: lista, porTurno };
}

// ---------- LISTA (1ª tela do TecnoX) ----------
async function fcListar() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando turnos...</p>';
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };

  // TURNO DO DIA (pedido Ronan 15/08): a coluna "Turno" mostra a ordem DENTRO
  // do dia (1, 2...) — "dia 14/08 06:11 turno 1" — e não o nº global (31, 32...),
  // que continua na coluna Seq.
  const ordemDia = {};
  turnos.slice().sort((a, b) => String(a.aberto_em || '').localeCompare(String(b.aberto_em || '')))
    .forEach(t => {
      const dia = _fcData(t.aberto_em);
      ordemDia[t.id] = (ordemDia[dia] = (ordemDia[dia] || 0) + 1);
    });

  const linhas = turnos.map(t => {
    const d = porTurno[t.id] || {}; const rec = d.rec || {};
    const sit = String(t.status || '').toUpperCase();
    const corSit = sit.startsWith('ABERTO') ? '#c0392b' : '#127a2e';
    return `<tr onclick="fcDetalhe('${t.id}')" style="cursor:pointer" onmouseover="this.style.background='#1b2233'" onmouseout="this.style.background=''">
      <td class="fc-td">${t.numero ?? ''}</td>
      <td class="fc-td" style="font-weight:600">${ordemDia[t.id] ? ordemDia[t.id] + 'º' : ''}</td>
      <td class="fc-td">${fcEsc(t.operador) || ''}</td>
      <td class="fc-td">${_fcData(t.aberto_em)}</td>
      <td class="fc-td">${_fcHora(t.aberto_em)}</td>
      <td class="fc-td">${_fcData(t.fechado_em)}</td>
      <td class="fc-td">${_fcHora(t.fechado_em)}</td>
      <td class="fc-td" style="color:${corSit};font-weight:600">${sit}</td>
      <td class="fc-td fc-r" style="color:#e06c6c">${d.falta_caixa ? fcMoney(d.falta_caixa) : (d.diferenca_caixa == null ? '—' : '0,00')}</td>
      <td class="fc-td fc-r" style="color:#7ee2a0">${d.sobra_caixa ? fcMoney(d.sobra_caixa) : (d.diferenca_caixa == null ? '—' : '0,00')}</td>
      <td class="fc-td fc-r" style="font-weight:600;color:${d.diferenca_caixa == null ? '#667' : (Math.abs(d.diferenca_caixa) < 0.01 ? '#7ee2a0' : (d.diferenca_caixa < 0 ? '#e06c6c' : '#f0b45c'))}">${d.diferenca_caixa == null ? '—' : fcMoney(d.diferenca_caixa)}</td>
      <td class="fc-td fc-r">${fcMoney(d.venda_total)}</td>
      <td class="fc-td fc-r" style="color:#f0b45c;font-weight:600">${fcMoney(Number(d.venda_total || 0) + Number(d.vale_desconto || 0))}</td>
      <td class="fc-td fc-r">${fcMoney(rec.dinheiro)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.cartao)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.prazo)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.cheque)}</td>
    </tr>`;
  }).join('');

  conteudo.innerHTML = `
    ${_fcEstilo()}
    <div class="fc-janela">
      <div class="fc-titbar">Fechamento de Caixa</div>
      <div class="fc-toolbar">
        <button class="fc-btn" disabled>✔ Confirmar Caixa</button>
        <button class="fc-btn" onclick="fcListar()">🔍 F4 - Pesquisar</button>
        <button class="fc-btn" onclick="fcLimparPeriodo()">🧽 F5 - Limpar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>🗒 F6 - Listar</button>
        <span class="fc-count">${turnos.length} de ${turnos.length}</span>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>➕ Incluir Caixa Zerado</button>
        <button class="fc-btn" disabled>📄 Importar XML</button>
      </div>
      <div class="fc-periodo">
        Período: <input type="date" id="fc-de" value="${window._fcDe}" class="fc-inp"> até
        <input type="date" id="fc-ate" value="${window._fcAte}" class="fc-inp">
        <button class="fc-btn azul" onclick="fcAplicarPeriodo()">🔍 F4 - Pesquisar</button>
      </div>
      <div class="fc-gridwrap">
        <table class="fc-grid">
          <thead><tr>
            <th>Seq.</th><th>Turno</th><th>Operador</th><th>Abertura</th><th>Hora Abert.</th>
            <th>Fechamento</th><th>Hora Fec.</th><th>Situação</th>
            <th>Falta Caixa</th><th>Sobra Caixa</th><th>Diferença Caixa</th>
            <th>Venda</th><th>Movimentado</th><th>Dinheiro</th><th>Cartão</th><th>Nota a prazo</th><th>Cheque</th>
          </tr></thead>
          <tbody>${linhas || '<tr><td colspan="17" style="padding:20px;text-align:center;color:#888">Nenhum turno no período.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function fcAplicarPeriodo() {
  const de = document.getElementById('fc-de')?.value, ate = document.getElementById('fc-ate')?.value;
  if (de) window._fcDe = de; if (ate) window._fcAte = ate; fcListar();
}
function fcLimparPeriodo() {
  const hoje = new Date(), d = new Date(hoje.getTime() - 30 * 86400000);
  window._fcAte = hoje.toISOString().slice(0, 10); window._fcDe = d.toISOString().slice(0, 10); fcListar();
}

// ---------- DETALHE (2ª tela do TecnoX) ----------
function fcDetalhe(turnoId) {
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  const d = (cache.porTurno || {})[turnoId] || {};
  if (!t) return;
  window._fcTurnoAtual = turnoId;
  const rec = d.rec || {};

  // MODELO TECNOX (12/08): os dois lados se igualam e o "Resultado do Caixa" fica
  // sempre 0 — a diferença real aparece em FALTA / SOBRA DE CAIXA (o plug). Cada
  // campo é preenchido da melhor fonte do Octano; o plug absorve o que ainda não
  // é capturado. Calibrar com um turno real do TecnoX lado a lado.
  // O balanço fecha por FORMA DE PAGAMENTO × VENDAS (o que se paga = o que se
  // vende). Os MOVIMENTOS de caixa (troco, depósito, despesa, sangria, vales)
  // são o destino/uso do MESMO dinheiro já contado — entram como (mov.), fora do
  // total, senão geram falta/sobra falsa. Troco é NET (fechamento − abertura):
  // fundo de caixa que não mudou não é sobra.
  const trocoNet = Number((Number(t.valor_fechamento || 0) - Number(t.valor_abertura || 0)).toFixed(2));
  const I = { info: true };
  // RECEBIMENTOS — formas de pagamento (entram no total) + movimentos (mov.)
  const recebBase = [
    // DINHEIRO = o DEPOSITADO NO COFRE no turno (decisão Ronan 18/08): é o
    // físico que entrou, sem dedução de despesa (despesa tem linha própria e
    // pode nem ter saído do dinheiro). A venda em dinheiro do sistema segue
    // na conferência de gaveta ("Vendas em dinheiro").
    ['Dinheiro (depositado no cofre)', d.receb_ext_cofre],
    ['Cartão', rec.cartao],
    ['Pix', rec.pix],
    ['Cartão Frota', rec.frota],
    ['Nota a prazo', rec.prazo],
    ['Cheque', rec.cheque],
    // MODELO DO RONAN (18/08): o lado esquerdo é a PRESTAÇÃO DE CONTAS — onde
    // o dinheiro foi parar. Despesa paga, depósito em banco e o que ficou na
    // gaveta SOMAM aqui; contra vendas + troco inicial do outro lado, a
    // diferença é a falta/sobra (bate com a conferência de gaveta).
    ['Despesas', d.despesa],
    ['Deposito em Conta', d.deposito],
    ['Troco Final (gaveta)', Number(t.valor_fechamento || 0)],
    ['Vale Haver', d.vale_haver, I],
    ['Vale Motorista', d.vale_desconto, I],
  ];
  // VENDAS/SAÍDAS — o que gerou o movimento (entram no total) + movimentos (mov.)
  const vendasBase = [
    ['Venda produtos', d.venda_prod],
    ['Venda serviços', 0],
    ['Venda combustíveis', d.venda_comb],
    ['Títulos Recebidos', d.titulos],
    // Remessas = TROCO INICIAL (fundo de abertura) + suprimentos avulsos —
    // SOMA no Total Vendas/Saída (pedido 18/08); o par dele nos Recebimentos
    // é a linha "Troco inicial (fundo)", mantendo o Resultado em zero.
    ['Remessas', Number(t.valor_abertura || 0) + Number(d.suprimento || 0)],
    ['Cheque troco', 0, I],
    ['Haver', 0, I],
    ['Receitas', 0, I],
  ];
  const soma = (arr) => arr.reduce((s, r) => s + (r[2] && r[2].info ? 0 : Number(r[1] || 0)), 0);
  const somaReceb = soma(recebBase);
  const somaVenda = soma(vendasBase);
  // FALTA/SOBRA DE CAIXA = conferência de DINHEIRO FÍSICO (contado × esperado),
  // calculada em fcCarregarDados. NÃO é mais o plug venda×forma.
  const faltaCaixa = d.falta_caixa || 0;
  const sobraCaixa = d.sobra_caixa || 0;
  // Falta/Sobra aparecem nas colunas (layout TecnoX) mas NÃO somam nos totais:
  // desde 14/08 a falta vem da CONFERÊNCIA FÍSICA da gaveta, e o dinheiro dos
  // Recebimentos já vem completo do sistema (fila paga) — somar a falta contava
  // o mesmo dinheiro em dobro (ex.: 8.184,27 = 6.453,50 + 1.730,77 no turno 31).
  const receb = recebBase.concat([['Falta de Caixa (conf. gaveta)', faltaCaixa]]);
  const vendas = vendasBase.concat([['Sobra de Caixa (conf. gaveta)', sobraCaixa]]);
  const totalReceb = somaReceb;   // prestação de contas: cofre+maquininha+frota+despesas+gaveta
  const totalVenda = somaVenda;   // origem: vendas + troco inicial (Remessas)
  // Resultado = contas prestadas − origem. Negativo = FALTA, positivo = SOBRA
  // (deve bater com a conferência de gaveta — dois caminhos, mesmo número)
  const resultado = totalReceb - totalVenda;

  // TOTAL MOVIMENTADO no caixa = tudo que passou (vendas/saídas: fila+transmitidos
  // + títulos recebidos).
  const totalMov = totalVenda;
  const cuponsTransm = Math.max(0, Number(d.venda_total || 0) - Number(d.fila_total || 0));

  const linhaVal = (rot, val, opt) => `<div class="fc-lin"><span class="fc-lbl">${rot}${opt && opt.info ? ' <span style="color:#6b7688;font-size:9px">(mov.)</span>' : ''}</span><span class="fc-box"${opt && opt.info ? ' style="opacity:.75"' : ''}>${fcMoney(val)}</span></div>`;
  const nodo = (txt, tipo) => `<li ${tipo ? `onclick="fcNode('${tipo}')" style="cursor:pointer"` : ''}>${txt}</li>`;

  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = `
    ${_fcEstilo()}
    <div class="fc-janela">
      <div class="fc-titbar">Fechamento de Caixa</div>
      <div class="fc-toolbar">
        <button class="fc-btn" onclick="fcListar()">↩ Voltar / Estornar</button>
        <button class="fc-btn" onclick="fcListar()">🔍 F4 - Pesquisar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" onclick="fcListar()">🗒 F6 - Listar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>➕ Incluir Caixa Zerado</button>
        <button class="fc-btn" disabled>📄 Importar XML</button>
      </div>

      <div class="fc-cab">
        <div><label>Seq.:</label><input value="${t.numero ?? ''}" class="fc-inp2" readonly></div>
        ${(() => {
          // TURNO DO DIA (pedido Ronan 15/08): "dia 14/08 06:11 a 14:19 turno 1".
          // O nº global (31, 32...) não diz nada pro operador — o que importa é
          // se foi o 1º ou 2º turno DAQUELE dia (ordem de abertura no dia).
          const doDia = (cache.turnos || [])
            .filter(x => _fcData(x.aberto_em) === _fcData(t.aberto_em))
            .sort((a, b) => String(a.aberto_em).localeCompare(String(b.aberto_em)));
          const nDia = doDia.findIndex(x => x.id === t.id) + 1;
          return `<div><label>Turno do dia:</label><input value="${nDia > 0 ? nDia + 'º turno' : (t.numero ?? '')}" class="fc-inp2 mini" readonly></div>`;
        })()}
        <div><label>Status:</label><input value="${fcEsc((t.status || '').toUpperCase())}" class="fc-inp2" readonly></div>
        <div><label>Abertura:</label><input value="${_fcData(t.aberto_em)}" class="fc-inp2 data" readonly></div>
        <div><label>Hora Aber.:</label><input value="${_fcHora(t.aberto_em)}" class="fc-inp2 mini" readonly></div>
        <div><label>Fechamento:</label><input value="${_fcData(t.fechado_em)}" class="fc-inp2 data" readonly></div>
        <div><label>Hora Fec.:</label><input value="${_fcHora(t.fechado_em)}" class="fc-inp2 mini" readonly></div>
      </div>
      <div class="fc-cab">
        <div><label>Vendedor:</label><input value="TODOS" class="fc-inp2 lg" readonly></div>
        <button class="fc-btn" disabled>Rateio</button>
        <div><label>Operador:</label><input value="${fcEsc(t.operador) || ''}" class="fc-inp2 lg" readonly></div>
        <div><label>PDV:</label><input value="PDV 01" class="fc-inp2 mini" readonly></div>
      </div>

      <div class="fc-corpo">
        <div class="fc-tree">
          <ul>
            ${nodo('📁 Principal')}
            <li>😊 Recebimentos<ul>
              ${nodo('💵 Dinheiro / Sangria', 'dinheiro')}${nodo('💳 Cartão + Pix', 'cartao')}${nodo('🚛 Cartão Frota', 'frota')}${nodo('📄 Nota a Prazo', 'prazo')}
              ${d.fila_total > 0.009 ? nodo('⏳ Fila de transmissão', 'fila') : ''}
              ${nodo('🧾 Cheque', 'cheque')}
              ${nodo('Troco Final', 'troco_final')}${nodo('Vale Haver', 'vale_haver')}${nodo('Despesa', 'despesa')}${nodo('🏦 Depósito em Conta', 'deposito')}
            </ul></li>
            <li>😊 Vales / Haver<ul>
              ${nodo('🤝 Haver (crédito/troco)', 'vale_haver')}${nodo('👷 Vale / Consumo', 'vale_motorista')}${nodo('📒 Todos os vales', 'vales')}
            </ul></li>
            <li>📁 Remessas<ul>
              ${nodo('Suprimentos', 'suprimento')}${nodo('Haver', 'haver')}${nodo('Cheque Troco', 'cheque_troco')}${nodo('Títulos Recebidos', 'titulos')}${nodo('Receita', 'receita')}
            </ul></li>
            <li>📁 Diferença de Caixa<ul>
              ${nodo('🔴 Falta de Caixa', 'diferenca')}${nodo('🟢 Sobra de Caixa', 'diferenca')}
            </ul></li>
            <li>📁 Detalhes<ul>
              ${nodo('🧾 Movimentação completa', 'movimentacao')}
              ${nodo('💳 Recebimentos (maquininha/cofre)', 'receb_ext')}
              ${nodo('📑 Cupons Fiscais', 'cupons')}${nodo('👤 Demonstrativo Vendedor', 'vendedor')}
              ${nodo('📋 Itens Vendidos', 'itens')}${nodo('⛽ Combustível Vendido', 'combustivel')}
              ${nodo('🗑 Cancelamentos de Pista', 'cancelados')}
              ${nodo('📦 Estoque Fech. Caixa', 'estoque')}
            </ul></li>
          </ul>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Recebimentos</div>
          ${receb.map(r => linhaVal(r[0], r[1], r[2])).join('')}
          ${d.sangria_f7 > 0.009 ? `<div class="fc-lin" style="cursor:pointer" onclick="fcNode('dinheiro')"><span class="fc-lbl">Sangrias (retiradas) <span style="color:#6b7688;font-size:9px">(mov.)</span></span><span class="fc-box" style="opacity:.75">${fcMoney(d.sangria_f7)}</span></div>` : ''}
          <div class="fc-total"><span>Total Recebimentos:</span><span class="fc-box forte">${fcMoney(totalReceb)}</span></div>
          <div class="fc-total"><span>Resultado do Caixa</span><span class="fc-box ${Math.abs(resultado) < 0.01 ? 'ok' : 'alerta'}">${fcMoney(resultado)}</span></div>
          <div class="fc-total" style="border-top:2px solid #f97316;margin-top:6px"><span>💰 Total movimentado</span><span class="fc-box forte" style="background:#2a1e0f;border-color:#7a5a20;color:#f0b45c;cursor:pointer" onclick="fcNode('movimentacao')">${fcMoney(totalMov)}</span></div>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Vendas / Saídas</div>
          ${vendas.map(r => linhaVal(r[0], r[1], r[2])).join('')}
          <div class="fc-litros">${fcNum(d.litros_comb, 3)} L de combustível &nbsp;·&nbsp; ${d.qtd_vendas} cupons</div>
          ${d.fila_total > 0.009 ? `<div class="fc-litros" style="color:#fbbf24;cursor:pointer" onclick="fcNode('fila')">⏳ ${(d.fila_itens || []).length} abastecimento(s) pagos na fila de transmissão: ${fcMoney(d.fila_total)} (já somados acima — clique p/ detalhar)</div>` : ''}
          ${d.fila_sem_pgto > 0.009 ? `<div class="fc-litros" style="color:#e06c6c">⚠ ${(d.fila_sem_pgto_itens || []).length} abastecimento(s) SEM pagamento confirmado: ${fcMoney(d.fila_sem_pgto)} (fora do caixa — pendência de pista)</div>` : ''}
          <div class="fc-total"><span>Total Vendas / Saída:</span><span class="fc-box forte azulf">${fcMoney(totalVenda)}</span></div>
          <div class="fc-total" style="border-top:2px solid #f97316;margin-top:6px">
            <span>💰 Total movimentado no caixa</span>
            <span class="fc-box forte" style="background:#2a1e0f;border-color:#7a5a20;color:#f0b45c;cursor:pointer" onclick="fcNode('movimentacao')">${fcMoney(totalMov)}</span>
          </div>
          <div class="fc-litros">Fila ${fcMoney(d.fila_total)} + Transmitidos ${fcMoney(cuponsTransm)}${d.vale_desconto > 0.009 ? ' + Vale/consumo ' + fcMoney(d.vale_desconto) : ''}${rec.prazo > 0.009 ? ' · (nota a prazo ' + fcMoney(rec.prazo) + ' já incluída nas vendas)' : ''}</div>
        </div>

        <div class="fc-painel">
          <div class="fc-obscab"><span>Observação:</span><button class="fc-btn mini" onclick="fcSalvarObs()">💾 Salvar Obs.</button></div>
          <textarea id="fc-obs" class="fc-obs" placeholder="Observações do caixa...">${fcEsc(t.observacao || '')}</textarea>
          <div style="background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;margin-top:10px">
            <div style="color:#f0b45c;font-weight:700;font-size:0.82rem;margin-bottom:6px">💵 Conferência de Caixa (dinheiro)</div>
            <div style="font-size:0.78rem;color:#b8c4d0;line-height:1.7">
              <div style="display:flex;justify-content:space-between"><span>Fundo de abertura</span><b>${fcMoney(t.valor_abertura)}</b></div>
              <div style="display:flex;justify-content:space-between"><span>+ Vendas em dinheiro</span><b>${fcMoney(rec.dinheiro)}</b></div>
              ${d.suprimento > 0.009 ? `<div style="display:flex;justify-content:space-between"><span>+ Suprimentos</span><b>${fcMoney(d.suprimento)}</b></div>` : ''}
              ${d.receita > 0.009 ? `<div style="display:flex;justify-content:space-between"><span>+ Receitas</span><b>${fcMoney(d.receita)}</b></div>` : ''}
              ${d.sangria > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Sangrias</span><b>${fcMoney(d.sangria)}</b></div>` : ''}
              ${d.despesa > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Despesas</span><b>${fcMoney(d.despesa)}</b></div>` : ''}
              ${d.deposito > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Depósitos</span><b>${fcMoney(d.deposito)}</b></div>` : ''}
              <div style="display:flex;justify-content:space-between;border-top:1px solid #2a3a4a;margin-top:4px;padding-top:4px"><span>= Esperado na gaveta</span><b style="color:#7ea8d8">${fcMoney(d.dinheiro_esperado)}</b></div>
              <div style="display:flex;justify-content:space-between"><span>Contado (gaveta ${fcMoney(t.valor_fechamento)} + cofre ${fcMoney(d.receb_ext_cofre)})</span><b>${d.dinheiro_contado == null ? '—' : fcMoney(d.dinheiro_contado)}</b></div>
              <div style="display:flex;justify-content:space-between;font-size:0.92rem;margin-top:4px"><span style="font-weight:700">${d.diferenca_caixa == null ? 'Turno em aberto' : (Math.abs(d.diferenca_caixa) < 0.01 ? '✓ Caixa confere' : (d.diferenca_caixa < 0 ? '🔴 FALTA' : '🟢 SOBRA'))}</span><b style="color:${d.diferenca_caixa == null ? '#667' : (Math.abs(d.diferenca_caixa) < 0.01 ? '#7ee2a0' : (d.diferenca_caixa < 0 ? '#e06c6c' : '#7ee2a0'))}">${d.diferenca_caixa == null ? '' : fcMoney(Math.abs(d.diferenca_caixa))}</b></div>
            </div>
            ${d.dinheiro_contado != null ? `<button class="fc-btn2" style="margin-top:8px;width:100%;border-color:#2a5a3a;color:#7be0a0" onclick="fcConfirmarCaixa('${turnoId}')">✔ Confirmar conferência</button>` : '<div style="font-size:0.72rem;color:#667;margin-top:6px">Turno ainda aberto — a conferência fecha quando o operador informar o dinheiro contado.</div>'}
          </div>
          ${(() => {
            // 🏦 CONCILIAÇÃO BANCÁRIA — o que o SISTEMA registrou (vendas+fila paga)
            // × o que a MAQUININHA reportou (oct_recebimentos EDI/e-mail), por forma.
            const sisCartao = Number(rec.cartao || 0);
            const sisPix = Number(rec.pix || 0);
            const maqCartao = Number(d.receb_ext_cartao || 0);
            const maqPix = Number(d.receb_ext_pix || 0);
            if (sisCartao < 0.01 && sisPix < 0.01 && maqCartao < 0.01 && maqPix < 0.01) return '';
            const linha = (nome, sis, maq) => {
              const dif = Math.round((maq - sis) * 100) / 100;
              const ok = Math.abs(dif) < 0.01;
              const semMaq = maq < 0.01 && sis >= 0.01;
              return `<div style="display:flex;justify-content:space-between"><span>${nome} — sistema</span><b>${fcMoney(sis)}</b></div>
                <div style="display:flex;justify-content:space-between"><span>${nome} — maquininha</span><b>${semMaq ? '<span style="color:#8892a0">sem dados</span>' : fcMoney(maq)}</b></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #223044;margin-bottom:4px;padding-bottom:4px"><span style="font-weight:700">${semMaq ? '⚠ sem retorno da maquininha' : (ok ? '✓ concilia' : 'Diferença')}</span><b style="color:${semMaq ? '#f0b45c' : (ok ? '#7ee2a0' : '#e06c6c')}">${semMaq ? '' : fcMoney(Math.abs(dif))}</b></div>`;
            };
            return `<div style="background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;margin-top:10px">
              <div style="color:#7ea8d8;font-weight:700;font-size:0.82rem;margin-bottom:6px">🏦 Conciliação bancária (cartão/pix)</div>
              <div style="font-size:0.78rem;color:#b8c4d0;line-height:1.7">
                ${linha('Cartão', sisCartao, maqCartao)}
                ${linha('Pix', sisPix, maqPix)}
              </div>
              <div style="font-size:0.7rem;color:#667;margin-top:4px">Maquininha = recebimentos EDI/e-mail do período do turno. "Sem dados" = ingestão parada ou D-1 ainda não chegou.</div>
            </div>`;
          })()}
          ${(() => {
            // 🧾 MAQUININHA DO TURNO (pedido Ronan 15/08): o que o EDI/e-mail
            // puxou DENTRO da janela do turno, total por forma+bandeira.
            const maq = (d.receb_ext || []).filter(r => String(r.origem || '').toLowerCase().includes('pagbank'));
            if (!maq.length) return '';
            const por = {};
            maq.forEach(r => {
              const k = _fcRotForma(null, r.forma, r.bandeira);
              por[k] = (por[k] || 0) + Number(r.valor || 0);
            });
            const linhas = Object.entries(por).sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span>${fcEsc(k)}</span><b>${fcMoney(v)}</b></div>`).join('');
            const tot = maq.reduce((s, r) => s + Number(r.valor || 0), 0);
            return `<div style="background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;margin-top:10px;cursor:pointer" onclick="fcNode('cartao')" title="Clique para ver transação a transação">
              <div style="color:#7ea8d8;font-weight:700;font-size:0.82rem;margin-bottom:6px">🧾 Maquininha do turno (EDI/e-mail) — ${maq.length} transações</div>
              <div style="font-size:0.78rem;color:#b8c4d0;line-height:1.7">
                ${linhas}
                <div style="display:flex;justify-content:space-between;border-top:1px solid #2a3a4a;margin-top:4px;padding-top:4px"><span style="font-weight:700">Total maquininha</span><b style="color:#7ee2a0">${fcMoney(tot)}</b></div>
              </div>
            </div>`;
          })()}
          <button class="fc-btn2" onclick="fcNode('demonstrativo')">📊 Demonstrativo do Caixa</button>
          <button class="fc-btn2" onclick="fcNode('encerrantes')">🔢 Encerrantes</button>
          <button class="fc-btn2" onclick="fcNode('itens')">📋 Rel. itens vendidos</button>
          <button class="fc-btn2" disabled>🔄 Reseta itens</button>
          <button class="fc-btn2" disabled>💳 Importar Cartões (Conciliação Automática)</button>
          <div class="fc-adgrid">
            <label>Acréscimo:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desconto:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Acresc. Manual:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Acresc. Especial:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desc. Manual:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desc. Especial:</label><input class="fc-inp3" value="0,00" readonly>
          </div>
        </div>
      </div>
    </div>`;
}

// Nós de "Detalhes" com dado real do octano (lazy load).
async function fcNode(tipo) {
  const turnoId = window._fcTurnoAtual; if (!turnoId) return;
  window._fcNodeAtual = tipo;   // p/ reabrir o mesmo balão após salvar edição
  // nós v2 — lidos do cache (movimentação completa do PDV)
  if (tipo === 'vale_haver' || tipo === 'vale_motorista' || tipo === 'vales'
      || tipo === 'movimentacao' || tipo === 'receb_ext' || tipo === 'titulos') {
    return fcNodeMov(tipo);
  }
  if (tipo === 'cupons' || tipo === 'itens' || tipo === 'combustivel' || tipo === 'vendedor') {
    fcModal('Carregando...', '<p style="padding:20px;color:#888">Buscando...</p>');
    const { data: vendas } = await sb.from('oct_pdv_vendas')
      .select('id,numero,valor_total,itens,pagamentos,status,vendedor,operador,cliente_nome,data_venda')
      .eq('turno_id', turnoId).order('numero');
    const vs = (vendas || []).filter(v => String(v.status || '').toLowerCase() !== 'cancelada');
    if (tipo === 'cupons') return fcModalCupons(vs);
    if (tipo === 'itens') return fcModalItens(vs);
    if (tipo === 'combustivel') return fcModalCombustivel(vs);
    if (tipo === 'vendedor') return fcModalVendedor(vs);
  } else if (FC_DETALHES[tipo]) {
    return fcNodeDetalhe(tipo);
  } else {
    fcModal(tipo, '<p style="padding:24px;color:#777">Este detalhe será ligado na próxima etapa.</p>');
  }
}

// ============================================================
// LANÇAMENTOS INTERATIVOS (15/08 — modelo TecnoX)
// Toda linha de lançamento tem: checkbox de CONFERIDO (clique ou tecla
// ESPAÇO; a linha muda de cor), setas ↑↓ navegam, e ✎ abre a EDIÇÃO
// (overlay em oct_fc_lancamentos — o dado original nunca muda).
// ============================================================
window._fcLancBase = {};   // 'tipo:id' -> dados originais p/ o modal de edição
window._fcSel = new Set(); // seleção em massa (checkbox — NÃO é o conferido)

// linha interativa: ☑ = MARCAR (seleção p/ ações em massa, azul); ESPAÇO ou os
// botões Conferir = CONFERIDO (persistido, fica laranja). Igual ao TecnoX:
// checkbox seleciona, espaço confere.
function _fcRow(refTipo, refId, tds, btnDetalhe) {
  const k = refTipo + ':' + refId;
  const conf = (window._fcConf && window._fcConf[k] || {}).conferido;
  const aj = (window._fcConf && window._fcConf[k] || {}).ajuste;
  const sel = window._fcSel.has(k);
  return `<tr tabindex="0" data-fcref="${k}" class="${conf ? 'fc-confrow' : ''}${sel ? ' fc-selrow' : ''}"
      onkeydown="fcRefKey(event,this)" onclick="this.focus()">
    <td class="fc-td" style="width:26px;text-align:center"><input type="checkbox" ${sel ? 'checked' : ''}
      onclick="event.stopPropagation();fcSelToggle('${k}',this)"></td>
    ${tds}
    <td class="fc-td" style="width:60px;white-space:nowrap">${btnDetalhe ? `<button class="fc-btn mini" title="Abrir detalhes" onclick="event.stopPropagation();${btnDetalhe}">🔎</button>` : ''}${aj ? '<span title="editado" style="color:#f0b45c">•</span>' : ''}<button class="fc-btn mini" title="Alterar lançamento" onclick="event.stopPropagation();fcLancEditar('${refTipo}','${refId}')">✎</button></td></tr>`;
}

function fcSelToggle(k, cb) {
  if (window._fcSel.has(k)) window._fcSel.delete(k); else window._fcSel.add(k);
  const tr = cb.closest('tr');
  if (tr) tr.classList.toggle('fc-selrow', window._fcSel.has(k));
}

function fcRefKey(ev, tr) {
  if (ev.key === ' ') {
    ev.preventDefault();
    const k = tr.dataset.fcref; const i = k.indexOf(':');
    fcRefToggle(k.slice(0, i), k.slice(i + 1), tr);
  } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    let n = ev.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
    while (n && !(n.dataset && n.dataset.fcref)) n = ev.key === 'ArrowDown' ? n.nextElementSibling : n.previousElementSibling;
    if (n) n.focus();
  }
}

function _fcConfPintar(tr, conferido) {
  if (!tr) return;
  tr.classList.toggle('fc-confrow', conferido);
}

async function fcRefToggle(refTipo, refId, tr) {
  const k = refTipo + ':' + refId;
  const cur = window._fcConf[k] = window._fcConf[k] || {};
  cur.conferido = !cur.conferido;
  _fcConfPintar(tr || document.querySelector(`tr[data-fcref="${k}"]`), cur.conferido);
  try {
    await sb.from('oct_fc_lancamentos').upsert({
      empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
      ref_tipo: refTipo, ref_id: refId, conferido: cur.conferido,
      conferido_em: new Date().toISOString(), ajuste: cur.ajuste || null,
    }, { onConflict: 'empresa_id,turno_id,ref_tipo,ref_id' });
  } catch (e) {
    alert('Não salvou a conferência: ' + (e.message || e) + '\n\n→ Rode o SQL-FC-LANCAMENTOS.sql no Supabase.');
  }
}

// ---- BARRA DE AÇÕES (modelo TecnoX): presente em toda lista de lançamentos ----
function _fcToolbar() {
  return `<div class="fc-filtros" style="gap:5px">
    <button class="fc-btn mini" onclick="fcSelTodos(true)">☑ Marcar</button>
    <button class="fc-btn mini" onclick="fcSelTodos(false)">☐ Desmarcar</button>
    <span class="fc-sep"></span>
    <button class="fc-btn mini" onclick="fcLancIncluir()">➕ Incluir</button>
    <button class="fc-btn mini" onclick="fcLancAlterar()">✎ Alterar</button>
    <button class="fc-btn mini" onclick="fcLancExcluir(false)">❌ Excluir</button>
    <button class="fc-btn mini" onclick="fcLancExcluir(true)">❌ Excluir marcados</button>
    <span class="fc-sep"></span>
    <button class="fc-btn mini" onclick="fcConfEspaco()">☑ Conferir/Desconferir (Espaço)</button>
    <button class="fc-btn mini" style="border-color:#2a5a3a;color:#7be0a0" onclick="fcConfTodos(true)">✔ Conferir todas (F9)</button>
    <button class="fc-btn mini" style="border-color:#7a2a2a;color:#f0a0a0" onclick="fcConfTodos(false)">✖ Desconferir todas (F10)</button>
  </div>`;
}

function _fcRodape(n, total) {
  return `<div class="fc-filtros" style="justify-content:flex-end;gap:10px;border-top:1px solid #2a2d3e;border-bottom:none">
    <span>Nº de títulos: <b style="color:#e5e7eb">${n}</b></span>
    <span>Total: <b style="background:#10231a;border:1px solid #245a35;border-radius:5px;padding:2px 10px;color:#7ee2a0">${fcMoney(total)}</b></span>
  </div>`;
}

function fcSelTodos(v) {
  document.querySelectorAll('#fc-modal tr[data-fcref]').forEach(tr => {
    const k = tr.dataset.fcref;
    if (v) window._fcSel.add(k); else window._fcSel.delete(k);
    tr.classList.toggle('fc-selrow', v);
    const cb = tr.querySelector('input[type=checkbox]');
    if (cb) cb.checked = v;
  });
}

// conferir/desconferir a linha focada; sem foco, aplica nos MARCADOS
function fcConfEspaco() {
  const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-fcref]');
  const alvos = foco ? [foco]
    : [...document.querySelectorAll('#fc-modal tr[data-fcref]')].filter(tr => window._fcSel.has(tr.dataset.fcref));
  if (!alvos.length) { alert('Clique numa linha (ou marque ☑) antes de conferir.'); return; }
  alvos.forEach(tr => {
    const k = tr.dataset.fcref; const i = k.indexOf(':');
    fcRefToggle(k.slice(0, i), k.slice(i + 1), tr);
  });
}

// F9/F10 — conferir/desconferir TODAS as linhas do modal aberto (upsert em lote)
async function fcConfTodos(v) {
  const rows = [...document.querySelectorAll('#fc-modal tr[data-fcref]')];
  if (!rows.length) return;
  const payload = rows.map(tr => {
    const k = tr.dataset.fcref; const i = k.indexOf(':');
    const cur = window._fcConf[k] = window._fcConf[k] || {};
    cur.conferido = v;
    _fcConfPintar(tr, v);
    return {
      empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
      ref_tipo: k.slice(0, i), ref_id: k.slice(i + 1), conferido: v,
      conferido_em: new Date().toISOString(), ajuste: cur.ajuste || null,
    };
  });
  try {
    await sb.from('oct_fc_lancamentos').upsert(payload, { onConflict: 'empresa_id,turno_id,ref_tipo,ref_id' });
  } catch (e) {
    alert('Não salvou: ' + (e.message || e));
  }
}

// F9/F10 funcionam com o modal aberto (registrado uma vez)
if (!window._fcTeclasOk) {
  window._fcTeclasOk = true;
  document.addEventListener('keydown', (ev) => {
    if (!document.getElementById('fc-modal')) return;
    if (ev.key === 'F9') { ev.preventDefault(); fcConfTodos(true); }
    else if (ev.key === 'F10') { ev.preventDefault(); fcConfTodos(false); }
  });
}

// INCLUIR lançamento manual na seção aberta (vira ref_tipo='manual' e SOMA no fechamento)
function fcLancIncluir() {
  const secao = window._fcNodeAtual || 'dinheiro';
  const formas = ['Dinheiro', 'Crédito', 'Débito', 'Pix', 'Pix CNPJ', 'Nota a prazo', 'Cheque', 'Outro'];
  fcModal('➕ Incluir lançamento', `
    <div style="padding:16px;font-size:0.85rem;color:#cdd6e0">
      <p style="color:#888;font-size:0.75rem;margin-bottom:10px">Lançamento manual na seção <b>${fcEsc(secao)}</b> — entra nas somas do fechamento (auditável como manual).</p>
      <label style="display:block;color:#9aa;font-size:0.75rem">Valor (R$) *</label>
      <input id="fcm-valor" type="number" step="0.01" class="fc-inp2" style="width:140px">
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Forma</label>
      <select id="fcm-forma" class="fc-inp2" style="width:200px">${formas.map(f => `<option>${f}</option>`).join('')}</select>
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Bandeira</label>
      <input id="fcm-bandeira" class="fc-inp2" style="width:200px" placeholder="Visa, Master, Elo...">
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Descrição</label>
      <input id="fcm-desc" class="fc-inp2 lg" style="width:100%">
      <button class="fc-btn azul" style="width:100%;margin-top:14px" onclick="fcLancIncluirSalvar('${secao}')">💾 Incluir</button>
    </div>`);
}

async function fcLancIncluirSalvar(secao) {
  const valor = parseFloat(document.getElementById('fcm-valor').value);
  if (isNaN(valor) || valor <= 0) { alert('Informe o valor.'); return; }
  const ajuste = {
    manual: true, secao, valor,
    forma_nome: document.getElementById('fcm-forma').value,
    bandeira: document.getElementById('fcm-bandeira').value.trim() || null,
    descricao: document.getElementById('fcm-desc').value.trim() || null,
  };
  const refId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  const { error } = await sb.from('oct_fc_lancamentos').insert({
    empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
    ref_tipo: 'manual', ref_id: refId, conferido: false, ajuste,
  });
  if (error) { alert('Erro: ' + error.message); return; }
  await _fcRecarregarNode();
}

// ALTERAR: 1 marcado ou a linha focada
function fcLancAlterar() {
  const marcados = [...window._fcSel];
  let k = null;
  if (marcados.length === 1) k = marcados[0];
  else {
    const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-fcref]');
    if (foco) k = foco.dataset.fcref;
  }
  if (!k) { alert('Marque UM lançamento (☑) ou clique na linha antes de alterar.'); return; }
  const i = k.indexOf(':');
  fcLancEditar(k.slice(0, i), k.slice(i + 1));
}

// EXCLUIR: manual = apaga de vez; original = overlay "excluído" (sai das somas,
// o dado do núcleo continua intacto e dá pra desfazer no ✎)
async function fcLancExcluir(marcados) {
  let alvos = [];
  if (marcados) alvos = [...window._fcSel];
  else {
    const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-fcref]');
    if (foco) alvos = [foco.dataset.fcref];
  }
  alvos = alvos.filter(k => !k.startsWith('venda:'));   // cupom transmitido não se exclui daqui (é fiscal)
  if (!alvos.length) { alert('Marque (☑) ou clique num lançamento excluível.\n(Cupom já transmitido não se exclui — é documento fiscal.)'); return; }
  if (!confirm(`Excluir ${alvos.length} lançamento(s) do fechamento?\nManual apaga de vez; os demais ficam marcados como excluídos (dá pra desfazer no ✎).`)) return;
  for (const k of alvos) {
    const i = k.indexOf(':'); const refTipo = k.slice(0, i); const refId = k.slice(i + 1);
    try {
      if (refTipo === 'manual') {
        await sb.from('oct_fc_lancamentos').delete()
          .eq('empresa_id', window._fcEmpresaId).eq('turno_id', window._fcTurnoAtual)
          .eq('ref_tipo', 'manual').eq('ref_id', refId);
        delete window._fcConf[k];
      } else {
        const cur = window._fcConf[k] = window._fcConf[k] || {};
        cur.ajuste = Object.assign({}, cur.ajuste || {}, { excluido: true });
        await sb.from('oct_fc_lancamentos').upsert({
          empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
          ref_tipo: refTipo, ref_id: refId, conferido: !!cur.conferido, ajuste: cur.ajuste,
        }, { onConflict: 'empresa_id,turno_id,ref_tipo,ref_id' });
      }
    } catch (e) { alert('Erro ao excluir: ' + (e.message || e)); return; }
  }
  window._fcSel.clear();
  await _fcRecarregarNode();
}

// recarrega os dados e reabre o mesmo balão
async function _fcRecarregarNode() {
  const node = window._fcNodeAtual;
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };
  fcDetalhe(window._fcTurnoAtual);
  if (node) fcNode(node);
}

// rótulo completo forma+bandeira ("Crédito Mastercard", "Débito Elo", "Pix")
function _fcRotForma(formaNome, forma, bandeira) {
  let f = String(formaNome || '').trim();
  const cod = String(forma || '').padStart(2, '0');
  const low = (f + ' ' + String(forma || '')).toLowerCase();
  if (/créd|cred/.test(low) || cod === '03') f = 'Crédito';
  else if (/déb|deb/.test(low) || cod === '04') f = 'Débito';
  else if (/pix/.test(low) || ['17', '18', '19'].includes(cod)) f = 'Pix';
  else if (/dinheiro/.test(low) || cod === '01') f = 'Dinheiro';
  else if (!f || f === 'Cartão') f = 'Cartão';
  const b = String(bandeira || '').trim();
  const bCap = b ? b.charAt(0).toUpperCase() + b.slice(1).toLowerCase() : '';
  return (f + (bCap ? ' ' + bCap : '')).trim();
}

// modal de EDIÇÃO do lançamento — grava só o que mudou (overlay)
function fcLancEditar(refTipo, refId) {
  const k = refTipo + ':' + refId;
  const base = window._fcLancBase[k] || {};
  const aj = (window._fcConf[k] || {}).ajuste || {};
  const v = (campo) => aj[campo] != null ? aj[campo] : (base[campo] != null ? base[campo] : '');
  const formas = ['Dinheiro', 'Cartão', 'Crédito', 'Débito', 'Pix', 'Pix CNPJ', 'Cartão Frota', 'Nota a prazo', 'Cheque', 'Outro'];
  fcModal('✎ Editar lançamento', `
    <div style="padding:16px;font-size:0.85rem;color:#cdd6e0">
      <p style="color:#888;font-size:0.75rem;margin-bottom:10px">${fcEsc(base.rotulo || refTipo)} — o valor original não é apagado: a edição fica registrada por cima (auditável).</p>
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Valor (R$)</label>
      <input id="fcl-valor" type="number" step="0.01" value="${Number(v('valor') || 0).toFixed(2)}" class="fc-inp2" style="width:140px">
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Forma de pagamento</label>
      <select id="fcl-forma" class="fc-inp2" style="width:200px">
        <option value="">(manter: ${fcEsc(v('forma_nome') || '—')})</option>
        ${formas.map(f => `<option value="${f}">${f}</option>`).join('')}
      </select>
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Bandeira</label>
      <input id="fcl-bandeira" value="${fcEsc(v('bandeira'))}" class="fc-inp2" style="width:200px" placeholder="Visa, Master, Elo...">
      <label style="display:block;color:#9aa;font-size:0.75rem;margin-top:8px">Observação</label>
      <input id="fcl-obs" value="${fcEsc(aj.obs || '')}" class="fc-inp2 lg" style="width:100%">
      <div style="display:flex;gap:8px;margin-top:14px">
        ${(window._fcConf[k] || {}).ajuste ? '<button class="fc-btn" onclick="fcLancSalvar(\'' + refTipo + '\',\'' + refId + '\',true)">↩ Desfazer edição</button>' : ''}
        <button class="fc-btn azul" style="flex:1" onclick="fcLancSalvar('${refTipo}','${refId}')">💾 Salvar</button>
      </div>
    </div>`);
}

async function fcLancSalvar(refTipo, refId, desfazer) {
  const k = refTipo + ':' + refId;
  const base = window._fcLancBase[k] || {};
  let ajuste = null;
  if (!desfazer) {
    ajuste = {};
    const valor = parseFloat(document.getElementById('fcl-valor').value);
    const forma = document.getElementById('fcl-forma').value;
    const band = document.getElementById('fcl-bandeira').value.trim();
    const obs = document.getElementById('fcl-obs').value.trim();
    if (!isNaN(valor) && Math.abs(valor - Number(base.valor || 0)) > 0.004) ajuste.valor = valor;
    if (forma) ajuste.forma_nome = forma;
    if (band && band !== String(base.bandeira || '')) ajuste.bandeira = band;
    if (obs) ajuste.obs = obs;
    if (!Object.keys(ajuste).length) ajuste = null;
  }
  const cur = window._fcConf[k] = window._fcConf[k] || {};
  cur.ajuste = ajuste;
  try {
    await sb.from('oct_fc_lancamentos').upsert({
      empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
      ref_tipo: refTipo, ref_id: refId, conferido: !!cur.conferido,
      ajuste, conferido_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id,turno_id,ref_tipo,ref_id' });
  } catch (e) {
    alert('Não salvou: ' + (e.message || e) + '\n\n→ Rode o SQL-FC-LANCAMENTOS.sql no Supabase.');
    return;
  }
  // recarrega os dados (o ajuste entra nas somas) e reabre onde estava
  const node = window._fcNodeAtual;
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };
  fcDetalhe(window._fcTurnoAtual);
  if (node) fcNode(node);
}

// ---------- BALÕES da árvore lateral: detalhamento de cada recebimento/remessa ----------
// dinheiro (15/08): SEM venda detalhada — o balão mostra o DEPOSITADO
// (sangrias do caixa + depósitos do cofre), pedido do Ronan.
// cartao (15/08): Pix aparece JUNTO do cartão + filtro por bandeira.
const FC_DETALHES = {
  dinheiro:       { titulo: '💵 Dinheiro / Sangria', formas: [], caixa: ['sangria'], cofre: true },
  cartao:         { titulo: '💳 Cartão + Pix', formas: ['03', '04', '10', '11', '12', '13', '17', '18', '19'], grupos: ['cartao', 'pix'], filtroBandeira: true },
  frota:          { titulo: '🚛 Cartão Frota', formas: [], grupos: ['frota'] },
  pix:            { titulo: '⚡ Pix', formas: ['17', '18', '19'], grupos: ['pix'] },
  prazo:          { titulo: '📄 Nota a Prazo', formas: ['05', '99', '90'] },
  cheque:         { titulo: '🧾 Cheque', formas: ['02'] },
  ctf:            { titulo: 'CTF', formas: [] },
  carta_frete:    { titulo: '🚚 Carta Frete', formas: [] },
  vale_motorista: { titulo: '👷 Vale Motorista', formas: [] },
  troco_final:    { titulo: 'Troco Final', formas: [] },
  vale_haver:     { titulo: 'Vale Haver', formas: [] },
  despesa:        { titulo: 'Despesas', caixa: ['desp'] },
  deposito:       { titulo: '🏦 Depósito em Conta', caixa: ['depos'] },
  suprimento:     { titulo: 'Suprimentos', caixa: ['suprim'] },
  haver:          { titulo: 'Haver', formas: [] },
  cheque_troco:   { titulo: 'Cheque Troco', formas: [] },
  titulos:        { titulo: 'Títulos Recebidos', formas: [] },
  receita:        { titulo: 'Receitas', caixa: ['receita'] },
  diferenca:      { titulo: 'Diferença de Caixa', especial: 'diferenca' },
  fila:           { titulo: '⏳ Fila de transmissão (PDV)', especial: 'fila' },
  cancelados:     { titulo: '🗑 Cancelamentos de Pista', especial: 'cancelados' },
};

async function fcNodeDetalhe(tipo) {
  const cfg = FC_DETALHES[tipo];
  const turnoId = window._fcTurnoAtual;
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  if (!cfg || !t) return;
  fcModal(cfg.titulo, '<p style="padding:20px;color:#888">Buscando...</p>');

  // fila de transmissão: lista do cache (já veio no fcCarregarDados)
  if (cfg.especial === 'fila') {
    const d0 = (cache.porTurno || {})[turnoId] || {};
    const its = d0.fila_itens || [];
    const linhas = its.map(f => {
      const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
      return `<tr><td class="fc-td">${fcEsc(f.descricao) || '—'}</td>
        <td class="fc-td">${f.bico ?? '—'}</td>
        <td class="fc-td fc-r">${Number(f.litros || 0) ? fcNum(f.litros, 2) + ' L' : '—'}</td>
        <td class="fc-td">${fcEsc(f.forma_nome || f.forma) || '—'}${f.bandeira ? ' ' + fcEsc(f.bandeira) : ''}</td>
        <td class="fc-td fc-r">${fcMoney(f.valor)}</td>
        <td class="fc-td fc-r">${(Number(f.desconto || 0) || Number(f.acrescimo || 0)) ? fcMoney(vf) : '—'}</td></tr>`;
    });
    fcModal(cfg.titulo, its.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Abastecimentos baixados no PDV aguardando NFC-e. Já estão SOMADOS nos totais do caixa; desconto/acréscimo é lançado na aba NFC-e do retaguarda.</p>
         <table class="fc-grid"><thead><tr><th>Combustível/Produto</th><th>Bico</th><th>Litros</th><th>Forma</th><th>Valor</th><th>Valor c/ ajuste</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(d0.fila_total)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum abastecimento na fila deste caixa.</p>');
    return;
  }

  // cancelamentos de pista: abastecimentos cancelados na janela do turno
  if (cfg.especial === 'cancelados') {
    const ini0 = t.aberto_em, fim0 = t.fechado_em || new Date().toISOString();
    let cs = [];
    try {
      const r = await sb.from('oct_abastecimentos_cancelados').select('*')
        .eq('empresa_id', window._fcEmpresaId)
        .gte('ocorrido_em', ini0).lte('ocorrido_em', fim0).order('ocorrido_em');
      cs = r.data || [];
    } catch (e) { /* tabela pode não existir ainda */ }
    const linhas = cs.map(c => `<tr>
      <td class="fc-td">${_fcHora(c.ocorrido_em)}</td>
      <td class="fc-td">${c.bico ?? '—'}</td>
      <td class="fc-td">${fcEsc(c.combustivel) || '—'}</td>
      <td class="fc-td fc-r">${fcNum(c.litros, 3)} L</td>
      <td class="fc-td fc-r">${fcMoney(c.valor)}</td>
      <td class="fc-td">${fcEsc(c.vendedor) || '—'}</td>
      <td class="fc-td">${c.motivo ? fcEsc(c.motivo) + (c.operador ? ` <span style="color:#888">(${fcEsc(c.operador)})</span>` : '')
        : '<b style="color:#f87171">⚠ SEM MOTIVO (fora do PDV)</b>'}</td></tr>`);
    const totC = cs.reduce((s, c) => s + Number(c.valor || 0), 0);
    fcModal(cfg.titulo, cs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Combustível que SAIU DA BOMBA e teve o registro cancelado. Sem motivo = cancelado por fora do fluxo oficial do PDV.</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Bico</th><th>Combustível</th><th>Litros</th><th>Valor</th><th>Frentista</th><th>Motivo</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(totC)}</b></td><td class="fc-td" colspan="2"></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum cancelamento de pista neste caixa. ✓</p>');
    return;
  }

  // diferença de caixa (15/08): usa a CONFERÊNCIA DE GAVETA (esperado × contado)
  // e permite LANÇAR A FALTA/SOBRA PARA O RESPONSÁVEL (vira vale/haver da pessoa).
  if (cfg.especial === 'diferenca') {
    const d = (cache.porTurno || {})[turnoId] || {};
    const dif = d.diferenca_caixa;
    fcModal(cfg.titulo, `
      <div style="padding:16px;font-size:0.9rem;color:#cdd6e0">
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Esperado na gaveta (sistema)</span><b>${fcMoney(d.dinheiro_esperado)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Contado pelo operador</span><b>${d.dinheiro_contado == null ? '—' : fcMoney(d.dinheiro_contado)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #2a2d3e;margin-top:6px">
          <span>${dif == null ? 'Turno em aberto' : dif < -0.009 ? '🔴 FALTA de caixa' : dif > 0.009 ? '🟢 SOBRA de caixa' : '✓ Caixa confere'}</span>
          <b style="color:${dif == null ? '#667' : dif < -0.009 ? '#f87171' : dif > 0.009 ? '#4ade80' : '#cdd6e0'}">${dif == null ? '' : fcMoney(Math.abs(dif))}</b>
        </div>
        ${dif != null && Math.abs(dif) > 0.009 ? `
        <button class="fc-btn2" style="margin-top:12px;border-color:#7a5a20;color:#f0b45c" onclick="fcDifResponsavel(${dif})">
          👷 Lançar ${dif < 0 ? 'a FALTA' : 'a SOBRA'} para o responsável (vira vale/haver da pessoa)
        </button>
        <p style="color:#667;font-size:0.72rem;margin-top:6px">Falta → vale (a pessoa deve ao posto). Sobra → haver (o posto deve à pessoa). Aparece em Vales/Haver e desconta na conta corrente.</p>` : ''}
      </div>`);
    return;
  }

  // TROCO INICIAL (fundo) e TROCO FINAL — mostram e EDITAM direto no turno
  // (pedido 15/08: não apareciam nem editavam)
  if (tipo === 'suprimento' || tipo === 'troco_final') {
    const campo = tipo === 'suprimento' ? 'valor_abertura' : 'valor_fechamento';
    const rot = tipo === 'suprimento' ? 'Troco inicial (fundo de abertura da gaveta)' : 'Troco final (dinheiro contado no fechamento)';
    let ms = [];
    if (tipo === 'suprimento') {
      try {
        const r = await sb.from('oct_pdv_caixa').select('id,tipo,valor,descricao,criado_em')
          .eq('turno_id', turnoId).order('criado_em');
        ms = (r.data || []).filter(m => String(m.tipo || '').toLowerCase().includes('suprim'));
      } catch (e) {}
    }
    const linhas = ms.map(m => {
      window._fcLancBase['caixa:' + m.id] = { rotulo: 'Suprimento', valor: m.valor, forma_nome: 'Dinheiro' };
      return _fcRow('caixa', m.id, `<td class="fc-td">${_fcHora(m.criado_em)}</td>
        <td class="fc-td">${fcEsc(m.descricao) || '—'}</td>
        <td class="fc-td fc-r">${fcMoney(m.valor)}</td>`);
    });
    fcModal(cfg.titulo, `
      <div style="padding:14px;font-size:0.85rem;color:#cdd6e0">
        <label style="color:#9aa;font-size:0.75rem;display:block;margin-bottom:4px">${rot}</label>
        <input id="fc-troco-inp" type="number" step="0.01" value="${Number(t[campo] || 0).toFixed(2)}" class="fc-inp2" style="width:140px">
        <button class="fc-btn azul" onclick="fcTrocoSalvar('${campo}')">💾 Salvar</button>
        <p style="color:#667;font-size:0.72rem;margin-top:6px">Editar aqui corrige o turno — a conferência de gaveta (esperado × contado) recalcula na hora.</p>
        ${tipo === 'suprimento' ? (linhas.length
          ? `<div style="color:#f97316;font-weight:700;font-size:0.8rem;margin:12px 0 4px">Suprimentos avulsos do caixa</div>`
            + _fcToolbar()
            + `<table class="fc-grid"><thead><tr><th></th><th>Hora</th><th>Descrição</th><th>Valor</th><th></th></tr></thead><tbody>${linhas.join('')}</tbody></table>`
          : '<p style="color:#777;margin-top:12px">Nenhum suprimento avulso lançado neste caixa (use ➕ Incluir no balão Despesas/Depósito se precisar lançar).</p>') : ''}
      </div>`);
    return;
  }

  // consultas do turno (vendas por forma, movimentos de caixa, maquininha/cofre no período)
  // Régua de fuso (15/08): consulta larga (±6h, o +00:00 dos receb é falso) e
  // corte fino no cliente pela época local (_fcTsLocal) contra o turno em UTC.
  const eid = window._fcEmpresaId;
  const iniE = _fcTsUtc(t.aberto_em), fimE = t.fechado_em ? _fcTsUtc(t.fechado_em) : Date.now();
  const ini = new Date(iniE - 6 * 3600e3).toISOString(), fim = new Date(fimE + 6 * 3600e3).toISOString();
  const pedidos = [
    // vendas: busca também quando o nó é por GRUPOS (ex.: 🚛 frota, que não
    // tem código próprio — vive de nome/reclassificação). Era só cfg.formas
    // e o cupom reclassificado nunca aparecia no balão (18/08).
    ((cfg.formas && cfg.formas.length) || (cfg.grupos && cfg.grupos.length))
      ? sb.from('oct_pdv_vendas').select('id,numero,data_venda,vendedor,operador,cliente_nome,valor_total,pagamentos,status').eq('turno_id', turnoId).order('data_venda')
      : Promise.resolve({ data: [] }),
    (cfg.caixa && cfg.caixa.length)
      ? sb.from('oct_pdv_caixa').select('id,tipo,forma,valor,descricao,operador,criado_em').eq('turno_id', turnoId).order('criado_em')
      : Promise.resolve({ data: [] }),
    (cfg.maq || cfg.cofre)
      ? sb.from('oct_recebimentos').select('id,recebido_em,forma,bandeira,valor,origem,parcelas').eq('empresa_id', eid)
          .gte('recebido_em', ini).lte('recebido_em', fim).order('recebido_em')
      : Promise.resolve({ data: [] }),
  ];
  const [rV, rC, rR] = await Promise.all(pedidos);
  // aplica o overlay do gerente (ajuste/excluído) também nas consultas frescas
  const _apl = (arr, tipoRef) => (arr || []).filter(x => {
    const a = ((window._fcConf || {})[tipoRef + ':' + x.id] || {}).ajuste;
    if (a) {
      if (a.excluido) return false;
      if (a.valor != null) x.valor = a.valor;
      if (a.forma_nome) x.forma = a.forma_nome;
      if (a.bandeira) x.bandeira = a.bandeira;
      if (a.descricao) x.descricao = a.descricao;
    }
    return true;
  });
  rC.data = _apl(rC.data, 'caixa');
  rR.data = _apl(rR.data, 'receb')
    .filter(r => { const ts = _fcTsLocal(r.recebido_em); return ts >= iniE && ts <= fimE; });

  const secoes = [];
  let listaN = 0, listaTot = 0;   // rodapé: nº de títulos + total do balão
  const tab = (cab, linhas, rodape) => `<table class="fc-grid"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.join('')}${rodape || ''}</tbody></table>`;
  const stit = txt => `<div style="padding:10px 4px 4px;color:#f97316;font-weight:700;font-size:0.82rem">${txt}</div>`;

  // filtro FORMA+BANDEIRA (cartão): "Crédito Mastercard", "Débito Elo", "Pix"...
  const band = (cfg.filtroBandeira && window._fcNodeBand) || '';
  const fBand = (x) => !band || _fcRotForma(x.forma_nome, x.forma, x.bandeira) === band;

  // 1) CUPONS pagos na(s) forma(s) — respeitando RECLASSIFICAÇÃO pelo ✎:
  // venda ajustada p/ outro grupo (ex.: frota) some daqui e aparece lá.
  const gruposNode0 = cfg.grupos || [tipo];
  if ((cfg.formas && cfg.formas.length) || (cfg.grupos && cfg.grupos.length)) {
    const vs = (rV.data || []).filter(v => String(v.status || '').toLowerCase() !== 'cancelada');
    const linhas = []; let total = 0;
    vs.forEach(v => (v.pagamentos || []).forEach(p => {
      const ajV = ((window._fcConf || {})['venda:' + v.id] || {}).ajuste;
      const gAj = (ajV && ajV.forma_nome) ? _fcGrupoNome(ajV.forma_nome, p.forma)
        : (p.nome ? _fcGrupoNome(p.nome, p.forma) : null);
      const pertence = gAj
        ? gruposNode0.includes(gAj)
        : (cfg.formas || []).includes(String(p.forma || '').padStart(2, '0'));
      if (!pertence) return;
      total += Number(p.valor || 0);
      window._fcLancBase['venda:' + v.id] = { rotulo: 'Cupom ' + (v.numero ?? ''), valor: p.valor, forma_nome: (ajV && ajV.forma_nome) || _fcFormaNome(p.forma) };
      linhas.push(_fcRow('venda', v.id, `<td class="fc-td">${v.numero ?? ''}</td>
        <td class="fc-td">${_fcHora(v.data_venda)}</td>
        <td class="fc-td">${fcEsc(v.cliente_nome || v.vendedor || v.operador) || '—'}</td>
        <td class="fc-td fc-r">${fcMoney(p.valor)}</td>`));
    }));
    listaN += linhas.length; listaTot += total;
    secoes.push(stit(`Cupons do caixa (${linhas.length})`));
    secoes.push(linhas.length
      ? tab(['', 'Cupom', 'Hora', tipo === 'prazo' ? 'Cliente' : 'Vendedor/Cliente', 'Valor', ''], linhas,
            `<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum cupom nesta forma neste caixa.</p>');

    // 1b) itens da FILA DE TRANSMISSÃO baixados nesta(s) forma(s) — eles somam
    // na coluna do fechamento, então o balão TEM que mostrá-los também
    const d0 = (cache.porTurno || {})[turnoId] || {};
    // casa pelo GRUPO (via forma_nome), não pelo código — a fila grava forma=99.
    // cfg.grupos permite unir grupos (cartão+pix no mesmo balão, 15/08).
    const grupos = cfg.grupos || [tipo];
    const fsFila = (d0.fila_itens || []).filter(f => grupos.includes(_fcGrupoNome(f.forma_nome, f.forma))).filter(fBand);
    if (fsFila.length) {
      let totF = 0;
      const linF = fsFila.map(f => {
        const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
        totF += vf;
        window._fcLancBase['fila:' + f.id] = { rotulo: fcEsc(f.descricao) || 'Abastecimento', valor: f.valor, forma_nome: f.forma_nome, bandeira: f.bandeira };
        return _fcRow('fila', f.id, `<td class="fc-td">${fcEsc(f.descricao) || '—'}</td>
          <td class="fc-td">${f.bico ?? '—'}</td>
          <td class="fc-td fc-r">${Number(f.litros || 0) ? fcNum(f.litros, 2) + ' L' : '—'}</td>
          <td class="fc-td">${fcEsc(_fcRotForma(f.forma_nome, f.forma, f.bandeira)) || '—'}</td>
          <td class="fc-td fc-r">${fcMoney(vf)}</td>`);
      });
      listaN += fsFila.length; listaTot += totF;
      secoes.push(stit(`⏳ Na fila de transmissão (${fsFila.length}) — aguardando NFC-e`));
      secoes.push(tab(['', 'Combustível/Produto', 'Bico', 'Litros', 'Forma', 'Valor', ''], linF,
        `<tr><td class="fc-td" colspan="5"><b>Total na fila</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(totF)}</b></td></tr>`));
    }
  }

  // 2) MOVIMENTOS DE CAIXA (sangria/suprimento/despesa/depósito/receita)
  if (cfg.caixa && cfg.caixa.length) {
    const ms = (rC.data || []).filter(m => cfg.caixa.some(p => String(m.tipo || '').toLowerCase().includes(p)));
    const linhas = ms.map(m => {
      window._fcLancBase['caixa:' + m.id] = { rotulo: fcEsc(m.tipo || 'Movimento'), valor: m.valor, forma_nome: m.forma };
      return _fcRow('caixa', m.id, `<td class="fc-td">${_fcHora(m.criado_em)}</td>
        <td class="fc-td">${fcEsc(m.descricao) || '—'}</td><td class="fc-td">${fcEsc(m.forma) || '—'}</td>
        <td class="fc-td fc-r">${fcMoney(m.valor)}</td>`);
    });
    const total = ms.reduce((s, m) => s + Number(m.valor || 0), 0);
    listaN += ms.length; listaTot += total;
    secoes.push(stit(`${tipo === 'dinheiro' ? 'Sangrias (valores retirados/depositados)' : cfg.titulo} — ${ms.length} lançamento(s)`));
    secoes.push(ms.length
      ? tab(['', 'Hora', 'Descrição', 'Forma', 'Valor', ''], linhas,
            `<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum lançamento neste caixa.</p>');
  }

  // (18/08 — pedido Ronan) a lista de transações da MAQUININHA saiu deste
  // balão: o operador confere a FILA; a prova da maquininha vive nos painéis
  // "Conciliação bancária" e "Maquininha do turno" do fechamento. Mostrar as
  // duas listas juntas confundia (parecia dinheiro em dobro).

  // 4) DEPÓSITOS DO COFRE / SANGRIA AUTOMÁTICA (dinheiro) — o VALOR DEPOSITADO
  if (cfg.cofre) {
    const rs = (rR.data || []).filter(r => String(r.origem || '').toLowerCase().includes('cofre') ||
      String(r.origem || '').toLowerCase().includes('sangria') ||
      String(r.forma || '').toLowerCase().includes('dinheiro'));
    const linhas = rs.map(r => {
      window._fcLancBase['receb:' + r.id] = { rotulo: 'Depósito ' + (r.origem || 'cofre'), valor: r.valor, forma_nome: 'Dinheiro' };
      return _fcRow('receb', r.id, `<td class="fc-td">${_fcHora(r.recebido_em)}</td>
        <td class="fc-td">${fcEsc(r.origem) || 'cofre'}</td><td class="fc-td fc-r">${fcMoney(r.valor)}</td>`);
    });
    const total = rs.reduce((s, r) => s + Number(r.valor || 0), 0);
    listaN += rs.length; listaTot += total;
    secoes.push(stit(`Depósitos (cofre/sangria) — ${rs.length}`));
    secoes.push(rs.length
      ? tab(['', 'Hora', 'Origem', 'Valor', ''], linhas,
            `<tr><td class="fc-td" colspan="3"><b>Total depositado</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum depósito no período do turno.</p>');
  }

  // LANÇAMENTOS MANUAIS desta seção (botão ➕ Incluir)
  {
    const gruposNode = cfg.grupos || [tipo];
    const mans = (((cache.porTurno || {})[turnoId] || {}).manuais || [])
      .filter(m => m.secao === tipo || gruposNode.includes(m.secao) ||
                   gruposNode.includes(typeof _fcGrupoNome === 'function' ? _fcGrupoNome(m.forma_nome, '') : ''));
    if (mans.length) {
      let totM = 0;
      const linM = mans.map(m => {
        totM += Number(m.valor || 0);
        window._fcLancBase['manual:' + m.id] = { rotulo: 'Manual — ' + (m.descricao || m.forma_nome || ''), valor: m.valor, forma_nome: m.forma_nome, bandeira: m.bandeira, secao: m.secao };
        return _fcRow('manual', m.id, `<td class="fc-td">✍ manual</td>
          <td class="fc-td">${fcEsc(m.descricao) || '—'}</td>
          <td class="fc-td">${fcEsc(_fcRotForma(m.forma_nome, '', m.bandeira)) || '—'}</td>
          <td class="fc-td fc-r">${fcMoney(m.valor)}</td>`);
      });
      listaN += mans.length; listaTot += totM;
      secoes.push(stit(`✍ Lançamentos manuais (${mans.length})`));
      secoes.push(tab(['', 'Origem', 'Descrição', 'Forma', 'Valor', ''], linM,
        `<tr><td class="fc-td" colspan="4"><b>Total manual</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(totM)}</b></td></tr>`));
    }
  }

  // DINHEIRO: resumo do que o sistema registrou em espécie + de onde vêm os depósitos
  if (tipo === 'dinheiro') {
    const d0d = (cache.porTurno || {})[turnoId] || {};
    secoes.unshift(`<div style="padding:10px 12px;font-size:0.82rem;color:#cdd6e0;border-bottom:1px solid #2a2d3e">
      💵 Dinheiro recebido na pista (sistema): <b style="color:#7ee2a0">${fcMoney((d0d.rec || {}).dinheiro)}</b>
      <span style="color:#667;font-size:0.72rem;margin-left:8px">— o detalhe venda a venda fica em 📑 Cupons Fiscais; aqui entram os DEPÓSITOS (sangria/cofre). Depósito automático Brink's aparece quando a integração do cofre estiver ligada.</span>
    </div>`);
  }

  // filtro FORMA+BANDEIRA (cartão) — nomes completos: "Crédito Mastercard"...
  if (cfg.filtroBandeira) {
    const d0b = (cache.porTurno || {})[turnoId] || {};
    const gruposNode = cfg.grupos || [tipo];
    const combos = [...new Set(
      (d0b.fila_itens || []).filter(f => gruposNode.includes(_fcGrupoNome(f.forma_nome, f.forma)))
        .map(f => _fcRotForma(f.forma_nome, f.forma, f.bandeira))
        .concat(((rR && rR.data) || []).map(r => _fcRotForma(null, r.forma, r.bandeira)))
        .filter(Boolean)
    )].sort();
    if (combos.length) {
      secoes.unshift(`<div class="fc-filtros"><label>Forma/Bandeira:</label>
        <select class="fc-inp2" style="width:200px" onchange="window._fcNodeBand=this.value;fcNodeDetalhe('${tipo}')">
          <option value="">Todas</option>
          ${combos.map(b => `<option value="${fcEsc(b)}" ${band === b ? 'selected' : ''}>${fcEsc(b)}</option>`).join('')}
        </select>
        <span style="color:#667">☑ marca · ESPAÇO confere (muda de cor) · ✎ altera</span></div>`);
    }
  }

  if (!secoes.length)
    secoes.push('<p style="padding:24px;color:#777">Sem lançamentos deste tipo neste caixa (o octano ainda não movimenta esta categoria).</p>');
  // barra de ações no topo + rodapé com contador/total (modelo TecnoX)
  secoes.unshift(_fcToolbar());
  secoes.push(_fcRodape(listaN, listaTot));
  fcModal(cfg.titulo, secoes.join(''));
}

// nome amigável do cod_sefaz (p/ o modal de edição)
function _fcFormaNome(cod) {
  const m = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Crédito', '04': 'Débito', '05': 'Nota a prazo', '17': 'Pix', '18': 'Pix', '19': 'Pix' };
  return m[String(cod || '').padStart(2, '0')] || String(cod || '');
}

// salva troco inicial/final editado direto no turno e recalcula tudo
async function fcTrocoSalvar(campo) {
  const val = parseFloat(document.getElementById('fc-troco-inp').value);
  if (isNaN(val) || val < 0) { alert('Valor inválido.'); return; }
  const { error } = await sb.from('oct_pdv_turnos').update({ [campo]: val }).eq('id', window._fcTurnoAtual);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };
  fcDetalhe(window._fcTurnoAtual);
}

// lança a falta (vale: pessoa deve) ou sobra (haver) para o responsável escolhido
async function fcDifResponsavel(dif) {
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === window._fcTurnoAtual) || {};
  let pessoas = [];
  try {
    const r = await sb.from('oct_pessoas').select('id,nome')
      .eq('empresa_id', window._fcEmpresaId).eq('ativo', true)
      .contains('classificacoes', ['funcionario']).order('nome');
    pessoas = r.data || [];
  } catch (e) {}
  if (!pessoas.length) { alert('Nenhum funcionário ativo no cadastro de Pessoas.'); return; }
  fcModal('👷 Lançar diferença para o responsável', `
    <div style="padding:16px;font-size:0.85rem;color:#cdd6e0">
      <p style="color:#888;font-size:0.78rem;margin-bottom:10px">
        ${dif < 0 ? 'FALTA' : 'SOBRA'} de <b style="color:${dif < 0 ? '#f87171' : '#4ade80'}">${fcMoney(Math.abs(dif))}</b>
        do turno ${t.numero ?? ''} (${fcEsc(t.operador) || '—'}). ${dif < 0 ? 'Vira VALE: a pessoa fica devendo ao posto.' : 'Vira HAVER: o posto fica devendo à pessoa.'}
      </p>
      <label style="display:block;color:#9aa;font-size:0.75rem">Responsável</label>
      <select id="fc-dif-pessoa" class="fc-inp2" style="width:100%;margin:4px 0 12px">
        ${pessoas.map(p => `<option value="${p.id}|${fcEsc(p.nome)}" ${String(p.nome).toLowerCase().includes(String(t.operador || '').toLowerCase()) && t.operador ? 'selected' : ''}>${fcEsc(p.nome)}</option>`).join('')}
      </select>
      <button class="fc-btn azul" style="width:100%" onclick="fcDifLancar(${dif})">✔ Confirmar lançamento</button>
    </div>`);
}

async function fcDifLancar(dif) {
  const sel = document.getElementById('fc-dif-pessoa').value || '';
  const [pid, pnome] = [sel.split('|')[0], sel.split('|').slice(1).join('|')];
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === window._fcTurnoAtual) || {};
  const { error } = await sb.from('oct_vales').insert({
    empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
    pessoa_id: pid || null, pessoa_nome: pnome,
    tipo: dif < 0 ? 'vale_funcionario' : 'troco_pendente',
    valor: dif,   // negativo = pessoa deve (falta); positivo = posto deve (sobra)
    descricao: `${dif < 0 ? 'Falta' : 'Sobra'} de caixa — turno ${t.numero ?? ''} (${_fcData(t.aberto_em)})`,
    operador: 'retaguarda',
  });
  if (error) { alert('Erro ao lançar: ' + error.message); return; }
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };
  fcDetalhe(window._fcTurnoAtual);
  alert(`${dif < 0 ? 'Falta' : 'Sobra'} de ${fcMoney(Math.abs(dif))} lançada para ${pnome}.`);
}
// ---------- Nós de MOVIMENTAÇÃO (vales, recebimentos externos, ledger) ----------
const _VALE_ROT = {
  credito_adiantado: 'Crédito adiantado', troco_pendente: 'Troco pendente',
  vale_funcionario: 'Vale funcionário', consumo: 'Consumo', liquidacao: 'Liquidação',
};
function fcNodeMov(tipo) {
  const turnoId = window._fcTurnoAtual;
  const cache = window._fcCache || {};
  const d = (cache.porTurno || {})[turnoId] || {};

  if (tipo === 'titulos') {
    const ts = d.titulos_lst || [];
    const linhas = ts.map(x => `<tr><td class="fc-td">${_fcData(x.data_recebimento)}</td>
      <td class="fc-td">${fcEsc(x.cliente_nome) || '—'}</td>
      <td class="fc-td">${fcEsc(x.forma) || '—'}</td>
      <td class="fc-td fc-r">${(Number(x.juros || 0) || Number(x.desconto || 0)) ? '+' + fcMoney(x.juros) + ' / -' + fcMoney(x.desconto) : '—'}</td>
      <td class="fc-td fc-r">${fcMoney(x.valor)}</td></tr>`);
    const tot = ts.reduce((s, x) => s + Number(x.valor || 0), 0);
    return fcModal('💵 Títulos Recebidos (baixa de a-prazo)', ts.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Clientes que pagaram nota a prazo antiga neste turno. Entra no lado Vendas/Saídas do fechamento.</p>
         <table class="fc-grid"><thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Juros/Desc.</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum título recebido neste caixa.</p>');
  }

  if (tipo === 'vale_haver' || tipo === 'vale_motorista' || tipo === 'vales') {
    let vs = d.vales_lst || [];
    if (tipo === 'vale_haver') vs = vs.filter(v => Number(v.valor || 0) >= 0);
    else if (tipo === 'vale_motorista') vs = vs.filter(v => Number(v.valor || 0) < 0);
    const linhas = vs.map(v => {
      const val = Number(v.valor || 0);
      return `<tr><td class="fc-td">${_fcHora(v.criado_em)}</td>
        <td class="fc-td">${fcEsc(v.pessoa_nome) || '—'}</td>
        <td class="fc-td">${_VALE_ROT[v.tipo] || fcEsc(v.tipo) || '—'}</td>
        <td class="fc-td">${fcEsc(v.descricao) || ''}</td>
        <td class="fc-td">${fcEsc(v.operador) || '—'}</td>
        <td class="fc-td fc-r" style="color:${val >= 0 ? '#7ee2a0' : '#f0b45c'}">${fcMoney(val)}</td></tr>`;
    });
    const tot = vs.reduce((s, v) => s + Number(v.valor || 0), 0);
    const tit = tipo === 'vale_haver' ? '🤝 Haver (o posto deve)' : tipo === 'vale_motorista' ? '👷 Vale / Consumo (a pessoa deve)' : '📒 Vales do caixa';
    return fcModal(tit, vs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Conta corrente das pessoas neste turno. Positivo = haver do cliente (posto deve); negativo = vale a descontar (pessoa deve).</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Pessoa</th><th>Tipo</th><th>Obs.</th><th>Operador</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="5"><b>Saldo do turno</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum vale/haver neste caixa.</p>');
  }

  if (tipo === 'receb_ext') {
    const rs = d.receb_ext || [];
    const linhas = rs.map(r => `<tr><td class="fc-td">${_fcHora(r.recebido_em)}</td>
      <td class="fc-td">${fcEsc(r.origem) || '—'}</td>
      <td class="fc-td">${fcEsc(r.forma) || '—'}${r.bandeira ? ' ' + fcEsc(r.bandeira) : ''}</td>
      <td class="fc-td">${r.parcelas ? fcEsc(r.parcelas) + 'x' : ''}</td>
      <td class="fc-td">${r.conciliado ? '✓' : '—'}</td>
      <td class="fc-td fc-r">${fcMoney(r.valor)}</td></tr>`);
    const tot = rs.reduce((s, r) => s + Number(r.valor || 0), 0);
    return fcModal('💳 Recebimentos (maquininha / cofre / Pix)', rs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Tudo que entrou pela maquininha, cofre e Pix no período do turno (EDI/cofre). Já casa com os cupons/fila — aqui é a conferência bruta, casado ou não.</p>
         <div style="display:flex;gap:14px;padding:4px 10px;color:#9fb0c4;font-size:0.78rem">
           <span>Cartão: <b>${fcMoney(d.receb_ext_cartao)}</b></span>
           <span>Pix: <b>${fcMoney(d.receb_ext_pix)}</b></span>
           <span>Cofre/dinheiro: <b>${fcMoney(d.receb_ext_cofre)}</b></span></div>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Origem</th><th>Forma</th><th>Parc.</th><th>Casado</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="5"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum recebimento de maquininha/cofre no período.</p>');
  }

  // MOVIMENTAÇÃO COMPLETA — ledger único de tudo do turno, em ordem de horário
  if (tipo === 'movimentacao') {
    const ev = [];
    (d.sangrias_lst || []).forEach(s => ev.push([s.recebido_em, '💰 Sangria', 'retirada de dinheiro', -Number(s.valor || 0)]));
    (d.receb_ext || []).forEach(r => ev.push([r.recebido_em, '💳 Recebimento', (r.origem || '') + ' ' + (r.forma || ''), Number(r.valor || 0)]));
    (d.vales_lst || []).forEach(v => ev.push([v.criado_em, (Number(v.valor || 0) >= 0 ? '🤝 Haver' : '👷 Vale'), (v.pessoa_nome || '') + ' · ' + (_VALE_ROT[v.tipo] || v.tipo || ''), Number(v.valor || 0)]));
    (d.fila_itens || []).forEach(f => ev.push([f.atualizado_em, '⏳ Fila NFC-e', (f.descricao || '') + ' (bico ' + (f.bico ?? '?') + ')', Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)]));
    ev.sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
    const linhas = ev.map(e => `<tr><td class="fc-td">${_fcHora(e[0])}</td>
      <td class="fc-td">${e[1]}</td><td class="fc-td">${fcEsc(e[2])}</td>
      <td class="fc-td fc-r" style="color:${e[3] >= 0 ? '#7ee2a0' : '#f0b45c'}">${fcMoney(e[3])}</td></tr>`);
    return fcModal('🧾 Movimentação completa do turno', ev.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Todo movimento do PDV neste turno, em ordem de horário: sangrias, recebimentos de maquininha/cofre, vales/haver e a fila de NFC-e. Vendas fiscais estão em "Cupons Fiscais".</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Movimento</th><th>Detalhe</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}</tbody></table>`
      : '<p style="padding:24px;color:#777">Sem movimentação registrada além dos cupons neste turno.</p>');
  }
}

// CUPONS (15/08 — pedido Ronan): TODAS as vendas do turno — fila de transmissão
// + cupons transmitidos — com filtro de forma, ordenação (horário/cliente/valor/
// sequência), busca, coluna de desconto, conferência (☑/espaço) e clique para
// ABRIR a venda e ver os dados completos.
function fcModalCupons(vs) {
  const cache = window._fcCache || {};
  const d0 = (cache.porTurno || {})[window._fcTurnoAtual] || {};
  // unifica: venda transmitida + item da fila num só formato
  const unifica = [];
  vs.forEach(v => unifica.push({
    ref: 'venda', id: v.id, seq: v.numero ?? '', quando: v.data_venda,
    cliente: v.cliente_nome || v.vendedor || v.operador || '—',
    forma: (v.pagamentos || []).map(p => _fcFormaNome(p.forma)).join(' + ') || '—',
    desconto: 0, valor: Number(v.valor_total || 0), origem: '🧾 cupom', obj: v,
  }));
  (d0.fila_itens || []).forEach(f => unifica.push({
    ref: 'fila', id: f.id, seq: '', quando: f.ocorrido_em,
    cliente: f.vendedor || '—',
    forma: (f.forma_nome || f.forma || '—') + (f.bandeira ? ' ' + f.bandeira : ''),
    desconto: Number(f.desconto || 0),
    valor: Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0),
    origem: '⏳ fila', obj: f,
  }));
  window._fcCuponsData = unifica;
  window._fcCuponsFiltro = window._fcCuponsFiltro || { forma: '', ordem: 'hora', busca: '' };
  _fcCuponsRender();
}

function _fcCuponsRender() {
  const dados = window._fcCuponsData || [];
  const f = window._fcCuponsFiltro;
  const formas = [...new Set(dados.map(x => x.forma).filter(x => x && x !== '—'))].sort();
  let lista = dados.filter(x =>
    (!f.forma || x.forma === f.forma) &&
    (!f.busca || String(x.cliente).toLowerCase().includes(f.busca.toLowerCase())));
  const ord = {
    hora: (a, b) => String(a.quando || '').localeCompare(String(b.quando || '')),
    cliente: (a, b) => String(a.cliente).localeCompare(String(b.cliente)),
    valor: (a, b) => b.valor - a.valor,
    seq: (a, b) => (Number(a.seq) || 9e9) - (Number(b.seq) || 9e9),
  };
  lista = lista.slice().sort(ord[f.ordem] || ord.hora);
  const linhas = lista.map(x => {
    const desc = (x.obj && (x.obj.descricao || (x.obj.itens || []).map(i => i.desc).join(', '))) || '';
    window._fcLancBase[x.ref + ':' + x.id] = { rotulo: (x.origem + ' ' + (x.seq || desc)).trim(), valor: x.valor, forma_nome: x.forma };
    return _fcRow(x.ref, x.id, `<td class="fc-td">${x.seq || '—'}</td>
      <td class="fc-td">${_fcHora(x.quando)}</td>
      <td class="fc-td">${fcEsc(x.cliente)}</td>
      <td class="fc-td">${fcEsc(x.forma)}</td>
      <td class="fc-td fc-r">${x.desconto > 0.004 ? '<span style="color:#f0b45c">' + fcMoney(x.desconto) + '</span>' : '—'}</td>
      <td class="fc-td fc-r">${fcMoney(x.valor)}</td>
      <td class="fc-td">${x.origem}</td>`, `fcCupomVer('${x.ref}','${x.id}')`);
  });
  const total = lista.reduce((s, x) => s + x.valor, 0);
  fcModal(`📑 Vendas do caixa (fila + transmitidos) — ${lista.length}`, _fcToolbar() + `
    <div class="fc-filtros">
      <label>Forma:</label>
      <select class="fc-inp2" onchange="window._fcCuponsFiltro.forma=this.value;_fcCuponsRender()">
        <option value="">Todas</option>
        ${formas.map(x => `<option value="${fcEsc(x)}" ${f.forma === x ? 'selected' : ''}>${fcEsc(x)}</option>`).join('')}
      </select>
      <label>Ordenar:</label>
      <select class="fc-inp2" onchange="window._fcCuponsFiltro.ordem=this.value;_fcCuponsRender()">
        <option value="hora" ${f.ordem === 'hora' ? 'selected' : ''}>Horário</option>
        <option value="cliente" ${f.ordem === 'cliente' ? 'selected' : ''}>Cliente</option>
        <option value="valor" ${f.ordem === 'valor' ? 'selected' : ''}>Valor</option>
        <option value="seq" ${f.ordem === 'seq' ? 'selected' : ''}>Sequência</option>
      </select>
      <input class="fc-inp2" placeholder="buscar cliente/vendedor..." value="${fcEsc(f.busca)}"
        oninput="window._fcCuponsFiltro.busca=this.value;clearTimeout(window._fcCupT);window._fcCupT=setTimeout(_fcCuponsRender,300)">
      <span style="color:#667">🔎 abre a venda · ☑ marca · ESPAÇO confere · ✎ altera</span>
    </div>
    <table class="fc-grid"><thead><tr><th></th><th>Seq.</th><th>Hora</th><th>Cliente/Vendedor</th><th>Forma</th><th>Desc.</th><th>Valor</th><th>Origem</th><th></th></tr></thead>
    <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="6"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td><td class="fc-td" colspan="2"></td></tr></tbody></table>`
    + _fcRodape(lista.length, total));
}

// abre UMA venda/abastecimento com os dados completos
function fcCupomVer(ref, id) {
  const x = (window._fcCuponsData || []).find(y => y.ref === ref && String(y.id) === String(id));
  if (!x) return;
  let corpo = '';
  if (ref === 'venda') {
    const v = x.obj;
    const its = (v.itens || []).map(it => `<tr><td class="fc-td">${fcEsc(it.desc || it.cod)}</td>
      <td class="fc-td fc-r">${fcNum(it.qtd, 3)}</td><td class="fc-td fc-r">${fcMoney(it.unit)}</td>
      <td class="fc-td fc-r">${fcMoney(it.total ?? (Number(it.qtd || 0) * Number(it.unit || 0)))}</td></tr>`).join('');
    const pags = (v.pagamentos || []).map(p => `<tr><td class="fc-td">${_fcFormaNome(p.forma)}</td>
      <td class="fc-td fc-r">${fcMoney(p.valor)}</td></tr>`).join('');
    corpo = `
      <p style="padding:6px 10px;color:#888;font-size:0.78rem">Cupom ${v.numero ?? ''} · ${v.data_venda ? new Date(v.data_venda).toLocaleString('pt-BR') : ''} · operador ${fcEsc(v.operador) || '—'}${v.cliente_nome ? ' · cliente ' + fcEsc(v.cliente_nome) : ''}</p>
      <div style="color:#f97316;font-weight:700;font-size:0.8rem;padding:4px 10px">Itens</div>
      <table class="fc-grid"><thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${its}</tbody></table>
      <div style="color:#f97316;font-weight:700;font-size:0.8rem;padding:10px 10px 4px">Pagamentos</div>
      <table class="fc-grid"><thead><tr><th>Forma</th><th>Valor</th></tr></thead><tbody>${pags}
        <tr><td class="fc-td"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(v.valor_total)}</b></td></tr></tbody></table>`;
  } else {
    const fila = x.obj;
    corpo = `
      <div style="padding:14px;font-size:0.85rem;color:#cdd6e0;line-height:2">
        <b style="color:#f0b45c">⏳ Abastecimento na fila de transmissão (sem NFC-e ainda)</b><br>
        Produto: <b>${fcEsc(fila.descricao) || '—'}</b><br>
        Bico: ${fila.bico ?? '—'} · Litros: ${fcNum(fila.litros, 3)} L<br>
        Horário: ${fila.ocorrido_em ? new Date(fila.ocorrido_em).toLocaleString('pt-BR') : '—'}<br>
        Forma: ${fcEsc(fila.forma_nome || fila.forma) || '—'}${fila.bandeira ? ' · ' + fcEsc(fila.bandeira) : ''}<br>
        Valor: <b>${fcMoney(fila.valor)}</b>${Number(fila.desconto || 0) ? ' · desconto ' + fcMoney(fila.desconto) : ''}${Number(fila.acrescimo || 0) ? ' · acréscimo ' + fcMoney(fila.acrescimo) : ''}<br>
        Pagamento confirmado em: ${fila.recebido_em ? new Date(fila.recebido_em).toLocaleString('pt-BR') : '<span style="color:#f87171">não confirmado</span>'}
      </div>`;
  }
  fcModal('🔎 Detalhe da venda', corpo + `
    <div style="padding:10px"><button class="fc-btn" onclick="_fcCuponsRender()">← Voltar para a lista</button></div>`);
}
function fcModalItens(vs) {
  // (18/08 — pedido Ronan) SÓ PRODUTOS DE LOJA: combustível (inclusive cupom
  // frota, que é etanol/gasolina) fica na aba "Combustível Vendido".
  const map = {};
  vs.forEach(v => (v.itens || []).filter(it => it.tipo !== 'abastecimento').forEach(it => {
    const k = it.cod || it.desc || '?';
    if (!map[k]) map[k] = { desc: it.desc || it.cod, qtd: 0, valor: 0 };
    map[k].qtd += Number(it.qtd || 0);
    map[k].valor += Math.round(Number(it.qtd || 0) * Number(it.unit || 0) * 100) / 100;
  }));
  // produtos vendidos pela FILA (baixados na pista, ainda sem NFC-e) também
  // são itens vendidos do turno — sem bico = produto
  const d0 = ((window._fcCache || {}).porTurno || {})[window._fcTurnoAtual] || {};
  (d0.fila_itens || []).forEach(f => {
    if (f.bico !== null && f.bico !== undefined && f.bico !== '') return;
    const k = 'fila:' + (f.descricao || '?');
    if (!map[k]) map[k] = { desc: (f.descricao || '?') + ' ⏳', qtd: 0, valor: 0 };
    map[k].qtd += Number(f.litros || 0);
    map[k].valor += Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
  });
  let linhas = Object.values(map).sort((a, b) => b.valor - a.valor).map(m => `<tr>
    <td class="fc-td">${fcEsc(m.desc)}</td><td class="fc-td fc-r">${fcNum(m.qtd, 3)}</td><td class="fc-td fc-r">${fcMoney(m.valor)}</td><td class="fc-td"></td></tr>`).join('');
  // itens lançados À MÃO (frentista esqueceu de registrar) — editáveis
  (d0.manuais || []).filter(m => m.item_vendido).forEach(m => {
    window._fcLancBase['manual:' + m.id] = { rotulo: 'Item vendido — ' + (m.descricao || ''), valor: m.valor, forma_nome: m.forma_nome, secao: m.secao };
    linhas += _fcRow('manual', m.id, `<td class="fc-td">✍ ${fcEsc(m.descricao) || '—'} <span style="color:#888;font-size:0.72rem">(${fcEsc(m.forma_nome) || ''})</span></td>
      <td class="fc-td fc-r">${fcNum(m.qtd || 1, 3)}</td>
      <td class="fc-td fc-r">${fcMoney(m.valor)}</td>`);
  });
  const total = Object.values(map).reduce((s, m) => s + m.valor, 0)
    + (d0.manuais || []).filter(m => m.item_vendido).reduce((s, m) => s + Number(m.valor || 0), 0);
  fcModal('📋 Itens Vendidos (produtos de loja)', `
    <div class="fc-filtros">
      <button class="fc-btn" style="color:#4ade80" onclick="fcItemVendidoForm()">➕ Lançar item vendido (esquecido)</button>
      <span style="color:#667">combustível fica na aba ⛽ Combustível Vendido</span>
    </div>
    <table class="fc-grid"><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td class="fc-td" colspan="4" style="color:#777">Nenhum produto vendido neste caixa.</td></tr>'}
    <tr><td class="fc-td"><b>Total</b></td><td class="fc-td"></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td><td class="fc-td"></td></tr></tbody></table>`);
}

// ---- LANÇAR ITEM VENDIDO ESQUECIDO (18/08): entra como venda de produto E
// como recebimento da forma escolhida — os dois lados do fechamento crescem
// juntos. Vira lançamento manual auditável (ajuste.item_vendido). ----
async function fcItemVendidoForm() {
  fcModal('➕ Lançar item vendido', '<p style="padding:20px;color:#888">Carregando produtos...</p>');
  let prods = [];
  try {
    const r = await sb.from('oct_produtos').select('id,nome,preco_venda_a')
      .eq('empresa_id', window._fcEmpresaId).eq('ativo', true).order('nome');
    prods = r.data || [];
  } catch (e) {}
  window._fcProdsIV = prods;
  fcModal('➕ Lançar item vendido', `
    <div style="padding:16px;font-size:0.85rem;color:#cdd6e0">
      <p style="color:#888;font-size:0.75rem;margin-bottom:10px">Produto que o frentista vendeu e esqueceu de registrar. Entra como VENDA e como RECEBIMENTO da forma escolhida (auditável como manual).</p>
      <label style="display:block;color:#9aa;font-size:0.75rem">Produto *</label>
      <select id="fciv-prod" class="fc-inp2" style="width:100%" onchange="fcIVPreco()">
        <option value="">— escolha —</option>
        ${prods.map(p => `<option value="${p.id}" data-preco="${p.preco_venda_a || 0}">${fcEsc(p.nome)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:10px;margin-top:8px">
        <div><label style="display:block;color:#9aa;font-size:0.75rem">Qtd</label>
          <input id="fciv-qtd" type="number" step="0.001" value="1" class="fc-inp2" style="width:90px" oninput="fcIVPreco()"></div>
        <div><label style="display:block;color:#9aa;font-size:0.75rem">Valor total (R$) *</label>
          <input id="fciv-valor" type="number" step="0.01" class="fc-inp2" style="width:130px"></div>
        <div><label style="display:block;color:#9aa;font-size:0.75rem">Forma de pagamento</label>
          <select id="fciv-forma" class="fc-inp2" style="width:170px">
            ${['Dinheiro', 'Crédito', 'Débito', 'Pix', 'Cartão Frota', 'Nota a prazo'].map(f => `<option>${f}</option>`).join('')}
          </select></div>
      </div>
      <button class="fc-btn azul" style="width:100%;margin-top:14px" onclick="fcItemVendidoSalvar()">💾 Lançar</button>
      <div id="fciv-msg" style="margin-top:8px;font-size:0.78rem;color:#f87171"></div>
    </div>`);
}

function fcIVPreco() {
  const sel = document.getElementById('fciv-prod');
  const preco = Number((sel.selectedOptions[0] || {}).dataset?.preco || 0);
  const qtd = parseFloat(document.getElementById('fciv-qtd').value) || 0;
  if (preco > 0 && qtd > 0) document.getElementById('fciv-valor').value = (preco * qtd).toFixed(2);
}

async function fcItemVendidoSalvar() {
  const sel = document.getElementById('fciv-prod');
  const nome = (sel.selectedOptions[0] || {}).textContent || '';
  const qtd = parseFloat(document.getElementById('fciv-qtd').value) || 1;
  const valor = parseFloat(document.getElementById('fciv-valor').value);
  const forma = document.getElementById('fciv-forma').value;
  const msg = document.getElementById('fciv-msg');
  if (!sel.value) { msg.textContent = 'Escolha o produto.'; return; }
  if (isNaN(valor) || valor <= 0) { msg.textContent = 'Informe o valor.'; return; }
  const secao = _fcGrupoNome(forma, '');
  const refId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  const { error } = await sb.from('oct_fc_lancamentos').insert({
    empresa_id: window._fcEmpresaId, turno_id: window._fcTurnoAtual,
    ref_tipo: 'manual', ref_id: refId, conferido: false,
    ajuste: { manual: true, item_vendido: true, secao, valor, qtd,
              forma_nome: forma, descricao: nome, produto_id: sel.value },
  });
  if (error) { msg.textContent = 'Erro: ' + error.message; return; }
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };
  fcDetalhe(window._fcTurnoAtual);
  fcNode('itens');
}
function fcModalCombustivel(vs) {
  const map = {};
  vs.forEach(v => (v.itens || []).forEach(it => {
    if (it.tipo !== 'abastecimento') return;
    const k = it.desc || 'Combustível';
    if (!map[k]) map[k] = { desc: k, litros: 0, valor: 0 };
    map[k].litros += Number(it.qtd || 0);
    map[k].valor += Math.round(Number(it.qtd || 0) * Number(it.unit || 0) * 100) / 100;
  }));
  const linhas = Object.values(map).map(m => `<tr><td class="fc-td">${fcEsc(m.desc)}</td>
    <td class="fc-td fc-r">${fcNum(m.litros, 3)} L</td><td class="fc-td fc-r">${fcMoney(m.valor)}</td></tr>`).join('');
  fcModal('Combustível Vendido', `<table class="fc-grid"><thead><tr><th>Combustível</th><th>Litros</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModalVendedor(vs) {
  const map = {};
  vs.forEach(v => { const k = v.vendedor || v.operador || '—'; map[k] = (map[k] || 0) + Number(v.valor_total || 0); });
  const linhas = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, val]) => `<tr>
    <td class="fc-td">${fcEsc(k)}</td><td class="fc-td fc-r">${fcMoney(val)}</td></tr>`).join('');
  fcModal('Demonstrativo por Vendedor', `<table class="fc-grid"><thead><tr><th>Vendedor</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModal(titulo, html) {
  let m = document.getElementById('fc-modal');
  if (!m) { m = document.createElement('div'); m.id = 'fc-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="fc-modal-bg" onclick="document.getElementById('fc-modal').remove()"></div>
    <div class="fc-modal-cx"><div class="fc-modal-tit">${fcEsc(titulo)}<span onclick="document.getElementById('fc-modal').remove()" style="cursor:pointer;float:right">✕</span></div>
    <div class="fc-modal-corpo">${html}</div></div>`;
}
async function fcSalvarObs() {
  const turnoId = window._fcTurnoAtual; const txt = document.getElementById('fc-obs')?.value || '';
  try { await sb.from('oct_pdv_turnos').update({ observacao: txt }).eq('id', turnoId); alert('Observação salva.'); }
  catch (e) { alert('Não foi possível salvar (campo observacao pode não existir ainda).'); }
}

// confirma a conferência de caixa físico e persiste no turno (esperado, diferença,
// quem/quando conferiu). O gerente audita o dinheiro contado × esperado aqui.
async function fcConfirmarCaixa(turnoId) {
  const d = (window._fcCache && window._fcCache.porTurno || {})[turnoId];
  if (!d || d.dinheiro_contado == null) { alert('Turno sem dinheiro contado — feche o turno no PDV primeiro.'); return; }
  const dif = d.diferenca_caixa || 0;
  const resumo = Math.abs(dif) < 0.01 ? 'Caixa confere (sem diferença).'
    : (dif < 0 ? 'FALTA de R$ ' : 'SOBRA de R$ ') + Math.abs(dif).toFixed(2).replace('.', ',');
  if (!confirm('Confirmar a conferência deste caixa?\n\nEsperado: R$ ' + Number(d.dinheiro_esperado || 0).toFixed(2).replace('.', ',')
    + '\nContado: R$ ' + Number(d.dinheiro_contado || 0).toFixed(2).replace('.', ',') + '\n' + resumo)) return;
  try {
    const session = await getSession();
    const { error } = await sb.from('oct_pdv_turnos').update({
      dinheiro_esperado: d.dinheiro_esperado,
      diferenca_caixa: dif,
      conferido_em: new Date().toISOString(),
      conferido_por: (session && session.user && session.user.email) || 'gerente',
    }).eq('id', turnoId);
    if (error) throw error;
    alert('✔ Conferência confirmada. ' + resumo);
  } catch (e) {
    const m = String(e.message || e);
    alert('Erro ao confirmar: ' + m + (/conferido|diferenca_caixa|dinheiro_esperado/.test(m) ? '\n\n→ Rode antes o SQL-CONFERENCIA-CAIXA.sql (colunas novas no turno).' : ''));
  }
}

// ---------- estilo (tema DARK, padrão do octano) ----------
function _fcEstilo() {
  return `<style>
  .fc-janela{background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;margin:16px;color:#dbe2ea;font-size:12px;overflow:hidden}
  .fc-titbar{background:#13151f;color:#f97316;padding:11px 16px;font-weight:600;font-size:15px;border-bottom:1px solid #2a2d3e}
  .fc-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;background:#13151f;border-bottom:1px solid #2a2d3e}
  .fc-btn{background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:5px 10px;font-size:11px;color:#c7d0dc;cursor:pointer}
  .fc-btn:hover:not(:disabled){background:#242c3e;color:#fff}.fc-btn:disabled{color:#5a6472;cursor:default}
  .fc-btn.azul{background:#f97316;color:#fff;border-color:#f97316}
  .fc-btn.azul:hover{background:#ea6a0c}
  .fc-btn.mini{padding:3px 8px;font-size:10px}
  .fc-sep{width:1px;height:18px;background:#2a2d3e;margin:0 4px}
  .fc-count{font-size:11px;color:#f97316;font-weight:600;padding:0 6px}
  .fc-periodo{padding:9px 12px;background:#0f1119;border-bottom:1px solid #2a2d3e;display:flex;align-items:center;gap:8px;color:#9aa}
  .fc-inp{border:1px solid #2a2d3e;border-radius:6px;padding:5px 8px;font-size:11px;background:#0b0d14;color:#e5e7eb}
  .fc-gridwrap{overflow:auto;max-height:64vh;background:#0f1119}
  .fc-grid{width:100%;border-collapse:collapse;font-size:11px;color:#cdd6e0}
  .fc-grid th{background:#1a1d2e;color:#9fb0c4;text-align:left;padding:7px;border-bottom:1px solid #2a2d3e;position:sticky;top:0;white-space:nowrap}
  .fc-td{padding:6px 7px;border-bottom:1px solid #1c2130;white-space:nowrap}
  .fc-r{text-align:right;font-variant-numeric:tabular-nums}
  .fc-grid tbody tr:nth-child(even){background:#141824}
  .fc-cab{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 14px;background:#13151f;border-bottom:1px solid #2a2d3e}
  .fc-cab label{color:#8aa;font-weight:600;margin-right:5px;font-size:11px}
  .fc-inp2{border:1px solid #2a2d3e;border-radius:6px;padding:5px 8px;font-size:11px;background:#0b0d14;color:#e5e7eb;width:120px}
  .fc-inp2.mini{width:66px}.fc-inp2.data{width:92px}.fc-inp2.lg{width:240px}
  .fc-corpo{display:grid;grid-template-columns:220px 1fr 1fr 320px;gap:1px;background:#2a2d3e}
  /* TELA DO POSTO (15/08): sem rolagem interna na árvore (rolava dentro de
     rolagem = 3 barras) e, em tela menor, o painel desce pra baixo das colunas
     ocupando a largura toda — sem ele de "régua" na vertical, as colunas param
     de esticar e some o vão preto no fim da árvore. */
  @media (max-width:1500px){
    .fc-corpo{grid-template-columns:200px 1fr 1fr}
    .fc-painel{grid-column:1/-1;column-width:320px;column-gap:14px}
    .fc-painel>*{break-inside:avoid;margin-bottom:8px}
  }
  .fc-tree{background:#0f1119;padding:10px}
  .fc-tree ul{list-style:none;margin:0;padding-left:15px}
  .fc-tree>ul{padding-left:2px}
  .fc-tree li{padding:3px 0;color:#c1cad6;line-height:1.5}
  .fc-tree li:hover{color:#f97316}
  .fc-col{background:#0f1119;padding:12px 14px}
  .fc-coltit{text-align:center;color:#f97316;font-weight:700;border-bottom:1px solid #2a2d3e;padding-bottom:7px;margin-bottom:8px}
  .fc-lin{display:flex;justify-content:space-between;align-items:center;padding:4px 0}
  .fc-lbl{color:#aeb9c7}
  .fc-box{border:1px solid #2a2d3e;background:#0b0d14;border-radius:6px;padding:4px 9px;min-width:96px;text-align:right;font-variant-numeric:tabular-nums;color:#e5e7eb}
  .fc-box.forte{font-weight:700;background:#10231a;border-color:#245a35;color:#7ee2a0}
  .fc-box.azulf{background:#0f1c33;border-color:#274a7a;color:#93c0ff}
  .fc-box.ok{background:#10231a;border-color:#245a35;color:#7ee2a0;font-weight:700}
  .fc-box.alerta{background:#2a2012;border-color:#7a5a20;color:#f0b45c;font-weight:700}
  .fc-total{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #2a2d3e;margin-top:8px;padding-top:8px;font-weight:600;color:#dbe2ea}
  .fc-litros{color:#6b7688;font-size:10px;margin-top:10px}
  .fc-painel{background:#0f1119;padding:12px}
  .fc-obscab{display:flex;justify-content:space-between;align-items:center;color:#f97316;font-weight:600;margin-bottom:5px}
  .fc-obs{width:100%;height:60px;border:1px solid #2a2d3e;border-radius:6px;font-size:11px;padding:6px;resize:vertical;box-sizing:border-box;background:#0b0d14;color:#e5e7eb}
  .fc-btn2{display:block;width:100%;text-align:left;margin-top:7px;background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:8px 11px;font-size:11px;color:#c7d0dc;cursor:pointer}
  .fc-btn2:hover:not(:disabled){background:#242c3e;color:#fff}.fc-btn2:disabled{color:#5a6472;cursor:default}
  .fc-adgrid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px;align-items:center;margin-top:12px}
  .fc-adgrid label{color:#aeb9c7;font-size:11px;text-align:right}
  .fc-inp3{border:1px solid #2a2d3e;border-radius:6px;padding:4px 7px;font-size:11px;text-align:right;background:#0b0d14;color:#cdd6e0;width:100%;box-sizing:border-box}
  .fc-confrow{background:#3a2712 !important;outline:none}
  .fc-confrow td{color:#f0b45c !important}
  .fc-selrow{background:#12263d !important}
  .fc-selrow td{color:#9cc4f0}
  tr[data-fcref]:focus{outline:1px solid #f97316;outline-offset:-1px}
  .fc-filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:#141824;border-bottom:1px solid #2a2d3e;font-size:11px;color:#9aa}
  #fc-modal .fc-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998}
  #fc-modal .fc-modal-cx{position:fixed;top:8vh;left:50%;transform:translateX(-50%);width:min(780px,92vw);max-height:80vh;overflow:auto;background:#13151f;border:1px solid #2a2d3e;border-radius:12px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  #fc-modal .fc-modal-tit{background:#1a1d2e;color:#f97316;padding:10px 16px;font-weight:600;border-radius:12px 12px 0 0}
  #fc-modal .fc-modal-corpo{padding:12px}
  </style>`;
}
