/* ═══════════════════════════════════════════════════
   modules/authError.js
   Full-page auth / connection error overlay with
   optional auto-retry countdown.
   Mirrors dama_frontend/modules/authError.js exactly.
═══════════════════════════════════════════════════ */

let _overlay        = null;
let _retryHandler   = null;
let _countdownTimer = null;

export function showAuthError(message = null, onRetry = null, autoRetryAfterMs = 0) {
  hideAuthError();
  _retryHandler = onRetry;
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'authErrorBlock';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:radial-gradient(ellipse at center,#001a0a 0%,#0d0d0d 70%)',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:16px','padding:32px 24px','text-align:center',
  ].join(';');

  overlay.innerHTML = `
    <style>
      @keyframes authErrPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(.92)}}
      #authErrorBlock .warn-icon{animation:authErrPulse 2s ease-in-out infinite}
    </style>
    <div class="warn-icon" style="font-size:3.2rem;line-height:1;margin-bottom:4px;">⚠️</div>
    <div style="font-family:'Cinzel',serif;font-size:1.3rem;font-weight:900;color:#7ec850;">
      Connection Problem
    </div>
    <div style="color:rgba(200,240,180,.75);font-size:.95rem;max-width:320px;line-height:1.6;">
      ${message || "We couldn't connect to the game server. Please check your connection and try again."}
    </div>
    <button id="authRetryBtn" style="
      background:#4ca828;color:#000;border:none;border-radius:999px;
      padding:12px 28px;font-weight:700;cursor:pointer;margin-top:8px;
      font-family:inherit;font-size:.95rem;
      box-shadow:0 4px 14px rgba(76,168,40,.3);
      transition:opacity .15s,transform .15s;">
      ↻ Retry
    </button>
    <div id="authRetryNote" style="color:rgba(200,240,180,.4);font-size:.78rem;min-height:1.2em;"></div>`;

  const mount = () => {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    document.body.appendChild(overlay);
    _overlay = overlay;

    const btn  = document.getElementById('authRetryBtn');
    const note = document.getElementById('authRetryNote');

    btn?.addEventListener('click', () => {
      if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
      hideAuthError();
      if (typeof _retryHandler === 'function') _retryHandler();
    });

    if (autoRetryAfterMs > 0 && btn && note) {
      let remaining = Math.ceil(autoRetryAfterMs / 1000);
      note.textContent = `Auto-retrying in ${remaining}s…`;
      _countdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(_countdownTimer);
          _countdownTimer = null;
          hideAuthError();
          if (typeof _retryHandler === 'function') _retryHandler();
        } else {
          if (note) note.textContent = `Auto-retrying in ${remaining}s…`;
        }
      }, 1000);
    }
  };

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
}

export function hideAuthError() {
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  if (_overlay) { _overlay.remove(); _overlay = null; }
  _retryHandler = null;
  document.body.style.overflow = '';
}
