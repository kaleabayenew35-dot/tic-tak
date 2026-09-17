import {
  fetchStatus,
  fetchPlayers,
  fetchLiveChallenges,
  fetchLiveMatches,
  fetchMatchById,
  createLiveChallenge as apiCreateLiveChallenge,
  acceptLiveChallenge as apiAcceptLiveChallenge,
  declineLiveChallenge as apiDeclineLiveChallenge,
  cancelBet as apiCancelBet,
  registerOnline,
  submitMatchMove,
  forfeitMatch as apiForfeitMatch,
} from './api.js'
import { showConnectionBanner, hideConnectionBanner, showLoadingOverlay, hideLoadingOverlay, updateConnectionStatus, updateOnlineCount, renderPlayers, showInviteModal, hideInviteModal } from './ui.js'
import { appState } from './state.js'
import { getCurrentUsername, normalizeUsername } from './helpers.js'

export async function registerOnlineUser() {
  const username = getCurrentUsername().replace(/^@/, '').trim()
  if (!username) return
  try {
    await registerOnline({ username, balance: Number(window.authData?.balance ?? 0) })
  } catch (err) {
    console.error('Could not register as online', err)
  }
}

export function setActiveMatchId(id) {
  appState.activeMatchId = id == null ? null : Number(id)
  try {
    if (appState.activeMatchId) localStorage.setItem('xo_activeMatchId', String(appState.activeMatchId))
    else localStorage.removeItem('xo_activeMatchId')
  } catch (e) {}
}

export function clearActiveMatchId() {
  appState.activeMatchId = null
  try { localStorage.removeItem('xo_activeMatchId') } catch (e) {}
}

export function stopLivePolling() {
  if (appState.livePollingTimer) clearInterval(appState.livePollingTimer)
  appState.livePollingTimer = null
  if (appState.liveStream) {
    appState.liveStream.close()
    appState.liveStream = null
  }
}

export async function loadPlayers(callbacks = {}) {
  try {
    const data = await fetchPlayers()
    appState.onlinePlayers = Array.isArray(data)
      ? data.filter((player) => (player.status || 'online') !== 'offline')
      : []
    renderPlayers({ onSelectPlayer: callbacks.onSelectPlayer, onCancelSelection: callbacks.onCancelSelection })
    updateOnlineCount()
  } catch (error) {
    console.error('Failed to load players', error)
    appState.onlinePlayers = []
    renderPlayers({ onSelectPlayer: callbacks.onSelectPlayer, onCancelSelection: callbacks.onCancelSelection })
    updateOnlineCount()
    if (!navigator.onLine) {
      updateConnectionStatus()
    } else {
      showConnectionBanner('Unable to load players. Retry?')
    }
  }
}

export async function loadLiveChallenges() {
  try {
    const data = await fetchLiveChallenges()
    appState.liveChallenges = Array.isArray(data) ? data : []
    const myUsername = normalizeUsername(getCurrentUsername())
    const incomingChallenge = appState.liveChallenges.find((challenge) =>
      challenge.status === 'pending' && normalizeUsername(challenge.opponent_username) === myUsername
    )
    if (incomingChallenge) {
      showInviteModal(incomingChallenge)
    } else if (appState.pendingInvite && !appState.liveChallenges.some((c) => c.id === appState.pendingInvite.id && c.status === 'pending')) {
      hideInviteModal()
    }
  } catch (error) {
    console.error('Failed to load live challenges', error)
  }
}

export async function loadLiveMatches(callbacks = {}) {
  try {
    const data = await fetchLiveMatches()
    appState.liveMatches = Array.isArray(data) ? data : []
    const currentUser = normalizeUsername(getCurrentUsername())
    const activeMatch = appState.liveMatches.find((match) =>
      match?.status === 'active' && [normalizeUsername(match.player_x_username), normalizeUsername(match.player_o_username)].includes(currentUser)
    )
    if (activeMatch && !appState.activeMatchId) {
      callbacks.onActiveMatch?.(activeMatch)
    }
  } catch (error) {
    console.error('Failed to load live matches', error)
  }
}

