// ============================================================
// MÓDULO PREÇO NA BOMBA — reajuste do combustível pelo retaguarda / Monitor (01/10/2026)
// ------------------------------------------------------------
// A tela não fala com o posto: grava um PEDIDO em oct_reajustes_preco e o núcleo
// do posto (que consulta a fila a cada 20 s) troca o preço bico a bico, esperando
// o bico ficar livre e conferindo o que a bomba gravou. O resultado de cada bico
// volta na própria linha e aparece aqui.
// O preço que ESTÁ na bomba vem de oct_precos_bomba (o núcleo lê a cada 10 min) —
// é por ele que se vê quando alguém (ou o TecnoX) mudou o preço por fora.
// Quem pode: master ou 'produtos.reajustar_bomba' (padrão: gerente). A trava é do
// banco (o Monitor em modo TV nem carrega permissões).
// ============================================================

const _pb = { empresaId: null, el: null, origem: 'retaguarda', timer: null, dados: null, formProd: null, empresas: [] };

async function moduloPrecoBomba() {
  const el = document.getElementById('conteudo');
  const eid = (typeof empresaAtiva === 'function' && empresaAtiva()) || null;
  await _pbIniciar(el, eid, 'retaguarda');
}

// aberto pelo Monitor de postos (também no celular): janela por cima do painel
function precoBombaAbrirMonitor(empresaId) {
  let ov = document.getElementById('pb-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pb-overlay';
    ov.className = 'modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;overflow:auto;padding:12px';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div style="max-width:1000px;margin:0 auto;background:#0f1117;border:1px solid #2a2d3e;border-radius:12px;padding:14px;position:relative">
      <button onclick="precoBombaFechar()" title="Fechar" style="position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:8px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;font-size:1.1rem;cursor:pointer">✕</button>
      <div id="pb-corpo"></div></div>`;
  _pbIniciar(document.getElementById('pb-corpo'), empresaId || null, 'monitor');
}

function precoBombaFechar() {
  const ov = document.getElementById('pb-overlay');
  if (ov) ov.remove();
  _pbPararTimer();
}

async function _pbIniciar(el, empresaId, origem) {
  _pbPararTimer();
  _pb.el = el; _pb.origem = origem; _pb.formProd = null;
  el.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  // postos que este usuário enxerga
  try {
    const [vis, emps] = await Promise.all([
      sb.rpc('oct_empresas_visiveis'),
      sb.from('oct_empresas').select('id,nome_fantasia,nome').order('nome_fantasia'),
    ]);
    const ids = (vis.data || []).map(x => (typeof x === 'string' ? x : (x.oct_empresas_visiveis || x.id)));
    _pb.empresas = (emps.data || []).filter(e => !ids.length || ids.includes(e.id));
  } catch (e) { _pb.empresas = []; }
  _pb.empresaId = empresaId || (_pb.empresas[0] && _pb.empresas[0].id) || null;
  await _pbCarregar();
}

function _pbPararTimer() { if (_pb.timer) { clearTimeout(_pb.timer); _pb.timer = null; } }

function _pbAgendarRefresh(rapido) {
  _pbPararTimer();
  _pb.timer = setTimeout(() => {
    if (!_pb.el || !document.body.contains(_pb.el)) return;      // saiu da tela
    if (_pb.formProd) { _pbAgendarRefresh(rapido); return; }     // preenchendo o reajuste
    _pbCarregar();
  }, rapido ? 5000 : 30000);
}

function _pbEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _pbR3(v) { return (v == null || isNaN(v)) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function _pbHex(h) { return String(h || '').trim().toUpperCase().padStart(2, '0').slice(-2); }
function _pbParse(s) { const n = parseFloat(String(s || '').trim().replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 1000) / 1000; }
function _pbQuando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function _pbHa(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'agora' : (min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`);
}
const _PB_STATUS = {
  agendado: ['🕒 agendado', '#38bdf8'], aplicando: ['⏳ aplicando', '#facc15'], aplicado: ['✅ aplicado', '#22c55e'],
  parcial: ['⚠️ parcial', '#f97316'], erro: ['❌ erro', '#f87171'], cancelado: ['🚫 cancelado', '#94a3b8'],
};

