import { API_URL, fetchStatus, saveSelectedBet, declineLiveChallenge } from './api.js'
import { registerOnlineUser, loadPlayers, loadLiveChallenges, loadLiveMatches, loadMatchById, connectLiveStream, startLivePolling, stopLivePolling, acceptChallenge, cancelSelection, forfeitActiveMatch, createLiveChallenge } from './live.js'
import { applyAuthData, formatUsername, getCurrentUserProfile, getCurrentUsername, getOpponentNameFromMatch } from './helpers.js'
import { showLoadingOverlay, hideLoadingOverlay, showConnectionBanner, hideConnectionBanner, updateConnectionStatus, renderPlayers, openSidebar, closeSidebar, hideModal, showModal, showInviteModal, hideInviteModal, updateOnlineCount } from './ui.js'
import { loadStats, renderSidebarStats, showGameScreen, showDashboard, startNewGame, syncBoardFromMatch, playMove } from './game.js'
import {
  backButton,
  resetButton,
  cells,
  closeModalButton,
  modalHomeButton,
  inviteAcceptButton,
  inviteDeclineButton,
  betChips,
  sbCancelBtn,
  sidebarToggle,
  sidebarClose,
  sidebarOverlay,
  playAiSidebar,
  connectionRetryButton,
  selectedBanner,
  sbAvatar,
  sbUsername,
  sbStatusTxt,
  betDisplay,
  betSelectedTag,
  sbBetTag,
} from './dom.js'
import { appState } from './state.js'

function updateBetDisplay() {
  if (!betDisplay) return

  if (!appState.betAmount) {
    betDisplay.textContent = 'Pick amount'
    betDisplay.classList.add('unselected')
    betSelectedTag?.classList.add('hidden')
    appState.selectedPlayer = null
    renderPlayers({ onSelectPlayer, onCancelSelection })
    return
  }

  betDisplay.textContent = '₿ ' + appState.betAmount
  betDisplay.classList.remove('unselected')
  betDisplay.style.transform = 'scale(1.12)'
  setTimeout(() => { betDisplay.style.transform = '' }, 180)
  betSelectedTag?.classList.remove('hidden')
  betSelectedTag.textContent = '₿ ' + appState.betAmount

  saveSelectedBet({ username: getCurrentUsername().replace(/^@/, '').trim(), selectedBetAmount: appState.betAmount }).catch((error) => {
    console.error('Could not save selected bet', error)
  })

  loadPlayers({ onSelectPlayer, onCancelSelection })
}

async function onSelectPlayer(id) {
  const player = appState.onlinePlayers.find((item) => Number(item.id) === Number(id))
  if (!player) return
  appState.selectedPlayer = Number(id)
  sbAvatar.textContent = (player.username || 'P').replace(/^@/, '').slice(0, 2).toUpperCase()
  sbAvatar.className = 'sb-avatar ' + ['p1', 'p2', 'p3', 'p4'][Number(player.id) % 4]
  sbUsername.textContent = formatUsername(player.username)
  sbBetTag.textContent = '₿ ' + appState.betAmount
  sbStatusTxt.textContent = `Waiting for ${formatUsername(player.username)} to accept…`
  selectedBanner?.classList.remove('hidden')
  renderPlayers({ onSelectPlayer, onCancelSelection })

  const result = await createLiveChallenge(formatUsername(player.username))
  if (!result) {
    sbStatusTxt.textContent = 'Failed to send challenge. Try again.'
  }
}

async function onCancelSelection() {
  await cancelSelection()
  appState.betAmount = 0
  updateBetDisplay()
  sbStatusTxt.textContent = 'Ready to play ✓'
  selectedBanner?.classList.add('hidden')
}

async function handleCellClick(index) {
  await playMove(index)
}

