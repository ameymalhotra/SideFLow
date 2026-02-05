import type { ScrapedContext } from '../lib/scrapers';
import {
  ChatGPTScraper,
  GeminiScraper,
  ClaudeScraper,
  deduplicateMessagesByContent
} from '../lib/scrapers';

const scrapers = [
  new ChatGPTScraper(),
  new GeminiScraper(),
  new ClaudeScraper()
];

function withDedupedMessages(context: ScrapedContext): ScrapedContext {
  return {
    ...context,
    messages: deduplicateMessagesByContent(context.messages)
  };
}

export default defineContentScript({
  matches: [
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://gemini.google.com/*',
    '*://claude.ai/*'
  ],
  main() {
    const scraper = scrapers.find((s) => s.isMatch(window.location.href));
    if (!scraper) return;

    const initialContext = withDedupedMessages(scraper.scrape());
    chrome.runtime.sendMessage({
      type: 'site_detected',
      ...initialContext
    });

    let lastSentJSON = JSON.stringify(initialContext.messages);

    const maybeSendUpdate = (context: ScrapedContext) => {
      const deduped = withDedupedMessages(context);
      const json = JSON.stringify(deduped.messages);
      if (json === lastSentJSON) return;
      lastSentJSON = json;
      chrome.runtime.sendMessage({
        type: 'chat_update',
        ...deduped
      });
    };

    const stopObserving = scraper.observe(maybeSendUpdate);

    let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        visibilityDebounce = null;
        const context = withDedupedMessages(scraper.scrape());
        chrome.runtime.sendMessage({
          type: 'site_detected',
          ...context
        });
        lastSentJSON = JSON.stringify(context.messages);
      }, 150);
    });

    chrome.runtime.onMessage.addListener(
      (msg: { type: string }, _sender, sendResponse) => {
        if (msg.type === 'get_context') {
          const context = withDedupedMessages(scraper.scrape());
          sendResponse({ type: 'chat_update', ...context });
        }
        return true;
      }
    );

    window.addEventListener('beforeunload', () => {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      chrome.runtime.sendMessage({ type: 'site_left', site: scraper.site });
      if (typeof stopObserving === 'function') stopObserving();
    });
  }
});
