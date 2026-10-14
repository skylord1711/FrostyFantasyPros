const KEY = 'ffp:deviceAuth'

export function getDeviceAuth() {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {} } catch (e) { return {} }
}

export function setDeviceAuth(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a || {})) } catch (e) {}
}

export function clearDeviceAuth() {
  try { localStorage.removeItem(KEY) } catch (e) {}
}

export function buildLink(opts = {}) {
  const url = new URL(window.location.origin + '/#/connect')
  if (opts.swid) url.searchParams.set('swid', opts.swid)
  if (opts.espnS2) url.searchParams.set('espnS2', opts.espnS2)
  if (opts.l) url.searchParams.set('l', opts.l)
  return url.toString()
}
