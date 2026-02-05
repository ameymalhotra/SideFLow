/**
 * Dev server: WebSocket (stores scraped context) + HTTP /ask (buildLLMMessages with live data).
 * Writes context to separate files per conversation: data/<site>-<conversationId>.json
 * Run: npm run dev:server
 */
import { createServer } from 'http';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { buildLLMMessages } from '../src/lib/buildLLMMessages';
import type { ScrapedContext } from '../src/lib/scrapers/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const WS_PORT = 9847;
const HTTP_PORT = 9849;

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

let latestContext: ScrapedContext | null = null;
const contextByKey = new Map<string, ScrapedContext>();
const lastBySite: Partial<Record<Site, ScrapedContext>> = {};
const keysBySite: Partial<Record<Site, Set<string>>> = {};

async function saveContextToFile(context: ScrapedContext): Promise<void> {
  const site = context.site as Site;
  if (!VALID_SITES.includes(site)) return;
  const fileKey = fileKeyForContext(context);
  const key = `${site}-${fileKey}`;
  await mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${site}-${fileKey}.json`);
  await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  latestContext = context;
  contextByKey.set(key, context);
  lastBySite[site] = context;
  if (!keysBySite[site]) keysBySite[site] = new Set();
  keysBySite[site]!.add(fileKey);
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
        latestContext = {
          site: msg.site ?? 'chatgpt',
          url: msg.url ?? '',
          conversationId: msg.conversationId,
          messages: msg.messages,
          scrapedAt: msg.scrapedAt ?? Date.now(),
        };
        saveContextToFile(latestContext).then(() => {
          const fk = fileKeyForContext(latestContext!);
          console.log('[WS] Updated context:', latestContext!.site, latestContext!.messages.length, 'messages →', path.join(DATA_DIR, `${latestContext!.site}-${fk}.json`));
        }).catch((err) => console.error('[WS] Failed to write file:', err));
        return;
      }
      if (msg.type === 'site_detected' && msg.messages != null) {
        latestContext = {
          site: msg.site ?? 'chatgpt',
          url: msg.url ?? '',
          conversationId: msg.conversationId,
          messages: msg.messages,
          scrapedAt: msg.scrapedAt ?? Date.now(),
        };
        saveContextToFile(latestContext).then(() => {
          const fk = fileKeyForContext(latestContext!);
          console.log('[WS] Context from site_detected:', latestContext!.site, latestContext!.messages.length, 'messages →', path.join(DATA_DIR, `${latestContext!.site}-${fk}.json`));
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

// --- HTTP server (/ask and simple UI) ---
const askPage = `
<!DOCTYPE html>
<html>
<head><title>Overlay Ask</title></head>
<body>
  <h1>Ask about current chat</h1>
  <p>Context is saved per conversation to <code>scripts/data/&lt;site&gt;-&lt;conversationId&gt;.json</code>. Pick site and conversation below.</p>
  <form id="f">
    <label>Site: <select id="site">
      <option value="">Use latest (most recently updated)</option>
      <option value="gemini">Gemini</option>
      <option value="chatgpt">ChatGPT</option>
      <option value="claude">Claude</option>
    </select></label>
    <label id="convLabel" style="display:none"> Conversation: <select id="conversation">
      <option value="">Latest for this site</option>
    </select></label>
    <br><br>
    <input id="q" type="text" placeholder="e.g. Summarize the last reply" size="50" />
    <button type="submit">Ask</button>
  </form>
  <pre id="out" style="background:#f0f0f0; padding:1em; white-space:pre-wrap;"></pre>
  <script>
    const siteEl = document.getElementById('site');
    const convEl = document.getElementById('conversation');
    const convLabel = document.getElementById('convLabel');
    siteEl.addEventListener('change', async () => {
      const site = siteEl.value;
      convEl.innerHTML = '<option value="">Latest for this site</option>';
      convLabel.style.display = site ? 'inline' : 'none';
      if (!site) return;
      try {
        const r = await fetch('/conversations');
        const j = await r.json();
        const list = j[site] || [];
        list.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.id + ' (' + c.messageCount + ' msgs)';
          convEl.appendChild(opt);
        });
      } catch (e) { convLabel.style.display = 'none'; }
    });
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const q = document.getElementById('q').value.trim();
      if (!q) return;
      const site = siteEl.value || undefined;
      const conversationId = convEl.value || undefined;
      const out = document.getElementById('out');
      out.textContent = 'Loading...';
      try {
        const r = await fetch('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, site, conversationId }) });
        const j = await r.json();
        out.textContent = r.ok ? JSON.stringify(j, null, 2) : 'Error: ' + (j.error || r.status);
      } catch (err) { out.textContent = 'Error: ' + err.message; }
    };
  </script>
