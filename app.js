/* ═══════════════════════════════════════════════════
   app.js — Main entry point.
   Mirrors dama_frontend/app.js bootstrap pattern:
   top-level await on initUrlAuth(), then full init.
═══════════════════════════════════════════════════ */

import { initUrlAuth, updateBalanceDisplay, refreshBalance } from './modules/urlAuth.js';
import { syncFromWindow, getState, setState }                from './modules/state.js';
import { initTelegram, populateTelegramUser, tgHaptic, initBackButton } from './modules/telegram.js';
import { initErrorBoundary }    from './modules/errorBoundary.js';
import { initConnectionMonitor } from './modules/connection.js';
import { initAutoLogout }        from './modules/autoLogout.js';
import { fetchAiConfig, API_URL } from './modules/api.js';
import { applyAuthData, getCurrentUsername, normalizeUsername, getOpponentNameFromMatch as _getOppName } from './modules/helpers.js';
import {
  showLoadingOverlay, hideLoadingOverlay,
  showConnectionBanner, hideConnectionBanner, updateConnectionStatus,
  renderPlayers, updateOnlineCount, showInviteModal, hideInviteModal,
  showModal, hideModal, openSidebar, closeSidebar,
} from './modules/ui.js';
import {
  loadStats, renderSidebarStats, showGameScreen, showDashboard,
  startNewGame, syncBoardFromMatch, playMove,
} from './modules/game.js';
import {
  registerOnlineUser, loadPlayers, loadLiveChallenges,
  loadMatchById, startLivePolling, stopLivePolling,
  createLiveChallenge, acceptChallenge, declineLiveChallenge,
  cancelSelection, forfeitActiveMatch,
} from './modules/live.js';
import { saveSelectedBet } from './modules/api.js';
import {
  backButton, resetButton, cells,
  closeModalButton, modalHomeButton,
  inviteAcceptButton, inviteDeclineButton,
  betChips, sbCancelBtn, sidebarToggle, sidebarClose, sidebarOverlay,
  playAiSidebar, connectionRetryButton,
  selectedBanner, sbAvatar, sbUsername, sbStatusTxt, sbBetTag,
  betDisplay, betSelectedTag,
} from './modules/dom.js';

// ── 0. URL Auth gate — must run before anything else ──────────
const urlAuth = await initUrlAuth();
syncFromWindow();

// ── 1. Core init ──────────────────────────────────────────────
initTelegram();
initErrorBoundary();
initConnectionMonitor();
initAutoLogout();

// ── 2. AI config ──────────────────────────────────────────────
let aiEnabled = false;
try {
  const res  = await fetchAiConfig();
  const cfg  = res?.data ?? res;
  aiEnabled  = Boolean(cfg?.ai_enabled);
} catch { aiEnabled = false; }
setState('aiEnabled', aiEnabled);
if (!aiEnabled) document.querySelector('.ai-btn')?.remove();

// ── 3. Bet display ────────────────────────────────────────────
function updateBetDisplay() {
  const amt = getState('betAmount');
  if (!betDisplay) return;
  const valEl = betDisplay.querySelector('.bet-balance-value');

  if (!amt) {
    if (valEl) valEl.textContent = 'Pick amount';
    betDisplay.classList.add('unselected');
    betSelectedTag?.classList.add('hidden');
    setState('selectedPlayer', null);
    setState('currentUserProfile', null);
    renderPlayers({ onSelectPlayer, onCancelSelection });
    return;
  }

  if (valEl) valEl.textContent = '₿ ' + amt;
  betDisplay.classList.remove('unselected');
  betDisplay.style.transform = 'scale(1.12)';
  setTimeout(() => { betDisplay.style.transform = ''; }, 180);
  if (betSelectedTag) { betSelectedTag.classList.remove('hidden'); betSelectedTag.textContent = '₿ ' + amt; }

  saveSelectedBet({ username: getCurrentUsername().replace(/^@/, '').trim(), selectedBetAmount: amt }).catch(() => {});
  loadPlayers({ onSelectPlayer, onCancelSelection });
}

