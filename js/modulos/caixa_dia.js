// ============================================================
//  💵 CAIXA DO DIA — venda × entrou na conta × a compensar × despesas × disponível
// ------------------------------------------------------------
//  Pedido do Ronan (18/10/2026): "não tenho noção do que recebemos em conta,
//  do que ficou a receber, e os vencimentos se acumulam". Regras combinadas
//  (layout aprovado em _ferramentas/fluxo_caixa_layout_teste_v3.html):
//  - VENDA BRUTA = PISTA (abastecimentos sem aferição) + produtos de loja (fila
//    sem bico) — a mesma régua do F.Caixa/B.I/Monitor. Os cupons NÃO servem de
//    total: no Tijuco somaram R$ 27 mil em 14 dias contra R$ 172 mil de venda
//    que caiu no banco (medido em 18/10/2026). Por forma:
//      cartão/Pix da maquininha = EDI PagBank (oct_recebimentos);
//      nota a prazo = notas emitidas (oct_pdv_notas_prazo);
//      frota, cheque e haver = cupons; dinheiro e Pix direto = o que sobra.
//  - ENTROU NA CONTA = dinheiro + cartão + Pix da venda do dia, cartão/Pix
//    LÍQUIDO da taxa da maquininha (a taxa aparece à parte para não parecer
//    dinheiro sumido).
//  - A COMPENSAR = nota a prazo + frota + cheque. Sobe com o vendido, desce com
//    o recebido (o recebido passa para o disponível).
//      prazo  = notas abertas + faturas abertas (REAL);
//      frota  = vendido em frota nos últimos 30 dias − repasses das operadoras
//               no mesmo período (ESTIMADO: não há tabela de repasse);
//      cheque = vendido em cheque nos últimos 30 dias − liberado no Sicoob
//               (ESTIMADO).
//  - DESPESAS = débitos do extrato Sicoob que não são transferência do grupo
//    nem aplicação. OUTROS MOVIMENTOS (grupo, empréstimo, aplicação, aporte)
//    ficam à parte: mexem no saldo mas não são venda nem despesa.
//  - DISPONÍVEL = saldo REAL da conta Sicoob (oct_banco_saldos). Dias passados:
//    saldo de agora − movimentos do extrato depois do dia. Previsão: parte do
//    saldo de hoje + venda média do dia da semana + faturas que vencem − contas
//    a pagar que vencem.
//  Só LÊ. Nada aqui grava.
//  Cheque: DEP.CHEQUE BLOQ não muda o disponível (o saldo da API já deixa o
//  bloqueado de fora); quem muda é a LIBERAÇÃO DE DEPÓSITO BLOQUEADO.
// ============================================================

const _CD_DIAS_TAB = 14;           // dias de histórico na tabela
const _CD_PREV = 30;               // dias de previsão (só quando a data escolhida é hoje)
const _CD_TAXA_PADRAO = { deb: 0.009, cred: 0.029, pix: 0.002 };
const _CD_FROTA_RX = /TICKET|EDENRED|PRIME CONSULTORIA|PRIME BENEF|FITCARD|NEO FACIL|NEOFACILIDADES|VALECARD|GOODCARD|GOOD CARD|ALELO|VEROCHEQUE|TRIVALE|PLUXEE|SODEXO|MAXIFROTA|PROFROTA|REDE FROTA/;
const _CD_ROT = { din: 'Dinheiro e Pix direto', deb: 'Cartão débito', cred: 'Cartão crédito', pix: 'Pix', frota: 'Frota', cheque: 'Cheque',
                  prazo: 'Nota a prazo', haver: 'Crédito do cliente (haver)', outros: 'Outras formas' };
const _CD_ROT_MAQ = { deb: 'Cartão débito (maquininha)', cred: 'Cartão crédito (maquininha)', pix: 'Pix (maquininha)' };
const _CD_CONTA = ['din', 'deb', 'cred', 'pix'];            // vão para a conta
const _CD_COMP = ['prazo', 'frota', 'cheque'];              // ficam a compensar

window._cdPosto = window._cdPosto || 'grupo';
window._cdData = window._cdData || null;
window._cdSel = window._cdSel || null;

