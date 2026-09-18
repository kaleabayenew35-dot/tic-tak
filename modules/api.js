/* ═══════════════════════════════════════════════════
   modules/api.js — All HTTP calls to xo-backend.
═══════════════════════════════════════════════════ */

const _fallback = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : 'https://xo-backend-lzj0.onrender.com';

export const API_URL = (window.__XO_BACKEND_URL__ || _fallback).replace(/\/$/, '');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.error || `Request failed: ${response.status}`);
    err.status = response.status;
    err.code   = data?.code || null;
    throw err;
  }
  return data;
}

export const fetchStatus    = () => fetchJson(`${API_URL}/api/status`,    { cache: 'no-store' });
export const fetchAiConfig  = () => fetchJson(`${API_URL}/api/ai/config`, { cache: 'no-store' });
export const fetchPlayers   = () => fetchJson(`${API_URL}/api/players`);

export const fetchLiveChallenges = () => fetchJson(`${API_URL}/api/live/challenges`);
export const fetchLiveMatches    = () => fetchJson(`${API_URL}/api/live/matches`);
export const fetchMatchById      = (id) => fetchJson(`${API_URL}/api/live/matches/${id}`);

export const registerOnline = (payload) => fetchJson(`${API_URL}/api/players/online`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const saveSelectedBet = (payload) => fetchJson(`${API_URL}/api/players/bet`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const cancelBet = (payload) => fetchJson(`${API_URL}/api/players/bet/cancel`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const createLiveChallenge = (payload) => fetchJson(`${API_URL}/api/live/challenges`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const acceptLiveChallenge  = (id) => fetchJson(`${API_URL}/api/live/challenges/${id}/accept`,  { method: 'POST' });
export const declineLiveChallenge = (id) => fetchJson(`${API_URL}/api/live/challenges/${id}/decline`, { method: 'POST' });

export const submitMatchMove = (matchId, payload) => fetchJson(`${API_URL}/api/live/matches/${matchId}/move`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const forfeitMatch = (matchId, payload) => fetchJson(`${API_URL}/api/live/matches/${matchId}/forfeit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});

export const setPlayerOffline = (payload) => fetchJson(`${API_URL}/api/players/offline`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
