// ============================================================
// MODULO MANIFESTACAO DESTINATARIO — tela em abas por status
// Reaproveita do nfe.js: processarXmlNfe, parseNFe, confirmarNfe
// ============================================================

let _manifEmpresa = null;
let _manifEmpresaId = null;
let _manifAbaAtual = 'sem_manifestacao';
let _manifDados = [];          // notas da aba atual
let _manifSelecionadas = new Set();

const MANIF_ABAS = [
  { id: 'sem_manifestacao', label: 'Sem Manifestação', ico: '📋' },
  { id: 'ciencia',          label: 'Manifestadas',     ico: '✅' },
  { id: 'cancelada',        label: 'Canceladas',       ico: '❌' },
  { id: 'logs',             label: 'Logs da Consulta',  ico: '📜' },
];

async function moduloManifestacao() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id, oct_empresas(*)').eq('id', session.user.id).single();
  _manifEmpresaId = perfil?.empresa_id;
  _manifEmpresa = perfil?.oct_empresas;

  if (!_manifEmpresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }

  // sincroniza variaveis globais usadas pelas funcoes reaproveitadas do nfe.js
  if (typeof _empresaId !== 'undefined') { _empresaId = _manifEmpresaId; }
  if (typeof _empresa !== 'undefined') { _empresa = _manifEmpresa; }
  if (!_manifEmpresa?.cert_path) {
    conteudo.innerHTML = '<div style="padding:24px;color:#fbbf24">⚠️ Configure o certificado digital na tela Empresa antes de manifestar NF-e.</div>';
    return;
  }

  const ultNsu = await _manifUltimoNsu();

  conteudo.innerHTML = `
    ${_manifStyles()}
    <div class="manif-janela">
      <div class="manif-titulo">
        <span>Manifestação Destinatário</span>
        <button onclick="navegarPara('nfe')" class="manif-fechar" title="Fechar">✕</button>
      </div>

      <div class="manif-topo">
        <div class="manif-topo-linha">
          <span class="manif-lbl">Certificado:</span>
          <span class="manif-cert">${_manifEmpresa.cert_titular || _manifEmpresa.nome || '—'}</span>
          <span class="manif-lbl" style="margin-left:auto">Qtd notas:</span>
          <span class="manif-badge" id="manif-qtd">0</span>
          <span class="manif-lbl">Último NSU:</span>
          <input id="manif-nsu" type="text" value="${ultNsu}" class="manif-input-sm" />
          <button onclick="manifConsultarSefaz()" class="manif-btn-azul">🔄 Consultar novas notas (SEFAZ)</button>
        </div>
        <div class="manif-topo-linha">
          <span class="manif-lbl">Data inicial:</span>
          <input id="manif-dt-ini" type="date" class="manif-input-sm" />
          <span class="manif-lbl">Data final:</span>
          <input id="manif-dt-fim" type="date" class="manif-input-sm" />
          <span class="manif-lbl">Nº Nota:</span>
          <input id="manif-busca" type="text" placeholder="Nº, fornecedor, chave..." class="manif-input" oninput="manifRender()" />
          <button onclick="manifRender()" class="manif-btn-cinza">🔍 Pesquisar (sistema)</button>
          <select id="manif-ambiente" class="manif-input-sm" title="Ambiente SEFAZ">
            <option value="producao">Produção</option><option value="homologacao">Homologação</option>
          </select>
        </div>
        <div id="manif-status-consulta" style="display:none"></div>
      </div>

      <div class="manif-corpo">
        <div class="manif-abas">
          ${MANIF_ABAS.map(a => `
            <div class="manif-aba ${a.id===_manifAbaAtual?'ativo':''}" onclick="manifTrocarAba('${a.id}')">
              <span class="manif-aba-ico">${a.ico}</span><span>${a.label}</span>
            </div>`).join('')}
        </div>
        <div class="manif-painel">
          <div id="manif-lista-area"></div>
          <div id="manif-acoes-area"></div>
        </div>
      </div>

      <div id="manif-msg-flutuante" class="manif-msg-flut" style="display:none"></div>

      <div id="nfe-importar" style="display:none"></div>
      <div id="nfe-preview" style="display:none;padding:16px"></div>
      <div id="nfe-detalhe" style="display:none"></div>
    </div>
  `;

  await manifCarregarAba();
}

