// ============================================================
// AUTOMAÇÃO — ferramentas do concentrador (01/10/2026)
// ------------------------------------------------------------
// Abas do módulo Automação além da grade de bombas (automacao_cfg.js):
//   Ao vivo · Abastecimentos (período → Excel) · Cartões Identfid · Bicos / hexa ·
//   Eventos · Informações.
// A tela não fala com o posto: PEDE em oct_automacao_comandos e o núcleo lê do
// concentrador (protocolo Horustech, porta 2001). Resultado grande volta em
// oct_automacao_leituras (partes de 1000 linhas); "Bicos" e "Informações" já vêm no
// estado que o núcleo publica a cada minuto (oct_automacao_estado).
// Gravar/excluir cartão: comandos do manual (0D/0E), validados na bancada com a
// captura do HRS-Console (o núcleo repete o 0D na mesma conexão, como o HRS faz).
// ============================================================

const _af = {
  dados: {}, ocupado: {}, msg: {}, filtro: '',
  de: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  ate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  quantos: 300, novoIp: '', ipNucleo: true, zerar: { bombas: false, cartoes: false, pendentes: false }, pessoas: null, precos: null, vivo: { timer: null, renovar: 0, dados: null, lidoEm: null },
};
const _AF_ABAS = [['bombas', '⛽ Bombas'], ['vivo', '🔴 Ao vivo'], ['abast', '📋 Abastecimentos'], ['cartoes', '💳 Cartões'], ['bicos', '🔢 Bicos / hexa'], ['eventos', '📜 Eventos'], ['info', 'ℹ️ Informações'], ['manut', '🛠 Manutenção']];
const _AF_FUNCAO = { '27': 'Frentista — libera a bomba', '04': 'Cliente — não libera', '14': 'Cliente — não libera', '24': 'Cliente — não libera', '0F': 'Controle total — não libera', '6F': 'Controle total — libera', 'EF': 'Controle total — libera (mestre)' };
const _AF_EVENTO = {
  'Pump price changed': 'Preço da bomba alterado (à vista)', 'PUMP price changed credit': 'Preço da bomba alterado (a prazo)',
  'Pump configuration change': 'Configuração da bomba alterada', 'Pump configuration clear': 'Bomba excluída da configuração',
  'Pump Type Configuration change': 'Modelo da bomba alterado', 'Pump CODVIRG Changed': 'Casas decimais da bomba alteradas',
  'PUMP Nozzle number change': 'Número do bico alterado', 'Pump Reconnected': 'Bomba voltou a responder', 'Pump Disconnected': 'Bomba parou de responder',
  'Identifier Disconnected': 'Identificador desconectado', 'Identifier Reconnected': 'Identificador reconectado',
  'SENSOR - Configuration changed': 'Configuração do sensor alterada', 'SENSOR - write card error': 'Erro ao gravar cartão',
  'Console Time changed': 'Relógio do concentrador acertado', 'final attempt to read the sale': 'Última tentativa de ler o abastecimento',
  'Pump Date Firmware version': 'Versão do firmware da bomba',
};

function _afLimpar() { _af.dados = {}; _af.ocupado = {}; _af.msg = {}; _af.pessoas = null; _af.precos = null; _af.filtro = ''; _af._apoioAbast = _af._apoioCart = _af._apoioBico = false; _af.vivo.dados = null; _af.vivo.lidoEm = null; _afVivoParar(); }
function _afBtn(txt, onclick, cor) { return `<button onclick="${onclick}" style="padding:9px 14px;border-radius:8px;border:none;background:${cor || '#f97316'};color:#fff;font-weight:800;cursor:pointer">${txt}</button>`; }
function _afInp(extra) { return `style="padding:8px;border-radius:8px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff" ${extra || ''}`; }
function _afR$(v, casas) { return v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 2 : casas, maximumFractionDigits: casas == null ? 2 : casas }); }
function _afData(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : ''; }
function _afHexa(icom, con, end, pos) { return (0x04 + 4 * ('ABCD'.indexOf(con) + 4 * (icom - 1)) + (end - 1) + 0x40 * pos).toString(16).toUpperCase().padStart(2, '0'); }

// bico da pista -> onde ele está no concentrador (do estado publicado)
function _afBicos() {
  const out = [];
  (((_ac.estado || {}).enderecos) || []).filter(e => e.configurado).forEach(e => (e.bicos || []).forEach((b, i) => {
    if (b.numero) out.push({ bico: b.numero, icom: e.icom, conector: e.conector, endereco: e.endereco, pos: i, tipo: e.tipo, modelo: e.modelo, casas: e.casas || {}, tanque: b.tanque, combustivel: b.combustivel, hexa: _afHexa(e.icom, e.conector, e.endereco, i), sit: (e.diagnostico || {}).sit });
  }));
  return out.sort((a, b) => a.bico - b.bico);
}
async function _afApoio() {
  if (!_af.pessoas) {
    const r = await sb.from('oct_pessoas').select('nome,cartao_idf,ativo').eq('empresa_id', _ac.empresaId).not('cartao_idf', 'is', null);
    _af.pessoas = {};
    (r.data || []).forEach(p => { const c = String(p.cartao_idf || '').trim().toUpperCase(); if (c) _af.pessoas[c] = p; });
  }
  if (!_af.precos) {
    const r = await sb.from('oct_precos_bomba').select('bico_numero,preco_nivel0').eq('empresa_id', _ac.empresaId);
    _af.precos = {};
    (r.data || []).forEach(p => { _af.precos[p.bico_numero] = p.preco_nivel0; });
  }
}
function _afNomeCartao(c) { const p = c && _af.pessoas && _af.pessoas[c]; return p ? p.nome + (p.ativo === false ? ' (inativo)' : '') : ''; }

