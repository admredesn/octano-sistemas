// ============================================================
// MÓDULO FECHAMENTO DE CAIXA (retaguarda) — espelha o TecnoX
// Lista de turnos + detalhe (Recebimentos × Vendas/Saídas), lendo os dados
// próprios do octano: oct_pdv_turnos, oct_pdv_vendas (pagamentos/itens),
// oct_pdv_abastecimentos (combustível) e oct_pdv_caixa (sangria/suprimento/despesa).
// Fórmula espelha a view vw_log_valores_turno do TecnoX (combustível×produto,
// cartão CC/CD, pix DG, nota a prazo NP).
// ============================================================

// Mapeia o código da forma de pagamento (tPag) para grupo do fechamento.
// 01 dinheiro | 02 cheque | 03 crédito | 04 débito | 05 crédito loja |
// 17/18/19 pix | 15 boleto | 99 prazo/outros | 90 sem pagamento.
function _fcGrupoForma(cod) {
  const c = String(cod || '').padStart(2, '0');
  if (c === '01') return 'dinheiro';
  if (c === '02') return 'cheque';
  if (['03', '04', '05', '10', '11', '12', '13'].includes(c)) return 'cartao';
  if (['17', '18', '19'].includes(c)) return 'pix';
  if (['15', '31'].includes(c)) return 'boleto';
  if (['99', '90'].includes(c)) return 'prazo';
  return 'outros';
}

function fcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fcMoney(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fcNum(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
function fcDataHora(v) { if (!v) return '—'; const d = new Date(v); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

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

// Carrega turnos do período e agrega vendas/abastecimentos/caixa por turno.
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

  const [vRes, cRes] = await Promise.all([
    sb.from('oct_pdv_vendas').select('turno_id,valor_total,pagamentos,itens,status').eq('empresa_id', eid).in('turno_id', ids),
    sb.from('oct_pdv_caixa').select('turno_id,tipo,forma,valor,descricao').eq('empresa_id', eid).in('turno_id', ids),
  ]);

  const porTurno = {};
  ids.forEach(id => porTurno[id] = {
    venda_total: 0, venda_comb: 0, litros_comb: 0, venda_prod: 0,
    rec: { dinheiro: 0, cartao: 0, pix: 0, prazo: 0, cheque: 0, boleto: 0, outros: 0 },
    sangria: 0, suprimento: 0, despesa: 0, deposito: 0, outrosCaixa: 0,
    qtd_vendas: 0, movs: [],
  });

  // vendas: total, combustível×produto (a partir dos ITENS do cupom, espelhando a
  // vw_log_valores_turno do TecnoX: item tipo 'abastecimento' = combustível, resto = produto)
  // e pagamentos por grupo.
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
      const g = _fcGrupoForma(p.forma);
      t.rec[g] = (t.rec[g] || 0) + Number(p.valor || 0);
    });
  });

  // caixa: sangrias/suprimentos/despesas/depósitos
  (cRes.data || []).forEach(m => {
    const t = porTurno[m.turno_id]; if (!t) return;
    const tipo = String(m.tipo || '').toLowerCase();
    const val = Number(m.valor || 0);
    if (tipo.includes('sangria')) t.sangria += val;
    else if (tipo.includes('suprim')) t.suprimento += val;
    else if (tipo.includes('desp')) t.despesa += val;
    else if (tipo.includes('depos')) t.deposito += val;
    else t.outrosCaixa += val;
    t.movs.push(m);
  });

  return { turnos: lista, porTurno };
}

async function fcListar() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando turnos...</p>';
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };

  const linhas = turnos.map(t => {
    const d = porTurno[t.id] || {};
    const rec = d.rec || {};
    const situacao = String(t.status || '').toLowerCase();
    const corSit = situacao.startsWith('aberto') ? '#f59e0b' : '#4ade80';
    return `<tr style="border-bottom:1px solid #1a1d2e;cursor:pointer" onclick="fcDetalhe('${t.id}')">
      <td style="padding:7px 8px">${t.numero ?? '—'}</td>
      <td style="padding:7px 8px">${fcEsc(t.operador) || '—'}</td>
      <td style="padding:7px 8px">${fcDataHora(t.aberto_em)}</td>
      <td style="padding:7px 8px">${t.fechado_em ? fcDataHora(t.fechado_em) : '—'}</td>
      <td style="padding:7px 8px"><span style="color:${corSit};font-weight:600;text-transform:uppercase;font-size:0.74rem">${fcEsc(t.status) || '—'}</span></td>
      <td style="padding:7px 8px;text-align:right">${fcMoney(d.venda_total)}</td>
      <td style="padding:7px 8px;text-align:right">${fcMoney(rec.dinheiro)}</td>
      <td style="padding:7px 8px;text-align:right">${fcMoney(rec.cartao)}</td>
      <td style="padding:7px 8px;text-align:right">${fcMoney(rec.pix)}</td>
      <td style="padding:7px 8px;text-align:right">${fcMoney(rec.prazo)}</td>
    </tr>`;
  }).join('');

  conteudo.innerHTML = `
    <div style="max-width:1200px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <h2 style="color:#f97316">🧮 Fechamento de Caixa</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="color:#888;font-size:0.78rem">Período</label>
          <input type="date" id="fc-de" value="${window._fcDe}" style="padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
          <span style="color:#888">até</span>
          <input type="date" id="fc-ate" value="${window._fcAte}" style="padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
          <button onclick="fcAplicarPeriodo()" style="padding:7px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Pesquisar</button>
        </div>
      </div>
      ${turnos.length ? `
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;color:#ddd">
          <thead><tr style="color:#8aa;text-align:left;background:#1a1d2e">
            <th style="padding:8px">Turno</th><th style="padding:8px">Operador</th>
            <th style="padding:8px">Abertura</th><th style="padding:8px">Fechamento</th>
            <th style="padding:8px">Situação</th>
            <th style="padding:8px;text-align:right">Venda</th>
            <th style="padding:8px;text-align:right">Dinheiro</th>
            <th style="padding:8px;text-align:right">Cartão</th>
            <th style="padding:8px;text-align:right">Pix</th>
            <th style="padding:8px;text-align:right">Nota a prazo</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      <p style="color:#666;font-size:0.76rem;margin-top:10px">${turnos.length} turno(s). Clique num turno para ver o detalhe (Recebimentos × Vendas).</p>
      ` : '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:30px;text-align:center;color:#666">Nenhum turno no período.</div>'}
    </div>`;
}

