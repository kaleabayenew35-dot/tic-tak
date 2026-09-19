/* ═══════════════════════════════════════════════════
   modules/live.js — SSE + polling for real-time play.
═══════════════════════════════════════════════════ */

import {
  fetchPlayers, fetchLiveChallenges, fetchLiveMatches,
  fetchMatchById, createLiveChallenge as apiCreateChallenge,
  acceptLiveChallenge as apiAcceptChallenge,
  declineLiveChallenge as apiDeclineChallenge,
  cancelBet as apiCancelBet, registerOnline,
  forfeitMatch as apiForfeitMatch,
} from './api.js';
import { API_URL } from './api.js';
import { getState, setState, setActiveMatchId, clearActiveMatchId } from './state.js';
import { getCurrentUsername, normalizeUsername } from './helpers.js';
import {
  showLoadingOverlay, hideLoadingOverlay,
  showConnectionBanner, hideConnectionBanner, updateConnectionStatus,
  updateOnlineCount, renderPlayers, showInviteModal, hideInviteModal,
} from './ui.js';

// ── Register user as online ────────────────────────────────────
export async function registerOnlineUser() {
  const username = getCurrentUsername().replace(/^@/, '').trim();
  if (!username) return;
  try {
    await registerOnline({ username, balance: Number(window.XO_BALANCE ?? 0) });
  } catch (err) {
    console.error('Could not register as online', err);
  }
}

// ── Load players ──────────────────────────────────────────────
export async function loadPlayers(callbacks = {}) {
  const betAmount = getState('betAmount');
  try {
    // Always fetch all online players for the count display
    const allData = await fetchPlayers();
    setState('allOnlinePlayers',
      Array.isArray(allData) ? allData.filter(p => (p.status || 'online') !== 'offline') : []
    );

    // When a bet is selected, fetch only players with that bet (server-filtered)
    let betPlayers = [];
    if (betAmount && Number(betAmount) > 0) {
      const betData = await fetchPlayers(betAmount);
      betPlayers = Array.isArray(betData) ? betData.filter(p => (p.status || 'online') !== 'offline') : [];
    }

    setState('onlinePlayers', betAmount ? betPlayers : []);
    renderPlayers({ onSelectPlayer: callbacks.onSelectPlayer, onCancelSelection: callbacks.onCancelSelection });
    updateOnlineCount();
  } catch (err) {
    console.error('Failed to load players', err);
    setState('onlinePlayers', []);
    renderPlayers({ onSelectPlayer: callbacks.onSelectPlayer, onCancelSelection: callbacks.onCancelSelection });
    updateOnlineCount();
    navigator.onLine ? showConnectionBanner('Unable to load players. Retry?') : updateConnectionStatus();
  }
}

// ── Load challenges ───────────────────────────────────────────
export async function loadLiveChallenges() {
  try {
    const data = await fetchLiveChallenges();
    setState('liveChallenges', Array.isArray(data) ? data : []);
    const myUsername = normalizeUsername(getCurrentUsername());
    const incoming   = getState('liveChallenges').find(c =>
      c.status === 'pending' && normalizeUsername(c.opponent_username) === myUsername
    );
    if (incoming) {
      showInviteModal(incoming);
    } else if (getState('pendingInvite') &&
      !getState('liveChallenges').some(c => c.id === getState('pendingInvite').id && c.status === 'pending')) {
      hideInviteModal();
    }
  } catch (err) {
    console.error('Failed to load live challenges', err);
  }
}

// ── Load live matches ─────────────────────────────────────────
export async function loadLiveMatches(callbacks = {}) {
  try {
    const data = await fetchLiveMatches();
    setState('liveMatches', Array.isArray(data) ? data : []);
    const me = normalizeUsername(getCurrentUsername());
    const active = getState('liveMatches').find(m =>
      m?.status === 'active' &&
      [normalizeUsername(m.player_x_username), normalizeUsername(m.player_o_username)].includes(me)
    );
    if (active && !getState('activeMatchId')) callbacks.onActiveMatch?.(active);
  } catch (err) {
    console.error('Failed to load live matches', err);
  }
}

// ── Load single match ─────────────────────────────────────────
export async function loadMatchById(matchId, callbacks = {}) {
  try {
    const data = await fetchMatchById(matchId);
    if (data?.id) {
      const matches = getState('liveMatches');
      const updated = matches.map(m => m.id === data.id ? data : m);
      if (!updated.some(m => m.id === data.id)) updated.push(data);
      setState('liveMatches', updated);
      callbacks.onMatchLoaded?.(data);
      return data;
    }
  } catch (err) {
    console.error('Failed to load match by id', err);
  }
  return null;
}

