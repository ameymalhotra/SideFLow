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
  const match = pathname.match(/\/chat\/([^/]+)/i) ?? pathname.match(/\/([a-f0-9-]{8,})/i);
  if (match?.[1]) return match[1];
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last.length > 2 && /^[a-zA-Z0-9_-]+$/.test(last)) return last;
  if (pathname && pathname !== '/') return simpleHash(pathname);
  return undefined;
}

const MESSAGE_SELECTORS = [
  '[data-is-human-message]',
  '[class*="font-claude-message"] [class*="message"]',
  '[class*="message"]'
];

function getRole(el: Element): 'user' | 'assistant' {
  const attr = el.getAttribute('data-is-human-message');
  if (attr === 'true') return 'user';
  if (attr === 'false') return 'assistant';
  const isUser =
    el.closest('[data-is-human-message="true"]') ??
    el.querySelector('[data-is-human-message="true"]') ??
    el.closest('[class*="user"]');
  return isUser ? 'user' : 'assistant';
}

function isStreaming(el: Element): boolean {
  return !!(
    el.querySelector('[class*="typing"], [class*="streaming"], [aria-busy="true"]') ??
    (el.getAttribute('data-is-human-message') === 'false' &&
      !el.querySelector('button, [class*="copy"]'))
  );
}

export class ClaudeScraper implements ChatScraper {
  site = 'claude' as const;

  isMatch(url: string): boolean {
    return url.includes('claude.ai');
  }

  scrape(): ScrapedContext {
    const messages: ChatMessage[] = [];
    let usedSelector = false;

    for (const sel of MESSAGE_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length === 0) continue;
      usedSelector = true;
      els.forEach((el, i) => {
        const content = getTextContent(el);
        if (content) {
          const role = getRole(el);
          messages.push({
            id: messageId(content, i),
            role,
            content,
            isStreaming: role === 'assistant' ? isStreaming(el) : false
          });
        }
      });
      if (messages.length > 0) break;
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
    }, 300);

    let root: Element = document.body;
    for (const sel of MESSAGE_SELECTORS) {
      const first = document.querySelector(sel);
      if (first) {
        root = first.closest('main') ?? first.closest('[class*="conversation"]') ?? document.body;
        break;
      }
    }

    const observer = new MutationObserver(() => {
      debouncedCallback();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    debouncedCallback();

    return () => observer.disconnect();
  }
}
