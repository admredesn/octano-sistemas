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
  const empresaId = perfil?.empresa_id;
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._opEmpresaId = empresaId;

  await opListar();
}

async function opListar() {
  const conteudo = document.getElementById('conteudo');
  const empresaId = window._opEmpresaId;
  const { data: ops } = await sb.from('oct_perfis')
    .select('id,nome,usuario,email_login,perfil,master,ativo,criado_em')
    .eq('empresa_id', empresaId).order('nome');

  conteudo.innerHTML = `
    <div style="max-width:1000px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="color:#f97316">👤 Operadores do PDV</h2>
        <button onclick="opNovoForm()" class="btn-salvar">+ Novo operador</button>
      </div>
      <div id="op-form"></div>
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:14px">
        <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
          <thead><tr style="color:#888;text-align:left;background:#0f1119">
            <th style="padding:10px 12px">Nome</th><th style="padding:10px 12px">Usuário</th>
            <th style="padding:10px 12px">Perfil</th><th style="padding:10px 12px">Situação</th><th></th>
          </tr></thead>
          <tbody>
          ${(ops || []).length ? (ops || []).map(o => `
            <tr style="border-top:1px solid #1c1f2e;color:#ddd">
              <td style="padding:9px 12px;font-weight:600">${opEsc(o.nome)}</td>
              <td style="padding:9px 12px;font-family:monospace;color:#f97316">${opEsc(o.usuario) || '<span style="color:#666">— sem usuário —</span>'}</td>
              <td style="padding:9px 12px">${opEsc(o.perfil || (o.master ? 'gerente' : 'operador'))}</td>
              <td style="padding:9px 12px">${o.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
              <td style="padding:9px 12px;text-align:right">
                ${o.usuario ? '' : `<button onclick="opDefinirUsuarioForm('${o.id}','${opEsc(o.nome)}')" class="nfe-aba" style="font-size:0.76rem">Definir usuário</button>`}
              </td>
            </tr>`).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#666">Nenhum operador cadastrado.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p style="color:#666;font-size:0.76rem;margin-top:10px">O operador entra no PDV digitando apenas o usuário e a senha — o e-mail fica oculto.</p>
    </div>`;
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

function opEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
