// ============================================================
//  RELATÓRIO: DESCARGAS — o que entrou no tanque × a nota
// ------------------------------------------------------------
//  A descarga vem da SONDA (oct_medicoes), não da tabela oct_nfe_descarga:
//  aquela tabela só existe desde 21/07, olha para frente e DUPLICA (cada
//  reavaliação grava outro início — 703 linhas para 90 descargas). Aqui a
//  subida de volume é recalculada a partir da leitura bruta.
//
//  COMO DETECTA (validado na conferência de agosto/2026 nos 3 postos):
//  - mediana a cada 15 min por tanque: uma leitura zerada ou um pulo isolado
//    não viram descarga (o etanol do Tijuco tem centenas de zeros);
//  - subida >= 400 L em até 3 h, a partir da última leitura antes dela. Se a
//    sonda ficou sem ler, a descarga cai dentro do vão (AC, 06/08) e sai
//    marcada;
//  - volume parado por 8 h com produto (ou 24 h vazio) antes da subida =
//    sonda TRAVADA: os litros medidos não são confiáveis (Florestal 21-22/08).
//
//  CASAMENTO COM A NOTA (SEFAZ, oct_nfe_manifestadas): 1 a 3 itens do mesmo
//  combustível, emitidos até 8 dias antes, cuja soma bate com a subida
//  (tolerância 4,5% ou 250 L; 35% se a sonda falhou). Nota cancelada ou
//  devolvida pelo fornecedor não casa. Descarga que sobra é conferida contra
//  as notas dos OUTROS postos no mesmo dia — foi assim que apareceu a carga
//  faturada para a AC e descarregada no Florestal (04/09).
//
//  Hora: medido_em é UTC real; a tela mostra a hora do posto (navegador).
// ============================================================

const _DESC_15MIN = 15 * 60 * 1000;
const _DESC_H = 3600 * 1000;

function _descFamNota(xProd, anp) {
  const t = String(xProd || '').toUpperCase(), a = String(anp || '');
  if (a.startsWith('3201') || (t.includes('GAS') && !t.includes('DIES'))) return (a === '320102002' || t.includes('ADIT')) ? 'GAS_ADT' : 'GASOLINA';
  if (a.startsWith('8101') || t.includes('ETAN') || t.includes('ALCOOL')) return 'ETANOL';
  if (a.startsWith('8201') || t.includes('DIES')) return t.includes('S500') ? 'DIESEL_S500' : t.includes('S10') ? 'DIESEL_S10' : 'DIESEL';
  return null;
}

function _descFamTanque(c) {
  c = String(c || '').toUpperCase();
  if (c.includes('ADT') || c.includes('ADIT')) return 'GAS_ADT';
  if (c.includes('GAS')) return 'GASOLINA';
  if (c.includes('ETAN')) return 'ETANOL';
  if (c.includes('S500')) return 'DIESEL_S500';
  if (c.includes('S10')) return 'DIESEL_S10';
  return 'DIESEL';
}

// true = mesmo produto; 'tipo' = diesel S10 x S500 ou comum x aditivada; false = não serve
function _descCompat(fn, ft) {
  if (!fn || !ft) return false;
  if (fn === ft) return true;
  if (fn === 'DIESEL' && ft.startsWith('DIESEL')) return true;
  if (fn.startsWith('DIESEL') && ft.startsWith('DIESEL')) return 'tipo';
  if ((fn === 'GASOLINA' && ft === 'GAS_ADT') || (fn === 'GAS_ADT' && ft === 'GASOLINA')) return 'tipo';
  return false;
}

