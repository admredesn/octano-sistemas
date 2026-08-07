// ============================================================
// Monitor de Tanques em tempo real (todos os postos)
// ------------------------------------------------------------
// Le a ULTIMA medicao por (empresa, tanque) do Supabase (oct_medicoes),
// enriquece com oct_tanques (capacidade/combustivel) e oct_empresas (nome).
// Mostra QUALQUER posto que tenha medicao — mesmo sem o tanque cadastrado
// (nesse caso sem % de capacidade). Dois modos:
//   moduloMonitor()   -> pagina no retaguarda (com login), no #conteudo.
//   monitorTvBoot()   -> modo TV em tela cheia (link ?tv=1), sem login.
// Atualiza sozinho a cada 30s.
// ============================================================

let _monTimer = null;
let _monTv = false;

// última medição por (empresa, tanque) — todas as empresas em paralelo
async function _monLatest(empIds) {
  const latest = {};
  await Promise.all(empIds.map(async (eid) => {
    const { data } = await sb.from('oct_medicoes')
      .select('tanque_numero,combustivel,volume,volume_tc,agua,temperatura,entrega_em_progresso,medido_em')
      .eq('empresa_id', eid).order('medido_em', { ascending: false }).limit(40);
    (data || []).forEach(m => {
      const k = eid + '|' + m.tanque_numero;
      if (!latest[k]) latest[k] = m;
    });
  }));
  return latest;
}

async function _monTudo() {
  const [rEmp, rTank, rRec] = await Promise.all([
    // só empresas ATIVAS: uma empresa oculta (ativo=false) some do monitor por completo.
    sb.from('oct_empresas').select('id,nome').or('ativo.is.null,ativo.eq.true'),
    sb.from('oct_tanques').select('empresa_id,numero,combustivel,capacidade,ativo').eq('ativo', true),
    // postos com medição RECENTE: ordena por mais recente (senão o PostgREST corta em 1000
    // linhas e um posto que grava muito domina a lista, escondendo os outros).
    sb.from('oct_medicoes').select('empresa_id').order('medido_em', { ascending: false }).limit(500),
  ]);
  const nomes = {};
  (rEmp.data || []).forEach(e => { nomes[e.id] = e.nome; });
  const ativos = new Set((rEmp.data || []).map(e => e.id));   // empresas visíveis
  const tanks = rTank.data || [];
  // postos: os que têm tanque cadastrado OU medição recente (pega até sem cadastro),
  // MAS só de empresas ativas — tanque/medição de empresa oculta não aparece.
  const empIds = [...new Set([...tanks.map(t => t.empresa_id), ...(rRec.data || []).map(r => r.empresa_id)])]
    .filter(id => ativos.has(id));

  // medições E vendas em PARALELO (antes eram 2 rodadas em série — dobrava a espera)
  const [latest, vendas] = await Promise.all([_monLatest(empIds), _monVendas(empIds)]);

  // definicao dos tanques por empresa: oct_tanques (com capacidade) + os vistos na medicao
  const tanksByEmp = {};
  empIds.forEach(eid => { tanksByEmp[eid] = {}; });
  tanks.forEach(t => {
    tanksByEmp[t.empresa_id] = tanksByEmp[t.empresa_id] || {};
    tanksByEmp[t.empresa_id][t.numero] = { numero: Number(t.numero), combustivel: t.combustivel, capacidade: Number(t.capacidade || 0) };
  });
  Object.keys(latest).forEach(k => {
    const i = k.indexOf('|'); const eid = k.slice(0, i); const num = k.slice(i + 1); const m = latest[k];
    tanksByEmp[eid] = tanksByEmp[eid] || {};
    if (!tanksByEmp[eid][num]) tanksByEmp[eid][num] = { numero: Number(num), combustivel: m.combustivel || '—', capacidade: 0 };
  });
  return { nomes, tanksByEmp, latest, empIds, vendas };
}

function _monNum(v, dec) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }

function _monFrescor(medido_em) {
  if (!medido_em) return { cor: '#6b7280', txt: 'sem sinal', vivo: false };
  const t = Date.parse(medido_em);
  if (isNaN(t)) return { cor: '#6b7280', txt: 'sem sinal', vivo: false };
  const seg = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seg < 300)  return { cor: '#22c55e', txt: 'agora', vivo: true };
  if (seg < 1800) return { cor: '#eab308', txt: Math.round(seg / 60) + ' min', vivo: true };
  const h = Math.floor(seg / 3600), min = Math.round((seg % 3600) / 60);
  return { cor: '#ef4444', txt: (h ? h + 'h' : min + ' min') + ' atrás', vivo: false };
}

function _monCorNivel(pct) {
  if (pct <= 15) return '#ef4444';
  if (pct <= 30) return '#f59e0b';
  return '#22c55e';
}

