// Persistence for server-side auto-sync.
// On Vercel we use a Redis REST endpoint (Vercel KV or Upstash expose the same
// KV_REST_API_URL/TOKEN env vars). Locally we fall back to a JSON file so
// `npm start` works with zero setup.
import fs from 'fs'
import path from 'path'

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const FILE = process.env.FFP_STORE_FILE || path.join(process.cwd(), '.ffp-store.json')

export function hasStore(): boolean {
  return !!KV_URL && !!KV_TOKEN
}

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  })
  const json = (await res.json()) as { result?: unknown }
  return json?.result ?? null
}

function readFile(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function writeFile(db: Record<string, unknown>): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
  } catch {
    // read-only filesystem (e.g. Vercel without KV) - writes are best-effort
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (hasStore()) {
    const value = await redis(['GET', key])
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  const db = readFile()
  return (key in db ? (db[key] as T) : null)
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasStore()) {
    await redis(['SET', key, JSON.stringify(value)])
    return
  }
  const db = readFile()
  db[key] = value
  writeFile(db)
}

export async function kvDelete(key: string): Promise<void> {
  if (hasStore()) {
    await redis(['DEL', key])
    return
  }
  const db = readFile()
  delete db[key]
  writeFile(db)
}