function _descMediana(a) {
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// medicoes: [{tanque_numero, volume, medido_em}] -> descargas [{tq, ini, fim, litros, de, para, obs, incerta}]
// (função pura: testada fora do navegador contra a conferência de agosto)
function _descDetectar(medicoes, tanques) {
  const combDe = {};
  (tanques || []).forEach(t => { combDe[t.numero] = t.combustivel; });
  const porTq = {};
  medicoes.forEach(m => {
    const v = Number(m.volume);
    if (!(v > 0) || m.tanque_numero == null) return;
    const ms = Date.parse(m.medido_em);
    if (isNaN(ms)) return;
    const k = Math.floor(ms / _DESC_15MIN) * _DESC_15MIN;
    const b = (porTq[m.tanque_numero] = porTq[m.tanque_numero] || {});
    (b[k] = b[k] || []).push(v);
  });
  const out = [];
  Object.keys(porTq).forEach(tq => {
    const ser = Object.keys(porTq[tq]).map(Number).sort((a, b) => a - b).map(k => ({ t: k, v: _descMediana(porTq[tq][k]) }));
    let i = 0;
    while (i < ser.length - 1) {
      const k0 = ser[i].t, v0 = ser[i].v;
      let topo = i;
      for (let j = i + 1; j < ser.length; j++) {
        if (ser[j].t - ser[j - 1].t <= 30 * 60000 && ser[j].t - k0 > 3 * _DESC_H) break;
        if (ser[j].t - k0 > 30 * _DESC_H) break;
        if (ser[j].v > ser[topo].v) topo = j;
        if (j > i + 1 && ser[j].t - ser[j - 1].t <= 30 * 60000 && ser[j].t - ser[i + 1].t > 3 * _DESC_H) break;
      }
      if (ser[topo].v - v0 >= 400 && ser[i + 1].v - v0 >= 150) {
        let gap = 0;
        for (let j = i; j < topo; j++) gap = Math.max(gap, ser[j + 1].t - ser[j].t);
        gap /= _DESC_H;
        const ant = ser.slice(Math.max(0, i - 96), i + 1).map(x => x.v);
        const parado = nb => { const a = ant.slice(-nb); return a.length >= nb && Math.max(...a) - Math.min(...a) <= 3; };
        const travada = (v0 >= 400 && parado(32)) || (v0 < 400 && parado(96));
        const obs = [];
        if (gap > 1.5) obs.push('descarga dentro de ' + gap.toFixed(1).replace('.', ',') + ' h sem leitura da sonda');
        if (travada) obs.push('sonda travada antes (volume parado em ' + Math.round(v0) + ' L): litros incertos');
        out.push({
          tq: Number(tq), comb: combDe[tq] || '', fam: _descFamTanque(combDe[tq]),
          ini: k0, fim: ser[topo].t, litros: Math.round(ser[topo].v - v0), de: Math.round(v0), para: Math.round(ser[topo].v),
          obs: obs.join('; '), incerta: obs.length > 0, notas: [], dif: null, trocaTipo: false, outroPosto: null,
        });
        i = topo + 1;
      } else i++;
    }
  });
  return out.sort((a, b) => a.ini - b.ini || a.tq - b.tq);
}

function _descCombinacoes(arr, r, cb) {
  const idx = [];
  const rec = (s) => {
    if (idx.length === r) { cb(idx.map(i => arr[i])); return; }
    for (let i = s; i < arr.length; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  };
  rec(0);
}

// itens: [{fam, q, emissaoMs, usado:null, nf:{...}}] -> preenche descarga.notas (função pura)
function _descCasar(descargas, itens) {
  descargas.forEach(e => {
    if (e.notas.length) return;
    const cand = itens.filter(x => !x.usado && _descCompat(x.fam, e.fam)
      && x.emissaoMs <= e.fim + 4 * _DESC_H && x.emissaoMs >= e.ini - 8 * 24 * _DESC_H);
    let melhor = null;
    for (let r = 1; r <= 3 && !melhor; r++) {
      _descCombinacoes(cand, r, comb => {
        const q = comb.reduce((s, x) => s + x.q, 0);
        const dif = e.litros - q;
        const tol = e.incerta ? Math.max(350, 0.35 * q) : Math.max(250, 0.045 * q);
        if (Math.abs(dif) > tol) return;
        const troca = comb.some(x => _descCompat(x.fam, e.fam) !== true) ? 1 : 0;
        const score = [troca, r, Math.abs(dif) / q, -Math.min(...comb.map(x => x.emissaoMs))];
        if (!melhor || _descMenor(score, melhor.score)) melhor = { score, comb, dif, troca };
      });
    }
    if (melhor) {
      melhor.comb.forEach(x => { x.usado = e; });
      e.notas = melhor.comb; e.dif = Math.round(melhor.dif); e.trocaTipo = !!melhor.troca;
    }
  });
}

function _descMenor(a, b) {
  for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; }
  return false;
}

// ---- leitura ----
function _descDia(ms) { return new Date(ms).toLocaleDateString('sv-SE'); }   // AAAA-MM-DD no fuso do navegador
function _descUtc(diaLocal) { return new Date(diaLocal + 'T00:00:00').toISOString(); }
function _descSomaDias(dia, n) { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }

// sonda de um posto, dia a dia em paralelo (um mês = ~170 mil leituras; em
// série levaria minutos). Cada dia paginado de 1000 em 1000, ORDENADO — página
// sem order no PostgREST pode repetir/pular linhas.
async function _descLerSonda(eid, de, ate, progresso) {
  const dias = [];
  for (let d = de; d <= ate; d = _descSomaDias(d, 1)) dias.push(d);
  const todas = [];
  let feitos = 0, erro = null;
  const fila = dias.slice();
  const trabalhador = async () => {
    while (fila.length && !erro) {
      const d = fila.shift();
      const a = _descUtc(d), b = _descUtc(_descSomaDias(d, 1));
      for (let off = 0; off < 60000; off += 1000) {
        const { data, error } = await sb.from('oct_medicoes').select('tanque_numero,volume,medido_em')
          .eq('empresa_id', eid).gte('medido_em', a).lt('medido_em', b)
          .order('medido_em').order('tanque_numero').range(off, off + 999);
        if (error) { erro = error; return; }
        todas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      feitos++;
      if (progresso) progresso(feitos, dias.length);
    }
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(trabalhador));
  if (erro) throw new Error('sonda: ' + erro.message);
  return todas;
}

// notas de compra da SEFAZ com itens de combustível (XML completo) + resumos
async function _descLerNotas(eid, de, ate) {
  const linhas = [];
  for (let off = 0; off < 20000; off += 200) {
    const { data, error } = await sb.from('oct_nfe_manifestadas')
      .select('id,numero,emissao,emitente,emit_cnpj,valor,chave_nfe,tipo,xml')
      .eq('empresa_id', eid).gte('emissao', de).lte('emissao', ate)
      .in('tipo', ['nfe_completa', 'resumo']).order('id').range(off, off + 199);
    if (error) throw new Error('notas: ' + error.message);
    linhas.push(...(data || []));
    if (!data || data.length < 200) break;
  }
  const porChave = {};
  const parser = new DOMParser();
  linhas.forEach(x => {
    if (!x.chave_nfe || !x.xml) return;
    let doc;
    try { doc = parser.parseFromString(x.xml, 'application/xml'); } catch (e) { return; }
    const tx = tag => { const el = doc.getElementsByTagName(tag)[0]; return el ? el.textContent : null; };
    const n = {
      chave: x.chave_nfe, numero: x.numero || String(Number(x.chave_nfe.slice(25, 34))), emitente: x.emitente || tx('xNome') || '',
      cnpj: x.emit_cnpj || '', valor: Number(tx('vNF') || x.valor || 0), dhEmi: tx('dhEmi') || (x.emissao + 'T12:00:00-03:00'),
      tpNF: tx('tpNF'), cSit: tx('cSitNFe'), resumo: x.tipo === 'resumo', itens: [], ref: [],
    };
    if (!n.resumo) {
      Array.from(doc.getElementsByTagName('det')).forEach(det => {
        const g = tag => { const el = det.getElementsByTagName(tag)[0]; return el ? el.textContent : null; };
        n.itens.push({ xProd: g('xProd'), q: Number(g('qCom') || 0), u: String(g('uCom') || '').toUpperCase(), anp: g('cProdANP') });
      });
      n.ref = Array.from(doc.getElementsByTagName('refNFe')).map(e => e.textContent);
    }
    const velho = porChave[n.chave];
    if (!velho || (velho.resumo && !n.resumo)) porChave[n.chave] = n;
  });
  const notas = Object.values(porChave);
  const devolvidas = {};
  notas.forEach(n => { if (n.tpNF === '0') n.ref.forEach(ch => { devolvidas[ch] = n; }); });
  notas.forEach(n => { if (devolvidas[n.chave]) n.devolvidaPor = devolvidas[n.chave]; });
  return notas;
}

function _descItens(notas, posto) {
  const itens = [];
  notas.forEach(n => {
    n.posto = posto;
    n.emissaoMs = Date.parse(n.dhEmi);
    if (n.tpNF !== '1' || n.cSit === '3' || n.devolvidaPor) return;
    n.comb = [];
    n.itens.forEach(it => {
      if (!['L', 'LT', 'LTS', 'LITRO'].includes(it.u) || it.q < 400) return;
      const fam = _descFamNota(it.xProd, it.anp);
      if (!fam) return;
      const x = { fam, q: it.q, prod: it.xProd, emissaoMs: n.emissaoMs, usado: null, nf: n };
      n.comb.push(x); itens.push(x);
    });
  });
  return itens;
}

const _DESC_NOMEFAM = { GASOLINA: 'Gasolina', GAS_ADT: 'Gasolina aditivada', ETANOL: 'Etanol', DIESEL_S10: 'Diesel S10', DIESEL_S500: 'Diesel S500', DIESEL: 'Diesel' };

// ---- tela ----
async function relatorioDescargas() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  const hoje = _relDataHoje();
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('🚛 Descargas')}
    <p style="color:#8a8f98;margin:-6px 0 14px;font-size:.82rem;max-width:900px">Cada subida de volume medida pela sonda, casada com a nota de compra da SEFAZ. A hora é a do posto. Descarga sem nota, nota sem descarga e sonda travada aparecem marcadas.</p>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
      <label style="color:#9fb3c8;font-size:.8rem">De<br><input type="date" id="desc-ini" value="${_relDataInicioMes()}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Até<br><input type="date" id="desc-fim" value="${hoje}" max="${hoje}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Mostrar<br>
        <select id="desc-filtro" style="margin-top:3px" onchange="_descRender()">
          <option value="tudo">Todas as descargas</option>
          <option value="problema">Só com problema</option>
        </select></label>
      <button onclick="relatorioDescargasCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
      <button onclick="relatorioDescargasXLSX()" style="padding:8px 14px;border-radius:7px;border:1px solid #16a34a;background:transparent;color:#16a34a;cursor:pointer;font-weight:600">⬇ Excel</button>
      <button onclick="relatorioDescargasCSV()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;cursor:pointer;font-weight:600">⬇ CSV</button>
      <button onclick="relatorioDescargasImprimir()" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;cursor:pointer;font-weight:600">🖨 Imprimir</button>
    </div>
    <div id="desc-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioDescargasCarregar();
}