function _monCardTanque(t, med, tv, litrosHoje, mediaDia) {
  const cap = Number(t.capacidade || 0);
  const vol = med ? Number(med.volume || 0) : 0;
  const temCap = cap > 0;
  const pct = temCap ? Math.max(0, Math.min(100, (vol / cap) * 100)) : 0;
  const fr = _monFrescor(med && med.medido_em);
  const comb = t.combustivel || (med && med.combustivel) || '—';
  const agua = med ? Number(med.agua || 0) : 0;
  const temp = med && med.temperatura != null ? Number(med.temperatura) : null;
  const entrega = med && med.entrega_em_progresso;
  const corBar = _monCorNivel(pct);
  const fVol = tv ? '1.7rem' : '1.25rem';
  return `
  <div style="background:#0f1420;border:1px solid #232838;border-radius:12px;padding:${tv ? '14px 16px' : '11px 13px'};min-width:0">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <div style="font-weight:700;color:#cbd5e1;font-size:${tv ? '1rem' : '0.86rem'}">T${t.numero} · ${comb}</div>
      <div style="font-size:${tv ? '0.8rem' : '0.68rem'};color:${fr.cor};white-space:nowrap">● ${fr.txt}</div>
    </div>
    <div style="display:flex;align-items:baseline;gap:6px;margin:6px 0 4px">
      <span style="font-size:${fVol};font-weight:800;color:#f8fafc">${_monNum(vol)}</span>
      <span style="color:#94a3b8;font-size:${tv ? '0.9rem' : '0.75rem'}">L${temCap ? ' de ' + _monNum(cap) : ''}</span>
      <span style="flex:1"></span>
      <span style="font-weight:700;color:${temCap ? corBar : '#64748b'};font-size:${tv ? '1.1rem' : '0.9rem'}">${temCap ? _monNum(pct, 0) + '%' : '—'}</span>
    </div>
    <div style="height:${tv ? '16px' : '12px'};background:#1e293b;border-radius:8px;overflow:hidden">
      <div style="height:100%;width:${temCap ? pct : 0}%;background:${corBar};border-radius:8px;transition:width 0.6s"></div>
    </div>
    <div style="display:flex;gap:12px;margin-top:7px;font-size:${tv ? '0.85rem' : '0.7rem'};color:#94a3b8;flex-wrap:wrap">
      ${temp != null ? `<span>🌡️ ${_monNum(temp, 1)}°C</span>` : ''}
      <span style="color:${agua > 0 ? '#f87171' : '#94a3b8'}">💧 água ${_monNum(agua)} L</span>
      ${entrega ? `<span style="color:#38bdf8;font-weight:700">🚚 DESCARGA</span>` : ''}
      ${!temCap ? `<span style="color:#f59e0b">⚠️ capacidade não cadastrada</span>` : ''}
    </div>
    ${_monCardAutonomia(vol, litrosHoje, tv, mediaDia)}
  </div>`;
}

// card de AUTONOMIA embaixo do tanque. Base preferida: MÉDIA DOS ÚLTIMOS 5
// DIAS de venda (pista publicada pelo núcleo) — o ritmo de hoje só entra como
// fallback em posto que ainda não publica a pista, porque meio dia de venda
// extrapolado mente para os dois lados.
function _monCardAutonomia(vol, litrosHoje, tv, mediaDia) {
  const fs = tv ? '0.9rem' : '0.74rem';
  let dias, ritmoTxt;
  if (mediaDia > 0 && vol > 0) {
    dias = vol / mediaDia;
    ritmoTxt = 'média 5d: ' + _monNum(mediaDia, 0) + ' L/dia';
  } else {
    dias = _monAutonomia(vol, litrosHoje);
    ritmoTxt = _monNum(litrosHoje, 0) + ' L hoje';
  }
  if (dias == null)
    return `<div style="margin-top:7px;background:#0b0f18;border:1px dashed #232838;border-radius:8px;padding:${tv ? '8px 10px' : '6px 8px'};font-size:${fs};color:#64748b">⏳ Autonomia: aguardando vendas do dia</div>`;
  const cor = dias >= 5 ? '#22c55e' : dias >= 2 ? '#f59e0b' : '#ef4444';
  const rotulo = dias >= 1 ? _monNum(dias, 1) + ' dia(s)' : _monNum(dias * 24, 0) + ' hora(s)';
  return `<div style="margin-top:7px;background:#0b0f18;border:1px solid #232838;border-radius:8px;padding:${tv ? '8px 10px' : '6px 8px'};display:flex;justify-content:space-between;align-items:baseline;gap:8px">
    <span style="font-size:${fs};color:#94a3b8">⏳ Autonomia</span>
    <span style="font-size:${tv ? '1.1rem' : '0.9rem'};font-weight:800;color:${cor}">${rotulo}</span>
    <span style="font-size:${tv ? '0.78rem' : '0.66rem'};color:#64748b">${ritmoTxt}</span>
  </div>`;
}

