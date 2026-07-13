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

async function _monDados() {
  const [rEmp, rTank, rRec] = await Promise.all([
    sb.from('oct_empresas').select('id,nome'),
    sb.from('oct_tanques').select('empresa_id,numero,combustivel,capacidade,ativo').eq('ativo', true),
    // postos com medição RECENTE: ordena por mais recente (senão o PostgREST corta em 1000
    // linhas e um posto que grava muito domina a lista, escondendo os outros).
    sb.from('oct_medicoes').select('empresa_id').order('medido_em', { ascending: false }).limit(500),
  ]);
  const nomes = {};
  (rEmp.data || []).forEach(e => { nomes[e.id] = e.nome; });
  const tanks = rTank.data || [];
  // postos: os que têm tanque cadastrado OU medição recente (pega até sem cadastro)
  const empIds = [...new Set([...tanks.map(t => t.empresa_id), ...(rRec.data || []).map(r => r.empresa_id)])];

  // ultima medicao por (empresa, tanque)
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
  return { nomes, tanksByEmp, latest, empIds };
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

function _monCardTanque(t, med, tv) {
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
  </div>`;
}

function _monCardPosto(nome, tanksDoPosto, latest, eid, tv) {
  const ts = Object.values(tanksDoPosto || {}).sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const cards = ts.map(t => _monCardTanque(t, latest[eid + '|' + t.numero], tv)).join('');
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
function _monBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function _monHora(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
const _MON_FORMA = { '01': 'Dinheiro', '03': 'Crédito', '04': 'Débito', '17': 'Pix', '99': 'Outro' };

// litros (volume) de uma venda = soma do qtd dos itens de ABASTECIMENTO (combustível)
function _monVolVenda(v) {
  const itens = Array.isArray(v.itens) ? v.itens : [];
  return itens.reduce((s, it) => s + (it && it.tipo === 'abastecimento' ? Number(it.qtd || 0) : 0), 0);
}

async function _monVendas(empIds) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  const desde = ini.toISOString();
  const out = {};
  await Promise.all(empIds.map(async (eid) => {
    const { data } = await sb.from('oct_pdv_vendas')
      .select('valor_total,data_venda,pagamentos,status,itens')
      .eq('empresa_id', eid).gte('data_venda', desde)
      .order('data_venda', { ascending: false }).limit(500);
    const vendas = (data || []).filter(v => (v.status || '') !== 'cancelada');
    out[eid] = {
      qtd: vendas.length,
      total: vendas.reduce((s, v) => s + Number(v.valor_total || 0), 0),
      volume: vendas.reduce((s, v) => s + _monVolVenda(v), 0),
      ultima: vendas[0] || null,
      recentes: vendas.slice(0, 5),
    };
  }));
  return out;
}

function _monCardVendaPosto(nome, v, tv) {
  v = v || { qtd: 0, total: 0, volume: 0, ultima: null, recentes: [] };
  const ultH = v.ultima ? _monHora(v.ultima.data_venda) : '—';
  const recentes = (v.recentes || []).map(r => {
    const forma = (r.pagamentos && r.pagamentos[0] && _MON_FORMA[r.pagamentos[0].forma]) || '';
    const litros = _monVolVenda(r);
    return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:${tv ? '0.9rem' : '0.72rem'};color:#94a3b8;padding:2px 0">
      <span>${_monHora(r.data_venda)}${forma ? ' · ' + forma : ''}${litros > 0 ? ' · ' + _monNum(litros, 1) + ' L' : ''}</span><span style="color:#cbd5e1;font-weight:600">${_monBRL(r.valor_total)}</span></div>`;
  }).join('') || `<div style="color:#6b7280;font-size:${tv ? '0.9rem' : '0.72rem'};padding:4px 0">Sem vendas hoje.</div>`;
  return `
  <div style="background:#0b0f18;border:1px solid #2a3040;border-radius:16px;padding:${tv ? '18px' : '14px'}">
    <div style="font-size:${tv ? '1.15rem' : '0.95rem'};font-weight:800;color:#22c55e;margin-bottom:8px">${nome || '—'}</div>
    <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px">
      <span style="font-size:${tv ? '2rem' : '1.5rem'};font-weight:800;color:#f8fafc">${_monBRL(v.total)}</span>
      <span style="font-size:${tv ? '1.6rem' : '1.2rem'};font-weight:800;color:#38bdf8">${_monNum(v.volume, 1)} <span style="font-size:0.6em;color:#94a3b8">L</span></span>
    </div>
    <div style="color:#94a3b8;font-size:${tv ? '0.95rem' : '0.78rem'};margin-bottom:8px">${v.qtd} venda(s) hoje · última ${ultH}</div>
    <div style="border-top:1px solid #1e293b;padding-top:6px">${recentes}</div>
  </div>`;
}

