import { setCreds, getCreds } from './espn.js'
import { resolveLeague } from './core.js'

export async function espnAuthRouter(app: any) {
  // Honest capability description. There is no ESPN OAuth we can complete
  // in-browser; we accept the same cookies ESPN's own site uses.
  app.get('/api/auth/espn/start', (_req: any, res: any) => {
    res.json({
      ok: true,
      connected: !!(getCreds().swid && getCreds().espnS2),
      modes: ['cookies', 'league_url'],
      instructions: {
        public: 'Add any public league by pasting its ESPN URL or league ID. No sign-in needed.',
        private:
          'For private leagues, open ESPN in a desktop browser, sign in, then copy the SWID and espn_s2 cookie values (DevTools > Application > Cookies > espn.com) and paste them here.'
      }
    })
  })

  app.post('/api/auth/espn/callback', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (!swid || !espnS2) {
      return res.status(400).json({ ok: false, error: 'missing_creds', message: 'Provide both SWID and espn_s2.' })
    }
    setCreds({ swid, espnS2 })
    const verify = req.body?.leagueId || req.body?.input
    if (verify) {
      const r = await resolveLeague(verify, req)
      return res.json({ ok: true, has: true, verified: r.ok, league: r.league || null, error: r.error })
    }
    res.json({ ok: true, has: true, verified: null })
  })

  app.post('/api/auth/espn/verify', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (swid && espnS2) setCreds({ swid, espnS2 })
    const target = req.body?.input || req.body?.leagueId
    if (!target) {
      return res.json({ ok: true, has: !!(getCreds().swid && getCreds().espnS2), verified: null })
    }
    const r = await resolveLeague(target, req)
    res.json({ ok: r.ok, verified: r.ok, league: r.league || null, error: r.error, message: r.message })
  })

  app.post('/api/auth/espn/complete', async (req: any, res: any) => {
    const { swid, espnS2 } = req.body || {}
    if (swid && espnS2) setCreds({ swid, espnS2 })
    res.json({
      ok: true,
      has: !!(getCreds().swid && getCreds().espnS2),
      leagues: [],
      note: 'ESPN no longer lists leagues by account. Add them by URL or ID.'
    })
  })

  app.get('/api/auth/espn/leagues', async (_req: any, res: any) => {
    res.json({ ok: true, leagues: [], note: 'ESPN no longer lists leagues by account. Add them by URL or ID.' })
  })
}
