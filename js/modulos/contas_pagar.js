
async function moduloContasPagar(){
  const conteudo=document.getElementById('conteudo');
  conteudo.innerHTML='<p style="color:#888;padding:20px">Carregando...</p>';
  const session=await getSession();
  const{data:perfil}=await sb.from('oct_perfis').select('empresa_id').eq('id',session.user.id).single();
  const empresaId=perfil?.empresa_id;
  if(!empresaId){conteudo.innerHTML='<p style="color:#f44">Configure sua empresa.</p>';return;}
  window._empresaIdContas=empresaId;
  const hoje=new Date().toISOString().split('T')[0];
  const anoMes=hoje.substring(0,7);
  const dtIni=new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString().split('T')[0];
  const dtFim=new Date(Date.now()+60*864e5).toISOString().split('T')[0];
  const[cR,bR,pR]=await Promise.all([
    sb.from('oct_contas_pagar').select('*,oct_pessoas(nome),oct_nfe_entrada(numero,serie,emissao),oct_bancos(banco,descricao),oct_plano_contas(codigo,descricao,grupo)').eq('empresa_id',empresaId).order('vencimento'),
    sb.from('oct_bancos').select('*').eq('empresa_id',empresaId).eq('ativo',true).order('banco'),
    sb.from('oct_plano_contas').select('id,codigo,descricao,tipo,grupo,nivel').eq('empresa_id',empresaId).in('tipo',['custo','despesa']).eq('ativo',true).order('codigo'),
  ]);
  window._todasContas=cR.data||[];
  window._bancosContas=bR.data||[];
  window._planoContas=pR.data||[];
  const abertas=window._todasContas.filter(c=>c.status==='aberto');
  const vencidas=abertas.filter(c=>c.vencimento<hoje);
  const pagas=window._todasContas.filter(c=>c.status==='pago');
  const anoMesPagas=pagas.filter(c=>c.data_pagamento?.startsWith(anoMes));
  const tV=vencidas.reduce((s,c)=>s+Number(c.valor),0);
  const tA=abertas.reduce((s,c)=>s+Number(c.valor),0);
  const tPM=anoMesPagas.reduce((s,c)=>s+Number(c.valor_pago||c.valor),0);
  const f=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  conteudo.innerHTML=
    '<div class="og-janela">'+
      '<div class="og-titulo"><span>Contas a Pagar</span>'+
        '<button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button>'+
      '</div>'+
      '<div class="og-toolbar">'+
        '<button class="og-tb-btn" onclick="abrirFormConta(\'\',\''+empresaId+'\')"><div class="og-tb-ico">＋</div><div>Lançar</div></button>'+
        '<button class="og-tb-btn" onclick="renderTitulosPagar()"><div class="og-tb-ico">🔍</div><div>Filtrar</div></button>'+
        '<button class="og-tb-btn" onclick="limparFiltros()"><div class="og-tb-ico">✖</div><div>Limpar</div></button>'+
        '<div class="og-tb-sep"></div>'+
        '<button class="og-tb-btn" onclick="abrirGerenciarBancos(\''+empresaId+'\')"><div class="og-tb-ico">🏦</div><div>Bancos</div></button>'+
        '<button class="og-tb-btn" onclick="abrirGerenciarPlano(\''+empresaId+'\')"><div class="og-tb-ico">📊</div><div>Plano Contas</div></button>'+
      '</div>'+
      '<div style="padding:14px 16px">'+
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">'+
          '<div style="background:#3a1a1a;border:1px solid #5a2a2a;border-radius:8px;padding:12px;cursor:pointer" onclick="aplicarFiltroRapido(\'vencido\')"><div class="nfe-label">🔴 Vencidas</div><div style="font-size:1.2rem;font-weight:700;color:#f44;margin-top:4px">R$ '+f(tV)+'</div><div style="font-size:0.72rem;color:#888">'+vencidas.length+' título(s)</div></div>'+
          '<div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:12px;cursor:pointer" onclick="aplicarFiltroRapido(\'aberto\')"><div class="nfe-label">🟡 Em aberto</div><div style="font-size:1.2rem;font-weight:700;color:#fbbf24;margin-top:4px">R$ '+f(tA)+'</div><div style="font-size:0.72rem;color:#888">'+abertas.length+' título(s)</div></div>'+
          '<div style="background:#1a2a1a;border:1px solid #2a4a2a;border-radius:8px;padding:12px;cursor:pointer" onclick="aplicarFiltroRapido(\'pago\')"><div class="nfe-label">✅ Pago no mês</div><div style="font-size:1.2rem;font-weight:700;color:#4caf50;margin-top:4px">R$ '+f(tPM)+'</div><div style="font-size:0.72rem;color:#888">'+anoMesPagas.length+' título(s)</div></div>'+
          '<div style="background:#1a1d2e;border:1px solid #2a2d3e;border-radius:8px;padding:12px;cursor:pointer" onclick="aplicarFiltroRapido(\'todos\')"><div class="nfe-label">📋 Total geral</div><div style="font-size:1.2rem;font-weight:700;color:#e0e0e0;margin-top:4px">R$ '+f(tA+tPM)+'</div><div style="font-size:0.72rem;color:#888">'+window._todasContas.length+' título(s)</div></div>'+
        '</div>'+
        '<div id="form-conta" style="display:none;margin-bottom:12px"></div>'+
        '<div id="form-bancos" style="display:none;margin-bottom:12px"></div>'+
        '<div id="form-plano" style="display:none;margin-bottom:12px"></div>'+
        '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:12px">'+
          '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Situação</div>'+
              '<select id="filtro-sit" onchange="renderTitulosPagar()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">'+
                '<option value="todos">TODOS</option><option value="aberto">ABERTO</option><option value="vencido">VENCIDO</option><option value="pago">LIQUIDADO</option>'+
              '</select></div>'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Filtro por</div>'+
              '<select id="filtro-campo" onchange="renderTitulosPagar()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">'+
                '<option value="vencimento">DATA VENCIMENTO</option><option value="emissao">DATA EMISSÃO</option><option value="pagamento">DATA PAGAMENTO</option>'+
              '</select></div>'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Data inicial</div>'+
              '<input id="filtro-ini" type="date" value="'+dtIni+'" onchange="renderTitulosPagar()" style="padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" /></div>'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Data final</div>'+
              '<input id="filtro-fim" type="date" value="'+dtFim+'" onchange="renderTitulosPagar()" style="padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" /></div>'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Buscar</div>'+
              '<input id="filtro-busca" type="text" placeholder="Fornecedor ou documento..." oninput="renderTitulosPagar()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;width:220px" /></div>'+
            '<div><div class="nfe-label" style="margin-bottom:4px">Agrupar</div>'+
              '<select id="filtro-agrup" onchange="renderTitulosPagar()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0">'+
                '<option value="">Sem agrupamento</option><option value="fornecedor">Por fornecedor</option><option value="banco">Por banco</option><option value="mes">Por mês vencimento</option>'+
              '</select></div>'+
            '<button onclick="renderTitulosPagar()" style="padding:7px 16px;border-radius:5px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Filtrar</button>'+
            '<button onclick="limparFiltros()" style="padding:7px 12px;border-radius:5px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Limpar</button>'+
          '</div>'+
        '</div>'+
        '<div id="lista-titulos-pagar"></div>'+
      '</div>'+
    '</div>';
  renderTitulosPagar();
}

