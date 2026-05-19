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
  getExpansionInfo: () => ipcRenderer.invoke('overlay-get-expansion-info'),
  prepareExpand: () => ipcRenderer.invoke('overlay-prepare-expand'),
  expandOverlay: () => ipcRenderer.send('overlay-expand'),
  collapseOverlay: () => ipcRenderer.send('overlay-collapse'),
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
  getModelsState: () => ipcRenderer.invoke('models-get-state'),
  setSelectedModel: (id) => ipcRenderer.send('models-set-selected', { id }),
  onModelsState: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('models-state', handler);
    return () => ipcRenderer.removeListener('models-state', handler);
  },
  getDesktopState: () => ipcRenderer.invoke('desktop-get-state'),
  saveApiKey: (payload) => ipcRenderer.invoke('desktop-save-api-key', payload),
  removeApiKey: (providerId) => ipcRenderer.invoke('desktop-remove-api-key', { providerId }),
  saveModel: (payload) => ipcRenderer.invoke('desktop-save-model', payload),
  removeModel: (id) => ipcRenderer.invoke('desktop-remove-model', { id }),
  setActiveConversation: (id) => ipcRenderer.invoke('desktop-set-active-conversation', { id }),
  deleteConversation: (id) => ipcRenderer.invoke('desktop-delete-conversation', { id }),
  completeOnboarding: (payload) => ipcRenderer.invoke('desktop-complete-onboarding', payload),
  setPreferences: (payload) => ipcRenderer.invoke('desktop-set-preferences', payload),
  askAssistant: (payload) => ipcRenderer.invoke('assistant-ask', payload),
  onAssistantChunk: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('assistant-chunk', handler);
    return () => ipcRenderer.removeListener('assistant-chunk', handler);
  },
  onAssistantDone: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('assistant-done', handler);
    return () => ipcRenderer.removeListener('assistant-done', handler);
  },
  onAssistantError: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('assistant-error', handler);
    return () => ipcRenderer.removeListener('assistant-error', handler);
  },
  launchOrb: () => ipcRenderer.invoke('desktop-launch-orb'),
  onDesktopState: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on('desktop-state', handler);
    return () => ipcRenderer.removeListener('desktop-state', handler);
  },
});
