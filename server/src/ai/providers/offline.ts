import type { AiCompletionRequest, AiCompletionResult, AiProvider } from '../types.js'

/**
 * Deterministic fallback used when no remote provider is configured or every
 * provider fails. It never throws, so `complete()` always has something to return.
 */
export function offlineProvider(): AiProvider {
  return {
    id: 'offline',
    label: 'Offline',
    model: 'deterministic',
    isConfigured: () => true,
    async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
      const last = req.messages[req.messages.length - 1]?.content ?? ''
      return {
        text: 'Frosty is offline right now. Ask again in a moment, or check your rankings and matchup data directly. (' + last.slice(0, 140) + ')',
        provider: 'offline',
        model: 'deterministic',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        degraded: true
      }
    }
  }
}