function aplicarFiltroRapido(s){const el=document.getElementById('filtro-sit');if(el){el.value=s;renderTitulosPagar();}}

function limparFiltros(){
  const dtIni=new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString().split('T')[0];
  const dtFim=new Date(Date.now()+60*864e5).toISOString().split('T')[0];
  ['filtro-sit','filtro-campo','filtro-agrup'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=el.id==='filtro-sit'?'todos':el.id==='filtro-campo'?'vencimento':'';});
  const i=document.getElementById('filtro-ini');if(i)i.value=dtIni;
  const f=document.getElementById('filtro-fim');if(f)f.value=dtFim;
  const b=document.getElementById('filtro-busca');if(b)b.value='';
  renderTitulosPagar();
}

function renderTitulosPagar(){
  const sit=document.getElementById('filtro-sit')?.value||'todos';
  const campo=document.getElementById('filtro-campo')?.value||'vencimento';
  const dtIni=document.getElementById('filtro-ini')?.value||'';
  const dtFim=document.getElementById('filtro-fim')?.value||'';
  const busca=(document.getElementById('filtro-busca')?.value||'').toLowerCase();
  const agrup=document.getElementById('filtro-agrup')?.value||'';
  const hoje=new Date().toISOString().split('T')[0];
  let lista=window._todasContas||[];
  if(sit==='aberto')lista=lista.filter(c=>c.status==='aberto'&&c.vencimento>=hoje);
  else if(sit==='vencido')lista=lista.filter(c=>c.status==='aberto'&&c.vencimento<hoje);
  else if(sit==='pago')lista=lista.filter(c=>c.status==='pago');
  if(dtIni||dtFim){
    lista=lista.filter(c=>{
      const dt=campo==='emissao'?(c.oct_nfe_entrada?.emissao||c.competencia||c.vencimento):campo==='pagamento'?(c.data_pagamento||''):c.vencimento;
      if(dtIni&&dt<dtIni)return false;
      if(dtFim&&dt>dtFim)return false;
      return true;
    });
  }
  if(busca)lista=lista.filter(c=>c.descricao?.toLowerCase().includes(busca)||c.oct_pessoas?.nome?.toLowerCase().includes(busca)||(c.n_documento||'').toLowerCase().includes(busca));
  const div=document.getElementById('lista-titulos-pagar');
  if(!div)return;
  if(lista.length===0){div.innerHTML='<div style="text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:8px">Nenhum título encontrado.</div>';return;}
  if(agrup){
    const grupos={};
    lista.forEach(c=>{
      const chave=agrup==='fornecedor'?(c.oct_pessoas?.nome||'Sem fornecedor'):agrup==='banco'?(c.oct_bancos?.banco||'Sem banco'):(c.vencimento?new Date(c.vencimento+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase():'Sem data');
      if(!grupos[chave])grupos[chave]=[];grupos[chave].push(c);
    });
    div.innerHTML=Object.entries(grupos).map(([nome,items])=>{
      const tot=items.reduce((s,c)=>s+Number(c.valor),0);
      return '<div style="margin-bottom:16px">'+
        '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:#1a1d2e;border-radius:6px 6px 0 0;border:1px solid #2a2d3e;border-bottom:none">'+
          '<strong style="color:#f97316;font-size:0.88rem">'+nome+'</strong>'+
          '<span style="color:#f97316;font-weight:600;font-size:0.88rem">R$ '+tot.toLocaleString('pt-BR',{minimumFractionDigits:2})+' ('+items.length+')</span>'+
        '</div>'+tabelaTitulos(items,hoje)+'</div>';
    }).join('');
  }else{
    div.innerHTML=tabelaTitulos(lista,hoje);
  }
}

function tabelaTitulos(lista,hoje){
  const f=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const total=lista.reduce((s,c)=>s+Number(c.valor),0);
  const totalAberto=lista.filter(c=>c.status==='aberto').reduce((s,c)=>s+Number(c.valor),0);
  const totalPago=lista.filter(c=>c.status==='pago').reduce((s,c)=>s+Number(c.valor_pago||c.valor),0);
  const fmtDt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'';
  let seq=1;
  const rows=lista.map(c=>{
    const vend=c.vencimento||'';
    const vencida=c.status==='aberto'&&vend<hoje;
    const prox7=c.status==='aberto'&&!vencida&&vend<=new Date(Date.now()+7*864e5).toISOString().split('T')[0];
    const pago=c.status==='pago';
    const emissao=c.oct_nfe_entrada?.emissao||c.competencia||'';
    let bg=pago?'background:#0a1a0a':vencida?'background:#1a0808':prox7?'background:#161200':'';
    const corSit=pago?'#4caf50':vencida?'#f44336':'#fbbf24';
    const corValor=pago?'#4caf50':vencida?'#f44':'#e0e0e0';
    const txtSit=pago?'LIQUIDADO':vencida?'VENCIDO':'ABERTO';
    const nfe=c.oct_nfe_entrada?'NF Nº: '+c.oct_nfe_entrada.numero+'/'+c.oct_nfe_entrada.serie:'';
    const r='<tr style="'+bg+'">'+
      '<td style="color:#555;font-size:0.75rem;text-align:center;padding:6px 8px">'+(seq++)+'</td>'+
      '<td style="font-family:monospace;font-size:0.78rem;padding:6px 8px">'+(c.n_documento||'—')+'</td>'+
      '<td style="font-size:0.82rem;font-weight:600;padding:6px 8px">'+(c.oct_pessoas?.nome||'—')+'</td>'+
      '<td style="font-size:0.78rem;padding:6px 8px">'+fmtDt(emissao)+'</td>'+
      '<td style="font-size:0.85rem;font-weight:700;padding:6px 8px;color:'+(vencida?'#f44':prox7?'#fbbf24':pago?'#4caf50':'#e0e0e0')+'">'+fmtDt(vend)+'</td>'+
      '<td style="font-size:0.78rem;padding:6px 8px;color:'+(pago?'#4caf50':'#555')+'">'+fmtDt(c.data_pagamento)+'</td>'+
      '<td style="font-weight:700;padding:6px 8px;color:'+corValor+'">R$ '+f(c.valor)+'</td>'+
      '<td style="padding:6px 8px"><span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;font-weight:700;background:'+(pago?'#1a3a1a':vencida?'#3a1a1a':'#2a1a00')+';color:'+corSit+'">'+txtSit+'</span></td>'+
      '<td style="font-size:0.75rem;color:#888;padding:6px 8px">'+nfe+'</td>'+
      '<td style="font-size:0.75rem;color:#555;padding:6px 8px">'+(c.oct_bancos?c.oct_bancos.banco:'')+'</td>'+
      '<td style="font-size:0.72rem;color:#555;padding:6px 8px">'+(c.oct_plano_contas?c.oct_plano_contas.codigo:'')+'</td>'+
      '<td style="padding:6px 8px">'+
        '<div style="display:flex;gap:3px">'+
          (c.status==='aberto'?'<button onclick="pagarConta(\''+c.id+'\')" title="Liquidar" style="padding:3px 8px;border-radius:3px;border:none;background:#4caf50;color:#fff;cursor:pointer;font-size:0.7rem;font-weight:700">✓</button>':'')+
          '<button onclick="abrirFormConta(\''+c.id+'\',\''+window._empresaIdContas+'\')" title="Editar" style="padding:3px 7px;border-radius:3px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.7rem">✏️</button>'+
          '<button onclick="excluirConta(\''+c.id+'\')" title="Excluir" style="padding:3px 7px;border-radius:3px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem">✕</button>'+
        '</div>'+
      '</td>'+
    '</tr>';
    return r;
  }).join('');
  return '<div style="overflow-x:auto">'+
    '<table class="nfe-tabela" style="min-width:1100px;border-collapse:collapse">'+
      '<thead><tr style="background:#1a1d2e">'+
        '<th style="width:36px;text-align:center">Seq</th>'+
        '<th>Doc</th><th>Fornecedor</th><th>Emissão</th>'+
        '<th>Vencimento</th><th>Data PG</th><th>R$ Valor</th>'+
        '<th>Situação</th><th>Detalhe</th><th>Banco</th>'+
        '<th>Plano</th><th>Ações</th>'+
      '</tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
      '<tfoot><tr style="background:#1a1d2e;border-top:2px solid #2a2d3e">'+
        '<td colspan="2" style="padding:10px 8px;font-size:0.82rem;color:#888">Qtd Títulos: <strong style="color:#e0e0e0">'+lista.length+'</strong></td>'+
        '<td colspan="3" style="padding:10px 8px;font-size:0.82rem;color:#888">Em aberto: <strong style="color:#fbbf24">R$ '+f(totalAberto)+'</strong></td>'+
        '<td style="padding:10px 8px;font-weight:700;color:#f97316;font-size:0.95rem">R$ '+f(total)+'</td>'+
        '<td colspan="5" style="padding:10px 8px;font-size:0.82rem;color:#888">Liquidados: <strong style="color:#4caf50">R$ '+f(totalPago)+'</strong></td>'+
      '</tr></tfoot>'+
    '</table>'+
  '</div>';
}

async function pagarConta(id){
  const conta=window._todasContas?.find(c=>c.id===id);
  const bancos=window._bancosContas||[];
  const hoje=new Date().toISOString().split('T')[0];
  const div=document.getElementById('form-conta');
  div.style.display='block';
  const f=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const bOpts=bancos.map(b=>'<option value="'+b.id+'">'+b.banco+(b.descricao?' - '+b.descricao:'')+'</option>').join('');
  div.innerHTML='<div style="background:#13151f;border:1px solid #4caf50;border-radius:10px;padding:20px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
      '<h3 style="color:#4caf50">✅ Liquidar título</h3>'+
      '<button onclick="document.getElementById(\'form-conta\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button>'+
    '</div>'+
    '<div style="padding:10px 14px;background:#0f1117;border-radius:6px;margin-bottom:14px;font-size:0.88rem">'+
      '<strong style="color:#e0e0e0">'+(conta?.descricao||'')+'</strong>'+
      (conta?.oct_pessoas?.nome?' <span style="color:#888">— '+conta.oct_pessoas.nome+'</span>':'')+
      ' <strong style="color:#f97316">R$ '+f(conta?.valor)+'</strong>'+
      (conta?.vencimento?' <span style="color:#888">| Venc: '+new Date(conta.vencimento+'T12:00:00').toLocaleDateString('pt-BR')+'</span>':'')+
    '</div>'+
    '<div class="form-grid" style="max-width:600px">'+
      '<div class="form-group"><label>Data pagamento</label><input id="pg-data" type="date" value="'+hoje+'" /></div>'+
      '<div class="form-group"><label>Valor pago</label><input id="pg-valor" type="number" step="0.01" value="'+(conta?.valor||0)+'" /></div>'+
      '<div class="form-group"><label>Forma</label>'+
        '<select id="pg-forma"><option>PIX</option><option>Boleto</option><option>TED/DOC</option><option>Cartao Credito</option><option>Dinheiro</option><option>Cheque</option></select>'+
      '</div>'+
      '<div class="form-group"><label>Banco compensacao</label>'+
        '<select id="pg-banco"><option value="">Selecione...</option>'+bOpts+'</select>'+
      '</div>'+
    '</div>'+
    '<div class="form-acoes">'+
      '<button onclick="confirmarPagamento(\''+id+'\')" class="btn-salvar" style="background:#4caf50">✅ Confirmar liquidação</button>'+
      '<button onclick="document.getElementById(\'form-conta\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>'+
      '<span id="pg-msg" class="form-msg"></span>'+
    '</div>'+
  '</div>';
  div.scrollIntoView({behavior:'smooth'});
}

async function confirmarPagamento(id){
  const msg=document.getElementById('pg-msg');msg.textContent='Salvando...';msg.style.color='#aaa';
  const{error}=await sb.from('oct_contas_pagar').update({status:'pago',data_pagamento:document.getElementById('pg-data').value,valor_pago:parseFloat(document.getElementById('pg-valor').value)||0,forma_pagamento:document.getElementById('pg-forma').value,banco_id:document.getElementById('pg-banco').value||null}).eq('id',id);
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='Liquidado!';msg.style.color='#4caf50';
  setTimeout(()=>moduloContasPagar(),600);
}

async function excluirConta(id){if(!confirm('Excluir este título?'))return;await sb.from('oct_contas_pagar').delete().eq('id',id);moduloContasPagar();}

async function abrirGerenciarBancos(eId){
  const div=document.getElementById('form-bancos');div.style.display=div.style.display==='none'?'block':'none';if(div.style.display==='none')return;
  div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';div.scrollIntoView({behavior:'smooth'});
  const{data:bancos}=await sb.from('oct_bancos').select('*').eq('empresa_id',eId).order('banco');
  const f=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const cards=!bancos||bancos.length===0?'<p style="color:#555;margin-bottom:16px">Nenhum banco cadastrado.</p>':
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:20px">'+
    bancos.map(b=>'<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div style="display:flex;justify-content:space-between"><div><strong>'+b.banco+'</strong>'+(b.descricao?'<div style="font-size:0.78rem;color:#888">'+b.descricao+'</div>':'')+(b.agencia?'<div style="font-size:0.75rem;color:#555">Ag:'+b.agencia+' Cc:'+(b.conta||'')+'</div>':'')+'<div style="font-size:0.72rem;color:#555">'+b.tipo+'</div></div><div style="text-align:right"><div style="color:#4caf50;font-weight:600">R$ '+f(b.saldo_atual)+'</div><button onclick="excluirBanco(\''+b.id+'\')" style="margin-top:6px;padding:3px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.72rem">Del</button></div></div></div>').join('')+
    '</div>';
  div.innerHTML='<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="color:#60a5fa">🏦 Bancos</h3><button onclick="document.getElementById(\'form-bancos\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button></div>'+cards+'<div class="modulo-header"><h2>+ Novo banco</h2></div><div class="form-grid" style="max-width:700px"><div class="form-group"><label>Banco *</label><input id="nb-banco" type="text" placeholder="Bradesco, Itau, Nubank..." /></div><div class="form-group"><label>Descricao</label><input id="nb-desc" type="text" /></div><div class="form-group"><label>Agencia</label><input id="nb-agencia" type="text" /></div><div class="form-group"><label>Conta</label><input id="nb-conta" type="text" /></div><div class="form-group"><label>Tipo</label><select id="nb-tipo"><option value="corrente">Conta Corrente</option><option value="poupanca">Poupanca</option><option value="investimento">Investimento</option><option value="caixa">Caixa</option><option value="pix">PIX</option></select></div><div class="form-group"><label>Saldo inicial</label><input id="nb-saldo" type="number" step="0.01" value="0" /></div></div><div class="form-acoes"><button onclick="salvarBanco(\''+eId+'\')" class="btn-salvar">Salvar</button><span id="nb-msg" class="form-msg"></span></div></div>';
}

async function salvarBanco(eId){
  const msg=document.getElementById('nb-msg');const banco=document.getElementById('nb-banco').value.trim();
  if(!banco){msg.textContent='Nome obrigatorio.';msg.style.color='#f44';return;}
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const saldo=parseFloat(document.getElementById('nb-saldo').value)||0;
  const{error}=await sb.from('oct_bancos').insert({empresa_id:eId,banco,descricao:document.getElementById('nb-desc').value.trim()||null,agencia:document.getElementById('nb-agencia').value.trim()||null,conta:document.getElementById('nb-conta').value.trim()||null,tipo:document.getElementById('nb-tipo').value,saldo_inicial:saldo,saldo_atual:saldo});
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='Salvo!';msg.style.color='#4caf50';setTimeout(()=>moduloContasPagar(),600);
}

async function excluirBanco(id){if(!confirm('Excluir banco?'))return;await sb.from('oct_bancos').update({ativo:false}).eq('id',id);moduloContasPagar();}

async function abrirGerenciarPlano(eId){
  const div=document.getElementById('form-plano');div.style.display=div.style.display==='none'?'block':'none';if(div.style.display==='none')return;
  div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';div.scrollIntoView({behavior:'smooth'});
  const{data:plano}=await sb.from('oct_plano_contas').select('*').eq('empresa_id',eId).eq('ativo',true).order('codigo');
  const grupos=[...new Set((plano||[]).map(p=>p.grupo).filter(Boolean))];
  const CORES={receita:'#4caf50',custo:'#f97316',despesa:'#60a5fa'};
  const itens=grupos.map(g=>{const items=(plano||[]).filter(p=>p.grupo===g);return '<div style="margin-bottom:12px"><div style="font-size:0.72rem;color:#f97316;font-weight:700;text-transform:uppercase;padding:4px 0;border-bottom:1px solid #2a2d3e;margin-bottom:4px">'+g+'</div>'+items.map(p=>'<div style="display:flex;justify-content:space-between;padding:4px 8px;border-radius:3px;margin-bottom:1px;background:'+(p.nivel===1?'#1a1d2e':p.nivel===2?'#13151f':'transparent')+'"><span style="padding-left:'+((p.nivel-1)*12)+'px;font-size:0.8rem;color:'+(p.nivel===1?'#f97316':p.nivel===2?'#e0e0e0':'#aaa')+'"><strong>'+p.codigo+'</strong> - '+p.descricao+'</span><span style="font-size:0.68rem;padding:1px 6px;border-radius:8px;background:#1e2235;color:'+(CORES[p.tipo]||'#888')+'">'+p.tipo+'</span></div>').join('')+'</div>';}).join('');
  const gOptList=grupos.map(g=>'<option value="'+g+'">').join('');
  div.innerHTML='<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="color:#60a5fa">📊 Plano de Contas</h3><button onclick="document.getElementById(\'form-plano\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button></div><div style="max-height:350px;overflow-y:auto;margin-bottom:16px">'+itens+'</div><div class="modulo-header"><h2>+ Nova conta</h2></div><div class="form-grid" style="max-width:700px"><div class="form-group"><label>Codigo *</label><input id="pc-codigo" type="text" /></div><div class="form-group"><label>Descricao *</label><input id="pc-desc" type="text" /></div><div class="form-group"><label>Tipo</label><select id="pc-tipo"><option value="receita">Receita</option><option value="custo">Custo</option><option value="despesa" selected>Despesa</option></select></div><div class="form-group"><label>Grupo</label><input id="pc-grupo" list="pcgl" /><datalist id="pcgl">'+gOptList+'</datalist></div><div class="form-group"><label>Subtipo</label><input id="pc-subtipo" type="text" /></div><div class="form-group"><label>Nivel</label><select id="pc-nivel"><option value="1">1 Grupo</option><option value="2">2 Subgrupo</option><option value="3" selected>3 Conta</option></select></div></div><div class="form-acoes"><button onclick="salvarPlanoConta(\''+eId+'\')" class="btn-salvar">Salvar</button><span id="pc-msg" class="form-msg"></span></div></div>';
}

async function salvarPlanoConta(eId){
  const msg=document.getElementById('pc-msg');const codigo=document.getElementById('pc-codigo').value.trim();const descricao=document.getElementById('pc-desc').value.trim();
  if(!codigo||!descricao){msg.textContent='Codigo e descricao obrigatorios.';msg.style.color='#f44';return;}
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const{error}=await sb.from('oct_plano_contas').insert({empresa_id:eId,codigo,descricao,tipo:document.getElementById('pc-tipo').value,grupo:document.getElementById('pc-grupo').value.trim()||null,subtipo:document.getElementById('pc-subtipo').value.trim()||null,nivel:parseInt(document.getElementById('pc-nivel').value)||3,dre:true,ativo:true});
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='Salvo!';msg.style.color='#4caf50';setTimeout(()=>moduloContasPagar(),600);
}

async function abrirFormConta(id,eId){
  const div=document.getElementById('form-conta');div.style.display='block';div.innerHTML='<p style="color:#888;padding:12px">Carregando...</p>';div.scrollIntoView({behavior:'smooth'});
  let c=null;if(id){const{data}=await sb.from('oct_contas_pagar').select('*').eq('id',id).single();c=data;}
  const[fR,bR,pR]=await Promise.all([sb.from('oct_pessoas').select('id,nome').eq('empresa_id',eId).eq('tipo','fornecedor').order('nome'),sb.from('oct_bancos').select('id,banco,descricao').eq('empresa_id',eId).eq('ativo',true).order('banco'),sb.from('oct_plano_contas').select('id,codigo,descricao').eq('empresa_id',eId).in('tipo',['custo','despesa']).eq('nivel',3).order('codigo')]);
  const fOpts=(fR.data||[]).map(f=>'<option value="'+f.id+'" '+(c?.fornecedor_id===f.id?'selected':'')+'>'+f.nome+'</option>').join('');
  const bOpts=(bR.data||[]).map(b=>'<option value="'+b.id+'" '+(c?.banco_id===b.id?'selected':'')+'>'+b.banco+(b.descricao?' - '+b.descricao:'')+'</option>').join('');
  const pOpts=(pR.data||[]).map(p=>'<option value="'+p.id+'" '+(c?.plano_conta_id===p.id?'selected':'')+'>'+p.codigo+' - '+p.descricao+'</option>').join('');
  div.innerHTML='<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="color:#60a5fa">'+(id?'Editar título':'+ Novo título')+'</h3><button onclick="document.getElementById(\'form-conta\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button></div><div class="form-grid"><div class="form-group span2"><label>Descricao *</label><input id="fc-desc" type="text" value="'+(c?.descricao||'')+'" /></div><div class="form-group"><label>Fornecedor</label><select id="fc-forn"><option value="">--</option>'+fOpts+'</select></div><div class="form-group"><label>N Documento</label><input id="fc-doc" type="text" value="'+(c?.n_documento||'')+'" /></div><div class="form-group"><label>Valor *</label><input id="fc-valor" type="number" step="0.01" value="'+(c?.valor||'')+'" /></div><div class="form-group"><label>Vencimento *</label><input id="fc-venc" type="date" value="'+(c?.vencimento||'')+'" /></div><div class="form-group"><label>Competencia</label><input id="fc-comp" type="date" value="'+(c?.competencia||'')+'" /></div><div class="form-group"><label>Banco</label><select id="fc-banco"><option value="">--</option>'+bOpts+'</select></div><div class="form-group span2"><label>Plano de contas</label><select id="fc-plano"><option value="">Sem categoria</option>'+pOpts+'</select></div><div class="form-group span2"><label>Observacoes</label><input id="fc-obs" type="text" value="'+(c?.observacoes||'')+'" /></div></div><div class="form-acoes"><button onclick="salvarConta(\''+(id||'')+'\',\''+eId+'\')" class="btn-salvar">Salvar</button><button onclick="document.getElementById(\'form-conta\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>'+(id?'<button onclick="excluirConta(\''+id+'\')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">Excluir</button>':'')+'<span id="fc-msg" class="form-msg"></span></div></div>';
}

async function salvarConta(id,eId){
  const msg=document.getElementById('fc-msg');const desc=document.getElementById('fc-desc').value.trim();const valor=parseFloat(document.getElementById('fc-valor').value);const venc=document.getElementById('fc-venc').value;
  if(!desc||!valor||!venc){msg.textContent='Descricao, valor e vencimento obrigatorios.';msg.style.color='#f44';return;}
  msg.textContent='Salvando...';msg.style.color='#aaa';
  const dados={empresa_id:eId,descricao:desc,valor,vencimento:venc,fornecedor_id:document.getElementById('fc-forn').value||null,n_documento:document.getElementById('fc-doc').value.trim()||null,competencia:document.getElementById('fc-comp').value||null,banco_id:document.getElementById('fc-banco').value||null,plano_conta_id:document.getElementById('fc-plano').value||null,observacoes:document.getElementById('fc-obs').value.trim()||null};
  let error;if(id){({error}=await sb.from('oct_contas_pagar').update(dados).eq('id',id));}else{({error}=await sb.from('oct_contas_pagar').insert(dados));}
  if(error){msg.textContent='Erro: '+error.message;msg.style.color='#f44';return;}
  msg.textContent='Salvo!';msg.style.color='#4caf50';setTimeout(()=>moduloContasPagar(),600);
}

async function lancarContasPagarNfe(nfeId,eId,fornId,num,serie,pags,dups,emissao){
  if(dups&&dups.length>0){for(const d of dups){if(!d.dVenc||!d.vDup)continue;await sb.from('oct_contas_pagar').insert({empresa_id:eId,descricao:'NF-e '+num+'/'+serie+' Dup '+(d.nDup||'001'),fornecedor_id:fornId||null,nfe_id:nfeId,valor:d.vDup,vencimento:d.dVenc,n_documento:num+'/'+(d.nDup||'1'),status:'aberto',competencia:emissao||null});}}
  else if(pags&&pags.length>0){for(const p of pags){if(p.indPag==='0')continue;const v=emissao||new Date().toISOString().split('T')[0];await sb.from('oct_contas_pagar').insert({empresa_id:eId,descricao:'NF-e '+num+'/'+serie,fornecedor_id:fornId||null,nfe_id:nfeId,valor:p.vPag,vencimento:v,n_documento:num,status:'aberto',competencia:emissao||null,observacoes:'Forma: '+(p.xPag||p.tPag)});}}
}
