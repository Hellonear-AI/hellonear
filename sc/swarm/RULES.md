# Swarm round rules

A **round** is one group purchase. Buyer agents pool their demand for one item. Seller agents compete in a sealed-bid auction to fill it. Every rule below is enforced by the contract in `src/lib.rs`, and each one has a test.

Every agent is its own NEAR account, a sub-account of one parent (`buyer-7.swarm.testnet`, `seller-3.swarm.testnet`), so every action on chain traces back to one agent.

## Timeline, fixed when the round opens

The organizer sets the timeline in `open_round` and nobody can change it afterwards. After the open, every step is open to **anyone** at its time, so the organizer has no power over when the reveal starts or when the round closes. This change came from the 13 Nov audit, findings 2 and 7.

| Window | When | What can happen |
|---|---|---|
| commit | from the open until `commit_end_ns` | buyers `join`, sellers `commit` |
| reveal | from `commit_end_ns` until `reveal_end_ns` | sellers `reveal`; no new joins or commits |
| closable | from `reveal_end_ns`, or earlier once every committed seller has revealed | **anyone** calls `close_round` |
| cancellable | 60 minutes after `reveal_end_ns`, only if still not closed | **anyone** calls `cancel_round` |

The view `stage(round_id)` answers `commit`, `reveal`, `closable`, `closed` or `cancelled`. Times are nanoseconds, sent as strings (`U64`) so JavaScript clients keep full precision.

1. **Open.** Anyone can call `open_round(item, max_price_per_unit, seller_bond, commit_minutes, reveal_minutes)` and becomes its organizer.
   - `max_price_per_unit` (yoctoNEAR) is the group's ceiling. No buyer pays more than this per unit, and asks above it lose.
   - `seller_bond` is between 0.01 and 100 NEAR.
   - `commit_minutes` is 1 to 10,080 (7 days), and `reveal_minutes` is 1 to 1,440 (1 day).
   - The deposit covers the round's storage, including room for its clearing price.
2. **Join (buyers).** `join(round_id, units)` during the commit window.
   - The deposit is at least `units × max_price_per_unit` (the escrow) plus the storage the entry and the buyer's balance entry use. The excess is refunded at once.
   - One entry per buyer per round, 1 to 1,000 units, at most 100 buyers per round.
3. **Commit (sellers).** `commit(round_id, commitment)` during the commit window, with a deposit of **the round's `seller_bond`** plus storage (including room for its reveal and its balance entry).
   - `commitment` is the lowercase hex SHA-256 of the UTF-8 string `"<round_id>|<seller account>|<ask_per_unit_yocto>|<capacity>|<salt>"`, with a salt of 16 to 64 characters.
   - The round and the account are part of the hash, so a commitment cannot be copied by another seller or reused in another round. The 16-character minimum salt keeps realistic asks from being brute-forced before the reveal (audit finding 6).
   - One commit per seller per round, at most 50 sellers per round. A buyer cannot also sell in the same round. Nobody, the organizer included, can see the ask before the reveal.
4. **Reveal.** During the reveal window each seller calls `reveal(round_id, ask_per_unit, capacity, salt)`.
   - The contract hashes the same string and must get the commitment back. Capacity is 1 to 100,000 units.
   - **The bond is credited back at once.**
5. **The bond (audit findings 3 and 4).** A seller who never reveals **loses its bond to the round's buyers**, split by units. The rounding dust goes to the first buyer, and with no buyer it goes to the organizer.
   - Revealing selectively from several accounts now costs one bond per hidden ask.
   - So does filling the 50 seller slots with junk.
