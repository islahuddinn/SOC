import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export type LlmProviderName = 'openai' | 'groq';

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
}

export interface ChatCompletionChoice {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
}

export interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
  provider: LlmProviderName;
  model: string;
}

export interface LlmConfig {
  provider: LlmProviderName;
  model: string;
  configured: boolean;
}
