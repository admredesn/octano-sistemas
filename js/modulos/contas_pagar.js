
async function moduloContasPagar() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }

  const hoje = new Date().toISOString().split('T')[0];
  const mes = hoje.substring(0, 7);

  const { data: contas } = await sb
    .from('oct_contas_pagar')
    .select('*, oct_pessoas(nome), oct_nfe_entrada(numero,serie)')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true });

  const abertas  = (contas||[]).filter(c => c.status === 'aberto');
  const vencidas = abertas.filter(c => c.vencimento < hoje);
  const hoje30   = abertas.filter(c => c.vencimento >= hoje && c.vencimento <= new Date(Date.now()+30*864e5).toISOString().split('T')[0]);
  const pagas    = (contas||[]).filter(c => c.status === 'pago');

  const totalAberto  = abertas.reduce((s,c)=>s+Number(c.valor),0);
  const totalVencido = vencidas.reduce((s,c)=>s+Number(c.valor),0);
  const total30      = hoje30.reduce((s,c)=>s+Number(c.valor),0);

  conteudo.innerHTML = `
    <div style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>💳 Contas a Pagar</h2></div>
        <button onclick="abrirFormConta('','${empresaId}')" class="btn-salvar">+ Lançar manualmente</button>
      </div>

      <!-- CARDS RESUMO -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px">
        <div style="background:#3a1a1a;border:1px solid #5a2a2a;border-radius:10px;padding:16px">
          <div class="nfe-label">🔴 Vencidas</div>
          <div style="font-size:1.4rem;font-weight:700;color:#f44;margin-top:6px">R$ ${totalVencido.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.78rem;color:#888;margin-top:4px">${vencidas.length} conta(s)</div>
        </div>
        <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:10px;padding:16px">
          <div class="nfe-label">🟡 Próximos 30 dias</div>
          <div style="font-size:1.4rem;font-weight:700;color:#fbbf24;margin-top:6px">R$ ${total30.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.78rem;color:#888;margin-top:4px">${hoje30.length} conta(s)</div>
        </div>
        <div style="background:#1a2a3a;border:1px solid #2a4a6a;border-radius:10px;padding:16px">
          <div class="nfe-label">📋 Total em aberto</div>
          <div style="font-size:1.4rem;font-weight:700;color:#60a5fa;margin-top:6px">R$ ${totalAberto.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.78rem;color:#888;margin-top:4px">${abertas.length} conta(s)</div>
        </div>
      </div>

      <!-- FORM -->
      <div id="form-conta" style="display:none;margin-bottom:20px"></div>

      <!-- FILTROS -->
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <select id="filtro-status-conta" onchange="renderContas()" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="aberto">Em aberto</option>
          <option value="vencido">Vencidas</option>
          <option value="pago">Pagas</option>
          <option value="todos">Todas</option>
        </select>
        <input id="busca-conta" type="text" placeholder="🔍 Buscar descrição ou fornecedor..."
          oninput="renderContas()"
          style="flex:1;min-width:200px;padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0" />
      </div>

      <div id="tabela-contas"></div>
    </div>
  `;

  window._todasContas = contas || [];
  window._empresaIdContas = empresaId;
  renderContas();
}

