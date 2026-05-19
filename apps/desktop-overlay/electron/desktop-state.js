const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const PROVIDER_CATALOG = [
  { id: 'openai', label: 'OpenAI', needsKey: true },
  { id: 'anthropic', label: 'Anthropic', needsKey: true },
  { id: 'openrouter', label: 'OpenRouter', needsKey: true },
  { id: 'gemini', label: 'Gemini', needsKey: true },
  { id: 'ollama', label: 'Ollama', needsKey: false },
  { id: 'custom', label: 'Custom', needsKey: false },
];

const DEFAULT_STATE = {
  providers: [],
  connectedModels: [],
  selectedModelId: null,
  conversations: [],
  sideflowChats: [],
  activeConversationId: null,
  preferences: {
    /** When false, the floating orb is hidden while collapsed; use Ctrl+Q to open the chat panel. */
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
};

function getStatePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function getSecretsPath() {
  return path.join(app.getPath('userData'), 'desktop-secrets.bin');
}

function getBridgeTokenPath() {
  return path.join(app.getPath('userData'), 'bridge-token.json');
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const SENSITIVE_SUFFIXES = ['secrets.bin', 'bridge-token.json'];

function writeJSON(filePath, value) {
  try {
    const isSensitive = SENSITIVE_SUFFIXES.some((s) => filePath.endsWith(s));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: isSensitive ? 0o600 : 0o644,
    });
  } catch (err) {
    console.error('[SideFlow] writeJSON failed:', filePath, err);
  }
}

function getOrCreateBridgeToken() {
  const tokenPath = getBridgeTokenPath();
  try {
    const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    if (typeof stored.token === 'string' && stored.token.length >= 32) {
      return stored.token;
    }
  } catch {}
  const token = crypto.randomBytes(32).toString('hex');
  writeJSON(tokenPath, { token, createdAt: Date.now() });
  return token;
}