// ── SSE live stream ───────────────────────────────────────────
export function connectLiveStream(eventHandlers = {}) {
  if (!window.EventSource || !getCurrentUsername()) return;
  const stream = getState('liveStream');
  if (stream) { stream.close(); setState('liveStream', null); }

  const src = new EventSource(`${API_URL}/api/live/stream?username=${encodeURIComponent(getCurrentUsername())}`);
  setState('liveStream', src);

  src.addEventListener('challenge_received', e => {
    const p = JSON.parse(e.data || '{}');
    console.log('[XO] SSE challenge_received', p);
    if (p?.challenge) {
      eventHandlers.onChallengeReceived?.(p.challenge);
      loadLiveChallenges();
    } else {
      console.error('[XO] challenge_received event did not include a challenge', p);
    }
  });
  src.addEventListener('challenge_sent', e => {
    const p = JSON.parse(e.data || '{}');
    if (p?.challenge) eventHandlers.onChallengeSent?.(p.challenge);
  });
  src.addEventListener('challenge_declined', e => {
    const p = JSON.parse(e.data || '{}');
    if (p?.challenge) eventHandlers.onChallengeDeclined?.(p.challenge);
  });
  src.addEventListener('challenge_accepted', e => {
    const p = JSON.parse(e.data || '{}');
    if (p?.match) eventHandlers.onChallengeAccepted?.(p.match);
  });
  src.addEventListener('move_made', e => {
    const p = JSON.parse(e.data || '{}');
    if (p?.match) eventHandlers.onMoveMade?.(p.match);
  });
  src.addEventListener('match_finished', e => {
    const p = JSON.parse(e.data || '{}');
    if (p?.match) eventHandlers.onMatchFinished?.(p.match);
  });
  src.onerror = () => {
    src.close(); setState('liveStream', null);
    eventHandlers.onError?.();
  };
}

export function stopLivePolling() {
  const timer = getState('livePollingTimer');
  if (timer) clearInterval(timer);
  setState('livePollingTimer', null);
  const stream = getState('liveStream');
  if (stream) { stream.close(); setState('liveStream', null); }
}

export function startLivePolling(eventHandlers = {}) {
  stopLivePolling();
  loadPlayers(eventHandlers);
  loadLiveChallenges();
  loadLiveMatches(eventHandlers);
  connectLiveStream(eventHandlers);
  const timer = setInterval(() => {
    loadPlayers(eventHandlers);
    loadLiveChallenges();
    const activeId = getState('activeMatchId');
    if (activeId) loadMatchById(activeId, { onMatchLoaded: eventHandlers.onMatchLoaded });
    else loadLiveMatches(eventHandlers);
  }, 1000);
  setState('livePollingTimer', timer);
}

// ── Challenge helpers ─────────────────────────────────────────
export async function createLiveChallenge(opponentName) {
  const betAmount = Number(getState('betAmount'));
  const challengerUsername = normalizeUsername(getCurrentUsername());
  const opponentUsername = normalizeUsername(opponentName);

  if (!challengerUsername || !opponentUsername) {
    console.error('[XO] Cannot create challenge: missing username', {
      challengerUsername,
      opponentUsername,
    });
    return null;
  }

  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    console.error('[XO] Cannot create challenge: wagerAmount must be a positive number', {
      betAmount,
      rawBetAmount: getState('betAmount'),
    });
    return null;
  }

  const payload = {
    challengerUsername,
    opponentUsername,
    wagerAmount: betAmount,
  };

  try {
    console.log('[XO] POST /api/live/challenges', payload);
    const result = await apiCreateChallenge(payload);
    console.log('[XO] Challenge created; opponent should receive challenge_received', result);
    return result;
  } catch (err) {
    console.error('[XO] Could not create challenge', {
      error: err,
      payload,
      endpoint: `${API_URL}/api/live/challenges`,
    });
    return null;
  }
}

export async function acceptChallenge(id) {
  try { return await apiAcceptChallenge(id); }
  catch (err) { console.error('Could not accept challenge', err); return null; }
}

export async function declineLiveChallenge(id) {
  try { return await apiDeclineChallenge(id); }
  catch (err) { console.error('Could not decline challenge', err); return null; }
}

export async function cancelSelection() {
  try { await apiCancelBet({ username: getCurrentUsername().replace(/^@/, '') }); }
  catch (err) { console.error('Could not cancel bet', err); }
  setState('selectedPlayer', null);
  setState('betAmount', 0);
}

export async function forfeitActiveMatch() {
  const id = getState('activeMatchId');
  if (!id) return;
  try { await apiForfeitMatch(id, { playerUsername: getCurrentUsername() }); }
  catch (err) { console.warn('Could not forfeit match', err); }
}
