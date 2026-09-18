/* ═══════════════════════════════════════════════════
   modules/telegram.js
   Telegram WebApp init, user data, haptic feedback,
   screen navigation, back button.
   Mirrors dama_frontend/modules/telegram.js exactly.
═══════════════════════════════════════════════════ */

const telegramGlobal = typeof globalThis !== 'undefined' ? globalThis : undefined;
export const twa = telegramGlobal?.Telegram?.WebApp;

export function twaAtLeast(required) {
  if (!twa?.version) return false;
  const [ma, mi = 0] = twa.version.split('.').map(Number);
  const [ra, ri = 0] = String(required).split('.').map(Number);
  return ma > ra || (ma === ra && mi >= ri);
}

export function initTelegram() {
  if (!twa) return;
  twa.ready();
  twa.expand();
  if (twaAtLeast('7.7')) twa.disableVerticalSwipes();
  if (twaAtLeast('6.1')) { try { twa.setHeaderColor('#0d0d0d'); } catch (_) {} }
  if (twaAtLeast('7.10')) { try { twa.setBottomBarColor('#0d0d0d'); } catch (_) {} }
  if (twa.colorScheme === 'dark' || !twa.colorScheme) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

export function populateTelegramUser(onComplete) {
  const nameEl   = document.querySelector('.topbar-name');
  const avatarEl = document.querySelector('.avatar');

  const user = twa?.initDataUnsafe?.user;

  if (user) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    if (nameEl)   nameEl.textContent = fullName || user.username || 'Player';
    if (avatarEl) {
      if (user.photo_url) {
        avatarEl.innerHTML = `<img src="${user.photo_url}" alt="avatar"
          style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || user.username?.[0] || '');
        avatarEl.textContent = initials.toUpperCase() || 'X';
      }
    }
    window.tgUserName  = fullName || user.username || 'You';
    window.tgUserId    = String(user.id);
    window.tgUserPhoto = user.photo_url || null;

  } else if (window.XO_USERNAME) {
    // URL-param user (launched via system-backend link)
    const name = window.XO_USERNAME;
    if (nameEl)   nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.slice(0, 2).toUpperCase() || 'X';
    window.tgUserName  = name;
    window.tgUserId    = 'usr_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    window.tgUserPhoto = null;

    if (window.XO_BALANCE !== undefined && window.XO_BALANCE !== null) {
      const balEl = document.querySelector('.topbar-balance');
      if (balEl) balEl.textContent = '💰 ' + Number(window.XO_BALANCE).toLocaleString() + ' ETB';
    }

  } else {
    // Fallback: local guest
    if (nameEl) nameEl.textContent = 'Player';
    window.tgUserName = 'Player';
    let localId = localStorage.getItem('xo_local_uid');
    if (!localId) {
      localId = 'local_' + Math.random().toString(36).slice(2);
      localStorage.setItem('xo_local_uid', localId);
    }
    window.tgUserId    = localId;
    window.tgUserPhoto = null;
  }

  if (typeof onComplete === 'function') onComplete();
}

export function tgHaptic(type) {
  if (!twaAtLeast('6.1')) return;
  if (type === 'success' || type === 'error' || type === 'warning') {
    twa?.HapticFeedback?.notificationOccurred?.(type);
  } else {
    twa?.HapticFeedback?.impactOccurred?.(type);
  }
}

export function showScreen(id) {
  ['dashboardScreen', 'gameScreen'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');

  if (twaAtLeast('6.1') && twa?.BackButton) {
    id === 'gameScreen' ? twa.BackButton.show() : twa.BackButton.hide();
  }
}

export function initBackButton(onBack) {
  if (twaAtLeast('6.1') && twa?.BackButton) {
    twa.BackButton.onClick(() => {
      if (!document.getElementById('gameScreen')?.classList.contains('hidden')) {
        onBack();
      }
    });
  }
}
