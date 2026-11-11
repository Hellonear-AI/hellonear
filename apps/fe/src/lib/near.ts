// NEAR amounts as decimal strings ("1.5"), compared without floats so 24 decimals stay exact.

const DECIMAL = /^\d+(\.\d+)?$/

/** -1, 0 or 1 like a sort comparator; null when either side isn't a plain decimal. */
export function compareNear(a: string, b: string): -1 | 0 | 1 | null {
  if (!DECIMAL.test(a.trim()) || !DECIMAL.test(b.trim())) return null
  const parts = (v: string) => {
    const [whole = "", frac = ""] = v.trim().split(".")
    return [whole.replace(/^0+/, ""), frac.padEnd(24, "0").slice(0, 24)] as const
  }
  const [aw, af] = parts(a)
  const [bw, bf] = parts(b)
  if (aw.length !== bw.length) return aw.length > bw.length ? 1 : -1
  if (aw !== bw) return aw > bw ? 1 : -1
  return af === bf ? 0 : af > bf ? 1 : -1
}

const YOCTO_DIGITS = 24

/** "1.5" NEAR -> "1500000000000000000000000" yoctoNEAR, exactly. Null for anything else. */
export function toYocto(near: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(near.trim())
  if (!m) return null
  const yocto = (m[1] + (m[2] ?? "").padEnd(YOCTO_DIGITS, "0")).replace(/^0+(?=\d)/, "")
  return yocto
}

/** yoctoNEAR -> a NEAR decimal string without trailing zeros ("1500…0" -> "1.5"). */
export function fromYocto(yocto: string): string {
  const digits = yocto.replace(/^0+/, "").padStart(YOCTO_DIGITS + 1, "0")
  const whole = digits.slice(0, -YOCTO_DIGITS)
  const frac = digits.slice(-YOCTO_DIGITS).replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : whole
}

/** a + b, exactly; null when either isn't a plain decimal. */
export function addNear(a: string, b: string): string | null {
  const x = toYocto(a)
  const y = toYocto(b)
  return x === null || y === null ? null : fromYocto((BigInt(x) + BigInt(y)).toString())
}

/** a - b, never below 0; null when either isn't a plain decimal. */
export function subNear(a: string, b: string): string | null {
  const x = toYocto(a)
  const y = toYocto(b)
  if (x === null || y === null) return null
  const d = BigInt(x) - BigInt(y)
  return fromYocto((d > 0n ? d : 0n).toString())
}
