import type { ScrapedContext } from './scrapers/types';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuildLLMMessagesOptions {
  provider: 'openai' | 'anthropic';
  maxMessages?: number;
  includeSystemPrompt?: boolean;
  skipStreaming?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = (
  site: string
) => `The user is in a conversation on ${site}. Below is the recent context. Answer their follow-up question using this context.`;

/**
 * Converts scraped chat context into the message format expected by LLM APIs.
 * Use when the user asks a question in the overlay: pass the latest context and their question.
 */
export function buildLLMMessages(
  context: ScrapedContext,
  userQuestion: string,
  options: BuildLLMMessagesOptions = { provider: 'openai' }
): { messages: LLMMessage[]; system?: string } {
  const {
    provider,
    maxMessages = 20,
    includeSystemPrompt = true,
    skipStreaming = true
  } = options;

  let history: LLMMessage[] = context.messages
    .filter((m) => !skipStreaming || !m.isStreaming)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  if (maxMessages > 0 && history.length > maxMessages) {
    history = history.slice(-maxMessages);
  }

  const systemText = includeSystemPrompt
    ? DEFAULT_SYSTEM_PROMPT(context.site)
    : undefined;

  if (provider === 'anthropic' && systemText) {
    return {
      messages: [
        ...history,
        { role: 'user' as const, content: userQuestion }
      ],
      system: systemText
    };
  }

  const messages: LLMMessage[] = [];
  if (provider === 'openai' && systemText) {
    messages.push({ role: 'system', content: systemText });
  }
  messages.push(...history);
  messages.push({ role: 'user', content: userQuestion });

  return { messages };
}
