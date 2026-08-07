
// ============================================================
// MODULO PESSOAS — cadastro de fornecedores e clientes (grid)
// ============================================================

async function moduloPessoas() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._pessoasEmpresaId = empresaId;

  const { data: pessoas } = await sb
    .from('oct_pessoas').select('*')
    .eq('empresa_id', empresaId)
    .order('nome');

  window._todasPessoas = pessoas || [];
  const filtro = window._pessoaFiltro || 'todos';
  const listaFiltrada = window._todasPessoas.filter(p =>
    filtro === 'ativos' ? p.ativo : filtro === 'inativos' ? !p.ativo : true);

  conteudo.innerHTML = `
    <div id="form-pessoa" style="display:none;margin-bottom:16px"></div>
    <div id="grid-pessoas"></div>
  `;

  const CORES_TIPO = { fornecedor:'#f97316', cliente:'#4caf50', funcionario:'#fbbf24', contador:'#22d3ee', transportadora:'#a78bfa', ambos:'#60a5fa' };
  const badge = (tipo) => {
    const c = CORES_TIPO[tipo] || '#888';
    return `<span class="og-badge" style="background:#1e2235;color:${c}">${tipo}</span>`;
  };
  // mostra todas as classificacoes (array). Cai para o 'tipo' antigo se nao houver array.
  const badges = (p) => {
    let lista = Array.isArray(p.classificacoes) && p.classificacoes.length ? p.classificacoes
              : (p.tipo ? (p.tipo === 'ambos' ? ['cliente','fornecedor'] : [p.tipo]) : []);
    if (!lista.length) return '<span style="color:#888">—</span>';
    return lista.map(badge).join(' ');
  };
  const fmtDoc = (d) => {
    const s = (d||'').replace(/\D/g,'');
    if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    return d || '—';
  };

  octanoGrid({
    montarEm: 'grid-pessoas',
    titulo: 'Pessoas — Fornecedores e Clientes',
    aoFechar: "navegarPara('empresa')",
    rodapeDireita: perfil?.oct_empresas?.nome || '',
    dados: listaFiltrada,
    acoes: [
      { rotulo: 'Nova Pessoa', ico: '＋', onClick: `abrirFormPessoa(null,'${empresaId}')` },
      { rotulo: 'Placas bloqueadas', ico: '🚫', onClick: `placasBloqueadasAbrir()` },
      { rotulo: `Todos (${window._todasPessoas.length})`, onClick: `pessoaFiltrar('todos')` },
      { rotulo: `Ativos`, onClick: `pessoaFiltrar('ativos')` },
      { rotulo: `Inativos (${window._todasPessoas.filter(p=>!p.ativo).length})`, onClick: `pessoaFiltrar('inativos')` },
    ],
    colunas: [
      { campo: 'nome', titulo: 'Nome / Razão Social', largura: '260px' },
      { titulo: 'Status', largura: '110px', valor: (p)=> p, render: (p)=> pessoaStatusHtml(p) },
      { titulo: 'Classificação', largura: '200px', valor: (p)=> p, render: (p)=> badges(p) },
      { campo: 'documento', titulo: 'CNPJ / CPF', largura: '150px', render: (v)=> fmtDoc(v) },
      { campo: 'ie', titulo: 'IE', largura: '110px', render: (v)=> v||'—' },
      { campo: 'telefone', titulo: 'Telefone', largura: '120px', render: (v)=> v||'—' },
      { campo: 'cidade', titulo: 'Cidade', largura: '140px', render: (v)=> v||'—' },
      { campo: 'uf', titulo: 'UF', largura: '50px', render: (v)=> v||'—' },
    ],
    aoClicarLinha: (p) => abrirFormPessoa(p.id, empresaId),
    botaoExcluir: (p) => excluirPessoa(p.id),
  });
}