function _monCardPosto(nome, tanksDoPosto, latest, eid, tv, vendasEmp) {
  const ts = Object.values(tanksDoPosto || {}).sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const litrosT = (vendasEmp && vendasEmp.litrosTanque) || {};
  const mediaT = (vendasEmp && vendasEmp.mediaTanque) || {};
  const cards = ts.map(t => _monCardTanque(t, latest[eid + '|' + t.numero], tv,
    Number(litrosT[t.numero] || 0), Number(mediaT[t.numero] || 0))).join('');
  let maisRecente = null;
  ts.forEach(t => { const m = latest[eid + '|' + t.numero]; if (m && (!maisRecente || m.medido_em > maisRecente)) maisRecente = m.medido_em; });
  const fr = _monFrescor(maisRecente);
  const colW = tv ? '260px' : '210px';
  return `
  <div style="background:#0b0f18;border:1px solid #2a3040;border-radius:16px;padding:${tv ? '18px' : '14px'};margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="font-size:${tv ? '1.35rem' : '1.05rem'};font-weight:800;color:#f97316">${nome || '—'}</div>
      <div style="width:9px;height:9px;border-radius:50%;background:${fr.cor}"></div>
      <div style="font-size:${tv ? '0.9rem' : '0.72rem'};color:#94a3b8">${fr.vivo ? 'recebendo' : 'sem leitura recente'} · ${fr.txt}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${colW},1fr));gap:${tv ? '14px' : '10px'}">${cards || '<div style="color:#6b7280;padding:10px">Sem tanques/medição.</div>'}</div>
  </div>`;
}

