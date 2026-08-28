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
  let empresa = perfil?.oct_empresas;
  if (typeof empresaAtiva==='function' && empresaAtiva()) { const {data:_ea}=await sb.from('oct_empresas').select('*').eq('id',empresaAtiva()).single(); if(_ea) empresa=_ea; }
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
    + '<button onclick="moduloContabilidade(&quot;motor&quot;)" id="ctab-motor" class="nfe-aba '+(aba==='motor'?'ativo':'')+'">🧮 Motor contábil</button>'
    + '<button onclick="moduloContabilidade(&quot;ecd&quot;)" id="ctab-ecd" class="nfe-aba '+(aba==='ecd'?'ativo':'')+'">📚 SPED ECD</button>'
    + '</div>'
    + '<div id="contab-conteudo"></div>'
    + '</div>';
  if (aba === 'plano') await renderPlanoContas(empresaId);
  else if (aba === 'fiscal') await renderSpedFiscal(empresaId, empresa);
  else if (aba === 'pis_cofins') await renderSpedPisCofins(empresaId, empresa);
  else if (aba === 'motor') await ctbAbrir();
  else if (aba === 'ecd') await renderEcd(empresaId, empresa);
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
    + '<select id="sped-ver" title="Versão do leiaute (COD_VER do 0000) — confirme com o contador" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + ['018','019','020'].map(v => '<option value="'+v+'" '+(v==='019'?'selected':'')+'>leiaute '+v+'</option>').join('')
    + '</select>'
    + '<button onclick="gerarSpedFiscal()" class="btn-salvar">Gerar SPED</button>'
    + '</div></div>'
    // dados do CONTADOR (registro 0100) — persistidos em oct_empresas.sped_config
    + '<details style="margin-bottom:16px;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px 16px">'
    + '<summary style="color:#a78bfa;cursor:pointer;font-size:0.88rem">👤 Dados do contador e do posto (registro 0100 / bloco 1350) — clique para configurar</summary>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px">'
    + ['nome:Nome do contador','cpf:CPF','crc:CRC','cnpj:CNPJ escritório','cep:CEP','endereco:Endereço','numero:Número','bairro:Bairro','fone:Telefone','email:E-mail','cod_mun:Cód. IBGE município (contador)','cod_rec:Cód. receita ICMS (ex 1057)']
      .map(c => { const [k,rot] = c.split(':');
        // ao sair do CEP do contador, busca o IBGE do município dele automaticamente
        const ev = k==='cep' ? ' onblur="spedIbgePorCep(this.value,\'sped-ctd-cod_mun\',\'sped-ctd-cidade\')"' : '';
        return '<div><label style="color:#888;font-size:0.72rem">'+rot+'</label><input id="sped-ctd-'+k+'"'+ev+' style="width:100%;padding:7px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#ddd" /></div>'; }).join('')
    + '</div>'
    + '<div style="margin-top:8px"><button type="button" onclick="spedContadorPorCnpj()" style="padding:7px 12px;border-radius:5px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer">🔍 buscar contador pelo CNPJ</button>'
    + '<span style="font-size:0.72rem;color:#555;margin-left:8px">digite o CNPJ do escritório acima e clique — preenche razão, endereço, CEP e IBGE (o CPF/CRC do responsável o contador informa)</span></div>'
    + '<div style="margin-top:10px"><label style="color:#888;font-size:0.72rem">Cód. IBGE do MUNICÍPIO DO POSTO (campo do 0000 — 7 dígitos)</label><br>'
    + '<input id="sped-cfg-codmun" style="width:220px;padding:7px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#ddd" />'
    + ' <button type="button" onclick="spedIbgePorCep(\''+((empresa&&empresa.cep)||'')+'\',\'sped-cfg-codmun\')" style="padding:7px 12px;border-radius:5px;border:1px solid #2a5a3a;background:transparent;color:#7be0a0;cursor:pointer">🔍 buscar pelo CEP do posto</button>'
    + '<span style="font-size:0.72rem;color:#555;margin-left:8px">o IBGE vem do CEP automaticamente</span></div>'
    + '<div style="margin-top:10px"><label style="color:#888;font-size:0.72rem">Bombas/lacres (1350-1370) — JSON opcional, modelo no placeholder</label>'
    + '<textarea id="sped-cfg-bombas" rows="3" placeholder=\'[{"serie":"33351014 AB","fabricante":"GILBARCO","modelo":"PHX2220","medicao":1,"lacres":[{"numero":"H1815357-5","data":"2023-11-13"}],"bicos":[{"numero":1,"cod_item":"1","tanque":1}]}]\' style="width:100%;padding:7px;border-radius:5px;border:1px solid #2a2d3e;background:#0f1117;color:#ddd;font-family:monospace;font-size:0.74rem"></textarea></div>'
    + '<button onclick="spedSalvarConfig()" class="btn-salvar" style="margin-top:10px">Salvar configuração</button>'
    + '<span id="sped-cfg-msg" style="margin-left:10px;font-size:0.8rem;color:#888"></span>'
    + '</details>'
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
  // ============================================================
  // REESCRITO EM 08/08/2026 sobre o EFD REAL do posto (ReceitanetBX).
  // A montagem vive em sped_fiscal.js (spedFiscalMontar, funcao pura e
  // testavel); aqui so se buscam os dados e se mostra o resultado.
  // O gerador antigo nunca passaria no PVA: registros com contagem de campos
  // errada, sem as saidas NFC-e e sem o bloco 1300 (combustiveis) — que e
  // obrigatorio para posto revendedor.
  // ============================================================
  const ano = parseInt(document.getElementById('sped-ano').value);
  const mes = parseInt(document.getElementById('sped-mes').value);
  const codVer = document.getElementById('sped-ver').value;
  const empresaId = window._contab_empresa_id;
  const empresa = window._contab_empresa;
  const div = document.getElementById('sped-fiscal-preview');
  div.innerHTML = '<p style="color:#888">Buscando os dados do período...</p>';
  const dtIni = ano + '-' + String(mes).padStart(2, '0') + '-01';
  const dtFim = ano + '-' + String(mes).padStart(2, '0') + '-' + String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
  // dia anterior tambem: abre o estoque do 1o dia do 1300
  const dtAntes = new Date(new Date(dtIni + 'T12:00:00').getTime() - 86400000).toISOString().slice(0, 10);
  try {
    const [nfces, entradas, produtos, tanques, bicos, medicoes, abastecimentos, cfgRow] = await Promise.all([
      _spedTudo(q => sb.from('oct_nfce')
        .select('numero,serie,chave_nfe,status,valor_total,data_emissao,criado_em,itens')
        .eq('empresa_id', empresaId).gte('data_emissao', dtIni).lte('data_emissao', dtFim + 'T23:59:59')
        .order('data_emissao').range(q * 1000, q * 1000 + 999)),
      sb.from('oct_nfe_entrada')
        .select('numero,serie,chave_nfe,emissao,entrada,valor_total,valor_desconto,valor_frete,valor_icms,valor_pis,valor_cofins,fornecedor_id,oct_pessoas(nome,documento,cidade,uf,endereco,bairro),oct_nfe_entrada_itens(*)')
        .eq('empresa_id', empresaId).gte('emissao', dtIni).lte('emissao', dtFim)
        .then(r => (r.data || []).map(n => Object.assign({}, n, { fornecedor: n.oct_pessoas, itens: n.oct_nfe_entrada_itens }))),
      sb.from('oct_produtos').select('id,codigo,nome,unidade,ncm,cest,cod_anp,aliq_icms,tanque_id')
        .eq('empresa_id', empresaId).then(r => r.data || []),
      sb.from('oct_tanques').select('id,numero').eq('empresa_id', empresaId).then(r => r.data || []),
      sb.from('oct_bicos').select('numero,tanque_id').eq('empresa_id', empresaId).then(r => r.data || []),
      _spedTudo(q => sb.from('oct_medicoes')
        .select('tanque_numero,volume,medido_em').eq('empresa_id', empresaId)
        .gte('medido_em', dtAntes).lte('medido_em', dtFim + 'T23:59:59')
        .order('medido_em').range(q * 1000, q * 1000 + 999)),
      _spedTudo(q => sb.from('oct_pdv_abastecimentos')
        .select('tanque_id,bico,litros,tipo,data_abast,venc_ini,venc_fin').eq('empresa_id', empresaId)
        .gte('data_abast', dtIni).lte('data_abast', dtFim + 'T23:59:59')
        .order('data_abast').range(q * 1000, q * 1000 + 999)),
      sb.from('oct_empresas').select('sped_config').eq('id', empresaId).single().then(r => r.data, () => null),
    ]);
    const cfg = (cfgRow && cfgRow.sped_config) || {};
    _spedPreencherCfg(cfg);
    const r = spedFiscalMontar({
      codVer: codVer, dtIni: dtIni, dtFim: dtFim, empresa: empresa, cfg: cfg,
      nfces: nfces, entradas: entradas, produtos: produtos, tanques: tanques,
      bicos: bicos, medicoes: medicoes, abastecimentos: abastecimentos,
    });
    window._spedFiscalTxt = r.linhas.join('\r\n') + '\r\n';
    window._spedFiscalNome = 'SPED_FISCAL_' + ano + '_' + String(mes).padStart(2, '0') + '.txt';
    const rs = r.resumo;
    div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div><strong style="color:#4caf50">EFD ICMS/IPI gerado — ' + r.linhas.length + ' registros</strong>'
      + '<div style="color:#888;font-size:0.8rem;margin-top:2px">'
      + rs.saidas + ' NFC-e (' + rs.canceladas + ' canc.) R$ ' + rs.vSaidas.toFixed(2)
      + ' · ' + rs.entradas + ' entradas R$ ' + rs.vEntradas.toFixed(2)
      + ' · débitos R$ ' + rs.debitos.toFixed(2) + ' · créditos R$ ' + rs.creditos.toFixed(2)
      + ' · a recolher R$ ' + rs.aRecolher.toFixed(2) + ' · ' + rs.combustiveis + ' combustível(is) no 1300</div></div>'
      + '<button onclick="downloadSped(&quot;fiscal&quot;)" class="btn-salvar">⬇ Baixar TXT</button></div>'
      + (r.avisos.length
        ? '<div style="background:#2a2410;border:1px solid #b45309;border-radius:8px;padding:12px;margin-bottom:12px">'
          + '<strong style="color:#fbbf24;font-size:0.85rem">Avisos (' + r.avisos.length + '):</strong>'
          + '<ul style="color:#fed7aa;font-size:0.8rem;margin:6px 0 0 18px">' + r.avisos.map(a => '<li>' + escHtml(a) + '</li>').join('') + '</ul></div>'
        : '')
      + '<div style="background:#1a2a1a;border:1px solid #2a5a3a;border-radius:8px;padding:10px;margin-bottom:12px;color:#7be0a0;font-size:0.8rem">'
      + 'Este arquivo NÃO vai direto para a Receita: envie ao CONTADOR para validar no PVA (o validador oficial). '
      + 'O que esta fase não cobre (fretes D100, energia C500, inventário H) ele complementa por lá.</div>'
      + '<pre style="color:#8a8;font-size:0.72rem;max-height:320px;overflow:auto;margin:0">'
      + escHtml(r.linhas.slice(0, 120).join('\n'))
      + (r.linhas.length > 120 ? '\n... mais ' + (r.linhas.length - 120) + ' registros (baixe o TXT)' : '')
      + '</pre>';
  } catch (e) {
    console.error('gerarSpedFiscal:', e);
    div.innerHTML = '<p style="color:#f44;padding:20px">Erro ao gerar: ' + escHtml(String((e && e.message) || e)) + '</p>';
  }
}

