// ============================================================
// MARKETING DO APP — campanhas, notificações e parceiros do app Postos SN
// ------------------------------------------------------------
// 05/10/2026, pedido do Ronan: divulgar produto, serviço e parceiro dentro do app e
// mandar notificação que aparece na tela do celular (referência: "Promocao Diesel
// Trevo! S500 6,24/6,19" da Rede Aliança). O caso central é a PROMOÇÃO DE PREÇO de
// um posto: escolhe posto, combustível, preço de/por e validade, e o título e o texto
// da notificação se montam sozinhos.
//
// Quem envia a notificação é o servidor (app_push.py), não esta tela: aqui só se grava
// oct_app_campanhas.push_em. Assim não existe rota aberta que dispare notificação, e a
// mesma campanha não sai em dobro com dois cliques.
//
// Tudo que vem do banco passa por _mkEsc antes de virar HTML.
// ============================================================

const _MK = {
  aba: 'campanhas', empresas: [], campanhas: [], parceiros: [], premios: null, resgates: [], firebase: null,
  form: null, precos: {}, alcance: null, timerAlcance: null, confirmado: false,
};

const MK_TIPOS = [
  ['promocao_preco', '⛽ Promoção de preço'],
  ['oferta', '🏷 Oferta de produto'],
  ['servico', '🔧 Serviço'],
  ['parceiro', '🤝 Parceiro'],
  ['aviso', '📢 Aviso'],
];
const MK_BUCKET = 'octano-app';

function _mkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _mkBrl(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _mkNum(v) { return parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) || 0; }
function _mkDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
// datetime-local trabalha em hora LOCAL; o banco guarda UTC
function _mkLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function _mkDoInput(v) { return v ? new Date(v).toISOString() : null; }
function _mkNomePosto(id) {
  const e = _MK.empresas.find(x => x.id === id);
  return e ? (e.nome_fantasia || e.nome) : 'posto';
}
function _mkPostosTxt(ids) {
  const v = (ids || []).filter(Boolean);
  return v.length ? v.map(_mkNomePosto).join(', ') : 'Todos os postos';
}

async function moduloMarketing() {
  const el = document.getElementById('conteudo');
  el.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  try {
    const [vis, emps] = await Promise.all([
      sb.rpc('oct_empresas_visiveis'),
      sb.from('oct_empresas').select('id,nome_fantasia,nome').eq('ativo', true).order('nome_fantasia'),
    ]);
    const ids = (vis.data || []).map(x => (typeof x === 'string' ? x : (x.oct_empresas_visiveis || x.id)));
    _MK.empresas = (emps.data || []).filter(e => !ids.length || ids.includes(e.id))
      .filter(e => !/BANCADA/i.test(e.nome_fantasia || e.nome || ''));
  } catch (e) { _MK.empresas = []; }
  fetch(SEFAZ_URL + '/app/push/status').then(r => r.json())
    .then(j => { _MK.firebase = !!(j && j.firebase); _mkCabecalho(); })
    .catch(() => { _MK.firebase = false; _mkCabecalho(); });   // servidor sem a rota = ainda não publicado
  await _mkCarregar();
}

async function _mkCarregar() {
  const el = document.getElementById('conteudo');
  const [c, p, a] = await Promise.all([
    sb.from('oct_app_campanhas').select('*').order('criado_em', { ascending: false }).limit(300),
    sb.from('oct_app_parceiros').select('*').order('ordem').order('nome').limit(300),
    sb.rpc('oct_app_alcance', { p_empresas: null }),
  ]);
  if (c.error) {
    el.innerHTML = `<div style="padding:24px;color:#f87171">${/oct_app_campanhas|does not exist|relation|PGRST/i.test(c.error.message || '')
      ? 'Falta rodar <b>repo/sql/SQL-APP-MARKETING.sql</b> no Supabase.' : 'Erro: ' + _mkEsc(c.error.message)}</div>`;
    return;
  }
  _MK.campanhas = c.data || [];
  _MK.parceiros = p.data || [];
  _MK.alcance = a.data || null;
  // pontos (SQL-APP-PONTOS.sql): sem a tabela, a aba Prêmios avisa em vez de quebrar a tela
  const [pr, rs] = await Promise.all([
    sb.from('oct_app_premios').select('*').order('destaque', { ascending: false }).order('ordem').order('pontos').limit(300),
    sb.from('oct_app_resgates').select('codigo,cliente_nome,premio_nome,empresa_id,pontos,status,criado_em,usado_em,usado_por')
      .order('criado_em', { ascending: false }).limit(60),
  ]);
  _MK.premios = pr.error ? null : (pr.data || []);
  _MK.resgates = rs.error ? [] : (rs.data || []);
  el.innerHTML = `
    <div style="padding:16px 18px;max-width:1200px">
      <div id="mk-cab"></div>
      <div style="display:flex;gap:6px;margin:14px 0 12px">
        <button class="mk-aba" data-aba="campanhas" onclick="_mkAba('campanhas')">📣 Campanhas</button>
        <button class="mk-aba" data-aba="parceiros" onclick="_mkAba('parceiros')">🤝 Parceiros</button>
        <button class="mk-aba" data-aba="premios" onclick="_mkAba('premios')">🎁 Prêmios</button>
        <div style="flex:1"></div>
        <button id="mk-novo" onclick="_mkNovo()" style="padding:9px 16px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer"></button>
      </div>
      <div id="mk-lista"></div>
    </div>
    <div id="mk-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:2000;overflow:auto;padding:16px"></div>
    <style>
      .mk-aba{padding:8px 14px;border-radius:8px;border:1px solid #2a2d3e;background:#13151f;color:#aab;cursor:pointer;font-weight:600}
      .mk-aba.on{background:#1f2433;color:#f97316;border-color:#f97316}
      .mk-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start}
      .mk-chip{display:inline-block;font-size:.7rem;padding:2px 8px;border-radius:99px;font-weight:700;margin-right:4px}
      .mk-btn{padding:6px 11px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1119;color:#cdd6e0;cursor:pointer;font-size:.78rem}
      .mk-in{width:100%;padding:8px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#e8eef5;font-size:.88rem}
      .mk-lb{display:block;color:#8892a0;font-size:.72rem;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.4px}
    </style>`;
  _mkCabecalho();
  _mkAba(_MK.aba);
}

