export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export interface ScrapedContext {
  site: 'chatgpt' | 'gemini' | 'claude';
  url: string;
  conversationId?: string;
  messages: ChatMessage[];
  scrapedAt: number;
}

export interface ChatScraper {
  site: 'chatgpt' | 'gemini' | 'claude';
  isMatch(url: string): boolean;
  scrape(): ScrapedContext;
  observe(callback: (context: ScrapedContext) => void): () => void;
}
