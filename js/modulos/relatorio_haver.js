// ============================================================
//  RELATÓRIO: HAVER POR CLIENTE (02/11/2026)
// ------------------------------------------------------------
//  Ronan: "pode fazer a tela de haver por cliente no retaguarda". Até aqui o
//  saldo só se via no PDV (F7 › Vale / Haver), um cliente por vez.
//
//  Fonte: oct_vales — a conta corrente da pessoa no posto (PDV vales.js). O saldo
//  é SEMPRE a soma dos lançamentos, nunca um campo guardado:
//    + crédito adiantado / troco pendente          = o posto DEVE ao cliente (haver)
//    − consumo (cupom pago com o crédito) / vale    = abate / o cliente deve ao posto
//  "Posição em" soma só o que foi lançado até o fim daquele dia (fechamento do mês).
//
//  À parte: oct_pessoas.credito_adiantamento é o saldo que veio do cadastro do
//  TecnoX na migração. NÃO entra no saldo (o PDV não o enxerga); aparece só para
//  alguém decidir se lança no PDV.
//
//  Registra-se sozinho na Central de Relatórios (RELATORIOS_REG, relatorios.js).
// ============================================================

const _RHV_TIPO = {
  credito_adiantado: 'Crédito adiantado', troco_pendente: 'Troco pendente',
  vale_funcionario: 'Vale (funcionário)', consumo: 'Consumo', liquidacao: 'Liquidação',
};

if (typeof RELATORIOS_REG !== 'undefined' && !RELATORIOS_REG.some(r => r.id === 'haver')) {
  RELATORIOS_REG.push({
    id: 'haver', icone: '💳', titulo: 'Haver por cliente',
    descricao: 'Crédito que cada cliente ainda tem no posto (pagou adiantado, troco pendente) e vales a descontar, com o extrato de cada um.',
    fn: () => relatorioHaver(),
  });
}

