/**
 * Dev/debug server: WebSocket-only context recorder.
 *
 * The Chrome extension does NOT connect here directly (its production path is
 * Chrome Native Messaging → SideFlow Desktop). This script exists to capture
 * scraped-context payloads as JSON files for parser/regression work — point
 * a WS client (the native host, `wscat`, etc.) at it instead.
 *
 * Writes one file per conversation: data/<site>-<conversationId>.json
 *
 * Stop SideFlow Desktop first if it is bound to port 9847.
 * Run: npm run dev:server
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { ScrapedContext } from '../src/lib/scrapers/types';
import { simpleHash } from '../src/lib/scrapers/base';
import type { Site } from '../src/lib/sites';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const WS_PORT = 9847;

const VALID_SITES = ['chatgpt', 'gemini', 'claude'] as const satisfies readonly Site[];

function sanitizeFileKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'default';
}

function fileKeyForContext(context: ScrapedContext): string {
  const raw = context.conversationId ?? simpleHash(context.url);
  return sanitizeFileKey(raw);
}

async function saveContextToFile(context: ScrapedContext): Promise<void> {
  const site = context.site as Site;
  if (!VALID_SITES.includes(site)) return;
  const fileKey = fileKeyForContext(context);
  await mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${site}-${fileKey}.json`);
  await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
}

// --- WebSocket server (connect any WS client; extension uses Native Messaging) ---
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  console.log('[WS] Client connected from', req.socket.remoteAddress);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      if (msg.type === 'chat_update' && msg.messages != null) {
        const context: ScrapedContext = {
          site: msg.site ?? 'chatgpt',
          url: msg.url ?? '',
          conversationId: msg.conversationId,
          messages: msg.messages,
          scrapedAt: msg.scrapedAt ?? Date.now(),
        };
        saveContextToFile(context).then(() => {
          const fk = fileKeyForContext(context);
          console.log('[WS] Updated context:', context.site, context.messages.length, 'messages →', path.join(DATA_DIR, `${context.site}-${fk}.json`));
        }).catch((err) => console.error('[WS] Failed to write file:', err));
        return;
      }
      if (msg.type === 'site_detected' && msg.messages != null) {
        const context: ScrapedContext = {
          site: msg.site ?? 'chatgpt',
          url: msg.url ?? '',
          conversationId: msg.conversationId,
          messages: msg.messages,
          scrapedAt: msg.scrapedAt ?? Date.now(),
        };
        saveContextToFile(context).then(() => {
          const fk = fileKeyForContext(context);
          console.log('[WS] Context from site_detected:', context.site, context.messages.length, 'messages →', path.join(DATA_DIR, `${context.site}-${fk}.json`));
        }).catch((err) => console.error('[WS] Failed to write file:', err));
        return;
      }
      console.log('[WS] Received:', JSON.stringify(msg, null, 2));
    } catch {
      console.log('[WS] Received (raw):', data.toString());
    }
  });

  ws.on('close', () => console.log('[WS] Client disconnected'));
});

console.log(`WebSocket server: ws://127.0.0.1:${WS_PORT}`);
console.log(`Data files:       ${DATA_DIR} (<site>-<conversationId>.json per conversation)`);
console.log('');
console.log('Connect a WS client (the desktop native host, wscat, etc.) and feed it');
console.log('chat_update / site_detected payloads to capture scraped contexts as JSON.');
