// Meta-transaction relayer (realworld track, NEP-366): the owner signs a delegate action in their own wallet, and the
// backend's relayer account wraps it in a transaction and pays the gas, so the owner needs no NEAR for gas. It only pays
// for calls to our own registry contract (REGISTRY_CONTRACT_ID), only for the methods below, and never for a deposit
// beyond the 1 yoctoNEAR those methods require: docs.near.org "Meta Transactions" (read 13 Nov) says an inner action's
// attached deposit "is also paid for by the relayer", and the registry refunds storage to the caller, so allowing more
// would let anyone drain the relayer. register_mind and equip_skill need a storage deposit (and equip a skill's price),
// so they are not relayed. Every check that can fail runs before anything is sent: a refused request costs nothing.
import { createHash } from 'node:crypto'
import { deserialize } from 'borsh'
import { Account, JsonRpcProvider, KeyPairSigner, PublicKey, SCHEMA, actions, baseEncode, encodeDelegateAction, encodeSignedDelegate, type KeyPairString, type SignedDelegate } from 'near-api-js'
import { config } from './config.ts'
import { HttpError, UPSTREAM_ERROR, fetchFailure } from './http.ts'

// Owner methods the relayer pays gas for, each with the exact deposit the contract asks for (unequip_skill: exactly
// 1 yoctoNEAR; set_wallet: at least 1, and storage only when the new address is longer, which the relayer won't pay).
export const RELAY_METHODS: Record<string, bigint> = { unequip_skill: 1n, set_wallet: 1n }
const MAX_ACTIONS = 4
const MAX_GAS_PER_CALL = 30_000_000_000_000n
const MAX_ARGS_BYTES = 2048
const MAX_DELEGATE_BYTES = 8192
// How far ahead a delegate may expire: ~1 block a second, so about 16 minutes.
export const MAX_TTL_BLOCKS = 1000n
// Per owner, in memory (one backend process).
export const RELAY_LIMIT = { perHour: 10 }
const relayed = new Map<string, number[]>()
export const resetRelayLimits = () => relayed.clear()

type Decoded = { delegateAction: { senderId: string; receiverId: string; actions: Record<string, any>[]; nonce: bigint; maxBlockHeight: bigint; publicKey: { ed25519Key?: { data: number[] } } }; signature: { ed25519Signature?: { data: number[] } } }

const refuse = (error: string, details: Record<string, unknown> = {}) => new HttpError(400, error, details)

// Decodes and checks the parts that need no chain: shape, receiver, methods, deposits, gas, sender and signature.
export function checkDelegate(signedDelegateBase64: string, owner: string): Decoded {
  const bytes = Buffer.from(signedDelegateBase64, 'base64')
  if (!bytes.length || bytes.length > MAX_DELEGATE_BYTES || bytes.toString('base64') !== signedDelegateBase64.replace(/\s/g, '')) throw refuse('invalid_signed_delegate')
  let sd: Decoded
  try {
    sd = deserialize((SCHEMA as any).SignedDelegate, bytes) as unknown as Decoded
    // Trailing bytes or a non-canonical encoding would mean we check one thing and relay another.
    if (Buffer.compare(Buffer.from(encodeSignedDelegate(sd as unknown as SignedDelegate)), bytes) !== 0) throw new Error('not canonical')
  } catch {
    throw refuse('invalid_signed_delegate')
  }
  const da = sd.delegateAction
  if (da.senderId !== owner) throw new HttpError(403, 'delegate_sender_mismatch', { senderId: da.senderId })
  if (da.receiverId !== config.registryContractId) throw refuse('receiver_not_allowed', { receiverId: da.receiverId, allowed: config.registryContractId })
  if (!da.actions.length || da.actions.length > MAX_ACTIONS) throw refuse('too_many_actions', { max: MAX_ACTIONS })
  for (const a of da.actions) {
    const call = a.functionCall
    if (!call || Object.keys(a).length !== 1) throw refuse('action_not_allowed', { action: Object.keys(a)[0] })
    const deposit = RELAY_METHODS[call.methodName]
    if (deposit === undefined) throw refuse('method_not_allowed', { method: call.methodName, allowed: Object.keys(RELAY_METHODS) })
    if (BigInt(call.deposit) !== deposit) throw refuse('deposit_not_allowed', { method: call.methodName, depositYocto: String(call.deposit), allowedYocto: deposit.toString() })
    if (BigInt(call.gas) > MAX_GAS_PER_CALL) throw refuse('gas_too_high', { maxGas: MAX_GAS_PER_CALL.toString() })
    const args = Buffer.from(call.args)
    if (args.length > MAX_ARGS_BYTES) throw refuse('args_too_large')
    try { JSON.parse(args.toString('utf8')) } catch { throw refuse('args_not_json') }
  }
  // Only ed25519 (what NEAR wallets sign with); the signature covers sha256(NEP-461 prefix + delegate action).
  const key = da.publicKey.ed25519Key?.data
  const sig = sd.signature.ed25519Signature?.data
  if (!key || !sig) throw refuse('unsupported_key_type')
  const hash = createHash('sha256').update(encodeDelegateAction(da as never)).digest()
  if (!PublicKey.fromString(`ed25519:${baseEncode(Uint8Array.from(key))}`).verify(hash, Uint8Array.from(sig))) throw refuse('bad_signature')
  return sd
}

