import { walletApi, type ApiWallet } from "@/modules/wallet/api"
import { WrongAccountError } from "@/modules/wallet/hooks/useOwnerTransaction"

// Owner actions (set up limits, change them, freeze, add funds) share one shape: the backend
// builds a transaction, the owner signs it in their wallet, then the wallet is read back until
// the change shows, since OutLayer can take a moment.

/** Where an owner action stopped: preparing it, the owner's signature, or reading the wallet back. */
export class OwnerActionError extends Error {
  constructor(
    readonly step: "build" | "sign" | "check",
    readonly cause: unknown
  ) {
    super(`Owner action failed at ${step}`)
  }
}

/** How long to wait for a signed change to show: 6 reads, 1.5 s apart. */
export const READ_BACK = { tries: 6, everyMs: 1500 } as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Read the Mind's wallet until `done` says the change shows; throws a "check" error if it never does. */
export async function readWalletUntil(mindId: string, done: (w: ApiWallet) => boolean): Promise<ApiWallet> {
  for (let i = 0; i < READ_BACK.tries; i++) {
    const wallet = await walletApi.wallet(mindId).catch(() => null)
    if (wallet && done(wallet)) return wallet
    await sleep(READ_BACK.everyMs)
  }
  throw new OwnerActionError("check", null)
}

/** Run `fn` as one step: any failure becomes an `OwnerActionError` for that step. */
export async function ownerStep<T>(step: OwnerActionError["step"], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw err instanceof OwnerActionError ? err : new OwnerActionError(step, err)
  }
}

/** The wallet is signed in to another account: say which, and which to switch to. Null otherwise. */
export function wrongAccountText(err: unknown): string | null {
  const cause = err instanceof OwnerActionError ? err.cause : err
  if (!(cause instanceof WrongAccountError)) return null
  return `Your wallet is signed in as ${cause.actual.join(", ") || "another account"}. Switch it to ${cause.expected}, then try again.`
}

/**
 * A browser lets a click open a window only for a few seconds after it (Chrome: about 5 s of
 * "transient user activation"). Building an owner action can take longer (#260: about 4.5 s on
 * the hosted backend, mostly a slow testnet RPC), and then Meteor's window is blocked and NEAR
 * Connect 0.12.0 never says so. Past this much time since the click, an owner action stops once
 * its transaction is ready and asks for one more click, which opens Meteor at once.
 */
export const POPUP_SAFE_MS = 3000
export const tooLateForPopup = (startedAt: number) => Date.now() - startedAt > POPUP_SAFE_MS

/** An owner action built in time is signed and done; one built too late waits for a click to sign. */
export type Prepared<T> = { status: "needs_click"; transaction: T }

/** After this long waiting for Meteor with no answer, say its window may have been blocked. */
export const BLOCKED_HINT_MS = 10_000
export const BLOCKED_HINT = "No Meteor window? Your browser may have blocked it. Allow pop-ups for this site, then try again."