async function _manifUltimoNsu() {
  const { data } = await sb.from('oct_nfe_manifestadas').select('nsu')
    .eq('empresa_id', _manifEmpresaId).order('nsu', { ascending: false }).limit(1).single();
  return data?.nsu || '0';
}

function _manifStyles() {
  return `<style>
    .manif-janela{max-width:1500px;margin:0 auto;background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.4)}
    .manif-titulo{background:linear-gradient(180deg,#2a2d3e,#1a1d2e);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;color:#e0e0e0;border-bottom:1px solid #2a2d3e}
    .manif-fechar{background:transparent;border:none;color:#888;cursor:pointer;font-size:1.1rem}
    .manif-fechar:hover{color:#f44}
    .manif-topo{padding:10px 16px;background:#0f1117;border-bottom:1px solid #2a2d3e}
    .manif-topo-linha{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .manif-topo-linha:last-child{margin-bottom:0}
    .manif-lbl{color:#888;font-size:0.78rem}
    .manif-cert{color:#4caf50;font-size:0.82rem;font-weight:600}
    .manif-badge{background:#1a2a3a;color:#60a5fa;font-size:0.8rem;padding:2px 12px;border-radius:10px;border:1px solid #2a4a6a;font-weight:700}
    .manif-input{padding:6px 10px;border-radius:5px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0;font-size:0.82rem;width:200px}
    .manif-input-sm{padding:6px 8px;border-radius:5px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0;font-size:0.82rem;width:110px}
    .manif-btn-azul{padding:7px 14px;border-radius:6px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600}
    .manif-btn-azul:hover{background:#1d4ed8}
    .manif-btn-cinza{padding:7px 12px;border-radius:6px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.8rem}
    .manif-corpo{display:flex;min-height:400px}
    .manif-abas{width:200px;background:#0f1117;border-right:1px solid #2a2d3e;padding:8px 0;flex-shrink:0}
    .manif-aba{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;color:#aaa;font-size:0.88rem;border-left:3px solid transparent}
    .manif-aba:hover{background:#1a1d2e;color:#e0e0e0}
    .manif-aba.ativo{background:#13151f;color:#60a5fa;border-left-color:#60a5fa;font-weight:600}
    .manif-aba-ico{font-size:1.1rem}
    .manif-painel{flex:1;display:flex;flex-direction:column;min-width:0}
    .manif-tabela-scroll{overflow:auto;max-height:55vh;flex:1}
    .manif-tabela{width:100%;border-collapse:collapse;font-size:0.8rem}
    .manif-tabela th{position:sticky;top:0;background:#2a2d3e;color:#cfcfcf;text-align:left;padding:8px 10px;font-weight:600;white-space:nowrap;z-index:2}
    .manif-tabela td{padding:6px 10px;border-bottom:1px solid #1a1d2e;white-space:nowrap;color:#d0d0d0}
    .manif-tabela tbody tr:hover{background:#1a1d2e}
    .manif-tabela tbody tr:nth-child(even){background:rgba(255,255,255,.012)}
    .manif-chk{width:16px;height:16px;cursor:pointer;accent-color:#60a5fa}
    .manif-btn-linha{padding:3px 10px;border-radius:4px;border:1px solid #2a4a6a;background:transparent;color:#60a5fa;cursor:pointer;font-size:0.72rem;margin-right:4px}
    .manif-btn-linha:hover{background:#1a2a3a}
    .manif-btn-incluir{border-color:#2a5a2a;color:#4caf50}
    .manif-btn-incluir:hover{background:#1a3a1a}
    .manif-rodape-acoes{padding:12px 16px;border-top:1px solid #2a2d3e;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#0f1117}
    .manif-btn-verde{padding:8px 16px;border-radius:6px;border:none;background:#16a34a;color:#fff;cursor:pointer;font-weight:600;font-size:0.82rem}
    .manif-btn-verde:hover{background:#15803d}
    .manif-btn-verde:disabled{background:#2a2d3e;color:#666;cursor:not-allowed}
    .manif-vazio{text-align:center;padding:50px;color:#555}
    .manif-msg-flut{position:fixed;bottom:24px;right:24px;padding:14px 20px;border-radius:8px;font-size:0.85rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:400px}
  </style>`;
}

function manifTrocarAba(aba) {
  _manifAbaAtual = aba;
  _manifSelecionadas.clear();
  document.querySelectorAll('.manif-aba').forEach(el => el.classList.remove('ativo'));
  const abas = MANIF_ABAS.map(a => a.id);
  const idx = abas.indexOf(aba);
  document.querySelectorAll('.manif-aba')[idx]?.classList.add('ativo');
  manifCarregarAba();
}

