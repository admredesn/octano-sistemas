// ============================================================
// MÓDULO FORMAS DE PAGAMENTO — retaguarda
// Sub-abas: (1) Forma de recebimento  (2) Tabela de preço
// ============================================================

const FP_SEFAZ = [
  { c: '01', n: 'Dinheiro' }, { c: '02', n: 'Cheque' }, { c: '03', n: 'Cartão de Crédito' },
  { c: '04', n: 'Cartão de Débito' }, { c: '05', n: 'Crédito Loja' }, { c: '15', n: 'Boleto' },
  { c: '17', n: 'PIX' }, { c: '18', n: 'Transferência' }, { c: '90', n: 'Sem pagamento' }, { c: '99', n: 'Outros' },
];

async function moduloFormasPagamento() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._fpEmpresaId = ((typeof empresaAtiva==='function')?empresaAtiva():perfil.empresa_id);

  conteudo.innerHTML = `
    <div style="padding:14px 20px">
      <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid #2a2d3e">
        <button id="fp-tab-receb" onclick="fpAba('receb')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#f97316;border-bottom:2px solid #f97316;cursor:pointer;font-weight:500">Forma de recebimento</button>
        <button id="fp-tab-preco" onclick="fpAba('preco')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#888;border-bottom:2px solid transparent;cursor:pointer">Tabela de preço</button>
      </div>
      <div id="fp-conteudo"></div>
    </div>`;
  fpAba('receb');
}

function fpAba(qual) {
  document.getElementById('fp-tab-receb').style.color = qual === 'receb' ? '#f97316' : '#888';
  document.getElementById('fp-tab-receb').style.borderBottomColor = qual === 'receb' ? '#f97316' : 'transparent';
  document.getElementById('fp-tab-preco').style.color = qual === 'preco' ? '#f97316' : '#888';
  document.getElementById('fp-tab-preco').style.borderBottomColor = qual === 'preco' ? '#f97316' : 'transparent';
  if (qual === 'receb') fpReceberListar(); else fpPrecoListar();
}