async function relatorioDescargasCarregar() {
  const box = document.getElementById('desc-corpo');
  if (!box) return;
  const eid = _relEid();
  if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
  const hoje = _relDataHoje();
  const ini = document.getElementById('desc-ini')?.value || _relDataInicioMes();
  let fim = document.getElementById('desc-fim')?.value || hoje;
  if (fim > hoje) fim = hoje;
  if (ini > fim) { box.innerHTML = '<p style="color:#f87171">A data inicial é depois da final.</p>'; return; }
  const nDias = Math.round((Date.parse(fim) - Date.parse(ini)) / 86400000) + 1;
  if (nDias > 62) { box.innerHTML = '<p style="color:#f87171">Escolha no máximo 62 dias (a sonda grava uma leitura por minuto por tanque).</p>'; return; }
  const msg = t => { box.innerHTML = `<p style="color:#888">${t}</p>`; };
  const token = (window._descToken = (window._descToken || 0) + 1);

  try {
    // a janela lida é MAIOR que a pedida: descarga do dia 1 pode ser de nota
    // emitida dias antes, e nota do último dia pode descarregar no dia seguinte
    const sondaDe = _descSomaDias(ini, -3), sondaAte = _descSomaDias(fim, 2) > hoje ? hoje : _descSomaDias(fim, 2);
    msg('Lendo tanques e notas…');
    const [tq, notas, emp] = await Promise.all([
      sb.from('oct_tanques').select('numero,combustivel,capacidade').eq('empresa_id', eid).then(r => r.data || []),
      _descLerNotas(eid, _descSomaDias(ini, -8), _descSomaDias(fim, 2)),
      sb.from('oct_empresas').select('id,nome,nome_fantasia,ativo').then(r => r.data || []),
    ]);
    const med = await _descLerSonda(eid, sondaDe, sondaAte, (f, t) => {
      if (token === window._descToken) msg(`Lendo a sonda: dia ${f} de ${t}…`);
    });
    if (token !== window._descToken) return;   // outra busca começou
    msg('Calculando as descargas…');
    const descargas = _descDetectar(med, tq);
    const itens = _descItens(notas, eid);
    _descCasar(descargas, itens);

    // sobra de descarga sem nota: confere as notas dos OUTROS postos no mesmo dia.
    // Só vale item que não descarregou no próprio posto (lê a sonda dele perto da data).
    const nomeEmp = {};
    emp.forEach(e => { nomeEmp[e.id] = e.nome_fantasia || e.nome; });
    const semNota = descargas.filter(e => !e.notas.length && _descDia(e.ini) >= ini && _descDia(e.ini) <= fim);
    if (semNota.length) {
      const outros = emp.filter(e => e.ativo && e.id !== eid);
      const d0 = _descDia(Math.min(...semNota.map(e => e.ini))), d1 = _descDia(Math.max(...semNota.map(e => e.fim)));
      for (const o of outros) {
        msg(`Conferindo notas de ${nomeEmp[o.id]} para as descargas sem nota…`);
        const [nO, tqO] = await Promise.all([
          _descLerNotas(o.id, _descSomaDias(d0, -8), _descSomaDias(d1, 1)),
          sb.from('oct_tanques').select('numero,combustivel').eq('empresa_id', o.id).then(r => r.data || []),
        ]);
        const itO = _descItens(nO, o.id);
        if (!itO.length) continue;
        const aHoje = _descSomaDias(d1, 2) > hoje ? hoje : _descSomaDias(d1, 2);
        const medO = await _descLerSonda(o.id, _descSomaDias(d0, -8), aHoje);
        _descCasar(_descDetectar(medO, tqO), itO);                       // o que descarregou lá, fica lá
        const livres = itO.filter(x => !x.usado && x.emissaoMs >= Date.parse(d0 + 'T00:00:00') - 24 * _DESC_H);
        _descCasar(semNota.filter(e => !e.notas.length), livres);
        semNota.forEach(e => { if (e.notas.length && !e.outroPosto) e.outroPosto = nomeEmp[e.notas[0].nf.posto] || 'outro posto'; });
      }
    }
    if (token !== window._descToken) return;

    const noPeriodo = ms => { const d = _descDia(ms); return d >= ini && d <= fim; };
    window._descDados = {
      ini, fim, eid, empresa: nomeEmp[eid] || '',
      descargas: descargas.filter(e => noPeriodo(e.ini)),
      notasSemDescarga: notas.filter(n => n.tpNF === '1' && n.cSit !== '3' && !n.devolvidaPor && noPeriodo(n.emissaoMs)
        && (n.resumo || (n.comb && n.comb.length)) && !(n.comb || []).some(x => x.usado)),
      canceladas: notas.filter(n => noPeriodo(n.emissaoMs) && (n.cSit === '3' || n.tpNF === '0' || n.devolvidaPor)),
    };
    _descRender();
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171">Não consegui montar o relatório: ${e.message}</p>`;
  }
}

