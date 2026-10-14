import { getESPN } from './core.js'

export async function rostersRouter(app: any) {
  app.get('/api/rosters/:leagueId', async (req: any, res: any) => {
    const lid = req.params.leagueId
    const r = await getESPN('/lg/' + lid + '/rosters?view=mRoster', req)
    res.json({ ok: r.ok, data: r.json || r.text })
  })
}
