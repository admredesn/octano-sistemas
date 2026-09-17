// ============================================================
//  B.I › 💰 DISPONÍVEL — quanto dinheiro existe para pagar/comprar AGORA
// ------------------------------------------------------------
//  Por posto, onde o dinheiro está (SQL-DISPONIVEL.sql):
//  - Sicoob: saldo REAL (gateway consulta o banco a cada 10 min), menos o
//    bloqueado (cheque depositado ainda não liberado);
//  - PagBank: cartão e Pix da maquininha liberam no MESMO dia (EDI conferido
//    nos 3 postos em 15/09/2026). O PagBank não deixa consultar saldo, então é
//    ESTIMADO a partir de um saldo INFORMADO: + vendas líquidas (taxa real do
//    posto, medida na fila do PDV) − Pix de mesma titularidade que chegaram ao
//    Sicoob vindos dessa conta (nome da conta no extrato);
//  - Cofre (Tijuco): depositado no cofre Brink's − "DEPÓSITO COFRE INTELIGENTE"
//    creditado. De 01 a 14/09 fechou em R$ 415 de diferença (depósito do dia);
//  - Dinheiro a depositar (Florestal) / Banco do Brasil (AC): dinheiro vendido
//    (pista − cartão/Pix − prazo) − depósito na agência / transferência do BB.
//  Por que "saldo informado": somando desde sempre a conta desanda — no
//  Florestal entraram R$ 96,6 mil líquidos no PagBank e saíram R$ 78,9 mil
//  para o Sicoob em 14 dias. Informar de tempos em tempos zera o erro.
// ============================================================

const _DISP_INICIO_COFRE = '2026-09-01T00:00:00-03:00';   // cofre sem saldo informado conta desde aqui
const _DISP_MAX_DIAS = 31;                                 // saldo informado mais velho que isso pede atualização
const _DISP_TAXA_PADRAO = { Pix: 0.002, 'Débito': 0.01, 'Crédito': 0.03 };
const _DISP_ICONE = { pagbank: '💳', cofre: '🔒', bb: '🏛', especie: '💵' };

function _biAbas() {
  const a = window._biAba || 'geral';
  const b = (id, rot) => '<button onclick="_biSetAba(\'' + id + '\')" style="padding:7px 16px;border-radius:7px 7px 0 0;cursor:pointer;border:1px solid #2a2d3e;border-bottom:none;' +
    (a === id ? 'background:#1a1d2e;color:#f97316;font-weight:700' : 'background:#0f1117;color:#9aa') + '">' + rot + '</button>';
  return '<div style="display:flex;gap:4px;padding:10px 16px 0;border-bottom:1px solid #2a2d3e">' + b('geral', '📊 Visão geral') + b('disponivel', '💰 Disponível') + '</div>';
}
function _biSetAba(id) { window._biAba = id; window._dispUltimo = 0; _biRender(); }

function _dispDiaLocal(iso) {                 // timestamp -> AAAA-MM-DD no Brasil
  const d = new Date(new Date(iso).getTime() - 3 * 3600e3);
  return d.toISOString().slice(0, 10);
}
function _dispMs(t) { const n = Date.parse(t); return isNaN(n) ? 0 : n; }   // compara instantes, nao texto (+00:00 x Z x milissegundos)
function _dispHora(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }

// movimento do extrato só tem DATA: no dia do saldo informado conta se foi
// importado depois dele (o gateway importa o extrato do dia a cada 10 min)
function _dispMovDepois(m, ancora) {
  const diaAnc = _dispDiaLocal(ancora.informado_em);
  if (m.data > diaAnc) return true;
  if (m.data < diaAnc) return false;
  return !!m.criado_em && _dispMs(m.criado_em) > _dispMs(ancora.informado_em);
}