function fcAplicarPeriodo() {
  const de = document.getElementById('fc-de')?.value;
  const ate = document.getElementById('fc-ate')?.value;
  if (de) window._fcDe = de;
  if (ate) window._fcAte = ate;
  fcListar();
}

// Detalhe de um turno: espelha a 2ª tela do TecnoX (Recebimentos × Vendas/Saídas).
function fcDetalhe(turnoId) {
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  const d = (cache.porTurno || {})[turnoId] || {};
  if (!t) return;
  const rec = d.rec || {};
  const totalReceb = (rec.dinheiro || 0) + (rec.cartao || 0) + (rec.pix || 0) + (rec.prazo || 0) + (rec.cheque || 0) + (rec.boleto || 0) + (rec.outros || 0);
  const totalVendaSaida = (d.venda_comb || 0) + (d.venda_prod || 0);

  const linhaReceb = (rot, val, cor) => `<tr>
    <td style="padding:5px 8px;color:#bcd">${rot}</td>
    <td style="padding:5px 8px;text-align:right;color:${cor || '#e5e7eb'}">${fcMoney(val)}</td></tr>`;

  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = `
    <div style="max-width:1100px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h2 style="color:#f97316">🧮 Fechamento — Turno ${t.numero ?? ''} <span style="color:#888;font-size:0.9rem">(${fcEsc(t.operador) || ''})</span></h2>
        <button onclick="fcListar()" style="padding:7px 14px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#60a5fa;cursor:pointer">← Voltar</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px;color:#9aa;font-size:0.8rem">
        <div>Abertura: <strong style="color:#ddd">${fcDataHora(t.aberto_em)}</strong></div>
        <div>Fechamento: <strong style="color:#ddd">${t.fechado_em ? fcDataHora(t.fechado_em) : '—'}</strong></div>
        <div>Situação: <strong style="color:#ddd;text-transform:uppercase">${fcEsc(t.status) || '—'}</strong></div>
        <div>Abertura (fundo): <strong style="color:#ddd">${fcMoney(t.valor_abertura)}</strong></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
          <div style="background:#1a1d2e;padding:9px 12px;color:#f97316;font-weight:600">Recebimentos</div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
            ${linhaReceb('Dinheiro', rec.dinheiro)}
            ${linhaReceb('Cartão', rec.cartao)}
            ${linhaReceb('Pix', rec.pix)}
            ${linhaReceb('Nota a prazo', rec.prazo)}
            ${linhaReceb('Cheque', rec.cheque)}
            ${linhaReceb('Boleto', rec.boleto)}
            ${linhaReceb('Outros', rec.outros)}
            ${linhaReceb('Sangria', d.sangria, '#f87171')}
            ${linhaReceb('Suprimento', d.suprimento, '#4ade80')}
            ${linhaReceb('Despesa', d.despesa, '#f87171')}
            ${linhaReceb('Depósito em conta', d.deposito)}
            <tr style="border-top:2px solid #2a2d3e;background:#0f1119">
              <td style="padding:8px;color:#fff;font-weight:600">Total Recebimentos</td>
              <td style="padding:8px;text-align:right;color:#4ade80;font-weight:700">${fcMoney(totalReceb)}</td></tr>
          </table>
        </div>

        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
          <div style="background:#1a1d2e;padding:9px 12px;color:#f97316;font-weight:600">Vendas / Saídas</div>
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
            ${linhaReceb('Venda combustíveis', d.venda_comb)}
            <tr><td style="padding:2px 8px 6px;color:#667;font-size:0.72rem">${fcNum(d.litros_comb, 3)} L</td><td></td></tr>
            ${linhaReceb('Venda produtos', d.venda_prod)}
            ${linhaReceb('Qtde. vendas (cupons)', d.qtd_vendas)}
            <tr style="border-top:2px solid #2a2d3e;background:#0f1119">
              <td style="padding:8px;color:#fff;font-weight:600">Total Vendas / Saída</td>
              <td style="padding:8px;text-align:right;color:#60a5fa;font-weight:700">${fcMoney(totalVendaSaida)}</td></tr>
          </table>
        </div>
      </div>

      <div style="margin-top:14px;background:#0f1119;border:1px solid #2a2d3e;border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="color:#9aa;font-size:0.84rem">Resultado do Caixa (Recebimentos − Vendas/Saída):</div>
        <div style="color:${Math.abs(totalReceb - totalVendaSaida) < 0.01 ? '#4ade80' : '#f59e0b'};font-weight:700">${fcMoney(totalReceb - totalVendaSaida)}</div>
      </div>
    </div>`;
}
