/* ═══════════════════════════════════════════════════
   modules/urlAuth.js
   Reads required URL params: token + launch (opaque)
   Fetches balance/username from xo-backend's
   POST /api/xo/player-balance — no decryption, no phone
   ever in the URL or in client-side logic.
═══════════════════════════════════════════════════ */

import { showAuthError, hideAuthError } from './authError.js';
import { API_URL } from './api.js';

const REQUIRED_PARAMS         = ['token', 'launch'];
const STORAGE_KEY             = 'xo_url_auth';
const BALANCE_FETCH_TIMEOUT_MS = 55000;  // 55 s — covers Render cold starts
const WAKEUP_UI_DELAY_MS      = 4000;
const LOADER_SUBTITLE_SELECTOR = '#loaderSubtitle';

const MAX_AUTO_RETRIES    = 4;
const AUTO_RETRY_DELAY_MS = 3000;

let _authGate = null;

/* ── Auth gate (promise handle) ──────────────────────────────── */

export function createAuthGate() {
  let settled = false;
  let resolveFn, rejectFn;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn  = reject;
  });
  return {
    promise,
    resolve(value) { if (!settled) { settled = true; resolveFn(value); } },
    reject(reason) { if (!settled) { settled = true; rejectFn(reason); } },
  };
}

export function getAuthGate()   { if (!_authGate) _authGate = createAuthGate(); return _authGate; }
export function resetAuthGate() { _authGate = createAuthGate(); return _authGate; }

/* ── URL helpers ─────────────────────────────────────────────── */

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    token:  p.get('token')  || null,
    launch: p.get('launch') || null,
  };
}

function isValid(params) {
  return REQUIRED_PARAMS.every(k => !!params[k]);
}

export function shouldTreatAsNonBlocking(reason) {
  // 401 is handled separately (expiry vs invalid token) — only treat 403 as hard block here
  if (typeof reason === 'number') return reason === 403;
  const text = String(reason || '').toLowerCase();
  return text.includes('403')
    || /forbidden|invalid or inactive token/i.test(text);
}

/* ── Expired session overlay ─────────────────────────────────── */

