const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  WS_PORT,
  OVERLAY_PANEL_SIZE,
  ORB_SIZE,
  MANAGER_SIZE,
  BROADCAST_DEBOUNCE_MS,
} = require('./constants');
const { createDesktopStateStore, getOrCreateBridgeToken } = require('./desktop-state');
const { registerNativeMessagingHosts } = require('./register-native-messaging');
const { startExtensionBridge } = require('./extension-bridge');
const { runAssistantTurn } = require('./assistant');

const APP_PROTOCOL = 'sideflow';
let overlayWindow;
let managerWindow;
let overlayMode = 'collapsed';
let broadcastDesktopTimer = null;
let orbPosition = null;
let wsServer = null;
const desktopStore = createDesktopStateStore();
let pendingProtocolUrl = null;

function getShowFloatingOrb() {
  return desktopStore.getState().preferences?.showFloatingOrb !== false;
}

/** Collapsed: show small orb or hide window. Expanded: always show. */
function applyFloatingOrbVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayMode === 'expanded') {
    overlayWindow.show();
    return;
  }
  if (getShowFloatingOrb()) {
    setCollapsedBounds();
    overlayWindow.show();
  } else {
    overlayWindow.hide();
  }
}

function parseProtocolTarget(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${APP_PROTOCOL}:`) return null;
    const host = parsed.hostname || '';
    const pathName = parsed.pathname.replace(/^\/+/, '');
    const target = (host || pathName || 'manager').toLowerCase();
    return target === 'orb' ? 'orb' : 'manager';
  } catch {
    return null;
  }
}

function handleProtocolUrl(rawUrl) {
  const target = parseProtocolTarget(rawUrl);
  if (!target) return false;
  if (
    !app.isReady() ||
    (target === 'orb' && (!overlayWindow || overlayWindow.isDestroyed())) ||
    (target === 'manager' && (!managerWindow || managerWindow.isDestroyed()))
  ) {
    pendingProtocolUrl = rawUrl;
    return true;
  }
  if (target === 'orb') {
    focusOrb();
  } else {
    showManagerWindow();
  }
  return true;
}

function getStatePath() {
  return path.join(app.getPath('userData'), 'overlay-state.json');
}

function readSavedState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      orbPosition = { x: Math.round(parsed.x), y: Math.round(parsed.y) };
    }
  } catch (err) {
    console.error('[SideFlow] readSavedState failed:', err);
  }
}

function saveState() {
  if (!orbPosition) return;
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(orbPosition), 'utf8');
  } catch (err) {
    console.error('[SideFlow] saveState failed:', err);
  }
}

function getCombinedWorkArea() {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return screen.getPrimaryDisplay().workArea;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const display of displays) {
    const bounds = display.workArea;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampToAllDisplays(x, y, width, height) {
  const bounds = getCombinedWorkArea();
  return {
    x: Math.min(Math.max(Math.round(x), bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(Math.round(y), bounds.y), bounds.y + bounds.height - height),
  };
}

function getDefaultOrbPosition() {
  const bounds = screen.getPrimaryDisplay().workArea;
  return {
    x: bounds.x + bounds.width - ORB_SIZE.width - 24,
    y: bounds.y + bounds.height - ORB_SIZE.height - 24,
  };
}

function getCurrentOrbPosition() {
  const fallback = orbPosition ?? getDefaultOrbPosition();
  return clampToAllDisplays(fallback.x, fallback.y, ORB_SIZE.width, ORB_SIZE.height);
}

function setCollapsedBounds() {
  if (!overlayWindow) return;
  const next = getCurrentOrbPosition();
  overlayWindow.setBounds({ x: next.x, y: next.y, width: ORB_SIZE.width, height: ORB_SIZE.height }, false);
}

function setExpandedBounds() {
  if (!overlayWindow) return;
  const orb = getCurrentOrbPosition();
  const orbCenterX = orb.x + ORB_SIZE.width / 2;
  const orbCenterY = orb.y + ORB_SIZE.height / 2;
  const target = clampToAllDisplays(
    orbCenterX - OVERLAY_PANEL_SIZE.width / 2,
    orbCenterY - OVERLAY_PANEL_SIZE.height / 2,
    OVERLAY_PANEL_SIZE.width,
    OVERLAY_PANEL_SIZE.height,
  );
  overlayWindow.setBounds(
    { x: target.x, y: target.y, width: OVERLAY_PANEL_SIZE.width, height: OVERLAY_PANEL_SIZE.height },
    false,
  );
}

function getExpansionInfo() {
  const orb = getCurrentOrbPosition();
  const orbCenterX = orb.x + ORB_SIZE.width / 2;
  const orbCenterY = orb.y + ORB_SIZE.height / 2;
  const target = clampToAllDisplays(
    orbCenterX - OVERLAY_PANEL_SIZE.width / 2,
    orbCenterY - OVERLAY_PANEL_SIZE.height / 2,
    OVERLAY_PANEL_SIZE.width,
    OVERLAY_PANEL_SIZE.height,
  );
  const orbLeft = orbCenterX - target.x;
  const orbTop = orbCenterY - target.y;
  return {
    orbLeft,
    orbTop,
    originX: (orbLeft / OVERLAY_PANEL_SIZE.width) * 100,
    originY: (orbTop / OVERLAY_PANEL_SIZE.height) * 100,
  };
}

function loadRenderer(windowRef, view) {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    windowRef.loadURL(`http://localhost:5173/?view=${view}`);
  } else {
    windowRef.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view } });
  }
}