// ── 4. Player selection ───────────────────────────────────────
async function onSelectPlayer(id) {
  const player = getState('onlinePlayers').find(p => Number(p.id) === Number(id));
  if (!player) return;
  setState('selectedPlayer', Number(id));
  if (sbAvatar)    sbAvatar.textContent = (player.username || 'P').replace(/^@/, '').slice(0, 2).toUpperCase();
  if (sbAvatar)    sbAvatar.className   = 'sb-avatar ' + ['p1','p2','p3','p4'][Number(player.id) % 4];
  const fmtOpp = '@' + (player.username || 'player').replace(/^@/, '');
  if (sbUsername)  sbUsername.textContent  = fmtOpp;
  if (sbBetTag)    sbBetTag.textContent    = '₿ ' + getState('betAmount');
  if (sbStatusTxt) sbStatusTxt.textContent = `Waiting for ${fmtOpp} to accept…`;
  selectedBanner?.classList.remove('hidden');
  renderPlayers({ onSelectPlayer, onCancelSelection });

  const result = await createLiveChallenge(fmtOpp);
  if (!result && sbStatusTxt) sbStatusTxt.textContent = 'Failed to send challenge. Try again.';
}

async function onCancelSelection() {
  await cancelSelection();
  setState('betAmount', 0);
  updateBetDisplay();
  if (sbStatusTxt) sbStatusTxt.textContent = 'Ready to play ✓';
  selectedBanner?.classList.add('hidden');
}

// ── 5. Event handlers ─────────────────────────────────────────
function bindListeners() {
  window.addEventListener('online',  () => { hideConnectionBanner(); attemptReconnect(); });
  window.addEventListener('offline', updateConnectionStatus);
  connectionRetryButton?.addEventListener('click', attemptReconnect);

  sbCancelBtn?.addEventListener('click', onCancelSelection);

  betChips?.addEventListener('click', async (e) => {
    const chip = e.target.closest('.bet-chip');
    if (!chip) return;
    betChips.querySelectorAll('.bet-chip').forEach(b => b.classList.remove('active'));
    chip.classList.add('active');
    setState('betAmount', Number(chip.dataset.amount));
    await updateBetDisplay();
  });

  sidebarToggle?.addEventListener('click', openSidebar);
  sidebarClose?.addEventListener('click',  closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);

  playAiSidebar?.addEventListener('click', () => {
    if (!getState('aiEnabled')) return;
    showGameScreen(true);
  });

  backButton?.addEventListener('click', async () => {
    await forfeitActiveMatch();
    showDashboard();
  });

  resetButton?.addEventListener('click', () => { hideModal(); startNewGame(); });

  cells?.forEach(cell => {
    cell.addEventListener('click', () => playMove(Number(cell.dataset.index)));
  });

  closeModalButton?.addEventListener('click', async () => {
    const rematchOpp = getState('rematchOpponentName');
    const rematchInProgress = getState('rematchInProgress');
    if (rematchOpp && !rematchInProgress) { await startPlayAgain(); return; }
    hideModal(); startNewGame();
  });

  modalHomeButton?.addEventListener('click', () => {
    setState('rematchOpponentName', null);
    setState('rematchInProgress', false);
    hideModal();
    showDashboard();
  });

  inviteAcceptButton?.addEventListener('click', async () => {
    const invite = getState('pendingInvite');
    if (!invite) return;
    const response = await acceptChallenge(invite.id);
    if (response?.match) {
      hideInviteModal();
      const matches = getState('liveMatches').filter(m => m.id !== response.match.id);
      matches.push(response.match);
      setState('liveMatches', matches);
      showGameScreen(false, _getOppName(response.match));
      syncBoardFromMatch(response.match);
      await loadLiveChallenges();
    }
  });

  inviteDeclineButton?.addEventListener('click', async () => {
    const invite = getState('pendingInvite');
    if (!invite) return;
    const id = invite.id;
    hideInviteModal();
    await declineLiveChallenge(id);
  });

  window.addEventListener('beforeunload', () => {
    stopLivePolling();
    const uname = getCurrentUsername().replace(/^@/, '').trim();
    if (uname) {
      navigator.sendBeacon(`${API_URL}/api/players/offline`,
        new Blob([JSON.stringify({ username: uname })], { type: 'application/json' }));
      try {
        const activeId = localStorage.getItem('xo_activeMatchId');
        if (activeId) {
          navigator.sendBeacon(`${API_URL}/api/live/matches/${activeId}/forfeit`,
            new Blob([JSON.stringify({ username: getCurrentUsername() })], { type: 'application/json' }));
        }
      } catch {}
    }
  });

  // History modal
  document.getElementById('historyBtn')?.addEventListener('click', () => {
    const m = document.getElementById('historyModal');
    if (m) { m.classList.remove('hidden'); setTimeout(() => m.classList.add('modal-show'), 10); }
    loadHistory();
  });
  document.getElementById('historyClose')?.addEventListener('click', () => {
    const m = document.getElementById('historyModal');
    if (m) { m.classList.remove('modal-show'); setTimeout(() => m.classList.add('hidden'), 300); }
  });
  document.getElementById('historyModal')?.addEventListener('click', e => {
    if (e.target.id === 'historyModal') {
      const m = document.getElementById('historyModal');
      m.classList.remove('modal-show'); setTimeout(() => m.classList.add('hidden'), 300);
    }
  });

  // Balance refresh
  document.getElementById('balRefreshBtn')?.addEventListener('click', async () => {
    tgHaptic('light');
    await refreshBalance(false);
  });
}