function _cdMoney(v) { return (v < 0 ? '−' : '') + 'R$ ' + Math.abs(Number(v || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _cdSinal(v) { return (v > 0 ? '+' : '') + _cdMoney(v); }
function _cdSoma(dia, n) { return new Date(new Date(dia + 'T12:00:00').getTime() + n * 864e5).toISOString().slice(0, 10); }
function _cdLocal(iso) { return new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10); }   // timestamp -> dia no Brasil
function _cdIniUtc(dia) { return new Date(dia + 'T00:00:00-03:00').toISOString(); }
function _cdDm(dia) { return dia.slice(8, 10) + '/' + dia.slice(5, 7); }
function _cdSem(dia) { return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(dia + 'T12:00:00').getDay()]; }
function _cdRaiz(s) { return String(s || '').replace(/\D/g, '').slice(0, 8); }

// forma do pagamento do cupom (mesma leitura das telas de formas do caixa)
function _cdForma(p) {
  const n = String(p.nome || '').toUpperCase(), f = String(p.forma || '');
  if (p.frota || (/FROTA|TICKET|PRIME|FITCARD|NEO|VALE ?CARD|GOODCARD|ALELO|VERO/.test(n) && !/PIX/.test(n))) return 'frota';
  if (p.haver || /CR[EÉ]DITO DO CLIENTE|HAVER/.test(n)) return 'haver';
  if (p.cheque || f === '02' || /CHEQUE/.test(n)) return 'cheque';
  if (f === '05' || /PRAZO/.test(n)) return 'prazo';
  if (f === '17' || /PIX/.test(n)) return 'pix';
  if (f === '04' || /D[EÉ]BITO/.test(n)) return 'deb';
  if (f === '03' || /CR[EÉ]DITO/.test(n)) return 'cred';
  if (f === '01' || /DINHEIRO/.test(n)) return 'din';
  return 'outros';
}

// linha do extrato Sicoob -> o que ela é para esta tela
function _cdMov(m, raizesGrupo, raizPosto) {
  const d = String(m.descricao || '').toUpperCase(), info = String(m.info || '').toUpperCase();
  const raizes = (info.match(/\d{2}\.\d{3}\.\d{3}[ \/]?\d{4}-?\d{2}/g) || []).map(_cdRaiz);
  const doGrupo = raizes.some(r => r !== raizPosto && raizesGrupo.has(r)) || (/\bSN (COM|COMBUST)/.test(info) && !/MESMA TIT/.test(d));
  if (m.tipo === 'credito') {
    if (/DEP\.?\s*CHEQUE/.test(d)) return { k: 'neutro', r: 'Cheque depositado (bloqueado)' };
    if (/LIBERA[CÇ][AÃ]O DE DEP/.test(d)) return { k: 'rec_cheque', r: 'Cheque liberado' };
    if (/COFRE/.test(d)) return { k: 'banco_venda', r: 'Depósito do cofre' };
    if (/DEP[OÓ]SITO EM DINHEIRO/.test(d)) return { k: 'banco_venda', r: 'Depósito em dinheiro' };
    if (/MESMA TIT/.test(d)) return { k: 'banco_venda', r: 'Repasse da maquininha (PagBank)' };
    if (/LIQUIDA[CÇ][AÃ]O COBRAN/.test(d)) return { k: 'rec_boleto', r: 'Boleto de cliente pago' };
    if (/RDC|RESGATE|POUPAN/.test(d)) return { k: 'outros', r: 'Resgate de aplicação' };
    if (/EMPR[EÉ]STIMO|CAPITAL DE GIRO/.test(d)) return { k: 'outros', r: 'Empréstimo' };
    if (doGrupo) return { k: 'outros', r: 'Transferência do grupo' };
    if (_CD_FROTA_RX.test(info)) return { k: 'rec_frota', r: 'Repasse de frota' };
    if (/PIX|TRANSF/.test(d)) return { k: 'banco_venda', r: 'Pix recebido' };
    return { k: 'outros', r: 'Outro crédito' };
  }
  if (/RDC|SUBSC|INTEGR|POUPAN|APLICA/.test(d)) return { k: 'outros', r: 'Aplicação / cota capital' };
  if (doGrupo || /MESMA TIT/.test(d)) return { k: 'outros', r: 'Transferência do grupo' };
  if (/DEVOL\.?\s*CHEQUE/.test(d)) return { k: 'outros', r: 'Cheque devolvido' };
  return { k: 'despesa', r: m.descricao };
}

async function moduloCaixaDia() {
  const conteudo = document.getElementById('conteudo');
  if (!window._cdData) window._cdData = _biHojeLocal();
  conteudo.innerHTML = _cdCss() +
    '<div class="og-janela" id="cd-raiz"><div class="og-titulo"><span>💵 Caixa do dia</span>' +
    '<button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button></div>' +
    '<div id="cd-corpo" style="padding:14px 16px"><p style="color:#888">Carregando…</p></div></div>';
  await _cdRender(true);
}

function _cdCss() {
  return '<style>' +
    '.cd-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '.cd-chips{display:flex;gap:6px;flex-wrap:wrap}' +
    '.cd-chip{padding:5px 13px;border-radius:16px;border:1px solid #2a2d3e;background:#0f1117;color:#9aa;cursor:pointer;font-size:.82rem}' +
    '.cd-chip.on{background:#f97316;border-color:#f97316;color:#fff;font-weight:600}' +
    '.cd-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}' +
    '@media(max-width:1100px){.cd-cards{grid-template-columns:repeat(2,1fr)}}' +
    '.cd-c{background:#1a1d2e;border:1px solid #2a2d3e;border-radius:10px;padding:12px 14px}' +
    '.cd-c .r{color:#8a8fa3;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px}' +
    '.cd-c .v{font-size:1.3rem;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}' +
    '.cd-c .s{color:#8a8fa3;font-size:.74rem;margin-top:5px;line-height:1.5}' +
    '.cd-c.comp{border-color:#3b3366;background:#1b1a33}.cd-c.neg{border-color:#5a2020;background:#2d1414}' +
    '.cd-box{background:#1a1d2e;border:1px solid #2a2d3e;border-radius:10px;padding:12px 14px;margin-top:12px;overflow-x:auto}' +
    '.cd-box h3{font-size:.86rem;color:#fff;margin:0 0 4px}.cd-sub{color:#8a8fa3;font-size:.76rem;margin-bottom:8px}' +
    '.cd-t{border-collapse:collapse;width:100%}' +
    '.cd-t th{text-align:right;color:#8a8fa3;font-weight:500;font-size:.74rem;padding:6px 8px;border-bottom:1px solid #2a2d3e;white-space:nowrap}' +
    '.cd-t td{padding:6px 8px;border-bottom:1px solid #20233a;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:.82rem}' +
    '.cd-t th:first-child,.cd-t td:first-child{text-align:left}' +
    '.cd-t td small{display:block;font-size:.68rem;color:#8a8fa3}' +
    '.cd-t tr.l{cursor:pointer}.cd-t tr.l:hover td{background:#1f2338}.cd-t tr.sel td{background:#252a44}' +
    '.cd-t tr.hoje td:first-child{border-left:3px solid #f97316}.cd-t tr.prev td{color:#9aa0b8;font-style:italic}' +
    '.cd-t tr.neg td.disp{color:#f87171;font-weight:700}.cd-t td.disp{font-weight:700;color:#fff}' +
    '.cd-t tr.sep td{background:#13151f;color:#f97316;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;font-style:normal}' +
    '.cd-t tr.tot td{font-weight:700;border-top:1px solid #2a2d3e}' +
    '.cd-det{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:1100px){.cd-det{grid-template-columns:1fr}}' +
    '.cd-ok{color:#4ade80}.cd-err{color:#f87171}.cd-roxo{color:#c4b5fd}.cd-mut{color:#8a8fa3}.cd-ama{color:#fbbf24}' +
    '.cd-tag{display:inline-block;font-size:.64rem;font-weight:700;padding:1px 6px;border-radius:6px;margin-right:5px}' +
    '.cd-sim{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.cd-sim label{display:block;font-size:.68rem;color:#8a8fa3;text-transform:uppercase;margin-bottom:3px}' +
    '.cd-sim input,.cd-sim select{padding:6px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0}' +
    '.cd-btn{padding:7px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;font-weight:600;cursor:pointer}.cd-btn.sec{background:transparent;border:1px solid #2a2d3e;color:#cbd5e1}' +
    '.cd-aviso{background:#2a2510;border:1px solid #4a4016;color:#fde68a;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.8rem}' +
    '</style>';
}

async function _cdCarregar(dataSel) {
  const hoje = _biHojeLocal();
  const ehHoje = dataSel >= hoje;
  const ini = _cdSoma(dataSel, -(_CD_DIAS_TAB - 1));
  // venda: do início da tabela até hoje (refaz o "a compensar" para trás); com previsão, 28 dias de média
  const iniVenda = [ini, _cdSoma(hoje, -30)].sort()[0];
  const emp = (await sb.from('oct_empresas').select('id,nome,nome_fantasia,cnpj,ativo').eq('ativo', true)).data || [];
  const ids = emp.map(e => e.id);
  const [vendas, movs, saldos, notasAb, fatAb, fatLiq, notasPagas, pagar, fila, pista, loja, maq, notasEmit, reqs, reqLig] = await Promise.all([
    _biTudo(() => sb.from('oct_pdv_vendas').select('empresa_id,status,valor_total,pagamentos,data_venda')
      .in('empresa_id', ids).gte('data_venda', _cdIniUtc(iniVenda)).order('data_venda').order('id')),
    _biTudo(() => sb.from('oct_banco_movimentos').select('empresa_id,data,tipo,valor,descricao,info')
      .in('empresa_id', ids).gte('data', [ini, _cdSoma(hoje, -30)].sort()[0]).order('data').order('id')),
    sb.from('oct_banco_saldos').select('*').then(r => r.data || []),
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor').eq('status', 'aberto').order('id')),
    _biTudo(() => sb.from('oct_faturas').select('empresa_id,valor,valor_liquido,vencimento').eq('status', 'aberta').order('id')),
    _biTudo(() => sb.from('oct_faturas').select('empresa_id,valor,valor_liquido,vencimento,liquidado_em').eq('status', 'liquidada')
      .gte('liquidado_em', _cdSoma(ini < _cdSoma(hoje, -120) ? ini : _cdSoma(hoje, -120), 0)).order('id')),
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor,valor_original,pago_em').eq('status', 'pago').is('fatura_id', null)
      .gte('pago_em', _cdIniUtc(ini)).order('id')),
    _biTudo(() => sb.from('oct_contas_pagar').select('id,empresa_id,descricao,valor,vencimento,fornecedor_id,categoria,requisicao_id').eq('status', 'aberto')
      .gte('vencimento', _cdSoma(hoje, -30)).lte('vencimento', _cdSoma(hoje, _CD_PREV)).order('id')),
    _biTudo(() => sb.from('oct_fila_transmissao').select('empresa_id,forma_nome,valor,taxa')
      .gte('ocorrido_em', new Date(Date.now() - 7 * 864e5).toISOString()).in('forma_nome', ['Pix', 'Débito', 'Crédito']).order('ocorrido_em').order('id')),
    // data_abast é hora LOCAL gravada com +00:00: filtra e agrupa como texto local; ordem pelo índice (order(id) com offset fundo dá 500)
    _biTudo(() => sb.from('oct_pdv_abastecimentos').select('empresa_id,data_abast,valor_total')
      .in('empresa_id', ids).gte('data_abast', iniVenda + 'T00:00:00').or('tipo.is.null,tipo.neq.afericao').order('data_abast')),
    _biTudo(() => sb.from('oct_fila_transmissao').select('empresa_id,valor,desconto,acrescimo,status,ocorrido_em')
      .in('empresa_id', ids).gte('ocorrido_em', _cdIniUtc(iniVenda)).is('bico', null).order('ocorrido_em').order('id')),
    _biTudo(() => sb.from('oct_recebimentos').select('empresa_id,origem,forma,valor,recebido_em')
      .in('empresa_id', ids).in('origem', ['pagbank_edi', 'pagbank_email']).gte('recebido_em', _cdIniUtc(iniVenda)).order('recebido_em').order('id')),
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor,valor_original,status,registrado_em')
      .in('empresa_id', ids).gte('registrado_em', _cdIniUtc(iniVenda)).order('id')),
    // PEDIDOS (Requisições de compra): o que já foi pedido e ainda não virou título entra na previsão.
    // Sem a tabela (SQL não rodado) a tela segue sem pedidos.
    _biTudo(() => sb.from('oct_requisicoes_compra').select('id,empresa_id,numero,fornecedor_id,fornecedor_nome,categoria,valor_total,vencimento_previsto,previsao_chegada,status,criado_em')
      .in('empresa_id', ids).in('status', ['pedida', 'parcial', 'recebida', 'divergente']).order('id')).catch(() => []),
    _biTudo(() => sb.from('oct_contas_pagar').select('requisicao_id').not('requisicao_id', 'is', null).order('id')).catch(() => []),
  ]);
  return { hoje, ehHoje, ini, dataSel, emp, vendas, movs, saldos, notasAb, fatAb, fatLiq, notasPagas, pagar, fila, pista, loja, maq, notasEmit, reqs, reqLig: new Set(reqLig.map(r => r.requisicao_id)) };
}

