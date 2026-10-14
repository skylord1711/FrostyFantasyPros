import express from 'express'
import cors from 'cors'
import { complete } from './ai/index.ts'
import { buildTutorSystemPrompt, buildTutorUserPrompt } from './ai/prompts.ts'
import { buildLearnerContext } from './ai/memory.ts'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'frosty-fantasy-pros', ts: Date.now() })
})

app.post('/api/ai/tutor', async (req, res) => {
  const { question, context, history } = req.body || {}
  if (!question) return res.status(400).json({ error: 'question required' })
  try {
    const messages: any[] = []
    const system = buildTutorSystemPrompt()
    if (system) messages.push({ role: 'system', content: system })
    const learner = context ? { ...context } : buildLearnerContext()
    const user = buildTutorUserPrompt(question, learner)
    messages.push({ role: 'user', content: user })
    if (history && Array.isArray(history)) {
      for (const h of history) {
        if (h && h.role && h.content) {
          messages.push({ role: h.role === 'tutor' ? 'assistant' : h.role, content: h.content })
        }
      }
    }
    const result = await complete({ messages, maxTokens: 1024, temperature: 0.7 })
    res.json({ answer: result.content, provider: result.provider, model: result.model, degraded: result.degraded, usage: result.usage })
  } catch (e) {
    res.json({ answer: 'AI unavailable (offline)', provider: 'offline', degraded: true })
  }
})

const port = process.env.PORT || 4700
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log('frosty server on :' + port)
  })
}

export default app
