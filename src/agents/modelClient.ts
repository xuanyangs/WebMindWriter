export type ModelConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  temperature: number;
};

export type ModelMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class ModelClient {
  constructor(private readonly config: ModelConfig) {}

  async generate(messages: ModelMessage[]): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("MODEL_API_KEY is required unless --dry-run is used.");
    }

    const endpoint = new URL("chat/completions", ensureTrailingSlash(this.config.baseUrl));
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        "authorization": `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        messages
      })
    });

    const payload = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Model API HTTP ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Model API returned an empty response.");
    }

    return content;
  }
}

export function makeModelConfig(env: NodeJS.ProcessEnv): ModelConfig {
  return {
    baseUrl: env.MODEL_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: env.MODEL_API_KEY,
    model: env.MODEL_NAME ?? "gpt-4.1-mini",
    timeoutMs: readNumber(env.MODEL_TIMEOUT_MS, 60_000),
    temperature: readNumber(env.MODEL_TEMPERATURE, 0.4)
  };
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
