export interface TutorProfile {
  tutorName: string
  level: string
  explanationMode: 'auto' | 'english' | 'spanish' | 'mixed'
  apFocus: boolean
  examDate: Date | null
}

const BASE_RULES = 'You are a helpful fantasy football assistant (Frosty Fantasy Pros). Give clear, practical advice based on rankings, waivers, trades, start/sit, power rankings, matchups. Be concise, actionable, and mention evidence when relevant.'

function exposureGuidance(mode: TutorProfile['explanationMode'], level: string): string {
  return 'Explanation mode: ' + mode + ', level: ' + level + '.'
}

function apGuidance(apFocus: boolean, examDate: Date | null): string {
  if (!apFocus) return ''
  return 'AP context present.'
}

export function buildTutorSystemPrompt(profile?: TutorProfile): string {
  const p = profile || { tutorName: 'Frosty', level: 'mixed', explanationMode: 'mixed' as const, apFocus: false, examDate: null }
  return [BASE_RULES, exposureGuidance(p.explanationMode, p.level), apGuidance(p.apFocus, p.examDate)].filter(Boolean).join('\n')
}

export const tutorSystemPrompt = buildTutorSystemPrompt

export function buildTutorUserPrompt(question: string, context?: any): string {
  const parts: string[] = []
  parts.push('User question: ' + question)
  if (context) {
    parts.push('Context: ' + JSON.stringify(context))
  }
  return parts.join('\n\n')
}

export const JSON_TASK_RULES = 'Return valid JSON only.'
