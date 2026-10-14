// Persistence for server-side auto-sync.
// On Vercel we use a Redis REST endpoint (Vercel KV or Upstash - both expose the
// same KV_REST_API_URL/TOKEN env vars). Locally we fall back to a JSON file so
// `npm start` works with zero setup.
import fs from 'fs'
import path from 'path'

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const FILE = process.env.FFP_STORE_FILE || path.join(process.cwd(), '.ffp-store.json')

export function hasStore(): boolean {
  return !!KV_URL && !!KV_TOKEN
}

async function redis(cmd: any[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  })
  const j: any = await r.json()
  return j ? j.result : null
}

function readFile(): Record<string, any> {
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const j = JSON.parse(raw)
    return j && typeof j === 'object' ? j : {}
  } catch (e) {
    return {}
  }
}

function writeFile(db: Record<string, any>) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
  } catch (e) {}
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  if (hasStore()) {
    const v = await redis(['GET', key])
    if (v == null) return null
    try { return JSON.parse(v) as T } catch (e) { return null }
  }
  const db = readFile()
  return (key in db ? (db[key] as T) : null)
}

export async function kvSet(key: string, val: any): Promise<void> {
  if (hasStore()) {
    await redis(['SET', key, JSON.stringify(val)])
    return
  }
  const db = readFile()
  db[key] = val
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
