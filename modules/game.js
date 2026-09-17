import { appState, gameState, clearActiveMatchId, setActiveMatchId } from './state.js'
import { getCurrentUsername, normalizeUsername, formatUsername, parseMatchMoves, getOpponentNameFromMatch } from './helpers.js'
import { showModal, hideModal, closeSidebar, hideInviteModal } from './ui.js'
import {
  dashboardScreen,
  gameScreen,
  cells,
  statusText,
  turnDot,
  playerXEl,
  playerOEl,
  scoreXEl,
  scoreOEl,
  opponentNameEl,
  closeModalButton,
  modalHomeButton,
  inviteAcceptButton,
  inviteDeclineButton,
  selectedBanner,
  sbAvatar,
  sbUsername,
  sbStatusTxt,
  betDisplay,
  betSelectedTag,
  resultOverlay,
  resultEmoji,
  resultMessage,
  resultSub,
  resultBetAmount,
  resultBetOutcome,
  resultBetRow,
} from './dom.js'
import { submitMatchMove } from './api.js'

export function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem('xo_stats') || '{}')
    gameState.stats.wins = saved.wins || 12
    gameState.stats.draws = saved.draws || 7
    gameState.stats.losses = saved.losses || 3
  } catch {
    gameState.stats = { wins: 12, draws: 7, losses: 3 }
  }
}

export function saveStats() {
  localStorage.setItem('xo_stats', JSON.stringify(gameState.stats))
}

export function renderSidebarStats() {
  const sideWinsEl = document.getElementById('sideWins')
  const sideDrawsEl = document.getElementById('sideDraws')
  const sideLossesEl = document.getElementById('sideLosses')
  const winBarEl = document.querySelector('.win-bar')
  const drawBarEl = document.querySelector('.draw-bar')
  const loseBarEl = document.querySelector('.lose-bar')
  const ringFillEl = document.querySelector('.ring-fill')
  const ringPctEl = document.querySelector('.ring-pct')
  const winrateSubEl = document.querySelector('.winrate-sub')
  const totalGames = Math.max(gameState.stats.wins + gameState.stats.draws + gameState.stats.losses, 1)
  const winPct = Math.round((gameState.stats.wins / totalGames) * 100)
  const drawPct = Math.round((gameState.stats.draws / totalGames) * 100)
  const losePct = Math.round((gameState.stats.losses / totalGames) * 100)

  if (sideWinsEl) sideWinsEl.textContent = String(gameState.stats.wins)
  if (sideDrawsEl) sideDrawsEl.textContent = String(gameState.stats.draws)
  if (sideLossesEl) sideLossesEl.textContent = String(gameState.stats.losses)
  if (winBarEl) winBarEl.style.setProperty('width', `${winPct}%`)
  if (drawBarEl) drawBarEl.style.setProperty('width', `${drawPct}%`)
  if (loseBarEl) loseBarEl.style.setProperty('width', `${losePct}%`)
  if (ringFillEl) ringFillEl.setAttribute('stroke-dasharray', `${winPct} 100`)
  if (ringPctEl) ringPctEl.textContent = `${winPct}%`
  if (winrateSubEl) winrateSubEl.textContent = `${gameState.stats.wins + gameState.stats.draws + gameState.stats.losses} total games`
}

export function getActiveMatch() {
  const currentUser = normalizeUsername(getCurrentUsername())
  if (appState.activeMatchId) {
    const matchById = appState.liveMatches.find((match) => Number(match.id) === Number(appState.activeMatchId))
    if (matchById) return matchById
  }
  return appState.liveMatches.find((match) =>
    match?.status === 'active' && [normalizeUsername(match.player_x_username), normalizeUsername(match.player_o_username)].includes(currentUser)
  ) || null
}

export function getMyRole(match = getActiveMatch()) {
  const currentUser = normalizeUsername(getCurrentUsername())
  if (!match) return 'X'
  return normalizeUsername(match.player_x_username) === currentUser ? 'X' : 'O'
}

export function renderBoard() {
  const activeMatch = getActiveMatch()
  const myRole = getMyRole(activeMatch)
  const isMyTurn = gameState.currentPlayer === myRole

  cells.forEach((cell, index) => {
    const value = gameState.board[index]
    cell.textContent = value || ''
    const locked = !gameState.running || Boolean(value) || (activeMatch ? !isMyTurn : false)
    cell.disabled = locked
    cell.classList.remove('x-cell', 'o-cell', 'winner')
    if (value === 'X') cell.classList.add('x-cell')
    if (value === 'O') cell.classList.add('o-cell')
  })
}