const publicKeyOf = (sd: Decoded) => `ed25519:${baseEncode(Uint8Array.from(sd.delegateAction.publicKey.ed25519Key!.data))}`

export async function relay(signedDelegateBase64: string, owner: string): Promise<{ txHash: string; status: 'success' | 'failure'; senderId: string; receiverId: string; methods: string[]; failure?: unknown }> {
  if (!config.relayerAccountId || !config.relayerPrivateKey) throw new HttpError(503, 'relay_not_configured')
  const sd = checkDelegate(signedDelegateBase64, owner)
  const da = sd.delegateAction

  const now = Date.now()
  const recent = (relayed.get(owner) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.length >= RELAY_LIMIT.perHour) throw new HttpError(429, 'relay_rate_limited', { perHour: RELAY_LIMIT.perHour })

  const provider = new JsonRpcProvider({ url: config.relayRpcUrl })
  const chain = async <T>(f: () => Promise<T>, notFound?: string): Promise<T> => {
    try { return await f() } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (notFound && /does not exist|UNKNOWN_ACCESS_KEY|doesn't exist/i.test(msg)) throw refuse(notFound)
      throw new HttpError(UPSTREAM_ERROR, 'rpc_unreachable', { reason: fetchFailure(e) })
    }
  }
  // The chain checks a relayed delegate too, but then the relayer has already paid gas for the failure.
  const block = await chain(() => provider.viewBlock({ finality: 'final' }))
  const height = BigInt(block.header.height)
  if (da.maxBlockHeight <= height) throw refuse('delegate_expired', { maxBlockHeight: da.maxBlockHeight.toString(), height: height.toString() })
  if (da.maxBlockHeight > height + MAX_TTL_BLOCKS) throw refuse('delegate_ttl_too_long', { maxBlocks: MAX_TTL_BLOCKS.toString() })
  const key = await chain(() => provider.viewAccessKey({ accountId: da.senderId, publicKey: publicKeyOf(sd) as never }), 'unknown_access_key')
  // The registry's 1 yoctoNEAR deposits exist so that a function-call key can't call these methods.
  if (key.permission !== 'FullAccess') throw refuse('key_not_full_access')
  if (da.nonce <= key.nonce) throw refuse('stale_nonce', { keyNonce: key.nonce.toString() })

  recent.push(now)
  relayed.set(owner, recent)
  const relayer = new Account(config.relayerAccountId, provider, KeyPairSigner.fromSecretKey(config.relayerPrivateKey as KeyPairString))
  let outcome: any
  try {
    outcome = await relayer.signAndSendTransaction({ receiverId: da.senderId, actions: [actions.signedDelegate(sd as never)], throwOnFailure: false })
  } catch (e) {
    throw new HttpError(UPSTREAM_ERROR, 'relay_failed', { reason: e instanceof Error ? e.message.slice(0, 200) : 'unknown' })
  }
  const failure = outcome?.status?.Failure ?? outcome?.receipts_outcome?.map((r: any) => r?.outcome?.status?.Failure).find(Boolean)
  return {
    txHash: String(outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? ''),
    status: failure ? 'failure' : 'success', senderId: da.senderId, receiverId: da.receiverId,
    methods: da.actions.map((a) => a.functionCall.methodName), ...(failure ? { failure } : {}),
  }
}
