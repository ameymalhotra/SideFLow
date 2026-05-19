# SideFLow

**A local desktop companion for ChatGPT, Claude, and Gemini.**

SideFLow captures the context from the AI chat you already have open in your browser, then lets you ask follow-up questions in a separate desktop overlay without copy-pasting the thread somewhere else.

The goal is to make this usable as a real product people can download and run locally, not just a demo. The repo is open source under MIT, and contributions are welcome.

---

## What SideFLow does

- Captures chat context from supported sites: ChatGPT, Claude, and Gemini.
- Syncs that context from the browser extension to the desktop app over a local bridge.
- Lets you ask follow-up questions in a floating desktop UI instead of cluttering the original thread.
- Keeps the transport local to your machine.
- Supports multiple model providers in the desktop app, including OpenAI, Anthropic, OpenRouter, Gemini, Ollama, and custom OpenAI-compatible endpoints.

---

## How it works

SideFLow is a two-part local system:

1. A browser extension watches supported AI chat pages and extracts the current conversation.
2. The extension sends that context to the desktop app through Chrome Native Messaging.
3. The desktop app stores the synced context locally and uses it to answer follow-up questions in the overlay.

Current transport path:

`Browser tab -> extension -> Chrome Native Messaging host -> local WebSocket bridge -> SideFLow desktop app`

---

## Current status

What is working now:

- Chrome extension for ChatGPT, Claude, and Gemini
- Desktop app with overlay and manager UI
- Native Messaging bridge between the extension and desktop app
- Local conversation syncing
- Desktop-side follow-up chat flow
- Configurable providers and models
- Packaging scripts for desktop builds via Electron Builder

What is still maturing:

- End-user packaging and installation polish
- Cross-platform setup validation
- Browser support beyond the current Chromium-first path
- More testing, release automation, and onboarding improvements

Today, the most reliable way to use SideFLow is to run it from source. The codebase is being shaped toward downloadable desktop releases and a smoother install flow.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Extension | [WXT](https://wxt.dev) (Chrome MV3), TypeScript |
| Desktop app | Electron, Vite, React, Tailwind CSS, Framer Motion |
| Bridge | Chrome Native Messaging -> local Node host -> WebSocket (`127.0.0.1:9847`) |
| Models | `@langchain/openai`, `@langchain/anthropic`, Ollama, OpenAI-compatible APIs |
| Scraping | DOM + `MutationObserver`, site-specific scrapers |

---

## Install and run

### Prerequisites

- Node.js 18+
- npm
- Chrome or another Chromium-based browser for the extension flow
- macOS, Windows, or Linux supported by Electron for the desktop app

### Clone and install

```bash
git clone https://github.com/ameymalhotra/SideFLow.git
cd SideFLow
npm install
```

### Start the desktop app

```bash
cd apps/desktop-overlay
npm run dev
```

This launches the Electron app and registers the local Native Messaging host manifest for supported Chromium browsers on your machine.

### Build and load the extension

In a second terminal:

```bash
cd apps/extension
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, click **Load unpacked**, and select:

`apps/extension/dist/chrome-mv3`

### Use it

1. Keep the desktop app running.
2. Open ChatGPT, Claude, or Gemini in Chrome.
3. Wait for the extension to connect to the desktop app.
4. Ask your follow-up question inside SideFLow.

For extension-specific testing and troubleshooting, see [apps/extension/TESTING.md](apps/extension/TESTING.md).

---

## Desktop build scripts

The desktop app includes packaging scripts:

```bash
cd apps/desktop-overlay
npm run dist
npm run dist:mac
npm run dist:win
```

These are part of the path toward installable releases. If you are contributing release or packaging work, start here.

---

## Developer notes

- This is an npm workspaces monorepo rooted at `apps/*`.
- The desktop app and the extension dev server both use port `9847`; do not run both at the same time.
- The extension no longer connects directly to a raw WebSocket in normal usage; the primary path is Native Messaging to the desktop app.
- The extension dev server exists mainly for debugging scraped context and protocol behavior.

---

## Project structure

```text
SideFLow/
├── package.json
├── apps/
│   ├── desktop-overlay/     # Electron desktop app
│   │   ├── electron/        # main process, native host, local bridge
│   │   └── src/             # React UI for overlay + manager
│   └── extension/           # browser extension
│       ├── src/entrypoints/ # background, content, popup
│       ├── src/lib/         # scrapers, site helpers, native bridge
│       └── scripts/         # debug and dev helpers
└── README.md
```

---

## Contributing

Contributions are welcome.

Useful contribution areas right now:

- installation and packaging improvements
- desktop UX polish
- extension reliability across supported sites
- cross-browser support
- tests and release automation
- documentation and onboarding

If you want to contribute:

1. Open an issue for bugs, product gaps, or proposed features.
2. If you already know the change you want to make, open a PR directly.
3. Keep changes scoped and explain the user-facing impact.

If you are picking up packaging or install work, please keep the README and testing docs in sync with the actual flow.

---

## License

Open source under the [MIT License](LICENSE).