function bindAppListeners() {
  window.addEventListener('online', () => { hideConnectionBanner(); attemptReconnect() })
  window.addEventListener('offline', updateConnectionStatus)
  connectionRetryButton?.addEventListener('click', attemptReconnect)
  sbCancelBtn?.addEventListener('click', onCancelSelection)
  betChips?.addEventListener('click', async (event) => {
    const chip = event.target.closest('.bet-chip')
    if (!chip) return
    betChips.querySelectorAll('.bet-chip').forEach((button) => button.classList.remove('active'))
    chip.classList.add('active')
    appState.betAmount = Number(chip.dataset.amount)
    await updateBetDisplay()
  })
  sidebarToggle?.addEventListener('click', openSidebar)
  sidebarClose?.addEventListener('click', closeSidebar)
  sidebarOverlay?.addEventListener('click', closeSidebar)
  playAiSidebar?.addEventListener('click', () => showGameScreen(true))
  backButton?.addEventListener('click', async () => {
    await forfeitActiveMatch()
    showDashboard()
  })
  resetButton?.addEventListener('click', () => { hideModal(); startNewGame() })
  cells?.forEach((cell) => {
    cell.addEventListener('click', () => handleCellClick(Number(cell.dataset.index)))
  })
  closeModalButton?.addEventListener('click', async () => {
    if (appState.rematchOpponentName && !appState.rematchInProgress) {
      await startPlayAgain()
      return
    }
    hideModal()
    startNewGame()
  })
  modalHomeButton?.addEventListener('click', () => {
    appState.rematchOpponentName = null
    appState.rematchInProgress = false
    hideModal()
    showDashboard()
  })
  inviteAcceptButton?.addEventListener('click', async () => {
    if (!appState.pendingInvite) return
    const response = await acceptChallenge(appState.pendingInvite.id)
    if (response?.match) {
      hideInviteModal()
      appState.liveMatches = appState.liveMatches.filter((match) => match.id !== response.match.id)
      appState.liveMatches.push(response.match)
      showGameScreen(false, getOpponentNameFromMatch(response.match))
      syncBoardFromMatch(response.match)
      await loadLiveChallenges()
    }
  })
  inviteDeclineButton?.addEventListener('click', async () => {
    if (!appState.pendingInvite) return
    const id = appState.pendingInvite.id
    hideInviteModal()
    await declineLiveChallenge(id)
  })
  window.addEventListener('beforeunload', () => {
    stopLivePolling()
    const profile = getCurrentUserProfile()
    if (profile?.username) {
      const username = profile.username.replace(/^@/, '').trim()
      if (username) {
        navigator.sendBeacon(`${API_URL}/api/players/offline`, new Blob([JSON.stringify({ username })], { type: 'application/json' }))
        try {
          const activeId = localStorage.getItem('xo_activeMatchId')
          if (activeId) {
            navigator.sendBeacon(`${API_URL}/api/live/matches/${activeId}/forfeit`, new Blob([JSON.stringify({ username: profile.username })], { type: 'application/json' }))
          }
        } catch {}
      }
    }
  })
}

async function attemptReconnect() {
  showLoadingOverlay('Retrying connection…')
  try {
    await fetchStatus()
    hideConnectionBanner()
    await loadPlayers({ onSelectPlayer, onCancelSelection })
    await loadLiveChallenges()
    connectLiveStream({
      onChallengeReceived: (challenge) => showInviteModal(challenge),
      onChallengeSent: (challenge) => {
        sbStatusTxt.textContent = `Challenge sent ✓ — waiting for ${formatUsername(challenge.opponent_username)} to accept…`
        showInviteModal(challenge, { sentByMe: true })
      },
      onChallengeDeclined: () => {
        appState.selectedPlayer = null
        selectedBanner?.classList.add('hidden')
        sbStatusTxt.textContent = 'Ready to play ✓'
        renderPlayers({ onSelectPlayer, onCancelSelection })
        loadLiveChallenges()
      },
      onChallengeAccepted: async (match) => {
        hideInviteModal()
        appState.liveMatches = appState.liveMatches.filter((item) => item.id !== match.id)
        appState.liveMatches.push(match)
        showGameScreen(false, getOpponentNameFromMatch(match))
        syncBoardFromMatch(match)
        await loadLiveChallenges()
      },
      onMoveMade: (match) => {
        if (appState.activeMatchId && Number(appState.activeMatchId) === Number(match.id)) {
          syncBoardFromMatch(match)
        }
      },
      onMatchFinished: (match) => {
        if (appState.activeMatchId && Number(appState.activeMatchId) === Number(match.id)) {
          syncBoardFromMatch(match)
        }
      },
    })
  } catch (error) {
    console.warn('Reconnect failed', error)
    showConnectionBanner('Retry failed. Still offline or unreachable.')
  } finally {
    hideLoadingOverlay()
  }
}

