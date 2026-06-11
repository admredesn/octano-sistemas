// ============================================================
// MÓDULO FORMAS DE PAGAMENTO — retaguarda
// Sub-abas: (1) Forma de recebimento  (2) Tabela de preço
// ============================================================

const FP_SEFAZ = [
  { c: '01', n: 'Dinheiro' }, { c: '02', n: 'Cheque' }, { c: '03', n: 'Cartão de Crédito' },
  { c: '04', n: 'Cartão de Débito' }, { c: '05', n: 'Crédito Loja' }, { c: '15', n: 'Boleto' },
  { c: '17', n: 'PIX' }, { c: '18', n: 'Transferência' }, { c: '90', n: 'Sem pagamento' }, { c: '99', n: 'Outros' },
];

async function moduloFormasPagamento() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._fpEmpresaId = perfil.empresa_id;

  conteudo.innerHTML = `
    <div style="padding:14px 20px">
      <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid #2a2d3e">
        <button id="fp-tab-receb" onclick="fpAba('receb')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#f97316;border-bottom:2px solid #f97316;cursor:pointer;font-weight:500">Forma de recebimento</button>
        <button id="fp-tab-preco" onclick="fpAba('preco')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#888;border-bottom:2px solid transparent;cursor:pointer">Tabela de preço</button>
      </div>
      <div id="fp-conteudo"></div>
    </div>`;
  fpAba('receb');
}

function fpAba(qual) {
  document.getElementById('fp-tab-receb').style.color = qual === 'receb' ? '#f97316' : '#888';
  document.getElementById('fp-tab-receb').style.borderBottomColor = qual === 'receb' ? '#f97316' : 'transparent';
  document.getElementById('fp-tab-preco').style.color = qual === 'preco' ? '#f97316' : '#888';
  document.getElementById('fp-tab-preco').style.borderBottomColor = qual === 'preco' ? '#f97316' : 'transparent';
  if (qual === 'receb') fpReceberListar(); else fpPrecoListar();
}