// paginacao do PostgREST (corta em 1000): busca ate acabar
async function _spedTudo(consulta) {
  const tudo = [];
  for (let p = 0; p < 30; p++) {
    const { data, error } = await consulta(p);
    if (error || !data || !data.length) break;
    tudo.push.apply(tudo, data);
    if (data.length < 1000) break;
  }
  return tudo;
}

// preenche os campos da tela com o sped_config salvo (sem sobrescrever o que o usuario digitou)
function _spedPreencherCfg(cfg) {
  const ctd = cfg.contador || {};
  ['nome','cpf','crc','cnpj','cep','endereco','numero','bairro','fone','email','cod_mun','cod_rec'].forEach(k => {
    const el = document.getElementById('sped-ctd-' + k);
    if (el && !el.value) el.value = (k === 'cod_rec' ? (cfg.cod_rec || '') : (ctd[k] || ''));
  });
  const cm = document.getElementById('sped-cfg-codmun');
  if (cm && !cm.value) cm.value = cfg.cod_mun || '';
  const bb = document.getElementById('sped-cfg-bombas');
  if (bb && !bb.value && cfg.bombas) bb.value = JSON.stringify(cfg.bombas);
}

// salva a configuracao em oct_empresas.sped_config (jsonb)
async function spedSalvarConfig() {
  const msg = document.getElementById('sped-cfg-msg');
  try {
    const ctd = {};
    ['nome','cpf','crc','cnpj','cep','endereco','numero','bairro','fone','email','cod_mun'].forEach(k => {
      ctd[k] = (document.getElementById('sped-ctd-' + k)?.value || '').trim();
    });
    let bombas = null;
    const bTxt = (document.getElementById('sped-cfg-bombas')?.value || '').trim();
    if (bTxt) {
      try { bombas = JSON.parse(bTxt); }
      catch (e) { msg.style.color = '#f44'; msg.textContent = 'JSON das bombas inválido: ' + e.message; return; }
    }
    const cfg = {
      contador: ctd,
      cod_mun: (document.getElementById('sped-cfg-codmun')?.value || '').trim(),
      cod_rec: (document.getElementById('sped-ctd-cod_rec')?.value || '').trim(),
    };
    if (bombas) cfg.bombas = bombas;
    const { error } = await sb.from('oct_empresas').update({ sped_config: cfg }).eq('id', window._contab_empresa_id);
    if (error) throw error;
    msg.style.color = '#4caf50'; msg.textContent = '✓ Salvo.';
  } catch (e) {
    msg.style.color = '#f44';
    msg.textContent = 'Erro: ' + (e.message || e) + (String(e.message || '').indexOf('sped_config') >= 0 ? ' — rode o SQL da coluna sped_config.' : '');
  }
}


