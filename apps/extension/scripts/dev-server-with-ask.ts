/**
 * Dev server: WebSocket only (stores scraped context).
 * Writes context to separate files per conversation: data/<site>-<conversationId>.json
 * Use saved JSON files to verify parsing. Run: npm run dev:server
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { ScrapedContext } from '../src/lib/scrapers/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const WS_PORT = 9847;

const VALID_SITES = ['chatgpt', 'gemini', 'claude'] as const;
type Site = (typeof VALID_SITES)[number];

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

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

// --- WebSocket server (extension connects here) ---
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  console.log('[WS] Extension connected from', req.socket.remoteAddress);

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

  ws.on('close', () => console.log('[WS] Extension disconnected'));
});

console.log(`WebSocket server: ws://127.0.0.1:${WS_PORT} (extension connects here)`);
console.log(`Data files:       ${DATA_DIR} (<site>-<conversationId>.json per conversation)`);
console.log('');
console.log('1. Load extension from dist/chrome-mv3');
console.log('2. Open ChatGPT, Gemini, or Claude — scraped context is saved to scripts/data/');
console.log('3. Inspect the JSON files to verify parsing.');
