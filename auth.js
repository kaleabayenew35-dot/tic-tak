const DEFAULT_BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://xo-backend-lzj0.onrender.com'

var API_URL = (window.__XO_BACKEND_URL__ || DEFAULT_BACKEND_URL).replace(/\/$/, '')

function parseAuthQuery() {
  const params = new URLSearchParams(window.location.search)
  return {
    token: params.get('token') || '',
    launch: params.get('launch') || '',
  }
}

function isAuthDataValid(data) {
  return Boolean(data?.token && data?.launch)
}

function buildAuthStorageKey(data = {}) {
  const token = String(data.token || '').trim() || 'no-token'
  const launch = String(data.launch || '').trim() || 'no-launch'
  return `xo_auth:${token}:${launch}`
}

function setAuthData(data) {
  window.authData = data
  const key = buildAuthStorageKey(data)
  localStorage.setItem(key, JSON.stringify(data))
  localStorage.setItem('xo_auth_current', key)
  sessionStorage.setItem('xo_auth_current', key)
}

function getStoredAuth(data = {}) {
  try {
    const key = buildAuthStorageKey(data)
    const directRaw = localStorage.getItem(key)
    if (directRaw) return JSON.parse(directRaw)

    const currentKey = localStorage.getItem('xo_auth_current') || sessionStorage.getItem('xo_auth_current')
    if (currentKey) {
      const currentRaw = localStorage.getItem(currentKey)
      if (currentRaw) return JSON.parse(currentRaw)
    }

    const legacyRaw = localStorage.getItem('xo_auth')
    return legacyRaw ? JSON.parse(legacyRaw) : null
  } catch {
    return null
  }
}

function cleanAuthUrl() {
  const url = new URL(window.location.href)
  const nextParams = new URLSearchParams()
  const token = String(window.authData?.token || '').trim()
  const launch = String(window.authData?.launch || '').trim()

  if (token) nextParams.set('token', token)
  if (launch) nextParams.set('launch', launch)

  url.search = nextParams.toString()
  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, document.title, nextUrl)
}

function showNotAllowedScreen(reason) {
  const authScreen = document.getElementById('authScreen')
  const appWrapper = document.getElementById('appWrapper')
  if (authScreen) authScreen.classList.remove('hidden')
  if (appWrapper) appWrapper.classList.add('hidden')
  showUnauthorizedPopup(reason)
}

function showAppScreen() {
  const authScreen = document.getElementById('authScreen')
  const appWrapper = document.getElementById('appWrapper')
  if (authScreen) authScreen.classList.add('hidden')
  if (appWrapper) appWrapper.classList.remove('hidden')
}

function showUnauthorizedPopup(reason) {
  // Remove any existing popup so we can show a fresh one with the right message.
  const existing = document.getElementById('unauthorizedPopup')
  if (existing) existing.remove()

  const isExpired = reason === 'LAUNCH_TOKEN_EXPIRED'
  const title = isExpired ? 'Session Expired' : 'Unauthorized'
  const message = isExpired
    ? 'Your game session has expired. Please go back to Telegram and tap Play again to get a fresh link.'
    : 'This app requires a valid token and launch value to continue. Please open the app from Telegram.'
  const btnLabel = isExpired ? 'Back to Telegram' : 'Retry'

  const overlay = document.createElement('div')
  overlay.id = 'unauthorizedPopup'
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:10000',
    'display:grid',
    'place-items:center',
    'background:rgba(13,13,13,0.96)',
    'padding:24px'
  ].join(';')

  overlay.innerHTML = `
    <div style="max-width:520px;width:100%;background:#111111;border:1px solid rgba(212,160,23,0.2);color:#f5e6c8;padding:38px 32px 28px;border-radius:28px;box-shadow:0 32px 80px rgba(0,0,0,0.45);text-align:center;font-family:'Rajdhani',Inter,system-ui,sans-serif;">
      <div style="font-family:'Cinzel',serif;font-size:2.8rem;font-weight:900;line-height:1.1;margin-bottom:18px;color:#f5e6c8;letter-spacing:-0.04em;">${title}</div>
      <p style="margin:0 0 28px;color:#d4c5a3;line-height:1.5;font-size:1.15rem;">${message}</p>
      <button id="unauthRetryBtn" style="width:min(220px,100%);padding:16px 24px;border-radius:14px;background:linear-gradient(135deg,#a07810,#d4a017);color:#1a1408;border:none;font-size:1.05rem;font-weight:800;cursor:pointer;box-shadow:0 12px 28px rgba(212,160,23,0.28);">${btnLabel}</button>
    </div>
  `

  document.body.appendChild(overlay)
  document.body.style.overflow = 'hidden'
  const retryBtn = document.getElementById('unauthRetryBtn')
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      overlay.remove()
      document.body.style.overflow = ''
      if (isExpired && window.Telegram?.WebApp?.close) {
        // Close the Mini App so the user lands back in the Telegram chat.
        window.Telegram.WebApp.close()
      } else {
        window.location.reload()
      }
    })
  }
}