function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// busca o código IBGE do município pelo CEP (ViaCEP) e preenche o campo destino.
// O IBGE do 0000/0100 vem do CEP — não precisa digitar à mão.
async function spedIbgePorCep(cep, destId, cidadeId) {
  const c = String(cep || '').replace(/\D/g, '');
  const dest = document.getElementById(destId);
  if (c.length !== 8) { if (dest) { dest.placeholder = 'CEP incompleto'; } return; }
  try {
    const r = await fetch('https://viacep.com.br/ws/' + c + '/json/');
    const j = await r.json();
    if (j && j.ibge && dest) dest.value = j.ibge;
    if (j && cidadeId) { const ce = document.getElementById(cidadeId); if (ce) ce.value = j.localidade || ''; }
  } catch (e) { /* silencioso — sem internet, preenche manual */ }
}

// preenche os dados do contador (registro 0100) a partir do CNPJ do escritório.
// Razão/endereço/CEP vêm da BrasilAPI; o IBGE do município vem do CEP (ViaCEP).
// O CPF e o CRC do responsável NÃO estão no registro do CNPJ — o contador informa.
async function spedContadorPorCnpj() {
  const msg = document.getElementById('sped-cfg-msg');
  const cnpj = (document.getElementById('sped-ctd-cnpj')?.value || '').replace(/\D/g, '');
  if (cnpj.length !== 14) { if (msg) { msg.style.color = '#f44'; msg.textContent = 'Digite o CNPJ do escritório (14 dígitos) no campo acima.'; } return; }
  if (msg) { msg.style.color = '#888'; msg.textContent = 'Buscando dados do CNPJ...'; }
  const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
    if (!r.ok) throw new Error('CNPJ não encontrado');
    const j = await r.json();
    set('sped-ctd-nome', j.razao_social);
    set('sped-ctd-cep', j.cep);
    set('sped-ctd-endereco', j.logradouro);
    set('sped-ctd-numero', j.numero);
    set('sped-ctd-bairro', j.bairro);
    set('sped-ctd-fone', (j.ddd_telefone_1 || '').replace(/\D/g, ''));
    set('sped-ctd-email', (j.email || '').toLowerCase());
    if (j.cep) await spedIbgePorCep(j.cep, 'sped-ctd-cod_mun');
    if (msg) { msg.style.color = '#4caf50'; msg.textContent = '✓ Contador preenchido pelo CNPJ. Falta o CPF e o CRC do responsável (o contador informa). Depois clique em Salvar.'; }
  } catch (e) {
    if (msg) { msg.style.color = '#f59e0b'; msg.textContent = 'Não consegui buscar o CNPJ automaticamente (' + (e.message || e) + '). Preencha manual.'; }
  }
}

