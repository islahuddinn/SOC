import OpenAI from 'openai';
import type { ChatCompletionRequest, ChatCompletionResponse, LlmConfig, LlmProviderName } from './types';

const PROVIDER_DEFAULTS: Record<LlmProviderName, { model: string; baseURL?: string }> = {
  openai: { model: 'gpt-4o-mini' },
  groq: { model: 'llama-3.3-70b-versatile', baseURL: 'https://api.groq.com/openai/v1' },
};

function resolveProvider(): LlmProviderName {
  const raw = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  if (raw === 'openai' || raw === 'groq') return raw;
  return 'groq';
}

function getApiKey(provider: LlmProviderName): string | undefined {
  return provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
}

function getModel(provider: LlmProviderName): string {
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL || PROVIDER_DEFAULTS.openai.model;
  }
  return process.env.GROQ_MODEL || PROVIDER_DEFAULTS.groq.model;
}

const clients = new Map<LlmProviderName, OpenAI>();

function getClient(provider: LlmProviderName): OpenAI {
  const existing = clients.get(provider);
  if (existing) return existing;

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(
      provider === 'openai'
        ? 'OPENAI_API_KEY is not configured.'
        : 'GROQ_API_KEY is not configured. Get a free key at https://console.groq.com'
    );
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  const client = new OpenAI({
    apiKey,
    baseURL: defaults.baseURL,
  });
  clients.set(provider, client);
  return client;
}

export function getLlmConfig(): LlmConfig {
  const provider = resolveProvider();
  return {
    provider,
    model: getModel(provider),
    configured: Boolean(getApiKey(provider)),
  };
}

export function getAvailableProviders(): Array<{ name: LlmProviderName; configured: boolean; model: string }> {
  return (['openai', 'groq'] as LlmProviderName[]).map((name) => ({
    name,
    configured: Boolean(getApiKey(name)),
    model: name === 'openai'
      ? process.env.OPENAI_MODEL || PROVIDER_DEFAULTS.openai.model
      : process.env.GROQ_MODEL || PROVIDER_DEFAULTS.groq.model,
  }));
}

export async function createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const provider = resolveProvider();
  const model = request.model || getModel(provider);
  const client = getClient(provider);

  const response = await client.chat.completions.create({
    model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: 'auto',
  });

  const choice = response.choices[0];
  return {
    provider,
    model,
    choices: choice
      ? [{
          message: {
            content: choice.message.content,
            tool_calls: choice.message.tool_calls
              ?.filter((tc): tc is typeof tc & { type: 'function' } => tc.type === 'function')
              .map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
          },
        }]
      : [],
  };
}

export function clearLlmClients(): void {
  clients.clear();
}
