// ============================================================
// 💳 CARTÕES — pré-conferência das taxas ANTES da Conciliação (11/10/2026, pedido do Ronan)
// ------------------------------------------------------------
// "todos os recebimentos via cartão vão passar por ela; o objetivo é analisarmos as taxas e
//  deixar explícito se alguma taxa ou pagamento está divergente do acordado com as adquirentes"
// "o valor que vai para essa aba tem que vir necessariamente do fechamento de caixa, não
//  puxar direto do banco"  (correção dele no mesmo dia)
//
// FONTE = o CAIXA, como o F.Caixa: os CUPONS (oct_pdv_vendas.pagamentos em cartão/Pix, um por
// pagamento) + o que ainda está na FILA sem cupom (oct_fila_transmissao status 'fila'). A linha
// da fila do mesmo cupom (numero_nfce) traz a bandeira e a taxa que a maquininha informou ao casar.
// (12/10: no SEVEN a fila só passou a ser espelhada em 08/10 — os cupons de 07/10 ficavam de fora.)
// O extrato EDI do PagBank (oct_cartao_transacoes, baixado pelo servidor) entra só
// como RETORNO da adquirente: completa taxa/líquido/parcelas/previsão de pagamento do item do
// caixa e aponta venda que está na maquininha e não no caixa. Taxas negociadas: oct_cartao_taxas
// (Formas de Pagamento › Taxas dos cartões). Conferência de cada item: oct_cartao_caixa.
// Depois de conferir, "Enviar para a Conciliação" grava no livro da conta PagBank (bruto como
// crédito e taxa como débito, por venda, na data prevista de pagamento).
// CARTÃO FROTA (17/10/2026, pedido do Ronan: "eles também são cartões que têm que ser conferidos e enviados
// para as contas certas"): o pagamento "CARTÃO FROTA" (código 03) caía como Crédito e tentava casar com o EDI do
// PagBank. Agora é a forma 'frota', com a OPERADORA (pagamento.frota.operadora) no lugar da bandeira; não casa com
// o EDI (a operadora não manda retorno) — vale a taxa do contrato (Taxas negociadas, forma "Cartão frota",
// adquirente = operadora) e vai para a conta da operadora (a da taxa; senão a conta que leva o nome dela, ex.:
// "CARTÃO TICKETLOG - Sicoob UFV"; senão a da forma CARTÃO FROTA em Formas de Pagamento). O F.Caixa deixou de
// lançar o total da frota no livro (contaria em dobro, como o cartão).
// ============================================================
// Filtros: _CTZ.* é o que está APLICADO na tabela; _CTZ.p é o que está nos campos (só vira filtro ao 🔍 Pesquisar / Enter).
const _CTZ = { p: null, de: null, ate: null, forma: '', bandeira: '', status: '', conf: '', caixa: 'conf', busca: '',
  sel: new Set(), itens: [], fora: [], txs: [], taxas: [], contas: [], formasFrota: [], turnos: [], confs: {}, controle: null, carregando: false,
  operadoras: [] };
const _CTZ_FORMA = { credito: 'Crédito', debito: 'Débito', pix: 'Pix', frota: 'Frota' };
const _CTZ_STATUS = {
  ok:          { rot: '✓ confere',                 cor: '#7ee2a0' },
  maior:       { rot: '⚠ taxa maior',              cor: '#f87171' },
  menor:       { rot: '⚠ taxa menor',              cor: '#fbbf24' },
  sem_regra:   { rot: '? sem taxa cadastrada',     cor: '#8892a0' },
  sem_retorno: { rot: '⚠ maquininha não informou', cor: '#f0b45c' },
  contrato:    { rot: '🚛 taxa do contrato',       cor: '#93c5fd' },   // frota: a operadora não manda retorno; vale a taxa cadastrada
};
// mesma lista do F.Caixa (_fcGrupoNome) e do sync_pagamentos_tecnox.py: o nome da forma diz que é cartão frota
const _CTZ_FROTA_RE = /frota|prime|fit|ticket|good|ecx|valecard|vale card|agilli|neo|sem parar|abastece|wex/;
const _CTZ_TOL = 0.01;          // centavo de arredondamento da adquirente
const _CTZ_CASA_MIN = 20;       // caixa × EDI: mesma venda = mesmo valor e forma, até 20 min de diferença
const _CTZ_CASA_LOTE_MIN = 120; // cupom emitido em lote / relógio da maquininha: mesmo valor, forma e bandeira, até 2 h
const _CTZ_CASA_FORMA_MIN = 60; // forma trocada (caixa Débito × maquininha Pix): mesmo valor, até 1 h
const _CTZ_CASA_CENT = 10;      // cupom × maquininha com poucos centavos de diferença (cupom recalcula litros × preço): até 10 centavos
// Passos do casamento, do mais seguro ao mais frouxo. Cada passo só vê o que os anteriores deixaram, e dentro dele as
// duplas mais próximas no tempo vencem (a ordem dos itens na tela não decide quem fica com a transação).
const _CTZ_PASSOS = [
  { tipo: 'exato',   forma: 'igual',     band: 'compat',  dc: 0,             min: _CTZ_CASA_MIN },
  { tipo: 'horario', forma: 'igual',     band: 'compat',  dc: 0,             min: _CTZ_CASA_LOTE_MIN },
  { tipo: 'forma',   forma: 'diferente', band: 'pix_ou_compat', dc: 0,       min: _CTZ_CASA_FORMA_MIN },
  { tipo: 'valor',   forma: 'igual',     band: 'compat',  dc: _CTZ_CASA_CENT, min: _CTZ_CASA_MIN },
  { tipo: 'forma',   forma: 'diferente', band: 'pix_ou_compat', dc: _CTZ_CASA_CENT, min: _CTZ_CASA_MIN },   // forma trocada E centavos
];

function _ctzEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ctzNum(v, dec) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec }); }
function _ctzDt(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
function _ctzIso(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function _ctzDias(a, b) { return (!a || !b) ? null : Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 864e5); }
// a fila do núcleo grava a hora LOCAL com "+00:00" falso (ver fechamento_caixa.js): tira o fuso e lê como local
function _ctzTsLocal(iso) { const s = String(iso || '').replace(/(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/, ''); const t = Date.parse(s); return isNaN(t) ? null : t; }
function _ctzDiaLocal(iso) { return String(iso || '').slice(0, 10); }
function _ctzHora(iso) { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; }
function _ctzSomaDias(iso, n) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + Number(n || 0)); return _ctzIso(d); }