export function setTurnUI() {
  const activeMatch = getActiveMatch()
  const myRole = getMyRole(activeMatch)
  const isMyTurn = gameState.currentPlayer === myRole
  const currentUser = formatUsername(getCurrentUsername())
  const opponentLabel = activeMatch
    ? (myRole === 'X' ? formatUsername(activeMatch.player_o_username) : formatUsername(activeMatch.player_x_username))
    : 'Opponent'

  const playerXNameEl = playerXEl.querySelector('.vs-name')
  const playerONameEl = playerOEl.querySelector('.vs-name')
  if (playerXNameEl) playerXNameEl.textContent = myRole === 'X' ? currentUser : opponentLabel
  if (playerONameEl) playerONameEl.textContent = myRole === 'O' ? currentUser : opponentLabel
  playerXEl.classList.toggle('active-player', gameState.currentPlayer === 'X')
  playerOEl.classList.toggle('active-player', gameState.currentPlayer !== 'X')
  turnDot.className = 'turn-dot ' + (gameState.currentPlayer === 'X' ? 'x-dot' : 'o-dot')

  if (activeMatch) {
    statusText.textContent = isMyTurn ? `Your turn — ${myRole}` : `Opponent's turn — ${gameState.currentPlayer}`
  } else {
    statusText.textContent = gameState.currentPlayer === 'X'
      ? 'Your turn — X'
      : (gameState.vsAI ? 'AI is thinking…' : "Opponent's turn — O")
  }
}

export function resetGame() {
  gameState.board = Array(9).fill(null)
  gameState.currentPlayer = 'X'
  gameState.running = true
  gameState.moveInProgress = false
}

export function startNewGame() {
  resetGame()
  renderBoard()
  setTurnUI()
}

export function checkWinner() {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ]
  for (const [a, b, c] of lines) {
    if (gameState.board[a] && gameState.board[a] === gameState.board[b] && gameState.board[a] === gameState.board[c]) {
      return { player: gameState.board[a], line: [a, b, c] }
    }
  }
  return null
}

export function isDraw() {
  return gameState.board.every(Boolean)
}

export function highlightWinners(line) {
  line.forEach((index) => cells[index].classList.add('winner'))
}

export function updateScoreUI() {
  scoreXEl.textContent = gameState.scores.X
  scoreOEl.textContent = gameState.scores.O
}

export async function playLocalMove(index) {
  if (gameState.moveInProgress || !gameState.running || gameState.board[index]) return
  if (getActiveMatch()) return

  gameState.board[index] = gameState.currentPlayer
  renderBoard()

  const result = checkWinner()
  if (result) {
    gameState.running = false
    highlightWinners(result.line)
    gameState.scores[result.player]++
    if (result.player === 'X') gameState.stats.wins++
    else gameState.stats.losses++
    saveStats()
    renderSidebarStats()
    updateScoreUI()
    setTimeout(() => {
      showModal(
        result.player === 'X' ? '🏆' : (gameState.vsAI ? '🤖' : '🥇'),
        result.player === 'X' ? 'You Win!' : (gameState.vsAI ? 'AI Wins!' : 'Player O Wins!'),
        result.player === 'X' ? 'Outstanding move!' : 'Better luck next round!',
        result.player === 'X' ? `+₿ ${appState.betAmount}` : `−₿ ${appState.betAmount}`
      )
    }, 400)
    return
  }

  if (isDraw()) {
    gameState.running = false
    gameState.stats.draws++
    saveStats()
    renderSidebarStats()
    setTimeout(() => showModal('🤝', "It's a Draw!", 'Neck and neck — try again?', '±₿ 0'), 400)
    return
  }

  gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X'
  setTurnUI()
  if (gameState.vsAI && gameState.currentPlayer === 'O' && gameState.running) {
    cells.forEach((cell) => { cell.disabled = true })
    setTimeout(() => doAIMove(), 700)
  }
}

