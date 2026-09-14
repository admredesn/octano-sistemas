// ============================================================
// MODULO PONTO — registro de ponto dos funcionarios (retaguarda)
// ============================================================
// Lista os registros de ponto (oct_pdv_ponto) gravados pelo PDV,
// com foto, data/hora, nome e tipo (entrada/saida). Permite filtrar
// por funcionario e periodo, e exportar relatorio CSV.
// Os funcionarios saem de oct_pessoas (classificacao 'funcionario').

async function moduloPonto() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis')
    .select('empresa_id, nome, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._pontoEmpresaId = empresaId;
  window._pontoEmpresaNome = perfil?.oct_empresas?.nome || '';
  if (typeof empresaAtiva==='function' && empresaAtiva()) { const {data:_ea}=await sb.from('oct_empresas').select('nome').eq('id',empresaAtiva()).single(); if(_ea) window._pontoEmpresaNome=_ea.nome; }

  // funcionarios (para o filtro e para listar o quadro)
  // ERRO ≠ VAZIO (14/08): com o Supabase instável a consulta falhava e a tela
  // dizia "nenhum funcionário" — mentira que já causou chamado. Erro agora
  // aparece como erro, com botão de tentar de novo.
  const { data: pessoas, error: erroPessoas } = await sb.from('oct_pessoas')
    .select('id,nome,classificacoes,tipo,ativo')
    .eq('empresa_id', empresaId).eq('ativo', true).order('nome');
  if (erroPessoas) {
    conteudo.innerHTML = `<div style="padding:26px;text-align:center">
      <p style="color:#f87171;font-size:0.95rem">⚠ Não consegui consultar os funcionários (banco fora do ar ou instável).</p>
      <p style="color:#888;font-size:0.8rem;margin:8px 0 16px">${pontoEsc(erroPessoas.message || '')}</p>
      <button onclick="moduloPonto()" style="padding:10px 22px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">↻ Tentar de novo</button>
    </div>`;
    return;
  }
  const funcionarios = (pessoas || []).filter(p => {
    const lista = Array.isArray(p.classificacoes) ? p.classificacoes : (p.tipo ? [p.tipo] : []);
    return lista.includes('funcionario');
  });
  window._pontoFuncionarios = funcionarios;
  window._pontoAutorNome = perfil?.nome || session.user.email || '';

  // QUEM PODE AJUSTAR quem decide e' o BANCO (oct_pode_ajustar_ponto + RLS). Aqui
  // so' se esconde o botao de quem vai ser barrado de qualquer jeito -- o
  // frentista loga no Supabase pelo PDV e poderia chamar a API direto.
  try {
    const { data: pode } = await sb.rpc('oct_pode_ajustar_ponto', { emp: empresaId });
    window._pontoPodeAjustar = pode === true;
  } catch (e) { window._pontoPodeAjustar = false; }

  // periodo padrao: mes corrente
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fmtInput = (d) => d.toISOString().slice(0, 10);

  conteudo.innerHTML = `
    <div style="padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <h2 style="color:#f97316;font-size:1.05rem">🕐 Registro de Ponto</h2>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">Funcionário</label>
            <select id="pt-f-func" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="">Todos</option>
              ${funcionarios.map(f => `<option value="${f.id}">${pontoEsc(f.nome)}</option>`).join('')}
            </select></div>
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">De</label>
            <input id="pt-f-ini" type="date" value="${fmtInput(ini)}" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">Até</label>
            <input id="pt-f-fim" type="date" value="${fmtInput(hoje)}" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
          <button onclick="pontoFiltrar()" style="padding:9px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Filtrar</button>
          ${window._pontoPodeAjustar ? `<button onclick="pontoIncluirAbrir()" title="Esqueceu de bater: incluir a marcação com motivo" style="padding:9px 16px;border-radius:6px;border:1px solid #f97316;background:transparent;color:#f97316;font-weight:600;cursor:pointer">+ Incluir marcação</button>` : ''}
          <button onclick="pontoExportarXLSX()" title="Excel com uma aba por funcionário" style="padding:9px 16px;border-radius:6px;border:1px solid #16a34a;background:transparent;color:#16a34a;font-weight:600;cursor:pointer">⬇ Cartão de ponto (Excel)</button>
          <button onclick="pontoExportarCSV()" title="Tudo numa planilha só" style="padding:9px 16px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;font-weight:600;cursor:pointer">⬇ Cartão em CSV</button>
          <button onclick="pontoExportarEventosCSV()" title="Uma linha por batida, com o link da foto — para auditoria" style="padding:9px 16px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;font-weight:600;cursor:pointer">⬇ Log de batidas</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:220px 1fr;gap:16px">
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;align-self:start">
          <h3 style="color:#aaa;font-size:0.8rem;margin-bottom:10px">Quadro de funcionários</h3>
          ${funcionarios.length
            ? funcionarios.map(f => `<div style="padding:7px 4px;border-bottom:1px solid #1c1f2e;color:#ddd;font-size:0.84rem">${pontoEsc(f.nome)}</div>`).join('')
            : '<p style="color:#666;font-size:0.8rem">Nenhum funcionário marcado em Pessoas.</p>'}
          <p style="color:#666;font-size:0.7rem;margin-top:10px">Marque a classificação “Funcionário” no cadastro de Pessoas para aparecer aqui.</p>
        </div>
        <div id="pt-registros"><p style="color:#888">Carregando registros...</p></div>
      </div>
    </div>`;

  pontoFiltrar();
}

function pontoEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

async function pontoFiltrar() {
  const cont = document.getElementById('pt-registros');
  if (!cont) return;
  cont.innerHTML = '<p style="color:#888">Carregando registros...</p>';

  const empresaId = window._pontoEmpresaId;
  const funcId = document.getElementById('pt-f-func')?.value || '';
  const ini = document.getElementById('pt-f-ini')?.value;
  const fim = document.getElementById('pt-f-fim')?.value;
  // FUSO: mandar "2026-09-14T23:59:59" sem fuso fazia o banco ler como UTC, e
  // quem saia depois das 21h do ultimo dia ficava FORA do cartao de ponto. A
  // data do filtro e' a do posto: converte a hora local para instante absoluto.
  const iniISO = ini ? new Date(ini + 'T00:00:00').toISOString() : null;
  const fimISO = fim ? new Date(fim + 'T23:59:59.999').toISOString() : null;
  const filtrar = (q) => {
    q = q.eq('empresa_id', empresaId);
    if (funcId) q = q.eq('pessoa_id', funcId);
    if (iniISO) q = q.gte('registrado_em', iniISO);
    if (fimISO) q = q.lte('registrado_em', fimISO);
    return q;
  };
  // PAGINADO: o PostgREST corta em 1000 linhas, e o Tijuco passa disso em pouco
  // mais de um mes -- o cartao de ponto saia cortado sem aviso nenhum.
  const paginar = async (montar) => {
    const tudo = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await montar().range(de, de + 999);
      if (error) return { error };
      tudo.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: tudo };
  };

  // EFETIVAS = o que vale (view no banco: originais nao desconsideradas + incluidas).
  // Cartao de ponto, total de horas e CSV usam SO' isto, via _pontoRegistros.
  const [ef, aj] = await Promise.all([
    paginar(() => filtrar(sb.from('oct_pdv_ponto_efetivo').select('*')).order('registrado_em', { ascending: false })),
    paginar(() => sb.from('oct_pdv_ponto_ajustes').select('*').eq('empresa_id', empresaId).order('criado_em')),
  ]);
  if (ef.error) { cont.innerHTML = '<p style="color:#f44">Erro: ' + pontoEsc(ef.error.message) + '</p>'; return; }

  const ajustes = aj.data || [];
  const anulados = new Set(ajustes.filter(a => a.acao === 'anular').map(a => a.anula_ajuste_id));
  const vivos = ajustes.filter(a => a.acao !== 'anular' && !anulados.has(a.id));
  const ajPorId = {};
  vivos.forEach(a => { ajPorId[a.id] = a; });
  const descPorPonto = {};
  vivos.filter(a => a.acao === 'desconsiderar').forEach(a => { descPorPonto[a.ponto_id] = a; });

  // as desconsideradas NAO estao na view -- busca as originais so' para mostrar
  // riscadas (auditoria: quem ve' o ajuste tem de ver o que foi ajustado)
  const riscadas = [];
  const ids = Object.keys(descPorPonto);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await filtrar(sb.from('oct_pdv_ponto').select('*')).in('id', ids.slice(i, i + 200));
    riscadas.push(...(data || []));
  }

  const efetivos = (ef.data || []).map(r => r.origem === 'incluida'
    ? Object.assign({}, r, { observacao: 'Incluída: ' + (r.ajuste_motivo || '') })
    : r);
  window._pontoRegistros = efetivos;

  const log = efetivos.map(r => Object.assign({}, r, {
      _situacao: r.origem === 'incluida' ? 'Incluída' : 'Original',
      _aj: r.origem === 'incluida' ? ajPorId[r.ajuste_id] : null,
    }))
    .concat(riscadas.map(r => Object.assign({}, r, {
      origem: 'desconsiderada', _situacao: 'Desconsiderada', _aj: descPorPonto[r.id],
    })))
    .sort((a, b) => new Date(b.registrado_em) - new Date(a.registrado_em));
  window._pontoLog = log;
  window._pontoPorId = {};
  log.forEach(r => { window._pontoPorId[r.id] = r; });

  if (!log.length) {
    cont.innerHTML = '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:30px;text-align:center;color:#666">Nenhum registro de ponto no período.</div>';
    return;
  }

  const fmtDH = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const badgeTipo = (t) => {
    const cor = t === 'saida' ? '#dc2626' : '#16a34a';
    const txt = t === 'saida' ? '◀ Saída' : '▶ Entrada';
    return `<span style="background:#1e2235;color:${cor};padding:3px 9px;border-radius:5px;font-size:0.74rem;font-weight:600">${txt}</span>`;
  };
  const selo = (r) => r.origem === 'incluida'
    ? '<span style="margin-left:6px;background:#3a2a10;color:#fbbf24;padding:2px 7px;border-radius:5px;font-size:0.68rem;font-weight:600">incluída</span>'
    : r.origem === 'desconsiderada'
      ? '<span style="margin-left:6px;background:#3a1414;color:#f87171;padding:2px 7px;border-radius:5px;font-size:0.68rem;font-weight:600">desconsiderada</span>'
      : '';
  const obs = (r) => {
    if (!r._aj) return pontoEsc(r.observacao) || '—';
    const quem = [r._aj.autor_nome, r._aj.criado_em ? fmtDH(r._aj.criado_em) : ''].filter(Boolean).join(' · ');
    return `<span style="color:#cbd5e1">${pontoEsc(r._aj.motivo)}</span><br><span style="color:#666;font-size:0.72rem">${pontoEsc(quem)}</span>`;
  };
  const acao = (r) => {
    if (!window._pontoPodeAjustar) return '';
    const txt = r.origem === 'desconsiderada' ? 'Desfazer' : 'Ajustar';
    return `<button data-id="${pontoEsc(r.id)}" onclick="pontoAjustarAbrir(this.dataset.id)"
      style="padding:5px 10px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#cbd5e1;font-size:0.76rem;cursor:pointer">${txt}</button>`;
  };
  const nAj = log.filter(r => r.origem !== 'original').length;

  cont.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:0.84rem">
        <thead><tr style="background:#0f1119;color:#888;text-align:left">
          <th style="padding:10px 12px">Foto</th>
          <th style="padding:10px 12px">Funcionário</th>
          <th style="padding:10px 12px">Tipo</th>
          <th style="padding:10px 12px">Data / Hora</th>
          <th style="padding:10px 12px">Observação</th>
          ${window._pontoPodeAjustar ? '<th style="padding:10px 12px"></th>' : ''}
        </tr></thead>
        <tbody>
          ${log.map(r => {
            const risca = r.origem === 'desconsiderada';
            return `
            <tr style="border-top:1px solid #1c1f2e;color:#ddd;${risca ? 'opacity:.55' : ''}">
              <td style="padding:8px 12px">
                ${r.foto_url
                  ? `<img src="${pontoEsc(r.foto_url)}" data-foto="${pontoEsc(r.foto_url)}"
                       data-legenda="${pontoEsc([r.funcionario, r.tipo === 'saida' ? 'Saída' : 'Entrada', fmtDH(r.registrado_em)].filter(Boolean).join('  ·  '))}"
                       onclick="verFoto(this.dataset.foto, this.dataset.legenda)"
                       style="width:46px;height:46px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid #2a2d3e" title="Ver foto">`
                  : '<span style="color:#555">—</span>'}
              </td>
              <td style="padding:8px 12px;font-weight:600;${risca ? 'text-decoration:line-through' : ''}">${pontoEsc(r.funcionario)}</td>
              <td style="padding:8px 12px;white-space:nowrap">${badgeTipo(r.tipo)}${selo(r)}</td>
              <td style="padding:8px 12px;white-space:nowrap;${risca ? 'text-decoration:line-through' : ''}">${fmtDH(r.registrado_em)}</td>
              <td style="padding:8px 12px;color:#999">${obs(r)}</td>
              ${window._pontoPodeAjustar ? `<td style="padding:8px 12px;text-align:right">${acao(r)}</td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p style="color:#666;font-size:0.76rem;margin-top:8px">${efetivos.length} marcação(ões) valendo no período${nAj ? ` · ${nAj} com ajuste` : ''}.</p>`;
}

// ---------------------------------------------------------------------------
// AJUSTE DE PONTO (tratamento) — 14/09/2026
// ---------------------------------------------------------------------------
// A marcacao ORIGINAL nunca e' alterada (Portaria 671/2021): tudo vira linha em
// oct_pdv_ponto_ajustes, que so' aceita INSERT. "Corrigir" = desconsiderar a
// original + incluir a certa no mesmo lote; "desfazer" = anular o ajuste.
// Motivo obrigatorio. Quem pode: o banco decide (oct_pode_ajustar_ponto).
function _pontoModal(html) {
  _pontoModalFechar();
  const ov = document.createElement('div');
  ov.id = 'pt-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2500;background:rgba(6,7,12,.75);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:12px;width:100%;max-width:460px;max-height:90vh;overflow:auto;padding:20px;color:#ddd">${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) _pontoModalFechar(); });
  document.addEventListener('keydown', _pontoModalTecla);
  document.body.appendChild(ov);
  return ov.firstElementChild;
}
function _pontoModalTecla(e) { if (e.key === 'Escape') _pontoModalFechar(); }
function _pontoModalFechar() {
  const ov = document.getElementById('pt-modal');
  if (ov) ov.remove();
  document.removeEventListener('keydown', _pontoModalTecla);
}

function _pontoLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

// campos de uma marcacao (funcionario, tipo, data/hora) -- inclusao e correcao
function _pontoCampos(base) {
  const funcs = window._pontoFuncionarios || [];
  const lab = 'display:block;color:#8892a0;font-size:0.74rem;margin:10px 0 4px';
  const inp = 'width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;box-sizing:border-box';
  return `
    <label style="${lab}">Funcionário</label>
    <select id="pt-aj-func" style="${inp}">
      ${funcs.map(f => `<option value="${pontoEsc(f.id)}" ${base && base.pessoa_id === f.id ? 'selected' : ''}>${pontoEsc(f.nome)}</option>`).join('')}
    </select>
    <label style="${lab}">Tipo</label>
    <select id="pt-aj-tipo" style="${inp}">
      <option value="entrada" ${base && base.tipo === 'saida' ? '' : 'selected'}>▶ Entrada</option>
      <option value="saida" ${base && base.tipo === 'saida' ? 'selected' : ''}>◀ Saída</option>
    </select>
    <label style="${lab}">Data e hora</label>
    <input id="pt-aj-dh" type="datetime-local" value="${_pontoLocalInput(base && base.registrado_em)}" style="${inp}">`;
}

function _pontoRodape(rotuloSalvar) {
  return `
    <label style="display:block;color:#8892a0;font-size:0.74rem;margin:14px 0 4px">Motivo <span style="color:#f97316">*</span></label>
    <textarea id="pt-aj-motivo" rows="2" placeholder="ex.: esqueceu de bater a saída — confirmado com o gerente do turno"
      style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;box-sizing:border-box;resize:vertical"></textarea>
    <p id="pt-aj-msg" style="min-height:18px;font-size:0.8rem;margin:8px 0 0"></p>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button type="button" onclick="_pontoModalFechar()" style="flex:1;padding:10px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#cbd5e1;cursor:pointer">Cancelar</button>
      <button type="button" id="pt-aj-salvar" style="flex:2;padding:10px;border-radius:6px;border:none;background:#f97316;color:#fff;font-weight:600;cursor:pointer">${rotuloSalvar}</button>
    </div>`;
}

// le os campos da marcacao; devolve {erro} ou os campos de uma linha 'incluir'
function _pontoLerCampos() {
  const sel = document.getElementById('pt-aj-func');
  const dh = document.getElementById('pt-aj-dh').value;
  if (!sel || !sel.value) return { erro: 'Escolha o funcionário.' };
  if (!dh) return { erro: 'Informe a data e a hora.' };
  const quando = new Date(dh);
  if (isNaN(quando)) return { erro: 'Data e hora inválidas.' };
  if (quando.getTime() > Date.now() + 5 * 60000) return { erro: 'A marcação não pode ficar no futuro.' };
  return {
    pessoa_id: sel.value,
    funcionario: sel.options[sel.selectedIndex].text,
    tipo: document.getElementById('pt-aj-tipo').value,
    data_ponto: quando.toISOString(),
  };
}

async function _pontoGravar(linhas) {
  const msg = document.getElementById('pt-aj-msg');
  const btn = document.getElementById('pt-aj-salvar');
  const motivo = (document.getElementById('pt-aj-motivo').value || '').trim();
  if (motivo.length < 5) { msg.style.color = '#f87171'; msg.textContent = 'Escreva o motivo do ajuste (mínimo 5 letras).'; return; }
  const lote = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
  const corpo = linhas.map(l => Object.assign(
    { empresa_id: window._pontoEmpresaId, motivo, autor_nome: window._pontoAutorNome || null },
    lote ? { lote } : {},
    l));
  btn.disabled = true; msg.style.color = '#8892a0'; msg.textContent = 'Gravando…';
  // um INSERT so' com todas as linhas: "corrigir" nunca fica pela metade
  const { error } = await sb.from('oct_pdv_ponto_ajustes').insert(corpo);
  if (error) {
    btn.disabled = false; msg.style.color = '#f87171';
    msg.textContent = /row-level security|42501/i.test(error.message || '')
      ? 'Sem permissão para ajustar o ponto desta empresa.'
      : 'Erro ao gravar: ' + error.message;
    return;
  }
  _pontoModalFechar();
  pontoFiltrar();
}

function pontoIncluirAbrir() {
  const box = _pontoModal(`
    <h3 style="color:#f97316;font-size:1rem;margin:0 0 2px">Incluir marcação</h3>
    <p style="color:#8892a0;font-size:0.78rem;margin:0">Para quem esqueceu de bater. Fica marcada como <b style="color:#fbbf24">incluída</b> no cartão de ponto.</p>
    ${_pontoCampos(null)}
    ${_pontoRodape('Incluir marcação')}`);
  box.querySelector('#pt-aj-salvar').addEventListener('click', () => {
    const c = _pontoLerCampos();
    const msg = document.getElementById('pt-aj-msg');
    if (c.erro) { msg.style.color = '#f87171'; msg.textContent = c.erro; return; }
    _pontoGravar([Object.assign({ acao: 'incluir' }, c)]);
  });
}

function pontoAjustarAbrir(id) {
  const r = (window._pontoPorId || {})[id];
  if (!r) return;
  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const resumo = `${pontoEsc(r.funcionario)} · ${r.tipo === 'saida' ? 'Saída' : 'Entrada'} · ${fmt(r.registrado_em)}`;

  // desconsiderada: a unica acao e' desfazer (anular a desconsideracao)
  if (r.origem === 'desconsiderada') {
    const box = _pontoModal(`
      <h3 style="color:#f97316;font-size:1rem;margin:0 0 2px">Desfazer desconsideração</h3>
      <p style="color:#8892a0;font-size:0.78rem;margin:0 0 6px">${resumo}</p>
      <p style="color:#cbd5e1;font-size:0.8rem;margin:0">A marcação volta a valer no cartão de ponto. O histórico do ajuste continua registrado.</p>
      ${_pontoRodape('Desfazer')}`);
    box.querySelector('#pt-aj-salvar').addEventListener('click', () =>
      _pontoGravar([{ acao: 'anular', anula_ajuste_id: r._aj.id }]));
    return;
  }

  const ehIncluida = r.origem === 'incluida';
  const box = _pontoModal(`
    <h3 style="color:#f97316;font-size:1rem;margin:0 0 2px">Ajustar marcação</h3>
    <p style="color:#8892a0;font-size:0.78rem;margin:0">${resumo}${ehIncluida ? ' · <span style="color:#fbbf24">incluída</span>' : ''}</p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <label style="flex:1;display:flex;gap:6px;align-items:center;padding:9px;border:1px solid #2a2d3e;border-radius:6px;cursor:pointer;font-size:0.82rem">
        <input type="radio" name="pt-aj-modo" value="corrigir" checked> Corrigir</label>
      <label style="flex:1;display:flex;gap:6px;align-items:center;padding:9px;border:1px solid #2a2d3e;border-radius:6px;cursor:pointer;font-size:0.82rem">
        <input type="radio" name="pt-aj-modo" value="tirar"> ${ehIncluida ? 'Desfazer inclusão' : 'Desconsiderar'}</label>
    </div>
    <div id="pt-aj-corrigir">
      <p style="color:#666;font-size:0.72rem;margin:8px 0 0">Funcionário, tipo ou horário errado. A original fica guardada; a certa entra no lugar.</p>
      ${_pontoCampos(r)}
    </div>
    <p id="pt-aj-tirar" style="display:none;color:#cbd5e1;font-size:0.8rem;margin:10px 0 0">
      ${ehIncluida ? 'A marcação incluída deixa de valer.' : 'Batida duplicada ou errada: sai do cálculo, mas continua visível, riscada.'}</p>
    ${_pontoRodape('Salvar ajuste')}`);
  const modo = () => box.querySelector('input[name="pt-aj-modo"]:checked').value;
  box.querySelectorAll('input[name="pt-aj-modo"]').forEach(el => el.addEventListener('change', () => {
    box.querySelector('#pt-aj-corrigir').style.display = modo() === 'corrigir' ? 'block' : 'none';
    box.querySelector('#pt-aj-tirar').style.display = modo() === 'tirar' ? 'block' : 'none';
  }));
  box.querySelector('#pt-aj-salvar').addEventListener('click', () => {
    // tirar a original = desconsiderar; tirar uma incluida = anular a inclusao
    const tirar = ehIncluida
      ? { acao: 'anular', anula_ajuste_id: r.ajuste_id }
      : { acao: 'desconsiderar', ponto_id: r.id };
    if (modo() === 'tirar') { _pontoGravar([tirar]); return; }
    const c = _pontoLerCampos();
    const msg = document.getElementById('pt-aj-msg');
    if (c.erro) { msg.style.color = '#f87171'; msg.textContent = c.erro; return; }
    const igual = c.pessoa_id === r.pessoa_id && c.tipo === r.tipo &&
      Math.abs(new Date(c.data_ponto) - new Date(r.registrado_em)) < 60000;
    if (igual) { msg.style.color = '#f87171'; msg.textContent = 'Nada mudou: altere o funcionário, o tipo ou o horário.'; return; }
    _pontoGravar([tirar, Object.assign({ acao: 'incluir' }, c)]);
  });
}

// ---------------------------------------------------------------------------
// EXPORTAR — cartao de ponto (uma linha por funcionario/dia)
// ---------------------------------------------------------------------------
// Antes saia uma linha por batida: para conferir a jornada de alguem era preciso
// garimpar a planilha inteira. Agora e' o formato que o RH usa.
function _pontoPares(regs) {
  // agrupa por funcionario e casa entrada->saida na ordem do relogio.
  // A JORNADA ATRAVESSA A MEIA-NOITE: posto trabalha de madrugada (entrou 23:00,
  // saiu 00:59). Fechar o dia a meia-noite deixaria um dia com entrada sem saida
  // e outro com saida sem entrada, e as horas sumiriam das duas pontas.
  const porFunc = {};
  regs.forEach(r => {
    const nome = r.funcionario || '—';
    (porFunc[nome] = porFunc[nome] || []).push(r);
  });

  const saida = {};
  Object.keys(porFunc).forEach(nome => {
    const lista = porFunc[nome]
      .slice()
      .sort((a, b) => new Date(a.registrado_em) - new Date(b.registrado_em));
    const dias = {};
    let aberta = null;                       // entrada esperando a saida
    let primeira = true;                     // ainda nao vimos batida nenhuma
    const alerta = (chave, txt) => {
      dias[chave] = dias[chave] || { pares: [], avisos: [] };
      if (dias[chave].avisos.indexOf(txt) < 0) dias[chave].avisos.push(txt);
    };
    lista.forEach((r, idx) => {
      const d = new Date(r.registrado_em);
      const chave = _pontoDiaChave(d);
      dias[chave] = dias[chave] || { pares: [], avisos: [] };
      if (r.tipo === 'saida') {
        if (!aberta) {
          // primeira batida do periodo sendo saida nao e' erro: a entrada ficou
          // no dia anterior, fora do filtro. Avisar como falha faria o RH cacar
          // problema que nao existe
          alerta(chave, primeira ? 'entrada antes do período' : 'saída sem entrada');
          primeira = false;
          return;
        }
        primeira = false;
        const cd = _pontoDiaChave(aberta);
        dias[cd] = dias[cd] || { pares: [], avisos: [] };
        // jornada de mais de 16h quase sempre e' saida esquecida e batida dias
        // depois. O par aparece marcado, mas NAO entra no total: somar 100h numa
        // folha de pagamento por engano do relogio e' pior que faltar a linha.
        const horas = (d - aberta) / 3600000;
        dias[cd].pares.push({ ent: aberta, sai: d, suspeito: horas > 16 });
        if (horas > 16) alerta(cd, 'jornada de ' + Math.round(horas) + 'h — confira, não somei');
        else if (cd !== chave) alerta(cd, 'saiu no dia seguinte');
        aberta = null;
      } else {
        // entrada com outra entrada aberta = alguem esqueceu de bater a saida
        if (aberta) alerta(_pontoDiaChave(aberta), 'entrada sem saída');
        aberta = d;
        primeira = false;
      }
    });
    if (aberta) {
      // ultima batida sendo entrada de HOJE = a pessoa esta' no turno agora,
      // nao esqueceu de bater
      const hoje = _pontoDiaChave(new Date());
      const cd = _pontoDiaChave(aberta);
      alerta(cd, cd === hoje ? 'ainda em serviço' : 'entrada sem saída');
    }
    saida[nome] = dias;
  });
  return saida;
}

function _pontoDiaChave(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function _pontoDiaBr(chave) {
  const p = chave.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function _pontoHora(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// horas em h:mm — decimal (7,58) confunde quem confere folha de pagamento
function _pontoDur(min) {
  const m = Math.max(0, Math.round(min));
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// EXPORTAR — Excel com UMA ABA POR FUNCIONARIO
// ---------------------------------------------------------------------------
// CSV nao tem aba. Para separar por pessoa e' preciso xlsx de verdade, entao a
// biblioteca entra SOB DEMANDA (so' ao clicar): carregar 900 KB em toda abertura
// da tela para um botao que se usa uma vez por mes nao se paga.
function _pontoCarregarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (window._pontoXlsxCarregando) return window._pontoXlsxCarregando;
  window._pontoXlsxCarregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => falha(new Error('não consegui baixar a biblioteca do Excel (sem internet?)'));
    document.head.appendChild(s);
  });
  return window._pontoXlsxCarregando;
}

// nome de aba do Excel: 31 caracteres, sem : \ / ? * [ ] -- e nao pode repetir
function _pontoNomeAba(nome, usados) {
  let n = String(nome || 'SEM NOME').replace(/[:\\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'SEM NOME';
  if (usados[n]) {
    const base = n.slice(0, 28);
    let i = 2;
    while (usados[base + ' ' + i]) i++;
    n = base + ' ' + i;
  }
  usados[n] = true;
  return n;
}

async function pontoExportarXLSX() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }

  let XLSX;
  try { XLSX = await _pontoCarregarXLSX(); }
  catch (e) { alert(e.message); return; }

  const porFunc = _pontoPares(regs);
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const wb = XLSX.utils.book_new();
  const usados = {};
  const resumo = [['Funcionário', 'Dias com marcação', 'Horas no período', 'Horas (decimal)', 'Dias com pendência']];

  const nomes = Object.keys(porFunc).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  nomes.forEach(nome => {
    const dias = porFunc[nome];
    const chaves = Object.keys(dias).sort();

    // colunas de marcacao pela maior jornada DESTA pessoa: cada aba fica no
    // tamanho dela, em vez de herdar as colunas vazias do colega que bate mais
    let maxPares = 1;
    chaves.forEach(c => { if (dias[c].pares.length > maxPares) maxPares = dias[c].pares.length; });

    const cab = ['Data', 'Dia'];
    for (let i = 1; i <= maxPares; i++) { cab.push('Entrada ' + i); cab.push('Saída ' + i); }
    cab.push('Horas do dia', 'Horas (decimal)', 'Observação');

    const linhas = [cab];
    let totalMin = 0, diasComMarca = 0, diasPendentes = 0;
    chaves.forEach(chave => {
      const dia = dias[chave];
      let min = 0;
      const cols = [];
      for (let i = 0; i < maxPares; i++) {
        const p = dia.pares[i];
        if (p) {
          cols.push(_pontoHora(new Date(p.ent)), _pontoHora(new Date(p.sai)));
          if (!p.suspeito) min += (new Date(p.sai) - new Date(p.ent)) / 60000;
        }
        else { cols.push('', ''); }
      }
      totalMin += min;
      if (dia.pares.length) diasComMarca++;
      const avisos = dia.avisos.slice();
      if (min > 16 * 60) avisos.push(_pontoDur(min) + ' no dia — confira');
      if (avisos.length) diasPendentes++;
      const dt = new Date(chave + 'T12:00:00');
      linhas.push([
        _pontoDiaBr(chave), SEMANA[dt.getDay()], ...cols,
        dia.pares.length ? _pontoDur(min) : '',
        dia.pares.length ? Math.round(min / 0.6) / 100 : '',
        avisos.join(' · '),
      ]);
    });
    linhas.push([]);
    linhas.push(['TOTAL', '', ...new Array(maxPares * 2).fill(''),
                 _pontoDur(totalMin), Math.round(totalMin / 0.6) / 100, '']);

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = [{ wch: 12 }, { wch: 9 }]
      .concat(new Array(maxPares * 2).fill({ wch: 10 }))
      .concat([{ wch: 12 }, { wch: 14 }, { wch: 34 }]);
    XLSX.utils.book_append_sheet(wb, ws, _pontoNomeAba(nome, usados));

    resumo.push([nome, diasComMarca, _pontoDur(totalMin), Math.round(totalMin / 0.6) / 100, diasPendentes]);
  });

  // Resumo na FRENTE: quem abre o arquivo quer primeiro o total de cada um, e
  // so' depois desce no detalhe de quem chamou a atencao
  const wsR = XLSX.utils.aoa_to_sheet(resumo);
  wsR['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 17 }, { wch: 16 }, { wch: 19 }];
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');
  wb.SheetNames.unshift(wb.SheetNames.pop());

  const nomeArq = 'cartao_ponto_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.xlsx';
  XLSX.writeFile(wb, nomeArq);
}

function pontoExportarCSV() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }

  const porFunc = _pontoPares(regs);
  // quantas colunas de marcacao? o maior numero de pares do periodo manda --
  // fixar em 2 cortaria a jornada de quem bateu mais vezes, e o cartao mentiria
  let maxPares = 1;
  Object.values(porFunc).forEach(dias => Object.values(dias)
    .forEach(d => { if (d.pares.length > maxPares) maxPares = d.pares.length; }));

  const sep = ';';
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const cab = ['Funcionario', 'Data', 'Dia'];
  for (let i = 1; i <= maxPares; i++) { cab.push('Entrada ' + i); cab.push('Saida ' + i); }
  cab.push('Horas do dia', 'Marcacoes', 'Observacao');

  const linhas = [];
  Object.keys(porFunc).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(nome => {
    const dias = porFunc[nome];
    let totalFunc = 0;
    Object.keys(dias).sort().forEach(chave => {
      const dia = dias[chave];
      let minutos = 0;
      const cols = [];
      for (let i = 0; i < maxPares; i++) {
        const p = dia.pares[i];
        if (p) {
          cols.push(_pontoHora(p.ent), _pontoHora(p.sai));
          if (!p.suspeito) minutos += (p.sai - p.ent) / 60000;
        } else {
          cols.push('', '');
        }
      }
      totalFunc += minutos;
      const avisos = dia.avisos.slice();
      if (minutos > 16 * 60) avisos.push(_pontoDur(minutos) + ' no dia — confira');
      const dt = new Date(chave + 'T12:00:00');
      linhas.push([
        cel(nome), cel(_pontoDiaBr(chave)), cel(SEMANA[dt.getDay()]),
        ...cols.map(cel),
        cel(dia.pares.length ? _pontoDur(minutos) : ''),
        cel(dia.pares.length * 2 + (avisos.length ? 1 : 0)),
        cel(avisos.join(' · ')),
      ].join(sep));
    });
    // total do funcionario logo abaixo dos dias dele: quem confere folha soma
    // por pessoa, e somar 30 linhas na mao e' onde nasce a divergencia
    const vazias = new Array(maxPares * 2).fill('').map(cel);
    linhas.push([cel(nome), cel('TOTAL'), cel(''), ...vazias,
                 cel(_pontoDur(totalFunc)), cel(''), cel('')].join(sep));
    linhas.push('');
  });

  const txt = '\uFEFF' + [cab.join(sep), ...linhas].join('\r\n');
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cartao_ponto_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// O log evento a evento continua exportavel: e' o que tem a FOTO de cada batida,
// que e' a prova. O cartao e' para conferir jornada; o log, para auditar.
function pontoExportarEventosCSV() {
  // AUDITORIA: todas as batidas -- originais, INCLUIDAS e DESCONSIDERADAS --
  // com quem ajustou, quando e por que. O cartao de ponto usa so' as que valem;
  // este log mostra tambem o que foi tratado, que e' o que um fiscal pede.
  const regs = window._pontoLog || window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }
  const sep = ';';
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['Funcionario', 'Tipo', 'Data', 'Hora', 'Situacao', 'Observacao', 'Motivo do ajuste',
               'Ajustado por', 'Ajustado em', 'Foto (URL)'].join(sep);
  const linhas = regs.map(r => {
    const d = new Date(r.registrado_em);
    const aj = r._aj || null;
    const em = aj && aj.criado_em ? new Date(aj.criado_em) : null;
    return [
      cel(r.funcionario),
      cel(r.tipo === 'saida' ? 'Saida' : 'Entrada'),
      cel(d.toLocaleDateString('pt-BR')),
      cel(d.toLocaleTimeString('pt-BR')),
      cel(r._situacao || 'Original'),
      cel(r.origem === 'incluida' ? '' : (r.observacao || '')),
      cel(aj ? aj.motivo : ''),
      cel(aj ? (aj.autor_nome || '') : ''),
      cel(em ? em.toLocaleString('pt-BR') : ''),
      cel(r.foto_url || ''),
    ].join(sep);
  });
  const txt = '\uFEFF' + [cab, ...linhas].join('\r\n');
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ponto_eventos_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
