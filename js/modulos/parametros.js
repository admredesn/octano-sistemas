// ============================================================
// octano-retaguarda  -  PARÂMETROS DO PDV
// ------------------------------------------------------------
// Liga/desliga por posto o que antes era fixo no código. Nasceu do Antônio
// Carlos não ter webcam: a captura obrigatória da foto do comprovante travava
// o caixa esperando um hardware que não existe ali (27/08/2026).
//
// O DEFAULT de cada parâmetro vive AQUI, não no banco. Chave ausente em
// oct_parametros = comportamento de sempre, então um posto que nunca foi
// configurado continua funcionando exatamente como antes.
//
// DEPENDÊNCIA: alguns parâmetros só fazem sentido com outro ligado (foto da
// nota a prazo precisa de webcam). Ao desligar o "pai", os filhos aparecem
// travados e desligados — evita a combinação impossível "sem webcam, mas
// exigindo foto", que é justamente o estado que travou o AC.
// ============================================================

const PARAM_DEFS = [
  {
    grupo: '📷 Câmera e imagens',
    itens: [
      { chave: 'webcam_disponivel', rot: 'Webcam instalada neste posto', pad: true,
        desc: 'Desligue quando o PC do PDV não tem câmera. Desliga junto tudo que depende dela.',
        pai: true },
      { chave: 'foto_nota_prazo', rot: 'Exigir foto do comprovante da nota a prazo', pad: true,
        desc: 'Após transmitir, o PDV trava até fotografar o comprovante assinado.',
        depende: 'webcam_disponivel' },
      { chave: 'foto_ponto', rot: 'Exigir foto ao bater o ponto', pad: true,
        desc: 'Registro de ponto sai com a foto do funcionário.',
        depende: 'webcam_disponivel' },
    ],
  },
  {
    grupo: '⏱ Ponto',
    itens: [
      { chave: 'ponto_obrigatorio', rot: 'Travar o caixa por ponto não registrado', pad: true,
        desc: 'Quem abasteceu hoje e não bateu o ponto trava o PDV até registrar. O gerente pode adiar 10 min (F8).' },
    ],
  },
  {
    grupo: '💳 Venda e recebimento',
    itens: [
      { chave: 'venda_prazo', rot: 'Permitir venda a prazo', pad: true,
        desc: 'Desligado, a forma "Nota a prazo" some do pagamento.' },
      { chave: 'prazo_exige_cliente', rot: 'Venda a prazo exige cliente identificado', pad: true,
        desc: 'Bloqueia fechar a prazo sem escolher o cliente (F3).' },
      { chave: 'checar_limite_prazo', rot: 'Checar limite de crédito do cliente', pad: true,
        desc: 'Consulta o limite antes de fechar. Sem internet, a venda passa e fica registrada.' },
      { chave: 'lista_negra_placa', rot: 'Bloquear placa em lista negra', pad: true,
        desc: 'Avisa e impede a venda a prazo para placas bloqueadas.' },
    ],
  },
  {
    grupo: '⛽ Pista e aferição',
    itens: [
      { chave: 'afericao_autorizacao', pendente: true, rot: 'Aferição precisa de autorização do retaguarda', pad: true,
        desc: 'A aferição fica retida até alguém aprovar. Desligado, sai direto do caixa.' },
      { chave: 'exigir_vendedor', pendente: true, rot: 'Exigir frentista identificado no abastecimento', pad: false,
        desc: 'Só ligue onde todos os frentistas têm cartão cadastrado.' },
    ],
  },
  {
    grupo: '🎁 Cashback',
    itens: [
      { chave: 'cashback', rot: 'Cashback ativo', pad: false,
        desc: 'Paga cashback por litro via Pix. Precisa do gateway configurado.' },
    ],
  },
];

let _parAtual = {};        // chave -> valor (do posto selecionado)
let _parEmpresa = null;

function _parDefault(ch) {
  for (const g of PARAM_DEFS) {
    for (const i of g.itens) if (i.chave === ch) return i.pad;
  }
  return false;
}

// valor efetivo: o que está no banco, ou o default do código
function parValor(ch) {
  return Object.prototype.hasOwnProperty.call(_parAtual, ch) ? !!_parAtual[ch] : _parDefault(ch);
}

// um filho só vale se o pai estiver ligado
function _parBloqueado(item) {
  return !!(item.depende && !parValor(item.depende));
}

async function parCarregar(empresaId) {
  _parEmpresa = empresaId;
  _parAtual = {};
  try {
    const { data } = await sb.from('oct_parametros')
      .select('chave,valor').eq('empresa_id', empresaId);
    (data || []).forEach(r => { _parAtual[r.chave] = (r.valor === true || r.valor === 'true'); });
  } catch (e) { /* tabela ainda não criada: tudo no default */ }
}

