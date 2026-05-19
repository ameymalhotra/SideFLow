/**
 * Assistant orchestration: turns an `assistant-ask` IPC payload into a
 * streaming LLM call and persists the resulting SideFlow chat.
 *
 * Extracted from `main.js` so the window/IPC plumbing stays in `main.js` and
 * this file owns the question → conversation → model → inference flow.
 */
const { assembleMessages } = require('./llm-context');
const { streamInference } = require('./llm-inference');

const NO_CHAT_CONTEXT_MESSAGE =
  'No captured chat is available yet. Open a supported page with the extension connected and let it sync context first.';

function pickActiveConversation(state) {
  return (
    state.conversations.find((item) => item.id === state.activeConversationId) ??
    state.conversations[0] ??
    null
  );
}

function pickModel(state) {
  return (
    state.connectedModels.find((m) => m.id === state.selectedModelId) ??
    state.connectedModels[0] ??
    null
  );
}

function buildSideflowChat({ conversation, existingChat, question, fullText }) {
  const now = Date.now();
  const chatId = existingChat?.id ?? `sideflow-${now}`;
  const prevMessages = existingChat?.messages ?? [];
  return {
    id: chatId,
    sourceConversationId: conversation.id,
    sourceLabel: `${conversation.site.toUpperCase()} • ${conversation.lastMessagePreview.slice(0, 72)}`,
    sourceSite: conversation.site,
    createdAt: existingChat?.createdAt ?? now,
    updatedAt: now,
    title: existingChat?.title ?? question.slice(0, 96),
    lastMessagePreview: fullText.slice(0, 180),
    messages: [
      ...prevMessages,
      { id: `sf-${now}-u`, role: 'user', content: question },
      { id: `sf-${now}-a`, role: 'assistant', content: fullText },
    ],
  };
}

/**
 * Run a single assistant turn.
 *
 * @param {object} deps
 * @param {object} deps.desktopStore
 * @param {(text: string) => void} deps.onChunk        - streamed text chunks from the model
 * @param {(fullText: string) => void} deps.onDone     - final text once the stream completes
 * @param {(error: string) => void} deps.onError       - terminal failure message
 * @param {() => void} deps.onSideflowChatPersisted    - hook to refresh listeners after persistence
 * @param {{ question?: unknown }} payload
 * @returns {Promise<{ ok: boolean, content: string }>}
 */
async function runAssistantTurn({ desktopStore, onChunk, onDone, onError, onSideflowChatPersisted }, payload) {
  const conversation = pickActiveConversation(desktopStore.getState());
  if (!conversation || !Array.isArray(conversation.messages) || conversation.messages.length === 0) {
    return { ok: false, content: NO_CHAT_CONTEXT_MESSAGE };
  }

  const safePayload = payload ?? {};
  const question = typeof safePayload.question === 'string' ? safePayload.question.trim() : '';
  if (!question) {
    return { ok: false, content: 'No question provided.' };
  }

  const state = desktopStore.getState();
  const model = pickModel(state);
  if (!model) {
    return { ok: false, content: 'No model is connected. Add one in the desktop app settings.' };
  }

  const provider = state.providers.find((p) => p.id === model.providerId) ?? null;
  if (provider?.needsKey && !provider?.keyConfigured) {
    return {
      ok: false,
      content: `API key for ${provider.label} is not configured. Add it in the desktop app settings.`,
    };
  }

  const apiKey = desktopStore.getApiKeyForProvider(model.providerId);
  if (provider?.needsKey && !apiKey) {
    return {
      ok: false,
      content: `Could not retrieve the API key for ${provider?.label ?? model.providerId}. Re-save it in settings.`,
    };
  }

  const existingChat = state.sideflowChats.find(
    (chat) => chat.sourceConversationId === conversation.id,
  );

  const messages = assembleMessages(conversation, existingChat, question);

  onChunk('');

  try {
    const fullText = await streamInference({
      messages,
      apiKey,
      providerId: model.providerId,
      modelId: model.modelId ?? model.id,
      apiBaseUrl: provider?.apiBaseUrl,
      onChunk,
    });

    const nextSideflowChat = buildSideflowChat({ conversation, existingChat, question, fullText });
    const updatedState = desktopStore.getState();
    const otherChats = updatedState.sideflowChats.filter((c) => c.id !== nextSideflowChat.id);
    desktopStore.replaceSideflowChats([nextSideflowChat, ...otherChats]);

    onDone(fullText);
    onSideflowChatPersisted();
    return { ok: true, content: fullText };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown inference error';
    onError(errorMsg);
    return { ok: false, content: `Inference failed: ${errorMsg}` };
  }
}

module.exports = { runAssistantTurn };
