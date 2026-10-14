import { anthropicProvider } from './providers/anthropic.ts'
import { offlineTutorProvider } from './providers/offline.ts'
import { openAiCompatibleProvider } from './providers/openai-compatible.ts'
import { AiProviderError, type AiCompletionRequest, type AiCompletionResult, type AiProvider, type AiMessage } from './types.ts'

export const AI_PROVIDERS = ['auto', 'groq', 'gemini', 'openai', 'anthropic', 'none'] as const
export type AiProviderName = (typeof AI_PROVIDERS)[number]

const DEFAULTS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash-lite' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
}

function envModel(provider: string, fallback: string): string {
  const key = provider.toUpperCase() + '_MODEL'
  const specific = process.env[key]
  if (specific && specific.trim()) return specific.trim()
  return (DEFAULTS as any)[provider]?.model ?? fallback
}

function buildProviders(): AiProvider[] {
  const providers: AiProvider[] = []
  const groqKey = process.env.GROQ_API_KEY ?? ''
  if (groqKey.trim()) {
    providers.push(openAiCompatibleProvider({ id: 'groq', label: 'Groq', baseUrl: DEFAULTS.groq.baseUrl, apiKey: groqKey, model: envModel('groq', DEFAULTS.groq.model) }))
  }
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''
  if (geminiKey.trim()) {
    providers.push(openAiCompatibleProvider({ id: 'gemini', label: 'Gemini', baseUrl: DEFAULTS.gemini.baseUrl, apiKey: geminiKey, model: envModel('gemini', DEFAULTS.gemini.model) }))
  }
  const openaiKey = process.env.OPENAI_API_KEY ?? ''
  if (openaiKey.trim()) {
    providers.push(openAiCompatibleProvider({ id: 'openai', label: 'OpenAI', baseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULTS.openai.baseUrl, apiKey: openaiKey, model: envModel('openai', DEFAULTS.openai.model) }))
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (anthropicKey.trim()) {
    providers.push(anthropicProvider(anthropicKey, envModel('anthropic', 'claude-3-5-haiku-latest')))
  }
  return providers
}

export function providerChain(): AiProvider[] {
  const configured = buildProviders()
  const preference = (process.env.AI_PROVIDER ?? 'auto').trim().toLowerCase()
  if (preference === 'none') return []
  if (preference === 'auto') return configured
  const preferred = configured.filter((p) => p.id === preference)
  const rest = configured.filter((p) => p.id !== preference)
  return [...preferred, ...rest]
}

export async function complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
  const chain = providerChain()
  for (const provider of chain) {
    try {
      return await provider.complete(req)
    } catch (error) {
      const message = error instanceof AiProviderError ? error.message : String(error)
      console.warn('[ai] ' + provider.id + ' failed: ' + message)
    }
  }
  return offlineTutorProvider().complete(req)
}

export { AiProviderError }
export type { AiCompletionRequest, AiCompletionResult, AiMessage, AiProvider }
