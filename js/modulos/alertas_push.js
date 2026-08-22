// ============================================================
// Octano — ALERTAS NO CELULAR (Web Push)
// ------------------------------------------------------------
// Faz o alerta chegar como notificação do sistema, igual app: o celular
// apita mesmo com o navegador fechado. Quem dispara é o sentinela
// (_ferramentas/sentinela_sonda.py) assinando com VAPID.
//
// No iPhone só funciona se o site estiver INSTALADO na tela de início
// (Compartilhar > Adicionar à Tela de Início) — é regra da Apple, não nossa.
// ============================================================

const PUSH_VAPID_PUBLICA =
  "BHfAvkfirxVrjDM-32iil4kfiUN-0e8lPSBHKNqTZn0r13RFQ08UDRiFvgTnarMJN9aVgLm3DQNBl_aqgiXoOEI";

function _pushB64ParaBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function _pushBytesParaB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function pushSuportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS exige o app instalado; sem isso o navegador nem oferece o Push. */
function _pushEhIosSemInstalar() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalado = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  return ios && !instalado;
}

async function pushEstado() {
  if (!pushSuportado()) return { ok: false, motivo: "navegador sem suporte a Push" };
  if (_pushEhIosSemInstalar())
    return { ok: false, motivo: "no iPhone, instale o app primeiro (Compartilhar > Adicionar à Tela de Início)" };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, motivo: "service worker ainda não registrado — recarregue a página" };
  const sub = await reg.pushManager.getSubscription();
  return { ok: true, permissao: Notification.permission, inscrito: !!sub, sub };
}

/** Pede permissão, inscreve no push service e guarda a assinatura no Supabase. */
async function pushAtivar(rotulo) {
  const est = await pushEstado();
  if (!est.ok) { alert("Não dá para ativar aqui: " + est.motivo); return false; }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert(perm === "denied"
      ? "As notificações estão BLOQUEADAS para este site. Libere nas configurações do navegador e tente de novo."
      : "Permissão não concedida.");
    return false;
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _pushB64ParaBytes(PUSH_VAPID_PUBLICA),
    });
  }
  const j = sub.toJSON();
  const linha = {
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    rotulo: rotulo || (navigator.userAgent.slice(0, 60)),
    ativo: true,
    falhas: 0,
  };
  // endpoint é único: se o device já estava inscrito, atualiza em vez de duplicar
  const { error } = await sb.from("oct_push_assinaturas")
    .upsert(linha, { onConflict: "endpoint" });
  if (error) {
    alert("Inscrito no navegador, mas falhou ao salvar no servidor: " + error.message
      + "\n\nRode a migração SQL-PUSH.sql no Supabase.");
    return false;
  }
  await reg.showNotification("Octano", {
    body: "Pronto. Os alertas de sonda travada vão chegar aqui.",
    vibrate: [150],
  });
  return true;
}

async function pushDesativar() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return true;
  const endpoint = sub.toJSON().endpoint;
  await sub.unsubscribe();
  await sb.from("oct_push_assinaturas").delete().eq("endpoint", endpoint);
  return true;
}

/** Botão pronto para plugar em qualquer tela. */
async function pushBotaoHtml() {
  const est = await pushEstado();
  if (!est.ok) {
    return `<div style="color:#f59e0b;font-size:13px">🔕 ${_pushEsc(est.motivo)}</div>`;
  }
  if (est.inscrito) {
    return `<button class="fat-btn" onclick="pushDesativarUi()"
      style="background:#1f2937;color:#7ee2a0">🔔 Alertas ligados neste aparelho — desligar</button>`;
  }
  return `<button class="fat-btn azul" onclick="pushAtivarUi()">🔔 Receber alertas neste celular</button>`;
}

function _pushEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function pushAtivarUi() {
  const nome = prompt("Nome deste aparelho (para você saber depois qual é):",
    "celular");
  if (nome === null) return;
  if (await pushAtivar(nome)) pushRenderBotao();
}

async function pushDesativarUi() {
  if (!confirm("Parar de receber os alertas neste aparelho?")) return;
  await pushDesativar();
  pushRenderBotao();
}

/** Redesenha o botão em todo elemento com id/classe 'push-botao'. */
async function pushRenderBotao() {
  const html = await pushBotaoHtml();
  document.querySelectorAll("#push-botao, .push-botao").forEach((el) => { el.innerHTML = html; });
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("#push-botao, .push-botao")) pushRenderBotao();
});
