import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { complete } from './ai/index.js'
import { buildTutorSystemPrompt, buildTutorUserPrompt } from './ai/prompts.js'
import { buildLearnerContext, type LearnerContext } from './ai/memory.js'
import { coreRouter } from './core.js'
import { stubsRouter } from './stubs.js'
import { teamsRouter } from './teams.js'
import { rostersRouter } from './rosters.js'
import { activityRouter } from './activity.js'
import { disneyRouter } from './disney.js'
import { syncRouter } from './sync.js'
import type { Req, Res } from './types.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use((req: Req, _res: Res, next) => {
  const h = req.headers
  const swid = h['x-fantasy-swid'] || h['x-fantasy-espn-swid']
  const espnS2 = h['x-fantasy-espns2'] || h['x-fantasy-espn-s2']
  if (typeof swid === 'string') req.ffpSwid = swid
  if (typeof espnS2 === 'string') req.ffpEspnS2 = espnS2
  next()
})

app.get('/api/health', (_req: Req, res: Res) => {
  res.json({ ok: true, service: 'frosty-fantasy-pros', ts: Date.now() })
})

app.post('/api/ai/tutor', async (req: Req, res: Res) => {
  const { question, context, history } = req.body || {}
  if (!question) return res.status(400).json({ error: 'question required' })
  try {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
    messages.push({ role: 'system', content: buildTutorSystemPrompt() })
    const learner = (context as LearnerContext) ?? buildLearnerContext()
    messages.push({ role: 'user', content: buildTutorUserPrompt(question, { league: learner.league, level: learner.level }) })
    if (Array.isArray(history)) {
      for (const turn of history) {
        if (turn && turn.role && turn.content) {
          messages.push({ role: turn.role === 'tutor' ? 'assistant' : turn.role, content: turn.content })
        }
      }
    }
    const result = await complete({ messages, maxTokens: 1024, temperature: 0.7 })
    res.json({
      answer: result.text,
      provider: result.provider,
      model: result.model,
      degraded: result.degraded,
      usage: { input: result.inputTokens, output: result.outputTokens }
    })
  } catch {
    res.json({ answer: 'AI unavailable right now.', provider: 'offline', degraded: true })
  }
})

coreRouter(app)
stubsRouter(app)
teamsRouter(app)
rostersRouter(app)
activityRouter(app)
disneyRouter(app)
syncRouter(app)

const port = process.env.PORT || 4700
if (!process.env.VERCEL) {
  // Local mode: serve the built PWA alongside the API so `npm start` just works.
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api).*/, (_req: Req, res: Res) => res.sendFile(path.join(distDir, 'index.html')))
  }
  app.listen(port, () => {
    console.log('frosty server on :' + port)
  })
}

export default app
