// ============================================================
// MÓDULO AUTOMAÇÃO — configuração das bombas no concentrador (01/10/2026)
// ------------------------------------------------------------
// Mostra o concentrador de cada posto como o HRS-Console: ICOM × conector (A–D) ×
// endereço (1–4), com modelo da bomba, bicos, casas decimais, sensor Identfid e o
// diagnóstico ao vivo. O MASTER pode gravar ou excluir uma bomba.
// A tela não fala com o posto: lê o que o núcleo publica em oct_automacao_estado e
// PEDE alterações em oct_automacao_comandos. O núcleo grava (protocolo Horustech,
// porta 2001), relê o endereço para conferir e devolve o resultado na linha.
// Comandos capturados do HRS-Console e validados na bancada do Ronan.
// ============================================================

// Modelos do HRS-Console 1.6.08 (lidos do próprio programa): código → [nome, hardware, casas total, volume, preço].
// Igual ao HRS: escolher o modelo já preenche hardware e casas decimais (dá para mudar depois).
const _AC_MODELO_PADRAO = {
  '01': ["Gilbarco", '01', 2, 3, 3], '02': ["Wayne Igem (3G)", '02', 2, 2, 3], '03': ["MTB G-180", '04', 2, 2, 3],
  '04': ["Wayne Minnow", '02', 2, 3, 3], '05': ["Daruma", '04', 2, 2, 3], '06': ["Milleniumm", '02', 2, 2, 3],
  '07': ["Tokheim", '02', 2, 3, 3], '08': ["Wayne Rifran", '02', 2, 2, 3], '09': ["Stratema", '01', 2, 3, 3],
  '0A': ["Bluesky", '02', 2, 2, 3], '0B': ["Aspro ABL", '04', 2, 2, 3], '0C': ["Eletrogas", '01', 3, 3, 3],
  '0D': ["Galileo-PumpControl", '02', 2, 2, 3], '0E': ["Aspro Develco", '04', 2, 2, 3],
  '0F': ["Knox", '04', 2, 2, 3], '10': ["Compac Agira", '04', 2, 2, 3], '11': ["Nuovo Pignone", '04', 2, 2, 3],
  '12': ["Realtek Metroval", '04', 2, 2, 3], '13': ["Stratema fiscal", '01', 2, 3, 3],
  '14': ["Safe Graf", '04', 2, 2, 3], '15': ["IdentFid", '02', 2, 2, 3], '16': ["Lectrocount", '04', 2, 2, 3],
  '17': ["Wayne Duplex II", '02', 2, 2, 3], '18': ["I-Button", '02', 2, 2, 3],
  '19': ["Wayne Igem(3G)<v32", '02', 2, 2, 3], '1A': ["MCSH Mecânico", '01', 2, 2, 3],
  '1B': ["Simulador", '02', 2, 3, 3], '1C': ["Galileu Blocked", '02', 2, 2, 3],
  '1D': ["Metroval CDM110", '02', 2, 2, 3], '1E': ["Wireless reader", '02', 2, 2, 3],
  '1F': ["Bico de Óleo", '02', 2, 3, 3], '20': ["Wayne DL1", '02', 2, 2, 3],
  '21': ["Wayne IGEM Basic", '02', 2, 2, 3], '22': ["Wayne IGEM P_BCD", '02', 2, 2, 3],
  '23': ["Gilbarco Auto-DS", '01', 2, 2, 3], '24': ["Gilbarco Stratema", '01', 2, 3, 3],
  '25': ["Gilbarco Chinesa", '01', 2, 2, 3], '26': ["Mecânica CBM", '02', 2, 2, 3],
  '27': ["Simulador B&IDF", '02', 2, 2, 3], '28': ["Mecânica Comboio", '02', 2, 2, 3],
  '29': ["Dart Standard", '04', 2, 2, 3], '2A': ["MTB G-180 Trunc", '04', 2, 2, 3],
  '2B': ["Identfid MS", '02', 2, 2, 3], '2C': ["Gilbarco Kraus", '01', 2, 2, 3], '2D': ["Compac T10", '01', 2, 2, 3],
  '2E': ["Hongyang", '01', 2, 2, 3], '2F': ["Gilbarco Petromecânica", '01', 2, 2, 3],
  '30': ["Pump Cntrl Blkd Prst", '02', 2, 2, 3], '31': ["Tokheim TQC775", '02', 2, 2, 3],
  '32': ["Identfid Duplo", '01', 2, 2, 3], '33': ["Tokheim PT Gilb", '01', 2, 2, 3],
  '34': ["Identfid STR", '01', 2, 2, 3], '35': ["Petrotec PT Gilb", '01', 2, 2, 3], '36': ["Lanfeng", '01', 2, 2, 3],
  '37': ["Wertco", '02', 2, 2, 3], '38': ["Identfid Wertco", '01', 2, 2, 3], '39': ["Bennett", '01', 2, 2, 3],
  '3A': ["Bennett Horizon", '01', 2, 2, 3], '3B': ["Aspro ABL Blked", '01', 2, 2, 3],
  '3C': ["Bennett 96D", '01', 2, 2, 3], '3D': ["Full Dart Mepsan", '01', 2, 2, 3],
  '3E': ["Identfid STR 07 DPR", '01', 2, 2, 3], '3F': ["Pump Ctrl GC22", '02', 2, 2, 3],
  '40': ["Zcheng Genuine", '01', 2, 3, 3], '41': ["Zcheng Genuine96", '01', 2, 3, 3],
  '42': ["Yenen Gilbarco", '01', 2, 3, 3], '43': ["Metroval CDM05", '01', 2, 3, 3],
  '44': ["Yenen Full Dart", '01', 2, 3, 3], '45': ["Tokheim Kraus", '01', 2, 3, 3],
  '46': ["Tokheim 262A", '01', 2, 3, 3], '47': ["Durulsan Mode GB", '01', 2, 3, 3],
  '48': ["Gilbc Encore 775", '01', 2, 3, 3],
};
const _AC_MODELOS = Object.fromEntries(Object.entries(_AC_MODELO_PADRAO).map(([k, v]) => [k, v[0]]));
// Códigos de combustível que o concentrador conhece (lidos da bancada gravando 00–26; 27+ ele mostra NONE)
const _AC_COMB = {
  '00': 'Nenhum', '01': 'Gasolina comum', '02': 'Gasolina aditivada', '03': 'Gasolina premium', '04': 'Gasolina formulada',
  '05': 'Gasolina Podium', '06': 'Gasolina Maxxi', '07': 'Gasolina Original', '08': 'Gasolina Garantida', '09': 'Gasolina V-Power',
  '10': 'Diesel', '11': 'Diesel aditivado', '12': 'Diesel Verana', '13': 'Diesel S50', '14': 'Diesel Maxxi', '15': 'Diesel especial',
  '16': 'Querosene', '17': 'GNV', '18': 'Outro', '19': 'Etanol', '20': 'Óleo lubrificante', '21': 'Óleo motor 15W40',
  '22': 'Óleo hidráulico 10W30', '23': 'Óleo hidráulico AW100', '24': 'Óleo transmissão 85W140', '25': 'Óleo transmissão 10W30', '26': 'Graxa',
};
const _AC_SENSORES = { '00': 'Sem sensor', '15': 'Identfid', '2B': 'Identfid_MS', '32': 'Identfid duplo', '34': 'Identfid STR', '38': 'Identfid Wertco' };
const _AC_FORMAS = { '00': 'Desabilitado', '01': 'Bomba de combustível', '02': 'Acesso (envia não cadastrados)', '03': 'Acesso (ignora não cadastrados)', '04': 'Cartão ponto', '05': 'Máquina de lavar' };
const _AC_HW = { '01': 'Loop High', '02': 'Loop Low', '04': 'RS-485' };
const _AC_DIAG = { R: ['respondendo', '#22c55e'], F: ['não respondendo', '#ef4444'], N: ['não configurado', '#64748b'], '?': ['tipo desconhecido', '#facc15'], '!': ['tipo não autorizado', '#facc15'], '0': ['sem bico', '#64748b'] };
const _AC_CMD = { pendente: ['⏳ na fila', '#facc15'], executando: ['⚙️ gravando', '#facc15'], ok: ['✅ feito', '#22c55e'], erro: ['❌ erro', '#f87171'], cancelado: ['🚫 cancelado', '#94a3b8'] };
const _ac = { empresaId: null, icom: 1, estado: null, lidoEm: null, cmds: [], empresas: [], comPainel: {}, form: null, timer: null };

