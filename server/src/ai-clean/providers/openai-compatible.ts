/**
 * Shared client for OpenAI-compatible `/chat/completions` endpoints.
 *
 * Groq, OpenAI itself, and Gemini all expose this exact shape, so one
 * implementation covers three providers. Only Anthropic needs its own request
 * format (see `anthropic.ts`).
 */
import {
  AiProviderError,
  isRetryableStatus,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from "../types";

export interface OpenAiCompatibleConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra headers some gateways require. */
  headers?: Record<string, string>;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export function openAiCompatibleProvider(config: OpenAiCompatibleConfig): AiProvider {
  return {
    id: config.id,
    label: config.label,
    isConfigured: () => config.apiKey.trim().length > 0 && config.model.trim().length > 0,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      if (!config.apiKey.trim()) {
        throw new AiProviderError(config.id, "API key is not configured", false);
      }

      const started = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

      try {
        const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            ...config.headers,
          },
          body: JSON.stringify({
            model: config.model,
            messages: req.messages,
            max_tokens: req.maxTokens ?? 700,
            temperature: req.temperature ?? 0.6,
            ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new AiProviderError(
            config.id,
            `${config.label} returned ${response.status}: ${body.slice(0, 300)}`,
            isRetryableStatus(response.status),
          );
        }

        const data = (await response.json()) as ChatCompletionResponse;
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) {
          throw new AiProviderError(config.id, `${config.label} returned an empty response`);
        }

        return {
          text,
          provider: config.id,
          model: config.model,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - started,
          degraded: false,
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        const message =
          error instanceof Error && error.name === "AbortError"
            ? `${config.label} timed out`
            : `${config.label} request failed: ${(error as Error).message}`;
        throw new AiProviderError(config.id, message);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
