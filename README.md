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

## Recent changes

- **Monorepo workspaces** — Root `package.json` uses npm workspaces (`apps/*`) so dependencies install from the repo root.
- **Desktop overlay (Electron)** — `apps/desktop-overlay` is a floating always-on-top companion: draggable orb, expandable chat panel, streaming-style replies (demo content for now), and basic window state saved under Electron user data.
- **Extension** — Browser action popup UI, refreshed icons, tighter scrapers and WebSocket behavior, and dev helpers (`dev-server-with-ask`, debug scripts). See [apps/extension/TESTING.md](apps/extension/TESTING.md) for runbook details.

---

## What we're working on now

Work is sequenced in three phases:

1. **App UI** — Finish the interface for the extension popup and the desktop overlay (layout, flows, connection and loading states, chat affordances). Polish comes after the core shell is in place.
2. **Context backend** — Solidify the local server path: scraped conversation context, WebSocket delivery, storage/shape of context for follow-up questions, and a clean API for clients (extension + desktop).
3. **Models & Ollama** — Hook up inference: route asks through the backend, then add **Ollama** (and other model backends) so replies run locally or via whichever provider you configure.

After that: tighter integration (desktop ↔ same server as the extension), persistence where it helps, and documented installs for the Chrome build plus the desktop app.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Extension | [WXT](https://wxt.dev) (Chrome MV3), TypeScript |
| Desktop overlay | Electron, Vite, React, Tailwind CSS, Framer Motion |
| Scraping | DOM + `MutationObserver`, site-specific scrapers (ChatGPT, Gemini, Claude) |
| Transport | WebSocket (extension ↔ local server) |
| Dev server | Node.js, `ws`, TypeScript (`tsx`) — context files + `/ask` |
| LLM-ready format | `buildLLMMessages()` for OpenAI & Anthropic message shapes |

---

## Current status

**Shipped (baseline):** Chrome extension (ChatGPT, Gemini, Claude) with scrapers, tab-focus handling, WebSocket to a local dev server, per-chat context files, `buildLLMMessages()`, and `/ask`. Desktop app: floating Electron shell (orb + panel) with demo streaming replies.

**Roadmap:** **1.** App UI (extension + desktop) → **2.** Context backend (solid local server + contract for clients) → **3.** Models and **Ollama** (and other backends). Then persistence, polish, and shipping installable extension + desktop builds.

---

## Quick start

**Prerequisites:** Node.js 18+, Chrome (for the extension). For the desktop app, a desktop OS supported by Electron.

### Option A — Install everything from the repo root (workspaces)

```bash
git clone https://github.com/ameymalhotra/SideFLow.git
cd SideFLow
npm install
```

Then use the per-app commands below from `apps/extension` or `apps/desktop-overlay`.

### Option B — Extension only

```bash
git clone https://github.com/ameymalhotra/SideFLow.git
cd SideFLow/apps/extension
npm install
```

**1. Dev server** (scraped context + `/ask`; writes under `apps/extension/scripts/data/`)

```bash
npm run dev:server
```

WebSocket on `ws://127.0.0.1:9847`.

**2. Build and load the extension**

```bash
npm run build
```

Chrome: `chrome://extensions/` → Developer mode → **Load unpacked** → `apps/extension/dist/chrome-mv3`.

**3. Try it** — Open ChatGPT, Gemini, or Claude and chat; inspect JSON under `scripts/data/` to verify parsing.

### Desktop overlay (Electron)

From `apps/desktop-overlay` after a root or local `npm install`:

```bash
cd apps/desktop-overlay
npm run dev
```

This runs Vite on `http://localhost:5173` and launches Electron against it. Use **File → Quit** or the app menu to exit (global shortcuts may be registered while the app runs).

For detailed extension steps, reconnection, and troubleshooting, see [apps/extension/TESTING.md](apps/extension/TESTING.md).

---

## Project structure

```
SideFLow/
├── package.json             # npm workspaces (apps/*)
├── apps/
│   ├── extension/           # Chrome extension + dev server + scrapers
│   │   ├── src/entrypoints/ # background, content, popup
│   │   ├── src/lib/         # scrapers, WebSocket, buildLLMMessages
│   │   ├── scripts/         # dev server, tests, debug helpers
│   │   └── public/          # icons
│   └── desktop-overlay/     # Electron + Vite + React floating UI
│       ├── electron/        # main & preload
│       └── src/             # React app (orb, chat panel)
└── README.md
```

---

## Building in public

This repo is the main place for the code. I'll post progress, demos, and decisions on social as I go—follow along and feel free to open issues or discussions.

---

## License

Open source under the [MIT License](LICENSE). You're welcome to use, modify, and distribute the code.