async function moduloAutomacaoCfg() {
  const el = document.getElementById('conteudo');
  _ac.el = el;
  if (typeof PERM !== 'undefined' && PERM.carregado && !PERM.master) {
    el.innerHTML = '<p style="color:#f87171;padding:20px">Só o master configura bombas.</p>';
    return;
  }
  el.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const [{ data: emps }, { data: pubs }] = await Promise.all([
    sb.from('oct_empresas').select('id,nome_fantasia,nome').order('nome_fantasia'),
    sb.from('oct_automacao_estado').select('empresa_id,lido_em,erro:estado->>erro'),
  ]);
  _ac.empresas = emps || [];
  // postos cujo núcleo já publica a configuração (os outros ainda não têm o painel)
  _ac.comPainel = Object.fromEntries((pubs || []).filter(p => !p.erro).map(p => [p.empresa_id, p.lido_em]));
  const ativa = typeof empresaAtiva === 'function' && empresaAtiva();
  const primeiroComPainel = _ac.empresas.find(e => _ac.comPainel[e.id]);
  _ac.empresaId = _ac.empresaId
    || (ativa && _ac.comPainel[ativa] ? ativa : null)
    || (primeiroComPainel || {}).id || ativa || (_ac.empresas[0] || {}).id;
  await _acCarregar();
}

