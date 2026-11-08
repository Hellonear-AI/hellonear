// Runtime configuration, read once from the environment.
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (see apps/be/.env.example)`)
  return value
}

// FE_ORIGIN may list several origins, comma-separated. The first is the web app's public origin.
function origins(): string[] {
  const list = (process.env.FE_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean)
  if (list.length === 0) throw new Error('FE_ORIGIN has no origin in it')
  return list
}

const feOrigins = origins()

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
  // Origins allowed for CORS with credentials and on state-changing requests (e.g. the public web app plus a
  // local dev FE). `feOrigin`, the first one, is where Composio sends the owner back after connecting an app.
  feOrigins,
  feOrigin: feOrigins[0],
  // NEP-413 `recipient` the wallet signs for; the FE must use the same value.
  authRecipient: process.env.AUTH_RECIPIENT ?? 'hellonear.app',
  authMessage: 'Sign in to HelloNear',
  nearRpcUrl: process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // Judge try-out mode (#43). Off unless DEMO_MODE=true; the shared demo wallet's agent key is optional.
  demoMode: process.env.DEMO_MODE === 'true',
  demoWalletKey: process.env.DEMO_OUTLAYER_API_KEY ?? '',
  demo: { runsPerUser: 20, runsPerIpPerHour: 60, signupsPerIpPerHour: 10, paymentsPerUser: 2, retentionDays: 7 },
  // OutLayer (#14, #15): the wallet API and the contract owners sign policy and freeze calls on.
  outlayerUrl: process.env.OUTLAYER_URL ?? 'https://testnet-api.outlayer.ai',
  outlayerContractId: process.env.OUTLAYER_CONTRACT_ID ?? 'outlayer.testnet',
  // Composio (#13). Without a key the connection routes answer 503 composio_not_configured.
  composioApiKey: process.env.COMPOSIO_API_KEY ?? '',
  composioUrl: process.env.COMPOSIO_URL ?? 'https://backend.composio.dev/api/v3.1',
  nonceTtlMs: 5 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
}
