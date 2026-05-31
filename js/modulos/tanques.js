
const CORES_COMBUSTIVEL = {
  'GASOLINA COMUM':    { fill: '#f59e0b', glow: '#f59e0b44' },
  'GASOLINA ADITIVADA':{ fill: '#fbbf24', glow: '#fbbf2444' },
  'ETANOL':            { fill: '#22c55e', glow: '#22c55e44' },
  'DIESEL S10':        { fill: '#64748b', glow: '#64748b44' },
  'DIESEL S500':       { fill: '#475569', glow: '#47556944' },
  'GNV':               { fill: '#3b82f6', glow: '#3b82f644' },
  'ARLA 32':           { fill: '#06b6d4', glow: '#06b6d444' },
};

function corCombustivel(comb) {
  const upper = (comb || '').toUpperCase();
  for (const [key, val] of Object.entries(CORES_COMBUSTIVEL)) {
    if (upper.includes(key)) return val;
  }
  return { fill: '#94a3b8', glow: '#94a3b844' };
}

function svgTanque(perc, cor, numero) {
  const h = 120; const w = 70;
  const nivelY = h - (h * Math.min(perc, 100) / 100);
  const corAlerta = perc <= 15 ? '#ef4444' : perc <= 30 ? '#f59e0b' : cor.fill;
  return `
    <svg width="${w}" height="${h + 30}" viewBox="0 0 ${w} ${h + 30}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="clip-tanque-${numero}">
          <rect x="5" y="10" width="${w-10}" height="${h-10}" rx="8" />
        </clipPath>
        <linearGradient id="grad-${numero}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${corAlerta}" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="${corAlerta}" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <!-- Corpo do tanque -->
      <rect x="5" y="10" width="${w-10}" height="${h-10}" rx="8" fill="#1e2235" stroke="#2a2d3e" stroke-width="1.5"/>
      <!-- Nível do combustível -->
      <rect x="5" y="${10 + nivelY}" width="${w-10}" height="${h - 10 - nivelY}" rx="4"
        fill="url(#grad-${numero})" clip-path="url(#clip-tanque-${numero})" opacity="0.9"/>
      <!-- Brilho -->
      <rect x="8" y="13" width="6" height="${h-18}" rx="3" fill="white" opacity="0.06"/>
      <!-- Topo (tampa) -->
      <rect x="22" y="4" width="${w-44}" height="8" rx="4" fill="#2a2d3e"/>
      <!-- Número -->
      <text x="${w/2}" y="${h/2 + 16}" text-anchor="middle" fill="white" font-size="22" font-weight="bold" opacity="0.9">${numero}</text>
      <!-- Percentual -->
      <text x="${w/2}" y="${h + 22}" text-anchor="middle" fill="${corAlerta}" font-size="11" font-weight="bold">${Math.round(perc)}%</text>
    </svg>
  `;
}

