// Secret encryption (#18): AES-256-GCM with the master key from the hosting secret manager (KMS deferred).
// The ciphertext is bound to its owner and name (AAD), so a row copied to another user or name fails to decrypt.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const IV_BYTES = 12
const TAG_BYTES = 16

export function encrypt(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decrypt(key: Buffer, ciphertext: string, aad: string): string {
  const raw = Buffer.from(ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

// Ids look like `usr_…`, `mnd_…`: letters, digits and `_`, which the engine's mindId format accepts.
export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`

// Constant-time comparison of two secrets (tokens, codes, header values).
export const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
