import type { Site } from '../sites';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export interface ScrapedContext {
  site: Site;
  url: string;
  conversationId?: string;
  messages: ChatMessage[];
  scrapedAt: number;
}

export interface ChatScraper {
  site: Site;
  isMatch(url: string): boolean;
  scrape(): ScrapedContext;
  observe(callback: (context: ScrapedContext) => void): () => void;
}