function _acEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _acHa(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `há ${s} s` : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`;
}
function _acChave(e) { return `${e.icom}${e.conector}${e.endereco}`; }

function _acTimer(rapido) {
  if (_ac.timer) clearTimeout(_ac.timer);
  _ac.timer = setTimeout(() => {
    if (!_ac.el || !document.body.contains(_ac.el) || !document.getElementById('ac-root')) return;
    if (_ac.form) { _acTimer(rapido); return; }
    _acCarregar();
  }, rapido ? 3000 : 15000);
}

async function _acCarregar() {
  const eid = _ac.empresaId;
  const [eR, cR] = await Promise.all([
    sb.from('oct_automacao_estado').select('estado,lido_em').eq('empresa_id', eid).maybeSingle(),
    sb.from('oct_automacao_comandos').select('*').eq('empresa_id', eid).order('criado_em', { ascending: false }).limit(10),
  ]);
  _ac.semTabela = [eR.error, cR.error].some(e => e && /relation|does not exist|PGRST205|schema cache/i.test((e.message || '') + (e.code || '')));
  _ac.estado = eR.data ? eR.data.estado : null;
  _ac.lidoEm = eR.data ? eR.data.lido_em : null;
  _ac.cmds = cR.data || [];
  if (_ac.estado && !(_ac.estado.icoms_em_uso || []).includes(_ac.icom)) _ac.icom = (_ac.estado.icoms_em_uso || [1])[0];
  _acRender();
  _acTimer(_ac.cmds.some(c => c.status === 'pendente' || c.status === 'executando'));
}

function _acRender() {
  const el = _ac.el;
  const opts = _ac.empresas.map(e => `<option value="${e.id}" ${e.id === _ac.empresaId ? 'selected' : ''}>${_ac.comPainel[e.id] ? '● ' : ''}${_acEsc(e.nome_fantasia || e.nome)}</option>`).join('');
  let corpo;
  if (_ac.semTabela) {
    corpo = '<div style="background:#3b1d0a;border:1px solid #f97316;border-radius:8px;padding:10px;color:#fdba74">Falta rodar o <b>SQL-AUTOMACAO-CONFIG.sql</b> no Supabase.</div>';
  } else if (_ac.estado && _ac.estado.erro) {
    corpo = _acMotivo(_ac.estado);
  } else if (!_ac.estado) {
    const outros = _ac.empresas.filter(e => _ac.comPainel[e.id]);
    corpo = `<p style="color:#94a3b8">O núcleo deste posto ainda não tem o painel de bombas (precisa da atualização do núcleo), está desligado ou não tem automação cadastrada.</p>`
      + (outros.length ? `<p style="color:#94a3b8;font-size:0.84rem">Com o painel ativo (● na lista): ${outros.map(e => `<button onclick="_acTrocarPosto('${e.id}')" style="padding:5px 10px;margin:2px;border-radius:6px;border:1px solid #f97316;background:#13151f;color:#fdba74;cursor:pointer">${_acEsc(e.nome_fantasia || e.nome)}</button>`).join('')}</p>` : '');
  } else {
    const ends = _ac.estado.enderecos || [];
    const icoms = [1, 2, 3].filter(i => (_ac.estado.icoms_em_uso || [1]).includes(i) || i === _ac.icom);
    const abas = [1, 2, 3].map(i => `<button onclick="_acIcom(${i})" style="padding:7px 12px;border-radius:8px 8px 0 0;border:1px solid #2a2d3e;border-bottom:none;background:${i === _ac.icom ? '#13151f' : '#0b0d14'};color:${i === _ac.icom ? '#f97316' : (icoms.includes(i) ? '#ddd' : '#555')};cursor:pointer;font-weight:700">ICOM ${i}</button>`).join('');
    const cel = (con, end) => {
      const e = ends.find(x => x.icom === _ac.icom && x.conector === con && x.endereco === end) || { icom: _ac.icom, conector: con, endereco: end };
      const dg = e.diagnostico || {};
      const [dTxt, dCor] = _AC_DIAG[dg.sit] || (e.configurado ? ['sem diagnóstico', '#64748b'] : ['vazio', '#334155']);
      const bicos = (e.bicos || []).filter(b => b.numero).map(b => b.numero).join(' ');
      const pend = _ac.cmds.find(c => (c.status === 'pendente' || c.status === 'executando') && c.parametros && `${c.parametros.icom}${c.parametros.conector}${c.parametros.endereco}` === _acChave(e));
      return `<div onclick="_acAbrir('${con}',${end})" style="cursor:pointer;background:#13151f;border:1px solid #2a2d3e;border-left:6px solid ${dCor};border-radius:8px;padding:8px;min-height:74px;display:flex;flex-direction:column;gap:3px">
        <div style="display:flex;justify-content:space-between;gap:6px"><b style="color:${e.configurado ? '#e2e8f0' : '#64748b'};font-size:0.84rem">${e.configurado ? _acEsc(e.modelo || e.tipo) : 'Livre'}</b>${_acSeloIdf(e)}</div>
        <div style="color:#cbd5e1;font-size:0.8rem">${bicos ? 'Bicos: ' + bicos : '&nbsp;'}</div>
        <div style="color:${dCor};font-size:0.72rem">${dTxt}${pend ? ' · <span style="color:#facc15">alteração na fila</span>' : ''}</div>
      </div>`;
    };
    const grade = `<div style="overflow-x:auto"><table style="border-collapse:separate;border-spacing:6px;min-width:640px;width:100%">
      <tr><th></th>${'ABCD'.split('').map(c => `<th style="color:#94a3b8;font-weight:600;font-size:0.8rem">Conector ${c}</th>`).join('')}</tr>
      ${[1, 2, 3, 4].map(end => `<tr><td style="color:#94a3b8;font-size:0.78rem;white-space:nowrap">End. ${end}</td>${'ABCD'.split('').map(c => `<td style="vertical-align:top;width:24%">${cel(c, end)}</td>`).join('')}</tr>`).join('')}
    </table></div>`;
    corpo = `<div style="display:flex;gap:4px;margin-top:6px">${abas}</div>
      <div style="border:1px solid #2a2d3e;border-radius:0 8px 8px 8px;padding:6px;background:#0f1117">${grade}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.74rem;color:#94a3b8;margin-top:6px">${['R', 'F', 'N'].map(k => [k, _AC_DIAG[k]]).map(([k, [t, c]]) => `<span><span style="display:inline-block;width:10px;height:10px;background:${c};border-radius:2px"></span> ${t}</span>`).join('')}<span>· lido ${_acHa(_ac.lidoEm)}</span></div>`;
  }
  const hist = _ac.cmds.map(c => {
    const st = _AC_CMD[c.status] || [c.status, '#ddd'];
    const p = c.parametros || {};
    const r = c.resultado || {};
    const desc = c.tipo === 'excluir_endereco' ? `Excluir bomba ${p.icom}${p.conector}${p.endereco}`
      : c.tipo === 'gravar_endereco' && p.somente_idf ? `${(p.idf || {}).forma === '00' ? 'Desligar' : 'Ligar'} identificador ${p.icom}${p.conector}${p.endereco}`
      : c.tipo === 'gravar_endereco' ? `Gravar ${p.icom}${p.conector}${p.endereco}: ${_AC_MODELOS[p.tipo] || p.tipo}, bicos ${(p.bicos || []).filter(b => +b.numero).map(b => b.numero).join(' ')}` : c.tipo;
    return `<div style="border-top:1px solid #1f2230;padding:8px 2px;font-size:0.82rem">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span style="color:#e2e8f0">${_acEsc(desc)}${r.enviados && !r.enviados.length ? ' <span style="color:#94a3b8">(já estava assim)</span>' : ''}${!p.somente_idf && r.enviados && r.enviados.join() === '1D' ? ' <span style="color:#94a3b8">(só o identificador mudou)</span>' : ''}</span><b style="color:${st[1]}">${st[0]}</b></div>
      <div style="color:#888;font-size:0.74rem">${new Date(c.criado_em).toLocaleString('pt-BR')} por ${_acEsc(c.criado_por_nome || '—')}${c.erro ? ` · <span style="color:#f87171">${_acEsc(c.erro)}</span>` : ''}</div>
      ${c.status === 'pendente' ? `<button onclick="_acCancelar('${c.id}')" style="margin-top:4px;padding:4px 8px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#f87171;cursor:pointer">Cancelar</button>` : ''}
    </div>`;
  }).join('');
  el.innerHTML = `<div id="ac-root" style="max-width:1100px;padding:10px 6px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px">
      <h2 style="color:#f97316;margin:0">🔧 Automação — bombas</h2>
      <select onchange="_acTrocarPosto(this.value)" style="padding:8px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">${opts}</select>
      <button onclick="_acCarregar()" style="padding:8px 12px;border-radius:8px;border:1px solid #2a2d3e;background:#13151f;color:#ddd;cursor:pointer">↻</button>
    </div>
    <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 8px">Configuração gravada no concentrador. Clique num endereço para configurar ou excluir a bomba. Só o master altera; o posto grava, relê e confere.</p>
    <div id="ac-form"></div>
    ${corpo}
    <h3 style="color:#e2e8f0;margin:16px 0 2px;font-size:1rem">Últimas alterações</h3>
    <div>${hist || '<p style="color:#666;font-size:0.85rem">Nenhuma alteração pedida.</p>'}</div>
  </div>`;
  if (_ac.form) _acAbrir(_ac.form.con, _ac.form.end, true);
}

