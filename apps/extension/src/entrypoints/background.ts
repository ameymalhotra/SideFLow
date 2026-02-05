import { WebSocketClient } from '../lib/websocket';

export default defineBackground(() => {
  const ws = new WebSocketClient();

  const iconSizes = [16, 32, 48, 128];
  const connectedPaths = Object.fromEntries(
    iconSizes.map((s) => [s, `icon/icon-connected-${s}.png`])
  );
  const disconnectedPaths = Object.fromEntries(
    iconSizes.map((s) => [s, `icon/icon-${s}.png`])
  );

  ws.on('connected', () => {
    chrome.action.setIcon({ path: connectedPaths }).catch(() => {});
    chrome.action.setTitle({ title: 'Overlay AI - Connected' });
  });

  ws.on('disconnected', () => {
    chrome.action.setIcon({ path: disconnectedPaths }).catch(() => {});
    chrome.action.setTitle({ title: 'Overlay AI - Disconnected' });
  });

  ws.on('message', (data: unknown) => {
    const msg = data as { type?: string };
    if (msg.type === 'request_context') {
      const patterns = [
        '*://chat.openai.com/*',
        '*://chatgpt.com/*',
        '*://gemini.google.com/*',
        '*://claude.ai/*'
      ];
      chrome.tabs.query({ url: patterns }, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'get_context' }, (response) => {
              if (response && chrome.runtime.lastError == null) {
                ws.send(response);
              }
            });
          }
        });
      });
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: { type: string; site?: string; url?: string; messages?: unknown[] },
      _sender,
      sendResponse
    ) => {
      if (
        message.type === 'site_detected' ||
        message.type === 'chat_update' ||
        message.type === 'site_left' ||
        message.type === 'ping'
      ) {
        ws.send(message);
      }
      sendResponse?.();
      return true;
    }
  );

  ws.connect();
});
