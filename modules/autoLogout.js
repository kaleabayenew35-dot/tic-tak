/* ═══════════════════════════════════════════════════
   modules/autoLogout.js
   Session timeout has been removed.
   This is a Telegram Mini App — Telegram manages the
   session lifecycle. No idle logout is needed.

   Both exports are kept as no-ops so existing imports
   in app.js continue to work without any changes.
   Mirrors dama_frontend/modules/autoLogout.js exactly.
═══════════════════════════════════════════════════ */

export function resetIdle() {
  // no-op — session timeout removed
}

export function initAutoLogout() {
  // no-op — session timeout removed
}
