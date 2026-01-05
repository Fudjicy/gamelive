export function setStatus(element, message, type = 'error') {
  if (!element) return;
  element.textContent = message;
  element.className = type;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || 'Request failed';
    throw new Error(message);
  }
  return data;
}

export function getTelegramInitData() {
  if (window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp.initData || '';
  }
  return '';
}

export async function loginWithInitData(initData) {
  return apiRequest('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}
