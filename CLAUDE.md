# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**SideFlow** is a two-part system: a Chrome extension that scrapes AI chat conversations (ChatGPT, Gemini, Claude) and a companion Electron desktop app that receives that context and lets users ask follow-up questions via a floating overlay — all running locally.

This is an npm workspaces monorepo at the root. Always install from the repo root:

```bash
npm install
```

## Development commands

### Desktop overlay (Electron + Vite + React)

```bash
cd apps/desktop-overlay
npm run dev          # runs Vite on :5173 and launches Electron against it
npm run build        # tsc + vite build (produces dist/)
npm run dist:mac     # build + electron-builder for macOS
npm run dist:win     # build + electron-builder for Windows
```

### Extension (WXT / Chrome MV3)

```bash
cd apps/extension
npm run dev          # WXT dev mode with hot reload
npm run build        # produces dist/chrome-mv3/ — load this in Chrome
npm run dev:server   # standalone Node dev server (WebSocket + /ask endpoint)
npm run test:server  # minimal WebSocket test server
```

After `npm run build`, load `apps/extension/dist/chrome-mv3` via `chrome://extensions → Load unpacked`.

**Important:** The desktop app and `dev:server` both bind to `ws://127.0.0.1:9847`. Only one may run at a time.

## Architecture

### Data flow

```
Browser tab (ChatGPT/Gemini/Claude)
  └─ content.ts (DOM scraper + MutationObserver)
       └─ chrome.runtime.sendMessage → background.ts
            └─ NativeMessagingBridge (com.sideflow.nmh)
                 └─ native-host/sideflow-native-host.js  ← separate Node process
                      └─ WebSocket ws://127.0.0.1:9847
                           └─ extension-bridge.js (Electron main)
                                └─ desktop-state.js store
                                     └─ IPC push → overlayWindow + managerWindow
```

### Electron main process (`apps/desktop-overlay/electron/`)

- **`main.js`** — entry point; creates two `BrowserWindow`s, registers IPC handlers, starts the WebSocket bridge, registers Native Messaging hosts on startup.
- **`extension-bridge.js`** — WebSocket server (`startExtensionBridge`); handles auth handshake with bridge token, receives `site_detected`/`chat_update`/`site_left`, updates the store.
- **`desktop-state.js`** — `createDesktopStateStore()`: in-memory + persisted state for providers, models, conversations (scraped), sideflowChats (follow-up Q&A), preferences. Persisted to Electron `userData`. API keys encrypted via `safeStorage` in `desktop-secrets.bin`; bridge token in `bridge-token.json`; orb position in `overlay-state.json`.
- **`llm-inference.js`** — `streamInference()` via `@langchain/openai`'s `ChatOpenAI` (all providers use the OpenAI-compatible interface including Ollama/OpenRouter/custom).
- **`llm-context.js`** — assembles the LLM message array: system prompt with scraped conversation context + prior SideFlow chat history + new user question.
- **`assistant.js`** — `runAssistantTurn()`: orchestrates context lookup, model selection, inference streaming, and SideFlow chat persistence.
- **`preload.js`** — exposes `window.electronAPI` via `contextBridge` with all IPC channels the renderer needs.
- **`constants.js`** — shared constants for both Electron main and the native host (loaded as plain CommonJS).

### Two Electron windows, one React app

Both windows load the same Vite build. `src/App.tsx` dispatches to `OverlayApp` or `ManagerApp` based on `?view=overlay|manager` URL param.

- **overlayWindow** — frameless, transparent, always-on-top; renders the draggable orb (collapsed, 72×72) or the chat panel (expanded, 380×488). Global shortcut `Ctrl+Q` toggles modes.
- **managerWindow** — standard chrome window (1280×860); settings, model/provider config, conversation list.

State is broadcast from main to both windows via IPC channels: `desktop-state`, `models-state`, `ctx`, `overlay-mode`, `overlay-bounds-changed`.

### Extension (`apps/extension/src/`)

- **`entrypoints/background.ts`** — service worker; manages `NativeMessagingBridge` lifecycle, queues messages when disconnected, relays scraper payloads to the desktop, handles extension icon state.
- **`entrypoints/content.ts`** — injected into ChatGPT/Gemini/Claude tabs; picks the right scraper, starts a `MutationObserver`, sends `site_detected` + `chat_update` messages, emits `site_left` on unload.
- **`lib/native-messaging-bridge.ts`** — `NativeMessagingBridge` class; connects to `com.sideflow.nmh`, exponential backoff reconnect (`[1s, 2s, 5s, 10s, 30s]`).
- **`lib/scrapers/`** — site-specific scrapers (`chatgpt.ts`, `gemini.ts`, `claude.ts`) all share `base.ts` utilities (`createDOMObserver`, `deduplicateMessagesByContent`). Each exposes `scrape()` → `ScrapedContext` and `observe(callback)` → teardown fn.
- **`lib/sites.ts`** — `CHAT_URL_PATTERNS` and `isSupportedChatUrl()` — keep in sync with content script `matches` in `content.ts` and `wxt.config.ts`.

### Auth / security

The extension authenticates to the desktop WebSocket with a random 32-byte hex token stored in `bridge-token.json`. The native host reads this file and forwards it as `{ type: "auth", token }`. The extension ID is fixed via a `key` in the WXT manifest so the WebSocket origin allowlist (`allowed-origins.json`) stays stable.

### Supported providers (desktop)

OpenAI, Anthropic, OpenRouter, Gemini, Ollama, Custom — all routed through `@langchain/openai`'s `ChatOpenAI` with configurable `baseURL`. Ollama uses `http://127.0.0.1:11434/v1`.
