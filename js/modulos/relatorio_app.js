// ============================================================
//  RELATÓRIO: ABASTECIMENTOS PELO APP (20/10/2026)
// ------------------------------------------------------------
//  Ronan: "No retaguarda em relatórios, tem que criar um campo para ver os
//  abastecimentos que foram feitos por meio do app".
//
//  Fonte: oct_cashback_acionamentos (cada vez que o cliente leu o QR do bico ou
//  digitou o código no app). Dois tipos:
//   • Desconto na bomba (modo='desconto'): o núcleo grava em bomba_info o id do
//     abastecimento feito com o preço de desconto -> oct_pdv_abastecimentos
//     (litros, preço/L) e dele a venda do caixa (venda_id).
//   • Cashback e pontos (modo vazio): o caixa usa o acionamento ao fechar a venda
//     -> status 'usado' + venda_numero -> oct_pdv_vendas.
//  Pedido sem abastecimento (cancelado, expirado, desconto que voltou sem
//  abastecer) aparece como "não abasteceu", para dar a medida de uso do app.
//
//  Registra-se sozinho na Central de Relatórios (RELATORIOS_REG, relatorios.js).
// ============================================================

const _RAPP_FORMA = { '01': 'Dinheiro', '17': 'Pix', '05': 'A prazo', '03': 'Crédito', '04': 'Débito', '10': 'Vale', '99': 'Outros' };

if (typeof RELATORIOS_REG !== 'undefined' && !RELATORIOS_REG.some(r => r.id === 'app')) {
  RELATORIOS_REG.push({
    id: 'app', icone: '📱', titulo: 'Abastecimentos pelo App',
    descricao: 'Quem abasteceu usando o app Postos SN: desconto na bomba ou cashback, litros, valor, economia do cliente e pedidos que não viraram abastecimento.',
    fn: () => relatorioApp(),
  });
}

function _rappEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _rappNum(v, casas) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
function _rappCpf(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : ''; }
// oct_pdv_abastecimentos.data_abast é a hora LOCAL do posto gravada com rótulo +00:00: mostra como está
function _rappHoraLocal(iso) { const s = String(iso || ''); return s.length >= 16 ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' ' + s.slice(11, 16) : ''; }

async function relatorioApp() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('📱 Abastecimentos pelo App')}
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
      <label style="color:#9fb3c8;font-size:.8rem">De<br><input type="date" id="rel-app-ini" value="${_relDataInicioMes()}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Até<br><input type="date" id="rel-app-fim" value="${_relDataHoje()}" style="margin-top:3px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Tipo<br>
        <select id="rel-app-tipo" style="margin-top:3px">
          <option value="">Todos</option>
          <option value="desconto">Desconto na bomba</option>
          <option value="cashback">Cashback e pontos</option>
        </select></label>
      <label style="color:#9fb3c8;font-size:.8rem">Situação<br>
        <select id="rel-app-sit" style="margin-top:3px">
          <option value="abasteceu">Só os que abasteceram</option>
          <option value="">Todos os pedidos</option>
          <option value="nao">Só os que não abasteceram</option>
        </select></label>
      <button onclick="relatorioAppCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
      <button onclick="relatorioAppCSV()" title="Planilha (abre no Excel)" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer">⬇ CSV</button>
    </div>
    <div id="rel-app-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioAppCarregar();
}

