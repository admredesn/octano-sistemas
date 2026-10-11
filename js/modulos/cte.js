// ============================================================
// FRETES (CT-e) — aba da Manifestação
// ------------------------------------------------------------
// Pedido do Ronan (11/10/2026): buscar os CT-e na SEFAZ para
//   1. saber o custo do frete (R$ por carga e por litro);
//   2. conferir as transportadoras;
//   3. ter o CT-e guardado para compor o SPED (D100/D190).
//
// Quem busca e grava é o servidor fiscal (sefaz/cte_auto.py), junto do robô
// das notas: 1 consulta a cada ~2 h por posto, em oct_cte_recebidos. Esta tela
// só lê, liga cada CT-e às notas de compra que ele transportou (a chave da
// NF-e vem dentro do CT-e) e marca a conferência.
//
// Usa da Manifestação: _manifEmpresaId, os filtros do topo (datas e busca),
// manifMsg e _manifSalvarArquivoXml. As contas (cteLigar/cteResumo) são
// funções puras — testadas fora do navegador.
// ============================================================

let _cte = { linhas: [], notas: {}, semCte: [], controle: null, erro: null, transp: '', soPosto: false, carregando: false };

const _CTE_COLS = 'id,nsu,chave_cte,situacao,desacordo,modelo,serie,numero,emissao,tp_cte,cfop,emit_cnpj,emit_nome,emit_uf,' +
  'tomador_tipo,tomador_cnpj,tomador_nome,rem_cnpj,rem_nome,dest_cnpj,dest_nome,papel,sou_tomador,mun_ini_nome,uf_ini,mun_fim_nome,uf_fim,' +
  'valor_prestacao,icms_cst,icms_bc,icms_aliq,icms_valor,valor_carga,produto_pred,litros_carga,chaves_nfe,chave_cte_ref,placa,motorista,' +
  'conferido,conferido_por,conferido_em,conferencia_obs';

