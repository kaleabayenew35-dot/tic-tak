/* ═══════════════════════════════════════════════════
   modules/errorBoundary.js
   Fatal errors → full-page overlay + reload button
   Recoverable errors → console.warn + non-blocking toast
   Mirrors dama_frontend/modules/errorBoundary.js exactly.
═══════════════════════════════════════════════════ */

function showErrorToast(message) {
  let toast = document.getElementById('_errToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_errToast';
    toast.style.cssText = [
      'position:fixed','bottom:80px','left:50%',
      'transform:translateX(-50%)',
      'background:rgba(192,57,43,.92)','color:#fff',
      'padding:10px 20px','border-radius:10px',
      "font-family:'Rajdhani',sans-serif",'font-size:.85rem',
      'font-weight:700','z-index:99997',
      'pointer-events:none','text-align:center',
      'max-width:320px','box-shadow:0 4px 18px rgba(0,0,0,.5)',
      'transition:opacity .4s ease',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

function showFatalOverlay(error) {
  if (document.getElementById('_fatalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = '_fatalOverlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:rgba(0,0,0,.88)','backdrop-filter:blur(6px)',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:16px','padding:32px 24px','text-align:center',
  ].join(';');
  overlay.innerHTML = `
    <div style="font-size:2.8rem;">⚠️</div>
    <div style="font-family:'Cinzel',serif;font-size:1.2rem;font-weight:900;color:#7ec850;">
      Something went wrong
    </div>
    <div style="color:rgba(255,255,255,.65);font-size:.85rem;max-width:300px;line-height:1.6;">
      An unexpected error occurred. Please refresh and try again.
    </div>
    <button id="errorRetryBtn" style="
      padding:12px 32px;border-radius:50px;border:none;cursor:pointer;
      background:linear-gradient(135deg,#3a8a1a,#7ec850);
      color:#0a1a05;font-weight:800;font-size:.9rem;
      font-family:'Rajdhani',sans-serif;letter-spacing:.05em;
      box-shadow:0 4px 18px rgba(76,168,40,.4);">↻ Refresh</button>`;
  document.body.appendChild(overlay);
  document.getElementById('errorRetryBtn').onclick = () => location.reload();
}

const RECOVERABLE_PATTERNS = [
  /fetch/i, /network/i, /Failed to fetch/i, /balance/i, /history/i,
  /WebSocket/i, /timeout/i, /aborted/i, /HTTP 4\d\d/i, /HTTP 5\d\d/i, /ResizeObserver/i,
];

function isRecoverable(error) {
  if (!error) return true;
  const msg = (error.message || String(error)).toLowerCase();
  return RECOVERABLE_PATTERNS.some(re => re.test(msg));
}

export function initErrorBoundary() {
  window.addEventListener('error', (e) => {
    const error = e.error || new Error(e.message || 'Unknown error');
    console.error('[ErrorBoundary] Uncaught error:', error);
    if (isRecoverable(error)) showErrorToast(`Error: ${error.message || 'Something failed'}`);
    else showFatalOverlay(error);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason  = e.reason;
    const message = reason?.message || String(reason) || 'Unhandled promise rejection';
    console.warn('[ErrorBoundary] Unhandled rejection:', reason);
    if (isRecoverable(reason)) console.warn('[ErrorBoundary] Recoverable (ignored):', message);
    else showFatalOverlay(reason instanceof Error ? reason : new Error(message));
  });
}

export function reportRecoverableError(message) {
  console.warn('[ErrorBoundary] Recoverable:', message);
  showErrorToast(message);
}
