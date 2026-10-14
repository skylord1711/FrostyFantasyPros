import { discoverLeagues } from './disney.js'
import { fetchLeagueBasics, getESPN, currentSeason } from './core.js'
import { kvGet, kvSet } from './store.js'
import { encrypt, decrypt } from './crypto.js'

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

function evKey(swid: string) { return 'ffp:events:' + swid }
function acctKey(swid: string) { return 'ffp:account:' + swid }

export async function saveAccount(swid: string, espnS2: string, leagues: any[]) {
  if (!swid) return
  const existing = await kvGet<any>(acctKey(swid))
  const acct = {
    swid,
    s2: encrypt(espnS2),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
    lastSync: existing ? existing.lastSync : null,
    snapshot: existing ? existing.snapshot : null,
    leagues: leagues && leagues.length ? leagues : (existing ? existing.leagues : [])
  }
  await kvSet(acctKey(swid), acct)
  const idx = (await kvGet<string[]>('ffp:accounts')) || []
  if (!idx.includes(swid)) {
    idx.push(swid)
    await kvSet('ffp:accounts', idx)
  }
}

export async function getAccount(swid: string) {
  return kvGet<any>(acctKey(swid))
}

export async function getEvents(swid: string): Promise<FfpEvent[]> {
  return (await kvGet<FfpEvent[]>(evKey(swid))) || []
}

function credReq(swid: string, s2: string) {
  return { headers: { 'x-fantasy-swid': swid, 'x-fantasy-espn-s2': s2 } }
}

function feedItems(json: any): any[] {
  if (!json) return []
  if (Array.isArray(json)) return json
  if (Array.isArray(json.feed)) return json.feed
  if (Array.isArray(json.items)) return json.items
  if (Array.isArray(json.entries)) return json.entries
  return []
}

function tradeSummary(it: any): string {
  if (Array.isArray(it.messages) && it.messages.length) {
    return it.messages.map((m: any) => (typeof m === 'string' ? m : (m && m.message) || '')).filter(Boolean).join(' ')
  }
  if (it.message) return String(it.message)
  const t = String(it.type || 'TRADE')
  return t.replace(/_/g, ' ').toLowerCase()
}

export async function syncAccount(swid: string, opts: { refreshLeagues?: boolean } = {}) {
  const acct = await getAccount(swid)
  if (!acct) return { ok: false, error: 'no_account' as const }
  let s2: string
  try { s2 = decrypt(acct.s2) } catch (e) { return { ok: false, error: 'decrypt_failed' as const } }
  const req = credReq(swid, s2)

  let leagues: any[] = acct.leagues || []
  if ((!leagues.length || opts.refreshLeagues)) {
    try {
      const found = await discoverLeagues({ swid, espnS2: s2 })
      if (found.length) leagues = found
    } catch (e) {}
  }

  const firstRun = !acct.snapshot
  const snap: Record<string, any> = acct.snapshot || {}
  const events = await getEvents(swid)
  const fresh: FfpEvent[] = []

  for (const lg of leagues) {
    const season = lg.season || currentSeason()
    let teamIds: string[] = []
    const teamNameById: Record<string, string> = {}
    try {
      const basics = await fetchLeagueBasics(lg.id, season, req)
      if (basics.ok && basics.league) {
        teamIds = (basics.league.teams || []).map((t: any) => String(t.id))
        for (const t of basics.league.teams || []) teamNameById[String(t.id)] = t.name
      }
    } catch (e) {}

    const prev = snap[lg.id] || { teamIds: [], tradeKeys: [] }

    if (!firstRun && prev.teamIds) {
      for (const id of teamIds) {
        if (!prev.teamIds.includes(id)) {
          fresh.push({
            id: 'nt:' + lg.id + ':' + id,
            type: 'new_team',
            leagueId: String(lg.id),
            leagueName: lg.name || ('League ' + lg.id),
            summary: (teamNameById[id] || 'A new team') + ' joined ' + (lg.name || ('league ' + lg.id)),
            at: Date.now()
          })
        }
      }
    }

    const tradeKeys: string[] = []
    try {
      const feed = await getESPN('/lg/' + lg.id + '/activity/feed?view=kona_activity_feed', req)
      const items = feedItems(feed.json)
      const seen = new Set(prev.tradeKeys || [])
      for (const it of items) {
        const type = String(it.type || it.activityType || '')
        if (type.indexOf('TRADE') === -1) continue
        const rawId = it.id != null ? it.id : (it.relatedTransactionId != null ? it.relatedTransactionId : '')
        const key = 't:' + rawId + ':' + (it.date || '')
        if (tradeKeys.indexOf(key) === -1) tradeKeys.push(key)
        if (!firstRun && !seen.has(key)) {
          fresh.push({
            id: key,
            type: 'trade',
            leagueId: String(lg.id),
            leagueName: lg.name || ('League ' + lg.id),
            summary: tradeSummary(it) || 'A trade was completed',
            detail: type,
            at: typeof it.date === 'string' ? Date.parse(it.date) || Date.now() : (it.date || Date.now())
          })
        }
      }
    } catch (e) {}

    if (!prev.teamIds && !firstRun) {
      // first time we see this league after initial baseline
      fresh.push({
        id: 'nl:' + lg.id,
        type: 'new_league',
        leagueId: String(lg.id),
        leagueName: lg.name || ('League ' + lg.id),
        summary: 'Now tracking ' + (lg.name || ('league ' + lg.id)),
        at: Date.now()
      })
    }

    snap[lg.id] = { teamIds, tradeKeys }
  }

  const merged = fresh.concat(events).slice(0, EVENTS_CAP)
  await kvSet(evKey(swid), merged)

  acct.lastSync = Date.now()
  acct.snapshot = snap
  acct.leagues = leagues
  acct.updatedAt = Date.now()
  await kvSet(acctKey(swid), acct)

  return { ok: true as const, newEvents: fresh, total: merged.length, leagues: leagues.length, firstRun }
}