// ---------------------------------------------------------------- pedidos ao núcleo
async function _afPedir(tipo, parametros) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('sessão expirada — entre de novo');
  let nome = user.email;
  try { const pr = await sb.from('oct_perfis').select('nome').eq('id', user.id).maybeSingle(); if (pr.data && pr.data.nome) nome = pr.data.nome; } catch (e) { /* fica o e-mail */ }
  const { data, error } = await sb.from('oct_automacao_comandos').insert({ empresa_id: _ac.empresaId, tipo, parametros, criado_por: user.id, criado_por_nome: nome }).select('id').single();
  if (error) {
    if (/ck_auto_cmd_tipo/i.test(error.message || '')) throw new Error('falta rodar o SQL-AUTOMACAO-FERRAMENTAS.sql no Supabase');
    if (error.code === '42501' || /row-level security/i.test(error.message || '')) throw new Error('só o master usa as ferramentas da automação');
    throw new Error(error.message || 'erro ao gravar o pedido');
  }
  return data.id;
}
async function _afEsperar(id, limiteMs) {
  const fim = Date.now() + (limiteMs || 120000);
  while (Date.now() < fim) {
    await new Promise(r => setTimeout(r, 2000));
    const { data } = await sb.from('oct_automacao_comandos').select('id,status,erro,resultado,concluido_em,parametros').eq('id', id).maybeSingle();
    if (data && (data.status === 'ok' || data.status === 'erro')) return data;
  }
  throw new Error('o posto não respondeu a tempo (núcleo desligado, sem internet ou ainda na versão antiga)');
}
async function _afLinhas(id) {
  const { data, error } = await sb.from('oct_automacao_leituras').select('parte,linhas').eq('comando_id', id).order('parte');
  if (error) throw new Error(/relation|does not exist|PGRST205/i.test(error.message || '') ? 'falta rodar o SQL-AUTOMACAO-FERRAMENTAS.sql no Supabase' : error.message);
  return (data || []).reduce((a, p) => a.concat(p.linhas || []), []);
}
// lê um "arquivo" do concentrador e guarda em _af.dados[chave]
async function _afLer(chave, arquivo, extra, limiteMs) {
  if (_af.ocupado[chave]) return;
  _af.ocupado[chave] = true; _af.msg[chave] = null; _afRender();
  try {
    const id = await _afPedir('ler_arquivo', Object.assign({ arquivo }, extra || {}));
    const cmd = await _afEsperar(id, limiteMs);
    if (cmd.status !== 'ok') throw new Error(cmd.erro || 'o posto devolveu erro');
    _af.dados[chave] = { cmd, linhas: await _afLinhas(id) };
  } catch (e) { _af.msg[chave] = { erro: e.message || String(e) }; }
  _af.ocupado[chave] = false; _afRender();
}
// ao abrir a aba: reaproveita a última leitura boa (até 3 dias) em vez de começar vazio
async function _afUltima(chave, arquivo) {
  if (_af.dados[chave] || _af.ocupado[chave] || _af.dados['_tentei_' + chave]) return;
  _af.dados['_tentei_' + chave] = true;
  const { data } = await sb.from('oct_automacao_comandos').select('id,status,resultado,concluido_em,parametros').eq('empresa_id', _ac.empresaId)
    .eq('tipo', 'ler_arquivo').eq('status', 'ok').eq('parametros->>arquivo', arquivo).order('criado_em', { ascending: false }).limit(1);
  if (!data || !data.length) return;
  try { const linhas = await _afLinhas(data[0].id); if (linhas.length || (data[0].resultado || {}).linhas === 0) { _af.dados[chave] = { cmd: data[0], linhas }; _afRender(); } } catch (e) { /* sem tabela: aparece ao pedir */ }
}
async function _afExcel(nome, cabecalho, linhas) {
  if (typeof _relCarregarXLSX !== 'function') { alert('biblioteca do Excel não carregada nesta tela'); return; }
  let XLSX;
  try { XLSX = await _relCarregarXLSX(); } catch (e) { alert(e.message); return; }
  const ws = XLSX.utils.aoa_to_sheet([cabecalho].concat(linhas));
  ws['!cols'] = cabecalho.map(h => ({ wch: Math.max(11, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  const posto = ((_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || 'posto').replace(/[^\w]+/g, '_');
  XLSX.writeFile(wb, `${nome}_${posto}.xlsx`);
}
function _afAviso(chave, espera) {
  const m = _af.msg[chave];
  if (_af.ocupado[chave]) return `<div style="color:#facc15;font-size:0.86rem;margin:8px 0">⏳ ${espera || 'Pedindo ao posto…'}</div>`;
  if (m && m.erro) return `<div style="color:#f87171;font-size:0.86rem;margin:8px 0">❌ ${_acEsc(m.erro)}</div>`;
  if (m && m.ok) return `<div style="color:#86efac;font-size:0.86rem;margin:8px 0">✅ ${_acEsc(m.ok)}</div>`;
  return '';
}
function _afLido(d) { return d && d.cmd && d.cmd.concluido_em ? `<span style="color:#64748b;font-size:0.76rem">lido do concentrador ${_acHa(d.cmd.concluido_em)}</span>` : ''; }
function _afTabela(cab, linhas, max) {
  const th = 'style="text-align:left;padding:5px 8px;color:#94a3b8;font-weight:600;border-bottom:1px solid #2a2d3e;white-space:nowrap"';
  const td = 'style="padding:4px 8px;border-bottom:1px solid #1f2230;white-space:nowrap"';
  const corte = linhas.slice(0, max || 300);
  return `<div style="overflow-x:auto;border:1px solid #2a2d3e;border-radius:8px;background:#0f1117"><table style="border-collapse:collapse;font-size:0.8rem;color:#e2e8f0;width:100%;font-variant-numeric:tabular-nums">
    <tr>${cab.map(c => `<th ${th}>${c}</th>`).join('')}</tr>${corte.map(l => `<tr>${l.map(c => `<td ${td}>${c == null ? '' : c}</td>`).join('')}</tr>`).join('')}</table></div>
    ${linhas.length > corte.length ? `<div style="color:#94a3b8;font-size:0.76rem;margin-top:4px">Mostrando ${corte.length} de ${linhas.length} — o Excel leva todos.</div>` : ''}`;
}

// ---------------------------------------------------------------- render
function _afRender() {
  const box = document.getElementById('af-root');
  if (!box) return;
  const a = _ac.aba;
  if (a !== 'vivo') _afVivoParar();
  if (a === 'vivo') { box.innerHTML = '<div id="af-vivo"></div>'; _afVivoIniciar(); }
  else if (a === 'abast') box.innerHTML = _afAbast();
  else if (a === 'cartoes') box.innerHTML = _afCartoes();
  else if (a === 'bicos') box.innerHTML = _afBicosHtml();
  else if (a === 'eventos') box.innerHTML = _afEventos();
  else if (a === 'info') box.innerHTML = _afInfo();
  else if (a === 'manut') box.innerHTML = _afManut();
}

// ---------------------------------------------------------------- AO VIVO
function _afVivoParar() { if (_af.vivo.timer) { clearInterval(_af.vivo.timer); _af.vivo.timer = null; } _af.vivo.renovar = 0; }
async function _afVivoIniciar() {
  await _afApoio();
  if (_af.vivo.timer) { _afVivoDesenhar(); return; }
  const volta = async () => {
    if (_ac.aba !== 'vivo' || !document.getElementById('af-vivo')) { _afVivoParar(); return; }
    if (Date.now() > _af.vivo.renovar) {          // renova o pedido a cada 2 min (o núcleo só publica com alguém olhando)
      _af.vivo.renovar = Date.now() + 120000;
      try { await _afPedir('ao_vivo', { segundos: 180 }); _af.vivo.erro = null; } catch (e) { _af.vivo.erro = e.message; }
    }
    const { data, error } = await sb.from('oct_automacao_aovivo').select('dados,atualizado_em').eq('empresa_id', _ac.empresaId).maybeSingle();
    if (error && /relation|does not exist|PGRST205/i.test(error.message || '')) _af.vivo.erro = 'falta rodar o SQL-AUTOMACAO-FERRAMENTAS.sql no Supabase';
    _af.vivo.dados = data ? data.dados : null; _af.vivo.lidoEm = data ? data.atualizado_em : null;
    _afVivoDesenhar();
  };
  _af.vivo.timer = setInterval(volta, 2000);
  volta();
}
function _afVivoDesenhar() {
  const box = document.getElementById('af-vivo');
  if (!box) return;
  const idade = _af.vivo.lidoEm ? (Date.now() - new Date(_af.vivo.lidoEm).getTime()) / 1000 : null;
  const fresco = idade != null && idade < 12;
  const ab = {};
  (fresco && _af.vivo.dados && _af.vivo.dados.abastecendo || []).forEach(x => { ab[x.bico] = x; });
  const bicos = _afBicos().sort((a, b) => (ab[b.bico] ? 1 : 0) - (ab[a.bico] ? 1 : 0) || a.bico - b.bico);
  const cards = bicos.map(b => {
    const x = ab[b.bico];
    const comb = _AC_COMB[String(b.combustivel).padStart(2, '0')] || '';
    if (!x) return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:10px;opacity:.75"><div style="display:flex;justify-content:space-between"><b style="color:#cbd5e1">Bico ${b.bico}</b><span style="color:#64748b;font-size:0.74rem">${b.icom}${b.conector}${b.endereco}</span></div><div style="color:#94a3b8;font-size:0.78rem">${_acEsc(comb)}</div><div style="color:#64748b;font-size:0.8rem;margin-top:6px">${b.sit === 'F' ? 'bomba não responde' : 'em repouso'}</div></div>`;
    const valor = x.valor_cru / Math.pow(10, b.casas.total == null ? 2 : b.casas.total);
    const preco = _af.precos && _af.precos[b.bico];
    const nome = _afNomeCartao(x.cartao);
    return `<div style="background:#0b2a17;border:2px solid #22c55e;border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="color:#fff">Bico ${b.bico}</b><span style="color:#86efac;font-size:0.74rem">● abastecendo · ${b.icom}${b.conector}${b.endereco}</span></div>
      <div style="color:#bbf7d0;font-size:0.78rem">${_acEsc(comb)}${preco ? ' · R$ ' + _afR$(preco, 3) + '/L' : ''}</div>
      <div style="font-size:1.7rem;font-weight:800;color:#fff;margin-top:4px;font-variant-numeric:tabular-nums">R$ ${_afR$(valor)}</div>
      <div style="color:#bbf7d0;font-size:0.9rem">${preco ? '≈ ' + _afR$(valor / preco, 3) + ' L' : ''}</div>
      <div style="color:#e2e8f0;font-size:0.8rem;margin-top:4px">${x.cartao ? '💳 ' + _acEsc(nome || 'cartão sem cadastro') + ` <span style="color:#64748b">${x.cartao}</span>` : '<span style="color:#94a3b8">sem cartão</span>'}</div></div>`;
  }).join('');
  const n = Object.keys(ab).length;
  box.innerHTML = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:6px 0 10px">
      <b style="color:#e2e8f0">${n ? n + ' bico(s) abastecendo agora' : 'Nenhum abastecimento em andamento'}</b>
      <span style="font-size:0.78rem;color:${fresco ? '#86efac' : '#facc15'}">${_af.vivo.erro ? '❌ ' + _acEsc(_af.vivo.erro) : fresco ? '● ao vivo · atualizado há ' + Math.round(idade) + ' s' : '⏳ aguardando o posto começar a transmitir…'}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">${cards || '<p style="color:#94a3b8">Nenhum bico configurado.</p>'}</div>
    <p style="color:#64748b;font-size:0.76rem;margin-top:10px">O valor vem do concentrador a cada segundo; os litros são calculados pelo preço lido na bomba. A transmissão só acontece enquanto esta aba está aberta.</p>`;
}

// ---------------------------------------------------------------- ABASTECIMENTOS
function _afAbast() {
  const d = _af.dados.abast, r = d && d.cmd.resultado || {};
  _afUltima('abast', 'abastecimentos'); _afApoio().then(() => { if (!_af._apoioAbast) { _af._apoioAbast = true; _afRender(); } });
  let corpo = '';
  if (d) {
    const linhas = d.linhas.map(l => [l[0], _afData(l[8]), l[9], l[1], _acEsc(_AC_COMB[String(l[2]).padStart(2, '0')] || l[2]), _afR$(l[5], 3), _afR$(l[6], 3), _afR$(l[4]), _afR$(l[10]), _afR$(l[11]), l[7] + ' s', _acEsc(_afNomeCartao(l[12]) || l[12]), _acEsc(_afNomeCartao(l[13]) || l[13])]);
    corpo = `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:10px 0;font-size:0.9rem;color:#e2e8f0">
        <span><b>${d.linhas.length}</b> abastecimento(s) de ${_afData(r.de)} a ${_afData(r.ate)}</span>
        <span>Total <b>R$ ${_afR$(r.soma_total)}</b></span><span>Volume <b>${_afR$(r.soma_volume, 3)} L</b></span>
        <span style="color:#64748b;font-size:0.78rem">${r.na_memoria || '?'} registros na memória do concentrador</span>
        ${d.linhas.length ? `<button onclick="_afAbastExcel()" style="padding:7px 12px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#4ade80;cursor:pointer;font-weight:700">⬇ Excel</button>` : ''} ${_afLido(d)}
      </div>${_afTabela(['Registro', 'Data', 'Hora', 'Bico', 'Combustível', 'Litros', 'Preço', 'Total R$', 'Encerrante inicial', 'Encerrante final', 'Duração', 'Cartão frentista', 'Cartão cliente'], linhas)}`;
  }
  return `<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:6px">
      <label style="color:#ccc;font-size:0.84rem">De<br><input type="date" value="${_af.de}" onchange="_af.de=this.value" ${_afInp()}></label>
      <label style="color:#ccc;font-size:0.84rem">Até<br><input type="date" value="${_af.ate}" onchange="_af.ate=this.value" ${_afInp()}></label>
      ${_afBtn('Buscar na automação', '_afAbastBuscar()')}
    </div>
    <p style="color:#94a3b8;font-size:0.78rem;margin:6px 0 0">Lê a memória do concentrador (os últimos ~10 mil abastecimentos) e separa o período. Leva cerca de 1 minuto. Serve para auditar: é o que a automação registrou, independente do PDV.</p>
    ${_afAviso('abast', 'Lendo a memória do concentrador — cerca de 1 minuto…')}${corpo}`;
}
function _afAbastBuscar() {
  if (!_af.de || !_af.ate || _af.de > _af.ate) { _af.msg.abast = { erro: 'Confira o período.' }; _afRender(); return; }
  _afLer('abast', 'abastecimentos', { de: _af.de, ate: _af.ate }, 300000);
}
function _afAbastExcel() {
  const d = _af.dados.abast; if (!d) return;
  const r = d.cmd.resultado || {};
  _afExcel(`abastecimentos_automacao_${r.de}_a_${r.ate}`,
    ['Registro', 'Data', 'Hora', 'Bico', 'Cód. combustível', 'Combustível', 'Tanque', 'Litros', 'Preço', 'Total R$', 'Encerrante inicial', 'Encerrante final', 'Duração (s)', 'Cartão frentista', 'Frentista', 'Cartão cliente', 'Cliente'],
    d.linhas.map(l => [l[0], _afData(l[8]), l[9], l[1], l[2], _AC_COMB[String(l[2]).padStart(2, '0')] || '', l[3], l[5], l[6], l[4], l[10], l[11], l[7], l[12], _afNomeCartao(l[12]), l[13], _afNomeCartao(l[13])]));
}

// ---------------------------------------------------------------- CARTÕES
function _afCartoes() {
  const d = _af.dados.cartoes, lc = _af.dados.leituras;
  _afUltima('cartoes', 'cartoes'); _afApoio().then(() => { if (!_af._apoioCart) { _af._apoioCart = true; _afRender(); } });
  let lista = '';
  if (d) {
    const f = _af.filtro.trim().toUpperCase();
    const noConc = new Set(d.linhas.map(l => l[1]));
    const vezes = {}; d.linhas.forEach(l => { vezes[l[1]] = (vezes[l[1]] || 0) + 1; });
    const linhas = d.linhas.filter(l => !f || l[1].includes(f) || (_afNomeCartao(l[1]) || '').toUpperCase().includes(f))
      .map(l => [l[0], `<code>${l[1]}</code>${vezes[l[1]] > 1 ? ` <span style="color:#facc15;font-size:0.72rem" title="o mesmo cartão está gravado em ${vezes[l[1]]} posições; Excluir tira de todas">×${vezes[l[1]]}</span>` : ''}`, _acEsc(_AF_FUNCAO[l[2]] || l[3]) + ` <span style="color:#64748b">(${l[2]})</span>`, _afNomeCartao(l[1]) ? _acEsc(_afNomeCartao(l[1])) : '<span style="color:#64748b">— sem cadastro</span>',
        `<button onclick="_afCartaoExcluir('${l[1]}')" style="padding:3px 9px;border-radius:6px;border:1px solid #ef4444;background:transparent;color:#f87171;cursor:pointer">Excluir</button>`]);
    const fora = Object.keys(_af.pessoas || {}).filter(c => !noConc.has(c));
    lista = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0;font-size:0.88rem;color:#e2e8f0">
        <span><b>${Object.keys(vezes).length}</b> cartão(ões) gravado(s) no concentrador${Object.keys(vezes).length !== d.linhas.length ? ` <span style="color:#94a3b8">(${d.linhas.length} posições; há cartões repetidos)</span>` : ''}</span>
        <input placeholder="Filtrar por código ou nome" value="${_acEsc(_af.filtro)}" oninput="_af.filtro=this.value;_afRender();const i=document.getElementById('af-filtro');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}" id="af-filtro" ${_afInp('size="26"')}>
        <button onclick="_afCartoesExcel()" style="padding:7px 12px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#4ade80;cursor:pointer;font-weight:700">⬇ Excel</button> ${_afLido(d)}
      </div>
      ${fora.length ? `<div style="background:#2a1d0a;border:1px solid #b45309;border-radius:8px;padding:8px 10px;color:#fde68a;font-size:0.82rem;margin-bottom:8px">⚠ ${fora.length} cartão(ões) do cadastro deste posto <b>não estão gravados no concentrador</b>: ${fora.slice(0, 8).map(c => _acEsc(_afNomeCartao(c)) + ' <code>' + c + '</code>').join(' · ')}${fora.length > 8 ? ' …' : ''}</div>` : ''}
      ${_afTabela(['Posição', 'Código', 'Função', 'Pessoa no cadastro', ''], linhas, 500)}`;
  }
  let novos = '';
  if (lc) {
    const linhas = lc.linhas.map(l => [l[0].slice(8, 10) + '/' + l[0].slice(5, 7) + ' ' + l[0].slice(11), `<code>${l[1]}</code>`, l[2].length ? 'sensor dos bicos ' + l[2].join(', ') : '—',
      l[3] ? '<span style="color:#86efac">já gravado</span>' + (_afNomeCartao(l[1]) ? ' · ' + _acEsc(_afNomeCartao(l[1])) : '') : '<b style="color:#facc15">desconhecido</b>',
      l[3] ? '' : `<button onclick="_afCartaoGravar('${l[1]}','27')" style="padding:3px 9px;border-radius:6px;border:1px solid #22c55e;background:transparent;color:#86efac;cursor:pointer">Gravar como frentista</button> <button onclick="_afCartaoGravar('${l[1]}','04')" style="padding:3px 9px;border-radius:6px;border:1px solid #38bdf8;background:transparent;color:#7dd3fc;cursor:pointer">como cliente</button>`]);
    novos = `<div style="margin-top:8px">${_afLido(lc)}</div>${_afTabela(['Lido em', 'Código', 'Onde', 'Situação', ''], linhas, 100)}`;
  }
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">${_afBtn('Ler cartões gravados', "_afLer('cartoes','cartoes',null,90000)")}</div>
    ${_afAviso('cartoes', 'Lendo os cartões do concentrador…')}${_afAviso('cartao')}${lista}
    <h3 style="color:#e2e8f0;margin:18px 0 4px;font-size:1rem">Gravar cartão novo</h3>
    <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 8px">Passe o cartão novo em qualquer sensor do posto e clique em procurar: aparecem as últimas leituras, com data e hora. O cartão desconhecido ganha o botão de gravar.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">${_afBtn('Procurar cartão lido', "_afLer('leituras','leituras_cartao',{quantas:40},90000)", '#2563eb')}
      <label style="color:#ccc;font-size:0.8rem">ou digite o código (16 caracteres)<br><input id="af-cod" maxlength="16" ${_afInp('size="20"')}></label>
      <button onclick="_afCartaoGravar((document.getElementById('af-cod').value||'').trim().toUpperCase(),'27')" style="padding:8px 12px;border-radius:8px;border:1px solid #22c55e;background:#13151f;color:#86efac;cursor:pointer">Gravar como frentista</button>
    </div>${_afAviso('leituras', 'Lendo as últimas leituras de cartão…')}${novos}`;
}
function _afCartoesExcel() {
  const d = _af.dados.cartoes; if (!d) return;
  _afExcel('cartoes_identfid', ['Posição', 'Código', 'Cód. função', 'Função', 'Pessoa no cadastro'], d.linhas.map(l => [l[0], l[1], l[2], _AF_FUNCAO[l[2]] || l[3], _afNomeCartao(l[1])]));
}
async function _afCartaoAcao(tipo, parametros, espera) {
  if (_af.ocupado.cartao) return;
  _af.ocupado.cartao = true; _af.msg.cartao = null; _afRender();
  let res = null;
  try {
    const cmd = await _afEsperar(await _afPedir(tipo, parametros), 90000);
    res = cmd.resultado || {};
    if (cmd.status !== 'ok') throw new Error(cmd.erro || res.erro || 'o posto devolveu erro');
  } catch (e) { _af.msg.cartao = { erro: e.message || String(e) }; res = null; }
  _af.ocupado.cartao = false;
  return res;
}
async function _afCartaoExcluir(cod) {
  const nome = _afNomeCartao(cod);
  const posto = (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || '';
  if (!confirm(`EXCLUIR o cartão ${cod}${nome ? ' (' + nome + ')' : ''} do concentrador do ${posto}?\n\nEle deixa de liberar bomba${nome ? ' e sai do cadastro de ' + nome : ''}. Use para cartão perdido.`)) return;
  const r = await _afCartaoAcao('cartao_excluir', { codigo: cod, limpar_cadastro: true });
  if (r) {
    _af.msg.cartao = { ok: r.enviado === false ? `O cartão ${cod} não estava gravado no concentrador.` : `Cartão ${cod} excluído do concentrador${r.excluidas > 1 ? ' (estava gravado ' + r.excluidas + ' vezes; saíram todas)' : ''}${(r.desvinculado_de || []).length ? ' e tirado do cadastro de ' + r.desvinculado_de.join(', ') : ''}.` };
    _af.pessoas = null; delete _af.dados.leituras;
    await _afApoio(); _af.ocupado.cartoes = false;
    return _afLer('cartoes', 'cartoes', null, 90000);
  }
  _afRender();
}
async function _afCartaoGravar(cod, controle) {
  if (!/^[0-9A-F]{16}$/.test(cod || '')) { _af.msg.cartao = { erro: 'O código do cartão tem 16 caracteres (0–9 e A–F).' }; _afRender(); return; }
  const posto = (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || '';
  if (!confirm(`GRAVAR o cartão ${cod} no concentrador do ${posto} como ${controle === '27' ? 'FRENTISTA (libera a bomba)' : 'CLIENTE (não libera a bomba)'}?`)) return;
  const r = await _afCartaoAcao('cartao_gravar', { codigo: cod, controle });
  if (r) {
    _af.msg.cartao = { ok: r.enviado === false ? `O cartão ${cod} já estava gravado (posição ${r.posicao}).` : `Cartão ${cod} gravado na posição ${r.posicao}. Para ligar a uma pessoa, informe o cartão no cadastro dela.` };
    delete _af.dados.leituras;
    return _afLer('cartoes', 'cartoes', null, 90000);
  }
  _afRender();
}

// ---------------------------------------------------------------- BICOS / HEXA
function _afBicosHtml() {
  _afApoio().then(() => { if (!_af._apoioBico) { _af._apoioBico = true; _afRender(); } });
  const doConc = {};
  (((_ac.estado || {}).bicos_hexa) || []).forEach(b => { doConc[b.bico] = b.hexa; });
  const temConc = Object.keys(doConc).length > 0;
  const bicos = _afBicos();
  const linhas = bicos.map(b => {
    const h = temConc ? doConc[b.bico] : b.hexa;
    const difere = temConc && h && h !== b.hexa;
    return [`<b>${b.bico}</b>`, `<code style="font-size:0.95rem;color:#fdba74">${h || '?'}</code>${difere ? ` <span style="color:#f87171" title="pela posição seria ${b.hexa}">⚠</span>` : ''}`, b.icom, b.conector, b.endereco, 'ABCD'[b.pos], _acEsc(b.modelo || b.tipo), b.tanque || '—', _acEsc(_AC_COMB[String(b.combustivel).padStart(2, '0')] || b.combustivel), _af.precos && _af.precos[b.bico] != null ? _afR$(_af.precos[b.bico], 3) : '—'];
  });
  const livres = [];
  const ocup = new Set((((_ac.estado || {}).enderecos) || []).filter(e => e.configurado).map(e => `${e.icom}${e.conector}${e.endereco}`));
  ((_ac.estado || {}).icoms_em_uso || [1]).forEach(ic => 'ABCD'.split('').forEach(c => [1, 2, 3, 4].forEach(en => { if (!ocup.has(`${ic}${c}${en}`)) livres.push([`ICOM ${ic} · ${c}${en}`].concat([0, 1, 2, 3].map(p => `<code>${_afHexa(ic, c, en, p)}</code>`))); })));
  return `<p style="color:#94a3b8;font-size:0.8rem;margin:6px 0 8px">Código hexa de cada bico ${temConc ? '— <b style="color:#86efac">lido do concentrador</b>' : '— calculado pela posição (tabela da Companytec); este núcleo ainda não envia a leitura do concentrador'}. É esse código que vai no cadastro do bico. <span style="color:#64748b">lido ${_acHa(_ac.lidoEm)}</span></p>
    ${_afTabela(['Bico', 'Hexa', 'ICOM', 'Conector', 'Endereço', 'Posição', 'Modelo', 'Tanque', 'Combustível', 'Preço na bomba'], linhas, 400)}
    <div style="margin-top:8px"><button onclick="_afBicosExcel()" style="padding:7px 12px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#4ade80;cursor:pointer;font-weight:700">⬇ Excel</button></div>
    <h3 style="color:#e2e8f0;margin:18px 0 4px;font-size:1rem">Bomba nova: hexa dos endereços livres</h3>
    <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 8px">O hexa depende só de onde a bomba é ligada: ICOM, conector, endereço e a posição do bico (A a D).</p>
    ${_afTabela(['Endereço livre', 'Posição A', 'Posição B', 'Posição C', 'Posição D'], livres, 60)}`;
}
function _afBicosExcel() {
  const doConc = {};
  (((_ac.estado || {}).bicos_hexa) || []).forEach(b => { doConc[b.bico] = b.hexa; });
  _afExcel('bicos_hexa', ['Bico', 'Hexa', 'ICOM', 'Conector', 'Endereço', 'Posição', 'Modelo', 'Tanque', 'Combustível'],
    _afBicos().map(b => [b.bico, doConc[b.bico] || b.hexa, b.icom, b.conector, b.endereco, 'ABCD'[b.pos], b.modelo || b.tipo, b.tanque, _AC_COMB[String(b.combustivel).padStart(2, '0')] || b.combustivel]));
}

// ---------------------------------------------------------------- EVENTOS
function _afEventos() {
  const d = _af.dados.eventos;
  _afUltima('eventos', 'eventos');
  const linhas = d ? d.linhas.map(l => [l[0], _afData(l[2]), l[3], `<span title="${_acEsc(l[4])}">${_acEsc(_AF_EVENTO[l[4]] || l[4])}</span>`, `<code style="color:#94a3b8">${_acEsc(l[5])}</code>`]) : [];
  return `<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:6px">
      <label style="color:#ccc;font-size:0.84rem">Quantos<br><select onchange="_af.quantos=+this.value" ${_afInp()}>${[100, 300, 1000, 5000].map(q => `<option value="${q}" ${q === _af.quantos ? 'selected' : ''}>os ${q} mais recentes</option>`).join('')}</select></label>
      ${_afBtn('Ler eventos', "_afLer('eventos','eventos',{quantos:_af.quantos},120000)")}
      ${d && d.linhas.length ? `<button onclick="_afEventosExcel()" style="padding:9px 12px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#4ade80;cursor:pointer;font-weight:700">⬇ Excel</button>` : ''} ${_afLido(d)}
    </div>
    <p style="color:#94a3b8;font-size:0.78rem;margin:6px 0 0">O que o próprio concentrador registrou: troca de preço, mudança de configuração, bomba ou identificador que caiu e voltou, relógio acertado, erro de gravação.</p>
    ${_afAviso('eventos', 'Lendo os eventos do concentrador…')}${d ? '<div style="margin-top:10px">' + _afTabela(['Registro', 'Data', 'Hora', 'Evento', 'Detalhe'], linhas, 500) + '</div>' : ''}`;
}
function _afEventosExcel() {
  const d = _af.dados.eventos; if (!d) return;
  _afExcel('eventos_concentrador', ['Registro', 'Firmware', 'Data', 'Hora', 'Evento', 'Evento (original)', 'Detalhe'], d.linhas.map(l => [l[0], l[1], _afData(l[2]), l[3], _AF_EVENTO[l[4]] || l[4], l[4], l[5]]));
}

// ---------------------------------------------------------------- INFORMAÇÕES
function _afInfo() {
  const i = (_ac.estado || {}).info;
  if (!i) return '<p style="color:#94a3b8;margin-top:8px">O núcleo deste posto ainda não envia as informações do concentrador (precisa da atualização do núcleo).</p>';
  const lin = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 10px;border:1px solid #1f2230;border-radius:6px;background:#0f1117"><span style="color:#94a3b8">${k}</span><b style="color:#e2e8f0;text-align:right">${v == null || v === '' ? '—' : v}</b></div>`;
  const bloco = (t, ls) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:10px"><div style="text-align:center;color:#f97316;font-weight:700;margin-bottom:6px">${t}</div><div style="display:flex;flex-direction:column;gap:5px;font-size:0.84rem">${ls.join('')}</div></div>`;
  const sn = b => b ? '<span style="color:#22c55e">✔ habilitado</span>' : '<span style="color:#ef4444">✖ não</span>';
  const h = i.habilitacoes || {};
  const desvio = i.relogio && i.relogio_pc ? Math.round((new Date(i.relogio) - new Date(i.relogio_pc)) / 1000) : null;
  const con = (i.conexoes || []).map(c => `${c.ip} → porta ${c.porta_local}`).join('<br>');
  const relogio = bloco('Calendário da placa', [lin('Data e hora', i.relogio ? new Date(i.relogio).toLocaleString('pt-BR') : '—'), lin('Diferença para o PC do posto', desvio == null ? '—' : Math.abs(desvio) < 90 ? '<span style="color:#22c55e">em dia</span>' : `<span style="color:#f87171">${desvio > 0 ? 'adiantado' : 'atrasado'} ${Math.round(Math.abs(desvio) / 60)} min</span>`)]);
  // CONCEPT (Tijuco): outro equipamento, com o seu próprio comando de informações
  const c = i.concept;
  if (c && !c.erro_leitura) {
    return `<p style="color:#64748b;font-size:0.78rem;margin:6px 0 8px">lido do concentrador ${_acHa(_ac.lidoEm)} · atualiza a cada minuto</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">
      ${bloco('Automação', [lin('Tipo', 'CONCEPT'), lin('Versão', `${_acEsc(c.versao)} · ${_acEsc(c.versao_data)}`), lin('Nº de série da CPU', _acEsc(c.cpu_serie)), lin('Série do cartão SD', _acEsc(c.sd_serie)), lin('CNPJ gravado', _acEsc(c.cnpj)), lin('Protocolo emulado', i.protocolo)].concat((c.icoms || []).map(x => lin('ICOM ' + x.icom, `versão ${_acEsc(x.versao)} · firmware ${_acEsc(x.firmware)} · série ${_acEsc(x.serie)}`))))}
      ${bloco('Rede', [lin('IP', _acEsc(c.ip)), lin('MAC', _acEsc(c.mac)), lin('Endereço', c.ip_fixo ? 'IP fixo' : 'DHCP')])}
      ${bloco('Energia', [lin('Rede CA', _acEsc(c.rede_ca)), lin('Bateria de chumbo', _acEsc(c.bateria_chumbo)), lin('Bateria de lítio', _acEsc(c.bateria_litio)), lin('Polaridade da bateria', _acEsc(c.polaridade)), lin('Fonte', `tipo ${_acEsc(c.fonte)} · série ${_acEsc(c.fonte_serie)}`)])}
      ${relogio}
      ${bloco('Certificado', [lin('Nome', _acEsc(c.cert_nome) || '—'), lin('Automação bloqueada por certificado', c.bloqueada ? 'sim' : 'não')])}
    </div>`;
  }
  return `<p style="color:#64748b;font-size:0.78rem;margin:6px 0 8px">lido do concentrador ${_acHa(_ac.lidoEm)} · atualiza a cada minuto</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">
      ${bloco('Automação', [lin('Nº de série', i.serie), lin('Fabricado', i.fabricado), lin('Firmware', `${i.firmware || ''} ${i.firmware_tipo || ''} · ${i.firmware_data || ''}`), lin('Versão do boot', i.boot), lin('Memória', i.memoria), lin('Protocolo emulado', i.protocolo), lin('ICOM 1', (i.icoms || [])[0]), lin('ICOM 2', (i.icoms || [])[1]), lin('ICOM 3', (i.icoms || [])[2]), lin('Tipo', i.tipo), lin('Posições por bomba', i.posicoes)])}
      ${bloco('Rede', [lin('IP', i.ip), lin('MAC', i.mac), lin('Endereço', i.ip_fixo ? 'IP fixo' : 'DHCP'), lin('Portas disponíveis', i.portas_disponiveis), lin('Conexões agora', con)])}
      ${bloco('Energia', [lin('Rede CA', `${i.rede_ca_tensao || '?'} Vca · ${i.rede_ca || ''}`), lin('Fonte', 'Tipo ' + (i.fonte || '?')), lin('Bateria', i.bateria_status === 'ausente' ? 'ausente' : `${i.bateria || ''} · ${i.bateria_tensao || ''} V`), lin('Status da bateria', i.bateria_status)])}
      ${bloco('Calendário da placa', [lin('Data e hora', i.relogio ? new Date(i.relogio).toLocaleString('pt-BR') : '—'), lin('Diferença para o PC do posto', desvio == null ? '—' : Math.abs(desvio) < 90 ? '<span style="color:#22c55e">em dia</span>' : `<span style="color:#f87171">${desvio > 0 ? 'adiantado' : 'atrasado'} ${Math.round(Math.abs(desvio) / 60)} min</span>`), lin('Última data válida', i.ultima_data_valida)])}
      ${bloco('Habilitações', [lin('Líquido', sn(h.liquido)), lin('Identfid', sn(h.identfid)), lin('GNV', sn(h.gnv)), lin('Medidor de tanque', sn(h.medidor)), lin('Troca de preço por cartão', sn(i.preco_por_cartao))])}
      ${bloco('Certificado', [lin('Validade', i.cert_validade), lin('Logado agora', i.cert_logado ? 'sim (código ' + _acEsc(i.cert_codigo || '') + ')' : 'não'), lin('Travado', i.cert_travado ? 'sim' : 'não')])}
    </div>`;
}

// ---------------------------------------------------------------- MANUTENÇÃO
// Comandos capturados do HRS-Console e validados na bancada: trocar IP (1CA2 + &Ci), excluir todas
// as bombas (20+bico), apagar todos os cartões (17 5C 00) e sincronizar ponteiros (1CE0).
function _afPosto() { return (_ac.empresas.find(e => e.id === _ac.empresaId) || {}).nome_fantasia || 'posto'; }
function _afConfirmaNome(oQue) {
  const nome = _afPosto();
  const d = prompt(`${oQue}\n\nPara confirmar, digite o nome do posto: ${nome}`);
  if (d == null) return false;
  if (d.trim().toUpperCase() !== nome.trim().toUpperCase()) { alert('O nome não confere. Nada foi enviado.'); return false; }
  return true;
}
function _afManut() {
  const i = (_ac.estado || {}).info || {};
  const z = _af.zerar, nBombas = (((_ac.estado || {}).enderecos) || []).filter(e => e.configurado).length;
  const caixa = (titulo, corpo) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px;margin-top:10px"><div style="color:#f97316;font-weight:800;margin-bottom:6px">${titulo}</div>${corpo}</div>`;
  const chk = (k, txt, det) => `<label style="display:block;color:#e2e8f0;font-size:0.88rem;margin:6px 0;cursor:pointer"><input type="checkbox" ${z[k] ? 'checked' : ''} onchange="_af.zerar.${k}=this.checked"> <b>${txt}</b><br><span style="color:#94a3b8;font-size:0.78rem;margin-left:22px;display:inline-block">${det}</span></label>`;
  return `<p style="color:#fca5a5;font-size:0.82rem;margin:8px 0 0">⚠ Estas ações mexem no equipamento do posto e não têm "desfazer". Cada uma pede o nome do posto para confirmar.</p>
    ${i.tipo === 'CONCEPT' ? '<div style="background:#2a1d0a;border:1px solid #b45309;border-radius:8px;padding:8px 10px;color:#fde68a;font-size:0.82rem;margin-top:8px">Este posto usa um concentrador <b>Concept</b>. Trocar IP, apagar todos os cartões e descartar pendentes ainda não foram validadas no Concept (só no Horustech); num teste ele recusou o comando dessa família. Se recusar, nada é alterado.</div>' : ''}
    ${_afAviso('manut', 'Enviando ao posto e conferindo…')}
    ${caixa('Trocar o IP do concentrador', `
      <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 8px">IP atual: <b style="color:#e2e8f0">${_acEsc(i.ip || '?')}</b> (${i.ip_fixo ? 'fixo' : 'DHCP'}). A troca vale na hora: o concentrador sai do endereço antigo e passa a responder no novo. Se a faixa de rede for outra, ele só volta a ser visto quando o PC do posto estiver na mesma rede.</p>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <label style="color:#ccc;font-size:0.84rem">Novo IP<br><input value="${_acEsc(_af.novoIp)}" oninput="_af.novoIp=this.value" placeholder="192.168.1.91" ${_afInp('size="16"')}></label>
        <label style="color:#ccc;font-size:0.82rem;cursor:pointer"><input type="checkbox" ${_af.ipNucleo ? 'checked' : ''} onchange="_af.ipNucleo=this.checked"> apontar o núcleo do posto para o IP novo</label>
        ${_afBtn('Trocar IP', '_afTrocarIp()', '#dc2626')}
      </div>`)}
    ${caixa('Zerar para uma operação nova', `
      <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 4px">Para o concentrador começar limpo num posto novo. Marque o que zerar:</p>
      ${chk('bombas', `Excluir todas as bombas (${nBombas} configurada(s))`, 'Apaga a configuração de todos os endereços. Os bicos param de abastecer pela automação até serem cadastrados de novo.')}
      ${chk('cartoes', 'Apagar todos os cartões Identfid', 'Nenhum cartão libera bomba até ser gravado de novo. Precisa de certificado logado no concentrador — agora: ' + (i.cert_logado == null ? 'não informado' : i.cert_logado ? '<b style="color:#86efac">logado</b>' : '<b style="color:#f87171">não logado</b>') + '.')}
      ${chk('pendentes', 'Descartar abastecimentos e cartões pendentes de leitura', 'O que ainda não foi lido deixa de ser entregue — para o núcleo e para qualquer outro sistema ligado no concentrador (TecnoX). Num posto em operação isso é venda que não chega ao PDV.')}
      <div style="margin-top:8px">${_afBtn('Zerar o que está marcado', '_afZerar()', '#dc2626')}</div>
      <p style="color:#64748b;font-size:0.76rem;margin:8px 0 0">Os abastecimentos antigos e os eventos continuam na memória do concentrador (ele não tem comando para apagá-los); só deixam de estar pendentes.</p>`)}`;
}
async function _afManutPedir(tipo, parametros, limiteMs, textoOk) {
  if (_af.ocupado.manut) return;
  _af.ocupado.manut = true; _af.msg.manut = null; _afRender();
  try {
    const cmd = await _afEsperar(await _afPedir(tipo, parametros), limiteMs);
    const r = cmd.resultado || {};
    if (cmd.status !== 'ok') throw new Error(cmd.erro || r.erro || 'o posto devolveu erro');
    _af.msg.manut = { ok: textoOk(r) };
  } catch (e) { _af.msg.manut = { erro: e.message || String(e) }; }
  _af.ocupado.manut = false;
  await _acCarregar();
}
function _afTrocarIp() {
  const ip = (_af.novoIp || '').trim();
  const p = ip.split('.');
  if (p.length !== 4 || !p.every(x => /^\d{1,3}$/.test(x) && +x <= 255)) { _af.msg.manut = { erro: 'IP inválido. Exemplo: 192.168.1.91' }; _afRender(); return; }
  const atual = ((_ac.estado || {}).info || {}).ip || '?';
  if (!_afConfirmaNome(`TROCAR o IP do concentrador do ${_afPosto()} de ${atual} para ${ip}?\n\nSe o IP estiver errado o concentrador fica inalcançável e só volta com alguém no local.`)) return;
  _afManutPedir('trocar_ip', { ip, atualizar_nucleo: _af.ipNucleo, confirmo: true }, 120000,
    r => r.enviado === false ? 'O concentrador já estava nesse IP.' : `IP trocado: ${r.ip_anterior} → ${r.ip_novo}.${r.nucleo_atualizado ? ' O núcleo do posto já aponta para o IP novo.' : ''}${r.aviso ? ' ' + r.aviso : ''}`);
}
function _afZerar() {
  const itens = Object.keys(_af.zerar).filter(k => _af.zerar[k]);
  if (!itens.length) { _af.msg.manut = { erro: 'Marque pelo menos um item.' }; _afRender(); return; }
  const nomes = { bombas: 'EXCLUIR TODAS AS BOMBAS', cartoes: 'APAGAR TODOS OS CARTÕES', pendentes: 'DESCARTAR OS PENDENTES' };
  if (!_afConfirmaNome(`No concentrador do ${_afPosto()}:\n\n• ${itens.map(k => nomes[k]).join('\n• ')}\n\nNão tem como desfazer.`)) return;
  _afManutPedir('zerar_concentrador', { itens, confirmo: true }, 300000, r => {
    const p = r.passos || {};
    const t = [];
    if (p.bombas) t.push(`${(p.bombas.excluidas || []).length} bomba(s) excluída(s)`);
    if (p.cartoes) t.push(`${p.cartoes.antes} cartão(ões) apagado(s)`);
    if (p.pendentes) t.push('pendentes descartados');
    _af.zerar = { bombas: false, cartoes: false, pendentes: false };
    return 'Feito: ' + t.join(', ') + '.';
  });
}
