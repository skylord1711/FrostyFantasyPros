import { setCreds, getCreds } from './espn.js'
import type { App, EspnCreds, Req, Res } from './types.js'

const DISNEY = 'https://registerdisney.go.com/jgc/v5/client/ESPN-FANTASYLM-PROD'
const LM = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'

export interface LeagueRef {
  id: string
  name: string
  season?: number
  teamCount?: number
}

export interface DisneyResult {
  ok: boolean
  error?: string
  message?: string
  swid?: string
  espnS2?: string
}

async function getApiKey(): Promise<string> {
  const res = await fetch(DISNEY + '/api-key?langPref=en-US', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  const key = res.headers.get('api-key') || res.headers.get('x-api-key')
  if (!key) throw new Error('disney_api_key_failed')
  return key
}

async function postLogin(apiKey: string, loginValue: string, password: string): Promise<Response> {
  return fetch(DISNEY + '/guest/login?langPref=en-US', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'APIKEY ' + apiKey },
    body: JSON.stringify({ loginValue, password })
  })
}

function disneyErrorCode(json: any): string | undefined {
  return json?.error?.errors?.[0]?.code
}

export async function disneyLogin(loginValue: string, password: string): Promise<DisneyResult> {
  if (!loginValue || !password) {
    return { ok: false, error: 'missing_credentials', message: 'Enter your ESPN username/email and password.' }
  }

  let apiKey: string
  try {
    apiKey = await getApiKey()
  } catch {
    return { ok: false, error: 'espn_unreachable', message: 'Could not reach ESPN login. Check your connection.' }
  }

  let res: Response
  try {
    res = await postLogin(apiKey, loginValue, password)
  } catch {
    return { ok: false, error: 'espn_unreachable', message: 'Could not reach ESPN login. Check your connection.' }
  }

  const json = (await res.json().catch(() => null)) as any
  const swid = json?.data?.profile?.swid
  const espnS2 = json?.data?.s2
  if (swid && espnS2) {
    setCreds({ swid, espnS2 })
    return { ok: true, swid, espnS2 }
  }

  const code = disneyErrorCode(json)
  switch (code) {
    case 'AUTHORIZATION_CREDENTIALS':
      return { ok: false, error: 'bad_credentials', message: 'ESPN rejected that username/password. Double-check and try again.' }
    case 'PALOMINO_CHECK_FAILED':
    case 'AUTHORIZATION_REQUIRED':
    case 'RECAPTCHA_REQUIRED':
      return { ok: false, error: 'captcha', message: 'ESPN wants a security check for this sign-in. Try again on your home Wi-Fi, or from a normal browser.' }
    case 'API_KEY_INVALID':
      return { ok: false, error: 'retry', message: 'ESPN sign-in glitched. Please try again.' }
    default:
      break
  }
  if (res.status === 400 || res.status === 401) {
    return { ok: false, error: 'bad_credentials', message: 'ESPN rejected that username/password.' }
  }
  return { ok: false, error: 'espn_error', message: code || 'ESPN error ' + res.status }
}

const CANDIDATE_VIEWS = ['mNav', 'kona_user_leagues', 'userLeagues', 'mLeague']

function seasonCandidates(): number[] {
  const year = new Date().getFullYear()
  return [year, year - 1]
}

/** Walks an arbitrary ESPN league payload and pulls out numeric league ids. */
function extractLeagues(payload: unknown): LeagueRef[] {
  const out: LeagueRef[] = []
  const seen = new Set<string>()
  const visit = (node: any, depth: number): void => {
    if (!node || depth > 6) return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1)
      return
    }
    if (typeof node !== 'object') return
    if (node.id != null) {
      const id = String(node.id)
      if (/^\d+$/.test(id) && !seen.has(id)) {
        seen.add(id)
        out.push({ id, name: node.name || node.settings?.name || 'League ' + id })
      }
    }
    for (const value of Object.values(node)) visit(value, depth + 1)
  }
  visit(payload, 0)
  return out
}

export async function discoverLeagues(cred?: EspnCreds): Promise<LeagueRef[]> {
  const c = cred ?? getCreds()
  if (!c.swid || !c.espnS2) return []
  const cookie = 'SWID=' + c.swid + '; espn_s2=' + c.espnS2
  const found: LeagueRef[] = []
  const seen = new Set<string>()
  for (const season of seasonCandidates()) {
    for (const view of CANDIDATE_VIEWS) {
      try {
        const res = await fetch(LM + '/seasons/' + season + '/segments/0/leagues?view=' + view, {
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
        if (!res.ok) continue
        const json = await res.json().catch(() => null)
        for (const league of extractLeagues(json)) {
          if (!seen.has(league.id)) {
            seen.add(league.id)
            found.push({ ...league, season })
          }
        }
      } catch {
        // try the next view/season
      }
    }
    if (found.length) break
  }
  return found
}

export async function disneyRouter(app: App): Promise<void> {
  app.post('/api/auth/espn/login', async (req: Req, res: Res) => {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const result = await disneyLogin(username, password)
    if (!result.ok || !result.swid || !result.espnS2) {
      const status = result.error === 'bad_credentials' || result.error === 'missing_credentials' ? 401 : 502
      return res.status(status).json(result)
    }

    const creds: EspnCreds = { swid: result.swid, espnS2: result.espnS2 }
    let leagues: LeagueRef[] = []
    try {
      const { enrichLeagues } = await import('./sync.js')
      leagues = await enrichLeagues(await discoverLeagues(creds), creds)
    } catch {
      // discovery is best-effort; sign-in still succeeds
    }
    try {
      const { saveAccount, syncAccount } = await import('./sync.js')
      await saveAccount(result.swid, result.espnS2, leagues)
      // Establish the baseline snapshot now so future syncs can diff trades/teams.
      await syncAccount(result.swid)
    } catch {
      // persistence is best-effort
    }
    res.json({ ok: true, swid: result.swid, espnS2: result.espnS2, leagues })
  })
}
