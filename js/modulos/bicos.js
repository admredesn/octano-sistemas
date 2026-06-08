// ============================================================
// OCTANO RETAGUARDA - Cadastro de BICOS (vinculo codigo_hex -> bico)
// ============================================================
// Cada bico pertence a um tanque (oct_tanques) e tem um codigo_hex que e
// o identificador enviado pelo concentrador Companytec/Horustech (ex "0D").
// O agente local usa esse cadastro para traduzir o codigo recebido no
// abastecimento para o bico/tanque corretos.
//
// Integra-se ao modulo Tanques: abre a partir do card do tanque.
// Depende dos mesmos helpers do retaguarda (sb, getSession, abrirModal-like).
// ============================================================

// Abre o gerenciador de bicos de um tanque especifico
async function abrirBicosTanque(tanqueId, tanqueNumero, combustivel) {
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;

  const { data: bicos } = await sb
    .from('oct_bicos')
    .select('*')
    .eq('tanque_id', tanqueId)
    .order('numero');

  const lista = (bicos || []).map(b => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #2a2d3e">B${b.numero}</td>
      <td style="padding:8px;border-bottom:1px solid #2a2d3e">
        <code style="background:#1e2235;padding:2px 8px;border-radius:4px;color:#f97316">${b.codigo_hex || '—'}</code>
      </td>
      <td style="padding:8px;border-bottom:1px solid #2a2d3e">${b.bomba ?? '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #2a2d3e">
        ${b.ativo === false ? '<span style="color:#888">inativo</span>' : '<span style="color:#4caf50">ativo</span>'}
      </td>
      <td style="padding:8px;border-bottom:1px solid #2a2d3e;text-align:right">
        <button onclick='editarBico(${JSON.stringify(b).replace(/'/g, "&#39;")}, "${tanqueId}", ${tanqueNumero}, "${combustivel}")'
          style="padding:4px 10px;border-radius:5px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">✏️</button>
        <button onclick='excluirBico("${b.id}", "${tanqueId}", ${tanqueNumero}, "${combustivel}")'
          style="padding:4px 10px;border-radius:5px;border:1px solid #f44;background:transparent;color:#f44;cursor:pointer">🗑</button>
      </td>
    </tr>
  `).join('');

  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = `
    <div class="modulo-container" style="max-width:760px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="modulo-header" style="margin-bottom:0;border:none">
          <h2>🔫 Bicos do Tanque ${tanqueNumero}</h2>
        </div>
        <button onclick="moduloTanques()" style="padding:8px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">← Voltar aos tanques</button>
      </div>
      <p style="color:#888;font-size:0.85rem;margin-bottom:18px">
        ${combustivel} — vincule o <strong>código hexadecimal</strong> que o concentrador envia a cada bico.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#1a1d2b;color:#aaa;font-size:0.8rem">
            <th style="padding:10px;text-align:left">Bico</th>
            <th style="padding:10px;text-align:left">Código Hex</th>
            <th style="padding:10px;text-align:left">Bomba</th>
            <th style="padding:10px;text-align:left">Status</th>
            <th style="padding:10px;text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${lista || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#555">Nenhum bico cadastrado neste tanque</td></tr>`}
        </tbody>
      </table>

      <button onclick='abrirFormBico("${tanqueId}", ${tanqueNumero}, "${combustivel}")' class="btn-salvar" style="margin-top:16px;padding:8px 18px">+ Novo Bico</button>

      <div id="form-bico" style="display:none;margin-top:24px">
        <div class="modulo-header"><h2 id="form-bico-titulo">➕ Novo Bico</h2></div>
        <div class="form-grid" style="max-width:560px">
          <input type="hidden" id="bico-id" />
          <input type="hidden" id="bico-tanque-id" value="${tanqueId}" />
          <div class="form-group">
            <label>Número do bico *</label>
            <input id="bico-numero" type="number" min="1" placeholder="2" />
          </div>
          <div class="form-group">
            <label>Código Hex (do concentrador) *</label>
            <input id="bico-codigo-hex" type="text" maxlength="4" placeholder="ex: 0D" style="text-transform:uppercase" />
          </div>
          <div class="form-group">
            <label>Bomba (opcional)</label>
            <input id="bico-bomba" type="number" min="1" placeholder="1" />
          </div>
          <div class="form-group">
            <label>Ativo</label>
            <select id="bico-ativo">
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        </div>
        <div style="background:#1a1d2b;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-top:12px;max-width:560px">
          <p style="color:#888;font-size:0.78rem;margin:0">
            💡 O <strong>código hex</strong> aparece no agente local (modo --sniff) ou na aba
            "Bicos &lt;-&gt; Cod Bico" do HRSConsole. É o identificador único que o concentrador
            envia em cada abastecimento.
          </p>
        </div>
        <div class="form-acoes">
          <button class="btn-salvar" onclick="salvarBico()">💾 Salvar</button>
          <button onclick="document.getElementById('form-bico').style.display='none'" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
          <span id="bico-msg" class="form-msg"></span>
        </div>
      </div>
    </div>
  `;
  // guarda contexto para recarregar apos salvar
  window.__bicoCtx = { tanqueId, tanqueNumero, combustivel };
}

