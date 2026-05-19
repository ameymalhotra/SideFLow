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

/**
 * Observe `root` for DOM mutations and emit a fresh scrape on each settled
 * change (and once eagerly at startup).
 *
 * All three site scrapers share the same shape:
 *   - run an initial scrape so callers see whatever is already on the page,
 *   - then debounce subsequent re-scrapes to one per `DEBOUNCE_MS` window.
 *
 * Returns a teardown function that disconnects the observer.
 */
export function createDOMObserver(
  root: Node,
  scrape: () => ScrapedContext,
  callback: (context: ScrapedContext) => void,
): () => void {
  const debounced = debounce(() => {
    callback(scrape());
  }, DEBOUNCE_MS);

  const observer = new MutationObserver(() => {
    debounced();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  });

  debounced();

  return () => observer.disconnect();
}

/**
 * Stable sort of `items` by the document order of their associated element.
 * Used by scrapers that collect user/assistant blocks from different
 * selectors and need to splice them back into the order the user sees.
 */
export function sortByDocumentPosition<T>(items: T[], getEl: (item: T) => Element): T[] {
  return [...items].sort((a, b) => {
    const cmp = getEl(a).compareDocumentPosition(getEl(b));
    return cmp & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
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
