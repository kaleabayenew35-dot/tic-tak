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
  const me      = normalizeUsername(getCurrentUsername());
  const visible = getState('onlinePlayers').filter(p => normalizeUsername(p.username) !== me).length;
  onlineCount.textContent = `${visible} online`;
}

// ── Player list ───────────────────────────────────────────────
export function renderPlayers({ onSelectPlayer, onCancelSelection } = {}) {
  if (!playerList) return;
  const rows        = [];
  const me          = normalizeUsername(getCurrentUsername());
  const betAmount   = getState('betAmount');
  const allPlayers  = getState('onlinePlayers');
  const selected    = getState('selectedPlayer');

  const visible = allPlayers
    .filter(p => normalizeUsername(p.username) !== me)
    .sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0));

  const matching = betAmount
    ? visible.filter(p => {
        const pb = Number(p.selected_bet_amount ?? p.selectedBetAmount ?? null);
        return Number.isFinite(pb) && pb > 0 && pb === Number(betAmount);
      })
    : visible;

  if (betAmount) rows.push(_buildMeRow());

  if (!visible.length) {
    rows.push('<div class="pl-row"><div class="pl-info"><span class="pl-username">No other players are online right now.</span></div></div>');
  } else if (betAmount && !matching.length) {
    rows.push(`<div class="pl-row"><div class="pl-info"><span class="pl-username">${visible.length} player(s) online — none have selected ${betAmount} ETB yet.</span></div></div>`);
  } else {
    const sorted = selected
      ? [matching.find(p => Number(p.id) === selected), ...matching.filter(p => Number(p.id) !== selected)].filter(Boolean)
      : matching;
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
  const available   = Number(player.balance || 0);
  const betAmount   = getState('betAmount');
  const canPlay     = !betAmount || available >= betAmount;
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
  } else if (!betAmount) {
    btnHtml = `<button class="pl-btn pl-btn-locked" type="button" disabled>▶ Play</button>`;
  } else if (!canPlay) {
    btnHtml = `<button class="pl-btn pl-btn-locked" type="button" disabled>Low balance</button>`;
  } else {
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
          ${betAmount ? `<span class="pl-badge pl-badge-bet">Bet ${formatBalance(betAmount)} ETB</span>` : ''}
          <span class="pl-badge ${canPlay ? 'pl-badge-available' : 'pl-badge-low'}">${canPlay ? 'Available' : 'Low balance'}</span>
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
export function showModal(emoji, title, sub, outcome) {
  if (!resultOverlay) return;
  resultEmoji.textContent    = emoji;
  resultMessage.textContent  = title;
  resultSub.textContent      = sub;
  if (closeModalButton) closeModalButton.textContent = '▶ Play Again';
  if (modalHomeButton)  modalHomeButton.textContent  = '⌂ Menu';

  const betAmount = getState('betAmount');
  if (betAmount) {
    resultBetAmount.textContent  = '₿ ' + betAmount;
    resultBetOutcome.textContent = outcome;
    resultBetOutcome.className   = 'result-bet-outcome ' +
      (outcome.startsWith('+') ? 'outcome-win' : outcome.startsWith('−') ? 'outcome-lose' : 'outcome-draw');
    resultBetRow.classList.remove('hidden');
  } else {
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
}
export function hideModal() {
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