// monta a série de dias de UM posto
function _cdSeriePosto(D, e) {
  const eid = e.id, raiz = _cdRaiz(e.cnpj);
  let pedidos = [];
  const raizesGrupo = new Set(D.emp.map(x => _cdRaiz(x.cnpj)));
  // taxa real da maquininha (fila dos últimos 7 dias)
  const tx = Object.assign({}, _CD_TAXA_PADRAO), acc = {};
  D.fila.forEach(f => { if (f.empresa_id !== eid) return; const k = { 'Débito': 'deb', 'Crédito': 'cred', Pix: 'pix' }[f.forma_nome];
    const a = (acc[k] = acc[k] || [0, 0]); a[0] += Number(f.taxa || 0); a[1] += Number(f.valor || 0); });
  Object.entries(acc).forEach(([k, [t, v]]) => { if (v > 500) tx[k] = t / v; });

  // ---- venda por dia ----
  const total = {}, add = (o, d, k, v) => { const x = (o[d] = o[d] || {}); x[k] = (x[k] || 0) + v; };
  D.pista.forEach(a => { if (a.empresa_id === eid) add(total, String(a.data_abast).slice(0, 10), 't', Number(a.valor_total || 0)); });
  D.loja.forEach(f => { if (f.empresa_id === eid && f.status !== 'cancelado' && f.status !== 'removido')
    add(total, _cdLocal(f.ocorrido_em), 't', Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)); });
  // maquininha: o mesmo pagamento chega pelo e-mail (na hora) e pelo EDI — por dia vale a origem com mais valor
  const maqO = {};
  D.maq.forEach(r => { if (r.empresa_id !== eid) return; const k = { 'Débito': 'deb', 'Crédito': 'cred', Pix: 'pix' }[r.forma]; if (!k) return;
    const d = _cdLocal(r.recebido_em), o = ((maqO[d] = maqO[d] || {})[r.origem] = maqO[d][r.origem] || { _t: 0 });
    o[k] = (o[k] || 0) + Number(r.valor || 0); o._t += Number(r.valor || 0); });
  const maqD = {};
  Object.entries(maqO).forEach(([d, os]) => { maqD[d] = Object.values(os).reduce((m, x) => (!m || x._t > m._t ? x : m), null); });
  const cup = {};
  D.vendas.forEach(v => {
    if (v.empresa_id !== eid || /cancel|estorn/.test(String(v.status || ''))) return;
    const d = _cdLocal(v.data_venda);
    (v.pagamentos || []).forEach(p => { const k = _cdForma(p); if (k === 'frota' || k === 'cheque' || k === 'haver') add(cup, d, k, Number(p.valor || 0)); });
  });
  const prz = {};
  D.notasEmit.forEach(n => { if (n.empresa_id !== eid || n.status === 'cancelado') return;
    add(prz, _cdLocal(n.registrado_em), 'prazo', Number(n.valor_original != null ? n.valor_original : n.valor || 0)); });
  const vendaDia = dia => {
    const m = maqD[dia] || {}, c = cup[dia] || {}, f = {};
    f.deb = m.deb || 0; f.cred = m.cred || 0; f.pix = m.pix || 0;
    f.prazo = (prz[dia] || {}).prazo || 0; f.frota = c.frota || 0; f.cheque = c.cheque || 0; f.haver = c.haver || 0;
    const bruta = ((total[dia] || {}).t) || 0;
    const resto = bruta - Object.values(f).reduce((a, v) => a + v, 0);
    f.din = Math.max(0, resto);
    if (resto < -0.5) f.sobra = -resto;           // formas somam mais que a pista (cupom de outro dia, nota de título etc.)
    return { f, bruta };
  };
  // extrato por dia
  const banco = {};
  D.movs.forEach(m => {
    if (m.empresa_id !== eid) return;
    const c = _cdMov(m, raizesGrupo, raiz), b = (banco[m.data] = banco[m.data] || { itens: [], efeito: 0 });
    const v = Number(m.valor || 0) * (m.tipo === 'credito' ? 1 : -1);
    b.itens.push({ k: c.k, r: c.r, v, info: m.info, desc: m.descricao });
    if (c.k !== 'neutro') b.efeito += v;
    b[c.k] = (b[c.k] || 0) + v;
  });
  // recebido a prazo (sistema): faturas liquidadas + notas pagas no caixa sem fatura
  const recPrazo = {};
  D.fatLiq.forEach(f => { if (f.empresa_id !== eid || !f.liquidado_em) return; const d = String(f.liquidado_em).length > 10 ? _cdLocal(f.liquidado_em) : f.liquidado_em;
    recPrazo[d] = (recPrazo[d] || 0) + Number(f.valor_liquido != null ? f.valor_liquido : f.valor || 0); });
  D.notasPagas.forEach(n => { if (n.empresa_id !== eid || !n.pago_em) return; const d = _cdLocal(n.pago_em);
    recPrazo[d] = (recPrazo[d] || 0) + Number(n.valor_original != null ? n.valor_original : n.valor || 0); });

  const linha = (dia) => {
    const vd = vendaDia(dia), f = vd.f, bruta = vd.bruta, b = banco[dia] || { itens: [], efeito: 0 };
    const taxas = (f.deb || 0) * tx.deb + (f.cred || 0) * tx.cred + (f.pix || 0) * tx.pix;
    const entrou = _CD_CONTA.reduce((a, k) => a + (f[k] || 0), 0) - taxas;
    const vc = { prazo: f.prazo || 0, frota: f.frota || 0, cheque: f.cheque || 0 };
    const rc = { prazo: recPrazo[dia] || 0, frota: b.rec_frota || 0, cheque: b.rec_cheque || 0 };
    return { dia, formas: f, bruta, taxas, entrou, vc, rc, vcT: vc.prazo + vc.frota + vc.cheque, rcT: rc.prazo + rc.frota + rc.cheque,
      D: -(b.despesa || 0), O: b.outros || 0, bancoVenda: b.banco_venda || 0, recBoleto: b.rec_boleto || 0, efeito: b.efeito, itens: b.itens,
      // tudo que entrou no Sicoob vindo da operação (venda + recebimentos), sem grupo/aplicação
      bancoOp: (b.banco_venda || 0) + (b.rec_boleto || 0) + (b.rec_frota || 0) + (b.rec_cheque || 0),
      semDesp: b.efeito - (b.despesa || 0) };      // tudo que mexeu no saldo, menos as despesas
  };

  // ---- saldos de HOJE (âncoras) ----
  const s = D.saldos.find(x => x.empresa_id === eid);
  const saldoHoje = s && s.saldo != null ? Number(s.saldo) : null;
  const corte30 = _cdSoma(D.hoje, -29);
  let vend30 = { frota: 0, cheque: 0 }, rec30 = { frota: 0, cheque: 0 };
  for (let d = corte30; d <= D.hoje; d = _cdSoma(d, 1)) {
    const x = linha(d); vend30.frota += x.vc.frota; vend30.cheque += x.vc.cheque; rec30.frota += x.rc.frota; rec30.cheque += x.rc.cheque;
  }
  const comp = {
    prazo: D.notasAb.filter(n => n.empresa_id === eid).reduce((a, n) => a + Number(n.valor || 0), 0) +
           D.fatAb.filter(f => f.empresa_id === eid).reduce((a, f) => a + Number(f.valor_liquido != null ? f.valor_liquido : f.valor || 0), 0),
    frota: Math.max(0, vend30.frota - rec30.frota),
    cheque: Math.max(0, vend30.cheque - rec30.cheque),
  };
  const compHoje = comp.prazo + comp.frota + comp.cheque;

  // ---- histórico: hoje para trás ----
  const hist = {};
  let disp = saldoHoje, cp = compHoje;
  for (let d = D.hoje; d >= D.ini; d = _cdSoma(d, -1)) {
    const x = linha(d);
    x.disp = disp; x.comp = cp;
    hist[d] = x;
    if (disp != null) disp -= x.efeito;            // saldo no fim do dia anterior
    cp = cp - x.vcT + x.rcT;
  }
  const dias = [];
  for (let d = D.ini; d <= D.dataSel && d <= D.hoje; d = _cdSoma(d, 1)) dias.push(hist[d]);

  // ---- previsão (só quando a data escolhida é hoje) ----
  if (D.ehHoje) {
    // taxa de faturas pagas em dia (até 3 dias depois do vencimento), últimos 120 dias
    const liq = D.fatLiq.filter(f => f.empresa_id === eid && f.vencimento);
    const emDia = liq.filter(f => (String(f.liquidado_em).length > 10 ? _cdLocal(f.liquidado_em) : f.liquidado_em) <= _cdSoma(f.vencimento, 3)).length;
    const taxaEmDia = liq.length >= 5 ? emDia / liq.length : 0.8;
    // PREVISÃO DO SALDO — tudo pela média dos 4 últimos dias IGUAIS da semana
    // (o banco não lança no sábado/domingo e joga tudo na segunda):
    //  - entradas = o que mexeu no saldo menos as despesas (venda que caiu,
    //    recebimentos e também as transferências do grupo/PagBank, que hoje
    //    sustentam o caixa de alguns postos);
    //  - despesas = conta lançada que vence no dia, ou a média de saídas desse
    //    dia da semana quando for maior (carga pedida, folha e Pix a fornecedor
    //    ainda não viraram título). Sem isto a previsão subia sem parar
    //    (R$ 655 mil em 30 dias no teste de 18/10).
    //  Assim a curva só cai quando há conta lançada acima do normal: o aperto.
    let s28 = 0; for (let i = 0; i < 28; i++) s28 += linha(_cdSoma(D.hoje, -i)).D;
    const media28 = s28 / 28;
    // recebido a prazo: faturas que vencem × % em dia NÃO cobre as notas ainda não faturadas
    // (viram fatura depois). Piso = média diária recebida nos últimos 28 dias.
    let r28 = 0; for (let i = 0; i < 28; i++) r28 += linha(_cdSoma(D.hoje, -i)).rc.prazo;
    const prazo28 = r28 / 28;
    // PEDIDOS: requisição sem título ligado. Se já existe título aberto do mesmo fornecedor com valor
    // parecido (±8%: o pedido é estimado, a nota vem com o preço do dia) e vencimento perto (±7 dias),
    // a nota já chegou e o título já está na conta — não soma de novo (a fase 2, que liga sozinho,
    // está desligada no servidor).
    const usados = new Set();
    pedidos = D.reqs.filter(r => r.empresa_id === eid && !D.reqLig.has(r.id)).map(r => {
      const venc = r.vencimento_previsto || (r.previsao_chegada ? _cdSoma(r.previsao_chegada, 10) : null);
      const v = Number(r.valor_total || 0);
      const tit = venc && D.pagar.find(p => p.empresa_id === eid && !usados.has(p.id) && !p.requisicao_id &&
        (r.fornecedor_id ? p.fornecedor_id === r.fornecedor_id : true) && v > 0 && Math.abs(Number(p.valor) / v - 1) <= 0.08 &&
        Math.abs((new Date(p.vencimento) - new Date(venc)) / 864e5) <= 7);
      if (tit) usados.add(tit.id);
      return { r, venc, valor: v, tit, diaPrev: venc && venc > D.hoje ? venc : _cdSoma(D.hoje, 1) };
    });
    const sim = (window._cdSim || []).filter(s => s.eid === eid);
    const media = {};                // média dos 4 últimos dias da mesma semana
    for (let w = 0; w < 7; w++) media[w] = null;
    let dP = disp = saldoHoje, cP = compHoje;
    for (let i = 1; i <= _CD_PREV; i++) {
      const dia = _cdSoma(D.hoje, i), wd = new Date(dia + 'T12:00:00').getDay();
      if (!media[wd]) {
        const amostras = [7, 14, 21, 28].map(n => linha(_cdSoma(dia, -n))).filter(x => x.dia <= D.hoje && x.dia < D.hoje && x.bruta > 0);
        const m = { formas: {}, bruta: 0, taxas: 0, entrou: 0, bancoOp: 0, semDesp: 0, D: 0, vc: { prazo: 0, frota: 0, cheque: 0 } };
        amostras.forEach(x => {
          Object.entries(x.formas).forEach(([k, v]) => m.formas[k] = (m.formas[k] || 0) + v / amostras.length);
          ['bruta', 'taxas', 'entrou', 'bancoOp', 'semDesp', 'D'].forEach(k => m[k] += x[k] / amostras.length);
          _CD_COMP.forEach(k => m.vc[k] += x.vc[k] / amostras.length);
        });
        media[wd] = m;
      }
      const m = media[wd];
      const fatV = D.fatAb.filter(f => f.empresa_id === eid && f.vencimento === dia).reduce((a, f) => a + Number(f.valor_liquido != null ? f.valor_liquido : f.valor || 0), 0);
      const rc = { prazo: Math.max(fatV * taxaEmDia, prazo28), frota: rec30.frota / 30, cheque: rec30.cheque / 30 };
      const desp = D.pagar.filter(p => p.empresa_id === eid && p.vencimento === dia)
        .map(p => p.categoria === 'recorrente' ? Object.assign({}, p, { planejada: true }) : p);
      pedidos.filter(x => !x.tit && x.diaPrev === dia).forEach(x => desp.push({ pedido: true, valor: x.valor,
        descricao: 'Pedido REQ-' + String(x.r.numero).padStart(6, '0') + ' · ' + (x.r.fornecedor_nome || '') + (x.venc && x.venc <= D.hoje ? ' (vencimento previsto já passou)' : '') + ' — ainda sem nota' }));
      sim.filter(s => s.dia === dia).forEach(s => desp.push({ simulado: true, valor: s.valor, descricao: 'SIMULAÇÃO: ' + (s.desc || 'pedido') }));
      const lanc = desp.reduce((a, p) => a + Number(p.valor || 0), 0), est = Math.max(0, m.D - lanc), Dv = lanc + est;
      if (est > 0.5) desp.push({ descricao: 'Estimativa: média de saídas das últimas 4 ' + _cdSem(dia) + ' (sem conta lançada)', valor: est, estimado: true });
      const vcT = m.vc.prazo + m.vc.frota + m.vc.cheque, rcT = rc.prazo + rc.frota + rc.cheque;
      // o disponível é o SALDO DO BANCO: a previsão soma o que costuma cair no Sicoob neste dia da
      // semana (média dos 4 últimos), não a venda à vista — enquanto a conta única não estiver
      // padronizada, parte da venda fica no PagBank (Florestal: 55% chegou, 14 dias até 18/10)
      if (dP != null) dP = dP + m.semDesp - Dv;
      cP = cP + vcT - rcT;
      dias.push({ dia, prev: true, formas: m.formas, bruta: m.bruta, taxas: m.taxas, entrou: m.entrou, vc: m.vc, rc, vcT, rcT, D: Dv, O: 0,
        bancoVenda: 0, recBoleto: 0, bancoOp: m.bancoOp, semDesp: m.semDesp, itens: [], desp, disp: dP, comp: cP, fatV, taxaEmDia, media28 });
    }
  }
  // conta recorrente (distribuição/parcela) é PLANEJADA, não dívida vencida (opção b do Ronan, 19/10)
  const vencidas = D.pagar.filter(p => p.empresa_id === eid && p.vencimento < D.hoje && p.categoria !== 'recorrente');
  // CONTA ÚNICA (regra do Ronan): toda venda à vista deve chegar ao Sicoob. Mede 14 dias até ontem.
  let vista14 = 0, banco14 = 0;
  for (let i = 1; i <= 14; i++) { const x = linha(_cdSoma(D.hoje, -i)); vista14 += x.entrou; banco14 += x.bancoVenda; }
  return { eid, nome: e.nome_fantasia || e.nome, dias, comp, saldo: s, saldoHoje, tx, vencidas, vista14, banco14, pedidos };
}

