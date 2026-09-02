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
    grupo: '📧 Cobrança — envio de fatura',
    acoes: [{ rot: '✍ Textos das mensagens', fn: 'msgAbrirEditor()' },
            { rot: '✉ Testar envio', fn: 'parTestarEmail()' }],
    itens: [
      { chave: 'cobranca_envio_ativo', rot: 'Enviar fatura ao cliente automaticamente', pad: false,
        desc: 'Libera o botão "Enviar fatura" (NF-e + boleto + fatura) por WhatsApp e e-mail.',
        pai: true },
      { chave: 'cobranca_email_remetente', tipo: 'texto', rot: 'E-mail que envia a cobrança',
        pad: '', dica: 'cobranca@seudominio.com.br',
        desc: 'Conta própria de cobrança do posto. É o remetente que o cliente vê e também o usuário do SMTP.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_email_nome', tipo: 'texto', rot: 'Nome que aparece no e-mail',
        pad: '', dica: 'Posto Florestal — Cobrança',
        desc: 'O que o cliente vê como remetente.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_email_copia', tipo: 'texto', rot: 'Enviar cópia para',
        pad: '', dica: 'financeiro@seudominio.com.br (opcional)',
        desc: 'Cópia oculta de cada cobrança enviada. Deixe vazio para não copiar.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_smtp_host', tipo: 'texto', rot: 'Servidor de saída (SMTP)',
        pad: '', dica: 'smtp.gmail.com',
        desc: 'Gmail: smtp.gmail.com · Outlook/365: smtp.office365.com · Locaweb: email-ssl.com.br',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_smtp_usuario', tipo: 'texto', rot: 'Usuário do SMTP (só se for diferente)',
        pad: '', dica: 'deixe vazio para usar o próprio e-mail',
        desc: 'No Gmail/Terra/Locaweb o login é o próprio e-mail — deixe vazio. Em serviço de relay (Brevo, SendGrid) o login é outro; ponha aqui.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_smtp_porta', tipo: 'texto', rot: 'Porta', pad: '', dica: '587',
        desc: '587 com STARTTLS (o mais comum) ou 465 com SSL.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_smtp_senha', tipo: 'senha', rot: 'Senha do e-mail', pad: '',
        dica: 'digite para trocar',
        desc: 'No Gmail use SENHA DE APP (a senha normal não funciona com 2FA). '
            + 'Guardada no banco — restrinja o acesso a esta aba.',
        depende: 'cobranca_envio_ativo' },
      { chave: 'cobranca_whatsapp', rot: 'Enviar também por WhatsApp', pad: true,
        desc: 'Usa o gateway do WhatsApp. No Florestal, 85 dos 91 clientes têm número e só 13 têm e-mail.',
        depende: 'cobranca_envio_ativo' },
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
function _parEhTexto(ch) {
  for (const g of PARAM_DEFS) {
    for (const i of g.itens) if (i.chave === ch) return i.tipo === 'texto' || i.tipo === 'senha';
  }
  return false;
}

function _parBloqueado(item) {
  return !!(item.depende && !parValor(item.depende));
}

async function parCarregar(empresaId) {
  _parEmpresa = empresaId;
  _parAtual = {};
  try {
    const { data } = await sb.from('oct_parametros')
      .select('chave,valor').eq('empresa_id', empresaId);
    (data || []).forEach(r => {
      // parametro de TEXTO guarda a string; o de liga/desliga vira booleano
      _parAtual[r.chave] = _parEhTexto(r.chave)
        ? (r.valor == null ? '' : String(r.valor).replace(/^"|"$/g, ''))
        : (r.valor === true || r.valor === 'true');
    });
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

// grava campo de texto ao sair do campo (nao a cada tecla)
async function parTexto(ch, el) {
  const v = String(el.value || '').trim();
  // campo de senha em branco = "nao mexi", nao "apague". Sem isso, abrir a tela
  // e salvar outro campo zeraria a senha sem ninguem perceber.
  const ehSenha = (PARAM_DEFS.flatMap(g => g.itens).find(i => i.chave === ch) || {}).tipo === 'senha';
  if (ehSenha && !v) return;
  if (v === (_parAtual[ch] || '')) return;          // nada mudou
  const ok = await parGravar(ch, v);
  if (!ok) { el.value = _parAtual[ch] || ''; return; }
  el.style.borderColor = '#22c55e';
  setTimeout(() => { el.style.borderColor = '#2a2d3e'; }, 1200);
}

async function parToggle(ch, el) {
  const ligado = !!el.checked;
  const ok = await parGravar(ch, ligado);
  if (!ok) { el.checked = !ligado; return; }
  parRender();   // redesenha: desligar um "pai" trava os filhos
}

// ---------- TESTE DE E-MAIL ----------
// A tela nao fala SMTP (nem poderia: a senha vive no gateway). Enfileira o
// teste e espera a resposta -- que traz o erro do servidor sem traducao, porque
// e' o texto do servidor que resolve o problema.
async function parTestarEmail() {
  const de = String(_parAtual['cobranca_email_remetente'] || '').trim();
  if (!de) { _parToast('Preencha e salve o e-mail que envia a cobrança antes de testar.', 'erro'); return; }
  const destino = prompt('Enviar o teste para qual endereço?', de);
  if (destino === null) return;

  const cx = document.createElement('div');
  cx.id = 'par-teste';
  cx.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center';
  cx.innerHTML = `<div style="background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;padding:22px;width:min(520px,92vw);color:#dbe2ea">
      <h3 style="color:#f97316;margin:0 0 12px">✉ Teste de envio</h3>
      <div id="par-teste-corpo"><p style="color:#9aa">Conectando ao servidor e enviando...</p></div>
      <div style="text-align:right;margin-top:14px">
        <button onclick="document.getElementById('par-teste').remove()"
          style="background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:8px 16px;color:#c7d0dc;cursor:pointer">Fechar</button>
      </div></div>`;
  document.body.appendChild(cx);
  const corpo = () => document.getElementById('par-teste-corpo');

  const { data: s } = await sb.auth.getSession();
  const quem = (s && s.session && s.session.user && s.session.user.email) || 'retaguarda';
  const { data: novo, error } = await sb.from('oct_email_testes')
    .insert({ empresa_id: _parEmpresa, destino: String(destino).trim() || de, pedido_por: quem })
    .select('id').single();
  if (error) {
    if (corpo()) corpo().innerHTML = /oct_email_testes|does not exist|relation|PGRST/i.test(error.message || '')
      ? '<p style="color:#f87171">Falta rodar <code>repo/sql/SQL-TESTE-EMAIL.sql</code> no Supabase.</p>'
      : '<p style="color:#f87171">Erro: ' + _parEsc(error.message) + '</p>';
    return;
  }

  // o SMTP pode demorar; esperar pouco fazia a tela culpar o worker por um
  // problema de rede que ainda estava sendo diagnosticado
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const { data: t } = await sb.from('oct_email_testes')
      .select('status,erro,detalhe,destino').eq('id', novo.id).maybeSingle();
    if (!t || t.status === 'pendente') continue;
    if (!corpo()) return;
    if (t.status === 'ok') {
      corpo().innerHTML = `<p style="color:#7ee2a0;font-weight:600">✔ Funcionou</p>
        <p style="margin-top:8px">Enviado para <b>${_parEsc(t.destino || '')}</b>. Confira a caixa de entrada
        (e o spam, na primeira vez).</p>
        <p style="color:#6b7688;font-size:0.76rem;margin-top:8px">Resposta do servidor: ${_parEsc(t.detalhe || '')}</p>`;
    } else {
      corpo().innerHTML = `<p style="color:#f87171;font-weight:600">Não enviou</p>
        <pre style="background:#0f1520;padding:10px;border-radius:6px;font-size:0.74rem;white-space:pre-wrap;
          color:#c8d0da;margin-top:8px;max-height:220px;overflow:auto">${_parEsc(t.erro || '')}</pre>
        ${_parDicaSmtp(t.erro || '')}`;
    }
    return;
  }
  if (corpo()) corpo().innerHTML = `<p style="color:#f59e0b">O teste não voltou.</p>
    <p style="color:#889;font-size:0.8rem;margin-top:8px">O pedido ficou na fila. Se o worker do gateway
    (<code>BOLETO_WORKER=1</code> no Railway) não estiver ligado, ele não é executado.</p>`;
}

// traduz os erros de SMTP que aparecem de verdade
function _parDicaSmtp(erro) {
  const e = String(erro || '').toLowerCase();
  let d = '';
  if (/inválido|sem @/.test(e)) d = 'Corrija o campo <b>Servidor de saída</b>: é o endereço do servidor (ex.: smtp.terra.com.br), não um e-mail.';
  else if (/enotfound|getaddrinfo|dns/.test(e)) d = 'O servidor não existe ou está escrito errado. Confira o <b>Servidor de saída</b>.';
  else if (/535|auth|credential|senha|password|login/.test(e)) d = 'Usuário ou senha recusados. No Gmail/Outlook use <b>senha de app</b>, não a senha da conta.';
  else if (/etimedout|timeout|econnrefused/.test(e)) d = 'Conectou não. Costuma ser <b>porta errada</b>: 587 com STARTTLS ou 465 com SSL.';
  else if (/self.signed|certificate|tls|ssl/.test(e)) d = 'Problema de TLS — normalmente porta 465 marcada como 587, ou o contrário.';
  else if (/relay|not permitted|sender/.test(e)) d = 'O servidor não aceita enviar como esse remetente. O e-mail tem de ser o da própria conta autenticada.';
  return d ? `<p style="color:#f0b45c;font-size:0.82rem;margin-top:10px">💡 ${d}</p>` : '';
}

// Enter no campo = sair do campo = grava (o onchange faz o resto)
function _parEnter(ev, el) {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  el.blur();
}

// aviso que sobrevive ao redesenho da tela (o parRender apaga tudo que e' filho
// do #conteudo; este fica no body)
function _parToast(msg, cor) {
  let t = document.getElementById('par-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'par-toast';
    t.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;padding:11px 16px;' +
      'border-radius:8px;font-size:0.86rem;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.5)';
    document.body.appendChild(t);
  }
  t.style.background = cor === 'erro' ? '#7f1d1d' : '#14532d';
  t.style.color = cor === 'erro' ? '#fecaca' : '#bbf7d0';
  t.textContent = msg;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => { if (t) t.remove(); }, 4000);
}

// salva de uma vez os campos de texto/senha do grupo
async function parSalvarGrupo(gi) {
  const g = PARAM_DEFS[gi];
  if (!g) return;
  const campos = g.itens.filter(i => i.tipo === 'texto' || i.tipo === 'senha');
  let n = 0, erro = null;
  for (const i of campos) {
    const el = document.getElementById('par-in-' + i.chave);
    if (!el || el.disabled) continue;
    const v = String(el.value || '').trim();
    // senha em branco = "nao mexi", nao "apague"
    if (i.tipo === 'senha' && !v) continue;
    if (v === (_parAtual[i.chave] || '')) continue;
    const ok = await parGravar(i.chave, v);
    if (!ok) { erro = i.rot; break; }
    n++;
  }
  if (erro) { _parToast('Não salvou: ' + erro, 'erro'); return; }
  _parToast(n ? `✔ ${n} campo(s) salvo(s)` : '✔ nada mudou — já estava salvo');
  if (n) parRender();
}

function _parEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function parRender() {
  const el = document.getElementById('conteudo');
  if (!el) return;
  const grupos = PARAM_DEFS.map((g, gi) => {
    const linhas = g.itens.map(i => {
      if (i.tipo === 'texto' || i.tipo === 'senha') {
        const bloq = _parBloqueado(i);
        const ehSenha = i.tipo === 'senha';
        // a senha NAO volta para a tela: so' se diz que existe. Evita que ela
        // fique no HTML da pagina, ao alcance de qualquer F12.
        const v = ehSenha ? '' : (_parAtual[i.chave] || '');
        const salva = ehSenha && !!(_parAtual[i.chave] || '').length;
        return `<div style="padding:10px 0;border-bottom:1px solid #1a1d2e${bloq ? ';opacity:.5' : ''}">
          <div style="color:#e0e0e0;font-size:0.88rem;font-weight:600">${_parEsc(i.rot)}</div>
          <div style="color:#8892a0;font-size:0.76rem;margin:2px 0 6px">${_parEsc(i.desc)}</div>
          <input type="${ehSenha ? 'password' : 'text'}" value="${_parEsc(v)}"
            placeholder="${_parEsc(salva ? '•••••••• (senha salva — digite para trocar)' : (i.dica || ''))}"
            ${bloq ? 'disabled' : ''} autocomplete="new-password" id="par-in-${i.chave}"
            onchange="parTexto('${i.chave}', this)"
            onkeydown="_parEnter(event, this)"
            style="width:100%;max-width:420px;background:#0f1520;border:1px solid #2a2d3e;
                   border-radius:6px;padding:7px 9px;color:#e8eef5;font-size:0.85rem">
          ${salva ? '<div style="color:#7ee2a0;font-size:0.72rem;margin-top:3px">✔ senha gravada</div>' : ''}
          ${bloq ? `<div style="color:#a63;font-size:0.72rem;margin-top:3px">⤷ depende de "${
            _parEsc((PARAM_DEFS.flatMap(x => x.itens).find(x => x.chave === i.depende) || {}).rot || i.depende)}"</div>` : ''}
        </div>`;
      }
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
    // botao so' onde ha' campo digitado: chave liga/desliga grava no clique e
    // um "Salvar" ali daria a entender que o clique nao valeu
    const temTexto = g.itens.some(i => i.tipo === 'texto' || i.tipo === 'senha');
    const extra = (g.acoes || []).map(a => `<button onclick="${a.fn}"
          style="background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:8px 14px;
                 color:#c7d0dc;font-size:0.84rem;cursor:pointer">${_parEsc(a.rot)}</button>`).join('');
    const rodape = temTexto ? `<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding-top:12px">
        <span style="color:#6b7688;font-size:0.72rem">salva sozinho ao sair do campo — o botão é para garantir</span>
        ${extra}
        <button onclick="parSalvarGrupo(${gi})"
          style="background:#f97316;border:none;border-radius:6px;padding:8px 16px;color:#fff;
                 font-weight:700;font-size:0.84rem;cursor:pointer">💾 Salvar alterações</button>
      </div>` : '';
    return `<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-weight:700;color:#f97316;margin-bottom:6px">${_parEsc(g.grupo)}</div>${linhas}${rodape}</div>`;
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
