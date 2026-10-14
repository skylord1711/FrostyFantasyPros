export async function matchupsRouter(app: any) {
  app.get('/api/matchups', (req: any, res: any) => {
    res.json({ week: req.query.week || 1, matchups: [] })
  })
  app.get('/api/boxscores', (req: any, res: any) => {
    res.json({ week: req.query.week || 1, boxscores: [] })
  })
}
