/* ═══════════════════════════════════════════════════
   modules/helpers.js — Pure utility functions.
═══════════════════════════════════════════════════ */

import { getState } from './state.js';

export function formatBalance(value) {
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

export function formatUsername(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('@') ? raw : `@${raw}`;
}

export function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

export function getCurrentUserProfile() {
  const st = getState('currentUserProfile');
  if (st) return st;

  const raw      = window.XO_USERNAME || window.tgUserName || 'player';
  const balance  = Number.isFinite(Number(window.XO_BALANCE)) ? Number(window.XO_BALANCE) : null;

  const profile = {
    username: formatUsername(raw),
    initials: String(raw).replace(/^@/, '').slice(0, 2).toUpperCase() || 'X',
    colorClass: 'me',
    status: 'online',
    balance,
  };

  // cache it
  import('./state.js').then(m => m.setState('currentUserProfile', profile)).catch(() => {});
  return profile;
}

export function getCurrentUsername() {
  return formatUsername(getCurrentUserProfile().username);
}

export function applyAuthData(data) {
  if (!data) return;
  const nameEl    = document.querySelector('.topbar-name');
  const balEl     = document.querySelector('.topbar-balance');
  const avatarEl  = document.querySelector('.avatar');
  if (nameEl)   nameEl.textContent   = formatUsername(data.username || 'player');
  if (balEl)    balEl.textContent    = '💰 ' + formatBalance(data.balance) + ' ETB';
  if (avatarEl) avatarEl.textContent = String(data.username || 'X').replace(/^@/, '').charAt(0).toUpperCase();
}

export function parseMatchMoves(match) {
  if (!match) return [];
  try {
    return typeof match.moves === 'string' && match.moves ? JSON.parse(match.moves) : (match.moves || []);
  } catch { return []; }
}

export function getOpponentNameFromMatch(match) {
  if (!match) return 'Opponent';
  const me = normalizeUsername(getCurrentUsername());
  return normalizeUsername(match.player_x_username) === me
    ? match.player_o_username
    : match.player_x_username;
}
