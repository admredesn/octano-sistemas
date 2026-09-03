// ============================================================
// MÓDULO OPERADORES — cadastro de operadores do PDV (login por usuário)
// ============================================================
// Cria o login (Supabase Auth) + perfil em oct_perfis com usuario/email_login,
// para o operador entrar no PDV digitando só o usuário.
//
// Segurança: o signUp normal trocaria a sessão do gerente pela do novo
// usuário. Para evitar, criamos a conta num client Supabase SECUNDÁRIO e
// temporário (persistSession:false), preservando a sessão do gerente.
// ============================================================

async function moduloOperadores() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._opEmpresaId = empresaId;

  await opListar();
}

async function opListar() {
  const conteudo = document.getElementById('conteudo');
  const empresaId = window._opEmpresaId;
  const { data: ops } = await sb.from('oct_perfis')
    .select('id,nome,usuario,email_login,perfil,master,ativo,criado_em,acessa_gerencial,papel_gerencial,modulos_mais,modulos_menos')
    .eq('empresa_id', empresaId).order('nome');

  conteudo.innerHTML = `
    <div style="max-width:1000px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="color:#f97316">👤 Operadores do PDV</h2>
        ${_opEhMaster() ? '<button onclick="opNovoForm()" class="btn-salvar">+ Novo operador</button>'
          : '<span style="color:#667;font-size:0.8rem">só o administrador cadastra usuários</span>'}
      </div>
      <div id="op-form"></div>
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:14px">
        <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
          <thead><tr style="color:#888;text-align:left;background:#0f1119">
            <th style="padding:10px 12px">Nome</th><th style="padding:10px 12px">Usuário</th>
            <th style="padding:10px 12px">Perfil</th><th style="padding:10px 12px">Gerencial</th>
            <th style="padding:10px 12px">Situação</th><th></th>
          </tr></thead>
          <tbody>
          ${(ops || []).length ? (ops || []).map(o => `
            <tr style="border-top:1px solid #1c1f2e;color:#ddd">
              <td style="padding:9px 12px;font-weight:600">${opEsc(o.nome)}</td>
              <td style="padding:9px 12px;font-family:monospace;color:#f97316">${opEsc(o.usuario) || '<span style="color:#666">— sem usuário —</span>'}</td>
              <td style="padding:9px 12px">${opEsc(o.perfil || (o.master ? 'gerente' : 'operador'))}</td>
              <td style="padding:9px 12px">${_opGerencialCel(o)}</td>
              <td style="padding:9px 12px">${o.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
              <td style="padding:9px 12px;text-align:right;white-space:nowrap">
                ${o.usuario ? '' : `<button onclick="opDefinirUsuarioForm('${o.id}','${opEsc(o.nome)}')" class="nfe-aba" style="font-size:0.76rem">Definir usuário</button>`}
                ${o.usuario ? `<button onclick="opSenhaForm('${o.id}','${opEsc(o.nome)}')" class="nfe-aba" style="font-size:0.76rem">🔑 Senha</button>` : ''}
                ${o.usuario ? `<button onclick="opAlternarAtivo('${o.id}', ${o.ativo ? 'false' : 'true'}, '${opEsc(o.nome)}')" class="nfe-aba" style="font-size:0.76rem;color:${o.ativo ? '#f87171' : '#4caf50'}">${o.ativo ? '🚫 Bloquear' : '✓ Liberar'}</button>` : ''}
                ${(o.usuario && _opEhMaster()) ? `<button onclick="opAcessoForm('${o.id}')" class="nfe-aba" style="font-size:0.76rem;color:#60a5fa">🖥 Gerencial</button>` : ''}
              </td>
            </tr>`).join('') : '<tr><td colspan="6" style="padding:20px;text-align:center;color:#666">Nenhum operador cadastrado.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p style="color:#666;font-size:0.76rem;margin-top:10px">O operador entra no PDV digitando apenas o usuário e a senha — o e-mail fica oculto.
        A coluna <b>Gerencial</b> diz quem também entra no retaguarda e com qual papel.</p>
      <p style="color:#a63;font-size:0.74rem;margin-top:6px">⚠ O papel esconde telas do menu — é organização, não segurança.
        Enquanto o RLS estiver desligado, quem souber usar o F12 alcança os dados independentemente do papel.</p>
    </div>`;
}

// ---------- ACESSO AO GERENCIAL ----------
// So' o master cadastra e concede: se o gerente do posto pudesse, ele se
// promoveria sozinho liberando Contabilidade e Parametros para a propria conta.
function _opEhMaster() {
  return (typeof EMPRESA !== 'undefined' && EMPRESA.ehMaster === true);
}

function _opGerencialCel(o) {
  if (!o.acessa_gerencial) return '<span style="color:#555">—</span>';
  const p = (typeof PAPEIS !== 'undefined' && PAPEIS[o.papel_gerencial]) || null;
  const rot = p ? p.rot.split(' —')[0] : (o.papel_gerencial || 'sem papel');
  const n = (o.modulos_mais || []).length + (o.modulos_menos || []).length;
  return `<span style="color:#60a5fa">${opEsc(rot)}</span>` +
         (n ? `<span style="color:#667;font-size:0.72rem"> · ${n} ajuste(s)</span>` : '');
}

async function opAcessoForm(id) {
  if (!_opEhMaster()) { alert('Só o administrador define acesso ao gerencial.'); return; }
  const { data: o } = await sb.from('oct_perfis')
    .select('id,nome,usuario,acessa_gerencial,papel_gerencial,modulos_mais,modulos_menos')
    .eq('id', id).single();
  if (!o) return;
  const mais = o.modulos_mais || [], menos = o.modulos_menos || [];
  const papel = o.papel_gerencial || '';

  // uma linha por tela: o papel decide o padrao, e a pessoa pode ter exceção.
  // Mostrar de onde vem cada "sim" evita a pergunta "por que ele ve' isso?"
  const linhas = (typeof MODULOS !== 'undefined' ? MODULOS : []).filter(m => !m.breve).map(m => {
    const doPapel = _opNoPapel(papel, m.id);
    const estado = menos.includes(m.id) ? 'nao' : (mais.includes(m.id) ? 'sim' : (doPapel ? 'sim' : 'nao'));
    const excecao = menos.includes(m.id) || mais.includes(m.id);
    return `<label style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:5px;
        ${excecao ? 'background:#1a2030' : ''}">
      <input type="checkbox" id="opa-${m.id}" ${estado === 'sim' ? 'checked' : ''}
        onchange="_opMarcaExcecao('${m.id}')" style="width:auto">
      <span style="color:#cdd6e0;font-size:0.82rem;flex:1">${opEsc(m.label)}</span>
      <span id="opa-org-${m.id}" style="color:#667;font-size:0.7rem">${excecao ? 'exceção' : (doPapel ? 'do papel' : '')}</span>
    </label>`;
  }).join('');

  const opcoes = Object.keys(typeof PAPEIS !== 'undefined' ? PAPEIS : {})
    .map(k => `<option value="${k}" ${papel === k ? 'selected' : ''}>${opEsc(PAPEIS[k].rot)}</option>`).join('');

  document.getElementById('op-form').innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:18px">
      <h3 style="color:#ddd;margin-bottom:4px">🖥 Acesso ao gerencial — ${opEsc(o.nome)}</h3>
      <p style="color:#667;font-size:0.78rem;margin-bottom:12px">usuário <b style="color:#f97316">${opEsc(o.usuario || '')}</b></p>
      <label style="display:flex;align-items:center;gap:8px;color:#cdd6e0;margin-bottom:12px">
        <input type="checkbox" id="opa-ativo" ${o.acessa_gerencial ? 'checked' : ''} style="width:auto">
        Pode entrar no gerencial (retaguarda)</label>
      <label style="color:#888;font-size:0.78rem">Papel</label>
      <select id="opa-papel" onchange="_opTrocouPapel()" style="width:100%;max-width:420px;padding:9px;margin:4px 0 14px;
        border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
        <option value="">— sem papel (nenhuma tela) —</option>${opcoes}</select>
      <div style="color:#888;font-size:0.78rem;margin-bottom:6px">Telas — marcado em azul é exceção ao papel</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2px;
        max-height:300px;overflow:auto;background:#0b0d14;border:1px solid #1c2130;border-radius:8px;padding:8px">
        ${linhas}</div>
      <div id="op-msg" style="margin-top:10px;font-size:0.84rem"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="opAcessoSalvar('${id}')" class="btn-salvar">Salvar acesso</button>
        <button onclick="document.getElementById('op-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
    </div>`;
}

function _opNoPapel(papel, idModulo) {
  const p = (typeof PAPEIS !== 'undefined' && PAPEIS[papel]) || null;
  if (!p) return false;
  return p.modulos === '*' || p.modulos.includes(idModulo);
}

// trocar o papel muda o padrao de TODAS as telas: redesenha as marcas para a
// pessoa ver o efeito antes de salvar
function _opTrocouPapel() {
  const papel = document.getElementById('opa-papel').value;
  (typeof MODULOS !== 'undefined' ? MODULOS : []).filter(m => !m.breve).forEach(m => {
    const cx = document.getElementById('opa-' + m.id);
    if (cx) cx.checked = _opNoPapel(papel, m.id);
    _opMarcaExcecao(m.id);
  });
}

function _opMarcaExcecao(idModulo) {
  const papel = document.getElementById('opa-papel').value;
  const marcado = document.getElementById('opa-' + idModulo).checked;
  const el = document.getElementById('opa-org-' + idModulo);
  if (!el) return;
  const doPapel = _opNoPapel(papel, idModulo);
  el.textContent = (marcado !== doPapel) ? 'exceção' : (doPapel ? 'do papel' : '');
}

async function opAcessoSalvar(id) {
  const msg = document.getElementById('op-msg');
  const papel = document.getElementById('opa-papel').value || null;
  const ativo = document.getElementById('opa-ativo').checked;
  // guarda so' a DIFERENCA para o papel: assim mexer no papel amanha reflete em
  // quem o usa, em vez de congelar a lista de telas de cada pessoa
  const mais = [], menos = [];
  (typeof MODULOS !== 'undefined' ? MODULOS : []).filter(m => !m.breve).forEach(m => {
    const cx = document.getElementById('opa-' + m.id);
    if (!cx) return;
    const doPapel = _opNoPapel(papel, m.id);
    if (cx.checked && !doPapel) mais.push(m.id);
    if (!cx.checked && doPapel) menos.push(m.id);
  });
  if (ativo && !papel && !mais.length) {
    msg.style.color = '#f87171';
    msg.textContent = 'Sem papel e sem tela marcada, a pessoa entra e não vê nada. Escolha um papel.';
    return;
  }
  msg.style.color = '#888'; msg.textContent = 'Salvando...';
  const { error } = await sb.from('oct_perfis').update({
    acessa_gerencial: ativo, papel_gerencial: papel,
    modulos_mais: mais, modulos_menos: menos,
  }).eq('id', id);
  if (error) {
    msg.style.color = '#f87171';
    msg.textContent = /acessa_gerencial|papel_gerencial|column/i.test(error.message || '')
      ? 'Falta rodar repo/sql/SQL-ACESSO-GERENCIAL.sql no Supabase.'
      : 'Erro: ' + error.message;
    return;
  }
  msg.style.color = '#4caf50';
  msg.textContent = 'Acesso salvo. Vale no próximo login da pessoa.';
  setTimeout(() => opListar(), 1200);
}

// formulário de novo operador (cria login + perfil)
function opNovoForm() {
  const div = document.getElementById('op-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:18px">
      <h3 style="color:#ddd;margin-bottom:12px">Novo operador</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome completo</label>
          <input id="op-nome" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Usuário (login)</label>
          <input id="op-usuario" autocapitalize="off" placeholder="ex: joao" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Senha</label>
          <input id="op-senha" type="password" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Perfil</label>
          <select id="op-perfil" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="operador">Operador</option><option value="gerente">Gerente</option></select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="opSalvar()" class="btn-salvar">Criar operador</button>
        <button onclick="document.getElementById('op-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="op-msg" style="margin-top:10px;font-size:0.84rem"></div>
    </div>`;
}

async function opSalvar() {
  if (!_opEhMaster()) { alert('Só o administrador cadastra usuários.'); return; }
  const nome = document.getElementById('op-nome').value.trim();
  const usuario = document.getElementById('op-usuario').value.trim().toLowerCase();
  const senha = document.getElementById('op-senha').value;
  const perfil = document.getElementById('op-perfil').value;
  const msg = document.getElementById('op-msg');
  const empresaId = window._opEmpresaId;

  if (!nome || !usuario || !senha) { msg.style.color = '#f87171'; msg.textContent = 'Preencha nome, usuário e senha.'; return; }
  if (!/^[a-z0-9._-]+$/.test(usuario)) { msg.style.color = '#f87171'; msg.textContent = 'Usuário só pode ter letras minúsculas, números, ponto, hífen e underline.'; return; }
  if (senha.length < 6) { msg.style.color = '#f87171'; msg.textContent = 'A senha deve ter ao menos 6 caracteres.'; return; }

  // verifica usuário duplicado na empresa
  const { data: jaTem } = await sb.from('oct_perfis').select('id').eq('empresa_id', empresaId).ilike('usuario', usuario).maybeSingle();
  if (jaTem) { msg.style.color = '#f87171'; msg.textContent = 'Já existe um operador com esse usuário.'; return; }

  msg.style.color = '#888'; msg.textContent = 'Criando operador...';

  // e-mail interno derivado do usuário (operador nunca o vê)
  const emailLogin = `${usuario}.${empresaId.slice(0, 8)}@octano.local`;

  // client secundário para NÃO trocar a sessão do gerente.
  // SUPABASE_URL/ANON_KEY são const globais do config.js (não ficam em window).
  const _url = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : (window.SUPABASE_URL || '');
  const _key = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : (window.SUPABASE_ANON_KEY || '');
  let sb2;
  try {
    sb2 = window.supabase.createClient(_url, _key, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'octano-op-temp' }
    });
  } catch (e) { msg.style.color = '#f87171'; msg.textContent = 'Erro ao iniciar criação: ' + e.message; return; }

  const { data: signUpData, error: errSignUp } = await sb2.auth.signUp({ email: emailLogin, password: senha });
  if (errSignUp) { msg.style.color = '#f87171'; msg.textContent = 'Erro ao criar login: ' + errSignUp.message; return; }
  const novoUid = signUpData?.user?.id;
  if (!novoUid) { msg.style.color = '#f87171'; msg.textContent = 'Não foi possível obter o ID do novo usuário (verifique confirmação de e-mail no Supabase).'; return; }

  // grava o perfil vinculado (usando a sessão do gerente, que continua ativa em sb).
  // A coluna 'perfil' tem check constraint que aceita 'master'; o nível de acesso
  // (gerente x operador) é distinguido pelo boolean 'master'.
  // Usa upsert para ser idempotente (permite retry se um login ficou órfão antes).
  const ehGerente = (perfil === 'gerente');
  const { error: errPerfil } = await sb.from('oct_perfis').upsert({
    id: novoUid, empresa_id: empresaId, nome, usuario, email_login: emailLogin,
    perfil: 'master', master: ehGerente, ativo: true,
  }, { onConflict: 'id' });
  if (errPerfil) { msg.style.color = '#f87171'; msg.textContent = 'Login criado, mas falhou ao gravar o perfil: ' + errPerfil.message; return; }

  msg.style.color = '#4caf50'; msg.textContent = `Operador "${nome}" criado! Usuário: ${usuario}`;
  setTimeout(() => opListar(), 1200);
}