// o núcleo publicou, mas o concentrador não serve para o painel: diz por quê (em vez de "sem painel")
function _acMotivo(e) {
  const outros = _ac.empresas.filter(x => _ac.comPainel[x.id] && x.id !== _ac.empresaId);
  const txt = {
    sem_horustech: `O concentrador deste posto tem firmware antigo (<b>${_acEsc(e.firmware || '?')}</b>) e só fala o protocolo Companytec: <b>não aceita configuração de bombas pelo painel</b>. Para configurar por aqui é preciso atualizar o firmware ou trocar o concentrador. As bombas e o TecnoX seguem funcionando normalmente.`,
    desligado: `O painel de bombas está <b>desligado no núcleo deste posto</b>.${e.obs ? `<br><span style="color:#94a3b8">${_acEsc(e.obs)}</span>` : ''}`,
    sem_host: 'O núcleo deste posto <b>não tem o concentrador cadastrado</b> (automação sem endereço), então não há bombas para mostrar.',
    sem_comunicacao: `O núcleo <b>não conseguiu conectar no concentrador</b> (${_acEsc(e.host || '')}:${_acEsc(e.porta || '')}). Ele tenta de novo a cada 5 min.${e.detalhe ? `<br><span style="color:#94a3b8;font-size:0.8rem">${_acEsc(e.detalhe)}</span>` : ''}`,
    sem_resposta: `O concentrador (${_acEsc(e.host || '')}:${_acEsc(e.porta || '')}) <b>aceita a conexão mas não responde</b> ao protocolo de configuração. O núcleo tenta de novo a cada 5 min.`,
  }[e.erro] || `O núcleo informou: ${_acEsc(e.erro)}`;
  return `<div style="background:#2a1d0a;border:1px solid #b45309;border-radius:8px;padding:12px;color:#fde68a;line-height:1.5">${txt}
    <div style="color:#94a3b8;font-size:0.76rem;margin-top:6px">informado pelo núcleo ${_acHa(_ac.lidoEm)}</div></div>`
    + (outros.length ? `<p style="color:#94a3b8;font-size:0.84rem">Com o painel ativo (● na lista): ${outros.map(x => `<button onclick="_acTrocarPosto('${x.id}')" style="padding:5px 10px;margin:2px;border-radius:6px;border:1px solid #f97316;background:#13151f;color:#fdba74;cursor:pointer">${_acEsc(x.nome_fantasia || x.nome)}</button>`).join('')}</p>` : '');
}

