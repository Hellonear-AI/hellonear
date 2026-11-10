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
  demo: { runsPerUser: 20, runsPerIpPerHour: 60, signupsPerIpPerHour: 10, paymentsPerUser: 2, mailPerUser: 2, retentionDays: 7 },
  // OutLayer (#14, #15): the wallet API and the contract owners sign policy and freeze calls on.
  outlayerUrl: process.env.OUTLAYER_URL ?? 'https://testnet-api.outlayer.ai',
  outlayerContractId: process.env.OUTLAYER_CONTRACT_ID ?? 'outlayer.testnet',
  // Composio (#13). Without a key the connection routes answer 503 composio_not_configured.
  composioApiKey: process.env.COMPOSIO_API_KEY ?? '',
  composioUrl: process.env.COMPOSIO_URL ?? 'https://backend.composio.dev/api/v3.1',
  // AgentMail (#96): one inbox per Mind that equips the `email-address` skill. Keys by slot: slot 0 is
  // AGENTMAIL_API_KEY; slot 1 (AGENTMAIL_API_KEY_2, a second organization) takes new inboxes once slot 0 is full.
  // Each inbox row stores its slot. Without a key the mail routes answer 503 agentmail_not_configured.
  agentmailUrl: process.env.AGENTMAIL_URL ?? 'https://api.agentmail.to/v0',
  agentmailKeys: [process.env.AGENTMAIL_API_KEY ?? '', process.env.AGENTMAIL_API_KEY_2 ?? ''],
  // The shared try-out inbox (its inbox id, which is its address), on key slot 0. Empty: try-out Minds get no inbox.
  demoInbox: (process.env.DEMO_AGENTMAIL_INBOX ?? '').trim().toLowerCase(),
  mail: { maxRecipients: 5, sendsPerMindPerDay: 20 },
  // Paid data (#150): the account a Mind pays for a data report (it must be on the paying wallet's address list,
  // or the policy refuses the payment). Empty: the shop answers 503 shop_not_configured.
  shopPayTo: (process.env.SHOP_PAY_TO ?? '').trim().toLowerCase(),
  // Best Price Buyer (#176): several sellers for the same items, `account:multiplier` pairs separated by commas
  // (`a.testnet:1,b.testnet:0.8`); a seller's price is the item's base price times its multiplier. Each account must be
  // on the paying wallet's address list too. Empty: SHOP_PAY_TO is the only seller, at the base price.
  shopSellers: (process.env.SHOP_SELLERS ?? '').trim().toLowerCase(),
  // Telegram (#168). The Bot API base (tests point it at a fake). The webhook base is the public API URL Telegram
  // calls (https://api.hellonear.xyz); without it, local dev polls getUpdates instead (TELEGRAM_POLLING=true).
  telegramApiUrl: process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org',
  telegramWebhookBase: (process.env.TELEGRAM_WEBHOOK_BASE ?? '').replace(/\/$/, ''),
  telegramPolling: process.env.TELEGRAM_POLLING === 'true',
  nonceTtlMs: 5 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
}
