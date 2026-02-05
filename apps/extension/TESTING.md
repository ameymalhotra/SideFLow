# Testing the Overlay AI Connector Extension

## Prerequisites

- Chrome (or another Chromium browser)
- Node.js 18+

## Step 1: Build the extension

From the extension directory:

```bash
cd apps/extension
npm run build
```

You should see output like `Built extension in ... ms` and a list of files under `dist/chrome-mv3/`.

## Step 2: Start the mock WebSocket server

In a **separate terminal**, start the test server (so you can see messages from the extension):

```bash
cd apps/extension
npm run test:server
```

You should see:

```
Mock WebSocket server listening on ws://127.0.0.1:9847
Load the extension and open an LLM chat to see messages.
```

Leave this terminal open; messages will appear here when you use the extension.

## Step 3: Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Turn **Developer mode** on (toggle in the top-right).
3. Click **Load unpacked**.
4. Choose the folder: **`apps/extension/dist/chrome-mv3`** (the `dist` folder appears after you run `npm run build`; pick the **chrome-mv3** subfolder).
5. The extension should appear in the list (e.g. "Overlay AI Connector").

## Step 4: Check connection status

- **Before the server is running:** The extension icon should show the **disconnected** state (grey), and the tooltip: "Overlay AI - Disconnected".
- **After starting the server (Step 2):** Within a few seconds the icon should switch to the **connected** state (green) and the tooltip: "Overlay AI - Connected".

If it stays disconnected, make sure the mock server is running and that nothing else is using port 9847.

## Step 5: Test on an LLM chat site

1. Open a new tab and go to one of:
   - https://chat.openai.com or https://chatgpt.com
   - https://gemini.google.com
   - https://claude.ai
2. Log in if needed and start or open a conversation.
3. Send a message and wait for a reply.

In the **terminal where the mock server is running** you should see:

- `Extension connected from ...` when the extension connects.
- `Received: { "type": "site_detected", "site": "chatgpt", "url": "...", "messages": [...] }` when the page loads.
- `Received: { "type": "chat_update", ... }` when you send a message or the model replies.

That confirms the extension is scraping the chat and sending it to the server.

## Using buildLLMMessages with live scraped data

To try **real-time** conversion (scraped context → LLM-ready messages) while you chat:

1. **Use the dev server instead of the plain mock server** (only one can use port 9847 at a time):
   ```bash
   cd apps/extension
   npm run dev:server
   ```
   This starts:
   - The same WebSocket server on **9847** (extension connects here and context is stored).
   - An HTTP server on **9849** with a simple “ask” flow.

2. **Load the extension** and **open an LLM chat** (ChatGPT, Gemini, or Claude) and have a short conversation so the server has context.

3. **Ask a question** in either of these ways:
   - **Browser:** Open **http://127.0.0.1:9849** in a new tab. Type a question (e.g. “Summarize the last reply”) and click **Ask**. The page shows the LLM-ready payload (messages + optional system) that `buildLLMMessages` produced from the current scraped context.
   - **Terminal:**  
     ```bash
     curl -X POST http://127.0.0.1:9849/ask \
       -H "Content-Type: application/json" \
       -d '{"question":"Summarize the last reply"}'
     ```
   Optional: use Anthropic shape with `"provider":"anthropic"` in the JSON body.

If you see `503` or “No scraped context yet”, the extension hasn’t sent a `chat_update` yet—reload the LLM tab or send a message so the server receives context.

## Step 6: Test reconnection (optional)

1. Stop the mock server (Ctrl+C in that terminal).
2. In Chrome, the extension icon should switch back to **disconnected**.
3. Start the server again: `npm run test:server`.
4. The icon should switch back to **connected** within a few seconds (after the extension’s retry delay).

## Step 7: Test on multiple sites (optional)

Repeat Step 5 on the other LLM sites (ChatGPT, Gemini, Claude). The `site` field in the server logs should match (`chatgpt`, `gemini`, or `claude`).

---

## Can't find the extension folder?

- You must run **Step 1** (`npm run build`) first. The folder to load is created by the build.
- Load the **`chrome-mv3`** subfolder, not the root: `apps/extension/dist/chrome-mv3`. That folder contains `manifest.json`.
- In the "Load unpacked" dialog you can paste or type the path. From the project root it is: `apps/extension/dist/chrome-mv3` (or use the full path, e.g. `/Users/.../overlay-ai/apps/extension/dist/chrome-mv3`).

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Icon stays disconnected | Ensure the mock server is running on port 9847 and no firewall is blocking localhost. |
| No messages in server log | Reload the LLM tab (F5). Check that the URL matches the supported sites. |
| "Extension context invalidated" | Reload the extension at `chrome://extensions/` (click the refresh icon), then reload the LLM tab. |
| Build errors | Run `npm install` in `apps/extension`, then `npm run build` again. |

## Testing in Safari (macOS only)

1. Build for Safari: `npm run build:safari`.
2. Output is in `.output/safari-mv2/`.
3. In Safari: **Develop → Allow Unsigned Extensions** (if needed), then **Safari → Settings → Extensions** and add the built extension. Safari may require an Xcode wrapper for development; see [WXT Safari docs](https://wxt.dev/guide/browser-support/safari.html).
