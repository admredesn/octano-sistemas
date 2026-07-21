// ============================================================
//  CENTRAL DE RELATÓRIOS  -  hub extensível
// ------------------------------------------------------------
//  Cada relatório se registra em RELATORIOS_REG (id/ícone/título/descrição/fn).
//  Adicionar um relatório novo = criar a função e incluir uma entrada aqui.
// ============================================================

const RELATORIOS_REG = [
  {
    id: 'recebimentos', icone: '💰', titulo: 'Recebimentos',
    descricao: 'Dinheiro, cartão, Pix e frota recebidos (cofre / EDI / Prime), com status de conciliação.',
    fn: () => relatorioRecebimentos(),
  },
  // >>> novos relatórios entram aqui <<<
];

function moduloRelatorios() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const cards = RELATORIOS_REG.map(r => `
    <div class="prod-card" onclick="relatorioAbrir('${r.id}')" style="min-height:120px">
      <div style="font-size:1.9rem;line-height:1">${r.icone}</div>
      <h3 style="color:#e6e6e6;margin:10px 0 4px;font-size:1.02rem">${r.titulo}</h3>
      <p style="color:#8a8f98;font-size:.8rem;margin:0;line-height:1.35">${r.descricao}</p>
    </div>`).join('');
  c.innerHTML = `
    <div style="padding:24px">
      <h2 style="color:#f97316;margin:0 0 4px">📊 Central de Relatórios</h2>
      <p style="color:#888;margin:0 0 20px;font-size:.9rem">Escolha um relatório para visualizar.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">
        ${cards || '<p style="color:#888">Nenhum relatório disponível ainda.</p>'}
      </div>
    </div>`;
}

function relatorioAbrir(id) {
  const r = RELATORIOS_REG.find(x => x.id === id);
  if (r && typeof r.fn === 'function') r.fn();
}

