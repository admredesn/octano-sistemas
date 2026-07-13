// ============================================================
// Monitor de Tanques em tempo real (todos os postos)
// ------------------------------------------------------------
// Le a ULTIMA medicao por (empresa, tanque) do Supabase (oct_medicoes),
// junta com oct_tanques (capacidade/combustivel) e oct_empresas (nome do posto).
// Dois modos:
//   moduloMonitor()   -> pagina dentro do retaguarda (com login), no #conteudo.
//   monitorTvBoot()   -> modo TV em tela cheia (link ?tv=1), sem login (anon key).
// Atualiza sozinho a cada 30s.
// ============================================================

let _monTimer = null;
let _monTv = false;

async function _monDados() {
  // empresas (nomes) + tanques ativos (capacidade) em paralelo
  const [rEmp, rTank] = await Promise.all([
    sb.from('oct_empresas').select('id,nome'),
    sb.from('oct_tanques').select('empresa_id,numero,combustivel,capacidade,ativo').eq('ativo', true),
  ]);
  const nomes = {};
  (rEmp.data || []).forEach(e => { nomes[e.id] = e.nome; });
  const tanks = (rTank.data || []);
  const empIds = [...new Set(tanks.map(t => t.empresa_id))];

  // ultima medicao por (empresa, tanque): busca as ultimas de cada empresa e deduplica
  const latest = {};
  await Promise.all(empIds.map(async (eid) => {
    const { data } = await sb.from('oct_medicoes')
      .select('tanque_numero,combustivel,volume,volume_tc,agua,temperatura,entrega_em_progresso,medido_em')
      .eq('empresa_id', eid).order('medido_em', { ascending: false }).limit(24);
    (data || []).forEach(m => {
      const k = eid + '|' + m.tanque_numero;
      if (!latest[k]) latest[k] = m;
    });
  }));
  return { nomes, tanks, latest };
}

function _monNum(v, dec) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }

// frescor da leitura: {cor, txt} conforme a idade
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

// cor da barra por nivel (%): vermelho baixo, ambar, verde
function _monCorNivel(pct) {
  if (pct <= 15) return '#ef4444';
  if (pct <= 30) return '#f59e0b';
  return '#22c55e';
}

function _monCardTanque(t, med, tv) {
  const cap = Number(t.capacidade || 0);
  const vol = med ? Number(med.volume || 0) : 0;
  const pct = cap > 0 ? Math.max(0, Math.min(100, (vol / cap) * 100)) : 0;
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
      <span style="color:#94a3b8;font-size:${tv ? '0.9rem' : '0.75rem'}">L de ${_monNum(cap)}</span>
      <span style="flex:1"></span>
      <span style="font-weight:700;color:${corBar};font-size:${tv ? '1.1rem' : '0.9rem'}">${_monNum(pct, 0)}%</span>
    </div>
    <div style="height:${tv ? '16px' : '12px'};background:#1e293b;border-radius:8px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${corBar};border-radius:8px;transition:width 0.6s"></div>
    </div>
    <div style="display:flex;gap:12px;margin-top:7px;font-size:${tv ? '0.85rem' : '0.7rem'};color:#94a3b8;flex-wrap:wrap">
      ${temp != null ? `<span>🌡️ ${_monNum(temp, 1)}°C</span>` : ''}
      <span style="color:${agua > 0 ? '#f87171' : '#94a3b8'}">💧 água ${_monNum(agua)} L</span>
      ${entrega ? `<span style="color:#38bdf8;font-weight:700">🚚 DESCARGA</span>` : ''}
    </div>
  </div>`;
}

function _monCardPosto(nome, tanks, latest, eid, tv) {
  const ts = tanks.filter(t => t.empresa_id === eid).sort((a, b) => (a.numero || 0) - (b.numero || 0));
  const cards = ts.map(t => _monCardTanque(t, latest[eid + '|' + t.numero], tv)).join('');
  // frescor geral do posto = leitura mais recente entre os tanques
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
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${colW},1fr));gap:${tv ? '14px' : '10px'}">${cards || '<div style="color:#6b7280;padding:10px">Sem tanques cadastrados.</div>'}</div>
  </div>`;
}

async function _monRenderInto(elId, tv) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const { nomes, tanks, latest } = await _monDados();
    const empIds = [...new Set(tanks.map(t => t.empresa_id))]
      .sort((a, b) => (nomes[a] || '').localeCompare(nomes[b] || ''));
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const corpo = empIds.length
      ? empIds.map(eid => _monCardPosto(nomes[eid], tanks, latest, eid, tv)).join('')
      : '<p style="color:#94a3b8;padding:24px">Nenhum tanque com medição encontrado.</p>';
    const cab = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:${tv ? '18px' : '12px'}">
        <div style="font-size:${tv ? '1.7rem' : '1.2rem'};font-weight:800;color:#e2e8f0">🛢️ Monitor de Tanques</div>
        <div style="flex:1"></div>
        <div style="font-size:${tv ? '1rem' : '0.8rem'};color:#94a3b8">atualizado ${hora} · a cada 30s</div>
        ${tv ? '' : '<button onclick="monitorAtualizar()" style="padding:6px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer">↻ Atualizar</button>'}
      </div>`;
    el.innerHTML = (tv
      ? `<div style="min-height:100vh;background:#070a11;padding:22px">${cab}${corpo}</div>`
      : `<div style="padding:${'4px 2px'}">${cab}${corpo}</div>`);
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

// atualização manual (botão)
function monitorAtualizar() { _monRenderInto(_monTv ? 'app' : 'conteudo', _monTv); }

// pagina no retaguarda (com login)
function moduloMonitor() { _monStart('conteudo', false); }

// modo TV em tela cheia (link ?tv=1), sem login
function monitorTvBoot() {
  document.title = 'Monitor de Tanques — Octano';
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<div id="tv-wrap"></div>';
  _monStart('app', true);
}
