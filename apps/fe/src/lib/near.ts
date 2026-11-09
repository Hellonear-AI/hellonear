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