function _acTrocarPosto(id) { _ac.empresaId = id; _ac.form = null; _ac.icom = 1; _acCarregar(); }
function _acIcom(i) { _ac.icom = i; _ac.form = null; _acRender(); }

function _acSel(id, opcoes, valor, onchange) {
  const ops = Object.entries(opcoes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  // o que está gravado no concentrador e não está na lista continua aparecendo (senão o select trocaria calado)
  if (valor != null && !ops.some(([k]) => String(k) === String(valor))) ops.unshift([String(valor), 'desconhecido']);
  return `<select id="${id}" ${onchange ? `onchange="${onchange}"` : ''} style="padding:7px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;max-width:100%">${ops.map(([k, v]) => `<option value="${k}" ${String(k) === String(valor) ? 'selected' : ''}>${k} — ${_acEsc(v)}</option>`).join('')}</select>`;
}
// trocar o modelo preenche hardware e casas com o padrão do HRS-Console
function _acModelo() {
  const p = _AC_MODELO_PADRAO[document.getElementById('ac-tipo').value];
  if (!p) return;
  const hw = document.getElementById('ac-hw');
  if (![...hw.options].some(o => o.value === p[1])) hw.insertAdjacentHTML('beforeend', `<option value="${p[1]}">${p[1]}</option>`);
  hw.value = p[1];
  document.getElementById('ac-ct').value = p[2];
  document.getElementById('ac-cv').value = p[3];
  document.getElementById('ac-cp').value = p[4];
}
function _acNum(id, v, max) { return `<input id="${id}" type="number" min="0" max="${max}" value="${v == null ? 0 : v}" style="width:64px;padding:6px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">`; }

function _acAbrir(con, end, manter) {
  const ends = (_ac.estado && _ac.estado.enderecos) || [];
  const e = ends.find(x => x.icom === _ac.icom && x.conector === con && x.endereco === end) || {};
  // endereço vazio: parte do primeiro endereço configurado do mesmo conector (mesma bomba costuma repetir)
  const base = e.configurado ? e : (ends.find(x => x.icom === _ac.icom && x.conector === con && x.configurado) || {});
  const casas = base.casas || { total: 2, volume: 3, preco: 3 };
  const bicos = e.configurado ? e.bicos : [0, 0, 0, 0].map(() => ({ numero: 0, tanque: 0, combustivel: 0 }));
  const idf = base.idf || { sensor: '00', forma: '00', tempo: 0 };
  _ac.form = { con, end, antes: e };
  const box = document.getElementById('ac-form');
  if (!box) return;
  box.innerHTML = `<div style="background:#13151f;border:1px solid #f97316;border-radius:10px;padding:14px;margin-bottom:12px">
    <div style="font-weight:800;color:#f97316;margin-bottom:8px">ICOM ${_ac.icom} · conector ${con} · endereço ${end} ${e.configurado ? '' : '<span style="color:#94a3b8;font-weight:400">(livre — bomba nova)</span>'}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-bottom:10px;font-size:0.84rem;color:#ccc">
      <label>Modelo da bomba<br>${_acSel('ac-tipo', _AC_MODELOS, (base.tipo || '01').toUpperCase(), '_acModelo()')}</label>
      <label>Hardware<br>${_acSel('ac-hw', _AC_HW, base.hardware || '01')}</label>
      <label>Casas decimais (total / volume / preço)<br>${_acNum('ac-ct', casas.total, 3)} ${_acNum('ac-cv', casas.volume, 3)} ${_acNum('ac-cp', casas.preco, 3)}</label>
    </div>
    <div style="color:#ccc;font-size:0.84rem;margin-bottom:4px">Bicos (0 = posição vazia)</div>
    <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:0.84rem;color:#ddd"><tr style="color:#94a3b8"><th style="padding:3px 8px">Posição</th><th>Bico</th><th>Tanque</th><th>Combustível</th></tr>
      ${'ABCD'.split('').map((L, i) => `<tr><td style="padding:3px 8px">${L}</td><td>${_acNum('ac-b' + i, (bicos[i] || {}).numero, 99)}</td><td>${_acNum('ac-t' + i, (bicos[i] || {}).tanque, 99)}</td><td>${_acSel('ac-f' + i, _AC_COMB, String((bicos[i] || {}).combustivel || 0).padStart(2, '0'))}</td></tr>`).join('')}
    </table></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin:10px 0;font-size:0.84rem;color:#ccc">
      <label>Sensor Identfid<br>${_acSel('ac-sensor', _AC_SENSORES, (idf.sensor || '00').toUpperCase())}</label>
      <label>Forma de trabalho<br>${_acSel('ac-forma', _AC_FORMAS, idf.forma || '00')}</label>
      <label>Tempo do sensor<br>${_acNum('ac-tempo', idf.tempo, 99)}</label>
    </div>
    ${e.configurado && idf.sensor && idf.sensor !== '00' ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#0b0d14;border:1px solid #2a2d3e;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:0.84rem;color:#ccc">
      <span>Identificador: <b style="color:${idf.forma === '00' ? '#facc15' : '#22c55e'}">${idf.forma === '00' ? 'DESLIGADO — a bomba abastece sem cartão' : 'ligado'}</b></span>
      <button onclick="_acIdentificador(${idf.forma === '00' ? 'true' : 'false'})" style="padding:7px 12px;border-radius:8px;border:1px solid ${idf.forma === '00' ? '#22c55e' : '#facc15'};background:#13151f;color:${idf.forma === '00' ? '#86efac' : '#fde68a'};font-weight:700;cursor:pointer">${idf.forma === '00' ? 'Ligar identificador' : 'Desligar identificador'}</button>
      <span style="color:#94a3b8;font-size:0.76rem">só o identificador muda — a bomba não é regravada</span>
    </div>` : ''}
    <div id="ac-resumo" style="font-size:0.84rem;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="_acSalvar()" style="padding:10px 14px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:800;cursor:pointer">Gravar no concentrador</button>
      ${e.configurado ? `<button onclick="_acExcluir()" style="padding:10px 14px;border-radius:8px;border:1px solid #ef4444;background:#13151f;color:#f87171;font-weight:700;cursor:pointer">Excluir bomba</button>` : ''}
      <button onclick="_acFechar()" style="padding:10px 14px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#ddd;cursor:pointer">Cancelar</button>
    </div>
    <div id="ac-msg" style="margin-top:8px;font-size:0.84rem"></div>
  </div>`;
  if (!manter) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _acFechar() { _ac.form = null; const b = document.getElementById('ac-form'); if (b) b.innerHTML = ''; }

function _acLerForm() {
  const v = id => document.getElementById(id).value;
  const n = id => parseInt(v(id), 10) || 0;
  return {
    icom: _ac.icom, conector: _ac.form.con, endereco: _ac.form.end,
    tipo: v('ac-tipo'), hardware: v('ac-hw'),
    casas: { total: n('ac-ct'), volume: n('ac-cv'), preco: n('ac-cp') },
    bicos: [0, 1, 2, 3].map(i => ({ numero: n('ac-b' + i), tanque: n('ac-t' + i), combustivel: n('ac-f' + i) })),
    idf: { sensor: v('ac-sensor'), forma: v('ac-forma'), tempo: n('ac-tempo') },
  };
}

// conferências que o núcleo também faz — aqui para avisar antes de mandar
function _acValidar(p) {
  const nums = p.bicos.map(b => b.numero).filter(Boolean);
  if (!nums.length) return 'Informe pelo menos um bico.';
  if (new Set(nums).size !== nums.length) return 'Bico repetido no mesmo endereço.';
  if ([p.casas.total, p.casas.volume, p.casas.preco].some(c => c < 0 || c > 3)) return 'Casas decimais vão de 0 a 3.';
  if (p.bicos.some(b => b.numero > 99 || b.tanque > 99)) return 'Bico e tanque vão de 0 a 99.';
  if (!_AC_HW[p.hardware]) return 'Hardware deve ser 01 Loop High, 02 Loop Low ou 04 RS-485.';
  const outros = ((_ac.estado && _ac.estado.enderecos) || []).filter(e => e.configurado && !(e.icom === p.icom && e.conector === p.conector && e.endereco === p.endereco));
  for (const o of outros) {
    const dup = (o.bicos || []).map(b => b.numero).filter(x => x && nums.includes(x));
    if (dup.length) return `O bico ${dup.join(', ')} já está em ${o.icom}${o.conector}${o.endereco}.`;
  }
  return null;
}

async function _acPedir(tipo, parametros, msgOk) {
  const msg = document.getElementById('ac-msg');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { msg.innerHTML = '<span style="color:#f87171">Sessão expirada — entre de novo.</span>'; return; }
  let nome = user.email;
  try { const pr = await sb.from('oct_perfis').select('nome').eq('id', user.id).maybeSingle(); if (pr.data && pr.data.nome) nome = pr.data.nome; } catch (e) { /* fica o e-mail */ }
  const { error } = await sb.from('oct_automacao_comandos').insert({ empresa_id: _ac.empresaId, tipo, parametros, criado_por: user.id, criado_por_nome: nome });
  if (error) {
    const semPerm = error.code === '42501' || /row-level security/i.test(error.message || '');
    msg.innerHTML = `<span style="color:#f87171">${semPerm ? 'Só o master pode alterar a configuração das bombas.' : _acEsc(error.message)}</span>`;
    return;
  }
  _ac.form = null;
  await _acCarregar();
  const b = document.getElementById('ac-form');
  if (b) b.innerHTML = `<div style="background:#0b2a17;border:1px solid #22c55e;border-radius:10px;padding:12px;color:#86efac;margin-bottom:12px">${msgOk}</div>`;
}

async function _acSalvar() {
  const p = _acLerForm();
  const msg = document.getElementById('ac-msg');
  const erro = _acValidar(p);
  if (erro) { msg.innerHTML = `<span style="color:#f87171">${erro}</span>`; return; }
  const posto = (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || '';
  const txt = `Gravar no concentrador do ${posto}:\n\nICOM ${p.icom}, conector ${p.conector}, endereço ${p.endereco}\n` +
    `Modelo: ${p.tipo} — ${_AC_MODELOS[p.tipo]} (hardware ${p.hardware} ${_AC_HW[p.hardware] || ''})\n` +
    `Bicos: ${p.bicos.filter(b => b.numero).map(b => `${b.numero} (${_AC_COMB[String(b.combustivel).padStart(2, '0')] || b.combustivel})`).join(', ')}\n` +
    `Casas: total ${p.casas.total}, volume ${p.casas.volume}, preço ${p.casas.preco}\n\n` +
    'Configuração errada PARA a bomba. Confirmar?';
  if (!confirm(txt)) return;
  await _acPedir('gravar_endereco', p, 'Pedido enviado. O posto grava, relê e confere em poucos segundos — acompanhe em "Últimas alterações".');
}

// selo da grade: identificador ligado (verde) ou desligado (amarelo); sem sensor, nada
function _acSeloIdf(e) {
  if (!e.configurado || !e.idf || !e.idf.sensor || e.idf.sensor === '00') return '';
  const off = e.idf.forma === '00';
  return `<span title="Identificador ${off ? 'desligado' : 'ligado'}" style="background:${off ? '#422006' : '#14532d'};color:${off ? '#fde68a' : '#bbf7d0'};font-size:0.66rem;padding:1px 5px;border-radius:4px;font-weight:700">ID ${off ? 'off' : 'on'}</span>`;
}

// liga/desliga SÓ o identificador (comando 1D): o núcleo lê a bomba do concentrador na hora e não a regrava
async function _acIdentificador(ligar) {
  const f = _ac.form;
  const posto = (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || '';
  const txt = ligar
    ? `LIGAR o identificador do ICOM ${_ac.icom}, conector ${f.con}, endereço ${f.end} no ${posto}?

Os bicos dessa bomba voltam a exigir o cartão.`
    : `DESLIGAR o identificador do ICOM ${_ac.icom}, conector ${f.con}, endereço ${f.end} no ${posto}?

Os bicos dessa bomba passam a abastecer SEM cartão (o abastecimento fica sem frentista identificado).
A configuração da bomba não é mexida.`;
  if (!confirm(txt)) return;
  await _acPedir('gravar_endereco', { icom: _ac.icom, conector: f.con, endereco: f.end, somente_idf: true, idf: { forma: ligar ? '01' : '00' } },
    `Pedido enviado: ${ligar ? 'ligar' : 'desligar'} o identificador. O posto grava e confere em poucos segundos — acompanhe em "Últimas alterações".`);
}

async function _acExcluir() {
  const f = _ac.form;
  const posto = (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || '';
  if (!confirm(`EXCLUIR a bomba do ICOM ${_ac.icom}, conector ${f.con}, endereço ${f.end} no ${posto}?\n\nOs bicos desse endereço param de abastecer pela automação.`)) return;
  await _acPedir('excluir_endereco', { icom: _ac.icom, conector: f.con, endereco: f.end }, 'Pedido de exclusão enviado — acompanhe em "Últimas alterações".');
}

async function _acCancelar(id) {
  const { data, error } = await sb.from('oct_automacao_comandos').update({ status: 'cancelado' }).eq('id', id).eq('status', 'pendente').select('id');
  if (error) alert('Não consegui cancelar: ' + error.message);
  else if (!data || !data.length) alert('O posto já começou — não dá mais para cancelar.');
  _acCarregar();
}