async function manifCarregarAba() {
  const area = document.getElementById('manif-lista-area');
  const acoes = document.getElementById('manif-acoes-area');
  if (!area) return;
  area.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  acoes.innerHTML = '';

  if (_manifAbaAtual === 'logs') {
    await manifRenderLogs();
    return;
  }

  let q = sb.from('oct_nfe_manifestadas').select('*').eq('empresa_id', _manifEmpresaId);
  if (_manifAbaAtual === 'ciencia') {
    // aba Manifestadas mostra as com ciencia E as ja importadas (estas em cor diferente)
    q = q.in('status', ['ciencia', 'importada']);
  } else {
    q = q.eq('status', _manifAbaAtual);
  }
  const { data } = await q.order('emissao', { ascending: false });
  _manifDados = data || [];
  manifRender();
}

function _manifFiltrar() {
  const busca = (document.getElementById('manif-busca')?.value || '').toLowerCase().trim();
  const dtIni = document.getElementById('manif-dt-ini')?.value || '';
  const dtFim = document.getElementById('manif-dt-fim')?.value || '';
  return _manifDados.filter(n => {
    if (busca) {
      const blob = `${n.numero||''} ${n.emitente||''} ${n.emit_cnpj||''} ${n.chave_nfe||''}`.toLowerCase();
      if (!blob.includes(busca)) return false;
    }
    if (dtIni && (n.emissao||'') < dtIni) return false;
    if (dtFim && (n.emissao||'') > dtFim) return false;
    return true;
  });
}

