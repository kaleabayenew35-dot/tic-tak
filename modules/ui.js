/* ═══════════════════════════════════════════════════
   modules/ui.js — All UI rendering.
═══════════════════════════════════════════════════ */

import { getState, setState } from './state.js';
import { formatBalance, formatUsername, normalizeUsername, getCurrentUserProfile, getCurrentUsername } from './helpers.js';
import {
  loadingOverlay, loadingOverlayText,
  connectionBanner, connectionBannerText,
  onlineCount, playerList, sidebar, sidebarOverlay,
  inviteModalOverlay, inviteModalTitle, inviteModalMessage,
  inviteAcceptButton, inviteDeclineButton, inviteModalAvatar, inviteModalBet,
  resultOverlay, resultEmoji, resultMessage, resultSub,
  resultBetAmount, resultBetOutcome, resultBetRow, confettiWrap,
  resultBetLabel,
  closeModalButton, modalHomeButton,
} from './dom.js';

// ── Loading overlay ───────────────────────────────────────────
export function showLoadingOverlay(msg = 'Loading…') {
  if (!loadingOverlay) return;
  if (loadingOverlayText) loadingOverlayText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}
export function hideLoadingOverlay() {
  loadingOverlay?.classList.add('hidden');
}

// ── Connection banner ─────────────────────────────────────────
export function showConnectionBanner(msg = 'You are offline. Please reconnect.') {
  if (!connectionBanner) return;
  if (connectionBannerText) connectionBannerText.textContent = msg;
  connectionBanner.classList.remove('hidden');
}
export function hideConnectionBanner() {
  connectionBanner?.classList.add('hidden');
}
export function updateConnectionStatus() {
  navigator.onLine ? hideConnectionBanner() : showConnectionBanner('You are offline. Please reconnect and retry.');
}

// ── Online count ──────────────────────────────────────────────
export function updateOnlineCount() {
  if (!onlineCount) return;
  const me = normalizeUsername(getCurrentUsername());
  // Count all known online players excluding self, regardless of bet filter
  const allOnline = getState('allOnlinePlayers') || getState('onlinePlayers');
  const visible = allOnline.filter(p => normalizeUsername(p.username) !== me).length;
  onlineCount.textContent = `${visible} online`;
}

// ── Player list ───────────────────────────────────────────────
export function renderPlayers({ onSelectPlayer, onCancelSelection } = {}) {
  if (!playerList) return;
  const rows        = [];
  const me          = normalizeUsername(getCurrentUsername());
  const betAmount   = getState('betAmount');
  // onlinePlayers already filtered by bet server-side when betAmount > 0
  const allPlayers  = getState('onlinePlayers');
  const selected    = getState('selectedPlayer');

  // Exclude self from the visible list
  const visible = allPlayers.filter(p => normalizeUsername(p.username) !== me);

  if (betAmount) {
    rows.push(_buildMeRow());
  }

  if (!betAmount) {
    rows.push('<div class="pl-row"><div class="pl-info"><span class="pl-username" style="color:rgba(245,230,200,.45);">Select a bet amount above to see available players.</span></div></div>');
  } else if (!visible.length) {
    rows.push(`<div class="pl-row"><div class="pl-info"><span class="pl-username">${
      getState('onlinePlayers').length > 1
        ? `Players online — none have selected ${betAmount} ETB yet. Waiting…`
        : 'No players available at ' + betAmount + ' ETB yet. Waiting…'
    }</span></div></div>`);
  } else {
    const sorted = selected
      ? [visible.find(p => Number(p.id) === selected), ...visible.filter(p => Number(p.id) !== selected)].filter(Boolean)
      : visible;
    rows.push(...sorted.map(p => _buildPlayerRow(p)));
  }

  playerList.innerHTML = rows.join('');
  playerList.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => onSelectPlayer?.(Number(btn.dataset.id), btn.dataset.opponent));
  });
  playerList.querySelectorAll('.pl-btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => onCancelSelection?.());
  });
}

