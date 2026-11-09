/** A 64-character implicit address shortened like the design ("7a1c90e2…a84f3b"); named accounts stay whole. */
export function shortAddress(address: string): string {
  return /^[0-9a-f]{64}$/.test(address) ? `${address.slice(0, 8)}…${address.slice(-6)}` : address
}
