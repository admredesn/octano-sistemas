// ============================================================
// MÓDULO PERFIS — o que cada perfil pode fazer (vale para a rede toda)
// ------------------------------------------------------------
// 17/09/2026. Modelo do "Controle de Acessos" do TecnoX: perfil à esquerda,
// árvore de permissões à direita, liberar/bloquear tudo, busca. Só o Master
// edita (a policy de oct_perfis_permissoes também exige isso). O catálogo
// vem de js/permissoes.js; a exceção de UMA pessoa fica em Operadores.
// ============================================================

const _pf = { perfil: 'gerente', marcado: new Set(), original: new Set(), busca: '', fechados: new Set(), qtd: {} };

function _pfEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function moduloPerfis() {
  const conteudo = document.getElementById('conteudo');
  if (!PERM.master) {
    conteudo.innerHTML = '<p style="color:#f87171;padding:24px">Só o Master altera os perfis.</p>';
    return;
  }
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando perfis...</p>';
  const { data: pessoas } = await sb.from('oct_perfis').select('papel,ativo');
  _pf.qtd = {};
  (pessoas || []).filter(p => p.ativo !== false).forEach(p => { _pf.qtd[p.papel || '—'] = (_pf.qtd[p.papel || '—'] || 0) + 1; });
  await _pfCarregar();
}

async function _pfCarregar() {
  const conteudo = document.getElementById('conteudo');
  if (_pf.perfil !== 'master') {
    const { data, error } = await sb.from('oct_perfis_permissoes').select('chave,liberado').eq('perfil', _pf.perfil);
    if (error) {
      conteudo.innerHTML = `<p style="color:#f87171;padding:24px">${/oct_perfis_permissoes/.test(error.message) ? 'Falta rodar <b>repo/sql/SQL-PERFIS-PERMISSOES.sql</b> no Supabase.' : 'Erro: ' + _pfEsc(error.message)}</p>`;
      return;
    }
    _pf.marcado = new Set((data || []).filter(r => r.liberado).map(r => r.chave));
  } else {
    _pf.marcado = permPadrao('master');
  }
  _pf.original = new Set(_pf.marcado);
  _pfRender();
}

function _pfMudou() {
  if (_pf.marcado.size !== _pf.original.size) return true;
  for (const c of _pf.marcado) if (!_pf.original.has(c)) return true;
  return false;
}

function _pfRender() {
  const conteudo = document.getElementById('conteudo');
  const ehMaster = _pf.perfil === 'master';
  const busca = _pf.busca.toLowerCase();
  const total = PERM_CATALOGO.reduce((s, g) => s + g.itens.length, 0);
  let areaAtual = '';
  const grupos = PERM_CATALOGO.map((g, gi) => {
    const itens = g.itens.filter(i => !busca || (i.d + ' ' + i.c + ' ' + g.grupo).toLowerCase().includes(busca));
    if (!itens.length) return '';
    const lib = itens.filter(i => _pf.marcado.has(i.c)).length;
    const fechado = _pf.fechados.has(gi) && !busca;
    const cab = g.area !== areaAtual ? `<div style="color:#f97316;font-weight:700;font-size:0.8rem;letter-spacing:.5px;margin:14px 0 6px">${_pfEsc(g.area.toUpperCase())}</div>` : '';
    areaAtual = g.area;
    return `${cab}
      <div style="border:1px solid #2a2d3e;border-radius:8px;margin-bottom:8px;background:#0f1119">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer" onclick="pfAlternarGrupo(${gi})">
          <span style="color:#667;width:12px">${fechado ? '▸' : '▾'}</span>
          <b style="color:#ddd;flex:1">${_pfEsc(g.grupo)}</b>
          <span style="color:${lib === itens.length ? '#4ade80' : lib ? '#fbbf24' : '#667'};font-size:0.76rem">${lib}/${itens.length}</span>
          ${ehMaster ? '' : `<button class="nfe-aba" style="font-size:0.7rem;padding:2px 8px" onclick="event.stopPropagation();pfGrupoTodos(${gi},true)">todos</button>
          <button class="nfe-aba" style="font-size:0.7rem;padding:2px 8px" onclick="event.stopPropagation();pfGrupoTodos(${gi},false)">nenhum</button>`}
        </div>
        ${fechado ? '' : `<div style="padding:2px 12px 8px 32px">${itens.map(i => `
          <label style="display:flex;align-items:center;gap:8px;padding:3px 0;border-top:1px solid #161a24;cursor:${ehMaster ? 'default' : 'pointer'}">
            <input type="checkbox" style="width:auto" ${_pf.marcado.has(i.c) ? 'checked' : ''} ${ehMaster ? 'disabled' : ''} onchange="pfMarcar('${i.c}', this.checked)">
            <span style="color:#cdd6e0;font-size:0.83rem;flex:1">${_pfEsc(i.d)}${i.s ? ' <span title="sensível: dinheiro, documento fiscal, exclusão ou configuração" style="font-size:0.62rem;color:#fca5a5;border:1px solid #7f1d1d;border-radius:3px;padding:0 4px">sensível</span>' : ''}</span>
            <span style="color:#556;font-size:0.68rem;font-family:monospace">${_pfEsc(i.c)}</span>
          </label>`).join('')}</div>`}
      </div>`;
  }).join('');

  conteudo.innerHTML = `
  <div style="padding:18px 20px;max-width:1200px">
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">
      <h2 style="color:#f97316;margin:0">🛡️ Perfis e permissões</h2>
      <span style="color:#778;font-size:0.8rem">vale para a rede toda · a exceção de uma pessoa fica em Operadores</span>
    </div>
    <div style="display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;margin-top:14px;align-items:start">
      <div style="position:sticky;top:10px">
        ${PERFIS_OCTANO.map(p => `
          <button onclick="pfTrocarPerfil('${p.id}')" style="display:block;width:100%;text-align:left;margin-bottom:6px;padding:9px 12px;border-radius:8px;cursor:pointer;
            border:1px solid ${p.id === _pf.perfil ? '#f97316' : '#2a2d3e'};background:${p.id === _pf.perfil ? '#1f1a14' : '#13151f'};color:${p.id === _pf.perfil ? '#fdba74' : '#cbd5e1'}">
            <div style="display:flex;justify-content:space-between"><b>${_pfEsc(p.rot)}</b><span style="color:#778">${_pf.qtd[p.id] || 0}</span></div>
            <div style="font-size:0.7rem;color:#778;margin-top:2px">${_pfEsc(p.desc)}</div>
          </button>`).join('')}
        <p style="color:#667;font-size:0.72rem;line-height:1.4;margin-top:10px">O número é quantas pessoas ativas usam o perfil. A mudança vale no próximo login de cada uma.</p>
      </div>
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <input id="pf-busca" placeholder="Filtrar permissão..." value="${_pfEsc(_pf.busca)}" oninput="pfBuscar(this.value)"
            style="flex:1;min-width:200px;padding:8px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
          <span style="color:#94a3b8;font-size:0.8rem">${_pf.marcado.size} de ${total} liberadas</span>
          ${ehMaster ? '' : `
          <button class="nfe-aba" onclick="pfTodos(true)">Liberar todos</button>
          <button class="nfe-aba" onclick="pfTodos(false)">Bloquear todos</button>
          <button class="nfe-aba" onclick="pfRestaurar()">Restaurar padrão</button>
          <button class="btn-salvar" ${_pfMudou() ? '' : 'disabled style="opacity:.5"'} onclick="pfSalvar()">Salvar perfil</button>`}
        </div>
        ${ehMaster ? '<p style="color:#fbbf24;font-size:0.8rem;margin:6px 0 0">O Master tem tudo liberado e vê todos os postos. Não é editável.</p>' : ''}
        <div id="pf-msg" style="font-size:0.82rem;min-height:1em;margin:4px 0"></div>
        ${grupos || '<p style="color:#778">Nenhuma permissão com esse filtro.</p>'}
      </div>
    </div>
  </div>`;
}

