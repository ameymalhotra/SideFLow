# Testing the SideFlow Extension

## Prerequisites

- Chrome (or another Chromium browser)
- Node.js 18+ on your PATH (used by the Native Messaging host that bridges to the desktop app)
- **SideFlow Desktop** running (`apps/desktop-overlay`) so it can:
  - listen on the local WebSocket `ws://127.0.0.1:9847`
  - write `bridge-token.json` under Electron user data
  - register the Chrome Native Messaging host manifest (`com.sideflow.nmh.json`) under your browser profile

## Step 1: Build the extension

From the extension directory:

```bash
cd apps/extension
npm run build
```

You should see output like `Built extension in ... ms` and a list of files under `dist/chrome-mv3/`.

The manifest includes a fixed `key` so the extension ID is stable (`chrome-extension://mjciggeibjlglhiamfclofgcmgmjpbee/`), matching [allowed-origins.json](../desktop-overlay/electron/native-host/allowed-origins.json) in the desktop app.

## Step 2: Start SideFlow Desktop

In a **separate terminal**:

```bash
cd apps/desktop-overlay
npm install   # once, to install the `ws` dependency for the native host
npm run dev
```

Leave this running. On startup the app registers Native Messaging manifests pointing at `electron/native-host/sideflow-native-host.js` (macOS/Linux) or `launch-win.cmd` (Windows).

## Step 3: Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Turn **Developer mode** on (toggle in the top-right).
3. Click **Load unpacked**.
4. Choose **`apps/extension/dist/chrome-mv3`**.
5. If the desktop app was launched after the extension, give the extension up to a minute to reconnect automatically. Reloading the extension is now only a fallback, not the normal flow.

## Step 4: Check connection status

- **Desktop not running:** The extension icon should show **disconnected** (grey).
- **Desktop running:** Within a few seconds the icon should show **connected** (green), meaning the Native Messaging port is open and the host process is proxying to the desktop WebSocket.

If it stays disconnected:

- Confirm Node is on your PATH (`node -v`).
- Confirm manifests exist, e.g. on macOS:  
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sideflow.nmh.json`
- Open the extension service worker / background page in Chrome DevTools and check for Native Messaging errors.

## Step 5: Test on an LLM chat site

1. Open ChatGPT, Gemini, or Claude (supported URLs).
2. Chat as usual; the desktop app should receive `site_detected` / `chat_update` traffic via the bridge.

## Mock WebSocket server (extension transport bypass)

The extension **no longer** opens a raw WebSocket to port 9847. To test **only** the WebSocket protocol (without Native Messaging), run:

```bash
cd apps/extension
npm run test:server
```

Use a WebSocket client or scripts against `ws://127.0.0.1:9847` with the auth handshake from [desktop-state bridge token](../desktop-overlay/electron/desktop-state.js). This does **not** exercise the Chrome extension path.

## Dev server with `/ask` (scraped JSON files)

```bash
cd apps/extension
npm run dev:server
```

Do not run this on 9847 at the same time as SideFlow Desktop. Stop one before starting the other.

## Reconnection

1. Quit SideFlow Desktop.
2. The extension should show disconnected.
3. Start the desktop again; the extension should reconnect after its retry backoff.

## Can't find the extension folder?

- Run **`npm run build`** first.
- Load **`chrome-mv3`**, not the repo root: `apps/extension/dist/chrome-mv3`.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Icon stays disconnected | Run SideFlow Desktop; ensure Node is on PATH; verify `com.sideflow.nmh.json` under Chrome’s `NativeMessagingHosts` folder. |
| Wrong extension ID | Use the built extension with the committed manifest `key`, or add your origin to `allowed-origins.json` and restart the desktop app. |
| "Specified native messaging host not found" | Confirm the `path` inside `com.sideflow.nmh.json` points to a real file. The extension retries automatically, but a manual reload is still a valid fallback if Chrome has cached the missing host state. |

## Testing in Safari / Firefox

Native Messaging differs by browser. This flow targets **Chrome** (Chromium). Firefox uses `allowed_extensions` in the host manifest; Safari does not use Chrome’s Native Messaging—treat as follow-up.
