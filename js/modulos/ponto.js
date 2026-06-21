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
    .select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._pontoEmpresaId = empresaId;
  window._pontoEmpresaNome = perfil?.oct_empresas?.nome || '';

  // funcionarios (para o filtro e para listar o quadro)
  const { data: pessoas } = await sb.from('oct_pessoas')
    .select('id,nome,classificacoes,tipo,ativo')
    .eq('empresa_id', empresaId).eq('ativo', true).order('nome');
  const funcionarios = (pessoas || []).filter(p => {
    const lista = Array.isArray(p.classificacoes) ? p.classificacoes : (p.tipo ? [p.tipo] : []);
    return lista.includes('funcionario');
  });
  window._pontoFuncionarios = funcionarios;

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
          <button onclick="pontoExportarCSV()" style="padding:9px 16px;border-radius:6px;border:1px solid #16a34a;background:transparent;color:#16a34a;font-weight:600;cursor:pointer">⬇ Exportar CSV</button>
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

  let q = sb.from('oct_pdv_ponto').select('*')
    .eq('empresa_id', empresaId)
    .order('registrado_em', { ascending: false });
  if (funcId) q = q.eq('pessoa_id', funcId);
  if (ini) q = q.gte('registrado_em', ini + 'T00:00:00');
  if (fim) q = q.lte('registrado_em', fim + 'T23:59:59');

  const { data, error } = await q;
  if (error) { cont.innerHTML = '<p style="color:#f44">Erro: ' + pontoEsc(error.message) + '</p>'; return; }
  window._pontoRegistros = data || [];

  if (!data || !data.length) {
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

  cont.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:0.84rem">
        <thead><tr style="background:#0f1119;color:#888;text-align:left">
          <th style="padding:10px 12px">Foto</th>
          <th style="padding:10px 12px">Funcionário</th>
          <th style="padding:10px 12px">Tipo</th>
          <th style="padding:10px 12px">Data / Hora</th>
          <th style="padding:10px 12px">Observação</th>
        </tr></thead>
        <tbody>
          ${data.map(r => `
            <tr style="border-top:1px solid #1c1f2e;color:#ddd">
              <td style="padding:8px 12px">
                ${r.foto_url
                  ? `<img src="${pontoEsc(r.foto_url)}" onclick="window.open('${pontoEsc(r.foto_url)}','_blank')" style="width:46px;height:46px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #2a2d3e" title="Abrir foto">`
                  : '<span style="color:#555">—</span>'}
              </td>
              <td style="padding:8px 12px;font-weight:600">${pontoEsc(r.funcionario)}</td>
              <td style="padding:8px 12px">${badgeTipo(r.tipo)}</td>
              <td style="padding:8px 12px">${fmtDH(r.registrado_em)}</td>
              <td style="padding:8px 12px;color:#999">${pontoEsc(r.observacao) || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p style="color:#666;font-size:0.76rem;margin-top:8px">${data.length} registro(s) no período.</p>`;
}

function pontoExportarCSV() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }
  const fmtDH = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
  };
  const sep = ';';
  const cab = ['Funcionario', 'Tipo', 'Data', 'Hora', 'Observacao', 'Foto (URL)'].join(sep);
  const linhas = regs.map(r => {
    const d = new Date(r.registrado_em);
    const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return [
      csvCell(r.funcionario),
      csvCell(r.tipo === 'saida' ? 'Saida' : 'Entrada'),
      csvCell(d.toLocaleDateString('pt-BR')),
      csvCell(d.toLocaleTimeString('pt-BR')),
      csvCell(r.observacao || ''),
      csvCell(r.foto_url || ''),
    ].join(sep);
  });
  // BOM para o Excel abrir acentos corretamente
  const txt = '\uFEFF' + [cab, ...linhas].join('\r\n');
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ponto_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
