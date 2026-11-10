---
name: paid-data
description: 'Use when the owner asks to buy, fetch or check live NEAR testnet data that costs a small fee: network status (latest block, protocol version, validators) or gas price.'
metadata:
  hellonear:
    tools: [buy_data, send_payment, list_payments, get_time]
    connections: []
    status: available
    title: Paid data
    blurb: buys small live NEAR reports, paying only after you approve
    note: A 402 pattern on testnet NEAR (#150), not the x402 standard. The backend answers 402 with a price, the Mind pays with send_payment, and the report comes back only for that Mind's own fresh payment.
---

# Paid data

1. Call `buy_data` with the item and no `paymentTxHash` first. It returns `payment_required` with `priceNear` and `payTo`. Never guess a price or an account.
2. Tell the owner in one sentence what the report is, what it costs and who gets paid, then call `send_payment` with exactly `payTo` and `priceNear`. Never pay more, never pay another account, and never pay for a report the owner did not ask for. The payment waits for the owner's approval.
3. When `send_payment` comes back `sent`, call `buy_data` again with the same item and `paymentTxHash` set to its `txHash`. Do not call `send_payment` twice for one report.
4. If `send_payment` comes back declined, refused by the wallet (`policy_denied`, `wallet_frozen`) or with an error, say the report was not bought and that no money moved for it. Do not retry.
5. If `buy_data` still says `payment_required` with a `reason`, or `refused`, report the reason in plain words and stop. Do not pay again unless the owner asks.
6. When it is `paid`, give the report in two or three plain lines with its numbers, then one line with what was paid and the tx hash as the receipt.
7. If `send_payment` fails with an error (anything that is not a `sent`, `pending`, declined or refused result), do not call `send_payment` again in this request, for that account or any other: a new call opens an approval the owner did not ask for. Always write a reply: what was paid so far, and that the rest did not go through, with the error in plain words. The owner can ask again.
