const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onContextUpdate: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('ctx', handler);
    return () => ipcRenderer.removeListener('ctx', handler);
  },
  onFocusInput: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('focus-input', handler);
    return () => ipcRenderer.removeListener('focus-input', handler);
  },
  hideWindow: () => ipcRenderer.send('hide-window'),
  expandOverlay: () => ipcRenderer.send('overlay-expand'),
  collapseOverlay: () => ipcRenderer.send('overlay-collapse'),
  getOverlayState: () => ipcRenderer.invoke('overlay-get-state'),
  moveOverlay: (x, y) => ipcRenderer.invoke('overlay-move', { x, y }),
  saveOverlayPosition: () => ipcRenderer.send('overlay-save-position'),
  onOverlayMode: (cb) => {
    const handler = (_event, mode) => cb(mode);
    ipcRenderer.on('overlay-mode', handler);
    return () => ipcRenderer.removeListener('overlay-mode', handler);
  },
  onOverlayBoundsChanged: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('overlay-bounds-changed', handler);
    return () => ipcRenderer.removeListener('overlay-bounds-changed', handler);
  },
});
