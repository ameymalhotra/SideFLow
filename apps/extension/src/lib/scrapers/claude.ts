import type { ChatScraper, ChatMessage, ScrapedContext } from './types';
import {
  createDOMObserver,
  getTextContent,
  messageId,
  sortByDocumentPosition,
  createScrapedContext
} from './base';
import { urlMatchesSite } from '../sites';
import { extractClaudeConversationId } from './conversation-id';

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

  const orderedBlocks = sortByDocumentPosition(allBlocks, (b) => b.el);

  const messages: ChatMessage[] = [];
  const seenText = new Set<string>();

  orderedBlocks.forEach(({ el, role }, i) => {
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
    extractClaudeConversationId()
  );
}

export class ClaudeScraper implements ChatScraper {
  site = 'claude' as const;

  isMatch(url: string): boolean {
    return urlMatchesSite(url, this.site);
  }

  scrape(): ScrapedContext {
    return scrape();
  }

  observe(callback: (context: ScrapedContext) => void): () => void {
    const allSelectors = [
      ...MESSAGE_SELECTORS,
      '[class*="standard-markdown"]',
      '[class*="font-claude-response-body"]',
      '[data-is-human-message="true"]',
    ];
    let root: Element = document.body;
    for (const sel of allSelectors) {
      const first = document.querySelector(sel);
      if (first) {
        root = first.closest('main') ?? first.closest('[class*="conversation"]') ?? document.body;
        break;
      }
    }
    return createDOMObserver(root, () => this.scrape(), callback);
  }
}