function manifRender() {
  if (_manifAbaAtual === 'logs') return;
  const area = document.getElementById('manif-lista-area');
  const acoes = document.getElementById('manif-acoes-area');
  if (!area) return;

  const lista = _manifFiltrar();
  const qtd = document.getElementById('manif-qtd');
  if (qtd) qtd.textContent = lista.length;

  const fmtData = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  // numero da NF: usa o campo, ou extrai da chave (digitos 26-34) removendo zeros a esquerda
  const numNota = n => {
    if (n.numero) return n.numero;
    if (n.chave_nfe && n.chave_nfe.length === 44) {
      const num = n.chave_nfe.substring(25, 34).replace(/^0+/, '');
      return num || '—';
    }
    return '—';
  };
  const fmtVal = v => v ? Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';

  if (lista.length === 0) {
    area.innerHTML = `<div class="manif-vazio">Nenhuma nota nesta aba.${_manifAbaAtual==='sem_manifestacao'?'<br><span style="font-size:0.82rem">Clique em "Consultar novas notas (SEFAZ)" para buscar.</span>':''}</div>`;
    acoes.innerHTML = '';
    return;
  }

  const isSemManif = _manifAbaAtual === 'sem_manifestacao';
  const isManifestadas = _manifAbaAtual === 'ciencia';
  const isCanceladas = _manifAbaAtual === 'cancelada';

  area.innerHTML = `
    <div class="manif-tabela-scroll">
      <table class="manif-tabela">
        <thead>
          <tr>
            ${isSemManif ? `<th style="width:36px"><input type="checkbox" class="manif-chk" onclick="manifToggleTodos(this.checked)" /></th>` : ''}
            <th style="width:80px">Nº Nota</th>
            <th style="width:140px">CNPJ</th>
            <th style="min-width:220px">Razão Social Emitente</th>
            <th style="width:90px">Emissão</th>
            <th style="width:100px;text-align:right">Valor</th>
            <th style="min-width:150px">Chave</th>
            ${(isManifestadas||isCanceladas) ? `<th style="width:260px">Ações</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${lista.map(n => `
            <tr style="${n.status==='importada'?'background:#0f2a0f':''}">
              ${isSemManif ? `<td><input type="checkbox" class="manif-chk" data-id="${n.id}" ${_manifSelecionadas.has(n.id)?'checked':''} onclick="manifToggleUm('${n.id}',this.checked)" /></td>` : ''}
              <td><strong>${numNota(n)}</strong>${n.status==='importada'?' <span style="font-size:0.65rem;color:#4caf50">✓ importada</span>':''}</td>
              <td style="font-family:monospace;font-size:0.74rem">${n.emit_cnpj||'—'}</td>
              <td title="${(n.emitente||'').replace(/"/g,'&quot;')}">${n.emitente||'—'}</td>
              <td>${fmtData(n.emissao)}</td>
              <td style="text-align:right;font-weight:600">${fmtVal(n.valor)}</td>
              <td style="font-family:monospace;font-size:0.7rem;color:#60a5fa;cursor:pointer" title="Clique para copiar a chave completa: ${n.chave_nfe||''}" onclick="manifCopiarChave('${n.chave_nfe||''}')">${n.chave_nfe?n.chave_nfe.substring(0,20)+'… 📋':'—'}</td>
              ${isManifestadas ? `<td>
                ${n.status==='importada'
                  ? `<span style="color:#4caf50;font-size:0.75rem;margin-right:6px">✓ Importada</span><button class="manif-btn-linha" onclick="manifBaixarXml('${n.id}','${n.nsu}')">⬇️ XML</button><button class="manif-btn-linha" onclick="manifImprimir('${n.id}')">🖨 Imprimir</button><button class="manif-btn-linha" style="border-color:#5a2a2a;color:#f44" onclick="manifExcluirImportacao('${n.id}','${n.chave_nfe||''}')">🗑 Excluir importação</button>`
                  : `${n.xml ? `<button class="manif-btn-linha manif-btn-incluir" onclick="manifIncluirNota('${n.id}')">📥 Incluir Nota</button>` : `<button class="manif-btn-linha" onclick="manifBaixarXml('${n.id}','${n.nsu}')">⬇️ Baixar XML</button>`}
                <button class="manif-btn-linha" onclick="manifBaixarXml('${n.id}','${n.nsu}')">⬇️ XML</button>
                <button class="manif-btn-linha" onclick="manifImprimir('${n.id}')">🖨 Imprimir</button>
                <button class="manif-btn-linha" style="border-color:#5a4a2a;color:#fbbf24" onclick="manifDesfazer('${n.id}')">↩ Desfazer</button>`}
              </td>` : ''}
              ${isCanceladas ? `<td>
                <button class="manif-btn-linha" onclick="manifConsultarStatus('${n.chave_nfe}')">🔍 Status SEFAZ</button>
                <button class="manif-btn-linha" onclick="manifBaixarXml('${n.id}','${n.nsu}')">⬇️ XML</button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // rodape de acoes
  if (isSemManif) {
    acoes.innerHTML = `
      <div class="manif-rodape-acoes">
        <button class="manif-btn-linha" onclick="manifCopiarChaveSelecao()">📋 Copiar chave</button>
        <button class="manif-btn-linha" onclick="manifBaixarXmlSelecao()">⬇️ Baixar XML</button>
        <span class="manif-lbl" style="margin-left:12px">Evento:</span>
        <select id="manif-evento" class="manif-input-sm" style="width:170px">
          <option value="ciencia">Ciência da Operação</option>
          <option value="confirmacao">Confirmação da Operação</option>
          <option value="desconhecimento">Desconhecimento</option>
          <option value="naorealizada">Operação não Realizada</option>
        </select>
        <button class="manif-btn-verde" id="manif-btn-enviar" onclick="manifEnviarLote()">📡 Enviar manifestação (<span id="manif-sel-count">0</span>)</button>
        <span id="manif-prog" class="manif-lbl"></span>
      </div>
    `;
    manifAtualizarContadorSelecao();
  } else {
    acoes.innerHTML = '';
  }
}

function manifToggleTodos(marcar) {
  const lista = _manifFiltrar();
  _manifSelecionadas.clear();
  if (marcar) lista.forEach(n => _manifSelecionadas.add(n.id));
  document.querySelectorAll('.manif-chk[data-id]').forEach(c => { c.checked = marcar; });
  manifAtualizarContadorSelecao();
}

function manifToggleUm(id, marcar) {
  if (marcar) _manifSelecionadas.add(id); else _manifSelecionadas.delete(id);
  manifAtualizarContadorSelecao();
}

function manifAtualizarContadorSelecao() {
  const c = document.getElementById('manif-sel-count');
  if (c) c.textContent = _manifSelecionadas.size;
  const btn = document.getElementById('manif-btn-enviar');
  if (btn) btn.disabled = _manifSelecionadas.size === 0;
}

// ─── CONSULTAR SEFAZ ────────────────────────────────────────
// painel de status da consulta SEFAZ (fixo, nao some sozinho)
function manifStatusConsulta(texto, tipo) {
  const el = document.getElementById('manif-status-consulta');
  if (!el) return;
  if (!texto) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const cores = { ok:['#0f2a0f','#2a5a2a','#7ee787'], erro:['#2a0f0f','#5a2a2a','#ff9b9b'], alerta:['#2a2300','#5a4a00','#fbbf24'], info:['#0f1a2a','#2a4a6a','#7cc4ff'] };
  const c = cores[tipo] || cores.info;
  const hora = new Date().toLocaleTimeString('pt-BR');
  el.style.cssText = `display:block;margin-top:8px;padding:10px 14px;border-radius:6px;font-size:0.82rem;background:${c[0]};border:1px solid ${c[1]};color:${c[2]};line-height:1.5`;
  el.innerHTML = `${texto} <span style="color:#666;font-size:0.72rem;float:right">${hora}</span>`;
}

async function manifConsultarSefaz() {
  const senha = getCertSenha();
  if (!senha) { manifStatusConsulta('⚠️ Senha do certificado não encontrada. Configure na tela Empresa.', 'erro'); return; }
  const ambiente = document.getElementById('manif-ambiente').value;
  const nsu = document.getElementById('manif-nsu').value || '0';
  manifStatusConsulta('🔄 Consultando SEFAZ...', 'info');
  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_manifEmpresa.cert_path);
    const buf = await cb.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj = _manifEmpresa.cnpj?.replace(/\D/g, '');
    const resp = await fetch(`${SEFAZ_URL}/manifestar`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cnpj, cert_base64:b64, cert_senha:senha, ambiente, ultimo_nsu:nsu }) });
    const dados = await resp.json();

    const cstat = String(dados.cstat || '');
    const xmotivo = dados.xmotivo || dados.erro || '';

    // 656 = Consumo Indevido (consultas muito frequentes -> SEFAZ bloqueia ~1h)
    if (cstat === '656' || /consumo indevido/i.test(xmotivo)) {
      manifStatusConsulta('🚫 <strong>SEFAZ bloqueou a consulta por consumo indevido (cStat 656).</strong><br>Você fez consultas em intervalo muito curto. A SEFAZ libera novas consultas após cerca de <strong>1 hora</strong>. Aguarde e tente de novo. Evite clicar em "Consultar" repetidamente.', 'alerta');
      await manifRegistrarLog('SEFAZ 656 — Consumo Indevido (consulta bloqueada ~1h)');
      return;
    }
    if (dados.erro) { manifStatusConsulta('❌ Erro SEFAZ: ' + dados.erro, 'erro'); await manifRegistrarLog('Erro SEFAZ: '+dados.erro); return; }
    // cStat informativos comuns: 137 = nenhum doc localizado; 138 = doc(s) localizados
    if (cstat && !['137','138'].includes(cstat) && xmotivo) {
      manifStatusConsulta(`ℹ️ SEFAZ [${cstat}]: ${xmotivo}`, 'info');
    }

    if (dados.ultimo_nsu) document.getElementById('manif-nsu').value = dados.ultimo_nsu;
    if (!dados.nfes || dados.nfes.length === 0) {
      manifStatusConsulta(`✓ Consulta OK — nenhuma nota nova.${cstat?` (SEFAZ ${cstat}: ${xmotivo})`:''}`, 'ok');
      return;
    }
    let salvas = 0;
    for (const n of dados.nfes) {
      const ehEvento = n.schema && (n.schema.includes('resEvento')||n.schema.includes('procEvento')||n.schema.includes('evento'));
      const { error } = await sb.from('oct_nfe_manifestadas').upsert({
        empresa_id:_manifEmpresaId, nsu:n.nsu, schema:n.schema, chave_nfe:n.chave||null,
        numero:n.numero||null, serie:n.serie||null, emissao:n.emissao||null, emitente:n.emitente||null,
        emit_cnpj:n.emitCnpj||null, valor:n.valor?parseFloat(n.valor):null, nat_op:n.natOp||null,
        xml:n.xml||null, tipo:n.tipo||'resumo', status: ehEvento ? 'evento' : 'sem_manifestacao',
        ultimo_nsu_consulta:dados.ultimo_nsu
      }, { onConflict:'empresa_id,nsu', ignoreDuplicates:true });
      if (!error) salvas++;
    }
    await manifRegistrarLog(`Consulta SEFAZ: ${salvas} nota(s) nova(s), último NSU ${dados.ultimo_nsu||nsu}`);
    manifStatusConsulta(`✓ Consulta OK — ${salvas} nota(s) salva(s). Último NSU: ${dados.ultimo_nsu||nsu}`, 'ok');
    if (_manifAbaAtual === 'sem_manifestacao') manifCarregarAba();
  } catch(e) { manifStatusConsulta('❌ Erro de conexão: ' + e.message, 'erro'); }
}

