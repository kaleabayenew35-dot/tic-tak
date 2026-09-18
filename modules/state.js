/* ═══════════════════════════════════════════════════
   modules/state.js — Single source of truth.
   Mirrors dama_frontend/modules/state.js pattern:
   getState/setState with one-way window bridge.
═══════════════════════════════════════════════════ */

const _state = {
  // ── Identity ───────────────────────────────────────
  tgUserId:    null,
  tgUserName:  null,
  tgUserPhoto: null,

  // ── Auth ───────────────────────────────────────────
  xoApiToken:  null,
  xoUsername:  null,
  xoBalance:   null,

  // ── App ────────────────────────────────────────────
  appInitialized: false,
  aiEnabled:      false,

  // ── Bet / players ──────────────────────────────────
  betAmount:      0,
  selectedPlayer: null,
  onlinePlayers:  [],
  liveChallenges: [],
  liveMatches:    [],
  pendingInvite:  null,
  livePollingTimer: null,
  activeMatchId:  null,
  liveStream:     null,

  // ── Rematch ────────────────────────────────────────
  rematchOpponentName: null,
  rematchInProgress:   false,
  matchViewOpen:       false,

  // ── Computed profile cache ─────────────────────────
  currentUserProfile: null,
};

export function getState(key)        { return _state[key]; }
export function setState(key, value) { _state[key] = value; _WINDOW_BRIDGE[key]?.(value); }
export function getAll()             { return { ..._state }; }

const _WINDOW_BRIDGE = {
  tgUserId:   v => { window.tgUserId    = v; },
  tgUserName: v => { window.tgUserName  = v; },
  xoApiToken: v => { window.XO_API_TOKEN = v; },
  xoUsername: v => { window.XO_USERNAME  = v; },
  xoBalance:  v => { window.XO_BALANCE   = v; },
  betAmount:  v => { window.xoBetAmount  = v; },
};

export function syncFromWindow() {
  if (window.tgUserId   != null) _state.tgUserId   = window.tgUserId;
  if (window.tgUserName != null) _state.tgUserName  = window.tgUserName;
  if (window.XO_API_TOKEN != null) _state.xoApiToken = window.XO_API_TOKEN;
  if (window.XO_USERNAME  != null) _state.xoUsername  = window.XO_USERNAME;
  if (window.XO_BALANCE   != null) _state.xoBalance   = window.XO_BALANCE;
}

// ── Live match id helpers ─────────────────────────────────────
export function setActiveMatchId(id) {
  _state.activeMatchId = id == null ? null : Number(id);
  try {
    if (_state.activeMatchId) localStorage.setItem('xo_activeMatchId', String(_state.activeMatchId));
    else localStorage.removeItem('xo_activeMatchId');
  } catch {}
}

export function clearActiveMatchId() {
  _state.activeMatchId = null;
  try { localStorage.removeItem('xo_activeMatchId'); } catch {}
}

// ── Game state (board) ────────────────────────────────────────
export const gameState = {
  board:          Array(9).fill(null),
  currentPlayer:  'X',
  running:        false,
  vsAI:           false,
  scores:         { X: 0, O: 0 },
  moveInProgress: false,
  stats:          { wins: 0, draws: 0, losses: 0 },
};
