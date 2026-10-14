import { getESPN } from './core.js'

export async function activityRouter(app: any) {
  app.get('/api/activity/:leagueId', async (req: any, res: any) => {
    const lid = req.params.leagueId
    const r = await getESPN('/lg/' + lid + '/activity/feed?view=kona_activity_feed&limit=50', req)
    if (!r.ok) return res.status(r.error === 'private_league' ? 401 : 404).json({ ok: false, error: r.error, message: r.message })
    res.json({ ok: true, data: r.json })
  })
}
