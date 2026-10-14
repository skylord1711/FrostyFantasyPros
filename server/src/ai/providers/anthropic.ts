import {
  AiProviderError,
  isRetryableStatus,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider
} from '../types.js'

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Anthropic's Messages API differs from the OpenAI shape: the system prompt is a
 * top-level field and auth uses `x-api-key` instead of a bearer token.
 */
export function anthropicProvider(apiKey: string, model: string): AiProvider {
  return {
    id: 'anthropic',
    label: 'Anthropic',
    model,
    isConfigured: () => apiKey.trim().length > 0 && model.trim().length > 0,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      if (!apiKey.trim()) throw new AiProviderError('anthropic', 'API key is not configured', false)

      const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
      const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
      const started = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000)

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: req.model ?? model,
            max_tokens: req.maxTokens ?? 1024,
            temperature: req.temperature ?? 0.7,
            ...(system ? { system } : {}),
            messages
          }),
          signal: controller.signal
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new AiProviderError('anthropic', 'Anthropic returned ' + res.status + ': ' + body.slice(0, 300), isRetryableStatus(res.status))
        }
        const data = (await res.json()) as AnthropicResponse
        const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
        return {
          text,
          provider: 'anthropic',
          model: req.model ?? model,
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          latencyMs: Date.now() - started,
          degraded: false
        }
      } catch (error) {
        if (error instanceof AiProviderError) throw error
        const message = error instanceof Error && error.name === 'AbortError' ? 'Anthropic timed out' : 'Anthropic request failed: ' + String(error)
        throw new AiProviderError('anthropic', message)
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
