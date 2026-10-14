const BASE = '/api'

export const api = {
  health: () => fetch(BASE + '/health').then(r=>r.json()),
  tutor: (question, context) => fetch(BASE + '/ai/tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context })
  }).then(r=>r.json()),
  espnCreds: () => fetch(BASE + '/espn/credentials').then(r=>r.json()),
  setEspnCreds: (swid, espnS2) => fetch(BASE + '/espn/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ swid, espnS2 })
  }).then(r=>r.json()),
  clearEspnCreds: () => fetch(BASE + '/espn/credentials', { method: 'DELETE' }).then(r=>r.json()),
  nflPicks: (week) => fetch(BASE + '/nfl/picks' + (week ? ('?week='+week) : '')).then(r=>r.json()),
  leagues: () => fetch(BASE + '/espn/leagues').then(r=>r.json()),
  rankings: (p='espn') => fetch(BASE + '/rankings/' + p).then(r=>r.json()),
  trades: () => fetch(BASE + '/trades').then(r=>r.json()),
  insights: () => fetch(BASE + '/insights').then(r=>r.json()),
  waivers: () => fetch(BASE + '/waivers').then(r=>r.json()),
  wdis: () => fetch(BASE + '/wdis').then(r=>r.json()),
  power: () => fetch(BASE + '/power').then(r=>r.json()),
  matchups: (week) => fetch(BASE + '/matchups' + (week ? ('?week='+week) : '')).then(r=>r.json()),
  boxscores: (week) => fetch(BASE + '/boxscores' + (week ? ('?week='+week) : '')).then(r=>r.json()),
  teams: (lid) => fetch(BASE + (lid ? '/teams/'+lid : '/teams')).then(r=>r.json()),
  rosters: (lid) => fetch(BASE + '/rosters/' + lid).then(r=>r.json()),
  activity: (lid) => fetch(BASE + '/activity/' + lid).then(r=>r.json())
}
