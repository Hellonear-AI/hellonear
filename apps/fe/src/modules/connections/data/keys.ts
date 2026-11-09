// The rules for a saved key, the same as the backend's (apps/be/src/secrets.ts), checked as you type.

const NAME = /^[A-Z][A-Z0-9_]{0,63}$/
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function keyNameError(name: string, taken: string[]): string | null {
  const n = name.trim()
  if (!n) return null
  if (!NAME.test(n)) return "Capital letters, numbers and _ only, starting with a letter, like SHOP_API_KEY."
  if (taken.includes(n)) return "You already have a key with this name. Replace it instead."
  return null
}

export function keyValueError(value: string): string | null {
  if (!value) return null
  if (value.length < 4) return "That's too short to be a key."
  if (value.length > 8192) return "That's too long. Keys are at most 8192 characters."
  return null
}

/** One site per line, lowercase; a pasted https:// or /path is a mistake worth naming. */
export function parseHosts(text: string): { hosts: string[]; error: string | null } {
  const lines = text
    .split(/[\n,]/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
  for (const l of lines) {
    if (/^[a-z]+:\/\//.test(l) || l.includes("/") || l.includes(":")) return { hosts: [], error: `Just the site, like api.example.com, without https:// or a path. Check "${l}".` }
    if (!HOST.test(l)) return { hosts: [], error: `"${l}" isn't a site name. It looks like api.example.com.` }
  }
  const hosts = [...new Set(lines)]
  if (hosts.length > 10) return { hosts: [], error: "At most 10 sites per key." }
  return { hosts, error: null }
}