// ── 6. Reconnect ──────────────────────────────────────────────
async function attemptReconnect() {
  showLoadingOverlay('Retrying connection…');
  try {
    await fetch(`${API_URL}/api/status`, { cache: 'no-store' });
    hideConnectionBanner();
    await loadPlayers({ onSelectPlayer, onCancelSelection });
    await loadLiveChallenges();
  } catch (err) {
    console.warn('Reconnect failed', err);
    showConnectionBanner('Retry failed. Still offline or unreachable.');
  } finally {
    hideLoadingOverlay();
  }
}

// ── 7. Rematch ────────────────────────────────────────────────
async function startPlayAgain() {
  const opp = getState('rematchOpponentName');
  if (!opp) { hideModal(); startNewGame(); return; }
  setState('rematchInProgress', true);
  if (sbStatusTxt) sbStatusTxt.textContent = 'Waiting for opponent to accept…';
  selectedBanner?.classList.remove('hidden');
  if (sbAvatar)   sbAvatar.textContent    = opp.replace(/^@/, '').slice(0, 2).toUpperCase();
  if (sbAvatar)   sbAvatar.className      = 'sb-avatar p2';
  if (sbUsername) sbUsername.textContent  = '@' + opp.replace(/^@/, '');
  if (sbBetTag)   sbBetTag.textContent    = '₿ ' + getState('betAmount');
  hideModal();
  await createLiveChallenge(opp);
}