// ============================================================
//  SPED ECD (Escrituração Contábil Digital) — anual
//  A montagem vive em sped_ecd.js (spedEcdMontar, função pura).
//  Aqui só busca os dados do motor contábil e mostra/baixa.
// ============================================================
async function renderEcd(empresaId, empresa) {
  const div = document.getElementById('contab-conteudo');
  const anoAtual = new Date().getFullYear();
  div.innerHTML = '<div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">'
    + '<div><h3 style="color:#a78bfa;margin-bottom:4px">📚 SPED ECD — Escrituração Contábil Digital</h3>'
    + '<p style="color:#888;font-size:0.82rem">Livro Diário: plano de contas, saldos, lançamentos, balanço e DRE (anual)</p></div>'
    + '<div style="display:flex;gap:10px;align-items:center">'
    + '<select id="ecd-ano" style="padding:8px 12px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + [anoAtual, anoAtual-1, anoAtual-2].map(a => '<option value="'+a+'" '+(a===anoAtual?'selected':'')+'>'+a+'</option>').join('')
    + '</select>'
    + '<button onclick="gerarEcd()" class="btn-salvar">Gerar ECD</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco 0</div><div style="color:#60a5fa;font-weight:600;margin-top:4px">Abertura</div><div style="font-size:0.75rem;color:#555;margin-top:2px">0000, 0001, 0007, 0990</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco I</div><div style="color:#4caf50;font-weight:600;margin-top:4px">Escrituração</div><div style="font-size:0.75rem;color:#555;margin-top:2px">I050 plano · I155 saldos · I200/I250 lançamentos</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Bloco J</div><div style="color:#fbbf24;font-weight:600;margin-top:4px">Demonstrações</div><div style="font-size:0.75rem;color:#555;margin-top:2px">J100 Balanço · J150 DRE · J930 signatários</div></div>'
    + '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px"><div class="nfe-label">Fonte</div><div style="color:#a78bfa;font-weight:600;margin-top:4px">Motor contábil</div><div style="font-size:0.75rem;color:#555;margin-top:2px">Rode a aba 🧮 Motor antes, por competência</div></div>'
    + '</div>'
    + '<div style="background:#2a2410;border:1px solid #b45309;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.8rem;color:#fed7aa">'
    + '⚠️ O Balanço (J100) e a DRE (J150) saem em <b>rascunho</b> a partir do balancete. O contador revisa a aglutinação e assina no PVA da ECD.</div>'
    + '<div id="ecd-preview" style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:16px;min-height:200px">'
    + '<p style="color:#555;text-align:center;padding:40px">Selecione o ano e clique em Gerar ECD.</p>'
    + '</div></div>';
}

