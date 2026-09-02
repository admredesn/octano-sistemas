// ============================================================
// MENSAGENS AO CLIENTE — os textos de e-mail e WhatsApp, editaveis aqui
// ------------------------------------------------------------
// Antes viviam dentro do codigo do nucleo: mudar uma virgula custava release,
// zip e atualizacao em cada posto. E o texto que o cliente le' e' justamente a
// parte que mais muda, escrita por quem nao programa.
//
// Um modelo POR FINALIDADE, de proposito. O comprovante do cupom chega todo dia
// e e' recibo; a fatura chega uma vez por mes e e' cobranca com boleto. Texto
// unico para os dois confundiria quem recebe.
//
// O nucleo le' daqui a cada envio -- salvou, vale no proximo. Sem comando de
// sincronizar, sem copia local para envelhecer.
// ============================================================
const MSG_MODELOS = [
  { chave: 'fatura_email',        rot: '📄 Fatura — e-mail',      email: true,
    desc: 'Vai com a fatura detalhada, o boleto e a nota fiscal em anexo.' },
  { chave: 'fatura_whatsapp',     rot: '📄 Fatura — WhatsApp',    email: false,
    desc: 'Mensagem que acompanha os PDFs no WhatsApp. Use *asterisco* para negrito.' },
  { chave: 'cobranca_email',      rot: '📣 Cobrança — e-mail',    email: true,
    desc: 'Reenvio da fatura com lembrete de vencimento. Use {situacao} — ele vira "vencida há 5 dias", "vence hoje" ou "vence em 3 dias" sozinho.' },
  { chave: 'cobranca_whatsapp',   rot: '📣 Cobrança — WhatsApp',  email: false,
    desc: 'Mesma coisa no WhatsApp, que é por onde 85 dos 91 clientes são alcançados.' },
  { chave: 'comprovante_email',   rot: '🧾 Comprovante — e-mail', email: true,
    desc: 'Via da compra a prazo, enviada na hora do abastecimento.' },
  { chave: 'comprovante_whatsapp', rot: '🧾 Comprovante — WhatsApp', email: false,
    desc: 'Legenda da foto do cupom no WhatsApp.' },
];

// o que o nucleo troca na hora do envio
const MSG_VARS = [
  ['{cliente}',    'nome do cliente'],
  ['{posto}',      'nome do posto'],
  ['{numero}',     'número da fatura'],
  ['{valor}',      'valor (2.057,58)'],
  ['{vencimento}', 'vencimento (10/09/2026)'],
  ['{emissao}',    'data de emissão'],
  ['{situacao}',   'vencida há N dias / vence hoje / vence em N dias'],
  ['{atraso}',     'dias de atraso (0 se não venceu)'],
];

const MSG_EXEMPLO = {
  '{cliente}': 'CENTRO DE FORMAÇÃO DE CONDUTORES',
  '{posto}': 'Posto Florestal',
  '{numero}': '3',
  '{valor}': '2.057,58',
  '{vencimento}': '10/09/2026',
  '{emissao}': '02/09/2026',
  '{situacao}': 'vencida há 5 dias',
  '{atraso}': '5',
};

let _msgAtual = {};       // chave -> linha do banco
let _msgEmpresa = null;
let _msgAssinatura = null;

