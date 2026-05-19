const { ChatOpenAI } = require('@langchain/openai');
const { ChatAnthropic } = require('@langchain/anthropic');

const NEEDS_API_KEY = new Set(['openai', 'anthropic', 'openrouter', 'gemini']);

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama: 'http://127.0.0.1:11434/v1',
};

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd/i,
];

function validateBaseUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid base URL: "${trimmed}".`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Base URL must use http(s), got "${parsed.protocol}".`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^127\./.test(hostname);
  if (isLoopback || PRIVATE_IP_PATTERNS.some((re) => re.test(hostname))) {
    if (parsed.protocol !== 'http:' || !isLoopback) {
      throw new Error(
        'Base URL for private or loopback hosts must use http:// with localhost or 127.x address.',
      );
    }
  }
  return trimmed;
}

/**
 * Streams an LLM response for the given message array.
 * Calls `onChunk(text)` for each token and returns the full accumulated response.
 */
async function streamInference({ messages, apiKey, providerId, modelId, apiBaseUrl, onChunk }) {
  if (!apiKey && NEEDS_API_KEY.has(providerId)) {
    throw new Error(`API key is required for provider "${providerId}".`);
  }

  let model;

  if (providerId === 'anthropic') {
    model = new ChatAnthropic({
      apiKey,
      model: modelId,
      streaming: true,
      temperature: 0.4,
    });
  } else {
    const validatedCustomUrl = validateBaseUrl(apiBaseUrl);
    const baseURL = validatedCustomUrl || DEFAULT_BASE_URLS[providerId];
    if (!baseURL) {
      throw new Error(
        `Provider "${providerId}" requires a base URL in desktop settings (e.g. http://127.0.0.1:11434/v1 for Ollama).`,
      );
    }
    model = new ChatOpenAI({
      apiKey: apiKey || 'no-key',
      model: modelId,
      streaming: true,
      temperature: 0.4,
      configuration: { baseURL },
    });
  }

  const stream = await model.stream(messages);
  let fullResponse = '';

  for await (const chunk of stream) {
    const text = typeof chunk.content === 'string' ? chunk.content : '';
    if (text) {
      fullResponse += text;
      if (typeof onChunk === 'function') onChunk(text);
    }
  }

  return fullResponse;
}

module.exports = { streamInference };
