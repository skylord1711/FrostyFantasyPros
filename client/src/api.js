import { getDeviceAuth } from './session.js'

const BASE = '/api'

function headers(extra) {
  const h = { 'Content-Type': 'application/json', ...(extra || {}) }
  const a = getDeviceAuth()
  if (a.swid) h['X-Fantasy-SWID'] = a.swid
  if (a.espnS2) h['X-Fantasy-ESPN-S2'] = a.espnS2
  return h
}

const get = (path) => fetch(BASE + path, { headers: headers() }).then((r) => r.json())
const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) }).then((r) => r.json())
const del = (path) => fetch(BASE + path, { method: 'DELETE', headers: headers() }).then((r) => r.json())

export const api = {
  health: () => get('/health'),
  tutor: (question, context) => post('/ai/tutor', { question, context }),

  // ESPN connection / league sync
  authLogin: (username, password) => post('/auth/espn/login', { username, password }),
  leagueBasics: (id, season) => get('/espn/league/' + id + '/basics' + (season ? ('?season=' + season) : '')),

  // Server-side auto-sync (trades + new teams)
  sync: (refreshLeagues) => post('/sync', { refreshLeagues: !!refreshLeagues }),
  events: () => get('/events'),
  clearAccount: () => del('/account'),

  // Feature stubs (wired, real data lands as engines are rebuilt)
  nflPicks: (week) => get('/nfl/picks' + (week ? ('?week=' + week) : '')),
  rankings: (p = 'espn') => get('/rankings/' + p),
  trades: () => get('/trades'),
  insights: () => get('/insights'),
  waivers: () => get('/waivers'),
  wdis: () => get('/wdis'),
  power: () => get('/power'),
  matchups: (week) => get('/matchups' + (week ? ('?week=' + week) : '')),
  boxscores: (week) => get('/boxscores' + (week ? ('?week=' + week) : '')),
  teams: (lid) => get(lid ? '/teams/' + lid : '/teams'),
  rosters: (lid) => get('/rosters/' + lid),
  activity: (lid) => get('/activity/' + lid)
}
