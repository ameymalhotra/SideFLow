/// <reference types="vite/client" />

interface ConnectedModel {
  id: string;
  label: string;
  providerId?: string;
  providerLabel?: string;
  modelId?: string;
}

interface ModelsState {
  models: ConnectedModel[];
  selectedId: string | null;
}

interface ProviderCatalogEntry {
  id: string;
  label: string;
  needsKey: boolean;
}

interface ProviderState {
  id: string;
  label: string;
  apiBaseUrl: string;
  needsKey: boolean;
  keyConfigured: boolean;
  status: string;
  updatedAt: number;
}

interface CapturedConversation {
  id: string;
  site: string;
  url: string;
  conversationId: string | null;
  scrapedAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
  }>;
}

interface SideflowChat {
  id: string;
  sourceConversationId: string | null;
  sourceLabel: string;
  sourceSite: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  lastMessagePreview: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface OverlayContextPayload {
  label: string;
  chatAvailable: boolean;
  activeConversationId?: string | null;
}

interface DesktopState {
  providers: ProviderState[];
  connectedModels: ConnectedModel[];
  selectedModelId: string | null;
  conversations: CapturedConversation[];
  sideflowChats: SideflowChat[];
  activeConversationId: string | null;
  preferences: {
    /** When false, the floating orb is hidden while collapsed; open the chat with Ctrl+Q. */
    showFloatingOrb: boolean;
  };
  onboarding: {
    completed: boolean;
    completedAt: number | null;
    skipped: boolean;
  };
  extension: {
    connected: boolean;
    clients: number;
    lastSeenAt: number | null;
    lastSite: string | null;
    lastConversationId: string | null;
    lastError: string | null;
  };
  providerCatalog: ProviderCatalogEntry[];
}

interface ElectronAPI {
  onContextUpdate: (cb: (data: OverlayContextPayload) => void) => () => void;
  onFocusInput?: (cb: () => void) => () => void;
  onOverlayMode?: (cb: (mode: 'collapsed' | 'expanded') => void) => () => void;
  onOverlayBoundsChanged?: (
    cb: (payload: { mode: 'collapsed' | 'expanded'; x: number; y: number }) => void,
  ) => () => void;
  getExpansionInfo?: () => Promise<{ orbLeft: number; orbTop: number; originX: number; originY: number }>;
  prepareExpand?: () => Promise<void>;
  expandOverlay?: () => void;
  collapseOverlay?: () => void;
  moveOverlay?: (x: number, y: number) => Promise<{ x: number; y: number }>;
  saveOverlayPosition?: () => void;
  getModelsState?: () => Promise<ModelsState>;
  setSelectedModel?: (id: string) => void;
  onModelsState?: (cb: (state: ModelsState) => void) => () => void;
  getDesktopState?: () => Promise<DesktopState>;
  saveApiKey?: (payload: { providerId: string; apiKey: string; apiBaseUrl?: string }) => Promise<DesktopState>;
  removeApiKey?: (providerId: string) => Promise<DesktopState>;
  saveModel?: (payload: { providerId: string; label: string; modelId: string }) => Promise<DesktopState>;
  removeModel?: (id: string) => Promise<DesktopState>;
  setActiveConversation?: (id: string) => Promise<DesktopState>;
  deleteConversation?: (id: string) => Promise<DesktopState>;
  completeOnboarding?: (payload?: { skipped?: boolean }) => Promise<DesktopState>;
  setPreferences?: (payload: { showFloatingOrb?: boolean }) => Promise<DesktopState>;
  askAssistant?: (payload: { question: string; conversationId?: string | null }) => Promise<{ ok: boolean; content: string }>;
  onAssistantChunk?: (cb: (data: { text: string }) => void) => () => void;
  onAssistantDone?: (cb: (data: { fullText: string }) => void) => () => void;
  onAssistantError?: (cb: (data: { error: string }) => void) => () => void;
  launchOrb?: () => Promise<void>;
  onDesktopState?: (cb: (state: DesktopState) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