async function _monRenderInto(elId, tv) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const { nomes, tanksByEmp, latest, empIds } = await _monDados();
    const vendas = await _monVendas(empIds);
    const ordenados = empIds.slice().sort((a, b) => (nomes[a] || '').localeCompare(nomes[b] || ''));
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // seção VENDAS (NFC-e de hoje)
    const totalGeral = ordenados.reduce((s, eid) => s + ((vendas[eid] && vendas[eid].total) || 0), 0);
    const volGeral = ordenados.reduce((s, eid) => s + ((vendas[eid] && vendas[eid].volume) || 0), 0);
    const colVenda = tv ? '320px' : '250px';
    const vendasGrid = ordenados.map(eid => _monCardVendaPosto(nomes[eid], vendas[eid], tv)).join('');
    const secVendas = `
      <div style="display:flex;align-items:center;gap:12px;margin:${tv ? '4px 0 12px' : '2px 0 8px'};flex-wrap:wrap">
        <div style="font-size:${tv ? '1.35rem' : '1.05rem'};font-weight:800;color:#22c55e">💰 Vendas de hoje (NFC-e)</div>
        <div style="font-size:${tv ? '1rem' : '0.8rem'};color:#94a3b8">total: <strong style="color:#f8fafc">${_monBRL(totalGeral)}</strong> · <strong style="color:#38bdf8">${_monNum(volGeral, 1)} L</strong></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${colVenda},1fr));gap:${tv ? '14px' : '10px'};margin-bottom:${tv ? '26px' : '18px'}">${vendasGrid}</div>`;

    // seção TANQUES
    const secTanques = `
      <div style="font-size:${tv ? '1.35rem' : '1.05rem'};font-weight:800;color:#e2e8f0;margin:${tv ? '4px 0 12px' : '2px 0 8px'}">🛢️ Tanques</div>
      ${ordenados.length ? ordenados.map(eid => _monCardPosto(nomes[eid], tanksByEmp[eid], latest, eid, tv)).join('') : '<p style="color:#94a3b8;padding:24px">Nenhum posto com medição encontrado.</p>'}`;

    const cab = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:${tv ? '18px' : '12px'}">
        <div style="font-size:${tv ? '1.7rem' : '1.2rem'};font-weight:800;color:#e2e8f0">📊 Monitor dos Postos</div>
        <div style="flex:1"></div>
        <div style="font-size:${tv ? '1rem' : '0.8rem'};color:#94a3b8">atualizado ${hora} · a cada 30s</div>
        ${tv ? '' : '<button onclick="monitorAtualizar()" style="padding:6px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer">↻ Atualizar</button>'}
      </div>`;
    const corpo = cab + secVendas + secTanques;
    el.innerHTML = (tv
      ? `<div style="min-height:100vh;background:#070a11;padding:22px">${corpo}</div>`
      : `<div style="padding:4px 2px">${corpo}</div>`);
  } catch (e) {
    el.innerHTML = '<p style="color:#f87171;padding:24px">Erro ao carregar medições: ' + (e.message || e) + '</p>';
  }
}

function _monStart(elId, tv) {
  _monTv = tv;
  if (_monTimer) clearInterval(_monTimer);
  _monRenderInto(elId, tv);
  _monTimer = setInterval(() => _monRenderInto(elId, tv), 30000);
}

function monitorAtualizar() { _monRenderInto(_monTv ? 'app' : 'conteudo', _monTv); }
function moduloMonitor() { _monStart('conteudo', false); }
function monitorTvBoot() {
  document.title = 'Monitor de Tanques — Octano';
  _monStart('app', true);
}