function abrirFormBico(tanqueId, tanqueNumero, combustivel) {
  document.getElementById('form-bico').style.display = 'block';
  document.getElementById('form-bico').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('form-bico-titulo').textContent = '➕ Novo Bico';
  document.getElementById('bico-id').value = '';
  document.getElementById('bico-tanque-id').value = tanqueId;
  document.getElementById('bico-numero').value = '';
  document.getElementById('bico-codigo-hex').value = '';
  document.getElementById('bico-bomba').value = '';
  document.getElementById('bico-ativo').value = 'true';
}

function editarBico(b, tanqueId, tanqueNumero, combustivel) {
  document.getElementById('form-bico').style.display = 'block';
  document.getElementById('form-bico').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('form-bico-titulo').textContent = `✏️ Editar Bico ${b.numero}`;
  document.getElementById('bico-id').value = b.id;
  document.getElementById('bico-tanque-id').value = tanqueId;
  document.getElementById('bico-numero').value = b.numero;
  document.getElementById('bico-codigo-hex').value = b.codigo_hex || '';
  document.getElementById('bico-bomba').value = b.bomba ?? '';
  document.getElementById('bico-ativo').value = (b.ativo === false) ? 'false' : 'true';
}

async function salvarBico() {
  const msg = document.getElementById('bico-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();

  const codigoHex = (document.getElementById('bico-codigo-hex').value || '').trim().toUpperCase();
  const dados = {
    empresa_id: perfil.empresa_id,
    tanque_id: document.getElementById('bico-tanque-id').value,
    numero: parseInt(document.getElementById('bico-numero').value),
    codigo_hex: codigoHex || null,
    bomba: parseInt(document.getElementById('bico-bomba').value) || null,
    ativo: document.getElementById('bico-ativo').value === 'true',
  };

  if (!dados.numero || !dados.codigo_hex) {
    msg.textContent = 'Preencha número e código hex.'; msg.style.color = '#f44'; return;
  }
  // valida formato do hex (1-4 digitos hexadecimais)
  if (!/^[0-9A-F]{1,4}$/.test(dados.codigo_hex)) {
    msg.textContent = 'Código hex inválido (use 0-9 e A-F, ex: 0D).'; msg.style.color = '#f44'; return;
  }

  const id = document.getElementById('bico-id').value;
  let error;
  if (id) {
    ({ error } = await sb.from('oct_bicos').update(dados).eq('id', id));
  } else {
    ({ error } = await sb.from('oct_bicos').insert(dados));
  }

  if (error) {
    // erro tipico: codigo_hex duplicado na empresa (indice unico)
    if ((error.message || '').toLowerCase().includes('uniq') || error.code === '23505') {
      msg.textContent = 'Este código hex já está vinculado a outro bico nesta empresa.';
    } else {
      msg.textContent = 'Erro: ' + error.message;
    }
    msg.style.color = '#f44'; return;
  }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  const ctx = window.__bicoCtx;
  setTimeout(() => abrirBicosTanque(ctx.tanqueId, ctx.tanqueNumero, ctx.combustivel), 700);
}

async function excluirBico(id, tanqueId, tanqueNumero, combustivel) {
  if (!confirm('Excluir este bico? O agente deixará de reconhecer o código hex vinculado a ele.')) return;
  await sb.from('oct_bicos').delete().eq('id', id);
  abrirBicosTanque(tanqueId, tanqueNumero, combustivel);
}