async function parGravar(ch, ligado) {
  if (!_parEmpresa) return;
  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  const { error } = await sb.from('oct_parametros').upsert({
    empresa_id: _parEmpresa, chave: ch, valor: ligado,
    atualizado_em: new Date().toISOString(), atualizado_por: quem,
  }, { onConflict: 'empresa_id,chave' });
  if (error) {
    alert('Não salvou: ' + error.message
      + '\n\n→ Rode antes o SQL-PARAMETROS-PDV.sql no Supabase.');
    return false;
  }
  _parAtual[ch] = !!ligado;
  return true;
}

async function parToggle(ch, el) {
  const ligado = !!el.checked;
  const ok = await parGravar(ch, ligado);
  if (!ok) { el.checked = !ligado; return; }
  parRender();   // redesenha: desligar um "pai" trava os filhos
}

function _parEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function parRender() {
  const el = document.getElementById('conteudo');
  if (!el) return;
  const grupos = PARAM_DEFS.map(g => {
    const linhas = g.itens.map(i => {
      // PENDENTE = a tela oferece, mas o PDV ainda nao consulta esta chave.
      // Deixar clicavel seria pior que nao ter: o operador desligaria achando
      // que surtiu efeito. Some quando o ponto de aplicacao existir.
      const bloq = _parBloqueado(i) || !!i.pendente;
      const on = !bloq && parValor(i.chave);
      const cor = bloq ? '#4a5060' : (on ? '#22c55e' : '#6b7688');
      return `<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #1a1d2e${bloq ? ';opacity:.5' : ''}">
        <label style="position:relative;display:inline-block;width:42px;height:22px;flex:none;margin-top:2px;cursor:${bloq ? 'not-allowed' : 'pointer'}">
          <input type="checkbox" ${on ? 'checked' : ''} ${bloq ? 'disabled' : ''}
            onchange="parToggle('${i.chave}', this)" style="opacity:0;width:0;height:0">
          <span style="position:absolute;inset:0;background:${cor};border-radius:22px;transition:.2s"></span>
          <span style="position:absolute;top:3px;left:${on ? '23px' : '3px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:.2s"></span>
        </label>
        <div style="flex:1">
          <div style="color:#e0e0e0;font-size:0.88rem;font-weight:600">${_parEsc(i.rot)}</div>
          <div style="color:#8892a0;font-size:0.76rem;margin-top:2px">${_parEsc(i.desc)}</div>
          ${i.pendente ? `<div style="color:#a63;font-size:0.72rem;margin-top:3px">⚠ ainda nao aplicado no PDV — a trava vive no nucleo, nao na tela</div>` : ''}
          ${(bloq && !i.pendente) ? `<div style="color:#a63;font-size:0.72rem;margin-top:3px">⤷ depende de "${_parEsc((PARAM_DEFS.flatMap(x => x.itens).find(x => x.chave === i.depende) || {}).rot || i.depende)}"</div>` : ''}
        </div>
        <div style="color:${bloq ? '#4a5060' : (on ? '#22c55e' : '#6b7688')};font-size:0.74rem;font-weight:700;min-width:64px;text-align:right;margin-top:4px">
          ${i.pendente ? 'em obra' : (bloq ? 'indisponível' : (on ? 'LIGADO' : 'desligado'))}
        </div></div>`;
    }).join('');
    return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-weight:700;color:#f97316;margin-bottom:6px">${_parEsc(g.grupo)}</div>${linhas}</div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:860px">
      <h2 style="color:#f97316;margin-bottom:4px">⚙️ Parâmetros do PDV</h2>
      <p style="color:#8892a0;font-size:0.82rem;margin-bottom:14px">
        Vale para <b style="color:#e0e0e0">${_parEsc(window._parNomePosto || 'o posto selecionado')}</b>.
        A mudança chega ao PDV no próximo carregamento da tela — não precisa reiniciar o núcleo.
      </p>
      ${grupos}
      <p style="color:#667;font-size:0.72rem;margin-top:10px">
        Parâmetro nunca configurado usa o padrão do sistema — um posto sem ajuste nenhum
        funciona como sempre funcionou.
      </p>
    </div>`;
}

async function moduloParametros() {
  const el = document.getElementById('conteudo');
  if (el) el.innerHTML = '<p style="padding:20px;color:#888">Carregando parâmetros...</p>';
  // empresaAtiva() = o seletor de posto do topo (mesmo padrão dos outros módulos)
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { if (el) el.innerHTML = '<p style="padding:20px;color:#f87171">Selecione um posto no topo.</p>'; return; }
  try {
    const { data } = await sb.from('oct_empresas').select('nome').eq('id', eid).single();
    window._parNomePosto = (data && data.nome) || '';
  } catch (e) { window._parNomePosto = ''; }
  await parCarregar(eid);
  parRender();
}