export async function playMove(index) {
  const activeMatch = getActiveMatch()
  const myRole = getMyRole(activeMatch)
  if (activeMatch && gameState.currentPlayer !== myRole) return

  if (activeMatch) {
    gameState.moveInProgress = true
    try {
      await submitMatchMove(activeMatch.id, { playerUsername: getCurrentUsername(), index })
    } catch (error) {
      console.error('Could not submit live move', error)
    } finally {
      gameState.moveInProgress = false
    }
    return
  }

  await playLocalMove(index)
}

export function doAIMove() {
  const best = minimax(gameState.board, 'O')
  playLocalMove(best.index)
}

export function minimax(board, player) {
  const result = checkWinnerOnBoard(board)
  if (result === 'O') return { score: 10 }
  if (result === 'X') return { score: -10 }
  const emptySquares = board.map((value, i) => value ? null : i).filter((value) => value !== null)
  if (!emptySquares.length) return { score: 0 }
  const moves = emptySquares.map((index) => {
    board[index] = player
    const score = minimax(board, player === 'O' ? 'X' : 'O').score
    board[index] = null
    return { index, score }
  })
  return player === 'O'
    ? moves.reduce((a, b) => b.score > a.score ? b : a)
    : moves.reduce((a, b) => b.score < a.score ? b : a)
}

export function checkWinnerOnBoard(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ]
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  return null
}

export function syncBoardFromMatch(match) {
  if (!match) {
    resetGame()
    renderBoard()
    setTurnUI()
    return
  }

  const incomingMoves = parseMatchMoves(match)
  gameState.board = Array(9).fill(null)
  incomingMoves.forEach((move) => {
    if (Number.isInteger(move.index) && move.index >= 0 && move.index < 9) {
      gameState.board[move.index] = move.player
    }
  })
  gameState.currentPlayer = incomingMoves.length % 2 === 0 ? 'X' : 'O'
  gameState.running = match.status !== 'finished'
  renderBoard()
  setTurnUI()
  updateScoreUI()

  if (match.status === 'finished') {
    clearActiveMatchId()
    appState.rematchOpponentName = getOpponentNameFromMatch(match)
    appState.rematchInProgress = false
    showResultModalForMatch(match)
  }
}

export function showGameScreen(vsAI = false, opponentName = 'Opponent') {
  gameState.vsAI = vsAI
  const resolvedOpponent = vsAI ? 'AI Bot' : formatUsername(opponentName || 'Opponent')
  const currentUser = formatUsername(getCurrentUsername())
  const myRole = getMyRole(getActiveMatch())

  const playerXNameEl = playerXEl.querySelector('.vs-name')
  const playerONameEl = playerOEl.querySelector('.vs-name')
  if (playerXNameEl) playerXNameEl.textContent = myRole === 'X' ? currentUser : resolvedOpponent
  if (playerONameEl) playerONameEl.textContent = myRole === 'O' ? currentUser : resolvedOpponent
  opponentNameEl.textContent = resolvedOpponent
  dashboardScreen?.classList.add('hidden')
  gameScreen?.classList.remove('hidden')
  document.body.classList.add('game-active')
  document.body.style.overflow = 'hidden'
  closeSidebar()
  startNewGame()
}

export function showDashboard() {
  gameScreen?.classList.add('hidden')
  dashboardScreen?.classList.remove('hidden')
  document.body.classList.remove('game-active')
  document.body.style.overflow = ''
  appState.selectedPlayer = null
  selectedBanner?.classList.add('hidden')
  clearActiveMatchId()
  appState.matchViewOpen = false
  hideModal()
  hideInviteModal()
}

export function enterMatchScreen(match) {
  if (!match) return
  setActiveMatchId(match.id)
  appState.matchViewOpen = true
  showGameScreen(false, getOpponentNameFromMatch(match))
  syncBoardFromMatch(match)
}

export function showResultModalForMatch(match) {
  if (!match) return
  const currentUser = normalizeUsername(getCurrentUsername())
  const winnerMatchesCurrent = normalizeUsername(match.winner_username) === currentUser
  if (match.result === 'draw') {
    showModal('🤝', 'Draw', 'No winner this round', '±₿ 0')
    return
  }
  showModal(
    winnerMatchesCurrent ? '🏆' : '🥇',
    winnerMatchesCurrent ? 'You Win' : 'You Lose',
    winnerMatchesCurrent ? 'Outstanding move!' : 'Better luck next round!',
    winnerMatchesCurrent ? `+₿ ${appState.betAmount || 0}` : `−₿ ${appState.betAmount || 0}`
  )
}

