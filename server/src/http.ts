import type { Res } from './types.js'

export interface FetchFailure {
  error?: string
  message?: string
}

export function errorStatus(r: FetchFailure): number {
  if (r.error === 'private_league') return 401
  if (r.error === 'bad_input') return 400
  return 404
}

export function sendFetchError(res: Res, r: FetchFailure, fallback = 'Could not load that data.') {
  res.status(errorStatus(r)).json({ ok: false, error: r.error || 'not_found', message: r.message || fallback })
}
