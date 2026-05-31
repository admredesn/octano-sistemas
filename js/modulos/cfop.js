
// Cache local de CFOPs carregados do banco
let _cfopCache = null;

async function carregarCfops() {
  if (_cfopCache) return _cfopCache;
  const { data } = await sb.from('oct_cfop').select('codigo,descricao,tipo').eq('ativo', true).order('codigo');
  _cfopCache = data || [];
  return _cfopCache;
}

function cfopDescricao(codigo) {
  if (!codigo || !_cfopCache) return '';
  const found = _cfopCache.find(c => c.codigo === String(codigo).trim());
  return found?.descricao || '';
}

// Campo CFOP com busca/autocomplete
function renderCfopInput(id, value, onchange) {
  const desc = value ? cfopDescricao(value) : '';
  return `
    <div style="position:relative">
      <input id="${id}" type="text" value="${value||''}"
        placeholder="Ex: 1652"
        oninput="buscarCfop('${id}', this.value)"
        onchange="${onchange||''}"
        autocomplete="off"
        style="width:100%" />
      <span id="${id}-desc" style="font-size:0.75rem;color:#60a5fa;margin-top:3px;display:block">${desc}</span>
      <div id="${id}-lista" style="display:none;position:absolute;top:100%;left:0;right:0;background:#1a1d2e;border:1px solid #2a4a6a;border-radius:6px;max-height:200px;overflow-y:auto;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,0.5)"></div>
    </div>
  `;
}

async function buscarCfop(inputId, valor) {
  const lista = document.getElementById(inputId + '-lista');
  const desc  = document.getElementById(inputId + '-desc');
  if (!lista) return;

  const cfops = await carregarCfops();
  const termo = valor.toLowerCase().trim();

  if (!termo) { lista.style.display = 'none'; if (desc) desc.textContent = ''; return; }

  // Busca por código ou descrição
  const resultados = cfops.filter(c =>
    c.codigo.startsWith(termo) || c.descricao.toLowerCase().includes(termo)
  ).slice(0, 12);

  if (resultados.length === 0) {
    lista.style.display = 'none';
    if (desc) desc.textContent = '';
    // Verifica match exato
    const exato = cfops.find(c => c.codigo === termo);
    if (exato && desc) desc.textContent = exato.descricao;
    return;
  }

  lista.style.display = 'block';
  lista.innerHTML = resultados.map(c => `
    <div onclick="selecionarCfop('${inputId}', '${c.codigo}', '${c.descricao.replace(/'/g,"&#39;")}')"
      style="padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid #2a2d3e;display:flex;gap:10px;align-items:center"
      onmouseover="this.style.background='#2a2d3e'" onmouseout="this.style.background='transparent'">
      <span style="color:#f97316;font-weight:600;min-width:40px">${c.codigo}</span>
      <span style="color:#ccc">${c.descricao}</span>
      <span style="margin-left:auto;font-size:0.7rem;color:#555">${c.tipo}</span>
    </div>
  `).join('');

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function fechar(e) {
      if (!lista.contains(e.target) && e.target.id !== inputId) {
        lista.style.display = 'none';
        document.removeEventListener('click', fechar);
      }
    });
  }, 100);
}

function selecionarCfop(inputId, codigo, descricao) {
  const input = document.getElementById(inputId);
  const desc  = document.getElementById(inputId + '-desc');
  const lista = document.getElementById(inputId + '-lista');
  if (input) input.value = codigo;
  if (desc)  desc.textContent = descricao;
  if (lista) lista.style.display = 'none';
  // Dispara evento de change
  input?.dispatchEvent(new Event('change'));
}
