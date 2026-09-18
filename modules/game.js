/* ═══════════════════════════════════════════════════
   modules/game.js — Board, AI, match sync.
═══════════════════════════════════════════════════ */

import { getState, setState, gameState, clearActiveMatchId } from './state.js';
import { getCurrentUsername, normalizeUsername, formatUsername, parseMatchMoves, getOpponentNameFromMatch } from './helpers.js';
import { showModal, hideModal, closeSidebar, hideInviteModal } from './ui.js';
import {
  dashboardScreen, gameScreen, cells, statusText, turnDot,
  playerXEl, playerOEl, scoreXEl, scoreOEl, opponentNameEl,
  closeModalButton, modalHomeButton, selectedBanner,
} from './dom.js';
import { submitMatchMove } from './api.js';

// ── Stats ─────────────────────────────────────────────────────
export function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem('xo_stats') || '{}');
    gameState.stats.wins   = s.wins   || 0;
    gameState.stats.draws  = s.draws  || 0;
    gameState.stats.losses = s.losses || 0;
  } catch { gameState.stats = { wins: 0, draws: 0, losses: 0 }; }
}
export function saveStats() {
  localStorage.setItem('xo_stats', JSON.stringify(gameState.stats));
}

export function renderSidebarStats() {
  const wins   = gameState.stats.wins;
  const draws  = gameState.stats.draws;
  const losses = gameState.stats.losses;
  const total  = Math.max(wins + draws + losses, 1);
  const winPct = Math.round((wins / total) * 100);

  document.getElementById('sideWins')   && (document.getElementById('sideWins').textContent   = String(wins));
  document.getElementById('sideDraws')  && (document.getElementById('sideDraws').textContent  = String(draws));
  document.getElementById('sideLosses') && (document.getElementById('sideLosses').textContent = String(losses));
  document.querySelector('.ring-fill')  ?.setAttribute('stroke-dasharray', `${winPct} 100`);
  document.querySelector('.ring-pct')   && (document.querySelector('.ring-pct').textContent    = `${winPct}%`);
  document.querySelector('.winrate-sub') && (document.querySelector('.winrate-sub').textContent = `${wins + draws + losses} total games`);
}

// ── Active match helpers ──────────────────────────────────────
export function getActiveMatch() {
  const me = normalizeUsername(getCurrentUsername());
  const id = getState('activeMatchId');
  if (id) {
    const found = getState('liveMatches').find(m => Number(m.id) === Number(id));
    if (found) return found;
  }
  return getState('liveMatches').find(m =>
    m?.status === 'active' &&
    [normalizeUsername(m.player_x_username), normalizeUsername(m.player_o_username)].includes(me)
  ) || null;
}

export function getMyRole(match = getActiveMatch()) {
  const me = normalizeUsername(getCurrentUsername());
  if (!match) return 'X';
  return normalizeUsername(match.player_x_username) === me ? 'X' : 'O';
}

// ── Board rendering ───────────────────────────────────────────
export function renderBoard() {
  const match    = getActiveMatch();
  const myRole   = getMyRole(match);
  const isMyTurn = gameState.currentPlayer === myRole;

  cells.forEach((cell, i) => {
    const val  = gameState.board[i];
    cell.textContent = val || '';
    cell.disabled = !gameState.running || Boolean(val) || (match ? !isMyTurn : false);
    cell.classList.remove('x-cell', 'o-cell', 'winner');
    if (val === 'X') cell.classList.add('x-cell');
    if (val === 'O') cell.classList.add('o-cell');
  });
}

