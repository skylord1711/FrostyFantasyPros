/**
 * AI layer contracts.
 *
 * The tutor is deliberately **stateless**: a provider only ever sees the
 * messages handed to it for one request. Everything the tutor "remembers" about
 * a learner is read from Postgres and injected into the prompt by `memory.ts`.
 *
 * That is what makes the provider swappable. Change `AI_PROVIDER`, rotate the
 * model, or swap vendors entirely and the learner's history is untouched,
 * because the history was never inside the model.
 */

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask for a JSON object back. Falls back to prose if unsupported. */
  jsonMode?: boolean;
  /** Abort the call after this many milliseconds. */
  timeoutMs?: number;
}

export interface AiCompletionResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /**
   * True when no provider answered and this came from the offline tutor.
   * Callers should surface this rather than pretend the AI was reachable.
   */
  degraded: boolean;
}

export interface AiProvider {
  id: string;
  label: string;
  /** False when the env var this provider needs is missing or blank. */
  isConfigured(): boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}

export class AiProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Providers that only retry on these; anything else fails over immediately. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
