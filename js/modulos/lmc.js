async function moduloLmc(){
var conteudo=document.getElementById("conteudo");
conteudo.innerHTML="<p style='color:#888;padding:20px'>Carregando LMC...</p>";
var session=await getSession();
var p=await sb.from("oct_perfis").select("empresa_id,oct_empresas(nome,cnpj,ie,uf)").eq("id",session.user.id).single();
var empresaId=p.data?.empresa_id;var empresa=p.data?.oct_empresas;
if(!empresaId){conteudo.innerHTML="<p style='color:#f44'>Configure sua empresa.</p>";return;}
var hoje=new Date().toISOString().split("T")[0];
var mesIni=hoje.substring(0,7)+"-01";
var tR=await sb.from("oct_tanques").select("*").eq("empresa_id",empresaId).order("numero");
var lR=await sb.from("oct_lmc").select("*").eq("empresa_id",empresaId).order("data").order("criado_em");
var tanques=tR.data||[];var lmcTodos=lR.data||[];
window._lmcTodos=lmcTodos;window._lmcTanques=tanques;
window._lmcEmpresaId=empresaId;window._lmcEmpresa=empresa;
var CORES={"GASOLINA COMUM":"#fbbf24","GASOLINA ADITIVADA":"#f97316","ETANOL":"#4caf50","DIESEL S10":"#60a5fa","DIESEL S500":"#3b82f6","GNV":"#a78bfa"};
var cor=function(c){return CORES[(c||"").toUpperCase()]||"#888";};
var f=function(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:3});};
var cards="";
tanques.forEach(function(t){
var movs=lmcTodos.filter(function(l){return l.tanque_id===t.id;});
var tE=movs.reduce(function(s,l){return s+Number(l.entrada||0);},0);
var tS=movs.reduce(function(s,l){return s+Number(l.saida||0);},0);
var perc=t.capacidade?Math.round(Number(t.estoque_atual)/Number(t.capacidade)*100):0;
var corT=cor(t.combustivel);
cards+="<div style='background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;cursor:pointer' onclick=\"filtrarTanqueLmc('"+t.id+"')\">"+
"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'>"+
"<span style='font-weight:700;color:"+corT+"'>T"+t.numero+"</span>"+
"<span style='font-size:0.7rem;padding:2px 8px;border-radius:10px;background:#1e2235;color:"+corT+"'>"+t.combustivel+"</span></div>"+
"<div style='background:#0f1117;border-radius:4px;height:6px;margin-bottom:8px'>"+
"<div style='height:100%;border-radius:4px;background:"+corT+";width:"+perc+"%'></div></div>"+
"<div style='font-size:0.85rem'><strong>"+f(t.estoque_atual)+" L</strong></div>"+
"<div style='font-size:0.72rem;color:#555;margin-top:2px'>"+perc+"% de "+f(t.capacidade)+" L</div>"+
"<div style='display:flex;justify-content:space-between;margin-top:8px;font-size:0.72rem'>"+
"<span style='color:#4caf50'>Ent: "+f(tE)+" L</span>"+
"<span style='color:#f44'>Sai: "+f(tS)+" L</span></div></div>";
});
var tOpts="<option value=''>Todos os tanques</option>";
tanques.forEach(function(t){tOpts+="<option value='"+t.id+"'>T"+t.numero+" - "+t.combustivel+"</option>";});
conteudo.innerHTML=
"<div style='max-width:1200px'>"+
"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px'>"+
"<div class='modulo-header' style='margin-bottom:0;border:none'><h2>LMC - Livro de Movimentacao de Combustiveis</h2></div>"+
"<button onclick='abrirFormLmc()' class='btn-salvar'>+ Lanccar movimentacao</button></div>"+
"<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px'>"+cards+"</div>"+
"<div id='form-lmc' style='display:none;margin-bottom:16px'></div>"+
"<div style='background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:12px'>"+
"<div style='display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end'>"+
"<div><div class='nfe-label' style='margin-bottom:4px'>Tanque</div>"+
"<select id='lmc-filtro-tanque' onchange='renderLmc()' style='padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0'>"+tOpts+"</select></div>"+
"<div><div class='nfe-label' style='margin-bottom:4px'>Data inicial</div>"+
"<input id='lmc-dt-ini' type='date' value='"+mesIni+"' onchange='renderLmc()' style='padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0' /></div>"+
"<div><div class='nfe-label' style='margin-bottom:4px'>Data final</div>"+
"<input id='lmc-dt-fim' type='date' value='"+hoje+"' onchange='renderLmc()' style='padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0' /></div>"+
"<div><div class='nfe-label' style='margin-bottom:4px'>Tipo</div>"+
"<select id='lmc-filtro-tipo' onchange='renderLmc()' style='padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0'>"+
"<option value=''>Todos</option><option value='entrada'>Entradas</option><option value='saida'>Saidas</option></select></div>"+
"<button onclick='exportarLmc()' style='padding:7px 14px;border-radius:5px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer'>Exportar TXT</button>"+
"</div></div><div id='tabela-lmc'></div></div>";
renderLmc();
}