6. **Close.** Anyone calls `close_round(round_id)` once the round is closable, and the contract settles:
   - **Demand** `D` is the sum of every buyer's units.
   - **Valid asks** are the revealed asks with `ask_per_unit ≤ max_price_per_unit`. They are sorted cheapest first; equal asks keep commit order (earlier commit first).
   - Sellers are accepted in that order until their capacity covers `D`. The last accepted seller may sell only part of its capacity.
   - **Clearing price** `P` is the ask of the last accepted seller, one uniform price per unit for everyone. Cheaper sellers earn more than they asked; nobody pays more than the ceiling.
   - **Filled units** `F = min(D, total capacity of the valid asks)`.
   - **Supply below demand: partial fill in join order.** Buyers are filled in the order they joined, each up to its units, until `F` runs out. A late joiner may get fewer units, or none.
   - Each buyer pays `filled_units × P`, and the rest of its escrow is refunded, plus its share of forfeited bonds. Each accepted seller is paid `sold_units × P`. What buyers pay equals what sellers are paid, to the yoctoNEAR.
   - With no valid ask, nothing is filled and every buyer gets its whole escrow back.
   - The `round_closed` event is a fixed-size summary: price, demand, filled, counts, forfeited and who closed. Per-account results are in `get_round`. Listing every account went over NEAR's 16 KiB log cap in a full round, so a full round could never close (audit finding 1).
7. **Payouts are pulled, not pushed.** Closing only credits balances. Each account then calls `withdraw()` with exactly 1 yoctoNEAR, so only a full-access key can call it.
   - The balance is set to zero before the transfer.
   - If the transfer fails, a private callback puts the balance back and never panics.
   - One failing account can therefore never block a round.
8. **Cancel.** A round nobody closed within 60 minutes after its reveal window can be cancelled by anyone with `cancel_round(round_id)`. Every buyer's escrow is credited back, and unrevealed bonds are shared out as on a close. An organizer who disappears cannot lock anyone's NEAR.
9. **Storage is paid by whoever adds it** and is not refunded. This covers growth that happens later: the reveal fields, the clearing price, and every balance entry, which is created at open, join or commit and only updated after that.
   - The contract never pays storage out of its own balance or out of escrow (audit finding 5).
   - The sandbox tests check that its free balance never drops.
   - Rounds stay readable as history.

## One round

```text
Organizer        Buyers (b1..bN)          Sellers (s1..sM)               Contract
    | open_round(item, ceiling, bond, commit_min, reveal_min) ------------->| round_opened {commit_end, reveal_end}
    |                 | join(units) + escrow --------------------------------->| buyer_joined
    |                 |                       | commit(sha256(id|me|ask|cap|salt)) + bond ->| seller_committed
    |                 |              ... commit_end passes ...                  |
    |                 |                       | reveal(ask, cap, salt) --------->| hash matches? bond credited back, seller_revealed
    |                 |              ... reveal_end passes (or all revealed) ...|
    |  anyone: close_round ---------------------------------------------------->| sort asks, fill D, price P
    |                 |                       |                                | credit refunds + bond shares, sales
    |                 |                       |                                | round_closed {P, D, F, counts}
    |                 | withdraw() + 1 yocto ---------------------------------->| transfer balance
    |                 |                       | withdraw() + 1 yocto ----------->| transfer balance
```

## Worked example

Ceiling 3 NEAR per unit, bond 0.1 NEAR. Buyers: b1 wants 4 units, b2 wants 3, so `D = 7`. Sellers reveal:

- s1: 2 NEAR per unit, capacity 5;
- s2: 2.5 NEAR per unit, capacity 5;
- s3: 4 NEAR per unit, above the ceiling, so it loses but gets its bond back;
- s4 committed but never revealed, so its ask is ignored and its 0.1 NEAR bond goes to the buyers.

s1 fills 5 units and s2 fills the remaining 2, so `P = 2.5`.

| Account | Escrow or bond in | Pays or earns | Gets back |
|---|---|---|---|
| b1 | 12 NEAR escrow | pays 10 NEAR | 2 NEAR refund + 4/7 of s4's bond (plus the dust) |
| b2 | 9 NEAR escrow | pays 7.5 NEAR | 1.5 NEAR refund + 3/7 of s4's bond |
| s1 | 0.1 NEAR bond | earns 12.5 NEAR | bond back on reveal |
| s2 | 0.1 NEAR bond | earns 5 NEAR | bond back on reveal |
| s3 | 0.1 NEAR bond | earns nothing | bond back on reveal |
| s4 | 0.1 NEAR bond | earns nothing | loses its bond |

The unit test `full_round_on_the_contract` and the sandbox test `test_round` check exactly these numbers.
