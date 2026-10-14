const AUTH_KEY = 'ffp:deviceAuth'
const LEAGUE_KEY = 'ffp:leagues'
const ONBOARD_KEY = 'ffp:onboarded'

export function getDeviceAuth() {
  try { const v = localStorage.getItem(AUTH_KEY); return v ? JSON.parse(v) : {} } catch (e) { return {} }
}

export function setDeviceAuth(a) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a || {})) } catch (e) {}
}

export function clearDeviceAuth() {
  try { localStorage.removeItem(AUTH_KEY) } catch (e) {}
}

export function hasDeviceAuth() {
  const a = getDeviceAuth()
  return !!(a.swid && a.espnS2)
}

export function getLeagues() {
  try { const v = localStorage.getItem(LEAGUE_KEY); return v ? JSON.parse(v) : [] } catch (e) { return [] }
}

export function setLeagues(list) {
  try { localStorage.setItem(LEAGUE_KEY, JSON.stringify(list || [])) } catch (e) {}
}

export function addLeague(league) {
  if (!league || !league.id) return getLeagues()
  const list = getLeagues().filter((l) => String(l.id) !== String(league.id))
  list.push({
    id: String(league.id),
    name: league.name || ('League ' + league.id),
    season: league.season || null,
    teamCount: league.teamCount || 0
  })
  setLeagues(list)
  return list
}

export function removeLeague(id) {
  const list = getLeagues().filter((l) => String(l.id) !== String(id))
  setLeagues(list)
  return list
}

export function isOnboarded() {
  try { return localStorage.getItem(ONBOARD_KEY) === '1' } catch (e) { return false }
}

export function setOnboarded(v) {
  try { v ? localStorage.setItem(ONBOARD_KEY, '1') : localStorage.removeItem(ONBOARD_KEY) } catch (e) {}
}

export function buildLink(opts = {}) {
  const url = new URL(window.location.origin + '/#/connect')
  if (opts.swid) url.searchParams.set('swid', opts.swid)
  if (opts.espnS2) url.searchParams.set('espnS2', opts.espnS2)
  if (opts.l) url.searchParams.set('l', opts.l)
  return url.toString()
}