function filtrarTanqueLmc(id){var el=document.getElementById("lmc-filtro-tanque");if(el){el.value=id;renderLmc();}}

function renderLmc(){
var tanqueId=document.getElementById("lmc-filtro-tanque")?.value||"";
var dtIni=document.getElementById("lmc-dt-ini")?.value||"";
var dtFim=document.getElementById("lmc-dt-fim")?.value||"";
var tipo=document.getElementById("lmc-filtro-tipo")?.value||"";
var lista=window._lmcTodos||[];
if(tanqueId)lista=lista.filter(function(l){return l.tanque_id===tanqueId;});
if(dtIni)lista=lista.filter(function(l){return l.data>=dtIni;});
if(dtFim)lista=lista.filter(function(l){return l.data<=dtFim;});
if(tipo==="entrada")lista=lista.filter(function(l){return Number(l.entrada||0)>0;});
if(tipo==="saida")lista=lista.filter(function(l){return Number(l.saida||0)>0;});
var div=document.getElementById("tabela-lmc");if(!div)return;
if(lista.length===0){div.innerHTML="<div style='text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:8px'>Nenhum registro encontrado.</div>";return;}
var f=function(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:3});};
var fdt=function(d){return d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"";};
var CORES={"GASOLINA COMUM":"#fbbf24","GASOLINA ADITIVADA":"#f97316","ETANOL":"#4caf50","DIESEL S10":"#60a5fa","DIESEL S500":"#3b82f6","GNV":"#a78bfa"};
var cor=function(c){return CORES[(c||"").toUpperCase()]||"#888";};
var tE=lista.reduce(function(s,l){return s+Number(l.entrada||0);},0);
var tS=lista.reduce(function(s,l){return s+Number(l.saida||0);},0);
var rows="";var seq=1;
lista.forEach(function(l){
var t=(window._lmcTanques||[]).find(function(x){return x.id===l.tanque_id;});
var corT=cor(t?.combustivel);
var ent=Number(l.entrada||0);var sai=Number(l.saida||0);
rows+="<tr>"+
"<td style='color:#555;font-size:0.75rem;text-align:center'>"+(seq++)+"</td>"+
"<td><strong>"+fdt(l.data)+"</strong></td>"+
"<td><span style='color:"+corT+";font-weight:600'>T"+(t?.numero||"?")+"</span> <span style='font-size:0.78rem;color:#888'>"+(t?.combustivel||"")+"</span></td>"+
"<td style='color:#4caf50;font-weight:600'>"+(ent>0?"+ "+f(ent)+" L":"--")+"</td>"+
"<td style='color:#f44;font-weight:600'>"+(sai>0?"- "+f(sai)+" L":"--")+"</td>"+
"<td style='font-weight:700'>"+f(l.saldo_final)+" L</td>"+
"<td style='font-size:0.75rem;color:#888'>"+(l.observacoes||"--")+"</td>"+
"<td><button onclick=\"excluirLmc('"+l.id+"','"+l.tanque_id+"',"+ent+","+sai+")\" style='padding:2px 8px;border-radius:3px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem'>X</button></td>"+
"</tr>";
});
div.innerHTML="<div style='overflow-x:auto'><table class='nfe-tabela' style='min-width:900px'>"+
"<thead><tr><th style='width:36px;text-align:center'>Seq</th><th>Data</th><th>Tanque</th>"+
"<th style='color:#4caf50'>Entrada</th><th style='color:#f44'>Saida</th>"+
"<th>Saldo Final</th><th>Observacoes</th><th>Del</th></tr></thead>"+
"<tbody>"+rows+"</tbody>"+
"<tfoot><tr style='background:#1a1d2e;border-top:2px solid #2a2d3e'>"+
"<td colspan='3' style='padding:10px 8px;color:#888'>"+lista.length+" registros</td>"+
"<td style='padding:10px 8px;color:#4caf50;font-weight:700'>+ "+f(tE)+" L</td>"+
"<td style='padding:10px 8px;color:#f44;font-weight:700'>- "+f(tS)+" L</td>"+
"<td colspan='3' style='padding:10px 8px;color:#888'>Liq: <strong style='color:#e0e0e0'>"+f(tE-tS)+" L</strong></td>"+
"</tr></tfoot></table></div>";
}

