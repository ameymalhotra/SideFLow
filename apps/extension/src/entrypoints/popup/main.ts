const card = document.getElementById('status-card');
const statusText = document.getElementById('status-text');
const statusSub = document.getElementById('status-sub');

chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
  const connected = response?.connected === true;

  if (card) {
    card.classList.remove('loading');
    card.classList.toggle('connected', connected);
    card.classList.toggle('disconnected', !connected);
  }

  if (statusText) {
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
  }

  if (statusSub) {
    statusSub.textContent = connected
      ? 'Streaming to local server'
      : 'Start the SideFlow server';
  }
});
