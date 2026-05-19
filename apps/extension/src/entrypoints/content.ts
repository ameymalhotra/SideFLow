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

function sendRuntimeMessage(message: object, logLabel = 'content'): void {
  try {
    chrome.runtime.sendMessage(message, () => {
      const err = chrome.runtime.lastError;
      if (err?.message) {
        console.warn(`[SideFlow] ${logLabel} sendMessage:`, err.message);
      }
    });
  } catch (e) {
    console.warn(`[SideFlow] ${logLabel} sendMessage failed:`, e);
  }
}

function safeScrape(scraper: (typeof scrapers)[number]): ScrapedContext | null {
  try {
    return scraper.scrape();
  } catch (e) {
    console.warn('[SideFlow] scrape failed:', e);
    return null;
  }
}

export default defineContentScript({
  // Keep in sync with `wxt.config.ts` host_permissions and `src/lib/sites.ts`
  // (CHAT_URL_PATTERNS). WXT extracts this list statically for the manifest.
  matches: [
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://gemini.google.com/*',
    '*://claude.ai/*'
  ],
  main() {
    let stopObserving: (() => void) | undefined;
    let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
    let routeDebounce: ReturnType<typeof setTimeout> | null = null;
    let lastDedupeKey = '';
    let currentScraper: (typeof scrapers)[number] | null = null;

    const dedupeKeyFor = (ctx: ScrapedContext) =>
      JSON.stringify({
        site: ctx.site,
        url: ctx.url,
        conversationId: ctx.conversationId ?? null,
        messages: ctx.messages
      });

    const maybeSendUpdate = (context: ScrapedContext) => {
      const deduped = withDedupedMessages(context);
      const key = dedupeKeyFor(deduped);
      if (key === lastDedupeKey) return;
      lastDedupeKey = key;
      sendRuntimeMessage({
        type: 'chat_update',
        ...deduped
      });
    };

    const startOrRestart = () => {
      if (stopObserving) {
        stopObserving();
        stopObserving = undefined;
      }

      const scraper = scrapers.find((s) => s.isMatch(window.location.href)) ?? null;
      currentScraper = scraper;
      if (!scraper) return;

      const initial = safeScrape(scraper);
      if (!initial) return;
      const initialContext = withDedupedMessages(initial);
      sendRuntimeMessage({
        type: 'site_detected',
        ...initialContext
      });

      lastDedupeKey = dedupeKeyFor(initialContext);
      stopObserving = scraper.observe((ctx) => {
        try {
          maybeSendUpdate(ctx);
        } catch (e) {
          console.warn('[SideFlow] update handler failed:', e);
        }
      });
    };

    const scheduleRouteRestart = () => {
      if (routeDebounce) clearTimeout(routeDebounce);
      routeDebounce = setTimeout(() => {
        routeDebounce = null;
        startOrRestart();
      }, 160);
    };

    const origPushState = history.pushState.bind(history);
    history.pushState = (...args: Parameters<History['pushState']>) => {
      origPushState(...args);
      scheduleRouteRestart();
    };
    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      origReplaceState(...args);
      scheduleRouteRestart();
    };
    window.addEventListener('popstate', scheduleRouteRestart);
    window.addEventListener('hashchange', scheduleRouteRestart);

    startOrRestart();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        visibilityDebounce = null;
        if (!currentScraper) return;
        const scraped = safeScrape(currentScraper);
        if (!scraped) return;
        const context = withDedupedMessages(scraped);
        sendRuntimeMessage({
          type: 'site_detected',
          ...context
        });
        lastDedupeKey = dedupeKeyFor(context);
      }, 150);
    });

    chrome.runtime.onMessage.addListener(
      (msg: { type: string }, _sender, sendResponse) => {
        if (msg.type !== 'get_context') {
          sendResponse(null);
          return false;
        }
        if (!currentScraper) {
          sendResponse(null);
          return false;
        }
        try {
          const scraped = safeScrape(currentScraper);
          if (!scraped) {
            sendResponse(null);
            return false;
          }
          const context = withDedupedMessages(scraped);
          sendResponse({ type: 'chat_update', ...context });
        } catch (e) {
          console.warn('[SideFlow] get_context failed:', e);
          sendResponse(null);
        }
        return false;
      }
    );

    window.addEventListener('beforeunload', () => {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      if (routeDebounce) clearTimeout(routeDebounce);
      if (currentScraper) {
        sendRuntimeMessage({
          type: 'site_left',
          site: currentScraper.site,
          url: typeof window !== 'undefined' ? window.location.href : undefined
        });
      }
      if (typeof stopObserving === 'function') stopObserving();
    });
  }
});
