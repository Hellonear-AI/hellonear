// End-to-end NEP-413 login against a running backend and the real testnet RPC, signed with a real
// full-access key (the "or a script" path of #8). The key comes from env and is never printed.
// Run: bun run dev (other terminal), then
//   node --env-file=.env --import tsx scripts/login-smoke.ts [http://localhost:4000]
import { KeyPairSigner, type KeyPairString } from 'near-api-js'

const base = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 4000}`
const accountId = process.env.NEAR_TEST_ACCOUNT_ID
const privateKey = process.env.NEAR_TEST_PRIVATE_KEY as KeyPairString | undefined
if (!accountId || !privateKey) throw new Error('set NEAR_TEST_ACCOUNT_ID and NEAR_TEST_PRIVATE_KEY in apps/be/.env')

const signer = KeyPairSigner.fromSecretKey(privateKey)
const challenge = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST' })).json()
const signed = await signer.signNep413Message(accountId, { message: challenge.message, recipient: challenge.recipient, nonce: new Uint8Array(Buffer.from(challenge.nonce, 'base64')) })
const login = await fetch(`${base}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accountId, publicKey: (await signer.getPublicKey()).toString(), nonce: challenge.nonce, signature: Buffer.from(signed.signature).toString('base64') }),
})
console.log('login', login.status, await login.text())
const cookie = login.headers.get('set-cookie')?.split(';')[0]
console.log('GET /v1/me with session   ', (await fetch(`${base}/v1/me`, { headers: cookie ? { cookie } : {} })).status)
console.log('GET /v1/me without session', (await fetch(`${base}/v1/me`)).status)