function renderContas() {
  const status = document.getElementById('filtro-status-conta')?.value || 'aberto';
  const busca  = (document.getElementById('busca-conta')?.value || '').toLowerCase();
  const hoje   = new Date().toISOString().split('T')[0];
  let lista = window._todasContas || [];

  if (status === 'aberto')  lista = lista.filter(c => c.status === 'aberto' && c.vencimento >= hoje);
  else if (status === 'vencido') lista = lista.filter(c => c.status === 'aberto' && c.vencimento < hoje);
  else if (status === 'pago') lista = lista.filter(c => c.status === 'pago');

  if (busca) lista = lista.filter(c =>
    c.descricao?.toLowerCase().includes(busca) ||
    c.oct_pessoas?.nome?.toLowerCase().includes(busca)
  );

  const div = document.getElementById('tabela-contas');
  if (!div) return;

  if (lista.length === 0) {
    div.innerHTML = `<div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:10px">Nenhuma conta encontrada.</div>`;
    return;
  }

  div.innerHTML = `
    <table class="nfe-tabela">
      <thead>
        <tr>
          <th>Descrição</th><th>Fornecedor</th><th>NF-e</th>
          <th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(c => {
          const venc = c.vencimento;
          const vencida = c.status === 'aberto' && venc < hoje;
          const proxima = c.status === 'aberto' && !vencida && venc <= new Date(Date.now()+7*864e5).toISOString().split('T')[0];
          return `
            <tr style="${vencida?'background:#1a0a0a':proxima?'background:#1a1500':''}">
              <td><strong>${c.descricao||'—'}</strong>${c.n_documento?`<br><span style="font-size:0.72rem;color:#555">Doc: ${c.n_documento}</span>`:''}</td>
              <td style="font-size:0.82rem">${c.oct_pessoas?.nome||'—'}</td>
              <td style="font-size:0.75rem">${c.oct_nfe_entrada?`NF-e ${c.oct_nfe_entrada.numero}/${c.oct_nfe_entrada.serie}`:'—'}</td>
              <td>
                <strong style="color:${vencida?'#f44':proxima?'#fbbf24':'#e0e0e0'}">${new Date(venc+'T12:00:00').toLocaleDateString('pt-BR')}</strong>
                ${vencida?`<br><span style="font-size:0.7rem;color:#f44">● vencida</span>`:proxima?`<br><span style="font-size:0.7rem;color:#fbbf24">● vence em breve</span>`:''}
              </td>
              <td><strong>R$ ${Number(c.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
              <td>
                <span class="nfe-status ${c.status==='pago'?'confirmada':vencida?'cancelada':'importada'}">${c.status}</span>
              </td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${c.status==='aberto'?`<button onclick="pagarConta('${c.id}')" style="padding:4px 8px;border-radius:4px;border:none;background:#4caf50;color:#fff;cursor:pointer;font-size:0.75rem;font-weight:600">✓ Pagar</button>`:''}
                  <button onclick="abrirFormConta('${c.id}','${window._empresaIdContas}')" style="padding:4px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.75rem">✏️</button>
                  <button onclick="excluirConta('${c.id}')" style="padding:4px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.75rem">🗑</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#1e2235">
          <td colspan="4" style="font-weight:600;padding:8px 10px;text-align:right">Total filtrado:</td>
          <td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${lista.reduce((s,c)=>s+Number(c.valor||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  `;
}

async function pagarConta(id) {
  const hoje = new Date().toISOString().split('T')[0];
  const forma = prompt('Forma de pagamento (ex: PIX, Boleto, Dinheiro):') || 'Não informado';
  if (forma === null) return;
  await sb.from('oct_contas_pagar').update({
    status: 'pago', data_pagamento: hoje,
    forma_pagamento: forma,
    valor_pago: window._todasContas.find(c=>c.id===id)?.valor || 0,
  }).eq('id', id);
  moduloContasPagar();
}

async function excluirConta(id) {
  if (!confirm('Excluir este lançamento?')) return;
  await sb.from('oct_contas_pagar').delete().eq('id', id);
  moduloContasPagar();
}

async function abrirFormConta(id, empresaId) {
  const div = document.getElementById('form-conta');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  let c = null;
  if (id) {
    const { data } = await sb.from('oct_contas_pagar').select('*').eq('id', id).single();
    c = data;
  }

  const { data: fornecedores } = await sb.from('oct_pessoas').select('id,nome').eq('empresa_id', empresaId).eq('tipo','fornecedor').order('nome');

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa;font-size:0.95rem">${id?'✏️ Editar lançamento':'+ Novo lançamento'}</h3>
        <button onclick="document.getElementById('form-conta').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Descrição *</label><input id="fc-desc" type="text" value="${c?.descricao||''}" placeholder="Ex: Boleto NF-e 215918" /></div>
        <div class="form-group">
          <label>Fornecedor</label>
          <select id="fc-forn">
            <option value="">Selecione...</option>
            ${(fornecedores||[]).map(f=>`<option value="${f.id}" ${c?.fornecedor_id===f.id?'selected':''}>${f.nome}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Nº Documento</label><input id="fc-doc" type="text" value="${c?.n_documento||''}" placeholder="Ex: 346995/1" /></div>
        <div class="form-group"><label>Valor *</label><input id="fc-valor" type="number" step="0.01" value="${c?.valor||''}" /></div>
        <div class="form-group"><label>Vencimento *</label><input id="fc-venc" type="date" value="${c?.vencimento||''}" /></div>
        <div class="form-group span2"><label>Observações</label><input id="fc-obs" type="text" value="${c?.observacoes||''}" /></div>
      </div>
      <div class="form-acoes">
        <button onclick="salvarConta('${id||''}','${empresaId}')" class="btn-salvar">💾 Salvar</button>
        <button onclick="document.getElementById('form-conta').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="fc-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function salvarConta(id, empresaId) {
  const msg = document.getElementById('fc-msg');
  const desc  = document.getElementById('fc-desc').value.trim();
  const valor = parseFloat(document.getElementById('fc-valor').value);
  const venc  = document.getElementById('fc-venc').value;
  if (!desc || !valor || !venc) { msg.textContent = 'Descrição, valor e vencimento são obrigatórios.'; msg.style.color='#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';
  const dados = {
    empresa_id: empresaId, descricao: desc, valor, vencimento: venc,
    fornecedor_id: document.getElementById('fc-forn').value || null,
    n_documento: document.getElementById('fc-doc').value.trim() || null,
    observacoes: document.getElementById('fc-obs').value.trim() || null,
  };
  let error;
  if (id) { ({error} = await sb.from('oct_contas_pagar').update(dados).eq('id',id)); }
  else    { ({error} = await sb.from('oct_contas_pagar').insert(dados)); }
  if (error) { msg.textContent='Erro: '+error.message; msg.style.color='#f44'; return; }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloContasPagar(), 1000);
}

// Chamado pela importação da NF-e
async function lancarContasPagarNfe(nfeId, empresaId, fornecedorId, numero, serie, pagamentos, duplicatas) {
  // Prioriza duplicatas (têm vencimento real), senão usa pagamentos
  if (duplicatas && duplicatas.length > 0) {
    for (const dup of duplicatas) {
      if (!dup.dVenc || !dup.vDup) continue;
      await sb.from('oct_contas_pagar').insert({
        empresa_id: empresaId,
        descricao: `NF-e ${numero}/${serie} — Dup. ${dup.nDup||'001'}`,
        fornecedor_id: fornecedorId || null,
        nfe_id: nfeId,
        valor: dup.vDup,
        vencimento: dup.dVenc,
        n_documento: `${numero}/${dup.nDup||'1'}`,
        status: 'aberto',
      });
    }
  } else if (pagamentos && pagamentos.length > 0) {
    // Pagamento a prazo sem duplicata: usa data de hoje + 30 dias como estimativa
    for (const pag of pagamentos) {
      if (pag.indPag === '0') continue; // à vista não lança
      const venc = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];
      await sb.from('oct_contas_pagar').insert({
        empresa_id: empresaId,
        descricao: `NF-e ${numero}/${serie}`,
        fornecedor_id: fornecedorId || null,
        nfe_id: nfeId,
        valor: pag.vPag,
        vencimento: venc,
        n_documento: numero,
        observacoes: `Forma: ${pag.xPag || pag.tPag}`,
        status: 'aberto',
      });
    }
  }
}