function _rhvEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _rhvNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function _rhvDoc(d) {
  const n = String(d || '').replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || '';
}
// número da NFC-e de dentro da chave (posições 26–34)
function _rhvCupom(chave) { const c = String(chave || '').replace(/\D/g, ''); return c.length === 44 ? String(parseInt(c.slice(25, 34), 10)) : ''; }
function _rhvDataBR(iso) { const s = String(iso || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
function _rhvQuando(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
function _rhvCor(v) { return v > 0.004 ? '#4ade80' : (v < -0.004 ? '#f87171' : '#9ca3af'); }

// busca paginada (PostgREST devolve no máximo 1000 por vez)
async function _rhvTodos(montar) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function relatorioHaver() {
  const c = document.getElementById('conteudo');
  if (!c) return;
  c.innerHTML = `<div style="padding:24px">
    ${_relHeader('💳 Haver por cliente')}
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px">
      <label style="color:#9fb3c8;font-size:.8rem">Cliente<br><input type="search" id="rel-hv-busca" placeholder="nome, código ou CPF/CNPJ" oninput="relatorioHaverDesenhar()" style="margin-top:3px;min-width:220px"></label>
      <label style="color:#9fb3c8;font-size:.8rem">Mostrar<br>
        <select id="rel-hv-mostrar" onchange="relatorioHaverDesenhar()" style="margin-top:3px">
          <option value="saldo">Só quem tem saldo</option>
          <option value="todos">Todos que já tiveram lançamento</option>
        </select></label>
      <label style="color:#9fb3c8;font-size:.8rem" title="Soma só o que foi lançado até o fim deste dia">Posição em<br><input type="date" id="rel-hv-ate" value="${_relDataHoje()}" style="margin-top:3px"></label>
      <button onclick="relatorioHaverCarregar()" style="padding:8px 16px;border-radius:7px;border:none;background:#f97316;color:#fff;cursor:pointer;font-weight:600">Buscar</button>
      <button onclick="relatorioHaverCSV()" title="Planilha (abre no Excel)" style="padding:8px 14px;border-radius:7px;border:1px solid #2a2d3e;background:#13151f;color:#9fb3c8;cursor:pointer">⬇ CSV</button>
    </div>
    <div id="rel-hv-corpo"><p style="color:#888">Carregando…</p></div>
  </div>`;
  relatorioHaverCarregar();
}

async function relatorioHaverCarregar() {
  const box = document.getElementById('rel-hv-corpo');
  if (!box) return;
  try {
    const eid = _relEid();
    if (!eid) { box.innerHTML = '<p style="color:#f87171">Selecione uma empresa.</p>'; return; }
    const ate = document.getElementById('rel-hv-ate')?.value || _relDataHoje();
    box.innerHTML = '<p style="color:#888">Carregando…</p>';
    // criado_em é UTC de verdade: o fim do dia LOCAL convertido
    const limite = new Date(ate + 'T23:59:59.999').toISOString();

    const vales = await _rhvTodos(() => sb.from('oct_vales')
      .select('id,pessoa_id,pessoa_nome,valor,tipo,descricao,forma,pago_em,operador,nfce_chave,criado_em')
      .eq('empresa_id', eid).lte('criado_em', limite).order('criado_em', { ascending: true }));

    const ids = [...new Set(vales.map(v => v.pessoa_id).filter(Boolean))];
    const pessoas = {};
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb.from('oct_pessoas').select('id,nome,documento,tecnox_cod').in('id', ids.slice(i, i + 100));
      (data || []).forEach(p => { pessoas[p.id] = p; });
    }
    // saldo que veio do TecnoX no cadastro (não está em oct_vales)
    const { data: legado } = await sb.from('oct_pessoas').select('id,nome,documento,tecnox_cod,credito_adiantamento')
      .eq('empresa_id', eid).neq('credito_adiantamento', 0).order('nome');

    const porPessoa = {};
    vales.forEach(v => {
      const k = v.pessoa_id || ('nome:' + (v.pessoa_nome || '?'));
      const p = pessoas[v.pessoa_id] || {};
      const g = porPessoa[k] || (porPessoa[k] = {
        id: k, nome: p.nome || v.pessoa_nome || '(sem nome)', codigo: p.tecnox_cod || '', doc: _rhvDoc(p.documento),
        entrou: 0, saiu: 0, saldo: 0, ultimo: null, linhas: [],
      });
      const val = Number(v.valor || 0);
      if (val >= 0) g.entrou += val; else g.saiu += -val;
      g.saldo += val;
      g.ultimo = v.criado_em;               // vem em ordem crescente
      g.linhas.push(Object.assign({}, v, { _saldo: Math.round(g.saldo * 100) / 100 }));
    });
    Object.values(porPessoa).forEach(g => { g.saldo = Math.round(g.saldo * 100) / 100; });
    window._rhv = { lista: Object.values(porPessoa), legado: (legado || []).filter(p => Math.abs(Number(p.credito_adiantamento || 0)) >= 0.005), ate };
    relatorioHaverDesenhar();
  } catch (e) {
    box.innerHTML = `<p style="color:#f87171">Não consegui montar o relatório: ${_rhvEsc(e.message || e)}</p>`;
  }
}

function _rhvFiltrada() {
  const d = window._rhv || { lista: [] };
  const q = _rhvNorm(document.getElementById('rel-hv-busca')?.value || '').trim();
  const qDig = q.replace(/\D/g, '');
  const soSaldo = (document.getElementById('rel-hv-mostrar')?.value || 'saldo') === 'saldo';
  return d.lista
    .filter(g => !soSaldo || Math.abs(g.saldo) >= 0.005)
    .filter(g => !q || _rhvNorm(g.nome).includes(q) || String(g.codigo) === q
                 || (qDig.length >= 3 && g.doc.replace(/\D/g, '').includes(qDig)))
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || a.nome.localeCompare(b.nome));
}

function relatorioHaverDesenhar() {
  const box = document.getElementById('rel-hv-corpo');
  const d = window._rhv;
  if (!box || !d) return;
  const lista = _rhvFiltrada();
  const todos = d.lista;
  const deve = todos.filter(g => g.saldo > 0).reduce((s, g) => s + g.saldo, 0);
  const aReceber = todos.filter(g => g.saldo < 0).reduce((s, g) => s - g.saldo, 0);
  const comSaldo = todos.filter(g => Math.abs(g.saldo) >= 0.005).length;
  const card = (t, v, cor, dica) => `<div title="${dica || ''}" style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:12px 16px;min-width:170px">
    <div style="color:#8a8f98;font-size:.72rem;text-transform:uppercase;letter-spacing:.4px">${t}</div>
    <div style="color:${cor};font-size:1.15rem;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums">${v}</div></div>`;
  const td = 'padding:7px 8px';
  const corpo = lista.map(g => `<tr class="rhv-linha" data-pid="${_rhvEsc(g.id)}" onclick="relatorioHaverExtrato(this)" style="border-bottom:1px solid #1e2233;cursor:pointer" title="Clique para ver o extrato">
      <td style="${td};color:#6b7280;width:18px">▸</td>
      <td style="${td};color:#e6e6e6">${g.codigo ? '<span style="color:#9ca3af">' + _rhvEsc(g.codigo) + ' · </span>' : ''}${_rhvEsc(g.nome)}<div style="color:#6b7280;font-size:.72rem">${_rhvEsc(g.doc)}</div></td>
      <td style="${td};text-align:right;color:#cbd5e1;white-space:nowrap">${_relBRL(g.entrou)}</td>
      <td style="${td};text-align:right;color:#cbd5e1;white-space:nowrap">${_relBRL(g.saiu)}</td>
      <td style="${td};text-align:right;color:${_rhvCor(g.saldo)};font-weight:700;white-space:nowrap">${_relBRL(g.saldo)}</td>
      <td style="${td};color:#9ca3af;font-size:.78rem;white-space:nowrap">${_rhvQuando(g.ultimo)}</td>
      <td style="${td};text-align:center;color:#9ca3af">${g.linhas.length}</td>
    </tr>`).join('');

  const legado = d.legado.length ? `
    <div style="margin-top:22px;border:1px dashed #3a3f55;border-radius:8px;padding:12px 14px">
      <div style="color:#fbbf24;font-weight:600;font-size:.88rem">Saldo que veio do cadastro do TecnoX (não está no saldo acima)</div>
      <p style="color:#8a8f98;font-size:.76rem;margin:4px 0 8px">Valor de "crédito adiantado" que o cliente tinha no TecnoX quando o cadastro foi importado. O PDV não usa esse número: se ainda valer, lance no PDV em F7 › Vale / Haver.</p>
      <table style="border-collapse:collapse;font-size:.8rem">
        ${d.legado.map(p => `<tr><td style="padding:3px 14px 3px 0;color:#cbd5e1">${p.tecnox_cod ? _rhvEsc(p.tecnox_cod) + ' · ' : ''}${_rhvEsc(p.nome)}</td>
          <td style="padding:3px 0;text-align:right;color:${_rhvCor(Number(p.credito_adiantamento))};font-variant-numeric:tabular-nums">${_relBRL(p.credito_adiantamento)}</td></tr>`).join('')}
      </table>
    </div>` : '';

  box.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${card('O posto deve aos clientes', _relBRL(deve), '#4ade80', 'Soma dos saldos positivos: crédito que os clientes ainda vão consumir')}
      ${card('Clientes devem ao posto', _relBRL(aReceber), aReceber > 0.004 ? '#f87171' : '#9ca3af', 'Soma dos saldos negativos: vales a descontar')}
      ${card('Clientes com saldo', comSaldo, '#e6e6e6')}
      ${card('Posição em', _rhvDataBR(d.ate), '#e6e6e6')}
    </div>
    ${lista.length ? `
    <div style="overflow:auto;border:1px solid #1e2233;border-radius:8px;max-height:62vh">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums">
        <thead><tr style="position:sticky;top:0;background:#141828;color:#7ec5a8;text-align:left;z-index:1">
          <th style="${td}"></th><th style="${td}">Cliente</th>
          <th style="${td};text-align:right" title="Crédito adiantado, troco pendente, estornos">Entrou</th>
          <th style="${td};text-align:right" title="Consumido nos cupons, vales">Saiu</th>
          <th style="${td};text-align:right">Saldo</th><th style="${td}">Último lançamento</th><th style="${td};text-align:center">Lanç.</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>` : `<p style="color:#888">${todos.length ? 'Nenhum cliente com esse filtro.' : 'Nenhum lançamento de vale/haver neste posto até ' + _rhvDataBR(d.ate) + '.'}</p>`}
    <p style="color:#6b7280;font-size:.75rem;margin-top:8px">Saldo <span style="color:#4ade80">verde</span> = o posto deve ao cliente (crédito a consumir). <span style="color:#f87171">Vermelho</span> = o cliente deve ao posto. Lançar crédito ou acertar: PDV › F7 › Vale / Haver.</p>
    ${legado}`;
}

// abre/fecha o extrato do cliente logo abaixo da linha
function relatorioHaverExtrato(tr) {
  const pid = tr && tr.dataset ? tr.dataset.pid : '';
  const prox = tr.nextElementSibling;
  if (prox && prox.classList.contains('rhv-extrato')) { prox.remove(); tr.cells[0].textContent = '▸'; return; }
  const g = ((window._rhv || {}).lista || []).find(x => x.id === pid);
  if (!g) return;
  const td = 'padding:5px 8px';
  const linhas = g.linhas.map(l => {
    const v = Number(l.valor || 0);
    const tipo = l.tipo === 'consumo' && v > 0 ? 'Estorno de consumo' : (_RHV_TIPO[l.tipo] || l.tipo || '');
    return `<tr style="border-bottom:1px solid #1a1d2b">
      <td style="${td};color:#9ca3af;white-space:nowrap">${_rhvQuando(l.criado_em)}</td>
      <td style="${td};color:#cbd5e1;white-space:nowrap">${_rhvEsc(tipo)}</td>
      <td style="${td};color:#cbd5e1">${_rhvEsc(l.descricao || '')}</td>
      <td style="${td};color:#9ca3af;white-space:nowrap">${_rhvEsc(l.forma || '')}${l.pago_em ? ' <span style="color:#6b7280">pago ' + _rhvDataBR(l.pago_em) + '</span>' : ''}</td>
      <td style="${td};text-align:center;color:#9ca3af">${_rhvCupom(l.nfce_chave) || ''}</td>
      <td style="${td};color:#6b7280;font-size:.74rem">${_rhvEsc(l.operador || '')}</td>
      <td style="${td};text-align:right;color:${_rhvCor(v)};white-space:nowrap">${_relBRL(v)}</td>
      <td style="${td};text-align:right;color:${_rhvCor(l._saldo)};font-weight:600;white-space:nowrap">${_relBRL(l._saldo)}</td>
    </tr>`;
  }).join('');
  const linha = document.createElement('tr');
  linha.className = 'rhv-extrato';
  linha.innerHTML = `<td></td><td colspan="6" style="padding:4px 8px 12px">
    <table style="width:100%;border-collapse:collapse;font-size:.78rem;background:#0f111a;border:1px solid #1e2233;border-radius:6px">
      <thead><tr style="color:#7ec5a8;text-align:left">
        <th style="${td}">Quando</th><th style="${td}">Tipo</th><th style="${td}">Descrição</th><th style="${td}">Forma</th>
        <th style="${td};text-align:center">Cupom</th><th style="${td}">Operador</th>
        <th style="${td};text-align:right">Valor</th><th style="${td};text-align:right">Saldo</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></td>`;
  tr.after(linha);
  tr.cells[0].textContent = '▾';
}

function relatorioHaverCSV() {
  if (typeof podeOuAvisa === 'function' && !podeOuAvisa('relatorios.exportar')) return;
  const d = window._rhv;
  if (!d) { alert('Busque o relatório antes de exportar.'); return; }
  const ls = _rhvFiltrada();
  if (!ls.length) { alert('Nada para exportar com esse filtro.'); return; }
  const cel = v => { const s = String(v === null || v === undefined ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n = v => Number(v || 0).toFixed(2).replace('.', ',');
  const cab = ['Código', 'Cliente', 'CPF/CNPJ', 'Entrou', 'Saiu', 'Saldo', 'Último lançamento', 'Lançamentos'];
  const linhas = ls.map(g => [g.codigo, g.nome, g.doc, n(g.entrou), n(g.saiu), n(g.saldo), _rhvQuando(g.ultimo), g.linhas.length]);
  const txt = '﻿' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = 'haver_por_cliente_' + d.ate + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
