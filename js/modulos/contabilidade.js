// ============================================================
// MODULO CONTABILIDADE — Plano de Contas + SPED Fiscal + PIS/COFINS
// ============================================================
// NOTA: a logica fiscal (CST, CFOP, monofasico, apuracao M/E) NAO foi
// alterada nesta revisao. Apenas correcoes tecnicas seguras:
//   1) Contadores do Bloco 9 (9900/9990/9999) gerados dinamicamente.
//   2) .toFixed(2) no valor de ICMS do C190 (SPED Fiscal).
//   3) COD_MUN do 0000 Fiscal: usa codigo IBGE se existir; nunca o nome.
// Validar sempre no PVA da Receita antes de transmitir.
// ============================================================
async function moduloContabilidade(subaba) {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(*)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  const empresa = perfil?.oct_empresas;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._contab_empresa_id = empresaId;
  window._contab_empresa = empresa;
  const aba = subaba || 'plano';
  conteudo.innerHTML = '<div style="max-width:1200px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
    + '<div class="modulo-header" style="margin-bottom:0;border:none"><h2>📚 Contabilidade</h2></div>'
    + '</div>'
    + '<div style="display:flex;gap:0;border-bottom:1px solid #2a2d3e;margin-bottom:20px">'
    + '<button onclick="moduloContabilidade(\'plano\')" id="ctab-plano" class="nfe-aba '+(aba==='plano'?'ativo':'')+'">📊 Plano de Contas</button>'
    + '<button onclick="moduloContabilidade(\'fiscal\')" id="ctab-fiscal" class="nfe-aba '+(aba==='fiscal'?'ativo':'')+'">📋 SPED Fiscal</button>'
    + '<button onclick="moduloContabilidade(\'pis_cofins\')" id="ctab-pis" class="nfe-aba '+(aba==='pis_cofins'?'ativo':'')+'">💰 SPED PIS/COFINS</button>'
    + '</div>'
    + '<div id="contab-conteudo"></div>'
    + '</div>';
  if (aba === 'plano') await renderPlanoContas(empresaId);
  else if (aba === 'fiscal') await renderSpedFiscal(empresaId, empresa);
  else if (aba === 'pis_cofins') await renderSpedPisCofins(empresaId, empresa);
}
async function renderPlanoContas(empresaId) {
  const div = document.getElementById('contab-conteudo');
  const { data: plano } = await sb.from('oct_plano_contas').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('codigo');
  const grupos = [...new Set((plano||[]).map(p => p.grupo).filter(Boolean))];
  const CORES = { receita: '#4caf50', custo: '#f97316', despesa: '#60a5fa' };
  const total = (tipo) => (plano||[]).filter(p => p.tipo === tipo && p.nivel === 3).length;
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<div style="display:flex;gap:12px">'
    + '<div style="background:#1a3a1a;border:1px solid #2a5a2a;border-radius:8px;padding:10px 16px;font-size:0.82rem"><span class="nfe-label">Receitas</span><br><strong style="color:#4caf50">'+total('receita')+' contas</strong></div>'
    + '<div style="background:#2a1a0a;border:1px solid #4a3a1a;border-radius:8px;padding:10px 16px;font-size:0.82rem"><span class="nfe-label">Custos</span><br><strong style="color:#f97316">'+total('custo')+' contas</strong></div>'
    + '<div style="background:#1a2a3a;border:1px solid #2a4a6a;border-radius:8px;padding:10px 16px;font-size:0.82rem"><span class="nfe-label">Despesas</span><br><strong style="color:#60a5fa">'+total('despesa')+' contas</strong></div>'
    + '</div>'
    + '<button onclick="abrirFormPlanoContab(\'\',\'' + empresaId + '\')" class="btn-salvar">+ Nova conta</button>'
    + '</div>'
    + '<div id="form-plano-contab" style="display:none;margin-bottom:16px"></div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px">'
    + grupos.map(g => {
        const itens = (plano||[]).filter(p => p.grupo === g);
        const tipo = itens[0]?.tipo || 'despesa';
        const cor = CORES[tipo] || '#888';
        return '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">'
          + '<div style="padding:10px 14px;background:#1a1d2e;border-bottom:1px solid #2a2d3e;display:flex;justify-content:space-between;align-items:center">'
          + '<strong style="color:'+cor+';font-size:0.82rem;text-transform:uppercase;letter-spacing:1px">'+g+'</strong>'
          + '<span style="font-size:0.72rem;padding:2px 8px;border-radius:8px;background:#1e2235;color:'+cor+'">'+tipo+'</span>'
          + '</div>'
          + '<div style="padding:8px">'
          + itens.map(p => '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:4px;margin-bottom:2px;background:'+(p.nivel===1?'#1a1d2e':p.nivel===2?'#0f1117':'transparent')+';cursor:pointer" onclick="abrirFormPlanoContab(\''+p.id+'\',\''+empresaId+'\')">'
            + '<span style="padding-left:'+((p.nivel-1)*14)+'px;font-size:0.82rem;color:'+(p.nivel===1?cor:p.nivel===2?'#e0e0e0':'#aaa')+'">'
            + (p.nivel===1?'<strong>':p.nivel===2?'':'<span style="color:#555">• </span>')
            + p.codigo + ' — ' + p.descricao
            + (p.nivel===1?'</strong>':'')
            + '</span>'
            + '<span style="font-size:0.68rem;color:#555">✏️</span>'
          + '</div>').join('')
          + '</div></div>';
      }).join('')
    + '</div>';
}
async function abrirFormPlanoContab(id, eId) {
  const div = document.getElementById('form-plano-contab');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:12px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });
  let p = null;
  if (id) { const { data } = await sb.from('oct_plano_contas').select('*').eq('id', id).single(); p = data; }
  const { data: plano } = await sb.from('oct_plano_contas').select('id,codigo,descricao,grupo').eq('empresa_id', eId).eq('ativo', true).order('codigo');
  const grupos = [...new Set((plano||[]).map(x => x.grupo).filter(Boolean))];
  div.innerHTML = '<div style="background:#13151f;border:1px solid #2a4a6a;border-radius:10px;padding:20px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<h3 style="color:#60a5fa">' + (id ? 'Editar conta' : '+ Nova conta') + '</h3>'
    + '<button onclick="document.getElementById(\'form-plano-contab\').style.display=\'none\'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.2rem">X</button>'
    + '</div>'
    + '<div class="form-grid">'
    + '<div class="form-group"><label>Codigo *</label><input id="fpc-cod" type="text" value="'+(p?.codigo||'')+'" /></div>'
    + '<div class="form-group"><label>Descricao *</label><input id="fpc-desc" type="text" value="'+(p?.descricao||'')+'" /></div>'
    + '<div class="form-group"><label>Tipo</label><select id="fpc-tipo"><option value="receita" '+(p?.tipo==='receita'?'selected':'')+'>Receita</option><option value="custo" '+(p?.tipo==='custo'?'selected':'')+'>Custo</option><option value="despesa" '+(p?.tipo==='despesa'||!p?.tipo?'selected':'')+'>Despesa</option></select></div>'
    + '<div class="form-group"><label>Nivel</label><select id="fpc-nivel"><option value="1" '+(p?.nivel===1?'selected':'')+'>1 Grupo</option><option value="2" '+(p?.nivel===2?'selected':'')+'>2 Subgrupo</option><option value="3" '+(p?.nivel===3||!p?.nivel?'selected':'')+'>3 Conta</option></select></div>'
    + '<div class="form-group"><label>Grupo</label><input id="fpc-grupo" list="fpc-grupos" value="'+(p?.grupo||'')+'" /><datalist id="fpc-grupos">'+grupos.map(g=>'<option value="'+g+'">').join('')+'</datalist></div>'
    + '<div class="form-group"><label>Subtipo</label><input id="fpc-subtipo" type="text" value="'+(p?.subtipo||'')+'" /></div>'
    + '</div>'
    + '<div class="form-acoes">'
    + '<button onclick="salvarPlanoContab(\''+id+'\',\''+eId+'\')" class="btn-salvar">Salvar</button>'
    + '<button onclick="document.getElementById(\'form-plano-contab\').style.display=\'none\'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>'
    + (id ? '<button onclick="excluirPlanoContab(\''+id+'\',\''+eId+'\')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">Excluir</button>' : '')
    + '<span id="fpc-msg" class="form-msg"></span>'
    + '</div></div>';
}
async function salvarPlanoContab(id, eId) {
  const msg = document.getElementById('fpc-msg');
  const codigo = document.getElementById('fpc-cod').value.trim();
  const descricao = document.getElementById('fpc-desc').value.trim();
  if (!codigo || !descricao) { msg.textContent = 'Codigo e descricao obrigatorios.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';
  const dados = { empresa_id: eId, codigo, descricao, tipo: document.getElementById('fpc-tipo').value, nivel: parseInt(document.getElementById('fpc-nivel').value) || 3, grupo: document.getElementById('fpc-grupo').value.trim() || null, subtipo: document.getElementById('fpc-subtipo').value.trim() || null, dre: true, ativo: true };
  let error;
  if (id) { ({ error } = await sb.from('oct_plano_contas').update(dados).eq('id', id)); }
  else { ({ error } = await sb.from('oct_plano_contas').insert(dados)); }
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloContabilidade('plano'), 800);
}
async function excluirPlanoContab(id, eId) {
  if (!confirm('Excluir esta conta?')) return;
  await sb.from('oct_plano_contas').update({ ativo: false }).eq('id', id);
  moduloContabilidade('plano');
}

