import type { ChatScraper, ChatMessage, ScrapedContext } from './types';
import {
  debounce,
  DEBOUNCE_MS,
  getTextContent,
  messageId,
  createScrapedContext
} from './base';

const MESSAGE_SELECTORS = [
  '[data-message-author-role]',
  '[data-testid^="conversation-turn"]',
  '[class*="group"][class*="message"]'
];

const CONTENT_SELECTORS = {
  user: ['.whitespace-pre-wrap', '[data-message-author-role="user"]'],
  assistant: ['.markdown', '.prose', '[data-message-author-role="assistant"]']
};

function extractConversationId(): string | undefined {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
  return match?.[1];
}

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
    return (
      url.includes('chat.openai.com') ||
      url.includes('chatgpt.com')
    );
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
      extractConversationId()
    );
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const debouncedCallback = debounce(() => {
      callback(this.scrape());
    }, DEBOUNCE_MS);

    let container: Element | null = null;
    for (const sel of MESSAGE_SELECTORS) {
      const first = document.querySelector(sel);
      if (first) {
        container = first.closest('main') ?? document.body;
        break;
      }
    }
    if (!container) container = document.body;

    const observer = new MutationObserver(() => {
      debouncedCallback();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    debouncedCallback();

    return () => observer.disconnect();
  }
}
