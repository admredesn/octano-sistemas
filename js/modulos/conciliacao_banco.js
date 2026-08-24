// ============================================================
// CONCILIAÇÃO BANCÁRIA (Sicoob) — extrato × contas a pagar
// ------------------------------------------------------------
// O extrato entra sozinho (gateway/sync); o conciliador 6/6h baixa o que é
// inequívoco. Esta tela mostra o resultado e resolve o resto:
//   ✓ Conciliados  — movimento ligado ao título (ref. NF, encargos separados)
//   ？ Sugestões    — pares prováveis para APROVAR com um clique
//   ○ Sem par      — débitos p/ vincular manualmente a um título
//   ↧ Créditos     — entradas (Pix recebidos, transferências...)
// Regras espelham o conciliador: exato · juros≤12% (título vencido) ·
// desconto≤5% · débito nunca antes da emissão · transferência interna não casa.
// Juros/multa aprovado aqui também vira título pago em 5.1.02.01.0002.
// Auto-atualização a cada 60s (pausa com modal aberto).
// ============================================================

const _CB_REFRESH_MS = 60000;

function _cbMoney(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function _cbDt(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'; }
function _cbEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _cbInterno(m) { return ((m.info || '') + (m.descricao || '')).includes('FAV.: SN '); }

async function moduloConcBanco() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando conciliação...</p>';
  try { await _cbRender(); }
  catch (e) {
    conteudo.innerHTML = '<div style="padding:24px;color:#f44">Erro: ' + (e.message || e) +
      ' <button onclick="moduloConcBanco()" style="margin-left:10px;padding:6px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Tentar de novo</button></div>';
  }
  if (!window._cbTimer) {
    window._cbTimer = setInterval(() => {
      try {
        if (!document.getElementById('cb-raiz')) return;
        if (document.getElementById('cb-modal')) return;   // não atrapalha vínculo manual
        _cbRender();
      } catch (e) {}
    }, _CB_REFRESH_MS);
  }
}

function _cbPeriodo() {
  const p = window._cbPer || {};
  const hoje = new Date();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { ini: p.ini || iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), fim: p.fim || iso(hoje) };
}
function cbSetPeriodo() {
  window._cbPer = { ini: document.getElementById('cb-ini').value, fim: document.getElementById('cb-fim').value };
  _cbRender();
}