// ─── ENVIAR MANIFESTACAO EM LOTE ────────────────────────────
async function manifEnviarLote() {
  if (_manifSelecionadas.size === 0) return;
  const senha = getCertSenha();
  if (!senha) { manifMsg('Senha do certificado não encontrada.', 'erro'); return; }
  const evento = document.getElementById('manif-evento')?.value || 'ciencia';
  const ambiente = document.getElementById('manif-ambiente').value;
  const ids = [..._manifSelecionadas];
  const prog = document.getElementById('manif-prog');
  const btn = document.getElementById('manif-btn-enviar');
  if (btn) btn.disabled = true;

  let cb;
  try {
    const dl = await sb.storage.from('octano-certs').download(_manifEmpresa.cert_path);
    cb = dl.data;
  } catch(e) { manifMsg('Erro ao ler certificado: ' + e.message, 'erro'); if(btn) btn.disabled=false; return; }
  const buf = await cb.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const cnpj = _manifEmpresa.cnpj?.replace(/\D/g, '');

  let ok = 0, falhas = 0;
  for (let i = 0; i < ids.length; i++) {
    const nota = _manifDados.find(n => n.id === ids[i]);
    if (!nota?.chave_nfe) { falhas++; continue; }
    if (prog) prog.textContent = `Enviando ${i+1}/${ids.length}...`;
    try {
      const resp = await fetch(`${SEFAZ_URL}/manifestar/ciencia`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cnpj, chave_nfe:nota.chave_nfe, cert_base64:b64, cert_senha:senha, ambiente }) });
      const dados = await resp.json();
      // o servidor pode retornar cstat (135/136/573 = ok) ou apenas tipo/descricao do evento
      const cstatOk = dados.cstat && ['135','136','573'].includes(String(dados.cstat));
      const eventoEnviado = !dados.erro && (dados.tipo || dados.descricao) && resp.status === 200;
      if (cstatOk || eventoEnviado) {
        await sb.from('oct_nfe_manifestadas').update({ status:'ciencia' }).eq('id', nota.id);
        ok++;
      } else {
        falhas++;
      }
    } catch(e) { falhas++; }
  }
  await manifRegistrarLog(`Manifestação em lote (${evento}): ${ok} ok, ${falhas} falha(s)`);
  if (prog) prog.textContent = '';
  manifMsg(`✓ ${ok} manifestada(s)${falhas?`, ${falhas} falha(s)`:''}.`, falhas?'info':'ok');
  _manifSelecionadas.clear();
  manifCarregarAba();
}

