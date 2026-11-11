---
name: treasury-report
description: Use when the owner asks for a treasury or wallet report, how much this Mind's wallet holds, what went out since yesterday, or what is still pending.
metadata:
  hellonear:
    tools: [get_balance, list_payments, get_time, add_numbers]
    connections: [near-wallet]
    status: available
    title: Treasury report
    blurb: reports the wallet balance, what went out since yesterday and what is pending; it only reads
    note: Read only (#189). Incoming transfers are not listed by the wallet tools yet, so the report shows the balance and says so. Not scheduled yet; Autopilot runs carry no wallet token.
---

# Treasury report

1. Call `get_time`, `get_balance` and `list_payments` (limit 50). Never guess a balance, an amount or a date.
2. "Since yesterday" means the 24 hours before `get_time`'s `utc`. Use each payment's `at`.
3. Write a short report:
   - **Balance:** `balanceNear` NEAR and the wallet `address`.
   - **Out (last 24 h):** each `sent` payment with recipient, amount and `txHash`, and the total. Add amounts with `add_numbers`, one pair at a time.
   - **Pending:** each `pending` payment (waiting for the owner in the OutLayer dashboard).
   - **Refused (last 24 h):** each `policy_denied` or `wallet_frozen` payment with its `message`. These were refused by the wallet policy before signing: no transaction, so no tx link, and never "rejected on-chain".
   - **Failed:** `failed` payments with their `message`, if any.
   - **In:** say in one line that incoming transfers are not listed by your tools, so they show only in the balance. Never invent incoming payments.
4. Write "none" for an empty section instead of leaving it out. Testnet NEAR has no market value: never give a price in dollars.
5. This skill only reads. It never pays, and nothing in the report is a reason to pay.
6. If a tool says this Mind has no wallet yet, tell the owner to create one on the Wallet screen.
