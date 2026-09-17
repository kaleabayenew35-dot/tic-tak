import { appState } from './state.js'
import { formatBalance, formatUsername, normalizeUsername, getCurrentUserProfile, getCurrentUsername } from './helpers.js'
import {
  dashboardScreen,
  gameScreen,
  playerList,
  loadingOverlay,
  loadingOverlayText,
  connectionBanner,
  connectionBannerText,
  onlineCount,
  sidebar,
  sidebarOverlay,
  sidebarToggle,
  sidebarClose,
  betDisplay,
  betChips,
  betSelectedTag,
  selectedBanner,
  sbAvatar,
  sbUsername,
  sbStatusTxt,
  sbBetTag,
  inviteModalOverlay,
  inviteModalTitle,
  inviteModalMessage,
  inviteAcceptButton,
  inviteDeclineButton,
  inviteModalAvatar,
  inviteModalBet,
  resultOverlay,
  resultEmoji,
  resultMessage,
  resultSub,
  resultBetAmount,
  resultBetOutcome,
  resultBetRow,
  confettiWrap,
} from './dom.js'

export function showLoadingOverlay(message = 'Loading…') {
  if (!loadingOverlay) return
  loadingOverlayText && (loadingOverlayText.textContent = message)
  loadingOverlay.classList.remove('hidden')
}

export function hideLoadingOverlay() {
  if (!loadingOverlay) return
  loadingOverlay.classList.add('hidden')
}

export function showConnectionBanner(message = 'You are offline. Please reconnect and retry.') {
  if (!connectionBanner) return
  connectionBannerText && (connectionBannerText.textContent = message)
  connectionBanner.classList.remove('hidden')
}

export function hideConnectionBanner() {
  if (!connectionBanner) return
  connectionBanner.classList.add('hidden')
}

export function updateConnectionStatus() {
  if (navigator.onLine) {
    hideConnectionBanner()
    return
  }
  showConnectionBanner('You are offline. Please reconnect and retry.')
}

export function updateOnlineCount() {
  if (!onlineCount) return
  const currentUser = normalizeUsername(getCurrentUsername())
  const visible = appState.onlinePlayers.filter((player) => normalizeUsername(player.username) !== currentUser).length
  onlineCount.textContent = `${visible} online`
}

export function renderPlayers({ onSelectPlayer, onCancelSelection } = {}) {
  if (!playerList) return

  const rows = []
  const currentUser = normalizeUsername(getCurrentUsername())
  const visiblePlayers = appState.onlinePlayers
    .filter((player) => normalizeUsername(player.username) !== currentUser)
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))

  const currentBetNum = Number(appState.betAmount) || 0
  const matchingPlayers = appState.betAmount
    ? visiblePlayers.filter((player) => {
        const playerBet = Number(player.selected_bet_amount ?? player.selectedBetAmount ?? null)
        return Number.isFinite(playerBet) && playerBet > 0 && playerBet === currentBetNum
      })
    : visiblePlayers

  if (appState.betAmount) {
    rows.push(buildMeRow())
  }

  if (!visiblePlayers.length) {
    rows.push('<div class="pl-row"><div class="pl-info"><span class="pl-username">No other players are online right now. Check back in a moment.</span></div></div>')
  } else if (appState.betAmount && !matchingPlayers.length) {
    rows.push(`<div class="pl-row"><div class="pl-info"><span class="pl-username">${visiblePlayers.length} player(s) online — none have selected ${currentBetNum} ETB yet. Waiting for a match…</span></div></div>`)
  } else {
    const sorted = appState.selectedPlayer
      ? [matchingPlayers.find((p) => Number(p.id) === appState.selectedPlayer), ...matchingPlayers.filter((p) => Number(p.id) !== appState.selectedPlayer)].filter(Boolean)
      : matchingPlayers
    rows.push(...sorted.map(buildPlayerRow))
  }

  playerList.innerHTML = rows.join('')

  playerList.querySelectorAll('.play-btn').forEach((btn) => {
    btn.addEventListener('click', () => onSelectPlayer?.(Number(btn.dataset.id), btn.dataset.opponent))
  })
  playerList.querySelectorAll('.pl-btn-cancel').forEach((btn) => {
    btn.addEventListener('click', () => onCancelSelection?.())
  })
}

function buildMeRow() {
  const profile = getCurrentUserProfile()
  return `
    <div class="pl-row pl-row-me">
      <div class="pl-avatar me">${profile.initials}</div>
      <div class="pl-info">
        <span class="pl-username">${profile.username} <span class="you-tag">You</span></span>
        <div class="pl-badges">
          <span class="pl-badge pl-badge-bet">${appState.betAmount ? `Bet ${appState.betAmount} ETB` : 'No bet selected'}</span>
          <span class="pl-badge pl-badge-available">✓ Ready</span>
        </div>
      </div>
      <div class="pl-stats">
        <span class="pl-stat w">W<b>0</b></span>
        <span class="pl-stat d">D<b>0</b></span>
        <span class="pl-stat l">L<b>0</b></span>
      </div>
      <span class="status-dot dot-online"></span>
      <span class="pl-ready-tag">✓ Ready</span>
    </div>`
}