async function startPlayAgain() {
  if (!appState.rematchOpponentName) {
    hideModal()
    startNewGame()
    return
  }

  appState.rematchInProgress = true
  sbStatusTxt.textContent = 'Waiting for opponent to accept…'
  selectedBanner?.classList.remove('hidden')
  sbAvatar.textContent = appState.rematchOpponentName.replace(/^@/, '').slice(0, 2).toUpperCase()
  sbAvatar.className = 'sb-avatar p2'
  sbUsername.textContent = formatUsername(appState.rematchOpponentName)
  sbBetTag.textContent = '₿ ' + appState.betAmount
  hideModal()
  await createLiveChallenge(appState.rematchOpponentName)
}

async function initializeApp() {
  if (window.authData) applyAuthData(window.authData)
  bindAppListeners()
  loadStats()
  renderSidebarStats()
  updateConnectionStatus()
  if (window.authData) {
    await registerOnlineUser()
  }
  showLoadingOverlay('Loading app…')
  await loadPlayers({ onSelectPlayer, onCancelSelection })
  await loadLiveChallenges()
  startLivePolling({
    onChallengeReceived: (challenge) => showInviteModal(challenge),
    onChallengeSent: (challenge) => {
      sbStatusTxt.textContent = `Challenge sent ✓ — waiting for ${formatUsername(challenge.opponent_username)} to accept…`
      showInviteModal(challenge, { sentByMe: true })
    },
    onChallengeDeclined: () => {
      appState.selectedPlayer = null
      selectedBanner?.classList.add('hidden')
      sbStatusTxt.textContent = 'Ready to play ✓'
      renderPlayers({ onSelectPlayer, onCancelSelection })
      loadLiveChallenges()
    },
    onChallengeAccepted: async (match) => {
      hideInviteModal()
      appState.liveMatches = appState.liveMatches.filter((item) => item.id !== match.id)
      appState.liveMatches.push(match)
      showGameScreen(false, getOpponentNameFromMatch(match))
      syncBoardFromMatch(match)
      await loadLiveChallenges()
    },
    onMoveMade: (match) => {
      if (appState.activeMatchId && Number(appState.activeMatchId) === Number(match.id)) {
        syncBoardFromMatch(match)
      }
    },
    onMatchFinished: (match) => {
      if (appState.activeMatchId && Number(appState.activeMatchId) === Number(match.id)) {
        syncBoardFromMatch(match)
      }
    },
    onActiveMatch: async (match) => {
      appState.activeMatchId = match.id
      await loadMatchById(match.id, { onMatchLoaded: (loadedMatch) => {
        showGameScreen(false, getOpponentNameFromMatch(loadedMatch))
        syncBoardFromMatch(loadedMatch)
      }})
    },
    onMatchLoaded: syncBoardFromMatch,
  })

  try {
    const stored = localStorage.getItem('xo_activeMatchId')
    if (stored) {
      appState.activeMatchId = Number(stored)
      await loadMatchById(Number(stored), { onMatchLoaded: (match) => {
        showGameScreen(false, getOpponentNameFromMatch(match))
        syncBoardFromMatch(match)
      }})
    }
  } catch {}

  hideLoadingOverlay()
}

export function appReady() {
  initializeApp().catch((error) => {
    console.error('App initialization failed', error)
    hideLoadingOverlay()
    showConnectionBanner('App could not initialize. Please refresh.')
  })
}

window.appReady = appReady
