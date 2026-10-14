export interface TutorProfile {
  assistantName: string
  level: string
}

const BASE_RULES =
  'You are Frosty, a sharp fantasy football assistant. Give concise, actionable advice on rankings, ' +
  'waivers, trades, start/sit, matchups and power rankings. Mention the evidence behind a recommendation ' +
  'and keep answers short enough to read on a phone.'

export function buildTutorSystemPrompt(profile?: TutorProfile): string {
  const name = profile?.assistantName ?? 'Frosty'
  const level = profile?.level ?? 'mixed'
  return [BASE_RULES, 'Persona: ' + name + '. Detail level: ' + level + '.'].join('\n')
}

export const tutorSystemPrompt = buildTutorSystemPrompt

export function buildTutorUserPrompt(question: string, context?: Record<string, unknown>): string {
  const parts = ['Question: ' + question]
  if (context && Object.keys(context).length) parts.push('Context: ' + JSON.stringify(context))
  return parts.join('\n\n')
}

export const JSON_TASK_RULES = 'Return valid JSON only.'
