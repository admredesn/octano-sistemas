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
  if (['03', '04', '05', '10', '11', '12', '13'].includes(c)) return 'cartao';
  if (['17', '18', '19'].includes(c)) return 'pix';
  if (['15', '31'].includes(c)) return 'boleto';
  if (['99', '90'].includes(c)) return 'prazo';
  return 'outros';
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
  const [vRes, cRes] = await Promise.all([
    sb.from('oct_pdv_vendas').select('turno_id,valor_total,pagamentos,itens,status').eq('empresa_id', eid).in('turno_id', ids),
    sb.from('oct_pdv_caixa').select('turno_id,tipo,forma,valor,descricao').eq('empresa_id', eid).in('turno_id', ids),
  ]);
  const porTurno = {};
  ids.forEach(id => porTurno[id] = {
    venda_total: 0, venda_comb: 0, litros_comb: 0, venda_prod: 0,
    rec: { dinheiro: 0, cartao: 0, pix: 0, prazo: 0, cheque: 0, boleto: 0, outros: 0 },
    sangria: 0, suprimento: 0, despesa: 0, deposito: 0, outrosCaixa: 0, qtd_vendas: 0,
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
    else t.outrosCaixa += val;
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
      <td class="fc-td fc-r">0,00</td>
      <td class="fc-td fc-r">0,00</td>
      <td class="fc-td fc-r">0,00</td>
      <td class="fc-td fc-r">${fcMoney(d.venda_total)}</td>
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
            <th>Venda</th><th>Dinheiro</th><th>Cartão</th><th>Nota a prazo</th><th>Cheque</th>
          </tr></thead>
          <tbody>${linhas || '<tr><td colspan="16" style="padding:20px;text-align:center;color:#888">Nenhum turno no período.</td></tr>'}</tbody>
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

  // Recebimentos (ordem idêntica ao TecnoX). Campos sem dado no octano = 0,00.
  const receb = [
    ['Dinheiro + Sangrias', rec.dinheiro],
    ['Despesas', d.despesa],
    ['Cartão', rec.cartao],
    ['Pix', rec.pix],
    ['Nota a prazo', rec.prazo],
    ['Cheque', rec.cheque],
    ['Carta Frete', 0],
    ['Vale Haver', 0],
    ['Vale Motorista', 0],
    ['CTF', 0],
    ['Deposito em Conta', d.deposito],
    ['Troco Final', 0],
    ['Falta de Caixa', 0],
  ];
  const totalReceb = receb.reduce((s, r) => s + Number(r[1] || 0), 0);
  const vendas = [
    ['Venda produtos', d.venda_prod],
    ['Venda serviços', 0],
    ['Venda combustíveis', d.venda_comb],
    ['Remessas', d.suprimento],
    ['Cheque troco', 0],
    ['Haver', 0],
    ['Títulos Recebidos', 0],
    ['Receitas', 0],
    ['Sobra de Caixa', 0],
  ];
  const totalVenda = vendas.reduce((s, r) => s + Number(r[1] || 0), 0);
  const resultado = totalReceb - totalVenda;

  const linhaVal = (rot, val) => `<div class="fc-lin"><span class="fc-lbl">${rot}</span><span class="fc-box">${fcMoney(val)}</span></div>`;
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
              ${nodo('CTF', 'ctf')}${nodo('🧾 Cheque', 'cheque')}${nodo('🚚 Carta Frete', 'carta_frete')}${nodo('👷 Vale Motorista', 'vale_motorista')}
              ${nodo('Troco Final', 'troco_final')}${nodo('Vale Haver', 'vale_haver')}${nodo('Despesa', 'despesa')}${nodo('🏦 Depósito em Conta', 'deposito')}
            </ul></li>
            <li>📁 Remessas<ul>
              ${nodo('Suprimentos', 'suprimento')}${nodo('Haver', 'haver')}${nodo('Cheque Troco', 'cheque_troco')}${nodo('Títulos Recebidos', 'titulos')}${nodo('Receita', 'receita')}
            </ul></li>
            <li>📁 Diferença de Caixa<ul>
              ${nodo('🔴 Falta de Caixa', 'diferenca')}${nodo('🟢 Sobra de Caixa', 'diferenca')}
            </ul></li>
            <li>📁 Detalhes<ul>
              ${nodo('📑 Cupons Fiscais', 'cupons')}${nodo('👤 Demonstrativo Vendedor', 'vendedor')}
              ${nodo('📋 Itens Vendidos', 'itens')}${nodo('⛽ Combustível Vendido', 'combustivel')}
              ${nodo('📦 Estoque Fech. Caixa', 'estoque')}
            </ul></li>
          </ul>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Recebimentos</div>
          ${receb.map(r => linhaVal(r[0], r[1])).join('')}
          <div class="fc-total"><span>Total Recebimentos:</span><span class="fc-box forte">${fcMoney(totalReceb)}</span></div>
          <div class="fc-total"><span>Resultado do Caixa</span><span class="fc-box ${Math.abs(resultado) < 0.01 ? 'ok' : 'alerta'}">${fcMoney(resultado)}</span></div>
        </div>

        <div class="fc-col">
          <div class="fc-coltit">Vendas / Saídas</div>
          ${vendas.map(r => linhaVal(r[0], r[1])).join('')}
          <div class="fc-litros">${fcNum(d.litros_comb, 3)} L de combustível &nbsp;·&nbsp; ${d.qtd_vendas} cupons</div>
          <div class="fc-total"><span>Total Vendas / Saída:</span><span class="fc-box forte azulf">${fcMoney(totalVenda)}</span></div>
        </div>

        <div class="fc-painel">
          <div class="fc-obscab"><span>Observação:</span><button class="fc-btn mini" onclick="fcSalvarObs()">💾 Salvar Obs.</button></div>
          <textarea id="fc-obs" class="fc-obs" placeholder="Observações do caixa...">${fcEsc(t.observacao || '')}</textarea>
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
};

async function fcNodeDetalhe(tipo) {
  const cfg = FC_DETALHES[tipo];
  const turnoId = window._fcTurnoAtual;
  const cache = window._fcCache || {};
  const t = (cache.turnos || []).find(x => x.id === turnoId);
  if (!cfg || !t) return;
  fcModal(cfg.titulo, '<p style="padding:20px;color:#888">Buscando...</p>');

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
  .fc-tree{background:#0f1119;padding:10px;overflow:auto;max-height:62vh}
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
