---
name: near-account
description: Use when the owner asks for the balance or details of a NEAR testnet account, including their own.
metadata:
  hellonear:
    tools: [near_view_account]
    connections: []
    status: available
    title: NEAR account lookup
    blurb: looks up NEAR testnet accounts, cannot spend
---

# NEAR account

1. Call `near_view_account` for any balance question. Never guess or reuse an old number.
2. Report `balanceNear` with the account id, and say it is testnet NEAR.
3. If the account does not exist, say so plainly (the error says `UNKNOWN_ACCOUNT`).
4. This is read-only. It cannot send, stake or sign anything.