// ===================== FORMA DE RECEBIMENTO =====================
async function fpReceberListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  const { data } = await sb.from('oct_formas_pagamento').select('*').eq('empresa_id', eid).order('ordem');
  const rows = data || [];
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:#888;font-size:0.84rem">Formas sincronizadas automaticamente com o PDV.</p>
      <button onclick="fpReceberForm()" class="btn-salvar">+ Nova forma</button>
    </div>
    <div id="fp-receb-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Ordem</th><th style="padding:10px 12px">Nome</th>
          <th style="padding:10px 12px">Código SEFAZ</th><th style="padding:10px 12px">A prazo</th>
          <th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(f => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px">${f.ordem}</td>
            <td style="padding:9px 12px;font-weight:500">${fpEsc(f.nome)}</td>
            <td style="padding:9px 12px"><span style="font-family:monospace;color:#7dd3fc">${f.cod_sefaz}</span> ${fpSefazNome(f.cod_sefaz)}</td>
            <td style="padding:9px 12px">${f.a_prazo ? '<span style="color:#fbbf24">sim</span>' : '—'}</td>
            <td style="padding:9px 12px">${f.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpReceberForm(${JSON.stringify(f).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">Editar</button>
              <button onclick="fpReceberExcluir('${f.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhuma forma cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function fpReceberForm(f) {
  f = f || {};
  const div = document.getElementById('fp-receb-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${f.id ? 'Editar' : 'Nova'} forma de recebimento</h3>
      <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome</label>
          <input id="fpr-nome" value="${fpEsc(f.nome) || ''}" placeholder="ex: Cartão de Débito" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Código SEFAZ (NFC-e)</label>
          <select id="fpr-sefaz" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            ${FP_SEFAZ.map(s => `<option value="${s.c}" ${f.cod_sefaz === s.c ? 'selected' : ''}>${s.c} - ${s.n}</option>`).join('')}
          </select></div>
        <div><label style="color:#888;font-size:0.78rem">Ordem</label>
          <input id="fpr-ordem" type="number" value="${f.ordem ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="margin-top:12px;max-width:340px">
        <label style="color:#888;font-size:0.78rem">Classificação (o PDV oculta por aqui conforme a integração)</label>
        <select id="fpr-classif" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
          ${['','dinheiro','cartao','cartao_frota','nota_prazo','cheque','pix','vale','outros'].map(c =>
            `<option value="${c}" ${(f.classificacao||'') === c ? 'selected' : ''}>${({'':'— selecione —','dinheiro':'Dinheiro','cartao':'Cartão (crédito/débito)','cartao_frota':'Cartão Frota','nota_prazo':'Nota a Prazo','cheque':'Cheque','pix':'Pix','vale':'Vale','outros':'Outros'})[c]}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:12px;display:flex;gap:18px;align-items:center">
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-prazo" ${f.a_prazo ? 'checked' : ''}> Forma a prazo (fiado)</label>
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-ativo" ${f.ativo !== false ? 'checked' : ''}> Ativo</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpReceberSalvar('${f.id || ''}')" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('fp-receb-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpr-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
}

async function fpReceberSalvar(id) {
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpr-nome').value.trim();
  const msg = document.getElementById('fpr-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome.'; return; }
  const reg = {
    empresa_id: eid, nome,
    cod_sefaz: document.getElementById('fpr-sefaz').value,
    ordem: parseInt(document.getElementById('fpr-ordem').value) || 0,
    a_prazo: document.getElementById('fpr-prazo').checked,
    ativo: document.getElementById('fpr-ativo').checked,
    classificacao: document.getElementById('fpr-classif').value || null,
  };
  const q = id ? sb.from('oct_formas_pagamento').update(reg).eq('id', id)
               : sb.from('oct_formas_pagamento').insert(reg);
  const { error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  document.getElementById('fp-receb-form').innerHTML = '';
  fpReceberListar();
}

async function fpReceberExcluir(id) {
  if (!confirm('Excluir esta forma de recebimento?')) return;
  const { error } = await sb.from('oct_formas_pagamento').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpReceberListar();
}

// ===================== TABELA DE PREÇO (v2 17/08 — modelo TecnoX) =====================
// Grid de NEGOCIAÇÃO por produto (preço fixo / acréscimo / desconto, R$ ou %),
// clientes com busca, e consulta rápida "que preço o cliente X tem?".
async function fpPrecoListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  const [{ data: tabs }, { data: formas }, { data: vCli }, { data: vFor }, { data: itens }] = await Promise.all([
    sb.from('oct_tabelas_preco').select('*').eq('empresa_id', eid).order('ordem'),
    sb.from('oct_formas_pagamento').select('id,nome').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
    sb.from('oct_tabela_preco_clientes').select('tabela_id').eq('empresa_id', eid),
    sb.from('oct_tabela_preco_formas').select('tabela_id,forma_id').eq('empresa_id', eid),
    sb.from('oct_tabela_preco_itens').select('tabela_id').eq('empresa_id', eid),
  ]);
  window._fpFormas = formas || [];
  const nCli = {}, nIt = {}, fPorTab = {};
  (vCli || []).forEach(v => nCli[v.tabela_id] = (nCli[v.tabela_id] || 0) + 1);
  (itens || []).forEach(v => nIt[v.tabela_id] = (nIt[v.tabela_id] || 0) + 1);
  (vFor || []).forEach(v => {
    const f = (formas || []).find(x => x.id === v.forma_id);
    (fPorTab[v.tabela_id] = fPorTab[v.tabela_id] || []).push(f ? f.nome : '?');
  });
  const rows = tabs || [];
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="display:flex;gap:6px;align-items:center">
        <input id="fp-consulta-cli" placeholder="🔎 Que preço tem o cliente...?" onkeydown="if(event.key==='Enter')fpConsultaCliente()"
          style="width:280px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
        <button onclick="fpConsultaCliente()" class="nfe-aba">Consultar</button>
      </div>
      <button onclick="fpPrecoForm()" class="btn-salvar">+ Nova negociação</button>
    </div>
    <div id="fp-preco-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Negociação</th><th style="padding:10px 12px">Produtos</th>
          <th style="padding:10px 12px">Clientes</th><th style="padding:10px 12px">Forma(s)</th>
          <th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(t => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px;font-weight:500">${fpEsc(t.nome)}
              ${t.tipo_ajuste !== 'nenhum' && Number(t.valor_ajuste) ? `<div style="color:#888;font-size:0.72rem">${fpAjusteLabel(t.tipo_ajuste)} global ${fpValorLabel(t)}</div>` : ''}</td>
            <td style="padding:9px 12px">${nIt[t.id] ? `<span style="color:#7dd3fc">${nIt[t.id]} negociado(s)</span>` : '<span style="color:#666">—</span>'}</td>
            <td style="padding:9px 12px">${nCli[t.id] ? `<b>${nCli[t.id]}</b>` : '<span style="color:#f87171">nenhum ⚠</span>'}</td>
            <td style="padding:9px 12px;color:#9aa;font-size:0.78rem">${(fPorTab[t.id] || []).join(', ') || '<span style="color:#f87171">nenhuma ⚠</span>'}</td>
            <td style="padding:9px 12px">${t.ativo ? '<span style="color:#4caf50">ativa</span>' : '<span style="color:#888">inativa</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpPrecoForm(${JSON.stringify(t).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">✎ Abrir</button>
              <button onclick="fpPrecoExcluir('${t.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhuma negociação cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ---- CONSULTA RÁPIDA: que preço o cliente tem? ----
async function fpConsultaCliente() {
  const termo = (document.getElementById('fp-consulta-cli').value || '').trim();
  const div = document.getElementById('fp-preco-form');
  if (termo.length < 2) { div.innerHTML = '<p style="color:#f87171;padding:8px">Digite ao menos 2 letras do nome.</p>'; return; }
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:10px">Consultando...</p>';
  const { data: pes } = await sb.from('oct_pessoas').select('id,nome')
    .eq('empresa_id', eid).ilike('nome', `%${termo}%`).limit(8);
  if (!pes || !pes.length) { div.innerHTML = '<p style="color:#f87171;padding:8px">Nenhum cliente com esse nome.</p>'; return; }
  const blocos = [];
  for (const p of pes) {
    const { data: vin } = await sb.from('oct_tabela_preco_clientes').select('tabela_id').eq('cliente_id', p.id);
    if (!vin || !vin.length) { blocos.push(`<div style="padding:6px 0;color:#888">👤 <b style="color:#ddd">${fpEsc(p.nome)}</b> — sem negociação (paga preço de bomba)</div>`); continue; }
    for (const v of vin) {
      const [{ data: tab }, { data: its }] = await Promise.all([
        sb.from('oct_tabelas_preco').select('*').eq('id', v.tabela_id).single(),
        sb.from('oct_tabela_preco_itens').select('*').eq('tabela_id', v.tabela_id),
      ]);
      const { data: prods } = await sb.from('oct_produtos').select('id,nome,preco_venda_a').in('id', (its || []).map(i => i.produto_id));
      const pm = {}; (prods || []).forEach(x => pm[x.id] = x);
      const linhas = (its || []).map(i => {
        const pr = pm[i.produto_id] || {};
        const final = i.preco_fixo != null ? Number(i.preco_fixo)
          : fpCalcular(Number(pr.preco_venda_a || 0), i.tipo_ajuste, i.modo_ajuste, Number(i.valor_ajuste || 0));
        return `<tr><td style="padding:4px 10px;color:#ddd">${fpEsc(pr.nome || '?')}</td>
          <td style="padding:4px 10px;color:#9aa">${i.preco_fixo != null ? 'preço fixo' : fpAjusteLabel(i.tipo_ajuste)}</td>
          <td style="padding:4px 10px;text-align:right;color:#4ade80;font-weight:600">R$ ${final.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</td></tr>`;
      }).join('');
      blocos.push(`<div style="padding:8px 0;border-bottom:1px solid #1c1f2e">
        👤 <b style="color:#ddd">${fpEsc(p.nome)}</b> → <span style="color:#7dd3fc">${fpEsc(tab && tab.nome)}</span>
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-top:4px">${linhas || '<tr><td style="color:#888;padding:4px 10px">só o ajuste global da negociação</td></tr>'}</table>
      </div>`);
    }
  }
  div.innerHTML = `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="color:#7dd3fc">🔎 Consulta de preço por cliente</h3>
    <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Fechar</button></div>
    ${blocos.join('')}</div>`;
}

async function fpPrecoForm(t) {
  t = t || {};
  const div = document.getElementById('fp-preco-form');
  const formas = window._fpFormas || [];
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:10px">Carregando...</p>';

  const [cliRes, vincCliRes, vincFormaRes, prodRes, itensRes] = await Promise.all([
    sb.from('oct_pessoas').select('id,nome,documento,classificacoes,tipo').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    t.id ? sb.from('oct_tabela_preco_clientes').select('cliente_id').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
    t.id ? sb.from('oct_tabela_preco_formas').select('forma_id').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
    sb.from('oct_produtos').select('id,nome,preco_venda_a').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    t.id ? sb.from('oct_tabela_preco_itens').select('*').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
  ]);
  const todosClientes = (cliRes.data || []).filter(p => {
    const c = Array.isArray(p.classificacoes) ? p.classificacoes : (p.tipo ? [p.tipo] : []);
    return c.includes('cliente') || c.includes('ambos');
  });
  const cliVinculados = new Set((vincCliRes.data || []).map(v => v.cliente_id));
  const formaVinculadas = new Set((vincFormaRes.data || []).map(v => v.forma_id));
  window._fpClientesCache = todosClientes;
  window._fpProdutos = prodRes.data || [];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${t.id ? '✎ ' + fpEsc(t.nome) : 'Nova negociação'}</h3>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome da negociação</label>
          <input id="fpp-nome" value="${fpEsc(t.nome) || ''}" placeholder="ex: Prazo negociado — padrão" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Forma sugerida no PDV (opcional)</label>
          <select id="fpp-forma" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="">— nenhuma —</option>
            ${formas.map(fm => `<option value="${fm.id}" ${t.forma_padrao === fm.id ? 'selected' : ''}>${fpEsc(fm.nome)}</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:flex-end;gap:14px">
          <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpp-ativo" ${t.ativo !== false ? 'checked' : ''}> Ativa</label>
        </div>
      </div>

      <!-- ===== GRID DE NEGOCIAÇÃO (modelo TecnoX): produto × tipo × valor ===== -->
      <div style="background:#0f1119;border-radius:8px;padding:12px;margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="color:#7dd3fc;font-size:0.84rem;font-weight:700">💰 Negociação por produto</label>
          <button onclick="fpNegAdd()" class="nfe-aba" style="color:#4ade80">➕ Incluir produto</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:#888;text-align:left">
            <th style="padding:6px">Produto</th><th style="padding:6px">Tipo de negociação</th>
            <th style="padding:6px">Valor</th><th style="padding:6px;text-align:right">Preço de bomba</th>
            <th style="padding:6px;text-align:right">Preço final</th><th></th>
          </tr></thead>
          <tbody id="fpp-neg-tbody"></tbody>
        </table>
        <p style="color:#666;font-size:0.72rem;margin-top:6px">Preço fixo não acompanha a bomba — quando o preço do posto mudar, atualize aqui. Produto fora da lista usa o preço normal (ou o ajuste global abaixo).</p>
      </div>

      <!-- ajuste global (avançado, opcional) -->
      <details style="margin-top:10px"><summary style="color:#888;font-size:0.78rem;cursor:pointer">Ajuste global (aplica a produtos SEM negociação específica)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px">
          <div><label style="color:#888;font-size:0.78rem">Tipo</label>
            <select id="fpp-tipo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="nenhum" ${t.tipo_ajuste === 'nenhum' || !t.tipo_ajuste ? 'selected' : ''}>Nenhum</option>
              <option value="desconto" ${t.tipo_ajuste === 'desconto' ? 'selected' : ''}>Desconto</option>
              <option value="acrescimo" ${t.tipo_ajuste === 'acrescimo' ? 'selected' : ''}>Acréscimo</option>
            </select></div>
          <div><label style="color:#888;font-size:0.78rem">Modo</label>
            <select id="fpp-modo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="percentual" ${t.modo_ajuste === 'percentual' || !t.modo_ajuste ? 'selected' : ''}>Percentual (%)</option>
              <option value="fixo" ${t.modo_ajuste === 'fixo' ? 'selected' : ''}>Valor (R$)</option>
            </select></div>
          <div><label style="color:#888;font-size:0.78rem">Valor</label>
            <input id="fpp-valor" type="number" step="0.001" value="${t.valor_ajuste ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        </div>
      </details>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
        <div style="background:#0f1119;border-radius:8px;padding:12px">
          <label style="color:#ddd;font-size:0.82rem;display:block;margin-bottom:6px">👤 Clientes desta negociação (<span id="fpp-cli-n">0</span>)</label>
          <input id="fpp-cli-busca" placeholder="buscar cliente..." oninput="fpCliFiltrar(this.value)"
            style="width:100%;padding:7px;margin-bottom:6px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <button onclick="fpCliMarcar(true)" class="nfe-aba" style="font-size:0.72rem">☑ marcar visíveis</button>
            <button onclick="fpCliMarcar(false)" class="nfe-aba" style="font-size:0.72rem">☐ desmarcar visíveis</button>
          </div>
          <div id="fpp-cli-lista" style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
            ${todosClientes.length ? todosClientes.map(c => `
              <label style="color:#ddd;font-size:0.82rem;display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
                <input type="checkbox" class="fpp-cli" value="${c.id}" onchange="fpCliConta()" ${cliVinculados.has(c.id) ? 'checked' : ''}>
                ${fpEsc(c.nome)}
              </label>`).join('') : '<span style="color:#666;font-size:0.78rem">Nenhum cliente cadastrado.</span>'}
          </div>
        </div>
        <div style="background:#0f1119;border-radius:8px;padding:12px">
          <label style="color:#ddd;font-size:0.82rem;display:block;margin-bottom:8px">💳 Formas que disparam esta negociação</label>
          <p style="color:#666;font-size:0.72rem;margin-bottom:8px">Só aplica se a forma escolhida no PDV estiver marcada aqui.</p>
          <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
            ${formas.length ? formas.map(fm => `
              <label style="color:#ddd;font-size:0.82rem;display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
                <input type="checkbox" class="fpp-forma-vinc" value="${fm.id}" ${formaVinculadas.has(fm.id) ? 'checked' : ''}>
                ${fpEsc(fm.nome)}
              </label>`).join('') : '<span style="color:#666;font-size:0.78rem">Cadastre formas de recebimento primeiro.</span>'}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpPrecoSalvar('${t.id || ''}')" class="btn-salvar">💾 Salvar negociação</button>
        <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpp-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;

  // popula o grid com as negociações existentes (inclui preco_fixo, que a
  // tela antiga ignorava — e apagava no salvar. Corrigido 17/08.)
  (itensRes.data || []).forEach(i => fpNegAdd(i));
  fpCliConta();
}

// ---- grid de negociação: linhas dinâmicas ----
function fpNegAdd(item) {
  const tbody = document.getElementById('fpp-neg-tbody');
  if (!tbody) return;
  const prods = window._fpProdutos || [];
  const tr = document.createElement('tr');
  tr.style.borderTop = '1px solid #1c1f2e';
  let tipoSel = 'fixo_preco';
  let valor = '';
  if (item) {
    if (item.preco_fixo != null) { tipoSel = 'fixo_preco'; valor = Number(item.preco_fixo); }
    else if (item.tipo_ajuste === 'acrescimo') { tipoSel = item.modo_ajuste === 'percentual' ? 'acr_pc' : 'acr_rs'; valor = Number(item.valor_ajuste); }
    else if (item.tipo_ajuste === 'desconto') { tipoSel = item.modo_ajuste === 'percentual' ? 'desc_pc' : 'desc_rs'; valor = Number(item.valor_ajuste); }
  }
  tr.innerHTML = `
    <td style="padding:5px"><select class="neg-prod" onchange="fpNegCalc(this.closest('tr'))" style="width:100%;max-width:340px;padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
      <option value="">— escolha o produto —</option>
      ${prods.map(p => `<option value="${p.id}" data-preco="${p.preco_venda_a || 0}" ${item && item.produto_id === p.id ? 'selected' : ''}>${fpEsc(p.nome)}</option>`).join('')}
    </select></td>
    <td style="padding:5px"><select class="neg-tipo" onchange="fpNegCalc(this.closest('tr'))" style="padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
      <option value="fixo_preco" ${tipoSel === 'fixo_preco' ? 'selected' : ''}>Preço fixo (R$/un)</option>
      <option value="acr_rs" ${tipoSel === 'acr_rs' ? 'selected' : ''}>Acréscimo (R$)</option>
      <option value="desc_rs" ${tipoSel === 'desc_rs' ? 'selected' : ''}>Desconto (R$)</option>
      <option value="acr_pc" ${tipoSel === 'acr_pc' ? 'selected' : ''}>Acréscimo (%)</option>
      <option value="desc_pc" ${tipoSel === 'desc_pc' ? 'selected' : ''}>Desconto (%)</option>
    </select></td>
    <td style="padding:5px"><input class="neg-valor" type="number" step="0.001" value="${valor}" oninput="fpNegCalc(this.closest('tr'))"
      style="width:100px;padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.82rem;font-weight:600"></td>
    <td class="neg-bomba" style="padding:5px;text-align:right;color:#9aa">—</td>
    <td class="neg-final" style="padding:5px;text-align:right;color:#4ade80;font-weight:700">—</td>
    <td style="padding:5px"><button onclick="this.closest('tr').remove()" class="nfe-aba" style="color:#f87171;font-size:0.74rem">🗑</button></td>`;
  tbody.appendChild(tr);
  fpNegCalc(tr);
}

function fpNegCalc(tr) {
  const sel = tr.querySelector('.neg-prod');
  const bomba = Number((sel.selectedOptions[0] || {}).dataset?.preco || 0);
  const tipo = tr.querySelector('.neg-tipo').value;
  const v = parseFloat(tr.querySelector('.neg-valor').value) || 0;
  let final = bomba;
  if (tipo === 'fixo_preco') final = v;
  else if (tipo === 'acr_rs') final = bomba + v;
  else if (tipo === 'desc_rs') final = Math.max(0, bomba - v);
  else if (tipo === 'acr_pc') final = bomba * (1 + v / 100);
  else if (tipo === 'desc_pc') final = Math.max(0, bomba * (1 - v / 100));
  tr.querySelector('.neg-bomba').textContent = bomba ? bomba.toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : '—';
  tr.querySelector('.neg-final').textContent = (sel.value && (v || tipo !== 'fixo_preco')) ? final.toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : '—';
}

// ---- busca/seleção de clientes ----
function fpCliFiltrar(termo) {
  const t = (termo || '').toLowerCase();
  document.querySelectorAll('#fpp-cli-lista > label').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(t) ? '' : 'none';
  });
}
function fpCliMarcar(v) {
  document.querySelectorAll('#fpp-cli-lista > label').forEach(el => {
    if (el.style.display !== 'none') { const cb = el.querySelector('.fpp-cli'); if (cb) cb.checked = v; }
  });
  fpCliConta();
}
function fpCliConta() {
  const n = document.querySelectorAll('.fpp-cli:checked').length;
  const el = document.getElementById('fpp-cli-n'); if (el) el.textContent = n;
}

// cálculo central: aplica ajuste sobre o preço base
function fpCalcular(base, tipo, modo, valor) {
  if (tipo === 'nenhum' || !valor) return base;
  let ajuste = modo === 'percentual' ? base * (valor / 100) : valor;
  return tipo === 'desconto' ? Math.max(0, base - ajuste) : base + ajuste;
}

async function fpPrecoSalvar(id) {
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpp-nome').value.trim();
  const msg = document.getElementById('fpp-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome da condição.'; return; }
  const reg = {
    empresa_id: eid, nome,
    tipo_ajuste: document.getElementById('fpp-tipo').value,
    modo_ajuste: document.getElementById('fpp-modo').value,
    valor_ajuste: parseFloat(document.getElementById('fpp-valor').value) || 0,
    forma_padrao: document.getElementById('fpp-forma').value || null,
    ativo: document.getElementById('fpp-ativo').checked,
  };
  const q = id ? sb.from('oct_tabelas_preco').update(reg).eq('id', id).select().single()
               : sb.from('oct_tabelas_preco').insert(reg).select().single();
  const { data: salvo, error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }

  const tabelaId = salvo.id;
  // grava vínculos de clientes (substitui os existentes)
  const cliIds = [...document.querySelectorAll('.fpp-cli:checked')].map(c => c.value);
  await sb.from('oct_tabela_preco_clientes').delete().eq('tabela_id', tabelaId);
  if (cliIds.length) {
    await sb.from('oct_tabela_preco_clientes').insert(cliIds.map(cid => ({ empresa_id: eid, tabela_id: tabelaId, cliente_id: cid })));
  }
  // grava vínculos de formas (substitui os existentes)
  const formaIds = [...document.querySelectorAll('.fpp-forma-vinc:checked')].map(c => c.value);
  await sb.from('oct_tabela_preco_formas').delete().eq('tabela_id', tabelaId);
  if (formaIds.length) {
    await sb.from('oct_tabela_preco_formas').insert(formaIds.map(fid => ({ empresa_id: eid, tabela_id: tabelaId, forma_id: fid })));
  }

  // grava o GRID DE NEGOCIAÇÃO (substitui os itens; inclui preco_fixo — a tela
  // antiga não lia esse campo e apagava as negociações importadas ao salvar)
  const itens = [];
  document.querySelectorAll('#fpp-neg-tbody tr').forEach(tr => {
    const pid = tr.querySelector('.neg-prod').value;
    const tipo = tr.querySelector('.neg-tipo').value;
    const v = parseFloat(tr.querySelector('.neg-valor').value);
    if (!pid || isNaN(v)) return;
    if (tipo === 'fixo_preco') {
      itens.push({ empresa_id: eid, tabela_id: tabelaId, produto_id: pid,
        tipo_ajuste: 'nenhum', modo_ajuste: 'percentual', valor_ajuste: 0, preco_fixo: v });
    } else {
      itens.push({ empresa_id: eid, tabela_id: tabelaId, produto_id: pid,
        tipo_ajuste: tipo.startsWith('acr') ? 'acrescimo' : 'desconto',
        modo_ajuste: tipo.endsWith('_pc') ? 'percentual' : 'fixo',
        valor_ajuste: v, preco_fixo: null });
    }
  });
  await sb.from('oct_tabela_preco_itens').delete().eq('tabela_id', tabelaId);
  if (itens.length) {
    const { error: e2 } = await sb.from('oct_tabela_preco_itens').insert(itens);
    if (e2) { msg.style.color = '#f87171'; msg.textContent = 'Negociações: ' + e2.message; return; }
  }

  document.getElementById('fp-preco-form').innerHTML = '';
  fpPrecoListar();
}

async function fpPrecoExcluir(id) {
  if (!confirm('Excluir esta condição? As exceções por produto também serão removidas.')) return;
  const { error } = await sb.from('oct_tabelas_preco').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpPrecoListar();
}

// ---------- utils ----------
function fpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fpSefazNome(c) { const x = FP_SEFAZ.find(s => s.c === c); return x ? x.n : ''; }
function fpAjusteLabel(t) { return t === 'desconto' ? '<span style="color:#4ade80">Desconto</span>' : t === 'acrescimo' ? '<span style="color:#fbbf24">Acréscimo</span>' : '<span style="color:#888">Nenhum</span>'; }
function fpValorLabel(t) { if (t.tipo_ajuste === 'nenhum') return '—'; return t.modo_ajuste === 'percentual' ? Number(t.valor_ajuste) + '%' : 'R$ ' + Number(t.valor_ajuste).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
