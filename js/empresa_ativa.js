// ============================================================
// core/empresa_ativa.js  -  Multi-empresa (seletor da matriz)
// ============================================================
// Centraliza qual empresa esta "ativa" no retaguarda. TODOS os modulos
// devem usar empresaAtiva() em vez de buscar perfil.empresa_id direto.
// Assim o seletor do topo troca a empresa e todas as telas acompanham.
//
// Regras:
//  - usuario MASTER (oct_perfis.master = true) ve TODAS as empresas e troca.
//  - usuario normal fica preso a empresa do proprio perfil.
//  - a empresa ativa fica em memoria (sessionStorage) e sobrevive a F5.

const EMPRESA = {
  ativaId: null,        // empresa_id selecionado no momento
  lista: [],            // [{id, nome, nome_fantasia, cnpj}, ...]
  ehMaster: false,      // o usuario pode trocar de empresa?
  perfilEmpresaId: null // empresa do proprio perfil (fallback)
};

// chave de persistencia (sobrevive a F5 dentro da mesma aba)
const _EMP_KEY = 'octano_empresa_ativa';

// Carrega o perfil + lista de empresas. Chamar no login, antes de montar a UI.
async function empresaCarregarContexto(session) {
  // 1) perfil do usuario logado
  const { data: perfil } = await sb
    .from('oct_perfis')
    .select('empresa_id, master')
    .eq('id', session.user.id).single();

  EMPRESA.perfilEmpresaId = perfil?.empresa_id || null;
  EMPRESA.ehMaster = perfil?.master === true;

  // 2) lista de empresas que o usuario pode ver
  if (EMPRESA.ehMaster) {
    // master ve todas
    const { data } = await sb
      .from('oct_empresas')
      .select('id, nome, nome_fantasia, cnpj')
      .order('nome', { ascending: true });
    EMPRESA.lista = data || [];
  } else {
    // usuario normal: so a propria
    if (EMPRESA.perfilEmpresaId) {
      const { data } = await sb
        .from('oct_empresas')
        .select('id, nome, nome_fantasia, cnpj')
        .eq('id', EMPRESA.perfilEmpresaId);
      EMPRESA.lista = data || [];
    } else {
      EMPRESA.lista = [];
    }
  }

  // 3) define a empresa ativa: a salva (se ainda existir na lista) ou a do perfil
  const salva = sessionStorage.getItem(_EMP_KEY);
  const existeSalva = salva && EMPRESA.lista.some(e => e.id === salva);
  EMPRESA.ativaId = existeSalva ? salva
                    : (EMPRESA.perfilEmpresaId
                       || (EMPRESA.lista[0] && EMPRESA.lista[0].id)
                       || null);
  if (EMPRESA.ativaId) sessionStorage.setItem(_EMP_KEY, EMPRESA.ativaId);
}

// >>> FUNCAO CENTRAL: todo modulo usa isto para saber a empresa atual <<<
function empresaAtiva() {
  return EMPRESA.ativaId || EMPRESA.perfilEmpresaId || null;
}

// dados completos da empresa ativa (para exibir nome/cnpj)
function empresaAtivaInfo() {
  return EMPRESA.lista.find(e => e.id === empresaAtiva()) || null;
}

// troca a empresa ativa e recarrega o modulo atual
function empresaTrocar(novoId) {
  if (!novoId || novoId === EMPRESA.ativaId) return;
  if (!EMPRESA.lista.some(e => e.id === novoId)) return;  // so empresas permitidas
  EMPRESA.ativaId = novoId;
  sessionStorage.setItem(_EMP_KEY, novoId);
  // atualiza o rotulo do seletor e recarrega a tela atual com a nova empresa
  empresaRenderSeletor();
  if (typeof _moduloAtual !== 'undefined' && typeof navegarPara === 'function') {
    navegarPara(_moduloAtual);
  }
}

// monta o seletor no topo (substitui o antigo "empresa-info" fixo)
function empresaRenderSeletor() {
  const alvo = document.getElementById('empresa-seletor');
  if (!alvo) return;
  const info = empresaAtivaInfo();
  const nome = info ? (info.nome_fantasia || info.nome) : 'Empresa';

  if (EMPRESA.ehMaster && EMPRESA.lista.length > 1) {
    // master com varias empresas: dropdown de troca
    alvo.innerHTML =
      '🏢 <select id="empresa-select" onchange="empresaTrocar(this.value)" ' +
      'style="background:#13151f;color:#fff;border:1px solid #2a2d3e;border-radius:6px;padding:4px 8px;font-size:0.85rem;cursor:pointer">' +
      EMPRESA.lista.map(e =>
        '<option value="' + e.id + '"' + (e.id === empresaAtiva() ? ' selected' : '') + '>' +
        ((e.nome_fantasia || e.nome) + (e.cnpj ? ' — ' + e.cnpj : '')) +
        '</option>'
      ).join('') +
      '</select>';
  } else {
    // usuario normal (ou so 1 empresa): rotulo fixo, clicavel para a tela Empresa
    alvo.innerHTML = '<span style="cursor:pointer" onclick="navegarPara(\'empresa\')">🏢 ' + nome + '</span>';
  }
}
