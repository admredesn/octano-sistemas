// ============================================================
// MÓDULO CASHBACK (retaguarda) — extrato do cashback via Pix (Sicoob)
// Lê/edita oct_cashback. O worker (octano-sicoob no Railway) é quem paga:
// varre status='pendente' com chave_pix e efetiva o Pix. Aqui a gente vê,
// filtra, reprocessa falhas e faz lançamento/estorno manual.
// ============================================================

async function moduloCashback() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando…</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : (perfil && perfil.empresa_id);
  if (!eid) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._cbEmp = eid;

  // filtros default: mês corrente, todos os status
  if (!window._cbFiltro) {
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    window._cbFiltro = {
      de: _cbISO(ini), ate: _cbISO(hoje), status: '', cliente: '',
    };
  }
  await cbListar();
}

function _cbISO(d) { return d.toISOString().slice(0, 10); }
function cbEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function _cbReais(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const _CB_STATUS = {
  pago:      { cor: '#4ade80', bg: '#0f2417', br: '#245a35', txt: '✅ Pago' },
  pendente:  { cor: '#fbbf24', bg: '#241f0f', br: '#7a5a20', txt: '⏳ Pendente' },
  processando:{ cor: '#60a5fa', bg: '#0f1a24', br: '#25507a', txt: '🔄 Processando' },
  falhou:    { cor: '#f87171', bg: '#241012', br: '#5a2a2a', txt: '❌ Falhou' },
  cancelado: { cor: '#9aa',    bg: '#181a22', br: '#2a2d3e', txt: '🚫 Cancelado' },
};

async function cbListar() {
  const conteudo = document.getElementById('conteudo');
  const eid = window._cbEmp;
  const f = window._cbFiltro;

  // janela de datas (inclui o dia inteiro do "ate")
  const deTs = f.de ? f.de + 'T00:00:00' : null;
  const ateTs = f.ate ? f.ate + 'T23:59:59' : null;

  let q = sb.from('oct_cashback').select('*').eq('empresa_id', eid).order('criado_em', { ascending: false });
  if (deTs) q = q.gte('criado_em', deTs);
  if (ateTs) q = q.lte('criado_em', ateTs);
  if (f.status) q = q.eq('status', f.status);
  if (f.cliente) q = q.ilike('cliente_nome', '%' + f.cliente + '%');
  q = q.limit(1000);

  const { data, error } = await q;
  const rows = data || [];

  // ---- totais (sobre o resultado filtrado) ----
  const pagos = rows.filter(r => r.status === 'pago');
  const totalPago = pagos.reduce((s, r) => s + Number(r.valor_cashback || 0), 0);
  const clientesBenef = new Set(pagos.map(r => r.cliente_id || r.cliente_nome)).size;
  const ticket = pagos.length ? totalPago / pagos.length : 0;
  const nPend = rows.filter(r => r.status === 'pendente' || r.status === 'processando').length;
  const nFalhou = rows.filter(r => r.status === 'falhou').length;
  const valPend = rows.filter(r => r.status === 'pendente' || r.status === 'processando').reduce((s, r) => s + Number(r.valor_cashback || 0), 0);

  const card = (titulo, valor, cor, sub) => `
    <div class="cb-card">
      <div class="cb-card-t">${titulo}</div>
      <div class="cb-card-v" style="color:${cor}">${valor}</div>
      ${sub ? `<div class="cb-card-s">${sub}</div>` : ''}
    </div>`;

  conteudo.innerHTML = `
  <style>
    .cb-wrap{max-width:1180px;margin:0 auto;padding:18px 20px;color:#dbe2ea}
    .cb-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px}
    .cb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
    .cb-card{background:#13151f;border:1px solid #2a2d3e;border-radius:12px;padding:14px 16px}
    .cb-card-t{color:#8b93a7;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em}
    .cb-card-v{font-size:1.5rem;font-weight:700;margin-top:4px}
    .cb-card-s{color:#6b7688;font-size:.74rem;margin-top:2px}
    .cb-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;background:#0f111a;border:1px solid #21232f;border-radius:10px;padding:12px 14px;margin-bottom:14px}
    .cb-filtros label{display:block;color:#8b93a7;font-size:.72rem;margin-bottom:4px}
    .cb-inp{padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:.85rem}
    .cb-btn{padding:8px 14px;border-radius:8px;border:1px solid #2a2d3e;background:#1b2130;color:#cdd6e4;cursor:pointer;font-size:.82rem}
    .cb-btn:hover{background:#232a3b}
    .cb-btn-p{border-color:#245a35;background:#0f2417;color:#4ade80}
    .cb-btn-p:hover{background:#123322}
    table.cb{width:100%;border-collapse:collapse;font-size:.84rem}
    table.cb th{text-align:left;color:#8b93a7;font-weight:600;font-size:.72rem;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid #21232f}
    table.cb td{padding:9px 10px;border-bottom:1px solid #181a24;color:#cdd6e4}
    table.cb tr:hover td{background:#12141d}
    .cb-badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:.72rem;font-weight:600;border:1px solid}
    .cb-e2e{font-family:monospace;font-size:.72rem;color:#6b7688}
    .cb-actbtn{padding:4px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#1b2130;color:#cdd6e4;cursor:pointer;font-size:.74rem}
    .cb-actbtn:hover{background:#232a3b}
    .cb-empty{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:34px;text-align:center;color:#666}
    .cb-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999}
    .cb-modal{background:#13151f;border:1px solid #2a2d3e;border-radius:14px;padding:22px;width:min(420px,92vw)}
    .cb-modal h3{color:#f97316;margin:0 0 14px}
    .cb-modal label{display:block;color:#8b93a7;font-size:.76rem;margin:10px 0 4px}
    .cb-modal .cb-inp{width:100%;box-sizing:border-box}
  </style>
  <div class="cb-wrap">
    <div class="cb-head">
      <h2 style="color:#f97316;margin:0">💸 Cashback (Pix)</h2>
      <div style="display:flex;gap:8px">
        <button class="cb-btn" onclick="cbListar()">↻ Atualizar</button>
        <button class="cb-btn cb-btn-p" onclick="cbAbrirManual()">+ Lançamento manual</button>
      </div>
    </div>

    <div class="cb-cards">
      ${card('Pago no período', _cbReais(totalPago), '#4ade80', pagos.length + ' pagamento(s)')}
      ${card('Clientes beneficiados', String(clientesBenef), '#dbe2ea', '')}
      ${card('Cashback médio', _cbReais(ticket), '#dbe2ea', 'por pagamento')}
      ${card('Pendentes', String(nPend), '#fbbf24', _cbReais(valPend))}
      ${card('Falhas', String(nFalhou), nFalhou ? '#f87171' : '#4b5563', nFalhou ? 'precisam de atenção' : 'nenhuma')}
    </div>

    <div class="cb-filtros">
      <div><label>De</label><input type="date" class="cb-inp" value="${f.de}" onchange="cbSetF('de',this.value)"></div>
      <div><label>Até</label><input type="date" class="cb-inp" value="${f.ate}" onchange="cbSetF('ate',this.value)"></div>
      <div><label>Status</label>
        <select class="cb-inp" onchange="cbSetF('status',this.value)">
          <option value="">Todos</option>
          ${['pago','pendente','processando','falhou','cancelado'].map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${_CB_STATUS[s].txt}</option>`).join('')}
        </select>
      </div>
      <div><label>Cliente</label><input type="text" class="cb-inp" placeholder="nome…" value="${cbEsc(f.cliente)}" onchange="cbSetF('cliente',this.value)"></div>
      ${error ? `<div style="color:#f87171;font-size:.78rem;align-self:center">Erro ao ler: ${cbEsc(error.message || error)}</div>` : ''}
    </div>

    ${rows.length ? `
    <div style="overflow-x:auto;background:#0f111a;border:1px solid #21232f;border-radius:10px">
      <table class="cb">
        <thead><tr>
          <th>Data</th><th>Cliente</th><th style="text-align:right">Litros</th>
          <th style="text-align:right">Cashback</th><th>Forma</th><th>NFC-e</th>
          <th>Status</th><th>Pix (e2e)</th><th style="text-align:right">Ações</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => cbLinha(r)).join('')}
        </tbody>
      </table>
    </div>
    <div style="color:#6b7688;font-size:.74rem;margin-top:8px">${rows.length} registro(s)${rows.length === 1000 ? ' (limite de 1000 — refine o período)' : ''}.</div>
    ` : '<div class="cb-empty">Nenhum cashback no período/filtro selecionado.</div>'}
  </div>`;
}

function cbLinha(r) {
  const st = _CB_STATUS[r.status] || { cor: '#9aa', bg: '#181a22', br: '#2a2d3e', txt: r.status };
  const d = r.criado_em ? new Date(r.criado_em) : null;
  const forma = r.forma === '17' ? 'Pix' : (r.forma === '01' ? 'Dinheiro' : (r.forma || '—'));
  const litros = r.litros != null ? Number(r.litros).toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : '—';
  const e2e = r.pix_e2e ? `<span class="cb-e2e" title="${cbEsc(r.pix_e2e)}">${cbEsc(r.pix_e2e.slice(0, 14))}…</span>` : (r.erro ? `<span class="cb-e2e" style="color:#f87171" title="${cbEsc(r.erro)}">ver erro</span>` : '—');

  // ações conforme status
  let acoes = '';
  if (r.status === 'falhou') acoes = `<button class="cb-actbtn" onclick="cbReprocessar('${r.id}')">↻ Reprocessar</button>`;
  else if (r.status === 'pendente' || r.status === 'processando') acoes = `<button class="cb-actbtn" onclick="cbCancelar('${r.id}')">🚫 Cancelar</button>`;
  else if (r.status === 'cancelado') acoes = `<button class="cb-actbtn" onclick="cbReprocessar('${r.id}')">↻ Reativar</button>`;

  return `<tr>
    <td>${d ? d.toLocaleDateString('pt-BR') + '<br><span style="color:#6b7688;font-size:.72rem">' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '—'}</td>
    <td>${cbEsc(r.cliente_nome) || '—'}<br><span class="cb-e2e">${cbEsc(r.chave_pix) || 'sem chave'}</span></td>
    <td style="text-align:right">${litros}</td>
    <td style="text-align:right;color:#4ade80;font-weight:600">${_cbReais(r.valor_cashback)}</td>
    <td>${forma}</td>
    <td>${cbEsc(r.numero_nfe) || '—'}</td>
    <td><span class="cb-badge" style="color:${st.cor};background:${st.bg};border-color:${st.br}">${st.txt}</span>${r.tentativas > 1 ? `<br><span style="color:#6b7688;font-size:.68rem">${r.tentativas} tent.</span>` : ''}</td>
    <td>${e2e}</td>
    <td style="text-align:right">${acoes}</td>
  </tr>`;
}

function cbSetF(k, v) { window._cbFiltro[k] = v; cbListar(); }

// ---- reprocessar: volta pro worker (pendente + zera tentativas/erro) ----
async function cbReprocessar(id) {
  if (!confirm('Reenviar este cashback pro worker pagar? (a chave Pix precisa estar correta)')) return;
  const { error } = await sb.from('oct_cashback').update({ status: 'pendente', tentativas: 0, erro: null }).eq('id', id);
  if (error) { alert('Erro: ' + (error.message || error)); return; }
  await cbListar();
}

// ---- cancelar um pendente (não paga) ----
async function cbCancelar(id) {
  if (!confirm('Cancelar este cashback? O worker não vai pagá-lo.')) return;
  const { error } = await sb.from('oct_cashback').update({ status: 'cancelado' }).eq('id', id);
  if (error) { alert('Erro: ' + (error.message || error)); return; }
  await cbListar();
}

// ---- lançamento manual: cria um pendente que o worker paga ----
async function cbAbrirManual() {
  const eid = window._cbEmp;
  // clientes elegíveis (com chave pix) pra facilitar
  const { data } = await sb.from('oct_pessoas').select('id,nome,chave_pix,cashback_ativo')
    .eq('empresa_id', eid).not('chave_pix', 'is', null).order('nome');
  const clientes = data || [];
  window._cbClientes = clientes;

  const div = document.createElement('div');
  div.className = 'cb-modal-bg';
  div.id = 'cb-modal-bg';
  div.onclick = (e) => { if (e.target === div) cbFecharManual(); };
  div.innerHTML = `
    <div class="cb-modal">
      <h3>Lançamento manual de cashback</h3>
      <label>Cliente (com chave Pix cadastrada)</label>
      <select class="cb-inp" id="cb-m-cli" onchange="cbManualCliChange()">
        <option value="">— selecione —</option>
        ${clientes.map(c => `<option value="${c.id}">${cbEsc(c.nome)}${c.chave_pix ? '' : ' (sem chave)'}</option>`).join('')}
      </select>
      <label>Chave Pix (destino)</label>
      <input type="text" class="cb-inp" id="cb-m-chave" placeholder="preenche ao escolher o cliente">
      <label>Valor (R$)</label>
      <input type="number" class="cb-inp" id="cb-m-valor" step="0.01" min="0.01" placeholder="0,00">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button class="cb-btn" onclick="cbFecharManual()">Cancelar</button>
        <button class="cb-btn cb-btn-p" onclick="cbSalvarManual()">Lançar (vira pendente)</button>
      </div>
      <p style="color:#6b7688;font-size:.72rem;margin-top:12px">Cria um cashback <b>pendente</b>. O worker paga via Pix no próximo ciclo (respeita o teto por Pix) e a mensagem do Pix sai como "Cashback Octano". Bom pra estornos/correções.</p>
    </div>`;
  document.body.appendChild(div);
}

function cbManualCliChange() {
  const id = document.getElementById('cb-m-cli').value;
  const c = (window._cbClientes || []).find(x => x.id === id);
  document.getElementById('cb-m-chave').value = (c && c.chave_pix) || '';
}

function cbFecharManual() { const d = document.getElementById('cb-modal-bg'); if (d) d.remove(); }

async function cbSalvarManual() {
  const eid = window._cbEmp;
  const id = document.getElementById('cb-m-cli').value;
  const chave = document.getElementById('cb-m-chave').value.trim();
  const valor = parseFloat(document.getElementById('cb-m-valor').value);
  const c = (window._cbClientes || []).find(x => x.id === id);

  if (!chave) { alert('Informe a chave Pix de destino.'); return; }
  if (!valor || valor <= 0) { alert('Informe um valor válido.'); return; }

  const row = {
    empresa_id: eid,
    cliente_id: c ? c.id : null,
    cliente_nome: c ? c.nome : 'Manual',
    chave_nfe: 'MANUAL-' + Date.now(),   // chave_nfe é unique; prefixo evita colisão com NFC-e
    numero_nfe: null,
    litros: null,
    valor_cashback: valor,
    forma: '17',
    chave_pix: chave,
    status: 'pendente',
    tentativas: 0,
    erro: null,
  };
  const { error } = await sb.from('oct_cashback').insert(row);
  if (error) { alert('Erro ao lançar: ' + (error.message || error)); return; }
  cbFecharManual();
  await cbListar();
}
