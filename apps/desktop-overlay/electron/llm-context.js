const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');

const MAX_SCRAPED_MESSAGES = 30;
const MAX_SIDEFLOW_TURNS = 20;

function formatScrapedConversation(messages) {
  return messages
    .slice(-MAX_SCRAPED_MESSAGES)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');
}

function buildSystemPrompt(conversation) {
  const site = conversation.site ?? 'a chat site';
  const formatted = formatScrapedConversation(conversation.messages ?? []);

  if (!formatted) {
    return new SystemMessage(
      `You are SideFlow — a side-chat companion designed to run alongside a user's active AI conversation.\n\n` +
        `No conversation context has been synced yet. The user should open ChatGPT, Claude, or Gemini ` +
        `with the SideFlow extension connected so you can see what they're discussing.\n\n` +
        `Until then, let the user know you're ready and waiting for their conversation to appear.`,
    );
  }

  return new SystemMessage(
    `You are SideFlow — a side-chat companion that runs alongside the user's active conversation on ${site}.\n\n` +
      `WHY YOU EXIST:\n` +
      `The user is in the middle of a conversation with another AI assistant. ` +
      `Rather than cluttering that thread with tangents, clarifications, or deeper dives, ` +
      `they opened SideFlow to ask you instead. Your job is to help them get more out of that conversation.\n\n` +
      `WHAT THE USER NEEDS FROM YOU:\n` +
      `- Clarify or explain something from the conversation they didn't fully understand.\n` +
      `- Go deeper on a topic that came up, without them having to sidetrack their main chat.\n` +
      `- Summarize or extract the key takeaways from a long exchange.\n` +
      `- Evaluate, compare, or critique an approach or answer given in the conversation.\n` +
      `- Answer related questions that build on what's being discussed.\n\n` +
      `HOW TO BEHAVE:\n` +
      `- Always ground your answers in the conversation below. Reference specific parts when relevant.\n` +
      `- Be concise. The user has the full conversation open already — don't repeat large chunks of it back to them.\n` +
      `- If the user's question goes beyond what's in the conversation, use your knowledge to help, but tie it back to the context when you can.\n` +
      `- If something in the conversation is wrong or misleading, say so clearly.\n` +
      `- You are a supplement, not a replacement. Don't try to take over the conversation — help the user navigate it.\n\n` +
      `THE CONVERSATION:\n` +
      `---\n${formatted}\n---`,
  );
}

function buildSideflowHistory(sideflowChat) {
  if (!sideflowChat || !Array.isArray(sideflowChat.messages)) return [];
  return sideflowChat.messages.slice(-MAX_SIDEFLOW_TURNS * 2).map((m) => {
    if (m.role === 'user') return new HumanMessage(m.content);
    return new AIMessage(m.content);
  });
}

/**
 * Assembles the full message array for an LLM call:
 * 1. System message with scraped conversation as context
 * 2. Previous SideFlow follow-up turns
 * 3. New user question
 */
function assembleMessages(conversation, sideflowChat, newQuestion) {
  const systemMsg = buildSystemPrompt(conversation);
  const history = buildSideflowHistory(sideflowChat);
  return [systemMsg, ...history, new HumanMessage(newQuestion)];
}

module.exports = { assembleMessages };
