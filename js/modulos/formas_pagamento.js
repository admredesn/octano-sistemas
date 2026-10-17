// ============================================================
// MÓDULO FORMAS DE PAGAMENTO — retaguarda
// Sub-abas: (1) Forma de recebimento  (2) Tabela de preço
// ============================================================

const FP_SEFAZ = [
  { c: '01', n: 'Dinheiro' }, { c: '02', n: 'Cheque' }, { c: '03', n: 'Cartão de Crédito' },
  { c: '04', n: 'Cartão de Débito' }, { c: '05', n: 'Crédito Loja' }, { c: '15', n: 'Boleto' },
  { c: '17', n: 'PIX' }, { c: '18', n: 'Transferência' }, { c: '90', n: 'Sem pagamento' }, { c: '99', n: 'Outros' },
];

async function moduloFormasPagamento() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis').select('empresa_id').eq('id', session.user.id).single();
  if (!perfil?.empresa_id) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa.</p>'; return; }
  window._fpEmpresaId = ((typeof empresaAtiva==='function')?empresaAtiva():perfil.empresa_id);

  conteudo.innerHTML = `
    <div style="padding:14px 20px">
      <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid #2a2d3e">
        <button id="fp-tab-receb" onclick="fpAba('receb')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#f97316;border-bottom:2px solid #f97316;cursor:pointer;font-weight:500">Forma de recebimento</button>
        <button id="fp-tab-preco" onclick="fpAba('preco')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#888;border-bottom:2px solid transparent;cursor:pointer">Tabela de preço</button>
        <button id="fp-tab-taxas" onclick="fpAba('taxas')" class="fp-subtab" style="padding:10px 18px;border:none;background:none;color:#888;border-bottom:2px solid transparent;cursor:pointer">💳 Taxas dos cartões</button>
      </div>
      <div id="fp-conteudo"></div>
    </div>`;
  fpAba('receb');
}

function fpAba(qual) {
  ['receb', 'preco', 'taxas'].forEach(k => {
    const b = document.getElementById('fp-tab-' + k);
    if (!b) return;
    b.style.color = qual === k ? '#f97316' : '#888';
    b.style.borderBottomColor = qual === k ? '#f97316' : 'transparent';
  });
  if (qual === 'receb') fpReceberListar(); else if (qual === 'taxas') fpTaxasListar(); else fpPrecoListar();
}

