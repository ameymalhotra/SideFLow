import type { ChatMessage, ScrapedContext } from './types';

export const DEBOUNCE_MS = 300;

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function messageId(content: string, index: number): string {
  return `${index}-${simpleHash(content.slice(0, 200))}`;
}

export function getTextContent(el: Element): string {
  return el.textContent?.trim() ?? '';
}

export function createScrapedContext(
  site: ScrapedContext['site'],
  url: string,
  messages: ChatMessage[],
  conversationId?: string
): ScrapedContext {
  return {
    site,
    url,
    conversationId,
    messages,
    scrapedAt: Date.now()
  };
}

/**
 * Merge consecutive messages with the same role and content into one.
 * Preserves isStreaming if any in the run had it; regenerates ids by index.
 */
export function deduplicateMessagesByContent(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];
  const result: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i];
    const prev = result[result.length - 1];
    if (
      !prev ||
      prev.role !== cur.role ||
      prev.content !== cur.content
    ) {
      result.push({
        id: messageId(cur.content, result.length),
        role: cur.role,
        content: cur.content,
        isStreaming: cur.isStreaming
      });
    } else {
      const last = result[result.length - 1];
      result[result.length - 1] = {
        ...last,
        isStreaming: Boolean(last.isStreaming || cur.isStreaming)
      };
    }
  }
  return result;
}
