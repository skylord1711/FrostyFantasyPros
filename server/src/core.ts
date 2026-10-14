import fetch from 'node-fetch'
import { authHeaders } from './espn.js'

const DEFAULT_SEASON = Number(process.env.FFP_SEASON || new Date().getFullYear())

export function currentSeason(): number {
  return Number(process.env.FFP_SEASON || new Date().getFullYear())
}

const JSON_HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'

export function leagueApiUrl(leagueId: string | number, season: number, views: string[]): string {
  const params = views.map((v) => 'view=' + v).join('&')
  return JSON_HOST + '/seasons/' + season + '/segments/0/leagues/' + leagueId + (params ? '?' + params : '')
}

export interface EspnFetchResult {
  ok: boolean
  status: number
  json?: any
  text?: string
  error?: 'private_league' | 'not_found' | 'espn_error' | 'non_json' | 'network'
  message?: string
}

export async function espnFetch(url: string, req?: any): Promise<EspnFetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'application/json',
    ...authHeaders(req)
  }
  try {
    const r = await fetch(url, { headers })
    const ct = r.headers.get('content-type') || ''
    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, error: 'private_league', message: 'ESPN requires sign-in (private league).' }
    }
    if (r.status === 404) {
      return { ok: false, status: r.status, error: 'not_found', message: 'League not found for that season.' }
    }
    if (!r.ok) {
      return { ok: false, status: r.status, error: 'espn_error', text: await r.text() }
    }
    if (ct.includes('json')) {
      return { ok: true, status: r.status, json: await r.json() }
    }
    return { ok: false, status: r.status, error: 'non_json', text: await r.text() }
  } catch (e: any) {
    return { ok: false, status: 0, error: 'network', message: e.message }
  }
}

// Back-compat shim used by other routers. Accepts either an absolute URL or a
// league-relative path like "/lg/123/teams?view=mTeam".
export async function getESPN(path: string, req?: any) {
  let url: string
  if (path.startsWith('http')) {
    url = path
  } else {
    const m = path.match(/^\/lg\/(\d+)\/([^?]*)(\?.*)?$/)
    if (m) {
      const views = (m[3] || '').replace(/^\?/, '').split('&').filter((x) => x.startsWith('view='))
      url = leagueApiUrl(m[1], currentSeason(), views.length ? views : ['mTeam'])
    } else {
      url = JSON_HOST + '/seasons/' + currentSeason() + '/segments/0/leagues' + path
    }
  }
  const r = await espnFetch(url, req)
  if (r.ok) return { ok: true, status: r.status, json: r.json }
  return { ok: false, status: r.status, error: r.error, text: r.text, message: r.message }
}

export function parseLeagueInput(input: string): { leagueId: string; season: number } | null {
  if (!input) return null
  const raw = String(input).trim()
  const idMatch = raw.match(/leagueId=(\d+)/i) || raw.match(/leagues?\/(\d+)/i) || raw.match(/^(\d{3,})$/)
  if (!idMatch) return null
  const leagueId = idMatch[1]
  const seasonMatch = raw.match(/seasons\/(\d{4})/) || raw.match(/seasonId=(\d{4})/i) || raw.match(/\/(20\d{2})(?:\/|$|\?)/)
  const season = seasonMatch ? Number(seasonMatch[1]) : currentSeason()
  return { leagueId, season }
}

function teamName(t: any): string {
  if (!t) return 'Team'
  if (t.name) return t.name
  const parts = [t.location, t.nickname].filter(Boolean)
  return parts.length ? parts.join(' ') : (t.abbrev || 'Team')
}

function teamSummary(t: any) {
  const rec = t?.record?.overall || {}
  return {
    id: t?.id,
    name: teamName(t),
    abbrev: t?.abbrev || '',
    logo: t?.logo || '',
    owners: (t?.owners || []).map((o: any) => o.displayName || o.firstName || '').filter(Boolean),
    wins: rec.wins ?? 0,
    losses: rec.losses ?? 0,
    ties: rec.ties ?? 0,
    pointsFor: rec.pointsFor ?? 0,
    pointsAgainst: rec.pointsAgainst ?? 0,
    playoffSeed: rec.playoffSeed ?? t?.playoffSeed ?? null
  }
}

export const LEAGUE_VIEWS = ['mTeam', 'mSettings', 'mStandings']

export async function fetchLeagueBasics(leagueId: string, season: number, req?: any) {
  const r = await espnFetch(leagueApiUrl(leagueId, season, LEAGUE_VIEWS), req)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, message: r.message }
  const j = r.json || {}
  const teams = (j.teams || []).map(teamSummary)
  return {
    ok: true,
    league: {
      id: String(j.id || leagueId),
      name: j.settings?.name || 'League ' + leagueId,
      season: j.seasonId || season,
      teamCount: teams.length,
      isPrivate: teams.length === 0,
      teams
    }
  }
}

export async function resolveLeague(input: string, req?: any) {
  const parsed = parseLeagueInput(input)
  if (!parsed) return { ok: false, error: 'bad_input', message: 'Enter an ESPN league URL or numeric league ID.' }
  const seasons = [parsed.season, parsed.season - 1, parsed.season + 1].filter((s, i, a) => a.indexOf(s) === i)
  let last: any = null
  for (const season of seasons) {
    const r = await fetchLeagueBasics(parsed.leagueId, season, req)
    if (r.ok) return r
    last = r
    if (r.error === 'private_league') break
  }
  return last || { ok: false, error: 'unknown' }
}

export async function fetchLeagueTeams(leagueId: string, season: number, req?: any) {
  const r = await espnFetch(leagueApiUrl(leagueId, season, ['mTeam']), req)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, message: r.message }
  const j = r.json || {}
  return { ok: true, teams: (j.teams || []).map(teamSummary) }
}

export async function coreRouter(app: any) {
  // Best-effort account discovery. ESPN retired the cookie-based "my leagues"
  // endpoint, so this returns an empty list and the client relies on add-by-URL.
  app.get('/api/espn/leagues', async (_req: any, res: any) => {
    res.json({ leagues: [], note: 'ESPN no longer lists leagues by account. Add leagues by URL or ID.' })
  })

  app.post('/api/espn/leagues/resolve', async (req: any, res: any) => {
    const input = req.body?.input || req.body?.url || req.body?.leagueId || ''
    const r = await resolveLeague(input, req)
    if (!r.ok) {
      const status = r.error === 'private_league' ? 401 : r.error === 'bad_input' ? 400 : 404
      return res.status(status).json({ ok: false, error: r.error || 'not_found', message: r.message || 'Could not load that league.' })
    }
    res.json({ ok: true, league: r.league })
  })

  app.get('/api/espn/league/:id/basics', async (req: any, res: any) => {
    const season = Number(req.query.season) || currentSeason()
    const r = await fetchLeagueBasics(req.params.id, season, req)
    if (!r.ok) {
      const status = r.error === 'private_league' ? 401 : 404
      return res.status(status).json({ ok: false, error: r.error, message: r.message })
    }
    res.json({ ok: true, league: r.league })
  })

  app.get('/api/espn/league/:id/teams', async (req: any, res: any) => {
    const season = Number(req.query.season) || currentSeason()
    const r = await fetchLeagueTeams(req.params.id, season, req)
    if (!r.ok) {
      const status = r.error === 'private_league' ? 401 : 404
      return res.status(status).json({ ok: false, error: r.error, message: r.message })
    }
    res.json({ ok: true, teams: r.teams })
  })
}
