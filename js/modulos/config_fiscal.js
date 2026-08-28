// ============================================================
// octano-retaguarda  -  CONFIGURAÇÃO FISCAL (SPED)
// ------------------------------------------------------------
// Tudo que o EFD precisa e que NÃO vem do movimento: o contador, o código do
// município, o de recolhimento e — a parte que só existe no mundo físico — as
// BOMBAS, com série, fabricante, modelo e os LACRES do INMETRO.
//
// POR QUE ESTA TELA EXISTE (28/08/2026)
// O Antônio Carlos só tinha esses dados porque foram extraídos à mão do EFD
// antigo baixado do ReceitanetBX. Florestal, Tijuco e Glória estavam sem —
// e o gerador avisava "bombas não cadastradas" sem lugar nenhum para
// cadastrar. Na implantação de um posto novo isso tem de ser preenchido uma
// vez, aqui, e não descoberto meses depois na hora de entregar o SPED.
//
// O QUE NÃO DÁ PARA IMPORTAR: série, fabricante, modelo e lacres não existem
// no TecnoX (tab_manutencao_bomba_dados vem vazia). Estão na plaqueta da bomba
// e no lacre do INMETRO — alguém precisa ir até a pista. A estrutura
// bomba→bico→tanque, essa sim, o TecnoX tem, e vem pelo
// _ferramentas/importar_bombas_tecnox.py.
//
// GRAVA em oct_empresas.sped_config (jsonb). O gerador lê exatamente:
//   cod_mun, cod_rec, dia_venc, contador{...}, bombas[{serie, fabricante,
//   modelo, medicao, lacres[{numero,data}], bicos[{numero,cod_item,tanque}]}]
// ============================================================

let _cfCfg = {};        // sped_config em edição
let _cfEmpresa = null;
let _cfTanques = [];
let _cfProdutos = [];   // só os de tanque: viram opção de cod_item do 1370
let _cfSujo = false;

const CF_CONTADOR = [
  ['nome', 'Nome / razão social', 'MACON MACIEL CONTABILIDADE LTDA'],
  ['cnpj', 'CNPJ', 'só números'],
  ['cpf', 'CPF', 'só números — use quando for contador pessoa física'],
  ['crc', 'CRC', 'registro no conselho'],
  ['cep', 'CEP', 'só números'],
  ['endereco', 'Endereço', 'RUA ...'],
  ['numero', 'Número', ''],
  ['bairro', 'Bairro', ''],
  ['cod_mun', 'Código IBGE do município DO CONTADOR', '3106200 = Belo Horizonte'],
  ['fone', 'Telefone', ''],
  ['email', 'E-mail', ''],
];

function _cfEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- o que ainda falta para o SPED sair completo ----------
function _cfPendencias() {
  const p = [];
  if (!_cfCfg.cod_mun) p.push('Código IBGE do município do posto (registro 0000)');
  if (!_cfCfg.cod_rec) p.push('Código de recolhimento (registro E116)');
  const c = _cfCfg.contador || {};
  if (!c.nome) p.push('Nome do contador (registro 0100)');
  if (!c.cpf && !c.cnpj) p.push('CPF ou CNPJ do contador (registro 0100)');
  const bs = _cfCfg.bombas || [];
  if (!bs.length) {
    p.push('Nenhuma bomba cadastrada (registros 1350/1360/1370)');
  } else {
    bs.forEach((b, i) => {
      if (!b.serie) p.push('Bomba ' + (i + 1) + ': número de série (1350)');
      if (!b.fabricante) p.push('Bomba ' + (i + 1) + ': fabricante (1350)');
      if (!(b.lacres || []).length) p.push('Bomba ' + (i + 1) + ': nenhum lacre (1360)');
      if (!(b.bicos || []).length) p.push('Bomba ' + (i + 1) + ': nenhum bico (1370)');
      (b.bicos || []).forEach(bi => {
        if (!bi.cod_item) p.push('Bomba ' + (i + 1) + ', bico ' + bi.numero + ': produto não escolhido (1370)');
      });
    });
  }
  return p;
}

