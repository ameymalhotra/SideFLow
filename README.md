# SideFLow

**Ask follow-up questions about your ChatGPT, Gemini, or Claude conversations—without leaving the page.**

Open source (MIT). I'm building this in public—progress updates will be posted on social as the project grows.

---

## What it solves

- You're in a long AI chat and want a quick summary or clarification without adding more messages to the same thread.
- Copy-pasting the conversation into another tool is tedious and breaks your flow.
- **SideFLow** captures the current chat automatically and sends it to a local server (nothing leaves your machine).
- You can ask follow-up questions (e.g. "Summarize the last reply" or "Explain that code") in full context from a simple overlay or panel—no pasting, no clutter.

---

## Tech stack

| Layer            | Tech                                                    |
|------------------|---------------------------------------------------------|
| Extension        | [WXT](https://wxt.dev) (Chrome MV3), TypeScript         |
| Scraping         | DOM + MutationObserver, site-specific scrapers          |
| Transport        | WebSocket (extension ↔ local server)                    |
| Dev server       | Node.js, `ws`, TypeScript (tsx)                         |
| LLM-ready format | Custom builder for OpenAI & Anthropic message shapes    |

---

## Current status

| Done | Planned |
|------|---------|
| Chrome extension for ChatGPT, Gemini, Claude | Desktop overlay app (Tauri/Electron) |
| Scrape messages, dedupe, send on change | In-overlay input + live LLM answers |
| Tab switch detection (re-send context when you focus a tab) | Polished UI, optional persistence |
| Per-conversation storage (one file per chat) | Ship installable extension + desktop companion |
| Local dev server with /ask + per-site, per-chat files | |
| `buildLLMMessages()` for overlay questions | |

---

## Quick start

**Prerequisites:** Node.js 18+, Chrome

1. **Clone and install**
   ```bash
   git clone https://github.com/ameymalhotra/SideFLow.git
   cd SideFLow/apps/extension
   npm install
   ```

2. **Start the dev server** (stores context, serves a simple "ask" page)
   ```bash
   npm run dev:server
   ```
   You'll see WebSocket on `ws://127.0.0.1:9847` and HTTP on `http://127.0.0.1:9849`.

3. **Build and load the extension**
   ```bash
   npm run build
   ```
   In Chrome: `chrome://extensions/` → Developer mode → **Load unpacked** → select `apps/extension/dist/chrome-mv3`.

4. **Try it:** Open ChatGPT, Gemini, or Claude and have a conversation. Then open **http://127.0.0.1:9849**, pick the site (and conversation if you have several), type a question like "Summarize the last reply," and click Ask. You'll see the LLM-ready payload built from that chat's context.

For detailed steps, reconnection, and troubleshooting, see [apps/extension/TESTING.md](apps/extension/TESTING.md).

---

## Project structure

```
SideFLow/
├── apps/extension/          # Chrome extension + dev server
│   ├── src/
│   │   ├── entrypoints/     # background, content script
│   │   └── lib/             # scrapers, WebSocket, buildLLMMessages
│   ├── scripts/             # dev server, test WS server, test scripts
│   └── public/              # icons
└── README.md
```

---

## Building in public

This repo is the main place for the code. I'll post progress, demos, and decisions on social as I go—follow along and feel free to open issues or discussions.

---

## License

Open source under the [MIT License](LICENSE). You're welcome to use, modify, and distribute the code.
