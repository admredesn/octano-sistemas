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
  const [mR, cR, jR] = await Promise.all([
    sb.from('oct_banco_movimentos').select('*').eq('empresa_id', eid)
      .gte('data', per.ini).lte('data', per.fim).order('data', { ascending: false }),
    sb.from('oct_contas_pagar').select('id,descricao,valor,vencimento,competencia,status,categoria')
      .eq('empresa_id', eid).eq('status', 'aberto').order('vencimento'),
    sb.from('oct_plano_contas').select('id').eq('empresa_id', eid).eq('codigo', '5.1.02.01.0002').eq('ativo', true),
  ]);
  if (mR.error) throw new Error(mR.error.message + ' — rode o SQL-SICOOB-EXTRATO.sql');
  const movs = mR.data || [], abertas = cR.data || [];
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
  const card = (rot, val, cor, sub) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;min-width:160px">
    <div class="nfe-label">${rot}</div><div style="font-size:1.15rem;font-weight:700;color:${cor};margin-top:4px">${val}</div>
    ${sub ? `<div style="font-size:0.72rem;color:#778">${sub}</div>` : ''}</div>`;

  const linhaMov = (m, extra) => `<tr style="border-bottom:1px solid #1a1d2e">
    <td class="fc-td">${_cbDt(m.data)}</td>
    <td class="fc-td fc-r" style="font-weight:700;color:${m.tipo === 'debito' ? '#f0a0a0' : '#7ee2a0'}">${_cbMoney(m.valor)}</td>
    <td class="fc-td">${_cbEsc(m.descricao) || '—'}${_cbInterno(m) ? ' <span style="color:#c084fc;font-size:0.7rem">interno (grupo)</span>' : ''}</td>
    <td class="fc-td" style="color:#889;font-size:0.75rem">${_cbEsc((m.info || '').split('|')[1] || (m.info || '')).slice(0, 42)}</td>
    ${extra}</tr>`;

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
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        ${card('Débitos no período', _cbMoney(deb.reduce((s, m) => s + Number(m.valor), 0)), '#f0a0a0', deb.length + ' movimentos')}
        ${card('✓ Conciliados', _cbMoney(conciliados.reduce((s, m) => s + Number(m.valor), 0)), '#7ee2a0', conciliados.length + ' baixas automáticas/aprovadas')}
        ${card('？ Sugestões', _cbMoney(sugestoes.reduce((s, x) => s + Number(x.m.valor), 0)), '#fbbf24', sugestoes.length + ' aguardando aprovação')}
        ${card('○ Sem par', _cbMoney(semPar.reduce((s, m) => s + Number(m.valor), 0)), '#c9d2dc', semPar.length + ' a vincular/classificar')}
        ${card('Juros/multa acumulado', _cbMoney(totJuros), '#fb923c', 'conta 5.1.02.01.0002')}
        ${card('Créditos no período', _cbMoney(cred.reduce((s, m) => s + Number(m.valor), 0)), '#7ee2a0', cred.length + ' entradas')}
      </div>

      ${sugestoes.length ? `<div style="font-weight:700;color:#fbbf24;margin:12px 0 6px">？ Sugestões de baixa (${sugestoes.length}) — aprove uma a uma</div>
      <table class="fc-grid"><thead><tr><th>Data</th><th>Débito</th><th>Descrição</th><th>Origem</th><th>→ Título proposto</th><th>Dif</th><th></th></tr></thead><tbody>
      ${sugestoes.map(s => linhaMov(s.m, `
        <td class="fc-td">${_cbEsc(s.c.descricao).slice(0, 40)} <span style="color:#889;font-size:0.72rem">venc ${_cbDt(s.c.vencimento)} · ${_cbMoney(s.c.valor)}</span></td>
        <td class="fc-td" style="color:${s.dif > 0 ? '#fb923c' : s.dif < 0 ? '#7ee2a0' : '#889'}">${s.dif > 0 ? '+' + _cbMoney(s.dif) + ' juros' : s.dif < 0 ? _cbMoney(s.dif) + ' desc.' : 'exato'}</td>
        <td class="fc-td"><button class="fc-btn" style="color:#7ee2a0" onclick="cbAprovar('${s.m.id}','${s.c.id}',${s.dif})">✓ Aprovar</button></td>`)).join('')}
      </tbody></table>` : ''}

      <div style="font-weight:700;color:#c9d2dc;margin:16px 0 6px">○ Débitos sem par (${semPar.length})</div>
      <table class="fc-grid"><thead><tr><th>Data</th><th>Valor</th><th>Descrição</th><th>Origem</th><th></th></tr></thead><tbody>
      ${semPar.map(m => linhaMov(m, `<td class="fc-td">${_cbInterno(m) ? '<span style="color:#889;font-size:0.75rem">transferência interna</span>'
        : `<button class="fc-btn" onclick="cbVincular('${m.id}')">🔗 Vincular a um título</button>`}</td>`)).join('')
        || '<tr><td class="fc-td" colspan="5" style="color:#777">Nenhum.</td></tr>'}
      </tbody></table>

      <div style="font-weight:700;color:#7ee2a0;margin:16px 0 6px">✓ Conciliados (${conciliados.length})</div>
      <table class="fc-grid"><thead><tr><th>Data</th><th>Pagamento</th><th>Descrição</th><th>Origem</th><th>Título baixado</th><th>Encargos</th><th></th></tr></thead><tbody>
      ${conciliados.map(m => { const c = vinculadas[m.conta_pagar_id] || {}; return linhaMov(m, `
        <td class="fc-td">${_cbEsc(c.descricao || '—').slice(0, 40)} <span style="color:#889;font-size:0.72rem">${c.valor ? _cbMoney(c.valor) : ''}</span></td>
        <td class="fc-td" style="color:${Number(m.dif_encargos || 0) > 0 ? '#fb923c' : '#889'}">${m.dif_encargos ? _cbMoney(m.dif_encargos) : '—'}</td>
        <td class="fc-td"><button class="fc-btn mini" title="Desfazer a baixa" style="color:#f08080" onclick="cbDesfazer('${m.id}')">↩</button></td>`); }).join('')
        || '<tr><td class="fc-td" colspan="7" style="color:#777">Nenhum no período.</td></tr>'}
      </tbody></table>

      <div style="font-weight:700;color:#7ee2a0;margin:16px 0 6px">↧ Créditos (${cred.length})</div>
      <table class="fc-grid"><thead><tr><th>Data</th><th>Valor</th><th>Descrição</th><th>Origem</th><th></th></tr></thead><tbody>
      ${cred.map(m => linhaMov(m, '<td class="fc-td"></td>')).join('') || '<tr><td class="fc-td" colspan="5" style="color:#777">Nenhum.</td></tr>'}
      </tbody></table>
    </div></div>`;
}

