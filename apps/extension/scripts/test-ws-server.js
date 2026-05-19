/**
 * Mock WebSocket server for protocol-only smoke tests.
 *
 * NOTE: The Chrome extension no longer opens a raw WebSocket; it talks to the
 * desktop app over Chrome Native Messaging, and the desktop's native host is
 * what bridges to ws://127.0.0.1:9847. This script is useful for poking at
 * the wire protocol with a WS client directly (e.g. `wscat`, the native host,
 * or a future non-Chrome client). It is NOT exercised by the extension.
 *
 * Stop SideFlow Desktop first if it is bound to the same port.
 * Run: node scripts/test-ws-server.js
 */
import { WebSocketServer } from 'ws';

const PORT = 9847;
const wss = new WebSocketServer({ port: PORT });

console.log(`Mock WebSocket server listening on ws://127.0.0.1:${PORT}`);
console.log('Connect a WS client to see messages echoed here.\n');

wss.on('connection', (ws, req) => {
  console.log('Client connected from', req.socket.remoteAddress);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      console.log('Received:', JSON.stringify(msg, null, 2));
    } catch {
      console.log('Received (raw):', data.toString());
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
