/**
 * Single source of truth for the LLM chat surfaces SideFlow knows how to scrape.
 *
 * IMPORTANT: The same list is also encoded statically in two build-time
 * configs that WXT processes ahead of TypeScript:
 *   - `wxt.config.ts` → `manifest.host_permissions`
 *   - `src/entrypoints/content.ts` → `defineContentScript({ matches })`
 *
 * Both of those locations need to be kept in sync by hand. They are static
 * literals on purpose: WXT extracts them at build time to generate the Chrome
 * manifest, and reading them from this module at runtime would risk a stale
 * manifest. Treat this module as the runtime source of truth and `wxt.config`
 * + content-script matches as a mirror.
 */

export type Site = 'chatgpt' | 'gemini' | 'claude';

/** Hostnames covered by SideFlow scrapers. */
export const CHAT_HOSTS = [
  'chat.openai.com',
  'chatgpt.com',
  'gemini.google.com',
  'claude.ai',
] as const;

/** Manifest-V3 match patterns (`background.ts` uses these with `chrome.tabs.query`). */
export const CHAT_URL_PATTERNS = [
  '*://chat.openai.com/*',
  '*://chatgpt.com/*',
  '*://gemini.google.com/*',
  '*://claude.ai/*',
] as const;

/** Map a hostname to its scraper site id, or `null` if unsupported. */
export function siteForHost(host: string): Site | null {
  if (host === 'chat.openai.com' || host === 'chatgpt.com') return 'chatgpt';
  if (host === 'gemini.google.com') return 'gemini';
  if (host === 'claude.ai') return 'claude';
  return null;
}

/** True when `url` lives on (or is a subdomain of) one of the supported hosts. */
export function isSupportedChatUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return CHAT_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/** True when `url` is served by the given scraper site. */
export function urlMatchesSite(url: string, site: Site): boolean {
  try {
    return siteForHost(new URL(url).hostname) === site;
  } catch {
    return false;
  }
}
