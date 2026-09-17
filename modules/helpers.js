import { topbarName, topbarBalance, avatarEl } from './dom.js'
import { appState } from './state.js'

export function formatBalance(value) {
  const number = Number(String(value).replace(/[^0-9.\-\.]/g, ''))
  if (Number.isFinite(number)) return number.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return String(value)
}

export function applyAuthData(data) {
  if (!data) return
  topbarName.textContent = formatUsername(data.username || '@player')
  topbarBalance.textContent = '💰 ' + formatBalance(data.balance) + ' ETB'
  avatarEl.textContent = (data.username || 'X').trim().charAt(0).toUpperCase() || 'X'
}

export function formatUsername(value) {
  const raw = String(value || '').trim()
  return raw.startsWith('@') ? raw : `@${raw}`
}

export function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase()
}

export function getCurrentUserProfile() {
  if (appState.currentUserProfile) return appState.currentUserProfile
  const authUsername = window.authData?.username || ME.username
  const parsedBalance = Number.isFinite(Number(window.authData?.balance)) ? Number(window.authData.balance) : null
  appState.currentUserProfile = {
    id: Number(window.authData?.id || 0),
    username: formatUsername(authUsername),
    initials: String(authUsername || 'P').replace(/^@/, '').slice(0, 2).toUpperCase(),
    colorClass: 'me',
    status: 'online',
    balance: parsedBalance,
  }
  return appState.currentUserProfile
}

export function getCurrentUsername() {
  return formatUsername(getCurrentUserProfile().username)
}

export function parseMatchMoves(match) {
  if (!match) return []
  try {
    return typeof match.moves === 'string' && match.moves
      ? JSON.parse(match.moves)
      : (match.moves || [])
  } catch (error) {
    console.error('[parseMatchMoves] could not parse moves:', error, 'match:', match)
    return []
  }
}

export function getOpponentNameFromMatch(match) {
  if (!match) return 'Opponent'
  const currentUser = normalizeUsername(getCurrentUsername())
  return normalizeUsername(match.player_x_username) === currentUser
    ? match.player_o_username
    : match.player_x_username
}