function _buildMeRow() {
  const profile = getCurrentUserProfile();
  return `
    <div class="pl-row pl-row-me">
      <div class="pl-avatar me">${profile.initials}</div>
      <div class="pl-info">
        <span class="pl-username">${profile.username} <span class="you-tag">You</span></span>
        <div class="pl-badges">
          <span class="pl-badge pl-badge-bet">${getState('betAmount') ? `Bet ${getState('betAmount')} ETB` : 'No bet selected'}</span>
          <span class="pl-badge pl-badge-available">✓ Ready</span>
        </div>
      </div>
      <span class="status-dot dot-online"></span>
    </div>`;
}

function _buildPlayerRow(player) {
  const isSelected  = Number(getState('selectedPlayer')) === Number(player.id);
  const betAmount   = getState('betAmount');
  const initials    = (player.username || 'P').replace(/^@/, '').slice(0, 2).toUpperCase();
  const colorClass  = ['p1', 'p2', 'p3', 'p4'][Number(player.id) % 4];

  const wins   = Number(player.wins   ?? 0);
  const losses = Number(player.losses ?? 0);
  const draws  = Number(player.draws  ?? 0);

  let btnHtml;
  if (isSelected) {
    btnHtml = `<button class="pl-btn pl-btn-cancel" type="button" data-id="${player.id}">✕ Cancel</button>`;
  } else if (getState('selectedPlayer')) {
    btnHtml = `<button class="pl-btn pl-btn-waiting" type="button" disabled>Waiting…</button>`;
  } else {
    // These players are only shown when they have the same bet selected — always playable
    btnHtml = `<button class="pl-btn play-btn" type="button" data-id="${player.id}" data-opponent="${formatUsername(player.username)}">▶ Play</button>`;
  }

  return `
    <div class="pl-row${isSelected ? ' pl-row-selected' : ''}" data-id="${player.id}">
      <div class="pl-avatar ${colorClass}">${initials}</div>
      <div class="pl-info">
        <span class="pl-username">${formatUsername(player.username)}</span>
        <div class="pl-badges">
          <span class="pl-badge pl-badge-wins">✔ ${wins}W</span>
          <span class="pl-badge pl-badge-draws">◆ ${draws}D</span>
          <span class="pl-badge pl-badge-losses">✖ ${losses}L</span>
          <span class="pl-badge pl-badge-available">✓ ${betAmount} ETB</span>
        </div>
      </div>
      <span class="status-dot dot-online"></span>
      ${btnHtml}
    </div>`;
}

// ── Invite modal ──────────────────────────────────────────────
export function showInviteModal(challenge, options = {}) {
  if (!inviteModalOverlay) return;
  setState('pendingInvite', challenge);
  const sentByMe = options.sentByMe === true;
  const wager    = Number(challenge.wager_amount) || 0;

  inviteModalTitle.textContent   = sentByMe ? '⚔️ Challenge Sent!' : '⚔️ Challenge Incoming!';
  inviteModalMessage.textContent = sentByMe
    ? `You challenged ${formatUsername(challenge.opponent_username)} for`
    : `${formatUsername(challenge.challenger_username)} wants to play you for`;
  if (inviteModalAvatar) inviteModalAvatar.textContent = String(sentByMe ? challenge.opponent_username : challenge.challenger_username || '?').replace(/^@/, '').slice(0, 2).toUpperCase();
  if (inviteModalBet)    inviteModalBet.textContent    = `₿ ${wager} ETB`;
  if (inviteAcceptButton) { inviteAcceptButton.classList.toggle('hidden', sentByMe); inviteAcceptButton.disabled = false; }
  if (inviteDeclineButton) inviteDeclineButton.textContent = '✕ Decline';
  inviteModalOverlay.classList.remove('hidden');
}
export function hideInviteModal() {
  if (!inviteModalOverlay) return;
  setState('pendingInvite', null);
  if (inviteAcceptButton)  { inviteAcceptButton.classList.remove('hidden'); inviteAcceptButton.disabled = false; }
  if (inviteDeclineButton) inviteDeclineButton.textContent = '✕ Decline';
  inviteModalOverlay.classList.add('hidden');
}