// ---------- edição do estado (sem redesenhar: não perde o foco) ----------
function cfSet(caminho, valor) {
  const partes = caminho.split('.');
  let o = _cfCfg;
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(partes[i + 1]) ? [] : {};
    o = o[k];
  }
  o[partes[partes.length - 1]] = valor;
  _cfSujo = true;
  const av = document.getElementById('cf-aviso-salvar');
  if (av) av.style.display = 'block';
}

function cfAddBomba() {
  (_cfCfg.bombas = _cfCfg.bombas || []).push(
    { serie: '', fabricante: '', modelo: '', medicao: '1', lacres: [], bicos: [] });
  _cfSujo = true; cfRender();
}
function cfDelBomba(i) {
  if (!confirm('Remover a bomba ' + (i + 1) + ' e seus lacres/bicos?')) return;
  _cfCfg.bombas.splice(i, 1); _cfSujo = true; cfRender();
}
function cfAddLacre(i) {
  const b = _cfCfg.bombas[i];
  (b.lacres = b.lacres || []).push({ numero: '', data: '' });
  _cfSujo = true; cfRender();
}
function cfDelLacre(i, j) { _cfCfg.bombas[i].lacres.splice(j, 1); _cfSujo = true; cfRender(); }
function cfAddBico(i) {
  const b = _cfCfg.bombas[i];
  (b.bicos = b.bicos || []).push({ numero: '', cod_item: '', tanque: '' });
  _cfSujo = true; cfRender();
}
function cfDelBico(i, j) { _cfCfg.bombas[i].bicos.splice(j, 1); _cfSujo = true; cfRender(); }

// escolher o produto do bico já define o tanque: os dois andam juntos no 1370
function cfBicoProduto(i, j, codigo) {
  const b = _cfCfg.bombas[i].bicos[j];
  b.cod_item = codigo;
  const pr = _cfProdutos.find(p => p.codigo === codigo);
  const tq = pr ? _cfTanques.find(t => t.id === pr.tanque_id) : null;
  if (tq) b.tanque = String(tq.numero);
  _cfSujo = true; cfRender();
}

