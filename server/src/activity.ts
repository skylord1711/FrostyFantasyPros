import { getESPN } from './core.js'

export async function activityRouter(app: any) {
  app.get('/api/activity/:leagueId', async (req: any, res: any) => {
    const lid = req.params.leagueId
    const r = await getESPN('/lg/' + lid + '/activity/feed?limit=50', req)
    res.json({ ok: r.ok, data: r.json || r.text })
  })
}
