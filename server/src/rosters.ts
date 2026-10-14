import { getESPN } from './core.js'
import type { App, Req, Res } from './types.js'
import { sendFetchError } from './http.js'

export function rostersRouter(app: App): void {
  app.get('/api/rosters/:leagueId', async (req: Req, res: Res) => {
    const r = await getESPN('/lg/' + req.params.leagueId + '/teams?view=mTeam&view=mRoster', req)
    if (!r.ok) return sendFetchError(res, r, 'Could not load rosters.')
    res.json({ ok: true, data: r.json })
  })
}
