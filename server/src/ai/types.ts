export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  role: AiRole
  content: string
}

export interface AiCompletionRequest {
  messages: AiMessage[]
  /** Overrides the provider's default model for this call. */
  model?: string
  maxTokens?: number
  temperature?: number
  /** Abort the call after this many milliseconds. */
  timeoutMs?: number
}

export interface AiCompletionResult {
  text: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  /** True when no remote provider answered and this came from the offline fallback. */
  degraded: boolean
}

export interface AiProvider {
  id: string
  label: string
  model: string
  isConfigured(): boolean
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>
}

export class AiProviderError extends Error {
  readonly provider: string
  readonly retryable: boolean
  constructor(provider: string, message: string, retryable = true) {
    super(message)
    this.name = 'AiProviderError'
    this.provider = provider
    this.retryable = retryable
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}