// ===================== FORMA DE RECEBIMENTO =====================
async function fpReceberListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  const { data } = await sb.from('oct_formas_pagamento').select('*').eq('empresa_id', eid).order('ordem');
  const rows = data || [];
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:#888;font-size:0.84rem">Formas sincronizadas automaticamente com o PDV.</p>
      <button onclick="fpReceberForm()" class="btn-salvar">+ Nova forma</button>
    </div>
    <div id="fp-receb-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Ordem</th><th style="padding:10px 12px">Nome</th>
          <th style="padding:10px 12px">Código SEFAZ</th><th style="padding:10px 12px">A prazo</th>
          <th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(f => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px">${f.ordem}</td>
            <td style="padding:9px 12px;font-weight:500">${fpEsc(f.nome)}</td>
            <td style="padding:9px 12px"><span style="font-family:monospace;color:#7dd3fc">${f.cod_sefaz}</span> ${fpSefazNome(f.cod_sefaz)}</td>
            <td style="padding:9px 12px">${f.a_prazo ? '<span style="color:#fbbf24">sim</span>' : '—'}</td>
            <td style="padding:9px 12px">${f.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpReceberForm(${JSON.stringify(f).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">Editar</button>
              <button onclick="fpReceberExcluir('${f.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhuma forma cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function fpReceberForm(f) {
  f = f || {};
  const div = document.getElementById('fp-receb-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${f.id ? 'Editar' : 'Nova'} forma de recebimento</h3>
      <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome</label>
          <input id="fpr-nome" value="${fpEsc(f.nome) || ''}" placeholder="ex: Cartão de Débito" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Código SEFAZ (NFC-e)</label>
          <select id="fpr-sefaz" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            ${FP_SEFAZ.map(s => `<option value="${s.c}" ${f.cod_sefaz === s.c ? 'selected' : ''}>${s.c} - ${s.n}</option>`).join('')}
          </select></div>
        <div><label style="color:#888;font-size:0.78rem">Ordem</label>
          <input id="fpr-ordem" type="number" value="${f.ordem ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:18px;align-items:center">
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-prazo" ${f.a_prazo ? 'checked' : ''}> Forma a prazo (fiado)</label>
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-ativo" ${f.ativo !== false ? 'checked' : ''}> Ativo</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpReceberSalvar('${f.id || ''}')" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('fp-receb-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpr-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
}

async function fpReceberSalvar(id) {
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpr-nome').value.trim();
  const msg = document.getElementById('fpr-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome.'; return; }
  const reg = {
    empresa_id: eid, nome,
    cod_sefaz: document.getElementById('fpr-sefaz').value,
    ordem: parseInt(document.getElementById('fpr-ordem').value) || 0,
    a_prazo: document.getElementById('fpr-prazo').checked,
    ativo: document.getElementById('fpr-ativo').checked,
  };
  const q = id ? sb.from('oct_formas_pagamento').update(reg).eq('id', id)
               : sb.from('oct_formas_pagamento').insert(reg);
  const { error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  document.getElementById('fp-receb-form').innerHTML = '';
  fpReceberListar();
}

async function fpReceberExcluir(id) {
  if (!confirm('Excluir esta forma de recebimento?')) return;
  const { error } = await sb.from('oct_formas_pagamento').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpReceberListar();
}

// ===================== TABELA DE PREÇO =====================
async function fpPrecoListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  const [{ data: tabs }, { data: formas }] = await Promise.all([
    sb.from('oct_tabelas_preco').select('*').eq('empresa_id', eid).order('ordem'),
    sb.from('oct_formas_pagamento').select('id,nome').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
  ]);
  window._fpFormas = formas || [];
  const rows = tabs || [];
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:#888;font-size:0.84rem">Cada condição aplica desconto/acréscimo sobre o preço de venda do produto.</p>
      <button onclick="fpPrecoForm()" class="btn-salvar">+ Nova condição</button>
    </div>
    <div id="fp-preco-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Condição</th><th style="padding:10px 12px">Ajuste</th>
          <th style="padding:10px 12px">Valor</th><th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(t => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px;font-weight:500">${fpEsc(t.nome)}</td>
            <td style="padding:9px 12px">${fpAjusteLabel(t.tipo_ajuste)}</td>
            <td style="padding:9px 12px">${fpValorLabel(t)}</td>
            <td style="padding:9px 12px">${t.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpPrecoForm(${JSON.stringify(t).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">Editar</button>
              <button onclick="fpExcecoesAbrir('${t.id}','${fpEsc(t.nome)}')" class="nfe-aba" style="font-size:0.76rem;color:#7dd3fc">Exceções por produto</button>
              <button onclick="fpPrecoExcluir('${t.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="5" style="padding:22px;text-align:center;color:#666">Nenhuma condição cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div id="fp-excecoes"></div>`;
}

function fpPrecoForm(t) {
  t = t || {};
  const div = document.getElementById('fp-preco-form');
  const formas = window._fpFormas || [];
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${t.id ? 'Editar' : 'Nova'} condição de pagamento</h3>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome da condição</label>
          <input id="fpp-nome" value="${fpEsc(t.nome) || ''}" placeholder="ex: À vista, A prazo 30d" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Tipo de ajuste</label>
          <select id="fpp-tipo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="nenhum" ${t.tipo_ajuste === 'nenhum' || !t.tipo_ajuste ? 'selected' : ''}>Nenhum</option>
            <option value="desconto" ${t.tipo_ajuste === 'desconto' ? 'selected' : ''}>Desconto</option>
            <option value="acrescimo" ${t.tipo_ajuste === 'acrescimo' ? 'selected' : ''}>Acréscimo</option>
          </select></div>
        <div><label style="color:#888;font-size:0.78rem">Modo</label>
          <select id="fpp-modo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="percentual" ${t.modo_ajuste === 'percentual' || !t.modo_ajuste ? 'selected' : ''}>Percentual (%)</option>
            <option value="fixo" ${t.modo_ajuste === 'fixo' ? 'selected' : ''}>Valor fixo (R$)</option>
          </select></div>
        <div><label style="color:#888;font-size:0.78rem">Valor</label>
          <input id="fpp-valor" type="number" step="0.0001" value="${t.valor_ajuste ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px">
        <div><label style="color:#888;font-size:0.78rem">Forma de recebimento sugerida (opcional)</label>
          <select id="fpp-forma" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="">— nenhuma —</option>
            ${formas.map(fm => `<option value="${fm.id}" ${t.forma_padrao === fm.id ? 'selected' : ''}>${fpEsc(fm.nome)}</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:flex-end"><label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpp-ativo" ${t.ativo !== false ? 'checked' : ''}> Ativo</label></div>
      </div>
      <div style="background:#0f1119;border-radius:8px;padding:10px;margin-top:12px;font-size:0.8rem;color:#9aa">
        <strong style="color:#ddd">Exemplo:</strong> produto com preço R$ 5,00 →
        <span id="fpp-exemplo" style="color:#4ade80">R$ 5,00</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpPrecoSalvar('${t.id || ''}')" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpp-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
  ['fpp-tipo', 'fpp-modo', 'fpp-valor'].forEach(id => document.getElementById(id).addEventListener('input', fpAtualizarExemplo));
  fpAtualizarExemplo();
}

function fpAtualizarExemplo() {
  const tipo = document.getElementById('fpp-tipo').value;
  const modo = document.getElementById('fpp-modo').value;
  const valor = parseFloat(document.getElementById('fpp-valor').value) || 0;
  const base = 5.00;
  const final = fpCalcular(base, tipo, modo, valor);
  document.getElementById('fpp-exemplo').textContent = 'R$ ' + final.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// cálculo central: aplica ajuste sobre o preço base
function fpCalcular(base, tipo, modo, valor) {
  if (tipo === 'nenhum' || !valor) return base;
  let ajuste = modo === 'percentual' ? base * (valor / 100) : valor;
  return tipo === 'desconto' ? Math.max(0, base - ajuste) : base + ajuste;
}

async function fpPrecoSalvar(id) {
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpp-nome').value.trim();
  const msg = document.getElementById('fpp-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome da condição.'; return; }
  const reg = {
    empresa_id: eid, nome,
    tipo_ajuste: document.getElementById('fpp-tipo').value,
    modo_ajuste: document.getElementById('fpp-modo').value,
    valor_ajuste: parseFloat(document.getElementById('fpp-valor').value) || 0,
    forma_padrao: document.getElementById('fpp-forma').value || null,
    ativo: document.getElementById('fpp-ativo').checked,
  };
  const q = id ? sb.from('oct_tabelas_preco').update(reg).eq('id', id)
               : sb.from('oct_tabelas_preco').insert(reg);
  const { error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  document.getElementById('fp-preco-form').innerHTML = '';
  fpPrecoListar();
}

async function fpPrecoExcluir(id) {
  if (!confirm('Excluir esta condição? As exceções por produto também serão removidas.')) return;
  const { error } = await sb.from('oct_tabelas_preco').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpPrecoListar();
}

// ---------- EXCEÇÕES POR PRODUTO ----------
async function fpExcecoesAbrir(tabelaId, nomeTab) {
  const div = document.getElementById('fp-excecoes');
  const eid = window._fpEmpresaId;
  const [{ data: prods }, { data: exc }, { data: tab }] = await Promise.all([
    sb.from('oct_produtos').select('id,nome,codigo,preco_venda_a').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    sb.from('oct_tabela_preco_itens').select('*').eq('tabela_id', tabelaId),
    sb.from('oct_tabelas_preco').select('*').eq('id', tabelaId).single(),
  ]);
  const excMap = {}; (exc || []).forEach(e => excMap[e.produto_id] = e);
  window._fpExcTabela = tab;
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="color:#7dd3fc">Exceções por produto — ${fpEsc(nomeTab)}</h3>
        <button onclick="document.getElementById('fp-excecoes').innerHTML=''" class="nfe-aba">Fechar</button>
      </div>
      <p style="color:#888;font-size:0.8rem;margin-bottom:12px">Em branco = usa o ajuste global da condição. Preenchido = sobrepõe só para aquele produto.</p>
      <div style="max-height:420px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:#888;text-align:left;position:sticky;top:0;background:#0f1119">
            <th style="padding:8px 10px">Produto</th><th style="padding:8px 10px;text-align:right">Preço venda</th>
            <th style="padding:8px 10px">Ajuste</th><th style="padding:8px 10px">Modo</th>
            <th style="padding:8px 10px">Valor</th><th style="padding:8px 10px;text-align:right">Preço final</th><th></th>
          </tr></thead>
          <tbody>
          ${(prods || []).map(p => {
            const e = excMap[p.id];
            const base = Number(p.preco_venda_a || 0);
            const temExc = !!e;
            const tipo = e?.tipo_ajuste || tab.tipo_ajuste;
            const modo = e?.modo_ajuste || tab.modo_ajuste;
            const valor = e ? Number(e.valor_ajuste) : Number(tab.valor_ajuste);
            const final = fpCalcular(base, tipo, modo, valor);
            return `<tr style="border-top:1px solid #1c1f2e;color:#ddd" data-pid="${p.id}">
              <td style="padding:6px 10px">${fpEsc(p.nome)}</td>
              <td style="padding:6px 10px;text-align:right;color:#9aa">${base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td style="padding:6px 10px"><select class="exc-tipo" style="padding:5px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
                <option value="" ${!temExc ? 'selected' : ''}>(global)</option>
                <option value="desconto" ${e?.tipo_ajuste === 'desconto' ? 'selected' : ''}>Desconto</option>
                <option value="acrescimo" ${e?.tipo_ajuste === 'acrescimo' ? 'selected' : ''}>Acréscimo</option>
              </select></td>
              <td style="padding:6px 10px"><select class="exc-modo" style="padding:5px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
                <option value="percentual" ${e?.modo_ajuste !== 'fixo' ? 'selected' : ''}>%</option>
                <option value="fixo" ${e?.modo_ajuste === 'fixo' ? 'selected' : ''}>R$</option>
              </select></td>
              <td style="padding:6px 10px"><input class="exc-valor" type="number" step="0.0001" value="${e ? e.valor_ajuste : ''}" placeholder="—" style="width:80px;padding:5px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem"></td>
              <td style="padding:6px 10px;text-align:right;color:#4ade80;font-weight:500 exc-final">${final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td style="padding:6px 10px"></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="fpExcecoesSalvar('${tabelaId}')" class="btn-salvar">Salvar exceções</button>
      </div>
      <div id="fp-exc-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
}

async function fpExcecoesSalvar(tabelaId) {
  const eid = window._fpEmpresaId;
  const msg = document.getElementById('fp-exc-msg');
  msg.style.color = '#888'; msg.textContent = 'Salvando...';
  const linhas = [...document.querySelectorAll('#fp-excecoes tr[data-pid]')];
  const inserts = [];
  const idsComExc = [];
  linhas.forEach(tr => {
    const pid = tr.dataset.pid;
    const tipo = tr.querySelector('.exc-tipo').value;
    const valorRaw = tr.querySelector('.exc-valor').value;
    if (!tipo || valorRaw === '') return; // sem exceção -> usa global
    idsComExc.push(pid);
    inserts.push({
      empresa_id: eid, tabela_id: tabelaId, produto_id: pid,
      tipo_ajuste: tipo, modo_ajuste: tr.querySelector('.exc-modo').value,
      valor_ajuste: parseFloat(valorRaw) || 0,
    });
  });
  // estratégia simples: apaga todas as exceções da tabela e regrava as preenchidas
  await sb.from('oct_tabela_preco_itens').delete().eq('tabela_id', tabelaId);
  if (inserts.length) {
    const { error } = await sb.from('oct_tabela_preco_itens').insert(inserts);
    if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  }
  msg.style.color = '#4caf50'; msg.textContent = `${inserts.length} exceção(ões) salva(s).`;
}

// ---------- utils ----------
function fpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fpSefazNome(c) { const x = FP_SEFAZ.find(s => s.c === c); return x ? x.n : ''; }
function fpAjusteLabel(t) { return t === 'desconto' ? '<span style="color:#4ade80">Desconto</span>' : t === 'acrescimo' ? '<span style="color:#fbbf24">Acréscimo</span>' : '<span style="color:#888">Nenhum</span>'; }
function fpValorLabel(t) { if (t.tipo_ajuste === 'nenhum') return '—'; return t.modo_ajuste === 'percentual' ? Number(t.valor_ajuste) + '%' : 'R$ ' + Number(t.valor_ajuste).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