async function moduloTanques() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888">Carregando tanques...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = perfil?.empresa_id;

  if (!empresaId) {
    conteudo.innerHTML = '<p style="color:#f44">Configure sua empresa primeiro.</p>';
    return;
  }

  const { data: tanques } = await sb
    .from('oct_tanques')
    .select('*, oct_bicos(*)')
    .eq('empresa_id', empresaId)
    .order('numero');

  conteudo.innerHTML = `
    <div class="modulo-container" style="max-width:1100px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="modulo-header" style="margin-bottom:0;border:none"><h2>⛽ Tanques</h2></div>
        <button onclick="abrirFormTanque()" class="btn-salvar" style="padding:8px 18px">+ Novo Tanque</button>
      </div>

      ${!tanques || tanques.length === 0 ? `
        <div style="text-align:center;padding:60px;color:#555;border:2px dashed #2a2d3e;border-radius:12px">
          <div style="font-size:3rem">⛽</div>
          <p style="margin-top:12px">Nenhum tanque cadastrado</p>
          <button onclick="abrirFormTanque()" class="btn-salvar" style="margin-top:16px">+ Cadastrar primeiro tanque</button>
        </div>
      ` : `
        <div class="tanques-grid">
          ${tanques.map(t => {
            const perc = t.capacidade > 0 ? (t.estoque_atual / t.capacidade) * 100 : 0;
            const cor = corCombustivel(t.combustivel);
            const bicos = t.oct_bicos || [];
            const alerta = perc <= 15 ? 'tanque-alerta' : perc <= 30 ? 'tanque-aviso' : '';
            return `
              <div class="tanque-card ${alerta}" onclick="abrirFormTanque(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                <div class="tanque-svg">${svgTanque(perc, cor, t.numero)}</div>
                <div class="tanque-info">
                  <div class="tanque-numero">Tanque ${t.numero}</div>
                  <div class="tanque-comb" style="color:${cor.fill}">${t.combustivel}</div>
                  <div class="tanque-litros">
                    <span>${Number(t.estoque_atual).toLocaleString('pt-BR', {maximumFractionDigits:0})} L</span>
                    <span style="color:#555"> / ${Number(t.capacidade).toLocaleString('pt-BR', {maximumFractionDigits:0})} L</span>
                  </div>
                  ${perc <= 15 ? '<div class="tanque-badge alerta">⚠️ Estoque crítico</div>' :
                    perc <= 30 ? '<div class="tanque-badge aviso">📉 Estoque baixo</div>' : ''}
                  <div class="tanque-bicos">
                    ${bicos.map(b => `<span class="bico-tag">B${b.numero}</span>`).join('')}
                    ${bicos.length === 0 ? '<span style="color:#555;font-size:0.75rem">Sem bicos</span>' : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}

      <div id="form-tanque" style="display:none;margin-top:28px">
        <div class="modulo-header"><h2 id="form-tanque-titulo">➕ Novo Tanque</h2></div>
        <div class="form-grid" style="max-width:600px">
          <input type="hidden" id="tanque-id" />
          <div class="form-group">
            <label>Número *</label>
            <input id="tanque-numero" type="number" min="1" placeholder="1" />
          </div>
          <div class="form-group">
            <label>Combustível *</label>
            <select id="tanque-combustivel">
              <option value="">Selecione...</option>
              <option>GASOLINA COMUM</option>
              <option>GASOLINA ADITIVADA</option>
              <option>ETANOL</option>
              <option>DIESEL S10</option>
              <option>DIESEL S500</option>
              <option>GNV</option>
              <option>ARLA 32</option>
            </select>
          </div>
          <div class="form-group">
            <label>Capacidade (litros) *</label>
            <input id="tanque-capacidade" type="number" min="0" step="0.001" placeholder="15000" />
          </div>
          <div class="form-group">
            <label>Estoque Atual (litros)</label>
            <input id="tanque-estoque" type="number" min="0" step="0.001" placeholder="0" />
          </div>
          <div class="form-group">
            <label>Estoque Mínimo (litros)</label>
            <input id="tanque-minimo" type="number" min="0" step="0.001" placeholder="2000" />
          </div>
          <div class="form-group">
            <label>Observações</label>
            <input id="tanque-obs" type="text" placeholder="Opcional" />
          </div>
        </div>
        <div class="form-acoes">
          <button class="btn-salvar" onclick="salvarTanque()">💾 Salvar</button>
          <button onclick="fecharFormTanque()" style="padding:10px 20px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
          <button id="btn-excluir-tanque" onclick="excluirTanque()" style="display:none;padding:10px 20px;border-radius:6px;border:1px solid #f44;background:transparent;color:#f44;cursor:pointer">🗑 Excluir</button>
          <span id="tanque-msg" class="form-msg"></span>
        </div>
      </div>
    </div>
  `;
}

function abrirFormTanque(t) {
  document.getElementById('form-tanque').style.display = 'block';
  document.getElementById('form-tanque').scrollIntoView({ behavior: 'smooth' });
  if (t) {
    document.getElementById('form-tanque-titulo').textContent = `✏️ Editar Tanque ${t.numero}`;
    document.getElementById('tanque-id').value = t.id;
    document.getElementById('tanque-numero').value = t.numero;
    document.getElementById('tanque-combustivel').value = t.combustivel;
    document.getElementById('tanque-capacidade').value = t.capacidade;
    document.getElementById('tanque-estoque').value = t.estoque_atual;
    document.getElementById('tanque-minimo').value = t.estoque_minimo || '';
    document.getElementById('tanque-obs').value = t.observacoes || '';
    document.getElementById('btn-excluir-tanque').style.display = 'inline-block';
  } else {
    document.getElementById('form-tanque-titulo').textContent = '➕ Novo Tanque';
    document.getElementById('tanque-id').value = '';
    document.getElementById('tanque-numero').value = '';
    document.getElementById('tanque-combustivel').value = '';
    document.getElementById('tanque-capacidade').value = '';
    document.getElementById('tanque-estoque').value = '';
    document.getElementById('tanque-minimo').value = '';
    document.getElementById('tanque-obs').value = '';
    document.getElementById('btn-excluir-tanque').style.display = 'none';
  }
}

function fecharFormTanque() {
  document.getElementById('form-tanque').style.display = 'none';
}

async function salvarTanque() {
  const msg = document.getElementById('tanque-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();

  const dados = {
    empresa_id: perfil.empresa_id,
    numero: parseInt(document.getElementById('tanque-numero').value),
    combustivel: document.getElementById('tanque-combustivel').value,
    capacidade: parseFloat(document.getElementById('tanque-capacidade').value) || 0,
    estoque_atual: parseFloat(document.getElementById('tanque-estoque').value) || 0,
    estoque_minimo: parseFloat(document.getElementById('tanque-minimo').value) || null,
    observacoes: document.getElementById('tanque-obs').value.trim() || null,
  };

  if (!dados.numero || !dados.combustivel || !dados.capacidade) {
    msg.textContent = 'Preencha número, combustível e capacidade.';
    msg.style.color = '#f44'; return;
  }

  const id = document.getElementById('tanque-id').value;
  let error;
  if (id) {
    ({ error } = await sb.from('oct_tanques').update(dados).eq('id', id));
  } else {
    ({ error } = await sb.from('oct_tanques').insert(dados));
  }

  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = '✅ Salvo!'; msg.style.color = '#4caf50';
  setTimeout(() => moduloTanques(), 800);
}

async function excluirTanque() {
  if (!confirm('Excluir este tanque? Os bicos vinculados também serão desvinculados.')) return;
  const id = document.getElementById('tanque-id').value;
  await sb.from('oct_tanques').delete().eq('id', id);
  moduloTanques();
}