// ============================================================
// UTILITARIO: monta o Bloco 9 (9900/9990/9999) contando os registros
// efetivamente gerados. Substitui os contadores fixos.
//   linhas:  array {n,txt} ja gerado dos blocos 0..H (incluindo 9001)
//   L:       o mesmo helper usado para empilhar linhas
// A contagem do proprio 9900 ja considera a auto-referencia
// (9900|9900, 9900|9990, 9900|9999), conforme regra do SPED.
// ============================================================
function montarBloco9(linhas, L) {
  // 1) conta o que ja existe (todos os registros antes do bloco 9, + 9001)
  const contagem = {};
  linhas.forEach(l => {
    const reg = l.txt.split('|')[1];
    if (reg) contagem[reg] = (contagem[reg] || 0) + 1;
  });
  const tiposExistentes = Object.keys(contagem).sort();
  // 2) numero de linhas 9900 = um por tipo existente + 3 (9900,9990,9999)
  const qtd9900 = tiposExistentes.length + 3;
  // 3) emite uma linha 9900 para cada tipo ja existente
  tiposExistentes.forEach(reg => L('|9900|' + reg + '|' + contagem[reg] + '|'));
  // 4) emite as auto-referencias do proprio bloco 9
  L('|9900|9900|' + qtd9900 + '|');
  L('|9900|9990|1|');
  L('|9900|9999|1|');
}

