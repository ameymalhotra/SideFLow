import type { ChatScraper, ChatMessage, ScrapedContext } from './types';
import {
  createDOMObserver,
  getTextContent,
  messageId,
  createScrapedContext
} from './base';
import { urlMatchesSite } from '../sites';
import { extractChatGptConversationId } from './conversation-id';

const MESSAGE_SELECTORS = [
  '[data-message-author-role]',
  '[data-testid^="conversation-turn"]',
  '[class*="group"][class*="message"]'
];

const CONTENT_SELECTORS = {
  user: ['.whitespace-pre-wrap', '[data-message-author-role="user"]'],
  assistant: ['.markdown', '.prose', '[data-message-author-role="assistant"]']
};

function getMessageContent(el: Element, role: 'user' | 'assistant'): string {
  const selectors = CONTENT_SELECTORS[role];
  for (const sel of selectors) {
    const contentEl = el.querySelector(sel);
    if (contentEl) return getTextContent(contentEl);
  }
  return getTextContent(el);
}

function isStreaming(messageEl: Element): boolean {
  const hasActionButtons = messageEl.querySelector(
    '[data-testid="copy-button"], button[aria-label*="Copy"], [class*="copy"]'
  );
  return !hasActionButtons && messageEl.getAttribute('data-message-author-role') === 'assistant';
}

export class ChatGPTScraper implements ChatScraper {
  site = 'chatgpt' as const;

  isMatch(url: string): boolean {
    return urlMatchesSite(url, this.site);
  }

  scrape(): ScrapedContext {
    const messages: ChatMessage[] = [];
    let container: Element | null = null;

    for (const sel of MESSAGE_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        container = els[0].closest('main') ?? document.body;
        els.forEach((el, i) => {
          const roleAttr = el.getAttribute('data-message-author-role');
          const role =
            roleAttr === 'user' || roleAttr === 'assistant'
              ? roleAttr
              : el.querySelector('[data-message-author-role="user"]')
                ? 'user'
                : 'assistant';
          const content = getMessageContent(el, role);
          if (content) {
            messages.push({
              id: messageId(content, i),
              role,
              content,
              isStreaming: role === 'assistant' ? isStreaming(el) : false
            });
          }
        });
        break;
      }
    }

    return createScrapedContext(
      this.site,
      window.location.href,
      messages,
      extractChatGptConversationId()
    );
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const root = document.querySelector('main') ?? document.documentElement;
    return createDOMObserver(root, () => this.scrape(), callback);
  }
}
