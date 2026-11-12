// Relayer checks (src/relay.ts) that need no chain: each refusal with a delegate action built and signed here with a
// throwaway key, exactly as a wallet would sign it (near-api-js signDelegateAction). Offline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { KeyPair, KeyPairSigner, actions, buildDelegateAction, encodeSignedDelegate } from 'near-api-js'

// The config module wants these at import; nothing here connects to them.
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused'
process.env.ENGINE_API_KEY ??= 'unused'
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('base64')
const { config } = await import('../src/config.ts')
const { checkDelegate } = await import('../src/relay.ts')
const { HttpError } = await import('../src/http.ts')

const owner = 'alice.testnet'
const registry = config.registryContractId
const kp = KeyPair.fromRandom('ed25519')
const unequip = (deposit = 1n, gas = 30_000_000_000_000n) => actions.functionCall('unequip_skill', { mind_id: 'mnd_1', skill_id: 'pay' }, gas, deposit)

async function signed(opts: { senderId?: string; receiverId?: string; acts?: ReturnType<typeof actions.functionCall>[]; key?: KeyPair; signWith?: KeyPair } = {}) {
  const key = opts.key ?? kp
  const da = buildDelegateAction({ senderId: opts.senderId ?? owner, receiverId: opts.receiverId ?? registry, actions: opts.acts ?? [unequip()], nonce: 7n, maxBlockHeight: 1000n, publicKey: key.getPublicKey() })
  const signer = new KeyPairSigner(opts.signWith ?? key)
  // signDelegateAction refuses a key that isn't the signer's own, so a forged signature is spliced in by hand below.
  const { signedDelegate } = await new KeyPairSigner(key).signDelegateAction(da)
  if (opts.signWith) {
    const other = await signer.signDelegateAction(buildDelegateAction({ ...da, publicKey: opts.signWith.getPublicKey() } as never))
    signedDelegate.signature = other.signedDelegate.signature
  }
  return Buffer.from(encodeSignedDelegate(signedDelegate)).toString('base64')
}
const refusal = (f: () => unknown) => { try { f() } catch (e) { assert.ok(e instanceof HttpError); return [e.status, e.message] } assert.fail('expected a refusal') }

test('a well-formed unequip_skill with 1 yoctoNEAR, signed by the owner, passes', async () => {
  const sd = checkDelegate(await signed(), owner)
  assert.equal(sd.delegateAction.actions[0].functionCall.methodName, 'unequip_skill')
  assert.equal(sd.delegateAction.nonce, 7n)
  // set_wallet too, and several allowed calls in one delegate.
  checkDelegate(await signed({ acts: [actions.functionCall('set_wallet', { mind_id: 'mnd_1', wallet: 'w.testnet' }, 10_000_000_000_000n, 1n), unequip()] }), owner)
})

test('refuses another receiver, a method off the list, a deposit, too much gas, and non-JSON args', async () => {
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ receiverId: 'wrap.testnet' }), owner)), [400, 'receiver_not_allowed'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [actions.functionCall('equip_skill', { mind_id: 'm', skill_id: 's' }, 30_000_000_000_000n, 0n)] }), owner)), [400, 'method_not_allowed'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [actions.functionCall('register_mind', {}, 30_000_000_000_000n, 10n ** 22n)] }), owner)), [400, 'method_not_allowed'])
  // The relayer would pay any deposit: only the exact 1 yoctoNEAR the method needs.
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [unequip(10n ** 24n)] }), owner)), [400, 'deposit_not_allowed'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [unequip(0n)] }), owner)), [400, 'deposit_not_allowed'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [unequip(1n, 300_000_000_000_000n)] }), owner)), [400, 'gas_too_high'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [actions.transfer(1n) as never] }), owner)), [400, 'action_not_allowed'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [unequip(), unequip(), unequip(), unequip(), unequip()] }), owner)), [400, 'too_many_actions'])
  const raw = actions.functionCall('unequip_skill', new Uint8Array(Buffer.from('not json')) as never, 30_000_000_000_000n, 1n)
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ acts: [raw] }), owner)), [400, 'args_not_json'])
})

test('refuses another sender, a bad signature, garbage and trailing bytes', async () => {
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ senderId: 'mallory.testnet' }), owner)), [403, 'delegate_sender_mismatch'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ signWith: KeyPair.fromRandom('ed25519') }), owner)), [400, 'bad_signature'])
  assert.deepEqual(refusal(checkDelegate.bind(null, Buffer.from('hello').toString('base64'), owner)), [400, 'invalid_signed_delegate'])
  assert.deepEqual(refusal(checkDelegate.bind(null, 'not base64!!', owner)), [400, 'invalid_signed_delegate'])
  const trailing = Buffer.concat([Buffer.from(await signed(), 'base64'), Buffer.from([0])]).toString('base64')
  assert.deepEqual(refusal(checkDelegate.bind(null, trailing, owner)), [400, 'invalid_signed_delegate'])
  assert.deepEqual(refusal(checkDelegate.bind(null, await signed({ key: KeyPair.fromRandom('secp256k1') }), owner)), [400, 'unsupported_key_type'])
})
