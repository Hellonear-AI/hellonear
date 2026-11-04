# Spike 01: OutLayer wallet + policy on testnet (#6)

**Status: core flow proven on testnet (4 Nov 2026).** Conclusion for #4: **OutLayer directly is enough for the security demo; the vault-contract fallback is not needed.** Proven: per-transaction limit and whitelist refuse with `403 policy_denied` before any tx; owner approval (`pending_approval` → approved in the dashboard → on-chain tx); freeze refuses with `403 wallet_frozen`; Meteor works as the owner wallet; sub-wallets get their own address. Still open: whether a freeze is an on-chain tx, step 5 (no API to test), and step 6b (sub-wallet policy).

Demo wording: the policy is enforced by OutLayer **before signing**, so a refused transfer has no transaction. Never say "rejected on-chain" or show a tx link for it (root `CLAUDE.md`).

API used: https://skills.outlayer.ai/agent-custody/SKILL.md, `references/register-and-auth.md`, `references/wallet-ops.md`, `references/api-index.md` (read 4 Nov 2026). Host: `https://testnet-api.outlayer.ai`.

Every call is in `results.json` (request, status, response), with API keys and handoff links redacted. The keys are only in `apps/be/.env` (gitignored).

## Results so far

| Step | Result | Evidence |
|---|---|---|
| 1. `POST /register` | ✅ `200`: `wallet_id`, `api_key` (`wk_…`), `near_account_id` (implicit, `99dbb9f7…726f`), `handoff_url`, a 50-call connector trial | `results.json` `1-register` |
| Read address and balance | ✅ `200`; balance `0`, `"account": "executor"` | `status-*` |
| Transfer from the unfunded wallet | ❌ as expected: `422 { error: "chain_refused" }`: the implicit account does not exist on chain until it receives NEAR | `transfer` |
| 6a. `PUT /wallet/v1/api-key` with `Bearer wk_…` + `{ seed, key_hash }` | ✅ `200`: a sub-wallet with **its own** `wallet_id` and address (`b8c4019c…7337`); its derived key reads its own address | `6-subwallet-skill-payments*` |
| 2. Owner sets a policy in the dashboard (per-transaction limit 0.05 NEAR + whitelist `lin1er.testnet` and the sub-wallet), with Meteor | ✅ Meteor (`lin1er.testnet`) connected and signed in the dashboard, after switching it to testnet (see "Dashboard network") | James, 4 Nov |
| 3. Transfer 0.01 NEAR (below the limit) to a whitelisted address | ✅ `200 { status: "pending_approval", approval_id, required: 1, approved: 0 }`; listed by `GET /wallet/v1/pending_approvals`; after the owner approved in the dashboard: `status: "success"`, tx `3wRbJJ5oq8r9uxcZBrghj7QGSffX3w1GCboD4gYqZCXt` (RPC: `FINAL`, `SuccessValue`, Transfer to `lin1er.testnet`) | `transfer`, `pending`, `requests` |
| 4. Transfer 0.2 NEAR (above the per-transaction limit) | ✅ refused: `403 { error: "policy_denied", message: "Per-transaction limit exceeded for native: 200000000000000000000000 > 50000000000000000000000" }`. No approval, no tx | `transfer` |
| Whitelist: 0.01 NEAR to `hellonear-registry.testnet` | ✅ refused: `403 { error: "policy_denied", message: "Address 'hellonear-registry.testnet' is not in whitelist" }` | `transfer` |
| 5. Change the policy with `wk_…` | ⏳ The docs list **no** endpoint that changes a policy with an agent key; policies are set in the dashboard by the owner. Not tested, so not proven | |
| 6b. Fund the sub-wallet from the parent, own policy, transfer above its limit | ⏳ after 2 | |
| 7. Freeze signed by the owner (Meteor) in the dashboard, then a whitelisted 0.01 NEAR transfer | ✅ refused: `403 { error: "wallet_frozen", message: "Wallet is frozen by controller" }`; balance untouched (0.98996 NEAR). No freeze tx was found: neither the audit log nor the dashboard shows one (see Findings) | `transfer`, James, 4 Nov |

## Findings for the backend (#14, #15)

- The engine's `tool.error { status: "policy_denied" }` maps to OutLayer `403 policy_denied`; `wallet_frozen` (`403`) needs the same treatment (a hard stop shown red in the Mind Graph).
- A transfer under the limit came back `pending_approval` with `required: 1` **because the owner's policy sets it**: `approval.threshold.required: 1`, approver `lin1er.testnet` (admin), all types except `intents_swap` (policy below). The backend must handle `pending_approval` (poll `GET /wallet/v1/requests/{id}` until `success` / `failed`), and the approval inbox can list `GET /wallet/v1/pending_approvals`; the approval itself is signed by the owner in the OutLayer dashboard.
- The policy is bound to the agent key: `authorized_key_hashes` holds the SHA-256 of the parent `wk_` key (checked locally, 4 Nov), not the sub-wallet's key. A sub-wallet needs its own policy (step 6b).
- The wallet's audit log (`GET /wallet/v1/audit`, and the dashboard's Audit log page) shows `transfer_pending_approval`, `approval`, `transfer_auto_executed` with the tx hash: usable for Receipts. **The freeze does not appear there**, and the dashboard showed no tx for it, so whether freezing is an on-chain transaction is not proven; the demo can show the `wallet_frozen` refusal, not a freeze tx link.

The policy James set (from the dashboard, 4 Nov; key hash shortened):

```json
{
  "rules": {
    "limits": { "per_transaction": { "native": "50000000000000000000000" } },
    "addresses": { "mode": "whitelist", "list": ["b8c4019c680812815bde5c36424d9396fe1b6eed6a0d3cd2bc2e8d641b827337", "lin1er.testnet"] },
    "transaction_types": ["transfer", "call", "delete", "intents_withdraw", "intents_swap"]
  },
  "capabilities": { "evm_sign": { "allowed": false }, "solana_sign": { "allowed": false } },
  "authorized_key_hashes": ["a51600a7…798c7"],
  "approval": {
    "threshold": { "required": 1 },
    "excluded_types": ["intents_swap"],
    "approvers": [{ "id": "lin1er.testnet", "role": "admin" }]
  }
}
```

## Open design question found on the way

The `handoff_url` that lets the owner set a policy carries the wallet's `wk_` key in its query string (`…/wallet?key=wk_…`). `apps/be/CLAUDE.md` says keys are never returned to the FE. To be decided after step 2: whether the dashboard can open a wallet another way (e.g. `…/wallet/manage` after the owner signs in), or whether showing the link to the wallet's own owner is acceptable.

## Dashboard network

The handoff page uses **mainnet** unless the browser says otherwise, so a testnet key shows "Invalid or revoked API key" (seen 4 Nov). The dashboard reads the network from `localStorage["near-wallet-selector:selectedNetworkId"]` and defaults to mainnet (read from its JS bundle, 4 Nov). Pick testnet when connecting, or set it in the DevTools console and reload:

```js
localStorage.setItem("near-wallet-selector:selectedNetworkId", "testnet")
```

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