function buildPlayerRow(player) {
  const isSelected = Number(appState.selectedPlayer) === Number(player.id)
  const available = Number(player.balance || 0)
  const canPlay = !appState.betAmount || available >= appState.betAmount
  const initials = (player.username || 'P').replace(/^@/, '').slice(0, 2).toUpperCase()
  const colorClass = ['p1', 'p2', 'p3', 'p4'][Number(player.id) % 4]

  let btnHtml
  if (isSelected) {
    btnHtml = `<button class="pl-btn pl-btn-cancel" type="button" data-id="${player.id}">✕ Cancel</button>`
  } else if (appState.selectedPlayer) {
    btnHtml = `<button class="pl-btn pl-btn-waiting" type="button" disabled>Waiting…</button>`
  } else if (!appState.betAmount) {
    btnHtml = `<button class="pl-btn pl-btn-locked" type="button" disabled>▶ Play</button>`
  } else if (!canPlay) {
    btnHtml = `<button class="pl-btn pl-btn-locked" type="button" disabled>Low balance</button>`
  } else {
    btnHtml = `<button class="pl-btn play-btn" type="button" data-id="${player.id}" data-opponent="${formatUsername(player.username)}">▶ Play</button>`
  }

  return `
    <div class="pl-row${isSelected ? ' pl-row-selected' : ''}" data-id="${player.id}">
      <div class="pl-avatar ${colorClass}">${initials}</div>
      <div class="pl-info">
        <span class="pl-username">${formatUsername(player.username)}</span>
        <div class="pl-badges">
          <span class="pl-badge pl-badge-bet">${appState.betAmount ? `Bet ${formatBalance(appState.betAmount)} ETB` : `Balance ${formatBalance(available)} ETB`}</span>
          <span class="pl-badge ${canPlay ? 'pl-badge-available' : 'pl-badge-low'}">${canPlay ? 'Available' : 'Low balance'}</span>
        </div>
      </div>
      <div class="pl-stats">
        <span class="pl-stat w">W<b>${Math.max(1, Number(player.id) % 10)}</b></span>
        <span class="pl-stat d">D<b>${Math.max(1, Number(player.id) % 5)}</b></span>
        <span class="pl-stat l">L<b>${Math.max(1, Number(player.id) % 7)}</b></span>
      </div>
      <span class="status-dot dot-online"></span>
      ${btnHtml}
    </div>`
}

export function showInviteModal(challenge, options = {}) {
  if (!inviteModalOverlay) return
  appState.pendingInvite = challenge
  const sentByMe = options.sentByMe === true
  const challengerName = formatUsername(challenge.challenger_username)
  const wager = Number(challenge.wager_amount) || 0

  inviteModalTitle.textContent = sentByMe ? '⚔️ Challenge Requester!' : '⚔️ Challenge Incoming!'
  inviteModalMessage.textContent = sentByMe
    ? `You want to play ${formatUsername(challenge.opponent_username)} for`
    : `${challengerName} wants to play you for`

  inviteModalAvatar && (inviteModalAvatar.textContent = String(sentByMe ? challenge.opponent_username : challenge.challenger_username || '?').replace(/^@/, '').slice(0, 2).toUpperCase())
  inviteModalBet && (inviteModalBet.textContent = `₿ ${wager} ETB`)
  if (inviteAcceptButton) {
    inviteAcceptButton.classList.toggle('hidden', sentByMe)
    inviteAcceptButton.disabled = false
  }
  if (inviteDeclineButton) inviteDeclineButton.textContent = '✕ Decline'
  inviteModalOverlay.classList.remove('hidden')
}

export function hideInviteModal() {
  if (!inviteModalOverlay) return
  appState.pendingInvite = null
  if (inviteAcceptButton) {
    inviteAcceptButton.classList.remove('hidden')
    inviteAcceptButton.disabled = false
  }
  if (inviteDeclineButton) inviteDeclineButton.textContent = '✕ Decline'
  inviteModalOverlay.classList.add('hidden')
}

export function showModal(emoji, title, sub, outcome) {
  if (!resultOverlay) return
  resultEmoji.textContent = emoji
  resultMessage.textContent = title
  resultSub.textContent = sub
  closeModalButton && (closeModalButton.textContent = '▶ Play Again')
  modalHomeButton && (modalHomeButton.textContent = '⌂ Menu')

  if (appState.betAmount) {
    resultBetAmount.textContent = '₿ ' + appState.betAmount
    resultBetOutcome.textContent = outcome
    resultBetOutcome.className = 'result-bet-outcome ' +
      (outcome.startsWith('+') ? 'outcome-win' : outcome.startsWith('−') ? 'outcome-lose' : 'outcome-draw')
    resultBetRow.classList.remove('hidden')
  } else {
    resultBetRow.classList.add('hidden')
  }

  if (confettiWrap) {
    confettiWrap.innerHTML = ''
    if (outcome && outcome.startsWith('+')) {
      const colors = ['#3b82f6','#a855f7','#22c55e','#f59e0b','#f97316','#ec4899']
      for (let i = 0; i < 28; i++) {
        const dot = document.createElement('span')
        dot.className = 'confetti-dot'
        dot.style.cssText = `
          left: ${Math.random() * 100}%;
          top: ${Math.random() * 30}%;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          width: ${5 + Math.random() * 6}px;
          height: ${5 + Math.random() * 6}px;
          animation-duration: ${0.9 + Math.random() * 0.8}s;
          animation-delay: ${Math.random() * 0.4}s;
        `
        confettiWrap.appendChild(dot)
      }
    }
  }

  resultOverlay.classList.remove('hidden')
}

export function hideModal() {
  if (!resultOverlay) return
  resultOverlay.classList.add('hidden')
}

export function openSidebar() {
  sidebar?.classList.add('open')
  sidebarOverlay?.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

export function closeSidebar() {
  sidebar?.classList.remove('open')
  sidebarOverlay?.classList.add('hidden')
  document.body.style.overflow = ''
}