async function renderSpedFiscal(empresaId, empresa) {
  const div = document.getElementById('contab-conteudo');
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  div.innerHTML = '<div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">'
    + '<div>'
    + '<h3 style="color:#f97316;margin-bottom:4px">📋 SPED Fiscal — EFD ICMS/IPI</h3>'
    + '<p style="color:#888;font-size:0.82rem">Lucro Real | Escrituracao Fiscal Digital</p>'
    + '</div>'
    + '<div style="display:flex;gap:10px;align-items:center">'
    + '<select id="sped-ano" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + [anoAtual, anoAtual-1, anoAtual-2].map(a => '<option value="'+a+'" '+(a===anoAtual?'selected':'')+'>'+a+'</option>').join('')
    + '</select>'
    + '<select id="sped-mes" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) => '<option value="'+(i+1)+'" '+(i+1===mesAtual?'selected':'')+'>'+m+'</option>').join('')
    + '</select>'
    + '<button onclick="gerarSpedFiscal()" class="btn-salvar">Gerar SPED</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco 0</div><div style="color:#60a5fa;font-weight:600;margin-top:4px">Abertura + Cadastros</div><div style="font-size:0.75rem;color:#555;margin-top:2px">0000, 0001, 0100, 0150, 0190, 0200, 0400, 0990</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco C</div><div style="color:#4caf50;font-weight:600;margin-top:4px">Documentos Fiscais I</div><div style="font-size:0.75rem;color:#555;margin-top:2px">NF-e entrada/saida, NFC-e</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco E</div><div style="color:#fbbf24;font-weight:600;margin-top:4px">Apuracao ICMS</div><div style="font-size:0.75rem;color:#555;margin-top:2px">E110, E111, E116, E990</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco H</div><div style="color:#a78bfa;font-weight:600;margin-top:4px">Inventario</div><div style="font-size:0.75rem;color:#555;margin-top:2px">Estoque de combustiveis</div></div>'
    + '</div>'
    + '<div id="sped-fiscal-preview" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:16px;min-height:200px">'
    + '<p style="color:#555;text-align:center;padding:40px">Selecione o periodo e clique em Gerar SPED para visualizar.</p>'
    + '</div>'
    + '</div>';
}
async function gerarSpedFiscal() {
  const ano = parseInt(document.getElementById('sped-ano').value);
  const mes = parseInt(document.getElementById('sped-mes').value);
  const empresaId = window._contab_empresa_id;
  const empresa = window._contab_empresa;
  const div = document.getElementById('sped-fiscal-preview');
  div.innerHTML = '<p style="color:#888">Gerando...</p>';
  const dtIni = ano+'-'+String(mes).padStart(2,'0')+'-01';
  const dtFim = new Date(ano, mes, 0).toISOString().split('T')[0];
  const dtIniF = dtIni.replace(/-/g,'').substring(0,8); // DDMMAAAA
  const dtFimF = dtFim.replace(/-/g,'').substring(0,8);
  const dtIniFmt = dtIni.split('-').reverse().join('');
  const dtFimFmt = dtFim.split('-').reverse().join('');
  const [nfesRes, prodRes, partRes] = await Promise.all([
    sb.from('oct_nfe_entrada').select('*, oct_pessoas(nome,documento), oct_nfe_entrada_itens(*)').eq('empresa_id', empresaId).gte('emissao', dtIni).lte('emissao', dtFim),
    sb.from('oct_produtos').select('id,codigo,descricao,ncm,unidade').eq('empresa_id', empresaId).eq('ativo', true),
    sb.from('oct_pessoas').select('id,nome,documento,cidade,uf').eq('empresa_id', empresaId),
  ]);
  const nfes = nfesRes.data || [];
  const prods = prodRes.data || [];
  const partic = partRes.data || [];
  const cnpj = (empresa?.cnpj || '').replace(/\D/g,'');
  const ie = empresa?.ie || '0';
  const nome = empresa?.nome || empresa?.nome_fantasia || 'EMPRESA';
  const uf = empresa?.uf || 'MG';
  // COD_MUN: o layout do SPED espera o codigo IBGE do municipio (7 digitos),
  // NAO o nome. Usa o campo de codigo se existir; senao deixa vazio.
  // (Enviar o nome onde se espera codigo numerico e rejeitado pelo PVA.)
  const codMun = empresa?.cod_municipio || empresa?.codigo_ibge || empresa?.cod_mun || '';
  const linhas = [];
  let nLinha = 1;
  const L = (txt) => { linhas.push({ n: nLinha++, txt }); };
  // BLOCO 0
  L('|0000|010|0|'+dtIniFmt+'|'+dtFimFmt+'|'+nome+'|'+cnpj+'||'+ie+'||'+uf+'|'+codMun+'|0|0|2|');
  L('|0001|0|');
  L('|0100|'+nome+'|'+cnpj+'|||'+ie+'||||||||');
  L('|0150|001|'+nome+'|'+cnpj+'||'+ie+'||||');
  L('|0190|LT|Litros|');
  L('|0190|UN|Unidade|');
  L('|0190|CX|Caixa|');
  // 0200 - produtos
  prods.forEach(p => {
    L('|0200|'+p.codigo+'|'+p.descricao+'||'+(p.ncm||'')+'|||'+(p.unidade||'UN')+'||||');
  });
  L('|0990|'+nLinha+'|');
  // BLOCO C
  const c0 = nLinha;
  L('|C001|0|');
  nfes.forEach((nfe, idx) => {
    const forn = nfe.oct_pessoas;
    const cnpjForn = (forn?.documento || '').replace(/\D/g,'');
    const emissao = (nfe.emissao || '').split('-').reverse().join('');
    const chave = nfe.chave_nfe || '';
    L('|C100|0|1|'+cnpjForn+'|55|'+nfe.serie+'|'+nfe.numero+'|'+chave+'|'+emissao+'|'+emissao+'|1|3|'+Number(nfe.valor_total||0).toFixed(2)+'|0|0|0|0|'+(nfe.valor_desconto||0).toFixed(2)+'|'+Number(nfe.valor_total||0).toFixed(2)+'|');
    (nfe.oct_nfe_entrada_itens || []).forEach(it => {
      L('|C170|'+(it.n_item||'1')+'|'+it.codigo+'|'+it.descricao+'|'+Number(it.quantidade||0).toFixed(3)+'|'+(it.unidade||'UN')+'|'+Number(it.valor_unitario||0).toFixed(4)+'|'+Number(it.valor_total||0).toFixed(2)+'|0|'+(it.cfop||'2652')+'|'+(it.ncm||'')+'|||'+Number(it.aliq_icms||0).toFixed(2)+'|'+Number(it.valor_total*Number(it.aliq_icms||0)/100).toFixed(2)+'|0|0|0|0|0|0|0|0|0|0|0|0|0|');
    });
    L('|C190|'+nfe.cfop+'|'+Number(nfe.valor_icms||0).toFixed(2)+'|'+Number(nfe.valor_total||0).toFixed(2)+'|0|0|0|');
  });
  L('|C990|'+(nLinha - c0)+'|');
  // BLOCO E - Apuracao ICMS
  const e0 = nLinha;
  L('|E001|0|');
  L('|E100|'+dtIniFmt+'|'+dtFimFmt+'|');
  const totalICMS = nfes.reduce((s,n) => s + Number(n.valor_icms||0), 0);
  L('|E110|'+totalICMS.toFixed(2)+'|0|0|0|0|0|0|0|0|'+totalICMS.toFixed(2)+'|0|0|0|0|');
  L('|E116|2|'+totalICMS.toFixed(2)+'|'+dtFimFmt+'|0||||||');
  L('|E990|'+(nLinha - e0)+'|');
  // BLOCO H - Inventario
  const h0 = nLinha;
  L('|H001|0|');
  L('|H005|'+dtFimFmt+'|0|01|');
  let hItem = 1;
  prods.forEach(p => {
    L('|H010|'+p.codigo+'|'+(p.unidade||'UN')+'|0|0|0||');
    hItem++;
  });
  L('|H990|'+(nLinha - h0)+'|');
  // BLOCO 9 - Encerramento (contadores dinamicos)
  const t9 = nLinha;
  L('|9001|0|');
  montarBloco9(linhas, L);            // gera todos os 9900 a partir da contagem real
  // 9990 = total de registros do bloco 9, incluindo o proprio 9990 e o 9999 (+2)
  L('|9990|'+(nLinha - t9 + 2)+'|');
  L('|9999|'+nLinha+'|');
  const txtCompleto = linhas.map(l => l.txt).join('\n');
  window._spedFiscalTxt = txtCompleto;
  window._spedFiscalNome = 'SPED_FISCAL_'+ano+'_'+String(mes).padStart(2,'0')+'.txt';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div>'
    + '<strong style="color:#4caf50">SPED Fiscal gerado — '+linhas.length+' registros</strong>'
    + '<div style="font-size:0.78rem;color:#888;margin-top:2px">Periodo: '+dtIniFmt+' a '+dtFimFmt+' | NF-es: '+nfes.length+'</div>'
    + '</div>'
    + '<button onclick="downloadSped(\'fiscal\')" class="btn-salvar">Baixar TXT</button>'
    + '</div>'
    + '<div style="background:#0a0c12;border-radius:6px;padding:12px;font-family:monospace;font-size:0.72rem;color:#4caf50;max-height:400px;overflow-y:auto;line-height:1.6">'
    + linhas.slice(0,80).map(l => '<div style="border-bottom:1px solid #0f1117;padding:2px 0"><span style="color:#555;margin-right:8px;min-width:40px;display:inline-block">'+l.n+'</span>'+escHtml(l.txt)+'</div>').join('')
    + (linhas.length > 80 ? '<div style="color:#555;padding:8px 0">... mais '+(linhas.length-80)+' registros (baixe o TXT para ver completo)</div>' : '')
    + '</div>';
}
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function downloadSped(tipo) {
  const txt = tipo === 'fiscal' ? window._spedFiscalTxt : window._spedPisTxt;
  const nome = tipo === 'fiscal' ? window._spedFiscalNome : window._spedPisNome;
  if (!txt) return;
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
async function renderSpedPisCofins(empresaId, empresa) {
  const div = document.getElementById('contab-conteudo');
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  div.innerHTML = '<div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">'
    + '<div><h3 style="color:#f97316;margin-bottom:4px">PIS/COFINS — EFD Contribuicoes</h3><p style="color:#888;font-size:0.82rem">Lucro Real | Regime Nao Cumulativo</p></div>'
    + '<div style="display:flex;gap:10px;align-items:center">'
    + '<select id="spis-ano" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + [anoAtual, anoAtual-1, anoAtual-2].map(a => '<option value="'+a+'" '+(a===anoAtual?'selected':'')+'>'+a+'</option>').join('')
    + '</select>'
    + '<select id="spis-mes" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) => '<option value="'+(i+1)+'" '+(i+1===mesAtual?'selected':'')+'>'+m+'</option>').join('')
    + '</select>'
    + '<button onclick="gerarSpedPisCofinsV2()" class="btn-salvar">Gerar SPED</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco 0</div><div style="color:#60a5fa;font-weight:600;margin-top:4px">Abertura + Cadastros</div><div style="font-size:0.75rem;color:#555">0000, 0100, 0110, 0140, 0150, 0190, 0200</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco C</div><div style="color:#4caf50;font-weight:600;margin-top:4px">Operacoes do Periodo</div><div style="font-size:0.75rem;color:#555">NF-e entradas e saidas</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco M</div><div style="color:#fbbf24;font-weight:600;margin-top:4px">Apuracao PIS/COFINS</div><div style="font-size:0.75rem;color:#555">M200, M210, M600, M610</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco P</div><div style="color:#a78bfa;font-weight:600;margin-top:4px">Combustiveis (CIDE)</div><div style="font-size:0.75rem;color:#555">P001, P010, P100, P110</div></div>'
    + '</div>'
    + '<div id="sped-pis-preview" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:16px;min-height:200px">'
    + '<p style="color:#555;text-align:center;padding:40px">Selecione o periodo e clique em Gerar SPED.</p>'
    + '</div></div>';
}
async function gerarSpedPisCofins() {
  const ano = parseInt(document.getElementById('spis-ano').value);
  const mes = parseInt(document.getElementById('spis-mes').value);
  const empresaId = window._contab_empresa_id;
  const empresa = window._contab_empresa;
  const div = document.getElementById('sped-pis-preview');
  div.innerHTML = '<p style="color:#888">Gerando...</p>';
  const dtIni = ano+'-'+String(mes).padStart(2,'0')+'-01';
  const dtFim = new Date(ano, mes, 0).toISOString().split('T')[0];
  const dtIniFmt = dtIni.split('-').reverse().join('');
  const dtFimFmt = dtFim.split('-').reverse().join('');
  const [nfesRes, prodRes] = await Promise.all([
    sb.from('oct_nfe_entrada').select('*, oct_pessoas(nome,documento), oct_nfe_entrada_itens(*)').eq('empresa_id', empresaId).gte('emissao', dtIni).lte('emissao', dtFim),
    sb.from('oct_produtos').select('id,codigo,descricao,ncm,unidade').eq('empresa_id', empresaId).eq('ativo', true),
  ]);
  const nfes = nfesRes.data || [];
  const prods = prodRes.data || [];
  const cnpj = (empresa?.cnpj || '').replace(/\D/g,'');
  const nome = empresa?.nome || empresa?.nome_fantasia || 'EMPRESA';
  const uf = empresa?.uf || 'MG';
  const linhas = [];
  let nL = 1;
  const L = t => { linhas.push({ n: nL++, txt: t }); };
  // BLOCO 0
  L('|0000|002|'+dtIniFmt+'|'+dtFimFmt+'|'+nome+'|'+cnpj+'||||0||'+uf+'|1|1|1|');
  L('|0001|0|');
  L('|0100|'+nome+'|'+cnpj+'||||||||||1|');
  L('|0110|3|2|');
  L('|0140|001|'+nome+'|'+cnpj+'||'+uf+'|||');
  prods.forEach(p => {
    L('|0200|'+p.codigo+'|'+p.descricao+'||'+(p.ncm||'')+'||'+(p.unidade||'UN')+'|2|');
  });
  L('|0990|'+nL+'|');
  // BLOCO C
  const c0 = nL;
  L('|C001|0|');
  let totalPis = 0; let totalCofins = 0;
  let totalPisEnt = 0; let totalCofinsEnt = 0;
  nfes.forEach(nfe => {
    const forn = nfe.oct_pessoas;
    const cnpjForn = (forn?.documento || '').replace(/\D/g,'');
    const emissao = (nfe.emissao || '').split('-').reverse().join('');
    const chave = nfe.chave_nfe || '';
    const vPis = Number(nfe.valor_pis || 0);
    const vCofins = Number(nfe.valor_cofins || 0);
    totalPisEnt += vPis; totalCofinsEnt += vCofins;
    L('|C100|0|1|'+cnpjForn+'|55|'+nfe.serie+'|'+nfe.numero+'|'+chave+'|'+emissao+'|'+emissao+'|1|3|'+Number(nfe.valor_total||0).toFixed(2)+'|');
    L('|C180|'+nfe.cfop+'|'+Number(nfe.valor_total||0).toFixed(2)+'|0|0|0|0|');
    L('|C181|'+nfe.cfop+'|0|01|'+Number(nfe.valor_total||0).toFixed(2)+'|0|'+vPis.toFixed(2)+'|0|65|'+Number(nfe.valor_total||0).toFixed(2)+'|0|'+vCofins.toFixed(2)+'|');
  });
  L('|C990|'+(nL - c0)+'|');
  // BLOCO M - Apuracao
  const m0 = nL;
  L('|M001|0|');
  L('|M100|1|01|'+totalPisEnt.toFixed(2)+'|0|'+totalPisEnt.toFixed(2)+'|0|0|0|0|0|0|0|'+totalPisEnt.toFixed(2)+'|');
  L('|M200|'+totalPisEnt.toFixed(2)+'|0|0|'+totalPisEnt.toFixed(2)+'|0|0|0|0|'+totalPisEnt.toFixed(2)+'|0|0|'+totalPisEnt.toFixed(2)+'|0|');
  L('|M600|'+totalCofinsEnt.toFixed(2)+'|0|0|'+totalCofinsEnt.toFixed(2)+'|0|0|0|0|'+totalCofinsEnt.toFixed(2)+'|0|0|'+totalCofinsEnt.toFixed(2)+'|0|');
  L('|M990|'+(nL - m0)+'|');
  // BLOCO P - Combustiveis (CIDE)
  const p0 = nL;
  L('|P001|0|');
  L('|P010|'+cnpj+'|');
  const itensCombutiveis = nfes.flatMap(n => (n.oct_nfe_entrada_itens||[]).filter(it => it.cod_anp));
  itensCombutiveis.forEach(it => {
    L('|P100|'+dtIniFmt+'|'+dtFimFmt+'|'+(it.cod_anp||'')+'|'+(it.desc_anp||'')+'|'+Number(it.quantidade||0).toFixed(3)+'|0|0|0|');
  });
  L('|P990|'+(nL - p0)+'|');
  // BLOCO 9 (contadores dinamicos)
  const t9 = nL;
  L('|9001|0|');
  montarBloco9(linhas, L);
  // 9990 = total de registros do bloco 9, incluindo o proprio 9990 e o 9999 (+2)
  L('|9990|'+(nL - t9 + 2)+'|');
  L('|9999|'+nL+'|');
  const txt = linhas.map(l => l.txt).join('\n');
  window._spedPisTxt = txt;
  window._spedPisNome = 'SPED_PIS_COFINS_'+ano+'_'+String(mes).padStart(2,'0')+'.txt';
  const totalV = nfes.reduce((s,n) => s+Number(n.valor_total||0), 0);
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div>'
    + '<strong style="color:#4caf50">EFD Contribuicoes gerado — '+linhas.length+' registros</strong>'
    + '<div style="font-size:0.78rem;color:#888;margin-top:2px">Periodo: '+dtIniFmt+' a '+dtFimFmt+' | NF-es: '+nfes.length+' | PIS: R$ '+totalPisEnt.toFixed(2)+' | COFINS: R$ '+totalCofinsEnt.toFixed(2)+'</div>'
    + '</div>'
    + '<button onclick="downloadSped(\'pis\')" class="btn-salvar">Baixar TXT</button>'
    + '</div>'
    + '<div style="background:#0a0c12;border-radius:6px;padding:12px;font-family:monospace;font-size:0.72rem;color:#4caf50;max-height:400px;overflow-y:auto;line-height:1.6">'
    + linhas.slice(0,80).map(l => '<div style="border-bottom:1px solid #0f1117;padding:2px 0"><span style="color:#555;margin-right:8px;min-width:40px;display:inline-block">'+l.n+'</span>'+escHtml(l.txt)+'</div>').join('')
    + (linhas.length > 80 ? '<div style="color:#555;padding:8px">... mais '+(linhas.length-80)+' registros</div>' : '')
    + '</div>';
}
