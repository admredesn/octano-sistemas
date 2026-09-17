const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PIN de 4 dígitos (17/09/2026, decisão do Ronan). O Supabase Auth não aceita
// senha com menos de 6 caracteres; quem usa PIN tem a senha gravada como
// PIN + sufixo fixo. Senha de 6+ caracteres segue igual. A MESMA regra existe
// no PDV (pdv_web/js/core/config.js) e no retaguarda (repo/js/auth.js).
// Não é segredo (está no código): 4 dígitos = 10 mil combinações; a defesa é o
// limite de tentativas do Supabase.
const OCT_PIN_SUFIXO = '#octano-pin';
function octSenhaAuth(s) { return /^\d{4}$/.test(String(s || '')) ? String(s) + OCT_PIN_SUFIXO : s; }
function octSenhaValida(s) { return /^\d{4}$/.test(String(s || '')) || String(s || '').length >= 6; }

async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: octSenhaAuth(password) });
  if (error) throw error;
  return data;
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