// ─── ACOES DE LINHA ─────────────────────────────────────────
async function manifIncluirNota(id) {
  // reaproveita o fluxo de importacao do nfe.js (preview + confirmarNfe)
  if (typeof importarDoManifestado === 'function') {
    await importarDoManifestado(id);
  } else {
    manifMsg('Função de importação indisponível.', 'erro');
  }
}

function _manifSalvarArquivoXml(xmlString, nomeArquivo) {
  try {
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch(e) { return false; }
}

async function manifBaixarXml(id, nsu) {
  const nota = _manifDados.find(n => n.id === id);
  const nomeArq = `NFe_${nota?.numero || nsu}.xml`;

  // se ja temos o XML salvo no banco, so baixa o arquivo (nao chama a SEFAZ de novo)
  if (nota?.xml) {
    const ok = _manifSalvarArquivoXml(nota.xml, nomeArq);
    manifMsg(ok ? `✓ Arquivo ${nomeArq} salvo na pasta de Downloads.` : 'Não foi possível salvar o arquivo.', ok ? 'ok' : 'erro');
    return;
  }

  const senha = getCertSenha();
  const ambiente = document.getElementById('manif-ambiente')?.value || 'producao';
  if (!senha) { manifMsg('Senha do certificado não encontrada.', 'erro'); return; }
  manifMsg('🔄 Baixando XML da SEFAZ...', 'info');
  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_manifEmpresa.cert_path);
    const buf = await cb.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj = _manifEmpresa.cnpj?.replace(/\D/g, '');
    const resp = await fetch(`${SEFAZ_URL}/xml/${nsu}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cnpj, cert_base64:b64, cert_senha:senha, ambiente, nsu }) });
    const dados = await resp.json();
    if (dados.nfes?.[0]?.xml) {
      const xml = dados.nfes[0].xml;
      await sb.from('oct_nfe_manifestadas').update({ xml }).eq('id', id);
      const ok = _manifSalvarArquivoXml(xml, nomeArq);
      manifMsg(ok ? `✓ XML baixado e salvo na pasta de Downloads (${nomeArq}).` : '✓ XML salvo no sistema (não foi possível baixar o arquivo).', 'ok');
      manifCarregarAba();
    } else {
      manifMsg('Não foi possível baixar. A SEFAZ só libera o XML completo após a Ciência da Operação. ' + (dados.erro ? '('+dados.erro+')' : ''), 'erro');
    }
  } catch(e) { manifMsg('Erro: ' + e.message, 'erro'); }
}

function manifImprimir(id) {
  const n = _manifDados.find(x => x.id === id);
  if (!n?.xml) { manifMsg('Baixe o XML antes de imprimir.', 'info'); return; }
  // impressao do DANFE em PDF sera implementada futuramente
  manifMsg('Impressão de DANFE em PDF: em desenvolvimento.', 'info');
}

async function manifExcluirImportacao(id, chave) {
  const n = _manifDados.find(x => x.id === id);
  const ok = confirm(
    'Excluir a IMPORTAÇÃO desta nota?\n\n' +
    'Isso vai:\n' +
    '• Remover a NF-e da tela "Nota Fiscal Entrada"\n' +
    '• Reverter o estoque (tanques e produtos)\n' +
    '• Apagar a conta a pagar lançada\n\n' +
    'A nota volta para "Manifestadas" e poderá ser importada de novo.\n' +
    'A Ciência na SEFAZ NÃO é afetada.'
  );
  if (!ok) return;

  // sincroniza _empresaId usado pela funcao de reversao do nfe.js
  if (typeof _empresaId !== 'undefined') { _empresaId = _manifEmpresaId; }

  // localiza a NF-e importada por chave (ou por numero/serie como fallback)
  let nfeId = null;
  if (chave) {
    const { data } = await sb.from('oct_nfe_entrada').select('id').eq('empresa_id', _manifEmpresaId).eq('chave_nfe', chave).limit(1).single();
    nfeId = data?.id || null;
  }
  if (!nfeId && n?.numero) {
    const { data } = await sb.from('oct_nfe_entrada').select('id').eq('empresa_id', _manifEmpresaId).eq('numero', String(n.numero)).limit(1).single();
    nfeId = data?.id || null;
  }

  if (nfeId && typeof _reverterImportacaoNfe === 'function') {
    const err = await _reverterImportacaoNfe(nfeId);
    if (err) { manifMsg('Erro ao reverter: ' + err.message, 'erro'); return; }
  } else {
    manifMsg('NF-e importada não localizada — apenas mudando o status.', 'info');
  }

  // volta a manifestada para 'ciencia' (Manifestadas, nao-importada)
  await sb.from('oct_nfe_manifestadas').update({ status: 'ciencia' }).eq('id', id);
  await manifRegistrarLog(`Excluiu importação da nota ${n?.numero || n?.nsu || id} (revertida e voltou para Manifestadas)`);
  manifMsg('✓ Importação excluída. Nota voltou para "Manifestadas".', 'ok');
  manifCarregarAba();
}

async function manifDesfazer(id) {
  const n = _manifDados.find(x => x.id === id);
  const ok = confirm(
    'Devolver esta nota para "Sem Manifestação"?\n\n' +
    'Isso reorganiza apenas no sistema. A Ciência da Operação já registrada na SEFAZ NÃO é cancelada (não há como desfazer na Receita).'
  );
  if (!ok) return;
  const { error } = await sb.from('oct_nfe_manifestadas').update({ status: 'sem_manifestacao' }).eq('id', id);
  if (error) { manifMsg('Erro: ' + error.message, 'erro'); return; }
  await manifRegistrarLog(`Desfez manifestação da nota ${n?.numero || n?.nsu || id} (voltou para Sem Manifestação)`);
  manifMsg('✓ Nota devolvida para "Sem Manifestação".', 'ok');
  manifCarregarAba();
}

async function manifConsultarStatus(chave) {
  const senha = getCertSenha();
  const ambiente = document.getElementById('manif-ambiente')?.value || 'producao';
  if (!senha || !chave) { manifMsg('Dados insuficientes para consulta.', 'erro'); return; }
  manifMsg('🔄 Consultando status na SEFAZ...', 'info');
  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_manifEmpresa.cert_path);
    const buf = await cb.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const cnpj = _manifEmpresa.cnpj?.replace(/\D/g, '');
    const resp = await fetch(`${SEFAZ_URL}/consulta`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cnpj, chave_nfe:chave, cert_base64:b64, cert_senha:senha, ambiente }) });
    const dados = await resp.json();
    manifMsg(`SEFAZ [${dados.cstat||'?'}]: ${dados.xmotivo||dados.erro||'sem retorno'}`, 'info');
  } catch(e) { manifMsg('Erro: ' + e.message, 'erro'); }
}

function manifCopiarChave(chave) {
  if (!chave) { manifMsg('Esta nota não tem chave (NF-e resumida). Baixe o XML primeiro.', 'info'); return; }
  navigator.clipboard.writeText(chave).then(()=>manifMsg('✓ Chave copiada: '+chave, 'ok')).catch(()=>{
    // fallback: mostra a chave para copiar manualmente
    prompt('Copie a chave da NF-e:', chave);
  });
}

function manifCopiarChaveSelecao() {
  const chaves = [..._manifSelecionadas].map(id => _manifDados.find(n=>n.id===id)?.chave_nfe).filter(Boolean);
  if (chaves.length === 0) { manifMsg('Nenhuma nota selecionada.', 'info'); return; }
  navigator.clipboard.writeText(chaves.join('\n')).then(()=>manifMsg(`✓ ${chaves.length} chave(s) copiada(s).`,'ok')).catch(()=>manifMsg('Não foi possível copiar.','erro'));
}

async function manifBaixarXmlSelecao() {
  const ids = [..._manifSelecionadas];
  if (ids.length === 0) { manifMsg('Nenhuma nota selecionada.', 'info'); return; }
  for (const id of ids) {
    const n = _manifDados.find(x => x.id === id);
    if (n && !n.xml) await manifBaixarXml(id, n.nsu);
  }
}

// ─── LOGS ───────────────────────────────────────────────────
async function manifRegistrarLog(texto) {
  try {
    const logs = JSON.parse(localStorage.getItem('octano_manif_logs') || '[]');
    logs.unshift({ data: new Date().toISOString(), texto });
    localStorage.setItem('octano_manif_logs', JSON.stringify(logs.slice(0, 200)));
  } catch(e) {}
}

async function manifRenderLogs() {
  const area = document.getElementById('manif-lista-area');
  const acoes = document.getElementById('manif-acoes-area');
  acoes.innerHTML = '';
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('octano_manif_logs') || '[]'); } catch(e) {}
  if (logs.length === 0) { area.innerHTML = '<div class="manif-vazio">Nenhum log de consulta ainda.</div>'; return; }
  area.innerHTML = `
    <div class="manif-tabela-scroll">
      <table class="manif-tabela">
        <thead><tr><th style="width:170px">Data/Hora</th><th>Evento</th></tr></thead>
        <tbody>
          ${logs.map(l => `<tr><td style="color:#888">${new Date(l.data).toLocaleString('pt-BR')}</td><td>${l.texto}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="manif-rodape-acoes"><button class="manif-btn-linha" onclick="localStorage.removeItem('octano_manif_logs');manifCarregarAba()">🗑 Limpar logs</button></div>
  `;
}

// ─── MENSAGEM FLUTUANTE ─────────────────────────────────────
function manifMsg(texto, tipo) {
  const el = document.getElementById('manif-msg-flutuante');
  if (!el) return;
  const cores = { ok:['#0f2a0f','#2a5a2a','#4caf50'], erro:['#2a0f0f','#5a2a2a','#f87171'], info:['#0f1a2a','#2a4a6a','#60a5fa'] };
  const c = cores[tipo] || cores.info;
  el.style.cssText = `display:block;position:fixed;bottom:24px;right:24px;padding:14px 20px;border-radius:8px;font-size:0.85rem;z-index:9999;background:${c[0]};border:1px solid ${c[1]};color:${c[2]};box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:400px`;
  el.textContent = texto;
  clearTimeout(window._manifMsgTimer);
  window._manifMsgTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
}