async function _dispCarregar() {
  const hoje = _biHojeLocal();
  const iniHoje = hoje + 'T00:00:00-03:00';
  const menos = n => new Date(Date.now() - n * 864e5).toISOString();
  const limite = menos(_DISP_MAX_DIAS);

  const [emp, saldos, contas, informados, pagar] = await Promise.all([
    sb.from('oct_empresas').select('id,nome,nome_fantasia,ativo').eq('ativo', true).then(r => r.data || []),
    sb.from('oct_banco_saldos').select('*').then(r => r.error ? { erro: r.error.message } : (r.data || [])),
    sb.from('oct_disponivel_contas').select('*').eq('ativo', true).order('ordem').then(r => r.error ? { erro: r.error.message } : (r.data || [])),
    sb.from('oct_saldo_informado').select('*').gte('informado_em', limite).order('informado_em', { ascending: false }).limit(500).then(r => r.data || []),
    _biTudo(() => sb.from('oct_contas_pagar').select('empresa_id,valor,vencimento,status').eq('status', 'aberto').lte('vencimento', hoje).order('id')),
  ]);
  if (saldos.erro || contas.erro) return { faltaSql: saldos.erro || contas.erro };

  // ponto de partida de cada conta estimada
  const ancoras = {};
  contas.forEach(c => {
    const inf = informados.find(i => i.empresa_id === c.empresa_id && i.conta === c.conta);
    if (inf) ancoras[c.empresa_id + '|' + c.conta] = inf;
    else if (c.conta === 'cofre') ancoras[c.empresa_id + '|' + c.conta] = { valor: 0, informado_em: new Date(_DISP_INICIO_COFRE).toISOString(), automatico: true };
  });
  const tempos = Object.values(ancoras).map(a => _dispMs(a.informado_em)).concat([_dispMs(iniHoje)]);
  let inicioMs = Math.min(...tempos);
  if (inicioMs < _dispMs(limite)) inicioMs = _dispMs(limite);
  const inicio = new Date(inicioMs).toISOString();
  const diaIni = _dispDiaLocal(inicio);
  const precisaPista = contas.some(c => (c.conta === 'especie' || c.conta === 'bb') && ancoras[c.empresa_id + '|' + c.conta]);
  const iniPista = precisaPista ? diaIni + 'T00:00:00' : hoje + 'T00:00:00';   // data_abast é hora LOCAL com +00:00 falso

  const [receb, movs, pista, prazo, filaTaxa, filaLoja] = await Promise.all([
    _biTudo(() => sb.from('oct_recebimentos').select('empresa_id,origem,forma,valor,recebido_em')
      .in('origem', ['pagbank_edi', 'pagbank_email', 'cofre_brinks']).gte('recebido_em', inicio).order('recebido_em').order('id')),
    _biTudo(() => sb.from('oct_banco_movimentos').select('empresa_id,data,valor,descricao,info,criado_em')
      .eq('tipo', 'credito').gte('data', diaIni).order('id')),
    _biTudo(() => sb.from('oct_pdv_abastecimentos').select('empresa_id,data_abast,valor_total,tipo')
      .gte('data_abast', iniPista).or('tipo.is.null,tipo.neq.afericao').order('data_abast').order('id')),   // ordem pelo indice: order(id) com offset fundo da' timeout (500)
    _biTudo(() => sb.from('oct_pdv_notas_prazo').select('empresa_id,valor,valor_original,registrado_em,status')
      .gte('registrado_em', precisaPista ? inicio : new Date(iniHoje).toISOString()).order('id')),
    _biTudo(() => sb.from('oct_fila_transmissao').select('empresa_id,forma_nome,valor,taxa')
      .gte('ocorrido_em', menos(7)).in('forma_nome', ['Pix', 'Débito', 'Crédito']).order('ocorrido_em').order('id')),
    _biTudo(() => sb.from('oct_fila_transmissao').select('empresa_id,valor,desconto,acrescimo,bico,status')
      .gte('ocorrido_em', new Date(iniHoje).toISOString()).is('bico', null).order('id')),
  ]);
  return { hoje, iniHoje, emp, saldos, contas, ancoras, informados, pagar, receb, movs, pista, prazo, filaTaxa, filaLoja };
}

