# Swarm round rules

A **round** is one group purchase. Buyer agents pool their demand for one item. Seller agents compete in a sealed-bid auction to fill it. Every rule below is enforced by the contract in `src/lib.rs`, and each one has a test.

Every agent is its own NEAR account, a sub-account of one parent (`buyer-7.swarm.testnet`, `seller-3.swarm.testnet`), so every action on chain traces back to one agent.

## Phases

| Phase | Who acts | What they can do |
|---|---|---|
| `Open` | the organizer opened it | buyers `join`, sellers `commit` |
| `Reveal` | the organizer moved it on | sellers `reveal`; no new joins or commits |
| `Closed` | the organizer closed it | nobody; payouts are credited |
| `Cancelled` | anyone, once the deadline passed and the round is not closed | buyers' escrow credited back in full |

1. **Open.** Anyone can `open_round(item, max_price_per_unit, deadline_minutes)` and becomes its organizer. `max_price_per_unit` (yoctoNEAR) is the group's ceiling: no buyer pays more than this per unit, and asks above it lose. The deadline is between 1 and 10,080 minutes (7 days).
2. **Join (buyers).** `join(round_id, units)` with a deposit of at least `units × max_price_per_unit` (the escrow) plus the storage the entry uses. The excess is refunded at once. One entry per buyer per round, 1 to 1,000 units, at most 100 buyers per round.
3. **Commit (sellers).** `commit(round_id, commitment)` where `commitment` is the lowercase hex SHA-256 of the UTF-8 string `"<ask_per_unit_yocto>|<capacity>|<salt>"`, for example `sha256("2000000000000000000000|10|k3y")`. The deposit covers storage only. One commit per seller per round, at most 50 sellers per round. A buyer cannot also sell in the same round. Nobody, the organizer included, can see the ask before the reveal.
4. **Reveal.** The organizer calls `start_reveal(round_id)`. Each seller calls `reveal(round_id, ask_per_unit, capacity, salt)`. The contract hashes the same string and must get the commitment back. A seller who never reveals is ignored. Capacity is 1 to 100,000 units.
5. **Close.** The organizer calls `close_round(round_id)`, and the contract settles:
   - **Demand** `D` is the sum of every buyer's units.
   - **Valid asks** are the revealed asks with `ask_per_unit ≤ max_price_per_unit`. They are sorted cheapest first; equal asks keep commit order (earlier commit first).
   - Sellers are accepted in that order until their capacity covers `D`. The last accepted seller may sell only part of its capacity.
   - **Clearing price** `P` is the ask of the last accepted seller, one uniform price per unit for everyone. Cheaper sellers earn more than they asked; nobody pays more than the ceiling.
   - **Filled units** `F = min(D, total capacity of the valid asks)`.
   - **Supply below demand: partial fill in join order.** Buyers are filled in the order they joined, each up to its units, until `F` runs out. A late joiner may get fewer units, or none.
   - Each buyer pays `filled_units × P`, and the rest of its escrow is refunded. Each accepted seller is paid `sold_units × P`. What buyers pay equals what sellers are paid, to the yoctoNEAR.
   - With no valid ask, nothing is filled and every buyer gets its whole escrow back.
6. **Payouts are pulled, not pushed.** Closing only credits balances. Each account then calls `withdraw()` to receive its balance. Its balance is set to zero before the transfer. If the transfer fails, a private callback puts the balance back and never panics. One failing account can therefore never block a round.
7. **Deadline.** If the round is not closed by its deadline, anyone can call `cancel_round(round_id)`. Every buyer's escrow is credited back, and sellers get nothing. An organizer who disappears cannot lock anyone's NEAR.
8. **Storage** for an entry or a commit is paid by whoever makes it and is not refunded. Rounds stay readable as history.

## One round

```text
Organizer        Buyers (b1..bN)          Sellers (s1..sM)          Contract
    | open_round(item, ceiling, deadline) ------------------------------>| Open, round_opened
    |                 | join(units) + escrow ------------------------>| buyer_joined
    |                 |                       | commit(sha256(ask|cap|salt)) ->| seller_committed
    | start_reveal ------------------------------------------------------>| Reveal
    |                 |                       | reveal(ask, cap, salt) ->| hash matches? seller_revealed
    | close_round ------------------------------------------------------->| sort asks, fill D, price P
    |                 |                       |                       | credit buyers refunds, sellers sales
    |                 |                       |                       | round_closed {P, fills}
    |                 | withdraw() ---------------------------------->| transfer balance
    |                 |                       | withdraw() ----------->| transfer balance
```

## Worked example

Ceiling 3 NEAR per unit. Buyers: b1 wants 4 units, b2 wants 3, so `D = 7`. Sellers reveal:

- s1: 2 NEAR per unit, capacity 5;
- s2: 2.5 NEAR per unit, capacity 5;
- s3: 4 NEAR per unit, above the ceiling, so it loses;
- s4 committed but never revealed, so it is ignored.

s1 fills 5 units and s2 fills the remaining 2, so `P = 2.5`. b1 pays 10 NEAR and gets 2 back from its 12 of escrow. b2 pays 7.5 and gets 1.5 back from 9. s1 is paid 12.5, and s2 is paid 5. The test `worked_example_from_rules` checks exactly these numbers.
