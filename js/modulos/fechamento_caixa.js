// ============================================================
// MÓDULO FECHAMENTO DE CAIXA (retaguarda) — RÉPLICA FIEL do TecnoX
// Lista de turnos + detalhe idêntico (cabeçalho, árvore de módulos, colunas
// Recebimentos × Vendas/Saídas, painel Observação/botões/Acréscimo-Desconto).
// Lê os dados próprios do octano: oct_pdv_turnos, oct_pdv_vendas (itens/pagamentos),
// oct_pdv_caixa. Combustível×produto pelos ITENS do cupom (item tipo 'abastecimento'
// = combustível), espelhando a vw_log_valores_turno do TecnoX.
// ============================================================

function _fcGrupoForma(cod) {
  const c = String(cod || '').padStart(2, '0');
  if (c === '01') return 'dinheiro';
  if (c === '02') return 'cheque';
  if (['03', '04', '10', '11', '12', '13'].includes(c)) return 'cartao';
  if (['17', '18', '19'].includes(c)) return 'pix';
  if (['15', '31'].includes(c)) return 'boleto';
  if (['05', '99', '90'].includes(c)) return 'prazo';   // 05 = crédito loja = nota a prazo
  return 'outros';
}
// A fila grava o código `forma` genérico (99) mas o `forma_nome` tem o real
// ("Cartão", "Crédito", "Pix"…). Prefere o NOME; sem nome, cai no código.
function _fcGrupoNome(nome, cod) {
  const n = String(nome || '').toLowerCase();
  if (n) {
    if (n.indexOf('dinheiro') >= 0) return 'dinheiro';
    if (n.indexOf('pix') >= 0) return 'pix';
    if (n.indexOf('créd') >= 0 || n.indexOf('cred') >= 0 || n === 'cartão' || n === 'cartao'
        || n.indexOf('déb') >= 0 || n.indexOf('deb') >= 0) return 'cartao';
    if (n.indexOf('prazo') >= 0) return 'prazo';
    if (n.indexOf('cheque') >= 0) return 'cheque';
  }
  return _fcGrupoForma(cod);
}
function fcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fcMoney(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fcNum(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
function _fcData(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : ''; }
function _fcHora(v) { return v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''; }

async function moduloFCaixa() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  const eid = ((typeof empresaAtiva === 'function') ? empresaAtiva() : perfil?.empresa_id);
  if (!eid) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._fcEmpresaId = eid;
  if (!window._fcDe || !window._fcAte) {
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 30 * 86400000);
    window._fcAte = hoje.toISOString().slice(0, 10);
    window._fcDe = de.toISOString().slice(0, 10);
  }
  await fcListar();
}

// Busca TODAS as páginas de uma consulta (o PostgREST corta em 1000 linhas por
// request — era isso que zerava os turnos a partir de 10/08: a fila do período
// passava de 1000 itens e os últimos dias ficavam de fora). fazQuery é uma
// função que MONTA a query (não dá p/ reusar o mesmo builder duas vezes).
async function _fcTudo(fazQuery) {
  const tudo = [];
  for (let p = 0; p < 20; p++) {               // teto de segurança: 20.000 linhas
    let lote = [];
    try {
      const { data } = await fazQuery().range(p * 1000, p * 1000 + 999);
      lote = data || [];
    } catch (e) { break; }
    tudo.push(...lote);
    if (lote.length < 1000) break;
  }
  return { data: tudo };
}

async function fcCarregarDados() {
  const eid = window._fcEmpresaId;
  const de = window._fcDe + 'T00:00:00';
  const ate = window._fcAte + 'T23:59:59';
  const { data: turnos } = await sb.from('oct_pdv_turnos').select('*')
    .eq('empresa_id', eid).gte('aberto_em', de).lte('aberto_em', ate)
    .order('aberto_em', { ascending: false });
  const lista = turnos || [];
  if (!lista.length) return { turnos: [], porTurno: {} };
  const ids = lista.map(t => t.id);
  // janela total do período p/ o que NÃO tem turno_id (recebimentos por horário)
  const janIni = lista.reduce((m, t) => t.aberto_em && t.aberto_em < m ? t.aberto_em : m, ate);
  const janFim = lista.reduce((m, t) => {
    const f = t.fechado_em || new Date().toISOString();
    return f > m ? f : m;
  }, de);
  const [vRes, cRes, fRes, rRes, vlRes, tRes] = await Promise.all([
    sb.from('oct_pdv_vendas').select('turno_id,valor_total,pagamentos,itens,status').eq('empresa_id', eid).in('turno_id', ids),
    sb.from('oct_pdv_caixa').select('turno_id,tipo,forma,valor,descricao').eq('empresa_id', eid).in('turno_id', ids),
    // FILA DE TRANSMISSÃO do PDV: abastecimento baixado mas ainda sem cupom.
    // CASA POR JANELA DE HORÁRIO (12/08): o turno_id da fila é nulo em ~70% dos
    // itens (a bomba/casamento no núcleo não conhece o turno). Então buscamos por
    // ocorrido_em dentro do período e atribuímos ao turno pela hora de abertura/
    // fechamento — o horário é sempre gravado, o turno_id não.
    _fcTudo(() => sb.from('oct_fila_transmissao').select('bico,descricao,litros,valor,forma,forma_nome,bandeira,desconto,acrescimo,ocorrido_em,recebido_em')
      .eq('empresa_id', eid).eq('status', 'fila')
      .gte('ocorrido_em', janIni).lte('ocorrido_em', janFim).order('ocorrido_em')),
    // RECEBIMENTOS (maquininha/cofre/sangria): sem turno_id — casa por horário.
    // Inclui a SANGRIA (origem='sangria') que o PDV espelha aqui.
    _fcTudo(() => sb.from('oct_recebimentos').select('origem,forma,bandeira,valor,parcelas,recebido_em,conciliado,cliente')
      .eq('empresa_id', eid).gte('recebido_em', janIni).lte('recebido_em', janFim).order('recebido_em')),
    // VALES / HAVER — tem turno_id, liga direto
    sb.from('oct_vales').select('turno_id,pessoa_nome,tipo,valor,descricao,operador,criado_em')
      .eq('empresa_id', eid).in('turno_id', ids)
      .then(r => r, () => ({ data: [] })),
    // TÍTULOS RECEBIDOS — baixa de nota a prazo antiga; no TecnoX entra no lado
    // Vendas/Saídas. Tem turno_id.
    sb.from('oct_recebimentos_titulo').select('turno_id,cliente_nome,valor,forma,juros,desconto,data_recebimento')
      .eq('empresa_id', eid).in('turno_id', ids)
      .then(r => r, () => ({ data: [] })),
  ]);
  const porTurno = {};
  ids.forEach(id => porTurno[id] = {
    venda_total: 0, venda_comb: 0, litros_comb: 0, venda_prod: 0,
    rec: { dinheiro: 0, cartao: 0, pix: 0, prazo: 0, cheque: 0, boleto: 0, outros: 0 },
    sangria: 0, suprimento: 0, despesa: 0, deposito: 0, receita: 0, outrosCaixa: 0, qtd_vendas: 0,
    fila_total: 0, fila_litros: 0, fila_itens: [],
    fila_sem_pgto: 0, fila_sem_pgto_itens: [],   // abastecido SEM pagamento confirmado (não entra no caixa)
    // v2 — movimentação completa
    sangria_f7: 0, sangrias_lst: [],
    vale_haver: 0, vale_desconto: 0, vales_lst: [],
    receb_ext: [], receb_ext_cartao: 0, receb_ext_pix: 0, receb_ext_cofre: 0,
    titulos: 0, titulos_lst: [],
  });
  // janela de cada turno, p/ atribuir recebimentos e fila por horário
  const janelas = lista.map(t => ({ id: t.id, ini: t.aberto_em, fim: t.fechado_em || new Date().toISOString() }));
  const janOrd = janelas.slice().sort((a, b) => String(a.ini || '').localeCompare(String(b.ini || '')));
  const _turnoDe = (iso) => {
    if (!iso) return null;
    const j = janelas.find(x => x.ini && iso >= x.ini && iso <= x.fim);
    return j ? j.id : null;
  };
  // FILA: janela exata; se cair num vão (bomba liberada com caixa fechado), joga
  // no PRÓXIMO turno que abrir (decisão do Ronan 12/08). Sem próximo → último.
  const _turnoFila = (iso) => {
    if (!iso) return janOrd.length ? janOrd[janOrd.length - 1].id : null;
    const dentro = janOrd.find(x => x.ini && iso >= x.ini && iso <= x.fim);
    if (dentro) return dentro.id;
    const prox = janOrd.find(x => x.ini && x.ini > iso);
    if (prox) return prox.id;
    return janOrd.length ? janOrd[janOrd.length - 1].id : null;
  };
  ((fRes && fRes.data) || []).forEach(f => {
    const tid = _turnoFila(f.ocorrido_em || f.recebido_em); const t = tid && porTurno[tid]; if (!t) return;
    const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
    const litros = Number(f.litros || 0);
    // REGRA (Ronan 14/08): fila só entra no CAIXA se o pagamento foi confirmado
    // (recebido_em). Abastecido sem pagamento = pendência de pista, não recebimento.
    if (!f.recebido_em) {
      t.fila_sem_pgto += vf; t.fila_sem_pgto_itens.push(f);
      return;
    }
    t.fila_total += vf; t.fila_litros += litros; t.fila_itens.push(f);
    t.venda_total += vf;
    if (litros > 0) { t.venda_comb += vf; t.litros_comb += litros; } else t.venda_prod += vf;
    const g = _fcGrupoNome(f.forma_nome, f.forma);   // fila: prefere o nome (código vem 99)
    t.rec[g] = (t.rec[g] || 0) + vf;
  });
  (vRes.data || []).forEach(v => {
    const t = porTurno[v.turno_id]; if (!t) return;
    if (String(v.status || '').toLowerCase() === 'cancelada') return;
    t.qtd_vendas++;
    t.venda_total += Number(v.valor_total || 0);
    (Array.isArray(v.itens) ? v.itens : []).forEach(it => {
      const val = Math.round((Number(it.qtd || 0) * Number(it.unit || 0)) * 100) / 100;
      if (it.tipo === 'abastecimento') { t.venda_comb += val; t.litros_comb += Number(it.qtd || 0); }
      else t.venda_prod += val;
    });
    (Array.isArray(v.pagamentos) ? v.pagamentos : []).forEach(p => {
      const g = _fcGrupoForma(p.forma);
      t.rec[g] = (t.rec[g] || 0) + Number(p.valor || 0);
    });
  });
  (cRes.data || []).forEach(m => {
    const t = porTurno[m.turno_id]; if (!t) return;
    const tipo = String(m.tipo || '').toLowerCase(); const val = Number(m.valor || 0);
    if (tipo.includes('sangria')) t.sangria += val;
    else if (tipo.includes('suprim')) t.suprimento += val;
    else if (tipo.includes('desp')) t.despesa += val;
    else if (tipo.includes('depos')) t.deposito += val;
    else if (tipo.includes('receita')) t.receita += val;
    else t.outrosCaixa += val;
  });
  // RECEBIMENTOS externos (maquininha/cofre/sangria) — casa por horário no turno.
  // NÃO entram no total de recebimentos do resultado (isso viria em dobro com os
  // cupons/fila); ficam como movimentação visível e conferência.
  ((rRes && rRes.data) || []).forEach(r => {
    const tid = _turnoDe(r.recebido_em); const t = tid && porTurno[tid]; if (!t) return;
    const origem = String(r.origem || '').toLowerCase();
    const forma = String(r.forma || '').toLowerCase();
    const val = Number(r.valor || 0);
    if (origem.includes('sangria')) {
      t.sangria_f7 += val; t.sangria += val; t.sangrias_lst.push(r);
    } else {
      t.receb_ext.push(r);
      if (forma.includes('pix')) t.receb_ext_pix += val;
      else if (origem.includes('cofre') || forma.includes('dinheiro')) t.receb_ext_cofre += val;
      else t.receb_ext_cartao += val;
    }
  });
  // VALES / HAVER — por turno_id. Sinal +: posto DEVE (haver do cliente); sinal -:
  // pessoa deve (vale de funcionário/consumo). Guarda os dois lados separados.
  ((vlRes && vlRes.data) || []).forEach(v => {
    const t = porTurno[v.turno_id]; if (!t) return;
    const val = Number(v.valor || 0);
    if (val >= 0) t.vale_haver += val; else t.vale_desconto += Math.abs(val);
    t.vales_lst.push(v);
  });
  // TÍTULOS RECEBIDOS (baixa de a-prazo antigo) — por turno_id
  ((tRes && tRes.data) || []).forEach(x => {
    const t = porTurno[x.turno_id]; if (!t) return;
    t.titulos += Number(x.valor || 0);
    t.titulos_lst.push(x);
  });
  // ---- CONFERÊNCIA DE CAIXA FÍSICO (dinheiro esperado × contado) ----
  // Modelo TecnoX: Falta/Sobra de Caixa = dinheiro CONTADO na gaveta − dinheiro
  // ESPERADO pelo sistema. Só DINHEIRO (cartão/pix/prazo não entram na gaveta).
  //   esperado = fundo abertura + vendas em dinheiro + suprimentos + receitas
  //              − sangrias − despesas em dinheiro − depósitos
  //   contado  = valor_fechamento (o operador informa ao fechar o turno)
  lista.forEach(t => {
    const d = porTurno[t.id]; if (!d) return;
    const abertura = Number(t.valor_abertura || 0);
    const entra = abertura + Number(d.rec.dinheiro || 0) + Number(d.suprimento || 0) + Number(d.receita || 0);
    const sai = Number(d.sangria || 0) + Number(d.despesa || 0) + Number(d.deposito || 0);
    d.dinheiro_esperado = Math.round((entra - sai) * 100) / 100;
    d.dinheiro_contado = (t.valor_fechamento != null) ? Number(t.valor_fechamento) : null; // null = ainda não contado
    d.diferenca_caixa = (d.dinheiro_contado == null) ? null : Math.round((d.dinheiro_contado - d.dinheiro_esperado) * 100) / 100;
    d.falta_caixa = (d.diferenca_caixa != null && d.diferenca_caixa < 0) ? -d.diferenca_caixa : 0;
    d.sobra_caixa = (d.diferenca_caixa != null && d.diferenca_caixa > 0) ? d.diferenca_caixa : 0;
  });
  return { turnos: lista, porTurno };
}

