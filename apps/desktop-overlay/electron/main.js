const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

let chatWindow;
let overlayMode = 'collapsed';
const PANEL_SIZE = { width: 380, height: 480 };
const ORB_SIZE = { width: 72, height: 72 };
let orbPosition = null;

function getStatePath() {
  return path.join(app.getPath('userData'), 'overlay-state.json');
}

function readSavedState() {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      orbPosition = { x: Math.round(parsed.x), y: Math.round(parsed.y) };
    }
  } catch {
    // No saved state yet.
  }
}

function saveState() {
  if (!orbPosition) return;
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(orbPosition), 'utf8');
  } catch {
    // Best-effort persistence.
  }
}

/** Union of every display’s work area so the orb/panel can live on any monitor. */
function getCombinedWorkArea() {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) {
    return screen.getPrimaryDisplay().workArea;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = d.workArea;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampToAllDisplays(x, y, width, height) {
  const bounds = getCombinedWorkArea();
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width - width;
  const maxY = bounds.y + bounds.height - height;
  return {
    x: Math.min(Math.max(Math.round(x), minX), maxX),
    y: Math.min(Math.max(Math.round(y), minY), maxY),
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
  if (!chatWindow) return;
  const next = getCurrentOrbPosition();
  chatWindow.setBounds({ x: next.x, y: next.y, width: ORB_SIZE.width, height: ORB_SIZE.height }, false);
}

function setExpandedBounds() {
  if (!chatWindow) return;
  const orb = getCurrentOrbPosition();
  const orbCenterX = orb.x + ORB_SIZE.width / 2;
  const orbCenterY = orb.y + ORB_SIZE.height / 2;
  const target = clampToAllDisplays(
    orbCenterX - PANEL_SIZE.width / 2,
    orbCenterY - PANEL_SIZE.height / 2,
    PANEL_SIZE.width,
    PANEL_SIZE.height,
  );
  chatWindow.setBounds({ x: target.x, y: target.y, width: PANEL_SIZE.width, height: PANEL_SIZE.height }, false);
}

// #region agent log
function _dbg(data) { try { fs.appendFileSync('/Users/ameymalhotra/overlay-ai/.cursor/debug-a2e664.log', JSON.stringify({sessionId:'a2e664',timestamp:Date.now(),...data})+'\n','utf8'); } catch(e) {} }
// #endregion

function notifyMode() {
  chatWindow?.webContents.send('overlay-mode', overlayMode);
}

/** After setPosition/setBounds, Chromium often stalemates CSS -webkit-app-region; nudge the renderer. */
function notifyBoundsChanged() {
  if (!chatWindow || chatWindow.isDestroyed()) return;
  const bounds = chatWindow.getBounds();
  chatWindow.webContents.send('overlay-bounds-changed', {
    mode: overlayMode,
    x: bounds.x,
    y: bounds.y,
  });
}

// resizeToMode: resize the window immediately (used when the renderer has already painted new content).
function resizeToMode(nextMode) {
  if (!chatWindow) return;
  overlayMode = nextMode;
  // #region agent log
  _dbg({location:'main.js:resizeToMode',message:'resizeToMode called — about to setBounds',data:{nextMode},hypothesisId:'A,F'});
  // #endregion
  if (nextMode === 'expanded') {
    setExpandedBounds();
    // #region agent log
    _dbg({location:'main.js:resizeToMode',message:'setBounds expanded done',data:{nextMode,bounds:chatWindow.getBounds()},hypothesisId:'A,F'});
    // #endregion
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send('focus-input');
  } else {
    setCollapsedBounds();
    // #region agent log
    _dbg({location:'main.js:resizeToMode',message:'setBounds collapsed done',data:{nextMode,bounds:chatWindow.getBounds()},hypothesisId:'A,F'});
    // #endregion
    chatWindow.show();
  }
  notifyBoundsChanged();
}

// notifyModeChange: tell the renderer to change its state; renderer will re-render then call
// back with overlay-expand / overlay-collapse so the window resizes after content is ready.
function notifyModeChange(nextMode) {
  if (!chatWindow) return;
  overlayMode = nextMode;
  notifyMode();
}

function createWindow() {
  readSavedState();
  const start = getCurrentOrbPosition();
  chatWindow = new BrowserWindow({
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

  // Stay above normal windows; on macOS also float above fullscreen apps / all Spaces.
  if (process.platform === 'darwin') {
    chatWindow.setAlwaysOnTop(true, 'floating');
    chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else if (process.platform === 'linux') {
    chatWindow.setVisibleOnAllWorkspaces(true);
  }

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    chatWindow.loadURL('http://localhost:5173');
  } else {
    // FIX: path relative to project root, not electron/ dir
    chatWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  chatWindow.once('ready-to-show', () => {
    chatWindow.show();
    notifyMode();
  });
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Control+Q', () => {
    if (!chatWindow) return;
    // Tell the renderer to change mode — it will render the new content then call back
    // with overlay-expand / overlay-collapse so the window resizes after content is ready.
    const nextMode = overlayMode === 'collapsed' ? 'expanded' : 'collapsed';
    notifyModeChange(nextMode);
  });

  ipcMain.on('extension-context', (_event, ctx) => {
    chatWindow?.webContents.send('ctx', ctx);
  });

  ipcMain.on('hide-window', () => {
    // Renderer already set its state; just resize.
    resizeToMode('collapsed');
  });

  ipcMain.on('overlay-expand', () => {
    // Renderer has already painted the chat panel — now resize the window to fit it.
    resizeToMode('expanded');
  });

  ipcMain.on('overlay-collapse', () => {
    // Renderer has already painted the orb — now shrink the window back.
    resizeToMode('collapsed');
  });

  ipcMain.handle('overlay-get-state', () => {
    const bounds = chatWindow?.getBounds() ?? { x: 0, y: 0 };
    return { mode: overlayMode, x: bounds.x, y: bounds.y };
  });

  ipcMain.handle('overlay-move', (_event, coords) => {
    if (!chatWindow) return { x: 0, y: 0 };
    const clamped = clampToAllDisplays(coords.x, coords.y, ORB_SIZE.width, ORB_SIZE.height);
    orbPosition = clamped;
    chatWindow.setPosition(clamped.x, clamped.y, false);
    notifyBoundsChanged();
    return clamped;
  });

  ipcMain.on('overlay-save-position', () => {
    saveState();
  });

  const reclampToWorkArea = () => {
    if (!chatWindow || overlayMode !== 'collapsed') return;
    const clamped = getCurrentOrbPosition();
    orbPosition = clamped;
    chatWindow.setPosition(clamped.x, clamped.y, false);
    notifyBoundsChanged();
    saveState();
  };

  screen.on('display-removed', reclampToWorkArea);
  screen.on('display-metrics-changed', reclampToWorkArea);
  screen.on('display-added', reclampToWorkArea);

  app.on('before-quit', () => {
    saveState();
    screen.removeListener('display-removed', reclampToWorkArea);
    screen.removeListener('display-metrics-changed', reclampToWorkArea);
    screen.removeListener('display-added', reclampToWorkArea);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => e.preventDefault());