// executa a baixa aprovada: título fecha pelo valor da NF; juros vira título
// pago na conta 5.1.02.01.0002; o movimento guarda a referência completa
async function cbAprovar(movId, contaId, dif) {
  const { data: mv } = await sb.from('oct_banco_movimentos').select('*').eq('id', movId).single();
  const { data: c } = await sb.from('oct_contas_pagar').select('*').eq('id', contaId).single();
  if (!mv || !c || c.status !== 'aberto') { alert('Título/movimento mudou — recarregando.'); _cbRender(); return; }
  const rot = dif > 0 ? ` + juros R$${dif.toFixed(2)}` : dif < 0 ? ` − desconto R$${(-dif).toFixed(2)}` : '';
  if (!confirm(`Baixar "${c.descricao}" (${_cbMoney(c.valor)}) com o pagamento de ${_cbMoney(mv.valor)} de ${_cbDt(mv.data)}${rot}?`)) return;
  const { error } = await sb.from('oct_contas_pagar').update({
    status: 'pago', data_pagamento: mv.data, valor_pago: Number(c.valor), forma_pagamento: 'Sicoob',
    observacoes: `conciliação aprovada na tela — pagamento de ${_cbMoney(mv.valor)} em ${mv.data} (mov ${mv.id}) ref. ${c.descricao}${rot}`,
  }).eq('id', contaId).eq('status', 'aberto');
  if (error) { alert('Erro: ' + error.message); return; }
  await sb.from('oct_banco_movimentos').update({ conciliado: true, conta_pagar_id: contaId, dif_encargos: dif || null }).eq('id', movId);
  if (dif > 0 && window._cbPlanoJuros) {
    await sb.from('oct_contas_pagar').insert({
      empresa_id: mv.empresa_id, descricao: `Juros/multa s/ ${c.descricao}`,
      fornecedor_id: c.fornecedor_id, nfe_id: c.nfe_id,
      valor: dif, valor_pago: dif, vencimento: mv.data, data_pagamento: mv.data,
      status: 'pago', forma_pagamento: 'Sicoob', competencia: mv.data,
      categoria: 'juros-multa', plano_conta_id: window._cbPlanoJuros,
      observacoes: `encargo do pagamento de ${_cbMoney(mv.valor)} em ${mv.data} (mov ${mv.id})`,
    });
  }
  _cbRender();
}

async function cbDesfazer(movId) {
  const { data: mv } = await sb.from('oct_banco_movimentos').select('*').eq('id', movId).single();
  if (!mv || !mv.conta_pagar_id) return;
  if (!confirm('Desfazer esta baixa? O título volta a ABERTO e o eventual título de juros é removido.')) return;
  await sb.from('oct_contas_pagar').update({
    status: 'aberto', data_pagamento: null, valor_pago: null, forma_pagamento: null,
    observacoes: 'baixa desfeita na tela de conciliação',
  }).eq('id', mv.conta_pagar_id);
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
  div.innerHTML = `<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:12px;max-width:760px;width:94%;max-height:80vh;overflow:auto;padding:18px">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <b style="color:#f97316">🔗 Vincular débito de ${_cbMoney(mv.valor)} (${_cbDt(mv.data)}) a um título</b>
      <button onclick="document.getElementById('cb-modal').remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:1.1rem">✕</button></div>
    <p style="color:#889;font-size:0.78rem;margin-bottom:10px">${_cbEsc(mv.descricao || '')} ${_cbEsc((mv.info || '').slice(0, 80))}</p>
    <table class="fc-grid"><thead><tr><th>Título aberto</th><th>Venc</th><th>Valor</th><th>Dif</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td class="fc-td" colspan="5" style="color:#777">Nenhum título aberto.</td></tr>'}</tbody></table></div>`;
  document.body.appendChild(div);
}
