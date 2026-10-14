import { setCreds } from './espn.js'
import { getESPN } from './core.js'

export async function espnAuthRouter(app: any) {
  app.get('/api/auth/espn/start', (req: any, res: any) => {
    const redirect = 'https://www.espn.com/login'
    res.json({ ok: true, redirect, note: 'Start ESPN/Disney SSO. Complete by posting SWID/espn_s2 to callback, or use full OAuth.' })
  })

  app.post('/api/auth/espn/callback', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (swid && espnS2) {
      setCreds({ swid, espnS2 })
      res.json({ ok: true, has: true })
      return
    }
    res.json({ ok: false, error: 'missing_creds', note: 'Provide swid and espn_s2 from ESPN cookies' })
  })

  app.post('/api/auth/espn/complete', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (swid && espnS2) {
      setCreds({ swid, espnS2 })
    }
    // Discover leagues (best-apps style: show picker)
    const r = await getESPN('/members', req)
    res.json({ ok: r.ok, leagues: r.json || r.text })
  })

  app.get('/api/auth/espn/leagues', async (req: any, res: any) => {
    const r = await getESPN('/members', req)
    res.json({ ok: r.ok, leagues: r.json || r.text })
  })
}