export function setTurnUI() {
  const match     = getActiveMatch();
  const myRole    = getMyRole(match);
  const isMyTurn  = gameState.currentPlayer === myRole;
  const me        = formatUsername(getCurrentUsername());
  const oppLabel  = match
    ? (myRole === 'X' ? formatUsername(match.player_o_username) : formatUsername(match.player_x_username))
    : 'Opponent';

  const xNameEl = playerXEl?.querySelector('.vs-name');
  const oNameEl = playerOEl?.querySelector('.vs-name');
  if (xNameEl) xNameEl.textContent = myRole === 'X' ? me : oppLabel;
  if (oNameEl) oNameEl.textContent = myRole === 'O' ? me : oppLabel;

  playerXEl?.classList.toggle('active-player', gameState.currentPlayer === 'X');
  playerOEl?.classList.toggle('active-player', gameState.currentPlayer !== 'X');
  if (turnDot) turnDot.className = 'turn-dot ' + (gameState.currentPlayer === 'X' ? 'x-dot' : 'o-dot');

  if (statusText) {
    if (match) {
      statusText.textContent = isMyTurn ? `Your turn — ${myRole}` : `Opponent's turn — ${gameState.currentPlayer}`;
    } else {
      statusText.textContent = gameState.currentPlayer === 'X'
        ? 'Your turn — X'
        : (gameState.vsAI ? 'AI is thinking…' : "Opponent's turn — O");
    }
  }
}

export function resetGame() {
  gameState.board         = Array(9).fill(null);
  gameState.currentPlayer = 'X';
  gameState.running       = true;
  gameState.moveInProgress = false;
}

export function startNewGame() {
  resetGame();
  renderBoard();
  setTurnUI();
}

export function updateScoreUI() {
  if (scoreXEl) scoreXEl.textContent = gameState.scores.X;
  if (scoreOEl) scoreOEl.textContent = gameState.scores.O;
}

// ── Win detection ─────────────────────────────────────────────
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export function checkWinner() {
  for (const [a,b,c] of LINES) {
    if (gameState.board[a] && gameState.board[a] === gameState.board[b] && gameState.board[a] === gameState.board[c])
      return { player: gameState.board[a], line: [a,b,c] };
  }
  return null;
}
export function isDraw() { return gameState.board.every(Boolean); }
export function highlightWinners(line) { line.forEach(i => cells[i].classList.add('winner')); }

// ── Local move ────────────────────────────────────────────────
export async function playLocalMove(index) {
  if (gameState.moveInProgress || !gameState.running || gameState.board[index]) return;
  if (getActiveMatch()) return;

  gameState.board[index] = gameState.currentPlayer;
  renderBoard();

  const result = checkWinner();
  if (result) {
    gameState.running = false;
    highlightWinners(result.line);
    gameState.scores[result.player]++;
    if (result.player === 'X') gameState.stats.wins++; else gameState.stats.losses++;
    saveStats(); renderSidebarStats(); updateScoreUI();
    setTimeout(() => showModal(
      result.player === 'X' ? '🏆' : (gameState.vsAI ? '🤖' : '🥇'),
      result.player === 'X' ? 'You Win!' : (gameState.vsAI ? 'AI Wins!' : 'Player O Wins!'),
      result.player === 'X' ? 'Outstanding move!' : 'Better luck next round!',
      result.player === 'X' ? `+₿ ${getState('betAmount')}` : `−₿ ${getState('betAmount')}`
    ), 400);
    return;
  }

  if (isDraw()) {
    gameState.running = false;
    gameState.stats.draws++;
    saveStats(); renderSidebarStats();
    setTimeout(() => showModal('🤝', "It's a Draw!", 'Neck and neck — try again?', '±₿ 0'), 400);
    return;
  }

  gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
  setTurnUI();
  if (gameState.vsAI && gameState.currentPlayer === 'O' && gameState.running) {
    cells.forEach(c => { c.disabled = true; });
    setTimeout(doAIMove, 700);
  }
}

export async function playMove(index) {
  const match  = getActiveMatch();
  const myRole = getMyRole(match);
  if (match && gameState.currentPlayer !== myRole) return;

  if (match) {
    gameState.moveInProgress = true;
    try { await submitMatchMove(match.id, { playerUsername: getCurrentUsername(), index }); }
    catch (err) { console.error('Could not submit live move', err); }
    finally { gameState.moveInProgress = false; }
    return;
  }
  await playLocalMove(index);
}

