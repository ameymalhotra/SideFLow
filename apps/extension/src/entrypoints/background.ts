import { NativeMessagingBridge } from '../lib/native-messaging-bridge';
import { CHAT_URL_PATTERNS, isSupportedChatUrl } from '../lib/sites';

export default defineBackground(() => {
  const bridge = new NativeMessagingBridge();
  const pendingMessages: object[] = [];
  const MAX_PENDING_MESSAGES = 50;
  const RECONNECT_ALARM = 'sideflow-native-reconnect';
  const RECONNECT_PERIOD_MINUTES = 1;
  /** True only after the desktop WebSocket has authenticated (not merely the native-messaging port). */
  let desktopBridgeReady = false;

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

  const ensureReconnectAlarm = () => {
    chrome.alarms.create(RECONNECT_ALARM, {
      periodInMinutes: RECONNECT_PERIOD_MINUTES,
    });
  };

  const clearReconnectAlarm = () => {
    chrome.alarms.clear(RECONNECT_ALARM).catch(() => {
      /* ignore */
    });
  };

  const ensureBridgeConnected = () => {
    bridge.connect();
  };

  bridge.on('disconnected', () => {
    desktopBridgeReady = false;
    setIconDisconnected();
    ensureReconnectAlarm();
  });
  bridge.on('connected', () => {
    clearReconnectAlarm();
    if (pendingMessages.length === 0) return;
    const queued = pendingMessages.splice(0, pendingMessages.length);
    queued.forEach((payload) => {
      bridge.send(payload);
    });
  });

  // Disconnected until the native host reports bridge_ready (desktop WS authenticated).
  setIconDisconnected();
  ensureReconnectAlarm();

  const MAX_RELAY_BODY_BYTES = 2 * 1024 * 1024;
  const ALLOWED_SITES = new Set(['chatgpt', 'gemini', 'claude']);
  const MAX_MESSAGES_PER_UPDATE = 400;

  function isRelayablePayload(data: object): boolean {
    const msg = data as Record<string, unknown>;
    const t = msg.type;
    if (t === 'ping') return true;
    if (t === 'site_left') {
      return typeof msg.site === 'string' && ALLOWED_SITES.has(msg.site) && (msg.url === undefined || typeof msg.url === 'string');
    }
    if (t === 'site_detected' || t === 'chat_update') {
      if (typeof msg.site !== 'string' || !ALLOWED_SITES.has(msg.site)) return false;
      if (typeof msg.url !== 'string') return false;
      const messages = msg.messages;
      if (!Array.isArray(messages) || messages.length > MAX_MESSAGES_PER_UPDATE) return false;
      for (const m of messages) {
        if (!m || typeof m !== 'object') return false;
        const row = m as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.content !== 'string') return false;
        if (row.role !== 'user' && row.role !== 'assistant') return false;
      }
      return true;
    }
    return false;
  }

  const sendToServer = (data: object) => {
    if (!isRelayablePayload(data)) {
      console.warn('SideFlow: dropped invalid relay payload');
      return;
    }
    let serializedSize = 0;
    try {
      serializedSize = JSON.stringify(data).length;
    } catch {
      console.warn('SideFlow: relay payload is not serializable');
      return;
    }
    if (serializedSize > MAX_RELAY_BODY_BYTES) {
      console.warn('SideFlow: relay payload exceeds max size');
      return;
    }
    if (!bridge.connected) {
      pendingMessages.push(data);
      if (pendingMessages.length > MAX_PENDING_MESSAGES) {
        pendingMessages.splice(0, pendingMessages.length - MAX_PENDING_MESSAGES);
      }
      ensureBridgeConnected();
      return;
    }
    bridge.send(data);
  };

  const queryPatterns = [...CHAT_URL_PATTERNS];

  const requestSupportedTabsContext = () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (activeList) => {
      const active = activeList[0];
      const tryTab = (tabId: number, onFail?: () => void) => {
        chrome.tabs.sendMessage(tabId, { type: 'get_context' }, (response) => {
          if (response && chrome.runtime.lastError == null) {
            sendToServer(response);
            return;
          }
          onFail?.();
        });
      };

      if (active?.id != null && isSupportedChatUrl(active.url)) {
        tryTab(active.id, () => {
          chrome.tabs.query({ url: queryPatterns }, (tabs) => {
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
        });
        return;
      }

      chrome.tabs.query({ url: queryPatterns }, (tabs) => {
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
    });
  };

  bridge.on('message', (data: unknown) => {
    const msg = data as { type?: string };
    if (msg.type === 'bridge_ready') {
      desktopBridgeReady = true;
      clearReconnectAlarm();
      setIconConnected();
      requestSupportedTabsContext();
      return;
    }
    if (msg.type === 'bridge_lost') {
      desktopBridgeReady = false;
      setIconDisconnected();
      return;
    }
    if (msg.type === 'request_context') {
      requestSupportedTabsContext();
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== RECONNECT_ALARM) return;
    if (bridge.connected) {
      clearReconnectAlarm();
      return;
    }
    ensureBridgeConnected();
  });

  chrome.runtime.onInstalled.addListener(() => {
    ensureReconnectAlarm();
    ensureBridgeConnected();
  });

  chrome.runtime.onStartup.addListener(() => {
    ensureReconnectAlarm();
    ensureBridgeConnected();
  });

  chrome.tabs.onActivated.addListener(() => {
    if (!desktopBridgeReady) {
      ensureBridgeConnected();
    }
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    const nextUrl = changeInfo.url ?? tab.url;
    if (!isSupportedChatUrl(nextUrl)) return;
    if (!desktopBridgeReady) {
      ensureBridgeConnected();
      return;
    }
    if (changeInfo.status === 'complete') {
      requestSupportedTabsContext();
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: { type: string; site?: string; url?: string; messages?: unknown[] },
      _sender,
      sendResponse
    ) => {
      if (message.type === 'get_status') {
        ensureBridgeConnected();
        sendResponse?.({
          connected: desktopBridgeReady,
          nativeMessaging: bridge.connected,
        });
        return true;
      }
      const isAllowedSiteMessage =
        (message.type === 'site_detected' ||
          message.type === 'chat_update' ||
          message.type === 'site_left') &&
        (message.site === 'chatgpt' ||
          message.site === 'gemini' ||
          message.site === 'claude');
      if (isAllowedSiteMessage) {
        sendToServer(message);
      }
      sendResponse?.();
      return true;
    }
  );

  // Re-inject content script into currently open supported chat tabs.
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab?.id == null || !isSupportedChatUrl(tab.url)) return;
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

  ensureBridgeConnected();
});