// maquininha: o mesmo pagamento chega pelo e-mail (na hora) e pelo EDI (D-1).
// Por dia fica a origem com MAIS valor — não soma as duas.
function _dispMaquininha(receb, eid, taxa, desdeIso) {
  const porDia = {};
  receb.forEach(r => {
    if (r.empresa_id !== eid || (r.origem !== 'pagbank_edi' && r.origem !== 'pagbank_email')) return;
    if (desdeIso && _dispMs(r.recebido_em) <= _dispMs(desdeIso)) return;
    const d = _dispDiaLocal(r.recebido_em);
    const o = ((porDia[d] = porDia[d] || {})[r.origem] = porDia[d][r.origem] || { bruto: 0, liquido: 0, formas: {} });
    const v = Number(r.valor || 0);
    o.bruto += v;
    o.liquido += v * (1 - (taxa[r.forma] != null ? taxa[r.forma] : 0.02));
    o.formas[r.forma] = (o.formas[r.forma] || 0) + v;
  });
  const dias = {};
  Object.entries(porDia).forEach(([d, origens]) => {
    dias[d] = Object.values(origens).reduce((m, x) => (!m || x.bruto > m.bruto ? x : m), null);
  });
  return dias;
}

function _dispCalcular(D) {
  const postos = D.emp.map(e => {
    const eid = e.id;
    const nome = e.nome_fantasia || e.nome;
    // taxa real da maquininha do posto (fila dos últimos 7 dias)
    const acc = {};
    D.filaTaxa.forEach(f => {
      if (f.empresa_id !== eid) return;
      const a = (acc[f.forma_nome] = acc[f.forma_nome] || [0, 0]);
      a[0] += Number(f.taxa || 0); a[1] += Number(f.valor || 0);
    });
    const taxa = Object.assign({}, _DISP_TAXA_PADRAO);
    Object.entries(acc).forEach(([k, [t, v]]) => { if (v > 500) taxa[k] = t / v; });

    // ---- vendido hoje ----
    const pistaHoje = D.pista.filter(a => a.empresa_id === eid && String(a.data_abast).slice(0, 10) === D.hoje)
      .reduce((s, a) => s + Number(a.valor_total || 0), 0);
    const lojaHoje = D.filaLoja.filter(f => f.empresa_id === eid && f.status !== 'cancelado')
      .reduce((s, f) => s + Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0), 0);
    const maqHoje = _dispMaquininha(D.receb, eid, taxa, null)[D.hoje] || { bruto: 0, liquido: 0, formas: {} };
    const prazoHoje = D.prazo.filter(p => p.empresa_id === eid && p.status !== 'cancelado' && _dispMs(p.registrado_em) >= _dispMs(D.iniHoje))
      .reduce((s, p) => s + Number(p.valor_original != null ? p.valor_original : p.valor || 0), 0);
    const totalHoje = pistaHoje + lojaHoje;
    const vendido = {
      total: totalHoje, pix: maqHoje.formas.Pix || 0, debito: maqHoje.formas['Débito'] || 0, credito: maqHoje.formas['Crédito'] || 0,
      prazo: prazoHoje, dinheiro: Math.max(0, totalHoje - maqHoje.bruto - prazoHoje), cartaoLiquido: maqHoje.liquido,
    };

    // ---- Sicoob (real) ----
    const s = Array.isArray(D.saldos) ? D.saldos.find(x => x.empresa_id === eid) : null;
    const sicoob = s ? {
      // o "saldo" da API JA' e' o disponivel: o bloqueado (cheque) fica fora dele.
      // Prova: Florestal 15/09 saldo 1.363,01 com 3.719,66 bloqueado e limite zero.
      valor: s.saldo != null ? Number(s.saldo) : null,
      bloqueado: Number(s.saldo_bloqueado || 0), lido: s.consultado_em, erro: s.erro,
    } : null;

    // ---- contas estimadas ----
    const contas = D.contas.filter(c => c.empresa_id === eid).map(c => {
      const anc = D.ancoras[eid + '|' + c.conta];
      const r = { conta: c.conta, rotulo: c.rotulo, ancora: anc || null, entradas: 0, saidas: 0, valor: null, hojeEnt: 0, hojeSai: 0 };
      if (!anc) return r;
      const velho = _dispMs(anc.informado_em) < Date.now() - _DISP_MAX_DIAS * 864e5;
      r.velho = velho;
      const nomeOrig = String(c.origem_extrato || '').toUpperCase();
      const movDaConta = m => {
        const desc = String(m.descricao || '').toUpperCase(), info = String(m.info || '').toUpperCase();
        if (c.conta === 'cofre') return desc.includes('COFRE');
        if (c.conta === 'especie') return desc.includes('DEPOSITO EM DINHEIRO') || desc.includes('DEPÓSITO EM DINHEIRO');
        return nomeOrig && desc.includes('MESMA TIT') && info.includes(nomeOrig);
      };
      D.movs.forEach(m => {
        if (m.empresa_id !== eid || !movDaConta(m) || !_dispMovDepois(m, anc)) return;
        r.saidas += Number(m.valor || 0);
        if (m.data === D.hoje) r.hojeSai += Number(m.valor || 0);
      });
      if (c.conta === 'pagbank') {
        Object.entries(_dispMaquininha(D.receb, eid, taxa, anc.informado_em)).forEach(([d, x]) => {
          r.entradas += x.liquido;
          if (d === D.hoje) r.hojeEnt += x.liquido;
        });
      } else if (c.conta === 'cofre') {
        D.receb.forEach(x => {
          if (x.empresa_id !== eid || x.origem !== 'cofre_brinks' || _dispMs(x.recebido_em) <= _dispMs(anc.informado_em)) return;
          r.entradas += Number(x.valor || 0);
          if (_dispDiaLocal(x.recebido_em) === D.hoje) r.hojeEnt += Number(x.valor || 0);
        });
      } else {
        // dinheiro vendido desde o saldo informado, por dia: pista − maquininha − prazo
        const diaAnc = _dispDiaLocal(anc.informado_em);
        const maq = _dispMaquininha(D.receb, eid, taxa, anc.informado_em);
        const pistaDia = {}, prazoDia = {};
        D.pista.forEach(a => {
          if (a.empresa_id !== eid) return;
          // data_abast é hora LOCAL gravada com +00:00: compara como texto local
          const loc = String(a.data_abast).slice(0, 16);
          const ancLoc = new Date(new Date(anc.informado_em).getTime() - 3 * 3600e3).toISOString().slice(0, 16);
          if (loc <= ancLoc) return;
          const d = loc.slice(0, 10);
          pistaDia[d] = (pistaDia[d] || 0) + Number(a.valor_total || 0);
        });
        D.prazo.forEach(p => {
          if (p.empresa_id !== eid || p.status === 'cancelado' || _dispMs(p.registrado_em) <= _dispMs(anc.informado_em)) return;
          const d = _dispDiaLocal(p.registrado_em);
          prazoDia[d] = (prazoDia[d] || 0) + Number(p.valor_original != null ? p.valor_original : p.valor || 0);
        });
        Object.keys(pistaDia).forEach(d => {
          if (d < diaAnc) return;
          const din = Math.max(0, pistaDia[d] - ((maq[d] && maq[d].bruto) || 0) - (prazoDia[d] || 0));
          r.entradas += din;
          if (d === D.hoje) r.hojeEnt += din;
        });
      }
      r.valor = Number(anc.valor || 0) + r.entradas - r.saidas;
      return r;
    });

    // vencida há mais de 30 dias NÃO entra no comprometido: em 15/09/2026 eram
    // R$ 386 mil no Tijuco e R$ 302 mil no Florestal, quase tudo título já pago que
    // nunca recebeu baixa (conferência de agosto). Aparece à parte, como aviso.
    const pagarP = D.pagar.filter(p => p.empresa_id === eid);
    const corte30 = new Date(new Date(D.hoje + 'T12:00:00').getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const soma = arr => arr.reduce((s2, p) => s2 + Number(p.valor || 0), 0);
    const vencidas = soma(pagarP.filter(p => p.vencimento < D.hoje && p.vencimento >= corte30));
    const antigas = pagarP.filter(p => p.vencimento < corte30);
    const vencidasAntigas = soma(antigas), qtdAntigas = antigas.length;
    const venceHoje = soma(pagarP.filter(p => p.vencimento === D.hoje));
    const disponivel = (sicoob && sicoob.valor != null ? sicoob.valor : 0) + contas.reduce((s2, c) => s2 + (c.valor != null ? c.valor : 0), 0);
    return { eid, nome, taxa, vendido, sicoob, contas, vencidas, venceHoje, vencidasAntigas, qtdAntigas, disponivel, livre: disponivel - vencidas - venceHoje,
             faltaInformar: contas.filter(c => !c.ancora).map(c => c.rotulo) };
  });
  return postos;
}