async function _pbCarregar() {
  const el = _pb.el, eid = _pb.empresaId;
  if (!el) return;
  if (!eid) { el.innerHTML = '<p style="color:#f87171;padding:20px">Nenhum posto disponível para este usuário.</p>'; return; }
  const [prR, biR, pbR, rjR] = await Promise.all([
    sb.from('oct_produtos').select('id,nome,preco_venda_a,tanque_id,ativo').eq('empresa_id', eid).not('tanque_id', 'is', null).order('nome'),
    sb.from('oct_bicos').select('numero,codigo_hex,tanque_id,combustivel,ativo').eq('empresa_id', eid).order('numero'),
    sb.from('oct_precos_bomba').select('*').eq('empresa_id', eid),
    sb.from('oct_reajustes_preco').select('*').eq('empresa_id', eid).order('criado_em', { ascending: false }).limit(20),
  ]);
  const semTabela = [pbR.error, rjR.error].some(e => e && /relation|does not exist|PGRST205|schema cache/i.test((e.message || '') + (e.code || '')));
  const lidos = {};
  (pbR.data || []).forEach(x => { lidos[_pbHex(x.codigo_hex)] = x; });
  _pb.dados = {
    produtos: (prR.data || []).filter(p => p.ativo !== false),
    bicos: (biR.data || []).filter(b => b.ativo !== false),
    lidos, reajustes: rjR.data || [], semTabela,
  };
  _pbRender();
  const ativo = _pb.dados.reajustes.some(r => r.status === 'aplicando' || (r.status === 'agendado' && new Date(r.aplicar_em) <= new Date(Date.now() + 60000)));
  _pbAgendarRefresh(ativo);
}

function _pbBicosDo(p) {
  const d = _pb.dados;
  return d.bicos.filter(b => b.tanque_id === p.tanque_id);
}

