export async function nflRouter(app: any) {
  app.get('/api/nfl/picks', (req: any, res: any) => {
    res.json({ week: req.query.week || 1, games: [] })
  })
}