async function _dispRender(forcar) {
  const raiz = document.getElementById('conteudo');
  if (!raiz) return;
  // o timer do B.I chama a cada 60s; o disponível lê semanas de movimento, então renova a cada 3 min
  if (!forcar && window._dispUltimo && Date.now() - window._dispUltimo < 180000 && document.getElementById('disp-corpo')) return;
  window._dispUltimo = Date.now();
  if (!document.getElementById('disp-corpo')) {
    raiz.innerHTML = '<div class="og-janela" id="bi-raiz"><div class="og-titulo"><span>📈 B.I — Visão do Grupo</span>' +
      '<button class="og-fechar" title="Fechar" onclick="navegarPara(\'empresa\')">✕</button></div>' + _biAbas() +
      '<div id="disp-corpo" style="padding:14px 16px"><p style="color:#888">Calculando o disponível…</p></div></div>';
  }
  const corpo = document.getElementById('disp-corpo');
  let D;
  try {
    D = await _dispCarregar();
  } catch (e) {
    corpo.innerHTML = '<p style="color:#f87171">Não consegui carregar: ' + fcEscBi(e.message || e) + '</p>';
    return;
  }
  if (D.faltaSql) {
    corpo.innerHTML = '<p style="color:#fbbf24">Falta rodar o <b>SQL-DISPONIVEL.sql</b> no Supabase (' + fcEscBi(D.faltaSql) + ').</p>';
    return;
  }
  const P = _dispCalcular(D);
  window._dispPostos = P;
  const G = P.reduce((g, p) => {
    g.disp += p.disponivel; g.livre += p.livre; g.venc += p.vencidas; g.hoje += p.venceHoje; g.vend += p.vendido.total;
    return g;
  }, { disp: 0, livre: 0, venc: 0, hoje: 0, vend: 0 });
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const card = (t, v, cor, sub) => '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:170px">' +
    '<div style="color:#8a8f98;font-size:0.72rem;text-transform:uppercase;letter-spacing:.4px">' + t + '</div>' +
    '<div style="color:' + cor + ';font-size:1.25rem;font-weight:700;margin-top:2px">' + _biMoney(v) + '</div>' +
    (sub ? '<div style="color:#6b7688;font-size:0.72rem;margin-top:2px">' + sub + '</div>' : '') + '</div>';
  corpo.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
      '<span style="color:#9aa;font-size:0.8rem">Grupo · atualizado ' + agora + ' · renova a cada 3 min</span>' +
      '<button onclick="_dispRender(true)" style="padding:6px 14px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#9aa;cursor:pointer">↻ Atualizar</button></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
      card('Disponível agora', G.disp, '#5dca9a', 'bancos + maquininha + dinheiro') +
      card('Contas vencidas + hoje', G.venc + G.hoje, G.venc ? '#f87171' : '#fbbf24', 'vencidas até 30 dias ' + _biMoney(G.venc)) +
      card('Livre depois das contas', G.livre, G.livre >= 0 ? '#4ade80' : '#f87171') +
      card('Vendido hoje', G.vend, '#e6e6e6', 'pista + loja') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">' + P.map(_dispCardPosto).join('') + '</div>' +
    '<p style="color:#556;font-size:0.72rem;margin-top:12px;max-width:1000px">Sicoob = saldo disponível lido no banco (o bloqueado, cheque a liberar, fica fora). As contas marcadas <b>estimado</b> partem do último saldo informado e somam o movimento: ' +
    'PagBank = vendas líquidas da maquininha (taxa real do posto) − Pix de mesma titularidade que chegaram ao Sicoob vindos dessa conta; cofre = depositado − creditado; ' +
    'dinheiro/Banco do Brasil = pista − cartão/Pix − prazo − depositado/transferido. Informe o saldo real de tempos em tempos para zerar a diferença. ' +
    '"Dinheiro e outros" do vendido hoje inclui frota e o que não passou na maquininha.</p>';
}

