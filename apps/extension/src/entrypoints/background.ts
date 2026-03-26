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

  const setIconConnected = () => {
    chrome.action.setIcon({ path: connectedPaths }).catch((err) =>
      console.error('SideFlow: setIcon failed (connected)', err)
    );
    chrome.action.setTitle({ title: 'SideFlow - Connected' });
  };

  const setIconDisconnected = () => {
    chrome.action.setIcon({ path: disconnectedPaths }).catch((err) =>
      console.error('SideFlow: setIcon failed (disconnected)', err)
    );
    chrome.action.setTitle({ title: 'SideFlow - Disconnected' });
  };

  ws.on('connected', setIconConnected);
  ws.on('disconnected', setIconDisconnected);

  // Set initial state to disconnected until first WS event
  setIconDisconnected();

  const sendToServer = (data: object) => {
    if (!ws.connected) {
      setIconDisconnected();
      ws.connect();
      return;
    }
    ws.send(data);
  };

  const CHAT_URL_PATTERNS = [
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://gemini.google.com/*',
    '*://claude.ai/*'
  ];

  ws.on('message', (data: unknown) => {
    const msg = data as { type?: string };
    if (msg.type === 'request_context') {
      chrome.tabs.query({ url: CHAT_URL_PATTERNS }, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'get_context' }, (response) => {
              if (response && chrome.runtime.lastError == null) {
                sendToServer(response);
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
      if (message.type === 'get_status') {
        sendResponse?.({ connected: ws.connected });
        return true;
      }
      if (
        message.type === 'site_detected' ||
        message.type === 'chat_update' ||
        message.type === 'site_left' ||
        message.type === 'ping'
      ) {
        sendToServer(message);
      }
      sendResponse?.();
      return true;
    }
  );

  // Inject content script into already-open chat tabs (e.g. after extension reload/update)
  chrome.tabs.query({ url: CHAT_URL_PATTERNS }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab?.id == null) return;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js']
        })
        .catch(() => {
          // Tab may be invalid or not injectable; ignore
        });
    });
  });

  ws.connect();
});
