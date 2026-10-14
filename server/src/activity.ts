import { getESPN } from './core.js'
import type { App, Req, Res } from './types.js'
import { sendFetchError } from './http.js'

export function activityRouter(app: App): void {
  app.get('/api/activity/:leagueId', async (req: Req, res: Res) => {
    const r = await getESPN('/lg/' + req.params.leagueId + '/activity/feed?view=kona_activity_feed&limit=50', req)
    if (!r.ok) return sendFetchError(res, r, 'Could not load activity.')
    res.json({ ok: true, data: r.json })
  })
}
