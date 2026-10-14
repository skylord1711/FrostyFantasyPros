import { discoverLeagues, type LeagueRef } from './disney.js'
import { fetchLeagueBasics, resolveLeague, getESPN, currentSeason } from './core.js'
import { kvGet, kvSet, kvDelete } from './store.js'
import { encrypt, decrypt } from './crypto.js'
import type { App, EspnCreds, HeaderCarrier, Req, Res } from './types.js'

const EVENTS_CAP = 300

export interface FfpEvent {
  id: string
  type: 'trade' | 'new_team' | 'new_league'
  leagueId: string
  leagueName: string
  summary: string
  detail?: string
  at: number
}

interface LeagueSnapshot {
  teamIds: string[]
  tradeKeys: string[]
}

interface Account {
  swid: string
  s2: string
  createdAt: number
  updatedAt: number
  lastSync: number | null
  snapshot: Record<string, LeagueSnapshot> | null
  leagues: LeagueRef[]
}

const acctKey = (swid: string) => 'ffp:account:' + swid
const evKey = (swid: string) => 'ffp:events:' + swid

/** Resolves device/HTTP creds into a synthetic request the ESPN fetchers accept. */
function credReq(creds: EspnCreds): HeaderCarrier {
  return { headers: { 'x-fantasy-swid': creds.swid, 'x-fantasy-espn-s2': creds.espnS2 } }
}

export async function saveAccount(swid: string, espnS2: string, leagues: LeagueRef[]): Promise<void> {
  if (!swid) return
  const existing = await kvGet<Account>(acctKey(swid))
  const account: Account = {
    swid,
    s2: encrypt(espnS2),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    lastSync: existing?.lastSync ?? null,
    snapshot: existing?.snapshot ?? null,
    leagues: leagues.length ? leagues : (existing?.leagues ?? [])
  }
  await kvSet(acctKey(swid), account)
  const index = (await kvGet<string[]>('ffp:accounts')) ?? []
  if (!index.includes(swid)) {
    index.push(swid)
    await kvSet('ffp:accounts', index)
  }
}

export async function getAccount(swid: string): Promise<Account | null> {
  return kvGet<Account>(acctKey(swid))
}

export async function getEvents(swid: string): Promise<FfpEvent[]> {
  return (await kvGet<FfpEvent[]>(evKey(swid))) ?? []
}

/** Fills in a league's name/team count from ESPN when discovery only gave an id. */
export async function enrichLeagues(list: LeagueRef[], cred?: EspnCreds): Promise<LeagueRef[]> {
  const enriched: LeagueRef[] = []
  for (const league of list) {
    if (league.teamCount) {
      enriched.push(league)
      continue
    }
    try {
      const r = await resolveLeague(league.id, cred ? credReq(cred) : undefined)
      if (r.ok && 'league' in r) {
        enriched.push({ id: String(r.league.id), name: r.league.name, season: r.league.season, teamCount: r.league.teamCount })
      } else {
        enriched.push(league)
      }
    } catch {
      enriched.push(league)
    }
  }
  return enriched
}

function feedItems(json: any): any[] {
  if (!json) return []
  if (Array.isArray(json)) return json
  if (Array.isArray(json.feed)) return json.feed
  if (Array.isArray(json.items)) return json.items
  if (Array.isArray(json.entries)) return json.entries
  return []
}

function tradeSummary(item: any): string {
  if (Array.isArray(item.messages) && item.messages.length) {
    return item.messages
      .map((m: any) => (typeof m === 'string' ? m : m?.message || ''))
      .filter(Boolean)
      .join(' ')
  }
  if (item.message) return String(item.message)
  return String(item.type || 'TRADE').replace(/_/g, ' ').toLowerCase()
}

export interface SyncResult {
  ok: boolean
  error?: string
  newEvents?: FfpEvent[]
  total?: number
  leagues?: number
  firstRun?: boolean
}