export async function loadMatchById(matchId, callbacks = {}) {
  try {
    const data = await fetchMatchById(matchId)
    if (data?.id) {
      appState.liveMatches = appState.liveMatches.map((item) => item.id === data.id ? data : item)
      if (!appState.liveMatches.some((item) => item.id === data.id)) appState.liveMatches.push(data)
      callbacks.onMatchLoaded?.(data)
      return data
    }
  } catch (error) {
    console.error('Failed to load live match', error)
  }
  return null
}

export function connectLiveStream(eventHandlers = {}) {
  if (!window.EventSource || !getCurrentUsername()) return
  if (appState.liveStream) {
    appState.liveStream.close()
    appState.liveStream = null
  }

  const liveBackendUrl = window.__XO_BACKEND_URL__ || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://xo-backend-lzj0.onrender.com')

  appState.liveStream = new EventSource(`${liveBackendUrl}/api/live/stream?username=${encodeURIComponent(getCurrentUsername())}`)

  appState.liveStream.addEventListener('challenge_received', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.challenge) {
      eventHandlers.onChallengeReceived?.(payload.challenge)
      loadLiveChallenges()
    }
  })

  appState.liveStream.addEventListener('challenge_sent', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.challenge) {
      eventHandlers.onChallengeSent?.(payload.challenge)
    }
  })

  appState.liveStream.addEventListener('challenge_declined', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.challenge) {
      eventHandlers.onChallengeDeclined?.(payload.challenge)
    }
  })

  appState.liveStream.addEventListener('challenge_accepted', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.match) {
      eventHandlers.onChallengeAccepted?.(payload.match)
    }
  })

  appState.liveStream.addEventListener('move_made', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.match) {
      eventHandlers.onMoveMade?.(payload.match)
    }
  })

  appState.liveStream.addEventListener('match_finished', (event) => {
    const payload = JSON.parse(event.data || '{}')
    if (payload?.match) {
      eventHandlers.onMatchFinished?.(payload.match)
    }
  })

  appState.liveStream.onerror = () => {
    if (appState.liveStream) {
      appState.liveStream.close()
      appState.liveStream = null
    }
    eventHandlers.onError?.()
  }
}

export async function createLiveChallenge(opponentName) {
  if (!appState.betAmount || !opponentName) return null
  const payload = {
    challengerUsername: getCurrentUsername(),
    opponentUsername: opponentName,
    wagerAmount: appState.betAmount,
  }

  try {
    return await apiCreateLiveChallenge(payload)
  } catch (error) {
    console.error('Could not create challenge', error)
    return null
  }
}

export async function acceptChallenge(challengeId) {
  try {
    return await apiAcceptLiveChallenge(challengeId)
  } catch (error) {
    console.error('Could not accept challenge', error)
    return null
  }
}

export async function declineChallenge(challengeId) {
  try {
    return await apiDeclineLiveChallenge(challengeId)
  } catch (error) {
    console.error('Could not decline challenge', error)
    return null
  }
}

export async function cancelSelection() {
  try {
    await apiCancelBet({ username: getCurrentUsername().replace(/^@/, '') })
  } catch (error) {
    console.error('Could not cancel bet', error)
  }
  appState.selectedPlayer = null
  appState.betAmount = 0
}

export async function forfeitActiveMatch() {
  if (!appState.activeMatchId) return
  try {
    await apiForfeitMatch(appState.activeMatchId, { playerUsername: getCurrentUsername() })
  } catch (error) {
    console.warn('Could not forfeit active match', error)
  }
}

export function startLivePolling(eventHandlers = {}) {
  if (appState.livePollingTimer) clearInterval(appState.livePollingTimer)
  loadPlayers(eventHandlers)
  loadLiveChallenges()
  loadLiveMatches(eventHandlers)
  connectLiveStream(eventHandlers)
  appState.livePollingTimer = setInterval(() => {
    loadPlayers(eventHandlers)
    loadLiveChallenges()
    if (appState.activeMatchId) {
      loadMatchById(appState.activeMatchId, { onMatchLoaded: eventHandlers.onMatchLoaded })
    } else {
      loadLiveMatches(eventHandlers)
    }
  }, 1000)
}
