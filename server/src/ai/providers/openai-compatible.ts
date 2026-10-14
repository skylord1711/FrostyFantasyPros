import {
  AiProviderError,
  isRetryableStatus,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider
} from '../types.js'

/** Shared provider for OpenAI-compatible chat APIs (Groq, Gemini, OpenAI). */
export interface OpenAiCompatibleConfig {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  headers?: Record<string, string>
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function openAiCompatibleProvider(cfg: OpenAiCompatibleConfig): AiProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    model: cfg.model,
    isConfigured: () => cfg.apiKey.trim().length > 0,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const model = req.model ?? cfg.model
      const started = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000)
      try {
        const res = await fetch(cfg.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + cfg.apiKey,
            ...(cfg.headers ?? {})
          },
          body: JSON.stringify({
            model,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 1024
          }),
          signal: controller.signal
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new AiProviderError(cfg.id, body.slice(0, 300) || 'request failed', isRetryableStatus(res.status))
        }
        const json = (await res.json()) as ChatCompletionResponse
        return {
          text: json.choices?.[0]?.message?.content ?? '',
          provider: cfg.id,
          model,
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - started,
          degraded: false
        }
      } catch (error) {
        if (error instanceof AiProviderError) throw error
        const message = error instanceof Error && error.name === 'AbortError' ? cfg.label + ' timed out' : String(error)
        throw new AiProviderError(cfg.id, message)
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
