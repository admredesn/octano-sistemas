async function moduloLmc(){
var c=document.getElementById("conteudo");
c.innerHTML="<p style='color:#888;padding:20px'>Carregando LMC...</p>";
var session=await getSession();
var p=await sb.from("oct_perfis").select("empresa_id,oct_empresas(nome,cnpj,ie,uf)").eq("id",session.user.id).single();
var eId=p.data?.empresa_id;var emp=p.data?.oct_empresas;
if(!eId){c.innerHTML="<p style='color:#f44'>Configure sua empresa.</p>";return;}
var hoje=new Date().toISOString().split("T")[0];
var mIni=hoje.substring(0,7)+"-01";
var tR=await sb.from("oct_tanques").select("*").eq("empresa_id",eId).order("numero");
var lR=await sb.from("oct_lmc").select("*").eq("empresa_id",eId).order("data").order("criado_em");
var tanques=tR.data||[];var todos=lR.data||[];
window._lmcTodos=todos;window._lmcTanques=tanques;window._lmcEmpresaId=eId;window._lmcEmpresa=emp;
var COR={"GASOLINA COMUM":"#fbbf24","GASOLINA ADITIVADA":"#f97316","ETANOL":"#4caf50","DIESEL S10":"#60a5fa","DIESEL S500":"#3b82f6","GNV":"#a78bfa"};
var gc=function(x){return COR[(x||"").toUpperCase()]||"#888";};
var f=function(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:3});};
var cards="";
tanques.forEach(function(t){
var m=todos.filter(function(l){return l.tanque_id===t.id;});
var tE=m.reduce(function(s,l){return s+Number(l.entrada||0);},0);
var tS=m.reduce(function(s,l){return s+Number(l.saida||0);},0);
var pct=t.capacidade?Math.round(Number(t.estoque_atual)/Number(t.capacidade)*100):0;
var ct=gc(t.combustivel);
cards+="<div style='background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;cursor:pointer' onclick='filtrarTanqueLmc("+JSON.stringify(t.id)+")'>"+
"<div style='display:flex;justify-content:space-between;margin-bottom:8px'>"+
"<span style='font-weight:700;color:"+ct+"'>T"+t.numero+"</span>"+
"<span style='font-size:0.7rem;background:#1e2235;color:"+ct+";padding:2px 8px;border-radius:10px'>"+t.combustivel+"</span></div>"+
"<div style='background:#0f1117;border-radius:4px;height:6px;margin-bottom:6px'>"+
"<div style='height:100%;border-radius:4px;background:"+ct+";width:"+pct+"%'></div></div>"+
"<strong>"+f(t.estoque_atual)+" L</strong>"+
"<div style='font-size:0.72rem;color:#555'>"+pct+"% de "+f(t.capacidade)+" L</div>"+
"<div style='display:flex;justify-content:space-between;margin-top:6px;font-size:0.72rem'>"+
"<span style='color:#4caf50'>Ent:"+f(tE)+"L</span>"+
"<span style='color:#f44'>Sai:"+f(tS)+"L</span></div></div>";
});
var tO="<option value=''>Todos</option>";
tanques.forEach(function(t){tO+="<option value='"+t.id+"'>T"+t.numero+" - "+t.combustivel+"</option>";});
c.innerHTML="<div style='max-width:1200px'>"+
"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:20px'>"+
"<h2 style='color:#f97316'>LMC - Livro de Movimentacao</h2>"+
"<button onclick='abrirFormLmc()' class='btn-salvar'>+ Lanccar</button></div>"+
"<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px'>"+cards+"</div>"+
"<div id='form-lmc' style='display:none;margin-bottom:16px'></div>"+
"<div style='display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:12px'>"+
"<div><div class='nfe-label'>Tanque</div><select id='lmc-ft' onchange='renderLmc()' style='padding:7px 12px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0'>"+tO+"</select></div>"+
"<div><div class='nfe-label'>Data ini</div><input id='lmc-di' type='date' value='"+mIni+"' onchange='renderLmc()' style='padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0' /></div>"+
"<div><div class='nfe-label'>Data fim</div><input id='lmc-df' type='date' value='"+hoje+"' onchange='renderLmc()' style='padding:7px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0' /></div>"+
"<button onclick='exportarLmc()' style='padding:7px 14px;border-radius:5px;border:1px solid #2a5a2a;background:transparent;color:#4caf50;cursor:pointer'>Exportar TXT</button>"+
"</div><div id='tabela-lmc'></div></div>";
renderLmc();
}
function filtrarTanqueLmc(id){var el=document.getElementById("lmc-ft");if(el){el.value=id;renderLmc();}}
function renderLmc(){
var tId=document.getElementById("lmc-ft")?.value||"";
var di=document.getElementById("lmc-di")?.value||"";
var df=document.getElementById("lmc-df")?.value||"";
var lista=window._lmcTodos||[];
if(tId)lista=lista.filter(function(l){return l.tanque_id===tId;});
if(di)lista=lista.filter(function(l){return l.data>=di;});
if(df)lista=lista.filter(function(l){return l.data<=df;});
var div=document.getElementById("tabela-lmc");if(!div)return;
if(!lista.length){div.innerHTML="<div style='text-align:center;padding:40px;color:#555;border:2px dashed #2a2d3e;border-radius:8px'>Nenhum registro.</div>";return;}
var f=function(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:3});};
var fd=function(d){return d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"";};
var COR={"GASOLINA COMUM":"#fbbf24","GASOLINA ADITIVADA":"#f97316","ETANOL":"#4caf50","DIESEL S10":"#60a5fa","DIESEL S500":"#3b82f6","GNV":"#a78bfa"};
var gc=function(x){return COR[(x||"").toUpperCase()]||"#888";};
var tE=lista.reduce(function(s,l){return s+Number(l.entrada||0);},0);
var tS=lista.reduce(function(s,l){return s+Number(l.saida||0);},0);
var rows="";var sq=1;
lista.forEach(function(l){
var t=(window._lmcTanques||[]).find(function(x){return x.id===l.tanque_id;});
var en=Number(l.entrada||0);var sa=Number(l.saida||0);
var ct=gc(t?.combustivel);
rows+="<tr>"+
"<td style='color:#555;font-size:0.75rem;text-align:center'>"+(sq++)+"</td>"+
"<td><strong>"+fd(l.data)+"</strong></td>"+
"<td><span style='color:"+ct+";font-weight:600'>T"+(t?.numero||"?")+"</span> <span style='font-size:0.78rem;color:#888'>"+(t?.combustivel||"")+"</span></td>"+
"<td style='color:#4caf50;font-weight:600'>"+(en>0?"+ "+f(en)+" L":"--")+"</td>"+
"<td style='color:#f44;font-weight:600'>"+(sa>0?"- "+f(sa)+" L":"--")+"</td>"+
"<td style='font-weight:700'>"+f(l.saldo_final)+" L</td>"+
"<td style='font-size:0.75rem;color:#888'>"+(l.observacoes||"--")+"</td>"+
"<td><button onclick='excluirLmc("+JSON.stringify(l.id)+","+JSON.stringify(l.tanque_id)+","+en+","+sa+")' style='padding:2px 8px;border-radius:3px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer;font-size:0.7rem'>X</button></td></tr>";
});
div.innerHTML="<div style='overflow-x:auto'><table class='nfe-tabela' style='min-width:900px'>"+
"<thead><tr><th>Seq</th><th>Data</th><th>Tanque</th><th style='color:#4caf50'>Entrada</th><th style='color:#f44'>Saida</th><th>Saldo</th><th>Observacoes</th><th>Del</th></tr></thead>"+
"<tbody>"+rows+"</tbody>"+
"<tfoot><tr style='background:#1a1d2e'>"+
"<td colspan='3' style='padding:8px;color:#888'>"+lista.length+" registros</td>"+
"<td style='padding:8px;color:#4caf50;font-weight:700'>+"+f(tE)+" L</td>"+
"<td style='padding:8px;color:#f44;font-weight:700'>-"+f(tS)+" L</td>"+
"<td colspan='3' style='padding:8px;color:#888'>Liq: <strong style='color:#e0e0e0'>"+f(tE-tS)+" L</strong></td>"+
"</tr></tfoot></table></div>";
}
async function abrirFormLmc(){
var div=document.getElementById("form-lmc");div.style.display="block";div.scrollIntoView({behavior:"smooth"});
var tanques=window._lmcTanques||[];var hoje=new Date().toISOString().split("T")[0];
var tO="<option value=''>Selecione...</option>";
tanques.forEach(function(t){tO+="<option value='"+t.id+"'>T"+t.numero+" - "+t.combustivel+"</option>";});
div.innerHTML="<div style='background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px'>"+
"<div style='display:flex;justify-content:space-between;margin-bottom:16px'>"+
"<h3 style='color:#60a5fa'>+ Novo lancamento LMC</h3>"+
"<button onclick='document.getElementById("form-lmc").style.display="none"' style='background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem'>X</button></div>"+
"<div class='form-grid' style='max-width:700px'>"+
"<div class='form-group'><label>Data *</label><input id='lmc-data' type='date' value='"+hoje+"' /></div>"+
"<div class='form-group'><label>Tanque *</label><select id='lmc-tanque'>"+tO+"</select></div>"+
"<div class='form-group'><label>Tipo</label><select id='lmc-tipo'><option value='entrada'>Entrada</option><option value='saida'>Saida</option><option value='ajuste'>Ajuste</option></select></div>"+
"<div class='form-group'><label>Quantidade (L) *</label><input id='lmc-qtd' type='number' step='0.001' min='0' /></div>"+
"<div class='form-group span2'><label>Observacoes</label><input id='lmc-obs' type='text' /></div></div>"+
"<div class='form-acoes'><button onclick='salvarLmc()' class='btn-salvar'>Salvar</button>"+
"<button onclick='document.getElementById("form-lmc").style.display="none"' style='padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer'>Cancelar</button>"+
"<span id='lmc-msg' class='form-msg'></span></div></div>";
}
async function salvarLmc(){
var msg=document.getElementById("lmc-msg");
var tId=document.getElementById("lmc-tanque").value;
var dt=document.getElementById("lmc-data").value;
var tp=document.getElementById("lmc-tipo").value;
var qtd=parseFloat(document.getElementById("lmc-qtd").value)||0;
var obs=document.getElementById("lmc-obs").value.trim();
if(!tId||!dt||!qtd){msg.textContent="Tanque, data e quantidade obrigatorios.";msg.style.color="#f44";return;}
msg.textContent="Salvando...";msg.style.color="#aaa";
var res=await sb.from("oct_tanques").select("estoque_atual,capacidade").eq("id",tId).single();
var tk=res.data;var sA=Number(tk?.estoque_atual||0);
var en=0,sa=0,sF=sA;
if(tp==="entrada"){en=qtd;sF=Math.min(sA+qtd,Number(tk?.capacidade||99999));}
else if(tp==="saida"){sa=qtd;sF=Math.max(0,sA-qtd);}
else{sF=qtd;en=sA<qtd?qtd-sA:0;sa=sA>qtd?sA-qtd:0;}
var ins=await sb.from("oct_lmc").insert({empresa_id:window._lmcEmpresaId,tanque_id:tId,data:dt,entrada:en,saida:sa,saldo_anterior:sA,saldo_final:sF,observacoes:obs||tp});
if(ins.error){msg.textContent="Erro: "+ins.error.message;msg.style.color="#f44";return;}
await sb.from("oct_tanques").update({estoque_atual:sF}).eq("id",tId);
msg.textContent="Salvo!";msg.style.color="#4caf50";
setTimeout(function(){moduloLmc();},600);
}
async function excluirLmc(id,tId,en,sa){
if(!confirm("Excluir? O estoque sera revertido."))return;
var res=await sb.from("oct_tanques").select("estoque_atual").eq("id",tId).single();
if(res.data){await sb.from("oct_tanques").update({estoque_atual:Math.max(0,Number(res.data.estoque_atual)-en+sa)}).eq("id",tId);}
await sb.from("oct_lmc").delete().eq("id",id);
moduloLmc();
}
function exportarLmc(){
var lista=window._lmcTodos||[];var tanques=window._lmcTanques||[];
var f3=function(v){return Number(v||0).toFixed(3);};
var fd=function(d){return d?d.split("-").reverse().join("/"):"";};
var txt="LMC - LIVRO DE MOVIMENTACAO DE COMBUSTIVEIS\n";
lista.forEach(function(l){
var t=tanques.find(function(x){return x.id===l.tanque_id;});
txt+=(fd(l.data)||"").padEnd(12)+(t?.combustivel||"").padEnd(22)+f3(l.entrada).padStart(14)+f3(l.saida).padStart(14)+f3(l.saldo_final).padStart(14)+"  "+(l.observacoes||"")+"\n";
});
var blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
var url=URL.createObjectURL(blob);
var a=document.createElement("a");a.href=url;a.download="LMC.txt";a.click();
URL.revokeObjectURL(url);
}