// cabeçalho padrão dos relatórios (título + botão voltar pra central)
function _relHeader(titulo) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="color:#f97316;margin:0">${titulo}</h2>
      <button onclick="moduloRelatorios()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer;font-size:.85rem">← Central de Relatórios</button>
    </div>`;
}

function _relEid() {
  return (typeof empresaAtiva === 'function') ? empresaAtiva() : (window._perfilEmpresaId || null);
}

// ============================================================
//  RELATÓRIO: RECEBIMENTOS
// ============================================================
const _REL_ORIGEM_LABEL = {
  cofre_brinks: '🔒 Cofre', pagbank_edi: '💳 EDI PagBank', prime_frota: '🚚 Frota (Prime)',
  ticketlog: '🚚 TicketLog', extrato: '📄 Extrato', manual: '✍️ Manual',
};

function _relDataHoje() { return new Date().toISOString().slice(0, 10); }
function _relDataInicioMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function _relBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

async function relatorioRecebimentos() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const ini = _relDataInicioMes(), fim = _relDataHoje();
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('💰 Recebimentos')}
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
      <label style="color:#9fb3c8;font-size:.8rem">De<br><input type="date" id="rel-rc-ini" value="${ini}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Até<br><input type="date" id="rel-rc-fim" value="${fim}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Origem<br>
        <select id="rel-rc-origem" style="margin-top:3px">
          <option value="">Todas</option>
          <option value="cofre_brinks">Cofre</option>
          <option value="pagbank_edi">EDI PagBank</option>
          <option value="prime_frota">Frota (Prime)</option>
          <option value="ticketlog">TicketLog</option>
          <option value="extrato">Extrato</option>
        </select></label>
      <button onclick="relatorioRecebimentosCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
    </div>
    <div id="rel-rc-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioRecebimentosCarregar();
}

async function relatorioRecebimentosCarregar() {
  const box = document.getElementById('rel-rc-corpo');
  if (!box) return;
  const eid = _relEid();
  if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
  const ini = document.getElementById('rel-rc-ini')?.value || _relDataInicioMes();
  const fim = document.getElementById('rel-rc-fim')?.value || _relDataHoje();
  const origem = document.getElementById('rel-rc-origem')?.value || '';
  box.innerHTML = '<p style="color:#888">Carregando…</p>';

  let q = sb.from('oct_recebimentos').select('*').eq('empresa_id', eid)
    .gte('recebido_em', ini + 'T00:00:00').lte('recebido_em', fim + 'T23:59:59');
  if (origem) q = q.eq('origem', origem);
  q = q.order('recebido_em', { ascending: false }).limit(3000);
  const { data, error } = await q;
  if (error) { box.innerHTML = `<p style="color:#f87171">Erro: ${error.message}</p><p style="color:#666;font-size:.8rem">A tabela oct_recebimentos já foi criada no Supabase?</p>`; return; }
  const recs = data || [];
  if (!recs.length) { box.innerHTML = '<p style="color:#888">Nenhum recebimento no período.</p>'; return; }

  // resumo
  const total = recs.reduce((s, r) => s + Number(r.valor || 0), 0);
  const porForma = {}, porOrigem = {};
  let concQtd = 0, concValor = 0;
  recs.forEach(r => {
    const f = (r.forma || '—');
    porForma[f] = (porForma[f] || 0) + Number(r.valor || 0);
    porOrigem[r.origem] = (porOrigem[r.origem] || 0) + Number(r.valor || 0);
    if (r.conciliado) { concQtd++; concValor += Number(r.valor || 0); }
  });
  const cardResumo = (titulo, valor, cor) => `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
      <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${titulo}</div>
      <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px">${valor}</div>
    </div>`;
  const chips = (obj, mapa) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<span style="display:inline-block;background:#0f1a2a;border:1px solid #2a4a6a;border-radius:20px;padding:4px 10px;margin:3px;color:#cbd5e1;font-size:.78rem">${(mapa && mapa[k]) || k}: <strong style="color:#5dca9a">${_relBRL(v)}</strong></span>`).join('');

  const linhas = recs.map(r => {
    const dh = r.recebido_em ? new Date(r.recebido_em).toLocaleString('pt-BR') : (r.dia || '');
    return `<tr style="border-bottom:1px solid #1e2233">
      <td style="padding:7px 8px;color:#9ca3af;font-size:.78rem">${dh}</td>
      <td style="padding:7px 8px">${_REL_ORIGEM_LABEL[r.origem] || r.origem}</td>
      <td style="padding:7px 8px;color:#cbd5e1">${r.forma || '—'}${r.bandeira ? ' · <span style="color:#8a8f98">' + r.bandeira + '</span>' : ''}</td>
      <td style="padding:7px 8px;text-align:right;color:#5dca9a;font-weight:600">${_relBRL(r.valor)}</td>
      <td style="padding:7px 8px;text-align:center">${r.conciliado ? '<span style="color:#4ade80">✓</span>' : '<span style="color:#6b7280">—</span>'}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${cardResumo('Total recebido', _relBRL(total), '#5dca9a')}
      ${cardResumo('Transações', recs.length, '#e6e6e6')}
      ${cardResumo('Conciliados', concQtd + ' · ' + _relBRL(concValor), '#4ade80')}
    </div>
    <div style="margin-bottom:6px;color:#8a8f98;font-size:.78rem">Por forma:</div>
    <div style="margin-bottom:10px">${chips(porForma)}</div>
    <div style="margin-bottom:6px;color:#8a8f98;font-size:.78rem">Por origem:</div>
    <div style="margin-bottom:16px">${chips(porOrigem, _REL_ORIGEM_LABEL)}</div>
    <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:58vh">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">
          <th style="padding:8px">Data/Hora</th><th style="padding:8px">Origem</th>
          <th style="padding:8px">Forma</th><th style="padding:8px;text-align:right">Valor</th>
          <th style="padding:8px;text-align:center">Conc.</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}