async function _cbRender() {
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { document.getElementById('conteudo').innerHTML = '<p style="color:#f44;padding:20px">Selecione a empresa.</p>'; return; }
  const per = _cbPeriodo();
  const [mR, cR, pgR, jR] = await Promise.all([
    sb.from('oct_banco_movimentos').select('*').eq('empresa_id', eid)
      .gte('data', per.ini).lte('data', per.fim).order('data', { ascending: false }),
    sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento,competencia,status,categoria')
      .eq('empresa_id', eid).eq('status', 'aberto').order('vencimento'),
    sb.from('oct_contas_pagar').select('id,descricao,valor,valor_pago,vencimento,data_pagamento,status,categoria')
      .eq('empresa_id', eid).eq('status', 'pago')
      .gte('data_pagamento', per.ini).lte('data_pagamento', per.fim).order('data_pagamento', { ascending: false }),
    sb.from('oct_plano_contas').select('id').eq('empresa_id', eid).eq('codigo', '5.1.02.01.0002').eq('ativo', true),
  ]);
  if (mR.error) throw new Error(mR.error.message + ' — rode o SQL-SICOOB-EXTRATO.sql');
  const movs = mR.data || [], abertas = cR.data || [], pagas = pgR.data || [];
  window._cbPlanoJuros = (jR.data && jR.data[0] && jR.data[0].id) || null;
  window._cbAbertas = abertas;

  // títulos vinculados aos movimentos conciliados (p/ mostrar a referência)
  const ids = [...new Set(movs.filter(m => m.conta_pagar_id).map(m => m.conta_pagar_id))];
  let vinculadas = {};
  if (ids.length) {
    const { data } = await sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento').in('id', ids);
    (data || []).forEach(c => vinculadas[c.id] = c);
  }

  const deb = movs.filter(m => m.tipo === 'debito');
  const cred = movs.filter(m => m.tipo === 'credito');
  const conciliados = deb.filter(m => m.conciliado);
  const pendentes = deb.filter(m => !m.conciliado);

  // sugestões: mesmas regras do conciliador automático (mas sempre com aprovação)
  const usadas = new Set();
  const sugestoes = [];
  pendentes.forEach(m => {
    if (_cbInterno(m)) return;
    const vm = Number(m.valor);
    const cands = abertas.filter(c => !usadas.has(c.id) && m.data >= (c.competencia || '0000-00-00'));
    const exato = cands.filter(c => Math.abs(Number(c.valor) - vm) < 0.005);
    let alvo = null, tipo = '', dif = 0;
    if (exato.length === 1) { alvo = exato[0]; tipo = 'exato'; }
    if (!alvo) {
      const juros = cands.filter(c => c.vencimento <= m.data && vm - Number(c.valor) > 0 && vm - Number(c.valor) <= Math.max(0.10, Number(c.valor) * 0.12));
      if (juros.length === 1) { alvo = juros[0]; tipo = 'juros'; dif = Math.round((vm - Number(alvo.valor)) * 100) / 100; }
    }
    if (!alvo) {
      const desc = cands.filter(c => Number(c.valor) - vm > 0 && Number(c.valor) - vm <= Number(c.valor) * 0.05);
      if (desc.length === 1) { alvo = desc[0]; tipo = 'desconto'; dif = Math.round((vm - Number(alvo.valor)) * 100) / 100; }
    }
    if (alvo) { usadas.add(alvo.id); sugestoes.push({ m, c: alvo, tipo, dif }); }
  });
  const sugeridos = new Set(sugestoes.map(s => s.m.id));
  const semPar = pendentes.filter(m => !sugeridos.has(m.id));

  const totJuros = conciliados.reduce((s, m) => s + Math.max(0, Number(m.dif_encargos || 0)), 0);
  const sugPorConta = {};
  sugestoes.forEach(s => sugPorConta[s.c.id] = s);
  const movPorConta = {};
  conciliados.forEach(m => movPorConta[m.conta_pagar_id] = m);

  const card = (rot, val, cor, sub) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:10px 12px;min-width:148px">
    <div class="nfe-label">${rot}</div><div style="font-size:1.05rem;font-weight:700;color:${cor};margin-top:3px">${val}</div>
    ${sub ? `<div style="font-size:0.7rem;color:#778">${sub}</div>` : ''}</div>`;

  // ---- COLUNA ESQUERDA: lançamentos do SISTEMA (contas a pagar) ----
  const chip = (txt, cor, bg) => `<span style="font-size:0.68rem;font-weight:700;padding:1px 8px;border-radius:9px;background:${bg};color:${cor}">${txt}</span>`;
  const linSis = [];
  pagas.forEach(c => {
    const m = movPorConta[c.id];
    linSis.push(`<div style="display:flex;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid #1a1d2e;background:#0f1a12">
      <div style="width:44px;color:#889;font-size:0.75rem">${_cbDt(c.data_pagamento)}</div>
      <div style="flex:1;min-width:0"><div style="color:#dfe6ee;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_cbEsc(c.descricao)}</div>
        <div style="font-size:0.7rem;color:#788">${c.categoria === 'juros-multa' ? 'juros/multa · conta 5.1.02.01.0002' : 'venc ' + _cbDt(c.vencimento)}${m ? ' · casado com o extrato →' : ''}</div></div>
      <div style="font-weight:700;color:#7ee2a0">${_cbMoney(c.valor)}</div>
      ${chip('PAGO', '#7ee2a0', '#10231a')}
      ${m ? `<button class="fc-btn mini" title="Desfazer a baixa" style="color:#f08080" onclick="cbDesfazer('${m.id}')">↩</button>` : '<span style="width:26px"></span>'}
    </div>`);
  });
  abertas.forEach(c => {
    const s = sugPorConta[c.id];
    linSis.push(`<div style="display:flex;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid #1a1d2e;${s ? 'background:#1a1500' : ''}">
      <div style="width:44px;color:#889;font-size:0.75rem">${_cbDt(c.vencimento)}</div>
      <div style="flex:1;min-width:0"><div style="color:#dfe6ee;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_cbEsc(c.descricao)}</div>
        <div style="font-size:0.7rem;color:#788">${s ? '？ sugestão no extrato: pagamento de ' + _cbMoney(s.m.valor) + ' em ' + _cbDt(s.m.data) : 'sem pagamento localizado'}</div></div>
      <div style="font-weight:700;color:${c.vencimento < new Date().toISOString().slice(0, 10) ? '#f0a0a0' : '#e5e7eb'}">${_cbMoney(c.valor)}</div>
      ${chip(c.vencimento < new Date().toISOString().slice(0, 10) ? 'VENCIDO' : 'ABERTO', c.vencimento < new Date().toISOString().slice(0, 10) ? '#f0a0a0' : '#fbbf24', '#241a08')}
      ${s ? `<button class="fc-btn mini" style="color:#7ee2a0" title="Aprovar a baixa sugerida" onclick="cbAprovar('${s.m.id}','${c.id}',${s.dif})">✓</button>` : '<span style="width:26px"></span>'}
    </div>`);
  });

  // ---- COLUNA DIREITA: EXTRATO do banco ----
  const linBan = movs.map(m => {
    const c = m.conta_pagar_id ? (vinculadas[m.conta_pagar_id] || {}) : null;
    const sug = sugestoes.find(s => s.m.id === m.id);
    const deb_ = m.tipo === 'debito';
    let rodape, acao = '<span style="width:26px"></span>', bg = '';
    if (m.conciliado && c) {
      bg = 'background:#0f1a12';
      rodape = `✓ baixou: ${_cbEsc((c.descricao || '').slice(0, 44))}${m.dif_encargos ? ' · encargos ' + _cbMoney(m.dif_encargos) : ''}`;
      acao = `<button class="fc-btn mini" title="Desfazer" style="color:#f08080" onclick="cbDesfazer('${m.id}')">↩</button>`;
    } else if (sug) {
      bg = 'background:#1a1500';
      const _se = _cbClassificaEncargo(sug.dif, sug.c.vencimento, m.data);
      rodape = `？ sugestão: ${_cbEsc(sug.c.descricao.slice(0, 40))} (${_se.tarifa > 0 ? '+' + _cbMoney(_se.tarifa) + ' tarifa' : _se.juros > 0 ? '+' + _cbMoney(_se.juros) + ' juros' : sug.dif < 0 ? _cbMoney(sug.dif) + ' desc.' : 'exato'})`;
      acao = `<button class="fc-btn mini" style="color:#7ee2a0" title="Aprovar" onclick="cbAprovar('${m.id}','${sug.c.id}',${sug.dif})">✓</button>`;
    } else if (_cbInterno(m)) {
      rodape = '<span style="color:#c084fc">transferência interna do grupo</span>';
    } else if (deb_) {
      rodape = _cbEsc((m.info || '').split('|').filter(Boolean)[1] || m.info || '').slice(0, 46) || 'sem par no sistema';
      acao = `<button class="fc-btn mini" title="Vincular a um título" onclick="cbVincular('${m.id}')">🔗</button>`;
    } else {
      rodape = _cbEsc((m.info || '').split('|').filter(Boolean)[1] || '').slice(0, 46) || 'entrada';
    }
    return `<div style="display:flex;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid #1a1d2e;${bg}">
      <div style="width:44px;color:#889;font-size:0.75rem">${_cbDt(m.data)}</div>
      <div style="flex:1;min-width:0"><div style="color:#dfe6ee;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_cbEsc(m.descricao) || '—'}</div>
        <div style="font-size:0.7rem;color:#788">${rodape}</div></div>
      <div style="font-weight:700;color:${deb_ ? '#f0a0a0' : '#7ee2a0'}">${deb_ ? '−' : '+'}${_cbMoney(m.valor)}</div>
      ${acao}</div>`;
  });

  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('conteudo').innerHTML = `
  <div class="og-janela" id="cb-raiz">
    <div class="og-titulo"><span>🏦 Conciliação bancária — Sicoob</span>
      <span style="font-size:0.72rem;color:#667;font-weight:400;margin-left:12px">atualizado ${agora} · renova a cada 60s</span>
      <button class="og-fechar" onclick="navegarPara('empresa')">✕</button></div>
    <div style="padding:14px 16px">
      <div class="fc-filtros" style="margin-bottom:12px">
        <label>Período:</label>
        <input id="cb-ini" type="date" value="${per.ini}" class="fc-inp2">
        <span style="color:#667">até</span>
        <input id="cb-fim" type="date" value="${per.fim}" class="fc-inp2">
        <button class="fc-btn" onclick="cbSetPeriodo()">Aplicar</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${card('✓ Conciliados', _cbMoney(conciliados.reduce((s, m) => s + Number(m.valor), 0)), '#7ee2a0', conciliados.length + ' baixas')}
        ${card('？ Sugestões', _cbMoney(sugestoes.reduce((s, x) => s + Number(x.m.valor), 0)), '#fbbf24', sugestoes.length + ' p/ aprovar')}
        ${card('○ Débitos sem par', _cbMoney(semPar.reduce((s, m) => s + Number(m.valor), 0)), '#c9d2dc', semPar.length + ' a vincular')}
        ${card('Juros/multa acumulado', _cbMoney(totJuros), '#fb923c', 'conta 5.1.02.01.0002')}
        ${card('Entradas no período', _cbMoney(cred.reduce((s, m) => s + Number(m.valor), 0)), '#7ee2a0', cred.length + ' créditos')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#0d1017;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
          <div style="padding:9px 12px;background:#13151f;border-bottom:1px solid #2a2d3e;font-weight:700;color:#f97316">
            📋 Sistema — contas a pagar <span style="color:#667;font-size:0.72rem;font-weight:400">(${pagas.length} pagas no período · ${abertas.length} abertas)</span></div>
          <div style="max-height:62vh;overflow:auto">${linSis.join('') || '<p style="padding:16px;color:#777">Nada no período.</p>'}</div>
        </div>
        <div style="background:#0d1017;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
          <div style="padding:9px 12px;background:#13151f;border-bottom:1px solid #2a2d3e;font-weight:700;color:#60a5fa">
            🏦 Banco — extrato Sicoob <span style="color:#667;font-size:0.72rem;font-weight:400">(${movs.length} movimentos)</span></div>
          <div style="max-height:62vh;overflow:auto">${linBan.join('') || '<p style="padding:16px;color:#777">Sem movimentos no período.</p>'}</div>
        </div>
      </div>
      <p style="color:#556;font-size:0.72rem;margin-top:10px">✓ verde = casado · amarelo = sugestão (aprove no ✓) · 🔗 = vincular manual · ↩ = desfazer · roxo = transferência interna do grupo (não concilia com fornecedor).</p>
    </div></div>`;
}

// TARIFA x JUROS — quando o pagamento sai maior que o boleto, a diferença não é
// toda juros. O banco cobra uma tarifa fixa por boleto liquidado, que independe
// de atraso. Medido no Tijuco: R$ 3,72 em 7 títulos, com 0, 1 e 2 dias de atraso,
// em faces de 11 mil a 27 mil — dois deles pagos NO PRÓPRIO VENCIMENTO. Já os
// juros de verdade variam de 0,22% a 8,27% da face conforme os dias.
// Somadas, a tarifa inflava a despesa de atraso que não houve.
const CB_TARIFA_BOLETO = 3.72;   // tarifa do Sicoob por boleto liquidado

// A coluna `tarifa` só existe depois do SQL-TARIFA-BANCARIA.sql. Enquanto não
// rodar, o PostgREST recusa o update inteiro e a baixa não acontece — a tela
// diria "erro" sem o usuário entender por quê. Tenta com, cai para sem.
async function _cbUpdConta(id, patch, extraFiltro) {
  const exec = (p) => {
    let q = sb.from('oct_contas_pagar').update(p).eq('id', id);
    if (extraFiltro) q = q.eq(extraFiltro[0], extraFiltro[1]);
    return q;
  };
  let r = await exec(patch);
  if (r.error && 'tarifa' in patch) {
    const semTarifa = Object.assign({}, patch);
    delete semTarifa.tarifa;
    // sem a coluna, o encargo volta a ser tudo juros — melhor que perder a baixa
    if (semTarifa.juros === 0 && patch.tarifa > 0) semTarifa.juros = patch.tarifa;
    r = await exec(semTarifa);
  }
  return r;
}

// Classifica a diferença positiva. Conservador de propósito: só chama de tarifa
// quando tem certeza — bate com o valor conhecido, ou não houve atraso nenhum
// (sem atraso não existe juros). Fora disso, mantém juros e não inventa rateio.
function _cbClassificaEncargo(dif, vencimento, dataPgto) {
  if (!(dif > 0.004)) return { juros: 0, tarifa: 0 };
  const d = Math.round(dif * 100) / 100;
  if (Math.abs(d - CB_TARIFA_BOLETO) < 0.015) return { juros: 0, tarifa: d };
  const v = Date.parse(String(vencimento || '').slice(0, 10));
  const p = Date.parse(String(dataPgto || '').slice(0, 10));
  if (v && p && p <= v) return { juros: 0, tarifa: d };   // pago em dia: não é juros
  return { juros: d, tarifa: 0 };
}

// executa a baixa aprovada: o título fecha pelo que SAIU DA CONTA; o encargo fica
// dentro do próprio título, separado em juros (5.1.02.01.0002) e tarifa
// bancária (5.1.02.01.0001); o movimento guarda a referência completa
async function cbAprovar(movId, contaId, dif) {
  const { data: mv } = await sb.from('oct_banco_movimentos').select('*').eq('id', movId).single();
  const { data: c } = await sb.from('oct_contas_pagar').select('*').eq('id', contaId).single();
  if (!mv || !c || c.status !== 'aberto') { alert('Título/movimento mudou — recarregando.'); _cbRender(); return; }
  const enc = _cbClassificaEncargo(dif, c.vencimento, mv.data);
  const rot = enc.tarifa > 0 ? ` + tarifa bancária R$${enc.tarifa.toFixed(2)}`
    : enc.juros > 0 ? ` + juros R$${enc.juros.toFixed(2)}`
    : dif < 0 ? ` − desconto R$${(-dif).toFixed(2)}` : '';
  if (!confirm(`Baixar "${c.descricao}" (${_cbMoney(c.valor)}) com o pagamento de ${_cbMoney(mv.valor)} de ${_cbDt(mv.data)}${rot}?`)) return;
  // A BAIXA VALE O QUE SAIU DA CONTA (extrato manda) e o encargo fica no próprio
  // título, em juros/desconto. Antes gravava valor_pago = valor de face e criava
  // um título separado para a diferença — a conciliação bancária não fechava e
  // o encargo virava "título novo" solto na lista.
  const { error } = await _cbUpdConta(contaId, {
    status: 'pago', data_pagamento: mv.data, valor_pago: Number(mv.valor),
    juros: Number(enc.juros.toFixed(2)),
    tarifa: Number(enc.tarifa.toFixed(2)),
    desconto: dif < 0 ? Number((-dif).toFixed(2)) : 0,
    forma_pagamento: 'Sicoob',
    observacoes: `conciliação aprovada na tela — pagamento de ${_cbMoney(mv.valor)} em ${mv.data} (mov ${mv.id}) ref. ${c.descricao}${rot}`,
  }, ['status', 'aberto']);
  if (error) { alert('Erro: ' + error.message); return; }
  await sb.from('oct_banco_movimentos').update({ conciliado: true, conta_pagar_id: contaId, dif_encargos: dif || null }).eq('id', movId);
  // (não cria mais título separado para o encargo — ele vive no campo 'juros'
  //  do próprio título e a contabilidade lança em D Juros Passivos 5.1.02.01.0002)
  _cbRender();
}

async function cbDesfazer(movId) {
  const { data: mv } = await sb.from('oct_banco_movimentos').select('*').eq('id', movId).single();
  if (!mv || !mv.conta_pagar_id) return;
  if (!confirm('Desfazer esta baixa? O título volta a ABERTO e o eventual título de juros é removido.')) return;
  await _cbUpdConta(mv.conta_pagar_id, {
    status: 'aberto', data_pagamento: null, valor_pago: null, forma_pagamento: null,
    juros: 0, tarifa: 0, desconto: 0,
    observacoes: 'baixa desfeita na tela de conciliação',
  });
  await sb.from('oct_contas_pagar').delete().eq('categoria', 'juros-multa').like('observacoes', `%${movId}%`);
  await sb.from('oct_banco_movimentos').update({ conciliado: false, conta_pagar_id: null, dif_encargos: null }).eq('id', movId);
  _cbRender();
}

// vínculo manual: escolhe o título aberto para este débito
async function cbVincular(movId) {
  const { data: mv } = await sb.from('oct_banco_movimentos').select('*').eq('id', movId).single();
  if (!mv) return;
  const abertas = (window._cbAbertas || []);
  const linhas = abertas.map(c => {
    const dif = Math.round((Number(mv.valor) - Number(c.valor)) * 100) / 100;
    return `<tr style="border-bottom:1px solid #1a1d2e">
      <td class="fc-td">${_cbEsc(c.descricao).slice(0, 44)}</td>
      <td class="fc-td">${_cbDt(c.vencimento)}</td>
      <td class="fc-td fc-r">${_cbMoney(c.valor)}</td>
      <td class="fc-td" style="color:${dif > 0 ? '#fb923c' : dif < 0 ? '#7ee2a0' : '#889'}">${dif > 0 ? '+' + _cbMoney(dif) : dif < 0 ? _cbMoney(dif) : 'exato'}</td>
      <td class="fc-td"><button class="fc-btn" onclick="document.getElementById('cb-modal').remove();cbAprovar('${movId}','${c.id}',${dif})">Vincular</button></td></tr>`;
  }).join('');
  const div = document.createElement('div');
  div.id = 'cb-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `<div id="cb-modal-cx" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:12px;max-width:760px;width:94%;max-height:80vh;min-width:340px;min-height:160px;overflow:auto;resize:both;padding:18px">
    <div id="cb-modal-tit" style="display:flex;justify-content:space-between;margin-bottom:10px">
      <b style="color:#f97316">🔗 Vincular débito de ${_cbMoney(mv.valor)} (${_cbDt(mv.data)}) a um título</b>
      <button onclick="document.getElementById('cb-modal').remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:1.1rem">✕</button></div>
    <p style="color:#889;font-size:0.78rem;margin-bottom:10px">${_cbEsc(mv.descricao || '')} ${_cbEsc((mv.info || '').slice(0, 80))}</p>
    <table class="fc-grid"><thead><tr><th>Título aberto</th><th>Venc</th><th>Valor</th><th>Dif</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td class="fc-td" colspan="5" style="color:#777">Nenhum título aberto.</td></tr>'}</tbody></table></div>`;
  document.body.appendChild(div);
  if (typeof octArrastavel === 'function')
    octArrastavel(document.getElementById('cb-modal-cx'), document.getElementById('cb-modal-tit'));
}
