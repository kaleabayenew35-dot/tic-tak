import { fetchStatus, fetchPlayers, fetchLiveChallenges } from './api.js'
import { showLoadingOverlay, hideLoadingOverlay, showConnectionBanner, hideConnectionBanner, updateConnectionStatus } from './ui.js'
import { renderPlayers, renderLiveChallenges } from './ui.js'
import { connectLiveStream } from './live.js'
import { appState } from './state.js'
import { getCurrentUsername } from './helpers.js'

export async function attemptReconnect() {
  showLoadingOverlay('Retrying connection…')
  try {
    await fetchStatus()
    hideConnectionBanner()
    await loadPlayers()
    await loadLiveChallenges()
    connectLiveStream()
  } catch (error) {
    console.warn('Reconnect failed', error)
    showConnectionBanner('Retry failed. Still offline or unreachable.')
  } finally {
    hideLoadingOverlay()
  }
}

export async function loadPlayers() {
  try {
    const data = await fetchPlayers()
    appState.onlinePlayers = Array.isArray(data)
      ? data.filter((player) => (player.status || 'online') !== 'offline')
      : []
    renderPlayers()
    updateOnlineCount()
  } catch (error) {
    console.error('Failed to load players', error)
    appState.onlinePlayers = []
    renderPlayers()
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
    renderLiveChallenges()
  } catch (error) {
    console.error('Failed to load live challenges', error)
  }
}

export async function loadLiveMatches() {
  try {
    const data = await fetchLiveMatches()
    appState.liveMatches = Array.isArray(data) ? data : []
    const currentUser = normalizeUsername(getCurrentUsername())
    const activeMatch = appState.liveMatches.find((match) => match?.status === 'active' && [normalizeUsername(match.player_x_username), normalizeUsername(match.player_o_username)].includes(currentUser))
    if (activeMatch && !appState.activeMatchId && appState.matchViewOpen) {
      setActiveMatchId(activeMatch.id)
      enterMatchScreen(activeMatch)
    }
  } catch (error) {
    console.error('Failed to load live matches', error)
  }
}
