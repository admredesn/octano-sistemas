
async function moduloLmc() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(nome,cnpj,ie,uf)').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  const empresa = perfil?.oct_empresas;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }

  const hoje = new Date().toISOString().split('T')[0];
  const mesIni = hoje.substring(0,7) + '-01';
  const mesFim = hoje;

  const [tanquesRes, lmcRes] = await Promise.all([
    sb.from('oct_tanques').select('*').eq('empresa_id', empresaId).order('numero'),
    sb.from('oct_lmc').select('*').eq('empresa_id', empresaId).order('data').order('criado_em'),
  ]);

  const tanques = tanquesRes.data || [];
  const lmcTodos = lmcRes.data || [];
  const f = v => Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:3});
  const f2 = v => Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2});

  // Resumo por tanque
  const resumo = tanques.map(t => {
    const movs = lmcTodos.filter(l => l.tanque_id === t.id);
    const totalEntrada = movs.reduce((s,l) => s+Number(l.entrada||0), 0);
    const totalSaida = movs.reduce((s,l) => s+Number(l.saida||0), 0);
    return {...t, movs: movs.length, totalEntrada, totalSaida};
  });

  const CORES = {
    'GASOLINA COMUM':'#fbbf24','GASOLINA ADITIVADA':'#f97316',
    'ETANOL':'#4caf50','DIESEL S10':'#60a5fa','DIESEL S500':'#3b82f6',
    'GNV':'#a78bfa','default':'#888'
  };
  const cor = (c) => CORES[c?.toUpperCase()] || CORES.default;

  conteudo.innerHTML =
    '<div style="max-width:1200px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
      '<div class="modulo-header" style="margin-bottom:0;border:none"><h2>📋 LMC — Livro de Movimentação de Combustíveis</h2></div>' +
      '<button onclick="abrirFormLmc('')" class="btn-salvar">+ Lançar movimentação</button>' +
    '</div>' +

    // Cards por tanque
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px">' +
    resumo.map(t => {
      const perc = t.capacidade ? Math.round(Number(t.estoque_atual)/Number(t.capacidade)*100) : 0;
      const corT = cor(t.combustivel);
      return '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;cursor:pointer" onclick="filtrarTanqueLmc(''+t.id+'')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="font-weight:700;color:'+corT+'">T'+t.numero+'</span>' +
          '<span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;background:#1e2235;color:'+corT+'">'+t.combustivel+'</span>' +
        '</div>' +
        '<div style="background:#0f1117;border-radius:4px;height:6px;margin-bottom:8px">' +
          '<div style="height:100%;border-radius:4px;background:'+corT+';width:'+perc+'%"></div>' +
        '</div>' +
        '<div style="font-size:0.85rem"><strong>'+f(t.estoque_atual)+' L</strong></div>' +
        '<div style="font-size:0.72rem;color:#555;margin-top:2px">'+perc+'% de '+f(t.capacidade)+' L</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.72rem;color:#888">' +
          '<span style="color:#4caf50">↑ '+f(t.totalEntrada)+' L</span>' +
          '<span style="color:#f44">↓ '+f(t.totalSaida)+' L</span>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>' +

    // Form novo lançamento
    '<div id="form-lmc" style="display:none;margin-bottom:16px"></div>' +

    // Filtros
    '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
        '<div><div class="nfe-label" style="margin-bottom:4px">Tanque</div>' +
          '<select id="lmc-filtro-tanque" onchange="renderLmc()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">' +
            '<option value="">Todos os tanques</option>' +
            tanques.map(t=>'<option value="'+t.id+'">T'+t.numero+' — '+t.combustivel+'</option>').join('') +
          '</select>' +
        '</div>' +
        '<div><div class="nfe-label" style="margin-bottom:4px">Data inicial</div>' +
          '<input id="lmc-dt-ini" type="date" value="'+mesIni+'" onchange="renderLmc()" style="padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" />' +
        '</div>' +
        '<div><div class="nfe-label" style="margin-bottom:4px">Data final</div>' +
          '<input id="lmc-dt-fim" type="date" value="'+mesFim+'" onchange="renderLmc()" style="padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" />' +
        '</div>' +
        '<div><div class="nfe-label" style="margin-bottom:4px">Tipo</div>' +
          '<select id="lmc-filtro-tipo" onchange="renderLmc()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">' +
            '<option value="">Todos</option><option value="entrada">Entradas</option><option value="saida">Saidas</option>' +
          '</select>' +
        '</div>' +
        '<button onclick="exportarLmc()" style="padding:7px 14px;border-radius:5px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer;font-size:0.85rem">📥 Exportar TXT</button>' +
      '</div>' +
    '</div>' +

    '<div id="tabela-lmc"></div>' +
    '</div>';

  window._lmcTodos = lmcTodos;
  window._lmcTanques = tanques;
  window._lmcEmpresaId = empresaId;
  window._lmcEmpresa = empresa;
  renderLmc();
}

function filtrarTanqueLmc(tanqueId) {
  const el = document.getElementById('lmc-filtro-tanque');
  if (el) { el.value = tanqueId; renderLmc(); }
}

function renderLmc() {
  const tanqueId = document.getElementById('lmc-filtro-tanque')?.value || '';
  const dtIni = document.getElementById('lmc-dt-ini')?.value || '';
  const dtFim = document.getElementById('lmc-dt-fim')?.value || '';
  const tipo = document.getElementById('lmc-filtro-tipo')?.value || '';
  let lista = window._lmcTodos || [];

  if (tanqueId) lista = lista.filter(l => l.tanque_id === tanqueId);
  if (dtIni) lista = lista.filter(l => l.data >= dtIni);
  if (dtFim) lista = lista.filter(l => l.data <= dtFim);
  if (tipo === 'entrada') lista = lista.filter(l => Number(l.entrada||0) > 0);
  if (tipo === 'saida')   lista = lista.filter(l => Number(l.saida||0) > 0);

  const div = document.getElementById('tabela-lmc');
  if (!div) return;

  if (lista.length === 0) {
    div.innerHTML = '<div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:8px">Nenhum registro encontrado no período.</div>';
    return;
  }

  const f = v => Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:3});
  const f2 = v => Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2});
  const fdt = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const CORES = {'GASOLINA COMUM':'#fbbf24','GASOLINA ADITIVADA':'#f97316','ETANOL':'#4caf50','DIESEL S10':'#60a5fa','DIESEL S500':'#3b82f6','GNV':'#a78bfa'};
  const cor = c => CORES[c?.toUpperCase()] || '#888';

  const totalEntrada = lista.reduce((s,l) => s+Number(l.entrada||0), 0);
  const totalSaida   = lista.reduce((s,l) => s+Number(l.saida||0), 0);

  let seq = 1;
  const rows = lista.map(l => {
    const tanque = (window._lmcTanques||[]).find(t => t.id === l.tanque_id);
    const corT = cor(tanque?.combustivel);
    const entrada = Number(l.entrada||0);
    const saida   = Number(l.saida||0);
    return '<tr>' +
      '<td style="color:#555;font-size:0.75rem;text-align:center">'+(seq++)+'</td>' +
      '<td style="font-size:0.85rem"><strong>'+fdt(l.data)+'</strong></td>' +
      '<td><span style="color:'+corT+';font-weight:600">T'+(tanque?.numero||'?')+'</span> <span style="font-size:0.78rem;color:#888">'+(tanque?.combustivel||'—')+'</span></td>' +
      '<td style="color:#4caf50;font-weight:600;font-size:0.88rem">'+(entrada>0?'+ '+f(entrada)+' L':'—')+'</td>' +
      '<td style="color:#f44;font-weight:600;font-size:0.88rem">'+(saida>0?'- '+f(saida)+' L':'—')+'</td>' +
      '<td style="font-weight:700">'+f(l.saldo_final)+' L</td>' +
      '<td style="font-size:0.75rem;color:#888">'+(l.observacoes||'—')+'</td>' +
      '<td>' +
        '<button onclick="excluirLmc(''+l.id+'',''+l.tanque_id+'','+entrada+','+saida+')" style="padding:2px 8px;border-radius:3px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem">✕</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  div.innerHTML =
    '<div style="overflow-x:auto">' +
    '<table class="nfe-tabela" style="min-width:900px">' +
      '<thead><tr>' +
        '<th style="width:36px;text-align:center">Seq</th>' +
        '<th>Data</th><th>Tanque</th>' +
        '<th style="color:#4caf50">Entrada</th>' +
        '<th style="color:#f44">Saída</th>' +
        '<th>Saldo Final</th><th>Observações</th><th>Ações</th>' +
      '</tr></thead>' +
      '<tbody>'+rows+'</tbody>' +
      '<tfoot><tr style="background:#1a1d2e;border-top:2px solid #2a2d3e">' +
        '<td colspan="3" style="padding:10px 8px;font-size:0.82rem;color:#888">'+lista.length+' registros</td>' +
        '<td style="padding:10px 8px;color:#4caf50;font-weight:700">+ '+f(totalEntrada)+' L</td>' +
        '<td style="padding:10px 8px;color:#f44;font-weight:700">- '+f(totalSaida)+' L</td>' +
        '<td colspan="3" style="padding:10px 8px;font-size:0.82rem;color:#888">Saldo líq: <strong style="color:#e0e0e0">'+f(totalEntrada-totalSaida)+' L</strong></td>' +
      '</tr></tfoot>' +
    '</table>' +
    '</div>';
}

async function abrirFormLmc(id) {
  const div = document.getElementById('form-lmc');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({behavior:'smooth'});
  const tanques = window._lmcTanques || [];
  const hoje = new Date().toISOString().split('T')[0];
  div.innerHTML =
    '<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<h3 style="color:#60a5fa">+ Novo lançamento LMC</h3>' +
      '<button onclick="document.getElementById('form-lmc').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button>' +
    '</div>' +
    '<div class="form-grid" style="max-width:700px">' +
      '<div class="form-group"><label>Data *</label><input id="lmc-data" type="date" value="'+hoje+'" /></div>' +
      '<div class="form-group"><label>Tanque *</label>' +
        '<select id="lmc-tanque">' +
          '<option value="">Selecione...</option>' +
          tanques.map(t=>'<option value="'+t.id+'">T'+t.numero+' — '+t.combustivel+'</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="form-group"><label>Tipo</label>' +
        '<select id="lmc-tipo" onchange="toggleLmcTipo()">' +
          '<option value="entrada">Entrada (recebimento)</option>' +
          '<option value="saida">Saída (venda/consumo)</option>' +
          '<option value="ajuste">Ajuste de inventário</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group"><label id="lmc-qtd-label">Quantidade (L) *</label><input id="lmc-qtd" type="number" step="0.001" min="0" placeholder="0.000" /></div>' +
      '<div class="form-group"><label>Saldo anterior (L)</label><input id="lmc-saldo-ant" type="number" step="0.001" value="0" /></div>' +
      '<div class="form-group span2"><label>Observações</label><input id="lmc-obs" type="text" placeholder="Ex: Abastecimento bomba 1, NF-e 12345..." /></div>' +
    '</div>' +
    '<div class="form-acoes">' +
      '<button onclick="salvarLmc()" class="btn-salvar">💾 Salvar</button>' +
      '<button onclick="document.getElementById('form-lmc').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>' +
      '<span id="lmc-msg" class="form-msg"></span>' +
    '</div>' +
    '</div>';
}

function toggleLmcTipo() {
  const tipo = document.getElementById('lmc-tipo')?.value;
  const label = document.getElementById('lmc-qtd-label');
  if (label) label.textContent = tipo==='saida' ? 'Quantidade saída (L) *' : tipo==='ajuste' ? 'Saldo real (L) *' : 'Quantidade entrada (L) *';
}

async function salvarLmc() {
  const msg = document.getElementById('lmc-msg');
  const tanqueId = document.getElementById('lmc-tanque').value;
  const data = document.getElementById('lmc-data').value;
  const tipo = document.getElementById('lmc-tipo').value;
  const qtd = parseFloat(document.getElementById('lmc-qtd').value) || 0;
  const obs = document.getElementById('lmc-obs').value.trim();

  if (!tanqueId || !data || !qtd) { msg.textContent='Tanque, data e quantidade obrigatorios.'; msg.style.color='#f44'; return; }
  msg.textContent='Salvando...'; msg.style.color='#aaa';

  const { data: tanque } = await sb.from('oct_tanques').select('estoque_atual,capacidade').eq('id', tanqueId).single();
  const saldoAnt = Number(tanque?.estoque_atual || 0);

  let entrada=0, saida=0, saldoFinal=saldoAnt;
  if (tipo==='entrada')  { entrada=qtd; saldoFinal=Math.min(saldoAnt+qtd, Number(tanque?.capacidade||99999)); }
  else if(tipo==='saida'){ saida=qtd;   saldoFinal=Math.max(0, saldoAnt-qtd); }
  else                   { saldoFinal=qtd; entrada=qtd-saldoAnt; saida=saldoAnt>qtd?saldoAnt-qtd:0; entrada=saldoAnt<qtd?qtd-saldoAnt:0; }

  const { error: lmcErr } = await sb.from('oct_lmc').insert({
    empresa_id: window._lmcEmpresaId, tanque_id: tanqueId,
    data, entrada, saida,
    saldo_anterior: saldoAnt, saldo_final: saldoFinal,
    observacoes: obs || (tipo==='entrada'?'Entrada manual':tipo==='saida'?'Saida manual':'Ajuste inventario'),
  });

  if (lmcErr) { msg.textContent='Erro: '+lmcErr.message; msg.style.color='#f44'; return; }

  // Atualiza estoque do tanque
  await sb.from('oct_tanques').update({ estoque_atual: saldoFinal }).eq('id', tanqueId);

  msg.textContent='Salvo!'; msg.style.color='#4caf50';
  setTimeout(()=>moduloLmc(), 600);
}

async function excluirLmc(id, tanqueId, entrada, saida) {
  if (!confirm('Excluir este registro do LMC?\n\nO estoque do tanque sera revertido.')) return;

  const { data: tanque } = await sb.from('oct_tanques').select('estoque_atual').eq('id', tanqueId).single();
  if (tanque) {
    const novoEstoque = Math.max(0, Number(tanque.estoque_atual) - entrada + saida);
    await sb.from('oct_tanques').update({ estoque_atual: novoEstoque }).eq('id', tanqueId);
  }
  await sb.from('oct_lmc').delete().eq('id', id);
  moduloLmc();
}

function exportarLmc() {
  const tanqueId = document.getElementById('lmc-filtro-tanque')?.value || '';
  const dtIni = document.getElementById('lmc-dt-ini')?.value || '';
  const dtFim = document.getElementById('lmc-dt-fim')?.value || '';
  let lista = window._lmcTodos || [];
  if (tanqueId) lista = lista.filter(l => l.tanque_id === tanqueId);
  if (dtIni) lista = lista.filter(l => l.data >= dtIni);
  if (dtFim) lista = lista.filter(l => l.data <= dtFim);

  const tanques = window._lmcTanques || [];
  const empresa = window._lmcEmpresa || {};
  const f3 = v => Number(v||0).toFixed(3);
  const fdt = d => d ? d.split('-').reverse().join('/') : '';

  let txt = 'LMC - LIVRO DE MOVIMENTACAO DE COMBUSTIVEIS\n';
  txt += empresa.nome + ' | CNPJ: ' + (empresa.cnpj||'') + ' | IE: ' + (empresa.ie||'') + '\n';
  txt += 'Periodo: ' + (dtIni?fdt(dtIni):'inicio') + ' a ' + (dtFim?fdt(dtFim):'hoje') + '\n';
  txt += '='.repeat(100) + '\n';
  txt += 'DATA       | TANQUE         | COMBUSTIVEL          | ENTRADA (L)  | SAIDA (L)    | SALDO (L)    | OBSERVACOES\n';
  txt += '-'.repeat(100) + '\n';

  lista.forEach(l => {
    const t = tanques.find(x => x.id === l.tanque_id);
    txt += (fdt(l.data)||'').padEnd(11)+'| ';
    txt += ('T'+(t?.numero||'?')).padEnd(15)+'| ';
    txt += (t?.combustivel||'').padEnd(21)+'| ';
    txt += f3(l.entrada).padStart(13)+'| ';
    txt += f3(l.saida).padStart(13)+'| ';
    txt += f3(l.saldo_final).padStart(13)+'| ';
    txt += (l.observacoes||'') + '\n';
  });

  txt += '='.repeat(100) + '\n';
  txt += 'Total entradas: '+f3(lista.reduce((s,l)=>s+Number(l.entrada||0),0))+' L\n';
  txt += 'Total saidas:   '+f3(lista.reduce((s,l)=>s+Number(l.saida||0),0))+' L\n';

  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='LMC_'+( dtIni||'').replace(/-/g,'')+'.txt'; a.click();
  URL.revokeObjectURL(url);
}
