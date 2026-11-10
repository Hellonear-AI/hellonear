---
name: spending-audit
description: Use when the owner asks for a spending audit or a weekly spending report, wants to review what this Mind paid this week, or asks which payments the wallet policy refused.
metadata:
  hellonear:
    tools: [get_balance, list_payments, get_time, add_numbers]
    connections: [near-wallet]
    status: available
    title: Spending audit
    blurb: reviews a week of payments, with tx links for those sent and reasons for those refused; it only reads
    note: Read only (#184). Refused payments come from list_payments (the backend stores every attempt, policy_denied and wallet_frozen included). Not scheduled yet; Autopilot runs carry no wallet token.
---

# Spending audit

1. Call `get_time`, `get_balance` and `list_payments` (limit 50). The week is the 7 days before `get_time`'s `utc`; use each payment's `at`. If all 50 payments fall inside the week, say older ones from the week may be missing.
2. Write the audit in this order:
   - **Balance:** `balanceNear` NEAR.
   - **Paid:** one line per `sent` payment: date, recipient, amount, and a link `https://testnet.nearblocks.io/txns/<txHash>`. Then the total, added with `add_numbers` one pair at a time.
   - **Refused by the wallet policy:** one line per `policy_denied` or `wallet_frozen` payment: date, recipient, amount and the reason from its `message`. Say once that these were refused before signing, so there is no transaction and no tx link. Never call them "rejected on-chain".
   - **Pending or failed:** one line each with its `message`, and no tx link unless it has a `txHash`.
3. Then at most three short observations, only from the data: a recipient paid many times, several refusals to the same account, an account that looks like another with one character changed. If refusals look like someone trying to move money, say the owner can press **Freeze wallet** on the Wallet screen; you cannot freeze it yourself.
4. Write "none" for an empty section. Never invent a payment, a reason or a tx hash, and never give a dollar price for testnet NEAR.
5. This skill only reads; it never pays.
6. If a tool says this Mind has no wallet yet, tell the owner to create one on the Wallet screen.