function showExpiredOverlay() {
  // Remove any existing overlay
  document.getElementById('urlAuthBlock')?.remove();
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'urlAuthBlock';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:radial-gradient(ellipse at center,#1a0a00 0%,#0d0d0d 70%)',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:18px','padding:32px 24px','text-align:center',
  ].join(';');

  // Read current params for the refresh call
  const curParams = readParams();

  overlay.innerHTML = `
    <style>
      @keyframes expiredPulse{0%,100%{transform:scale(1)}50%{transform:scale(.92)}}
      #urlAuthBlock .exp-icon{animation:expiredPulse 2s ease-in-out infinite}
    </style>
    <div class="exp-icon" style="font-size:3.6rem;line-height:1;">⏰</div>
    <div style="font-family:'Cinzel',serif;font-size:1.4rem;font-weight:900;color:#f0c94a;">
      Session Expired
    </div>
    <div style="color:rgba(245,230,200,.75);font-size:.9rem;max-width:300px;line-height:1.65;">
      Your session has expired. Tap below to get a fresh link and continue.
    </div>
    <button id="reloadGameBtn" style="
      background:linear-gradient(135deg,#a07810,#d4a017);color:#1a1005;
      border:none;border-radius:999px;padding:13px 32px;
      font-weight:800;cursor:pointer;font-family:inherit;font-size:.95rem;
      box-shadow:0 4px 14px rgba(212,160,23,.35);margin-top:4px;">
      🔄 Reload Game
    </button>
    <div id="reloadStatus" style="font-size:.75rem;color:rgba(245,230,200,.45);min-height:1.2em;"></div>`;

  const mount = () => {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    document.body.appendChild(overlay);

    document.getElementById('reloadGameBtn')?.addEventListener('click', async () => {
      const btn    = document.getElementById('reloadGameBtn');
      const status = document.getElementById('reloadStatus');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Getting fresh link…'; }

      try {
        const SYSTEM_BACKEND = 'https://system-backend-1u5m.onrender.com';
        const res = await fetch(`${SYSTEM_BACKEND}/api/admin/games/game-tokens/refresh-launch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            token:    curParams?.token || '',
            username: window.XO_USERNAME || '',
            balance:  window.XO_BALANCE  ?? 0,
          }),
        });
        const json = await res.json();
        if (res.ok && json.launch) {
          const url = new URL(window.location.href);
          url.searchParams.set('token',  json.token);
          url.searchParams.set('launch', json.launch);
          window.location.href = url.toString();
        } else {
          throw new Error(json.error || 'Failed to refresh');
        }
      } catch (e) {
        if (status) status.textContent = 'Could not refresh. Please go back to Telegram.';
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Reload Game'; }
        setTimeout(() => {
          if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
        }, 2000);
      }
    });
  };

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
}

/* ── Blocking overlays ───────────────────────────────────────── */

function showInvalidOverlay(missing, options = {}) {
  document.body.style.overflow = 'hidden';
  const title       = options.title       || 'Access Denied';
  const description = options.description || 'This app requires a valid access link.<br>Please open the app from Telegram.';

  const overlay = document.createElement('div');
  overlay.id = 'urlAuthBlock';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:radial-gradient(ellipse at center,#0d1a00 0%,#0d0d0d 70%)',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:18px','padding:32px 24px','text-align:center',
  ].join(';');

  overlay.innerHTML = `
    <style>
      @keyframes lockBounce{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.15) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      #urlAuthBlock .lock-icon{animation:lockBounce .55s ease both}
      #urlAuthBlock .auth-title{animation:fadeUp .4s .25s ease both;opacity:0}
      #urlAuthBlock .auth-desc{animation:fadeUp .4s .38s ease both;opacity:0}
      #urlAuthBlock .auth-missing{animation:fadeUp .4s .48s ease both;opacity:0}
    </style>
    <div class="lock-icon" style="font-size:3.6rem;line-height:1;">🔒</div>
    <div class="auth-title" style="font-family:'Cinzel',serif;font-size:1.4rem;font-weight:900;
      background:linear-gradient(180deg,#fff 0%,#7ec850 55%,#4ca828 100%);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">
      ${title}
    </div>
    <div class="auth-desc" style="color:rgba(220,240,200,.7);font-size:.9rem;max-width:300px;line-height:1.65;">
      ${description}
    </div>
    <div class="auth-missing" style="
      background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.3);
      border-radius:10px;padding:10px 18px;font-size:.78rem;color:#e74c3c;
      line-height:1.7;max-width:320px;">
      <strong>Missing parameters:</strong><br>
      ${missing.map(k => `<code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:4px;">${k}</code>`).join('  ')}
    </div>`;

  const mount = () => {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    document.body.appendChild(overlay);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
}

function showAccountLoadFailureOverlay(onRetry) {
  showAuthError(
    "We couldn't verify your account details from the backend. The server may be waking up — please wait or retry.",
    onRetry,
    15000
  );
}

/* ── Balance display helpers ─────────────────────────────────── */

export function updateBalanceDisplay(balance) {
  if (balance === null || balance === undefined) return;
  const balEl = document.querySelector('.topbar-balance');
  if (balEl) balEl.textContent = '💰 ' + Number(balance).toLocaleString() + ' ETB';
  window.XO_BALANCE = balance;
  window.dispatchEvent(new CustomEvent('xo-balance-changed', { detail: balance }));
}

function setBalanceLoading(loading) {
  const spinner = document.getElementById('balSpinner');
  const btn     = document.getElementById('balRefreshBtn');
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (btn)     { btn.classList.toggle('spinning', loading); btn.disabled = loading; }
}

function setLoaderSubtitle(text) {
  const el = document.querySelector(LOADER_SUBTITLE_SELECTOR);
  if (el) el.textContent = text;
}

let _wakeCounterInterval = null;

function showWakingUpMessage(show) {
  const subtitle = document.querySelector(LOADER_SUBTITLE_SELECTOR);
  if (!subtitle) return;
  if (show) {
    let secs = 0;
    subtitle.textContent = 'Waking up the server…';
    if (_wakeCounterInterval) clearInterval(_wakeCounterInterval);
    _wakeCounterInterval = setInterval(() => {
      secs++;
      subtitle.textContent = `Waking up the server… (${secs}s)`;
    }, 1000);
  } else {
    if (_wakeCounterInterval) { clearInterval(_wakeCounterInterval); _wakeCounterInterval = null; }
    subtitle.textContent = 'XO Game';
  }
}

/* ── Single fetch to xo-backend /api/xo/player-balance ──────── */

async function fetchPlayerBalance(token, launch) {
  const res = await fetch(`${API_URL}/api/xo/player-balance`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token, launch }),
    signal:  AbortSignal.timeout(BALANCE_FETCH_TIMEOUT_MS),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err  = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code   = json.code || null;
    throw err;
  }

  const data = json?.data ?? json;
  return {
    balance:  data.balance  !== undefined ? Number(data.balance) : null,
    username: data.username || null,
  };
}

/* ── refreshBalance — called periodically and on tab focus ────── */

export async function refreshBalance(silent = false) {
  let auth;
  try { auth = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return; }
  if (!auth?.token || !auth?.launch) return;

  if (!silent) setBalanceLoading(true);
  try {
    const data = await fetchPlayerBalance(auth.token, auth.launch);
    if (data.balance === null || data.username === null) {
      if (silent) return;
      showAuthError("We couldn't verify your account details. Please try again.", () => refreshBalance(false));
      return;
    }
    hideAuthError();
    updateBalanceDisplay(data.balance);
    window.XO_USERNAME = data.username;
  } catch (err) {
    // Expired token — show the session-expired screen
    if (err.code === 'LAUNCH_TOKEN_EXPIRED') {
      showExpiredOverlay();
      return;
    }
    // Any 401/403 — access denied, don't retry silently
    if (shouldTreatAsNonBlocking(err.status || err)) return;
    console.warn('[urlAuth] refreshBalance failed:', err.message);
    if (!silent) showAuthError("Couldn't connect to the game server. Check your connection.", () => refreshBalance(false));
  } finally {
    if (!silent) setBalanceLoading(false);
  }
}

/* ── initUrlAuth — called once at app startup ─────────────────── */

export function initUrlAuth() {
  const gate = resetAuthGate();
  window.XO_AUTH_READY = gate.promise;

  return new Promise((resolve) => {
    const params = readParams();

    if (!isValid(params)) {
      showInvalidOverlay(REQUIRED_PARAMS.filter(k => !params[k]));
      gate.reject(new Error(`Missing auth parameters: ${REQUIRED_PARAMS.filter(k => !params[k]).join(', ')}`));
      return;
    }

    // Persist to localStorage so refreshBalance works after reload
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    window.XO_API_TOKEN = params.token;

    // Sensible defaults before async fetch completes
    window.XO_USERNAME = 'Player';
    window.XO_BALANCE  = null;

    async function attempt(retriesLeft) {
      setBalanceLoading(true);
      const wakeTimer = setTimeout(() => showWakingUpMessage(true), WAKEUP_UI_DELAY_MS);

      try {
        const data = await fetchPlayerBalance(params.token, params.launch);

        clearTimeout(wakeTimer);
        showWakingUpMessage(false);
        setBalanceLoading(false);

        // Backend returned nulls — still waking up
        if (data.username === null) {
          if (retriesLeft > 0) {
            _showRetryingStatus(retriesLeft);
            setTimeout(() => attempt(retriesLeft - 1), AUTO_RETRY_DELAY_MS);
            return;
          }
          gate.reject(new Error('Could not load account data from backend.'));
          showAccountLoadFailureOverlay(() => { hideAuthError(); attempt(MAX_AUTO_RETRIES); });
          resolve(params);
          return;
        }

        // Success
        _hideRetryingStatus();
        updateBalanceDisplay(data.balance);
        window.XO_USERNAME = data.username;

        // Populate name in topbar immediately
        const nameEl = document.querySelector('.topbar-name');
        if (nameEl) nameEl.textContent = data.username;

        gate.resolve(true);

        // Clean URL — keep only token + launch
        try {
          const url   = new URL(window.location.href);
          const clean = new URLSearchParams();
          clean.set('token',  params.token);
          clean.set('launch', params.launch);
          window.history.replaceState({}, '', `${url.pathname}?${clean.toString()}`);
        } catch {}

        resolve(params);

      } catch (err) {
        clearTimeout(wakeTimer);
        showWakingUpMessage(false);
        setBalanceLoading(false);

        // Launch token expired or invalid — tell the user to get a fresh link from Telegram
        if (err.code === 'LAUNCH_TOKEN_EXPIRED' || err.code === 'INVALID_LAUNCH_TOKEN') {
          gate.reject(err);
          showExpiredOverlay();
          resolve(params);
          return;
        }

        // Hard auth rejection (invalid token, forbidden) — don't retry
        if (shouldTreatAsNonBlocking(err.status || err)) {
          gate.reject(err);
          showInvalidOverlay(['token', 'launch'], {
            title: 'Access Denied',
            description: 'This access link is invalid or expired.<br>Please go back to Telegram and tap Play again.',
          });
          resolve(params);
          return;
        }

        // Transient failure — only retry on network errors or 5xx server errors
        // 4xx errors (except those already handled above) mean the request itself
        // is wrong — retrying won't help.
        const isRetryable = !err.status || err.status >= 500;
        if (isRetryable && retriesLeft > 0) {
          _showRetryingStatus(retriesLeft);
          setTimeout(() => attempt(retriesLeft - 1), AUTO_RETRY_DELAY_MS);
          return;
        }

        // All retries exhausted
        gate.reject(err);
        showAccountLoadFailureOverlay(() => { hideAuthError(); attempt(MAX_AUTO_RETRIES); });
        resolve(params);
      }
    }

    attempt(MAX_AUTO_RETRIES);
  });
}

function _showRetryingStatus(retriesLeft) {
  const subtitle = document.querySelector(LOADER_SUBTITLE_SELECTOR);
  if (subtitle) subtitle.textContent = `Connecting to server… (retrying ${MAX_AUTO_RETRIES - retriesLeft + 1}/${MAX_AUTO_RETRIES})`;
}

function _hideRetryingStatus() {
  const subtitle = document.querySelector(LOADER_SUBTITLE_SELECTOR);
  if (subtitle) subtitle.textContent = 'XO Game';
}

export function getUrlAuth() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
