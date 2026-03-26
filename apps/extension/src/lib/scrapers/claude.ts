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

/** querySelectorAll that pierces shadow DOM */
function queryAllDeep(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = [];
  try {
    root.querySelectorAll(selector).forEach((el) => results.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) {
        queryAllDeep(el.shadowRoot, selector).forEach((e) => results.push(e));
      }
    });
  } catch {
    // ignore
  }
  return results;
}

/** Primary: [data-is-human-message] for both user and assistant with correct roles */
const MESSAGE_SELECTORS = [
  '[data-is-human-message]',
  '[class*="font-claude-message"] [class*="message"]',
  '[class*="message"]'
];

function getRole(el: Element): 'user' | 'assistant' {
  const attr = el.getAttribute('data-is-human-message');
  if (attr === 'true') return 'user';
  if (attr === 'false') return 'assistant';
  if (el.classList?.toString().includes('font-claude-response-body') ||
      el.classList?.toString().includes('standard-markdown')) return 'assistant';
  const isUser =
    el.closest('[data-is-human-message="true"]') ??
    el.querySelector('[data-is-human-message="true"]') ??
    el.closest('[class*="user"]');
  return isUser ? 'user' : 'assistant';
}

/** Get text; for assistant, prefer standard-markdown or font-claude-response-body child (content may be nested) */
function getMessageContent(el: Element, role: 'user' | 'assistant'): string {
  const direct = getTextContent(el);
  if (direct) return direct;
  if (role !== 'assistant') return '';
  const fromChild =
    el.querySelector('[class*="standard-markdown"]') ??
    el.querySelector('[class*="font-claude-response-body"]');
  return (fromChild ? getTextContent(fromChild) : '') || '';
}

function isStreaming(el: Element): boolean {
  return !!(
    el.querySelector('[class*="typing"], [class*="streaming"], [aria-busy="true"]') ??
    (el.getAttribute('data-is-human-message') === 'false' &&
      !el.querySelector('button, [class*="copy"]'))
  );
}

function scrape(): ScrapedContext {
  const allBlocks: { el: Element; role: 'user' | 'assistant' }[] = [];
  const seenEls = new Set<Element>();

  for (const sel of MESSAGE_SELECTORS) {
    const els = queryAllDeep(document, sel);
    if (els.length === 0) continue;

    els.forEach((el) => {
      const ancestor = el.closest(sel);
      if (ancestor !== el) return; // skip nested
      if (seenEls.has(el)) return;
      seenEls.add(el);
      const role = getRole(el);
      allBlocks.push({ el, role });
    });

    if (allBlocks.length > 0) break;
  }

  // Ensure we get user blocks: [data-is-human-message="true"] may exist when generic selector misses them
  queryAllDeep(document, '[data-is-human-message="true"]').forEach((el) => {
    const ancestor = el.closest('[data-is-human-message="true"]');
    if (ancestor !== el || seenEls.has(el)) return;
    seenEls.add(el);
    allBlocks.push({ el, role: 'user' as const });
  });

  // Always add assistant blocks from standard-markdown (full response container)
  // data-is-human-message="false" may have empty direct text; content lives in this child
  queryAllDeep(document, '[class*="standard-markdown"]').forEach((el) => {
    const ancestor = el.closest('[class*="standard-markdown"]');
    if (ancestor !== el || seenEls.has(el)) return;
    seenEls.add(el);
    allBlocks.push({ el, role: 'assistant' as const });
  });

  allBlocks.sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );

  const messages: ChatMessage[] = [];
  const seenText = new Set<string>();

  allBlocks.forEach(({ el, role }, i) => {
    const content = getMessageContent(el, role);
    if (!content || content.length < 2 || seenText.has(content)) return;
    seenText.add(content);

    messages.push({
      id: messageId(content, i),
      role,
      content,
      isStreaming: role === 'assistant' ? isStreaming(el) : false
    });
  });

  return createScrapedContext(
    'claude',
    window.location.href,
    messages,
    extractConversationId()
  );
}

export class ClaudeScraper implements ChatScraper {
  site = 'claude' as const;

  isMatch(url: string): boolean {
    return url.includes('claude.ai');
  }

  scrape(): ScrapedContext {
    return scrape();
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const debouncedCallback = debounce(() => {
      callback(this.scrape());
    }, 300);

    const allSelectors = [...MESSAGE_SELECTORS, '[class*="standard-markdown"]', '[class*="font-claude-response-body"]', '[data-is-human-message="true"]'];
    let root: Element = document.body;
    for (const sel of allSelectors) {
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
