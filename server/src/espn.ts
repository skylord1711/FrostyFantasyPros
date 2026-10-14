import { Request, Response, NextFunction } from 'express'

let creds: { swid?: string; espnS2?: string } = {}

export function getCreds() {
  return { ...creds }
}

export function setCreds(c: { swid?: string; espnS2?: string }) {
  if (c.swid !== undefined) creds.swid = c.swid
  if (c.espnS2 !== undefined) creds.espnS2 = c.espnS2
}

export function clearCreds() {
  creds = {}
}

export function authHeaders(req: Request) {
  const h = (req.headers as any)
  const swid = h['x-fantasy-swid'] || h['x-fantasy-espn-swid'] || creds.swid
  const espnS2 = h['x-fantasy-espns2'] || h['x-fantasy-espn-s2'] || creds.espnS2
  const headers: Record<string, string> = {}
  if (swid) headers['Cookie'] = 'SWID=' + swid + '; espn_s2=' + (espnS2 || '')
  return headers
}

export async function espnRouter(app: any) {
  app.get('/api/espn/credentials', (req: Request, res: Response) => {
    res.json({ has: !!(creds.swid && creds.espnS2) })
  })
  app.post('/api/espn/credentials', (req: Request, res: Response) => {
    const { swid, espnS2 } = req.body || {}
    setCreds({ swid, espnS2 })
    res.json({ ok: true })
  })
  app.delete('/api/espn/credentials', (req: Request, res: Response) => {
    clearCreds()
    res.json({ ok: true })
  })
  app.post('/api/espn/login', (req: Request, res: Response) => {
    // placeholder - real login can be added later; keep safe
    res.status(501).json({ error: 'not_implemented' })
  })
}
