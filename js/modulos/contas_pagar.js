
async function moduloContasPagar() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44">Configure sua empresa.</p>'; return; }

  const hoje = new Date().toISOString().split('T')[0];
  const anoMes = hoje.substring(0,7);

  const [contasRes, bancosRes, planoRes] = await Promise.all([
    sb.from('oct_contas_pagar').select('*, oct_pessoas(nome), oct_nfe_entrada(numero,serie,emissao), oct_bancos(banco,descricao), oct_plano_contas(codigo,descricao)').eq('empresa_id', empresaId).order('vencimento'),
    sb.from('oct_bancos').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('banco'),
    sb.from('oct_plano_contas').select('id,codigo,descricao,tipo,grupo').eq('empresa_id', empresaId).in('tipo',['custo','despesa']).order('codigo'),
  ]);

  const contas  = contasRes.data || [];
  const bancos  = bancosRes.data || [];
  const plano   = planoRes.data  || [];

  const abertas  = contas.filter(c => c.status === 'aberto');
  const vencidas = abertas.filter(c => c.vencimento < hoje);
  const prox30   = abertas.filter(c => c.vencimento >= hoje && c.vencimento <= new Date(Date.now()+30*864e5).toISOString().split('T')[0]);
  const pagas    = contas.filter(c => c.status === 'pago');
  const totalAberto  = abertas.reduce((s,c)=>s+Number(c.valor),0);
  const totalVencido = vencidas.reduce((s,c)=>s+Number(c.valor),0);
  const total30      = prox30.reduce((s,c)=>s+Number(c.valor),0);
  const totalPagoMes = pagas.filter(c=>c.data_pagamento?.startsWith(anoMes)).reduce((s,c)=>s+Number(c.valor_pago||c.valor),0);

  window._todasContas    = contas;
  window._empresaIdContas = empresaId;
  window._bancosContas   = bancos;
  window._planoContas    = plano;

  conteudo.innerHTML = `
    <div style="max-width:1200px">
      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>💳 Contas a Pagar</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="abrirGerenciarBancos('${empresaId}')" style="padding:8px 16px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.85rem">🏦 Bancos (${bancos.length})</button>
          <button onclick="abrirGerenciarPlano('${empresaId}')" style="padding:8px 16px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.85rem">📊 Plano de Contas</button>
          <button onclick="abrirFormConta('','${empresaId}')" class="btn-salvar">+ Lançar</button>
        </div>
      </div>

      <!-- CARDS -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        <div style="background:#3a1a1a;border:1px solid #5a2a2a;border-radius:10px;padding:14px;cursor:pointer" onclick="filtrarStatus('vencido')">
          <div class="nfe-label">🔴 Vencidas</div>
          <div style="font-size:1.3rem;font-weight:700;color:#f44;margin-top:4px">R$ ${totalVencido.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.75rem;color:#888;margin-top:2px">${vencidas.length} conta(s)</div>
        </div>
        <div style="background:#1a1500;border:1px solid #5a4a00;border-radius:10px;padding:14px;cursor:pointer" onclick="filtrarStatus('aberto')">
          <div class="nfe-label">🟡 Próx. 30 dias</div>
          <div style="font-size:1.3rem;font-weight:700;color:#fbbf24;margin-top:4px">R$ ${total30.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.75rem;color:#888;margin-top:2px">${prox30.length} conta(s)</div>
        </div>
        <div style="background:#1a2a3a;border:1px solid #2a4a6a;border-radius:10px;padding:14px;cursor:pointer" onclick="filtrarStatus('todos')">
          <div class="nfe-label">📋 Total em aberto</div>
          <div style="font-size:1.3rem;font-weight:700;color:#60a5fa;margin-top:4px">R$ ${totalAberto.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.75rem;color:#888;margin-top:2px">${abertas.length} conta(s)</div>
        </div>
        <div style="background:#1a2a1a;border:1px solid #2a4a2a;border-radius:10px;padding:14px;cursor:pointer" onclick="filtrarStatus('pago')">
          <div class="nfe-label">✅ Pago no mês</div>
          <div style="font-size:1.3rem;font-weight:700;color:#4caf50;margin-top:4px">R$ ${totalPagoMes.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <div style="font-size:0.75rem;color:#888;margin-top:2px">${pagas.filter(c=>c.data_pagamento?.startsWith(anoMes)).length} conta(s)</div>
        </div>
      </div>

      <!-- PAINEIS -->
      <div id="form-conta" style="display:none;margin-bottom:16px"></div>
      <div id="form-bancos" style="display:none;margin-bottom:16px"></div>
      <div id="form-plano" style="display:none;margin-bottom:16px"></div>

      <!-- FILTROS -->
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <select id="filtro-status-conta" onchange="renderContas()" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="aberto">Em aberto</option>
          <option value="vencido">Vencidas</option>
          <option value="pago">Pagas</option>
          <option value="todos">Todas</option>
        </select>
        <select id="filtro-banco-conta" onchange="renderContas()" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="">Todos os bancos</option>
          ${bancos.map(b=>'<option value="'+b.id+'">'+b.banco+(b.descricao?' — '+b.descricao:'')+'</option>').join('')}
        </select>
        <select id="filtro-grupo-conta" onchange="renderContas()" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="">Todos os grupos</option>
          ${[...new Set(plano.map(p=>p.grupo).filter(Boolean))].map(g=>'<option value="'+g+'">'+g+'</option>').join('')}
        </select>
        <input id="busca-conta" type="text" placeholder="🔍 Buscar..."
          oninput="renderContas()"
          style="flex:1;min-width:180px;padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0" />
        <select id="filtro-agrup" onchange="renderContas()" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">
          <option value="">Sem agrupamento</option>
          <option value="fornecedor">Por fornecedor</option>
          <option value="banco">Por banco</option>
          <option value="grupo">Por grupo contábil</option>
        </select>
      </div>

      <div id="tabela-contas"></div>
    </div>
  `;

  renderContas();
}

