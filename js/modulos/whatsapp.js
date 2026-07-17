// ============================================================
// MÓDULO WHATSAPP (retaguarda) — status + QR do gateway octano-wpp
// Lê oct_wpp_status (gravado pelo gateway na nuvem). Mostra conectado/número,
// ou o QR pra reconectar. Atualiza sozinho a cada 5s.
// ============================================================
const WPP_GATEWAY = "https://octano-wpp-production.up.railway.app";
const WPP_SESSION_ID = "rede";

async function moduloWhatsapp() {
  if (window._wppTimer) { clearInterval(window._wppTimer); window._wppTimer = null; }
  await _wppRender();
  window._wppTimer = setInterval(() => {
    if (!document.getElementById("wpp-root")) { clearInterval(window._wppTimer); window._wppTimer = null; return; }
    _wppRender(true);
  }, 5000);
}

function _wppEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function _wppRender(silent) {
  const conteudo = document.getElementById("conteudo");
  if (!conteudo) return;
  let st = null;
  try {
    const { data } = await sb.from("oct_wpp_status").select("*").eq("session_id", WPP_SESSION_ID).limit(1);
    st = data && data[0];
  } catch (e) { /* tabela pode não existir ainda */ }

  const conectado = st && st.connected;
  const numero = st && st.numero;
  const qr = st && st.qr;
  const atualizado = st && st.atualizado_em ? new Date(st.atualizado_em) : null;
  const seg = atualizado ? Math.round((Date.now() - atualizado.getTime()) / 1000) : null;
  // "vivo" se o gateway atualizou o status nos últimos ~90s
  const vivo = seg != null && seg < 90;

  let corpo;
  if (!st) {
    corpo = `<div class="wpp-box alerta"><p>Sem status do gateway ainda.</p>
      <p class="wpp-sub">Verifique se o serviço <b>octano-wpp</b> está no ar e se a migração <code>oct_wpp_status</code> foi aplicada.</p></div>`;
  } else if (conectado) {
    corpo = `<div class="wpp-box ok">
      <div class="wpp-badge">🟢 Conectado</div>
      <p class="wpp-num">${_wppEsc(_wppFmtNumero(numero))}</p>
      <p class="wpp-sub">${vivo ? "Gateway online" : "⚠️ status não atualiza há " + seg + "s (gateway pode ter caído)"}</p>
    </div>`;
  } else {
    corpo = `<div class="wpp-box alerta">
      <div class="wpp-badge">🔴 Desconectado</div>
      ${qr ? `<p>Escaneie com o WhatsApp do número da rede (Aparelhos conectados → Conectar):</p>
        <img class="wpp-qr" src="${_wppEsc(qr)}" alt="QR">` : `<p>Aguardando o gateway gerar o QR…</p>`}
    </div>`;
  }

  conteudo.innerHTML = `
    <style>
    .wpp-wrap{max-width:560px;margin:24px auto;padding:0 16px}
    .wpp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .wpp-box{background:#13151f;border:1px solid #2a2d3e;border-radius:12px;padding:22px;text-align:center;color:#dbe2ea}
    .wpp-box.ok{border-color:#245a35}.wpp-box.alerta{border-color:#7a5a20}
    .wpp-badge{font-size:1.1rem;font-weight:700;margin-bottom:8px}
    .wpp-num{font-size:1.4rem;color:#4ade80;font-weight:700;margin:6px 0}
    .wpp-sub{color:#9aa;font-size:.82rem;margin-top:6px}
    .wpp-qr{width:280px;height:280px;background:#fff;padding:12px;border-radius:10px;margin:14px auto;display:block}
    .wpp-link{display:inline-block;margin-top:14px;color:#60a5fa;text-decoration:none;border:1px solid #2a2d3e;border-radius:8px;padding:8px 14px}
    .wpp-link:hover{background:#1b2130}
    </style>
    <div class="wpp-wrap" id="wpp-root">
      <div class="wpp-head">
        <h2 style="color:#f97316;margin:0">📱 WhatsApp da Rede</h2>
        <span style="color:#6b7688;font-size:.75rem">${atualizado ? "atualizado " + (seg < 60 ? seg + "s" : Math.round(seg / 60) + "min") + " atrás" : ""}</span>
      </div>
      ${corpo}
      <div style="text-align:center">
        <a class="wpp-link" href="${WPP_GATEWAY}/scan" target="_blank">🔗 Abrir tela de conexão (QR ao vivo)</a>
      </div>
      <p style="color:#6b7688;font-size:.75rem;text-align:center;margin-top:14px">
        Envio de mensagens sai por este número. Automação por lib não-oficial — mantenha o volume moderado.
      </p>
    </div>`;
}

function _wppFmtNumero(n) {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length === 12 || d.length === 13) return "+" + d.slice(0, 2) + " " + d.slice(2, 4) + " " + d.slice(4);
  return n || "";
}
