import crypto from 'crypto'

const SECRET = process.env.FFP_SECRET || 'ffp-dev-secret-change-me'
const KEY = crypto.createHash('sha256').update(SECRET).digest()

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(blob: string): string {
  const b = Buffer.from(String(blob), 'base64')
  const iv = b.subarray(0, 12)
  const tag = b.subarray(12, 28)
  const enc = b.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