function pfTrocarPerfil(id) {
  if (_pfMudou() && !confirm('Há alterações não salvas neste perfil. Descartar?')) return;
  _pf.perfil = id;
  _pfCarregar();
}
function pfAlternarGrupo(gi) { _pf.fechados.has(gi) ? _pf.fechados.delete(gi) : _pf.fechados.add(gi); _pfRender(); }
function pfMarcar(c, on) { on ? _pf.marcado.add(c) : _pf.marcado.delete(c); _pfRender(); }
function pfGrupoTodos(gi, on) { PERM_CATALOGO[gi].itens.forEach(i => on ? _pf.marcado.add(i.c) : _pf.marcado.delete(i.c)); _pfRender(); }
function pfTodos(on) { PERM_CATALOGO.forEach(g => g.itens.forEach(i => on ? _pf.marcado.add(i.c) : _pf.marcado.delete(i.c))); _pfRender(); }
function pfRestaurar() { _pf.marcado = permPadrao(_pf.perfil); _pfRender(); }
function pfBuscar(v) {
  _pf.busca = v;
  _pfRender();
  const b = document.getElementById('pf-busca');
  if (b) { b.focus(); b.setSelectionRange(v.length, v.length); }
}

async function pfSalvar() {
  if (!PERM.master || _pf.perfil === 'master') return;
  const msg = document.getElementById('pf-msg');
  const rot = (PERFIS_OCTANO.find(p => p.id === _pf.perfil) || {}).rot;
  if (!confirm(`Salvar as permissões do perfil ${rot}? Vale para todas as pessoas com esse perfil, em todos os postos.`)) return;
  msg.style.color = '#888'; msg.textContent = 'Salvando...';
  const autor = (await getSession())?.user?.id || null;
  const agora = new Date().toISOString();
  const linhas = PERM_CATALOGO.flatMap(g => g.itens).map(i => ({
    perfil: _pf.perfil, chave: i.c, liberado: _pf.marcado.has(i.c), atualizado_em: agora, atualizado_por: autor,
  }));
  const { error } = await sb.from('oct_perfis_permissoes').upsert(linhas, { onConflict: 'perfil,chave' });
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  _pf.original = new Set(_pf.marcado);
  _pfRender();
  const m = document.getElementById('pf-msg');
  if (m) { m.style.color = '#4caf50'; m.textContent = `Perfil ${rot} salvo. Vale no próximo login de cada pessoa.`; }
}
