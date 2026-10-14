/**
 * Anthropic provider.
 *
 * Separated from `openai-compatible.ts` because the Messages API uses a
 * different envelope: the system prompt is a top-level field rather than a
 * message, and the auth header is `x-api-key` rather than a bearer token.
 */
import {
  AiProviderError,
  isRetryableStatus,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from "../types.js";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export function anthropicProvider(apiKey: string, model: string): AiProvider {
  return {
    id: "anthropic",
    label: "Anthropic",
    isConfigured: () => apiKey.trim().length > 0 && model.trim().length > 0,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      if (!apiKey.trim()) {
        throw new AiProviderError("anthropic", "API key is not configured", false);
      }

      const system = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const started = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens ?? 700,
            temperature: req.temperature ?? 0.6,
            ...(system ? { system } : {}),
            messages,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new AiProviderError(
            "anthropic",
            `Anthropic returned ${response.status}: ${body.slice(0, 300)}`,
            isRetryableStatus(response.status),
          );
        }

        const data = (await response.json()) as AnthropicResponse;
        const text = (data.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("");
        if (!text.trim()) {
          throw new AiProviderError("anthropic", "Anthropic returned an empty response");
        }

        return {
          text,
          provider: "anthropic",
          model,
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          latencyMs: Date.now() - started,
          degraded: false,
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Anthropic timed out"
            : `Anthropic request failed: ${(error as Error).message}`;
        throw new AiProviderError("anthropic", message);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
