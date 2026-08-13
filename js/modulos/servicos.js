// Cadastro de SERVIÇOS (para NFS-e): lava-jato, troca de óleo, borracharia,
// lubrificação, etc. Cada serviço leva o código da Lista LC 116 + alíquota ISS
// do município, usados na emissão da Nota de Serviço. Tabela: oct_servicos.
// Modelado no padrão de produtos.js (octanoGrid + form + save).

async function moduloServicos() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva === 'function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._servicosEmpresaId = empresaId;

  const { data: servicos } = await sb.from('oct_servicos').select('*')
    .eq('empresa_id', empresaId).eq('ativo', true).order('nome');
  window._todosServicos = servicos || [];

  conteudo.innerHTML = `
    <div id="form-servico" style="display:none;margin-bottom:16px"></div>
    <div id="grid-servicos"></div>
  `;

  octanoGrid({
    montarEm: 'grid-servicos',
    titulo: 'Serviços (NFS-e)',
    aoFechar: "navegarPara('empresa')",
    rodapeDireita: perfil?.oct_empresas?.nome || '',
    dados: window._todosServicos,
    acoes: [
      { rotulo: 'Novo Serviço', ico: '＋', onClick: `abrirFormServico(null,'${empresaId}')` },
    ],
    colunas: [
      { campo: 'nome', titulo: 'Serviço', largura: '240px' },
      { campo: 'codigo_lc116', titulo: 'LC 116', largura: '90px', render: (v) => v || '—' },
      { campo: 'aliquota_iss', titulo: 'ISS %', align: 'right', largura: '90px', render: (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%' },
      { campo: 'iss_retido', titulo: 'ISS retido', largura: '90px', render: (v) => v ? '<span style="color:#fbbf24">Sim</span>' : 'Não' },
      { campo: 'cnae', titulo: 'CNAE', largura: '110px', render: (v) => v || '—' },
      { campo: 'descricao_padrao', titulo: 'Discriminação padrão', largura: '260px', render: (v) => v || '—' },
    ],
    aoClicarLinha: (s) => abrirFormServico(s.id, window._servicosEmpresaId),
    botaoExcluir: (s) => excluirServico(s.id),
  });
}

async function abrirFormServico(id, empresaId) {
  const div = document.getElementById('form-servico');
  div.style.display = 'block';
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  div.scrollIntoView({ behavior: 'smooth' });

  let s = null;
  if (id) {
    const { data } = await sb.from('oct_servicos').select('*').eq('id', id).single();
    s = data;
  }
  window._servicoEditId = id || null;

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #3a2a6a;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:#a78bfa;font-size:0.95rem">${id ? '✏️ Editar serviço' : '+ Novo serviço'}</h3>
        <button onclick="document.getElementById('form-servico').style.display='none'" style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1.3rem">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group span2"><label>Nome do serviço *</label><input id="fs-nome" type="text" value="${_svEsc(s?.nome)}" placeholder="ex: Lava-jato completo" /></div>
        <div class="form-group">
          <label>Item da Lista LC 116</label>
          <input id="fs-lc116" type="text" value="${_svEsc(s?.codigo_lc116)}" placeholder="ex: 14.01" />
          <span style="font-size:0.72rem;color:#555;display:block;margin-top:2px">Código do serviço na LC 116 (o contador informa)</span>
        </div>
        <div class="form-group"><label>Alíquota ISS (%)</label><input id="fs-iss" type="number" step="0.01" value="${s?.aliquota_iss ?? ''}" placeholder="ex: 3.00" /></div>
        <div class="form-group"><label>Código tributação município</label><input id="fs-codtrib" type="text" value="${_svEsc(s?.codigo_trib_mun)}" placeholder="se a prefeitura exigir" /></div>
        <div class="form-group"><label>CNAE</label><input id="fs-cnae" type="text" value="${_svEsc(s?.cnae)}" placeholder="se exigido" /></div>
        <div class="form-group">
          <label>ISS retido pelo tomador?</label>
          <select id="fs-issret">
            <option value="N" ${s?.iss_retido ? '' : 'selected'}>Não</option>
            <option value="S" ${s?.iss_retido ? 'selected' : ''}>Sim</option>
          </select>
        </div>
        <div class="form-group span2"><label>Discriminação padrão</label><input id="fs-desc" type="text" value="${_svEsc(s?.descricao_padrao)}" placeholder="texto que descreve o serviço na nota" /></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
        <button class="btn-primario" onclick="salvarServico()">💾 Salvar</button>
        <button onclick="document.getElementById('form-servico').style.display='none'" style="background:transparent;border:1px solid #333;color:#999;padding:8px 16px;border-radius:8px;cursor:pointer">Cancelar</button>
        <span id="fs-msg" style="color:#888;font-size:0.82rem"></span>
      </div>
    </div>`;
}

async function salvarServico() {
  const msg = document.getElementById('fs-msg');
  const nome = document.getElementById('fs-nome').value.trim();
  if (!nome) { msg.textContent = 'Informe o nome do serviço.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const dados = {
    empresa_id: window._servicosEmpresaId,
    nome,
    codigo_lc116: document.getElementById('fs-lc116').value.trim() || null,
    aliquota_iss: parseFloat(document.getElementById('fs-iss').value) || 0,
    codigo_trib_mun: document.getElementById('fs-codtrib').value.trim() || null,
    cnae: document.getElementById('fs-cnae').value.trim() || null,
    iss_retido: document.getElementById('fs-issret').value === 'S',
    descricao_padrao: document.getElementById('fs-desc').value.trim() || null,
    ativo: true,
  };

  let err;
  if (window._servicoEditId) {
    ({ error: err } = await sb.from('oct_servicos').update(dados).eq('id', window._servicoEditId));
  } else {
    ({ error: err } = await sb.from('oct_servicos').insert(dados));
  }
  if (err) { msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvo!'; msg.style.color = '#7be0a0';
  document.getElementById('form-servico').style.display = 'none';
  moduloServicos();
}

async function excluirServico(id) {
  if (!confirm('Excluir este serviço? (ele deixa de aparecer na emissão de NFS-e)')) return;
  const { error } = await sb.from('oct_servicos').update({ ativo: false }).eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  moduloServicos();
}

function _svEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