function _cdJuntar(postos) {
  const base = postos[0].dias;
  return base.map((x, i) => {
    const r = { dia: x.dia, prev: x.prev, formas: {}, vc: { prazo: 0, frota: 0, cheque: 0 }, rc: { prazo: 0, frota: 0, cheque: 0 },
      itens: [], desp: [], semSaldo: 0 };
    ['bruta', 'taxas', 'entrou', 'vcT', 'rcT', 'D', 'O', 'bancoVenda', 'recBoleto', 'bancoOp', 'semDesp', 'comp', 'fatV'].forEach(k => r[k] = 0);
    r.disp = 0;
    postos.forEach(p => {
      const y = p.dias[i];
      ['bruta', 'taxas', 'entrou', 'vcT', 'rcT', 'D', 'O', 'bancoVenda', 'recBoleto', 'bancoOp', 'semDesp', 'comp', 'fatV'].forEach(k => r[k] += y[k] || 0);
      if (y.disp == null) r.semSaldo++; else r.disp += y.disp;
      Object.entries(y.formas).forEach(([k, v]) => r.formas[k] = (r.formas[k] || 0) + v);
      _CD_COMP.forEach(k => { r.vc[k] += y.vc[k]; r.rc[k] += y.rc[k]; });
      (y.itens || []).forEach(it => r.itens.push(Object.assign({ posto: p.nome }, it)));
      (y.desp || []).forEach(it => r.desp.push(Object.assign({ posto: p.nome }, it)));
    });
    if (r.semSaldo === postos.length) r.disp = null;
    return r;
  });
}

