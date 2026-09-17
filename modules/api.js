const fallbackBackendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://xo-backend-lzj0.onrender.com'

export const API_URL = (window.__XO_BACKEND_URL__ || fallbackBackendUrl).replace(/\/$/, '')

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`)
  }
  return data
}

export function fetchStatus() {
  return fetchJson(`${API_URL}/api/status`, { cache: 'no-store' })
}

export function registerOnline(payload) {
  return fetchJson(`${API_URL}/api/players/online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function saveSelectedBet(payload) {
  return fetchJson(`${API_URL}/api/players/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function cancelBet(payload) {
  return fetchJson(`${API_URL}/api/players/bet/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchPlayers() {
  return fetchJson(`${API_URL}/api/players`)
}

export function fetchLiveChallenges() {
  return fetchJson(`${API_URL}/api/live/challenges`)
}

export function fetchLiveMatches() {
  return fetchJson(`${API_URL}/api/live/matches`)
}

export function fetchMatchById(matchId) {
  return fetchJson(`${API_URL}/api/live/matches/${matchId}`)
}

export function createLiveChallenge(payload) {
  return fetchJson(`${API_URL}/api/live/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function acceptLiveChallenge(id) {
  return fetchJson(`${API_URL}/api/live/challenges/${id}/accept`, {
    method: 'POST',
  })
}

export function declineLiveChallenge(id) {
  return fetchJson(`${API_URL}/api/live/challenges/${id}/decline`, {
    method: 'POST',
  })
}

export function submitMatchMove(matchId, payload) {
  return fetchJson(`${API_URL}/api/live/matches/${matchId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function setPlayerOffline(payload) {
  return fetchJson(`${API_URL}/api/players/offline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function forfeitMatch(matchId, payload) {
  return fetchJson(`${API_URL}/api/live/matches/${matchId}/forfeit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
