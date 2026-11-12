---
name: best-price
description: 'Use when the owner asks for the best price, the cheapest seller, or to compare sellers before buying a NEAR testnet data report (network status or gas price).'
metadata:
  hellonear:
    tools: [get_quotes, make_offer, buy_data, send_payment, list_payments, get_time]
    connections: [near-wallet]
    status: available
    title: Best price buyer
    blurb: compares every seller of a data report, haggles once when you set a budget, and buys the cheapest one your wallet may pay, after you approve
    note: Asks every seller of the paid-data shop for a quote (#176), shows the owner the comparison and pays the cheapest seller on the wallet's address list with send_payment, which waits for the owner's approval. Sellers come from the backend's SHOP_SELLERS; a seller off the wallet's list is refused by the wallet policy before signing. With a budget it makes one offer (make_offer), the seller accepts or counters once, then the Mind buys or walks away. Not NEAR Intents.
---

# Best price buyer

1. Call `get_quotes` with the item first. Never guess a seller, a price or an account; they only come from `get_quotes` and `buy_data`.
2. **Write nothing until your tool calls are done.** A reply that says what you are about to do ends your turn, and the step never happens (13 Nov: "I'll make s1 one offer at your limit", then nothing). So go straight on to the next tool call; the owner sees each step as it runs. In your reply, once (when the approval card is waiting, or at the end), give a short comparison, one line per seller, cheapest first: seller id, price in NEAR, and "your wallet can pay" or "not on your wallet's list", and which one you chose: `cheapestOnYourList`.
3. If `cheapestOnYourList` is null, no seller can be paid: say the owner would have to add a seller's account to the wallet's address list (a policy change they sign themselves), and stop. Never pay a seller with `onYourList: false`: the wallet policy refuses it before signing.
4. **Haggle once, only with a budget.** If the owner named a maximum price (a budget) in this conversation, or asked you to haggle, and the cheapest payable seller costs more than that budget:
   - Call `make_offer` right away, in the same turn as `get_quotes` and before writing anything, once, with that seller, `maxNear` set to the budget and `offerNear` set to the budget (or, when they asked to haggle with no number, about 20% under the quote, and `maxNear` the quote).
   - Follow `next` exactly, again without writing first. `buy_at_price`: buy at the returned `priceNear` (steps 5 to 7 with `offerNear` set to it). `walk_away`: buy nothing in this request, no `buy_data` and no `send_payment`; tell the owner the seller's last price and that you walked away.
   - In the reply, say in one line why you made an offer (the quote was above their budget) and what the seller answered.
   - Never make a second offer, never offer to another seller in the same request unless the owner asks, and never buy above the budget.
   Without a budget or a request to haggle, skip this and buy at the quote.
5. Call `buy_data` with the item and that `seller` (and `offerNear` when a price was agreed in step 4), without `paymentTxHash`. It returns `payment_required` with `priceNear` and `payTo`. If they differ from the quote or the agreed price, tell the owner the new price and stop.
6. Call `send_payment` with exactly that `payTo` and `priceNear`, once. It waits for the owner's approval.
7. When it comes back `sent`, call `buy_data` again with the same item, the same `seller`, the same `offerNear` (if any) and `paymentTxHash` set to its `txHash`.
8. If the payment is declined, refused by the wallet (`policy_denied`, `wallet_frozen`) or fails, say the report was not bought and no money moved for it. Say a refusal came from the wallet policy before signing; never call it "rejected on-chain" and never give a transaction link for it. Do not try another seller to get around it unless the owner asks.
9. When it is `paid`, give the report in two or three plain lines with its numbers, then one line: which seller, what was paid, how much cheaper than the dearest quote (and than its own quote, if you haggled), and the tx hash as the receipt.
10. This compares the sellers of our own testnet shop. Do not call it NEAR Intents, a solver auction or an exchange.
11. If `send_payment` fails with an error (anything that is not a `sent`, `pending`, declined or refused result), do not call `send_payment` again in this request, for that account or any other: a new call opens an approval the owner did not ask for. Always write a reply: what was paid so far, and that the rest did not go through, with the error in plain words. The owner can ask again.