async function _cdRender(recarregar) {
  const corpo = document.getElementById('cd-corpo');
  if (!corpo) return;
  const hoje = _biHojeLocal();
  if (window._cdData > hoje) window._cdData = hoje;
  if (recarregar || !window._cdD || window._cdD.dataSel !== window._cdData) {
    corpo.innerHTML = '<p style="color:#888">Lendo caixa, extrato e faturas…</p>';
    try { window._cdD = await _cdCarregar(window._cdData); }
    catch (e) { corpo.innerHTML = '<p style="color:#f87171">Não consegui carregar: ' + fcEscBi(e.message || e) + '</p>'; return; }
    _cdMontar();
    window._cdSel = window._cdData;
  }
  const D = window._cdD, P = window._cdPostos;
  const ps = window._cdPosto === 'grupo' ? P : P.filter(p => p.eid === window._cdPosto);
  if (!ps.length) { window._cdPosto = 'grupo'; return _cdRender(); }
  const L = _cdJuntar(ps);
  const x = L.find(r => r.dia === window._cdSel) || L.find(r => r.dia === D.dataSel) || L[L.length - 1];
  const nomeP = window._cdPosto === 'grupo';
  const semSaldo = ps.filter(p => p.saldoHoje == null).map(p => p.nome);

  let h = '<div class="cd-cab"><div class="cd-chips">' +
    [['grupo', '🏢 Grupo']].concat(P.map(p => [p.eid, p.nome])).map(([id, rot]) =>
      '<span class="cd-chip ' + (window._cdPosto === id ? 'on' : '') + '" onclick="window._cdPosto=\'' + id + '\';_cdRender()">' + fcEscBi(rot) + '</span>').join('') +
    '</div><div style="display:flex;gap:8px;align-items:center">' +
    '<label class="cd-mut" style="font-size:.78rem">Data</label>' +
    '<input type="date" value="' + D.dataSel + '" max="' + hoje + '" onchange="window._cdData=this.value||_biHojeLocal();_cdRender(true)" ' +
    'style="padding:5px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">' +
    (D.dataSel !== hoje ? '<button class="cd-chip" onclick="window._cdData=_biHojeLocal();_cdRender(true)">Hoje</button>' : '') +
    '<button class="cd-chip" onclick="_cdRender(true)">↻</button></div></div>';
  if (semSaldo.length) h += '<div class="cd-aviso">⚠️ Sem saldo do Sicoob para <b>' + semSaldo.map(fcEscBi).join(', ') +
    '</b> — o disponível desse(s) posto(s) não aparece' + (nomeP ? ' e o do grupo soma só os demais' : '') +
    '. O gateway do Sicoob não está gravando o saldo dessa conta.</div>';
  const fora = ps.filter(p => p.saldoHoje != null && p.vista14 > 1000 && p.banco14 < p.vista14 * 0.9);
  if (fora.length) h += '<div class="cd-aviso">🏦 <b>Conta única:</b> nos últimos 14 dias, parte da venda à vista não chegou ao Sicoob — ' +
    fora.map(p => fcEscBi(p.nome) + ': vendeu ' + _cdMoney(p.vista14) + ', chegou ' + _cdMoney(p.banco14) + ' (' + Math.round(p.banco14 / p.vista14 * 100) + '%)').join(' · ') +
    '. O que ficou no PagBank ou foi depositado em outro banco não aparece no disponível.</div>';
  // pedidos (requisições) que ainda não viraram nota
  const ped = ps.reduce((a, p) => a.concat((p.pedidos || []).map(x => Object.assign({ posto: p.nome }, x))), []);
  if (ped.length && D.ehHoje) {
    const conta = ped.filter(x => !x.tit), ja = ped.filter(x => x.tit);
    h += '<div class="cd-aviso" style="background:#16213a;border-color:#2a4a6a;color:#bfdbfe">🛢️ <b>Pedidos (Requisições de compra)</b>: ' +
      (conta.length ? conta.length + ' sem nota entram na previsão — ' + conta.map(x => (nomeP ? fcEscBi(x.posto) + ' ' : '') + 'REQ-' + String(x.r.numero).padStart(6, '0') + ' ' +
        _cdMoney(x.valor) + ' em ' + _cdDm(x.diaPrev) + (x.venc && x.venc <= D.hoje ? ' <b class="cd-ama">(vencimento previsto já passou — a nota chegou?)</b>' : '')).join(' · ') : 'nenhum pendente') +
      (ja.length ? '<br><span class="cd-mut">' + ja.length + ' já parecem ter virado título (mesmo fornecedor, valor e vencimento próximos) e não somam de novo: ' +
        ja.map(x => 'REQ-' + String(x.r.numero).padStart(6, '0') + ' ≈ ' + fcEscBi(x.tit.descricao || '') + ' ' + _cdMoney(Number(x.tit.valor))).join(' · ') +
        '. Ligue o título à requisição na tela Requisições para tirar a dúvida.</span>' : '') + '</div>';
  }
  const venc = ps.reduce((a, p) => a.concat(p.vencidas), []);
  if (venc.length && D.ehHoje) h += '<div class="cd-aviso">⏰ ' + venc.length + ' conta(s) a pagar vencida(s) nos últimos 30 dias, ' +
    _cdMoney(venc.reduce((a, p) => a + Number(p.valor || 0), 0)) + ' — não entram na previsão (podem já estar pagas sem baixa).</div>';

  // ---- cards do dia escolhido ----
  const titulo = (x.dia === hoje ? 'HOJE · caixa parcial' : x.prev ? 'PREVISÃO' : 'DIA') + ' · ' + _cdSem(x.dia) + ' ' + _cdDm(x.dia);
  h += '<div class="cd-mut" style="font-size:.76rem;margin-bottom:6px">' + titulo + '</div><div class="cd-cards">' +
    '<div class="cd-c"><div class="r">Venda bruta</div><div class="v">' + _cdMoney(x.bruta) + '</div><div class="s">' +
      (x.prev ? 'média dos 4 últimos ' + _cdSem(x.dia) : 'pista + loja') + '</div></div>' +
    '<div class="cd-c"><div class="r">Entrou na conta</div><div class="v cd-ok">' + _cdMoney(x.entrou) + '</div><div class="s">dinheiro + cartão + Pix<br>− ' +
      _cdMoney(x.taxas) + ' de taxas</div></div>' +
    '<div class="cd-c comp"><div class="r">A compensar</div><div class="v cd-roxo">' + _cdMoney(x.comp) + '</div><div class="s">' +
      'vendido no dia <b class="cd-roxo">+ ' + _cdMoney(x.vcT) + '</b><br>recebido no dia <b class="cd-ok">− ' + _cdMoney(x.rcT) + '</b><br>a prazo · frota · cheque</div></div>' +
    '<div class="cd-c"><div class="r">Despesas do dia</div><div class="v cd-err">' + _cdMoney(-x.D) + '</div><div class="s">' +
      (x.prev ? 'contas lançadas + média de saídas' : 'saídas do extrato Sicoob') + (x.O ? '<br>outros movimentos: <b class="' + (x.O > 0 ? 'cd-ok' : 'cd-err') + '">' + _cdSinal(x.O) + '</b>' : '') + '</div></div>' +
    '<div class="cd-c ' + (x.disp != null && x.disp < 0 ? 'neg' : '') + '"><div class="r">Disponível</div><div class="v' + (x.disp != null && x.disp < 0 ? ' cd-err' : '') + '">' +
      (x.disp == null ? '—' : _cdMoney(x.disp)) + '</div><div class="s">' + (x.prev ? 'saldo previsto: + ' + _cdMoney(x.semDesp) + ' que costuma entrar no Sicoob num(a) ' + _cdSem(x.dia) + ' − despesas' : x.dia === hoje ? 'saldo Sicoob agora' : 'saldo Sicoob no fim do dia') +
      (x.semSaldo ? '<br><span class="cd-ama">sem ' + x.semSaldo + ' posto(s)</span>' : '') + '</div></div></div>';

  // ---- tabela ----
  h += '<div class="cd-box"><h3>Dia a dia</h3><div class="cd-sub">Clique num dia para ver o detalhe. Itálico = previsão: venda = média dos 4 últimos dias iguais da semana; recebido = faturas que vencem × % pagas em dia; despesas = contas lançadas que vencem, ou a média de saídas desse dia da semana quando for maior; disponível = saldo + o que costuma entrar no Sicoob nesse dia da semana − despesas. A curva cai quando há contas lançadas acima do normal.</div>' +
    '<table class="cd-t"><thead><tr><th>Dia</th><th>Venda bruta</th><th>Entrou na conta</th><th>A compensar</th><th>Despesas</th><th>Outros movimentos</th><th>Disponível</th></tr></thead><tbody>';
  L.forEach(r => {
    if (r.prev && !L[L.indexOf(r) - 1].prev) h += '<tr class="sep"><td colspan="7">Próximos ' + _CD_PREV + ' dias — previsão</td></tr>';
    h += '<tr class="l ' + (r.dia === x.dia ? 'sel ' : '') + (r.dia === hoje ? 'hoje ' : '') + (r.prev ? 'prev ' : '') + (r.disp != null && r.disp < 0 ? 'neg' : '') +
      '" onclick="window._cdSel=\'' + r.dia + '\';_cdRender()"><td>' + _cdSem(r.dia) + ' ' + _cdDm(r.dia) + (r.dia === hoje ? ' <b style="color:#f97316">hoje</b>' : '') + '</td>' +
      '<td>' + _cdMoney(r.bruta) + '</td><td class="cd-ok">' + _cdMoney(r.entrou) + '</td>' +
      '<td class="cd-roxo">' + _cdMoney(r.comp) + '<small>+' + _cdMoney(r.vcT) + ' / −' + _cdMoney(r.rcT) + '</small></td>' +
      '<td class="cd-err">' + (r.D ? _cdMoney(-r.D) : '—') + '</td>' +
      '<td class="' + (r.O > 0 ? 'cd-ok' : r.O < 0 ? 'cd-err' : 'cd-mut') + '">' + (r.O ? _cdSinal(r.O) : '—') + '</td>' +
      '<td class="disp">' + (r.disp == null ? '—' : _cdMoney(r.disp)) + '</td></tr>';
  });
  h += '</tbody></table></div>';

  // ---- simular pedido ----
  if (D.ehHoje) h += _cdSimBox(ps, nomeP);
  // ---- detalhe ----
  const nm = it => nomeP && it.posto ? '<span class="cd-mut">' + fcEscBi(it.posto) + ' · </span>' : '';
  const ordem = ['din', 'deb', 'cred', 'pix', 'prazo', 'frota', 'cheque', 'haver', 'outros'];
  h += '<div class="cd-box"><h3>Detalhe de ' + _cdSem(x.dia) + ' ' + _cdDm(x.dia) + '</h3><div class="cd-det">' +
    '<div><table class="cd-t"><thead><tr><th>Venda por forma</th><th>Valor</th><th>Vai para</th></tr></thead><tbody>' +
    ordem.filter(k => x.formas[k]).map(k => '<tr><td>' + (_CD_ROT_MAQ[k] || _CD_ROT[k]) + '</td><td>' + _cdMoney(x.formas[k]) + '</td><td class="' +
      (_CD_CONTA.includes(k) ? 'cd-ok">conta' : _CD_COMP.includes(k) ? 'cd-roxo">a compensar' : 'cd-mut">' + (k === 'haver' ? 'já recebido antes' : '—')) + '</td></tr>').join('') +
    (x.formas.sobra ? '<tr><td colspan="3" class="cd-ama" style="white-space:normal;font-size:.72rem">As formas somam ' + _cdMoney(x.formas.sobra) + ' a mais que a pista + loja (cartão de venda de outro dia ou recebimento de título na maquininha).</td></tr>' : '') +
    '<tr><td class="cd-mut">− taxas da maquininha</td><td class="cd-err">' + _cdMoney(-x.taxas) + '</td><td></td></tr>' +
    '<tr class="tot"><td>Entrou na conta</td><td class="cd-ok">' + _cdMoney(x.entrou) + '</td><td></td></tr></tbody></table>' +
    (x.prev ? '' : '<div class="cd-sub" style="margin-top:8px">Conferência: créditos de venda no Sicoob neste dia (cofre, depósito, PagBank, Pix) = <b>' + _cdMoney(x.bancoVenda) +
      '</b>. O dinheiro cai no dia seguinte e o PagBank quando é transferido, então compare por semana, não por dia.</div>') + '</div>' +
    '<div><table class="cd-t"><thead><tr><th>A compensar</th><th>Vendido</th><th>Recebido</th></tr></thead><tbody>' +
    '<tr><td>Nota a prazo<br><span class="cd-mut" style="font-size:.7rem">' + (x.prev ? 'faturas que vencem × ' + Math.round((ps[0].dias.find(d => d.prev) || {}).taxaEmDia * 100 || 80) + '% pagas em dia' : 'faturas liquidadas + notas pagas no caixa') + '</span></td>' +
      '<td class="cd-roxo">+ ' + _cdMoney(x.vc.prazo) + '</td><td class="cd-ok">− ' + _cdMoney(x.rc.prazo) + '</td></tr>' +
    '<tr><td>Frota<br><span class="cd-mut" style="font-size:.7rem">repasse das operadoras (extrato)</span></td><td class="cd-roxo">+ ' + _cdMoney(x.vc.frota) + '</td><td class="cd-ok">− ' + _cdMoney(x.rc.frota) + '</td></tr>' +
    '<tr><td>Cheque<br><span class="cd-mut" style="font-size:.7rem">liberação do depósito (extrato)</span></td><td class="cd-roxo">+ ' + _cdMoney(x.vc.cheque) + '</td><td class="cd-ok">− ' + _cdMoney(x.rc.cheque) + '</td></tr>' +
    '<tr class="tot"><td>Saldo a compensar</td><td colspan="2" class="cd-roxo">' + _cdMoney(x.comp) + '</td></tr></tbody></table>' +
    '<div class="cd-sub" style="margin-top:8px">Hoje: prazo ' + _cdMoney(ps.reduce((a, p) => a + p.comp.prazo, 0)) + ' (notas e faturas abertas) · frota ' +
      _cdMoney(ps.reduce((a, p) => a + p.comp.frota, 0)) + ' e cheque ' + _cdMoney(ps.reduce((a, p) => a + p.comp.cheque, 0)) + ' estimados pelos últimos 30 dias.</div></div>' +
    '<div>' + _cdTabSaidas(x, nm) + '</div></div></div>';
  corpo.innerHTML = h;
}

