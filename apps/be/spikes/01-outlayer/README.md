# Spike 01: OutLayer wallet + policy on testnet (#6)

**Status: in progress (4 Nov 2026).** Steps that need no money or owner wallet are done; the rest wait for the owner (James, Meteor Wallet testnet). Conclusion for #4: **not proven yet**.

API used: https://skills.outlayer.ai/agent-custody/SKILL.md, `references/register-and-auth.md`, `references/wallet-ops.md`, `references/api-index.md` (read 4 Nov 2026). Host: `https://testnet-api.outlayer.ai`.

Every call is in `results.json` (request, status, response), with API keys and handoff links redacted. The keys are only in `apps/be/.env` (gitignored).

## Results so far

| Step | Result | Evidence |
|---|---|---|
| 1. `POST /register` | ✅ `200`: `wallet_id`, `api_key` (`wk_…`), `near_account_id` (implicit, `99dbb9f7…726f`), `handoff_url`, a 50-call connector trial | `results.json` `1-register` |
| Read address and balance | ✅ `200`; balance `0`, `"account": "executor"` | `status-*` |
| Transfer from the unfunded wallet | ❌ as expected: `422 { error: "chain_refused" }`: the implicit account does not exist on chain until it receives NEAR | `transfer` |
| 6a. `PUT /wallet/v1/api-key` with `Bearer wk_…` + `{ seed, key_hash }` | ✅ `200`: a sub-wallet with **its own** `wallet_id` and address (`b8c4019c…7337`); its derived key reads its own address | `6-subwallet-skill-payments*` |
| 2. Owner sets a policy in the dashboard (per-transaction limit + whitelist), with Meteor | ⏳ needs James | |
| 3. Transfer below the limit to a whitelisted address | ⏳ after 2 | |
| 4. Transfer above the per-transaction limit | ⏳ after 2. Expected `policy_denied` (api-index lists it); not seen yet | |
| 5. Change the policy with `wk_…` | ⏳ The docs list **no** endpoint that changes a policy with an agent key; policies are set in the dashboard by the owner. Not tested, so not proven | |
| 6b. Fund the sub-wallet from the parent, own policy, transfer above its limit | ⏳ after 2 | |
| 7. `freeze_wallet()` signed by the owner, testnet tx link, next transfer refused (`wallet_frozen`?) | ⏳ needs James | |

## Open design question found on the way

The `handoff_url` that lets the owner set a policy carries the wallet's `wk_` key in its query string (`…/wallet?key=wk_…`). `apps/be/CLAUDE.md` says keys are never returned to the FE. To be decided after step 2: whether the dashboard can open a wallet another way (e.g. `…/wallet/manage` after the owner signs in), or whether showing the link to the wallet's own owner is acceptable.

## What James needs to do (about 15 minutes)

All on **testnet**, with the Meteor Wallet testnet account.

1. **Fund the Mind wallet** with about 1 testnet NEAR: send it from Meteor to `99dbb9f703e4982ac61758945939e8d7ff8ea38cdfad8f79946f5d7240c8726f`. If Meteor has no testnet NEAR, use the testnet faucet linked from docs.near.org.
2. **Set the policy.** Open the handoff link without printing it (it contains the key):
   ```sh
   xdg-open "$(grep '^OUTLAYER_HANDOFF_URL=' apps/be/.env | cut -d= -f2-)"
   ```
   Switch the dashboard to **testnet**, connect **Meteor**, and set: per-transaction limit **0.05 NEAR**, whitelist: `b8c4019c680812815bde5c36424d9396fe1b6eed6a0d3cd2bc2e8d641b827337` (the sub-wallet) and one testnet account of yours. Note whether Meteor could connect and sign; if not, which wallet worked.
3. Tell the agent (or run, from `apps/be`):
   ```sh
   node --env-file=.env --import tsx spikes/01-outlayer/run.ts transfer <your-account>.testnet 0.01   # step 3: should succeed
   node --env-file=.env --import tsx spikes/01-outlayer/run.ts transfer <your-account>.testnet 0.2    # step 4: should be refused
   node --env-file=.env --import tsx spikes/01-outlayer/run.ts transfer someone-else.testnet 0.01      # whitelist: should be refused
   ```
4. **Freeze** the wallet from the dashboard with Meteor, copy the testnet tx link, then run the step-3 transfer again (should be refused).

## Run

```sh
cd apps/be
node --env-file=.env --import tsx spikes/01-outlayer/run.ts            # lists the commands
```

Commands: `register`, `status [sub]`, `transfer <to> <near> [sub]`, `subwallet <seed>`, `requests`, `pending`.

## Not covered

Multisig approvals, sub-wallet revocation (`DELETE /wallet/v1/api-key/{hash}`), connector calls, mainnet. Intents routes are mainnet-only and out of scope.
