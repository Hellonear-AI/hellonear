// Spike #6: the OutLayer wallet + policy flow on testnet, one step per command. Every request and response is
// appended to results.json with API keys and handoff links redacted; keys live only in apps/be/.env.
// API: https://skills.outlayer.ai/agent-custody/SKILL.md and references/register-and-auth.md (read 4 Nov 2026).
//
//   node --env-file=.env --import tsx spikes/01-outlayer/run.ts <command>
//   register                 POST /register; saves OUTLAYER_API_KEY and OUTLAYER_HANDOFF_URL to .env
//   status [sub]             address + NEAR balance of the wallet (or of sub-wallet `sub`)
//   transfer <to> <near> [sub]   POST /wallet/v1/transfer (amount in NEAR, converted to yocto)
//   call <receiver> <method> POST /wallet/v1/call with empty args and no deposit
//   subwallet <seed>         PUT /wallet/v1/api-key: a sub-wallet; saves OUTLAYER_SUB_<SEED> to .env
//   requests                 GET /wallet/v1/requests (recent operations and their status)
//   pending                  GET /wallet/v1/pending_approvals
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const API = 'https://testnet-api.outlayer.ai'
const ENV_FILE = new URL('../../.env', import.meta.url)
const RESULTS = new URL('./results.json', import.meta.url)

const redact = (text: string) => text.replace(/wk_[0-9a-f]{16,}/g, 'wk_••••').replace(/key=[^"&\s]+/g, 'key=••••')

async function record(step: string, method: string, path: string, body: unknown, status: number, response: string) {
  const all = JSON.parse(await readFile(RESULTS, 'utf8').catch(() => '[]'))
  all.push({ at: new Date().toISOString(), step, request: `${method} ${path}`, body: body ?? null, status, response: JSON.parse(redact(response) || 'null') })
  await writeFile(RESULTS, JSON.stringify(all, null, 2) + '\n')
}

async function call(step: string, method: string, path: string, key?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 500) } }
  await record(step, method, path, body, res.status, JSON.stringify(json))
  console.log(step, res.status, redact(JSON.stringify(json, null, 2)))
  return { status: res.status, json }
}

async function saveEnv(name: string, value: string) {
  const env = await readFile(ENV_FILE, 'utf8').catch(() => '')
  if (new RegExp(`^${name}=`, 'm').test(env)) throw new Error(`${name} is already in .env; remove it first to replace it`)
  await appendFile(ENV_FILE, `${env.endsWith('\n') || !env ? '' : '\n'}${name}=${value}\n`)
}

const keyOf = (sub?: string) => {
  const key = sub ? process.env[`OUTLAYER_SUB_${sub.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] : process.env.OUTLAYER_API_KEY
  if (!key) throw new Error(sub ? `no key for sub-wallet ${sub}; run subwallet ${sub}` : 'OUTLAYER_API_KEY is not set; run register')
  return key
}
const yocto = (near: string) => {
  const [whole, frac = ''] = near.split('.')
  return (BigInt(whole) * 10n ** 24n + BigInt((frac + '0'.repeat(24)).slice(0, 24))).toString()
}

const [command, ...args] = process.argv.slice(2)
if (command === 'register') {
  if (process.env.OUTLAYER_API_KEY) throw new Error('OUTLAYER_API_KEY is already set')
  const { status, json } = await call('1-register', 'POST', '/register')
  if (status === 200 && json.api_key) {
    await saveEnv('OUTLAYER_API_KEY', json.api_key)
    await saveEnv('OUTLAYER_HANDOFF_URL', json.handoff_url)
    console.log(`saved the key and handoff link to apps/be/.env; wallet ${json.near_account_id}`)
  }
} else if (command === 'status') {
  await call('status-address', 'GET', '/wallet/v1/address?chain=near', keyOf(args[0]))
  await call('status-balance', 'GET', '/wallet/v1/balance?chain=near', keyOf(args[0]))
} else if (command === 'transfer') {
  const [to, near, sub] = args
  if (!to || !near) throw new Error('usage: transfer <to> <near> [sub]')
  await call(`transfer${sub ? `-${sub}` : ''}`, 'POST', '/wallet/v1/transfer', keyOf(sub), { chain: 'near', to, amount: yocto(near) })
} else if (command === 'call') {
  const [receiver, method] = args
  if (!receiver || !method) throw new Error('usage: call <receiver> <method>')
  await call('call', 'POST', '/wallet/v1/call', keyOf(), { receiver_id: receiver, method_name: method, args: {}, gas: '30000000000000', deposit: '0' })
} else if (command === 'subwallet') {
  const [seed] = args
  if (!seed || !/^[a-zA-Z0-9._-]{1,64}$/.test(seed)) throw new Error('usage: subwallet <seed>  ([a-zA-Z0-9._-])')
  const parent = keyOf()
  // Derivation from the skill's example: the sub key is reproducible from the parent key and the seed.
  const subKey = `wk_${createHash('sha256').update(`${seed}:0:${parent}`).digest('hex')}`
  const keyHash = createHash('sha256').update(subKey).digest('hex')
  const { status } = await call(`6-subwallet-${seed}`, 'PUT', '/wallet/v1/api-key', parent, { seed, key_hash: keyHash })
  if (status === 200) {
    await saveEnv(`OUTLAYER_SUB_${seed.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`, subKey)
    await call(`6-subwallet-${seed}-address`, 'GET', '/wallet/v1/address?chain=near', subKey)
  }
} else if (command === 'requests') {
  await call('requests', 'GET', '/wallet/v1/requests', keyOf(args[0]))
} else if (command === 'pending') {
  await call('pending', 'GET', '/wallet/v1/pending_approvals', keyOf(args[0]))
} else {
  console.log('commands: register | status [sub] | transfer <to> <near> [sub] | subwallet <seed> | requests | pending')
}