function sendToWindow(windowRef, channel, payload) {
  if (!windowRef || windowRef.isDestroyed()) return;
  windowRef.webContents.send(channel, payload);
}

function getActiveContextLabel() {
  const state = desktopStore.getState();
  const activeConversation =
    state.conversations.find((item) => item.id === state.activeConversationId) ?? state.conversations[0] ?? null;
  if (!activeConversation) return 'Waiting for extension context';
  return `${activeConversation.site.toUpperCase()} • ${activeConversation.lastMessagePreview}`;
}

function getActiveConversation() {
  const state = desktopStore.getState();
  return state.conversations.find((item) => item.id === state.activeConversationId) ?? state.conversations[0] ?? null;
}

/** True when a synced browser chat exists with at least one captured message (same bar as LLM context). */
function isChatContextAvailable() {
  const conv = getActiveConversation();
  return Boolean(conv && Array.isArray(conv.messages) && conv.messages.length > 0);
}

function getOverlayContextPayload() {
  const state = desktopStore.getState();
  return {
    label: getActiveContextLabel(),
    chatAvailable: isChatContextAvailable(),
    activeConversationId: state.activeConversationId,
  };
}

function broadcastDesktopState() {
  const state = desktopStore.getPublicState();
  sendToWindow(managerWindow, 'desktop-state', state);
  sendToWindow(overlayWindow, 'desktop-state', state);
  const modelsState = {
    models: state.connectedModels.map((model) => ({ id: model.id, label: model.label })),
    selectedId: state.selectedModelId,
  };
  sendToWindow(overlayWindow, 'models-state', modelsState);
  sendToWindow(managerWindow, 'models-state', modelsState);
  sendToWindow(overlayWindow, 'ctx', getOverlayContextPayload());
}

function scheduleBroadcastDesktopState() {
  if (broadcastDesktopTimer) {
    clearTimeout(broadcastDesktopTimer);
  }
  broadcastDesktopTimer = setTimeout(() => {
    broadcastDesktopTimer = null;
    broadcastDesktopState();
  }, BROADCAST_DEBOUNCE_MS);
}

function notifyMode() {
  sendToWindow(overlayWindow, 'overlay-mode', overlayMode);
}

function notifyBoundsChanged() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const bounds = overlayWindow.getBounds();
  sendToWindow(overlayWindow, 'overlay-bounds-changed', {
    mode: overlayMode,
    x: bounds.x,
    y: bounds.y,
  });
}

function resizeOverlayToMode(nextMode) {
  if (!overlayWindow) return;
  overlayMode = nextMode;
  if (nextMode === 'expanded') {
    setExpandedBounds();
    overlayWindow.show();
    overlayWindow.focus();
    sendToWindow(overlayWindow, 'focus-input');
  } else {
    setCollapsedBounds();
    if (getShowFloatingOrb()) {
      overlayWindow.show();
    } else {
      overlayWindow.hide();
    }
  }
  notifyBoundsChanged();
}

function focusOrb() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (getShowFloatingOrb()) {
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }
  resizeOverlayToMode('expanded');
  overlayWindow.focus();
  sendToWindow(overlayWindow, 'focus-input');
}

function showManagerWindow() {
  if (!managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.show();
  managerWindow.focus();
}

function registerAppProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    return;
  }
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