function filtrarStatus(status) {
  const sel = document.getElementById('filtro-status-conta');
  if(sel) { sel.value = status; renderContas(); }
}

function renderContas() {
  const status  = document.getElementById('filtro-status-conta')?.value || 'aberto';
  const busca   = (document.getElementById('busca-conta')?.value||'').toLowerCase();
  const bancoId = document.getElementById('filtro-banco-conta')?.value||'';
  const grupo   = document.getElementById('filtro-grupo-conta')?.value||'';
  const agrup   = document.getElementById('filtro-agrup')?.value||'';
  const hoje    = new Date().toISOString().split('T')[0];
  let lista = window._todasContas||[];

  if (status==='aberto')  lista=lista.filter(c=>c.status==='aberto'&&c.vencimento>=hoje);
  else if(status==='vencido') lista=lista.filter(c=>c.status==='aberto'&&c.vencimento<hoje);
  else if(status==='pago') lista=lista.filter(c=>c.status==='pago');
  if(bancoId) lista=lista.filter(c=>c.banco_id===bancoId);
  if(grupo)   lista=lista.filter(c=>c.oct_plano_contas?.grupo===grupo);
  if(busca)   lista=lista.filter(c=>c.descricao?.toLowerCase().includes(busca)||c.oct_pessoas?.nome?.toLowerCase().includes(busca));

  const div = document.getElementById('tabela-contas');
  if(!div) return;

  if(lista.length===0){
    div.innerHTML='<div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:10px">Nenhuma conta encontrada.</div>';
    return;
  }

  // Agrupamento
  if(agrup) {
    const grupos = {};
    lista.forEach(c => {
      let chave = agrup==='fornecedor' ? (c.oct_pessoas?.nome||'Sem fornecedor')
                : agrup==='banco'      ? (c.oct_bancos?.banco||'Sem banco')
                :                        (c.oct_plano_contas?.grupo||'Sem categoria');
      if(!grupos[chave]) grupos[chave]=[];
      grupos[chave].push(c);
    });

    div.innerHTML = Object.entries(grupos).map(([nome, items]) => {
      const total = items.reduce((s,c)=>s+Number(c.valor),0);
      return `
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1a1d2e;border-radius:8px 8px 0 0;border:1px solid #2a2d3e;border-bottom:none">
            <strong style="color:#f97316">${nome}</strong>
            <span style="color:#f97316;font-weight:600">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${items.length} conta(s))</span>
          </div>
          ${renderTabelaContas(items, hoje)}
        </div>
      `;
    }).join('');
  } else {
    div.innerHTML = renderTabelaContas(lista, hoje);
  }
}

