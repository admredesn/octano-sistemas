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
    // 16/09/2026: antes isso só existia no config_local.json do PC do posto —
    // para ligar o e-mail do PagBank na AC era preciso ir até lá. O núcleo passa
    // a ler estas chaves da nuvem quando não acha a seção no arquivo local.
    aba: 'receb',
    grupo: '💳 PagBank — e-mail de venda aprovada',
    itens: [
      { chave: 'pagbank_email_usuario', tipo: 'texto', rot: 'E-mail que recebe o aviso de venda', pad: '',
        dica: 'postoxxxx@gmail.com',
        desc: 'Caixa onde chega o "Venda aprovada" do PagBank. Ative o aviso no painel do PagBank: Configurações › Notificações › Seu negócio.' },
      { chave: 'pagbank_email_senha', tipo: 'senha', rot: 'Senha de app do e-mail', pad: '',
        desc: 'NÃO é a senha normal. No Gmail: Conta Google › Segurança › Verificação em duas etapas › Senhas de app. Dá só leitura e pode ser revogada.' },
      { chave: 'pagbank_email_host', tipo: 'texto', rot: 'Servidor IMAP', pad: '', dica: 'imap.gmail.com',
        desc: 'Em branco usa imap.gmail.com.' },
      { chave: 'pagbank_email_porta', tipo: 'texto', rot: 'Porta do IMAP', pad: '', dica: '993',
        desc: 'Em branco usa 993.' },
      { chave: 'pagbank_email_remetente', tipo: 'texto', rot: 'Remetente do aviso', pad: '', dica: 'pagbank.com.br',
        desc: 'Filtro de quem envia. Em branco usa pagbank.com.br.' },
      { chave: 'pagbank_email_dias', tipo: 'texto', rot: 'Dias para trás na leitura', pad: '', dica: '2',
        desc: 'Quantos dias de e-mail o núcleo relê a cada consulta. Em branco usa 1.' },
    ],
  },
  {
    aba: 'pdv',
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
    aba: 'pdv',
    grupo: '⏱ Ponto',
    itens: [
      { chave: 'ponto_obrigatorio', rot: 'Travar o caixa por ponto não registrado', pad: true,
        desc: 'Quem abasteceu hoje e não bateu o ponto trava o PDV até registrar. O gerente pode adiar 10 min (F8).' },
    ],
  },
  {
    aba: 'pdv',
    grupo: '💳 Venda e recebimento',
    itens: [
      { chave: 'venda_prazo', rot: 'Permitir venda a prazo', pad: true,
        desc: 'Desligado, a forma "Nota a prazo" some do pagamento.' },
      { chave: 'prazo_exige_cliente', rot: 'Venda a prazo exige cliente identificado', pad: true,
        desc: 'Bloqueia fechar a prazo sem escolher o cliente (F3).' },
      { chave: 'checar_limite_prazo', rot: 'Checar limite de crédito do cliente', pad: true,
        desc: 'Consulta o limite antes de fechar. Sem internet, a venda passa e fica registrada.' },
      { chave: 'frota_exige_autorizacao', rot: 'Cartão frota exige nº de autorização', pad: true,
        desc: 'Ligado: o PDV só fecha a venda no cartão frota com o nº de autorização do comprovante (é ele que casa com a operadora e permite a nota de frota). Desligado: o campo fica opcional.' },
      { chave: 'lista_negra_placa', rot: 'Bloquear placa em lista negra', pad: true,
        desc: 'Avisa e impede a venda a prazo para placas bloqueadas.' },
    ],
  },
  {
    aba: 'pdv',
    grupo: '⛽ Pista e aferição',
    itens: [
      { chave: 'afericao_autorizacao', pendente: true, rot: 'Aferição precisa de autorização do retaguarda', pad: true,
        desc: 'A aferição fica retida até alguém aprovar. Desligado, sai direto do caixa.' },
      { chave: 'exigir_vendedor', pendente: true, rot: 'Exigir frentista identificado no abastecimento', pad: false,
        desc: 'Só ligue onde todos os frentistas têm cartão cadastrado.' },
    ],
  },
  {
    aba: 'cobranca',
    grupo: '📧 Cobrança — envio de fatura',
    acoes: [{ rot: '✍ Textos das mensagens', fn: 'msgAbrirEditor()' },
            { rot: '✉ Conferir envio', fn: 'parTestarEmail()' }],
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
  // (29/09/2026) o grupo '🎁 Cashback' saiu daqui, mas a chave 'cashback' de
  // oct_parametros CONTINUA sendo gravada: e' o gate do PDV (cashback.js:36,
  // decide se nasce o pendente), enquanto oct_empresas.cashback_ativo e' o gate
  // do gateway (decide se paga). A sub-aba Cashback grava as DUAS de uma vez.
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
  if (!podeOuAvisa('parametros.alterar')) return;
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
// CONFERIR ENVIO (03/10/2026). O "Testar envio" pedia ao gateway da NUVEM (Railway)
// para mandar um e-mail -- e o Railway bloqueia SMTP de saida: dava "Connection
// timeout" SEMPRE, com qualquer porta, e a tela ainda culpava a porta. Nunca
// funcionou (testes de 02/09 e 03/10, todos timeout), enquanto a fatura 16 do
// Florestal saia normal por e-mail no mesmo dia. Quem envia de verdade e' o NUCLEO
// do posto. Ate' o teste ir para o nucleo, a prova que vale e' a ultima fatura que
// saiu por e-mail -- e a ultima falha, se houver.
async function parTestarEmail() {
  if (!podeOuAvisa('parametros.testar_email')) return;
  const cx = document.createElement('div');
  cx.id = 'par-teste';
  cx.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center';
  cx.innerHTML = `<div style="background:#0f1119;border:1px solid #2a2d3e;border-radius:12px;padding:22px;width:min(560px,92vw);color:#dbe2ea">
      <h3 style="color:#f97316;margin:0 0 12px">✉ Envio de e-mail deste posto</h3>
      <div id="par-teste-corpo"><p style="color:#9aa">Conferindo os últimos envios...</p></div>
      <div style="text-align:right;margin-top:14px">
        <button onclick="document.getElementById('par-teste').remove()"
          style="background:#1b2130;border:1px solid #2f3446;border-radius:6px;padding:8px 16px;color:#c7d0dc;cursor:pointer">Fechar</button>
      </div></div>`;
  document.body.appendChild(cx);
  const corpo = document.getElementById('par-teste-corpo');
  corpo.innerHTML = await _parUltimoEnvio(_parEmpresa);
}

function _parQuando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function _parUltimoEnvio(empresaId) {
  const sel = 'numero,cliente_nome,enviada_em,enviada_por,envio_destino,envio_erro';
  const [ok, ult, falha] = await Promise.all([
    sb.from('oct_faturas').select(sel).eq('empresa_id', empresaId).ilike('enviada_por', '%email%')
      .order('enviada_em', { ascending: false }).limit(1),
    sb.from('oct_faturas').select(sel).eq('empresa_id', empresaId).not('enviada_em', 'is', null)
      .order('enviada_em', { ascending: false }).limit(1),
    // falha total: o nucleo limpa o pedido e grava o erro, sem data de envio
    sb.from('oct_faturas').select(sel).eq('empresa_id', empresaId).is('enviada_em', null)
      .not('envio_erro', 'is', null).order('numero', { ascending: false }).limit(1),
  ]);
  if (ok.error) return `<p style="color:#f87171">Não consegui ler as faturas: ${_parEsc(ok.error.message)}</p>`;
  const f = (ok.data || [])[0], u = (ult.data || [])[0], x = (falha.data || [])[0];
  const emailDe = d => String(d || '').split(',').map(t => t.trim()).filter(t => t.includes('@')).join(', ');
  // o envio mais recente teve problema no e-mail (o WhatsApp pode ter ido)?
  const erroUlt = u && u.envio_erro && /e-?mail|smtp/i.test(u.envio_erro) && (!f || u.enviada_em > f.enviada_em || u.numero === f.numero);
  const erro = erroUlt ? u : (x && (!f || Number(x.numero) > Number(f.numero)) ? x : null);
  let h = '';
  if (f) {
    h += (erro
      ? `<p style="color:#f59e0b;font-weight:600">⚠ O envio mais recente por e-mail deu erro — o anterior tinha funcionado</p>`
      : `<p style="color:#7ee2a0;font-weight:600">✔ O e-mail de cobrança deste posto está funcionando</p>`) + `
      <p style="margin-top:8px">Última fatura que saiu por e-mail: <b>nº ${_parEsc(f.numero)}</b>
      (${_parEsc(f.cliente_nome || '')}) em <b>${_parQuando(f.enviada_em)}</b>
      ${emailDe(f.envio_destino) ? 'para <b>' + _parEsc(emailDe(f.envio_destino)) + '</b>' : ''}.</p>`;
  } else {
    h += `<p style="color:#f59e0b;font-weight:600">Nenhuma fatura deste posto saiu por e-mail ainda.</p>
      <p style="margin-top:8px;color:#9aa">Gere uma fatura e use <b>Enviar fatura</b> no Faturar — o resultado
      (enviado ou o erro do servidor) aparece na própria fatura.</p>`;
  }
  if (erro) {
    h += `<p style="color:#f87171;font-weight:600;margin-top:12px">Último problema: fatura nº ${_parEsc(erro.numero)}</p>
      <pre style="background:#0f1520;padding:10px;border-radius:6px;font-size:0.74rem;white-space:pre-wrap;
        color:#c8d0da;margin-top:6px;max-height:160px;overflow:auto">${_parEsc(erro.envio_erro || '')}</pre>
      ${_parDicaSmtp(erro.envio_erro || '')}`;
  }
  h += `<p style="color:#6b7688;font-size:0.76rem;margin-top:12px;line-height:1.45">Por que não manda um e-mail de
    teste daqui? O teste sairia da nuvem, que bloqueia e-mail (dava "Connection timeout" com qualquer porta).
    A fatura sai do computador do posto, onde a porta abre normalmente. O teste pelo posto entra na próxima
    atualização do núcleo.</p>`;
  return h;
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

// ============================================================
// SUB-ABAS (29/09/2026, pedido do Ronan): as integrações do posto saíram do
// Cadastro da Empresa (EDI, cofre, sangria obrigatória, Sicoob, cashback) e
// vieram para cá, organizadas por assunto. Cada grupo de PARAM_DEFS diz em
// que aba mora (`aba`); o que grava em oct_empresas / oct_sicoob_contas é
// desenhado por seção própria (_parSecao*), com botão de salvar próprio.
// ============================================================
const PAR_ABAS = [
  { id: 'pdv',      rot: '🖥 PDV',          desc: 'Câmera, ponto, venda e pista — o comportamento do caixa.' },
  { id: 'receb',    rot: '💳 Recebimentos', desc: 'Como o dinheiro entra: EDI do cartão, cofre, sangria obrigatória e o e-mail de venda do PagBank.' },
  { id: 'banco',    rot: '🏦 Banco',        desc: 'Sicoob: leitura do extrato e baixa automática das contas a pagar.' },
  { id: 'cobranca', rot: '📧 Cobrança',     desc: 'Envio da fatura (NF-e + boleto) por e-mail e WhatsApp.' },
  { id: 'cashback', rot: '🎁 Cashback',     desc: 'Chave geral do cashback neste posto.' },
];
let _parAba = 'pdv';
try { _parAba = sessionStorage.getItem('octano_par_aba') || 'pdv'; } catch (e) { /* sem storage: começa no PDV */ }
let _parEmp = null;      // linha de oct_empresas do posto (usa_edi, usa_cofre, sangria_limite, cashback_ativo, nome); null = nao carregou
let _parEmpErro = null;  // por que nao carregou (mostrado no lugar dos cards)

function _parEmpOk() {
  return !!(_parEmp && _parEmp.id);
}

// card no lugar da secao quando a linha do posto nao veio: desenhar EDI/cofre
// "desligados" e deixar o Salvar ali gravaria false/null por cima do que esta'
// no banco (revisao 29/09)
function _parCardSemEmpresa(titulo) {
  return `<div class="par-card">
    <div class="par-card-titulo">${_parEsc(titulo)}</div>
    <div style="color:#f87171;font-size:0.84rem">⚠ O cadastro do posto não carregou${_parEmpErro ? ': ' + _parEsc(_parEmpErro) : ''}.</div>
    <div class="par-nota" style="margin-top:6px">Nada foi alterado. Recarregue a tela (F5) ou escolha o posto de novo no topo. Se o erro citar
      <code>cashback_ativo</code>, rode no SQL editor: <code>alter table oct_empresas add column if not exists cashback_ativo boolean default false;</code></div>
  </div>`;
}

// (2/6) edicao AINDA NAO SALVA dos campos de oct_empresas sobrevive ao redesenho
// (parSalvarGrupo/parToggle chamam parRender, que refaz o HTML a partir de _parEmp)
function _parSnapshotEmp() {
  const g = id => document.getElementById(id);
  const snap = {};
  if (g('par-usa-edi')) snap.usa_edi = !!g('par-usa-edi').checked;
  if (g('par-usa-cofre')) snap.usa_cofre = !!g('par-usa-cofre').checked;
  if (g('par-sangria-limite')) snap.sangria_limite = String(g('par-sangria-limite').value == null ? '' : g('par-sangria-limite').value);
  if (g('cb-ativo')) snap.cb_ativo = String(g('cb-ativo').value);
  return Object.keys(snap).length ? snap : null;
}

function _parReaplicarEmp(snap) {
  if (!snap) return;
  const g = id => document.getElementById(id);
  if ('usa_edi' in snap && g('par-usa-edi')) g('par-usa-edi').checked = snap.usa_edi;
  if ('usa_cofre' in snap && g('par-usa-cofre')) g('par-usa-cofre').checked = snap.usa_cofre;
  if ('sangria_limite' in snap && g('par-sangria-limite')) g('par-sangria-limite').value = snap.sangria_limite;
  if ('cb_ativo' in snap && g('cb-ativo')) g('cb-ativo').value = snap.cb_ativo;
}

function parTrocarAba(id) {
  if (!PAR_ABAS.some(a => a.id === id)) return;
  _parAba = id;
  try { sessionStorage.setItem('octano_par_aba', id); } catch (e) { /* ok */ }
  parRender();
}

const _PAR_CSS = `<style id="par-css">
  .par-subabas{display:flex;gap:4px;border-bottom:1px solid #2a2d3e;margin:12px 0 14px;flex-wrap:wrap}
  .par-subaba{display:flex;align-items:center;gap:6px;padding:9px 16px;cursor:pointer;color:#aaa;font-size:0.84rem;
              border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none;white-space:nowrap}
  .par-subaba:hover{color:#e0e0e0}
  .par-subaba.ativo{color:#f97316;border-bottom-color:#f97316;font-weight:600}
  .par-card{background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;margin-bottom:12px}
  .par-card-titulo{font-weight:700;color:#f97316;margin-bottom:6px}
  .par-card-desc{color:#8892a0;font-size:0.76rem;margin-bottom:10px;line-height:1.5}
  .par-check{display:flex;align-items:flex-start;gap:10px;color:#ddd;font-size:0.88rem;background:#0f1520;
             border:1px solid #2a2d3e;border-radius:8px;padding:10px 14px;cursor:pointer;margin-bottom:8px}
  .par-check input{margin-top:3px}
  .par-bloco{background:#0f1520;border:1px solid #2a2d3e;border-radius:8px;padding:12px 14px;margin-bottom:8px}
  .par-bloco .rot{color:#e0e0e0;font-size:0.88rem;font-weight:600}
  .par-bloco .desc{color:#8892a0;font-size:0.76rem;margin:2px 0 8px;line-height:1.5}
  .par-bloco input,.par-bloco select{background:#0d1017;border:1px solid #2a2d3e;border-radius:6px;padding:8px 10px;color:#e8eef5;font-size:0.86rem}
  .par-rodape{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding-top:10px;flex-wrap:wrap}
  .par-nota{color:#6b7688;font-size:0.72rem}
  .par-btn{background:#f97316;border:none;border-radius:6px;padding:8px 16px;color:#fff;font-weight:700;font-size:0.84rem;cursor:pointer}
  .par-btn.verde{background:#0a6e4f}
  .par-btn.marrom{background:#7a4a0a}
  .par-msg{font-size:0.82rem;min-height:18px}
</style>`;

// um grupo de PARAM_DEFS (liga/desliga e campos de texto) — como sempre foi
function _parGrupoHtml(g, gi) {
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
  const rodape = temTexto ? `<div class="par-rodape">
      <span class="par-nota">salva sozinho ao sair do campo — o botão é para garantir</span>
      ${extra}
      <button class="par-btn" onclick="parSalvarGrupo(${gi})">💾 Salvar alterações</button>
    </div>` : '';
  return `<div class="par-card"><div class="par-card-titulo">${_parEsc(g.grupo)}</div>${linhas}${rodape}</div>`;
}

// ---------- seção RECEBIMENTOS: EDI, cofre e sangria (oct_empresas) ----------
function _parSecaoRecebimentos() {
  if (!_parEmpOk()) return _parCardSemEmpresa('🔌 Como o dinheiro entra neste posto');
  const e = _parEmp;
  return `<div class="par-card">
    <div class="par-card-titulo">🔌 Como o dinheiro entra neste posto</div>
    <div class="par-card-desc">Ligue conforme o que o posto usa. O PDV oculta as formas de pagamento
      correspondentes (com EDI ligado o cartão entra automático e some do PDV; com cofre, o dinheiro some).</div>
    <label class="par-check"><input type="checkbox" id="par-usa-edi" ${e.usa_edi ? 'checked' : ''}>
      <span><strong>EDI (PagBank)</strong> — recebimentos de cartão automáticos.
        <span style="color:#888">O PDV oculta as formas classificadas como <em>Cartão</em>.</span></span></label>
    <label class="par-check"><input type="checkbox" id="par-usa-cofre" ${e.usa_cofre ? 'checked' : ''}>
      <span><strong>Cofre inteligente</strong> — o dinheiro vai pro cofre.
        <span style="color:#888">O PDV oculta as formas classificadas como <em>Dinheiro</em>.</span></span></label>
    <div class="par-bloco">
      <div class="rot">💰 Sangria obrigatória a partir de (R$)</div>
      <div class="desc">O PDV soma o dinheiro recebido pela <b>tecla R</b> no turno e desconta as sangrias
        já lançadas. Quando o que sobra na gaveta chega a este valor, o recebimento em dinheiro trava e
        exige a sangria (a sangria é só o registro da retirada, com comprovante — não baixa abastecimento).
        <span style="color:#666"><b>Vazio ou 0 = trava DESLIGADA</b> (a sangria manual continua no PDV).</span>
        <br><b>Posto com cofre:</b> preenchido, o frentista recebe o dinheiro pela tecla R e, ao chegar a este
        valor, o PDV trava e manda <b>depositar no cofre</b>; a mensagem fecha sozinha quando o cofre informa o
        depósito. Nesse modo o depósito é a retirada da gaveta e <b>deixa de dar baixa em abastecimento</b>.
        <span style="color:#666">Vazio = como sempre: sem trava, o depósito baixa sozinho as vendas em dinheiro.</span></div>
      <input id="par-sangria-limite" type="number" step="10" min="0" style="width:180px"
        value="${e.sangria_limite != null ? _parEsc(e.sangria_limite) : ''}" placeholder="500">
    </div>
    <div class="par-rodape">
      <span class="par-nota">o PDV lê estas chaves no login — depois de salvar, dê F5 no PDV do posto</span>
      <span id="par-receb-msg" class="par-msg"></span>
      <button class="par-btn" onclick="parSalvarRecebimentos()">💾 Salvar</button>
    </div>
  </div>`;
}

async function parSalvarRecebimentos() {
  if (!podeOuAvisa('empresa.integracoes')) return;
  const msg = document.getElementById('par-receb-msg');
  const set = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
  if (!_parEmpresa) { set('Selecione o posto no topo.', '#f44'); return; }
  if (!_parEmpOk()) { set('O cadastro do posto não carregou — nada foi gravado. Recarregue a tela.', '#f44'); return; }
  const g = id => document.getElementById(id);
  const dados = {
    usa_edi: !!(g('par-usa-edi') && g('par-usa-edi').checked),
    usa_cofre: !!(g('par-usa-cofre') && g('par-usa-cofre').checked),
    // limite da sangria obrigatória: vazio/0 => null (trava desligada)
    sangria_limite: (parseFloat(g('par-sangria-limite') && g('par-sangria-limite').value) || 0) || null,
  };
  set('Salvando…', '#aaa');
  const { error } = await sb.from('oct_empresas').update(dados).eq('id', _parEmpresa);
  if (error) { set('Erro: ' + error.message, '#f44'); return; }
  Object.assign(_parEmp, dados);
  set('✅ Salvo. O PDV pega no próximo login ou F5.', '#4caf50');
}

// ---------- seção BANCO: Sicoob (oct_sicoob_contas) ----------
// prefixo das envs do certificado no Railway, derivado do nome do posto
function _sicPrefix(nome) {
  // sem acento (ANTÔNIO/GLÓRIA) e com o outro nome do AC (Miranda) — senao
  // devolvia 'POSTO' calado e o gateway procurava o certificado errado
  const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    // mapa manual tambem: navegador sem ICU (ou embutido) deixa o normalize sem efeito
    .replace(/[À-Å]/g, 'A').replace(/[È-Ë]/g, 'E').replace(/[Ì-Ï]/g, 'I')
    .replace(/[Ò-Ö]/g, 'O').replace(/[Ù-Ü]/g, 'U').replace(/Ç/g, 'C');
  if (n.includes('TIJUCO')) return 'TIJ';
  if (n.includes('FLORESTAL')) return 'FLO';
  if (n.includes('ANTONIO CARLOS') || n.includes('MIRANDA')) return 'AC';
  if (n.includes('GLORIA')) return 'GLO';
  return 'POSTO';
}

function _parSecaoSicoob() {
  return `<div class="par-card">
    <div class="par-card-titulo">🏦 Banco Sicoob — extrato e conciliação</div>
    <div class="par-card-desc">O gateway lê o extrato desta conta e o sistema baixa sozinho as contas a pagar
      (juros/multa e desconto separados nas contas certas). O <strong>client_id</strong> sai do portal
      <em>developers.sicoob.com.br</em> (aplicativo com a API <em>Conta Corrente</em> assinada).
      O certificado é o mesmo e-CNPJ A1 da NF-e (fica no Railway, não aqui).</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
      <div class="par-bloco">
        <div class="rot">Nº da conta corrente</div>
        <div class="desc">Conta cujo extrato o gateway lê.</div>
        <input id="sic-conta" type="text" placeholder="101789-6" style="width:100%">
      </div>
      <div class="par-bloco">
        <div class="rot">client_id (aplicativo do portal)</div>
        <div class="desc">Do portal developers.sicoob.com.br.</div>
        <input id="sic-client" type="text" placeholder="xxxxxxxx-xxxx-..." style="width:100%">
      </div>
      <div class="par-bloco">
        <div class="rot">Ambiente</div>
        <div class="desc">Sandbox só para teste.</div>
        <select id="sic-amb" style="width:100%"><option value="producao">Produção</option><option value="sandbox">Sandbox (teste)</option></select>
      </div>
      <div class="par-bloco">
        <div class="rot">Integração ativa</div>
        <div class="desc">Desligada, o gateway ignora esta conta.</div>
        <select id="sic-ativo" style="width:100%"><option value="true">Sim</option><option value="false">Não</option></select>
      </div>
    </div>
    <div class="par-rodape">
      <span id="sic-msg" class="par-msg"></span>
      <button class="par-btn verde" onclick="salvarSicoob()">💾 Salvar integração Sicoob</button>
    </div>
    <p id="sic-status" style="color:#667;font-size:0.8rem;margin-top:6px">carregando situação…</p>
  </div>`;
}

async function parSicoobCarregar() {
  const eid = _parEmpresa;
  const st = document.getElementById('sic-status');
  if (!eid || !document.getElementById('sic-conta')) return;
  try {
    const { data, error } = await sb.from('oct_sicoob_contas').select('*').eq('empresa_id', eid).maybeSingle();
    if (error) { if (st) st.textContent = '⚠ ' + error.message + ' — rode o SQL-SICOOB-EXTRATO.sql.'; return; }
    if (data) {
      document.getElementById('sic-conta').value = data.numero_conta || '';
      document.getElementById('sic-client').value = data.client_id || '';
      document.getElementById('sic-amb').value = data.ambiente || 'producao';
      document.getElementById('sic-ativo').value = String(data.ativo !== false);
    }
    // situação: último movimento importado do extrato
    const { data: mov } = await sb.from('oct_banco_movimentos').select('data,criado_em')
      .eq('empresa_id', eid).order('criado_em', { ascending: false }).limit(1);
    if (st) st.textContent = (mov && mov.length)
      ? `✅ Extrato chegando — último movimento importado: ${mov[0].data} (às ${new Date(mov[0].criado_em).toLocaleString('pt-BR')}).`
      : (data ? '⏳ Cadastro salvo — nenhum movimento importado ainda (worker roda a cada 15 min; confira as variáveis do certificado no Railway).'
              : 'Sem cadastro ainda — preencha e salve.');
  } catch (e) { if (st) st.textContent = '⚠ ' + (e.message || e); }
}

async function salvarSicoob() {
  if (!podeOuAvisa('empresa.integracoes')) return;
  const msg = document.getElementById('sic-msg');
  const eid = _parEmpresa;
  if (!eid) { msg.textContent = 'Selecione o posto no topo.'; msg.style.color = '#f44'; return; }
  const conta = document.getElementById('sic-conta').value.trim();
  if (!conta) { msg.textContent = 'Informe o número da conta.'; msg.style.color = '#f44'; return; }
  if (!_parEmpOk() || !_parEmp.nome) {
    // o prefixo das envs do certificado sai do NOME do posto: sem ele gravaria
    // 'POSTO' e apontaria o gateway para o certificado errado
    msg.textContent = 'O cadastro do posto não carregou — nada foi gravado. Recarregue a tela.'; msg.style.color = '#f44'; return;
  }
  msg.textContent = 'Salvando…'; msg.style.color = '#aaa';
  const { error } = await sb.from('oct_sicoob_contas').upsert({
    empresa_id: eid, numero_conta: conta,
    client_id: document.getElementById('sic-client').value.trim() || null,
    ambiente: document.getElementById('sic-amb').value,
    ativo: document.getElementById('sic-ativo').value === 'true',
    env_prefix: _sicPrefix(_parEmp.nome),
  }, { onConflict: 'empresa_id' });
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvo! O gateway pega no próximo ciclo (15 min).'; msg.style.color = '#4caf50';
  parSicoobCarregar();
}

// ---------- seção CASHBACK: chave geral (oct_empresas.cashback_ativo) ----------
function _parSecaoCashback() {
  if (!_parEmpOk()) return _parCardSemEmpresa('💸 Cashback — chave geral do posto');
  const e = _parEmp;
  // duas chaves, um interruptor: oct_empresas.cashback_ativo (gateway paga?) e
  // oct_parametros.cashback (PDV acumula?). Se divergem, o operador precisa saber.
  const pdvLigado = parValor('cashback');
  const divergem = pdvLigado !== !!e.cashback_ativo;
  const aviso = divergem
    ? `<div style="color:#f0b45c;font-size:0.78rem;margin-top:8px">⚠ Hoje o PDV está com o cashback
        <b>${pdvLigado ? 'ligado' : 'desligado'}</b> e a chave do posto (pagamento) está
        <b>${e.cashback_ativo ? 'ligada' : 'desligada'}</b>. Escolha e clique Salvar para alinhar os dois.</div>`
    : '';
  return `<div class="par-card">
    <div class="par-card-titulo">💸 Cashback — chave geral do posto</div>
    <div class="par-card-desc"><strong>Desligado</strong> (padrão): o portal do cliente não aceita cadastro nem
      acionamento deste posto e o pagador <strong>não paga nenhum Pix</strong> de cashback dele — posto que não
      oferece a função fica 100% protegido. Ligue apenas nos postos que oferecem o benefício.
      A regra (R$/litro, clientes, saldo) fica na tela <b>💸 Cashback</b> do menu.
      Este interruptor grava as duas pontas de uma vez: o PDV (acumula na venda) e o pagador (paga o Pix).</div>
    <div class="par-bloco">
      <div class="rot">Cashback neste posto</div>
      <select id="cb-ativo" style="min-width:240px;margin-top:6px">
        <option value="false" ${e.cashback_ativo ? '' : 'selected'}>🔴 Desligado</option>
        <option value="true" ${e.cashback_ativo ? 'selected' : ''}>🟢 Ligado (R$0,05/litro)</option>
      </select>${aviso}
    </div>
    <div class="par-rodape">
      <span id="cb-chave-msg" class="par-msg"></span>
      <button class="par-btn marrom" onclick="salvarCashbackChave()">💾 Salvar chave do cashback</button>
    </div>
  </div>`;
}

async function salvarCashbackChave() {
  // as DUAS permissoes antes de gravar qualquer coisa: gravar oct_empresas e
  // depois falhar em parGravar (parametros.alterar) deixaria as chaves desalinhadas
  if (!podeOuAvisa('empresa.integracoes') || !podeOuAvisa('parametros.alterar')) return;
  const msg = document.getElementById('cb-chave-msg');
  const eid = _parEmpresa;
  if (!eid) { msg.textContent = 'Selecione o posto no topo.'; msg.style.color = '#f44'; return; }
  if (!_parEmpOk()) { msg.textContent = 'O cadastro do posto não carregou — nada foi gravado. Recarregue a tela.'; msg.style.color = '#f44'; return; }
  const ligado = document.getElementById('cb-ativo').value === 'true';
  msg.textContent = 'Salvando…'; msg.style.color = '#aaa';
  const { error } = await sb.from('oct_empresas').update({ cashback_ativo: ligado }).eq('id', eid);
  if (error) {
    msg.style.color = '#f44';
    msg.textContent = /cashback_ativo/.test(String(error.message))
      ? 'Falta a coluna: rode no SQL editor → alter table oct_empresas add column if not exists cashback_ativo boolean default false;'
      : 'Erro: ' + error.message;
    return;
  }
  _parEmp.cashback_ativo = ligado;
  // a outra ponta: o gate do PDV em oct_parametros (parGravar avisa se falhar)
  const okPdv = await parGravar('cashback', ligado);
  if (!okPdv) {
    msg.textContent = 'Chave do posto salva, mas a do PDV não — o PDV continua como estava.';
    msg.style.color = '#f44';
    return;
  }
  msg.textContent = ligado ? '🟢 Cashback LIGADO neste posto (PDV e pagador).' : '🔴 Cashback DESLIGADO neste posto (PDV e pagador).';
  msg.style.color = ligado ? '#4caf50' : '#f0b45c';
  parRender();   // some o aviso de "desalinhado"
}

// ---------- a tela ----------
function parRender() {
  const el = document.getElementById('conteudo');
  if (!el) return;
  if (!PAR_ABAS.some(a => a.id === _parAba)) _parAba = 'pdv';
  const aba = PAR_ABAS.find(a => a.id === _parAba);
  const grupos = PARAM_DEFS
    .map((g, gi) => ({ g, gi }))
    .filter(x => (x.g.aba || 'pdv') === _parAba)
    .map(x => _parGrupoHtml(x.g, x.gi)).join('');
  let secoes = '';
  if (_parAba === 'receb') secoes = _parSecaoRecebimentos();
  else if (_parAba === 'banco') secoes = _parSecaoSicoob();
  else if (_parAba === 'cashback') secoes = _parSecaoCashback();
  const barra = PAR_ABAS.map(a =>
    `<div class="par-subaba${a.id === _parAba ? ' ativo' : ''}" onclick="parTrocarAba('${a.id}')" title="${_parEsc(a.desc)}">${_parEsc(a.rot)}</div>`
  ).join('');
  // o que o operador mexeu nos campos de oct_empresas e ainda nao salvou
  // (o Salvar do grupo PagBank redesenha a aba; nao pode apagar isso)
  const pendente = _parSnapshotEmp();

  el.innerHTML = `${_PAR_CSS}
    <div style="max-width:860px">
      <h2 style="color:#f97316;margin-bottom:4px">⚙️ Parâmetros</h2>
      <p style="color:#8892a0;font-size:0.82rem;margin-bottom:4px">
        Vale para <b style="color:#e0e0e0">${_parEsc(window._parNomePosto || 'o posto selecionado')}</b>.
        Chave liga/desliga vale no próximo carregamento da tela do PDV — não precisa reiniciar o núcleo.
      </p>
      <div class="par-subabas">${barra}</div>
      <p style="color:#8892a0;font-size:0.78rem;margin:-4px 0 12px">${_parEsc(aba.desc)}</p>
      ${secoes}${grupos}
      ${(!secoes && !grupos) ? '<p style="color:#667">Nada nesta aba ainda.</p>' : ''}
      <p style="color:#667;font-size:0.72rem;margin-top:10px">
        Parâmetro nunca configurado usa o padrão do sistema — um posto sem ajuste nenhum
        funciona como sempre funcionou.
      </p>
    </div>`;
  _parReaplicarEmp(pendente);
  if (_parAba === 'banco') parSicoobCarregar();
}

async function moduloParametros() {
  const el = document.getElementById('conteudo');
  if (el) el.innerHTML = '<p style="padding:20px;color:#888">Carregando parâmetros...</p>';
  // empresaAtiva() = o seletor de posto do topo (mesmo padrão dos outros módulos)
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { if (el) el.innerHTML = '<p style="padding:20px;color:#f87171">Selecione um posto no topo.</p>'; return; }
  _parEmp = null; _parEmpErro = null;
  try {
    const { data, error } = await sb.from('oct_empresas')
      .select('id,nome,nome_fantasia,usa_edi,usa_cofre,sangria_limite,cashback_ativo').eq('id', eid).single();
    if (error) _parEmpErro = error.message || String(error);
    else if (data && data.id) _parEmp = data;
    else _parEmpErro = 'posto não encontrado';
    window._parNomePosto = (data && (data.nome_fantasia || data.nome)) || '';
  } catch (e) { _parEmpErro = String((e && e.message) || e); window._parNomePosto = ''; }
  await parCarregar(eid);
  parRender();
}
