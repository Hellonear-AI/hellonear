import { ApiError, isApiCode } from "@/lib/api"
import { signInErrorMessage } from "@/modules/auth/hooks/useSession"

/** L1.3: say what happened and that nothing changed; the same button works again. */
export function walletError(err: unknown): string {
  if (err instanceof ApiError) return signInErrorMessage(err)
  return "Sign-in was canceled in the wallet. No changes were made."
}

/** T1.2 and a backend without try-out mode. */
export function demoError(err: unknown): string {
  if (isApiCode(err, "demo_rate_limited")) return "Too many guest sessions from this network. Please try again later or connect a wallet."
  if (err instanceof ApiError && err.status === 404) return "Guest access is not available at the moment. Please connect a wallet."
  return "Could not start a guest session. Please try again later."
}
