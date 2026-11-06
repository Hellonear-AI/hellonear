# Spike 01: OutLayer wallet + policy on testnet (#6)

**Status: core flow proven on testnet (4 Nov 2026).** Conclusion for #4: **OutLayer directly is enough for the security demo; the vault-contract fallback is not needed.** Proven: per-transaction limit and whitelist refuse with `403 policy_denied` before any tx; owner approval (`pending_approval` → approved in the dashboard → on-chain tx); freeze refuses with `403 wallet_frozen`; Meteor works as the owner wallet; sub-wallets get their own address. Freeze **is** an on-chain tx (found 5 Nov, see "Owner actions on-chain"). Still open: step 5 (no API to test) and step 6b (sub-wallet policy).

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
| 7. Freeze signed by the owner (Meteor) in the dashboard, then a whitelisted 0.01 NEAR transfer | ✅ refused: `403 { error: "wallet_frozen", message: "Wallet is frozen by controller" }`; balance untouched (0.98996 NEAR). The 4 Nov freeze tx was not looked up; the 5 Nov freeze of this wallet is tx `848cXteg2spf8E8gG1BUNDa2LT91wiBX2L2qwAA1Whu7` (see "Owner actions on-chain") | `transfer`, James, 4 Nov |

## Findings for the backend (#14, #15)

- The engine's `tool.error { status: "policy_denied" }` maps to OutLayer `403 policy_denied`; `wallet_frozen` (`403`) needs the same treatment (a hard stop shown red in the Mind Graph).
- A transfer under the limit came back `pending_approval` with `required: 1` **because the owner's policy sets it**: `approval.threshold.required: 1`, approver `lin1er.testnet` (admin), all types except `intents_swap` (policy below). The backend must handle `pending_approval` (poll `GET /wallet/v1/requests/{id}` until `success` / `failed`), and the approval inbox can list `GET /wallet/v1/pending_approvals`; the approval itself is signed by the owner in the OutLayer dashboard.
- The policy is bound to the agent key: `authorized_key_hashes` holds the SHA-256 of the parent `wk_` key (checked locally, 4 Nov), not the sub-wallet's key. A sub-wallet needs its own policy (step 6b).
- The wallet's audit log (`GET /wallet/v1/audit`, and the dashboard's Audit log page) shows `transfer_pending_approval`, `approval`, `transfer_auto_executed` with the tx hash: usable for Receipts. The freeze does not appear there because it is not a wallet operation: it is an owner call on the `outlayer.testnet` contract (next section).

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

### Policy v2: the one to use for demo wallets (decided 4 Nov)

The dashboard's approval is per transaction type with a count of approvers ("Require approval for: …"); no amount threshold was found in its policy form (read from its JS bundle, 4 Nov). With approval on, every payment would wait for the owner in the OutLayer dashboard on top of the app's own approval inbox. **Decision (James): approval lives in the app (engine `requireApproval` + the backend approval inbox); OutLayer is the hard stop (per-transaction limit, whitelist, transfer only, freeze).** Worst case if the app is compromised: transfers of at most the limit, only to the owner's whitelisted addresses.

Changes from v1: `transaction_types` is only `transfer` (`call` could move tokens the native limit does not cover; `delete` empties the wallet; intents are mainnet-only), and `transfer` is in `approval.excluded_types`.

```json
{
  "rules": {
    "limits": { "per_transaction": { "native": "50000000000000000000000" } },
    "addresses": { "mode": "whitelist", "list": ["b8c4019c680812815bde5c36424d9396fe1b6eed6a0d3cd2bc2e8d641b827337", "lin1er.testnet"] },
    "transaction_types": ["transfer"]
  },
  "capabilities": { "evm_sign": { "allowed": false }, "solana_sign": { "allowed": false } },
  "authorized_key_hashes": ["a51600a7…798c7"],
  "approval": {
    "threshold": { "required": 1 },
    "excluded_types": ["transfer", "call", "delete", "intents_swap", "cross_chain_withdraw"],
    "approvers": [{ "id": "lin1er.testnet", "role": "admin" }]
  }
}
```

Checked on testnet after the owner unfroze the wallet (4 Nov):

| Call | Result |
|---|---|
| 0.01 NEAR to `lin1er.testnet` | ✅ `200 { status: "success" }` at once, no approval; tx `DoHQzcaYu5V7PQJhVoxkrZyhixZSEbvZC1emfHtJgdtx` |
| `call` to `lin1er.testnet` (whitelisted) | ✅ `403 policy_denied` "Transaction type 'call' is not allowed by policy" |
| 0.2 NEAR to `lin1er.testnet` | ✅ still `403 policy_denied` "Per-transaction limit exceeded" |

This wallet's key was visible in a screenshot during the spike: use a **new** wallet with policy v2 for the demo.

## Open design question found on the way

