import { spawn } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { setCreds, clearCreds } from './espn.js'
import { resolveLeague } from './core.js'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge'
]

function findBrowser(): string | null {
  for (const c of CHROME_CANDIDATES) {
    if (!c) continue
    try { if (fs.existsSync(c)) return c } catch (e) {}
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  ws: any
  id = 0
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
  closed = false

  static async connect(wsUrl: string): Promise<Cdp> {
    const inst = new Cdp()
    inst.ws = new WebSocket(wsUrl)
    await new Promise<void>((resolve, reject) => {
      inst.ws.addEventListener('open', () => resolve())
      inst.ws.addEventListener('error', (e: any) => reject(new Error('cdp_connect_failed')))
    })
    inst.ws.addEventListener('message', (ev: any) => {
      let msg: any
      try { msg = JSON.parse(ev.data) } catch (e) { return }
      if (msg.id && inst.pending.has(msg.id)) {
        const p = inst.pending.get(msg.id)!
        inst.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
        else p.resolve(msg.result)
      }
    })
    inst.ws.addEventListener('close', () => {
      inst.closed = true
      for (const p of inst.pending.values()) p.reject(new Error('cdp_closed'))
      inst.pending.clear()
    })
    return inst
  }

  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    if (this.closed) return Promise.reject(new Error('cdp_closed'))
    const mid = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(mid, { resolve, reject })
      const payload: any = { id: mid, method, params }
      if (sessionId) payload.sessionId = sessionId
      try { this.ws.send(JSON.stringify(payload)) } catch (e) { reject(e as Error) }
    })
  }

  close() {
    try { this.ws.close() } catch (e) {}
  }
}

interface Session {
  id: string
  port: number
  proc: any
  profileDir: string
  status: 'starting' | 'waiting_login' | 'discovering' | 'done' | 'error' | 'expired' | 'cancelled'
  message: string
  creds: { swid: string; espnS2: string } | null
  leagues: any[]
  cdp?: Cdp
  pageSession?: string
  closed?: boolean
}

let session: Session | null = null

async function waitDevtools(port: number, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version')
      if (r.ok) {
        const j: any = await r.json()
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
      }
    } catch (e) {}
    await sleep(300)
  }
  throw new Error('Could not reach the browser debugger. Is Chrome installed?')
}

function cookieHeaders(creds: { swid: string; espnS2: string }) {
  return { headers: { 'x-fantasy-swid': creds.swid, 'x-fantasy-espn-s2': creds.espnS2 } }
}

function pickCookies(all: any[]): { swid: string; espnS2: string } | null {
  const espn = (all || []).filter((c) => /(^|\.)espn\.com$/.test(c.domain))
  const byName = (n: string) => espn.filter((c) => c.name.toLowerCase() === n.toLowerCase())
  const swidC = byName('SWID')[0]
  const s2C = byName('espn_s2')[0]
  if (swidC && s2C && swidC.value && s2C.value) {
    return { swid: swidC.value, espnS2: s2C.value }
  }
  return null
}

async function scrapeLeagueIds(cdp: Cdp, sid: string): Promise<string[]> {
  const expr =
    "(() => { const set = new Set(); " +
    "document.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href') || ''; const m = h.match(/leagueId=(\\d+)/); if (m) set.add(m[1]); }); " +
    "const re = /leagueId=(\\d+)/g; let m; const html = document.documentElement ? document.documentElement.innerHTML : ''; " +
    "while ((m = re.exec(html))) set.add(m[1]); return Array.from(set); })()"
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid)
    return (r && r.result && r.result.value) || []
  } catch (e) {
    return []
  }
}

async function discoverLeagues(cdp: Cdp, sid: string, creds: { swid: string; espnS2: string }) {
  const homes = ['https://fantasy.espn.com/football/home', 'https://fantasy.espn.com/football/league']
  let ids: string[] = []
  for (const url of homes) {
    try {
      await cdp.send('Page.navigate', { url }, sid)
    } catch (e) {}
    await sleep(6000)
    ids = await scrapeLeagueIds(cdp, sid)
    if (ids.length) break
  }
  const leagues: any[] = []
  const seen = new Set<string>()
  for (const lid of ids.slice(0, 30)) {
    if (seen.has(lid)) continue
    seen.add(lid)
    try {
      const r = await resolveLeague(lid, cookieHeaders(creds))
      if (r.ok && r.league) {
        leagues.push({ id: r.league.id, name: r.league.name, season: r.league.season, teamCount: r.league.teamCount })
      }
    } catch (e) {}
  }
  return leagues
}

