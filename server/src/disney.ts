import { setCreds, getCreds } from './espn.js'

const DISNEY = 'https://registerdisney.go.com/jgc/v5/client/ESPN-FANTASYLM-PROD'
const LM = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'

async function getApiKey(): Promise<string> {
  const r = await fetch(DISNEY + '/api-key?langPref=en-US', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  const key = r.headers.get('api-key') || r.headers.get('x-api-key')
  if (!key) throw new Error('disney_api_key_failed')
  return key
}

export interface DisneyResult {
  ok: boolean
  error?: string
  message?: string
  swid?: string
  espnS2?: string
}

export async function disneyLogin(loginValue: string, password: string): Promise<DisneyResult> {
  if (!loginValue || !password) return { ok: false, error: 'missing_credentials', message: 'Enter your ESPN username/email and password.' }
  let apiKey: string
  try {
    apiKey = await getApiKey()
  } catch (e) {
    return { ok: false, error: 'espn_unreachable', message: 'Could not reach ESPN login. Check your connection.' }
  }

  let res: Response
  try {
    res = await fetch(DISNEY + '/guest/login?langPref=en-US', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'APIKEY ' + apiKey },
      body: JSON.stringify({ loginValue, password })
    })
  } catch (e) {
    return { ok: false, error: 'espn_unreachable', message: 'Could not reach ESPN login. Check your connection.' }
  }

  let json: any = null
  try { json = await res.json() } catch (e) {}

  const data = json && json.data
  if (data && data.s2 && data.profile && (data.profile.swid || data.profile.swid === '')) {
    const swid = data.profile.swid
    const espnS2 = data.s2
    if (swid && espnS2) {
      setCreds({ swid, espnS2 })
      return { ok: true, swid, espnS2 }
    }
  }

  const code = json && json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].code
  if (code === 'AUTHORIZATION_CREDENTIALS') {
    return { ok: false, error: 'bad_credentials', message: 'ESPN rejected that username/password. Double-check and try again.' }
  }
  if (code === 'PALOMINO_CHECK_FAILED' || code === 'AUTHORIZATION_REQUIRED' || code === 'RECAPTCHA_REQUIRED') {
    return { ok: false, error: 'captcha', message: 'ESPN wants a security check for this sign-in. Try again on your home Wi-Fi, or from a normal browser.' }
  }
  if (code === 'API_KEY_INVALID') {
    return { ok: false, error: 'retry', message: 'ESPN sign-in glitched. Please try again.' }
  }
  if (res.status === 401 || res.status === 400) {
    return { ok: false, error: 'bad_credentials', message: 'ESPN rejected that username/password.' }
  }
  return { ok: false, error: 'espn_error', message: (json && json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].code) || ('ESPN error ' + res.status) }
}

const CANDIDATE_VIEWS = ['mNav', 'kona_user_leagues', 'userLeagues', 'mLeague']

function seasonCandidates(): number[] {
  const y = new Date().getFullYear()
  return [y, y - 1]
}

function extractLeagues(payload: any): any[] {
  const out: any[] = []
  const seen = new Set<string>()
  const push = (id: any, name: any) => {
    if (id == null) return
    const key = String(id)
    if (!/^\d+$/.test(key) || seen.has(key)) return
    seen.add(key)
    out.push({ id: key, name: name || ('League ' + key) })
  }
  const walk = (node: any, depth: number) => {
    if (!node || depth > 6) return
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return }
    if (typeof node !== 'object') return
    if (node.id != null && (node.name || node.abbrev || node.settings)) push(node.id, node.name || (node.settings && node.settings.name))
    for (const k of Object.keys(node)) walk(node[k], depth + 1)
  }
  walk(payload, 0)
  return out
}

export async function discoverLeagues(cred?: { swid?: string; espnS2?: string }): Promise<any[]> {
  const c = cred || getCreds()
  if (!c || !c.swid || !c.espnS2) return []
  const cookie = 'SWID=' + c.swid + '; espn_s2=' + c.espnS2
  const found: any[] = []
  const seen = new Set<string>()
  for (const season of seasonCandidates()) {
    for (const view of CANDIDATE_VIEWS) {
      const url = LM + '/seasons/' + season + '/segments/0/leagues?view=' + view
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: cookie,
            'X-Fantasy-Source': 'kona',
            'X-Fantasy-Platform': 'kona-PROD'
          },
          body: '{}'
        })
        if (!r.ok) continue
        let json: any = null
        try { json = await r.json() } catch (e) { continue }
        for (const l of extractLeagues(json)) {
          if (!seen.has(l.id)) { seen.add(l.id); found.push({ ...l, season }) }
        }
      } catch (e) {}
    }
    if (found.length) break
  }
  return found
}

export async function enrichLeagues(list: any[], cred?: { swid?: string; espnS2?: string }): Promise<any[]> {
  const c = cred || getCreds()
  const cookie = c && c.swid ? 'SWID=' + c.swid + '; espn_s2=' + (c.espnS2 || '') : ''
  const { resolveLeague } = await import('./core.js')
  const out: any[] = []
  for (const l of list) {
    if (l.teamCount) { out.push(l); continue }
    try {
      const r = await resolveLeague(l.id, { headers: { 'x-fantasy-swid': c && c.swid, 'x-fantasy-espn-s2': c && c.espnS2 } })
      if (r && r.ok && r.league) out.push({ id: String(r.league.id), name: r.league.name, season: r.league.season, teamCount: r.league.teamCount })
      else out.push(l)
    } catch (e) { out.push(l) }
  }
  return out
}

export async function disneyRouter(app: any) {
  app.post('/api/auth/espn/login', async (req: any, res: any) => {
    const { username, password } = req.body || {}
    const result = await disneyLogin(String(username || '').trim(), String(password || ''))
    if (!result.ok) {
      return res.status(result.error === 'bad_credentials' || result.error === 'missing_credentials' ? 401 : 502).json(result)
    }
    let leagues: any[] = []
    try {
      const raw = await discoverLeagues(result)
      leagues = await enrichLeagues(raw, result)
    } catch (e) {}
    res.json({ ok: true, swid: result.swid, espnS2: result.espnS2, leagues })
  })
}