async function cfSalvar() {
  const btn = document.getElementById('cf-btn-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    const { error } = await sb.from('oct_empresas')
      .update({ sped_config: _cfCfg }).eq('id', _cfEmpresa.id);
    if (error) throw error;
    _cfSujo = false;
    const av = document.getElementById('cf-aviso-salvar');
    if (av) av.style.display = 'none';
    cfRender();
    alert('Configuração fiscal salva.');
  } catch (e) {
    alert('Não salvou: ' + ((e && e.message) || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
  }
}

function _cfCampo(rot, caminho, valor, dica, largura) {
  return `<div style="flex:${largura || 1};min-width:150px">
    <label style="display:block;color:#8892a0;font-size:0.74rem;margin-bottom:3px">${_cfEsc(rot)}</label>
    <input value="${_cfEsc(valor)}" oninput="cfSet('${caminho}', this.value)"
      placeholder="${_cfEsc(dica || '')}"
      style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem">
  </div>`;
}

function cfRender() {
  const el = document.getElementById('conteudo');
  if (!el) return;
  const c = _cfCfg.contador || {};
  const bombas = _cfCfg.bombas || [];
  const pend = _cfPendencias();

  const blocoBombas = bombas.map((b, i) => {
    const lacres = (b.lacres || []).map((l, j) => `
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:6px">
        ${_cfCampo('Número do lacre', `bombas.${i}.lacres.${j}.numero`, l.numero, 'H1815357-5', 2)}
        ${_cfCampo('Data', `bombas.${i}.lacres.${j}.data`, l.data, 'AAAA-MM-DD', 1)}
        <button onclick="cfDelLacre(${i},${j})" title="remover lacre"
          style="padding:7px 10px;border-radius:6px;border:1px solid #7f1d1d;background:transparent;color:#f87171;cursor:pointer">✕</button>
      </div>`).join('') || '<div style="color:#a63;font-size:0.76rem;padding:4px 0">⚠ nenhum lacre — o 1360 sai vazio</div>';

    const bicos = (b.bicos || []).map((bi, j) => {
      const opts = _cfProdutos.map(p =>
        `<option value="${_cfEsc(p.codigo)}"${p.codigo === bi.cod_item ? ' selected' : ''}>${_cfEsc(p.codigo)} — ${_cfEsc(p.nome)}</option>`).join('');
      return `<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:6px">
        ${_cfCampo('Bico nº', `bombas.${i}.bicos.${j}.numero`, bi.numero, '', 1)}
        <div style="flex:3;min-width:180px">
          <label style="display:block;color:#8892a0;font-size:0.74rem;margin-bottom:3px">Produto (cód. do 0200)</label>
          <select onchange="cfBicoProduto(${i},${j},this.value)"
            style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;font-size:0.84rem">
            <option value="">— escolha —</option>${opts}
          </select>
        </div>
        ${_cfCampo('Tanque', `bombas.${i}.bicos.${j}.tanque`, bi.tanque, '', 1)}
        <button onclick="cfDelBico(${i},${j})" title="remover bico"
          style="padding:7px 10px;border-radius:6px;border:1px solid #7f1d1d;background:transparent;color:#f87171;cursor:pointer">✕</button>
      </div>`;
    }).join('') || '<div style="color:#a63;font-size:0.76rem;padding:4px 0">⚠ nenhum bico — o 1370 sai vazio</div>';

    return `<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:#e0e0e0">⛽ Bomba ${i + 1}${b.serie ? ' — ' + _cfEsc(b.serie) : ''}</strong>
        <button onclick="cfDelBomba(${i})"
          style="padding:5px 10px;border-radius:6px;border:1px solid #7f1d1d;background:transparent;color:#f87171;cursor:pointer;font-size:0.78rem">remover bomba</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        ${_cfCampo('Número de série', `bombas.${i}.serie`, b.serie, 'na plaqueta da bomba', 2)}
        ${_cfCampo('Fabricante', `bombas.${i}.fabricante`, b.fabricante, 'GILBARCO', 2)}
        ${_cfCampo('Modelo', `bombas.${i}.modelo`, b.modelo, 'PHX2220', 2)}
        ${_cfCampo('Medição', `bombas.${i}.medicao`, b.medicao || '1', '1', 1)}
      </div>
      <div style="color:#f97316;font-size:0.78rem;font-weight:600;margin:10px 0 4px">Lacres (1360)</div>
      ${lacres}
      <button onclick="cfAddLacre(${i})"
        style="margin-top:4px;padding:5px 10px;border-radius:6px;border:1px solid #2a5a3a;background:transparent;color:#7be0a0;cursor:pointer;font-size:0.78rem">+ lacre</button>
      <div style="color:#f97316;font-size:0.78rem;font-weight:600;margin:14px 0 4px">Bicos (1370)</div>
      ${bicos}
      <button onclick="cfAddBico(${i})"
        style="margin-top:4px;padding:5px 10px;border-radius:6px;border:1px solid #2a5a3a;background:transparent;color:#7be0a0;cursor:pointer;font-size:0.78rem">+ bico</button>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:960px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">
        <div>
          <h2 style="color:#f97316;margin:0">🧾 Configuração fiscal (SPED)</h2>
          <p style="color:#8892a0;font-size:0.82rem;margin:4px 0 0">
            <b style="color:#e0e0e0">${_cfEsc(_cfEmpresa ? _cfEmpresa.nome : '')}</b>
            — o que o EFD precisa e não vem do movimento. Preencha na implantação do posto.
          </p>
        </div>
        <button id="cf-btn-salvar" onclick="cfSalvar()" class="btn-salvar"
          style="padding:9px 16px;border-radius:6px;border:none;background:#f97316;color:#fff;font-weight:600;cursor:pointer;white-space:nowrap">💾 Salvar</button>
      </div>

      <div id="cf-aviso-salvar" style="display:${_cfSujo ? 'block' : 'none'};background:#2a2410;border:1px solid #b45309;border-radius:8px;padding:8px 12px;margin:10px 0;color:#fbbf24;font-size:0.8rem">
        Há alterações não salvas.
      </div>

      ${pend.length ? `
      <div style="background:#2a1410;border:1px solid #b45309;border-radius:10px;padding:12px;margin:12px 0">
        <strong style="color:#fbbf24;font-size:0.85rem">Falta para o SPED sair completo (${pend.length}):</strong>
        <ul style="color:#fed7aa;font-size:0.79rem;margin:6px 0 0 18px">
          ${pend.map(x => '<li>' + _cfEsc(x) + '</li>').join('')}
        </ul>
      </div>` : `
      <div style="background:#12240f;border:1px solid #2a5a3a;border-radius:10px;padding:12px;margin:12px 0;color:#7be0a0;font-size:0.84rem">
        ✓ Configuração completa — o gerador tem tudo que precisa deste posto.
      </div>`}

      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
        <div style="font-weight:700;color:#f97316;margin-bottom:8px">🏢 Estabelecimento</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${_cfCampo('Código IBGE do município do posto', 'cod_mun', _cfCfg.cod_mun, '3126000 = Florestal', 2)}
          ${_cfCampo('Código de recolhimento (E116)', 'cod_rec', _cfCfg.cod_rec, '1206', 1)}
          ${_cfCampo('Dia do vencimento do ICMS', 'dia_venc', _cfCfg.dia_venc, '8', 1)}
        </div>
      </div>

      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
        <div style="font-weight:700;color:#f97316;margin-bottom:8px">👤 Contador (registro 0100)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${CF_CONTADOR.map(([k, rot, dica]) =>
            _cfCampo(rot, 'contador.' + k, c[k], dica, k === 'nome' || k === 'endereco' || k === 'email' ? 3 : 1)).join('')}
        </div>
      </div>

      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div style="font-weight:700;color:#f97316">⛽ Bombas, lacres e bicos (1350 / 1360 / 1370)</div>
          <button onclick="cfAddBomba()"
            style="padding:6px 12px;border-radius:6px;border:1px solid #2a5a3a;background:transparent;color:#7be0a0;cursor:pointer;font-size:0.8rem">+ bomba</button>
        </div>
        <p style="color:#8892a0;font-size:0.76rem;margin:0 0 12px">
          Série, fabricante, modelo e lacres <b>não existem em sistema nenhum</b> — estão na
          plaqueta da bomba e no lacre do INMETRO. A estrutura bomba→bico→tanque pode ser
          importada do TecnoX na implantação.
        </p>
        ${blocoBombas || '<div style="color:#8892a0;font-size:0.82rem;padding:10px 0">Nenhuma bomba cadastrada.</div>'}
      </div>
    </div>`;
}

async function moduloConfigFiscal() {
  const el = document.getElementById('conteudo');
  if (el) el.innerHTML = '<p style="padding:20px;color:#888">Carregando configuração fiscal...</p>';
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { if (el) el.innerHTML = '<p style="padding:20px;color:#f87171">Selecione um posto no topo.</p>'; return; }
  try {
    const [eRes, tRes, pRes] = await Promise.all([
      sb.from('oct_empresas').select('id,nome,sped_config').eq('id', eid).single(),
      sb.from('oct_tanques').select('id,numero,combustivel').eq('empresa_id', eid).order('numero'),
      sb.from('oct_produtos').select('codigo,nome,cod_anp,tanque_id,ativo').eq('empresa_id', eid),
    ]);
    _cfEmpresa = eRes.data;
    _cfCfg = (eRes.data && eRes.data.sped_config) || {};
    _cfTanques = tRes.data || [];
    // só produto de tanque entra no 1370; código repetido aparece uma vez só
    const vistos = new Set();
    _cfProdutos = (pRes.data || [])
      .filter(p => p.tanque_id && p.cod_anp && _cfTanques.some(t => t.id === p.tanque_id))
      .filter(p => { if (vistos.has(p.codigo)) return false; vistos.add(p.codigo); return true; });
    _cfSujo = false;
    cfRender();
  } catch (e) {
    if (el) el.innerHTML = '<p style="padding:20px;color:#f87171">Erro ao carregar: ' + _cfEsc(String((e && e.message) || e)) + '</p>';
  }
}