function authSuccess(data) {
  setAuthData(data)
  cleanAuthUrl()
  showAppScreen()

  function callAppReady() {
    if (typeof window.appReady === 'function') {
      window.appReady()
      return
    }
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', callAppReady, { once: true })
    } else {
      window.requestAnimationFrame(callAppReady)
    }
  }

  callAppReady()
}

async function fetchPlayerBalance(token, launch) {
  if (!token || !launch) {
    return null
  }

  try {
    const response = await fetch(`${API_URL}/api/xo/player-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, launch }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(25000) : undefined,
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      // Attach a machine-readable code so callers can distinguish expiry from other errors.
      const err = new Error(payload.error || 'Could not fetch player balance')
      err.code = payload.code || null
      throw err
    }

    const userData = payload?.data || {}
    return {
      token,
      launch,
      username: userData.username || '',
      balance: userData.balance ?? '',
    }
  } catch (error) {
    console.error('Player balance fetch failed', error)
    // Re-throw expiry errors so initAuth can show the right message.
    if (error.code === 'LAUNCH_TOKEN_EXPIRED') throw error
    return null
  }
}

async function initAuth() {
  const queryData = parseAuthQuery()

  if (isAuthDataValid(queryData)) {
    // Fresh token+launch in the URL — always try these first.
    try {
      const resolved = await fetchPlayerBalance(queryData.token, queryData.launch)
      if (resolved) {
        authSuccess(resolved)
        return
      }
      // Verification returned null (invalid token / unknown error).
      showNotAllowedScreen()
    } catch (err) {
      // fetchPlayerBalance throws for LAUNCH_TOKEN_EXPIRED — show the right message.
      showNotAllowedScreen(err.code || null)
    }
    // In all failure cases, do NOT fall back to a stale stored session.
    // That would replay an expired token and cause an infinite retry loop.
    return
  }

  // No URL params — try a previously-stored session for the same token pair.
  const stored = getStoredAuth(queryData)
  if (stored && isAuthDataValid(stored)) {
    // Verify the stored session is still live before accepting it.
    try {
      const verified = await fetchPlayerBalance(stored.token, stored.launch)
      if (verified) {
        authSuccess(verified)
        return
      }
    } catch { /* expired or invalid — fall through to clear & show error */ }

    // Stored session is expired or invalid; clear it so we don't loop.
    try {
      const key = buildAuthStorageKey(stored)
      localStorage.removeItem(key)
      localStorage.removeItem('xo_auth_current')
      sessionStorage.removeItem('xo_auth_current')
    } catch { /* ignore */ }
  }

  showNotAllowedScreen()
}

function handleAuthNavigation() {
  initAuth()
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', handleAuthNavigation)
} else {
  handleAuthNavigation()
}
window.addEventListener('popstate', handleAuthNavigation)
window.addEventListener('pageshow', handleAuthNavigation)