export async function syncAccount(swid: string, opts: { refreshLeagues?: boolean } = {}): Promise<SyncResult> {
  const account = await getAccount(swid)
  if (!account) return { ok: false, error: 'no_account' }

  let s2: string
  try {
    s2 = decrypt(account.s2)
  } catch {
    return { ok: false, error: 'decrypt_failed' }
  }
  const creds: EspnCreds = { swid, espnS2: s2 }
  const req = credReq(creds)

  let leagues = account.leagues ?? []
  if (!leagues.length || opts.refreshLeagues) {
    try {
      const found = await discoverLeagues(creds)
      if (found.length) leagues = found
    } catch {
      // keep the leagues we already have
    }
  }

  const firstRun = !account.snapshot
  const snapshot: Record<string, LeagueSnapshot> = account.snapshot ?? {}
  const events = await getEvents(swid)
  const fresh: FfpEvent[] = []
  const now = Date.now()

  for (const league of leagues) {
    const season = league.season ?? currentSeason()
    const teamIds: string[] = []
    const teamNameById: Record<string, string> = {}

    try {
      const basics = await fetchLeagueBasics(league.id, season, req)
      if (basics.ok) {
        for (const team of basics.league.teams) {
          const id = String(team.id)
          teamIds.push(id)
          teamNameById[id] = team.name
        }
      }
    } catch {
      // treat as no data this round
    }

    const prev = snapshot[league.id] ?? { teamIds: [], tradeKeys: [] }
    const leagueName = league.name || 'League ' + league.id
    const isNewLeague = !snapshot[league.id]

    if (!firstRun && !isNewLeague) {
      for (const id of teamIds) {
        if (!prev.teamIds.includes(id)) {
          fresh.push({
            id: 'nt:' + league.id + ':' + id,
            type: 'new_team',
            leagueId: String(league.id),
            leagueName,
            summary: (teamNameById[id] || 'A new team') + ' joined ' + leagueName,
            at: now
          })
        }
      }
    }

    const tradeKeys: string[] = []
    try {
      const feed = await getESPN('/lg/' + league.id + '/activity/feed?view=kona_activity_feed', req)
      const seen = new Set(prev.tradeKeys)
      for (const item of feedItems(feed.json)) {
        const type = String(item.type || item.activityType || '')
        if (type.indexOf('TRADE') === -1) continue
        const rawId = item.id ?? item.relatedTransactionId ?? ''
        const key = 't:' + rawId + ':' + (item.date || '')
        if (!tradeKeys.includes(key)) tradeKeys.push(key)
        if (!firstRun && !seen.has(key)) {
          fresh.push({
            id: key,
            type: 'trade',
            leagueId: String(league.id),
            leagueName,
            summary: tradeSummary(item) || 'A trade was completed',
            detail: type,
            at: typeof item.date === 'string' ? Date.parse(item.date) || now : (item.date || now)
          })
        }
      }
    } catch {
      // no feed this round
    }

    if (!firstRun && isNewLeague) {
      fresh.push({
        id: 'nl:' + league.id,
        type: 'new_league',
        leagueId: String(league.id),
        leagueName,
        summary: 'Now tracking ' + leagueName,
        at: now
      })
    }

    snapshot[league.id] = { teamIds, tradeKeys }
  }

  const merged = [...fresh, ...events].slice(0, EVENTS_CAP)
  await kvSet(evKey(swid), merged)

  account.lastSync = now
  account.snapshot = snapshot
  account.leagues = leagues
  account.updatedAt = now
  await kvSet(acctKey(swid), account)

  return { ok: true, newEvents: fresh, total: merged.length, leagues: leagues.length, firstRun }
}

export async function syncAll() {
  const index = (await kvGet<string[]>('ffp:accounts')) ?? []
  const results: { swid: string; ok: boolean; newEvents?: number; error?: string }[] = []
  for (const swid of index) {
    try {
      const r = await syncAccount(swid)
      results.push({ swid, ok: r.ok, newEvents: r.newEvents?.length ?? 0, error: r.error })
    } catch (error) {
      results.push({ swid, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

function isCronAuthorized(req: Req): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  if (req.headers.authorization === 'Bearer ' + secret) return true
  return req.query.key === secret
}

export function syncRouter(app: App): void {
  app.get('/api/cron/sync', async (req: Req, res: Res) => {
    if (!isCronAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const results = await syncAll()
    res.json({ ok: true, synced: results.length, results })
  })

  app.post('/api/sync', async (req: Req, res: Res) => {
    const swid = req.ffpSwid
    if (!swid) return res.status(400).json({ ok: false, error: 'not_signed_in' })
    const r = await syncAccount(swid, { refreshLeagues: !!req.body?.refreshLeagues })
    if (!r.ok) return res.status(400).json(r)
    res.json({ ok: true, newEvents: r.newEvents, total: r.total, leagues: r.leagues })
  })

  app.get('/api/events', async (req: Req, res: Res) => {
    const swid = req.ffpSwid
    if (!swid) return res.json({ ok: true, events: [] })
    res.json({ ok: true, events: await getEvents(swid) })
  })

  app.delete('/api/account', async (req: Req, res: Res) => {
    const swid = req.ffpSwid
    if (!swid) return res.json({ ok: true })
    await kvDelete(acctKey(swid))
    await kvDelete(evKey(swid))
    const index = ((await kvGet<string[]>('ffp:accounts')) ?? []).filter((s) => s !== swid)
    await kvSet('ffp:accounts', index)
    res.json({ ok: true })
  })
}
