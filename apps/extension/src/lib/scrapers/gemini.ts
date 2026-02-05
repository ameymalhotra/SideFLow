import type { ChatScraper, ChatMessage, ScrapedContext } from './types';
import {
  debounce,
  getTextContent,
  messageId,
  simpleHash,
  createScrapedContext
} from './base';

function extractConversationId(): string | undefined {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last.length > 2 && /^[a-zA-Z0-9_-]+$/.test(last)) return last;
  if (pathname && pathname !== '/') return simpleHash(pathname);
  return undefined;
}

const CONVERSATION_SELECTORS = [
  '[data-conversation-container]',
  '.conversation-container',
  '[data-conversation]',
  '[class*="conversation"]',
  '[role="main"]',
  'main',
  '[class*="chat"]',
  '[class*="thread"]'
];

const USER_SELECTORS = [
  '[data-user-query]',
  '[data-query]',
  '.query-content',
  '[data-query-text]',
  '[class*="query-content"]',
  '[class*="user-query"]',
  '[class*="query"]',
  '[class*="user-message"]',
  '[class*="human"]',
  '[aria-label*="Your message"]'
];

const ASSISTANT_SELECTORS = [
  '[id^="model-response-message-content"]',
  '.markdown-main-panel',
  '[class*="markdown-main-panel"]',
  '[inline-copy-host]',
  '[data-model-response]',
  '[data-response]',
  '.model-response-text',
  '[data-response-text]',
  '[class*="model-response"]',
  '[class*="response-text"]',
  '[class*="assistant"]',
  '[class*="model-output"]',
  '[aria-label*="Gemini"]',
  '[aria-label*="Model response"]'
];

function findMessages(container: Element): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let index = 0;

  const userEls = container.querySelectorAll(USER_SELECTORS.join(', '));
  const assistantEls = container.querySelectorAll(ASSISTANT_SELECTORS.join(', '));

  const allBlocks: { el: Element; role: 'user' | 'assistant' }[] = [];
  userEls.forEach((el) => allBlocks.push({ el, role: 'user' }));
  assistantEls.forEach((el) => allBlocks.push({ el, role: 'assistant' }));

  allBlocks.sort(
    (a, b) =>
      (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING)
        ? -1
        : 1
  );

  const seen = new Set<Element>();
  for (const { el, role } of allBlocks) {
    if (seen.has(el)) continue;
    seen.add(el);
    const content = getTextContent(el);
    if (content) {
      const isStreaming =
        role === 'assistant' &&
        (el.getAttribute('aria-busy') === 'true' ||
          !!el.querySelector('[class*="loading"], [class*="streaming"], [aria-busy="true"]'));
      messages.push({
        id: messageId(content, index++),
        role,
        content,
        isStreaming
      });
    }
  }

  if (messages.length === 0) {
    const fallback = container.querySelectorAll(
      '[role="article"], [class*="message"], [class*="turn"], [class*="bubble"], [data-turn], [class*="chat-message"]'
    );
    fallback.forEach((el, i) => {
      const content = getTextContent(el);
      if (content && content.length > 0) {
        const isUser =
          el.querySelector(USER_SELECTORS.join(', ')) ??
          el.closest('[class*="user"]') ??
          el.closest('[class*="human"]');
        messages.push({
          id: messageId(content, i),
          role: isUser ? 'user' : 'assistant',
          content,
          isStreaming: false
        });
      }
    });
  }

  if (messages.length === 0) {
    const segments = container.querySelectorAll(
      '[class*="segment"], [class*="block"], [class*="content"] p, [class*="message"] > div'
    );
    const textBlocks: { text: string; el: Element }[] = [];
    segments.forEach((el) => {
      const text = getTextContent(el);
      if (text && text.length > 2) textBlocks.push({ text, el });
    });
    textBlocks.forEach(({ text }, i) => {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
      messages.push({
        id: messageId(text, i),
        role,
        content: text,
        isStreaming: false
      });
    });
  }

  return messages;
}

export class GeminiScraper implements ChatScraper {
  site = 'gemini' as const;

  isMatch(url: string): boolean {
    return url.includes('gemini.google.com');
  }

  scrape(): ScrapedContext {
    const messages = findMessages(document.body);
    return createScrapedContext(
      this.site,
      window.location.href,
      messages,
      extractConversationId()
    );
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const debouncedCallback = debounce(() => {
      callback(this.scrape());
    }, 300);

    const observer = new MutationObserver(() => {
      debouncedCallback();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    debouncedCallback();

    return () => observer.disconnect();
  }
}
