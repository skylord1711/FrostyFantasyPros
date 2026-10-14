import { getESPN, currentSeason } from './core.js'

export async function teamsRouter(app: any) {
  app.get('/api/teams', async (req: any, res: any) => {
    res.json({ ok: false, error: 'league_id_required', message: 'Use /api/espn/league/:id/teams.' })
  })
  app.get('/api/teams/:leagueId', async (req: any, res: any) => {
    const lid = req.params.leagueId
    const season = Number(req.query.season) || currentSeason()
    const r = await getESPN('/lg/' + lid + '/teams', req)
    if (!r.ok) return res.status(r.error === 'private_league' ? 401 : 404).json({ ok: false, error: r.error, message: r.message })
    res.json({ ok: true, season, data: r.json })
  })
}
