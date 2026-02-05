/**
 * Mock WebSocket server for testing the extension.
 * Run: node scripts/test-ws-server.js
 * Then load the extension and visit ChatGPT/Gemini/Claude - messages will be logged here.
 */
import { WebSocketServer } from 'ws';

const PORT = 9847;
const wss = new WebSocketServer({ port: PORT });

console.log(`Mock WebSocket server listening on ws://127.0.0.1:${PORT}`);
console.log('Load the extension and open an LLM chat to see messages.\n');

wss.on('connection', (ws, req) => {
  console.log('Extension connected from', req.socket.remoteAddress);

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
    console.log('Extension disconnected');
  });
});