// ---------- puras ----------
function ctzFormaDe(f) {
  const n = String((f && (f.forma_nome || f.nome)) || '').toLowerCase(); const c = String((f && f.forma) || '').padStart(2, '0');
  // FROTA antes de tudo: "CARTÃO FROTA" sai com código 03 e virava Crédito (17/10/2026)
  if (_CTZ_FROTA_RE.test(n) || (f && f.secao === 'frota')) return 'frota';
  if (/pix/.test(n) || ['17', '18', '19'].includes(c)) return 'pix';
  if (/déb|deb/.test(n) || c === '04') return 'debito';
  if (/créd|cred/.test(n) || c === '03') return 'credito';
  return null;
}
function ctzBruto(f) {
  if (f.valor_final != null && Number(f.valor_final) > 0) return Math.round(Number(f.valor_final) * 100) / 100;
  return Math.round((Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)) * 100) / 100;
}
// turno do item: pelo turno_id; sem ele (postos v2), pela janela de abertura/fechamento
function ctzTurnoDe(f, turnos) {
  if (f.turno_id) { const t = (turnos || []).find(x => x.id === f.turno_id); if (t) return t; }
  const ts = _ctzTsLocal(f.ocorrido_em);
  if (ts == null) return null;
  return (turnos || []).find(t => { const a = Date.parse(t.aberto_em), b = t.fechado_em ? Date.parse(t.fechado_em) : Infinity; return ts >= a - 5 * 60e3 && ts <= b + 5 * 60e3; }) || null;
}
// A adquirente / operadora pela chave: "FitCard / Prime" (PDV), "fitcard" (taxa cadastrada) e "Prime" são a mesma.
// Frota sem operadora informada (cupom espelhado do TecnoX) = 'frota' (vale a taxa genérica da frota).
function _ctzAdqChave(s) {
  const n = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (!n) return '';
  if (/ticket|edenred/.test(n)) return 'ticketlog';
  if (/fit|prime/.test(n)) return 'fitcard';
  if (/valecard/.test(n)) return 'valecard';
  if (/^agil/.test(n)) return 'agilli';
  if (/semparar/.test(n)) return 'semparar';
  if (/good/.test(n)) return 'goodcard';
  if (/^(frota|cartaofrota|outra|outro|outras)$/.test(n)) return 'frota';
  return n;
}
// A regra que vale: mesma adquirente e forma, parcelas na faixa, vigente na data da venda; bandeira
// igual ou "qualquer"; do posto ou da rede. A mais específica ganha (bandeira certa > qualquer;
// do posto > da rede; vigência mais nova). Frota: adquirente = operadora; sem regra da operadora vale a
// genérica da frota (adquirente "frota").
function ctzRegra(tx, taxas) {
  const forma = String(tx.forma || '').toLowerCase();
  const band = String(tx.bandeira || '').trim().toLowerCase();
  const parc = Number(tx.parcelas || 1);
  const dia = String(tx.data_venda || '');
  const adq = _ctzAdqChave(tx.adquirente || 'pagbank');
  const adqOk = r => { const k = _ctzAdqChave(r.adquirente || 'pagbank'); return k === adq || (forma === 'frota' && k === 'frota'); };
  const cands = (taxas || []).filter(r => r && r.ativo !== false
    && adqOk(r)
    && String(r.forma || '').toLowerCase() === forma
    && parc >= Number(r.parcelas_de || 1) && parc <= Number(r.parcelas_ate || r.parcelas_de || 1)
    && (!r.vigencia_de || String(r.vigencia_de) <= dia) && (!r.vigencia_ate || String(r.vigencia_ate) >= dia)
    && (!String(r.bandeira || '').trim() || String(r.bandeira).trim().toLowerCase() === band)
    && (!r.empresa_id || r.empresa_id === tx.empresa_id));
  cands.sort((a, b) => ((_ctzAdqChave(b.adquirente || 'pagbank') === adq ? 1 : 0) - (_ctzAdqChave(a.adquirente || 'pagbank') === adq ? 1 : 0))
    || ((String(b.bandeira || '').trim() ? 1 : 0) - (String(a.bandeira || '').trim() ? 1 : 0))
    || ((b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0))
    || String(b.vigencia_de || '').localeCompare(String(a.vigencia_de || '')));
  return cands[0] || null;
}
// cobrado (o que a maquininha informou) × esperado (bruto × % + tarifa fixa). Tolerância de 1 centavo.
// cobrada == null = a maquininha não informou taxa nenhuma para esta venda (e-mail sem taxa, ou sem retorno).
// Frota nunca tem retorno: com regra = 'contrato' (vale a taxa cadastrada); sem regra = 'sem_regra'.
function ctzAvaliar(it, regra, tol) {
  tol = tol == null ? _CTZ_TOL : tol;
  const bruto = Number(it.valor_bruto || 0);
  const cobrada = it.taxa_cobrada == null ? null : Math.round(Number(it.taxa_cobrada) * 100) / 100;
  const pctCobrada = (cobrada != null && bruto > 0) ? cobrada / bruto * 100 : null;
  const prazo = _ctzDias(it.data_venda, it.data_prevista_pagamento);
  const base = { cobrada, pctCobrada, prazo, regra: regra || null, esperada: null, pctEsperada: null, dif: null, prazoDiverge: false };
  const frota = it.forma === 'frota';
  if (!regra) return Object.assign(base, { status: (cobrada == null && !frota) ? 'sem_retorno' : 'sem_regra' });
  const esperada = Math.round((bruto * Number(regra.taxa_pct || 0) / 100 + Number(regra.tarifa_fixa || 0)) * 100) / 100;
  base.esperada = esperada; base.pctEsperada = Number(regra.taxa_pct || 0);
  if (cobrada == null) return Object.assign(base, { status: frota ? 'contrato' : 'sem_retorno' });
  const dif = Math.round((cobrada - esperada) * 100) / 100;
  const prazoDiverge = regra.prazo_dias != null && prazo != null && Number(regra.prazo_dias) !== prazo;
  return Object.assign(base, { dif, prazoDiverge, status: Math.abs(dif) <= tol + 1e-9 ? 'ok' : dif > 0 ? 'maior' : 'menor' });
}
// A bandeira pela FAMÍLIA: o débito da Mastercard é "Maestro", o da Visa é "Visa Electron" — o caixa grava o nome do
// cartão e o EDI o do arranjo (DEBIT_MASTERCARD), e antes disso eram "bandeiras diferentes" (24 de 71 em 08/10 no SEVEN).
function _ctzBandeiraChave(b) {
  const s = String(b || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  if (!s) return '';
  if (/maestro|master/.test(s)) return 'mastercard';
  if (/visa/.test(s)) return 'visa';
  if (/^elo/.test(s)) return 'elo';
  if (/amex|americanexpress/.test(s)) return 'amex';
  if (/hiper/.test(s)) return 'hipercard';
  return s;
}
// casa cada item do caixa com a transação do EDI, em passos (ver _CTZ_PASSOS): 1) mesma forma/valor/bandeira em até 20 min;
// 2) o mesmo até 2 h (cupom emitido em lote); 3) forma trocada na maquininha (caixa Débito × Pix) com o mesmo valor em até 1 h;
// 4) poucos centavos de diferença entre cupom e maquininha, mesma forma e bandeira em até 20 min.
// Cada transação serve a um item só; dentro de um passo, a dupla mais próxima no tempo ganha.
// it.casamento = { tipo, min (valor absoluto), dt (min; + = a maquininha registrou depois), dv (maquininha − caixa, R$) }.
function ctzCasarEdi(itens, txs) {
  const livres = (txs || []).map(t => ({ t, ts: Date.parse(t.recebido_em), usado: false, cents: Math.round(Number(t.valor_bruto || 0) * 100), band: _ctzBandeiraChave(t.bandeira), forma: String(t.forma || '') }));
  const porCents = new Map();
  livres.forEach(c => { if (isNaN(c.ts)) return; const a = porCents.get(c.cents); if (a) a.push(c); else porCents.set(c.cents, [c]); });
  const pend = [];
  (itens || []).forEach(it => {
    it.transacao = null; it.casamento = null;
    if (it.forma === 'frota') return;   // frota não passa pela maquininha do PagBank: nunca casa com o EDI
    const ts = _ctzTsLocal(it.ocorrido_em);
    if (ts == null) return;
    pend.push({ it, ts, cents: Math.round(Number(it.valor_bruto || 0) * 100), band: _ctzBandeiraChave(it.bandeira), feito: false });
  });
  _CTZ_PASSOS.forEach(ps => {
    const pares = [];
    pend.forEach((p, ordem) => {
      if (p.feito) return;
      for (let d = -ps.dc; d <= ps.dc; d++) {
        (porCents.get(p.cents + d) || []).forEach(c => {
          if (c.usado) return;
          const mesmaForma = c.forma === p.it.forma;
          if (ps.forma === 'igual' ? !mesmaForma : mesmaForma) return;
          const compat = !p.band || !c.band || p.band === c.band;
          if (ps.band === 'compat' ? !compat : !(compat || c.forma === 'pix' || p.it.forma === 'pix')) return;
          const dt = (c.ts - p.ts) / 60e3;
          if (Math.abs(dt) > ps.min) return;
          pares.push({ p, c, dt, dv: d, custo: Math.abs(dt) + Math.abs(d) * 0.5, ordem });
        });
      }
    });
    pares.sort((a, b) => (a.custo - b.custo) || (a.ordem - b.ordem));
    pares.forEach(x => {
      if (x.p.feito || x.c.usado) return;
      x.p.feito = true; x.c.usado = true;
      x.p.it.transacao = x.c.t;
      x.p.it.casamento = { tipo: ps.tipo, min: Math.round(Math.abs(x.dt)), dt: Math.round(x.dt), dv: Math.round((x.c.cents - x.p.cents)) / 100 };
    });
  });
  return livres.filter(c => !c.usado).map(c => c.t);   // o que a maquininha tem e o caixa não
}
// o aviso do casamento que NÃO foi exato (a coluna EDI/NSU mostra): null quando casou igualzinho
function ctzCasamentoAviso(it) {
  const c = it && it.casamento, t = it && it.transacao;
  if (!c || !t || c.tipo === 'exato') return null;
  const quando = c.min ? `${c.min} min ${c.dt > 0 ? 'depois' : 'antes'} do horário do cupom` : 'no mesmo horário';
  if (c.tipo === 'horario') return { txt: `⏱ ${c.min} min`, cor: '#fbbf24', title: `Mesmo valor, forma e bandeira; a maquininha registrou a venda ${quando} (cupom emitido depois / relógio da maquininha).` };
  if (c.tipo === 'forma') return { txt: `⚠ maquininha: ${_CTZ_FORMA[t.forma] || t.forma}`, cor: '#f87171', title: `No caixa a venda está como ${_CTZ_FORMA[it.forma_caixa || it.forma] || it.forma_caixa || it.forma}, mas a maquininha registrou ${_CTZ_FORMA[t.forma] || t.forma} (${c.dv ? 'valor ' + _ctzNum(Math.abs(c.dv)) + ' ' + (c.dv > 0 ? 'maior' : 'menor') + ' na maquininha' : 'mesmo valor'}, ${quando}). A taxa é avaliada pela forma da maquininha — confira o recebimento no caixa.` };
  if (c.tipo === 'valor') return { txt: `≈ ${c.dv > 0 ? '+' : '−'}R$ ${_ctzNum(Math.abs(c.dv))}`, cor: '#fbbf24', title: `Valor do cupom R$ ${_ctzNum(it.valor_bruto)} × valor na maquininha R$ ${_ctzNum(t.valor_bruto)} (diferença de centavos, ${quando}).` };
  return null;
}
// o item da aba a partir de uma linha da FILA ainda sem cupom (+ turno)
function ctzItem(f, turno, taxas, empresaId) {
  const it = {
    id: f.id, empresa_id: empresaId, adquirente: 'pagbank', forma: ctzFormaDe(f), bandeira: f.bandeira || null,
    data_venda: _ctzDiaLocal(f.ocorrido_em), hora: _ctzHora(f.ocorrido_em), ocorrido_em: f.ocorrido_em,
    valor_bruto: ctzBruto(f), taxa_fila: Number(f.taxa || 0) > 0 ? Math.round(Number(f.taxa) * 100) / 100 : null,
    descricao: f.descricao || '', litros: Number(f.litros || 0), vendedor: f.vendedor || '', status_fila: f.status || '', nfce: f.numero_nfce || null, origem: 'fila',
    turno, turno_num: turno ? turno.numero : null, caixa_confirmado: !!(turno && turno.conferido_em),
    parcelas: 1, taxa_cobrada: null, data_prevista_pagamento: null, nsu: null, transacao: null,
  };
  return it;
}
// hora LOCAL do cupom: o abastecimento (dados.ocorrido_em, hora local) ou a emissão (data_venda, UTC de verdade)
function _ctzHoraCupom(v) {
  const it0 = (v.itens || []).find(x => x && x.dados && x.dados.ocorrido_em);
  if (it0) return String(it0.dados.ocorrido_em).slice(0, 19);
  const d = new Date(v.data_venda); if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// os itens da aba a partir de um CUPOM: um por pagamento em cartão/Pix. A linha da fila do mesmo
// cupom (numero_nfce; com mais de uma, a de valor igual) dá a bandeira e a taxa da maquininha.
function ctzItensDoCupom(v, filaDoCupom, turnos, empresaId) {
  if (String(v.status || '').toLowerCase() === 'cancelada') return [];
  const pags = Array.isArray(v.pagamentos) ? v.pagamentos : [];
  const filas = (filaDoCupom || []).slice();
  const local = _ctzHoraCupom(v);
  const turno = (v.turno_id && (turnos || []).find(x => x.id === v.turno_id)) || ctzTurnoDe({ ocorrido_em: local }, turnos);
  const itens = (v.itens || []).filter(Boolean);
  const descr = itens.map(i => i.desc || i.descricao || '').filter(Boolean).join(' + ');
  const litros = itens.filter(i => i.tipo === 'abastecimento').reduce((s, i) => s + Number(i.qtd || 0), 0);
  const out = [];
  pags.forEach((p, i) => {
    const forma = ctzFormaDe(p);
    if (!forma) return;
    const valor = Math.round(Number(p.valor || 0) * 100) / 100;
    if (!(valor > 0)) return;
    // frota: a fila (maquininha) não tem nada dela — a linha de mesmo número é de outra venda (numeração diferente)
    const frota = forma === 'frota';
    let fi = frota ? -1 : filas.findIndex(f => Math.abs(ctzBruto(f) - valor) < 0.005);
    if (!frota && fi < 0 && filas.length === 1 && pags.length === 1) fi = 0;
    const f = fi >= 0 ? filas.splice(fi, 1)[0] : null;
    const formaFila = f ? ctzFormaDe(f) : null;
    const fr = (frota && p.frota) || {};
    const operadora = frota ? (String(fr.operadora || p.operadora || p.bandeira || '').trim() || null) : null;
    out.push({
      id: f ? f.id : `venda:${v.id}:${i}`, venda_id: v.id, empresa_id: empresaId, adquirente: frota ? (_ctzAdqChave(operadora) || 'frota') : 'pagbank',
      forma: formaFila || forma, bandeira: frota ? operadora : ((f && f.bandeira) || p.bandeira || null),
      data_venda: local.slice(0, 10), hora: local.slice(11, 16), ocorrido_em: local,
      valor_bruto: valor, taxa_fila: f && Number(f.taxa || 0) > 0 ? Math.round(Number(f.taxa) * 100) / 100 : null,
      descricao: descr, litros, vendedor: v.vendedor || v.operador || (f && f.vendedor) || '', status_fila: f ? f.status : 'cupom', nfce: v.numero || null, origem: 'cupom',
      turno, turno_num: turno ? turno.numero : null, caixa_confirmado: !!(turno && turno.conferido_em),
      parcelas: 1, taxa_cobrada: null, data_prevista_pagamento: null, nsu: null, transacao: null,
      autorizacao: frota && fr.autorizacao && String(fr.autorizacao).trim() !== '0' ? String(fr.autorizacao).trim() : null, placa: frota ? (fr.placa || null) : null,
    });
  });
  return out;
}
function ctzCompletar(it, taxas) {
  const tx = it.transacao;
  if (tx) {
    it.parcelas = Number(tx.parcelas || 1);
    it.taxa_cobrada = Math.round((Number(tx.taxa_valor || 0) + Number(tx.tarifa_valor || 0)) * 100) / 100;
    it.data_prevista_pagamento = tx.data_prevista_pagamento || null;
    it.nsu = tx.nsu || null;
    // vale o que a ADQUIRENTE registrou (a taxa negociada é por bandeira/forma dela): Maestro vira Mastercard, Débito vira Pix…
    if (tx.bandeira && it.bandeira && String(tx.bandeira).toLowerCase() !== String(it.bandeira).toLowerCase()) it.bandeira_caixa = it.bandeira;   // Maestro (caixa) × Mastercard (adquirente)
    if (tx.bandeira) it.bandeira = tx.bandeira;
    if (tx.forma && tx.forma !== it.forma) { it.forma_caixa = it.forma; it.forma = tx.forma; }
  } else {
    it.taxa_cobrada = it.forma === 'frota' ? null : it.taxa_fila;      // a taxa que a maquininha informou ao casar (EDI); e-mail não traz
  }
  it.regra = ctzRegra(it, taxas);
  if (!it.data_prevista_pagamento && it.regra && it.regra.prazo_dias != null) it.data_prevista_pagamento = _ctzSomaDias(it.data_venda, it.regra.prazo_dias);
  it._av = ctzAvaliar(it, it.regra);
  it._av.formaDiverge = !!(it.casamento && it.casamento.tipo === 'forma');
  it._av.aviso = ctzCasamentoAviso(it);
  // a taxa que vai para o livro e para o líquido: a cobrada; na frota sem retorno, a do contrato
  it.taxa_livro = it.taxa_cobrada != null ? it.taxa_cobrada : (it._av.status === 'contrato' ? it._av.esperada : null);
  it.valor_liquido = it.taxa_livro == null ? null : Math.round((it.valor_bruto - it.taxa_livro) * 100) / 100;
  return it;
}
function ctzResumo(lista) {
  const r = { n: 0, bruto: 0, taxas: 0, liquido: 0, esperado: 0, dif: 0, nDiv: 0, difDiv: 0, nSem: 0, nSemRet: 0, nContrato: 0, nConf: 0, nLivro: 0, nPrazo: 0, nCaixa: 0, nForma: 0, nAprox: 0, porForma: {} };
  (lista || []).forEach(x => {
    const a = x._av || {};
    r.n++; r.bruto += Number(x.valor_bruto || 0);
    if (x.taxa_livro != null) { r.taxas += Number(x.taxa_livro); r.liquido += Number(x.valor_liquido || 0); } else r.liquido += Number(x.valor_bruto || 0);
    if (a.status === 'sem_regra') r.nSem++;
    else if (a.status === 'sem_retorno') r.nSemRet++;
    else if (a.status === 'contrato') r.nContrato++;
    else { r.esperado += a.esperada || 0; r.dif += a.dif || 0; if (a.status !== 'ok') { r.nDiv++; r.difDiv += a.dif || 0; } }
    if (a.prazoDiverge) r.nPrazo++;
    if (a.formaDiverge) r.nForma++;
    if (x.casamento && x.casamento.tipo !== 'exato' && x.transacao) r.nAprox++;
    if (x.conferido) r.nConf++;
    if (x.livro_em) r.nLivro++;
    if (x.caixa_confirmado) r.nCaixa++;
    const f = _CTZ_FORMA[String(x.forma || '')] || 'Outro';
    const pf = r.porForma[f] = r.porForma[f] || { n: 0, bruto: 0 };
    pf.n++; pf.bruto += Number(x.valor_bruto || 0);
  });
  ['bruto', 'taxas', 'liquido', 'esperado', 'dif', 'difDiv'].forEach(k => { r[k] = Math.round(r[k] * 100) / 100; });
  r.pctMedia = r.bruto > 0 ? r.taxas / r.bruto * 100 : 0;
  return r;
}
// linhas do livro (puras): bruto como crédito e taxa como débito, por venda, na data prevista
// (frota: taxa do contrato, porque a operadora deposita o líquido e não manda retorno)
function ctzLinhasLivro(it, contaId, autor, agora) {
  const data = it.data_prevista_pagamento || it.data_venda;
  const frota = it.forma === 'frota';
  const forma = frota ? 'Cartão frota' : (_CTZ_FORMA[String(it.forma || '')] || 'Cartão');
  const quem = [forma.toUpperCase(), it.bandeira, Number(it.parcelas || 1) > 1 ? it.parcelas + 'x' : ''].filter(Boolean).join(' ');
  const venda = `venda ${_ctzDt(it.data_venda)}${it.hora ? ' ' + it.hora : ''}`;
  const detalhe = [venda, it.turno_num ? 'turno ' + it.turno_num : '', it.nsu ? 'NSU ' + it.nsu : '', it.autorizacao ? 'aut. ' + it.autorizacao : '', it.placa ? 'placa ' + it.placa : '',
    frota && it._av && it._av.status === 'contrato' ? 'taxa do contrato' : '', it.descricao ? it.descricao : ''].filter(Boolean).join(' · ');
  const comum = { empresa_id: it.empresa_id, conta_id: contaId, data, autor: autor || null, atualizado_em: agora, documento: it.nsu || (it.autorizacao ? 'Aut. ' + it.autorizacao : null) || (it.nfce ? 'NFC-e ' + it.nfce : null) };
  // o que o banco recebe é o valor da MAQUININHA: com centavos de diferença entre cupom e máquina, o livro segue a máquina
  const bruto = (it.transacao && it.casamento && it.casamento.tipo === 'valor') ? Number(it.transacao.valor_bruto || 0) : Number(it.valor_bruto || 0);
  const out = [Object.assign({}, comum, { natureza: 'C', valor: bruto, tipo: frota ? 'venda_frota' : 'venda_cartao', descricao: (frota ? '' : 'CARTÃO ') + quem, detalhe, origem: 'cartoes', origem_id: it.id })];
  const tl = it.taxa_livro !== undefined ? it.taxa_livro : it.taxa_cobrada;
  const taxa = tl == null ? 0 : Math.round(Number(tl) * 100) / 100;
  if (taxa > 0) out.push(Object.assign({}, comum, { natureza: 'D', valor: taxa, tipo: frota ? 'taxa_frota' : 'taxa_cartao', descricao: 'TAXA ' + quem, detalhe, origem: 'cartoes_taxa', origem_id: it.id }));
  return out.filter(l => l.valor > 0);
}
// as operadoras que o NOME de uma conta cita: "CARTÃO AGILLE/VALECARD - Inter" → {agilli, valecard}; "Sicoob" → {}
function _ctzOperadorasDoNome(nome) {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const s = new Set();
  if (/ticket|edenred/.test(n)) s.add('ticketlog');
  if (/fitcard|prime/.test(n)) s.add('fitcard');
  if (/valecard/.test(n)) s.add('valecard');
  if (/agil/.test(n)) s.add('agilli');
  if (/semparar/.test(n)) s.add('semparar');
  if (/goodcard/.test(n)) s.add('goodcard');
  return s;
}
// a conta do livro de cada recebimento: a da taxa negociada (se for do posto) manda; senão cartão/Pix → PagBank e
// frota → a da operadora: forma de frota com o nome dela (Formas de Pagamento › "Conta onde o valor entra"), senão a
// CONTA que leva o nome dela (17/10/2026, Ronan: "cada cartão cai em um banco diferente" — contas "CARTÃO TICKETLOG -
// Sicoob UFV", "CARTÃO FITCARD - Sicoob BH", "CARTÃO AGILLE/VALECARD - Inter"), senão a da forma CARTÃO FROTA genérica.
// null = sem conta (não envia).
function ctzContaDoItem(it, contas, formasFrota) {
  const ativa = id => (contas || []).find(c => Number(c.id) === Number(id)) || null;
  const daRegra = it && it.regra && it.regra.conta_id ? ativa(it.regra.conta_id) : null;
  if (daRegra) return daRegra;
  if (!it || it.forma !== 'frota') return (contas || []).find(c => c.tipo === 'pagbank') || null;
  const fs = (formasFrota || []).filter(f => f && f.ativo !== false && f.conta_id && ativa(f.conta_id))
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const chave = _ctzAdqChave(it.bandeira);
  const conhecida = chave && chave !== 'frota';
  const daOperadora = conhecida ? fs.find(f => _ctzAdqChave(f.nome) === chave) : null;
  if (daOperadora) return ativa(daOperadora.conta_id);
  const pelaConta = conhecida ? (contas || []).find(c => _ctzOperadorasDoNome(c.nome).has(chave)) : null;
  if (pelaConta) return pelaConta;
  const generica = fs.find(f => _ctzAdqChave(f.nome) === 'frota');   // nunca a conta de OUTRA operadora
  return generica ? ativa(generica.conta_id) : null;
}

// ---------- tela ----------
async function moduloCartoes() {
  const conteudo = document.getElementById('conteudo');
  if (!podeOuAvisa('cartoes.ver')) { conteudo.innerHTML = ''; return; }
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando cartões...</p>';
  if (!_CTZ.de) Object.assign(_CTZ, _ctzFiltrosPadrao());
  _CTZ.p = _ctzFiltrosAplicados();
  await _ctzCarregar();
}
const _CTZ_CAMPOS = ['de', 'ate', 'caixa', 'forma', 'bandeira', 'status', 'conf', 'busca'];
function _ctzFiltrosPadrao() {
  const h = new Date(); const d = new Date(h); d.setDate(d.getDate() - 7);
  return { de: _ctzIso(d), ate: _ctzIso(h), caixa: 'conf', forma: '', bandeira: '', status: '', conf: '', busca: '' };
}
function _ctzFiltrosAplicados() { const o = {}; _CTZ_CAMPOS.forEach(k => { o[k] = _CTZ[k]; }); return o; }
function _ctzPendente() { return !!_CTZ.p && _CTZ_CAMPOS.some(k => String(_CTZ.p[k] ?? '') !== String(_CTZ[k] ?? '')); }
function _ctzEid() { return (typeof empresaAtiva === 'function') ? empresaAtiva() : null; }
async function _ctzTudo(fn) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await fn(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function _ctzCarregar() {
  const eid = _ctzEid();
  if (!eid) { document.getElementById('conteudo').innerHTML = '<p style="color:#f87171;padding:20px">Selecione a empresa.</p>'; return; }
  _CTZ.carregando = true;
  try {
    const deTs = _CTZ.de + 'T00:00:00', ateTs = _CTZ.ate + 'T23:59:59';
    const [vendas, fila, turnos, txs, rT, rC, rK, rF, rOp] = await Promise.all([
      // cupons do período (data_venda é UTC de verdade: o dia local vai de 00:00-03:00 a 23:59-03:00)
      _ctzTudo((a, b) => sb.from('oct_pdv_vendas').select('id,numero,data_venda,turno_id,vendedor,operador,status,pagamentos,itens')
        .eq('empresa_id', eid).gte('data_venda', deTs + '-03:00').lte('data_venda', ateTs + '-03:00').order('data_venda').order('id').range(a, b)),
      // fila: a do mesmo período (bandeira/taxa dos cupons) + o que ainda não virou cupom
      _ctzTudo((a, b) => sb.from('oct_fila_transmissao').select('id,turno_id,descricao,litros,valor,valor_final,desconto,acrescimo,forma,forma_nome,bandeira,status,ocorrido_em,taxa,vendedor,numero_nfce')
        .eq('empresa_id', eid).in('forma_nome', ['Crédito', 'Débito', 'Pix', 'Cartão']).gte('ocorrido_em', _ctzSomaDias(_CTZ.de, -1) + 'T00:00:00').lte('ocorrido_em', _ctzSomaDias(_CTZ.ate, 1) + 'T23:59:59').order('ocorrido_em').order('id').range(a, b)),
      _ctzTudo((a, b) => sb.from('oct_pdv_turnos').select('id,numero,operador,aberto_em,fechado_em,conferido_em').eq('empresa_id', eid)
        .gte('aberto_em', _ctzSomaDias(_CTZ.de, -2) + 'T00:00:00Z').lte('aberto_em', ateTs + 'Z').order('aberto_em').range(a, b)),
      _ctzTudo((a, b) => sb.from('oct_cartao_transacoes').select('*').eq('empresa_id', eid).gte('data_venda', _CTZ.de).lte('data_venda', _CTZ.ate).order('recebido_em').range(a, b))
        .catch(() => []),
      sb.from('oct_cartao_taxas').select('*').or(`empresa_id.is.null,empresa_id.eq.${eid}`),
      sb.from('oct_fin_contas').select('id,nome,tipo,ativo,ordem').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
      sb.from('oct_cartao_controle').select('*').eq('adquirente', 'pagbank').maybeSingle().then(r => r, () => ({ data: null })),
      // conta da frota: a forma "Cartão Frota" (e as de operadora, se houver) em Formas de Pagamento
      sb.from('oct_formas_pagamento').select('id,nome,classificacao,conta_id,ordem,ativo').eq('empresa_id', eid).eq('classificacao', 'cartao_frota')
        .then(r => r, () => ({ data: [] })),
      // operadoras de frota do posto (Parâmetros › "Operadoras de cartão frota", nomes separados por ";")
      sb.from('oct_parametros').select('valor').eq('empresa_id', eid).eq('chave', 'frota_operadoras').maybeSingle()
        .then(r => r, () => ({ data: null })),
    ]);
    _CTZ.operadoras = _ctzOperadorasDoTexto(rOp && rOp.data ? rOp.data.valor : '');
    _CTZ.taxas = rT.data || []; _CTZ.contas = rC.data || []; _CTZ.controle = (rK && rK.data) || null; _CTZ.turnos = turnos; _CTZ.txs = txs;
    _CTZ.formasFrota = (rF && !rF.error && rF.data) || [];
    const filaPorNfce = {};
    fila.forEach(f => { if (f.numero_nfce != null) (filaPorNfce[String(f.numero_nfce)] = filaPorNfce[String(f.numero_nfce)] || []).push(f); });
    const itens = [];
    vendas.forEach(v => itens.push(...ctzItensDoCupom(v, filaPorNfce[String(v.numero)] || [], turnos, eid)));
    // fila ainda sem cupom, dentro do período da tela
    fila.filter(f => String(f.status || 'fila') === 'fila' && ctzFormaDe(f) && _ctzDiaLocal(f.ocorrido_em) >= _CTZ.de && _ctzDiaLocal(f.ocorrido_em) <= _CTZ.ate)
      .forEach(f => itens.push(ctzItem(f, ctzTurnoDe(f, turnos), _CTZ.taxas, eid)));
    itens.sort((a, b) => String(a.ocorrido_em).localeCompare(String(b.ocorrido_em)));
    _CTZ.fora = ctzCasarEdi(itens, txs);
    itens.forEach(it => { ctzCompletar(it, _CTZ.taxas); it.conta = ctzContaDoItem(it, _CTZ.contas, _CTZ.formasFrota); });
    // conferência de cada item (oct_cartao_caixa)
    _CTZ.confs = {};
    _CTZ.semTabela = false;
    const ids = itens.map(i => i.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from('oct_cartao_caixa').select('*').in('fila_id', ids.slice(i, i + 200));
      if (error) { _CTZ.semTabela = /oct_cartao_caixa/.test(String(error.message || '')); break; }
      (data || []).forEach(c => { _CTZ.confs[c.fila_id] = c; });
    }
    itens.forEach(it => { const c = _CTZ.confs[it.id]; it.conferido = !!(c && c.conferido); it.conferido_por = c ? c.conferido_por : null; it.conferido_em = c ? c.conferido_em : null; it.livro_em = c ? c.livro_em : null; it.obs = c ? c.obs : null; });
    _CTZ.itens = itens;
    _CTZ.sel = new Set([..._CTZ.sel].filter(id => itens.some(t => t.id === id)));
  } catch (e) {
    document.getElementById('conteudo').innerHTML = `<div style="padding:24px;max-width:720px"><p style="color:#fbbf24;margin:0 0 8px">${/oct_cartao_taxas/.test(String(e.message || '')) ? 'Falta rodar <b>repo/sql/SQL-CARTOES.sql</b> no Supabase.' : 'Erro ao carregar: ' + _ctzEsc(e.message || e)}</p></div>`;
    _CTZ.carregando = false; return;
  }
  _CTZ.carregando = false;
  _ctzRender();
}
// ---------- FILTRO DE FORMAS com caixas de marcar (20/10/2026) ----------
// valor do filtro = chaves marcadas separadas por vírgula; vazio = TODAS. 'frota' = todas as operadoras; 'frota:<op>' = uma.
const _CTZ_OPERADORAS_PADRAO = ['TicketLog', 'FitCard / Prime', 'ValeCard', 'Sem Parar'];   // a do PDV (pagamento.js)
function _ctzOperadorasDoTexto(txt) {
  const v = String(txt == null ? '' : txt).split(/[;\n]/).map(x => x.trim()).filter(x => x && !/^outr[ao]s?$/i.test(x));
  return v.length ? v : _CTZ_OPERADORAS_PADRAO.slice();
}
// chave da operadora pelo NOME (FitCard Prime e FitCard Neo ficam separadas); sem nome = não informada
function _ctzOpChave(nome) {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return (!n || /^(frota|cartaofrota|outra|outro|outras)$/.test(n)) ? '?' : n;
}
function _ctzFormaOk(t, f) {
  if (!f) return true;
  const ks = String(f).split(',');
  if (t.forma === 'frota') return ks.includes('frota') || ks.includes('frota:' + _ctzOpChave(t.bandeira));
  return ks.includes(t.forma);
}
// opções: as 3 formas da maquininha + as operadoras (lista do posto + as que aparecem nos recebimentos do período)
function _ctzFormaOpcoes() {
  const ops = new Map();
  (_CTZ.operadoras || []).forEach(o => { const k = _ctzOpChave(o); if (k !== '?' && !ops.has(k)) ops.set(k, o); });
  (_CTZ.itens || []).filter(t => t.forma === 'frota').forEach(t => {
    const k = _ctzOpChave(t.bandeira);
    if (!ops.has(k)) ops.set(k, k === '?' ? 'Frota (operadora não informada)' : String(t.bandeira).trim());
  });
  const frota = [...ops.entries()].sort((a, b) => (a[0] === '?') - (b[0] === '?') || a[1].localeCompare(b[1], 'pt-BR'))
    .map(([k, rot]) => ({ k: 'frota:' + k, rot }));
  return { cartao: [{ k: 'credito', rot: 'Crédito' }, { k: 'debito', rot: 'Débito' }, { k: 'pix', rot: 'Pix (maquininha)' }], frota };
}
function _ctzFormaResumo(f) {
  if (!f) return 'Todas';
  const o = _ctzFormaOpcoes(), rot = {};
  o.cartao.concat(o.frota).forEach(x => { rot[x.k] = x.rot; });
  rot.frota = '🚛 Frota (todas)';
  const ns = String(f).split(',').map(k => rot[k] || (k.indexOf('frota:') === 0 ? '🚛 ' + k.slice(6) : k));
  return ns.length > 3 ? ns.slice(0, 3).join(', ') + ' +' + (ns.length - 3) : ns.join(', ');
}
function _ctzFormaHtml(f) {
  const o = _ctzFormaOpcoes();
  const ks = new Set(f ? String(f).split(',') : []);
  const cx = (k, rot, extra) => `<label style="display:flex;align-items:center;gap:7px;padding:3px 2px;cursor:pointer;white-space:nowrap${extra || ''}">
    <input type="checkbox" data-ctzk="${_ctzEsc(k)}" ${k === '' ? (ks.size ? '' : 'checked') : (ks.has(k) ? 'checked' : '')} onchange="ctzFormaMarcar(this)" style="width:auto;margin:0"> ${_ctzEsc(rot)}</label>`;
  return `<div id="ctz-ms" style="position:relative;display:inline-block">
    <button type="button" class="ctz-inp" onclick="ctzFormaAbrir(event)" style="cursor:pointer;min-width:150px;text-align:left" title="Escolha uma ou mais formas">Formas: <b id="ctz-ms-rot">${_ctzEsc(_ctzFormaResumo(f))}</b> ▾</button>
    <div id="ctz-ms-pop" onclick="event.stopPropagation()" style="display:none;position:absolute;z-index:60;top:calc(100% + 4px);left:0;background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:8px 12px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-size:0.78rem;color:#dbe2ea;min-width:240px;max-height:60vh;overflow:auto">
      ${cx('', 'Todas', ';font-weight:700')}
      <div style="border-top:1px solid #243041;margin:5px 0"></div>
      ${o.cartao.map(x => cx(x.k, x.rot)).join('')}
      <div style="color:#93c5fd;font-weight:700;margin:6px 0 2px">🚛 Cartão frota</div>
      ${cx('frota', 'Todas as operadoras')}
      ${o.frota.map(x => cx(x.k, x.rot, ';padding-left:16px')).join('')}
      <div style="color:#667;font-size:0.68rem;margin-top:6px">Marque quantas quiser e clique em 🔍 Pesquisar. As operadoras vêm de Parâmetros › "Operadoras de cartão frota".</div>
    </div>
  </div>`;
}
function ctzFormaAbrir(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('ctz-ms-pop'); if (!p) return;
  const abrir = p.style.display === 'none';
  p.style.display = abrir ? 'block' : 'none';
  if (abrir) setTimeout(() => document.addEventListener('click', function fecha() {
    const q = document.getElementById('ctz-ms-pop'); if (q) q.style.display = 'none';
    document.removeEventListener('click', fecha);
  }), 0);
}
function ctzFormaMarcar(el) {
  const pop = document.getElementById('ctz-ms-pop'); if (!pop) return;
  const k = el.getAttribute('data-ctzk');
  const caixas = [...pop.querySelectorAll('input[data-ctzk]')];
  const por = kk => caixas.find(c => c.getAttribute('data-ctzk') === kk);
  if (k === '') caixas.forEach(c => { c.checked = c === el; });          // "Todas" limpa o resto
  else {
    if (por('')) por('').checked = false;
    if (k === 'frota' && el.checked) caixas.forEach(c => { if (c.getAttribute('data-ctzk').indexOf('frota:') === 0) c.checked = false; });
    if (k.indexOf('frota:') === 0 && el.checked && por('frota')) por('frota').checked = false;
  }
  const ks = caixas.filter(c => c.checked && c.getAttribute('data-ctzk')).map(c => c.getAttribute('data-ctzk'));
  if (!ks.length && por('')) por('').checked = true;                     // nada marcado = todas
  const v = ks.join(',');
  ctzFiltro('forma', v);
  const r = document.getElementById('ctz-ms-rot'); if (r) r.textContent = _ctzFormaResumo(v);
}
function _ctzVisiveis() {
  const b = _CTZ.busca.toLowerCase();
  return _CTZ.itens.filter(t => (_CTZ.caixa !== 'conf' || t.caixa_confirmado)
    && _ctzFormaOk(t, _CTZ.forma)
    && (!_CTZ.bandeira || String(t.bandeira || '') === _CTZ.bandeira)
    && (!_CTZ.status || (_CTZ.status === 'div' ? (t._av.status === 'maior' || t._av.status === 'menor' || t._av.prazoDiverge || t._av.formaDiverge)
      : _CTZ.status === 'forma' ? !!t._av.formaDiverge : t._av.status === _CTZ.status))
    && (!_CTZ.conf || (_CTZ.conf === 'sim' ? !!t.conferido : _CTZ.conf === 'nao' ? !t.conferido : _CTZ.conf === 'livro' ? !!t.livro_em : !t.livro_em))
    && (!b || [t.bandeira, t.nsu, t.autorizacao, t.placa, t.descricao, t.vendedor, t.turno_num, _ctzNum(t.valor_bruto), t.valor_liquido == null ? '' : _ctzNum(t.valor_liquido), t.hora].join(' ').toLowerCase().includes(b)));
}
function _ctzRender() {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  const vis = _ctzVisiveis();
  const r = ctzResumo(vis);
  const bandeiras = [...new Set(_CTZ.itens.map(t => t.bandeira).filter(Boolean))].sort();
  const contaPag = _CTZ.contas.find(c => c.tipo === 'pagbank');
  const P = _CTZ.p || _ctzFiltrosAplicados();
  const pend = _ctzPendente();
  const sel = (id, v, opts) => `<select onchange="ctzFiltro('${id}', this.value)" class="ctz-inp">${opts.map(o => `<option value="${_ctzEsc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${_ctzEsc(o[1])}</option>`).join('')}</select>`;
  const card = (rot, val, sub, cor) => `<div class="ctz-card"><div class="ctz-card-rot">${rot}</div><div class="ctz-card-val" style="color:${cor || '#e5e7eb'}">${val}</div>${sub ? `<div class="ctz-card-sub">${sub}</div>` : ''}</div>`;
  const ctrl = _CTZ.controle;
  const ctrlTxt = ctrl ? (ctrl.erro ? `<span style="color:#f87171" title="${_ctzEsc(ctrl.erro)}">retorno da maquininha (EDI) parado: ${_ctzEsc(ctrl.erro)}</span>` : `retorno da maquininha (EDI) atualizado ${ctrl.ultima_consulta ? new Date(ctrl.ultima_consulta).toLocaleString('pt-BR') : '—'}`) : '<span style="color:#fbbf24">retorno da maquininha (EDI) ainda não configurado no servidor — vale a taxa que o caixa recebeu</span>';
  const naoConf = _CTZ.itens.filter(t => !t.caixa_confirmado).length;
  const frotaSemConta = vis.filter(t => t.forma === 'frota' && !t.conta).length;
  const linhas = vis.map(t => {
    const a = t._av; const st = _CTZ_STATUS[a.status];
    const marcado = _CTZ.sel.has(t.id);
    const turnoTxt = t.turno ? `turno ${t.turno_num}${t.caixa_confirmado ? ' <span style="color:#7ee2a0" title="caixa confirmado no F.Caixa">✓</span>' : ' <span style="color:#fbbf24" title="caixa ainda não confirmado">a conferir</span>'}` : '<span style="color:#667">sem turno</span>';
    return `<tr class="ctz-lin ${marcado ? 'sel' : ''} ${a.status}" onclick="ctzSel('${t.id}', event)">
      <td class="ctz-td"><input type="checkbox" ${marcado ? 'checked' : ''} onclick="event.stopPropagation();ctzSel('${t.id}', event, true)"></td>
      <td class="ctz-td">${_ctzDt(t.data_venda)}</td><td class="ctz-td ctz-mut">${_ctzEsc(t.hora)}</td>
      <td class="ctz-td" style="font-size:0.7rem">${turnoTxt}<br><span class="ctz-mut">${_ctzEsc((t.vendedor || '').split(' ').slice(0, 2).join(' '))}</span></td>
      <td class="ctz-td ctz-mut" style="font-size:0.7rem" title="${_ctzEsc(t.descricao)}">${t.origem === 'cupom' ? '🧾 ' + _ctzEsc(t.nfce || '') + ' · ' : '⏳ fila · '}${_ctzEsc(t.descricao).slice(0, 18)}${t.litros ? ' · ' + _ctzNum(t.litros, 2) + ' L' : ''}</td>
      <td class="ctz-td"${t.forma_caixa ? ` title="no caixa: ${_ctzEsc(_CTZ_FORMA[t.forma_caixa] || t.forma_caixa)}"` : ''}>${_CTZ_FORMA[t.forma] || ''}</td><td class="ctz-td"${t.bandeira_caixa ? ` title="no caixa: ${_ctzEsc(t.bandeira_caixa)}"` : ''}>${_ctzEsc(t.bandeira || '')}</td>
      <td class="ctz-td ctz-r">${Number(t.parcelas || 1) > 1 ? t.parcelas + 'x' : '—'}</td>
      <td class="ctz-td ctz-r">${_ctzNum(t.valor_bruto)}</td>
      <td class="ctz-td ctz-r" style="color:#f0b45c">${a.cobrada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.cobrada)}</td>
      <td class="ctz-td ctz-r ctz-mut">${a.pctCobrada == null ? '—' : _ctzNum(a.pctCobrada, 2) + '%'}</td>
      <td class="ctz-td ctz-r">${a.pctEsperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.pctEsperada, 2) + '%'}</td>
      <td class="ctz-td ctz-r">${a.esperada == null ? '<span class="ctz-mut">—</span>' : _ctzNum(a.esperada)}</td>
      <td class="ctz-td ctz-r" style="color:${a.dif == null ? '#667' : Math.abs(a.dif) <= _CTZ_TOL ? '#7ee2a0' : a.dif > 0 ? '#f87171' : '#fbbf24'};font-weight:${a.dif != null && Math.abs(a.dif) > _CTZ_TOL ? 700 : 400}">${a.dif == null ? '—' : (a.dif > 0 ? '+' : '') + _ctzNum(a.dif)}</td>
      <td class="ctz-td ctz-r" style="font-weight:600">${t.valor_liquido == null ? '<span class="ctz-mut">—</span>' : _ctzNum(t.valor_liquido)}</td>
      <td class="ctz-td ${a.prazoDiverge ? 'ctz-prazo' : ''}" title="${a.prazoDiverge ? 'Combinado: D+' + a.regra.prazo_dias : (t.transacao ? 'previsão informada pela adquirente' : 'previsão pelo prazo combinado')}">${_ctzDt(t.data_prevista_pagamento)}${a.prazo != null ? ` <span class="ctz-mut" style="font-size:0.66rem">D+${a.prazo}${t.transacao ? '' : '*'}</span>` : ''}</td>
      <td class="ctz-td ctz-mut" style="font-size:0.7rem">${t.forma === 'frota'
        ? `<span title="cartão frota: a operadora não manda retorno — confira no relatório/extrato dela">${t.autorizacao ? 'aut. ' + _ctzEsc(t.autorizacao) : 'sem retorno'}</span>${t.placa ? '<br>' + _ctzEsc(t.placa) : ''}`
        : t.transacao ? _ctzEsc(t.nsu || '✓') : '<span title="sem a venda correspondente no extrato EDI">—</span>'}${a.aviso ? `<br><span style="color:${a.aviso.cor};white-space:nowrap" title="${_ctzEsc(a.aviso.title)}">${_ctzEsc(a.aviso.txt)}</span>` : ''}</td>
      <td class="ctz-td" style="color:${st.cor};white-space:nowrap"${a.status === 'contrato' ? ' title="A operadora da frota não manda retorno: vale a taxa cadastrada em Taxas negociadas (forma Cartão frota). Confira no relatório da operadora."' : ''}>${st.rot}${a.prazoDiverge ? ' <span title="prazo diferente do combinado" style="color:#fbbf24">⏱</span>' : ''}${t.forma === 'frota'
        ? `<br><span style="font-size:0.68rem;color:${t.conta ? '#8892a0' : '#f87171'}" title="${t.conta ? 'conta onde a operadora deposita (vai assim para a Conciliação)' : 'sem conta: crie em Conciliação › 🏦 Contas uma conta com o nome da operadora (ex.: CARTÃO TICKETLOG - banco), ou escolha a conta na forma CARTÃO FROTA ou na taxa da operadora'}">${t.conta ? '→ ' + _ctzEsc(t.conta.nome) : '⚠ sem conta'}</span>` : ''}</td>
      <td class="ctz-td" style="text-align:center">${t.conferido ? `<span style="color:#7ee2a0" title="por ${_ctzEsc(t.conferido_por || '')} em ${t.conferido_em ? new Date(t.conferido_em).toLocaleString('pt-BR') : ''}">✓</span>` : '<span class="ctz-mut">·</span>'}${t.livro_em ? ' <span style="color:#7ea8d8" title="já na Conciliação (livro da conta PagBank)">📒</span>' : ''}</td>
    </tr>`;
  }).join('');
  const foraVis = _CTZ.fora.filter(t => _ctzFormaOk(t, _CTZ.forma));
  const foraHtml = foraVis.length ? `
    <div style="margin-top:16px">
      <div style="color:#f0b45c;font-weight:700;font-size:0.86rem;margin-bottom:6px">⚠ Na maquininha e fora do caixa (${foraVis.length}) — R$ ${_ctzNum(foraVis.reduce((s, t) => s + Number(t.valor_bruto || 0), 0))}</div>
      <div style="color:#8892a0;font-size:0.72rem;margin-bottom:6px">Vendas que a adquirente informou no período e que não acharam um recebimento do caixa com o mesmo valor (mesma forma e bandeira até ${_CTZ_CASA_LOTE_MIN / 60} h; forma trocada até ${_CTZ_CASA_FORMA_MIN} min; centavos de diferença até ${_CTZ_CASA_MIN} min).</div>
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:36vh">
        <table style="width:100%;border-collapse:collapse"><thead><tr><th class="ctz-th">Data</th><th class="ctz-th">Hora</th><th class="ctz-th">Maquininha</th><th class="ctz-th">Forma</th><th class="ctz-th">Bandeira</th><th class="ctz-th" style="text-align:right">Bruto</th><th class="ctz-th" style="text-align:right">Taxa</th><th class="ctz-th" style="text-align:right">Líquido</th><th class="ctz-th">Previsão</th><th class="ctz-th">NSU</th></tr></thead>
        <tbody>${foraVis.map(t => `<tr><td class="ctz-td">${_ctzDt(t.data_venda)}</td><td class="ctz-td ctz-mut">${_ctzEsc(t.hora || '')}</td><td class="ctz-td ctz-mut" style="font-size:0.7rem">${_ctzEsc(t.maquininha || '')}</td><td class="ctz-td">${_CTZ_FORMA[t.forma] || _ctzEsc(t.forma || '')}</td><td class="ctz-td">${_ctzEsc(t.bandeira || '')}</td>
          <td class="ctz-td ctz-r">${_ctzNum(t.valor_bruto)}</td><td class="ctz-td ctz-r" style="color:#f0b45c">${_ctzNum(Number(t.taxa_valor || 0) + Number(t.tarifa_valor || 0))}</td><td class="ctz-td ctz-r">${_ctzNum(t.valor_liquido)}</td><td class="ctz-td">${_ctzDt(t.data_prevista_pagamento)}</td><td class="ctz-td ctz-mut" style="font-size:0.7rem">${_ctzEsc(t.nsu || '')}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>` : '';
  raiz.innerHTML = `
  <style>
    .ctz-inp{padding:6px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#e5e7eb;font-size:0.8rem}
    .ctz-btn{padding:7px 12px;border-radius:7px;border:1px solid #2a3a4a;background:#161a26;color:#cbd5e1;cursor:pointer;font-size:0.8rem;white-space:nowrap}
    .ctz-btn:hover{border-color:#4a6a8a}.ctz-btn.azul{border-color:#2a4a6a;color:#93c5fd}.ctz-btn.verde{border-color:#2a5a3a;color:#7be0a0}.ctz-btn.pend{border-color:#f97316;color:#fdba74;background:#2a1a0a}
    .ctz-card{background:#0f1520;border:1px solid #2a3a4a;border-radius:10px;padding:10px 14px;min-width:150px}
    .ctz-card-rot{color:#8892a0;font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em}.ctz-card-val{font-size:1.15rem;font-weight:800}.ctz-card-sub{color:#667;font-size:0.68rem;margin-top:2px}
    .ctz-td{padding:5px 7px;border-bottom:1px solid #1c1f2e;font-size:0.76rem;vertical-align:top}.ctz-r{text-align:right;white-space:nowrap}.ctz-mut{color:#8892a0}
    .ctz-lin{cursor:pointer}.ctz-lin:hover td{background:#141826}.ctz-lin.sel td{background:#1e3a5f}.ctz-lin.maior td:first-child{box-shadow:inset 3px 0 #f87171}.ctz-lin.menor td:first-child{box-shadow:inset 3px 0 #fbbf24}.ctz-lin.sem_retorno td:first-child{box-shadow:inset 3px 0 #f0b45c}
    .ctz-prazo{color:#fbbf24}
    .ctz-th{position:sticky;top:0;background:#0f1119;color:#888;text-align:left;padding:8px 7px;font-size:0.72rem;white-space:nowrap}
  </style>
  <div style="padding:14px 18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <h2 style="margin:0;color:#e5e7eb;font-size:1.1rem">💳 Cartões — pré-conferência das taxas</h2>
      <span style="color:#667;font-size:0.72rem">recebimentos em cartão/Pix/frota do CAIXA · ${ctrlTxt}</span>
      <span style="flex:1"></span>
      <button class="ctz-btn" onclick="ctzTaxas()" title="Taxas negociadas com a adquirente">% Taxas negociadas (${_CTZ.taxas.length})</button>
      <button class="ctz-btn azul" onclick="ctzBaixar()" title="Baixa do EDI do PagBank o retorno da adquirente para o período da tela (até 62 dias)">⬇ Retorno da maquininha (EDI)</button>
      <button class="ctz-btn" onclick="ctzCsv()">📄 Planilha (CSV)</button>
      <button class="ctz-btn" onclick="_ctzCarregar()">↻</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <span style="color:#8892a0;font-size:0.75rem">Venda de</span>
      <input type="date" class="ctz-inp" value="${P.de}" onchange="ctzFiltro('de', this.value)" onkeydown="_ctzEnter(event)"> <span style="color:#667">a</span>
      <input type="date" class="ctz-inp" value="${P.ate}" onchange="ctzFiltro('ate', this.value)" onkeydown="_ctzEnter(event)">
      ${sel('caixa', P.caixa, [['conf', 'Só caixa confirmado (F.Caixa)'], ['todos', 'Todos os turnos']])}
      ${_ctzFormaHtml(P.forma)}
      ${sel('bandeira', P.bandeira, [['', 'Todas as bandeiras / operadoras']].concat(bandeiras.map(b => [b, b])))}
      ${sel('status', P.status, [['', 'Tudo'], ['div', 'Só divergentes'], ['ok', 'Só o que confere'], ['sem_retorno', 'Maquininha não informou'], ['forma', 'Forma diferente na maquininha'], ['sem_regra', 'Sem taxa cadastrada']])}
      ${sel('conf', P.conf, [['', 'Conferidos e não'], ['nao', 'Não conferidos'], ['sim', 'Conferidos'], ['semlivro', 'Ainda fora da Conciliação'], ['livro', 'Já na Conciliação']])}
      <input class="ctz-inp" id="ctz-busca" placeholder="turno, vendedor, NSU, valor…" value="${_ctzEsc(P.busca)}" oninput="ctzFiltro('busca', this.value)" onkeydown="_ctzEnter(event)" style="width:190px">
      <button class="ctz-btn ${pend ? 'pend' : 'azul'}" onclick="ctzPesquisar()" title="Aplica os filtros (Enter também)">🔍 Pesquisar${pend ? ' •' : ''}</button>
      <button class="ctz-btn" onclick="ctzLimpar()" title="Volta os filtros ao padrão (últimos 7 dias, só caixa confirmado)">✖ Limpar filtros</button>
    </div>
    ${_CTZ.caixa === 'conf' && naoConf ? `<div style="color:#fbbf24;font-size:0.74rem;margin-bottom:8px">${naoConf} recebimento(s) do período estão em turnos ainda <b>não confirmados</b> no F.Caixa e ficam de fora até a conferência do caixa. (Para vê-los: "Todos os turnos".)</div>` : ''}
    ${_CTZ.semTabela ? '<div style="color:#fbbf24;font-size:0.74rem;margin-bottom:8px">Falta rodar <b>repo/sql/SQL-CARTOES-CAIXA.sql</b>: a conferência (✔) e o envio para a Conciliação ficam desligados até lá.</div>' : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${card('Recebimentos', _ctzNum(r.n, 0), Object.entries(r.porForma).map(([f, v]) => `${f} ${v.n}`).join(' · '))}
      ${card('Bruto (caixa)', 'R$ ' + _ctzNum(r.bruto))}
      ${card('Taxas cobradas', 'R$ ' + _ctzNum(r.taxas), 'média ' + _ctzNum(r.pctMedia, 2) + '%' + (r.nContrato ? ' · frota pela taxa do contrato' : ''), '#f0b45c')}
      ${card('Líquido', 'R$ ' + _ctzNum(r.liquido), null, '#7ee2a0')}
      ${card('Divergentes', _ctzNum(r.nDiv, 0), r.nDiv ? ('diferença ' + (r.difDiv > 0 ? '+' : '') + 'R$ ' + _ctzNum(r.difDiv)) : 'nenhuma taxa fora do negociado', r.nDiv ? '#f87171' : '#7ee2a0')}
      ${r.nSemRet ? card('Maquininha não informou', _ctzNum(r.nSemRet, 0), 'sem a venda no extrato EDI nem taxa no caixa', '#f0b45c') : ''}
      ${r.nForma ? card('Forma diferente', _ctzNum(r.nForma, 0), 'caixa ≠ maquininha (ex.: Débito × Pix)', '#f87171') : ''}
      ${r.porForma.Frota ? card('🚛 Cartão frota', _ctzNum(r.porForma.Frota.n, 0), `R$ ${_ctzNum(r.porForma.Frota.bruto)}${frotaSemConta ? ` · <span style="color:#f87171">${frotaSemConta} sem conta</span>` : ''}${r.nContrato ? ` · ${r.nContrato} pela taxa do contrato` : ''}`, '#93c5fd') : ''}
      ${card('Sem taxa cadastrada', _ctzNum(r.nSem, 0), r.nSem ? 'cadastre em Taxas negociadas' : '', r.nSem ? '#fbbf24' : '#8892a0')}
      ${r.nPrazo ? card('Prazo diferente', _ctzNum(r.nPrazo, 0), 'previsão ≠ combinado', '#fbbf24') : ''}
      ${card('Conferidas', `${_ctzNum(r.nConf, 0)} / ${_ctzNum(r.n, 0)}`, `${_ctzNum(r.nLivro, 0)} na Conciliação`)}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span style="color:#8892a0;font-size:0.76rem">${_CTZ.sel.size} selecionada(s)</span>
      <button class="ctz-btn" onclick="ctzSelTodas(true)">Marcar visíveis</button>
      <button class="ctz-btn" onclick="ctzSelTodas(false)">Desmarcar</button>
      <button class="ctz-btn verde" onclick="ctzConferir(true)">✔ Conferir selecionadas</button>
      <button class="ctz-btn" onclick="ctzConferir(false)">↩ Desfazer conferência</button>
      <button class="ctz-btn azul" onclick="ctzEnviarLivro()" title="${contaPag ? 'Cartão/Pix: livro da conta ' + _ctzEsc(contaPag.nome) + '; frota: conta da operadora' : 'Cadastre a conta PagBank em Conciliação › Contas'}">📒 Enviar conferidas para a Conciliação${contaPag ? '' : ' (sem conta PagBank)'}</button>
    </div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto;max-height:60vh">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="ctz-th"></th><th class="ctz-th">Data</th><th class="ctz-th">Hora</th><th class="ctz-th">Turno · vendedor</th><th class="ctz-th">Venda</th><th class="ctz-th">Forma</th><th class="ctz-th">Bandeira</th>
          <th class="ctz-th" style="text-align:right">Parc.</th><th class="ctz-th" style="text-align:right">Bruto</th><th class="ctz-th" style="text-align:right">Taxa cobrada</th><th class="ctz-th" style="text-align:right">%</th>
          <th class="ctz-th" style="text-align:right">Negociada</th><th class="ctz-th" style="text-align:right">Taxa esperada</th><th class="ctz-th" style="text-align:right">Diferença</th><th class="ctz-th" style="text-align:right">Líquido</th>
          <th class="ctz-th">Previsão pagto</th><th class="ctz-th">EDI/NSU</th><th class="ctz-th">Situação</th><th class="ctz-th">Conf.</th>
        </tr></thead>
        <tbody>${linhas || `<tr><td colspan="19" style="padding:24px;text-align:center;color:#667">Nenhum recebimento em cartão/Pix/frota${_CTZ.itens.length ? ' com estes filtros' : ' registrado no caixa neste período'}.</td></tr>`}</tbody>
      </table>
    </div>
    ${foraHtml}
    <p style="color:#667;font-size:0.7rem;margin:8px 0 0">🧾 = pagamento do cupom · ⏳ = ainda na fila, sem cupom. Bruto = o que o caixa registrou na venda. Taxa cobrada = a que a maquininha informou (retorno EDI; sem ele, a taxa recebida pelo caixa ao casar a venda). Esperada = bruto × % negociado (+ tarifa fixa), tolerância de R$ 0,01. Previsão com * = calculada pelo prazo combinado (a adquirente ainda não informou). Linha vermelha: taxa maior; amarela: menor; laranja: a maquininha não informou taxa. Na coluna EDI/NSU: ⏱ = a maquininha registrou a venda com minutos de diferença do cupom; ⚠ maquininha: Pix = o caixa tem outra forma (confira o recebimento); ≈ = centavos de diferença entre cupom e maquininha. 🚛 Frota: a bandeira é a operadora; ela não manda retorno, então vale a taxa do contrato (Taxas negociadas, forma "Cartão frota", adquirente = operadora) e o valor vai para a conta da operadora (a da taxa; senão a conta que leva o nome dela, ex.: "CARTÃO TICKETLOG - Sicoob UFV"; senão a da forma CARTÃO FROTA).</p>
  </div>`;
}
// os campos só mudam o RASCUNHO (_CTZ.p); a tabela muda ao pesquisar
function ctzFiltro(k, v) {
  if (!_CTZ.p) _CTZ.p = _ctzFiltrosAplicados();
  _CTZ.p[k] = v;
  const b = document.querySelector('.ctz-btn[onclick="ctzPesquisar()"]');
  if (b) { b.classList.toggle('pend', _ctzPendente()); b.classList.toggle('azul', !_ctzPendente()); b.textContent = '🔍 Pesquisar' + (_ctzPendente() ? ' •' : ''); }
}
function _ctzEnter(ev) { if (ev && ev.key === 'Enter') { ev.preventDefault(); ctzPesquisar(); } }
function ctzPesquisar() {
  const p = _CTZ.p || _ctzFiltrosAplicados();
  if (p.de && p.ate && p.de > p.ate) { alert('A data inicial é depois da final.'); return; }
  const mudouPeriodo = p.de !== _CTZ.de || p.ate !== _CTZ.ate;
  _CTZ_CAMPOS.forEach(k => { _CTZ[k] = p[k]; });
  _CTZ.sel.clear();
  if (mudouPeriodo) _ctzCarregar(); else _ctzRender();
}
function ctzLimpar() {
  Object.assign(_CTZ, _ctzFiltrosPadrao());
  _CTZ.p = _ctzFiltrosAplicados();
  _CTZ.sel.clear();
  _ctzCarregar();
}
function ctzSel(id) { if (_CTZ.sel.has(id)) _CTZ.sel.delete(id); else _CTZ.sel.add(id); _ctzRender(); }
function ctzSelTodas(marcar) { _CTZ.sel = marcar ? new Set(_ctzVisiveis().map(t => t.id)) : new Set(); _ctzRender(); }
async function ctzBaixar() {
  if (!podeOuAvisa('cartoes.baixar')) return;
  const de = _CTZ.de, ate = _CTZ.ate;
  if (!confirm(`Baixar do EDI do PagBank o retorno da adquirente de ${_ctzDt(de)} a ${_ctzDt(ate)}?\n(serve para completar taxa, líquido e previsão de pagamento dos recebimentos do caixa; o dia de hoje vem parcial)`)) return;
  const btns = document.querySelectorAll('.ctz-btn'); btns.forEach(b => { b.disabled = true; });
  try {
    const r = await fetch((typeof SEFAZ_URL !== 'undefined' ? SEFAZ_URL : 'https://octano-sefaz-production-66d4.up.railway.app') + '/cartoes/baixar',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ de, ate, empresa_id: _ctzEid() }) });
    const j = await r.json();
    if (!j.ok) { alert('Não baixou: ' + (j.motivo || 'erro')); return; }
    const er = j.erros ? Object.entries(j.erros).map(e => e[0] + ': ' + e[1]).join('\n') : '';
    alert(`✔ ${j.vendas} transação(ões) da adquirente no período${j.sem_posto ? `\n⚠ ${j.sem_posto} de maquininha sem posto (cadastre a série em Parâmetros › Recebimentos)` : ''}${er ? '\n\n⚠ Credencial com erro:\n' + er : ''}`);
    await _ctzCarregar();
  } catch (e) { alert('Erro: ' + (e.message || e)); }
  finally { btns.forEach(b => { b.disabled = false; }); }
}
async function _ctzAutor() { try { const s = await getSession(); return (s && s.user && (s.user.email || s.user.id)) || null; } catch (e) { return null; } }
async function _ctzGravarConf(itens, campos) {
  const eid = _ctzEid();
  const linhas = itens.map(it => Object.assign({ fila_id: it.id, empresa_id: eid, transacao_id: it.transacao ? it.transacao.id : null, atualizado_em: new Date().toISOString() },
    _CTZ.confs[it.id] ? { conferido: _CTZ.confs[it.id].conferido, conferido_por: _CTZ.confs[it.id].conferido_por, conferido_em: _CTZ.confs[it.id].conferido_em, obs: _CTZ.confs[it.id].obs, livro_em: _CTZ.confs[it.id].livro_em } : {}, campos));
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await sb.from('oct_cartao_caixa').upsert(linhas.slice(i, i + 200), { onConflict: 'fila_id' });
    if (error) throw error;
  }
}
async function ctzConferir(valor) {
  if (!podeOuAvisa('cartoes.conferir')) return;
  if (_CTZ.semTabela) { alert('Falta rodar repo/sql/SQL-CARTOES-CAIXA.sql.'); return; }
  const alvo = _CTZ.itens.filter(t => _CTZ.sel.has(t.id));
  if (!alvo.length) { alert('Marque os recebimentos.'); return; }
  const por = await _ctzAutor(); const em = new Date().toISOString();
  try { await _ctzGravarConf(alvo, valor ? { conferido: true, conferido_por: por, conferido_em: em } : { conferido: false, conferido_por: null, conferido_em: null }); }
  catch (e) { alert('Erro: ' + (e.message || e)); return; }
  _CTZ.sel.clear();
  await _ctzCarregar();
}
async function ctzEnviarLivro() {
  if (!podeOuAvisa('cartoes.livro')) return;
  if (_CTZ.semTabela) { alert('Falta rodar repo/sql/SQL-CARTOES-CAIXA.sql.'); return; }
  const base = _CTZ.sel.size ? _CTZ.itens.filter(t => _CTZ.sel.has(t.id)) : _ctzVisiveis();
  const prontos = base.filter(t => t.conferido && !t.livro_em && t.caixa_confirmado);
  // cada recebimento vai para a SUA conta (cartão/Pix → PagBank; frota → conta da operadora)
  const alvo = prontos.filter(t => t.conta);
  const semConta = prontos.filter(t => !t.conta);
  const pulou = base.length - prontos.length;
  if (!alvo.length) {
    alert(semConta.length
      ? `Nada a enviar: ${semConta.length} recebimento(s) sem conta de destino.\n${semConta.some(t => t.forma === 'frota') ? 'Frota: crie em Conciliação › 🏦 Contas uma conta com o nome da operadora (ex.: CARTÃO TICKETLOG - banco), ou escolha a conta na forma CARTÃO FROTA ou na taxa da operadora.\n' : ''}${semConta.some(t => t.forma !== 'frota') ? 'Cartão/Pix: cadastre a conta PagBank (maquininha) em Conciliação › 🏦 Contas.' : ''}`
      : 'Nada a enviar: só vão os recebimentos CONFERIDOS, de caixa confirmado, que ainda não estão na Conciliação.');
    return;
  }
  const porConta = {};
  alvo.forEach(t => { const k = t.conta.id; const g = porConta[k] = porConta[k] || { nome: t.conta.nome, n: 0, bruto: 0, taxa: 0 }; g.n++; g.bruto += Number(t.valor_bruto || 0); g.taxa += Number(t.taxa_livro || 0); });
  const resumo = Object.values(porConta).map(g => `• ${g.nome}: ${g.n} — bruto R$ ${_ctzNum(g.bruto)}, taxas R$ ${_ctzNum(g.taxa)}`).join('\n');
  if (!confirm(`Enviar ${alvo.length} recebimento(s) para a Conciliação?\n${resumo}\nBruto como crédito e taxa como débito, na data prevista de pagamento.${semConta.length ? `\n⚠ ${semConta.length} ficam de fora por não ter conta de destino (frota: falta uma conta com o nome da operadora).` : ''}${pulou ? `\n${pulou} ficam de fora (não conferidos, caixa não confirmado ou já enviados).` : ''}`)) return;
  const por = await _ctzAutor(); const em = new Date().toISOString();
  try {
    for (let i = 0; i < alvo.length; i += 100) {
      const lote = alvo.slice(i, i + 100);
      const ids = lote.map(t => t.id);
      const { data: conc } = await sb.from('oct_fin_lancamentos').select('origem_id').in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', ids).eq('conciliado', true);
      const presos = new Set((conc || []).map(x => x.origem_id));
      const livres = lote.filter(t => !presos.has(t.id));
      if (livres.length) {
        await sb.from('oct_fin_lancamentos').delete().in('origem', ['cartoes', 'cartoes_taxa']).in('origem_id', livres.map(t => t.id)).eq('conciliado', false);
        const linhas = livres.flatMap(t => ctzLinhasLivro(t, t.conta.id, por, em));
        const { error } = await sb.from('oct_fin_lancamentos').insert(linhas);
        if (error) throw error;
      }
      await _ctzGravarConf(lote, { livro_em: em });
    }
  } catch (e) { alert('Erro ao enviar: ' + (e.message || e)); return; }
  _CTZ.sel.clear();
  alert(`✔ ${alvo.length} recebimento(s) na Conciliação:\n${resumo}${semConta.length ? `\n⚠ ${semConta.length} sem conta ficaram de fora.` : ''}`);
  await _ctzCarregar();
}
function ctzTaxas() {
  if (typeof navegarPara === 'function') { navegarPara('formas_pagamento'); setTimeout(() => { if (typeof fpAba === 'function' && document.getElementById('fp-tab-taxas')) fpAba('taxas'); }, 500); }
  else alert('Cadastre em Formas de Pagamento › Taxas dos cartões.');
}
function ctzCsv() {
  const vis = _ctzVisiveis();
  const br = v => v == null ? '' : String(Number(v)).replace('.', ',');
  const cab = ['Data', 'Hora', 'Turno', 'Caixa confirmado', 'Vendedor', 'Venda', 'Forma', 'Bandeira / operadora', 'Parcelas', 'Bruto', 'Taxa cobrada', '% cobrada', '% negociada', 'Taxa esperada', 'Diferença', 'Liquido', 'Previsao pagamento', 'D+', 'NSU / autorizacao', 'Situacao', 'Conta destino', 'Conferido', 'Na conciliacao'];
  const linhas = vis.map(t => { const a = t._av; return [_ctzDt(t.data_venda), t.hora, t.turno_num || '', t.caixa_confirmado ? 'sim' : 'nao', t.vendedor || '', t.descricao || '', _CTZ_FORMA[t.forma] || '', t.bandeira || '', t.parcelas || 1,
    br(t.valor_bruto), a.cobrada == null ? '' : br(a.cobrada), a.pctCobrada == null ? '' : br(Math.round(a.pctCobrada * 100) / 100), a.pctEsperada == null ? '' : br(a.pctEsperada), a.esperada == null ? '' : br(a.esperada), a.dif == null ? '' : br(a.dif), t.valor_liquido == null ? '' : br(t.valor_liquido),
    _ctzDt(t.data_prevista_pagamento), a.prazo == null ? '' : a.prazo, t.nsu || t.autorizacao || '', _CTZ_STATUS[a.status].rot.replace(/^(✓|⚠|\?|🚛) /, ''), t.conta ? t.conta.nome : '', t.conferido ? 'sim' : 'nao', t.livro_em ? 'sim' : 'nao']; });
  const csv = [cab].concat(linhas).map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `cartoes_${_CTZ.de}_${_CTZ.ate}.csv`; a.click();
}