function _descFmtL(v) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function _descDataHora(ms) { const d = new Date(ms); return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function _descHora(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function _descEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// situação de uma descarga: [rótulo, cor, problema?]
function _descSituacao(e) {
  if (!e.notas.length) return ['Sem nota', '#f87171', true];
  if (e.outroPosto) return ['Nota de ' + e.outroPosto, '#f87171', true];
  if (e.trocaTipo) return ['Tipo trocado', '#fbbf24', true];
  if (e.incerta) return ['Sonda falhou', '#fbbf24', true];
  const pct = e.notas.reduce((s, x) => s + x.q, 0);
  if (Math.abs(e.dif) > 0.03 * pct) return ['Diferença alta', '#fbbf24', true];
  return ['Casada', '#4ade80', false];
}

function _descRender() {
  const box = document.getElementById('desc-corpo');
  const D = window._descDados;
  if (!box || !D) return;
  const soProblema = document.getElementById('desc-filtro')?.value === 'problema';
  const lista = D.descargas.filter(e => !soProblema || _descSituacao(e)[2]);

  const litros = D.descargas.reduce((s, e) => s + e.litros, 0);
  const litrosNota = D.descargas.reduce((s, e) => s + e.notas.reduce((a, x) => a + x.q, 0), 0);
  const semNota = D.descargas.filter(e => !e.notas.length || e.outroPosto);
  const card = (t, v, cor) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
      <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${t}</div>
      <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px">${v}</div></div>`;

  // por combustível
  const porComb = {};
  D.descargas.forEach(e => {
    const k = e.comb || '?';
    const p = (porComb[k] = porComb[k] || { n: 0, l: 0, ln: 0 });
    p.n++; p.l += e.litros; p.ln += e.notas.reduce((a, x) => a + x.q, 0);
  });
  const chips = Object.entries(porComb).map(([k, p]) =>
    `<span style="display:inline-block;background:#0f1a2a;border:1px solid #2a4a6a;border-radius:20px;padding:4px 10px;margin:3px;color:#cbd5e1;font-size:.78rem">${_descEsc(k)}: <strong style="color:#5dca9a">${p.n} · ${_descFmtL(p.l)} L</strong></span>`).join('');

  const linhas = lista.map(e => {
    const [rot, cor] = _descSituacao(e);
    const nfs = e.notas.length ? e.notas.map(x => `<div><b style="color:#e6e6e6">NF ${_descEsc(x.nf.numero)}</b> <span style="color:#8a8f98">${_descEsc(String(x.nf.emitente).slice(0, 22))} · emit ${_descDataHora(x.nf.emissaoMs)}</span> · ${_descFmtL(x.q)} L${e.outroPosto ? ` <span style="color:#f87171">(${_descEsc(e.outroPosto)})</span>` : ''}</div>`).join('') : '<span style="color:#f87171">nenhuma nota</span>';
    const nfL = e.notas.reduce((a, x) => a + x.q, 0);
    return `<tr style="border-bottom:1px solid #1e2233;vertical-align:top">
      <td style="padding:7px 8px;white-space:nowrap;color:#cbd5e1">${_descDataHora(e.ini)}<span style="color:#6b7280">–${_descHora(e.fim)}</span></td>
      <td style="padding:7px 8px;white-space:nowrap">TQ ${e.tq} · <span style="color:#9fb3c8">${_descEsc(e.comb)}</span></td>
      <td style="padding:7px 8px;text-align:right;white-space:nowrap;color:#8a8f98">${_descFmtL(e.de)} → ${_descFmtL(e.para)}</td>
      <td style="padding:7px 8px;text-align:right;color:#5dca9a;font-weight:700">${_descFmtL(e.litros)}</td>
      <td style="padding:7px 8px;font-size:.78rem">${nfs}</td>
      <td style="padding:7px 8px;text-align:right">${e.notas.length ? _descFmtL(nfL) : '—'}</td>
      <td style="padding:7px 8px;text-align:right;color:${e.notas.length && Math.abs(e.dif) > 0.03 * nfL ? '#fbbf24' : '#cbd5e1'}">${e.notas.length ? (e.dif > 0 ? '+' : '') + _descFmtL(e.dif) : '—'}</td>
      <td style="padding:7px 8px"><span style="color:${cor};font-weight:600;white-space:nowrap">${_descEsc(rot)}</span>${e.obs ? `<div style="color:#fbbf24;font-size:.72rem;margin-top:2px">${_descEsc(e.obs)}</div>` : ''}${e.trocaTipo ? '<div style="color:#fbbf24;font-size:.72rem;margin-top:2px">produto da nota é de outro tipo que o tanque</div>' : ''}</td>
    </tr>`;
  }).join('');

  const semDesc = D.notasSemDescarga.map(n => `<tr style="border-bottom:1px solid #1e2233">
      <td style="padding:6px 8px;white-space:nowrap">${_descDataHora(n.emissaoMs)}</td>
      <td style="padding:6px 8px"><b>NF ${_descEsc(n.numero)}</b> · ${_descEsc(n.emitente)}</td>
      <td style="padding:6px 8px">${n.resumo ? '<span style="color:#fbbf24">só resumo na SEFAZ (sem XML)</span>' : n.comb.map(x => _descEsc(_DESC_NOMEFAM[x.fam] || x.fam) + ' ' + _descFmtL(x.q) + ' L').join(' + ')}</td>
      <td style="padding:6px 8px;text-align:right">${_relBRL(n.valor)}</td></tr>`).join('');
  const canc = D.canceladas.map(n => `<span style="display:inline-block;background:#1a1420;border:1px solid #3a2a3e;border-radius:6px;padding:3px 8px;margin:3px;color:#9ca3af;font-size:.76rem">NF ${_descEsc(n.numero)} · ${n.cSit === '3' ? 'cancelada' : n.tpNF === '0' ? 'devolução do fornecedor' : 'devolvida pela NF ' + _descEsc(n.devolvidaPor.numero)} · ${_relBRL(n.valor)}</span>`).join('');

  box.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${card('Descargas', D.descargas.length)}
      ${card('Litros medidos', _descFmtL(litros) + ' L', '#5dca9a')}
      ${card('Litros nas notas casadas', _descFmtL(litrosNota) + ' L')}
      ${card('Sem nota do posto', semNota.length, semNota.length ? '#f87171' : '#4ade80')}
      ${card('Notas sem descarga', D.notasSemDescarga.length, D.notasSemDescarga.length ? '#fbbf24' : '#4ade80')}
    </div>
    <div style="margin-bottom:12px">${chips}</div>
    <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:62vh">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">
          <th style="padding:8px">Data / hora</th><th style="padding:8px">Tanque</th>
          <th style="padding:8px;text-align:right">Antes → depois</th><th style="padding:8px;text-align:right">Litros medidos</th>
          <th style="padding:8px">Nota(s)</th><th style="padding:8px;text-align:right">Litros nota</th>
          <th style="padding:8px;text-align:right">Diferença</th><th style="padding:8px">Situação</th>
        </tr></thead>
        <tbody>${linhas || '<tr><td colspan="8" style="padding:14px;color:#888">Nenhuma descarga no período.</td></tr>'}</tbody>
      </table>
    </div>
    <h3 style="color:#fbbf24;margin:20px 0 6px;font-size:.95rem">Notas de combustível sem descarga no posto</h3>
    <p style="color:#8a8f98;font-size:.78rem;margin:0 0 8px">Emitidas no período e sem subida de volume que as explique. Pode ser carga descarregada em outro posto, nota substituída, ou descarga que ainda vai acontecer.</p>
    ${semDesc ? `<div style="overflow:auto;border:1px solid #1e2233;border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:.8rem"><tbody>${semDesc}</tbody></table></div>` : '<p style="color:#4ade80;font-size:.82rem">Nenhuma.</p>'}
    ${canc ? `<h3 style="color:#9ca3af;margin:18px 0 6px;font-size:.9rem">Canceladas e devoluções (não entram na conta)</h3><div>${canc}</div>` : ''}`;
}

// ---- exportação ----
function _descMatriz() {
  const D = window._descDados;
  if (!D) return [];
  const m = [['Data', 'Início', 'Fim', 'Tanque', 'Combustível', 'Volume antes', 'Volume depois', 'Litros medidos', 'NF-e', 'Fornecedor', 'Emissão NF', 'Litros nota', 'Diferença (L)', 'Situação', 'Observação']];
  D.descargas.forEach(e => {
    const nfL = e.notas.reduce((a, x) => a + x.q, 0);
    m.push([
      new Date(e.ini).toLocaleDateString('pt-BR'), _descHora(e.ini), _descHora(e.fim), e.tq, e.comb, e.de, e.para, e.litros,
      e.notas.map(x => x.nf.numero).join(' + '), e.notas.length ? e.notas[0].nf.emitente : '',
      e.notas.map(x => new Date(x.nf.emissaoMs).toLocaleString('pt-BR')).join(' + '),
      e.notas.length ? nfL : '', e.notas.length ? e.dif : '', _descSituacao(e)[0],
      [e.obs, e.trocaTipo ? 'produto da nota é de outro tipo que o tanque' : ''].filter(Boolean).join('; '),
    ]);
  });
  return m;
}

function relatorioDescargasCSV() {
  const m = _descMatriz();
  if (m.length < 2) { alert('Nada para exportar. Gere o relatório primeiro.'); return; }
  const cel = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + m.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = 'descargas_' + window._descDados.ini + '_' + window._descDados.fim + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function relatorioDescargasXLSX() {
  const m = _descMatriz();
  if (m.length < 2) { alert('Nada para exportar. Gere o relatório primeiro.'); return; }
  let XLSX;
  try { XLSX = await _relCarregarXLSX(); } catch (e) { alert(e.message); return; }
  const ws = XLSX.utils.aoa_to_sheet(m);
  ws['!cols'] = m[0].map(h => ({ wch: Math.max(10, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Descargas');
  const D = window._descDados;
  if (D.notasSemDescarga.length) {
    const s = [['Emissão', 'NF-e', 'Fornecedor', 'Produto', 'Valor']].concat(D.notasSemDescarga.map(n => [
      new Date(n.emissaoMs).toLocaleString('pt-BR'), n.numero, n.emitente,
      n.resumo ? 'só resumo na SEFAZ' : n.comb.map(x => (_DESC_NOMEFAM[x.fam] || x.fam) + ' ' + x.q + ' L').join(' + '), n.valor]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s), 'Notas sem descarga');
  }
  XLSX.writeFile(wb, 'descargas_' + D.ini + '_' + D.fim + '.xlsx');
}

function relatorioDescargasImprimir() {
  const D = window._descDados;
  if (!D || !D.descargas.length) { alert('Nada para imprimir. Gere o relatório primeiro.'); return; }
  const info = (typeof empresaAtivaInfo === 'function') ? empresaAtivaInfo() : null;
  const empresa = info ? (info.nome_fantasia || info.nome || D.empresa) : D.empresa;
  const cnpj = info && info.cnpj ? info.cnpj : '';
  const br = d => d.split('-').reverse().join('/');
  const esc = _descEsc;
  const corpo = D.descargas.map(e => {
    const nfL = e.notas.reduce((a, x) => a + x.q, 0);
    const [rot, , prob] = _descSituacao(e);
    return `<tr${prob ? ' class="prob"' : ''}><td>${esc(_descDataHora(e.ini))}–${_descHora(e.fim)}</td><td>${e.tq} ${esc(e.comb)}</td>
      <td class="r">${_descFmtL(e.de)} → ${_descFmtL(e.para)}</td><td class="r"><b>${_descFmtL(e.litros)}</b></td>
      <td>${e.notas.map(x => esc(x.nf.numero) + ' ' + esc(String(x.nf.emitente).slice(0, 18))).join('<br>') || '—'}</td>
      <td class="r">${e.notas.length ? _descFmtL(nfL) : '—'}</td><td class="r">${e.notas.length ? _descFmtL(e.dif) : '—'}</td>
      <td>${esc(rot)}${e.obs ? '<br><small>' + esc(e.obs) + '</small>' : ''}</td></tr>`;
  }).join('');
  const semDesc = D.notasSemDescarga.map(n => `<tr><td>${esc(new Date(n.emissaoMs).toLocaleString('pt-BR'))}</td><td>${esc(n.numero)}</td><td>${esc(n.emitente)}</td>
      <td>${n.resumo ? 'só resumo na SEFAZ' : n.comb.map(x => esc(_DESC_NOMEFAM[x.fam] || x.fam) + ' ' + _descFmtL(x.q) + ' L').join(' + ')}</td><td class="r">${_relBRL(n.valor)}</td></tr>`).join('');
  const litros = D.descargas.reduce((s, e) => s + e.litros, 0);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Descargas ${esc(empresa)} ${br(D.ini)} a ${br(D.fim)}</title>
<style>
  * { box-sizing: border-box; } body { font: 10.5px/1.35 Arial, sans-serif; color: #111; margin: 0; padding: 18px 22px; }
  .top { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .top h1 { font-size: 16px; margin: 0 0 2px; } .top .rt { text-align: right; font-size: 10px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; } th, td { padding: 3px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f0f0f0; border-bottom: 1px solid #999; text-align: left; font-size: 9.5px; text-transform: uppercase; }
  td.r, th.r { text-align: right; white-space: nowrap; } tr.prob td { background: #fff4e5; } small { color: #8a5300; }
  h2 { font-size: 12px; margin: 12px 0 4px; } thead { display: table-header-group; } tr { break-inside: avoid; }
  @media print { body { padding: 0; } @page { size: landscape; margin: 10mm; } }
</style></head><body>
  <div class="top"><div><h1>${esc(empresa)}</h1><div>${cnpj ? 'CNPJ ' + esc(cnpj) + ' — ' : ''}Relatório de Descargas (sonda × NF-e)</div></div>
    <div class="rt">Período <b>${br(D.ini)} a ${br(D.fim)}</b><br>${D.descargas.length} descargas · ${_descFmtL(litros)} L medidos<br>Gerado ${new Date().toLocaleString('pt-BR')}</div></div>
  <table><thead><tr><th>Data / hora</th><th>Tanque</th><th class="r">Antes → depois</th><th class="r">Litros</th><th>NF-e</th><th class="r">L nota</th><th class="r">Dif.</th><th>Situação</th></tr></thead><tbody>${corpo}</tbody></table>
  ${semDesc ? `<h2>Notas de combustível sem descarga no posto</h2><table><thead><tr><th>Emissão</th><th>NF-e</th><th>Fornecedor</th><th>Produto</th><th class="r">Valor</th></tr></thead><tbody>${semDesc}</tbody></table>` : ''}
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('O navegador bloqueou a janela de impressão. Libere o pop-up e tente de novo.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
