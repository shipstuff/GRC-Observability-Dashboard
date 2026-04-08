import type { AIProvider } from "../config.js";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
}

interface ProviderConfig {
  apiKey: string;
  model: string;
  endpoint: string;
  formatRequest: (messages: AIMessage[], maxTokens: number) => object;
  parseResponse: (data: any) => string;
}

const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  anthropic: {
    apiKey: "",
    model: "claude-sonnet-4-20250514",
    endpoint: "https://api.anthropic.com/v1/messages",
    formatRequest: (messages, maxTokens) => {
      const system = messages.find(m => m.role === "system")?.content ?? "";
      const nonSystem = messages.filter(m => m.role !== "system");
      return {
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system,
        messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
      };
    },
    parseResponse: (data) => data.content?.[0]?.text ?? "",
  },
  openai: {
    apiKey: "",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    formatRequest: (messages, maxTokens) => ({
      model: "gpt-4o-mini",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content ?? "",
  },
};

export class AIClient {
  private provider: ProviderConfig;
  private providerName: AIProvider;

  constructor(providerName: AIProvider, apiKey: string) {
    this.providerName = providerName;
    this.provider = { ...PROVIDERS[providerName], apiKey };
  }

  async chat(messages: AIMessage[], maxTokens: number = 1024): Promise<AIResponse> {
    const body = this.provider.formatRequest(messages, maxTokens);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.providerName === "anthropic") {
      headers["x-api-key"] = this.provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${this.provider.apiKey}`;
    }

    const response = await fetch(this.provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI provider ${this.providerName} returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      content: this.provider.parseResponse(data),
      provider: this.providerName,
      model: this.provider.model,
    };
  }
}
