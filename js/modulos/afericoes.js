// ============================================================
// MÓDULO AFERIÇÕES — autorização de aferições de bico (retaguarda)
// ============================================================
// Lista os abastecimentos marcados como aferição no PDV (status
// 'afericao_pendente') e permite AUTORIZAR. Ao autorizar, o registro
// vira tipo 'afericao' / status 'afericao_autorizada': o combustível
// é tratado como retornado ao tanque (não vira venda, não baixa estoque)
// e some da tela do PDV.
// ============================================================

async function moduloAfericoes() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._afeEmpresaId = perfil.empresa_id;
  await afeListar();
}

async function afeListar() {
  const conteudo = document.getElementById('conteudo');
  const empresaId = window._afeEmpresaId;
  const { data, error } = await sb.from('oct_pdv_abastecimentos')
    .select('id,bico,combustivel,litros,vendedor,data_mov,data_abast,turno_id,status')
    .eq('empresa_id', empresaId).eq('status', 'afericao_pendente')
    .order('data_mov', { ascending: false });

  const rows = data || [];
  conteudo.innerHTML = `
    <div style="max-width:1000px;padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="color:#f97316">🧪 Aferições pendentes</h2>
        ${rows.length ? `<button onclick="afeAutorizarTodas()" class="btn-salvar">Autorizar todas (${rows.length})</button>` : ''}
      </div>
      ${error ? `<p style="color:#f44">Erro: ${afeEsc(error.message)}</p>` : ''}
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
          <thead><tr style="color:#888;text-align:left;background:#0f1119">
            <th style="padding:10px 12px">Bico</th><th style="padding:10px 12px">Combustível</th>
            <th style="padding:10px 12px;text-align:right">Litros</th><th style="padding:10px 12px">Frentista</th>
            <th style="padding:10px 12px">Data/Hora</th><th style="padding:10px 12px;text-align:center">Ação</th>
          </tr></thead>
          <tbody>
          ${rows.length ? rows.map(a => {
            const d = (a.data_mov || a.data_abast) ? new Date(a.data_mov || a.data_abast) : null;
            const dh = d ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
            return `<tr style="border-top:1px solid #1c1f2e;color:#ddd">
              <td style="padding:9px 12px">${a.bico ?? '—'}</td>
              <td style="padding:9px 12px;color:#7dd3fc">${afeEsc(a.combustivel) || '—'}</td>
              <td style="padding:9px 12px;text-align:right">${Number(a.litros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</td>
              <td style="padding:9px 12px">${afeEsc(a.vendedor) || '—'}</td>
              <td style="padding:9px 12px;color:#9aa">${dh}</td>
              <td style="padding:9px 12px;text-align:center;white-space:nowrap">
                <button onclick="afeAutorizar('${a.id}')" style="padding:5px 12px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-weight:600;cursor:pointer;font-size:0.78rem">✓ Autorizar</button>
                <button onclick="afeCancelar('${a.id}')" style="padding:5px 12px;border-radius:6px;border:none;background:#dc2626;color:#fff;font-weight:600;cursor:pointer;font-size:0.78rem;margin-left:6px">✕ Cancelar</button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="6" style="padding:24px;text-align:center;color:#666">Nenhuma aferição aguardando autorização.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p style="color:#666;font-size:0.76rem;margin-top:10px">Ao autorizar, o abastecimento é tratado como aferição (combustível retornado ao tanque), não vira venda e some da tela do PDV.</p>
    </div>`;
}

async function afeAutorizar(id) {
  const { error } = await sb.from('oct_pdv_abastecimentos')
    .update({ tipo: 'afericao', status: 'afericao_autorizada', preco_litro: 0, valor: 0,
              observacao: 'Aferição autorizada - combustível retornado ao tanque' })
    .eq('id', id);
  if (error) { alert('Erro ao autorizar: ' + error.message); return; }
  await afeListar();
}

// cancela a aferição: volta o abastecimento para 'pendente' (reaparece normal no PDV)
async function afeCancelar(id) {
  if (!confirm('Cancelar esta aferição? O abastecimento volta para a lista normal do PDV e poderá ser transmitido ou cancelado.')) return;
  const { error } = await sb.from('oct_pdv_abastecimentos')
    .update({ tipo: 'abastecimento', status: 'pendente', observacao: null })
    .eq('id', id);
  if (error) { alert('Erro ao cancelar: ' + error.message); return; }
  await afeListar();
}

async function afeAutorizarTodas() {
  const empresaId = window._afeEmpresaId;
  if (!confirm('Autorizar todas as aferições pendentes?')) return;
  const { error } = await sb.from('oct_pdv_abastecimentos')
    .update({ tipo: 'afericao', status: 'afericao_autorizada', preco_litro: 0, valor: 0,
              observacao: 'Aferição autorizada - combustível retornado ao tanque' })
    .eq('empresa_id', empresaId).eq('status', 'afericao_pendente');
  if (error) { alert('Erro: ' + error.message); return; }
  await afeListar();
}

function afeEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
