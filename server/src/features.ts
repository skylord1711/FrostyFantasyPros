import { getESPN } from './core.js'

export async function featuresRouter(app: any) {
  // Rankings (placeholder shapes)
  app.get('/api/rankings/:platform', (req: any, res: any) => {
    res.json({ platform: req.params.platform, positions: [] })
  })

  app.get('/api/trades', (req: any, res: any) => {
    res.json({ trades: [] })
  })

  app.get('/api/insights', (req: any, res: any) => {
    res.json({ insights: [] })
  })

  app.get('/api/waivers', (req: any, res: any) => {
    res.json({ waivers: [] })
  })

  app.get('/api/wdis', (req: any, res: any) => {
    res.json({ wdis: [] })
  })

  app.get('/api/power', (req: any, res: any) => {
    res.json({ power: [] })
  })
}
