const card = document.getElementById('status-card');
const statusText = document.getElementById('status-text');
const statusSub = document.getElementById('status-sub');
const launchAppButton = document.getElementById('launch-app');

const APP_MANAGER_URL = 'sideflow://manager';

launchAppButton?.addEventListener('click', () => {
  chrome.tabs.create({ url: APP_MANAGER_URL }, () => {
    const err = chrome.runtime.lastError;
    if (err?.message) {
      console.warn('SideFlow popup: could not open manager tab:', err.message);
    }
  });
  window.close();
});

chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
  const err = chrome.runtime.lastError;
  if (err?.message) {
    console.warn('SideFlow popup: get_status failed:', err.message);
  }
  const connected = response?.connected === true;
  const nativeMessaging = (response as { nativeMessaging?: boolean } | undefined)?.nativeMessaging === true;

  if (card) {
    card.classList.remove('loading');
    card.classList.toggle('connected', connected);
    card.classList.toggle('disconnected', !connected);
  }

  if (statusText) {
    statusText.textContent = connected
      ? 'Connected and streaming'
      : nativeMessaging
        ? 'Waiting for SideFlow Desktop'
        : 'Desktop bridge unavailable';
  }

  if (statusSub) {
    statusSub.textContent = connected
      ? 'Live chat updates are being sent to SideFlow.'
      : nativeMessaging
        ? 'Open SideFlow Desktop so the local WebSocket can finish connecting.'
        : 'Install the native host (launch the desktop app once), then reload this extension.';
  }
});
