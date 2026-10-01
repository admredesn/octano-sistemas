// ============================================================
// MÓDULO NOTAS A PRAZO — consulta das fotos de notas a prazo (retaguarda)
// ============================================================
async function moduloNotasPrazo() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._npEmpresaId = ((typeof empresaAtiva==='function')?empresaAtiva():perfil.empresa_id);
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
              ${n.foto_url ? `<img src="${npEsc(n.foto_url)}" data-foto="${npEsc(n.foto_url)}"
                data-legenda="${npEsc([n.cliente_nome, 'R$ ' + Number(n.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), n.numero_nfe ? 'NFC-e ' + n.numero_nfe : ''].filter(Boolean).join('  ·  '))}"
                onclick="verFoto(this.dataset.foto, this.dataset.legenda)"
                style="width:100%;height:160px;object-fit:cover;cursor:zoom-in;display:block" title="Ver comprovante">` : (n.auth_codigo ? npCartaoAssinatura(n, d) : '<div style="height:160px;background:#0b0d14;display:flex;align-items:center;justify-content:center;color:#555">sem foto</div>')}
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

// ---- nota a prazo ASSINADA NO APP (selfie antes de abastecer, 01/10/2026) ----
// Não tem foto da via em papel: no lugar, quem assinou, quando e o código que saiu
// impresso no cupom. As fotos (cadastro x selfie) ficam num bucket privado e só
// abrem para quem está logado, por link de 10 minutos; a selfie da compra é apagada
// depois de 60 dias e o código continua valendo como registro.
function npCartaoAssinatura(n, d) {
  const quando = n.assinado_em ? new Date(n.assinado_em) : d;
  const legenda = [n.cliente_nome, 'R$ ' + Number(n.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    n.numero_nfe ? 'NFC-e ' + n.numero_nfe : '', 'AUT ' + n.auth_codigo].filter(Boolean).join('  ·  ');
  return `<div data-ac="${npEsc(n.acionamento_id || '')}" data-legenda="${npEsc(legenda)}"
      onclick="npVerAssinatura(this.dataset.ac, this.dataset.legenda)" title="Ver as fotos da assinatura"
      style="height:160px;background:#16153a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px;text-align:center;cursor:pointer">
      <div style="color:#a5b4fc;font-size:0.72rem;letter-spacing:.06em;text-transform:uppercase">✍ Assinada no app</div>
      <div style="color:#e0e7ff;font-size:0.84rem;font-weight:600">${npEsc(n.assinado_por || n.cliente_nome || '—')}</div>
      <div style="color:#9aa;font-size:0.72rem">CPF ${npEsc(n.assinado_cpf || '***')} · ${quando.toLocaleDateString('pt-BR')} ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div style="color:#fde68a;font-size:0.8rem;font-family:monospace">AUT ${npEsc(n.auth_codigo)}</div>
      <div style="color:#818cf8;font-size:0.7rem">ver fotos</div>
    </div>`;
}

async function npVerAssinatura(acionamentoId, legenda) {
  if (!acionamentoId) { alert('Esta nota não guardou o vínculo com a autorização do app.'); return; }
  let j = null;
  try {
    const session = await getSession();
    const resp = await fetch(SEFAZ_URL + '/cashback/api/pdv/assinatura?acionamento=' + encodeURIComponent(acionamentoId),
      { headers: { Authorization: 'Bearer ' + session.access_token } });
    j = await resp.json();
    if (!resp.ok) throw new Error((j && j.erro) || ('HTTP ' + resp.status));
  } catch (e) { alert('Não consegui abrir a assinatura: ' + (e.message || e)); return; }
  npFecharAssinatura();
  const ov = document.createElement('div');
  ov.id = 'np-assinatura';
  ov.setAttribute('role', 'dialog');
  ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(6,7,12,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px';
  ov.addEventListener('click', e => { if (e.target === ov) npFecharAssinatura(); });
  const leg = document.createElement('div');
  leg.style.cssText = 'color:#ddd;font-size:0.9rem;text-align:center';
  leg.textContent = legenda || '';
  const linha = document.createElement('div');
  linha.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center';
  [['Foto do cadastro', j.cadastro_url, 'sem foto no cadastro'],
   ['Selfie da autorização', j.selfie_url, 'selfie já apagada (guardada por 60 dias)']].forEach(([rot, url, vazio]) => {
    const cx = document.createElement('div');
    cx.style.cssText = 'text-align:center';
    if (url) {
      const im = document.createElement('img');
      im.src = url; im.alt = rot;
      im.style.cssText = 'width:min(42vw,360px);height:min(42vw,360px);object-fit:cover;border-radius:12px;border:2px solid #6366f1;background:#0b0d14;display:block';
      cx.appendChild(im);
    } else {
      const v = document.createElement('div');
      v.style.cssText = 'width:min(42vw,360px);height:min(42vw,360px);border-radius:12px;border:2px dashed #3b3f5c;display:flex;align-items:center;justify-content:center;color:#778;font-size:0.8rem;padding:14px';
      v.textContent = vazio;
      cx.appendChild(v);
    }
    const r = document.createElement('div');
    r.style.cssText = 'color:#a5b4fc;font-size:0.76rem;margin-top:6px';
    r.textContent = rot;
    cx.appendChild(r);
    linha.appendChild(cx);
  });
  const pe = document.createElement('div');
  pe.style.cssText = 'color:#9aa;font-size:0.8rem;text-align:center';
  pe.textContent = (j.assinante || '') + (j.cpf_mascarado ? ' · CPF ' + j.cpf_mascarado : '') + (j.auth_codigo ? ' · AUT ' + j.auth_codigo : '');
  const fechar = document.createElement('button');
  fechar.textContent = 'Fechar';
  fechar.style.cssText = 'padding:9px 22px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer';
  fechar.addEventListener('click', npFecharAssinatura);
  ov.append(leg, linha, pe, fechar);
  document.body.appendChild(ov);
  window._npAssinEsc = e => { if (e.key === 'Escape') npFecharAssinatura(); };
  document.addEventListener('keydown', window._npAssinEsc);
}

function npFecharAssinatura() {
  const ov = document.getElementById('np-assinatura');
  if (ov) ov.remove();
  if (window._npAssinEsc) { document.removeEventListener('keydown', window._npAssinEsc); window._npAssinEsc = null; }
}

function npSetFiltro(v) { window._npFiltroCliente = v; npListar(); }
function npEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