function normalizeProvider(raw) {
  if (!raw || typeof raw.id !== 'string' || typeof raw.label !== 'string') return null;
  return {
    id: raw.id,
    label: raw.label,
    apiBaseUrl: typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl : '',
    needsKey: Boolean(raw.needsKey),
    keyConfigured: Boolean(raw.keyConfigured),
    status: typeof raw.status === 'string' ? raw.status : raw.keyConfigured ? 'ready' : raw.needsKey ? 'needs_key' : 'ready',
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

function normalizeModel(raw) {
  if (!raw || typeof raw.id !== 'string' || typeof raw.label !== 'string' || typeof raw.providerId !== 'string') {
    return null;
  }
  return {
    id: raw.id,
    label: raw.label,
    providerId: raw.providerId,
    providerLabel: typeof raw.providerLabel === 'string' ? raw.providerLabel : raw.providerId,
    modelId: typeof raw.modelId === 'string' ? raw.modelId : raw.id,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

function normalizeConversation(raw) {
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages
    .filter((m) => m && typeof m.id === 'string' && typeof m.role === 'string' && typeof m.content === 'string')
    .map((m) => ({
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      isStreaming: Boolean(m.isStreaming),
    }));

  const lastMessage = messages[messages.length - 1];
  return {
    id: raw.id,
    site: typeof raw.site === 'string' ? raw.site : 'browser',
    url: typeof raw.url === 'string' ? raw.url : '',
    conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : null,
    scrapedAt: Number.isFinite(raw.scrapedAt) ? raw.scrapedAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    messageCount: Number.isFinite(raw.messageCount) ? raw.messageCount : messages.length,
    lastMessagePreview:
      typeof raw.lastMessagePreview === 'string'
        ? raw.lastMessagePreview
        : lastMessage?.content.slice(0, 180) ?? 'No messages yet',
    messages,
  };
}

function normalizeSideflowChat(raw) {
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages
    .filter((m) => m && typeof m.id === 'string' && typeof m.role === 'string' && typeof m.content === 'string')
    .map((m) => ({
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  return {
    id: raw.id,
    sourceConversationId: typeof raw.sourceConversationId === 'string' ? raw.sourceConversationId : null,
    sourceLabel: typeof raw.sourceLabel === 'string' ? raw.sourceLabel : 'Unknown source',
    sourceSite: typeof raw.sourceSite === 'string' ? raw.sourceSite : 'browser',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    title: typeof raw.title === 'string' ? raw.title : messages[0]?.content.slice(0, 80) ?? 'SideFlow chat',
    lastMessagePreview:
      typeof raw.lastMessagePreview === 'string'
        ? raw.lastMessagePreview
        : messages[messages.length - 1]?.content.slice(0, 180) ?? 'No messages yet',
    messages,
  };
}

function normalizeState(raw) {
  const state = cloneDefaultState();
  state.providers = Array.isArray(raw?.providers)
    ? raw.providers.map(normalizeProvider).filter(Boolean)
    : [];
  state.connectedModels = Array.isArray(raw?.connectedModels)
    ? raw.connectedModels.map(normalizeModel).filter(Boolean)
    : [];
  state.selectedModelId =
    typeof raw?.selectedModelId === 'string' && state.connectedModels.some((m) => m.id === raw.selectedModelId)
      ? raw.selectedModelId
      : state.connectedModels[0]?.id ?? null;
  state.conversations = Array.isArray(raw?.conversations)
    ? raw.conversations.map(normalizeConversation).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
  state.sideflowChats = Array.isArray(raw?.sideflowChats)
    ? raw.sideflowChats.map(normalizeSideflowChat).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
  state.activeConversationId =
    typeof raw?.activeConversationId === 'string' && state.conversations.some((c) => c.id === raw.activeConversationId)
      ? raw.activeConversationId
      : state.conversations[0]?.id ?? null;
  state.onboarding = {
    completed: Boolean(raw?.onboarding?.completed),
    completedAt: Number.isFinite(raw?.onboarding?.completedAt) ? raw.onboarding.completedAt : null,
    skipped: Boolean(raw?.onboarding?.skipped),
  };
  state.extension = {
    connected: Boolean(raw?.extension?.connected),
    clients: Number.isFinite(raw?.extension?.clients) ? raw.extension.clients : 0,
    lastSeenAt: Number.isFinite(raw?.extension?.lastSeenAt) ? raw.extension.lastSeenAt : null,
    lastSite: typeof raw?.extension?.lastSite === 'string' ? raw.extension.lastSite : null,
    lastConversationId:
      typeof raw?.extension?.lastConversationId === 'string' ? raw.extension.lastConversationId : null,
    lastError: typeof raw?.extension?.lastError === 'string' ? raw.extension.lastError : null,
  };
  state.preferences = {
    showFloatingOrb:
      typeof raw?.preferences?.showFloatingOrb === 'boolean' ? raw.preferences.showFloatingOrb : true,
  };
  return state;
}

function encryptString(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decryptString(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    return '';
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function readSecrets() {
  return readJSON(getSecretsPath(), {});
}

function writeSecrets(value) {
  writeJSON(getSecretsPath(), value);
}

function providerLabelFor(providerId) {
  return PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.label ?? providerId;
}

function createDesktopStateStore() {
  let state = normalizeState(readJSON(getStatePath(), cloneDefaultState()));

  const persist = () => {
    writeJSON(getStatePath(), state);
  };

  const getState = () => state;

  const getPublicState = () => ({
    ...state,
    providerCatalog: PROVIDER_CATALOG,
  });

  const completeOnboarding = ({ skipped = false } = {}) => {
    state = normalizeState({
      ...state,
      onboarding: {
        completed: true,
        completedAt: Date.now(),
        skipped: Boolean(skipped),
      },
    });
    persist();
    return getPublicState();
  };

  const saveApiKey = ({ providerId, apiKey, apiBaseUrl = '' }) => {
    if (typeof providerId !== 'string' || typeof apiKey !== 'string') return getPublicState();
    const catalogEntry = PROVIDER_CATALOG.find((provider) => provider.id === providerId);
    const trimmedApiKey = apiKey.trim();
    const encryptedApiKey = trimmedApiKey.length > 0 ? encryptString(trimmedApiKey) : '';
    const secureStorageUnavailable = trimmedApiKey.length > 0 && encryptedApiKey == null;
    const now = Date.now();
    const providers = state.providers.filter((provider) => provider.id !== providerId);
    providers.push({
      id: providerId,
      label: catalogEntry?.label ?? providerId,
      apiBaseUrl,
      needsKey: catalogEntry?.needsKey ?? true,
      keyConfigured: !secureStorageUnavailable && trimmedApiKey.length > 0,
      status: secureStorageUnavailable
        ? 'secure_storage_unavailable'
        : trimmedApiKey.length > 0
          ? 'ready'
          : catalogEntry?.needsKey
            ? 'needs_key'
            : 'ready',
      updatedAt: now,
    });
    state = normalizeState({ ...state, providers });

    const secrets = readSecrets();
    if (secureStorageUnavailable) {
      delete secrets[providerId];
    } else if (trimmedApiKey.length > 0) {
      secrets[providerId] = encryptedApiKey;
    } else {
      delete secrets[providerId];
    }
    writeSecrets(secrets);
    persist();
    return getPublicState();
  };

  const removeApiKey = ({ providerId }) => {
    if (typeof providerId !== 'string') return getPublicState();
    state = normalizeState({
      ...state,
      providers: state.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              keyConfigured: false,
              status: provider.needsKey ? 'needs_key' : 'ready',
              updatedAt: Date.now(),
            }
          : provider,
      ),
    });
    const secrets = readSecrets();
    delete secrets[providerId];
    writeSecrets(secrets);
    persist();
    return getPublicState();
  };

  const upsertModel = ({ providerId, label, modelId }) => {
    if (typeof providerId !== 'string' || typeof label !== 'string' || typeof modelId !== 'string') {
      return getPublicState();
    }
    const nextModel = {
      id: `${providerId}:${modelId}`,
      label: label.trim() || modelId,
      providerId,
      providerLabel: providerLabelFor(providerId),
      modelId,
      updatedAt: Date.now(),
    };
    state = normalizeState({
      ...state,
      connectedModels: [
        ...state.connectedModels.filter((model) => model.id !== nextModel.id),
        nextModel,
      ],
      selectedModelId: state.selectedModelId ?? nextModel.id,
    });
    persist();
    return getPublicState();
  };

  const removeModel = ({ id }) => {
    if (typeof id !== 'string') return getPublicState();
    state = normalizeState({
      ...state,
      connectedModels: state.connectedModels.filter((model) => model.id !== id),
      selectedModelId: state.selectedModelId === id ? null : state.selectedModelId,
    });
    persist();
    return getPublicState();
  };

  const setSelectedModel = ({ id }) => {
    if (typeof id !== 'string') return getPublicState();
    state = normalizeState({ ...state, selectedModelId: id });
    persist();
    return getPublicState();
  };

  const setActiveConversation = ({ id }) => {
    if (typeof id !== 'string') return getPublicState();
    state = normalizeState({ ...state, activeConversationId: id });
    persist();
    return getPublicState();
  };

  const deleteConversation = ({ id }) => {
    if (typeof id !== 'string') return getPublicState();
    const remainingConversations = state.conversations.filter((conversation) => conversation.id !== id);
    const remainingSideflowChats = state.sideflowChats.filter((chat) => chat.sourceConversationId !== id);
    state = normalizeState({
      ...state,
      conversations: remainingConversations,
      sideflowChats: remainingSideflowChats,
      activeConversationId:
        state.activeConversationId === id ? remainingConversations[0]?.id ?? null : state.activeConversationId,
    });
    persist();
    return getPublicState();
  };

  const setExtensionStatus = (patch) => {
    state = normalizeState({
      ...state,
      extension: {
        ...state.extension,
        ...patch,
      },
    });
    persist();
    return getPublicState();
  };

  /** Remove conversation(s) when the user leaves a synced tab (extension `site_left`). */
  const removeConversationForSiteLeave = ({ site, url }) => {
    if (typeof site !== 'string' || !site) return getPublicState();
    const remaining = state.conversations.filter((c) => {
      if (c.site !== site) return true;
      if (url && typeof url === 'string') {
        const composite = `${site}:${url}`;
        if (c.id === composite || c.url === url) return false;
        return true;
      }
      return false;
    });
    const keptIds = new Set(remaining.map((c) => c.id));
    const removedIds = new Set(state.conversations.filter((c) => !keptIds.has(c.id)).map((c) => c.id));
    let nextActive = state.activeConversationId;
    if (nextActive && removedIds.has(nextActive)) {
      nextActive = remaining[0]?.id ?? null;
    }
    const remainingSideflow = state.sideflowChats.filter(
      (chat) => !removedIds.has(chat.sourceConversationId ?? ''),
    );
    state = normalizeState({
      ...state,
      conversations: remaining,
      sideflowChats: remainingSideflow,
      activeConversationId: nextActive,
    });
    persist();
    return getPublicState();
  };

  const upsertConversation = (context) => {
    if (!context || !Array.isArray(context.messages)) return getPublicState();
    const site = typeof context.site === 'string' ? context.site : 'browser';
    const conversationId = typeof context.conversationId === 'string' ? context.conversationId : null;
    const id = conversationId || `${site}:${typeof context.url === 'string' ? context.url : 'unknown'}`;
    const messages = context.messages
      .filter((m) => m && typeof m.id === 'string' && typeof m.content === 'string')
      .map((m) => ({
        id: m.id,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        isStreaming: Boolean(m.isStreaming),
      }));
    const conversation = {
      id,
      site,
      url: typeof context.url === 'string' ? context.url : '',
      conversationId,
      scrapedAt: Number.isFinite(context.scrapedAt) ? context.scrapedAt : Date.now(),
      updatedAt: Date.now(),
      messageCount: messages.length,
      lastMessagePreview: messages[messages.length - 1]?.content.slice(0, 180) ?? 'No messages yet',
      messages,
    };
    state = normalizeState({
      ...state,
      conversations: [
        conversation,
        ...state.conversations.filter((existing) => existing.id !== id),
      ],
      activeConversationId: id,
      extension: {
        ...state.extension,
        lastSeenAt: Date.now(),
        lastSite: site,
        lastConversationId: id,
        lastError: null,
      },
    });
    persist();
    return getPublicState();
  };

  const getApiKeyForProvider = (providerId) => {
    const secrets = readSecrets();
    return decryptString(secrets[providerId] ?? '');
  };

  const replaceSideflowChats = (chats) => {
    if (!Array.isArray(chats)) return getPublicState();
    state = normalizeState({ ...state, sideflowChats: chats });
    persist();
    return getPublicState();
  };

  const setPreferences = (patch) => {
    if (!patch || typeof patch !== 'object') return getPublicState();
    const next = { ...state.preferences };
    if (typeof patch.showFloatingOrb === 'boolean') {
      next.showFloatingOrb = patch.showFloatingOrb;
    }
    state = normalizeState({ ...state, preferences: next });
    persist();
    return getPublicState();
  };

  return {
    getState,
    getPublicState,
    saveApiKey,
    removeApiKey,
    upsertModel,
    removeModel,
    setSelectedModel,
    setActiveConversation,
    deleteConversation,
    completeOnboarding,
    setExtensionStatus,
    upsertConversation,
    removeConversationForSiteLeave,
    getApiKeyForProvider,
    replaceSideflowChats,
    setPreferences,
  };
}

module.exports = {
  createDesktopStateStore,
  getOrCreateBridgeToken,
  PROVIDER_CATALOG,
};