function _pbRender() {
  const d = _pb.dados, el = _pb.el;
  const podeReajustar = (typeof pode !== 'function') || pode('produtos.reajustar_bomba');
  const optsPosto = _pb.empresas.map(e => `<option value="${e.id}" ${e.id === _pb.empresaId ? 'selected' : ''}>${_pbEsc(e.nome_fantasia || e.nome)}</option>`).join('');
  const cards = d.produtos.map(p => {
    const bs = _pbBicosDo(p);
    const leit = bs.map(b => ({ b, l: d.lidos[_pbHex(b.codigo_hex)] }));
    const comLeitura = leit.filter(x => x.l && x.l.preco_nivel0 != null);
    const diverge = comLeitura.some(x => Math.abs(Number(x.l.preco_nivel0) - Number(p.preco_venda_a)) > 0.0005);
    const ultimo = comLeitura.map(x => x.l.lido_em).sort().pop();
    const pend = d.reajustes.find(r => r.produto_id === p.id && (r.status === 'agendado' || r.status === 'aplicando'));
    const linhaBicos = leit.map(x => {
      const v = x.l && x.l.preco_nivel0 != null ? Number(x.l.preco_nivel0) : null;
      const cor = v == null ? '#64748b' : (Math.abs(v - Number(p.preco_venda_a)) > 0.0005 ? '#f97316' : '#94a3b8');
      return `<span style="color:${cor};white-space:nowrap">bico ${x.b.numero}: ${v == null ? 'sem leitura' : v.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</span>`;
    }).join(' · ');
    return `<div style="background:#13151f;border:1px solid ${diverge ? '#f97316' : '#2a2d3e'};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-weight:700;color:#e2e8f0">⛽ ${_pbEsc(p.nome)}</div>
        ${podeReajustar && bs.length && !pend ? `<button onclick="_pbAbrirForm('${p.id}')" style="padding:8px 12px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">Reajustar</button>` : ''}
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.86rem">
        <div><span style="color:#888">Cadastro</span><br><strong style="color:#f8fafc;font-size:1.05rem">${_pbR3(p.preco_venda_a)}</strong></div>
        <div><span style="color:#888">Na bomba</span><br><strong style="color:${diverge ? '#f97316' : '#22c55e'};font-size:1.05rem">${!comLeitura.length ? '—'
          : (new Set(comLeitura.map(x => Number(x.l.preco_nivel0).toFixed(3))).size > 1 ? 'bicos diferentes' : _pbR3(comLeitura[0].l.preco_nivel0))}</strong></div>
      </div>
      <div style="font-size:0.76rem;line-height:1.5">${bs.length ? linhaBicos : '<span style="color:#f87171">nenhum bico ligado a este tanque</span>'}</div>
      <div style="font-size:0.72rem;color:#64748b">${ultimo ? 'bombas lidas ' + _pbHa(ultimo) : 'o posto ainda não publicou a leitura das bombas'}${diverge ? ' · <span style="color:#f97316">a bomba está diferente do cadastro</span>' : ''}</div>
      ${pend ? `<div style="font-size:0.8rem;color:${_PB_STATUS[pend.status][1]}">${_PB_STATUS[pend.status][0]} → ${_pbR3(pend.preco_novo)} ${pend.status === 'agendado' ? 'para ' + _pbQuando(pend.aplicar_em) : ''}</div>` : ''}
    </div>`;
  }).join('');

  const hist = d.reajustes.map(r => {
    const st = _PB_STATUS[r.status] || [r.status, '#ddd'];
    const res = r.resultado || {};
    const det = Object.keys(res).map(hx => {
      const x = res[hx] || {};
      const icone = x.ok ? '✓' : (x.situacao ? '…' : '✗');
      const cor = x.ok ? '#22c55e' : (x.situacao ? '#facc15' : '#f87171');
      const txt = x.ok ? (x.depois ? _pbR3(x.depois[0]) : 'ok') : _pbEsc(x.situacao || x.erro || '');
      return `<span style="color:${cor};white-space:nowrap">${icone} bico ${x.numero != null ? x.numero : hx}: ${txt}</span>`;
    }).join(' · ');
    return `<div style="border-top:1px solid #1f2230;padding:10px 2px;display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="color:#e2e8f0"><strong>${_pbEsc(r.produto_nome)}</strong> ${_pbR3(r.preco_anterior)} → <strong>${_pbR3(r.preco_novo)}</strong></div>
        <div style="color:${st[1]};font-weight:700">${st[0]}</div>
      </div>
      <div style="font-size:0.76rem;color:#888">pedido ${_pbQuando(r.criado_em)} por ${_pbEsc(r.criado_por_nome || '—')} (${_pbEsc(r.origem || '')}) · aplicar ${new Date(r.aplicar_em) <= new Date(r.criado_em) || Math.abs(new Date(r.aplicar_em) - new Date(r.criado_em)) < 90000 ? 'na hora' : _pbQuando(r.aplicar_em)}${r.concluido_em ? ' · concluído ' + _pbQuando(r.concluido_em) : ''}</div>
      ${det ? `<div style="font-size:0.78rem;line-height:1.5">${det}</div>` : ''}
      ${r.erro ? `<div style="font-size:0.78rem;color:#f87171">${_pbEsc(r.erro)}</div>` : ''}
      ${r.status === 'agendado' && podeReajustar ? `<div><button onclick="_pbCancelar('${r.id}')" style="padding:6px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#f87171;cursor:pointer">Cancelar</button></div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `<div style="max-width:1000px;padding:10px 6px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;padding-right:44px">
      <h2 style="color:#f97316;margin:0">⛽ Preço na bomba</h2>
      ${_pb.empresas.length > 1 ? `<select onchange="_pbTrocarPosto(this.value)" style="padding:8px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">${optsPosto}</select>` : `<span style="color:#94a3b8">${_pbEsc((_pb.empresas[0] || {}).nome_fantasia || '')}</span>`}
      <button onclick="_pbCarregar()" style="padding:8px 12px;border-radius:8px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer">↻</button>
    </div>
    <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 12px">O posto aplica o reajuste bico a bico, espera o bico ficar livre e confere lendo a bomba. O resultado aparece aqui.</p>
    ${d.semTabela ? '<div style="background:#3b1d0a;border:1px solid #f97316;border-radius:8px;padding:10px;color:#fdba74;margin-bottom:12px">Falta rodar o <b>SQL-REAJUSTE-PRECO-BOMBA.sql</b> no Supabase.</div>' : ''}
    <div id="pb-form"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:18px">${cards || '<p style="color:#888">Nenhum combustível ligado a tanque neste posto.</p>'}</div>
    <h3 style="color:#e2e8f0;margin:8px 0 2px;font-size:1rem">Últimos reajustes</h3>
    <div>${hist || '<p style="color:#666;font-size:0.85rem">Nenhum reajuste ainda.</p>'}</div>
  </div>`;
  if (_pb.formProd) _pbAbrirForm(_pb.formProd, true);
}

function _pbTrocarPosto(id) { _pb.empresaId = id; _pb.formProd = null; _pbCarregar(); }

function _pbAbrirForm(produtoId, manter) {
  const d = _pb.dados;
  const p = d.produtos.find(x => x.id === produtoId);
  const box = document.getElementById('pb-form');
  if (!p || !box) return;
  const ant = manter ? _pbLerForm() : null;
  _pb.formProd = produtoId;
  const bs = _pbBicosDo(p);
  const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  box.innerHTML = `<div style="background:#13151f;border:1px solid #f97316;border-radius:10px;padding:14px;margin-bottom:14px;max-width:560px">
    <div style="font-weight:800;color:#f97316;margin-bottom:8px">Reajustar ${_pbEsc(p.nome)}</div>
    <div style="color:#94a3b8;font-size:0.84rem;margin-bottom:10px">Preço atual no cadastro: <b style="color:#f8fafc">${_pbR3(p.preco_venda_a)}</b></div>
    <label style="color:#ccc;font-size:0.84rem">Preço novo (R$ por litro)</label>
    <input id="pb-preco" inputmode="decimal" autocomplete="off" placeholder="ex.: 6,390" oninput="_pbResumo()"
      style="display:block;width:100%;box-sizing:border-box;margin:4px 0 10px;padding:12px;font-size:1.3rem;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px;color:#ccc;font-size:0.9rem">
      <label style="cursor:pointer"><input type="radio" name="pb-quando" value="agora" checked onchange="_pbResumo()"> Agora</label>
      <label style="cursor:pointer"><input type="radio" name="pb-quando" value="agendar" onchange="_pbResumo()"> Agendar</label>
      <input id="pb-data" type="datetime-local" min="${agora}" onchange="_pbResumo()" style="padding:8px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
    </div>
    <div style="color:#ccc;font-size:0.84rem;margin-bottom:4px">Bicos</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:10px">${bs.map(b => {
      const l = d.lidos[_pbHex(b.codigo_hex)];
      return `<label style="color:#ddd;font-size:0.86rem;cursor:pointer"><input type="checkbox" class="pb-bico" value="${_pbEsc(b.codigo_hex)}" data-numero="${b.numero}" checked onchange="_pbResumo()"> bico ${b.numero}${l && l.preco_nivel0 != null ? ` <span style="color:#64748b">(${Number(l.preco_nivel0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })})</span>` : ''}</label>`;
    }).join('')}</div>
    <div id="pb-resumo" style="font-size:0.88rem;color:#e2e8f0;margin:6px 0 10px"></div>
    <label id="pb-conf-var" style="display:none;color:#fdba74;font-size:0.84rem;margin-bottom:10px;cursor:pointer"><input type="checkbox" id="pb-conf" onchange="_pbResumo()"> Confirmo esta variação de preço</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="pb-ok" onclick="_pbEnviar()" disabled style="padding:12px 16px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:800;cursor:pointer;opacity:.5">Confirmar reajuste</button>
      <button onclick="_pbFecharForm()" style="padding:12px 16px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#ddd;cursor:pointer">Cancelar</button>
    </div>
    <div id="pb-msg" style="margin-top:8px;font-size:0.86rem"></div>
  </div>`;
  if (ant) _pbRestaurarForm(ant);
  _pbResumo();
  if (!manter) { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = document.getElementById('pb-preco'); if (i) i.focus(); }
}

function _pbLerForm() {
  const q = id => document.getElementById(id);
  if (!q('pb-preco')) return null;
  return {
    preco: q('pb-preco').value, data: q('pb-data').value, conf: q('pb-conf').checked,
    quando: (document.querySelector('input[name="pb-quando"]:checked') || {}).value,
    bicos: Array.from(document.querySelectorAll('.pb-bico')).filter(c => c.checked).map(c => c.value),
  };
}
function _pbRestaurarForm(f) {
  document.getElementById('pb-preco').value = f.preco || '';
  document.getElementById('pb-data').value = f.data || '';
  document.getElementById('pb-conf').checked = !!f.conf;
  const r = document.querySelector(`input[name="pb-quando"][value="${f.quando || 'agora'}"]`); if (r) r.checked = true;
  document.querySelectorAll('.pb-bico').forEach(c => { c.checked = f.bicos.includes(c.value); });
}

function _pbFecharForm() { _pb.formProd = null; const b = document.getElementById('pb-form'); if (b) b.innerHTML = ''; }

// monta o resumo e decide se o botão libera; devolve o pedido pronto (ou null)
function _pbResumo() {
  const d = _pb.dados, p = d && d.produtos.find(x => x.id === _pb.formProd);
  const out = document.getElementById('pb-resumo'), btn = document.getElementById('pb-ok');
  if (!p || !out || !btn) return null;
  const f = _pbLerForm();
  const novo = _pbParse(f.preco);
  const atual = Number(p.preco_venda_a) || null;
  const travar = msg => { out.innerHTML = msg ? `<span style="color:#f87171">${msg}</span>` : ''; btn.disabled = true; btn.style.opacity = '.5'; document.getElementById('pb-conf-var').style.display = 'none'; return null; };
  if (novo == null) return travar('');
  if (novo < 0.5 || novo > 9.999) return travar('Preço fora da faixa (de R$ 0,500 a R$ 9,999).');
  if (!f.bicos.length) return travar('Marque pelo menos um bico.');
  let quando = new Date();
  if (f.quando === 'agendar') {
    if (!f.data) return travar('Escolha a data e a hora do reajuste.');
    quando = new Date(f.data);
    if (isNaN(quando) || quando < new Date(Date.now() - 60000)) return travar('A data do agendamento já passou.');
  }
  const varPct = atual ? (novo - atual) / atual * 100 : 0;
  const grande = Math.abs(varPct) > 10;
  document.getElementById('pb-conf-var').style.display = grande ? 'block' : 'none';
  const sinal = varPct >= 0 ? '+' : '';
  out.innerHTML = `Trocar <b>${_pbEsc(p.nome)}</b> de ${_pbR3(atual)} para <b style="color:#f97316">${_pbR3(novo)}</b>
    (<span style="color:${grande ? '#f87171' : '#94a3b8'}">${sinal}${varPct.toFixed(1).replace('.', ',')}%</span>) em ${f.bicos.length} bico(s) —
    <b>${f.quando === 'agendar' ? _pbQuando(quando.toISOString()) : 'agora'}</b>.`;
  const liberado = !grande || f.conf;
  btn.disabled = !liberado; btn.style.opacity = liberado ? '1' : '.5';
  if (!liberado) return null;
  const bicos = Array.from(document.querySelectorAll('.pb-bico')).filter(c => c.checked)
    .map(c => ({ codigo_hex: _pbHex(c.value), numero: Number(c.dataset.numero) }));
  return { p, novo, atual, quando, bicos };
}

async function _pbEnviar() {
  const ped = _pbResumo();
  const msg = document.getElementById('pb-msg'), btn = document.getElementById('pb-ok');
  if (!ped) return;
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('sessão expirada — entre de novo');
    let nome = user.email;
    try { const pr = await sb.from('oct_perfis').select('nome').eq('id', user.id).maybeSingle(); if (pr.data && pr.data.nome) nome = pr.data.nome; } catch (e) { /* fica o e-mail */ }
    const { error } = await sb.from('oct_reajustes_preco').insert({
      empresa_id: _pb.empresaId, produto_id: ped.p.id, produto_nome: ped.p.nome,
      preco_anterior: ped.atual, preco_novo: ped.novo, bicos: ped.bicos,
      aplicar_em: ped.quando.toISOString(), origem: _pb.origem,
      criado_por: user.id, criado_por_nome: nome,
    });
    if (error) {
      const semPerm = error.code === '42501' || /row-level security/i.test(error.message || '');
      throw new Error(semPerm ? 'Você não tem permissão para reajustar preço neste posto.' : (error.message || 'erro ao gravar'));
    }
    _pb.formProd = null;
    await _pbCarregar();
    const m = document.getElementById('pb-form');
    if (m) m.innerHTML = `<div style="background:#0b2a17;border:1px solid #22c55e;border-radius:10px;padding:12px;color:#86efac;margin-bottom:12px">Pedido enviado. ${ped.quando > new Date(Date.now() + 60000) ? 'O posto aplica em ' + _pbQuando(ped.quando.toISOString()) + '.' : 'O posto começa em até 20 segundos; acompanhe em "Últimos reajustes".'}</div>`;
  } catch (e) {
    msg.innerHTML = `<span style="color:#f87171">${_pbEsc(e.message || e)}</span>`;
    btn.disabled = false; btn.textContent = 'Confirmar reajuste';
  }
}

async function _pbCancelar(id) {
  if (!confirm('Cancelar este reajuste agendado?')) return;
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('oct_reajustes_preco')
    .update({ status: 'cancelado', cancelado_por: user && user.id, cancelado_em: new Date().toISOString() })
    .eq('id', id).eq('status', 'agendado').select('id');
  if (error) alert('Não consegui cancelar: ' + (error.message || error));
  else if (!data || !data.length) alert('O posto já começou a aplicar este reajuste — não dá mais para cancelar.');
  _pbCarregar();
}