function _cdTabSaidas(x, nm) {
  if (x.prev) {
    return '<table class="cd-t"><thead><tr><th>Contas que vencem</th><th>Valor</th></tr></thead><tbody>' +
      (x.desp.length ? x.desp.slice().sort((a, b) => b.valor - a.valor).map(p => '<tr><td style="white-space:normal' + (p.estimado ? ';color:#9aa0b8;font-style:italic' : '') + '">' + nm(p) +
        (p.simulado ? '<span class="cd-tag" style="background:#3a1030;color:#f472b6">SIMULAÇÃO</span>' : p.pedido ? '<span class="cd-tag" style="background:#2a2510;color:#fde047">PEDIDO</span>' :
         p.planejada ? '<span class="cd-tag" style="background:#3a1f10;color:#fb923c">PLANEJADA</span>' : '') + fcEscBi(p.descricao || '') + '</td><td class="cd-err">' + _cdMoney(-p.valor) + '</td></tr>').join('')
        : '<tr><td class="cd-mut">nenhuma</td><td></td></tr>') +
      '<tr class="tot"><td>Total</td><td class="cd-err">' + _cdMoney(-x.D) + '</td></tr></tbody></table>';
  }
  const desp = x.itens.filter(i => i.k === 'despesa'), out = x.itens.filter(i => i.k !== 'despesa' && i.k !== 'banco_venda' && !/^rec_/.test(i.k));
  const inf = i => { const t = String(i.info || '').split('|@').filter(Boolean).filter(s => !/^(Pagamento|Recebimento) Pix$|^Transferência Pix$/.test(s)).slice(0, 2).join(' · ');
    return t ? '<br><span class="cd-mut" style="font-size:.7rem">' + fcEscBi(t.slice(0, 70)) + '</span>' : ''; };
  return '<table class="cd-t"><thead><tr><th>Despesas pagas (extrato)</th><th>Valor</th></tr></thead><tbody>' +
    (desp.length ? desp.sort((a, b) => a.v - b.v).map(i => '<tr><td style="white-space:normal">' + nm(i) + fcEscBi(i.r) + inf(i) + '</td><td class="cd-err">' + _cdMoney(i.v) + '</td></tr>').join('')
      : '<tr><td class="cd-mut">nenhuma</td><td></td></tr>') +
    '<tr class="tot"><td>Total</td><td class="cd-err">' + _cdMoney(-x.D) + '</td></tr></tbody></table>' +
    '<table class="cd-t" style="margin-top:10px"><thead><tr><th>Outros movimentos (não é venda)</th><th>Valor</th></tr></thead><tbody>' +
    (out.length ? out.map(i => '<tr><td style="white-space:normal">' + nm(i) + fcEscBi(i.r) + inf(i) + '</td><td class="' + (i.k === 'neutro' ? 'cd-mut' : i.v > 0 ? 'cd-ok' : 'cd-err') + '">' +
      _cdSinal(i.v) + (i.k === 'neutro' ? ' <span style="font-size:.68rem">(não muda o disponível)</span>' : '') + '</td></tr>').join('')
      : '<tr><td class="cd-mut">nenhum</td><td></td></tr>') + '</tbody></table>';
}

