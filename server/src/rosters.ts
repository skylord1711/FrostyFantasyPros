import { getESPN } from './core.js'

export async function rostersRouter(app: any) {
  app.get('/api/rosters/:leagueId', async (req: any, res: any) => {
    const lid = req.params.leagueId
    const r = await getESPN('/lg/' + lid + '/teams?view=mTeam&view=mRoster', req)
    if (!r.ok) return res.status(r.error === 'private_league' ? 401 : 404).json({ ok: false, error: r.error, message: r.message })
    res.json({ ok: true, data: r.json })
  })
}