function renderTabelaContas(lista, hoje) {
  const total = lista.reduce((s,c)=>s+Number(c.valor),0);
  return `
    <table class="nfe-tabela">
      <thead><tr><th>Descrição</th><th>Fornecedor</th><th>NF-e</th><th>Vencimento</th><th>Banco</th><th>Plano de Contas</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>
        ${lista.map(c=>{
          const venc    = c.vencimento;
          const vencida = c.status==='aberto'&&venc<hoje;
          const proxima = c.status==='aberto'&&!vencida&&venc<=new Date(Date.now()+7*864e5).toISOString().split('T')[0];
          return `<tr style="${vencida?'background:#1a0a0a':proxima?'background:#1a1500':''}">
            <td>
              <strong>${c.descricao||'—'}</strong>
              ${c.n_documento?'<br><span style="font-size:0.7rem;color:#555">Doc: '+c.n_documento+'</span>':''}
              ${c.competencia?'<br><span style="font-size:0.7rem;color:#555">Comp: '+new Date(c.competencia+'T12:00:00').toLocaleDateString('pt-BR',{month:'2-digit',year:'numeric'})+'</span>':''}
            </td>
            <td style="font-size:0.82rem">${c.oct_pessoas?.nome||'—'}</td>
            <td style="font-size:0.75rem">${c.oct_nfe_entrada?'<span style="color:#60a5fa">NF-e '+c.oct_nfe_entrada.numero+'/'+c.oct_nfe_entrada.serie+'</span><br><span style="color:#555;font-size:0.7rem">'+new Date((c.oct_nfe_entrada.emissao||'')+'T12:00:00').toLocaleDateString('pt-BR')+'</span>':'—'}</td>
            <td>
              <strong style="color:${vencida?'#f44':proxima?'#fbbf24':'#e0e0e0'}">${new Date(venc+'T12:00:00').toLocaleDateString('pt-BR')}</strong>
              ${vencida?'<br><span style="font-size:0.7rem;color:#f44">● vencida</span>':proxima?'<br><span style="font-size:0.7rem;color:#fbbf24">● vence em breve</span>':''}
              ${c.status==='pago'&&c.data_pagamento?'<br><span style="font-size:0.7rem;color:#4caf50">pago '+new Date(c.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR')+'</span>':''}
            </td>
            <td style="font-size:0.78rem">${c.oct_bancos?'🏦 '+c.oct_bancos.banco+(c.oct_bancos.descricao?' — '+c.oct_bancos.descricao:''):'<span style="color:#555">—</span>'}</td>
            <td style="font-size:0.75rem">${c.oct_plano_contas?'<span style="color:#60a5fa">'+c.oct_plano_contas.codigo+'</span><br>'+c.oct_plano_contas.descricao:'<span style="color:#555">—</span>'}</td>
            <td><strong>R$ ${Number(c.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>${c.valor_pago&&c.valor_pago!=c.valor?'<br><span style="font-size:0.7rem;color:#4caf50">pago R$ '+Number(c.valor_pago).toLocaleString('pt-BR',{minimumFractionDigits:2})+'</span>':''}</td>
            <td><span class="nfe-status ${c.status==='pago'?'confirmada':vencida?'cancelada':'importada'}">${c.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                ${c.status==='aberto'?'<button onclick="pagarConta(\''+c.id+'\')" style="padding:3px 8px;border-radius:4px;border:none;background:#4caf50;color:#fff;cursor:pointer;font-size:0.72rem;font-weight:600">✓ Pagar</button>':''}
                <button onclick="abrirFormConta(\''+c.id+'\',\''+window._empresaIdContas+'\')" style="padding:3px 8px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.72rem">✏️</button>
                <button onclick="excluirConta(\''+c.id+'\')" style="padding:3px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.72rem">🗑</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr style="background:#1e2235">
        <td colspan="6" style="font-weight:600;padding:8px 10px;text-align:right">Total:</td>
        <td style="font-weight:700;color:#f97316;padding:8px 10px">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>
  `;
}

async function pagarConta(id) {
  const conta = window._todasContas?.find(c=>c.id===id);
  const bancos = window._bancosContas||[];
  const hoje = new Date().toISOString().split('T')[0];

  // Modal de pagamento
  const div = document.getElementById('form-conta');
  div.style.display='block';
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #4caf50;border-radius:10px;padding:20px">
      <h3 style="color:#4caf50;margin-bottom:16px">✅ Registrar pagamento</h3>
      <div style="font-size:0.9rem;margin-bottom:16px;color:#888">
        <strong style="color:#e0e0e0">${conta?.descricao||'—'}</strong> —
        R$ <strong style="color:#f97316">${Number(conta?.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
      </div>
      <div class="form-grid" style="max-width:600px">
        <div class="form-group"><label>Data pagamento</label><input id="pg-data" type="date" value="${hoje}" /></div>
        <div class="form-group"><label>Valor pago</label><input id="pg-valor" type="number" step="0.01" value="${conta?.valor||0}" /></div>
        <div class="form-group"><label>Forma pagamento</label>
          <select id="pg-forma">
            <option value="PIX">PIX</option>
            <option value="Boleto">Boleto</option>
            <option value="TED/DOC">TED/DOC</option>
            <option value="Cartão Crédito">Cartão Crédito</option>
            <option value="Cartão Débito">Cartão Débito</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>
        <div class="form-group"><label>Banco compensação</label>
          <select id="pg-banco">
            <option value="">Selecione o banco...</option>
            ${bancos.map(b=>'<option value="'+b.id+'">🏦 '+b.banco+(b.descricao?' — '+b.descricao:'')+'</option>').join('')}
          </select>
        </div>
      </div>
      <div class="form-acoes">
        <button onclick="confirmarPagamento('${id}')" class="btn-salvar" style="background:#4caf50">✅ Confirmar pagamento</button>
        <button onclick="document.getElementById('form-conta').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        <span id="pg-msg" class="form-msg"></span>
      </div>
    </div>
  `;
  div.scrollIntoView({behavior:'smooth'});
}

async function confirmarPagamento(id) {
  const msg = document.getElementById('pg-msg');
  msg.textContent='Salvando...'; msg.style.color='#aaa';
  const bancoId = document.getElementById('pg-banco').value;
  const { error } = await sb.from('oct_contas_pagar').update({
    status: 'pago',
    data_pagamento: document.getElementById('pg-data').value,
    valor_pago: parseFloat(document.getElementById('pg-valor').value)||0,
    forma_pagamento: document.getElementById('pg-forma').value,
    banco_id: bancoId || null,
  }).eq('id', id);
  if(error){ msg.textContent='Erro: '+error.message; msg.style.color='#f44'; return; }
  msg.textContent='✅ Pago!'; msg.style.color='#4caf50';
  setTimeout(()=>moduloContasPagar(), 800);
}

async function excluirConta(id) {
  if(!confirm('Excluir este lançamento?')) return;
  await sb.from('oct_contas_pagar').delete().eq('id', id);
  moduloContasPagar();
}

// ─── BANCOS ─────────────────────────────────────────────────────────────────

async function abrirGerenciarBancos(empresaId) {
  const div = document.getElementById('form-bancos');
  div.style.display = div.style.display==='none'?'block':'none';
  if(div.style.display==='none') return;
  div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({behavior:'smooth'});

  const { data: bancos } = await sb.from('oct_bancos').select('*').eq('empresa_id', empresaId).order('banco');

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa">🏦 Bancos / Contas Bancárias</h3>
        <button onclick="document.getElementById('form-bancos').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>
      <div id="lista-bancos" style="margin-bottom:16px">
        ${!bancos||bancos.length===0?'<p style="color:#555">Nenhum banco cadastrado.</p>':
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">'+
          bancos.map(b=>`
            <div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font-weight:600;font-size:0.9rem">🏦 ${b.banco}</div>
                  ${b.descricao?'<div style="font-size:0.78rem;color:#888">'+b.descricao+'</div>':''}
                  ${b.agencia?'<div style="font-size:0.75rem;color:#555">Ag: '+b.agencia+' | Cc: '+(b.conta||'—')+'</div>':''}
                  <div style="font-size:0.75rem;color:#555;margin-top:2px">Tipo: ${b.tipo}</div>
                </div>
                <div style="text-align:right">
                  <div style="color:#4caf50;font-weight:600;font-size:0.88rem">R$ ${Number(b.saldo_atual||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                  <button onclick="excluirBanco('${b.id}')" style="margin-top:6px;padding:3px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.72rem">🗑</button>
                </div>
              </div>
            </div>
          `).join('')+'</div>'}
      </div>
      <div class="modulo-header"><h2>+ Novo banco / conta</h2></div>
      <div class="form-grid" style="max-width:700px">
        <div class="form-group"><label>Banco *</label><input id="nb-banco" type="text" placeholder="Ex: Bradesco, Itaú, Nubank..." /></div>
        <div class="form-group"><label>Descrição / Apelido</label><input id="nb-desc" type="text" placeholder="Ex: Conta principal, Reserva..." /></div>
        <div class="form-group"><label>Agência</label><input id="nb-agencia" type="text" placeholder="0000-0" /></div>
        <div class="form-group"><label>Conta</label><input id="nb-conta" type="text" placeholder="00000-0" /></div>
        <div class="form-group"><label>Tipo</label>
          <select id="nb-tipo">
            <option value="corrente">Conta Corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="investimento">Investimento</option>
            <option value="caixa">Caixa (espécie)</option>
            <option value="pix">PIX</option>
          </select>
        </div>
        <div class="form-group"><label>Saldo inicial</label><input id="nb-saldo" type="number" step="0.01" value="0" /></div>
      </div>
      <div class="form-acoes">
        <button onclick="salvarBanco('${empresaId}')" class="btn-salvar">💾 Salvar banco</button>
        <span id="nb-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function salvarBanco(empresaId) {
  const msg = document.getElementById('nb-msg');
  const banco = document.getElementById('nb-banco').value.trim();
  if(!banco){ msg.textContent='Nome do banco é obrigatório.'; msg.style.color='#f44'; return; }
  msg.textContent='Salvando...'; msg.style.color='#aaa';
  const saldo = parseFloat(document.getElementById('nb-saldo').value)||0;
  const { error } = await sb.from('oct_bancos').insert({
    empresa_id: empresaId, banco,
    descricao: document.getElementById('nb-desc').value.trim()||null,
    agencia:   document.getElementById('nb-agencia').value.trim()||null,
    conta:     document.getElementById('nb-conta').value.trim()||null,
    tipo:      document.getElementById('nb-tipo').value,
    saldo_inicial: saldo, saldo_atual: saldo,
  });
  if(error){ msg.textContent='Erro: '+error.message; msg.style.color='#f44'; return; }
  msg.textContent='✅ Salvo!'; msg.style.color='#4caf50';
  setTimeout(()=>moduloContasPagar(), 800);
}

async function excluirBanco(id) {
  if(!confirm('Excluir este banco?')) return;
  await sb.from('oct_bancos').update({ativo:false}).eq('id',id);
  moduloContasPagar();
}

// ─── PLANO DE CONTAS ─────────────────────────────────────────────────────────

async function abrirGerenciarPlano(empresaId) {
  const div = document.getElementById('form-plano');
  div.style.display = div.style.display==='none'?'block':'none';
  if(div.style.display==='none') return;
  div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({behavior:'smooth'});

  const { data: plano } = await sb.from('oct_plano_contas').select('*').eq('empresa_id', empresaId).eq('ativo',true).order('codigo');
  const grupos = [...new Set((plano||[]).map(p=>p.grupo).filter(Boolean))];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa">📊 Plano de Contas Contábil</h3>
        <button onclick="document.getElementById('form-plano').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>

      <!-- Listagem agrupada -->
      <div style="max-height:350px;overflow-y:auto;margin-bottom:20px">
        ${grupos.map(g=>{
          const itens=(plano||[]).filter(p=>p.grupo===g).sort((a,b)=>a.codigo.localeCompare(b.codigo));
          return `<div style="margin-bottom:12px">
            <div style="font-size:0.75rem;color:#f97316;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid #2a2d3e;margin-bottom:6px">${g}</div>
            ${itens.map(p=>`
              <div style="display:flex;justify-content:space-between;padding:5px 8px;border-radius:4px;margin-bottom:2px;background:${p.nivel===1?'#1a1d2e':p.nivel===2?'#13151f':'transparent'};font-size:0.82rem">
                <span style="padding-left:${(p.nivel-1)*16}px;color:${p.nivel===1?'#f97316':p.nivel===2?'#e0e0e0':'#aaa'}">
                  ${p.nivel===1?'▶':p.nivel===2?'  ▸':'    •'} <strong>${p.codigo}</strong> — ${p.descricao}
                </span>
                <span style="font-size:0.7rem;padding:1px 6px;border-radius:8px;background:#1e2235;color:${p.tipo==='receita'?'#4caf50':p.tipo==='custo'?'#f97316':'#60a5fa'}">${p.tipo}</span>
              </div>
            `).join('')}
          </div>`;
        }).join('')}
      </div>

      <!-- Form novo item -->
      <div class="modulo-header"><h2>+ Nova conta</h2></div>
      <div class="form-grid" style="max-width:700px">
        <div class="form-group"><label>Código *</label><input id="pc-codigo" type="text" placeholder="Ex: 4.2.9" /></div>
        <div class="form-group"><label>Descrição *</label><input id="pc-desc" type="text" placeholder="Ex: Manutenção de Equipamentos" /></div>
        <div class="form-group"><label>Tipo</label>
          <select id="pc-tipo">
            <option value="receita">Receita</option>
            <option value="custo">Custo (CMV)</option>
            <option value="despesa" selected>Despesa</option>
          </select>
        </div>
        <div class="form-group"><label>Grupo</label>
          <input id="pc-grupo" list="pc-grupos-list" placeholder="Ex: DESPESAS OPERACIONAIS" />
          <datalist id="pc-grupos-list">${grupos.map(g=>'<option value="'+g+'">').join('')}</datalist>
        </div>
        <div class="form-group"><label>Subtipo / Categoria</label><input id="pc-subtipo" type="text" placeholder="Ex: Administrativa" /></div>
        <div class="form-group"><label>Nível</label>
          <select id="pc-nivel">
            <option value="1">1 — Grupo</option>
            <option value="2">2 — Subgrupo</option>
            <option value="3" selected>3 — Conta</option>
          </select>
        </div>
      </div>
      <div class="form-acoes">
        <button onclick="salvarPlanoConta('${empresaId}')" class="btn-salvar">💾 Salvar conta</button>
        <span id="pc-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function salvarPlanoConta(empresaId) {
  const msg = document.getElementById('pc-msg');
  const codigo = document.getElementById('pc-codigo').value.trim();
  const descricao = document.getElementById('pc-desc').value.trim();
  if(!codigo||!descricao){ msg.textContent='Código e descrição obrigatórios.'; msg.style.color='#f44'; return; }
  msg.textContent='Salvando...'; msg.style.color='#aaa';
  const { error } = await sb.from('oct_plano_contas').insert({
    empresa_id: empresaId, codigo, descricao,
    tipo:    document.getElementById('pc-tipo').value,
    grupo:   document.getElementById('pc-grupo').value.trim()||null,
    subtipo: document.getElementById('pc-subtipo').value.trim()||null,
    nivel:   parseInt(document.getElementById('pc-nivel').value)||3,
    dre: true,
  });
  if(error){ msg.textContent='Erro: '+error.message; msg.style.color='#f44'; return; }
  msg.textContent='✅ Salvo!'; msg.style.color='#4caf50';
  setTimeout(()=>moduloContasPagar(), 800);
}

// ─── FORM LANÇAMENTO ─────────────────────────────────────────────────────────

async function abrirFormConta(id, empresaId) {
  const div = document.getElementById('form-conta');
  div.style.display='block';
  div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({behavior:'smooth'});

  let c=null;
  if(id){ const{data}=await sb.from('oct_contas_pagar').select('*').eq('id',id).single(); c=data; }

  const [fornRes, bancRes, planoRes] = await Promise.all([
    sb.from('oct_pessoas').select('id,nome').eq('empresa_id',empresaId).eq('tipo','fornecedor').order('nome'),
    sb.from('oct_bancos').select('id,banco,descricao').eq('empresa_id',empresaId).eq('ativo',true).order('banco'),
    sb.from('oct_plano_contas').select('id,codigo,descricao,grupo').eq('empresa_id',empresaId).in('tipo',['custo','despesa']).eq('nivel',3).order('codigo'),
  ]);

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa">${id?'✏️ Editar lançamento':'+ Novo lançamento'}</h3>
        <button onclick="document.getElementById('form-conta').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Descrição *</label><input id="fc-desc" type="text" value="${c?.descricao||''}" /></div>
        <div class="form-group"><label>Fornecedor</label>
          <select id="fc-forn"><option value="">—</option>
            ${(fornRes.data||[]).map(f=>'<option value="'+f.id+'" '+(c?.fornecedor_id===f.id?'selected':'')+'>'+f.nome+'</option>').join('')}
          </select>
        </div>
        <div class="form-group"><label>Nº Documento</label><input id="fc-doc" type="text" value="${c?.n_documento||''}" /></div>
        <div class="form-group"><label>Valor *</label><input id="fc-valor" type="number" step="0.01" value="${c?.valor||''}" /></div>
        <div class="form-group"><label>Vencimento *</label><input id="fc-venc" type="date" value="${c?.vencimento||''}" /></div>
        <div class="form-group"><label>Competência</label><input id="fc-comp" type="date" value="${c?.competencia||''}" /></div>
        <div class="form-group"><label>Banco compensação</label>
          <select id="fc-banco"><option value="">—</option>
            ${(bancRes.data||[]).map(b=>'<option value="'+b.id+'" '+(c?.banco_id===b.id?'selected':'')+'>'+b.banco+(b.descricao?' — '+b.descricao:'')+'</option>').join('')}
          </select>
        </div>
        <div class="form-group span2"><label>Plano de contas</label>
          <select id="fc-plano"><option value="">— Sem categoria —</option>
            ${(planoRes.data||[]).map(p=>'<option value="'+p.id+'" '+(c?.plano_conta_id===p.id?'selected':'')+'>'+p.codigo+' — '+p.descricao+'</option>').join('')}
          </select>
        </div>
        <div class="form-group span2"><label>Observações</label><input id="fc-obs" type="text" value="${c?.observacoes||''}" /></div>
      </div>
      <div class="form-acoes">
        <button onclick="salvarConta('${id||''}','${empresaId}')" class="btn-salvar">💾 Salvar</button>
        <button onclick="document.getElementById('form-conta').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        ${id?'<button onclick="excluirConta(\''+id+'\')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>':''}
        <span id="fc-msg" class="form-msg"></span>
      </div>
    </div>
  `;
}

async function salvarConta(id, empresaId) {
  const msg = document.getElementById('fc-msg');
  const desc=document.getElementById('fc-desc').value.trim();
  const valor=parseFloat(document.getElementById('fc-valor').value);
  const venc=document.getElementById('fc-venc').value;
  if(!desc||!valor||!venc){msg.textContent='Descrição, valor e vencimento são obrigatórios.';msg.style.color='#f44';return;}
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const dados={
    empresa_id:empresaId,descricao:desc,valor,vencimento:venc,
    fornecedor_id:document.getElementById('fc-forn').value||null,
    n_documento:document.getElementById('fc-doc').value.trim()||null,
    competencia:document.getElementById('fc-comp').value||null,
    banco_id:document.getElementById('fc-banco').value||null,
    plano_conta_id:document.getElementById('fc-plano').value||null,
    observacoes:document.getElementById('fc-obs').value.trim()||null,
  };
  let error;
  if(id){({error}=await sb.from('oct_contas_pagar').update(dados).eq('id',id));}
  else{({error}=await sb.from('oct_contas_pagar').insert(dados));}
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='✅ Salvo!';msg.style.color='#4caf50';
  setTimeout(()=>moduloContasPagar(),800);
}

// Chamado pela importação da NF-e
async function lancarContasPagarNfe(nfeId, empresaId, fornecedorId, numero, serie, pagamentos, duplicatas, emissao) {
  if (duplicatas && duplicatas.length > 0) {
    for (const dup of duplicatas) {
      if (!dup.dVenc || !dup.vDup) continue;
      await sb.from('oct_contas_pagar').insert({
        empresa_id:empresaId, descricao:'NF-e '+numero+'/'+serie+' — Dup. '+(dup.nDup||'001'),
        fornecedor_id:fornecedorId||null, nfe_id:nfeId,
        valor:dup.vDup, vencimento:dup.dVenc,
        n_documento:numero+'/'+(dup.nDup||'1'), status:'aberto',
        competencia:emissao||null,
      });
    }
  } else if (pagamentos && pagamentos.length > 0) {
    for (const pag of pagamentos) {
      if (pag.indPag==='0') continue;
      const venc = emissao || new Date().toISOString().split('T')[0];
      await sb.from('oct_contas_pagar').insert({
        empresa_id:empresaId, descricao:'NF-e '+numero+'/'+serie,
        fornecedor_id:fornecedorId||null, nfe_id:nfeId,
        valor:pag.vPag, vencimento:venc,
        n_documento:numero, status:'aberto',
        competencia:emissao||null,
        observacoes:'Forma: '+(pag.xPag||pag.tPag)+' — venc. = data emissão NF-e',
      });
    }
  }
}
