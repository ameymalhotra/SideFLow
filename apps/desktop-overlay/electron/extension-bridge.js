const { WebSocketServer } = require('ws');
const {
  WS_HOST,
  WS_PORT,
  MAX_WS_MESSAGE_BYTES,
  MAX_CONVERSATION_MESSAGES,
  ALLOWED_WS_SITES,
  AUTH_TIMEOUT_MS,
} = require('./constants');

/** Allow browser extensions, or no origin / localhost (Node ws client used by the native host). */
function isAllowedWsOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) return true;
  if (origin.startsWith(`http://${WS_HOST}`) || origin.startsWith('http://localhost')) return true;
  return false;
}

/**
 * @param {object} opts
 * @param {object} opts.desktopStore
 * @param {() => void} opts.scheduleBroadcast
 * @param {() => string} opts.getBridgeToken
 * @param {import('electron').App} opts.electronApp
 */
function startExtensionBridge({ desktopStore, scheduleBroadcast, getBridgeToken, electronApp }) {
  const bridgeToken = getBridgeToken();
  const wsServer = new WebSocketServer({
    host: WS_HOST,
    port: WS_PORT,
    maxPayload: MAX_WS_MESSAGE_BYTES,
  });

  wsServer.on('connection', (ws, req) => {
    const origin = req.headers['origin'] ?? '';
    if (!isAllowedWsOrigin(origin)) {
      ws.close(4003, 'Forbidden origin');
      return;
    }

    let authenticated = false;

    const authTimer = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw) => {
      if (raw.length > MAX_WS_MESSAGE_BYTES) {
        ws.close(4002, 'Payload too large');
        return;
      }

      try {
        const message = JSON.parse(raw.toString());

        if (!authenticated) {
          if (message.type === 'auth' && typeof message.token === 'string' && message.token === bridgeToken) {
            authenticated = true;
            clearTimeout(authTimer);
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            ws.send(JSON.stringify({ type: 'request_context' }));
            const extension = desktopStore.getState().extension;
            desktopStore.setExtensionStatus({
              connected: true,
              clients: extension.clients + 1,
              lastSeenAt: Date.now(),
              lastError: null,
            });
            scheduleBroadcast();
          } else {
            ws.close(4003, 'Invalid token');
          }
          return;
        }

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          desktopStore.setExtensionStatus({
            connected: true,
            lastSeenAt: Date.now(),
            lastError: null,
          });
          scheduleBroadcast();
          return;
        }

        if (message.type === 'site_left') {
          if (typeof message.site === 'string' && ALLOWED_WS_SITES.has(message.site)) {
            desktopStore.removeConversationForSiteLeave({
              site: message.site,
              url: typeof message.url === 'string' ? message.url : null,
            });
            desktopStore.setExtensionStatus({
              connected: true,
              lastSeenAt: Date.now(),
              lastSite: message.site,
              lastError: null,
            });
            scheduleBroadcast();
          }
          return;
        }

        if (
          (message.type === 'chat_update' || message.type === 'site_detected') &&
          Array.isArray(message.messages)
        ) {
          if (typeof message.site !== 'string' || !ALLOWED_WS_SITES.has(message.site)) {
            ws.send(
              JSON.stringify({
                type: 'error',
                code: 'invalid_site',
                message: 'Unknown or missing site',
              }),
            );
            return;
          }
          if (message.messages.length > MAX_CONVERSATION_MESSAGES) {
            message.messages = message.messages.slice(-MAX_CONVERSATION_MESSAGES);
          }

          desktopStore.upsertConversation(message);
          desktopStore.setExtensionStatus({
            connected: true,
            lastSeenAt: Date.now(),
            lastSite: typeof message.site === 'string' ? message.site : null,
            lastConversationId:
              typeof message.conversationId === 'string'
                ? message.conversationId
                : typeof message.url === 'string'
                  ? `${message.site ?? 'browser'}:${message.url}`
                  : null,
            lastError: null,
          });
          scheduleBroadcast();
        }
      } catch (error) {
        if (!authenticated) {
          ws.close(4003, 'Bad auth payload');
          return;
        }
        desktopStore.setExtensionStatus({
          connected: true,
          lastSeenAt: Date.now(),
          lastError: error instanceof Error ? error.message : 'Failed to parse extension payload',
        });
        scheduleBroadcast();
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (!authenticated) return;
      const current = desktopStore.getState().extension;
      const clients = Math.max(0, current.clients - 1);
      desktopStore.setExtensionStatus({
        clients,
        connected: clients > 0,
        lastSeenAt: Date.now(),
      });
      scheduleBroadcast();
    });
  });

  wsServer.on('listening', () => {
    desktopStore.setExtensionStatus({ connected: false, clients: 0, lastError: null });
    scheduleBroadcast();
  });

  wsServer.on('error', (error) => {
    const msg = error instanceof Error ? error.message : 'Extension bridge failed';
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    const hint =
      code === 'EADDRINUSE'
        ? ` (port ${WS_PORT} in use — quit other SideFlow Desktop, or stop dev:server / anything else bound to this port)`
        : '';
    desktopStore.setExtensionStatus({
      connected: false,
      lastError: msg + hint,
    });
    scheduleBroadcast();
    if (!electronApp.isPackaged) {
      console.error('[SideFlow] Extension WebSocket failed:', msg + hint);
    }
  });

  return wsServer;
}

module.exports = { startExtensionBridge, isAllowedWsOrigin };
