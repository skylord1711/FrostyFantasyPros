export function buildLearnerContext(learner?: any) {
  if (learner) return learner
  return { level: 'a1', recentMistakes: [], dueItems: 0 }
}
