import type { EspnCreds, HeaderCarrier } from './types.js'

let creds: EspnCreds = {}

export function getCreds(): EspnCreds {
  return { ...creds }
}

export function setCreds(c: EspnCreds): void {
  if (c.swid !== undefined) creds.swid = c.swid
  if (c.espnS2 !== undefined) creds.espnS2 = c.espnS2
}

/** Resolves the ESPN cookie header from the request headers, falling back to stored creds. */
export function authHeaders(req?: HeaderCarrier): Record<string, string> {
  const h = (req?.headers ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = h[k]
      if (typeof v === 'string' && v) return v
    }
    return undefined
  }
  const swid = pick('x-fantasy-swid', 'x-fantasy-espn-swid') ?? creds.swid
  const espnS2 = pick('x-fantasy-espns2', 'x-fantasy-espn-s2') ?? creds.espnS2
  if (!swid) return {}
  return { Cookie: 'SWID=' + swid + '; espn_s2=' + (espnS2 || '') }
}