function _mkCabecalho() {
  const el = document.getElementById('mk-cab');
  if (!el) return;
  const fb = _MK.firebase === null ? '<span class="mk-chip" style="background:#1f2433;color:#8892a0">conferindo o envio…</span>'
    : _MK.firebase ? '<span class="mk-chip" style="background:#052e16;color:#4ade80">notificações ligadas</span>'
      : '<span class="mk-chip" style="background:#3b1d08;color:#fbbf24" title="Falta a credencial do Firebase no servidor (FIREBASE_SA). As campanhas aparecem no app; a notificação fica na fila até configurar.">notificações: falta configurar o Firebase</span>';
  const a = _MK.alcance;
  const alc = a ? `<span class="mk-chip" style="background:#101a2c;color:#93c5fd">${a.aceitam || 0} cliente(s) aceitam publicidade · ${a.com_app || 0} com o app</span>` : '';
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-size:1.15rem;font-weight:800;color:#e8eef5">📣 Marketing do app <span style="color:#8892a0;font-weight:500;font-size:.85rem">— Postos SN</span></div>
      ${fb}${alc}</div>`;
}

function _mkAba(aba) {
  _MK.aba = aba;
  document.querySelectorAll('.mk-aba').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
  const nb = document.getElementById('mk-novo');
  if (nb) nb.textContent = aba === 'parceiros' ? '+ Novo parceiro' : aba === 'premios' ? '+ Novo prêmio' : '+ Nova campanha';
  if (aba === 'parceiros') _mkListaParceiros();
  else if (aba === 'premios') _mkListaPremios();
  else _mkListaCampanhas();
}

function _mkSituacao(c) {
  const agora = Date.now();
  if (!c.ativo) return ['Desligada', '#1f2433', '#8892a0'];
  if (c.fim && new Date(c.fim).getTime() < agora) return ['Encerrada', '#1f2433', '#8892a0'];
  if (new Date(c.inicio).getTime() > agora) return ['Agendada', '#2a2007', '#fbbf24'];
  return ['No ar', '#052e16', '#4ade80'];
}

function _mkPushTxt(c) {
  if (!c.push_em) return '<span style="color:#6b7688">sem notificação</span>';
  if (!c.push_enviado_em) {
    const futura = new Date(c.push_em).getTime() > Date.now();
    return futura ? `🔔 agendada para ${_mkEsc(_mkDataHora(c.push_em))}`
      : (_MK.firebase === false ? '🔔 na fila (falta configurar o Firebase)' : '🔔 enviando…');
  }
  if (c.push_erros === -1) return '<span style="color:#f87171">🔔 o envio parou no meio — veja o registro do servidor</span>';
  if (c.push_erros === -2) return '<span style="color:#8892a0">🔔 não enviada: passou da hora (ficou na fila sem o Firebase) — use Duplicar para mandar de novo</span>';
  return `🔔 enviada ${_mkEsc(_mkDataHora(c.push_enviado_em))} · <b>${c.push_total || 0}</b> entregue(s)`
    + (c.push_erros ? ` · ${c.push_erros} erro(s)` : '') + ` · <b>${c.push_aberturas || 0}</b> abriram`;
}

function _mkListaCampanhas() {
  const el = document.getElementById('mk-lista');
  if (!_MK.campanhas.length) {
    el.innerHTML = '<div style="color:#8892a0;padding:20px;text-align:center">Nenhuma campanha ainda. Comece por uma promoção de preço: <b>+ Nova campanha</b>.</div>';
    return;
  }
  el.innerHTML = _MK.campanhas.map(c => {
    const [sit, fundo, cor] = _mkSituacao(c);
    const tipo = (MK_TIPOS.find(t => t[0] === c.tipo) || [0, c.tipo])[1];
    const img = c.imagem_url ? `<img src="${_mkEsc(c.imagem_url)}" alt="" style="width:86px;height:86px;object-fit:cover;border-radius:8px;flex:0 0 auto">`
      : '<div style="width:86px;height:86px;border-radius:8px;background:#0b0d14;border:1px dashed #2a2d3e;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#3a4152;font-size:1.6rem">📣</div>';
    return `<div class="mk-card">${img}
      <div style="flex:1;min-width:0">
        <div><span class="mk-chip" style="background:${fundo};color:${cor}">${sit}</span><span class="mk-chip" style="background:#1b2130;color:#9fb0c4">${_mkEsc(tipo)}</span>${c.destaque ? '<span class="mk-chip" style="background:#1b2130;color:#9fb0c4">banner no início</span>' : ''}</div>
        <div style="font-weight:700;color:#e8eef5;margin-top:5px">${_mkEsc(c.titulo)}</div>
        <div style="color:#aab4c2;font-size:.84rem;margin-top:2px;white-space:pre-wrap">${_mkEsc(c.texto || '')}</div>
        <div style="color:#6b7688;font-size:.76rem;margin-top:6px">📍 ${_mkEsc(_mkPostosTxt(c.empresa_ids))} · de ${_mkEsc(_mkDataHora(c.inicio))}${c.fim ? ' até ' + _mkEsc(_mkDataHora(c.fim)) : ' (sem data para acabar)'}</div>
        <div style="color:#9fb0c4;font-size:.78rem;margin-top:4px">${_mkPushTxt(c)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="mk-btn" onclick="_mkEditar('${c.id}')">Editar</button>
        <button class="mk-btn" onclick="_mkDuplicar('${c.id}')">Duplicar</button>
        <button class="mk-btn" onclick="_mkLigar('${c.id}', ${c.ativo ? 'false' : 'true'})">${c.ativo ? 'Desligar' : 'Religar'}</button>
      </div></div>`;
  }).join('');
}

// ------------------------------------------------------------------ formulário
async function _mkPrecosDoPosto(empresaId) {
  if (!empresaId) return {};
  if (_MK.precos[empresaId]) return _MK.precos[empresaId];
  const { data } = await sb.from('oct_produtos').select('nome,preco_venda_a,cod_anp')
    .eq('empresa_id', empresaId).eq('ativo', true).eq('ind_combustivel', 'S').order('nome');
  const m = {};
  (data || []).filter(p => p.cod_anp && Number(p.preco_venda_a) > 0).forEach(p => { m[p.nome] = Number(p.preco_venda_a); });
  _MK.precos[empresaId] = m;
  return m;
}

function _mkNovo() {
  if (_MK.aba === 'parceiros') { _mkParceiroForm(null); return; }
  if (_MK.aba === 'premios') { _mkPremioForm(null); return; }
  _mkAbrirForm({
    tipo: 'promocao_preco', titulo: '', texto: '', imagem_url: '', link: '',
    empresa_ids: _MK.empresas.length === 1 ? [_MK.empresas[0].id] : [],
    itens: [], inicio: new Date().toISOString(), fim: null, ativo: true, destaque: true,
    push_modo: 'agora', push_em: null, push_titulo: '', push_texto: '',
  });
}
function _mkEditar(id) {
  const c = _MK.campanhas.find(x => x.id === id);
  if (c) _mkAbrirForm({ ...c, push_modo: c.push_em ? (c.push_enviado_em ? 'enviada' : 'agendar') : 'nao' });
}
function _mkDuplicar(id) {
  const c = _MK.campanhas.find(x => x.id === id);
  if (!c) return;
  const { id: _i, push_enviado_em: _e, push_total: _t, push_erros: _r, push_aberturas: _a, criado_em: _c, ...resto } = c;
  _mkAbrirForm({ ...resto, inicio: new Date().toISOString(), fim: null, push_modo: 'agora', push_em: null });
}

async function _mkAbrirForm(f) {
  _MK.form = f;
  _MK.confirmado = false;
  const travadoPush = f.push_modo === 'enviada';
  const md = document.getElementById('mk-modal');
  md.style.display = 'block';
  md.innerHTML = `<div style="max-width:1080px;margin:0 auto;background:#0f1119;border:1px solid #2a2d3e;border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid #2a2d3e;position:sticky;top:0;background:#0f1119;z-index:2;border-radius:12px 12px 0 0">
      <b style="color:#f97316">${f.id ? 'Editar campanha' : 'Nova campanha'}</b>
      <span onclick="_mkFechar()" style="cursor:pointer;color:#aab;font-size:1.1rem">✕</span></div>
    <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:18px;padding:16px 18px">
      <div>
        <label class="mk-lb">Tipo</label>
        <select id="mk-tipo" class="mk-in" onchange="_mkTipoMudou()">${MK_TIPOS.map(t =>
          `<option value="${t[0]}" ${t[0] === f.tipo ? 'selected' : ''}>${t[1]}</option>`).join('')}</select>
        <label class="mk-lb">Postos</label>
        <div id="mk-postos" style="display:flex;flex-wrap:wrap;gap:6px">
          <label style="display:flex;gap:6px;align-items:center;color:#cdd6e0;font-size:.84rem;background:#13151f;border:1px solid #2a2d3e;border-radius:6px;padding:6px 10px;cursor:pointer">
            <input type="checkbox" id="mk-todos" ${!(f.empresa_ids || []).length ? 'checked' : ''} onchange="_mkPostosMudou(true)" style="width:auto"> Todos</label>
          ${_MK.empresas.map(e => `<label style="display:flex;gap:6px;align-items:center;color:#cdd6e0;font-size:.84rem;background:#13151f;border:1px solid #2a2d3e;border-radius:6px;padding:6px 10px;cursor:pointer">
            <input type="checkbox" class="mk-posto" value="${e.id}" ${(f.empresa_ids || []).includes(e.id) ? 'checked' : ''} onchange="_mkPostosMudou(false)" style="width:auto"> ${_mkEsc(e.nome_fantasia || e.nome)}</label>`).join('')}
        </div>
        <div id="mk-promo"></div>
        <label class="mk-lb">Título</label>
        <input id="mk-titulo" class="mk-in" maxlength="80" value="${_mkEsc(f.titulo)}" oninput="_mkPrevia()">
        <label class="mk-lb">Texto</label>
        <textarea id="mk-texto" class="mk-in" rows="3" maxlength="300" oninput="_mkPrevia()" style="resize:vertical;font-family:inherit">${_mkEsc(f.texto || '')}</textarea>
        <label class="mk-lb">Imagem (banner do app e foto da notificação)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="file" accept="image/png,image/jpeg,image/webp" onchange="_mkSubirImagem(this,'campanha')" class="mk-in" style="flex:1">
          <button class="mk-btn" onclick="_MK.form.imagem_url='';_mkPrevia()">Tirar</button></div>
        <div style="color:#6b7688;font-size:.72rem;margin-top:3px">Formato largo (2:1), até 1 MB. Sem imagem, o banner usa as cores da rede.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="mk-lb">Começa</label><input id="mk-inicio" type="datetime-local" class="mk-in" value="${_mkLocalInput(f.inicio)}"></div>
          <div><label class="mk-lb">Acaba</label><input id="mk-fim" type="datetime-local" class="mk-in" value="${_mkLocalInput(f.fim)}" oninput="_mkPromoTexto(false)"></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;color:#cdd6e0;font-size:.85rem;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="mk-destaque" ${f.destaque ? 'checked' : ''} style="width:auto"> Mostrar como banner na tela inicial do app</label>
        <label class="mk-lb">Link ao tocar (opcional)</label>
        <input id="mk-link" class="mk-in" value="${_mkEsc(f.link || '')}" placeholder="vazio = abre a oferta no app">

        <div style="margin-top:16px;border-top:1px solid #2a2d3e;padding-top:12px">
          <b style="color:#e8eef5">🔔 Notificação no celular</b>
          ${travadoPush ? `<div style="color:#9fb0c4;font-size:.84rem;margin-top:8px">${_mkPushTxt(f)}<br><span style="color:#6b7688">Já enviada — não dá para mandar de novo esta mesma. Use <b>Duplicar</b> para repetir.</span></div>` : `
          <div style="display:flex;gap:14px;margin-top:8px;color:#cdd6e0;font-size:.85rem;flex-wrap:wrap">
            <label style="cursor:pointer"><input type="radio" name="mk-push" value="agora" ${f.push_modo === 'agora' ? 'checked' : ''} onchange="_mkPushMudou()" style="width:auto"> Enviar ao salvar</label>
            <label style="cursor:pointer"><input type="radio" name="mk-push" value="agendar" ${f.push_modo === 'agendar' ? 'checked' : ''} onchange="_mkPushMudou()" style="width:auto"> Agendar</label>
            <label style="cursor:pointer"><input type="radio" name="mk-push" value="nao" ${f.push_modo === 'nao' ? 'checked' : ''} onchange="_mkPushMudou()" style="width:auto"> Só no app, sem notificação</label>
          </div>
          <div id="mk-push-quando" style="display:${f.push_modo === 'agendar' ? 'block' : 'none'}"><label class="mk-lb">Enviar em</label>
            <input id="mk-push-em" type="datetime-local" class="mk-in" value="${_mkLocalInput(f.push_em)}"></div>
          <div id="mk-push-txt" style="display:${f.push_modo === 'nao' ? 'none' : 'block'}">
            <label class="mk-lb">Título da notificação (vazio = o título acima)</label>
            <input id="mk-push-titulo" class="mk-in" maxlength="60" value="${_mkEsc(f.push_titulo || '')}" oninput="_mkPrevia()">
            <label class="mk-lb">Texto da notificação (vazio = o texto acima)</label>
            <input id="mk-push-texto" class="mk-in" maxlength="160" value="${_mkEsc(f.push_texto || '')}" oninput="_mkPrevia()">
          </div>`}
          <div id="mk-alcance" style="color:#93c5fd;font-size:.82rem;margin-top:10px"></div>
        </div>
      </div>
      <div>
        <div style="color:#8892a0;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Como aparece no celular</div>
        <div id="mk-previa"></div>
      </div>
    </div>
    <div style="display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2d3e;position:sticky;bottom:0;background:#0f1119;border-radius:0 0 12px 12px">
      <div id="mk-msg" style="flex:1;align-self:center;font-size:.84rem;color:#8892a0"></div>
      <button class="mk-btn" onclick="_mkFechar()">Cancelar</button>
      <button id="mk-salvar" onclick="_mkSalvar()" style="padding:9px 18px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">Salvar</button>
    </div></div>`;
  await _mkTipoMudou(true);
  _mkPrevia();
  _mkAlcance();
}

function _mkFechar() {
  const md = document.getElementById('mk-modal');
  if (md) { md.style.display = 'none'; md.innerHTML = ''; }
  _MK.form = null;
}

function _mkPostosSel() {
  if (document.getElementById('mk-todos').checked) return [];
  return [...document.querySelectorAll('.mk-posto:checked')].map(i => i.value);
}
function _mkPostosMudou(todos) {
  if (todos && document.getElementById('mk-todos').checked) document.querySelectorAll('.mk-posto').forEach(i => { i.checked = false; });
  if (!todos) document.getElementById('mk-todos').checked = !document.querySelectorAll('.mk-posto:checked').length;
  _MK.form.empresa_ids = _mkPostosSel();
  if (document.getElementById('mk-tipo').value === 'promocao_preco') _mkTipoMudou(false);
  _mkAlcance();
}
function _mkPushMudou() {
  const v = (document.querySelector('input[name="mk-push"]:checked') || {}).value;
  document.getElementById('mk-push-quando').style.display = v === 'agendar' ? 'block' : 'none';
  document.getElementById('mk-push-txt').style.display = v === 'nao' ? 'none' : 'block';
  _mkPrevia();
}

// promoção de preço: combustíveis do posto com o preço do cadastro como "de"
async function _mkTipoMudou(primeira) {
  const box = document.getElementById('mk-promo');
  if (document.getElementById('mk-tipo').value !== 'promocao_preco') { box.innerHTML = ''; _mkPrevia(); return; }
  const postos = _mkPostosSel();
  const base = postos[0] || (_MK.empresas[0] && _MK.empresas[0].id);
  const precos = await _mkPrecosDoPosto(base);
  const salvos = {};
  (_MK.form.itens || []).forEach(i => { salvos[i.combustivel] = i; });
  const nomes = [...new Set([...Object.keys(precos), ...Object.keys(salvos)])];
  box.innerHTML = `<label class="mk-lb">Preços da promoção ${postos.length > 1 ? '<span style="text-transform:none;color:#fbbf24">(preço "de" do ' + _mkEsc(_mkNomePosto(base)) + ' — confira os outros postos)</span>' : ''}</label>
    ${nomes.length ? `<table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <tr style="color:#6b7688;font-size:.72rem"><td></td><td>Combustível</td><td style="width:110px">De (R$/L)</td><td style="width:110px">Por (R$/L)</td></tr>
      ${nomes.map((n, i) => {
        const s = salvos[n];
        return `<tr><td style="width:26px"><input type="checkbox" class="mk-pi" data-i="${i}" ${s ? 'checked' : ''} onchange="_mkPromoTexto(true)" style="width:auto"></td>
          <td style="color:#cdd6e0" class="mk-pn" data-i="${i}">${_mkEsc(n)}</td>
          <td><input class="mk-in mk-pde" data-i="${i}" value="${_mkBrl(s ? s.de : precos[n])}" oninput="_mkPromoTexto(true)" style="padding:6px"></td>
          <td><input class="mk-in mk-ppor" data-i="${i}" value="${s ? _mkBrl(s.por) : ''}" placeholder="0,00" oninput="_mkPromoTexto(true)" style="padding:6px"></td></tr>`;
      }).join('')}</table>`
      : '<div style="color:#fbbf24;font-size:.82rem">Nenhum combustível com preço no cadastro deste posto.</div>'}`;
  if (!primeira) _mkPromoTexto(true);
}

function _mkPromoItens() {
  const out = [];
  document.querySelectorAll('.mk-pi:checked').forEach(ck => {
    const i = ck.dataset.i;
    const nome = document.querySelector(`.mk-pn[data-i="${i}"]`).textContent;
    const de = _mkNum(document.querySelector(`.mk-pde[data-i="${i}"]`).value);
    const por = _mkNum(document.querySelector(`.mk-ppor[data-i="${i}"]`).value);
    if (por > 0) out.push({ combustivel: nome, de: de, por: por });
  });
  return out;
}

function _mkCurto(nome) {
  const s = String(nome || '').toUpperCase();
  if (/S-?10\b/.test(s)) return 'Diesel S10';
  if (/S-?500/.test(s)) return 'Diesel S500';
  if (/ADIT/.test(s)) return 'Gasolina aditivada';
  if (/GASOLINA/.test(s)) return 'Gasolina';
  if (/ETANOL|ALCOOL|ÁLCOOL/.test(s)) return 'Etanol';
  return nome;
}

// título e texto montados a partir dos preços (só reescreve o que ainda não foi editado à mão)
function _mkPromoTexto(trocar) {
  if (!document.getElementById('mk-tipo') || document.getElementById('mk-tipo').value !== 'promocao_preco') { _mkPrevia(); return; }
  const itens = _mkPromoItens();
  _MK.form.itens = itens;
  if (!itens.length) { _mkPrevia(); return; }
  const postos = _mkPostosSel();
  const onde = postos.length === 1 ? ' no ' + _mkNomePosto(postos[0]) : postos.length ? '' : ' nos Postos SN';
  const fimV = document.getElementById('mk-fim').value;
  let ate = '';
  if (fimV) {
    const d = new Date(fimV), hoje = new Date();
    const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':00', 'h');
    ate = d.toDateString() === hoje.toDateString() ? ' até ' + hh : ' até ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  const grupos = [...new Set(itens.map(i => _mkCurto(i.combustivel).split(' ')[0]))];
  const titulo = `⛽ ${grupos.length === 1 ? grupos[0] : 'Combustível'} mais barato${onde}${ate}`;
  const texto = itens.map(i => `${_mkCurto(i.combustivel)}: de R$ ${_mkBrl(i.de)} por R$ ${_mkBrl(i.por)}`).join(' · ');
  const t = document.getElementById('mk-titulo'), x = document.getElementById('mk-texto');
  if (trocar !== false && (!t.value || t.dataset.auto === '1')) { t.value = titulo.slice(0, 80); t.dataset.auto = '1'; }
  if (trocar !== false && (!x.value || x.dataset.auto === '1')) { x.value = texto.slice(0, 300); x.dataset.auto = '1'; }
  t.oninput = () => { t.dataset.auto = '0'; _mkPrevia(); };
  x.oninput = () => { x.dataset.auto = '0'; _mkPrevia(); };
  _mkPrevia();
}

function _mkPrevia() {
  const el = document.getElementById('mk-previa');
  if (!el || !_MK.form) return;
  const titulo = document.getElementById('mk-titulo').value || 'Título da campanha';
  const texto = document.getElementById('mk-texto').value || '';
  const pt = document.getElementById('mk-push-titulo'), px = document.getElementById('mk-push-texto');
  const nTit = (pt && pt.value) || titulo, nTxt = (px && px.value) || texto;
  const modo = (document.querySelector('input[name="mk-push"]:checked') || {}).value || _MK.form.push_modo;
  const img = _MK.form.imagem_url;
  const notif = modo === 'nao' ? '<div style="color:#6b7688;font-size:.78rem;text-align:center;padding:10px">Sem notificação — só aparece dentro do app.</div>'
    : `<div style="background:rgba(40,44,56,.92);border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;backdrop-filter:blur(6px)">
        <div style="width:34px;height:34px;border-radius:8px;background:#06253E;color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:.8rem;flex:0 0 auto;border-bottom:3px solid #DF1A24">SN</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;color:#e8eef5;font-size:.8rem"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_mkEsc(nTit)}</b><span style="color:#9aa3b2;font-size:.7rem;flex:0 0 auto;margin-left:6px">agora</span></div>
          <div style="color:#d6dce5;font-size:.78rem;margin-top:2px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${_mkEsc(nTxt)}</div>
        </div>
        ${img ? `<img src="${_mkEsc(img)}" alt="" style="width:38px;height:38px;border-radius:6px;object-fit:cover;flex:0 0 auto">` : ''}
      </div>`;
  const banner = `<div style="border-radius:14px;overflow:hidden;background:${img ? '#000' : 'linear-gradient(120deg,#06253E 55%,#DF1A24)'};position:relative;aspect-ratio:2/1">
      ${img ? `<img src="${_mkEsc(img)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}
      <div style="position:absolute;left:0;right:0;bottom:0;padding:10px 12px;background:linear-gradient(transparent,rgba(0,0,0,.75))">
        <div style="color:#fff;font-weight:800;font-size:.9rem">${_mkEsc(titulo)}</div>
        <div style="color:#e5e9f0;font-size:.74rem;margin-top:2px">${_mkEsc(texto)}</div></div></div>`;
  el.innerHTML = `<div style="background:linear-gradient(160deg,#3a4a5e,#1d2532);border-radius:26px;padding:16px 12px;border:4px solid #0b0d14">
      <div style="color:#fff;text-align:center;font-size:2rem;font-weight:300;margin:6px 0 2px">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div style="color:#cfd6e0;text-align:center;font-size:.72rem;margin-bottom:14px">tela bloqueada</div>
      ${notif}</div>
    <div style="color:#8892a0;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px">Banner na tela inicial do app</div>
    ${banner}`;
}

async function _mkAlcance() {
  clearTimeout(_MK.timerAlcance);
  _MK.timerAlcance = setTimeout(async () => {
    const el = document.getElementById('mk-alcance');
    if (!el) return;
    const tipo = document.getElementById('mk-tipo').value;
    const { data, error } = await sb.rpc('oct_app_alcance', { p_empresas: _mkPostosSel().length ? _mkPostosSel() : null });
    if (error || !data) { el.textContent = ''; return; }
    el.textContent = tipo === 'aviso'
      ? `Alcance: clientes com o app ${_mkPostosSel().length ? 'destes postos' : 'da rede'} que aceitam avisos (${data.com_app || 0} com o app).`
      : `Alcance: ${data.aceitam || 0} cliente(s) aceitam publicidade ${_mkPostosSel().length ? 'nestes postos' : 'na rede'} (${data.com_app || 0} com o app).`;
  }, 250);
}

async function _mkSubirImagem(inp, tipo) {
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (!f) return;
  const msg = document.getElementById(tipo === 'parceiro' ? 'mkp-msg' : tipo === 'premio' ? 'mkr-msg' : 'mk-msg');
  if (f.size > 1024 * 1024) { msg.style.color = '#f87171'; msg.textContent = 'Imagem acima de 1 MB — reduza antes de enviar.'; return; }
  const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const caminho = `${tipo}s/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  msg.style.color = '#8892a0'; msg.textContent = 'Enviando a imagem…';
  const { error } = await sb.storage.from(MK_BUCKET).upload(caminho, f, { upsert: false, contentType: f.type });
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Não consegui enviar a imagem: ' + error.message; return; }
  const url = sb.storage.from(MK_BUCKET).getPublicUrl(caminho).data.publicUrl;
  msg.textContent = '';
  if (tipo === 'parceiro') { document.getElementById('mkp-logo').value = url; _mkParceiroPrevia(); }
  else if (tipo === 'premio') { document.getElementById('mkr-foto').value = url; _mkPremioPrevia(); }
  else { _MK.form.imagem_url = url; _mkPrevia(); }
}

async function _mkSalvar() {
  const f = _MK.form, msg = document.getElementById('mk-msg'), bt = document.getElementById('mk-salvar');
  const tipo = document.getElementById('mk-tipo').value;
  const titulo = document.getElementById('mk-titulo').value.trim();
  const erro = t => { msg.style.color = '#f87171'; msg.textContent = t; };
  if (!titulo) return erro('Escreva o título.');
  if (tipo === 'promocao_preco' && !_mkPromoItens().length) return erro('Marque pelo menos um combustível com o preço da promoção.');
  const inicio = _mkDoInput(document.getElementById('mk-inicio').value) || new Date().toISOString();
  const fim = _mkDoInput(document.getElementById('mk-fim').value);
  if (fim && new Date(fim) <= new Date(inicio)) return erro('O fim tem de ser depois do começo.');
  const linha = {
    tipo, titulo, texto: document.getElementById('mk-texto').value.trim() || null,
    imagem_url: f.imagem_url || null, link: document.getElementById('mk-link').value.trim() || null,
    empresa_ids: _mkPostosSel().length ? _mkPostosSel() : null,
    itens: tipo === 'promocao_preco' ? _mkPromoItens() : null,
    inicio, fim, destaque: document.getElementById('mk-destaque').checked, ativo: f.ativo !== false,
    atualizado_em: new Date().toISOString(),
  };
  let confirmar = '';
  if (f.push_modo !== 'enviada') {
    const modo = (document.querySelector('input[name="mk-push"]:checked') || {}).value;
    linha.push_titulo = (document.getElementById('mk-push-titulo') || {}).value || null;
    linha.push_texto = (document.getElementById('mk-push-texto') || {}).value || null;
    if (modo === 'agora') { linha.push_em = new Date().toISOString(); confirmar = 'agora'; }
    else if (modo === 'agendar') {
      linha.push_em = _mkDoInput((document.getElementById('mk-push-em') || {}).value);
      if (!linha.push_em) return erro('Escolha quando enviar a notificação.');
      if (new Date(linha.push_em) < new Date(Date.now() - 60000)) return erro('O horário do envio já passou.');
      confirmar = _mkDataHora(linha.push_em);
    } else linha.push_em = null;
  }
  // confirmação DENTRO da tela: o confirm() do navegador some no navegador embutido e
  // respondia "não" sozinho — a tela desistia calada (05/10/2026, primeiro teste)
  if (confirmar && !_MK.confirmado) {
    const alc = (document.getElementById('mk-alcance') || {}).textContent || '';
    msg.style.color = '#fbbf24';
    msg.innerHTML = `<b>Enviar a notificação ${confirmar === 'agora' ? 'AGORA' : 'em ' + _mkEsc(confirmar)}?</b>
      <span style="color:#cdd6e0">"${_mkEsc(linha.push_titulo || titulo)}"</span> · ${_mkEsc(alc)}
      <span style="color:#8892a0">Depois de enviada, não dá para desfazer.</span>
      <button onclick="_mkConfirmarEnvio()" style="margin-left:6px;padding:6px 12px;border-radius:6px;border:none;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Confirmar envio</button>
      <button onclick="_mkCancelarEnvio()" class="mk-btn">Voltar</button>`;
    return;
  }
  _MK.confirmado = false;
  bt.disabled = true; msg.style.color = '#8892a0'; msg.textContent = 'Salvando…';
  try {
    let r;
    if (f.id) r = await sb.from('oct_app_campanhas').update(linha).eq('id', f.id).select('id');
    else {
      const s = await getSession();
      linha.criado_por = (s && s.user && (s.user.email || s.user.id)) || null;
      r = await sb.from('oct_app_campanhas').insert(linha).select('id');
    }
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('nada foi gravado (sem permissão para publicar?)');
    _mkFechar();
    await _mkCarregar();
  } catch (e) {
    bt.disabled = false;
    erro('Não salvou: ' + (e.message || e));
  }
}

function _mkConfirmarEnvio() { _MK.confirmado = true; _mkSalvar(); }
function _mkCancelarEnvio() {
  _MK.confirmado = false;
  const msg = document.getElementById('mk-msg');
  msg.style.color = '#8892a0';
  msg.textContent = 'Nada foi salvo. Troque a notificação para "Só no app" se quiser salvar sem enviar.';
}

async function _mkLigar(id, ativo) {
  const { error } = await sb.from('oct_app_campanhas').update({ ativo, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) { alert('Não consegui: ' + error.message); return; }
  await _mkCarregar();
}

// ------------------------------------------------------------------ parceiros
function _mkListaParceiros() {
  const el = document.getElementById('mk-lista');
  if (!_MK.parceiros.length) {
    el.innerHTML = '<div style="color:#8892a0;padding:20px;text-align:center">Nenhum parceiro ainda. O cliente vê os parceiros em Perfil › Clube de vantagens.</div>';
    return;
  }
  el.innerHTML = _MK.parceiros.map(p => `<div class="mk-card">
      ${p.logo_url ? `<img src="${_mkEsc(p.logo_url)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:8px;background:#fff;flex:0 0 auto">`
        : '<div style="width:64px;height:64px;border-radius:8px;background:#0b0d14;border:1px dashed #2a2d3e;flex:0 0 auto"></div>'}
      <div style="flex:1;min-width:0">
        <div>${p.ativo ? '<span class="mk-chip" style="background:#052e16;color:#4ade80">ativo</span>' : '<span class="mk-chip" style="background:#1f2433;color:#8892a0">desligado</span>'}</div>
        <div style="font-weight:700;color:#e8eef5;margin-top:4px">${_mkEsc(p.nome)}</div>
        <div style="color:#f97316;font-size:.86rem">${_mkEsc(p.beneficio)}</div>
        <div style="color:#6b7688;font-size:.76rem;margin-top:4px">${_mkEsc([p.endereco, p.cidade, p.telefone].filter(Boolean).join(' · '))} · 📍 ${_mkEsc(_mkPostosTxt(p.empresa_ids))}</div>
      </div>
      <button class="mk-btn" onclick="_mkParceiroForm('${p.id}')">Editar</button></div>`).join('');
}

function _mkParceiroForm(id) {
  const p = id ? _MK.parceiros.find(x => x.id === id) : { ativo: true, empresa_ids: [] };
  if (!p) return;
  const md = document.getElementById('mk-modal');
  md.style.display = 'block';
  const campo = (rot, idc, v, ph) => `<label class="mk-lb">${rot}</label><input id="${idc}" class="mk-in" value="${_mkEsc(v || '')}" placeholder="${ph || ''}" oninput="_mkParceiroPrevia()">`;
  md.innerHTML = `<div style="max-width:760px;margin:0 auto;background:#0f1119;border:1px solid #2a2d3e;border-radius:12px">
    <div style="display:flex;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #2a2d3e"><b style="color:#f97316">${id ? 'Editar parceiro' : 'Novo parceiro'}</b>
      <span onclick="_mkFechar()" style="cursor:pointer;color:#aab">✕</span></div>
    <div style="display:grid;grid-template-columns:1fr 260px;gap:16px;padding:14px 18px">
      <div>
        ${campo('Nome', 'mkp-nome', p.nome, 'Lava-jato do João')}
        ${campo('Benefício', 'mkp-benef', p.beneficio, '10% de desconto na lavagem completa')}
        <label class="mk-lb">Como usar / regras</label>
        <textarea id="mkp-desc" class="mk-in" rows="3" style="font-family:inherit" oninput="_mkParceiroPrevia()">${_mkEsc(p.descricao || '')}</textarea>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
          <div>${campo('Endereço', 'mkp-end', p.endereco)}</div><div>${campo('Cidade', 'mkp-cid', p.cidade)}</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${campo('Telefone', 'mkp-tel', p.telefone)}</div><div>${campo('Site ou Instagram', 'mkp-link', p.link)}</div></div>
        <label class="mk-lb">Logo</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="_mkSubirImagem(this,'parceiro')" class="mk-in">
        <input type="hidden" id="mkp-logo" value="${_mkEsc(p.logo_url || '')}">
        <label class="mk-lb">Vale para</label>
        <select id="mkp-posto" class="mk-in"><option value="">Todos os postos</option>${_MK.empresas.map(e =>
          `<option value="${e.id}" ${(p.empresa_ids || []).includes(e.id) ? 'selected' : ''}>${_mkEsc(e.nome_fantasia || e.nome)}</option>`).join('')}</select>
        <label style="display:flex;gap:8px;align-items:center;color:#cdd6e0;font-size:.85rem;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="mkp-ativo" ${p.ativo !== false ? 'checked' : ''} style="width:auto"> Aparece no app</label>
      </div>
      <div><div class="mk-lb">Como aparece no app</div><div id="mkp-previa"></div></div>
    </div>
    <div style="display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2d3e">
      <div id="mkp-msg" style="flex:1;align-self:center;font-size:.84rem;color:#8892a0"></div>
      <button class="mk-btn" onclick="_mkFechar()">Cancelar</button>
      <button onclick="_mkParceiroSalvar('${id || ''}')" style="padding:9px 18px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">Salvar</button>
    </div></div>`;
  _mkParceiroPrevia();
}

function _mkParceiroPrevia() {
  const el = document.getElementById('mkp-previa');
  if (!el) return;
  const v = id => (document.getElementById(id) || {}).value || '';
  const logo = v('mkp-logo');
  el.innerHTML = `<div style="background:#fff;border-radius:14px;padding:14px;color:#1d2532;box-shadow:0 2px 10px rgba(0,0,0,.3)">
      <div style="display:flex;gap:10px;align-items:center">
        ${logo ? `<img src="${_mkEsc(logo)}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:10px;border:1px solid #e5e9f0">` : '<div style="width:48px;height:48px;border-radius:10px;background:#eef1f5"></div>'}
        <div><div style="font-weight:800">${_mkEsc(v('mkp-nome') || 'Nome do parceiro')}</div>
          <div style="color:#DF1A24;font-weight:700;font-size:.85rem">${_mkEsc(v('mkp-benef') || 'Benefício')}</div></div></div>
      <div style="font-size:.78rem;color:#4a5568;margin-top:8px;white-space:pre-wrap">${_mkEsc(v('mkp-desc'))}</div>
      <div style="font-size:.74rem;color:#718096;margin-top:6px">${_mkEsc([v('mkp-end'), v('mkp-cid')].filter(Boolean).join(' · '))}</div></div>`;
}

async function _mkParceiroSalvar(id) {
  const v = i => ((document.getElementById(i) || {}).value || '').trim();
  const msg = document.getElementById('mkp-msg');
  if (!v('mkp-nome') || !v('mkp-benef')) { msg.style.color = '#f87171'; msg.textContent = 'Nome e benefício são obrigatórios.'; return; }
  const linha = {
    nome: v('mkp-nome'), beneficio: v('mkp-benef'), descricao: v('mkp-desc') || null,
    endereco: v('mkp-end') || null, cidade: v('mkp-cid') || null, telefone: v('mkp-tel') || null,
    link: v('mkp-link') || null, logo_url: v('mkp-logo') || null,
    empresa_ids: v('mkp-posto') ? [v('mkp-posto')] : null,
    ativo: document.getElementById('mkp-ativo').checked, atualizado_em: new Date().toISOString(),
  };
  const r = id ? await sb.from('oct_app_parceiros').update(linha).eq('id', id).select('id')
    : await sb.from('oct_app_parceiros').insert(linha).select('id');
  if (r.error || !r.data || !r.data.length) {
    msg.style.color = '#f87171';
    msg.textContent = 'Não salvou: ' + ((r.error && r.error.message) || 'sem permissão para publicar?');
    return;
  }
  _mkFechar();
  _MK.aba = 'parceiros';
  await _mkCarregar();
}

// ------------------------------------------------------------------ prêmios (troca de pontos)
// 1 ponto por R$ 1, pontos valem 6 meses. O cliente troca no app, recebe um código de 6
// letras e o caixa dá baixa. Código não retirado em 7 dias devolve os pontos.
const MK_CATEG = [['conveniencia', '🛒 Conveniência'], ['servicos', '🔧 Serviços'], ['troca_oleo', '🛢 Troca de óleo'],
  ['aditivos', '🧪 Aditivos'], ['outros', '🎁 Outros']];
const MK_RESG = { emitido: ['a retirar', '#2a2007', '#fbbf24'], usado: ['entregue', '#052e16', '#4ade80'],
  expirado: ['venceu (pontos voltaram)', '#1f2433', '#8892a0'], cancelado: ['cancelado', '#1f2433', '#8892a0'] };

function _mkListaPremios() {
  const el = document.getElementById('mk-lista');
  if (_MK.premios === null) {
    el.innerHTML = '<div style="padding:20px;color:#f87171">Falta rodar <b>repo/sql/SQL-APP-PONTOS.sql</b> no Supabase.</div>';
    return;
  }
  const lista = _MK.premios.length ? _MK.premios.map(p => {
    const cat = (MK_CATEG.find(c => c[0] === p.categoria) || [0, p.categoria])[1];
    return `<div class="mk-card">
      ${p.foto_url ? `<img src="${_mkEsc(p.foto_url)}" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:8px;flex:0 0 auto">`
        : '<div style="width:76px;height:76px;border-radius:8px;background:#0b0d14;border:1px dashed #2a2d3e;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:1.5rem">🎁</div>'}
      <div style="flex:1;min-width:0">
        <div>${p.ativo ? '<span class="mk-chip" style="background:#052e16;color:#4ade80">no app</span>' : '<span class="mk-chip" style="background:#1f2433;color:#8892a0">desligado</span>'}<span class="mk-chip" style="background:#1b2130;color:#9fb0c4">${_mkEsc(cat)}</span>${p.destaque ? '<span class="mk-chip" style="background:#1b2130;color:#9fb0c4">destaque</span>' : ''}</div>
        <div style="font-weight:700;color:#e8eef5;margin-top:4px">${_mkEsc(p.nome)}</div>
        <div style="color:#fbbf24;font-weight:700">${_mkEsc(p.pontos)} pontos <span style="color:#6b7688;font-weight:400;font-size:.8rem">(cliente gastou R$ ${_mkEsc(p.pontos)} para ganhar)</span></div>
        <div style="color:#6b7688;font-size:.76rem;margin-top:3px">📍 ${_mkEsc(_mkPostosTxt(p.empresa_ids))} · ${p.estoque == null ? 'sem limite de estoque' : _mkEsc(p.estoque) + ' em estoque'}</div>
      </div>
      <button class="mk-btn" onclick="_mkPremioForm('${p.id}')">Editar</button></div>`;
  }).join('') : '<div style="color:#8892a0;padding:20px;text-align:center">Nenhum prêmio ainda. Ex.: café coado por 50 pontos, ducha por 300, 10% na troca de óleo por 200.</div>';
  const resg = _MK.resgates.length ? `<div style="margin-top:18px;font-weight:700;color:#e8eef5">Últimas trocas</div>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-top:6px">
      <tr style="color:#6b7688;text-align:left"><th style="padding:6px">Código</th><th>Cliente</th><th>Prêmio</th><th>Posto</th><th>Pontos</th><th>Situação</th><th>Quando</th></tr>
      ${_MK.resgates.map(r => {
        const st = MK_RESG[r.status] || [r.status, '#1f2433', '#8892a0'];
        return `<tr style="border-top:1px solid #1c2130;color:#cdd6e0"><td style="padding:6px;font-weight:700;letter-spacing:1px">${_mkEsc(r.codigo)}</td>
          <td>${_mkEsc(r.cliente_nome || '')}</td><td>${_mkEsc(r.premio_nome)}</td><td>${_mkEsc(_mkNomePosto(r.empresa_id))}</td>
          <td>${_mkEsc(r.pontos)}</td><td><span class="mk-chip" style="background:${st[1]};color:${st[2]}">${_mkEsc(st[0])}</span></td>
          <td>${_mkEsc(_mkDataHora(r.usado_em || r.criado_em))}${r.usado_por ? ' · ' + _mkEsc(r.usado_por) : ''}</td></tr>`;
      }).join('')}</table>` : '';
  el.innerHTML = lista + resg;
}

function _mkPremioForm(id) {
  const p = id ? (_MK.premios || []).find(x => x.id === id) : { ativo: true, categoria: 'conveniencia', empresa_ids: [] };
  if (!p) return;
  const md = document.getElementById('mk-modal');
  md.style.display = 'block';
  md.innerHTML = `<div style="max-width:760px;margin:0 auto;background:#0f1119;border:1px solid #2a2d3e;border-radius:12px">
    <div style="display:flex;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #2a2d3e"><b style="color:#f97316">${id ? 'Editar prêmio' : 'Novo prêmio'}</b>
      <span onclick="_mkFechar()" style="cursor:pointer;color:#aab">✕</span></div>
    <div style="display:grid;grid-template-columns:1fr 240px;gap:16px;padding:14px 18px">
      <div>
        <label class="mk-lb">Nome</label><input id="mkr-nome" class="mk-in" value="${_mkEsc(p.nome || '')}" placeholder="Café coado" oninput="_mkPremioPrevia()">
        <label class="mk-lb">Descrição (opcional)</label><input id="mkr-desc" class="mk-in" value="${_mkEsc(p.descricao || '')}" oninput="_mkPremioPrevia()">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div><label class="mk-lb">Pontos</label><input id="mkr-pontos" class="mk-in" inputmode="numeric" value="${_mkEsc(p.pontos || '')}" oninput="_mkPremioPrevia()"></div>
          <div><label class="mk-lb">Categoria</label><select id="mkr-cat" class="mk-in">${MK_CATEG.map(c =>
            `<option value="${c[0]}" ${c[0] === p.categoria ? 'selected' : ''}>${c[1]}</option>`).join('')}</select></div>
          <div><label class="mk-lb">Estoque (vazio = sem limite)</label><input id="mkr-estoque" class="mk-in" inputmode="numeric" value="${p.estoque == null ? '' : _mkEsc(p.estoque)}"></div>
        </div>
        <div style="color:#6b7688;font-size:.74rem;margin-top:4px">1 ponto = R$ 1 em compras. Um prêmio de 50 pontos sai para quem gastou R$ 50.</div>
        <label class="mk-lb">Foto</label>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange="_mkSubirImagem(this,'premio')" class="mk-in">
        <input type="hidden" id="mkr-foto" value="${_mkEsc(p.foto_url || '')}">
        <label class="mk-lb">Onde retirar</label>
        <select id="mkr-posto" class="mk-in"><option value="">Todos os postos</option>${_MK.empresas.map(e =>
          `<option value="${e.id}" ${(p.empresa_ids || []).includes(e.id) ? 'selected' : ''}>${_mkEsc(e.nome_fantasia || e.nome)}</option>`).join('')}</select>
        <label style="display:flex;gap:8px;align-items:center;color:#cdd6e0;font-size:.85rem;margin-top:12px;cursor:pointer">
          <input type="checkbox" id="mkr-destaque" ${p.destaque ? 'checked' : ''} style="width:auto"> Destaque (aparece primeiro)</label>
        <label style="display:flex;gap:8px;align-items:center;color:#cdd6e0;font-size:.85rem;margin-top:6px;cursor:pointer">
          <input type="checkbox" id="mkr-ativo" ${p.ativo !== false ? 'checked' : ''} style="width:auto"> Aparece no app</label>
      </div>
      <div><div class="mk-lb">Como aparece no app</div><div id="mkr-previa"></div></div>
    </div>
    <div style="display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2d3e">
      <div id="mkr-msg" style="flex:1;align-self:center;font-size:.84rem;color:#8892a0"></div>
      <button class="mk-btn" onclick="_mkFechar()">Cancelar</button>
      <button onclick="_mkPremioSalvar('${id || ''}')" style="padding:9px 18px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">Salvar</button>
    </div></div>`;
  _mkPremioPrevia();
}

function _mkPremioPrevia() {
  const el = document.getElementById('mkr-previa');
  if (!el) return;
  const v = i => (document.getElementById(i) || {}).value || '';
  const foto = v('mkr-foto');
  el.innerHTML = `<div style="background:#fff;border-radius:12px;overflow:hidden;color:#1d2532;box-shadow:0 2px 10px rgba(0,0,0,.3)">
      ${foto ? `<img src="${_mkEsc(foto)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;display:block">` : '<div style="width:100%;aspect-ratio:1;background:#eef1f5;display:flex;align-items:center;justify-content:center;font-size:2.4rem">🎁</div>'}
      <div style="padding:10px 12px"><div style="font-size:.95rem">${_mkEsc(v('mkr-nome') || 'Nome do prêmio')}</div>
        <div style="color:#06253E;font-weight:700;font-size:.85rem">${_mkEsc(v('mkr-pontos') || '0')} pontos</div></div></div>`;
}

async function _mkPremioSalvar(id) {
  const v = i => ((document.getElementById(i) || {}).value || '').trim();
  const msg = document.getElementById('mkr-msg');
  const pontos = parseInt(v('mkr-pontos'), 10);
  if (!v('mkr-nome') || !(pontos > 0)) { msg.style.color = '#f87171'; msg.textContent = 'Nome e pontos (maior que zero) são obrigatórios.'; return; }
  const est = v('mkr-estoque');
  const linha = {
    nome: v('mkr-nome'), descricao: v('mkr-desc') || null, foto_url: v('mkr-foto') || null, pontos,
    categoria: v('mkr-cat'), estoque: est === '' ? null : Math.max(0, parseInt(est, 10) || 0),
    empresa_ids: v('mkr-posto') ? [v('mkr-posto')] : null,
    destaque: document.getElementById('mkr-destaque').checked, ativo: document.getElementById('mkr-ativo').checked,
    atualizado_em: new Date().toISOString(),
  };
  const r = id ? await sb.from('oct_app_premios').update(linha).eq('id', id).select('id')
    : await sb.from('oct_app_premios').insert(linha).select('id');
  if (r.error || !r.data || !r.data.length) {
    msg.style.color = '#f87171';
    msg.textContent = 'Não salvou: ' + ((r.error && r.error.message) || 'sem permissão para publicar?');
    return;
  }
  _mkFechar();
  _MK.aba = 'premios';
  await _mkCarregar();
}