async function abrirFormPessoa(id, empresaId) {
  const div = document.getElementById('form-pessoa');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  let p = null;
  if (id) {
    const { data } = await sb.from('oct_pessoas').select('*').eq('id', id).single();
    p = data;
  }

  const CLASSIFICACOES = ['cliente','fornecedor','funcionario','contador','transportadora'];
  // classificacoes ja marcadas: usa o array novo, ou migra do 'tipo' antigo
  let marcadas = Array.isArray(p?.classificacoes) ? p.classificacoes.slice() : [];
  if (!marcadas.length && p?.tipo) {
    marcadas = p.tipo === 'ambos' ? ['cliente','fornecedor'] : [p.tipo];
  }

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa;font-size:0.95rem">${id ? '✏️ Editar pessoa' : '+ Nova pessoa'}</h3>
        <button onclick="document.getElementById('form-pessoa').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Nome / Razão Social *</label><input id="fpe-nome" type="text" value="${p?.nome||''}" /></div>
        <div class="form-group span2">
          <label>Classificação (pode marcar mais de uma)</label>
          <div style="display:flex;flex-wrap:wrap;gap:14px;padding:8px 2px">
            ${CLASSIFICACOES.map(c=>`
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#ddd;font-size:0.85rem">
                <input type="checkbox" class="fpe-classif" value="${c}" ${marcadas.includes(c)?'checked':''} style="cursor:pointer">
                ${c.charAt(0).toUpperCase()+c.slice(1)}
              </label>`).join('')}
          </div>
        </div>
        <div class="form-group"><label>CNPJ / CPF</label>
          <div style="display:flex;gap:6px">
            <input id="fpe-doc" type="text" value="${p?.documento||''}" onblur="buscarCnpjPessoa()" style="flex:1" />
            <button type="button" onclick="buscarCnpjPessoa()" title="Buscar dados do CNPJ" style="padding:0 12px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;white-space:nowrap">🔍</button>
          </div>
          <span id="fpe-doc-msg" style="font-size:0.72rem;color:#888"></span>
        </div>
        <div class="form-group">
          <label>Cartão identificador (IDF)</label>
          <input id="fpe-idf" type="text" value="${p?.cartao_idf||''}" placeholder="código do crachá da bomba" />
          <span style="font-size:0.72rem;color:#888">Código que o frentista passa na bomba (vincula o vendedor ao abastecimento).</span>
        </div>
        <div class="form-group"><label>Inscrição Estadual</label><input id="fpe-ie" type="text" value="${p?.ie||''}" /></div>
        <div class="form-group"><label>Telefone</label><input id="fpe-tel" type="text" value="${p?.telefone||''}" /></div>
        <div class="form-group"><label>WhatsApp <span style="color:#999;font-weight:normal;font-size:0.75rem">(p/ envio de nota a prazo)</span></label><input id="fpe-whatsapp" type="text" value="${p?.whatsapp||''}" placeholder="DDD + número, ex: 31999998888" /></div>
        <div class="form-group span2"><label>E-mail</label><input id="fpe-email" type="text" value="${p?.email||''}" /></div>
        <div class="form-group span2"><label>Endereço</label><input id="fpe-end" type="text" value="${p?.endereco||''}" /></div>
        <div class="form-group"><label>Bairro</label><input id="fpe-bairro" type="text" value="${p?.bairro||''}" /></div>
        <div class="form-group"><label>CEP</label><input id="fpe-cep" type="text" value="${p?.cep||''}" /></div>
        <div class="form-group"><label>Cidade</label><input id="fpe-cidade" type="text" value="${p?.cidade||''}" /></div>
        <div class="form-group"><label>UF</label><input id="fpe-uf" type="text" maxlength="2" value="${p?.uf||''}" style="text-transform:uppercase" /></div>
        <div class="form-group"><label>Data de nascimento</label><input id="fpe-nasc" type="date" value="${p?.data_nascimento||''}" /></div>
        <div class="form-group span2"><label>Observações</label><input id="fpe-obs" type="text" value="${p?.observacoes||''}" /></div>
        <div class="form-group"><label>Chave Pix <span style="font-size:0.72rem;color:#888">(p/ cashback)</span></label><input id="fpe-chavepix" type="text" value="${p?.chave_pix||''}" placeholder="CPF, celular, e-mail ou aleatória" /></div>
        <div class="form-group"><label>Cashback</label><label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;padding-top:6px"><input id="fpe-cashback" type="checkbox" ${p?.cashback_ativo?'checked':''} style="width:auto" /> Recebe cashback (R$0,05/litro via Pix)</label></div>
        <div class="form-group"><label>Nota a prazo <span style="font-size:0.72rem;color:#888">(libera a compra na conta — inclusive pelo app)</span></label><label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;padding-top:6px"><input id="fpe-prazo" type="checkbox" ${p?.aceita_nota_prazo?'checked':''} style="width:auto" /> Aceita nota a prazo</label></div>
        <div class="form-group"><label>Limite da nota a prazo (R$)</label><input id="fpe-prazo-limite" type="number" step="0.01" min="0" value="${p?.limite_nota_prazo ?? ''}" placeholder="sem limite" /></div>
        <div class="form-group"><label>Crédito</label><label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;padding-top:6px"><input id="fpe-cred-bloq" type="checkbox" ${p?.credito_bloqueado?'checked':''} style="width:auto" /> 🚫 Crédito bloqueado</label></div>
        <!-- EXIGÊNCIAS DA NOTA A PRAZO: o PDV já pergunta esses dados na venda
             (pagamento.js > PRAZO_CAMPOS), mas até 06/08/2026 não havia onde
             LIGAR a exigência — só direto no banco. Agora é aqui. -->
        <div class="form-group span2" style="border-top:1px solid #2a2d3e;padding-top:12px">
          <label>📋 Exigências na venda a prazo <span style="font-size:0.72rem;color:#888">(o PDV vai pedir estes dados e não deixa fechar sem eles)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px">
            ${[['fpe-ex-placa','exige_placa','Placa'],
               ['fpe-ex-km','exige_km','Odômetro (KM)'],
               ['fpe-ex-mot','exige_motorista','Motorista'],
               ['fpe-ex-cpfmot','exige_cpf_motorista','CPF do motorista'],
               ['fpe-ex-veic','exige_veiculo','Veículo'],
               ['fpe-ex-frota','exige_frota','Frota'],
               ['fpe-ex-req','exige_requisicao','Requisição']]
              .map(([eid, campo, rot]) => `
              <label style="display:flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer;font-size:0.86rem">
                <input id="${eid}" type="checkbox" ${p && p[campo] ? 'checked' : ''} style="width:auto" /> ${rot}
              </label>`).join('')}
          </div>
        </div>
        ${id ? `
        <div class="form-group span2" style="border-top:1px solid #2a2d3e;padding-top:12px">
          <label>🏢 Colaboradores autorizados <span style="font-size:0.72rem;color:#888">(abastecem a prazo pelo app NA CONTA desta empresa — o cupom sai no nome dela)</span></label>
          <div id="fpe-colab-lista" style="margin:6px 0"><span style="color:#666;font-size:0.8rem">Carregando…</span></div>
          <input id="fpe-colab-busca" placeholder="Adicionar: busque a pessoa por nome ou CPF…" autocomplete="off"
            style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0d1017;color:#ddd" />
          <div id="fpe-colab-res"></div>
        </div>
        <div class="form-group span2" style="border-top:1px solid #2a2d3e;padding-top:12px">
          <label>🚚 Frota da empresa <span style="font-size:0.72rem;color:#888">(as placas aparecem no app na compra a prazo; com MOTORISTA definido, só ele vê a placa)</span></label>
          <div id="fpe-frota-lista" style="margin:6px 0"><span style="color:#666;font-size:0.8rem">Carregando…</span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <input id="fpe-frota-placa" placeholder="Placa (ABC1D23)" maxlength="8" style="flex:1;min-width:110px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0d1017;color:#ddd;text-transform:uppercase" />
            <input id="fpe-frota-veic" placeholder="Veículo (ex: VW Constellation)" style="flex:2;min-width:160px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0d1017;color:#ddd" />
            <select id="fpe-frota-mot" style="flex:1.5;min-width:150px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0d1017;color:#ddd">
              <option value="">— sem motorista fixo —</option>
            </select>
            <button type="button" onclick="frotaAdd('${id}','${empresaId}')" class="btn-salvar" style="padding:9px 16px">+ Placa</button>
          </div>
        </div>` : ''}
      </div>
      <div class="form-acoes">
        <button onclick="salvarPessoa('${id||''}','${empresaId}')" class="btn-salvar">💾 Salvar</button>
        <button onclick="document.getElementById('form-pessoa').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        ${id ? `<button onclick="excluirPessoa('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>` : ''}
        <span id="fpe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
  if (id) { colabInit(id, empresaId); frotaInit(id, empresaId); }
}

// ---- FROTA DA EMPRESA (placas que aparecem no app na compra a prazo) ----
async function frotaInit(empresaPessoaId, empresaId) {
  await frotaCarregar(empresaPessoaId);
  // motoristas possíveis = colaboradores vinculados à empresa
  const sel = document.getElementById('fpe-frota-mot');
  if (!sel) return;
  const { data } = await sb.from('oct_pessoas')
    .select('id,nome').eq('frota_empresa_id', empresaPessoaId).order('nome');
  sel.innerHTML = '<option value="">— sem motorista fixo —</option>' +
    (data || []).map(x => `<option value="${x.id}">${x.nome}</option>`).join('');
}
async function frotaCarregar(empresaPessoaId) {
  const el = document.getElementById('fpe-frota-lista');
  if (!el) return;
  const { data: veics } = await sb.from('oct_frota_veiculos')
    .select('id,placa,veiculo,motorista_pessoa_id').eq('pessoa_id', empresaPessoaId)
    .eq('ativo', true).order('placa');
  if (!(veics || []).length) {
    el.innerHTML = '<span style="color:#666;font-size:0.8rem">Nenhum veículo cadastrado.</span>';
    return;
  }
  const motIds = [...new Set(veics.map(v => v.motorista_pessoa_id).filter(Boolean))];
  const nomes = {};
  if (motIds.length) {
    const { data: ms } = await sb.from('oct_pessoas').select('id,nome').in('id', motIds);
    (ms || []).forEach(m => { nomes[m.id] = m.nome; });
  }
  el.innerHTML = veics.map(v => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #1a1d2e;font-size:0.84rem;color:#ddd">
      <span>🚚 <b>${v.placa}</b>${v.veiculo ? ' · ' + v.veiculo : ''}${v.motorista_pessoa_id ? ` · <span style="color:#60a5fa">👤 ${nomes[v.motorista_pessoa_id] || 'motorista'}</span>` : ' · <span style="color:#888">qualquer colaborador</span>'}</span>
      <button onclick="frotaRemover('${v.id}','${empresaPessoaId}')" style="padding:3px 9px;border-radius:5px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">✕</button>
    </div>`).join('');
}
async function frotaAdd(empresaPessoaId, empresaId) {
  const placa = (document.getElementById('fpe-frota-placa').value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const veiculo = (document.getElementById('fpe-frota-veic').value || '').trim();
  const mot = document.getElementById('fpe-frota-mot').value || null;
  if (placa.length < 6) { alert('Placa inválida.'); return; }
  const { error } = await sb.from('oct_frota_veiculos').insert({
    empresa_id: empresaId, pessoa_id: empresaPessoaId,
    placa, veiculo: veiculo || null, motorista_pessoa_id: mot, ativo: true,
  });
  if (error) { alert('Falha ao cadastrar: ' + error.message); return; }
  document.getElementById('fpe-frota-placa').value = '';
  document.getElementById('fpe-frota-veic').value = '';
  document.getElementById('fpe-frota-mot').value = '';
  frotaCarregar(empresaPessoaId);
}
async function frotaRemover(veicId, empresaPessoaId) {
  await sb.from('oct_frota_veiculos').update({ ativo: false }).eq('id', veicId);
  frotaCarregar(empresaPessoaId);
}

// ---- COLABORADORES AUTORIZADOS (frota a prazo pelo app) ----
// vínculo = oct_pessoas.frota_empresa_id do COLABORADOR apontando p/ a empresa.
let _colabBuscaTimer = null;
async function colabInit(empresaPessoaId, empresaId) {
  await colabCarregar(empresaPessoaId);
  const busca = document.getElementById('fpe-colab-busca');
  if (!busca) return;
  busca.addEventListener('input', () => {
    clearTimeout(_colabBuscaTimer);
    _colabBuscaTimer = setTimeout(async () => {
      const q = busca.value.trim(), res = document.getElementById('fpe-colab-res');
      if (q.length < 2) { res.innerHTML = ''; return; }
      const { data } = await sb.from('oct_pessoas')
        .select('id,nome,documento,frota_empresa_id')
        .eq('empresa_id', empresaId)
        .or(`nome.ilike.*${q}*,documento.ilike.*${q}*`)
        .neq('id', empresaPessoaId)
        .limit(8);
      res.innerHTML = (data || []).map(x => `
        <div onclick="colabAdd('${x.id}','${empresaPessoaId}')"
          style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #1a1d2e;cursor:pointer;color:#ddd;font-size:0.84rem"
          onmouseover="this.style.background='#1a1d2e'" onmouseout="this.style.background='transparent'">
          <span>${x.nome} <small style="color:#888">${x.documento || ''}</small></span>
          <span style="color:${x.frota_empresa_id ? '#f59e0b' : '#4ade80'}">${x.frota_empresa_id ? 'já vinculado a outra' : '+ vincular'}</span>
        </div>`).join('') || '<div style="color:#666;font-size:0.8rem;padding:6px">Ninguém encontrado.</div>';
    }, 400);
  });
}
async function colabCarregar(empresaPessoaId) {
  const el = document.getElementById('fpe-colab-lista');
  if (!el) return;
  const { data } = await sb.from('oct_pessoas')
    .select('id,nome,documento').eq('frota_empresa_id', empresaPessoaId).order('nome');
  el.innerHTML = (data || []).length
    ? data.map(x => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #1a1d2e;font-size:0.84rem;color:#ddd">
        <span>👤 ${x.nome} <small style="color:#888">${x.documento || ''}</small></span>
        <button onclick="colabRemover('${x.id}','${empresaPessoaId}')" style="padding:3px 9px;border-radius:5px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">✕</button>
      </div>`).join('')
    : '<span style="color:#666;font-size:0.8rem">Nenhum colaborador vinculado.</span>';
}
async function colabAdd(pessoaId, empresaPessoaId) {
  const { error } = await sb.from('oct_pessoas').update({ frota_empresa_id: empresaPessoaId }).eq('id', pessoaId);
  if (error) { alert('Falha ao vincular: ' + error.message); return; }
  document.getElementById('fpe-colab-busca').value = '';
  document.getElementById('fpe-colab-res').innerHTML = '';
  colabCarregar(empresaPessoaId);
}
async function colabRemover(pessoaId, empresaPessoaId) {
  await sb.from('oct_pessoas').update({ frota_empresa_id: null }).eq('id', pessoaId);
  colabCarregar(empresaPessoaId);
}

async function buscarCnpjPessoa() {
  const docEl = document.getElementById('fpe-doc');
  const msg = document.getElementById('fpe-doc-msg');
  if (!docEl) return;
  const cnpj = (docEl.value || '').replace(/\D/g, '');
  if (cnpj.length !== 14) {
    // só busca para CNPJ (14 dígitos); CPF não tem consulta pública
    return;
  }
  if (msg) { msg.textContent = 'Buscando dados na Receita...'; msg.style.color = '#888'; }
  try {
    const resp = await fetch(SEFAZ_URL + '/cnpj/' + cnpj);
    if (!resp.ok) {
      if (msg) { msg.textContent = 'CNPJ não encontrado.'; msg.style.color = '#fbbf24'; }
      return;
    }
    const d = await resp.json();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    // só preenche o nome se estiver vazio (não sobrescreve o que o usuário digitou)
    const nomeEl = document.getElementById('fpe-nome');
    if (nomeEl && !nomeEl.value.trim()) nomeEl.value = d.razao_social || d.nome_fantasia || '';
    const tel = d.ddd_telefone_1 ? d.ddd_telefone_1.replace(/^(\d{2})(\d+)/, '($1) $2') : '';
    setVal('fpe-tel', tel);
    const endParts = [d.logradouro, d.numero, d.bairro].filter(Boolean).join(', ');
    setVal('fpe-end', endParts);
    setVal('fpe-cidade', d.municipio);
    setVal('fpe-uf', d.uf);
    if (d.email) setVal('fpe-email', d.email);
    if (msg) { msg.textContent = '✓ Dados preenchidos pela Receita.'; msg.style.color = '#4caf50'; }
  } catch (e) {
    if (msg) { msg.textContent = 'Erro ao consultar: ' + e.message; msg.style.color = '#f44'; }
  }
}

async function salvarPessoa(id, empresaId) {
  const msg = document.getElementById('fpe-msg');
  const nome = document.getElementById('fpe-nome').value.trim();
  if (!nome) { msg.textContent = 'Nome obrigatório.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  // coleta as classificacoes marcadas (checkboxes)
  const classif = Array.from(document.querySelectorAll('.fpe-classif:checked')).map(c => c.value);
  // mantem o 'tipo' antigo coerente (compatibilidade com telas que ainda usam):
  // tipo = campo de compatibilidade. O banco so aceita
  // cliente/fornecedor/funcionario/transportadora/NULL (constraint oct_pessoas_tipo_check).
  // 'ambos' e 'contador' NAO sao validos aqui — ficam so no array classificacoes.
  // Prioridade: cliente > fornecedor > funcionario > transportadora.
  let tipoCompat = null;
  for (const t of ['cliente','fornecedor','funcionario','transportadora']) {
    if (classif.includes(t)) { tipoCompat = t; break; }
  }

  const dados = {
    empresa_id: empresaId, nome,
    classificacoes: classif,
    tipo:        tipoCompat,
    cartao_idf:  document.getElementById('fpe-idf').value.trim() || null,
    documento:   document.getElementById('fpe-doc').value.trim() || null,
    ie:          document.getElementById('fpe-ie').value.trim() || null,
    telefone:    document.getElementById('fpe-tel').value.trim() || null,
    whatsapp:    document.getElementById('fpe-whatsapp')?.value.trim() || null,
    email:       document.getElementById('fpe-email').value.trim() || null,
    chave_pix:   document.getElementById('fpe-chavepix')?.value.trim() || null,
    cashback_ativo: !!document.getElementById('fpe-cashback')?.checked,
    aceita_nota_prazo: !!document.getElementById('fpe-prazo')?.checked,
    limite_nota_prazo: parseFloat(document.getElementById('fpe-prazo-limite')?.value) || null,
    credito_bloqueado: !!document.getElementById('fpe-cred-bloq')?.checked,
    // exigências da venda a prazo (o PDV as respeita desde sempre; a tela é nova)
    exige_placa:          !!document.getElementById('fpe-ex-placa')?.checked,
    exige_km:             !!document.getElementById('fpe-ex-km')?.checked,
    exige_motorista:      !!document.getElementById('fpe-ex-mot')?.checked,
    exige_cpf_motorista:  !!document.getElementById('fpe-ex-cpfmot')?.checked,
    exige_veiculo:        !!document.getElementById('fpe-ex-veic')?.checked,
    exige_frota:          !!document.getElementById('fpe-ex-frota')?.checked,
    exige_requisicao:     !!document.getElementById('fpe-ex-req')?.checked,
    endereco:    document.getElementById('fpe-end').value.trim() || null,
    bairro:      document.getElementById('fpe-bairro')?.value.trim() || null,
    cep:         document.getElementById('fpe-cep')?.value.trim() || null,
    cidade:      document.getElementById('fpe-cidade').value.trim() || null,
    uf:          document.getElementById('fpe-uf').value.trim().toUpperCase() || null,
    data_nascimento: document.getElementById('fpe-nasc')?.value || null,
    observacoes: document.getElementById('fpe-obs').value.trim() || null,
  };

  let error;
  if (id) {
    ({ error } = await sb.from('oct_pessoas').update(dados).eq('id', id));
  } else {
    ({ error } = await sb.from('oct_pessoas').insert({ ...dados, ativo: true }));
  }

  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloPessoas(), 900);
}

async function excluirPessoa(id) {
  if (!confirm('Excluir esta pessoa? (fica inativa, não some do histórico de NF-es)')) return;
  await sb.from('oct_pessoas').update({ ativo: false }).eq('id', id);
  moduloPessoas();
}

// Botão de status/ativação por linha (não abre o cadastro — stopPropagation).
function pessoaStatusHtml(p) {
  const on = !!p.ativo;
  return `<button onclick="event.stopPropagation();pessoaSetAtivo('${p.id}',${!on})" `
    + `title="${on ? 'Clique para desativar' : 'Clique para ativar'}" `
    + `style="border:1px solid ${on ? '#2a5a2a' : '#5a4a2a'};background:${on ? '#12211a' : '#221c12'};`
    + `color:${on ? '#4ade80' : '#f0b45c'};border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.78rem">`
    + `${on ? '🟢 Ativo' : '⚪ Inativo'}</button>`;
}
async function pessoaSetAtivo(id, ativo) {
  await sb.from('oct_pessoas').update({ ativo }).eq('id', id);
  moduloPessoas();
}
function pessoaFiltrar(f) { window._pessoaFiltro = f; moduloPessoas(); }


// ============================================================
// LISTA NEGRA DE PLACA (07/08/2026)
// ------------------------------------------------------------
// Antifraude de crediário: veículo bloqueado não abastece a prazo. O PDV
// consulta esta lista no momento em que o frentista digita a placa na venda a
// prazo (pagamento.js > _prazoColetarDados) e recusa antes de emitir a nota.
// Bloqueio é ato de gestão: exige motivo e autor, e nada é apagado — desbloquear
// marca ativo=false, preservando o histórico de quem bloqueou e por quê.
// ============================================================
function _plNorm(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function _plFmt(p) {
  const s = _plNorm(p);
  return s.length === 7 ? s.slice(0, 3) + '-' + s.slice(3) : (p || '');
}

async function placasBloqueadasAbrir() {
  const eid = empresaAtiva();
  const div = document.createElement('div');
  div.id = 'placas-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `<div style="background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;padding:22px;max-width:640px;width:94%;color:#dbe2ea">
    <h2 style="color:#f87171;margin:0 0 4px">🚫 Placas bloqueadas</h2>
    <p style="color:#9aa;font-size:0.82rem;margin:0 0 14px">
      Veículo nesta lista <b>não abastece a prazo</b> — o PDV recusa na hora em que o frentista digita a placa.
    </p>
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap">
      <div style="width:130px"><label style="color:#9aa;font-size:0.72rem">Placa</label>
        <input id="pl-placa" placeholder="ABC-1234" maxlength="8"
          style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee;text-transform:uppercase"></div>
      <div style="flex:1;min-width:180px"><label style="color:#9aa;font-size:0.72rem">Motivo</label>
        <input id="pl-motivo" placeholder="ex.: inadimplência, veículo não pertence à frota"
          style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee"></div>
      <div style="width:140px"><label style="color:#9aa;font-size:0.72rem">Quem bloqueia</label>
        <input id="pl-autor" placeholder="seu nome"
          style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#eee"></div>
      <button onclick="placaBloquear()" style="padding:9px 16px;border-radius:6px;border:none;background:#7f1d1d;color:#fff;font-weight:700;cursor:pointer">Bloquear</button>
    </div>
    <div id="pl-msg" style="color:#f87171;font-size:0.78rem;min-height:18px"></div>
    <div id="pl-lista" style="max-height:44vh;overflow:auto"><p style="color:#666;padding:10px">Carregando…</p></div>
    <button onclick="document.getElementById('placas-modal').remove()"
      style="width:100%;margin-top:12px;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#aaa;cursor:pointer">Fechar</button>
  </div>`;
  document.body.appendChild(div);
  window._plEid = eid;
  placasListar();
}

async function placasListar() {
  const box = document.getElementById('pl-lista');
  if (!box) return;
  let dados = [];
  try {
    const { data, error } = await sb.from('oct_placas_bloqueadas')
      .select('*').eq('empresa_id', window._plEid).order('criado_em', { ascending: false });
    if (error) throw error;
    dados = data || [];
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171;padding:10px;font-size:0.82rem">Tabela oct_placas_bloqueadas não existe ainda — rode a migração SQL.</p>`;
    return;
  }
  const ativas = dados.filter(d => d.ativo !== false);
  const soltas = dados.filter(d => d.ativo === false);
  const linha = (d, bloqueada) => `<tr style="border-bottom:1px solid #1c1f2e">
    <td style="padding:8px 10px;font-weight:700;font-family:monospace;font-size:0.95rem;color:${bloqueada ? '#f87171' : '#4ade80'}">${_plFmt(d.placa)}</td>
    <td style="padding:8px 10px;color:#9aa;font-size:0.82rem">${d.motivo || '—'}</td>
    <td style="padding:8px 10px;color:#667;font-size:0.76rem">${d.autor || '—'}<br>${d.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : ''}</td>
    <td style="padding:8px 10px;text-align:right">
      ${bloqueada
        ? `<button onclick="placaLiberar('${d.id}')" style="padding:5px 12px;border-radius:5px;border:none;background:#14532d;color:#4ade80;cursor:pointer;font-size:0.76rem">✓ Liberar</button>`
        : `<span style="color:#4ade80;font-size:0.76rem">liberada</span>`}
    </td></tr>`;
  box.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
      <thead><tr style="color:#888;background:#0f1119;text-align:left">
        <th style="padding:7px 10px">Placa</th><th style="padding:7px 10px">Motivo</th>
        <th style="padding:7px 10px">Por / quando</th><th></th></tr></thead>
      <tbody>
        ${ativas.map(d => linha(d, true)).join('') || '<tr><td colspan="4" style="padding:14px;color:#666">Nenhuma placa bloqueada.</td></tr>'}
        ${soltas.length ? `<tr><td colspan="4" style="padding:10px 10px 4px;color:#667;font-size:0.76rem">— histórico (liberadas) —</td></tr>` : ''}
        ${soltas.map(d => linha(d, false)).join('')}
      </tbody></table>`;
}

async function placaBloquear() {
  const msg = document.getElementById('pl-msg');
  const placa = _plNorm(document.getElementById('pl-placa').value);
  const motivo = (document.getElementById('pl-motivo').value || '').trim();
  const autor = (document.getElementById('pl-autor').value || '').trim();
  if (placa.length < 7) { msg.textContent = 'Placa inválida (7 caracteres, ex.: ABC1234 ou ABC1D23).'; return; }
  if (!motivo) { msg.textContent = 'Informe o motivo do bloqueio.'; return; }
  if (!autor) { msg.textContent = 'Informe quem está bloqueando.'; return; }
  msg.style.color = '#9aa'; msg.textContent = 'Bloqueando…';
  const { error } = await sb.from('oct_placas_bloqueadas').insert({
    empresa_id: window._plEid, placa, motivo, autor, ativo: true,
  });
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  msg.style.color = '#4ade80'; msg.textContent = `Placa ${_plFmt(placa)} bloqueada.`;
  document.getElementById('pl-placa').value = '';
  document.getElementById('pl-motivo').value = '';
  placasListar();
}

async function placaLiberar(id) {
  if (!confirm('Liberar esta placa? Ela volta a poder abastecer a prazo.')) return;
  const { error } = await sb.from('oct_placas_bloqueadas')
    .update({ ativo: false, liberado_em: new Date().toISOString() }).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  placasListar();
}
