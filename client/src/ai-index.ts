/**
 * The AI entry point.
 *
 * `complete()` never throws and never returns nothing: if every remote provider
 * is missing, rate-limited, or down, the request lands on the deterministic
 * offline tutor and the result is flagged `degraded` so the UI can say so.
 *
 * Swapping the AI is an environment change. `AI_PROVIDER=groq|gemini|openai|
 * anthropic|auto|none` picks the preferred provider; the rest stay configured as
 * fallbacks. Because the tutor is stateless and its memory lives in Postgres,
 * changing this value cannot lose a learner's history.
 */
import {
  anthropicProvider,
} from "./providers/anthropic";
import { offlineTutorProvider } from "./providers/offline";
import { openAiCompatibleProvider } from "./providers/openai-compatible";
import { AiProviderError, type AiCompletionRequest, type AiCompletionResult, type AiProvider } from "./types";

export const AI_PROVIDERS = ["auto", "groq", "gemini", "openai", "anthropic", "none"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

const DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
  },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};

function envModel(provider: string, fallback: string): string {
  const specific = process.env[`${provider.toUpperCase()}_MODEL`];
  if (specific && specific.trim()) return specific.trim();
  return DEFAULTS[provider]?.model ?? fallback;
}

function buildProviders(): AiProvider[] {
  const providers: AiProvider[] = [];

  const groqKey = process.env.GROQ_API_KEY ?? "";
  if (groqKey.trim()) {
    providers.push(
      openAiCompatibleProvider({
        id: "groq",
        label: "Groq",
        baseUrl: DEFAULTS.groq.baseUrl,
        apiKey: groqKey,
        model: envModel("groq", DEFAULTS.groq.model),
      }),
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (geminiKey.trim()) {
    providers.push(
      openAiCompatibleProvider({
        id: "gemini",
        label: "Gemini",
        baseUrl: DEFAULTS.gemini.baseUrl,
        apiKey: geminiKey,
        model: envModel("gemini", DEFAULTS.gemini.model),
      }),
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (openaiKey.trim()) {
    providers.push(
      openAiCompatibleProvider({
        id: "openai",
        label: "OpenAI",
        baseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULTS.openai.baseUrl,
        apiKey: openaiKey,
        model: envModel("openai", DEFAULTS.openai.model),
      }),
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (anthropicKey.trim()) {
    providers.push(anthropicProvider(anthropicKey, envModel("anthropic", "claude-3-5-haiku-latest")));
  }

  return providers;
}

/** Ordered provider list: the preferred one first, then the remaining fallbacks. */
export function providerChain(): AiProvider[] {
  const configured = buildProviders();
  const preference = (process.env.AI_PROVIDER ?? "auto").trim().toLowerCase();

  if (preference === "none") return [];
  if (preference === "auto") return configured;

  const preferred = configured.filter((p) => p.id === preference);
  const rest = configured.filter((p) => p.id !== preference);
  return [...preferred, ...rest];
}

export interface AiStatus {
  preference: string;
  chain: { id: string; label: string; model: string }[];
  offlineAvailable: true;
}

export function describeAi(): AiStatus {
  return {
    preference: (process.env.AI_PROVIDER ?? "auto").trim().toLowerCase(),
    chain: providerChain().map((p) => ({
      id: p.id,
      label: p.label,
      model: p.id === "anthropic" ? envModel("anthropic", "claude-3-5-haiku-latest") : envModel(p.id, "?"),
    })),
    offlineAvailable: true,
  };
}

export async function complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
  const chain = providerChain();

  for (const provider of chain) {
    try {
      return await provider.complete(req);
    } catch (error) {
      const message = error instanceof AiProviderError ? error.message : String(error);
      console.warn(`[ai] ${provider.id} failed, trying next provider: ${message}`);
    }
  }

  return offlineTutorProvider().complete(req);
}

export { AiProviderError };
export type { AiCompletionRequest, AiCompletionResult, AiMessage, AiProvider } from "./types";
