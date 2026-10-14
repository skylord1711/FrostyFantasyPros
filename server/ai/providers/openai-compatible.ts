/**
 * OpenAI-compatible provider (Groq, Gemini, OpenAI)
 */
import {
  AiProviderError,
  isRetryableStatus,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from '../types.js'

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
  error?: { message?: string }
}

export function openAiCompatibleProvider(cfg: OpenAiCompatibleConfig): AiProvider {
  return {
    id: cfg.id,
    label: cfg.label,
    model: cfg.model,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + cfg.apiKey,
        ...(cfg.headers || {}),
      }
      const messages = req.messages.map((m) => ({ role: m.role, content: m.content }))
      const payload = {
        model: req.model ?? cfg.model,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
      }
      const res = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AiProviderError(text || 'request failed', res.status, isRetryableStatus(res.status))
      }
      const json = (await res.json()) as ChatCompletionResponse
      const content = json.choices?.[0]?.message?.content ?? ''
      return {
        content,
        provider: cfg.id,
        model: payload.model,
        usage: json.usage,
      }
    },
  }
}