async function gerarEcd() {
  const ano = parseInt(document.getElementById('ecd-ano').value);
  const empresaId = window._contab_empresa_id;
  const empresa = window._contab_empresa;
  const div = document.getElementById('ecd-preview');
  div.innerHTML = '<p style="color:#888">Buscando plano de contas, lançamentos e partidas...</p>';
  const dtIni = ano + '-01-01', dtFim = ano + '-12-31';
  try {
    const [contas, lancamentos, partidas, cfgRow] = await Promise.all([
      sb.from('oct_contabil_contas').select('codigo,nome,natureza,tipo,nivel,conta_pai,cod_cta_sped')
        .eq('empresa_id', empresaId).then(r => r.data || []),
      _spedTudo(q => sb.from('oct_contabil_lancamentos').select('id,data,valor,historico,origem,competencia')
        .eq('empresa_id', empresaId).lte('data', dtFim).order('data').range(q * 1000, q * 1000 + 999)),
      _spedTudo(q => sb.from('oct_contabil_partidas').select('lancamento_id,conta_codigo,dc,valor,historico')
        .eq('empresa_id', empresaId).range(q * 1000, q * 1000 + 999)),
      sb.from('oct_empresas').select('sped_config').eq('id', empresaId).single().then(r => r.data, () => null),
    ]);
    const cfg = (cfgRow && cfgRow.sped_config) || {};
    if (!contas.length) { div.innerHTML = '<p style="color:#f87171;padding:20px">Plano de contas contábil vazio. Rode a aba 🧮 <b>Motor contábil</b> primeiro (ele cria o plano e os lançamentos).</p>'; return; }
    const r = spedEcdMontar({
      empresa: empresa, spedConfig: cfg, dtIni: dtIni, dtFim: dtFim,
      contas: contas, lancamentos: lancamentos, partidas: partidas,
    });
    window._spedEcdTxt = r.texto;
    window._spedEcdNome = r.nome;
    div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div><strong style="color:#4caf50">ECD gerada — ' + r.contagem.registros + ' registros</strong>'
      + '<div style="color:#888;font-size:0.8rem;margin-top:2px">' + r.contagem.contas + ' contas · ' + r.contagem.lancamentos + ' lançamentos</div></div>'
      + '<button onclick="downloadSped(&quot;ecd&quot;)" class="btn-salvar">⬇ Baixar TXT</button></div>'
      + (r.avisos.length
        ? '<div style="background:#2a2410;border:1px solid #b45309;border-radius:8px;padding:12px;margin-bottom:12px">'
          + '<strong style="color:#fbbf24;font-size:0.85rem">Avisos (' + r.avisos.length + '):</strong>'
          + '<ul style="color:#fed7aa;font-size:0.8rem;margin:6px 0 0 18px">' + r.avisos.map(a => '<li>' + escHtml(a) + '</li>').join('') + '</ul></div>'
        : '')
      + '<pre style="background:#0a0c10;border:1px solid #1c2130;border-radius:6px;padding:12px;overflow:auto;max-height:420px;font-size:0.72rem;color:#9fb0c4;white-space:pre">'
      + escHtml(r.texto.split('\r\n').slice(0, 200).join('\n')) + '</pre>';
  } catch (e) {
    div.innerHTML = '<p style="color:#f87171;padding:20px">Erro ao gerar a ECD: ' + escHtml(e.message || String(e)) + '</p>';
  }
}

function downloadSped(tipo) {
  const map = {
    fiscal: [window._spedFiscalTxt, window._spedFiscalNome],
    pis: [window._spedPisTxt, window._spedPisNome],
    ecd: [window._spedEcdTxt, window._spedEcdNome],
  };
  const [txt, nome] = map[tipo] || [null, null];
  if (!txt) return;
  // SPED é ISO-8859-1 (latin1). Blob padrão gravaria UTF-8 e quebraria acentos no PVA.
  const bytes = new Uint8Array(txt.length);
  for (let i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i) & 0xff;
  const blob = new Blob([bytes], { type: 'text/plain' });
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