// ── Result modal ──────────────────────────────────────────────
let resultAutoCloseTimer = null;
let resultCountdownTimer = null;

function clearResultTimers() {
  if (resultAutoCloseTimer) clearTimeout(resultAutoCloseTimer);
  if (resultCountdownTimer) clearInterval(resultCountdownTimer);
  resultAutoCloseTimer = null;
  resultCountdownTimer = null;
}

function startResultCountdown() {
  const text = document.getElementById('resultCountdownText');
  const bar = document.getElementById('resultCountdownBar');
  let seconds = 3;

  if (text) text.textContent = `Closing in ${seconds}s`;
  if (bar) {
    bar.classList.remove('running');
    void bar.offsetWidth;
    bar.classList.add('running');
  }

  resultCountdownTimer = setInterval(() => {
    seconds -= 1;
    if (text) text.textContent = seconds > 0 ? `Closing in ${seconds}s` : 'Closing…';
  }, 1000);
  resultAutoCloseTimer = setTimeout(() => {
    clearResultTimers();
    hideModal();
    window.dispatchEvent(new CustomEvent('xo-result-auto-close'));
  }, 3000);
}

export function showModal(
  emoji,
  title,
  sub,
  outcome,
  wagerAmount = getState('betAmount'),
  outcomeTone = outcome?.startsWith('+') ? 'win' : outcome?.startsWith('−') ? 'lose' : 'draw',
) {
  clearResultTimers();
  if (!resultOverlay) return;
  resultEmoji.textContent    = emoji;
  resultMessage.textContent  = title;
  resultSub.textContent      = sub;
  if (closeModalButton) closeModalButton.textContent = '▶ Play Again';
  if (modalHomeButton)  modalHomeButton.textContent  = '⌂ Menu';

  const betAmount = Number(wagerAmount) || 0;
  if (betAmount > 0) {
    resultBetAmount.textContent  = '₿ ' + betAmount + ' ETB';
    resultBetOutcome.textContent = outcome;
    resultBetLabel.textContent = outcomeTone === 'win'
      ? '🏆 You Win'
      : outcomeTone === 'lose'
        ? '💸 You Lost'
        : '🤝 Draw — Partial Refund';
    resultBetRow.className = `result-bet-row outcome-${outcomeTone}`;
    resultBetOutcome.className = `result-bet-outcome outcome-${outcomeTone}`;
    resultBetRow.classList.remove('hidden');
  } else {
    resultBetRow.className = 'result-bet-row hidden';
    resultBetRow.classList.add('hidden');
  }

  if (confettiWrap) {
    confettiWrap.innerHTML = '';
    if (outcome?.startsWith('+')) {
      const colors = ['#3b82f6','#a855f7','#22c55e','#f59e0b','#f97316','#ec4899'];
      for (let i = 0; i < 28; i++) {
        const dot = document.createElement('span');
        dot.className = 'confetti-dot';
        dot.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*30}%;background:${colors[Math.floor(Math.random()*colors.length)]};width:${5+Math.random()*6}px;height:${5+Math.random()*6}px;animation-duration:${0.9+Math.random()*0.8}s;animation-delay:${Math.random()*0.4}s;`;
        confettiWrap.appendChild(dot);
      }
    }
  }

  resultOverlay.classList.remove('hidden');
  startResultCountdown();
}
export function hideModal() {
  clearResultTimers();
  resultOverlay?.classList.add('hidden');
}

// ── Sidebar ───────────────────────────────────────────────────
export function openSidebar() {
  sidebar?.classList.add('open');
  sidebarOverlay?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
export function closeSidebar() {
  sidebar?.classList.remove('open');
  sidebarOverlay?.classList.add('hidden');
  document.body.style.overflow = '';
}
