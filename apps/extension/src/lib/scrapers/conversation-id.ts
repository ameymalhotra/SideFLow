import { simpleHash } from './base';

/** ChatGPT: canonical `/c/{id}` segment. */
export function extractChatGptConversationId(): string | undefined {
  const match = typeof window !== 'undefined' ? window.location.pathname.match(/\/c\/([a-f0-9-]+)/i) : null;
  return match?.[1];
}

/** Gemini: last path segment or hash of pathname. */
export function extractGeminiConversationId(): string | undefined {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last.length > 2 && /^[a-zA-Z0-9_-]+$/.test(last)) return last;
  if (pathname && pathname !== '/') return simpleHash(pathname);
  return undefined;
}

/** Claude: `/chat/{id}`, UUID-like segment, or hash fallback. */
export function extractClaudeConversationId(): string | undefined {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const match = pathname.match(/\/chat\/([^/]+)/i) ?? pathname.match(/\/([a-f0-9-]{8,})/i);
  if (match?.[1]) return match[1];
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && last.length > 2 && /^[a-zA-Z0-9_-]+$/.test(last)) return last;
  if (pathname && pathname !== '/') return simpleHash(pathname);
  return undefined;
}