// ---- VENDAS (NFC-e) em tempo real: total do dia + últimas, por posto ----
// maximumFractionDigits explícito: sem ele o padrão é 3 casas e o lucro saía
// como "R$ 39,825" no monitor.
function _monBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _monHora(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
const _MON_FORMA = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Crédito', '04': 'Débito', '05': 'Nota a Prazo', '10': 'Crédito', '11': 'Crédito', '15': 'Boleto', '17': 'Pix', '18': 'Pix', '19': 'Pix', '90': 'Nota a Prazo', '99': 'Outro' };

// litros (volume) de uma venda = soma do qtd dos itens de ABASTECIMENTO (combustível)
function _monVolVenda(v) {
  const itens = Array.isArray(v.itens) ? v.itens : [];
  return itens.reduce((s, it) => s + (it && it.tipo === 'abastecimento' ? Number(it.qtd || 0) : 0), 0);
}

// lucro (margem bruta) de uma venda = soma de (total_item - custo*qtd) por item.
// custo = preco_custo do produto (mapa produto_id -> custo). Item sem custo conhecido
// NÃO conta (evita inflar o lucro com margem cheia).
function _monLucroVenda(v, custoMap) {
  const itens = Array.isArray(v.itens) ? v.itens : [];
  return itens.reduce((s, it) => {
    const c = (it && custoMap[it.produto_id]) || 0;
    if (c <= 0) return s;
    return s + (Number(it.total || 0) - c * Number(it.qtd || 0));
  }, 0);
}

// PISTA: abastecimentos crus da bomba (oct_pdv_abastecimentos, publicados pelo
// núcleo). Paginado porque o PostgREST corta em 1000 linhas — 6 dias de um
// posto movimentado passa disso.
async function _monPistaDias(eid, desdeIso) {
  const linhas = [];
  for (let p = 0; p < 5; p++) {
    try {
      const { data, error } = await sb.from('oct_pdv_abastecimentos')
        .select('data_abast,litros,valor_total,preco_litro,combustivel,tanque_id,bico')
        .eq('empresa_id', eid).gte('data_abast', desdeIso)
        .order('data_abast', { ascending: false })
        .range(p * 1000, p * 1000 + 999);
      if (error || !data || !data.length) break;
      linhas.push(...data);
      if (data.length < 1000) break;
    } catch (e) { break; }
  }
  return linhas;
}

// dia LOCAL em YYYY-MM-DD (toISOString é UTC e vira o dia às 21h no Brasil)
function _monDiaStr(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function _monVendas(empIds) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  const desde = ini.toISOString();
  const ini6 = new Date(ini); ini6.setDate(ini6.getDate() - 6);
  const desde6 = _monDiaStr(ini6);            // data_abast é ISO local do núcleo
  const hojeStr = _monDiaStr(new Date());
  // custo/nome (p/ lucro e p/ trocar a descrição fiscal feia pelo nome do produto)
  const pCusto = sb.from('oct_produtos').select('id,nome,preco_custo,tanque_id').in('empresa_id', empIds);
  const pVendas = Promise.all(empIds.map(eid =>
    sb.from('oct_pdv_vendas')
      .select('valor_total,data_venda,pagamentos,status,itens')
      .eq('empresa_id', eid).gte('data_venda', desde)
      .order('data_venda', { ascending: false }).limit(500)
      .then(r => [eid, r.data || []])));
  // FILA + TRANSMITIDOS do dia: a fila conta no total (cupom a emitir) e os
  // dois juntos formam o LUCRO APURADO — todo casamento do dia, já com a taxa
  // da maquininha (coluna taxa, publicada pelo núcleo) para descontar.
  // Se a coluna taxa ainda não existir no Supabase (SQL pendente), reconsulta
  // sem ela: o lucro sai sem o desconto até a coluna ser criada, mas sai.
  const _filaSel = extra => sb.from('oct_fila_transmissao')
    .select('empresa_id,bico,descricao,litros,valor,forma,forma_nome,desconto,acrescimo,status' + extra)
    .in('empresa_id', empIds).in('status', ['fila', 'transmitido']).gte('criado_em', desde);
  const pFila = _filaSel(',taxa').then(
    r => r.error ? _filaSel('').then(r2 => r2.data || [], () => []) : (r.data || []),
    () => _filaSel('').then(r2 => r2.data || [], () => []));
  // PISTA dos últimos 6 dias (hoje + 5 anteriores p/ média de autonomia)
  const pPista = Promise.all(empIds.map(eid =>
    _monPistaDias(eid, desde6).then(r => [eid, r])));
  // bico -> nº do tanque (a fila só sabe o bico; a autonomia precisa do tanque)
  const pTq = sb.from('oct_tanques').select('id,numero,empresa_id').in('empresa_id', empIds)
    .then(r => r.data || [], () => []);
  const pBc = sb.from('oct_bicos').select('numero,tanque_id').then(r => r.data || [], () => []);
  const [rCusto, listas, filaTodos, pistas, tqs, bcs] = await Promise.all(
    [pCusto.then(r => r, () => ({ data: [] })), pVendas, pFila, pPista, pTq, pBc]);
  const custoMap = {}, nomeProd = {}, custoPorTanque = {}, custoPorNome = {};
  ((rCusto && rCusto.data) || []).forEach(p => {
    custoMap[p.id] = Number(p.preco_custo || 0);
    if (p.nome) {
      nomeProd[p.id] = p.nome;
      custoPorNome[String(p.nome).trim().toUpperCase()] = Number(p.preco_custo || 0);
    }
    // custo do TANQUE: só grava custo REAL e não deixa um produto sem custo
    // apagar o que já foi resolvido. Um tanque pode ter mais de um produto
    // apontando para ele (no Florestal, Diesel S500 e S10 no mesmo tanque) —
    // sem esta guarda, o último lido vencia, inclusive se fosse zero, e o
    // abastecimento inteiro saía do lucro por "custo desconhecido".
    if (p.tanque_id) {
      const c = Number(p.preco_custo || 0);
      if (c > 0 && !(custoPorTanque[p.tanque_id] > 0)) custoPorTanque[p.tanque_id] = c;
    }
  });
  const pistaPorEmp = {};
  pistas.forEach(([eid, linhas]) => { pistaPorEmp[eid] = linhas; });
  const tqNumPorId = {};
  tqs.forEach(t => { tqNumPorId[t.id] = { numero: t.numero, empresa: t.empresa_id }; });
  const bicoTanque = {};   // "empresa|bico" -> nº do tanque
  const bicoCusto = {};    // "empresa|bico" -> custo/L do produto do tanque
  bcs.forEach(b => {
    const t = tqNumPorId[b.tanque_id];
    if (t && b.numero != null) {
      bicoTanque[t.empresa + '|' + Number(b.numero)] = t.numero;
      // a fila diz "GASOLINA COMUM" (nome da pista) e o cadastro do produto diz
      // o nome FISCAL ("ONU 3475, MISTURA DE..."): casar por nome falha para
      // combustível. O elo confiável é físico: bico -> tanque -> produto do
      // tanque -> custo. (Sem isto o lucro apurado saiu R$14 num dia de R$6,5 mil:
      // 111 de 113 itens ficaram "sem custo".)
      const c = custoPorTanque[b.tanque_id];
      if (c > 0) bicoCusto[t.empresa + '|' + Number(b.numero)] = c;
    }
  });
  const out = {};
  for (const [eid, data] of listas) {
    const vendas = data.filter(v => (v.status || '') !== 'cancelada');
    // casados do dia (fila + transmitidos) p/ o LUCRO APURADO; a "fila" das
    // demais contas continua sendo só o que ainda não virou cupom
    const casados = filaTodos.filter(f => f.empresa_id === eid);
    const fila = casados.filter(f => (f.status || 'fila') === 'fila');
    const pista = pistaPorEmp[eid] || [];
    const pistaHoje = pista.filter(a => String(a.data_abast || '').slice(0, 10) === hojeStr);
    const temPista = pistaHoje.length > 0;
    // nº do tanque de um abastecimento (tanque_id do cadastro; senão pelo bico)
    const nTanque = a => {
      const t = a.tanque_id && tqNumPorId[a.tanque_id];
      if (t && t.numero != null) return t.numero;
      return bicoTanque[eid + '|' + Number(a.bico)];
    };
    const valorAb = a => Number(a.valor_total || 0) ||
      (Number(a.litros || 0) * Number(a.preco_litro || 0));
    // custo do litro daquele abastecimento (produto do tanque; senão pelo nome)
    const custoAb = a => (a.tanque_id && custoPorTanque[a.tanque_id]) ||
      custoPorNome[String(a.combustivel || '').trim().toUpperCase()] || 0;

    const litrosTanque = {};       // litros HOJE por tanque (exibição)
    const mediaTanque = {};        // média DIÁRIA por tanque (últimos 5 dias completos)
    const prods = {}, formas = {};

    // ---- DIA INTEIRO da pista: todo litro que saiu da bomba conta, tenha
    // casado ou não. Antes só o que já era cupom/fila aparecia — o monitor
    // enxergava o turno, não o dia.
    let pistaValor = 0, pistaLitros = 0, pistaLucro = 0, ultimaPista = null;
    pistaHoje.forEach(a => {
      const litros = Number(a.litros || 0);
      pistaLitros += litros; pistaValor += valorAb(a);
      const c = custoAb(a);
      if (c > 0 && Number(a.preco_litro || 0) > 0)
        pistaLucro += litros * (Number(a.preco_litro) - c);
      const nome = a.combustivel || '—';
      const p = prods[nome] || (prods[nome] = { qtd: 0, litro: true });
      p.qtd += litros;
      const nTq = nTanque(a);
      if (nTq != null) litrosTanque[nTq] = (litrosTanque[nTq] || 0) + litros;
      if (!ultimaPista || String(a.data_abast) > ultimaPista) ultimaPista = String(a.data_abast);
    });

    // ---- AUTONOMIA: média dos últimos 5 dias COMPLETOS (hoje fora — meio dia
    // de venda derrubaria a média). Posto recém-publicado usa os dias que tiver.
    const porDiaTanque = {};       // dia -> tanque -> litros
    pista.forEach(a => {
      const dia = String(a.data_abast || '').slice(0, 10);
      // dia FUTURO = relógio de concentrador errado (AC apareceu com meses de
      // set/out/nov) — não pode entrar na média senão a autonomia vira ficção
      if (!dia || dia >= hojeStr) return;
      const nTq = nTanque(a);
      if (nTq == null) return;
      (porDiaTanque[dia] = porDiaTanque[dia] || {})[nTq] =
        (porDiaTanque[dia][nTq] || 0) + Number(a.litros || 0);
    });
    const dias5 = Object.keys(porDiaTanque).sort().slice(-5);
    if (dias5.length) {
      const soma = {};
      dias5.forEach(d => Object.entries(porDiaTanque[d]).forEach(([tq, l]) => {
        soma[tq] = (soma[tq] || 0) + l;
      }));
      Object.entries(soma).forEach(([tq, l]) => { mediaTanque[tq] = l / dias5.length; });
    }

    // ---- LOJA (produto não-combustível) + FORMAS, das vendas e da fila ----
    let lojaValor = 0, lojaLucro = 0;
    vendas.forEach(v => {
      (v.itens || []).forEach(it => {
        if (!it) return;
        const ehComb = it.tipo === 'abastecimento';
        // nome LEGÍVEL: cadastro do produto; a descrição fiscal (ONU 3475...)
        // só se não houver outro jeito
        const nome = nomeProd[it.produto_id] || it.desc || it.descricao || '—';
        if (ehComb) {
          if (!temPista) {                     // fallback: posto sem pista publicada
            const p = prods[nome] || (prods[nome] = { qtd: 0, litro: true });
            p.qtd += Number(it.qtd || 0);
            if (it.n_tanque != null)
              litrosTanque[it.n_tanque] = (litrosTanque[it.n_tanque] || 0) + Number(it.qtd || 0);
          }
          return;                              // combustível já veio da pista
        }
        const p = prods[nome] || (prods[nome] = { qtd: 0, litro: false });
        p.qtd += Number(it.qtd || 0);
        lojaValor += Number(it.total || 0);
        const c = custoMap[it.produto_id] || 0;
        if (c > 0) lojaLucro += Number(it.total || 0) - c * Number(it.qtd || 0);
      });
      // formas: no dinheiro o pagamento traz o valor ENTREGUE (com troco) — usa
      // o líquido da venda (total - outras formas) p/ não inflar o Dinheiro
      let naoDin = 0, temDin = false;
      (v.pagamentos || []).forEach(p => {
        const c = String(p.forma || '').padStart(2, '0');
        if (c === '01') { temDin = true; return; }
        naoDin += Number(p.valor || 0);
        const n = _MON_FORMA[c] || 'Outro';
        formas[n] = (formas[n] || 0) + Number(p.valor || 0);
      });
      if (temDin || !(v.pagamentos || []).length) {
        const din = Math.max(0, Number(v.valor_total || 0) - naoDin);
        if (din > 0) formas['Dinheiro'] = (formas['Dinheiro'] || 0) + din;
      }
    });
    let filaTotal = 0, filaVolume = 0;
    fila.forEach(f => {
      const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
      const litros = Number(f.litros || 0);
      filaTotal += vf; filaVolume += litros;
      const n = f.forma_nome || _MON_FORMA[String(f.forma || '').padStart(2, '0')] || 'Outro';
      formas[n] = (formas[n] || 0) + vf;
      if (litros > 0) {
        if (!temPista) {
          const nome = f.descricao || '—';
          const p = prods[nome] || (prods[nome] = { qtd: 0, litro: true });
          p.qtd += litros;
          const nTq = bicoTanque[eid + '|' + Number(f.bico)];
          if (nTq != null) litrosTanque[nTq] = (litrosTanque[nTq] || 0) + litros;
        }
      } else {                                 // produto de loja na fila
        lojaValor += vf;
        const c = custoPorNome[String(f.descricao || '').trim().toUpperCase()] || 0;
        if (c > 0) lojaLucro += vf - c;        // qtd da fila = 1 por linha
      }
    });
    // ---- LUCRO APURADO ----
    // BUG CORRIGIDO EM 07/08/2026: o lucro DIMINUÍA conforme o dia andava.
    // A conta usava `casados.length ? lucroApurado : lucroAntigo` — ou uma
    // fonte, ou a outra. Só que a vitrine marca 'removido' todo item que saiu
    // das tabelas do núcleo, e isso acontece ao FECHAR O TURNO. Ou seja: turno
    // fechado = venda some da fila = lucro do dia encolhe. Medido no Florestal:
    // R$ 2.132 de R$ 8.016 (27% do dia) fora da conta, e crescendo a cada
    // fechamento.
    // Agora SOMA as duas fontes, sem duplicar:
    //   (a) o que ainda está na FILA  -> ainda não virou cupom;
    //   (b) os CUPONS emitidos do dia -> oct_pdv_vendas.
    // Um item na fila ainda não é cupom, e cupom emitido já saiu da fila —
    // então não há intersecção. O 'transmitido' é a única exceção: ele está na
    // vitrine E já é cupom, por isso fica FORA de (a).
    // taxas da maquininha do dia: valem para TODO casamento, esteja o item
    // ainda na fila ou já transmitido — é dinheiro que o posto não recebe.
    let taxasTotal = 0;
    casados.forEach(f => { taxasTotal += Number(f.taxa || 0); });

    let lucroApurado = 0;
    casados.filter(f => (f.status || 'fila') === 'fila').forEach(f => {
      const litros = Number(f.litros || 0);
      const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
      const taxa = Number(f.taxa || 0);
      // combustível: custo pelo TANQUE do bico (o nome da fila é o da pista,
      // não o fiscal do cadastro); loja: pelo nome mesmo, que aí coincide
      const custoL = (litros > 0 && bicoCusto[eid + '|' + Number(f.bico)]) ||
        custoPorNome[String(f.descricao || '').trim().toUpperCase()] || 0;
      if (custoL <= 0) return;
      const custo = litros > 0 ? custoL * litros : custoL;   // loja: 1 un/linha
      lucroApurado += vf - custo - taxa;
    });
    // guarda só o LEVE (nada de itens/fiscal): o cache e o render ficam instantâneos
    const leve = v => ({
      data_venda: v.data_venda, valor_total: Number(v.valor_total || 0),
      forma: (v.pagamentos && v.pagamentos[0] && v.pagamentos[0].forma) || '',
      litros: _monVolVenda(v),
    });
    // total do posto: com pista = bomba (dia inteiro) + loja;
    // sem pista = o de antes (cupons + fila), até o posto publicar a pista
    const totalAntigo = vendas.reduce((s, v) => s + Number(v.valor_total || 0), 0) + filaTotal;
    const volumeAntigo = vendas.reduce((s, v) => s + _monVolVenda(v), 0) + filaVolume;
    const lucroAntigo = vendas.reduce((s, v) => s + _monLucroVenda(v, custoMap), 0);
    out[eid] = {
      qtd: vendas.length,
      abastQtd: pistaHoje.length,
      temPista,
      total: temPista ? pistaValor + lojaValor : totalAntigo,
      volume: temPista ? pistaLitros : volumeAntigo,
      // LUCRO PELA MESMA FONTE DO TOTAL (correção 07/08/2026).
      // O total já vinha da PISTA (dia inteiro, todo litro que saiu da bomba) e
      // o lucro vinha da FILA (só o que ainda não foi emitido). Duas réguas
      // diferentes na mesma linha: o gerente via "vendi R$ 12 mil, lucrei
      // R$ 570" — margem de 4,7% num posto que faz 9,7%. E piorava com o dia,
      // porque fechar turno tira o item da fila (vira 'removido' na vitrine) e
      // encolhe o lucro. Medido: Florestal R$570 -> R$1.174 e Miranda
      // R$985 -> R$3.262 (um terço do real).
      // Agora, com pista publicada: combustível do dia inteiro + loja, menos as
      // taxas de cartão conhecidas. Sem pista, a conta antiga (fila + cupons).
      lucro: temPista ? (pistaLucro + lojaLucro - taxasTotal)
                      : (lucroApurado + lucroAntigo),
      taxas: taxasTotal,
      apurado: casados.length > 0,
      ultima: temPista && ultimaPista ? { data_venda: ultimaPista } :
        (vendas[0] ? leve(vendas[0]) : null),
      filaQtd: fila.length, filaTotal,
      prods, formas,
      litrosTanque, mediaTanque,
    };
  }
  return out;
}

// projeção de AUTONOMIA do tanque: volume atual ÷ ritmo de venda de hoje
// (litros vendidos hoje extrapolados p/ 24h). Precisa de pelo menos ~3h de
// dia decorrido e alguma venda no tanque p/ estimar.
function _monAutonomia(vol, litrosHoje) {
  const agora = new Date();
  const fracDia = (agora.getHours() + agora.getMinutes() / 60) / 24;
  if (!(vol > 0) || !(litrosHoje > 0) || fracDia < 0.125) return null;
  const consumoDia = litrosHoje / fracDia;
  return vol / consumoDia;   // em dias
}

function _monCardVendaPosto(nome, v, tv) {
  v = v || { qtd: 0, total: 0, volume: 0, ultima: null, prods: {}, formas: {} };
  const ultH = v.ultima ? _monHora(v.ultima.data_venda) : '—';
  const fs = tv ? '0.85rem' : '0.68rem';
  const lin = (a, b, corB) => `<div style="display:flex;justify-content:space-between;gap:6px;font-size:${fs};color:#94a3b8;padding:2px 0;min-width:0">
    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a}</span><span style="color:${corB || '#cbd5e1'};font-weight:600;white-space:nowrap;flex-shrink:0">${b}</span></div>`;
  // coluna 1: PRODUTO vendido × quantidade (combustível em L, loja em un)
  const prodLin = Object.entries(v.prods || {})
    .sort((a, b) => (b[1].litro - a[1].litro) || (b[1].qtd - a[1].qtd))
    .slice(0, 8)
    .map(([n, p]) => lin(n, _monNum(p.qtd, p.litro ? 1 : 0) + (p.litro ? ' L' : ' un'), '#38bdf8'))
    .join('') || `<div style="color:#6b7280;font-size:${fs};padding:2px 0">—</div>`;
  // coluna 2: FORMA de pagamento × valor recebido
  const formaLin = Object.entries(v.formas || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n, val]) => lin(n, _monBRL(val)))
    .join('') || `<div style="color:#6b7280;font-size:${fs};padding:2px 0">—</div>`;
  return `
  <div style="background:#0b0f18;border:1px solid #2a3040;border-radius:16px;padding:${tv ? '18px' : '14px'}">
    <div style="font-size:${tv ? '1.15rem' : '0.95rem'};font-weight:800;color:#22c55e;margin-bottom:8px">${nome || '—'}</div>
    <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px">
      <span style="font-size:${tv ? '2rem' : '1.5rem'};font-weight:800;color:#f8fafc">${_monBRL(v.total)}</span>
      <span style="font-size:${tv ? '1.6rem' : '1.2rem'};font-weight:800;color:#38bdf8">${_monNum(v.volume, 1)} <span style="font-size:0.6em;color:#94a3b8">L</span></span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;flex-wrap:wrap">
      <span style="color:#94a3b8;font-size:${tv ? '0.9rem' : '0.74rem'}">${v.apurado ? 'Lucro apurado:' : 'Lucro:'}</span>
      <span style="font-size:${tv ? '1.3rem' : '1.05rem'};font-weight:800;color:#22c55e">${_monBRL(v.lucro)}</span>
      ${v.total > 0 ? `<span style="color:#64748b;font-size:${tv ? '0.9rem' : '0.72rem'}">${_monNum(v.lucro / v.total * 100, 1)}%</span>` : ''}
      ${v.taxas > 0 ? `<span style="color:#f87171;font-size:${tv ? '0.82rem' : '0.68rem'}" title="taxas de cartão já descontadas do lucro">taxas −${_monBRL(v.taxas)}</span>` : ''}
    </div>
    <div style="color:#94a3b8;font-size:${tv ? '0.9rem' : '0.74rem'};margin-bottom:8px">${
      v.temPista
        ? `${v.abastQtd} abastecimento(s) hoje · ${v.qtd} cupom(ns)${v.filaQtd ? ` · <span style="color:#fbbf24">${v.filaQtd} na fila (${_monBRL(v.filaTotal)})</span>` : ''}`
        : `${v.qtd} venda(s) hoje${v.filaQtd ? ` <span style="color:#fbbf24">+ ${v.filaQtd} na fila (${_monBRL(v.filaTotal)})</span>` : ''}`
    } · última ${ultH}</div>
    <div style="border-top:1px solid #1e293b;padding-top:6px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 10px;overflow:hidden">
      <div style="min-width:0"><div style="font-size:${fs};color:#64748b;font-weight:700;padding-bottom:2px">⛽ VENDIDO</div>${prodLin}</div>
      <div style="min-width:0"><div style="font-size:${fs};color:#64748b;font-weight:700;padding-bottom:2px">💰 FORMAS</div>${formaLin}</div>
    </div>
  </div>`;
}

