import fetch from 'node-fetch'
import { setCreds } from './espn.js'

export async function espnAuthRouter(app: any) {
  app.get('/api/auth/espn/start', (req: any, res: any) => {
    // Initiate ESPN SSO (Disney). Return redirect URL or handle inline
    const redirect = 'https://www.espn.com/login'
    res.json({ ok: true, redirect, note: 'Start OAuth flow (best-apps style). Implement full SSO/callback next.' })
  })

  app.post('/api/auth/espn/callback', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (swid && espnS2) {
      setCreds({ swid, espnS2 })
      res.json({ ok: true, has: true })
      return
    }
    res.json({ ok: false, error: 'missing_creds', note: 'Paste SWID/espn_s2 or complete full OAuth' })
  })

  app.get('/api/auth/espn/status', (req: any, res: any) => {
    res.json({ ok: true })
  })
}