// definir usuário para um perfil já existente (ex: o gerente atual, criado por e-mail)
function opDefinirUsuarioForm(id, nome) {
  const div = document.getElementById('op-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:18px">
      <h3 style="color:#ddd;margin-bottom:6px">Definir usuário para ${opEsc(nome)}</h3>
      <p style="color:#888;font-size:0.8rem;margin-bottom:12px">Informe o usuário e o e-mail de login atual desta conta (o e-mail com que ela já acessa o sistema).</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Usuário</label>
          <input id="op-set-usuario" autocapitalize="off" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">E-mail de login atual</label>
          <input id="op-set-email" type="email" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="opDefinirUsuario('${id}')" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('op-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="op-msg" style="margin-top:10px;font-size:0.84rem"></div>
    </div>`;
}

async function opDefinirUsuario(id) {
  const usuario = document.getElementById('op-set-usuario').value.trim().toLowerCase();
  const email = document.getElementById('op-set-email').value.trim();
  const msg = document.getElementById('op-msg');
  const empresaId = window._opEmpresaId;
  if (!usuario || !email) { msg.style.color = '#f87171'; msg.textContent = 'Preencha usuário e e-mail.'; return; }
  if (!/^[a-z0-9._-]+$/.test(usuario)) { msg.style.color = '#f87171'; msg.textContent = 'Usuário inválido.'; return; }

  const { data: jaTem } = await sb.from('oct_perfis').select('id').eq('empresa_id', empresaId).ilike('usuario', usuario).neq('id', id).maybeSingle();
  if (jaTem) { msg.style.color = '#f87171'; msg.textContent = 'Esse usuário já está em uso.'; return; }

  const { error } = await sb.from('oct_perfis').update({ usuario, email_login: email }).eq('id', id);
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  msg.style.color = '#4caf50'; msg.textContent = 'Usuário definido!';
  setTimeout(() => opListar(), 1000);
}

// ============================================================
// REDEFINIR SENHA
// ============================================================
// Trocar a senha de OUTRA pessoa exige chave de administracao, que nao pode
// ficar no navegador. Quem faz e o servidor (/operador/senha), que valida no
// Supabase se quem pediu e mesmo um gerente da MESMA empresa.
function opSenhaForm(id, nome) {
  const div = document.getElementById('op-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:18px">
      <h3 style="color:#ddd;margin-bottom:6px">🔑 Redefinir senha de ${opEsc(nome)}</h3>
      <p style="color:#888;font-size:0.8rem;margin-bottom:12px">
        A senha atual não pode ser consultada — ela é guardada cifrada. Defina uma nova
        e informe ao operador. Ele passa a entrar no PDV com ela imediatamente.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:520px">
        <div><label style="color:#888;font-size:0.78rem">Nova senha</label>
          <input id="op-nova-senha" type="password" autocomplete="new-password" placeholder="mínimo 6 caracteres"
            style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Repita a nova senha</label>
          <input id="op-nova-senha2" type="password" autocomplete="new-password"
            style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="opTrocarSenha('${id}','${opEsc(nome)}')" class="btn-salvar">Salvar nova senha</button>
        <button onclick="document.getElementById('op-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="op-msg" style="margin-top:10px;font-size:0.84rem"></div>
    </div>`;
  document.getElementById('op-nova-senha').focus();
}

async function opTrocarSenha(id, nome) {
  const s1 = document.getElementById('op-nova-senha').value;
  const s2 = document.getElementById('op-nova-senha2').value;
  const msg = document.getElementById('op-msg');
  if (s1.length < 6) { msg.style.color = '#f87171'; msg.textContent = 'A senha deve ter ao menos 6 caracteres.'; return; }
  if (s1 !== s2) { msg.style.color = '#f87171'; msg.textContent = 'As duas senhas não conferem.'; return; }

  msg.style.color = '#888'; msg.textContent = 'Trocando a senha...';
  const { data: { session } } = await sb.auth.getSession();
  try {
    const r = await fetch(SEFAZ_URL + '/operador/senha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session?.access_token, alvo_uid: id, senha: s1 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      msg.style.color = '#f87171';
      msg.textContent = 'Não consegui trocar: ' + (j.erro || ('erro ' + r.status));
      return;
    }
    msg.style.color = '#4caf50';
    msg.textContent = `Senha de ${nome} redefinida.`;
    setTimeout(() => { document.getElementById('op-form').innerHTML = ''; }, 1600);
  } catch (e) {
    msg.style.color = '#f87171';
    msg.textContent = 'Falha ao falar com o servidor: ' + e.message;
  }
}

// ============================================================
// BLOQUEAR / LIBERAR ACESSO
// ============================================================
// Bloquear NAO apaga: o historico do operador (turnos, cupons) continua
// intacto. A view de login ignora quem esta inativo, e o nucleo espelha isso
// a cada 5min para o bloqueio valer tambem OFFLINE.
async function opAlternarAtivo(id, ativar, nome) {
  const acao = ativar ? 'liberar' : 'bloquear';
  if (!confirm(`Confirma ${acao} o acesso de ${nome} ao PDV?`)) return;
  const { error } = await sb.from('oct_perfis').update({ ativo: !!ativar }).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  opListar();
}

function opEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
