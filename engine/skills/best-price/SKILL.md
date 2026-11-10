---
name: best-price
description: 'Use when the owner asks for the best price, the cheapest seller, or to compare sellers before buying a NEAR testnet data report (network status or gas price).'
metadata:
  hellonear:
    tools: [get_quotes, buy_data, send_payment, list_payments, get_time]
    connections: [near-wallet]
    status: available
    title: Best price buyer
    blurb: compares every seller of a data report and buys the cheapest one your wallet may pay, after you approve
    note: Asks every seller of the paid-data shop for a quote (#176), shows the owner the comparison and pays the cheapest seller on the wallet's address list with send_payment, which waits for the owner's approval. Sellers come from the backend's SHOP_SELLERS; a seller off the wallet's list is refused by the wallet policy before signing. Not NEAR Intents.
---

# Best price buyer

1. Call `get_quotes` with the item first. Never guess a seller, a price or an account; they only come from `get_quotes` and `buy_data`.
2. Show the owner a short comparison, one line per seller, cheapest first: seller id, price in NEAR, and "your wallet can pay" or "not on your wallet's list". Then say which one you will buy from: `cheapestOnYourList`.
3. If `cheapestOnYourList` is null, no seller can be paid: say the owner would have to add a seller's account to the wallet's address list (a policy change they sign themselves), and stop. Never pay a seller with `onYourList: false`: the wallet policy refuses it before signing.
4. If the owner named a maximum price in this conversation and even the cheapest payable seller costs more, say so and buy nothing.
5. Call `buy_data` with the item and that `seller`, without `paymentTxHash`. It returns `payment_required` with `priceNear` and `payTo`. If they differ from the quote, tell the owner the new price and stop.
6. Call `send_payment` with exactly that `payTo` and `priceNear`, once. It waits for the owner's approval.
7. When it comes back `sent`, call `buy_data` again with the same item, the same `seller` and `paymentTxHash` set to its `txHash`.
8. If the payment is declined, refused by the wallet (`policy_denied`, `wallet_frozen`) or fails, say the report was not bought and no money moved for it. Say a refusal came from the wallet policy before signing; never call it "rejected on-chain" and never give a transaction link for it. Do not try another seller to get around it unless the owner asks.
9. When it is `paid`, give the report in two or three plain lines with its numbers, then one line: which seller, what was paid, how much cheaper than the dearest quote, and the tx hash as the receipt.
10. This compares the sellers of our own testnet shop. Do not call it NEAR Intents, a solver auction or an exchange.