async function runSession(s: Session) {
  try {
    const wsUrl = await waitDevtools(s.port, 30000)
    const cdp = await Cdp.connect(wsUrl)
    s.cdp = cdp
    const targets = await cdp.send('Target.getTargets')
    let page = (targets.targetInfos || []).find((t: any) => t.type === 'page')
    if (!page) {
      const nt = await cdp.send('Target.createTarget', { url: 'about:blank' })
      page = { targetId: nt.targetId }
    }
    const att = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
    s.pageSession = att.sessionId
    await cdp.send('Page.enable', {}, s.pageSession)
    await cdp.send('Runtime.enable', {}, s.pageSession)
    await cdp.send('Page.navigate', { url: 'https://www.espn.com/login' }, s.pageSession)

    s.status = 'waiting_login'
    s.message = 'Sign in with your ESPN/Disney account in the Chrome window.'

    const deadline = Date.now() + 6 * 60 * 1000
    let creds: { swid: string; espnS2: string } | null = null
    while (Date.now() < deadline && !s.closed) {
      let all: any[] = []
      try {
        const ck = await cdp.send('Storage.getCookies')
        all = ck.cookies || []
      } catch (e) {
        if (cdp.closed) { s.status = 'cancelled'; s.message = 'Sign-in window was closed.'; return }
      }
      creds = pickCookies(all)
      if (creds) break
      await sleep(1500)
    }
    if (s.closed) return
    if (!creds) {
      s.status = 'expired'
      s.message = 'Timed out waiting for ESPN sign-in.'
      await closeSession()
      return
    }

    setCreds(creds)
    s.creds = creds
    s.status = 'discovering'
    s.message = 'Signed in. Finding your leagues…'
    s.leagues = await discoverLeagues(cdp, s.pageSession!, creds)
    s.status = 'done'
    s.message = s.leagues.length
      ? 'Found ' + s.leagues.length + ' league' + (s.leagues.length > 1 ? 's' : '') + '.'
      : 'Signed in, but ESPN did not return any leagues.'
    await closeSession(true)
  } catch (e: any) {
    if (!s.closed) {
      s.status = 'error'
      s.message = e?.message || 'Sign-in failed.'
      await closeSession()
    }
  }
}

async function closeSession(keepResult = false) {
  const s = session
  if (!s) return
  s.closed = true
  try {
    if (s.cdp && !s.cdp.closed) await s.cdp.send('Browser.close')
  } catch (e) {}
  try { s.cdp && s.cdp.close() } catch (e) {}
  try {
    if (s.proc && s.proc.pid) {
      if (process.platform === 'win32') {
        const { spawnSync } = await import('node:child_process')
        spawnSync('taskkill', ['/PID', String(s.proc.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        s.proc.kill()
      }
    }
  } catch (e) {}
  try { fs.rmSync(s.profileDir, { recursive: true, force: true }) } catch (e) {}
  if (!keepResult) {
    // keep a stub so the client can read the final status, but drop process refs
    session = { ...s, cdp: undefined, proc: null }
  }
}

export async function espnBrowserAuthRouter(app: any) {
  app.post('/api/auth/espn/browser/start', async (_req: any, res: any) => {
    if (process.env.VERCEL) {
      return res.status(501).json({ ok: false, error: 'unsupported', message: 'ESPN sign-in runs on the local server (start it with `npm start`).' })
    }
    if (session && ['starting', 'waiting_login', 'discovering'].includes(session.status)) {
      return res.json({ ok: true, sessionId: session.id, status: session.status })
    }
    const browser = findBrowser()
    if (!browser) {
      return res.status(500).json({ ok: false, error: 'no_browser', message: 'Google Chrome or Microsoft Edge is required for ESPN sign-in.' })
    }
    const id = Math.random().toString(36).slice(2, 10)
    const port = 9300 + Math.floor(Math.random() * 400)
    let profileDir = ''
    try {
      profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffp-chrome-'))
    } catch (e) {
      profileDir = path.join(os.tmpdir(), 'ffp-chrome-' + id)
      try { fs.mkdirSync(profileDir, { recursive: true }) } catch (e2) {}
    }
    const proc = spawn(browser, [
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profileDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--new-window',
      'https://www.espn.com/login'
    ], { stdio: 'ignore' })

    session = {
      id, port, proc, profileDir,
      status: 'starting',
      message: 'Opening ESPN sign-in…',
      creds: null,
      leagues: []
    }
    runSession(session).catch(() => {})
    res.json({ ok: true, sessionId: id, status: 'starting' })
  })

  app.get('/api/auth/espn/browser/status', (req: any, res: any) => {
    const id = req.query.session
    if (!session || (id && session.id !== id)) {
      return res.json({ ok: false, status: 'none', message: 'No active sign-in session.' })
    }
    res.json({
      ok: true,
      status: session.status,
      message: session.message,
      creds: session.status === 'done' ? session.creds : null,
      leagues: session.status === 'done' ? session.leagues : []
    })
  })

  app.post('/api/auth/espn/browser/cancel', async (_req: any, res: any) => {
    try { clearCreds() } catch (e) {}
    if (session) session.status = 'cancelled'
    await closeSession()
    res.json({ ok: true })
  })
}

// Ensure the spawned browser dies with the server.
process.on('exit', () => {
  try { session && session.proc && session.proc.kill() } catch (e) {}
})