// ── 8. History ────────────────────────────────────────────────
async function loadHistory() {
  const body = document.getElementById('historyBody');
  if (!body) return;
  body.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.5)">Loading…</div>';
  try {
    const res   = await fetch(`${API_URL}/api/players/${encodeURIComponent(getCurrentUsername().replace(/^@/, ''))}/history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json  = await res.json();
    const games = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
    if (!games.length) {
      body.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.5)">No games played yet.</div>';
      return;
    }
    body.innerHTML = '';
    games.forEach(g => {
      const won   = g.winner_username === getCurrentUsername().replace(/^@/, '');
      const draw  = g.result === 'draw';
      const badge = draw ? 'DRAW' : won ? 'WIN' : 'LOSS';
      const div   = document.createElement('div');
      div.className = 'hist-item';
      div.innerHTML = `
        <div class="hist-result-badge ${draw?'draw':won?'win':'loss'}">${badge}</div>
        <div class="hist-info">
          <div class="hist-matchup">${g.player_x_username} <span class="hist-vs">vs</span> ${g.player_o_username}</div>
          <div class="hist-meta">${g.created_at ? new Date(g.created_at).toLocaleString() : ''}</div>
        </div>`;
      body.appendChild(div);
    });
  } catch {
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#e74c3c">Failed to load history.</div>';
  }
}

// ── 9. Boot loader animation ──────────────────────────────────
function initLoader(onReady, authReady) {
  const loader = document.getElementById('loader');
  if (!loader) { onReady(); return; }

  const MIN_DISPLAY = 1200;
  const start = Date.now();

  Promise.resolve(authReady).then(() => {
    const elapsed = Date.now() - start;
    const wait    = Math.max(0, MIN_DISPLAY - elapsed);
    setTimeout(() => {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity .4s ease';
      setTimeout(() => { loader.style.display = 'none'; onReady(); }, 400);
    }, wait);
  }).catch(() => {
    // Auth failed — loader hides; error overlay takes over
    setTimeout(() => { loader.style.display = 'none'; }, 600);
  });
}

// ── 10. Main bootstrap ────────────────────────────────────────
initLoader(() => {
  populateTelegramUser(() => {
    syncFromWindow();
    loadStats();
    renderSidebarStats();
    bindListeners();
    updateConnectionStatus();
    registerOnlineUser();

    // Show the dashboard — it starts hidden and nothing else reveals it on first load
    const dash = document.getElementById('dashboardScreen');
    if (dash) dash.classList.remove('hidden');

    showLoadingOverlay('Loading app…');
    startLivePolling({
      onChallengeReceived: c  => showInviteModal(c),
      onChallengeSent:     c  => {
        if (sbStatusTxt) sbStatusTxt.textContent = `Challenge sent ✓ — waiting for @${(c.opponent_username||'').replace(/^@/,'')} to accept…`;
        showInviteModal(c, { sentByMe: true });
      },
      onChallengeDeclined: () => {
        setState('selectedPlayer', null);
        selectedBanner?.classList.add('hidden');
        if (sbStatusTxt) sbStatusTxt.textContent = 'Ready to play ✓';
        renderPlayers({ onSelectPlayer, onCancelSelection });
        loadLiveChallenges();
      },
      onChallengeAccepted: async match => {
        hideInviteModal();
        const matches = getState('liveMatches').filter(m => m.id !== match.id);
        matches.push(match);
        setState('liveMatches', matches);
        showGameScreen(false, _getOppName(match));
        syncBoardFromMatch(match);
        await loadLiveChallenges();
      },
      onMoveMade: match => {
        if (getState('activeMatchId') && Number(getState('activeMatchId')) === Number(match.id))
          syncBoardFromMatch(match);
      },
      onMatchFinished: match => {
        if (getState('activeMatchId') && Number(getState('activeMatchId')) === Number(match.id))
          syncBoardFromMatch(match);
      },
      onActiveMatch: async match => {
        setState('activeMatchId', match.id);
        await loadMatchById(match.id, { onMatchLoaded: loaded => {
          showGameScreen(false, _getOppName(loaded));
          syncBoardFromMatch(loaded);
        }});
      },
      onMatchLoaded: syncBoardFromMatch,
    });

    // Restore active match from storage
    try {
      const stored = localStorage.getItem('xo_activeMatchId');
      if (stored) {
        setState('activeMatchId', Number(stored));
        loadMatchById(Number(stored), { onMatchLoaded: m => {
          showGameScreen(false, _getOppName(m));
          syncBoardFromMatch(m);
        }});
      }
    } catch {}

    // Auto-refresh balance every 10s
    setInterval(() => {
      const onDashboard = !document.getElementById('gameScreen') ||
        document.getElementById('gameScreen').classList.contains('hidden');
      if (onDashboard) refreshBalance(true).catch(() => {});
    }, 10000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' &&
          document.getElementById('gameScreen')?.classList.contains('hidden'))
        refreshBalance(true).catch(() => {});
    });

    hideLoadingOverlay();
  });
}, window.XO_AUTH_READY || Promise.resolve(true));

// ── 11. Telegram back button ──────────────────────────────────
initBackButton(() => {
  forfeitActiveMatch().then(() => showDashboard());
});
