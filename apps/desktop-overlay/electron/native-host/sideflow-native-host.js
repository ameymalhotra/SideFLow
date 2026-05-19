#!/usr/bin/env node
/**
 * Chrome Native Messaging host: stdin/stdout framing + WebSocket bridge to SideFlow Desktop.
 * Reads bridge token from the same userData path as Electron (see user-data-path.js).
 */
const WebSocket = require('ws');
const { readBridgeToken } = require('./user-data-path');

const {
  WS_URL,
  MAX_WS_MESSAGE_BYTES: MAX_WS_PAYLOAD,
  RECONNECT_DELAYS_MS,
} = require('../constants');
const PING_INTERVAL_MS = 20000;

let stdinBuffer = Buffer.alloc(0);
let ws = null;
let wsAuthenticated = false;
/** Messages from the extension before WS auth completes; flushed after auth_ok. */
const pendingFromChrome = [];
const MAX_PENDING = 50;
let reconnectAttempt = 0;
let reconnectTimer = null;
let pingTimer = null;
let extensionAlive = true;

function sendToChrome(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  if (payload.length > MAX_WS_PAYLOAD) return;
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(header);
  process.stdout.write(payload);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && wsAuthenticated) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, PING_INTERVAL_MS);
}

function scheduleReconnect() {
  if (reconnectTimer || !extensionAlive) return;
  const delay =
    RECONNECT_DELAYS_MS[
      Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
    ];
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

function connectWebSocket() {
  if (!extensionAlive) return;
  stopPing();
  wsAuthenticated = false;

  try {
    ws = new WebSocket(WS_URL, { maxPayload: MAX_WS_PAYLOAD });
  } catch {
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    reconnectAttempt = 0;
    const token = readBridgeToken();
    if (!token) {
      console.error(
        'SideFlow native host: no bridge token. Start SideFlow Desktop once so it can create bridge-token.json in user data.',
      );
      ws.close();
      scheduleReconnect();
      return;
    }
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!wsAuthenticated) {
      if (msg.type === 'auth_ok') {
        wsAuthenticated = true;
        startPing();
        while (pendingFromChrome.length > 0) {
          const queued = pendingFromChrome.shift();
          forwardFromChromeToWs(queued);
        }
        sendToChrome({ type: 'bridge_ready' });
      }
      return;
    }
    sendToChrome(msg);
  });

  ws.on('close', () => {
    const wasAuthed = wsAuthenticated;
    wsAuthenticated = false;
    stopPing();
    ws = null;
    if (wasAuthed) {
      sendToChrome({ type: 'bridge_lost' });
    }
    scheduleReconnect();
  });

  ws.on('error', () => {
    /* close handled by on('close') */
  });
}

function forwardFromChromeToWs(obj) {
  if (!wsAuthenticated) {
    pendingFromChrome.push(obj);
    if (pendingFromChrome.length > MAX_PENDING) {
      pendingFromChrome.splice(0, pendingFromChrome.length - MAX_PENDING);
    }
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingFromChrome.push(obj);
    if (pendingFromChrome.length > MAX_PENDING) {
      pendingFromChrome.splice(0, pendingFromChrome.length - MAX_PENDING);
    }
    return;
  }
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function processStdinBuffer() {
  while (stdinBuffer.length >= 4) {
    const len = stdinBuffer.readUInt32LE(0);
    if (len > MAX_WS_PAYLOAD || len < 0) {
      process.exit(1);
    }
    if (stdinBuffer.length < 4 + len) break;
    const body = stdinBuffer.slice(4, 4 + len);
    stdinBuffer = stdinBuffer.slice(4 + len);
    let msg;
    try {
      msg = JSON.parse(body.toString('utf8'));
    } catch {
      continue;
    }
    forwardFromChromeToWs(msg);
  }
}

process.stdin.on('data', (chunk) => {
  stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
  processStdinBuffer();
});

process.stdin.on('end', () => {
  extensionAlive = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stopPing();
  if (ws) ws.close();
  process.exit(0);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

connectWebSocket();