</body>
</html>
`;

const httpServer = createServer((req, res) => {
  const cors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  if (req.method === 'OPTIONS') {
    cors();
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/conversations') {
    cors();
    res.setHeader('Content-Type', 'application/json');
    const conversations: Record<string, Array<{ id: string; messageCount: number }>> = { chatgpt: [], gemini: [], claude: [] };
    for (const site of VALID_SITES) {
      const keys = keysBySite[site];
      if (keys) {
        for (const fileKey of keys) {
          const ctx = contextByKey.get(`${site}-${fileKey}`);
          if (ctx) conversations[site].push({ id: fileKey, messageCount: ctx.messages.length });
        }
      }
    }
    res.writeHead(200);
    res.end(JSON.stringify(conversations));
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/ask')) {
    cors();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(askPage);
    return;
  }

  if (req.method === 'POST' && req.url === '/ask') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      cors();
      res.setHeader('Content-Type', 'application/json');
      try {
        const { question, provider = 'openai', site: requestedSite, conversationId: requestedConversationId } = JSON.parse(body || '{}');
        if (!question || typeof question !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Body must be { "question": "..." }. Optional: "site", "conversationId", "provider".' }));
          return;
        }
        let context: ScrapedContext | null = null;
        if (requestedSite && VALID_SITES.includes(requestedSite)) {
          const site = requestedSite as Site;
          if (requestedConversationId != null && String(requestedConversationId).trim()) {
            const key = `${site}-${sanitizeFileKey(String(requestedConversationId).trim())}`;
            context = contextByKey.get(key) ?? null;
          }
          if (!context) context = lastBySite[site] ?? null;
        }
        if (!context) context = latestContext;
        if (!context) {
          res.writeHead(503);
          res.end(JSON.stringify({
            error: requestedSite
              ? (requestedConversationId
                ? `No context for site "${requestedSite}" conversation "${requestedConversationId}". Open that chat with the extension connected.`
                : `No context yet for site "${requestedSite}". Open that chat with the extension connected.`)
              : 'No scraped context yet. Open an LLM chat with the extension connected.',
          }));
          return;
        }
        const result = buildLLMMessages(context, question, {
          provider: provider === 'anthropic' ? 'anthropic' : 'openai',
          includeSystemPrompt: true,
        });
        res.writeHead(200);
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`WebSocket server: ws://127.0.0.1:${WS_PORT} (extension connects here)`);
  console.log(`HTTP server:      http://127.0.0.1:${HTTP_PORT} (open in browser or POST /ask)`);
  console.log(`Data files:       ${DATA_DIR} (<site>-<conversationId>.json per conversation)`);
  console.log('');
  console.log('1. Load extension from dist/chrome-mv3');
  console.log('2. Open ChatGPT, Gemini, or Claude — each chat gets its own file (e.g. chatgpt-abc123.json)');
  console.log('3. Open http://127.0.0.1:9849 and pick site + conversation + question, or:');
  console.log('   curl -X POST http://127.0.0.1:9849/ask -H "Content-Type: application/json" -d \'{"question":"...", "site":"gemini", "conversationId":"xyz"}\'');
});
