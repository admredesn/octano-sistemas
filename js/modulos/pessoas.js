
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
      </div>
      <div class="form-acoes">
        <button onclick="salvarPessoa('${id||''}','${empresaId}')" class="btn-salvar">💾 Salvar</button>
        <button onclick="document.getElementById('form-pessoa').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
        ${id ? `<button onclick="excluirPessoa('${id}')" style="padding:10px 20px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>` : ''}
        <span id="fpe-msg" class="form-msg"></span>
      </div>
    </div>
  `;
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
