// ============================================================
// B.I DO GRUPO — visão executiva por posto e consolidada
// Blocos: contas a pagar, contas a receber, valor em estoque,
// projeção de venda e META DO DIA (quanto vender p/ pagar a
// conta do próximo vencimento, com evolução do dia em %).
// Fontes (Supabase): oct_contas_pagar (alimentada 6/6h pelas
// duplicatas das NF-e — sync_contas_pagar_nfe.py), oct_pdv_notas_prazo,
// oct_faturas, oct_tanques×oct_produtos (custo), oct_fila_transmissao.
// ============================================================

const _BI_REFRESH_MS = 60000;

function _biMoney(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _biK(v) { v = Number(v || 0); return v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil' : _biMoney(v); }
function _biHojeLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _biDtBr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'; }
function _biNomeCurto(nome) {
  const n = (nome || '').toUpperCase();
  if (n.includes('TIJUCO')) return 'Tijuco';
  if (n.includes('FLORESTAL')) return 'Florestal';
  if (n.includes('ANTONIO CARLOS')) return 'Antônio Carlos';
  if (n.includes('GLORIA')) return 'Glória';
  return nome || '?';
}

// classifica combustível por nome (tanque OU produto) p/ casar custo
function _biClasseComb(s) {
  s = (s || '').toUpperCase();
  if (/ETANOL|ALCOOL/.test(s) && !/MISTURA/.test(s)) return 'etanol';
  if (/GASOLINA|MISTURA DE ETAN/.test(s)) return /ADIT|ADT|PODIUM|GRID/.test(s) ? 'gas_ad' : 'gas_com';
  if (/DIESEL/.test(s)) return /S[- ]?10|BS10/.test(s) ? 's10' : (/500|BS5/.test(s) ? 's500' : 'diesel');
  return null;
}

// paginação PostgREST (cap de 1000 linhas por resposta)
async function _biTudo(fazQuery) {
  const PAG = 1000; let tudo = [], de = 0;
  for (;;) {
    const { data, error } = await fazQuery().range(de, de + PAG - 1);
    if (error) throw new Error(error.message);
    tudo = tudo.concat(data || []);
    if (!data || data.length < PAG) return tudo;
    de += PAG;
  }
}

async function moduloBi() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando B.I...</p>';
  try {
    await _biRender();
  } catch (e) {
    conteudo.innerHTML = '<div style="padding:24px;color:#f44">Erro ao montar o B.I: ' + (e.message || e) +
      ' <button onclick="moduloBi()" style="margin-left:10px;padding:6px 14px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer">Tentar de novo</button></div>';
  }
  // auto-atualização: números se renovam sozinhos com a aba aberta
  if (!window._biTimer) {
    window._biTimer = setInterval(() => {
      try { if (document.getElementById('bi-raiz')) _biRender(); } catch (e) {}
    }, _BI_REFRESH_MS);
  }
}

async function _biRender() {
  const hoje = _biHojeLocal();
  const mes = hoje.slice(0, 7);
  const d15 = new Date(Date.now() - 16 * 864e5).toISOString().slice(0, 10);

  const [empR, cpR, npR, fatR, tqR, prR, fila] = await Promise.all([
    sb.from('oct_empresas').select('id,nome').eq('ativo', true),
    sb.from('oct_contas_pagar').select('empresa_id,descricao,valor,vencimento,status').eq('status', 'aberto').order('vencimento'),
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor,status').eq('status', 'aberto')),
    sb.from('oct_faturas').select('empresa_id,valor,status'),
    sb.from('oct_tanques').select('empresa_id,combustivel,estoque_atual,volume_sonda,medido_em').eq('ativo', true),
    sb.from('oct_produtos').select('empresa_id,nome,preco_custo,preco_venda_a,estoque,ind_combustivel,cod_anp').eq('ativo', true),
    _biTudo(() => sb.from('oct_fila_transmissao').select('empresa_id,valor,desconto,acrescimo,status,ocorrido_em,criado_em').gte('criado_em', d15)),
  ]);
  for (const r of [empR, cpR, fatR, tqR, prR]) if (r.error) throw new Error(r.error.message);

  const empresas = (empR.data || []).map(e => ({ id: e.id, nome: _biNomeCurto(e.nome) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // custo dos combustíveis por empresa/classe (p/ valorar tanque)
  const custoComb = {};
  (prR.data || []).forEach(p => {
    if (p.ind_combustivel !== 'S' && !p.cod_anp) return;
    const cl = _biClasseComb(p.nome);
    if (!cl) return;
    const custo = Number(p.preco_custo || 0) || Number(p.preco_venda_a || 0);
    if (custo <= 0 || custo > 20) return;   // por litro — ignora lubrificante em caixa
    (custoComb[p.empresa_id] = custoComb[p.empresa_id] || {})[cl] = custo;
  });

  // vendas por empresa: hoje, média 14d, realizado do mês
  const vHoje = {}, vMes = {}, vDia = {};
  fila.forEach(f => {
    if (/cancel/i.test(f.status || '')) return;
    const dt = (f.ocorrido_em || f.criado_em || '').slice(0, 10);
    if (!dt) return;
    const val = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
    const e = f.empresa_id;
    if (dt === hoje) vHoje[e] = (vHoje[e] || 0) + val;
    if (dt.slice(0, 7) === mes) vMes[e] = (vMes[e] || 0) + val;
    if (dt < hoje) { (vDia[e] = vDia[e] || {})[dt] = (vDia[e][dt] || 0) + val; }
  });

  const dadosPosto = empresas.map(emp => {
    const e = emp.id;
    // contas a pagar
    const contas = (cpR.data || []).filter(c => c.empresa_id === e);
    const pagarTotal = contas.reduce((s, c) => s + Number(c.valor), 0);
    const vencidas = contas.filter(c => c.vencimento < hoje);
    const vencidasTotal = vencidas.reduce((s, c) => s + Number(c.valor), 0);
    // meta do dia: SÓ o próximo vencimento FUTURO (>= hoje). Conta vencida não
    // vira meta (daria "vender R$100 mil hoje") — vencida é alerta p/ liquidar.
    const futuras = contas.filter(c => c.vencimento >= hoje);
    let meta = null;
    if (futuras.length) {
      const proxVenc = futuras[0].vencimento;
      const aPagarAte = futuras.filter(c => c.vencimento <= proxVenc).reduce((s, c) => s + Number(c.valor), 0);
      const dias = Math.max(1, Math.round((new Date(proxVenc + 'T12:00') - new Date(hoje + 'T12:00')) / 864e5) + 1);
      meta = { venc: proxVenc, valorAte: aPagarAte, dias, porDia: aPagarAte / dias, desc: futuras[0].descricao };
    }
    // contas a receber
    const receber = npR.filter(n => n.empresa_id === e).reduce((s, n) => s + Number(n.valor), 0)
      + (fatR.data || []).filter(f => f.empresa_id === e && !/liquid|pago|cancel/i.test(f.status || '')).reduce((s, f) => s + Number(f.valor), 0);
    // estoque: tanques (sonda × custo/litro) + produtos de loja (estoque × custo)
    let estComb = 0, litros = 0, semCusto = [];
    (tqR.data || []).filter(t => t.empresa_id === e).forEach(t => {
      const l = Number(t.volume_sonda != null ? t.volume_sonda : t.estoque_atual) || 0;
      const cl = _biClasseComb(t.combustivel);
      const mapa = custoComb[e] || {};
      const custo = mapa[cl] || (cl === 's10' || cl === 's500' ? mapa.diesel : 0) || 0;
      litros += l;
      if (custo > 0) estComb += l * custo;
      else if (l > 0) semCusto.push(t.combustivel);
    });
    const estLoja = (prR.data || []).filter(p => p.empresa_id === e && Number(p.estoque) > 0)
      .reduce((s, p) => s + Number(p.estoque) * (Number(p.preco_custo || 0) || Number(p.preco_venda_a || 0)), 0);
    // vendas
    const dias14 = vDia[e] || {};
    const media = Object.values(dias14).reduce((s, v) => s + v, 0) / 14;
    const hj = vHoje[e] || 0;
    const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
    const projMes = (vMes[e] || 0) + media * (diasNoMes - Number(hoje.slice(8, 10)));
    return {
      ...emp, pagarTotal, nPagar: contas.length, vencidasTotal, nVencidas: vencidas.length, meta,
      receber, estoque: estComb + estLoja, litros, semCusto,
      vendaHoje: hj, media, realizadoMes: vMes[e] || 0, projMes,
    };
  });

  // consolidado do grupo
  const g = {
    pagarTotal: 0, vencidasTotal: 0, receber: 0, estoque: 0, vendaHoje: 0,
    media: 0, realizadoMes: 0, projMes: 0, metaDia: 0,
  };
  dadosPosto.forEach(p => {
    g.pagarTotal += p.pagarTotal; g.vencidasTotal += p.vencidasTotal; g.receber += p.receber;
    g.estoque += p.estoque; g.vendaHoje += p.vendaHoje; g.media += p.media;
    g.realizadoMes += p.realizadoMes; g.projMes += p.projMes;
    if (p.meta) g.metaDia += p.meta.porDia;
  });

  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('conteudo').innerHTML =
    '<div class="og-janela" id="bi-raiz">' +
      '<div class="og-titulo"><span>📈 B.I — Visão do Grupo</span>' +
        '<span style="font-size:0.72rem;color:#667;font-weight:400;margin-left:12px">atualizado ' + agora + ' · renova a cada 60s</span>' +
        '<button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button></div>' +
      '<div style="padding:14px 16px">' +
        _biCardGrupo(g) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:14px">' +
          dadosPosto.map(_biCardPosto).join('') +
        '</div>' +
        '<p style="color:#556;font-size:0.72rem;margin-top:12px">Estoque = sonda dos tanques × custo do combustível + produtos de loja a custo. ' +
        'Contas a pagar alimentadas automaticamente pelas duplicatas das NF-e de entrada (6/6h). ' +
        'Projeção do mês = realizado + média dos últimos 14 dias × dias restantes.</p>' +
      '</div></div>';
}

function _biBarraMeta(vendido, metaDia) {
  if (!metaDia || metaDia <= 0) return '<div style="color:#667;font-size:0.75rem">Sem conta aberta — sem meta do dia.</div>';
  const pct = Math.round(vendido / metaDia * 100);
  const cor = pct >= 100 ? '#4caf50' : pct >= 60 ? '#fbbf24' : '#f97316';
  return '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#9aa;margin-bottom:3px">' +
      '<span>Evolução do dia</span><span style="color:' + cor + ';font-weight:700">' + pct + '%</span></div>' +
    '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;height:14px;overflow:hidden">' +
      '<div style="width:' + Math.min(100, pct) + '%;height:100%;background:' + cor + ';transition:width .6s"></div></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#778;margin-top:3px">' +
      '<span>vendido ' + _biK(vendido) + '</span><span>meta/dia ' + _biK(metaDia) + '</span></div>';
}

function _biCardGrupo(g) {
  const ind = (rot, val, cor, sub) =>
    '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:8px;padding:12px">' +
      '<div class="nfe-label">' + rot + '</div>' +
      '<div style="font-size:1.25rem;font-weight:700;color:' + cor + ';margin-top:4px">' + _biK(val) + '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#778;margin-top:2px">' + sub + '</div>' : '') + '</div>';
  return '<div style="background:#13151f;border:1px solid #f97316;border-radius:10px;padding:14px">' +
    '<div style="font-weight:700;color:#f97316;margin-bottom:10px">🏢 GRUPO — consolidado dos postos</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">' +
      ind('💸 Contas a pagar', g.pagarTotal, '#f44336', g.vencidasTotal > 0 ? _biK(g.vencidasTotal) + ' já vencidas' : 'nada vencido') +
      ind('💰 Contas a receber', g.receber, '#4caf50', 'notas a prazo + faturas') +
      ind('🛢️ Valor em estoque', g.estoque, '#60a5fa', 'combustível + loja, a custo') +
      ind('📈 Venda hoje', g.vendaHoje, '#e0e0e0', 'média/dia ' + _biK(g.media)) +
      ind('🔮 Projeção do mês', g.projMes, '#c084fc', 'realizado ' + _biK(g.realizadoMes)) +
    '</div>' +
    '<div style="margin-top:12px">' + _biBarraMeta(g.vendaHoje, g.metaDia) + '</div></div>';
}

function _biCardPosto(p) {
  const linha = (rot, val, cor) =>
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1a1d2e;font-size:0.82rem">' +
      '<span style="color:#9aa">' + rot + '</span><span style="font-weight:700;color:' + (cor || '#e0e0e0') + '">' + _biK(val) + '</span></div>';
  const venc = p.meta
    ? '<div style="background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;padding:8px;margin:8px 0;font-size:0.75rem;color:#9aa">' +
        '⏰ Próx. vencimento <b style="color:' + (p.meta.venc < _biHojeLocal() ? '#f44336' : '#fbbf24') + '">' + _biDtBr(p.meta.venc) + '</b>' +
        ' — a pagar até lá <b style="color:#e0e0e0">' + _biK(p.meta.valorAte) + '</b> em ' + p.meta.dias + ' dia(s)</div>'
    : '';
  return '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
      '<span style="font-weight:700;color:#e0e0e0">⛽ ' + p.nome + '</span>' +
      (p.nVencidas > 0 ? '<span style="font-size:0.72rem;color:#f44336;font-weight:700">' + p.nVencidas + ' vencida(s) ' + _biK(p.vencidasTotal) + '</span>' : '') + '</div>' +
    linha('💸 A pagar (' + p.nPagar + ')', p.pagarTotal, '#f44336') +
    linha('💰 A receber', p.receber, '#4caf50') +
    linha('🛢️ Estoque (' + Math.round(p.litros).toLocaleString('pt-BR') + ' L)', p.estoque, '#60a5fa') +
    linha('📈 Venda hoje', p.vendaHoje) +
    linha('Ø Média/dia (14d)', p.media) +
    linha('🔮 Projeção do mês', p.projMes, '#c084fc') +
    venc +
    '<div style="margin-top:8px">' + _biBarraMeta(p.vendaHoje, p.meta ? p.meta.porDia : 0) + '</div>' +
    (p.semCusto && p.semCusto.length ? '<div style="font-size:0.7rem;color:#a63;margin-top:6px">⚠ sem custo cadastrado: ' + p.semCusto.join(', ') + ' (estoque desses fora da conta)</div>' : '') +
  '</div>';
}
