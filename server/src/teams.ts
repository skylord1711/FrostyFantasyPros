import { getESPN, currentSeason } from './core.js'
import type { App, Req, Res } from './types.js'
import { sendFetchError } from './http.js'

export function teamsRouter(app: App): void {
  app.get('/api/teams', (_req: Req, res: Res) => {
    res.json({ ok: false, error: 'league_id_required', message: 'Use /api/espn/league/:id/teams.' })
  })
  app.get('/api/teams/:leagueId', async (req: Req, res: Res) => {
    const season = Number(req.query.season) || currentSeason()
    const r = await getESPN('/lg/' + req.params.leagueId + '/teams', req)
    if (!r.ok) return sendFetchError(res, r, 'Could not load teams.')
    res.json({ ok: true, season, data: r.json })
  })
}
