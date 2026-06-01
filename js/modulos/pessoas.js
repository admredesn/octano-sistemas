
// ============================================================
// MODULO PESSOAS — cadastro de fornecedores e clientes (grid)
// ============================================================

async function moduloPessoas() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._pessoasEmpresaId = empresaId;

  const { data: pessoas } = await sb
    .from('oct_pessoas').select('*')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('nome');

  window._todasPessoas = pessoas || [];

  conteudo.innerHTML = `
    <div id="form-pessoa" style="display:none;margin-bottom:16px"></div>
    <div id="grid-pessoas"></div>
  `;

  const CORES_TIPO = { fornecedor:'#f97316', cliente:'#4caf50', ambos:'#60a5fa', transportadora:'#a78bfa' };
  const badge = (tipo) => {
    const c = CORES_TIPO[tipo] || '#888';
    return `<span class="og-badge" style="background:#1e2235;color:${c}">${tipo||'—'}</span>`;
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
    dados: window._todasPessoas,
    acoes: [
      { rotulo: 'Nova Pessoa', ico: '＋', onClick: `abrirFormPessoa(null,'${empresaId}')` },
    ],
    colunas: [
      { campo: 'nome', titulo: 'Nome / Razão Social', largura: '260px' },
      { titulo: 'Tipo', largura: '120px', valor: (p)=> p.tipo||'', render: (v)=> badge(v) },
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

  const tipos = ['fornecedor','cliente','ambos','transportadora'];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#60a5fa;font-size:0.95rem">${id ? '✏️ Editar pessoa' : '+ Nova pessoa'}</h3>
        <button onclick="document.getElementById('form-pessoa').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Nome / Razão Social *</label><input id="fpe-nome" type="text" value="${p?.nome||''}" /></div>
        <div class="form-group">
          <label>Tipo</label>
          <select id="fpe-tipo">
            ${tipos.map(t=>`<option value="${t}" ${ (p?.tipo||'fornecedor')===t ? 'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>CNPJ / CPF</label><input id="fpe-doc" type="text" value="${p?.documento||''}" /></div>
        <div class="form-group"><label>Inscrição Estadual</label><input id="fpe-ie" type="text" value="${p?.ie||''}" /></div>
        <div class="form-group"><label>Telefone</label><input id="fpe-tel" type="text" value="${p?.telefone||''}" /></div>
        <div class="form-group span2"><label>E-mail</label><input id="fpe-email" type="text" value="${p?.email||''}" /></div>
        <div class="form-group span2"><label>Endereço</label><input id="fpe-end" type="text" value="${p?.endereco||''}" /></div>
        <div class="form-group"><label>Cidade</label><input id="fpe-cidade" type="text" value="${p?.cidade||''}" /></div>
        <div class="form-group"><label>UF</label><input id="fpe-uf" type="text" maxlength="2" value="${p?.uf||''}" style="text-transform:uppercase" /></div>
        <div class="form-group span2"><label>Observações</label><input id="fpe-obs" type="text" value="${p?.observacoes||''}" /></div>
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

async function salvarPessoa(id, empresaId) {
  const msg = document.getElementById('fpe-msg');
  const nome = document.getElementById('fpe-nome').value.trim();
  if (!nome) { msg.textContent = 'Nome obrigatório.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const dados = {
    empresa_id: empresaId, nome,
    tipo:        document.getElementById('fpe-tipo').value,
    documento:   document.getElementById('fpe-doc').value.trim() || null,
    ie:          document.getElementById('fpe-ie').value.trim() || null,
    telefone:    document.getElementById('fpe-tel').value.trim() || null,
    email:       document.getElementById('fpe-email').value.trim() || null,
    endereco:    document.getElementById('fpe-end').value.trim() || null,
    cidade:      document.getElementById('fpe-cidade').value.trim() || null,
    uf:          document.getElementById('fpe-uf').value.trim().toUpperCase() || null,
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