export async function syncAll() {
  const idx = (await kvGet<string[]>('ffp:accounts')) || []
  const results: any[] = []
  for (const swid of idx) {
    try {
      const r = await syncAccount(swid)
      results.push({ swid, ok: r.ok, newEvents: (r as any).newEvents ? (r as any).newEvents.length : 0 })
    } catch (e: any) {
      results.push({ swid, ok: false, error: e.message })
    }
  }
  return results
}

function isAuthed(req: any): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers['authorization'] || ''
  if (auth === 'Bearer ' + secret) return true
  if (req.query && req.query.key === secret) return true
  return false
}

export async function syncRouter(app: any) {
  // Vercel Cron hits this. Also callable manually with the CRON_SECRET.
  app.get('/api/cron/sync', async (req: any, res: any) => {
    if (!isAuthed(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const results = await syncAll()
    res.json({ ok: true, synced: results.length, results })
  })

  // Client-triggered sync for the signed-in account (uses X-Fantasy headers).
  app.post('/api/sync', async (req: any, res: any) => {
    const swid = req.ffpSwid
    if (!swid) return res.status(400).json({ ok: false, error: 'not_signed_in' })
    const r = await syncAccount(swid, { refreshLeagues: !!req.body?.refreshLeagues })
    if (!r.ok) return res.status(400).json(r)
    res.json({ ok: true, newEvents: r.newEvents, total: r.total, leagues: r.leagues })
  })

  app.get('/api/events', async (req: any, res: any) => {
    const swid = req.ffpSwid
    if (!swid) return res.json({ ok: true, events: [] })
    const events = await getEvents(swid)
    res.json({ ok: true, events })
  })

  // Clears the tracked account + its events (sign out / wipe).
  app.delete('/api/account', async (req: any, res: any) => {
    const swid = req.ffpSwid
    if (!swid) return res.json({ ok: true })
    const { kvDelete } = await import('./store.js')
    await kvDelete('ffp:account:' + swid)
    await kvDelete('ffp:events:' + swid)
    const idx = ((await kvGet<string[]>('ffp:accounts')) || []).filter((s) => s !== swid)
    await kvSet('ffp:accounts', idx)
    res.json({ ok: true })
  })
}