// ── AI (minimax) ──────────────────────────────────────────────
export function doAIMove() { playLocalMove(minimax(gameState.board, 'O').index); }

function checkWinnerOnBoard(board) {
  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function minimax(board, player) {
  const result = checkWinnerOnBoard(board);
  if (result === 'O') return { score: 10 };
  if (result === 'X') return { score: -10 };
  const empty = board.map((v,i) => v ? null : i).filter(v => v !== null);
  if (!empty.length) return { score: 0 };
  const moves = empty.map(i => {
    board[i] = player;
    const score = minimax(board, player === 'O' ? 'X' : 'O').score;
    board[i] = null;
    return { index: i, score };
  });
  return player === 'O'
    ? moves.reduce((a,b) => b.score > a.score ? b : a)
    : moves.reduce((a,b) => b.score < a.score ? b : a);
}

// ── Live match sync ───────────────────────────────────────────
export function syncBoardFromMatch(match) {
  if (!match) { resetGame(); renderBoard(); setTurnUI(); return; }

  const moves = parseMatchMoves(match);
  gameState.board = Array(9).fill(null);
  moves.forEach(m => {
    if (Number.isInteger(m.index) && m.index >= 0 && m.index < 9) gameState.board[m.index] = m.player;
  });
  gameState.currentPlayer = moves.length % 2 === 0 ? 'X' : 'O';
  gameState.running       = match.status !== 'finished';
  renderBoard(); setTurnUI(); updateScoreUI();

  if (match.status === 'finished') {
    clearActiveMatchId();
    setState('rematchOpponentName', getOpponentNameFromMatch(match));
    setState('rematchInProgress', false);
    showResultModalForMatch(match);
  }
}

// ── Screen transitions ────────────────────────────────────────
export function showGameScreen(vsAI = false, opponentName = 'Opponent') {
  gameState.vsAI = vsAI;
  const opp     = vsAI ? 'AI Bot' : formatUsername(opponentName || 'Opponent');
  const me      = formatUsername(getCurrentUsername());
  const myRole  = getMyRole(getActiveMatch());

  const xNameEl = playerXEl?.querySelector('.vs-name');
  const oNameEl = playerOEl?.querySelector('.vs-name');
  if (xNameEl) xNameEl.textContent = myRole === 'X' ? me : opp;
  if (oNameEl) oNameEl.textContent = myRole === 'O' ? me : opp;
  if (opponentNameEl) opponentNameEl.textContent = opp;

  dashboardScreen?.classList.add('hidden');
  gameScreen?.classList.remove('hidden');
  document.body.classList.add('game-active');
  document.body.style.overflow = 'hidden';
  closeSidebar();
  startNewGame();
}

export function showDashboard() {
  gameScreen?.classList.add('hidden');
  dashboardScreen?.classList.remove('hidden');
  document.body.classList.remove('game-active');
  document.body.style.overflow = '';
  setState('selectedPlayer', null);
  setState('currentUserProfile', null);
  selectedBanner?.classList.add('hidden');
  clearActiveMatchId();
  setState('matchViewOpen', false);
  hideModal();
  hideInviteModal();
}

export function showResultModalForMatch(match) {
  if (!match) return;
  const me    = normalizeUsername(getCurrentUsername());
  const isWin = normalizeUsername(match.winner_username) === me;
  if (match.result === 'draw') { showModal('🤝', 'Draw', 'No winner this round', '±₿ 0'); return; }
  showModal(
    isWin ? '🏆' : '🥇',
    isWin ? 'You Win' : 'You Lose',
    isWin ? 'Outstanding move!' : 'Better luck next round!',
    isWin ? `+₿ ${getState('betAmount') || 0}` : `−₿ ${getState('betAmount') || 0}`
  );
}