async function _monRenderInto(elId, tv) {
  const el = document.getElementById(elId);
  if (!el) return;
  // ABERTURA INSTANTÂNEA: pinta os últimos dados salvos (sessão) na hora e
  // atualiza por baixo — a espera das consultas some da percepção.
  if (!document.getElementById('mon-root')) {
    try {
      const c = JSON.parse(sessionStorage.getItem('mon_cache') || 'null');
      if (c && c.empIds) el.innerHTML = _monHtml(c, tv, true);
    } catch (e) { /* sem cache */ }
  }
  try {
    const dados = await _monTudo();
    try { sessionStorage.setItem('mon_cache', JSON.stringify(dados)); } catch (e) { /* cheio */ }
    if (document.getElementById(elId)) {
      const alvo = document.getElementById(elId);
      if (alvo) alvo.innerHTML = _monHtml(dados, tv, false);
    }
  } catch (e) {
    if (!document.getElementById('mon-root'))
      el.innerHTML = '<div id="mon-root"><p style="color:#f87171;padding:24px">Erro ao carregar medições: ' + (e.message || e) + '</p></div>';
  }
}

function _monHtml(dados, tv, doCache) {
  const { nomes, tanksByEmp, latest, empIds, vendas } = dados;
  {
    const ordenados = empIds.slice().sort((a, b) => (nomes[a] || '').localeCompare(nomes[b] || ''));
    const hora = doCache ? 'atualizando…' : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // seção VENDAS (NFC-e de hoje)
    const totalGeral = ordenados.reduce((s, eid) => s + ((vendas[eid] && vendas[eid].total) || 0), 0);
    const volGeral = ordenados.reduce((s, eid) => s + ((vendas[eid] && vendas[eid].volume) || 0), 0);
    const lucroGeral = ordenados.reduce((s, eid) => s + ((vendas[eid] && vendas[eid].lucro) || 0), 0);
    const colVenda = tv ? '320px' : '250px';
    const vendasGrid = ordenados.map(eid => _monCardVendaPosto(nomes[eid], vendas[eid], tv)).join('');
    const secVendas = `
      <div style="display:flex;align-items:center;gap:12px;margin:${tv ? '4px 0 12px' : '2px 0 8px'};flex-wrap:wrap">
        <div style="font-size:${tv ? '1.35rem' : '1.05rem'};font-weight:800;color:#22c55e">💰 Vendas de hoje (NFC-e)</div>
        <div style="font-size:${tv ? '1rem' : '0.8rem'};color:#94a3b8">total: <strong style="color:#f8fafc">${_monBRL(totalGeral)}</strong> · <strong style="color:#38bdf8">${_monNum(volGeral, 1)} L</strong> · lucro <strong style="color:#22c55e">${_monBRL(lucroGeral)}</strong></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${colVenda},1fr));gap:${tv ? '14px' : '10px'};margin-bottom:${tv ? '26px' : '18px'}">${vendasGrid}</div>`;

    // seção TANQUES
    const secTanques = `
      <div style="font-size:${tv ? '1.35rem' : '1.05rem'};font-weight:800;color:#e2e8f0;margin:${tv ? '4px 0 12px' : '2px 0 8px'}">🛢️ Tanques</div>
      ${ordenados.length ? ordenados.map(eid => _monCardPosto(nomes[eid], tanksByEmp[eid], latest, eid, tv, vendas[eid])).join('') : '<p style="color:#94a3b8;padding:24px">Nenhum posto com medição encontrado.</p>'}`;

    const cab = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:${tv ? '18px' : '12px'}">
        <div style="font-size:${tv ? '1.7rem' : '1.2rem'};font-weight:800;color:#e2e8f0">📊 Monitor dos Postos</div>
        <div style="flex:1"></div>
        <div style="font-size:${tv ? '1rem' : '0.8rem'};color:#94a3b8">atualizado ${hora} · a cada 30s</div>
        ${tv ? '' : '<button onclick="monitorAtualizar()" style="padding:6px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer">↻ Atualizar</button>'}
      </div>`;
    const corpo = cab + secVendas + secTanques;
    return (tv
      ? `<div id="mon-root" style="min-height:100vh;background:#070a11;padding:22px">${corpo}</div>`
      : `<div id="mon-root" style="padding:4px 2px">${corpo}</div>`);
  }
}

// re-render GUARDADO: se o usuário saiu do monitor (o #conteudo virou outra tela),
// o marcador #mon-root some → cancela o timer e NÃO re-desenha por cima. Sem isso,
// o monitor "puxava" a tela de volta a cada 30s (atrapalhava o trabalho no retaguarda).
function _monTick(elId, tv) {
  if (!document.getElementById('mon-root')) {
    if (_monTimer) { clearInterval(_monTimer); _monTimer = null; }
    return;
  }
  _monRenderInto(elId, tv);
}

function _monStart(elId, tv) {
  _monTv = tv;
  if (_monTimer) clearInterval(_monTimer);
  _monRenderInto(elId, tv);
  _monTimer = setInterval(() => _monTick(elId, tv), 30000);
}

function monitorAtualizar() { _monRenderInto(_monTv ? 'app' : 'conteudo', _monTv); }
function moduloMonitor() { _monStart('conteudo', false); }
function monitorTvBoot() {
  document.title = 'Monitor de Tanques — Octano';
  _monStart('app', true);
}