function _dispCardPosto(p) {
  const linha = (ico, rot, valor, cor, det, botao) => '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #1e2233">' +
    '<div style="min-width:0"><div style="color:#cbd5e1;font-size:0.84rem">' + ico + ' ' + rot + '</div>' +
    (det ? '<div style="color:#6b7688;font-size:0.72rem;margin-top:1px">' + det + '</div>' : '') + '</div>' +
    '<div style="text-align:right;white-space:nowrap"><div style="color:' + cor + ';font-weight:700">' + valor + '</div>' + (botao || '') + '</div></div>';
  const btn = c => '<button onclick="_dispInformar(\'' + p.eid + '\',\'' + c.conta + '\')" style="margin-top:3px;padding:2px 8px;border-radius:5px;border:1px solid #2a4a6a;background:#0f1a2a;color:#93c5fd;cursor:pointer;font-size:0.7rem">Informar saldo</button>';
  let h = '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b style="color:#e6e6e6">' + fcEscBi(p.nome) + '</b>' +
    '<span style="color:#5dca9a;font-weight:700;font-size:1.1rem">' + _biMoney(p.disponivel) + '</span></div>' +
    '<div style="color:#6b7688;font-size:0.72rem;margin-bottom:6px">disponível agora · livre depois das contas <b style="color:' + (p.livre >= 0 ? '#4ade80' : '#f87171') + '">' + _biMoney(p.livre) + '</b></div>';

  if (p.sicoob && p.sicoob.valor != null) {
    const det = 'real · lido no banco ' + _dispHora(p.sicoob.lido) + (p.sicoob.bloqueado ? ' · + ' + _biMoney(p.sicoob.bloqueado) + ' bloqueado (cheque a liberar, fora do total)' : '') +
      (p.sicoob.erro ? ' · <span style="color:#fbbf24">última leitura falhou</span>' : '');
    h += linha('🏦', 'Sicoob', _biMoney(p.sicoob.valor), '#e6e6e6', det);
  } else {
    h += linha('🏦', 'Sicoob', '—', '#6b7688', p.sicoob && p.sicoob.erro ? '<span style="color:#fbbf24">' + fcEscBi(p.sicoob.erro.slice(0, 80)) + '</span>' : 'aguardando a primeira leitura do banco');
  }
  p.contas.forEach(c => {
    const ico = _DISP_ICONE[c.conta] || '•';
    if (!c.ancora) {
      h += linha(ico, c.rotulo, '—', '#6b7688', '<span style="color:#fbbf24">informe o saldo atual para começar a estimar</span>', btn(c));
      return;
    }
    const base = c.ancora.automatico ? 'desde ' + _dispHora(c.ancora.informado_em) : 'saldo informado ' + _dispHora(c.ancora.informado_em) + ' (' + _biMoney(c.ancora.valor) + ')';
    const det = 'estimado · ' + base + ' · +' + _biMoney(c.entradas) + ' / −' + _biMoney(c.saidas) +
      ((c.hojeEnt || c.hojeSai) ? ' · hoje +' + _biMoney(c.hojeEnt) + ' / −' + _biMoney(c.hojeSai) : '') +
      (c.velho ? ' · <span style="color:#fbbf24">informe de novo</span>' : '') +
      (c.valor < 0 ? ' · <span style="color:#f87171">negativo: saldo informado desatualizado ou saída que não passou pelo Sicoob</span>' : '');
    h += linha(ico, c.rotulo, _biMoney(c.valor), c.valor < 0 ? '#f87171' : '#cbd5e1', det, btn(c));
  });
  h += linha('⏰', 'Contas a pagar vencidas + hoje', '−' + _biMoney(p.vencidas + p.venceHoje), (p.vencidas ? '#f87171' : '#fbbf24'),
             'vencidas nos últimos 30 dias ' + _biMoney(p.vencidas) + ' · vencem hoje ' + _biMoney(p.venceHoje) +
             (p.qtdAntigas ? '<br><span style="color:#fbbf24">+ ' + p.qtdAntigas + ' título(s) vencido(s) há mais de 30 dias (' + _biMoney(p.vencidasAntigas) +
               ') fora da conta: provavelmente já pagos sem baixa — conferir no Contas a Pagar</span>' : ''));

  const v = p.vendido;
  const chip = (rot, val, cor) => '<span style="display:inline-block;background:#0f1a2a;border:1px solid #2a4a6a;border-radius:20px;padding:2px 9px;margin:2px;color:#cbd5e1;font-size:0.74rem">' + rot + ' <b style="color:' + (cor || '#5dca9a') + '">' + _biMoney(val) + '</b></span>';
  h += '<div style="margin-top:8px"><div style="color:#9aa;font-size:0.76rem;margin-bottom:3px">Vendido hoje: <b style="color:#e6e6e6">' + _biMoney(v.total) + '</b></div>' +
    chip('💵 Dinheiro e outros', v.dinheiro) + chip('Pix', v.pix) + chip('Débito', v.debito) + chip('Crédito', v.credito) + chip('A prazo', v.prazo, '#fbbf24') +
    '<div style="color:#6b7688;font-size:0.72rem;margin-top:3px">do cartão/Pix de hoje, já liberado no PagBank: <b style="color:#5dca9a">' + _biMoney(v.cartaoLiquido) + '</b> (líquido de taxa) · a prazo não é dinheiro disponível</div></div>';
  return h + '</div>';
}

async function _dispInformar(eid, conta) {
  if (!podeOuAvisa('bi.informar_saldo')) return;
  const p = (window._dispPostos || []).find(x => x.eid === eid);
  const c = p && p.contas.find(x => x.conta === conta);
  const txt = prompt('Saldo ATUAL de "' + (c ? c.rotulo : conta) + '" em ' + (p ? p.nome : '') + '.\nDigite o valor que aparece agora no app/extrato (ex.: 12345,67):');
  if (txt == null) return;
  const valor = Number(String(txt).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  if (!isFinite(valor)) { alert('Valor inválido.'); return; }
  let quem = '';
  try { quem = (typeof perfil !== 'undefined' && perfil && (perfil.nome || perfil.email)) || ''; } catch (e) { quem = ''; }
  const { error } = await sb.from('oct_saldo_informado').insert({ empresa_id: eid, conta, valor, informado_por: quem || null });
  if (error) { alert('Não gravei: ' + error.message); return; }
  _dispRender(true);
}
