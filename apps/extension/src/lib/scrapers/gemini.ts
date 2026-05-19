import type { ChatScraper, ChatMessage, ScrapedContext } from './types';
import {
  createDOMObserver,
  getTextContent,
  messageId,
  sortByDocumentPosition,
  createScrapedContext
} from './base';
import { urlMatchesSite } from '../sites';
import { extractGeminiConversationId } from './conversation-id';

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

  const rawBlocks: { el: Element; role: 'user' | 'assistant' }[] = [];
  userEls.forEach((el) => rawBlocks.push({ el, role: 'user' }));
  assistantEls.forEach((el) => rawBlocks.push({ el, role: 'assistant' }));

  const allBlocks = sortByDocumentPosition(rawBlocks, (b) => b.el);

  const seen = new Set<Element>();
  for (const { el, role } of allBlocks) {
    if (seen.has(el)) continue;
    seen.add(el);
    let content = getTextContent(el);
    if (role === 'user' && /^\s*You said\s+/i.test(content)) {
      content = content.replace(/^\s*You said\s+/i, '').trim();
    }
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
    // Do not guess roles (even/odd); wait for a reliable DOM pass instead.
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[SideFlow] Gemini: no messages matched selectors');
    }
  }

  return messages;
}

export class GeminiScraper implements ChatScraper {
  site = 'gemini' as const;

  isMatch(url: string): boolean {
    return urlMatchesSite(url, this.site);
  }

  scrape(): ScrapedContext {
    const messages = findMessages(document.body);
    return createScrapedContext(
      this.site,
      window.location.href,
      messages,
      extractGeminiConversationId()
    );
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const root =
      document.querySelector('[class*="conversation"]') ??
      document.querySelector('main') ??
      document.body;
    return createDOMObserver(root, () => this.scrape(), callback);
  }
}
