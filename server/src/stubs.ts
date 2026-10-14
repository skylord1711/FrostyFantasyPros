import type { App, Req, Res } from './types.js'

/**
 * Placeholder endpoints for features that are wired into the client but not yet
 * backed by real data. Each returns an empty, well-formed payload so the UI can
 * render without special-casing "not built yet".
 */
export function stubsRouter(app: App): void {
  app.get('/api/nfl/picks', (req: Req, res: Res) => res.json({ week: req.query.week || 1, games: [] }))
  app.get('/api/rankings/:platform', (req: Req, res: Res) => res.json({ platform: req.params.platform, positions: [] }))
  app.get('/api/trades', (_req: Req, res: Res) => res.json({ trades: [] }))
  app.get('/api/insights', (_req: Req, res: Res) => res.json({ insights: [] }))
  app.get('/api/waivers', (_req: Req, res: Res) => res.json({ waivers: [] }))
  app.get('/api/wdis', (_req: Req, res: Res) => res.json({ wdis: [] }))
  app.get('/api/power', (_req: Req, res: Res) => res.json({ power: [] }))
  app.get('/api/matchups', (req: Req, res: Res) => res.json({ week: req.query.week || 1, matchups: [] }))
  app.get('/api/boxscores', (req: Req, res: Res) => res.json({ week: req.query.week || 1, boxscores: [] }))
}
