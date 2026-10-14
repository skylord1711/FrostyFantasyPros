import { anthropicProvider } from './providers/anthropic.js'
import { offlineProvider } from './providers/offline.js'
import { openAiCompatibleProvider } from './providers/openai-compatible.js'
import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiMessage,
  type AiProvider
} from './types.js'

export const AI_PROVIDERS = ['auto', 'groq', 'gemini', 'openai', 'anthropic', 'none'] as const
export type AiProviderName = (typeof AI_PROVIDERS)[number]

const DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash-lite' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
}

function envModel(provider: string, fallback: string): string {
  const specific = process.env[provider.toUpperCase() + '_MODEL']
  if (specific && specific.trim()) return specific.trim()
  return DEFAULTS[provider]?.model ?? fallback
}

function buildProviders(): AiProvider[] {
  const providers: AiProvider[] = []

  const groqKey = (process.env.GROQ_API_KEY ?? '').trim()
  if (groqKey) {
    providers.push(openAiCompatibleProvider({ id: 'groq', label: 'Groq', baseUrl: DEFAULTS.groq.baseUrl, apiKey: groqKey, model: envModel('groq', DEFAULTS.groq.model) }))
  }

  const geminiKey = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim()
  if (geminiKey) {
    providers.push(openAiCompatibleProvider({ id: 'gemini', label: 'Gemini', baseUrl: DEFAULTS.gemini.baseUrl, apiKey: geminiKey, model: envModel('gemini', DEFAULTS.gemini.model) }))
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? '').trim()
  if (openaiKey) {
    providers.push(openAiCompatibleProvider({
      id: 'openai',
      label: 'OpenAI',
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULTS.openai.baseUrl,
      apiKey: openaiKey,
      model: envModel('openai', DEFAULTS.openai.model)
    }))
  }

  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  if (anthropicKey) {
    providers.push(anthropicProvider(anthropicKey, envModel('anthropic', 'claude-3-5-haiku-latest')))
  }

  return providers
}

/** Preferred provider first, then the remaining configured providers as fallbacks. */
export function providerChain(): AiProvider[] {
  const configured = buildProviders()
  const preference = (process.env.AI_PROVIDER ?? 'auto').trim().toLowerCase()
  if (preference === 'none') return []
  if (preference === 'auto') return configured
  return [...configured.filter((p) => p.id === preference), ...configured.filter((p) => p.id !== preference)]
}

/** Never throws: falls through every provider and lands on the offline fallback. */
export async function complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
  for (const provider of providerChain()) {
    try {
      return await provider.complete(req)
    } catch (error) {
      const message = error instanceof AiProviderError ? error.message : String(error)
      console.warn('[ai] ' + provider.id + ' failed, trying next provider: ' + message)
    }
  }
  return offlineProvider().complete(req)
}

export { AiProviderError }
export type { AiCompletionRequest, AiCompletionResult, AiMessage, AiProvider }