async function abrirFormLmc(){
var div=document.getElementById("form-lmc");div.style.display="block";div.scrollIntoView({behavior:"smooth"});
var tanques=window._lmcTanques||[];var hoje=new Date().toISOString().split("T")[0];
var tOpts="<option value=''>Selecione...</option>";
tanques.forEach(function(t){tOpts+="<option value='"+t.id+"'>T"+t.numero+" - "+t.combustivel+"</option>";});
div.innerHTML="<div style='background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px'>"+
"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:16px'>"+
"<h3 style='color:#60a5fa'>+ Novo lancamento LMC</h3>"+
"<button onclick=\"document.getElementById('form-lmc').style.display='none'\" style='background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem'>X</button></div>"+
"<div class='form-grid' style='max-width:700px'>"+
"<div class='form-group'><label>Data *</label><input id='lmc-data' type='date' value='"+hoje+"' /></div>"+
"<div class='form-group'><label>Tanque *</label><select id='lmc-tanque'>"+tOpts+"</select></div>"+
"<div class='form-group'><label>Tipo</label><select id='lmc-tipo'>"+
"<option value='entrada'>Entrada (recebimento)</option>"+
"<option value='saida'>Saida (venda/consumo)</option>"+
"<option value='ajuste'>Ajuste de inventario</option></select></div>"+
"<div class='form-group'><label>Quantidade (L) *</label><input id='lmc-qtd' type='number' step='0.001' min='0' placeholder='0.000' /></div>"+
"<div class='form-group span2'><label>Observacoes</label><input id='lmc-obs' type='text' placeholder='Ex: NF-e 12345...' /></div>"+
"</div><div class='form-acoes'>"+
"<button onclick='salvarLmc()' class='btn-salvar'>Salvar</button>"+
"<button onclick=\"document.getElementById('form-lmc').style.display='none'\" style='padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer'>Cancelar</button>"+
"<span id='lmc-msg' class='form-msg'></span></div></div>";
}

async function salvarLmc(){
var msg=document.getElementById("lmc-msg");
var tanqueId=document.getElementById("lmc-tanque").value;
var data=document.getElementById("lmc-data").value;
var tipo=document.getElementById("lmc-tipo").value;
var qtd=parseFloat(document.getElementById("lmc-qtd").value)||0;
var obs=document.getElementById("lmc-obs").value.trim();
if(!tanqueId||!data||!qtd){msg.textContent="Tanque, data e quantidade obrigatorios.";msg.style.color="#f44";return;}
msg.textContent="Salvando...";msg.style.color="#aaa";
var res=await sb.from("oct_tanques").select("estoque_atual,capacidade").eq("id",tanqueId).single();
var tanque=res.data;var sAnt=Number(tanque?.estoque_atual||0);
var entrada=0,saida=0,sF=sAnt;
if(tipo==="entrada"){entrada=qtd;sF=Math.min(sAnt+qtd,Number(tanque?.capacidade||99999));}
else if(tipo==="saida"){saida=qtd;sF=Math.max(0,sAnt-qtd);}
else{sF=qtd;entrada=sAnt<qtd?qtd-sAnt:0;saida=sAnt>qtd?sAnt-qtd:0;}
var err=await sb.from("oct_lmc").insert({empresa_id:window._lmcEmpresaId,tanque_id:tanqueId,data:data,entrada:entrada,saida:saida,saldo_anterior:sAnt,saldo_final:sF,observacoes:obs||(tipo==="entrada"?"Entrada manual":tipo==="saida"?"Saida manual":"Ajuste")});
if(err.error){msg.textContent="Erro: "+err.error.message;msg.style.color="#f44";return;}
await sb.from("oct_tanques").update({estoque_atual:sF}).eq("id",tanqueId);
msg.textContent="Salvo!";msg.style.color="#4caf50";
setTimeout(function(){moduloLmc();},600);
}

async function excluirLmc(id,tanqueId,entrada,saida){
if(!confirm("Excluir este registro? O estoque sera revertido."))return;
var res=await sb.from("oct_tanques").select("estoque_atual").eq("id",tanqueId).single();
if(res.data){await sb.from("oct_tanques").update({estoque_atual:Math.max(0,Number(res.data.estoque_atual)-entrada+saida)}).eq("id",tanqueId);}
await sb.from("oct_lmc").delete().eq("id",id);
moduloLmc();
}

function exportarLmc(){
var tanqueId=document.getElementById("lmc-filtro-tanque")?.value||"";
var dtIni=document.getElementById("lmc-dt-ini")?.value||"";
var dtFim=document.getElementById("lmc-dt-fim")?.value||"";
var lista=window._lmcTodos||[];
if(tanqueId)lista=lista.filter(function(l){return l.tanque_id===tanqueId;});
if(dtIni)lista=lista.filter(function(l){return l.data>=dtIni;});
if(dtFim)lista=lista.filter(function(l){return l.data<=dtFim;});
var tanques=window._lmcTanques||[];var empresa=window._lmcEmpresa||{};
var f3=function(v){return Number(v||0).toFixed(3);};
var fdt=function(d){return d?d.split("-").reverse().join("/"):"";};
var txt="LMC - LIVRO DE MOVIMENTACAO DE COMBUSTIVEIS\n";
txt+=(empresa.nome||"")+" | CNPJ: "+(empresa.cnpj||"")+"\n";
txt+="Periodo: "+(dtIni?fdt(dtIni):"inicio")+" a "+(dtFim?fdt(dtFim):"hoje")+"\n";
lista.forEach(function(l){
var t=tanques.find(function(x){return x.id===l.tanque_id;});
txt+=(fdt(l.data)||"").padEnd(12)+(t?.combustivel||"").padEnd(22)+f3(l.entrada).padStart(14)+f3(l.saida).padStart(14)+f3(l.saldo_final).padStart(14)+"  "+(l.observacoes||"")+"\n";
});
var blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
var url=URL.createObjectURL(blob);
var a=document.createElement("a");a.href=url;a.download="LMC.txt";a.click();
URL.revokeObjectURL(url);
}