function _msgEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function msgAbrirEditor() {
  // empresaAtiva() e' a funcao central de quem e' o posto do momento
  _msgEmpresa = (typeof empresaAtiva === 'function' ? empresaAtiva() : null) || window._parEmpresa || null;
  if (!_msgEmpresa) { alert('Selecione o posto primeiro.'); return; }

  const [mods, par] = await Promise.all([
    sb.from('oct_modelos_msg').select('*').eq('empresa_id', _msgEmpresa),
    sb.from('oct_parametros').select('chave,valor')
      .eq('empresa_id', _msgEmpresa).eq('chave', 'msg_assinatura_path'),
  ]);
  if (mods.error) {
    alert(/oct_modelos_msg|does not exist|relation|PGRST/i.test(mods.error.message || '')
      ? 'Falta rodar repo/sql/SQL-MODELOS-MENSAGEM.sql no Supabase.'
      : 'Erro: ' + mods.error.message);
    return;
  }
  _msgAtual = {};
  (mods.data || []).forEach(m => { _msgAtual[m.chave] = m; });
  _msgAssinatura = ((par.data || [])[0] || {}).valor || null;

  const cartoes = MSG_MODELOS.map((m, i) => {
    const at = _msgAtual[m.chave] || {};
    return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;color:#f97316">${m.rot}</div>
        <label style="display:flex;align-items:center;gap:6px;color:#8892a0;font-size:0.74rem;cursor:pointer">
          <input type="checkbox" id="msg-ativo-${i}" ${at.ativo === false ? '' : 'checked'} style="width:auto">
          usar este texto</label>
      </div>
      <div style="color:#8892a0;font-size:0.76rem;margin:3px 0 10px">${m.desc}</div>
      ${m.email ? `<label style="color:#9aa;font-size:0.74rem">Assunto</label>
        <input id="msg-assunto-${i}" value="${_msgEsc(at.assunto || '')}" oninput="_msgPreview(${i})"
          style="width:100%;padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#e8eef5;margin-bottom:8px">` : ''}
      <label style="color:#9aa;font-size:0.74rem">Texto</label>
      <textarea id="msg-corpo-${i}" rows="${m.email ? 9 : 5}" oninput="_msgPreview(${i})"
        style="width:100%;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;
               color:#e8eef5;font-family:inherit;font-size:0.85rem;resize:vertical">${_msgEsc(at.corpo || '')}</textarea>
      <div style="margin-top:6px">${MSG_VARS.map(v =>
        `<span onclick="_msgInserir(${i},'${v[0]}')" title="${v[1]}"
          style="display:inline-block;background:#1b2130;border:1px solid #2f3446;border-radius:5px;
                 padding:2px 7px;margin:2px 3px 2px 0;font-size:0.72rem;color:#9fb0c4;cursor:pointer">${v[0]}</span>`).join('')}</div>
      <div style="color:#6b7688;font-size:0.72rem;margin-top:8px">Como o cliente vê:</div>
      <div id="msg-prev-${i}" style="background:#0b0d14;border:1px solid #1c2130;border-radius:6px;
        padding:9px;margin-top:3px;font-size:0.8rem;color:#cdd6e0;white-space:pre-wrap"></div>
    </div>`;
  }).join('');

  _msgModal(`
    <div style="background:#13151f;color:#f97316;padding:12px 18px;font-weight:700;border-radius:12px 12px 0 0;
      display:flex;justify-content:space-between;position:sticky;top:0;z-index:2">
      <span>✍ Mensagens ao cliente</span><span onclick="_msgFechar()" style="cursor:pointer">✕</span></div>
    <div style="padding:16px;color:#cdd6e0">
      <p style="color:#8892a0;font-size:0.78rem;margin:0 0 12px">
        Clique numa variável para inserir onde está o cursor. O núcleo lê estes textos a cada envio —
        salvou aqui, vale no próximo, sem atualizar o posto.</p>
      ${cartoes}
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
        <div style="font-weight:700;color:#f97316">🖼 Assinatura (imagem)</div>
        <div style="color:#8892a0;font-size:0.76rem;margin:3px 0 10px">
          Aparece no rodapé dos e-mails. Use PNG ou JPG de até 400px de largura — imagem grande
          faz o e-mail cair no spam e não abre no celular.</div>
        <div id="msg-assin-area"></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="msgSubirAssinatura(this)"
          style="width:100%;padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#ccc;margin-top:8px">
      </div>
      <div id="msg-status" style="font-size:0.8rem;min-height:18px;color:#8892a0"></div>
      <div style="display:flex;gap:8px;position:sticky;bottom:0;background:#0f1119;padding:10px 0">
        <button onclick="_msgFechar()" style="flex:1;padding:10px;border-radius:6px;border:1px solid #2a2d3e;
          background:#13151f;color:#aaa;cursor:pointer">Fechar</button>
        <button onclick="msgSalvarTudo()" style="flex:2;padding:10px;border-radius:6px;border:none;
          background:#f97316;color:#fff;font-weight:700;cursor:pointer">💾 Salvar mensagens</button>
      </div>
    </div>`);
  MSG_MODELOS.forEach((m, i) => _msgPreview(i));
  _msgDesenhaAssinatura();
}

function _msgInserir(i, texto) {
  const el = document.getElementById('msg-corpo-' + i);
  if (!el) return;
  const a = el.selectionStart || 0, b = el.selectionEnd || 0;
  el.value = el.value.slice(0, a) + texto + el.value.slice(b);
  el.focus();
  el.selectionStart = el.selectionEnd = a + texto.length;
  _msgPreview(i);
}

function _msgTrocaVars(txt) {
  let s = String(txt || '');
  Object.keys(MSG_EXEMPLO).forEach(v => {
    s = s.split(v).join(MSG_EXEMPLO[v]);
  });
  return s;
}

function _msgPreview(i) {
  const m = MSG_MODELOS[i];
  const corpo = document.getElementById('msg-corpo-' + i);
  const prev = document.getElementById('msg-prev-' + i);
  if (!corpo || !prev) return;
  const ass = document.getElementById('msg-assunto-' + i);
  const cab = (m.email && ass) ? `Assunto: ${_msgTrocaVars(ass.value)}\n\n` : '';
  prev.textContent = cab + _msgTrocaVars(corpo.value);
}

async function msgSalvarTudo() {
  const st = document.getElementById('msg-status');
  st.style.color = '#8892a0'; st.textContent = 'Salvando...';
  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  const linhas = MSG_MODELOS.map((m, i) => ({
    empresa_id: _msgEmpresa, chave: m.chave,
    assunto: m.email ? (document.getElementById('msg-assunto-' + i).value || null) : null,
    corpo: document.getElementById('msg-corpo-' + i).value || null,
    ativo: !!document.getElementById('msg-ativo-' + i).checked,
    atualizado_em: new Date().toISOString(), atualizado_por: quem,
  }));
  const vazios = linhas.filter(l => l.ativo && !String(l.corpo || '').trim());
  if (vazios.length) {
    st.style.color = '#f87171';
    st.textContent = 'Tem mensagem marcada como "usar" e sem texto. Escreva ou desmarque.';
    return;
  }
  const { error } = await sb.from('oct_modelos_msg').upsert(linhas, { onConflict: 'empresa_id,chave' });
  if (error) { st.style.color = '#f87171'; st.textContent = 'Erro: ' + error.message; return; }
  st.style.color = '#7ee2a0';
  st.textContent = '✔ Salvo. O próximo envio já usa estes textos.';
}

// ---------- assinatura ----------
async function _msgDesenhaAssinatura() {
  const area = document.getElementById('msg-assin-area');
  if (!area) return;
  if (!_msgAssinatura) {
    area.innerHTML = '<div style="color:#6b7688;font-size:0.78rem">Nenhuma assinatura — o e-mail vai só com o texto.</div>';
    return;
  }
  const { data } = await sb.storage.from('octano-documentos').createSignedUrl(_msgAssinatura, 600);
  area.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
    <img src="${data ? data.signedUrl : ''}" alt="assinatura"
      style="max-width:260px;max-height:90px;background:#fff;border-radius:6px;padding:4px">
    <button onclick="msgRemoverAssinatura()" style="background:#7f1d1d;border:none;border-radius:6px;
      padding:7px 12px;color:#fecaca;cursor:pointer;font-size:0.8rem">Remover</button></div>`;
}

async function msgSubirAssinatura(input) {
  const f = (input.files || [])[0];
  const st = document.getElementById('msg-status');
  if (!f) return;
  if (f.size > 300 * 1024) {
    st.style.color = '#f87171';
    st.textContent = 'Imagem de ' + Math.round(f.size / 1024) + ' KB — use até 300 KB, senão o e-mail fica pesado e cai no spam.';
    return;
  }
  st.style.color = '#8892a0'; st.textContent = 'Enviando a assinatura...';
  const ext = (f.type === 'image/png') ? 'png' : (f.type === 'image/webp' ? 'webp' : 'jpg');
  const caminho = `${_msgEmpresa}/marca/assinatura.${ext}`;
  const up = await sb.storage.from('octano-documentos')
    .upload(caminho, f, { upsert: true, contentType: f.type });
  if (up.error) { st.style.color = '#f87171'; st.textContent = 'Erro ao enviar: ' + up.error.message; return; }
  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  const { error } = await sb.from('oct_parametros').upsert({
    empresa_id: _msgEmpresa, chave: 'msg_assinatura_path', valor: caminho,
    atualizado_em: new Date().toISOString(), atualizado_por: quem,
  }, { onConflict: 'empresa_id,chave' });
  if (error) { st.style.color = '#f87171'; st.textContent = 'Erro ao gravar: ' + error.message; return; }
  _msgAssinatura = caminho;
  st.style.color = '#7ee2a0'; st.textContent = '✔ Assinatura salva.';
  _msgDesenhaAssinatura();
}

async function msgRemoverAssinatura() {
  if (!confirm('Remover a assinatura dos e-mails?')) return;
  await sb.from('oct_parametros').upsert({
    empresa_id: _msgEmpresa, chave: 'msg_assinatura_path', valor: '',
    atualizado_em: new Date().toISOString(), atualizado_por: 'retaguarda',
  }, { onConflict: 'empresa_id,chave' });
  _msgAssinatura = null;
  _msgDesenhaAssinatura();
}

// ---------- modal ----------
function _msgModal(html) {
  let m = document.getElementById('msg-modal');
  if (!m) { m = document.createElement('div'); m.id = 'msg-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div onclick="_msgFechar()" style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998"></div>
    <div style="position:fixed;top:4vh;left:50%;transform:translateX(-50%);width:min(720px,94vw);
      max-height:90vh;overflow:auto;background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;
      z-index:99999;box-shadow:0 10px 40px rgba(0,0,0,.6)">${html}</div>`;
}
function _msgFechar() { const m = document.getElementById('msg-modal'); if (m) m.remove(); }