// ---------- LISTA (1ª tela do TecnoX) ----------
async function fcListar() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando turnos...</p>';
  const { turnos, porTurno } = await fcCarregarDados();
  window._fcCache = { turnos, porTurno };

  const linhas = turnos.map(t => {
    const d = porTurno[t.id] || {}; const rec = d.rec || {};
    const sit = String(t.status || '').toUpperCase();
    const corSit = sit.startsWith('ABERTO') ? '#c0392b' : '#127a2e';
    return `<tr onclick="fcDetalhe('${t.id}')" style="cursor:pointer" onmouseover="this.style.background='#1b2233'" onmouseout="this.style.background=''">
      <td class="fc-td">${t.numero ?? ''}</td>
      <td class="fc-td">${t.numero ?? ''}</td>
      <td class="fc-td">${fcEsc(t.operador) || ''}</td>
      <td class="fc-td">${_fcData(t.aberto_em)}</td>
      <td class="fc-td">${_fcHora(t.aberto_em)}</td>
      <td class="fc-td">${_fcData(t.fechado_em)}</td>
      <td class="fc-td">${_fcHora(t.fechado_em)}</td>
      <td class="fc-td" style="color:${corSit};font-weight:600">${sit}</td>
      <td class="fc-td fc-r" style="color:#e06c6c">${d.falta_caixa ? fcMoney(d.falta_caixa) : (d.diferenca_caixa == null ? '—' : '0,00')}</td>
      <td class="fc-td fc-r" style="color:#7ee2a0">${d.sobra_caixa ? fcMoney(d.sobra_caixa) : (d.diferenca_caixa == null ? '—' : '0,00')}</td>
      <td class="fc-td fc-r" style="font-weight:600;color:${d.diferenca_caixa == null ? '#667' : (Math.abs(d.diferenca_caixa) < 0.01 ? '#7ee2a0' : (d.diferenca_caixa < 0 ? '#e06c6c' : '#f0b45c'))}">${d.diferenca_caixa == null ? '—' : fcMoney(d.diferenca_caixa)}</td>
      <td class="fc-td fc-r">${fcMoney(d.venda_total)}</td>
      <td class="fc-td fc-r" style="color:#f0b45c;font-weight:600">${fcMoney(Number(d.venda_total || 0) + Number(d.vale_desconto || 0))}</td>
      <td class="fc-td fc-r">${fcMoney(rec.dinheiro)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.cartao)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.prazo)}</td>
      <td class="fc-td fc-r">${fcMoney(rec.cheque)}</td>
    </tr>`;
  }).join('');

  conteudo.innerHTML = `
    ${_fcEstilo()}
    <div class="fc-janela">
      <div class="fc-titbar">Fechamento de Caixa</div>
      <div class="fc-toolbar">
        <button class="fc-btn" disabled>✔ Confirmar Caixa</button>
        <button class="fc-btn" onclick="fcListar()">🔍 F4 - Pesquisar</button>
        <button class="fc-btn" onclick="fcLimparPeriodo()">🧽 F5 - Limpar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>🗒 F6 - Listar</button>
        <span class="fc-count">${turnos.length} de ${turnos.length}</span>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>➕ Incluir Caixa Zerado</button>
        <button class="fc-btn" disabled>📄 Importar XML</button>
      </div>
      <div class="fc-periodo">
        Período: <input type="date" id="fc-de" value="${window._fcDe}" class="fc-inp"> até
        <input type="date" id="fc-ate" value="${window._fcAte}" class="fc-inp">
        <button class="fc-btn azul" onclick="fcAplicarPeriodo()">🔍 F4 - Pesquisar</button>
      </div>
      <div class="fc-gridwrap">
        <table class="fc-grid">
          <thead><tr>
            <th>Seq.</th><th>Turno</th><th>Operador</th><th>Abertura</th><th>Hora Abert.</th>
            <th>Fechamento</th><th>Hora Fec.</th><th>Situação</th>
            <th>Falta Caixa</th><th>Sobra Caixa</th><th>Diferença Caixa</th>
            <th>Venda</th><th>Movimentado</th><th>Dinheiro</th><th>Cartão</th><th>Nota a prazo</th><th>Cheque</th>
          </tr></thead>
          <tbody>${linhas || '<tr><td colspan="17" style="padding:20px;text-align:center;color:#888">Nenhum turno no período.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function fcAplicarPeriodo() {
  const de = document.getElementById('fc-de')?.value, ate = document.getElementById('fc-ate')?.value;
  if (de) window._fcDe = de; if (ate) window._fcAte = ate; fcListar();
}
function fcLimparPeriodo() {
  const hoje = new Date(), d = new Date(hoje.getTime() - 30 * 86400000);
  window._fcAte = hoje.toISOString().slice(0, 10); window._fcDe = d.toISOString().slice(0, 10); fcListar();
}

// ---------- DETALHE (2ª tela do TecnoX) ----------
function fcDetalhe(turnoId) {
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  const d = (cache.porTurno || {})[turnoId] || {};
  if (!t) return;
  window._fcTurnoAtual = turnoId;
  const rec = d.rec || {};

  // MODELO TECNOX (12/08): os dois lados se igualam e o "Resultado do Caixa" fica
  // sempre 0 — a diferença real aparece em FALTA / SOBRA DE CAIXA (o plug). Cada
  // campo é preenchido da melhor fonte do Octano; o plug absorve o que ainda não
  // é capturado. Calibrar com um turno real do TecnoX lado a lado.
  // O balanço fecha por FORMA DE PAGAMENTO × VENDAS (o que se paga = o que se
  // vende). Os MOVIMENTOS de caixa (troco, depósito, despesa, sangria, vales)
  // são o destino/uso do MESMO dinheiro já contado — entram como (mov.), fora do
  // total, senão geram falta/sobra falsa. Troco é NET (fechamento − abertura):
  // fundo de caixa que não mudou não é sobra.
  const trocoNet = Number((Number(t.valor_fechamento || 0) - Number(t.valor_abertura || 0)).toFixed(2));
  const I = { info: true };
  // RECEBIMENTOS — formas de pagamento (entram no total) + movimentos (mov.)
  const recebBase = [
    ['Dinheiro', rec.dinheiro],
    ['Cartão', rec.cartao],
    ['Pix', rec.pix],
    ['Nota a prazo', rec.prazo],
    ['Cheque', rec.cheque],
    ['Carta Frete', 0],
    ['CTF', 0],
    ['Despesas', d.despesa, I],
    ['Deposito em Conta', d.deposito, I],
    ['Troco Final (líq.)', trocoNet, I],
    ['Vale Haver', d.vale_haver, I],
    ['Vale Motorista', d.vale_desconto, I],
  ];
  // VENDAS/SAÍDAS — o que gerou o movimento (entram no total) + movimentos (mov.)
  const vendasBase = [
    ['Venda produtos', d.venda_prod],
    ['Venda serviços', 0],
    ['Venda combustíveis', d.venda_comb],
    ['Títulos Recebidos', d.titulos],
    ['Remessas', d.suprimento, I],
    ['Cheque troco', 0, I],
    ['Haver', 0, I],
    ['Receitas', 0, I],
  ];
  const soma = (arr) => arr.reduce((s, r) => s + (r[2] && r[2].info ? 0 : Number(r[1] || 0)), 0);
  const somaReceb = soma(recebBase);
  const somaVenda = soma(vendasBase);
  // FALTA/SOBRA DE CAIXA = conferência de DINHEIRO FÍSICO (contado × esperado),
  // calculada em fcCarregarDados. NÃO é mais o plug venda×forma.
  const faltaCaixa = d.falta_caixa || 0;
  const sobraCaixa = d.sobra_caixa || 0;
  // Falta/Sobra aparecem nas colunas (layout TecnoX) mas NÃO somam nos totais:
  // desde 14/08 a falta vem da CONFERÊNCIA FÍSICA da gaveta, e o dinheiro dos
  // Recebimentos já vem completo do sistema (fila paga) — somar a falta contava
  // o mesmo dinheiro em dobro (ex.: 8.184,27 = 6.453,50 + 1.730,77 no turno 31).
  const receb = recebBase.concat([['Falta de Caixa (conf. gaveta)', faltaCaixa]]);
  const vendas = vendasBase.concat([['Sobra de Caixa (conf. gaveta)', sobraCaixa]]);
  const totalReceb = somaReceb;
  const totalVenda = somaVenda;
  const resultado = totalReceb - totalVenda;   // sistema × sistema: ~0 quando tudo casa

  // TOTAL MOVIMENTADO no caixa = tudo que passou (vendas/saídas: fila+transmitidos
  // + títulos recebidos).
  const totalMov = totalVenda;
  const cuponsTransm = Math.max(0, Number(d.venda_total || 0) - Number(d.fila_total || 0));

  const linhaVal = (rot, val, opt) => `<div class="fc-lin"><span class="fc-lbl">${rot}${opt && opt.info ? ' <span style="color:#6b7688;font-size:9px">(mov.)</span>' : ''}</span><span class="fc-box"${opt && opt.info ? ' style="opacity:.75"' : ''}>${fcMoney(val)}</span></div>`;
  const nodo = (txt, tipo) => `<li ${tipo ? `onclick="fcNode('${tipo}')" style="cursor:pointer"` : ''}>${txt}</li>`;

  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = `
    ${_fcEstilo()}
    <div class="fc-janela">
      <div class="fc-titbar">Fechamento de Caixa</div>
      <div class="fc-toolbar">
        <button class="fc-btn" onclick="fcListar()">↩ Voltar / Estornar</button>
        <button class="fc-btn" onclick="fcListar()">🔍 F4 - Pesquisar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" onclick="fcListar()">🗒 F6 - Listar</button>
        <span class="fc-sep"></span>
        <button class="fc-btn" disabled>➕ Incluir Caixa Zerado</button>
        <button class="fc-btn" disabled>📄 Importar XML</button>
      </div>

      <div class="fc-cab">
        <div><label>Seq.:</label><input value="${t.numero ?? ''}" class="fc-inp2" readonly></div>
        <div><label>Nº Turno:</label><input value="${t.numero ?? ''}" class="fc-inp2 mini" readonly></div>
        <div><label>Status:</label><input value="${fcEsc((t.status || '').toUpperCase())}" class="fc-inp2" readonly></div>
        <div><label>Abertura:</label><input value="${_fcData(t.aberto_em)}" class="fc-inp2 data" readonly></div>
        <div><label>Hora Aber.:</label><input value="${_fcHora(t.aberto_em)}" class="fc-inp2 mini" readonly></div>
        <div><label>Fechamento:</label><input value="${_fcData(t.fechado_em)}" class="fc-inp2 data" readonly></div>
        <div><label>Hora Fec.:</label><input value="${_fcHora(t.fechado_em)}" class="fc-inp2 mini" readonly></div>
      </div>
      <div class="fc-cab">
        <div><label>Vendedor:</label><input value="TODOS" class="fc-inp2 lg" readonly></div>
        <button class="fc-btn" disabled>Rateio</button>
        <div><label>Operador:</label><input value="${fcEsc(t.operador) || ''}" class="fc-inp2 lg" readonly></div>
        <div><label>PDV:</label><input value="PDV 01" class="fc-inp2 mini" readonly></div>
      </div>

      <div class="fc-corpo">
        <div class="fc-tree">
          <ul>
            ${nodo('📁 Principal')}
            <li>😊 Recebimentos<ul>
              ${nodo('💵 Dinheiro / Sangria', 'dinheiro')}${nodo('💳 Cartão', 'cartao')}${nodo('⚡ Pix', 'pix')}${nodo('📄 Nota a Prazo', 'prazo')}
              ${d.fila_total > 0.009 ? nodo('⏳ Fila de transmissão', 'fila') : ''}
              ${nodo('CTF', 'ctf')}${nodo('🧾 Cheque', 'cheque')}${nodo('🚚 Carta Frete', 'carta_frete')}${nodo('👷 Vale Motorista', 'vale_motorista')}
              ${nodo('Troco Final', 'troco_final')}${nodo('Vale Haver', 'vale_haver')}${nodo('Despesa', 'despesa')}${nodo('🏦 Depósito em Conta', 'deposito')}
            </ul></li>
            <li>😊 Vales / Haver<ul>
              ${nodo('🤝 Haver (crédito/troco)', 'vale_haver')}${nodo('👷 Vale / Consumo', 'vale_motorista')}${nodo('📒 Todos os vales', 'vales')}
            </ul></li>
            <li>📁 Remessas<ul>
              ${nodo('Suprimentos', 'suprimento')}${nodo('Haver', 'haver')}${nodo('Cheque Troco', 'cheque_troco')}${nodo('Títulos Recebidos', 'titulos')}${nodo('Receita', 'receita')}
            </ul></li>
            <li>📁 Diferença de Caixa<ul>
              ${nodo('🔴 Falta de Caixa', 'diferenca')}${nodo('🟢 Sobra de Caixa', 'diferenca')}
            </ul></li>
            <li>📁 Detalhes<ul>
              ${nodo('🧾 Movimentação completa', 'movimentacao')}
              ${nodo('💳 Recebimentos (maquininha/cofre)', 'receb_ext')}
              ${nodo('📑 Cupons Fiscais', 'cupons')}${nodo('👤 Demonstrativo Vendedor', 'vendedor')}
              ${nodo('📋 Itens Vendidos', 'itens')}${nodo('⛽ Combustível Vendido', 'combustivel')}
              ${nodo('🗑 Cancelamentos de Pista', 'cancelados')}
              ${nodo('📦 Estoque Fech. Caixa', 'estoque')}
            </ul></li>
          </ul>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Recebimentos</div>
          ${receb.map(r => linhaVal(r[0], r[1], r[2])).join('')}
          ${d.sangria_f7 > 0.009 ? `<div class="fc-lin" style="cursor:pointer" onclick="fcNode('dinheiro')"><span class="fc-lbl">Sangrias (retiradas) <span style="color:#6b7688;font-size:9px">(mov.)</span></span><span class="fc-box" style="opacity:.75">${fcMoney(d.sangria_f7)}</span></div>` : ''}
          <div class="fc-total"><span>Total Recebimentos:</span><span class="fc-box forte">${fcMoney(totalReceb)}</span></div>
          <div class="fc-total"><span>Resultado do Caixa</span><span class="fc-box ${Math.abs(resultado) < 0.01 ? 'ok' : 'alerta'}">${fcMoney(resultado)}</span></div>
          <div class="fc-total" style="border-top:2px solid #f97316;margin-top:6px"><span>💰 Total movimentado</span><span class="fc-box forte" style="background:#2a1e0f;border-color:#7a5a20;color:#f0b45c;cursor:pointer" onclick="fcNode('movimentacao')">${fcMoney(totalMov)}</span></div>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Vendas / Saídas</div>
          ${vendas.map(r => linhaVal(r[0], r[1], r[2])).join('')}
          <div class="fc-litros">${fcNum(d.litros_comb, 3)} L de combustível &nbsp;·&nbsp; ${d.qtd_vendas} cupons</div>
          ${d.fila_total > 0.009 ? `<div class="fc-litros" style="color:#fbbf24;cursor:pointer" onclick="fcNode('fila')">⏳ ${(d.fila_itens || []).length} abastecimento(s) pagos na fila de transmissão: ${fcMoney(d.fila_total)} (já somados acima — clique p/ detalhar)</div>` : ''}
          ${d.fila_sem_pgto > 0.009 ? `<div class="fc-litros" style="color:#e06c6c">⚠ ${(d.fila_sem_pgto_itens || []).length} abastecimento(s) SEM pagamento confirmado: ${fcMoney(d.fila_sem_pgto)} (fora do caixa — pendência de pista)</div>` : ''}
          <div class="fc-total"><span>Total Vendas / Saída:</span><span class="fc-box forte azulf">${fcMoney(totalVenda)}</span></div>
          <div class="fc-total" style="border-top:2px solid #f97316;margin-top:6px">
            <span>💰 Total movimentado no caixa</span>
            <span class="fc-box forte" style="background:#2a1e0f;border-color:#7a5a20;color:#f0b45c;cursor:pointer" onclick="fcNode('movimentacao')">${fcMoney(totalMov)}</span>
          </div>
          <div class="fc-litros">Fila ${fcMoney(d.fila_total)} + Transmitidos ${fcMoney(cuponsTransm)}${d.vale_desconto > 0.009 ? ' + Vale/consumo ' + fcMoney(d.vale_desconto) : ''}${rec.prazo > 0.009 ? ' · (nota a prazo ' + fcMoney(rec.prazo) + ' já incluída nas vendas)' : ''}</div>
        </div>

        <div class="fc-painel">
          <div class="fc-obscab"><span>Observação:</span><button class="fc-btn mini" onclick="fcSalvarObs()">💾 Salvar Obs.</button></div>
          <textarea id="fc-obs" class="fc-obs" placeholder="Observações do caixa...">${fcEsc(t.observacao || '')}</textarea>
          <div style="background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;margin-top:10px">
            <div style="color:#f0b45c;font-weight:700;font-size:0.82rem;margin-bottom:6px">💵 Conferência de Caixa (dinheiro)</div>
            <div style="font-size:0.78rem;color:#b8c4d0;line-height:1.7">
              <div style="display:flex;justify-content:space-between"><span>Fundo de abertura</span><b>${fcMoney(t.valor_abertura)}</b></div>
              <div style="display:flex;justify-content:space-between"><span>+ Vendas em dinheiro</span><b>${fcMoney(rec.dinheiro)}</b></div>
              ${d.suprimento > 0.009 ? `<div style="display:flex;justify-content:space-between"><span>+ Suprimentos</span><b>${fcMoney(d.suprimento)}</b></div>` : ''}
              ${d.receita > 0.009 ? `<div style="display:flex;justify-content:space-between"><span>+ Receitas</span><b>${fcMoney(d.receita)}</b></div>` : ''}
              ${d.sangria > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Sangrias</span><b>${fcMoney(d.sangria)}</b></div>` : ''}
              ${d.despesa > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Despesas</span><b>${fcMoney(d.despesa)}</b></div>` : ''}
              ${d.deposito > 0.009 ? `<div style="display:flex;justify-content:space-between;color:#e0a0a0"><span>− Depósitos</span><b>${fcMoney(d.deposito)}</b></div>` : ''}
              <div style="display:flex;justify-content:space-between;border-top:1px solid #2a3a4a;margin-top:4px;padding-top:4px"><span>= Esperado na gaveta</span><b style="color:#7ea8d8">${fcMoney(d.dinheiro_esperado)}</b></div>
              <div style="display:flex;justify-content:space-between"><span>Contado (operador)</span><b>${d.dinheiro_contado == null ? '—' : fcMoney(d.dinheiro_contado)}</b></div>
              <div style="display:flex;justify-content:space-between;font-size:0.92rem;margin-top:4px"><span style="font-weight:700">${d.diferenca_caixa == null ? 'Turno em aberto' : (Math.abs(d.diferenca_caixa) < 0.01 ? '✓ Caixa confere' : (d.diferenca_caixa < 0 ? '🔴 FALTA' : '🟢 SOBRA'))}</span><b style="color:${d.diferenca_caixa == null ? '#667' : (Math.abs(d.diferenca_caixa) < 0.01 ? '#7ee2a0' : (d.diferenca_caixa < 0 ? '#e06c6c' : '#7ee2a0'))}">${d.diferenca_caixa == null ? '' : fcMoney(Math.abs(d.diferenca_caixa))}</b></div>
            </div>
            ${d.dinheiro_contado != null ? `<button class="fc-btn2" style="margin-top:8px;width:100%;border-color:#2a5a3a;color:#7be0a0" onclick="fcConfirmarCaixa('${turnoId}')">✔ Confirmar conferência</button>` : '<div style="font-size:0.72rem;color:#667;margin-top:6px">Turno ainda aberto — a conferência fecha quando o operador informar o dinheiro contado.</div>'}
          </div>
          ${(() => {
            // 🏦 CONCILIAÇÃO BANCÁRIA — o que o SISTEMA registrou (vendas+fila paga)
            // × o que a MAQUININHA reportou (oct_recebimentos EDI/e-mail), por forma.
            const sisCartao = Number(rec.cartao || 0);
            const sisPix = Number(rec.pix || 0);
            const maqCartao = Number(d.receb_ext_cartao || 0);
            const maqPix = Number(d.receb_ext_pix || 0);
            if (sisCartao < 0.01 && sisPix < 0.01 && maqCartao < 0.01 && maqPix < 0.01) return '';
            const linha = (nome, sis, maq) => {
              const dif = Math.round((maq - sis) * 100) / 100;
              const ok = Math.abs(dif) < 0.01;
              const semMaq = maq < 0.01 && sis >= 0.01;
              return `<div style="display:flex;justify-content:space-between"><span>${nome} — sistema</span><b>${fcMoney(sis)}</b></div>
                <div style="display:flex;justify-content:space-between"><span>${nome} — maquininha</span><b>${semMaq ? '<span style="color:#8892a0">sem dados</span>' : fcMoney(maq)}</b></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #223044;margin-bottom:4px;padding-bottom:4px"><span style="font-weight:700">${semMaq ? '⚠ sem retorno da maquininha' : (ok ? '✓ concilia' : 'Diferença')}</span><b style="color:${semMaq ? '#f0b45c' : (ok ? '#7ee2a0' : '#e06c6c')}">${semMaq ? '' : fcMoney(Math.abs(dif))}</b></div>`;
            };
            return `<div style="background:#0f1520;border:1px solid #2a3a4a;border-radius:8px;padding:10px 12px;margin-top:10px">
              <div style="color:#7ea8d8;font-weight:700;font-size:0.82rem;margin-bottom:6px">🏦 Conciliação bancária (cartão/pix)</div>
              <div style="font-size:0.78rem;color:#b8c4d0;line-height:1.7">
                ${linha('Cartão', sisCartao, maqCartao)}
                ${linha('Pix', sisPix, maqPix)}
              </div>
              <div style="font-size:0.7rem;color:#667;margin-top:4px">Maquininha = recebimentos EDI/e-mail do período do turno. "Sem dados" = ingestão parada ou D-1 ainda não chegou.</div>
            </div>`;
          })()}
          <button class="fc-btn2" onclick="fcNode('demonstrativo')">📊 Demonstrativo do Caixa</button>
          <button class="fc-btn2" onclick="fcNode('encerrantes')">🔢 Encerrantes</button>
          <button class="fc-btn2" onclick="fcNode('itens')">📋 Rel. itens vendidos</button>
          <button class="fc-btn2" disabled>🔄 Reseta itens</button>
          <button class="fc-btn2" disabled>💳 Importar Cartões (Conciliação Automática)</button>
          <div class="fc-adgrid">
            <label>Acréscimo:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desconto:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Acresc. Manual:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Acresc. Especial:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desc. Manual:</label><input class="fc-inp3" value="0,00" readonly>
            <label>Desc. Especial:</label><input class="fc-inp3" value="0,00" readonly>
          </div>
        </div>
      </div>
    </div>`;
}

// Nós de "Detalhes" com dado real do octano (lazy load).
async function fcNode(tipo) {
  const turnoId = window._fcTurnoAtual; if (!turnoId) return;
  // nós v2 — lidos do cache (movimentação completa do PDV)
  if (tipo === 'vale_haver' || tipo === 'vale_motorista' || tipo === 'vales'
      || tipo === 'movimentacao' || tipo === 'receb_ext' || tipo === 'titulos') {
    return fcNodeMov(tipo);
  }
  if (tipo === 'cupons' || tipo === 'itens' || tipo === 'combustivel' || tipo === 'vendedor') {
    fcModal('Carregando...', '<p style="padding:20px;color:#888">Buscando...</p>');
    const { data: vendas } = await sb.from('oct_pdv_vendas')
      .select('numero,valor_total,itens,pagamentos,status,vendedor,operador,data_venda')
      .eq('turno_id', turnoId).order('numero');
    const vs = (vendas || []).filter(v => String(v.status || '').toLowerCase() !== 'cancelada');
    if (tipo === 'cupons') return fcModalCupons(vs);
    if (tipo === 'itens') return fcModalItens(vs);
    if (tipo === 'combustivel') return fcModalCombustivel(vs);
    if (tipo === 'vendedor') return fcModalVendedor(vs);
  } else if (FC_DETALHES[tipo]) {
    return fcNodeDetalhe(tipo);
  } else {
    fcModal(tipo, '<p style="padding:24px;color:#777">Este detalhe será ligado na próxima etapa.</p>');
  }
}

// ---------- BALÕES da árvore lateral: detalhamento de cada recebimento/remessa ----------
const FC_DETALHES = {
  dinheiro:       { titulo: '💵 Dinheiro / Sangria', formas: ['01'], caixa: ['sangria'], cofre: true },
  cartao:         { titulo: '💳 Cartão', formas: ['03', '04', '10', '11', '12', '13'], maq: ['créd', 'cred', 'déb', 'deb'] },
  pix:            { titulo: '⚡ Pix', formas: ['17', '18', '19'], maq: ['pix'] },
  prazo:          { titulo: '📄 Nota a Prazo', formas: ['05', '99', '90'] },
  cheque:         { titulo: '🧾 Cheque', formas: ['02'] },
  ctf:            { titulo: 'CTF', formas: [] },
  carta_frete:    { titulo: '🚚 Carta Frete', formas: [] },
  vale_motorista: { titulo: '👷 Vale Motorista', formas: [] },
  troco_final:    { titulo: 'Troco Final', formas: [] },
  vale_haver:     { titulo: 'Vale Haver', formas: [] },
  despesa:        { titulo: 'Despesas', caixa: ['desp'] },
  deposito:       { titulo: '🏦 Depósito em Conta', caixa: ['depos'] },
  suprimento:     { titulo: 'Suprimentos', caixa: ['suprim'] },
  haver:          { titulo: 'Haver', formas: [] },
  cheque_troco:   { titulo: 'Cheque Troco', formas: [] },
  titulos:        { titulo: 'Títulos Recebidos', formas: [] },
  receita:        { titulo: 'Receitas', caixa: ['receita'] },
  diferenca:      { titulo: 'Diferença de Caixa', especial: 'diferenca' },
  fila:           { titulo: '⏳ Fila de transmissão (PDV)', especial: 'fila' },
  cancelados:     { titulo: '🗑 Cancelamentos de Pista', especial: 'cancelados' },
};

async function fcNodeDetalhe(tipo) {
  const cfg = FC_DETALHES[tipo];
  const turnoId = window._fcTurnoAtual;
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  if (!cfg || !t) return;
  fcModal(cfg.titulo, '<p style="padding:20px;color:#888">Buscando...</p>');

  // fila de transmissão: lista do cache (já veio no fcCarregarDados)
  if (cfg.especial === 'fila') {
    const d0 = (cache.porTurno || {})[turnoId] || {};
    const its = d0.fila_itens || [];
    const linhas = its.map(f => {
      const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
      return `<tr><td class="fc-td">${fcEsc(f.descricao) || '—'}</td>
        <td class="fc-td">${f.bico ?? '—'}</td>
        <td class="fc-td fc-r">${Number(f.litros || 0) ? fcNum(f.litros, 2) + ' L' : '—'}</td>
        <td class="fc-td">${fcEsc(f.forma_nome || f.forma) || '—'}${f.bandeira ? ' ' + fcEsc(f.bandeira) : ''}</td>
        <td class="fc-td fc-r">${fcMoney(f.valor)}</td>
        <td class="fc-td fc-r">${(Number(f.desconto || 0) || Number(f.acrescimo || 0)) ? fcMoney(vf) : '—'}</td></tr>`;
    });
    fcModal(cfg.titulo, its.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Abastecimentos baixados no PDV aguardando NFC-e. Já estão SOMADOS nos totais do caixa; desconto/acréscimo é lançado na aba NFC-e do retaguarda.</p>
         <table class="fc-grid"><thead><tr><th>Combustível/Produto</th><th>Bico</th><th>Litros</th><th>Forma</th><th>Valor</th><th>Valor c/ ajuste</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r" colspan="2"><b>${fcMoney(d0.fila_total)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum abastecimento na fila deste caixa.</p>');
    return;
  }

  // cancelamentos de pista: abastecimentos cancelados na janela do turno
  if (cfg.especial === 'cancelados') {
    const ini0 = t.aberto_em, fim0 = t.fechado_em || new Date().toISOString();
    let cs = [];
    try {
      const r = await sb.from('oct_abastecimentos_cancelados').select('*')
        .eq('empresa_id', window._fcEmpresaId)
        .gte('ocorrido_em', ini0).lte('ocorrido_em', fim0).order('ocorrido_em');
      cs = r.data || [];
    } catch (e) { /* tabela pode não existir ainda */ }
    const linhas = cs.map(c => `<tr>
      <td class="fc-td">${_fcHora(c.ocorrido_em)}</td>
      <td class="fc-td">${c.bico ?? '—'}</td>
      <td class="fc-td">${fcEsc(c.combustivel) || '—'}</td>
      <td class="fc-td fc-r">${fcNum(c.litros, 3)} L</td>
      <td class="fc-td fc-r">${fcMoney(c.valor)}</td>
      <td class="fc-td">${fcEsc(c.vendedor) || '—'}</td>
      <td class="fc-td">${c.motivo ? fcEsc(c.motivo) + (c.operador ? ` <span style="color:#888">(${fcEsc(c.operador)})</span>` : '')
        : '<b style="color:#f87171">⚠ SEM MOTIVO (fora do PDV)</b>'}</td></tr>`);
    const totC = cs.reduce((s, c) => s + Number(c.valor || 0), 0);
    fcModal(cfg.titulo, cs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Combustível que SAIU DA BOMBA e teve o registro cancelado. Sem motivo = cancelado por fora do fluxo oficial do PDV.</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Bico</th><th>Combustível</th><th>Litros</th><th>Valor</th><th>Frentista</th><th>Motivo</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(totC)}</b></td><td class="fc-td" colspan="2"></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum cancelamento de pista neste caixa. ✓</p>');
    return;
  }

  // diferença de caixa: mostra a conta, sem consulta extra
  if (cfg.especial === 'diferenca') {
    const d = (cache.porTurno || {})[turnoId] || {};
    const rec = d.rec || {};
    const totalReceb = Number(rec.dinheiro || 0) + Number(rec.cartao || 0) + Number(rec.pix || 0) +
      Number(rec.prazo || 0) + Number(rec.cheque || 0) + Number(d.despesa || 0) + Number(d.deposito || 0);
    const totalVenda = Number(d.venda_prod || 0) + Number(d.venda_comb || 0) + Number(d.suprimento || 0);
    const dif = totalReceb - totalVenda;
    fcModal(cfg.titulo, `
      <div style="padding:16px;font-size:0.9rem;color:#cdd6e0">
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Total de recebimentos</span><b>${fcMoney(totalReceb)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:5px 0"><span>Total de vendas / saídas</span><b>${fcMoney(totalVenda)}</b></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #2a2d3e;margin-top:6px">
          <span>${dif < -0.009 ? '🔴 FALTA de caixa' : dif > 0.009 ? '🟢 SOBRA de caixa' : '✓ Caixa fechado sem diferença'}</span>
          <b style="color:${dif < -0.009 ? '#f87171' : dif > 0.009 ? '#4ade80' : '#cdd6e0'}">${fcMoney(Math.abs(dif))}</b>
        </div>
      </div>`);
    return;
  }

  // consultas do turno (vendas por forma, movimentos de caixa, maquininha/cofre no período)
  const eid = window._fcEmpresaId;
  const ini = t.aberto_em, fim = t.fechado_em || new Date().toISOString();
  const pedidos = [
    (cfg.formas && cfg.formas.length)
      ? sb.from('oct_pdv_vendas').select('numero,data_venda,vendedor,operador,cliente_nome,valor_total,pagamentos,status').eq('turno_id', turnoId).order('data_venda')
      : Promise.resolve({ data: [] }),
    (cfg.caixa && cfg.caixa.length)
      ? sb.from('oct_pdv_caixa').select('tipo,forma,valor,descricao,operador,criado_em').eq('turno_id', turnoId).order('criado_em')
      : Promise.resolve({ data: [] }),
    (cfg.maq || cfg.cofre)
      ? sb.from('oct_recebimentos').select('recebido_em,forma,bandeira,valor,origem,parcelas').eq('empresa_id', eid)
          .gte('recebido_em', ini).lte('recebido_em', fim).order('recebido_em')
      : Promise.resolve({ data: [] }),
  ];
  const [rV, rC, rR] = await Promise.all(pedidos);
  const secoes = [];
  const tab = (cab, linhas, rodape) => `<table class="fc-grid"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.join('')}${rodape || ''}</tbody></table>`;
  const stit = txt => `<div style="padding:10px 4px 4px;color:#f97316;font-weight:700;font-size:0.82rem">${txt}</div>`;

  // 1) CUPONS pagos na(s) forma(s)
  if (cfg.formas && cfg.formas.length) {
    const vs = (rV.data || []).filter(v => String(v.status || '').toLowerCase() !== 'cancelada');
    const linhas = []; let total = 0;
    vs.forEach(v => (v.pagamentos || []).forEach(p => {
      if (!cfg.formas.includes(String(p.forma || '').padStart(2, '0'))) return;
      total += Number(p.valor || 0);
      linhas.push(`<tr><td class="fc-td">${v.numero ?? ''}</td>
        <td class="fc-td">${_fcHora(v.data_venda)}</td>
        <td class="fc-td">${fcEsc(v.cliente_nome || v.vendedor || v.operador) || '—'}</td>
        <td class="fc-td fc-r">${fcMoney(p.valor)}</td></tr>`);
    }));
    secoes.push(stit(`Cupons do caixa (${linhas.length})`));
    secoes.push(linhas.length
      ? tab(['Cupom', 'Hora', tipo === 'prazo' ? 'Cliente' : 'Vendedor/Cliente', 'Valor'], linhas,
            `<tr><td class="fc-td" colspan="3"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum cupom nesta forma neste caixa.</p>');

    // 1b) itens da FILA DE TRANSMISSÃO baixados nesta(s) forma(s) — eles somam
    // na coluna do fechamento, então o balão TEM que mostrá-los também
    const d0 = (cache.porTurno || {})[turnoId] || {};
    // casa pelo GRUPO (via forma_nome), não pelo código — a fila grava forma=99
    const fsFila = (d0.fila_itens || []).filter(f => _fcGrupoNome(f.forma_nome, f.forma) === tipo);
    if (fsFila.length) {
      let totF = 0;
      const linF = fsFila.map(f => {
        const vf = Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0);
        totF += vf;
        return `<tr><td class="fc-td">${fcEsc(f.descricao) || '—'}</td>
          <td class="fc-td">${f.bico ?? '—'}</td>
          <td class="fc-td fc-r">${Number(f.litros || 0) ? fcNum(f.litros, 2) + ' L' : '—'}</td>
          <td class="fc-td">${fcEsc(f.forma_nome || f.forma) || '—'}${f.bandeira ? ' ' + fcEsc(f.bandeira) : ''}</td>
          <td class="fc-td fc-r">${fcMoney(vf)}</td></tr>`;
      });
      secoes.push(stit(`⏳ Na fila de transmissão (${fsFila.length}) — aguardando NFC-e`));
      secoes.push(tab(['Combustível/Produto', 'Bico', 'Litros', 'Forma', 'Valor'], linF,
        `<tr><td class="fc-td" colspan="4"><b>Total na fila</b></td><td class="fc-td fc-r"><b>${fcMoney(totF)}</b></td></tr>`));
    }
  }

  // 2) MOVIMENTOS DE CAIXA (sangria/suprimento/despesa/depósito/receita)
  if (cfg.caixa && cfg.caixa.length) {
    const ms = (rC.data || []).filter(m => cfg.caixa.some(p => String(m.tipo || '').toLowerCase().includes(p)));
    const linhas = ms.map(m => `<tr><td class="fc-td">${_fcHora(m.criado_em)}</td>
      <td class="fc-td">${fcEsc(m.descricao) || '—'}</td><td class="fc-td">${fcEsc(m.forma) || '—'}</td>
      <td class="fc-td fc-r">${fcMoney(m.valor)}</td></tr>`);
    const total = ms.reduce((s, m) => s + Number(m.valor || 0), 0);
    secoes.push(stit(`${tipo === 'dinheiro' ? 'Sangrias' : cfg.titulo} do caixa (${ms.length})`));
    secoes.push(ms.length
      ? tab(['Hora', 'Descrição', 'Forma', 'Valor'], linhas,
            `<tr><td class="fc-td" colspan="3"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum lançamento neste caixa.</p>');
  }

  // 3) MAQUININHA por BANDEIRA (cartão/pix) — recebimentos EDI no período do turno
  if (cfg.maq) {
    const rs = (rR.data || []).filter(r => cfg.maq.some(p => String(r.forma || '').toLowerCase().includes(p)));
    const porBand = {};
    rs.forEach(r => {
      const b = (r.bandeira || r.forma || '—');
      porBand[b] = porBand[b] || { qtd: 0, total: 0 };
      porBand[b].qtd++; porBand[b].total += Number(r.valor || 0);
    });
    const linhas = Object.entries(porBand).sort((a, b) => b[1].total - a[1].total)
      .map(([b, x]) => `<tr><td class="fc-td">${fcEsc(b)}</td><td class="fc-td fc-r">${x.qtd}</td><td class="fc-td fc-r">${fcMoney(x.total)}</td></tr>`);
    const total = rs.reduce((s, r) => s + Number(r.valor || 0), 0);
    secoes.push(stit(`Maquininha por bandeira (${rs.length} transações no período do turno)`));
    secoes.push(rs.length
      ? tab(['Bandeira', 'Qtd', 'Total'], linhas,
            `<tr><td class="fc-td" colspan="2"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Sem transações da maquininha no período (EDI).</p>');
  }

  // 4) DEPÓSITOS DO COFRE (dinheiro)
  if (cfg.cofre) {
    const rs = (rR.data || []).filter(r => String(r.origem || '').toLowerCase().includes('cofre') ||
      String(r.forma || '').toLowerCase().includes('dinheiro'));
    const linhas = rs.map(r => `<tr><td class="fc-td">${_fcHora(r.recebido_em)}</td>
      <td class="fc-td">${fcEsc(r.origem) || 'cofre'}</td><td class="fc-td fc-r">${fcMoney(r.valor)}</td></tr>`);
    const total = rs.reduce((s, r) => s + Number(r.valor || 0), 0);
    secoes.push(stit(`Depósitos no cofre (${rs.length})`));
    secoes.push(rs.length
      ? tab(['Hora', 'Origem', 'Valor'], linhas,
            `<tr><td class="fc-td" colspan="2"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(total)}</b></td></tr>`)
      : '<p style="padding:6px 8px;color:#777">Nenhum depósito no cofre no período do turno.</p>');
  }

  if (!secoes.length)
    secoes.push('<p style="padding:24px;color:#777">Sem lançamentos deste tipo neste caixa (o octano ainda não movimenta esta categoria).</p>');
  fcModal(cfg.titulo, secoes.join(''));
}
// ---------- Nós de MOVIMENTAÇÃO (vales, recebimentos externos, ledger) ----------
const _VALE_ROT = {
  credito_adiantado: 'Crédito adiantado', troco_pendente: 'Troco pendente',
  vale_funcionario: 'Vale funcionário', consumo: 'Consumo', liquidacao: 'Liquidação',
};
function fcNodeMov(tipo) {
  const turnoId = window._fcTurnoAtual;
  const cache = window._fcCache || {};
  const d = (cache.porTurno || {})[turnoId] || {};

  if (tipo === 'titulos') {
    const ts = d.titulos_lst || [];
    const linhas = ts.map(x => `<tr><td class="fc-td">${_fcData(x.data_recebimento)}</td>
      <td class="fc-td">${fcEsc(x.cliente_nome) || '—'}</td>
      <td class="fc-td">${fcEsc(x.forma) || '—'}</td>
      <td class="fc-td fc-r">${(Number(x.juros || 0) || Number(x.desconto || 0)) ? '+' + fcMoney(x.juros) + ' / -' + fcMoney(x.desconto) : '—'}</td>
      <td class="fc-td fc-r">${fcMoney(x.valor)}</td></tr>`);
    const tot = ts.reduce((s, x) => s + Number(x.valor || 0), 0);
    return fcModal('💵 Títulos Recebidos (baixa de a-prazo)', ts.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Clientes que pagaram nota a prazo antiga neste turno. Entra no lado Vendas/Saídas do fechamento.</p>
         <table class="fc-grid"><thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Juros/Desc.</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="4"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum título recebido neste caixa.</p>');
  }

  if (tipo === 'vale_haver' || tipo === 'vale_motorista' || tipo === 'vales') {
    let vs = d.vales_lst || [];
    if (tipo === 'vale_haver') vs = vs.filter(v => Number(v.valor || 0) >= 0);
    else if (tipo === 'vale_motorista') vs = vs.filter(v => Number(v.valor || 0) < 0);
    const linhas = vs.map(v => {
      const val = Number(v.valor || 0);
      return `<tr><td class="fc-td">${_fcHora(v.criado_em)}</td>
        <td class="fc-td">${fcEsc(v.pessoa_nome) || '—'}</td>
        <td class="fc-td">${_VALE_ROT[v.tipo] || fcEsc(v.tipo) || '—'}</td>
        <td class="fc-td">${fcEsc(v.descricao) || ''}</td>
        <td class="fc-td">${fcEsc(v.operador) || '—'}</td>
        <td class="fc-td fc-r" style="color:${val >= 0 ? '#7ee2a0' : '#f0b45c'}">${fcMoney(val)}</td></tr>`;
    });
    const tot = vs.reduce((s, v) => s + Number(v.valor || 0), 0);
    const tit = tipo === 'vale_haver' ? '🤝 Haver (o posto deve)' : tipo === 'vale_motorista' ? '👷 Vale / Consumo (a pessoa deve)' : '📒 Vales do caixa';
    return fcModal(tit, vs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Conta corrente das pessoas neste turno. Positivo = haver do cliente (posto deve); negativo = vale a descontar (pessoa deve).</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Pessoa</th><th>Tipo</th><th>Obs.</th><th>Operador</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="5"><b>Saldo do turno</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum vale/haver neste caixa.</p>');
  }

  if (tipo === 'receb_ext') {
    const rs = d.receb_ext || [];
    const linhas = rs.map(r => `<tr><td class="fc-td">${_fcHora(r.recebido_em)}</td>
      <td class="fc-td">${fcEsc(r.origem) || '—'}</td>
      <td class="fc-td">${fcEsc(r.forma) || '—'}${r.bandeira ? ' ' + fcEsc(r.bandeira) : ''}</td>
      <td class="fc-td">${r.parcelas ? fcEsc(r.parcelas) + 'x' : ''}</td>
      <td class="fc-td">${r.conciliado ? '✓' : '—'}</td>
      <td class="fc-td fc-r">${fcMoney(r.valor)}</td></tr>`);
    const tot = rs.reduce((s, r) => s + Number(r.valor || 0), 0);
    return fcModal('💳 Recebimentos (maquininha / cofre / Pix)', rs.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Tudo que entrou pela maquininha, cofre e Pix no período do turno (EDI/cofre). Já casa com os cupons/fila — aqui é a conferência bruta, casado ou não.</p>
         <div style="display:flex;gap:14px;padding:4px 10px;color:#9fb0c4;font-size:0.78rem">
           <span>Cartão: <b>${fcMoney(d.receb_ext_cartao)}</b></span>
           <span>Pix: <b>${fcMoney(d.receb_ext_pix)}</b></span>
           <span>Cofre/dinheiro: <b>${fcMoney(d.receb_ext_cofre)}</b></span></div>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Origem</th><th>Forma</th><th>Parc.</th><th>Casado</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}<tr><td class="fc-td" colspan="5"><b>Total</b></td><td class="fc-td fc-r"><b>${fcMoney(tot)}</b></td></tr></tbody></table>`
      : '<p style="padding:24px;color:#777">Nenhum recebimento de maquininha/cofre no período.</p>');
  }

  // MOVIMENTAÇÃO COMPLETA — ledger único de tudo do turno, em ordem de horário
  if (tipo === 'movimentacao') {
    const ev = [];
    (d.sangrias_lst || []).forEach(s => ev.push([s.recebido_em, '💰 Sangria', 'retirada de dinheiro', -Number(s.valor || 0)]));
    (d.receb_ext || []).forEach(r => ev.push([r.recebido_em, '💳 Recebimento', (r.origem || '') + ' ' + (r.forma || ''), Number(r.valor || 0)]));
    (d.vales_lst || []).forEach(v => ev.push([v.criado_em, (Number(v.valor || 0) >= 0 ? '🤝 Haver' : '👷 Vale'), (v.pessoa_nome || '') + ' · ' + (_VALE_ROT[v.tipo] || v.tipo || ''), Number(v.valor || 0)]));
    (d.fila_itens || []).forEach(f => ev.push([f.atualizado_em, '⏳ Fila NFC-e', (f.descricao || '') + ' (bico ' + (f.bico ?? '?') + ')', Number(f.valor || 0) - Number(f.desconto || 0) + Number(f.acrescimo || 0)]));
    ev.sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));
    const linhas = ev.map(e => `<tr><td class="fc-td">${_fcHora(e[0])}</td>
      <td class="fc-td">${e[1]}</td><td class="fc-td">${fcEsc(e[2])}</td>
      <td class="fc-td fc-r" style="color:${e[3] >= 0 ? '#7ee2a0' : '#f0b45c'}">${fcMoney(e[3])}</td></tr>`);
    return fcModal('🧾 Movimentação completa do turno', ev.length
      ? `<p style="padding:8px 10px;color:#888;font-size:0.78rem">Todo movimento do PDV neste turno, em ordem de horário: sangrias, recebimentos de maquininha/cofre, vales/haver e a fila de NFC-e. Vendas fiscais estão em "Cupons Fiscais".</p>
         <table class="fc-grid"><thead><tr><th>Hora</th><th>Movimento</th><th>Detalhe</th><th>Valor</th></tr></thead>
         <tbody>${linhas.join('')}</tbody></table>`
      : '<p style="padding:24px;color:#777">Sem movimentação registrada além dos cupons neste turno.</p>');
  }
}

function fcModalCupons(vs) {
  const linhas = vs.map(v => `<tr><td class="fc-td">${v.numero ?? ''}</td>
    <td class="fc-td">${v.data_venda ? new Date(v.data_venda).toLocaleString('pt-BR') : ''}</td>
    <td class="fc-td">${fcEsc(v.vendedor) || ''}</td>
    <td class="fc-td fc-r">${fcMoney(v.valor_total)}</td>
    <td class="fc-td">${(v.pagamentos || []).map(p => p.forma).join(',')}</td></tr>`).join('');
  fcModal('Cupons Fiscais', `<table class="fc-grid"><thead><tr><th>Nº</th><th>Data</th><th>Vendedor</th><th>Valor</th><th>Formas</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModalItens(vs) {
  const map = {};
  vs.forEach(v => (v.itens || []).forEach(it => {
    const k = it.cod || it.desc || '?';
    if (!map[k]) map[k] = { desc: it.desc || it.cod, qtd: 0, valor: 0 };
    map[k].qtd += Number(it.qtd || 0);
    map[k].valor += Math.round(Number(it.qtd || 0) * Number(it.unit || 0) * 100) / 100;
  }));
  const linhas = Object.values(map).sort((a, b) => b.valor - a.valor).map(m => `<tr>
    <td class="fc-td">${fcEsc(m.desc)}</td><td class="fc-td fc-r">${fcNum(m.qtd, 3)}</td><td class="fc-td fc-r">${fcMoney(m.valor)}</td></tr>`).join('');
  fcModal('Itens Vendidos', `<table class="fc-grid"><thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModalCombustivel(vs) {
  const map = {};
  vs.forEach(v => (v.itens || []).forEach(it => {
    if (it.tipo !== 'abastecimento') return;
    const k = it.desc || 'Combustível';
    if (!map[k]) map[k] = { desc: k, litros: 0, valor: 0 };
    map[k].litros += Number(it.qtd || 0);
    map[k].valor += Math.round(Number(it.qtd || 0) * Number(it.unit || 0) * 100) / 100;
  }));
  const linhas = Object.values(map).map(m => `<tr><td class="fc-td">${fcEsc(m.desc)}</td>
    <td class="fc-td fc-r">${fcNum(m.litros, 3)} L</td><td class="fc-td fc-r">${fcMoney(m.valor)}</td></tr>`).join('');
  fcModal('Combustível Vendido', `<table class="fc-grid"><thead><tr><th>Combustível</th><th>Litros</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModalVendedor(vs) {
  const map = {};
  vs.forEach(v => { const k = v.vendedor || v.operador || '—'; map[k] = (map[k] || 0) + Number(v.valor_total || 0); });
  const linhas = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, val]) => `<tr>
    <td class="fc-td">${fcEsc(k)}</td><td class="fc-td fc-r">${fcMoney(val)}</td></tr>`).join('');
  fcModal('Demonstrativo por Vendedor', `<table class="fc-grid"><thead><tr><th>Vendedor</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table>`);
}
function fcModal(titulo, html) {
  let m = document.getElementById('fc-modal');
  if (!m) { m = document.createElement('div'); m.id = 'fc-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="fc-modal-bg" onclick="document.getElementById('fc-modal').remove()"></div>
    <div class="fc-modal-cx"><div class="fc-modal-tit">${fcEsc(titulo)}<span onclick="document.getElementById('fc-modal').remove()" style="cursor:pointer;float:right">✕</span></div>
    <div class="fc-modal-corpo">${html}</div></div>`;
}
async function fcSalvarObs() {
  const turnoId = window._fcTurnoAtual; const txt = document.getElementById('fc-obs')?.value || '';
  try { await sb.from('oct_pdv_turnos').update({ observacao: txt }).eq('id', turnoId); alert('Observação salva.'); }
  catch (e) { alert('Não foi possível salvar (campo observacao pode não existir ainda).'); }
}

// confirma a conferência de caixa físico e persiste no turno (esperado, diferença,
// quem/quando conferiu). O gerente audita o dinheiro contado × esperado aqui.
async function fcConfirmarCaixa(turnoId) {
  const d = (window._fcCache && window._fcCache.porTurno || {})[turnoId];
  if (!d || d.dinheiro_contado == null) { alert('Turno sem dinheiro contado — feche o turno no PDV primeiro.'); return; }
  const dif = d.diferenca_caixa || 0;
  const resumo = Math.abs(dif) < 0.01 ? 'Caixa confere (sem diferença).'
    : (dif < 0 ? 'FALTA de R$ ' : 'SOBRA de R$ ') + Math.abs(dif).toFixed(2).replace('.', ',');
  if (!confirm('Confirmar a conferência deste caixa?\n\nEsperado: R$ ' + Number(d.dinheiro_esperado || 0).toFixed(2).replace('.', ',')
    + '\nContado: R$ ' + Number(d.dinheiro_contado || 0).toFixed(2).replace('.', ',') + '\n' + resumo)) return;
  try {
    const session = await getSession();
    const { error } = await sb.from('oct_pdv_turnos').update({
      dinheiro_esperado: d.dinheiro_esperado,
      diferenca_caixa: dif,
      conferido_em: new Date().toISOString(),
      conferido_por: (session && session.user && session.user.email) || 'gerente',
    }).eq('id', turnoId);
    if (error) throw error;
    alert('✔ Conferência confirmada. ' + resumo);
  } catch (e) {
    const m = String(e.message || e);
    alert('Erro ao confirmar: ' + m + (/conferido|diferenca_caixa|dinheiro_esperado/.test(m) ? '\n\n→ Rode antes o SQL-CONFERENCIA-CAIXA.sql (colunas novas no turno).' : ''));
  }
}

// ---------- estilo (tema DARK, padrão do octano) ----------
function _fcEstilo() {
  return `<style>
  .fc-janela{background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;margin:16px;color:#dbe2ea;font-size:12px;overflow:hidden}
  .fc-titbar{background:#13151f;color:#f97316;padding:11px 16px;font-weight:600;font-size:15px;border-bottom:1px solid #2a2d3e}
  .fc-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;background:#13151f;border-bottom:1px solid #2a2d3e}
  .fc-btn{background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:5px 10px;font-size:11px;color:#c7d0dc;cursor:pointer}
  .fc-btn:hover:not(:disabled){background:#242c3e;color:#fff}.fc-btn:disabled{color:#5a6472;cursor:default}
  .fc-btn.azul{background:#f97316;color:#fff;border-color:#f97316}
  .fc-btn.azul:hover{background:#ea6a0c}
  .fc-btn.mini{padding:3px 8px;font-size:10px}
  .fc-sep{width:1px;height:18px;background:#2a2d3e;margin:0 4px}
  .fc-count{font-size:11px;color:#f97316;font-weight:600;padding:0 6px}
  .fc-periodo{padding:9px 12px;background:#0f1119;border-bottom:1px solid #2a2d3e;display:flex;align-items:center;gap:8px;color:#9aa}
  .fc-inp{border:1px solid #2a2d3e;border-radius:6px;padding:5px 8px;font-size:11px;background:#0b0d14;color:#e5e7eb}
  .fc-gridwrap{overflow:auto;max-height:64vh;background:#0f1119}
  .fc-grid{width:100%;border-collapse:collapse;font-size:11px;color:#cdd6e0}
  .fc-grid th{background:#1a1d2e;color:#9fb0c4;text-align:left;padding:7px;border-bottom:1px solid #2a2d3e;position:sticky;top:0;white-space:nowrap}
  .fc-td{padding:6px 7px;border-bottom:1px solid #1c2130;white-space:nowrap}
  .fc-r{text-align:right;font-variant-numeric:tabular-nums}
  .fc-grid tbody tr:nth-child(even){background:#141824}
  .fc-cab{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 14px;background:#13151f;border-bottom:1px solid #2a2d3e}
  .fc-cab label{color:#8aa;font-weight:600;margin-right:5px;font-size:11px}
  .fc-inp2{border:1px solid #2a2d3e;border-radius:6px;padding:5px 8px;font-size:11px;background:#0b0d14;color:#e5e7eb;width:120px}
  .fc-inp2.mini{width:66px}.fc-inp2.data{width:92px}.fc-inp2.lg{width:240px}
  .fc-corpo{display:grid;grid-template-columns:220px 1fr 1fr 320px;gap:1px;background:#2a2d3e}
  /* TELA DO POSTO (15/08): sem rolagem interna na árvore (rolava dentro de
     rolagem = 3 barras) e, em tela menor, o painel desce pra baixo das colunas
     ocupando a largura toda — sem ele de "régua" na vertical, as colunas param
     de esticar e some o vão preto no fim da árvore. */
  @media (max-width:1500px){
    .fc-corpo{grid-template-columns:200px 1fr 1fr}
    .fc-painel{grid-column:1/-1;column-width:320px;column-gap:14px}
    .fc-painel>*{break-inside:avoid;margin-bottom:8px}
  }
  .fc-tree{background:#0f1119;padding:10px}
  .fc-tree ul{list-style:none;margin:0;padding-left:15px}
  .fc-tree>ul{padding-left:2px}
  .fc-tree li{padding:3px 0;color:#c1cad6;line-height:1.5}
  .fc-tree li:hover{color:#f97316}
  .fc-col{background:#0f1119;padding:12px 14px}
  .fc-coltit{text-align:center;color:#f97316;font-weight:700;border-bottom:1px solid #2a2d3e;padding-bottom:7px;margin-bottom:8px}
  .fc-lin{display:flex;justify-content:space-between;align-items:center;padding:4px 0}
  .fc-lbl{color:#aeb9c7}
  .fc-box{border:1px solid #2a2d3e;background:#0b0d14;border-radius:6px;padding:4px 9px;min-width:96px;text-align:right;font-variant-numeric:tabular-nums;color:#e5e7eb}
  .fc-box.forte{font-weight:700;background:#10231a;border-color:#245a35;color:#7ee2a0}
  .fc-box.azulf{background:#0f1c33;border-color:#274a7a;color:#93c0ff}
  .fc-box.ok{background:#10231a;border-color:#245a35;color:#7ee2a0;font-weight:700}
  .fc-box.alerta{background:#2a2012;border-color:#7a5a20;color:#f0b45c;font-weight:700}
  .fc-total{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #2a2d3e;margin-top:8px;padding-top:8px;font-weight:600;color:#dbe2ea}
  .fc-litros{color:#6b7688;font-size:10px;margin-top:10px}
  .fc-painel{background:#0f1119;padding:12px}
  .fc-obscab{display:flex;justify-content:space-between;align-items:center;color:#f97316;font-weight:600;margin-bottom:5px}
  .fc-obs{width:100%;height:60px;border:1px solid #2a2d3e;border-radius:6px;font-size:11px;padding:6px;resize:vertical;box-sizing:border-box;background:#0b0d14;color:#e5e7eb}
  .fc-btn2{display:block;width:100%;text-align:left;margin-top:7px;background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:8px 11px;font-size:11px;color:#c7d0dc;cursor:pointer}
  .fc-btn2:hover:not(:disabled){background:#242c3e;color:#fff}.fc-btn2:disabled{color:#5a6472;cursor:default}
  .fc-adgrid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px;align-items:center;margin-top:12px}
  .fc-adgrid label{color:#aeb9c7;font-size:11px;text-align:right}
  .fc-inp3{border:1px solid #2a2d3e;border-radius:6px;padding:4px 7px;font-size:11px;text-align:right;background:#0b0d14;color:#cdd6e0;width:100%;box-sizing:border-box}
  #fc-modal .fc-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998}
  #fc-modal .fc-modal-cx{position:fixed;top:8vh;left:50%;transform:translateX(-50%);width:min(780px,92vw);max-height:80vh;overflow:auto;background:#13151f;border:1px solid #2a2d3e;border-radius:12px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  #fc-modal .fc-modal-tit{background:#1a1d2e;color:#f97316;padding:10px 16px;font-weight:600;border-radius:12px 12px 0 0}
  #fc-modal .fc-modal-corpo{padding:12px}
  </style>`;
}
