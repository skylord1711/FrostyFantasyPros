import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { complete } from './ai/index.js'
import { buildTutorSystemPrompt, buildTutorUserPrompt } from './ai/prompts.js'
import { buildLearnerContext } from './ai/memory.js'
import { espnRouter } from './espn.js'
import { nflRouter } from './nfl.js'
import { sleeperRouter } from './sleeper.js'
import { coreRouter } from './core.js'
import { featuresRouter } from './features.js'
import { matchupsRouter } from './matchups.js'
import { teamsRouter } from './teams.js'
import { rostersRouter } from './rosters.js'
import { activityRouter } from './activity.js'
import { espnAuthRouter } from './auth-espn.js'
import { disneyRouter } from './disney.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use((req: any, res: any, next: any) => {
  const h = req.headers
  if (h['x-fantasy-swid'] || h['x-fantasy-espn-swid']) req.ffpSwid = h['x-fantasy-swid'] || h['x-fantasy-espn-swid']
  if (h['x-fantasy-espns2'] || h['x-fantasy-espn-s2']) req.ffpEspnS2 = h['x-fantasy-espns2'] || h['x-fantasy-espn-s2']
  next()
})

app.get('/api/health', (req: any, res: any) => {
  res.json({ ok: true, service: 'frosty-fantasy-pros', ts: Date.now() })
})

app.post('/api/ai/tutor', async (req: any, res: any) => {
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

espnRouter(app)
nflRouter(app)
sleeperRouter(app)
coreRouter(app)
featuresRouter(app)
matchupsRouter(app)
teamsRouter(app)
rostersRouter(app)
activityRouter(app)
espnAuthRouter(app)
disneyRouter(app)

const port = process.env.PORT || 4700
if (!process.env.VERCEL) {
  // Local mode: serve the built PWA alongside the API so `npm start` just works.
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api).*/, (_req: any, res: any) => res.sendFile(path.join(distDir, 'index.html')))
  }
  app.listen(port, () => {
    console.log('frosty server on :' + port)
  })
}

export default app