// ===================== TAXAS DOS CARTÕES (11/10/2026, pedido do Ronan) =====================
// O que foi NEGOCIADO com a adquirente, por forma, bandeira e faixa de parcelas. A aba
// 💳 Cartões compara cada venda do extrato EDI com a regra que vale para ela e aponta o que
// está fora. Regra sem bandeira vale para qualquer bandeira; regra sem posto vale para a rede
// (conta PagBank única). Só o dono altera (RLS).
const FP_BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Pix'];
// CARTÃO FROTA (17/10/2026): forma "frota", adquirente = a OPERADORA (a mesma lista do PDV; "frota" = qualquer operadora)
// e a conta onde ela deposita (só para regra "deste posto" — a conta é do posto). Ver cartoes.js.
const FP_ADQUIRENTES = ['pagbank', 'TicketLog', 'FitCard / Prime', 'ValeCard', 'Sem Parar', 'GoodCard', 'frota'];
async function fpTaxasListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  const [{ data, error }, rC] = await Promise.all([
    sb.from('oct_cartao_taxas').select('*').or(`empresa_id.is.null,empresa_id.eq.${eid}`)
      .order('adquirente').order('forma').order('bandeira').order('parcelas_de').order('vigencia_de', { ascending: false }),
    sb.from('oct_fin_contas').select('id,nome,tipo,ativo,ordem').eq('empresa_id', eid).eq('ativo', true).order('ordem').then(r => r, () => ({ data: [] })),
  ]);
  if (error) {
    div.innerHTML = `<p style="color:#fbbf24;padding:16px">${/oct_cartao_taxas/.test(error.message) ? 'Falta rodar <b>repo/sql/SQL-CARTOES.sql</b> no Supabase.' : 'Erro: ' + fpEsc(error.message)}</p>`;
    return;
  }
  window._fpContasTaxa = (rC && rC.data) || [];
  const nomeConta = id => { const c = window._fpContasTaxa.find(x => Number(x.id) === Number(id)); return c ? c.nome : (id ? 'conta ' + id : ''); };
  const rows = data || [];
  const forma = f => ({ credito: 'Crédito', debito: 'Débito', pix: 'Pix', frota: '🚛 Cartão frota' })[f] || f;
  const parc = r => Number(r.parcelas_de) === Number(r.parcelas_ate) ? (Number(r.parcelas_de) === 1 ? 'à vista' : r.parcelas_de + 'x') : `${r.parcelas_de}x a ${r.parcelas_ate}x`;
  const dt = v => v ? String(v).slice(8, 10) + '/' + String(v).slice(5, 7) + '/' + String(v).slice(0, 4) : '';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:#888;font-size:0.84rem">Taxas negociadas com a adquirente (e com as operadoras de cartão frota). A aba <b>💳 Cartões</b> usa estas regras para apontar taxa cobrada diferente da combinada; na frota, que não manda retorno, vale a taxa daqui.</p>
      <button onclick="fpTaxaForm()" class="btn-salvar">+ Nova taxa</button>
    </div>
    <div id="fp-taxa-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Adquirente</th><th style="padding:10px 12px">Forma</th><th style="padding:10px 12px">Bandeira</th><th style="padding:10px 12px">Parcelas</th>
          <th style="padding:10px 12px;text-align:right">Taxa %</th><th style="padding:10px 12px;text-align:right">Tarifa R$</th><th style="padding:10px 12px">Prazo</th><th style="padding:10px 12px">Vigência</th><th style="padding:10px 12px">Vale para</th><th style="padding:10px 12px">Conta onde entra</th><th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(r => `
          <tr style="border-top:1px solid #1c1f2e;color:${r.ativo === false ? '#667' : '#ddd'}">
            <td style="padding:9px 12px">${fpEsc(r.adquirente)}</td>
            <td style="padding:9px 12px;font-weight:500">${forma(r.forma)}</td>
            <td style="padding:9px 12px">${r.bandeira ? fpEsc(r.bandeira) : '<span style="color:#888">qualquer</span>'}</td>
            <td style="padding:9px 12px">${parc(r)}</td>
            <td style="padding:9px 12px;text-align:right;font-family:monospace;color:#7dd3fc">${Number(r.taxa_pct).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%</td>
            <td style="padding:9px 12px;text-align:right">${Number(r.tarifa_fixa || 0) ? Number(r.tarifa_fixa).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
            <td style="padding:9px 12px">${r.prazo_dias != null ? 'D+' + r.prazo_dias : '—'}</td>
            <td style="padding:9px 12px">${dt(r.vigencia_de)}${r.vigencia_ate ? ' a ' + dt(r.vigencia_ate) : ' em diante'}</td>
            <td style="padding:9px 12px">${r.empresa_id ? 'este posto' : '<span style="color:#9aa">rede toda</span>'}</td>
            <td style="padding:9px 12px">${r.conta_id ? fpEsc(nomeConta(r.conta_id)) : '<span style="color:#888">padrão</span>'}</td>
            <td style="padding:9px 12px">${r.ativo === false ? '<span style="color:#888">inativa</span>' : '<span style="color:#4caf50">ativa</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpTaxaForm(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">Editar</button>
              <button onclick="fpTaxaExcluir(${r.id})" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="12" style="padding:22px;text-align:center;color:#666">Nenhuma taxa cadastrada — a aba Cartões mostra tudo como "sem taxa cadastrada".</td></tr>'}
        </tbody>
      </table>
    </div>`;
}
function fpTaxaForm(r) {
  r = r || {};
  const div = document.getElementById('fp-taxa-form');
  const inp = 'style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"';
  const hoje = new Date(); const p = n => String(n).padStart(2, '0');
  const iso = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${r.id ? 'Editar' : 'Nova'} taxa negociada</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Adquirente / operadora da frota</label><input id="fpt-adq" list="fpt-adquirentes" value="${fpEsc(r.adquirente || 'pagbank')}" ${inp}>
          <datalist id="fpt-adquirentes">${FP_ADQUIRENTES.map(a => `<option value="${a}">`).join('')}</datalist></div>
        <div><label style="color:#888;font-size:0.78rem">Forma</label>
          <select id="fpt-forma" ${inp}>${[['credito', 'Crédito'], ['debito', 'Débito'], ['pix', 'Pix (maquininha)'], ['frota', '🚛 Cartão frota']].map(x => `<option value="${x[0]}" ${(r.forma || 'credito') === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
        <div><label style="color:#888;font-size:0.78rem">Bandeira (vazio = qualquer)</label><input id="fpt-band" list="fpt-bandeiras" value="${fpEsc(r.bandeira || '')}" placeholder="qualquer" ${inp}>
          <datalist id="fpt-bandeiras">${FP_BANDEIRAS.map(b => `<option value="${b}">`).join('')}</datalist></div>
        <div><label style="color:#888;font-size:0.78rem">Vale para</label>
          <select id="fpt-emp" ${inp}><option value="" ${!r.empresa_id ? 'selected' : ''}>rede toda</option><option value="posto" ${r.empresa_id ? 'selected' : ''}>só este posto</option></select></div>
        <div><label style="color:#888;font-size:0.78rem">Parcelas de</label><input id="fpt-pde" type="number" min="1" value="${r.parcelas_de ?? 1}" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Parcelas até</label><input id="fpt-pate" type="number" min="1" value="${r.parcelas_ate ?? r.parcelas_de ?? 1}" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Taxa % *</label><input id="fpt-pct" type="number" step="0.0001" min="0" value="${r.taxa_pct ?? ''}" placeholder="ex.: 1,99" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Tarifa fixa R$ (por venda)</label><input id="fpt-tarifa" type="number" step="0.01" min="0" value="${r.tarifa_fixa ?? 0}" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Prazo combinado (D+)</label><input id="fpt-prazo" type="number" min="0" value="${r.prazo_dias ?? ''}" placeholder="ex.: 1 ou 30" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Vigência de</label><input id="fpt-vde" type="date" value="${(r.vigencia_de || iso).slice(0, 10)}" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Vigência até (vazio = em diante)</label><input id="fpt-vate" type="date" value="${(r.vigencia_ate || '').slice(0, 10)}" ${inp}></div>
        <div><label style="color:#888;font-size:0.78rem">Observação</label><input id="fpt-obs" value="${fpEsc(r.obs || '')}" ${inp}></div>
        <div style="grid-column:span 2"><label style="color:#888;font-size:0.78rem">Conta onde o valor entra (só "este posto"; vazio = padrão)</label>
          <select id="fpt-conta" data-tinha="${r.conta_id ? 1 : 0}" ${inp}><option value="">padrão (cartão/Pix → PagBank; frota → conta da forma CARTÃO FROTA)</option>${(window._fpContasTaxa || []).map(c => `<option value="${c.id}" ${Number(r.conta_id) === Number(c.id) ? 'selected' : ''}>${fpEsc(c.nome)}</option>`).join('')}</select></div>
      </div>
      <p style="color:#777;font-size:0.74rem;margin:8px 0 0">Cartão frota: em "Adquirente" ponha a operadora (TicketLog, FitCard / Prime…) ou <b>frota</b> para valer a qualquer operadora; a bandeira fica vazia.</p>
      <div style="margin-top:12px"><label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpt-ativo" ${r.ativo !== false ? 'checked' : ''}> Ativa</label></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpTaxaSalvar(${r.id || 'null'})" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('fp-taxa-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpt-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
}
async function fpTaxaSalvar(id) {
  if (!podeOuAvisa('cartoes.taxas')) return;
  const g = k => document.getElementById('fpt-' + k);
  const msg = g('msg');
  const pct = parseFloat(String(g('pct').value).replace(',', '.'));
  if (!(pct >= 0)) { msg.style.color = '#f87171'; msg.textContent = 'Informe a taxa em %.'; return; }
  const pde = parseInt(g('pde').value) || 1, pate = parseInt(g('pate').value) || pde;
  if (pate < pde) { msg.style.color = '#f87171'; msg.textContent = 'Parcelas "até" menor que "de".'; return; }
  const reg = {
    empresa_id: g('emp').value === 'posto' ? window._fpEmpresaId : null,
    adquirente: (g('adq').value || 'pagbank').trim().toLowerCase(), forma: g('forma').value,
    bandeira: g('band').value.trim(), parcelas_de: pde, parcelas_ate: pate, taxa_pct: pct,
    tarifa_fixa: parseFloat(String(g('tarifa').value).replace(',', '.')) || 0,
    prazo_dias: g('prazo').value === '' ? null : parseInt(g('prazo').value),
    vigencia_de: g('vde').value || null, vigencia_ate: g('vate').value || null,
    ativo: g('ativo').checked, obs: g('obs').value.trim() || null, atualizado_em: new Date().toISOString(),
  };
  // a conta é do posto: numa regra da rede toda ela não vale para os outros postos
  const conta = g('conta') ? g('conta').value : '';
  if (conta && !reg.empresa_id) { msg.style.color = '#f87171'; msg.textContent = 'A conta só pode ser escolhida em regra "só este posto" (cada posto tem as suas contas).'; return; }
  // só manda a coluna conta_id quando há conta (ou para limpar uma que já existe): sem o SQL-CARTOES-FROTA as outras regras seguem salvando
  if (conta) reg.conta_id = Number(conta);
  else if (id && document.getElementById('fpt-conta').dataset.tinha === '1') reg.conta_id = null;
  try { const s = await getSession(); reg.atualizado_por = (s && s.user && s.user.email) || null; } catch (e) { /* ok */ }
  const q = id ? sb.from('oct_cartao_taxas').update(reg).eq('id', id) : sb.from('oct_cartao_taxas').insert(reg);
  const { error } = await q;
  if (error) {
    msg.style.color = '#f87171';
    msg.textContent = /ck_cartao_taxa_forma|conta_id/.test(String(error.message || '')) ? 'Falta rodar repo/sql/SQL-CARTOES-FROTA.sql no Supabase (forma Cartão frota e conta da taxa).' : 'Erro: ' + error.message;
    return;
  }
  document.getElementById('fp-taxa-form').innerHTML = '';
  fpTaxasListar();
}
async function fpTaxaExcluir(id) {
  if (!podeOuAvisa('cartoes.taxas')) return;
  if (!confirm('Excluir esta taxa negociada?')) return;
  const { error } = await sb.from('oct_cartao_taxas').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpTaxasListar();
}

// ===================== FORMA DE RECEBIMENTO =====================
// ---------- ACRÉSCIMO / DESCONTO POR FORMA (16/10/2026) ----------
// Pedido do Ronan: "na forma de pagamento tem que ter a opção de colocar acréscimo ou desconto no valor cobrado quando
// selecionar essa forma de pagamento". Fica em oct_parametros (chave forma_ajuste_<id da forma>, valor "tipo|modo|valor"),
// sem coluna nova. O PDV lê na tela de pagamento (pagamento.js, pdvCarregarAjustesForma): vale para a venda inteira,
// rateado nos itens; não soma com a tabela de preço do cliente; a forma com ajuste não entra em pagamento dividido.
function fpAjusteParse(v) {
  let o = v;
  if (typeof v === 'string') {
    const t = v.trim().replace(/^"|"$/g, '');
    if (t.charAt(0) === '{') { try { o = JSON.parse(t); } catch (e) { return null; } }
    else { const p = t.split('|'); o = { tipo: p[0], modo: p[1], valor: p[2] }; }
  }
  if (!o || typeof o !== 'object') return null;
  const tipo = String(o.tipo || '').toLowerCase(), modo = String(o.modo || 'percentual').toLowerCase();
  const valor = Number(String(o.valor == null ? '' : o.valor).replace(',', '.'));
  if (!['acrescimo', 'desconto'].includes(tipo) || !(valor > 0)) return null;
  return { tipo, modo: (modo === 'fixo' || modo === 'valor') ? 'fixo' : 'percentual', valor };
}
function fpAjusteRotulo(a) {
  if (!a) return '<span style="color:#667">—</span>';
  const v = a.modo === 'percentual'
    ? String(a.valor).replace('.', ',') + '%'
    : 'R$ ' + Number(a.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '/L';
  return a.tipo === 'desconto' ? `<span style="color:#4ade80">− ${v}</span>` : `<span style="color:#fbbf24">+ ${v}</span>`;
}
async function fpAjustesCarregar(eid) {
  const out = {};
  try {
    const { data } = await sb.from('oct_parametros').select('chave,valor').eq('empresa_id', eid).like('chave', 'forma_ajuste_%');
    (data || []).forEach(r => { const m = /^forma_ajuste_(.+)$/.exec(r.chave || ''); const a = m ? fpAjusteParse(r.valor) : null; if (a) out[m[1]] = a; });
  } catch (e) { /* sem tabela de parâmetros: sem ajuste */ }
  window._fpAjustes = out;
  return out;
}
// grava o ajuste da forma; "Nenhum" grava 'nenhum|percentual|0' (o PDV lê como sem ajuste) em vez de APAGAR a chave:
// se a política do banco não deixar apagar, o desconto continuaria valendo calado. Devolve {ok, erro}
async function fpAjusteGravar(eid, formaId, tipo, modo, valor) {
  const chave = 'forma_ajuste_' + formaId;
  if (tipo !== 'acrescimo' && tipo !== 'desconto') { tipo = 'nenhum'; valor = 0; }
  if (!(valor > 0)) { tipo = 'nenhum'; modo = 'percentual'; valor = 0; }
  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  const { error } = await sb.from('oct_parametros').upsert({
    empresa_id: eid, chave, valor: `${tipo}|${modo}|${valor}`,
    atualizado_em: new Date().toISOString(), atualizado_por: quem,
  }, { onConflict: 'empresa_id,chave' });
  return error ? { ok: false, erro: error.message } : { ok: true };
}

async function fpReceberListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  const { data } = await sb.from('oct_formas_pagamento').select('*').eq('empresa_id', eid).order('ordem');
  const rows = data || [];
  await fpAjustesCarregar(eid);
  // CONTA ONDE O VALOR ENTRA (11/10/2026, pedido do Ronan): cartão, Pix e cheque apontam para uma
  // conta do livro financeiro (Conciliação › 🏦 Contas). Ao confirmar a conferência de um caixa, o
  // F.Caixa lança o recebido de cada forma na conta dela — e a Conciliação já enxerga.
  let contas = [];
  try {
    const r = await sb.from('oct_fin_contas').select('id,nome,tipo,ativo,ordem').eq('empresa_id', eid).eq('ativo', true).order('ordem');
    contas = r.data || [];
  } catch (e) { contas = []; }
  window._fpContas = contas;
  const contaNome = id => { const c = contas.find(x => x.id === id); return c ? c.nome : ''; };
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:#888;font-size:0.84rem">Formas sincronizadas automaticamente com o PDV. A coluna <b>Conta</b> diz onde o valor entra quando o caixa é confirmado (F.Caixa).</p>
      <button onclick="fpReceberForm()" class="btn-salvar">+ Nova forma</button>
    </div>
    <div id="fp-receb-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Ordem</th><th style="padding:10px 12px">Nome</th>
          <th style="padding:10px 12px">Código SEFAZ</th><th style="padding:10px 12px">Conta onde entra</th><th style="padding:10px 12px">Acréscimo / desconto</th><th style="padding:10px 12px">A prazo</th>
          <th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length ? rows.map(f => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px">${f.ordem}</td>
            <td style="padding:9px 12px;font-weight:500">${fpEsc(f.nome)}</td>
            <td style="padding:9px 12px"><span style="font-family:monospace;color:#7dd3fc">${f.cod_sefaz}</span> ${fpSefazNome(f.cod_sefaz)}</td>
            <td style="padding:9px 12px">${f.conta_id && contaNome(f.conta_id) ? '🏦 ' + fpEsc(contaNome(f.conta_id)) : '<span style="color:#667">—</span>'}</td>
            <td style="padding:9px 12px">${fpAjusteRotulo((window._fpAjustes || {})[f.id])}</td>
            <td style="padding:9px 12px">${f.a_prazo ? '<span style="color:#fbbf24">sim</span>' : '—'}</td>
            <td style="padding:9px 12px">${f.ativo ? '<span style="color:#4caf50">ativo</span>' : '<span style="color:#888">inativo</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpReceberForm(${JSON.stringify(f).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">Editar</button>
              <button onclick="fpReceberExcluir('${f.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="8" style="padding:22px;text-align:center;color:#666">Nenhuma forma cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function fpReceberForm(f) {
  f = f || {};
  const div = document.getElementById('fp-receb-form');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${f.id ? 'Editar' : 'Nova'} forma de recebimento</h3>
      <div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome</label>
          <input id="fpr-nome" value="${fpEsc(f.nome) || ''}" placeholder="ex: Cartão de Débito" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Código SEFAZ (NFC-e)</label>
          <select id="fpr-sefaz" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            ${FP_SEFAZ.map(s => `<option value="${s.c}" ${f.cod_sefaz === s.c ? 'selected' : ''}>${s.c} - ${s.n}</option>`).join('')}
          </select></div>
        <div><label style="color:#888;font-size:0.78rem">Ordem</label>
          <input id="fpr-ordem" type="number" value="${f.ordem ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:340px 340px;gap:12px">
        <div>
          <label style="color:#888;font-size:0.78rem">Classificação (o PDV oculta por aqui conforme a integração)</label>
          <select id="fpr-classif" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            ${['','dinheiro','cartao','cartao_frota','nota_prazo','cheque','pix','vale','outros'].map(c =>
              `<option value="${c}" ${(f.classificacao||'') === c ? 'selected' : ''}>${({'':'— selecione —','dinheiro':'Dinheiro','cartao':'Cartão (crédito/débito)','cartao_frota':'Cartão Frota','nota_prazo':'Nota a Prazo','cheque':'Cheque','pix':'Pix','vale':'Vale','outros':'Outros'})[c]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="color:#888;font-size:0.78rem">Conta onde o valor entra (Pix e cheque: ao confirmar o caixa no F.Caixa; cartão e cartão frota: pela aba 💳 Cartões, ao enviar as conferidas)</label>
          <select id="fpr-conta" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="">— não lança no livro —</option>
            ${(window._fpContas || []).map(c => `<option value="${c.id}" ${Number(f.conta_id) === c.id ? 'selected' : ''}>${fpEsc(c.nome)}</option>`).join('')}
          </select>
          ${(window._fpContas || []).length ? '' : '<p style="color:#f0b45c;font-size:0.72rem;margin:4px 0 0">Este posto ainda não tem contas — cadastre em Conciliação › 🏦 Contas.</p>'}
        </div>
      </div>
      ${(() => {
        const a = (window._fpAjustes || {})[f.id] || { tipo: 'nenhum', modo: 'percentual', valor: '' };
        const sel = (v, x) => v === x ? 'selected' : '';
        return `<div style="margin-top:12px">
        <label style="color:#888;font-size:0.78rem">Acréscimo ou desconto no valor cobrado quando o PDV escolher esta forma
          <span style="color:#667">(% sobre a venda inteira; R$ por litro só no combustível; não soma com a tabela de preço do cliente; esta forma deixa de entrar em pagamento dividido)</span></label>
        <div style="display:flex;gap:8px;margin-top:4px;align-items:center;flex-wrap:wrap">
          <select id="fpr-aj-tipo" style="padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="nenhum" ${sel(a.tipo, 'nenhum')}>Nenhum</option>
            <option value="acrescimo" ${sel(a.tipo, 'acrescimo')}>Acréscimo</option>
            <option value="desconto" ${sel(a.tipo, 'desconto')}>Desconto</option>
          </select>
          <input id="fpr-aj-valor" type="number" step="0.01" min="0" value="${a.valor === '' ? '' : a.valor}" placeholder="0,00"
            style="width:120px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
          <select id="fpr-aj-modo" style="padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="percentual" ${sel(a.modo, 'percentual')}>% do valor da venda</option>
            <option value="fixo" ${sel(a.modo, 'fixo')}>R$ por litro (combustível)</option>
          </select>
        </div></div>`;
      })()}
      <div style="margin-top:12px;display:flex;gap:18px;align-items:center">
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-prazo" ${f.a_prazo ? 'checked' : ''}> Forma a prazo (fiado)</label>
        <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpr-ativo" ${f.ativo !== false ? 'checked' : ''}> Ativo</label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpReceberSalvar('${f.id || ''}')" class="btn-salvar">Salvar</button>
        <button onclick="document.getElementById('fp-receb-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpr-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;
}

async function fpReceberSalvar(id) {
  if (!podeOuAvisa('formas_pagamento.alterar')) return;
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpr-nome').value.trim();
  const msg = document.getElementById('fpr-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome.'; return; }
  const reg = {
    empresa_id: eid, nome,
    cod_sefaz: document.getElementById('fpr-sefaz').value,
    ordem: parseInt(document.getElementById('fpr-ordem').value) || 0,
    a_prazo: document.getElementById('fpr-prazo').checked,
    ativo: document.getElementById('fpr-ativo').checked,
    classificacao: document.getElementById('fpr-classif').value || null,
    conta_id: Number((document.getElementById('fpr-conta') || {}).value) || null,
  };
  // ACRÉSCIMO / DESCONTO da forma (16/10/2026): confere antes de gravar qualquer coisa
  const ajTipo = (document.getElementById('fpr-aj-tipo') || {}).value || 'nenhum';
  const ajModo = (document.getElementById('fpr-aj-modo') || {}).value || 'percentual';
  const ajValor = Number(String((document.getElementById('fpr-aj-valor') || {}).value || '').replace(',', '.')) || 0;
  if (ajTipo !== 'nenhum') {
    if (!(ajValor > 0)) { msg.style.color = '#f87171'; msg.textContent = 'Informe o valor do acréscimo/desconto (ou escolha "Nenhum").'; return; }
    if (ajModo === 'percentual' && ajValor >= 100) { msg.style.color = '#f87171'; msg.textContent = 'Percentual deve ser menor que 100%.'; return; }
  }
  const q = id ? sb.from('oct_formas_pagamento').update(reg).eq('id', id).select('id')
               : sb.from('oct_formas_pagamento').insert(reg).select('id');
  const { data: gravada, error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }
  const formaId = id || ((gravada || [])[0] || {}).id;
  if (formaId) {
    const ra = await fpAjusteGravar(eid, formaId, ajTipo, ajModo, ajValor);
    if (!ra.ok) { msg.style.color = '#f87171'; msg.textContent = 'A forma foi salva, mas o acréscimo/desconto NÃO: ' + ra.erro; return; }
  }
  document.getElementById('fp-receb-form').innerHTML = '';
  fpReceberListar();
}

async function fpReceberExcluir(id) {
  if (!podeOuAvisa('formas_pagamento.excluir')) return;
  if (!confirm('Excluir esta forma de recebimento?')) return;
  const { error } = await sb.from('oct_formas_pagamento').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  try { await fpAjusteGravar(window._fpEmpresaId, id, 'nenhum', 'percentual', 0); } catch (e) { /* sem ajuste: nada a apagar */ }
  fpReceberListar();
}

// ===================== TABELA DE PREÇO (v2 17/08 — modelo TecnoX) =====================
// Grid de NEGOCIAÇÃO por produto (preço fixo / acréscimo / desconto, R$ ou %),
// clientes com busca, e consulta rápida "que preço o cliente X tem?".
async function fpPrecoListar() {
  const div = document.getElementById('fp-conteudo');
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:16px">Carregando...</p>';
  const [{ data: tabs }, { data: formas }, { data: vCli }, { data: vFor }, { data: itens }] = await Promise.all([
    sb.from('oct_tabelas_preco').select('*').eq('empresa_id', eid).order('ordem'),
    sb.from('oct_formas_pagamento').select('id,nome').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
    sb.from('oct_tabela_preco_clientes').select('tabela_id').eq('empresa_id', eid),
    sb.from('oct_tabela_preco_formas').select('tabela_id,forma_id').eq('empresa_id', eid),
    sb.from('oct_tabela_preco_itens').select('tabela_id').eq('empresa_id', eid),
  ]);
  window._fpFormas = formas || [];
  const nCli = {}, nIt = {}, fPorTab = {};
  (vCli || []).forEach(v => nCli[v.tabela_id] = (nCli[v.tabela_id] || 0) + 1);
  (itens || []).forEach(v => nIt[v.tabela_id] = (nIt[v.tabela_id] || 0) + 1);
  (vFor || []).forEach(v => {
    const f = (formas || []).find(x => x.id === v.forma_id);
    (fPorTab[v.tabela_id] = fPorTab[v.tabela_id] || []).push(f ? f.nome : '?');
  });
  const rows = tabs || [];
  // DESCONTO APP (16/10/2026): tabela FIXA do posto (não se exclui), sempre no topo da lista
  let da = null, daItens = 0, daErro = null;
  try {
    const [r1, r2] = await Promise.all([
      sb.from('oct_app_desconto').select('ativo,formas').eq('empresa_id', eid).maybeSingle(),
      sb.from('oct_app_desconto_itens').select('produto_id,desconto_litro').eq('empresa_id', eid).gt('desconto_litro', 0),
    ]);
    if (r1.error) throw r1.error;
    da = r1.data || { ativo: false, formas: [] };
    daItens = (r2.data || []).length;
  } catch (e) { daErro = (e && e.message) || String(e); }
  const daFormas = da ? (da.formas || []).map(id => { const f = (formas || []).find(x => x.id === id); return f ? f.nome : null; }).filter(Boolean) : [];
  const linhaDescApp = `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd;background:#101a2b">
            <td style="padding:9px 12px;font-weight:600">📱 DESCONTO APP <span style="color:#7dd3fc;font-size:0.7rem;font-weight:500">🔒 tabela fixa</span>
              <div style="color:#888;font-size:0.72rem">desconto na bomba para quem escolhe "Desconto agora" no app</div></td>
            <td style="padding:9px 12px">${daErro ? '<span style="color:#f87171">falta rodar o SQL-APP-DESCONTO-BOMBA.sql</span>' : daItens ? `<span style="color:#7dd3fc">${daItens} combustível(is)</span>` : '<span style="color:#666">—</span>'}</td>
            <td style="padding:9px 12px;color:#9aa;font-size:0.78rem">clientes do app</td>
            <td style="padding:9px 12px;color:#9aa;font-size:0.78rem">${daFormas.join(', ') || '<span style="color:#f87171">nenhuma ⚠</span>'}</td>
            <td style="padding:9px 12px">${da && da.ativo ? '<span style="color:#4caf50">ligada</span>' : '<span style="color:#888">desligada</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              ${daErro ? '' : '<button onclick="fpDescAppForm()" class="nfe-aba" style="font-size:0.76rem">✎ Abrir</button>'}
              <span title="Tabela fixa: não pode ser excluída. Para parar o desconto, desligue." style="color:#666;font-size:0.74rem;margin-left:6px">não se exclui</span>
            </td>
          </tr>`;
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="display:flex;gap:6px;align-items:center">
        <input id="fp-consulta-cli" placeholder="🔎 Que preço tem o cliente...?" onkeydown="if(event.key==='Enter')fpConsultaCliente()"
          style="width:280px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
        <button onclick="fpConsultaCliente()" class="nfe-aba">Consultar</button>
      </div>
      <button onclick="fpPrecoForm()" class="btn-salvar">+ Nova negociação</button>
    </div>
    <div id="fp-preco-form"></div>
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:0.86rem">
        <thead><tr style="color:#888;text-align:left;background:#0f1119">
          <th style="padding:10px 12px">Negociação</th><th style="padding:10px 12px">Produtos</th>
          <th style="padding:10px 12px">Clientes</th><th style="padding:10px 12px">Forma(s)</th>
          <th style="padding:10px 12px">Situação</th><th></th>
        </tr></thead>
        <tbody>
        ${linhaDescApp}
        ${rows.length ? rows.map(t => `
          <tr style="border-top:1px solid #1c1f2e;color:#ddd">
            <td style="padding:9px 12px;font-weight:500">${fpEsc(t.nome)}
              ${t.tipo_ajuste !== 'nenhum' && Number(t.valor_ajuste) ? `<div style="color:#888;font-size:0.72rem">${fpAjusteLabel(t.tipo_ajuste)} global ${fpValorLabel(t)}</div>` : ''}</td>
            <td style="padding:9px 12px">${nIt[t.id] ? `<span style="color:#7dd3fc">${nIt[t.id]} negociado(s)</span>` : '<span style="color:#666">—</span>'}</td>
            <td style="padding:9px 12px">${nCli[t.id] ? `<b>${nCli[t.id]}</b>` : '<span style="color:#f87171">nenhum ⚠</span>'}</td>
            <td style="padding:9px 12px;color:#9aa;font-size:0.78rem">${(fPorTab[t.id] || []).join(', ') || '<span style="color:#f87171">nenhuma ⚠</span>'}</td>
            <td style="padding:9px 12px">${t.ativo ? '<span style="color:#4caf50">ativa</span>' : '<span style="color:#888">inativa</span>'}</td>
            <td style="padding:9px 12px;text-align:right;white-space:nowrap">
              <button onclick='fpPrecoForm(${JSON.stringify(t).replace(/'/g, "&#39;")})' class="nfe-aba" style="font-size:0.76rem">✎ Abrir</button>
              <button onclick="fpPrecoExcluir('${t.id}')" class="nfe-aba" style="font-size:0.76rem;color:#f87171">Excluir</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="6" style="padding:22px;text-align:center;color:#666">Nenhuma negociação cadastrada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ===================== DESCONTO APP (16/10/2026, pedido do Ronan) =====================
// Tabela FIXA por posto (oct_app_desconto + oct_app_desconto_itens; o banco não deixa excluir).
// O cliente escolhe "Desconto agora" no app e o NÚCLEO do posto baixa o preço SÓ daquele bico
// pelo valor daqui (R$ por litro) e devolve no fim. Vale só nas formas marcadas (a prazo fica
// fora: tem o fluxo próprio do app). Desligar = parar na hora (o app deixa de oferecer).
async function fpDescAppForm() {
  const div = document.getElementById('fp-preco-form');
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:10px">Carregando...</p>';
  const [cab, its, prods, formas] = await Promise.all([
    sb.from('oct_app_desconto').select('*').eq('empresa_id', eid).maybeSingle(),
    sb.from('oct_app_desconto_itens').select('produto_id,desconto_litro').eq('empresa_id', eid),
    sb.from('oct_produtos').select('id,nome,preco_venda_a,tanque_id').eq('empresa_id', eid).eq('ativo', true)
      .not('tanque_id', 'is', null).order('nome'),
    sb.from('oct_formas_pagamento').select('id,nome,a_prazo').eq('empresa_id', eid).eq('ativo', true).order('ordem'),
  ]);
  const erro = cab.error || its.error || prods.error || formas.error;
  if (erro) { div.innerHTML = `<p style="color:#f87171;padding:10px">Não consegui abrir: ${fpEsc(erro.message)}</p>`; return; }
  const t = cab.data || { ativo: false, formas: [] };
  const desc = {}; (its.data || []).forEach(i => { desc[i.produto_id] = Number(i.desconto_litro || 0); });
  window._fpDaProdutos = prods.data || [];
  const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const linhas = (prods.data || []).map(p => `
    <tr style="border-top:1px solid #1c1f2e">
      <td style="padding:7px 10px;color:#ddd">${fpEsc(p.nome)}</td>
      <td style="padding:7px 10px;text-align:right;color:#9aa">R$ ${fmt(p.preco_venda_a)}</td>
      <td style="padding:7px 10px;text-align:right">
        <input class="fp-da-desc" data-id="${p.id}" data-preco="${Number(p.preco_venda_a || 0)}" type="number" min="0" max="1" step="0.01"
          value="${desc[p.id] ? desc[p.id] : ''}" placeholder="0,00" oninput="fpDescAppPrevia()"
          style="width:96px;padding:6px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;text-align:right"></td>
      <td style="padding:7px 10px;text-align:right;font-weight:600" id="fp-da-prev-${p.id}">—</td>
    </tr>`).join('');
  const marcadas = new Set(t.formas || []);
  const caixasForma = (formas.data || []).map(f => f.a_prazo
    ? `<label style="color:#666;margin-right:14px" title="A prazo pelo app tem fluxo próprio (selfie e limite): fica fora do desconto na bomba"><input type="checkbox" disabled> ${fpEsc(f.nome)} <span style="font-size:0.7rem">(a prazo: fora)</span></label>`
    : `<label style="color:#ddd;margin-right:14px"><input type="checkbox" class="fp-da-forma" value="${f.id}" ${marcadas.has(f.id) ? 'checked' : ''}> ${fpEsc(f.nome)}</label>`).join('');
  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a4a7a;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <h3 style="color:#7dd3fc;margin:0">📱 DESCONTO APP <span style="font-size:0.72rem;color:#888;font-weight:500">🔒 tabela fixa deste posto</span></h3>
        <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Fechar</button>
      </div>
      <p style="color:#9aa;font-size:0.8rem;margin:8px 0 12px;max-width:760px">
        O cliente lê o QR do bico no app e escolhe <b>Desconto agora</b>: o preço <b>daquele bico</b> baixa pelo valor abaixo,
        ele abastece e o preço volta ao normal no fim (ou em 3 minutos, se ele não começar). Quem escolhe o desconto não acumula cashback nesse abastecimento.</p>
      <div style="background:#2a1d0d;border:1px solid #7a4a10;border-radius:8px;padding:9px 12px;color:#f0b45c;font-size:0.78rem;margin-bottom:12px">
        ⚠ Ligue só em posto onde o preço da bomba é trocado pelo Octano (hoje, o SEVEN). Onde o TecnoX controla o preço
        (Tijuco, Florestal e Antônio Carlos), ele desfaz a troca e o desconto não entra.</div>
      <label style="color:#ddd;font-weight:600;display:inline-flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="checkbox" id="fp-da-ativo" ${t.ativo ? 'checked' : ''}> Desconto do app ligado neste posto</label>
      <div style="color:#888;font-size:0.78rem;margin-bottom:4px">Formas de pagamento em que o desconto vale (o cliente escolhe no app):</div>
      <div style="margin-bottom:14px">${caixasForma || '<span style="color:#f87171">nenhuma forma ativa</span>'}</div>
      <table style="width:100%;max-width:760px;border-collapse:collapse;font-size:0.84rem">
        <thead><tr style="color:#888;text-align:left">
          <th style="padding:6px 10px">Combustível</th><th style="padding:6px 10px;text-align:right">Preço do cadastro</th>
          <th style="padding:6px 10px;text-align:right">Desconto (R$ por litro)</th><th style="padding:6px 10px;text-align:right">Preço no app</th>
        </tr></thead>
        <tbody>${linhas || '<tr><td colspan="4" style="padding:14px;color:#888">Nenhum combustível ativo (produto ligado a tanque).</td></tr>'}</tbody>
      </table>
      <div style="color:#888;font-size:0.72rem;margin-top:6px">Vazio ou 0 = sem desconto nesse combustível. No máximo R$ 1,00 por litro.</div>
      <div id="fp-da-msg" style="min-height:18px;margin-top:10px;font-size:0.82rem"></div>
      <button onclick="fpDescAppSalvar()" class="btn-salvar" style="margin-top:6px">Salvar DESCONTO APP</button>
    </div>`;
  fpDescAppPrevia();
}

function fpDescAppPrevia() {
  document.querySelectorAll('.fp-da-desc').forEach(inp => {
    const el = document.getElementById('fp-da-prev-' + inp.dataset.id);
    if (!el) return;
    const v = parseFloat(String(inp.value || '').replace(',', '.')) || 0;
    const preco = Number(inp.dataset.preco || 0);
    if (!v) { el.textContent = '—'; el.style.color = '#666'; return; }
    const ok = v > 0 && v <= 1 && preco - v >= 0.5;
    el.textContent = ok ? 'R$ ' + (preco - v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : 'inválido';
    el.style.color = ok ? '#4ade80' : '#f87171';
  });
}

async function fpDescAppSalvar() {
  if (!podeOuAvisa('formas_pagamento.negociacao')) return;
  const eid = window._fpEmpresaId;
  const msg = document.getElementById('fp-da-msg');
  const ativo = !!(document.getElementById('fp-da-ativo') || {}).checked;
  const formas = Array.from(document.querySelectorAll('.fp-da-forma:checked')).map(c => c.value);
  const itens = [];
  for (const inp of document.querySelectorAll('.fp-da-desc')) {
    const v = parseFloat(String(inp.value || '').replace(',', '.')) || 0;
    const preco = Number(inp.dataset.preco || 0);
    if (v < 0 || v > 1 || (v > 0 && preco - v < 0.5)) {
      msg.style.color = '#f87171'; msg.textContent = 'Desconto inválido: use de R$ 0,01 a R$ 1,00 por litro.'; inp.focus(); return;
    }
    itens.push({ empresa_id: eid, produto_id: inp.dataset.id, desconto_litro: Math.round(v * 1000) / 1000, atualizado_em: new Date().toISOString() });
  }
  if (ativo && !formas.length) { msg.style.color = '#f87171'; msg.textContent = 'Marque ao menos uma forma de pagamento.'; return; }
  if (ativo && !itens.some(i => i.desconto_litro > 0)) { msg.style.color = '#f87171'; msg.textContent = 'Informe o desconto de ao menos um combustível.'; return; }
  msg.style.color = '#888'; msg.textContent = 'Salvando...';
  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  // a linha do posto já existe (o SQL cria uma por posto e o gatilho cria a do posto novo): só UPDATE
  const r1 = await sb.from('oct_app_desconto').update({ ativo, formas, atualizado_em: new Date().toISOString(), atualizado_por: quem })
    .eq('empresa_id', eid).select('empresa_id');
  if (r1.error || !(r1.data || []).length) {
    msg.style.color = '#f87171'; msg.textContent = 'Não salvei: ' + (r1.error ? r1.error.message : 'sem permissão para alterar') + '.'; return;
  }
  if (itens.length) {
    const r2 = await sb.from('oct_app_desconto_itens').upsert(itens, { onConflict: 'empresa_id,produto_id' });
    if (r2.error) { msg.style.color = '#f87171'; msg.textContent = 'A tabela foi salva, mas os descontos não: ' + r2.error.message; return; }
  }
  msg.style.color = '#4ade80';
  msg.textContent = ativo ? '✅ Salvo. O app passa a oferecer o desconto nos bicos desses combustíveis.' : '✅ Salvo. Desconto do app DESLIGADO neste posto.';
  setTimeout(() => fpPrecoListar(), 1200);
}

// ---- CONSULTA RÁPIDA: que preço o cliente tem? ----
async function fpConsultaCliente() {
  const termo = (document.getElementById('fp-consulta-cli').value || '').trim();
  const div = document.getElementById('fp-preco-form');
  if (termo.length < 2) { div.innerHTML = '<p style="color:#f87171;padding:8px">Digite ao menos 2 letras do nome.</p>'; return; }
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:10px">Consultando...</p>';
  const { data: pes } = await sb.from('oct_pessoas').select('id,nome')
    .eq('empresa_id', eid).ilike('nome', `%${termo}%`).limit(8);
  if (!pes || !pes.length) { div.innerHTML = '<p style="color:#f87171;padding:8px">Nenhum cliente com esse nome.</p>'; return; }
  const blocos = [];
  for (const p of pes) {
    const { data: vin } = await sb.from('oct_tabela_preco_clientes').select('tabela_id').eq('cliente_id', p.id);
    if (!vin || !vin.length) { blocos.push(`<div style="padding:6px 0;color:#888">👤 <b style="color:#ddd">${fpEsc(p.nome)}</b> — sem negociação (paga preço de bomba)</div>`); continue; }
    for (const v of vin) {
      const [{ data: tab }, { data: its }] = await Promise.all([
        sb.from('oct_tabelas_preco').select('*').eq('id', v.tabela_id).single(),
        sb.from('oct_tabela_preco_itens').select('*').eq('tabela_id', v.tabela_id),
      ]);
      const { data: prods } = await sb.from('oct_produtos').select('id,nome,preco_venda_a').in('id', (its || []).map(i => i.produto_id));
      const pm = {}; (prods || []).forEach(x => pm[x.id] = x);
      const linhas = (its || []).map(i => {
        const pr = pm[i.produto_id] || {};
        const final = i.preco_fixo != null ? Number(i.preco_fixo)
          : fpCalcular(Number(pr.preco_venda_a || 0), i.tipo_ajuste, i.modo_ajuste, Number(i.valor_ajuste || 0));
        return `<tr><td style="padding:4px 10px;color:#ddd">${fpEsc(pr.nome || '?')}</td>
          <td style="padding:4px 10px;color:#9aa">${i.preco_fixo != null ? 'preço fixo' : fpAjusteLabel(i.tipo_ajuste)}</td>
          <td style="padding:4px 10px;text-align:right;color:#4ade80;font-weight:600">R$ ${final.toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</td></tr>`;
      }).join('');
      blocos.push(`<div style="padding:8px 0;border-bottom:1px solid #1c1f2e">
        👤 <b style="color:#ddd">${fpEsc(p.nome)}</b> → <span style="color:#7dd3fc">${fpEsc(tab && tab.nome)}</span>
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-top:4px">${linhas || '<tr><td style="color:#888;padding:4px 10px">só o ajuste global da negociação</td></tr>'}</table>
      </div>`);
    }
  }
  div.innerHTML = `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="color:#7dd3fc">🔎 Consulta de preço por cliente</h3>
    <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Fechar</button></div>
    ${blocos.join('')}</div>`;
}

async function fpPrecoForm(t) {
  t = t || {};
  const div = document.getElementById('fp-preco-form');
  const formas = window._fpFormas || [];
  const eid = window._fpEmpresaId;
  div.innerHTML = '<p style="color:#888;padding:10px">Carregando...</p>';

  const [cliRes, vincCliRes, vincFormaRes, prodRes, itensRes] = await Promise.all([
    sb.from('oct_pessoas').select('id,nome,documento,classificacoes,tipo').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    t.id ? sb.from('oct_tabela_preco_clientes').select('cliente_id').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
    t.id ? sb.from('oct_tabela_preco_formas').select('forma_id').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
    sb.from('oct_produtos').select('id,nome,preco_venda_a,categoria,codigo').eq('empresa_id', eid).eq('ativo', true).order('nome'),
    t.id ? sb.from('oct_tabela_preco_itens').select('*').eq('tabela_id', t.id) : Promise.resolve({ data: [] }),
  ]);
  const todosClientes = (cliRes.data || []).filter(p => {
    const c = Array.isArray(p.classificacoes) ? p.classificacoes : (p.tipo ? [p.tipo] : []);
    return c.includes('cliente') || c.includes('ambos');
  });
  const cliVinculados = new Set((vincCliRes.data || []).map(v => v.cliente_id));
  const formaVinculadas = new Set((vincFormaRes.data || []).map(v => v.forma_id));
  window._fpClientesCache = todosClientes;
  window._fpProdutos = prodRes.data || [];

  div.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;margin-bottom:8px">
      <h3 style="color:#ddd;margin-bottom:12px">${t.id ? '✎ ' + fpEsc(t.nome) : 'Nova negociação'}</h3>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
        <div><label style="color:#888;font-size:0.78rem">Nome da negociação</label>
          <input id="fpp-nome" value="${fpEsc(t.nome) || ''}" placeholder="ex: Prazo negociado — padrão" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        <div><label style="color:#888;font-size:0.78rem">Forma sugerida no PDV (opcional)</label>
          <select id="fpp-forma" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
            <option value="">— nenhuma —</option>
            ${formas.map(fm => `<option value="${fm.id}" ${t.forma_padrao === fm.id ? 'selected' : ''}>${fpEsc(fm.nome)}</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:flex-end;gap:14px">
          <label style="color:#ddd;font-size:0.84rem"><input type="checkbox" id="fpp-ativo" ${t.ativo !== false ? 'checked' : ''}> Ativa</label>
        </div>
      </div>

      <!-- ===== GRID DE NEGOCIAÇÃO (modelo TecnoX): produto × tipo × valor ===== -->
      <div style="background:#0f1119;border-radius:8px;padding:12px;margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="color:#7dd3fc;font-size:0.84rem;font-weight:700">💰 Negociação por produto</label>
          <button onclick="fpNegAdd()" class="nfe-aba" style="color:#4ade80">➕ Incluir produto</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:#888;text-align:left">
            <th style="padding:6px">Produto</th><th style="padding:6px">Tipo de negociação</th>
            <th style="padding:6px">Valor</th><th style="padding:6px;text-align:right">Preço de bomba</th>
            <th style="padding:6px;text-align:right">Preço final</th><th></th>
          </tr></thead>
          <tbody id="fpp-neg-tbody"></tbody>
        </table>
        <p style="color:#666;font-size:0.72rem;margin-top:6px">Preço fixo não acompanha a bomba — quando o preço do posto mudar, atualize aqui. Produto fora da lista usa o preço normal (ou o ajuste global abaixo).</p>
      </div>

      <!-- ajuste global (avançado, opcional) -->
      <details style="margin-top:10px"><summary style="color:#888;font-size:0.78rem;cursor:pointer">Ajuste global (aplica a produtos SEM negociação específica)</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px">
          <div><label style="color:#888;font-size:0.78rem">Tipo</label>
            <select id="fpp-tipo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="nenhum" ${t.tipo_ajuste === 'nenhum' || !t.tipo_ajuste ? 'selected' : ''}>Nenhum</option>
              <option value="desconto" ${t.tipo_ajuste === 'desconto' ? 'selected' : ''}>Desconto</option>
              <option value="acrescimo" ${t.tipo_ajuste === 'acrescimo' ? 'selected' : ''}>Acréscimo</option>
            </select></div>
          <div><label style="color:#888;font-size:0.78rem">Modo</label>
            <select id="fpp-modo" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="percentual" ${t.modo_ajuste === 'percentual' || !t.modo_ajuste ? 'selected' : ''}>Percentual (%)</option>
              <option value="fixo" ${t.modo_ajuste === 'fixo' ? 'selected' : ''}>Valor (R$)</option>
            </select></div>
          <div><label style="color:#888;font-size:0.78rem">Valor</label>
            <input id="fpp-valor" type="number" step="0.001" value="${t.valor_ajuste ?? 0}" style="width:100%;padding:9px;margin-top:4px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
        </div>
      </details>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
        <div style="background:#0f1119;border-radius:8px;padding:12px">
          <label style="color:#ddd;font-size:0.82rem;display:block;margin-bottom:6px">👤 Clientes desta negociação</label>
          <p style="color:#7dd3fc;font-size:1.4rem;font-weight:700;margin:4px 0">${cliVinculados.size}</p>
          <p style="color:#888;font-size:0.74rem">O vínculo é feito no CADASTRO do cliente
            (Pessoas → editar → campo <b style="color:#ddd">💲 Tabela de preço</b>) — igual ao TecnoX.
            Use a 🔎 consulta por cliente na lista pra conferir quem está em qual negociação.</p>
        </div>
        <div style="background:#0f1119;border-radius:8px;padding:12px">
          <label style="color:#ddd;font-size:0.82rem;display:block;margin-bottom:8px">💳 Formas que disparam esta negociação</label>
          <p style="color:#666;font-size:0.72rem;margin-bottom:8px">Só aplica se a forma escolhida no PDV estiver marcada aqui.</p>
          <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
            ${formas.length ? formas.map(fm => `
              <label style="color:#ddd;font-size:0.82rem;display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
                <input type="checkbox" class="fpp-forma-vinc" value="${fm.id}" ${formaVinculadas.has(fm.id) ? 'checked' : ''}>
                ${fpEsc(fm.nome)}
              </label>`).join('') : '<span style="color:#666;font-size:0.78rem">Cadastre formas de recebimento primeiro.</span>'}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="fpPrecoSalvar('${t.id || ''}')" class="btn-salvar">💾 Salvar negociação</button>
        <button onclick="document.getElementById('fp-preco-form').innerHTML=''" class="nfe-aba">Cancelar</button>
      </div>
      <div id="fpp-msg" style="margin-top:8px;font-size:0.82rem"></div>
    </div>`;

  // popula o grid com as negociações existentes (inclui preco_fixo, que a
  // tela antiga ignorava — e apagava no salvar. Corrigido 17/08.)
  (itensRes.data || []).forEach(i => fpNegAdd(i));
}

// ---- grid de negociação: linhas dinâmicas ----
// 24/09/2026 (pedido Ronan, cadastrando preço a prazo na AC): 458 produtos num
// select só não dá pra achar nada. Primeiro escolhe a CATEGORIA (Lubrificantes,
// Filtros, Combustíveis…) e o select de produto mostra só ela; o código do
// produto vai no rótulo pra bater com a etiqueta/nota.
function fpNegCat(p) { return String(p.categoria || '').trim().toUpperCase(); }
function fpNegCategorias() {
  const set = new Set((window._fpProdutos || []).map(fpNegCat).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function fpNegOpcoesProduto(cat, selecionado) {
  const prods = (window._fpProdutos || []).filter(p => !cat || fpNegCat(p) === cat || p.id === selecionado);
  return '<option value="">— escolha o produto —</option>' + prods.map(p =>
    `<option value="${p.id}" data-preco="${p.preco_venda_a || 0}" ${p.id === selecionado ? 'selected' : ''}>${fpEsc(p.nome)}${p.codigo ? ' · cód ' + fpEsc(p.codigo) : ''}</option>`).join('');
}
function fpNegFiltrar(tr) {
  const cat = tr.querySelector('.neg-cat').value;
  const sel = tr.querySelector('.neg-prod');
  sel.innerHTML = fpNegOpcoesProduto(cat, '');   // trocou a categoria: escolhe de novo
  fpNegCalc(tr);
}
function fpNegAdd(item) {
  const tbody = document.getElementById('fpp-neg-tbody');
  if (!tbody) return;
  const prods = window._fpProdutos || [];
  const prodItem = item ? prods.find(p => p.id === item.produto_id) : null;
  const catSel = prodItem ? fpNegCat(prodItem) : '';
  const tr = document.createElement('tr');
  tr.style.borderTop = '1px solid #1c1f2e';
  let tipoSel = 'fixo_preco';
  let valor = '';
  if (item) {
    if (item.preco_fixo != null) { tipoSel = 'fixo_preco'; valor = Number(item.preco_fixo); }
    else if (item.tipo_ajuste === 'acrescimo') { tipoSel = item.modo_ajuste === 'percentual' ? 'acr_pc' : 'acr_rs'; valor = Number(item.valor_ajuste); }
    else if (item.tipo_ajuste === 'desconto') { tipoSel = item.modo_ajuste === 'percentual' ? 'desc_pc' : 'desc_rs'; valor = Number(item.valor_ajuste); }
  }
  tr.innerHTML = `
    <td style="padding:5px"><select class="neg-cat" onchange="fpNegFiltrar(this.closest('tr'))" title="Filtra o produto pela categoria" style="margin-bottom:4px;font-size:0.76rem;color:#9fb0c4;width:100%;max-width:340px;padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem"><option value="">— todas as categorias —</option>${fpNegCategorias().map(c => `<option value="${fpEsc(c)}" ${c === catSel ? 'selected' : ''}>${fpEsc(c)}</option>`).join('')}</select>
    <select class="neg-prod" onchange="fpNegCalc(this.closest('tr'))" style="width:100%;max-width:340px;padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">${fpNegOpcoesProduto(catSel, item ? item.produto_id : '')}</select></td>
    <td style="padding:5px"><select class="neg-tipo" onchange="fpNegCalc(this.closest('tr'))" style="padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.8rem">
      <option value="fixo_preco" ${tipoSel === 'fixo_preco' ? 'selected' : ''}>Preço fixo (R$/un)</option>
      <option value="acr_rs" ${tipoSel === 'acr_rs' ? 'selected' : ''}>Acréscimo (R$)</option>
      <option value="desc_rs" ${tipoSel === 'desc_rs' ? 'selected' : ''}>Desconto (R$)</option>
      <option value="acr_pc" ${tipoSel === 'acr_pc' ? 'selected' : ''}>Acréscimo (%)</option>
      <option value="desc_pc" ${tipoSel === 'desc_pc' ? 'selected' : ''}>Desconto (%)</option>
    </select></td>
    <td style="padding:5px"><input class="neg-valor" type="number" step="0.001" value="${valor}" oninput="fpNegCalc(this.closest('tr'))"
      style="width:100px;padding:6px;border-radius:5px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff;font-size:0.82rem;font-weight:600"></td>
    <td class="neg-bomba" style="padding:5px;text-align:right;color:#9aa">—</td>
    <td class="neg-final" style="padding:5px;text-align:right;color:#4ade80;font-weight:700">—</td>
    <td style="padding:5px"><button onclick="this.closest('tr').remove()" class="nfe-aba" style="color:#f87171;font-size:0.74rem">🗑</button></td>`;
  tbody.appendChild(tr);
  fpNegCalc(tr);
}

function fpNegCalc(tr) {
  const sel = tr.querySelector('.neg-prod');
  const bomba = Number((sel.selectedOptions[0] || {}).dataset?.preco || 0);
  const tipo = tr.querySelector('.neg-tipo').value;
  const v = parseFloat(tr.querySelector('.neg-valor').value) || 0;
  let final = bomba;
  if (tipo === 'fixo_preco') final = v;
  else if (tipo === 'acr_rs') final = bomba + v;
  else if (tipo === 'desc_rs') final = Math.max(0, bomba - v);
  else if (tipo === 'acr_pc') final = bomba * (1 + v / 100);
  else if (tipo === 'desc_pc') final = Math.max(0, bomba * (1 - v / 100));
  tr.querySelector('.neg-bomba').textContent = bomba ? bomba.toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : '—';
  tr.querySelector('.neg-final').textContent = (sel.value && (v || tipo !== 'fixo_preco')) ? final.toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : '—';
}


// cálculo central: aplica ajuste sobre o preço base
function fpCalcular(base, tipo, modo, valor) {
  if (tipo === 'nenhum' || !valor) return base;
  let ajuste = modo === 'percentual' ? base * (valor / 100) : valor;
  return tipo === 'desconto' ? Math.max(0, base - ajuste) : base + ajuste;
}

async function fpPrecoSalvar(id) {
  if (!podeOuAvisa('formas_pagamento.negociacao')) return;
  const eid = window._fpEmpresaId;
  const nome = document.getElementById('fpp-nome').value.trim();
  const msg = document.getElementById('fpp-msg');
  if (!nome) { msg.style.color = '#f87171'; msg.textContent = 'Informe o nome da condição.'; return; }
  const reg = {
    empresa_id: eid, nome,
    tipo_ajuste: document.getElementById('fpp-tipo').value,
    modo_ajuste: document.getElementById('fpp-modo').value,
    valor_ajuste: parseFloat(document.getElementById('fpp-valor').value) || 0,
    forma_padrao: document.getElementById('fpp-forma').value || null,
    ativo: document.getElementById('fpp-ativo').checked,
  };
  // 24/09/2026: a tela pode estar aberta com a lista de produtos VELHA (produto
  // fundido/apagado enquanto isso). Gravar o cabeçalho e só depois falhar nos
  // itens (FK) deixava um cabeçalho vazio a cada tentativa -- a AC ficou com 3
  // "CLIENTE A PRAZO AC". Confere ANTES de gravar qualquer coisa.
  const _prodIds = new Set((window._fpProdutos || []).map(p => p.id));
  const _sumidos = [...document.querySelectorAll('#fpp-neg-tbody tr')]
    .map(tr => tr.querySelector('.neg-prod')).filter(sel => sel.value && !_prodIds.has(sel.value))
    .map(sel => (sel.selectedOptions[0] || {}).textContent || sel.value);
  if (_sumidos.length) {
    msg.style.color = '#f87171';
    msg.textContent = 'Produto não existe mais no cadastro (' + _sumidos.join(', ') + '). Recarregue a tela (F5) e escolha de novo.';
    return;
  }
  const q = id ? sb.from('oct_tabelas_preco').update(reg).eq('id', id).select().single()
               : sb.from('oct_tabelas_preco').insert(reg).select().single();
  const { data: salvo, error } = await q;
  if (error) { msg.style.color = '#f87171'; msg.textContent = 'Erro: ' + error.message; return; }

  const tabelaId = salvo.id;
  // se os itens falharem numa negociação NOVA, desfaz o cabeçalho (senão sobra
  // um vazio a cada tentativa)
  const _desfazer = async (motivo) => {
    if (!id) {
      try {
        await sb.from('oct_tabela_preco_formas').delete().eq('tabela_id', tabelaId);
        await sb.from('oct_tabelas_preco').delete().eq('id', tabelaId);
      } catch (e) { /* segue */ }
    }
    msg.style.color = '#f87171'; msg.textContent = motivo;
  };
  // clientes NÃO são gravados aqui (17/08): o vínculo cliente→tabela vive no
  // CADASTRO do cliente (Pessoas → 💲 Tabela de preço), modelo TecnoX.
  // grava vínculos de formas (substitui os existentes)
  const formaIds = [...document.querySelectorAll('.fpp-forma-vinc:checked')].map(c => c.value);
  await sb.from('oct_tabela_preco_formas').delete().eq('tabela_id', tabelaId);
  if (formaIds.length) {
    await sb.from('oct_tabela_preco_formas').insert(formaIds.map(fid => ({ empresa_id: eid, tabela_id: tabelaId, forma_id: fid })));
  }

  // grava o GRID DE NEGOCIAÇÃO (substitui os itens; inclui preco_fixo — a tela
  // antiga não lia esse campo e apagava as negociações importadas ao salvar)
  const itens = [];
  document.querySelectorAll('#fpp-neg-tbody tr').forEach(tr => {
    const pid = tr.querySelector('.neg-prod').value;
    const tipo = tr.querySelector('.neg-tipo').value;
    const v = parseFloat(tr.querySelector('.neg-valor').value);
    if (!pid || isNaN(v)) return;
    if (tipo === 'fixo_preco') {
      itens.push({ empresa_id: eid, tabela_id: tabelaId, produto_id: pid,
        tipo_ajuste: 'nenhum', modo_ajuste: 'percentual', valor_ajuste: 0, preco_fixo: v });
    } else {
      itens.push({ empresa_id: eid, tabela_id: tabelaId, produto_id: pid,
        tipo_ajuste: tipo.startsWith('acr') ? 'acrescimo' : 'desconto',
        modo_ajuste: tipo.endsWith('_pc') ? 'percentual' : 'fixo',
        valor_ajuste: v, preco_fixo: null });
    }
  });
  await sb.from('oct_tabela_preco_itens').delete().eq('tabela_id', tabelaId);
  if (itens.length) {
    const { error: e2 } = await sb.from('oct_tabela_preco_itens').insert(itens);
    if (e2) {
      const fk = /foreign key|produto_id_fkey/i.test(e2.message || '');
      await _desfazer(fk ? 'Um dos produtos não existe mais no cadastro. Recarregue a tela (F5) e escolha de novo.' : 'Negociações: ' + e2.message);
      return;
    }
  }

  document.getElementById('fp-preco-form').innerHTML = '';
  fpPrecoListar();
}

async function fpPrecoExcluir(id) {
  if (!podeOuAvisa('formas_pagamento.negociacao')) return;
  if (!confirm('Excluir esta condição? As exceções por produto também serão removidas.')) return;
  const { error } = await sb.from('oct_tabelas_preco').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fpPrecoListar();
}

// ---------- utils ----------
function fpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fpSefazNome(c) { const x = FP_SEFAZ.find(s => s.c === c); return x ? x.n : ''; }
function fpAjusteLabel(t) { return t === 'desconto' ? '<span style="color:#4ade80">Desconto</span>' : t === 'acrescimo' ? '<span style="color:#fbbf24">Acréscimo</span>' : '<span style="color:#888">Nenhum</span>'; }
function fpValorLabel(t) { if (t.tipo_ajuste === 'nenhum') return '—'; return t.modo_ajuste === 'percentual' ? Number(t.valor_ajuste) + '%' : 'R$ ' + Number(t.valor_ajuste).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