function createOverlayWindow() {
  readSavedState();
  const start = getCurrentOrbPosition();
  overlayWindow = new BrowserWindow({
    x: start.x,
    y: start.y,
    width: ORB_SIZE.width,
    height: ORB_SIZE.height,
    frame: false,
    transparent: true,
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    overlayWindow.setAlwaysOnTop(true, 'floating');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else if (process.platform === 'linux') {
    overlayWindow.setVisibleOnAllWorkspaces(true);
  }

  loadRenderer(overlayWindow, 'overlay');

  overlayWindow.once('ready-to-show', () => {
    applyFloatingOrbVisibility();
    notifyMode();
    scheduleBroadcastDesktopState();
  });
}

function createManagerWindow() {
  managerWindow = new BrowserWindow({
    width: MANAGER_SIZE.width,
    height: MANAGER_SIZE.height,
    minWidth: 1100,
    minHeight: 760,
    title: 'SideFlow Desktop',
    backgroundColor: '#0a111d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRenderer(managerWindow, 'manager');
  managerWindow.once('ready-to-show', () => {
    managerWindow.show();
    scheduleBroadcastDesktopState();
  });
  managerWindow.on('closed', () => {
    managerWindow = null;
  });
}

/**
 * Unpacked dev: skip the lock so a second `npm run dev` still runs Electron (otherwise the new process exits immediately and the WebSocket never starts). Packaged app always uses a single instance. Set SIDEFLOW_SINGLE_INSTANCE=1 in dev to test the real second-instance path.
 */
const skipSingleInstanceLock =
  !app.isPackaged &&
  process.env.NODE_ENV === 'development' &&
  process.env.SIDEFLOW_SINGLE_INSTANCE !== '1';
const singleInstanceLock = skipSingleInstanceLock ? true : app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const protocolArg = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith(`${APP_PROTOCOL}://`));
    if (protocolArg && handleProtocolUrl(protocolArg)) return;
    showManagerWindow();
    focusOrb();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    createOverlayWindow();
    createManagerWindow();
    wsServer = startExtensionBridge({
      desktopStore,
      scheduleBroadcast: scheduleBroadcastDesktopState,
      getBridgeToken: getOrCreateBridgeToken,
      electronApp: app,
    });

    let nmElectronDir = __dirname;
    if (app.isPackaged) {
      const unpackedElectron = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron');
      const hostJs = path.join(unpackedElectron, 'native-host', 'sideflow-native-host.js');
      if (fs.existsSync(hostJs)) {
        nmElectronDir = unpackedElectron;
      }
    }
    registerNativeMessagingHosts(nmElectronDir);

    const initialProtocolArg = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${APP_PROTOCOL}://`));
    if (pendingProtocolUrl) {
      const queuedUrl = pendingProtocolUrl;
      pendingProtocolUrl = null;
      handleProtocolUrl(queuedUrl);
    } else if (initialProtocolArg) {
      handleProtocolUrl(initialProtocolArg);
    }

  function isTrustedSender(event) {
    const senderId = event?.sender?.id;
    const overlayId = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.webContents.id : null;
    const managerId = managerWindow && !managerWindow.isDestroyed() ? managerWindow.webContents.id : null;
    return senderId != null && (senderId === overlayId || senderId === managerId);
  }

  const registeredShortcut = globalShortcut.register('Control+Q', () => {
    if (!overlayWindow) return;
    const nextMode = overlayMode === 'collapsed' ? 'expanded' : 'collapsed';
    overlayMode = nextMode;
    notifyMode();
  });
  if (!registeredShortcut) {
    console.warn('[SideFlow] Global shortcut Control+Q could not be registered.');
  }

  ipcMain.handle('desktop-launch-orb', (event) => {
    if (!isTrustedSender(event)) return;
    focusOrb();
  });

  ipcMain.handle('models-get-state', (event) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.getPublicState();
    return {
      models: state.connectedModels.map((model) => ({ id: model.id, label: model.label })),
      selectedId: state.selectedModelId,
    };
  });

  ipcMain.on('models-set-selected', (event, payload) => {
    if (!isTrustedSender(event)) return;
    desktopStore.setSelectedModel(payload ?? {});
    scheduleBroadcastDesktopState();
  });

  ipcMain.handle('overlay-get-expansion-info', (event) => {
    if (!isTrustedSender(event)) return null;
    return getExpansionInfo();
  });
  ipcMain.handle('overlay-prepare-expand', (event) => {
    if (!isTrustedSender(event)) return;
    if (!overlayWindow) return;
    setExpandedBounds();
    notifyBoundsChanged();
  });
  ipcMain.on('overlay-expand', (event) => {
    if (!isTrustedSender(event)) return;
    resizeOverlayToMode('expanded');
  });
  ipcMain.on('overlay-collapse', (event) => {
    if (!isTrustedSender(event)) return;
    resizeOverlayToMode('collapsed');
  });

  ipcMain.handle('overlay-get-state', (event) => {
    if (!isTrustedSender(event)) return null;
    const bounds = overlayWindow?.getBounds() ?? { x: 0, y: 0 };
    return { mode: overlayMode, x: bounds.x, y: bounds.y };
  });

  ipcMain.handle('overlay-move', (event, coords) => {
    if (!isTrustedSender(event)) return { x: 0, y: 0 };
    if (!overlayWindow) return { x: 0, y: 0 };
    const x = Number(coords?.x);
    const y = Number(coords?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const b = overlayWindow.getBounds();
      return { x: b.x, y: b.y };
    }
    const w = overlayMode === 'expanded' ? OVERLAY_PANEL_SIZE.width : ORB_SIZE.width;
    const h = overlayMode === 'expanded' ? OVERLAY_PANEL_SIZE.height : ORB_SIZE.height;
    const clamped = clampToAllDisplays(x, y, w, h);
    overlayWindow.setPosition(clamped.x, clamped.y, false);
    if (overlayMode === 'expanded') {
      const ox = Math.round(clamped.x + OVERLAY_PANEL_SIZE.width / 2 - ORB_SIZE.width / 2);
      const oy = Math.round(clamped.y + OVERLAY_PANEL_SIZE.height / 2 - ORB_SIZE.height / 2);
      orbPosition = clampToAllDisplays(ox, oy, ORB_SIZE.width, ORB_SIZE.height);
    } else {
      orbPosition = clamped;
    }
    notifyBoundsChanged();
    return clamped;
  });

  ipcMain.on('overlay-save-position', (event) => {
    if (!isTrustedSender(event)) return;
    saveState();
  });

  ipcMain.handle('desktop-set-preferences', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.setPreferences(payload ?? {});
    scheduleBroadcastDesktopState();
    applyFloatingOrbVisibility();
    notifyMode();
    return state;
  });

  ipcMain.handle('desktop-get-state', (event) => {
    if (!isTrustedSender(event)) return null;
    return desktopStore.getPublicState();
  });

  ipcMain.handle('desktop-save-api-key', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.saveApiKey(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-remove-api-key', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.removeApiKey(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-save-model', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.upsertModel(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-remove-model', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.removeModel(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-set-active-conversation', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.setActiveConversation(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-complete-onboarding', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.completeOnboarding(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('desktop-delete-conversation', (event, payload) => {
    if (!isTrustedSender(event)) return null;
    const state = desktopStore.deleteConversation(payload ?? {});
    scheduleBroadcastDesktopState();
    return state;
  });

  ipcMain.handle('assistant-ask', async (event, payload) => {
    if (!isTrustedSender(event)) return { ok: false, content: 'Untrusted sender.' };
    return runAssistantTurn(
      {
        desktopStore,
        onChunk: (text) => sendToWindow(overlayWindow, 'assistant-chunk', { text }),
        onDone: (fullText) => sendToWindow(overlayWindow, 'assistant-done', { fullText }),
        onError: (error) => sendToWindow(overlayWindow, 'assistant-error', { error }),
        onSideflowChatPersisted: scheduleBroadcastDesktopState,
      },
      payload,
    );
  });

  const reclampToWorkArea = () => {
    if (!overlayWindow || overlayMode !== 'collapsed') return;
    const clamped = getCurrentOrbPosition();
    orbPosition = clamped;
    overlayWindow.setPosition(clamped.x, clamped.y, false);
    notifyBoundsChanged();
    saveState();
  };

  screen.on('display-removed', reclampToWorkArea);
  screen.on('display-metrics-changed', reclampToWorkArea);
  screen.on('display-added', reclampToWorkArea);

  app.on('activate', () => {
    if (!managerWindow) createManagerWindow();
    showManagerWindow();
    focusOrb();
  });

  app.on('before-quit', () => {
    saveState();
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
    screen.removeListener('display-removed', reclampToWorkArea);
    screen.removeListener('display-metrics-changed', reclampToWorkArea);
    screen.removeListener('display-added', reclampToWorkArea);
  });
  }).catch((err) => {
    console.error('[SideFlow] App startup failed:', err);
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
