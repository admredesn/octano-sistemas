const SUPABASE_URL = 'https://gnlbkwvoqnncpszmokuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdubGJrd3ZvcW5uY3Bzem1va3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjQxNDcsImV4cCI6MjA5NTY0MDE0N30.gAPt0FJ1Msk2Jl_pYGEVrGcmlZzwyMJeQE_eanuFSmc';
const SEFAZ_URL = 'https://octano-sefaz-production.up.railway.app';

// Senha do certificado persiste no navegador (localStorage) ate ser removida.
// ATENCAO: fica salva em texto no navegador deste PC. Use apenas em maquina de confianca.
function getCertSenha() {
  return localStorage.getItem('octano_cert_senha') || null;
}
function setCertSenha(senha) {
  if (senha) localStorage.setItem('octano_cert_senha', senha);
  else localStorage.removeItem('octano_cert_senha');
}
