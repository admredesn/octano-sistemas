// ============================================================
// B.I DO GRUPO — visão executiva por posto e consolidada
// Blocos: contas a pagar, contas a receber, valor em estoque,
// projeção de venda e META DO DIA (quanto vender p/ pagar a
// conta do próximo vencimento, com evolução do dia em %).
// Fontes (Supabase): oct_contas_pagar (alimentada 6/6h pelas
// duplicatas das NF-e — sync_contas_pagar_nfe.py), oct_pdv_notas_prazo,
// oct_faturas, oct_tanques×oct_produtos (custo), oct_fila_transmissao.
// ============================================================

const _BI_REFRESH_MS = 60000;

// ---- período selecionado (dia | semana | mes | custom) ----
function _biPerDatas() {
  const p = window._biPer || { tipo: 'mes' };
  const hoje = _biHojeLocal();
  const d = new Date(hoje + 'T12:00');
  const iso = (x) => x.toISOString().slice(0, 10);
  if (p.tipo === 'dia') return { ini: hoje, fim: hoje, rotulo: 'hoje' };
  if (p.tipo === 'semana') {
    const seg = new Date(d); seg.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return { ini: iso(seg), fim: iso(dom), rotulo: 'semana (seg–dom)' };
  }
  if (p.tipo === 'custom' && p.ini && p.fim) return { ini: p.ini, fim: p.fim, rotulo: _biDtBr(p.ini) + ' a ' + _biDtBr(p.fim) };
  const fimMes = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { ini: hoje.slice(0, 7) + '-01', fim: iso(fimMes), rotulo: 'mês de ' + d.toLocaleDateString('pt-BR', { month: 'long' }) };
}
function _biSetPer(tipo) { window._biPer = { tipo }; _biRender(); }
function _biSetPerCustom() {
  const ini = document.getElementById('bi-per-ini').value, fim = document.getElementById('bi-per-fim').value;
  if (!ini || !fim || fim < ini) { alert('Informe data inicial e final válidas.'); return; }
  window._biPer = { tipo: 'custom', ini, fim };
  _biRender();
}
function _biToolbarPer(per) {
  const t = (window._biPer || { tipo: 'mes' }).tipo;
  const btn = (id, rot) => '<button onclick="_biSetPer(\'' + id + '\')" style="padding:6px 14px;border-radius:6px;cursor:pointer;border:1px solid ' +
    (t === id ? '#f97316;background:#f97316;color:#fff;font-weight:700' : '#2a2d3e;background:#0f1117;color:#9aa') + '">' + rot + '</button>';
  return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
    '<span style="color:#9aa;font-size:0.8rem">Período:</span>' +
    btn('dia', 'Hoje') + btn('semana', 'Semana') + btn('mes', 'Mês') +
    '<span style="display:flex;gap:4px;align-items:center;border:1px solid ' + (t === 'custom' ? '#f97316' : '#2a2d3e') + ';border-radius:6px;padding:3px 6px;background:#0f1117">' +
      '<input id="bi-per-ini" type="date" value="' + ((window._biPer || {}).ini || per.ini) + '" style="background:transparent;border:none;color:#e0e0e0;font-size:0.78rem">' +
      '<span style="color:#667">até</span>' +
      '<input id="bi-per-fim" type="date" value="' + ((window._biPer || {}).fim || per.fim) + '" style="background:transparent;border:none;color:#e0e0e0;font-size:0.78rem">' +
      '<button onclick="_biSetPerCustom()" style="padding:4px 10px;border-radius:5px;border:none;background:#f97316;color:#fff;cursor:pointer;font-size:0.75rem">OK</button></span>' +
    '<span style="color:#667;font-size:0.75rem;margin-left:6px">mostrando: <b style="color:#c9d2dc">' + per.rotulo + '</b></span></div>';
}

