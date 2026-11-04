// Runtime configuration, read once from the environment.
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (see apps/be/.env.example)`)
  return value
}

function masterKey(): Buffer {
  const key = Buffer.from(required('SECRETS_MASTER_KEY'), 'base64')
  if (key.length !== 32) throw new Error('SECRETS_MASTER_KEY must be 32 bytes, base64 (openssl rand -base64 32)')
  return key
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  engineUrl: process.env.ENGINE_URL ?? 'http://localhost:4100',
  engineApiKey: required('ENGINE_API_KEY'),
  secretsMasterKey: masterKey(),
  port: Number(process.env.PORT ?? 4000),
  // The web app's origin: allowed for CORS with credentials, required on state-changing requests.
  feOrigin: process.env.FE_ORIGIN ?? 'http://localhost:3000',
  // NEP-413 `recipient` the wallet signs for; the FE must use the same value.
  authRecipient: process.env.AUTH_RECIPIENT ?? 'hellonear.app',
  authMessage: 'Sign in to HelloNear',
  nearRpcUrl: process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  nonceTtlMs: 5 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
}
