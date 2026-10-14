const AUTH_KEY = 'ffp:deviceAuth'
const LEAGUE_KEY = 'ffp:leagues'
const ONBOARD_KEY = 'ffp:onboarded'

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode) - device auth is best-effort
  }
}

export function getDeviceAuth() {
  return read(AUTH_KEY, {})
}

export function setDeviceAuth(auth) {
  write(AUTH_KEY, auth || {})
}

export function hasDeviceAuth() {
  const a = getDeviceAuth()
  return !!(a.swid && a.espnS2)
}

export function getLeagues() {
  return read(LEAGUE_KEY, [])
}

function setLeagues(list) {
  write(LEAGUE_KEY, list || [])
}

export function addLeague(league) {
  if (!league || !league.id) return getLeagues()
  const list = getLeagues().filter((l) => String(l.id) !== String(league.id))
  list.push({
    id: String(league.id),
    name: league.name || 'League ' + league.id,
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
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1'
  } catch {
    return false
  }
}

export function setOnboarded(on) {
  try {
    on ? localStorage.setItem(ONBOARD_KEY, '1') : localStorage.removeItem(ONBOARD_KEY)
  } catch {
    // ignore
  }
}
