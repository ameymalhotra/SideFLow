/**
 * Shared constants for SideFlow desktop.
 *
 * Loaded by both the Electron main process (`main.js`, `extension-bridge.js`,
 * `register-native-messaging.js`) and the standalone Native Messaging host
 * (`native-host/sideflow-native-host.js`) — the host runs in its own Node
 * process so anything it needs has to live in plain CommonJS that resolves
 * without Electron.
 */

const WS_HOST = '127.0.0.1';
const WS_PORT = 9847;
const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

const OVERLAY_PANEL_SIZE = { width: 380, height: 488 };
const ORB_SIZE = { width: 72, height: 72 };
const MANAGER_SIZE = { width: 1280, height: 860 };

const MAX_WS_MESSAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_CONVERSATION_MESSAGES = 200;
const ALLOWED_WS_SITES = new Set(['chatgpt', 'gemini', 'claude']);
const AUTH_TIMEOUT_MS = 5000;

const BROADCAST_DEBOUNCE_MS = 75;

/** Backoff (ms) shared by the native host's WS client and the extension bridge. */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

module.exports = {
  WS_HOST,
  WS_PORT,
  WS_URL,
  OVERLAY_PANEL_SIZE,
  ORB_SIZE,
  MANAGER_SIZE,
  MAX_WS_MESSAGE_BYTES,
  MAX_CONVERSATION_MESSAGES,
  ALLOWED_WS_SITES,
  AUTH_TIMEOUT_MS,
  BROADCAST_DEBOUNCE_MS,
  RECONNECT_DELAYS_MS,
};