function _biMoney(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _biK(v) { v = Number(v || 0); return v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil' : _biMoney(v); }
function _biHojeLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _biDtBr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'; }
function _biNomeCurto(nome) {
  const n = (nome || '').toUpperCase();
  if (n.includes('TIJUCO')) return 'Tijuco';
  if (n.includes('FLORESTAL')) return 'Florestal';
  if (n.includes('ANTONIO CARLOS')) return 'Antônio Carlos';
  if (n.includes('GLORIA')) return 'Glória';
  return nome || '?';
}

// classifica combustível por nome (tanque OU produto) p/ casar custo
function _biClasseComb(s) {
  s = (s || '').toUpperCase();
  if (/ETANOL|ALCOOL/.test(s) && !/MISTURA/.test(s)) return 'etanol';
  if (/GASOLINA|MISTURA DE ETAN/.test(s)) return /ADIT|ADT|PODIUM|GRID/.test(s) ? 'gas_ad' : 'gas_com';
  if (/DIESEL/.test(s)) return /S[- ]?10|BS10/.test(s) ? 's10' : (/500|BS5/.test(s) ? 's500' : 'diesel');
  return null;
}

// paginação PostgREST (cap de 1000 linhas por resposta)
async function _biTudo(fazQuery) {
  const PAG = 1000; let tudo = [], de = 0;
  for (;;) {
    const { data, error } = await fazQuery().range(de, de + PAG - 1);
    if (error) throw new Error(error.message);
    tudo = tudo.concat(data || []);
    if (!data || data.length < PAG) return tudo;
    de += PAG;
  }
}

async function moduloBi() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando B.I...</p>';
  try {
    await _biRender();
  } catch (e) {
    conteudo.innerHTML = '<div style="padding:24px;color:#f44">Erro ao montar o B.I: ' + (e.message || e) +
      ' <button onclick="moduloBi()" style="margin-left:10px;padding:6px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Tentar de novo</button></div>';
  }
  // auto-atualização: números se renovam sozinhos com a aba aberta
  if (!window._biTimer) {
    window._biTimer = setInterval(() => {
      try { if (document.getElementById('bi-raiz')) _biRender(); } catch (e) {}
    }, _BI_REFRESH_MS);
  }
}

async function _biRender() {
  const hoje = _biHojeLocal();
  const mes = hoje.slice(0, 7);
  const per = _biPerDatas();
  const d15 = new Date(Date.now() - 16 * 864e5).toISOString().slice(0, 10);
  // fila: precisa da janela de 16d (média/meta/projeção) E do período escolhido.
  // Período antigo = duas buscas separadas (não varrer meses inúteis no meio).
  const somaDia = (iso, n) => new Date(new Date(iso + 'T12:00').getTime() + n * 864e5).toISOString().slice(0, 10);
  // VENDA = PISTA (abastecimentos crus da bomba, sem aferição — mesma fonte do
  // Monitor; a fila só tem o que já foi baixado no PDV e fica menor que o real)
  // + PRODUTOS de loja vendidos pela fila (item sem bico).
  const selFila = 'empresa_id,bico,valor,desconto,acrescimo,status,ocorrido_em,criado_em';
  const fFila = (ini, fim) => _biTudo(() => {
    let q = sb.from('oct_fila_transmissao').select(selFila).gte('criado_em', ini);
    if (fim) q = q.lte('criado_em', fim);
    return q;
  });
  const fPista = (ini, fim) => _biTudo(() => {
    // litros + produto/tanque: sem eles nao ha como aplicar o custo e calcular
    // o LUCRO BRUTO do periodo (pedido Ronan 25/08).
    let q = sb.from('oct_pdv_abastecimentos')
      .select('empresa_id,data_abast,valor_total,litros,produto_id,tanque_id,bico,tipo')
      .gte('data_abast', ini).or('tipo.is.null,tipo.neq.afericao');
    if (fim) q = q.lte('data_abast', fim);
    return q;
  });
  const umaJanela = somaDia(per.fim, 2) >= d15;
  const iniJanela = per.ini < d15 ? somaDia(per.ini, -1) : d15;
  const duasJanelas = (fn) => Promise.all([fn(d15, null), fn(somaDia(per.ini, -1), somaDia(per.fim, 2))])
    .then(([a, b]) => a.concat(b));
  // BICO -> TANQUE. No Antonio Carlos boa parte da pista vem SEM produto_id e
  // SEM tanque_id — so' o numero do bico. Sem esta ponte, R$ 158 mil de venda
  // (26% do posto) ficavam sem custo e o lucro saia menor do que e'. O Monitor
  // ja resolvia assim; o B.I passa a resolver igual.
  const bicosProm = sb.from('oct_bicos').select('numero,tanque_id')
    .then(r => r.data || [], () => []);
  const filaProm = umaJanela ? fFila(iniJanela, null) : duasJanelas(fFila);
  const pistaProm = umaJanela ? fPista(iniJanela, null) : duasJanelas(fPista);

  const [empR, cpR, cpMesR, fixasR, npR, fatR, tqR, prR, fila, pista, bicos] = await Promise.all([
    sb.from('oct_empresas').select('id,nome').eq('ativo', true),
    sb.from('oct_contas_pagar').select('empresa_id,descricao,valor,vencimento,status,categoria').eq('status', 'aberto').order('vencimento'),
    sb.from('oct_contas_pagar').select('empresa_id,valor,competencia').gte('competencia', per.ini).lte('competencia', per.fim),
    sb.from('oct_contas_recorrentes').select('empresa_id,valor_previsto').eq('ativo', true),
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor,status').eq('status', 'aberto')),
    sb.from('oct_faturas').select('empresa_id,valor,status'),
    sb.from('oct_tanques').select('empresa_id,combustivel,estoque_atual,volume_sonda,medido_em').eq('ativo', true),
    sb.from('oct_produtos').select('id,tanque_id,empresa_id,nome,preco_custo,preco_venda_a,estoque,ind_combustivel,cod_anp').eq('ativo', true),
    filaProm,
    pistaProm,
    bicosProm,
  ]);
  for (const r of [empR, cpR, cpMesR, fatR, tqR, prR]) if (r.error) throw new Error(r.error.message);

  const empresas = (empR.data || []).map(e => ({ id: e.id, nome: _biNomeCurto(e.nome) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // custo por PRODUTO e por TANQUE — e o que casa com a linha da pista.
  // (Um tanque pode ter mais de um produto apontando para ele; guarda so custo
  //  REAL, para um produto sem custo nao apagar o que ja foi resolvido — mesma
  //  guarda do Monitor.)
  const custoProd = {}, custoTq = {};
  ((prR && prR.data) || prR || []).forEach(p => {
    const c = Number(p.preco_custo || 0);
    if (!(c > 0)) return;
    if (p.id) custoProd[p.id] = c;
    if (p.tanque_id && !(custoTq[p.tanque_id] > 0)) custoTq[p.tanque_id] = c;
  });
  // custo por BICO (via tanque) — a ponte para a pista que so' tem o bico
  const custoBico = {};
  (bicos || []).forEach(b => {
    const c = custoTq[b.tanque_id];
    if (c > 0 && b.numero != null) custoBico[String(b.numero)] = c;
  });
  // custo dos combustíveis por empresa/classe (p/ valorar tanque)
  const custoComb = {};
  (prR.data || []).forEach(p => {
    if (p.ind_combustivel !== 'S' && !p.cod_anp) return;
    const cl = _biClasseComb(p.nome);
    if (!cl) return;
    const custo = Number(p.preco_custo || 0) || Number(p.preco_venda_a || 0);
    if (custo <= 0 || custo > 20) return;   // por litro — ignora lubrificante em caixa
    (custoComb[p.empresa_id] = custoComb[p.empresa_id] || {})[cl] = custo;
  });

  // vendas por empresa: hoje, média 14d, realizado do mês e do PERÍODO escolhido
  const vHoje = {}, vMes = {}, vDia = {}, vPer = {};
  const somaVenda = (e, dt, val) => {
    if (!dt || !val) return;
    if (dt === hoje) vHoje[e] = (vHoje[e] || 0) + val;
    if (dt.slice(0, 7) === mes) vMes[e] = (vMes[e] || 0) + val;
    if (dt >= d15 && dt < hoje) { (vDia[e] = vDia[e] || {})[dt] = (vDia[e][dt] || 0) + val; }
    if (dt >= per.ini && dt <= per.fim) vPer[e] = (vPer[e] || 0) + val;
  };
  // LUCRO BRUTO do periodo: (venda - custo) da pista, por posto.
  // BRUTO de proposito: aqui entra TUDO que saiu da bomba, inclusive a venda a
  // prazo. E o resultado do negocio no periodo. O Monitor mostra a outra regua
  // — so o que virou dinheiro (lucro disponivel).
  const lucPer = {}, lucSemCusto = {};
  // combustível: PISTA (fonte oficial, igual ao Monitor)
  pista.forEach(a => {
    const dt = (a.data_abast || '').slice(0, 10);
    const val = Number(a.valor_total || 0);
    somaVenda(a.empresa_id, dt, val);
    if (dt < per.ini || dt > per.fim) return;
    const L = Number(a.litros || 0);
    const c = custoProd[a.produto_id] || custoTq[a.tanque_id]
           || custoBico[String(a.bico)] || 0;
    if (!(c > 0) || !(L > 0)) { lucSemCusto[a.empresa_id] = (lucSemCusto[a.empresa_id] || 0) + val; return; }
    lucPer[a.empresa_id] = (lucPer[a.empresa_id] || 0) + (val - c * L);
  });
  // produtos de loja: fila (item sem bico)
  fila.forEach(f => {
    if (/cancel/i.test(f.status || '')) return;
    if (f.bico !== null && f.bico !== undefined && f.bico !== '') return;  // combustível já veio da pista
    somaVenda(f.empresa_id, (f.ocorrido_em || f.criado_em || '').slice(0, 10),
      Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0));
  });
  // dias decorridos do período (p/ média/dia do período)
  const perFimReal = per.fim > hoje ? hoje : per.fim;
  const perDias = Math.max(1, Math.round((new Date(perFimReal + 'T12:00') - new Date(per.ini + 'T12:00')) / 864e5) + 1);
  // contexto que a barra de meta usa para acompanhar o filtro escolhido
  const _tipoPer = (window._biPer || { tipo: 'mes' }).tipo;
  window._biPerCtx = {
    dias: perDias,
    rotulo: per.ini === per.fim ? 'do dia'
      : _tipoPer === 'semana' ? 'da semana'
      : _tipoPer === 'mes' ? 'do mês' : 'do período',
  };

  const dadosPosto = empresas.map(emp => {
    const e = emp.id;
    // contas a pagar
    const contas = (cpR.data || []).filter(c => c.empresa_id === e);
    const pagarTotal = contas.reduce((s, c) => s + Number(c.valor), 0);
    const vencidas = contas.filter(c => c.vencimento < hoje);
    const vencidasTotal = vencidas.reduce((s, c) => s + Number(c.valor), 0);
    // META DO DIA (modelo Ronan 18/08): custo fixo do mês DILUÍDO por dia
    // + cada boleto aberto diluído pelos dias até o SEU vencimento.
    //   fixo/dia   = Σ contas fixas cadastradas (🔁 Fixas) ÷ dias do mês
    //   boleto/dia = Σ valor ÷ dias-até-vencer (título futuro, não-recorrente —
    //                o recorrente já está no fixo, contar de novo dobraria)
    // Vencida NÃO entra (alerta separado; meta é ritmo, não resgate).
    const diasMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
    const fixoMes = (fixasR.data || []).filter(x => x.empresa_id === e)
      .reduce((s, x) => s + Number(x.valor_previsto), 0);
    const fixoDia = fixoMes / diasMes;
    const futuras = contas.filter(c => c.vencimento >= hoje && c.categoria !== 'recorrente');
    let boletosDia = 0;
    futuras.forEach(c => {
      const dias = Math.max(1, Math.round((new Date(c.vencimento + 'T12:00') - new Date(hoje + 'T12:00')) / 864e5) + 1);
      boletosDia += Number(c.valor) / dias;
    });
    const meta = (fixoDia + boletosDia) > 0 ? {
      porDia: fixoDia + boletosDia, fixoDia, boletosDia, fixoMes,
      nBoletos: futuras.length,
      venc: futuras.length ? futuras[0].vencimento : null,
      valorAte: futuras.length ? futuras.filter(c => c.vencimento <= futuras[0].vencimento)
        .reduce((s, c) => s + Number(c.valor), 0) : 0,
    } : null;
    // compras do período (todas as NF-e viradas em título, pagas ou não)
    const comprasMes = (cpMesR.data || []).filter(c => c.empresa_id === e).reduce((s, c) => s + Number(c.valor), 0);
    // títulos abertos que VENCEM dentro do período
    const vencePer = contas.filter(c => c.vencimento >= per.ini && c.vencimento <= per.fim).reduce((s, c) => s + Number(c.valor), 0);
    // contas a receber
    const receber = npR.filter(n => n.empresa_id === e).reduce((s, n) => s + Number(n.valor), 0)
      + (fatR.data || []).filter(f => f.empresa_id === e && !/liquid|pago|cancel/i.test(f.status || '')).reduce((s, f) => s + Number(f.valor), 0);
    // estoque: tanques (sonda × custo/litro) + produtos de loja (estoque × custo)
    let estComb = 0, litros = 0, semCusto = [];
    (tqR.data || []).filter(t => t.empresa_id === e).forEach(t => {
      const l = Number(t.volume_sonda != null ? t.volume_sonda : t.estoque_atual) || 0;
      const cl = _biClasseComb(t.combustivel);
      const mapa = custoComb[e] || {};
      const custo = mapa[cl] || (cl === 's10' || cl === 's500' ? mapa.diesel : 0) || 0;
      litros += l;
      if (custo > 0) estComb += l * custo;
      else if (l > 0) semCusto.push(t.combustivel);
    });
    const estLoja = (prR.data || []).filter(p => p.empresa_id === e && Number(p.estoque) > 0)
      .reduce((s, p) => s + Number(p.estoque) * (Number(p.preco_custo || 0) || Number(p.preco_venda_a || 0)), 0);
    // vendas
    const dias14 = vDia[e] || {};
    const media = Object.values(dias14).reduce((s, v) => s + v, 0) / 14;
    const hj = vHoje[e] || 0;
    const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
    const projMes = (vMes[e] || 0) + media * (diasNoMes - Number(hoje.slice(8, 10)));
    return {
      ...emp, pagarTotal, nPagar: contas.length, vencidasTotal, nVencidas: vencidas.length, meta,
      comprasMes, vencePer, receber, estoque: estComb + estLoja, litros, semCusto,
      vendaHoje: hj, vendaPer: vPer[e] || 0, mediaPer: (vPer[e] || 0) / perDias,
      lucroPer: lucPer[e] || 0, lucroSemCusto: lucSemCusto[e] || 0,
      media, realizadoMes: vMes[e] || 0, projMes,
    };
  });

  // consolidado do grupo
  const g = {
    pagarTotal: 0, vencidasTotal: 0, comprasMes: 0, vencePer: 0, receber: 0, estoque: 0, vendaHoje: 0,
    vendaPer: 0, mediaPer: 0, media: 0, realizadoMes: 0, projMes: 0, metaDia: 0, lucroPer: 0,
  };
  dadosPosto.forEach(p => {
    g.pagarTotal += p.pagarTotal; g.vencidasTotal += p.vencidasTotal; g.comprasMes += p.comprasMes;
    g.vencePer += p.vencePer; g.receber += p.receber;
    g.estoque += p.estoque; g.vendaHoje += p.vendaHoje; g.vendaPer += p.vendaPer; g.mediaPer += p.mediaPer;
    g.lucroPer += (p.lucroPer || 0);
    g.media += p.media; g.realizadoMes += p.realizadoMes; g.projMes += p.projMes;
    if (p.meta) { g.metaDia += p.meta.porDia; g.fixoDia = (g.fixoDia || 0) + p.meta.fixoDia; g.boletosDia = (g.boletosDia || 0) + p.meta.boletosDia; }
  });

  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('conteudo').innerHTML =
    '<div class="og-janela" id="bi-raiz">' +
      '<div class="og-titulo"><span>📈 B.I — Visão do Grupo</span>' +
        '<span style="font-size:0.72rem;color:#667;font-weight:400;margin-left:12px">atualizado ' + agora + ' · renova a cada 60s</span>' +
        '<button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button></div>' +
      '<div style="padding:14px 16px">' +
        _biToolbarPer(per) +
        _biCardGrupo(g) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:14px">' +
          dadosPosto.map(_biCardPosto).join('') +
        '</div>' +
        '<p style="color:#556;font-size:0.72rem;margin-top:12px">Estoque = sonda dos tanques × custo do combustível + produtos de loja a custo. ' +
        'Contas a pagar alimentadas automaticamente pelas duplicatas das NF-e de entrada (6/6h). ' +
        'Projeção do mês = realizado + média dos últimos 14 dias × dias restantes.</p>' +
      '</div></div>';
}

// A barra acompanha o FILTRO: em "Mês" ela compara a venda do mês com a meta
// acumulada dos dias já decorridos (metaDia x dias) — não adianta comparar o mês
// inteiro com a meta de um dia só. 100% = está no ritmo necessário até aqui.
function _biBarraMeta(vendidoDia, metaDia, fixoDia, boletosDia, vendidoPer) {
  const ctx = window._biPerCtx || { dias: 1, rotulo: 'do dia' };
  const dias = Math.max(1, ctx.dias || 1);
  const umDia = dias <= 1;
  const vendido = umDia ? vendidoDia : (vendidoPer != null ? vendidoPer : vendidoDia);
  const meta = (metaDia || 0) * dias;
  if (!meta || meta <= 0) return '<div style="color:#667;font-size:0.75rem">Sem custo fixo nem boleto aberto — sem meta.</div>';
  const pct = Math.round(vendido / meta * 100);
  const cor = pct >= 100 ? '#4caf50' : pct >= 60 ? '#fbbf24' : '#f97316';
  const quebra = (fixoDia || boletosDia)
    ? 'fixo ' + _biK((fixoDia || 0) * dias) + ' + boletos ' + _biK((boletosDia || 0) * dias) + ' = '
    : '';
  const alvo = umDia ? 'meta/dia ' + _biK(meta)
                     : 'meta ' + dias + ' dia(s) ' + _biK(meta);
  return '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#9aa;margin-bottom:3px">' +
      '<span>Evolução ' + ctx.rotulo + '</span><span style="color:' + cor + ';font-weight:700">' + pct + '%</span></div>' +
    '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;height:14px;overflow:hidden">' +
      '<div style="width:' + Math.min(100, pct) + '%;height:100%;background:' + cor + ';transition:width .6s"></div></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#778;margin-top:3px">' +
      '<span>vendido ' + _biK(vendido) + '</span><span>' + quebra + alvo + '</span></div>';
}

function _biCardGrupo(g) {
  const ind = (rot, val, cor, sub) =>
    '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:12px">' +
      '<div class="nfe-label">' + rot + '</div>' +
      '<div style="font-size:1.25rem;font-weight:700;color:' + cor + ';margin-top:4px">' + _biK(val) + '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#778;margin-top:2px">' + sub + '</div>' : '') + '</div>';
  return '<div style="background:#13151f;border:1px solid #f97316;border-radius:10px;padding:14px">' +
    '<div style="font-weight:700;color:#f97316;margin-bottom:10px">🏢 GRUPO — consolidado dos postos</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">' +
      ind('💸 Contas a pagar', g.pagarTotal, '#f44336', g.vencidasTotal > 0 ? _biK(g.vencidasTotal) + ' já vencidas' : 'nada vencido') +
      ind('📅 Vence no período', g.vencePer, '#fb923c', 'títulos abertos no período') +
      ind('🛒 Compras no período', g.comprasMes, '#fbbf24', 'NF-e de entrada (pagas + abertas)') +
      ind('💰 Contas a receber', g.receber, '#4caf50', 'notas a prazo + faturas') +
      ind('🛢️ Valor em estoque', g.estoque, '#60a5fa', 'combustível + loja, a custo') +
      ind('💵 Venda no período', g.vendaPer, '#e0e0e0', 'média/dia ' + _biK(g.mediaPer)) +
      ind('📊 Lucro bruto', g.lucroPer, '#22c55e',
          (g.vendaPer > 0 ? (g.lucroPer / g.vendaPer * 100).toFixed(2).replace('.', ',') + '% de margem' : 'margem —')
          + ' · inclui venda a prazo') +
      ind('🔮 Projeção do mês', g.projMes, '#c084fc', 'realizado ' + _biK(g.realizadoMes)) +
    '</div>' +
    '<div style="margin-top:12px">' + _biBarraMeta(g.vendaHoje, g.metaDia, g.fixoDia, g.boletosDia, g.vendaPer) + '</div></div>';
}

function _biCardPosto(p) {
  const linha = (rot, val, cor) =>
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1a1d2e;font-size:0.82rem">' +
      '<span style="color:#9aa">' + rot + '</span><span style="font-weight:700;color:' + (cor || '#e0e0e0') + '">' + _biK(val) + '</span></div>';
  const venc = (p.meta && p.meta.venc)
    ? '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;padding:8px;margin:8px 0;font-size:0.75rem;color:#9aa">' +
        '⏰ Próx. vencimento <b style="color:#fbbf24">' + _biDtBr(p.meta.venc) + '</b>' +
        ' — <b style="color:#e0e0e0">' + _biK(p.meta.valorAte) + '</b> · ' + p.meta.nBoletos + ' boleto(s) aberto(s) no ritmo' +
        (p.meta.fixoMes ? ' · fixo do mês ' + _biK(p.meta.fixoMes) : '') + '</div>'
    : '';
  return '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
      '<span style="font-weight:700;color:#e0e0e0">⛽ ' + p.nome + '</span>' +
      (p.nVencidas > 0 ? '<span style="font-size:0.72rem;color:#f44336;font-weight:700">' + p.nVencidas + ' vencida(s) ' + _biK(p.vencidasTotal) + '</span>' : '') + '</div>' +
    linha('💸 A pagar (' + p.nPagar + ')', p.pagarTotal, '#f44336') +
    linha('📅 Vence no período', p.vencePer, '#fb923c') +
    linha('🛒 Compras no período', p.comprasMes, '#fbbf24') +
    linha('💰 A receber', p.receber, '#4caf50') +
    linha('🛢️ Estoque (' + Math.round(p.litros).toLocaleString('pt-BR') + ' L)', p.estoque, '#60a5fa') +
    linha('💵 Venda no período', p.vendaPer) +
    linha('📊 Lucro bruto (' + (p.vendaPer > 0 ? (p.lucroPer / p.vendaPer * 100).toFixed(2).replace('.', ',') + '%' : '—') + ')', p.lucroPer, '#22c55e') +
    linha('Ø Média/dia do período', p.mediaPer) +
    linha('📈 Venda hoje', p.vendaHoje) +
    linha('🔮 Projeção do mês', p.projMes, '#c084fc') +
    venc +
    '<div style="margin-top:8px">' + _biBarraMeta(p.vendaHoje, p.meta ? p.meta.porDia : 0, p.meta ? p.meta.fixoDia : 0, p.meta ? p.meta.boletosDia : 0, p.vendaPer) + '</div>' +
    (p.semCusto && p.semCusto.length ? '<div style="font-size:0.7rem;color:#a63;margin-top:6px">⚠ sem custo cadastrado: ' + p.semCusto.join(', ') + ' (estoque desses fora da conta)</div>' : '') +
  '</div>';
}
