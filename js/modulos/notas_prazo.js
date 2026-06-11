// ============================================================
// MÓDULO NOTAS A PRAZO — consulta das fotos de notas a prazo (retaguarda)
// ============================================================
async function moduloNotasPrazo() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._npEmpresaId = perfil.empresa_id;
  await npListar();
}

async function npListar() {
  const conteudo = document.getElementById('conteudo');
  const eid = window._npEmpresaId;
  const filtroCli = window._npFiltroCliente || '';

  const [cliRes, notasRes] = await Promise.all([
    sb.from('oct_pessoas').select('id,nome').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    (() => {
      let q = sb.from('oct_pdv_notas_prazo').select('*').eq('empresa_id', eid).order('registrado_em', { ascending: false });
      if (filtroCli) q = q.eq('cliente_id', filtroCli);
      return q;
    })(),
  ]);
  const clientes = cliRes.data || [];
  const notas = notasRes.data || [];

  conteudo.innerHTML = `
    <div style="max-width:1100px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <h2 style="color:#f97316">📄 Notas a Prazo</h2>
        <div>
          <label style="color:#888;font-size:0.78rem;margin-right:6px">Cliente</label>
          <select onchange="npSetFiltro(this.value)" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="">Todos</option>
            ${clientes.map(c => `<option value="${c.id}" ${filtroCli === c.id ? 'selected' : ''}>${npEsc(c.nome)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${notas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">
          ${notas.map(n => {
            const d = new Date(n.registrado_em);
            return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
              ${n.foto_url ? `<img src="${npEsc(n.foto_url)}" onclick="window.open('${npEsc(n.foto_url)}','_blank')" style="width:100%;height:160px;object-fit:cover;cursor:pointer;display:block">` : '<div style="height:160px;background:#0b0d14;display:flex;align-items:center;justify-content:center;color:#555">sem foto</div>'}
              <div style="padding:10px">
                <div style="color:#ddd;font-weight:500;font-size:0.86rem">${npEsc(n.cliente_nome) || '—'}</div>
                <div style="color:#9aa;font-size:0.76rem;margin-top:3px">${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="color:#4ade80;font-size:0.82rem;margin-top:3px">R$ ${Number(n.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                ${n.numero_nfe ? `<div style="color:#666;font-size:0.72rem;margin-top:2px">NFC-e ${npEsc(n.numero_nfe)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>` : '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:30px;text-align:center;color:#666">Nenhuma nota a prazo registrada.</div>'}
    </div>`;
}

function npSetFiltro(v) { window._npFiltroCliente = v; npListar(); }
function npEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