// ---- monta as séries (com e sem a simulação, para comparar) ----
function _cdMontar() {
  const D = window._cdD, sim = window._cdSim || [];
  window._cdSim = [];
  window._cdPostosBase = D.emp.map(e => _cdSeriePosto(D, e));
  window._cdSim = sim;
  window._cdPostos = sim.length ? D.emp.map(e => _cdSeriePosto(D, e)) : window._cdPostosBase;
}

// menor saldo previsto (30 dias) de um conjunto de postos
function _cdMenor(postos) {
  const L = _cdJuntar(postos).filter(r => r.prev && r.disp != null);
  return L.length ? L.reduce((m, r) => (r.disp < m.disp ? r : m)) : null;
}

function _cdSimBox(ps, grupo) {
  const hoje = _biHojeLocal(), sim = window._cdSim || [];
  const opts = (grupo ? window._cdPostos : ps).map(p => '<option value="' + p.eid + '">' + fcEscBi(p.nome) + '</option>').join('');
  let h = '<div class="cd-box"><h3>🧮 Simular um pedido</h3><div class="cd-sub">Coloca um pagamento na previsão e mostra o efeito no saldo antes de você fechar a compra. Não grava nada.</div>' +
    '<div class="cd-sim"><div><label>Posto</label><select id="cd-sim-posto">' + opts + '</select></div>' +
    '<div><label>Valor (R$)</label><input id="cd-sim-valor" type="number" step="0.01" min="0" placeholder="25000" style="width:130px"></div>' +
    '<div><label>Vencimento do boleto</label><input id="cd-sim-dia" type="date" min="' + _cdSoma(hoje, 1) + '" max="' + _cdSoma(hoje, _CD_PREV) + '" value="' + _cdSoma(hoje, 10) + '"></div>' +
    '<div><label>Descrição</label><input id="cd-sim-desc" placeholder="ex.: carga S10 5.000 L" style="width:180px"></div>' +
    '<button class="cd-btn" onclick="_cdSimular()">Simular</button>' +
    (sim.length ? '<button class="cd-btn sec" onclick="_cdSimLimpar()">Limpar simulação</button>' : '') +
    '<button class="cd-btn sec" onclick="navegarPara(\'requisicoes\')" title="Abre a tela Requisições para lançar o pedido de verdade">Lançar como requisição →</button></div>';
  if (sim.length) {
    const ids = new Set(sim.map(s => s.eid));
    const linha = (rot, antes, depois) => {
      if (!antes || !depois) return '';
      const piora = depois.disp < antes.disp - 0.5;
      return '<tr><td>' + rot + '</td><td>' + _cdMoney(antes.disp) + ' <span class="cd-mut">(' + _cdDm(antes.dia) + ')</span></td><td class="' + (depois.disp < 0 ? 'cd-err' : 'cd-ok') + '"><b>' +
        _cdMoney(depois.disp) + '</b> <span class="cd-mut">(' + _cdDm(depois.dia) + ')</span></td><td>' + (depois.disp < 0 ? '<b class="cd-err">não cabe</b>' : piora ? 'cabe' : 'cabe, sem mudar o menor saldo') + '</td></tr>';
    };
    const B = window._cdPostosBase, A = window._cdPostos;
    h += '<div style="margin-top:10px"><table class="cd-t"><thead><tr><th>Menor saldo nos próximos ' + _CD_PREV + ' dias</th><th>Sem o pedido</th><th>Com o pedido</th><th></th></tr></thead><tbody>' +
      [...ids].map(eid => linha(fcEscBi((A.find(p => p.eid === eid) || {}).nome || ''), _cdMenor(B.filter(p => p.eid === eid)), _cdMenor(A.filter(p => p.eid === eid)))).join('') +
      linha('🏢 Grupo', _cdMenor(B), _cdMenor(A)) + '</tbody></table>' +
      '<div class="cd-sub" style="margin-top:6px">Na simulação: ' + sim.map(s => fcEscBi((A.find(p => p.eid === s.eid) || {}).nome || '') + ' ' + _cdMoney(s.valor) + ' em ' + _cdDm(s.dia) + (s.desc ? ' (' + fcEscBi(s.desc) + ')' : '')).join(' · ') +
      '. Os dias com o pedido aparecem marcados na tabela acima.</div></div>';
  }
  return h + '</div>';
}

function _cdSimular() {
  const eid = document.getElementById('cd-sim-posto').value, valor = Number(document.getElementById('cd-sim-valor').value);
  const dia = document.getElementById('cd-sim-dia').value, desc = document.getElementById('cd-sim-desc').value.trim();
  const hoje = _biHojeLocal();
  if (!(valor > 0)) { alert('Informe o valor do pedido.'); return; }
  if (!dia || dia <= hoje || dia > _cdSoma(hoje, _CD_PREV)) { alert('O vencimento precisa estar nos próximos ' + _CD_PREV + ' dias.'); return; }
  window._cdSim = (window._cdSim || []).concat([{ eid, valor, dia, desc }]);
  _cdMontar(); window._cdSel = dia; _cdRender();
}
function _cdSimLimpar() { window._cdSim = []; _cdMontar(); _cdRender(); }
