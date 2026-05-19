/** Initial manager UI state — aligned with `electron/desktop-state.js` DEFAULT_STATE (+ providerCatalog). */
export const DEFAULT_DESKTOP_STATE: DesktopState = {
  providers: [],
  connectedModels: [],
  selectedModelId: null,
  conversations: [],
  sideflowChats: [],
  activeConversationId: null,
  preferences: {
    showFloatingOrb: true,
  },
  onboarding: {
    completed: false,
    completedAt: null,
    skipped: false,
  },
  extension: {
    connected: false,
    clients: 0,
    lastSeenAt: null,
    lastSite: null,
    lastConversationId: null,
    lastError: null,
  },
  providerCatalog: [],
};
