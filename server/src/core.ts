import fetch from 'node-fetch'
import { authHeaders, getCreds } from './espn.js'

export async function getESPN(path: string, req?: any) {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    ...authHeaders(req)
  }
  const url = path.startsWith('http') ? path : ('https://fantasy.espn.com/apis/v3/games/ffl/seasons/2026' + path)
  try {
    const r = await fetch(url, { headers })
    if (!r.ok) return { ok: false, status: r.status, data: await r.text() }
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('json')) return { ok: true, json: await r.json() }
    return { ok: true, text: await r.text() }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export async function coreRouter(app: any) {
  app.get('/api/espn/leagues', async (req: any, res: any) => {
    // Placeholder; real discovery uses paste-link/browser paths as noted
    res.json({ leagues: [] })
  })
}