async function relatorioAppCarregar() {
  const box = document.getElementById('rel-app-corpo');
  if (!box) return;
  try {
    const eid = _relEid();
    if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
    const ini = document.getElementById('rel-app-ini')?.value || _relDataInicioMes();
    const fim = document.getElementById('rel-app-fim')?.value || _relDataHoje();
    const tipo = document.getElementById('rel-app-tipo')?.value || '';
    const sit = document.getElementById('rel-app-sit')?.value ?? 'abasteceu';
    box.innerHTML = '<p style="color:#888">Carregando…</p>';

    // o período é do dia LOCAL: converte os limites para UTC (criado_em é UTC de verdade)
    const de = new Date(ini + 'T00:00:00').toISOString(), ate = new Date(fim + 'T23:59:59.999').toISOString();
    const { data: acs, error } = await sb.from('oct_cashback_acionamentos')
      .select('id,criado_em,usado_em,cliente_nome,cliente_cpf,bico,combustivel,forma,status,modo,venda_numero,itens,desconto_litro,preco_normal,preco_desconto,bomba_status,bomba_info')
      .eq('empresa_id', eid).gte('criado_em', de).lte('criado_em', ate)
      .order('criado_em', { ascending: false }).limit(3000);
    if (error) { box.innerHTML = `<p style="color:#f87171">Erro: ${_rappEsc(error.message)}</p>`; return; }

    // abastecimentos do desconto (pelo id que o núcleo gravou) e vendas do cashback (pelo número do cupom)
    const abIds = [...new Set((acs || []).map(a => (a.bomba_info || {}).abastecimento_id).filter(Boolean))];
    const nums = [...new Set((acs || []).filter(a => a.venda_numero).map(a => String(a.venda_numero)))];
    const abs = {}, vendasPorId = {}, vendasPorNum = {};
    for (let i = 0; i < abIds.length; i += 100) {
      const { data } = await sb.from('oct_pdv_abastecimentos').select('id,litros,preco_litro,valor_total,data_abast,venda_id,combustivel,produto_nome')
        .in('id', abIds.slice(i, i + 100));
      (data || []).forEach(x => { abs[x.id] = x; });
    }
    const vIds = [...new Set(Object.values(abs).map(x => x.venda_id).filter(Boolean))];
    for (let i = 0; i < vIds.length; i += 100) {
      const { data } = await sb.from('oct_pdv_vendas').select('id,numero,valor_total,pagamentos,status').in('id', vIds.slice(i, i + 100));
      (data || []).forEach(v => { vendasPorId[v.id] = v; });
    }
    for (let i = 0; i < nums.length; i += 100) {
      const { data } = await sb.from('oct_pdv_vendas').select('id,numero,valor_total,itens,pagamentos,status')
        .eq('empresa_id', eid).in('numero', nums.slice(i, i + 100));
      (data || []).forEach(v => { vendasPorNum[String(v.numero)] = v; });
    }

    const linhas = (acs || []).map(a => {
      const desc = a.modo === 'desconto';
      const info = a.bomba_info || {};
      let litros = null, precoL = null, valor = null, cupom = '', abasteceu = false, combustivel = a.combustivel || '';
      if (desc && info.abastecimento_id && abs[info.abastecimento_id]) {
        const ab = abs[info.abastecimento_id];
        litros = Number(ab.litros || 0); precoL = Number(ab.preco_litro || a.preco_desconto || 0);
        valor = Number(ab.valor_total || 0) || +(litros * precoL).toFixed(2);
        combustivel = ab.combustivel || ab.produto_nome || combustivel;
        const v = vendasPorId[ab.venda_id];
        cupom = v ? String(v.numero || '') : '';
        abasteceu = true;
      } else if (!desc && a.status === 'usado') {
        const v = vendasPorNum[String(a.venda_numero || '')];
        const itens = (v && Array.isArray(v.itens) ? v.itens : (a.itens || [])).filter(i => (i.tipo || 'abastecimento') === 'abastecimento');
        if (itens.length) {
          litros = itens.reduce((s, i) => s + Number(i.qtd || 0), 0);
          valor = itens.reduce((s, i) => s + Number(i.qtd || 0) * Number(i.unit || i.preco || 0), 0);
          precoL = litros ? valor / litros : null;
          combustivel = itens[0].desc || itens[0].nome || combustivel;
        } else if (v) { valor = Number(v.valor_total || 0); }
        cupom = String(a.venda_numero || '');
        abasteceu = true;
      }
      const economia = desc && litros ? +(litros * Number(a.desconto_litro || 0)).toFixed(2) : 0;
      let situacao;
      if (abasteceu) situacao = 'Abasteceu';
      else if (desc && a.bomba_status === 'expirado') situacao = 'Não abasteceu (60 s)';
      else if (desc && a.bomba_status === 'restaurado') situacao = 'Tirou o bico sem abastecer';
      else if (desc && a.bomba_status === 'falhou') situacao = 'Bomba recusou';
      else if (a.status === 'cancelado') situacao = 'Cancelado no app';
      else if (a.status === 'expirado') situacao = 'Expirou';
      else situacao = 'Aguardando';
      return { quando: a.criado_em, cliente: a.cliente_nome || '', cpf: _rappCpf(a.cliente_cpf), bico: a.bico, combustivel,
               tipo: desc ? 'Desconto na bomba' : 'Cashback e pontos', descL: desc ? Number(a.desconto_litro || 0) : null,
               forma: _RAPP_FORMA[a.forma] || a.forma || '', litros, precoL, valor, economia, cupom, situacao, abasteceu };
    }).filter(l => (!tipo || (tipo === 'desconto') === (l.tipo === 'Desconto na bomba'))
                && (sit === '' || (sit === 'abasteceu') === l.abasteceu));
    window._rappLinhas = linhas;
    window._rappPeriodo = ini + '_a_' + fim;

    if (!linhas.length) {
      box.innerHTML = `<p style="color:#888">Nenhum ${sit === 'nao' ? 'pedido sem abastecimento' : 'abastecimento pelo app'} no período.</p>`
        + ((acs || []).length && sit === 'abasteceu' ? `<p style="color:#666;font-size:.8rem">${acs.length} pedido(s) no app no período não viraram abastecimento — escolha "Todos os pedidos" para ver.</p>` : '');
      return;
    }
    const feitos = linhas.filter(l => l.abasteceu);
    const soma = k => Math.round(feitos.reduce((s, l) => s + Number(l[k] || 0), 0) * 1000) / 1000;
    const clientes = new Set(feitos.map(l => l.cpf + l.cliente)).size;
    const card = (t, v, cor) => `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:150px">
      <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${t}</div>
      <div style="color:${cor || '#e6e6e6'};font-size:1.15rem;font-weight:700;margin-top:2px">${v}</div></div>`;
    const corSit = s => s === 'Abasteceu' ? '#4ade80' : (s === 'Aguardando' ? '#fbbf24' : '#9ca3af');
    const td = 'padding:7px 8px';
    const corpo = linhas.map(l => `<tr style="border-bottom:1px solid #1e2233">
      <td style="${td};color:#9ca3af;font-size:.78rem;white-space:nowrap">${new Date(l.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td style="${td};color:#e6e6e6">${_rappEsc(l.cliente)}<div style="color:#6b7280;font-size:.72rem">${l.cpf}</div></td>
      <td style="${td};text-align:center">${_rappEsc(l.bico || '')}</td>
      <td style="${td};color:#cbd5e1">${_rappEsc(l.combustivel)}</td>
      <td style="${td};color:#cbd5e1;white-space:nowrap">${l.tipo === 'Desconto na bomba' ? '⛽ Desconto ' + _relBRL(l.descL) + '/L' : '🎁 Cashback'}</td>
      <td style="${td};color:#cbd5e1">${_rappEsc(l.forma)}</td>
      <td style="${td};text-align:right">${l.litros != null ? _rappNum(l.litros, 3) : '—'}</td>
      <td style="${td};text-align:right">${l.precoL != null ? _rappNum(l.precoL, 2) : '—'}</td>
      <td style="${td};text-align:right;color:#5dca9a;font-weight:600;white-space:nowrap">${l.valor != null ? _relBRL(l.valor) : '—'}</td>
      <td style="${td};text-align:right;color:#f0b45c;white-space:nowrap">${l.economia ? _relBRL(l.economia) : '—'}</td>
      <td style="${td};text-align:center;color:#9ca3af">${_rappEsc(l.cupom) || '—'}</td>
      <td style="${td};color:${corSit(l.situacao)};white-space:nowrap">${l.situacao}</td>
    </tr>`).join('');
    box.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        ${card('Abastecimentos pelo app', feitos.length, '#e6e6e6')}
        ${card('Litros', _rappNum(soma('litros'), 3), '#e6e6e6')}
        ${card('Valor', _relBRL(Math.round(soma('valor') * 100) / 100), '#5dca9a')}
        ${card('Desconto dado', _relBRL(Math.round(soma('economia') * 100) / 100), '#f0b45c')}
        ${card('Clientes', clientes, '#e6e6e6')}
        ${card('Pedidos sem abastecer', linhas.length - feitos.length, '#9ca3af')}
      </div>
      <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:60vh">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem">
          <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left">
            <th style="${td}">Pedido no app</th><th style="${td}">Cliente</th><th style="${td};text-align:center">Bico</th>
            <th style="${td}">Combustível</th><th style="${td}">Tipo</th><th style="${td}">Forma</th>
            <th style="${td};text-align:right">Litros</th><th style="${td};text-align:right">R$/L</th>
            <th style="${td};text-align:right">Valor</th><th style="${td};text-align:right">Economia</th>
            <th style="${td};text-align:center">Cupom</th><th style="${td}">Situação</th>
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
      <p style="color:#6b7280;font-size:.75rem;margin-top:8px">Desconto na bomba: litros e R$/L do abastecimento que a bomba fez com o preço de desconto. Cashback: litros e valor da venda fechada no caixa com o pedido do app.</p>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171">Não consegui montar o relatório: ${_rappEsc(e.message || e)}</p>`;
  }
}

function relatorioAppCSV() {
  if (typeof podeOuAvisa === 'function' && !podeOuAvisa('relatorios.exportar')) return;
  const ls = window._rappLinhas || [];
  if (!ls.length) { alert('Busque o relatório antes de exportar.'); return; }
  const cel = v => { const s = String(v === null || v === undefined ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n = (v, c) => (v === null || v === undefined || v === '') ? '' : Number(v).toFixed(c).replace('.', ',');
  const cab = ['Pedido no app', 'Cliente', 'CPF', 'Bico', 'Combustível', 'Tipo', 'Desconto R$/L', 'Forma', 'Litros', 'R$/L', 'Valor', 'Economia', 'Cupom', 'Situação'];
  const linhas = ls.map(l => [new Date(l.quando).toLocaleString('pt-BR'), l.cliente, l.cpf, l.bico, l.combustivel, l.tipo, n(l.descL, 2), l.forma,
                              n(l.litros, 3), n(l.precoL, 2), n(l.valor, 2), n(l.economia, 2), l.cupom, l.situacao]);
  const txt = '﻿' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = 'abastecimentos_app_' + (window._rappPeriodo || '') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