function _cteEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _cteMoney(v) { return v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _cteNum(v, casas) { return v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas ?? 0, maximumFractionDigits: casas ?? 0 }); }
function _cteData(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
function _cteIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _cteCnpj(c) { c = String(c || '').replace(/\D/g, ''); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c; }

// período: os campos de data do topo da Manifestação; em branco = últimos 60 dias
function _ctePeriodo() {
  const ini = document.getElementById('manif-dt-ini')?.value || '';
  const fim = document.getElementById('manif-dt-fim')?.value || '';
  const hoje = new Date();
  return { ini: ini || _cteIso(new Date(hoje.getTime() - 60 * 86400e3)), fim: fim || _cteIso(hoje) };
}

// ---------- contas (puras) ----------
// Lê de uma NF-e de compra o que interessa ao frete: litros de combustível
// (itens com o grupo <comb>), produtos e quem paga o frete segundo a nota
// (modFrete: 0 emitente/CIF · 1 destinatário/FOB · 2 terceiros · 9 sem frete).
function cteLerNota(xml) {
  const out = { litros: 0, produtos: [], combustivel: false, modFrete: null, transportadora: null };
  if (!xml) return out;
  const pega = (txt, tag) => { const m = txt.match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>')); return m ? m[1] : ''; };
  const dets = xml.match(/<det[\s>][\s\S]*?<\/det>/g) || [];
  dets.forEach(d => {
    const q = Number(pega(d, 'qCom') || 0), nome = pega(d, 'xProd'), comb = /<comb>/.test(d);
    if (comb) { out.combustivel = true; out.litros += q; }
    out.produtos.push({ nome, qtd: q, combustivel: comb });
  });
  out.litros = Math.round(out.litros * 1000) / 1000;
  const mf = pega(xml, 'modFrete'); out.modFrete = mf === '' ? null : mf;
  const tr = xml.match(/<transporta>[\s\S]*?<\/transporta>/);
  out.transportadora = tr ? (pega(tr[0], 'xNome') || null) : null;
  return out;
}

// Liga cada CT-e às suas notas e calcula litros e R$/litro.
// notas = { chave: { numero, emitente, emissao, litros, combustivel, produtos, modFrete } }
function cteLigar(linhas, notas) {
  return (linhas || []).map(l => {
    const ns = (l.chaves_nfe || []).map(k => notas[k]).filter(Boolean);
    const litrosNotas = ns.reduce((s, n) => s + Number(n.litros || 0), 0);
    const litros = litrosNotas > 0 ? litrosNotas : (Number(l.litros_carga || 0) > 0 ? Number(l.litros_carga) : null);
    const valor = Number(l.valor_prestacao || 0);
    return Object.assign({}, l, {
      _notas: ns,
      _notasFaltando: (l.chaves_nfe || []).filter(k => !notas[k]),
      _litros: litros,
      _litrosDe: litrosNotas > 0 ? 'nota' : (litros ? 'cte' : null),
      // CT-e complementar (tp_cte 1) acrescenta valor a um transporte já feito: não tem R$/litro próprio
      _porLitro: (litros && valor > 0 && l.tp_cte !== '1') ? Math.round(valor / litros * 10000) / 10000 : null,
    });
  });
}

// Litros de um conjunto de CT-e SEM contar a mesma nota duas vezes (o CT-e
// complementar e o substituto citam a nota do CT-e original).
function _cteLitrosDistintos(lista) {
  const vistas = new Set(); let tot = 0;
  lista.forEach(l => {
    if ((l._notas || []).length) l._notas.forEach(n => { const k = n.chave || n.numero; if (!vistas.has(k)) { vistas.add(k); tot += Number(n.litros || 0); } });
    else if (l._litros) tot += l._litros;
  });
  return Math.round(tot * 1000) / 1000;
}

function _cteMediana(v) {
  const a = v.slice().sort((x, y) => x - y); if (!a.length) return null;
  const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Totais do período e por transportadora. Cancelado não soma. Marca _fora nos
// CT-e cujo R$/litro passa de 25% acima da mediana da própria transportadora
// (com pelo menos 3 CT-e para ter mediana que preste).
function cteResumo(ligados) {
  const validos = (ligados || []).filter(l => l.situacao !== 'cancelado');
  const porT = {};
  validos.forEach(l => {
    const k = l.emit_cnpj || l.emit_nome || '?';
    const t = porT[k] = porT[k] || { cnpj: l.emit_cnpj, nome: l.emit_nome, n: 0, total: 0, posto: 0, litros: 0, totalComLitros: 0, porLitro: [], _ctes: [] };
    const v = Number(l.valor_prestacao || 0);
    t.n++; t.total += v; if (l.sou_tomador) t.posto += v;
    if (l._litros) t.totalComLitros += v;
    if (l._porLitro != null) t.porLitro.push(l._porLitro);
    t._ctes.push(l);
  });
  Object.values(porT).forEach(t => { t.litros = _cteLitrosDistintos(t._ctes); delete t._ctes; });
  const transp = Object.values(porT).map(t => Object.assign(t, {
    total: Math.round(t.total * 100) / 100, posto: Math.round(t.posto * 100) / 100,
    medio: t.litros > 0 ? Math.round(t.totalComLitros / t.litros * 10000) / 10000 : null,
    mediana: _cteMediana(t.porLitro), min: t.porLitro.length ? Math.min(...t.porLitro) : null, max: t.porLitro.length ? Math.max(...t.porLitro) : null,
  })).sort((a, b) => b.total - a.total);
  const medDe = {}; transp.forEach(t => { if (t.porLitro.length >= 3) medDe[t.cnpj || t.nome || '?'] = t.mediana; });
  validos.forEach(l => {
    const med = medDe[l.emit_cnpj || l.emit_nome || '?'];
    l._fora = !!(med && l._porLitro != null && l._porLitro > med * 1.25);
  });
  const soma = f => Math.round(validos.reduce((s, l) => s + f(l), 0) * 100) / 100;
  const litros = _cteLitrosDistintos(validos);
  const totalComLitros = validos.reduce((s, l) => s + (l._litros ? Number(l.valor_prestacao || 0) : 0), 0);
  return {
    transp,
    n: validos.length, cancelados: (ligados || []).length - validos.length,
    total: soma(l => Number(l.valor_prestacao || 0)),
    posto: soma(l => l.sou_tomador ? Number(l.valor_prestacao || 0) : 0),
    terceiros: soma(l => l.sou_tomador ? 0 : Number(l.valor_prestacao || 0)),
    icmsPosto: soma(l => l.sou_tomador ? Number(l.icms_valor || 0) : 0),
    litros: Math.round(litros * 1000) / 1000,
    medio: litros > 0 ? Math.round(totalComLitros / litros * 10000) / 10000 : null,
    semNota: validos.filter(l => (l.chaves_nfe || []).length && !l._notas.length).length,
    fora: validos.filter(l => l._fora).length,
  };
}

// ---------- dados ----------
async function _cteCarregar() {
  const eid = _manifEmpresaId, per = _ctePeriodo();
  _cte.erro = null;
  const [rC, rK] = await Promise.all([
    sb.from('oct_cte_recebidos').select(_CTE_COLS).eq('empresa_id', eid).eq('tipo', 'cte')
      .gte('emissao', per.ini).lte('emissao', per.fim + 'T23:59:59').order('emissao', { ascending: false }).limit(2000),
    sb.from('oct_cte_controle').select('*').eq('empresa_id', eid).maybeSingle(),
  ]);
  if (rC.error) { _cte.erro = rC.error.message || String(rC.error); _cte.linhas = []; return; }
  _cte.linhas = rC.data || [];
  _cte.controle = (rK && rK.data) || null;

  // notas de compra: as do período (para achar carga SEM CT-e) + as citadas nos CT-e que ficaram fora dele
  const menos = d => _cteIso(new Date(new Date(d + 'T12:00:00').getTime() - 10 * 86400e3));
  const colsN = 'chave_nfe,numero,emissao,emitente,emit_cnpj,valor,status,xml';
  const { data: nPer } = await sb.from('oct_nfe_manifestadas').select(colsN).eq('empresa_id', eid).eq('tipo', 'nfe_completa')
    .gte('emissao', menos(per.ini)).lte('emissao', per.fim).limit(1500);
  const notas = {};
  const guarda = n => {
    if (!n.chave_nfe || notas[n.chave_nfe]) return;
    notas[n.chave_nfe] = Object.assign({ chave: n.chave_nfe, numero: n.numero, emissao: n.emissao, emitente: n.emitente, emit_cnpj: n.emit_cnpj, valor: n.valor, status: n.status }, cteLerNota(n.xml));
  };
  (nPer || []).forEach(guarda);
  const faltam = [...new Set(_cte.linhas.flatMap(l => l.chaves_nfe || []))].filter(k => !notas[k]);
  for (let i = 0; i < faltam.length; i += 40) {
    const { data } = await sb.from('oct_nfe_manifestadas').select(colsN).eq('empresa_id', eid).in('chave_nfe', faltam.slice(i, i + 40));
    (data || []).forEach(guarda);
  }
  _cte.notas = notas;

  // cargas de combustível do período sem nenhum CT-e (em qualquer data) que cite a nota
  const comb = Object.values(notas).filter(n => n.combustivel && n.status !== 'cancelada' && (n.emissao || '') >= per.ini && (n.emissao || '') <= per.fim);
  const citadas = new Set(_cte.linhas.filter(l => l.situacao !== 'cancelado').flatMap(l => l.chaves_nfe || []));
  let orfas = comb.filter(n => !citadas.has(n.chave));
  for (let i = 0; i < orfas.length; i += 40) {
    const lote = orfas.slice(i, i + 40).map(n => n.chave);
    const { data } = await sb.from('oct_cte_recebidos').select('chaves_nfe,situacao').eq('empresa_id', eid).eq('tipo', 'cte').overlaps('chaves_nfe', lote);
    (data || []).filter(c => c.situacao !== 'cancelado').forEach(c => (c.chaves_nfe || []).forEach(k => citadas.add(k)));
  }
  _cte.semCte = comb.filter(n => !citadas.has(n.chave)).sort((a, b) => String(b.emissao).localeCompare(String(a.emissao)));
}

// chamada pela Manifestação ao abrir a aba (o auto-refresh de 15 s passa silencioso=true: aqui não recarrega)
async function cteRenderAba(silencioso) {
  if (silencioso || _cte.carregando) return;
  const area = document.getElementById('manif-lista-area');
  if (!area) return;
  _cte.carregando = true;
  try { await _cteCarregar(); } catch (e) { _cte.erro = e.message || String(e); } finally { _cte.carregando = false; }
  cteRender();
}

function _cteFiltradas(ligados) {
  const busca = (document.getElementById('manif-busca')?.value || '').toLowerCase().trim();
  return ligados.filter(l => {
    if (_cte.transp && (l.emit_cnpj || l.emit_nome) !== _cte.transp) return false;
    if (_cte.soPosto && !l.sou_tomador) return false;
    if (busca) {
      const blob = [l.numero, l.emit_nome, l.emit_cnpj, l.chave_cte, l.tomador_nome, l.placa, l.motorista, l.mun_ini_nome, l.mun_fim_nome,
        ...(l._notas || []).map(n => n.numero + ' ' + n.emitente)].join(' ').toLowerCase();
      if (!blob.includes(busca)) return false;
    }
    return true;
  });
}

const _CTE_FRETE_NOTA = { '0': 'por conta do fornecedor (CIF)', '1': 'por conta do posto (FOB)', '2': 'por conta de terceiros', '3': 'transporte próprio do fornecedor', '4': 'transporte próprio do posto', '9': 'sem frete' };

function cteRender() {
  const area = document.getElementById('manif-lista-area');
  const acoes = document.getElementById('manif-acoes-area');
  if (!area) return;
  if (acoes) acoes.innerHTML = '';
  if (_cte.erro) {
    const falta = /oct_cte_/.test(_cte.erro) || /does not exist|schema cache/i.test(_cte.erro);
    area.innerHTML = `<div style="padding:24px;color:#fbbf24">${falta
      ? 'A tabela dos CT-e ainda não existe. Rode o <b>SQL-CTE-RECEBIDOS.sql</b> no Supabase — o robô começa a buscar sozinho em seguida.'
      : 'Erro ao ler os CT-e: ' + _cteEsc(_cte.erro)}</div>`;
    return;
  }
  const per = _ctePeriodo();
  const todos = cteLigar(_cte.linhas, _cte.notas);
  const resumoGeral = cteResumo(todos);              // marca _fora com a mediana do período inteiro
  const lista = _cteFiltradas(todos);
  const r = (_cte.transp || _cte.soPosto || (document.getElementById('manif-busca')?.value || '').trim()) ? cteResumo(lista) : resumoGeral;
  const qtd = document.getElementById('manif-qtd'); if (qtd) qtd.textContent = lista.length;

  const k = _cte.controle;
  const quando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const bloqueado = k && k.bloqueado_ate && new Date(k.bloqueado_ate) > new Date();
  const statusTxt = !k ? 'Aguardando a primeira consulta do robô (ele passa a cada ~10 min).'
    : `Última consulta à SEFAZ: <b>${quando(k.ultima_consulta_em) || '—'}</b> · ${_cteEsc(k.ultimo_status || '')}` +
      (bloqueado ? ` · <span style="color:#fbbf24">SEFAZ pediu pausa até ${quando(k.bloqueado_ate)}</span>` : '');

  const card = (rot, val, sub, cor) => `<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:8px 14px;min-width:150px">
    <div style="color:#7c8698;font-size:0.66rem;text-transform:uppercase;letter-spacing:.3px">${rot}</div>
    <div style="color:${cor || '#e5e7eb'};font-size:1.05rem;font-weight:700;font-variant-numeric:tabular-nums">${val}</div>
    ${sub ? `<div style="color:#667;font-size:0.68rem">${sub}</div>` : ''}</div>`;
  const transpOpts = resumoGeral.transp.map(t => `<option value="${_cteEsc(t.cnpj || t.nome)}" ${_cte.transp === (t.cnpj || t.nome) ? 'selected' : ''}>${_cteEsc(t.nome || t.cnpj)} (${t.n})</option>`).join('');

  const linhasT = r.transp.map(t => `<tr>
      <td>${_cteEsc(t.nome || '—')}<br><span style="color:#667;font-size:0.68rem">${_cteCnpj(t.cnpj)}</span></td>
      <td style="text-align:right">${t.n}</td>
      <td style="text-align:right">${_cteMoney(t.total)}</td>
      <td style="text-align:right">${t.posto ? _cteMoney(t.posto) : '—'}</td>
      <td style="text-align:right">${t.litros ? _cteNum(t.litros) + ' L' : '—'}</td>
      <td style="text-align:right;font-weight:600">${t.medio != null ? 'R$ ' + _cteNum(t.medio, 4) : '—'}</td>
      <td style="text-align:right;color:#8892a0">${t.min != null ? _cteNum(t.min, 4) + ' – ' + _cteNum(t.max, 4) : '—'}</td></tr>`).join('');

  const linhas = lista.map(l => {
    const canc = l.situacao === 'cancelado';
    const notas = l._notas.length
      ? l._notas.map(n => `NF ${_cteEsc(n.numero || '?')} · ${_cteEsc(String(n.emitente || '').slice(0, 26))} · ${n.litros ? _cteNum(n.litros) + ' L' : 's/ litros'}`).join('<br>')
      : ((l.chaves_nfe || []).length ? `<span style="color:#fbbf24" title="${_cteEsc((l.chaves_nfe || []).join(' '))}">${l.chaves_nfe.length} nota(s) fora do sistema</span>` : '<span style="color:#667">sem nota citada</span>');
    const paga = l.sou_tomador ? '<b style="color:#7ee2a0">o posto</b>' : _cteEsc(String(l.tomador_nome || '—').slice(0, 28));
    const tipo = l.tp_cte === '1' ? ' <span class="cte-tag">complementar</span>' : l.tp_cte === '3' ? ' <span class="cte-tag">substituto</span>' : '';
    const avisos = (canc ? '<span class="cte-tag" style="background:#3a1414;color:#f87171">cancelado</span> ' : '')
      + (l.desacordo ? '<span class="cte-tag" style="background:#3a2a10;color:#fbbf24">em desacordo</span> ' : '')
      + (l._fora ? '<span class="cte-tag" style="background:#3a2a10;color:#fbbf24" title="R$/litro mais de 25% acima do normal desta transportadora">acima do normal</span> ' : '');
    return `<tr style="${canc ? 'opacity:.5;text-decoration:line-through' : ''}">
      <td>${_cteData(l.emissao)}</td>
      <td>${_cteEsc(l.numero || '—')}<span style="color:#667">/${_cteEsc(l.serie || '')}</span>${tipo}</td>
      <td title="${_cteCnpj(l.emit_cnpj)}">${_cteEsc(String(l.emit_nome || '—').slice(0, 30))}${l.placa ? `<br><span style="color:#667;font-size:0.68rem">${_cteEsc(l.placa)}${l.motorista ? ' · ' + _cteEsc(l.motorista) : ''}</span>` : ''}</td>
      <td>${paga}</td>
      <td style="color:#aab">${_cteEsc(l.mun_ini_nome || '')}/${_cteEsc(l.uf_ini || '')} → ${_cteEsc(l.mun_fim_nome || '')}/${_cteEsc(l.uf_fim || '')}</td>
      <td style="font-size:0.74rem">${notas}</td>
      <td style="text-align:right">${l._litros ? _cteNum(l._litros) + ' L' + (l._litrosDe === 'cte' ? '<span title="litros informados no CT-e (a nota não está no sistema)" style="color:#667">*</span>' : '') : '—'}</td>
      <td style="text-align:right;font-weight:600">${_cteMoney(l.valor_prestacao)}</td>
      <td style="text-align:right;color:${l._fora ? '#fbbf24' : '#e5e7eb'}">${l._porLitro != null ? _cteNum(l._porLitro, 4) : '—'}</td>
      <td style="text-align:right;color:#8892a0" title="CST ${_cteEsc(l.icms_cst || '—')} · base ${_cteNum(l.icms_bc, 2)} · alíquota ${_cteNum(l.icms_aliq, 2)}%">${l.icms_valor ? _cteNum(l.icms_valor, 2) : '—'}</td>
      <td>${avisos}${l.sou_tomador && !canc ? '<span class="cte-tag" style="background:#10283a;color:#7ab8f0" title="O posto é o tomador: este CT-e entra no SPED como aquisição de frete (D100)">SPED</span>' : ''}</td>
      <td style="white-space:nowrap">
        <label title="${l.conferido ? 'Conferido por ' + _cteEsc(l.conferido_por || '?') + ' em ' + (quando(l.conferido_em) || '') : 'Marcar como conferido'}" style="cursor:pointer;color:${l.conferido ? '#7ee2a0' : '#667'}">
          <input type="checkbox" ${l.conferido ? 'checked' : ''} onchange="cteConferir('${l.id}', this.checked)" style="accent-color:#16a34a;vertical-align:middle"> conf.</label>
        <button class="manif-btn-linha" style="margin-left:6px" onclick="cteBaixarXml('${l.id}')">XML</button>
      </td></tr>`;
  }).join('');

  const semCte = _cte.semCte;
  area.innerHTML = `
    <style>.cte-tag{font-size:0.62rem;padding:1px 6px;border-radius:4px;background:#1f2937;color:#94a3b8;white-space:nowrap}
      .cte-sec{padding:10px 14px 4px;color:#f97316;font-weight:700;font-size:0.8rem}
      .cte-tab td,.cte-tab th{white-space:normal}</style>
    <div style="padding:10px 14px;border-bottom:1px solid #2a2d3e;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:0.78rem;color:#9aa">
      <span>${statusTxt}</span><span style="flex:1"></span>
      <button class="manif-btn-cinza" onclick="cteConsultarAgora()" title="Pede ao servidor para consultar a SEFAZ agora (ele respeita o intervalo de 2 h entre consultas)">🔄 Consultar agora</button>
      <button class="manif-btn-cinza" onclick="cteExportarCsv()">⬇ Planilha (CSV)</button>
    </div>
    <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap">
      ${card('Fretes no período', _cteMoney(r.total), r.n + ' CT-e' + (r.cancelados ? ' · ' + r.cancelados + ' cancelado(s)' : ''))}
      ${card('Pago pelo posto', _cteMoney(r.posto), 'o posto é o tomador' + (r.icmsPosto ? ' · ICMS ' + _cteMoney(r.icmsPosto) : ''), '#7ee2a0')}
      ${card('Por conta de terceiros', _cteMoney(r.terceiros), 'fornecedor ou outro paga')}
      ${card('Litros transportados', r.litros ? _cteNum(r.litros) + ' L' : '—', 'pelas notas ligadas')}
      ${card('Frete médio por litro', r.medio != null ? 'R$ ' + _cteNum(r.medio, 4) : '—', 'frete ÷ litros', '#fdba74')}
      ${card('Para olhar', (r.fora + r.semNota + semCte.length) || '0', `${r.fora} acima do normal · ${r.semNota} sem nota · ${semCte.length} carga(s) sem CT-e`, (r.fora + r.semNota + semCte.length) ? '#fbbf24' : '#7ee2a0')}
    </div>
    <div style="padding:0 14px 6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:0.78rem;color:#9aa">
      <span>Período: <b>${_cteData(per.ini)}</b> a <b>${_cteData(per.fim)}</b> (datas do topo)</span>
      <select class="manif-input" style="width:260px" onchange="_cte.transp=this.value;cteRender()"><option value="">Todas as transportadoras</option>${transpOpts}</select>
      <label style="cursor:pointer"><input type="checkbox" ${_cte.soPosto ? 'checked' : ''} onchange="_cte.soPosto=this.checked;cteRender()"> só os que o posto paga</label>
      <button class="manif-btn-cinza" onclick="cteRenderAba()">↻ Atualizar</button>
    </div>
    <div class="cte-sec">Por transportadora</div>
    <div class="manif-tabela-scroll" style="max-height:26vh"><table class="manif-tabela cte-tab"><thead><tr>
      <th>Transportadora</th><th style="text-align:right">CT-e</th><th style="text-align:right">Total de frete</th><th style="text-align:right">Pago pelo posto</th>
      <th style="text-align:right">Litros</th><th style="text-align:right">Média R$/L</th><th style="text-align:right">Menor – maior R$/L</th></tr></thead>
      <tbody>${linhasT || '<tr><td colspan="7" class="manif-vazio">Nenhum CT-e no período.</td></tr>'}</tbody></table></div>
    <div class="cte-sec">CT-e do período (${lista.length})</div>
    <div class="manif-tabela-scroll" style="max-height:48vh"><table class="manif-tabela cte-tab"><thead><tr>
      <th>Emissão</th><th>Nº/série</th><th>Transportadora</th><th>Quem paga</th><th>Percurso</th><th>Notas transportadas</th>
      <th style="text-align:right">Litros</th><th style="text-align:right">Frete</th><th style="text-align:right">R$/L</th><th style="text-align:right">ICMS</th><th></th><th></th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="12" class="manif-vazio">Nenhum CT-e encontrado neste período' + (k ? '.' : ' — o robô ainda não fez a primeira consulta.') + '</td></tr>'}</tbody></table></div>
    ${semCte.length ? `<div class="cte-sec" style="color:#fbbf24">Cargas de combustível sem CT-e (${semCte.length})</div>
      <p style="padding:0 14px 6px;color:#8892a0;font-size:0.74rem">Notas de compra do período que nenhum CT-e recebido cita. Costuma ser frete por conta do fornecedor em que a transportadora não pôs o posto no CT-e — ou CT-e ainda não emitido.</p>
      <div class="manif-tabela-scroll" style="max-height:24vh"><table class="manif-tabela cte-tab"><thead><tr><th>Emissão</th><th>NF</th><th>Fornecedor</th><th style="text-align:right">Litros</th><th style="text-align:right">Valor</th><th>Frete, segundo a nota</th><th>Transportadora na nota</th></tr></thead><tbody>
      ${semCte.map(n => `<tr><td>${_cteData(n.emissao)}</td><td>${_cteEsc(n.numero || '—')}</td><td>${_cteEsc(String(n.emitente || '').slice(0, 40))}</td>
        <td style="text-align:right">${_cteNum(n.litros)} L</td><td style="text-align:right">${_cteMoney(n.valor)}</td>
        <td>${_cteEsc(_CTE_FRETE_NOTA[n.modFrete] || '—')}</td><td>${_cteEsc(n.transportadora || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  window._cteVisiveis = lista;
}

// atalho da busca do sistema (Ctrl+K › "frete"): abre a Manifestação já nesta aba
function cteAbrir() {
  _manifAbaAtual = 'cte';
  if (document.getElementById('manif-lista-area')) manifTrocarAba('cte');
}

// ---------- ações ----------
async function cteConsultarAgora() {
  if (!podeOuAvisa('manifestacao.consultar')) return;
  manifMsg('Pedindo a consulta ao servidor…', 'info');
  try {
    const resp = await fetch(`${SEFAZ_URL}/cte/consultar/${_manifEmpresaId}`, { method: 'POST' });
    const d = await resp.json();
    if (d.ok) manifMsg(`Consulta feita: +${d.cte || 0} CT-e, +${d.evento || 0} evento(s). ${d.status || ''}`, 'ok');
    else manifMsg('Não consultou agora: ' + (d.motivo || 'sem resposta') + '. A SEFAZ só aceita uma consulta a cada ~2 h por posto; o robô faz sozinho.', 'info');
  } catch (e) { manifMsg('Servidor fiscal não respondeu: ' + (e.message || e), 'erro'); }
  await cteRenderAba();
}

async function cteConferir(id, marcado) {
  if (!podeOuAvisa('manifestacao.incluir_nota')) { cteRender(); return; }
  let quem = null;
  try { const s = await getSession(); quem = (s && s.user && (s.user.email || s.user.id)) || null; } catch (e) { /* segue sem autor */ }
  const patch = { conferido: !!marcado, conferido_por: marcado ? quem : null, conferido_em: marcado ? new Date().toISOString() : null };
  const { error } = await sb.from('oct_cte_recebidos').update(patch).eq('id', id);
  if (error) { manifMsg('Não salvou a conferência: ' + error.message, 'erro'); cteRender(); return; }
  const l = _cte.linhas.find(x => x.id === id); if (l) Object.assign(l, patch);
  cteRender();
}

async function cteBaixarXml(id) {
  const { data, error } = await sb.from('oct_cte_recebidos').select('xml,chave_cte,numero').eq('id', id).single();
  if (error || !data || !data.xml) { manifMsg('XML não encontrado.', 'erro'); return; }
  _manifSalvarArquivoXml(data.xml, `CTe-${data.chave_cte || data.numero || id}.xml`);
}

function cteExportarCsv() {
  const lista = window._cteVisiveis || [];
  if (!lista.length) { manifMsg('Nada para exportar.', 'info'); return; }
  const br = v => v == null ? '' : String(Number(v)).replace('.', ',');
  const cab = ['Emissao', 'Numero', 'Serie', 'Chave CT-e', 'Situacao', 'Transportadora', 'CNPJ transportadora', 'Quem paga', 'CNPJ tomador', 'Posto paga', 'Origem', 'Destino',
    'Notas', 'Fornecedor', 'Litros', 'Frete', 'R$ por litro', 'CFOP', 'CST ICMS', 'Base ICMS', 'Aliquota', 'ICMS', 'Placa', 'Motorista', 'Conferido'];
  const linhas = lista.map(l => [_cteData(l.emissao), l.numero, l.serie, l.chave_cte, l.situacao, l.emit_nome, l.emit_cnpj, l.tomador_nome, l.tomador_cnpj, l.sou_tomador ? 'sim' : 'nao',
    (l.mun_ini_nome || '') + '/' + (l.uf_ini || ''), (l.mun_fim_nome || '') + '/' + (l.uf_fim || ''),
    (l._notas || []).map(n => n.numero).join(' + '), [...new Set((l._notas || []).map(n => n.emitente))].join(' + '),
    br(l._litros), br(l.valor_prestacao), br(l._porLitro), l.cfop, l.icms_cst, br(l.icms_bc), br(l.icms_aliq), br(l.icms_valor), l.placa, l.motorista, l.conferido ? 'sim' : 'nao']);
  const csv = [cab].concat(linhas).map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const per = _ctePeriodo();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `fretes-cte-${per.ini}-a-${per.fim}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
