export interface LearnerContext {
  level?: string
  league?: string
}

/** The tutor is stateless; this is the neutral context injected when a caller sends none. */
export function buildLearnerContext(learner?: LearnerContext) {
  return {
    level: learner?.level ?? 'mixed',
    league: learner?.league ?? null
  }
}
