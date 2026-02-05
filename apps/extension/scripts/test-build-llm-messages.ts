/**
 * Quick test for buildLLMMessages. Run: npm run test:llm-messages
 */
import { buildLLMMessages } from '../src/lib/buildLLMMessages';
import type { ScrapedContext } from '../src/lib/scrapers/types';

const sampleContext: ScrapedContext = {
  site: 'gemini',
  url: 'https://gemini.google.com/app/abc123',
  messages: [
    { id: '0-2kh', role: 'user', content: 'What is a regex?', isStreaming: false },
    {
      id: '1-xyz',
      role: 'assistant',
      content:
        'A regular expression (regex) is a sequence of characters that defines a search pattern, often used for matching or parsing text.',
      isStreaming: false,
    },
    {
      id: '2-abc',
      role: 'user',
      content: 'Give me an example in JavaScript',
      isStreaming: false,
    },
    {
      id: '3-def',
      role: 'assistant',
      content: 'For example: /hello/.test("hello world") returns true.',
      isStreaming: false,
    },
  ],
  scrapedAt: Date.now(),
};

const userQuestion = 'Summarize the last reply in one sentence.';

console.log('--- Input ---');
console.log('Context site:', sampleContext.site);
console.log('Messages:', sampleContext.messages.length);
console.log('User question:', userQuestion);
console.log('');

console.log('--- OpenAI shape ---');
const openai = buildLLMMessages(sampleContext, userQuestion, {
  provider: 'openai',
  includeSystemPrompt: true,
});
console.log(JSON.stringify(openai, null, 2));
console.log('');

console.log('--- Anthropic shape ---');
const anthropic = buildLLMMessages(sampleContext, userQuestion, {
  provider: 'anthropic',
  includeSystemPrompt: true,
});
console.log(JSON.stringify(anthropic, null, 2));
console.log('');

console.log('Done. buildLLMMessages is working.');
