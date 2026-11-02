// near_view_account against the real NEAR testnet RPC (needs internet, no database or LLM).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolRegistry } from '../src/tools.ts'

const view = (accountId: string) => toolRegistry.near_view_account.execute!({ accountId } as any, {} as any) as Promise<any>

test('reads the balance of a real testnet account (our registry contract)', async () => {
  const out = await view('hellonear-registry.testnet')
  assert.equal(out.accountId, 'hellonear-registry.testnet')
  assert.match(out.amountYocto, /^\d+$/)
  assert.ok(out.balanceNear > 0)
  assert.ok(Math.abs(out.balanceNear - Number(BigInt(out.amountYocto) / 10n ** 20n) / 10_000) < 1e-9)
})

test('an account that does not exist is an error, not a zero balance', async () => {
  await assert.rejects(view(`no-such-${Date.now()}.testnet`), /UNKNOWN_ACCOUNT/)
})

test('invalid account ids never reach the RPC', async () => {
  const parsed = await toolRegistry.near_view_account.inputSchema!['~standard'].validate({ accountId: 'Bad..ID' })
  assert.ok('issues' in parsed && parsed.issues?.length)
})