The `handoff_url` that lets the owner set a policy carries the wallet's `wk_` key in its query string (`…/wallet?key=wk_…`). `apps/be/CLAUDE.md` says keys are never returned to the FE. To be decided after step 2: whether the dashboard can open a wallet another way (e.g. `…/wallet/manage` after the owner signs in), or whether showing the link to the wallet's own owner is acceptable.

## Dashboard network

The handoff page uses **mainnet** unless the browser says otherwise, so a testnet key shows "Invalid or revoked API key" (seen 4 Nov). The dashboard reads the network from `localStorage["near-wallet-selector:selectedNetworkId"]` and defaults to mainnet (read from its JS bundle, 4 Nov). Pick testnet when connecting, or set it in the DevTools console and reload:

```js
localStorage.setItem("near-wallet-selector:selectedNetworkId", "testnet")
```

## Owner actions on-chain (5 Nov)

Read from the dashboard's JS bundle (`app.outlayer.ai`, 5 Nov) and checked on testnet:

- **Policy and freeze live in the `outlayer.testnet` contract**, signed by the owner. View `get_wallet_policies_by_owner({ owner })` lists the owner's wallets with `frozen` (for `lin1er.testnet` on 5 Nov: the spike wallet `frozen: true`, the demo wallet `frozen: false`).
- **Freeze** = `freeze_wallet({ wallet_pubkey: "ed25519:<hex>" })`, 30 Tgas, no deposit; `unfreeze_wallet` the same. The spike wallet's freeze is tx `848cXteg2spf8E8gG1BUNDa2LT91wiBX2L2qwAA1Whu7` (signer `lin1er.testnet`, `FINAL`, `SuccessValue`), found by scanning the blocks around the policy's `updated_at` (the explorer API had not indexed the account). So #14's "tx link for the freeze" is possible.
- **Setting a policy** = (1) `POST /wallet/v1/encrypt-policy` with the agent key → `encrypted_base64`; (2) `POST /wallet/v1/sign-policy { encrypted_data, caller: <owner> }` with the agent key → `signature_hex`; (3) view `estimate_wallet_policy_cost` for the deposit; (4) the owner signs `store_wallet_policy({ wallet_pubkey, encrypted_data, wallet_signature })`, 100 Tgas. Steps 1 and 2 return `200` for the demo wallet (5 Nov); steps 3 and 4 are not run yet.
- So the app can build every owner transaction itself (the backend holds the agent key; the owner signs in our FE with Meteor) and the `handoff_url`, which carries the key, never has to leave the backend. Owners can still use `https://app.outlayer.ai/wallet/manage`: it lists wallets by the signed-in owner, no key needed.

## Demo wallet (5 Nov)

A fresh wallet replaces the spike wallet, whose key showed in a screenshot. Wallet `0fdc9294…d04e7a` (owner `lin1er.testnet`, 1 NEAR), sub-wallet `skill-payments` `e8179130…8f8b8a`, policy v2 (read back from `GET /wallet/v1/policy`: limit 0.05 NEAR, whitelist = the sub-wallet + `lin1er.testnet`, `transfer` only, `authorized_key_hashes` = this wallet's key). Checked on testnet:

| Call | Result |
|---|---|
| 0.01 NEAR to `lin1er.testnet` | ✅ `success` at once, tx `GQ9qH3WDwcz11ruYW8XjnMN5vckd3Uf2cRv3Y4t2h3t4` |
| 0.2 NEAR to `lin1er.testnet` | ✅ `403 policy_denied` "Per-transaction limit exceeded" |
| 0.01 NEAR to `hellonear-registry.testnet` | ✅ `403 policy_denied` "not in whitelist" |
| `call` to `lin1er.testnet` | ✅ `403 policy_denied` "Transaction type 'call' is not allowed" |

The spike wallet's balance was moved back to the owner in 0.05 NEAR transfers (the only way its policy allows), leaving 0.03 NEAR.

## Rerun with a new wallet (owner steps)

Done on 4 Nov (results above). To repeat it, e.g. for a fresh demo wallet with policy v2: `register`, fund the wallet from the owner's Meteor account, open the handoff link without printing it (`xdg-open "$(grep '^OUTLAYER_HANDOFF_URL=' apps/be/.env | cut -d= -f2-)"`), switch the dashboard to testnet, connect Meteor, paste policy v2 with the new key hash and the owner's whitelist, then run the `transfer` / `call` checks from "Policy v2".

## Run

```sh
cd apps/be
node --env-file=.env --import tsx spikes/01-outlayer/run.ts            # lists the commands
```

Commands: `register`, `status [sub]`, `transfer <to> <near> [sub]`, `subwallet <seed>`, `requests`, `pending`.

## Not covered

Multisig approvals, sub-wallet revocation (`DELETE /wallet/v1/api-key/{hash}`), connector calls, mainnet. Intents routes are mainnet-only and out of scope.
