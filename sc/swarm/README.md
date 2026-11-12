# Swarm contract (`sc/swarm`)

Group buying between agents. Buyer agents pool their demand for one item. Seller agents compete in a **sealed-bid round** (commit, then reveal) to fill it at one uniform clearing price. Settlement happens on NEAR. Every agent is its own **sub-account** of one parent, so every action on chain traces back to one agent.

- The rules come first and are fixed: [RULES.md](RULES.md), with a sequence diagram of one round and a worked example.
- The simulation runs 20 buyers and 5 sellers with scripted strategies and **no LLM calls**. Each run writes [simulation-report.md](simulation-report.md); the committed copy is a sample run.
- Status: **local sandbox only**. Not deployed to testnet yet. The commands for that are below; they need Axel's keychain.

## Interface

| Method | Kind | Who | Notes |
|---|---|---|---|
| `new()` | init | deployer | |
| `open_round(item, max_price_per_unit, seller_bond, commit_minutes, reveal_minutes) -> u64` | payable | anyone, who becomes organizer | Fixes the whole timeline. The deposit covers storage. `max_price_per_unit` is the group ceiling in yoctoNEAR. `seller_bond` is 0.01 to 100 NEAR |
| `join(round_id, units)` | payable | buyer, during the commit window | Deposit ≥ `units × max_price_per_unit` (escrow) + storage; the excess is refunded |
| `commit(round_id, commitment)` | payable | seller, during the commit window | Deposit = `seller_bond` + storage. `commitment` = hex SHA-256 of `"<round_id>\|<seller>\|<ask_per_unit_yocto>\|<capacity>\|<salt>"`, salt 16 to 64 characters |
| `reveal(round_id, ask_per_unit, capacity, salt)` | call | seller, during the reveal window | Must hash to its commitment; the bond is credited back |
| `close_round(round_id)` | call | **anyone**, after the reveal window or once every seller revealed | Settles, shares unrevealed bonds out to the buyers by units, credits every payout; `round_closed` is a fixed-size summary |
| `cancel_round(round_id)` | call | anyone, 60 min after the reveal window if still not closed | Credits every buyer's escrow back, and shares unrevealed bonds |
| `withdraw() -> Promise` | payable, exactly 1 yocto | anyone with a balance | Zeroes the balance, then transfers; a failed transfer is credited back by the private `on_withdrawn` |
| `get_round(round_id)`, `stage(round_id)`, `total_rounds()`, `balance_of(account_id)`, `commitment_for(round_id, seller, ask_per_unit, capacity, salt)` | view | | `stage` returns `commit`, `reveal`, `closable`, `closed` or `cancelled`. Times (`commit_end_ns`, `reveal_end_ns`) are `U64` strings |

Events are NEP-297: standard `hellonear_swarm`, version `2.0.0`. They are:
- `round_opened` (carries the timeline);
- `buyer_joined`;
- `seller_committed` (carries the bond);
- `seller_revealed`;
- `round_closed`: price, demand, filled, `buyers`, `sellers_sold`, `forfeited`, `closed_by`;
- `round_cancelled`;
- `withdrawn` and `withdraw_failed`.

Safety choices follow the near-smart-contracts skill, the docs.near.org security pages and the audit of 13 Nov (9 findings, all fixed):
- **No organizer timing power.** The timeline is fixed at open, and close and cancel are open to anyone at their time (findings 2 and 7).
- **Seller bond.** A seller who never reveals loses its bond to the buyers. Selective revealing from several accounts, and filling the 50 seller slots with junk, both cost real NEAR (findings 3 and 4).
- **Storage is paid by whoever adds it,** including growth that happens later: the reveal fields, the clearing price, and balance entries, which are created at open, join or commit (finding 5). `near_sdk::store` collections are flushed before the deposit is measured, because they only write at the end of a method.
  - The first version charged no storage at all because of that.
  - The sandbox tests now check that the contract's free balance never drops.
- **Commitment bound to round and seller,** with a salt of at least 16 characters (finding 6).
- **Fixed-size close event,** so a full round (100 buyers × 50 sellers, even with 64-character implicit accounts) stays far under NEAR's 16 KiB log cap (finding 1). A unit test closes exactly such a round.
- **Payouts are pulled.** Each account calls `withdraw` (1 yoctoNEAR, finding 9), so a deleted or failing account cannot block a round. The balance is zeroed before the transfer, which rules out reentrancy, and the callback never panics.
- **Limits:** at most 100 buyers and 50 sellers per round, and 1,000 units per buyer, so `close_round` gas stays bounded.
- `checked_mul` on every amount, plus `overflow-checks = true`. Times are `U64` in JSON (finding 8).
- `LookupMap` collections with append-only `StorageKey` prefixes.

## Build and test

To share the registry's build cache on a laptop, set `CARGO_TARGET_DIR=../target` for local builds and tests. It is not set in the repo: a reproducible build (`cargo near … build-reproducible-wasm`) looks for the WASM inside this crate's own `target`, and with a shared target dir the deploy stopped with "No such file or directory" after a successful build (13 Nov).

```sh
cd sc/swarm
cargo test --lib                                   # 28 unit tests: settlement, timeline, bond, commitment binding, full 100x50 round, withdraw
cargo test --test test_round                       # sandbox: RULES.md's worked example with sub-accounts, real transfers, the clock fast-forwarded
cargo test --test simulation -- --nocapture        # sandbox: 20 buyers, 5 sellers, 3 rounds; writes simulation-report.md (~4 min)
cargo clippy --all-targets
cargo near build non-reproducible-wasm             # target/near/hellonear_swarm.wasm
```

In the sandbox, the parent is `swarm.sandbox`. The contract lives at `auction.swarm.sandbox`. Each agent (`coordinator`, `buyer-1`…`buyer-20`, `seller-1`…`seller-5`) is made with a real `CreateAccount` transaction signed by the parent, and signs its own `join`, `commit`, `reveal`, `close_round` and `withdraw`. Each round has a 10-minute commit window and a 10-minute reveal window, and the tests fast-forward the sandbox clock past them (`sandbox_fast_forward`).

The simulation's seller strategies:
- cost + 10%;
- cost + 25%;
- cheap with small capacity;
- a bluffer that commits and never reveals, and loses its bond to the buyers each round;
- an adaptive seller that undercuts the last clearing price after a round where it sold nothing.

Each buyer has a random demand of 1 to 5 units per round and joins only when the round's ceiling is within its own maximum price. A different buyer closes each round, to show that the organizer has no special power. After each round the test checks:
- buyers paid exactly what sellers earned;
- `paid + refund = escrow` for every buyer;
- the forfeited bond was shared out in full;
- the price never exceeds the ceiling.

At the end every agent withdraws. The test checks that the NEAR arrived and that the contract's free balance is no lower than before the first round.

## Testnet (not done yet: needs Axel)

Creating accounts and deploying use Axel's keychain, so they are not done by an agent. Use a reproducible build so the source can be verified, as with the registry.

```sh
# 1. Parent account (faucet-funded)
near account create-account sponsor-by-faucet-service hellonear-swarm.testnet autogenerate-new-keypair save-to-keychain network-config testnet create

# 2. The contract account and one sub-account per agent, each funded by the parent
near account create-account fund-myself auction.hellonear-swarm.testnet '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as hellonear-swarm.testnet network-config testnet sign-with-keychain send
near account create-account fund-myself coordinator.hellonear-swarm.testnet '0.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as hellonear-swarm.testnet network-config testnet sign-with-keychain send
for i in $(seq 1 20); do near account create-account fund-myself buyer-$i.hellonear-swarm.testnet '0.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as hellonear-swarm.testnet network-config testnet sign-with-keychain send; done
for i in $(seq 1 5);  do near account create-account fund-myself seller-$i.hellonear-swarm.testnet '0.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as hellonear-swarm.testnet network-config testnet sign-with-keychain send; done

# 3. Deploy with the init call in the same transaction (from sc/swarm, everything committed and pushed)
cargo near deploy build-reproducible-wasm auction.hellonear-swarm.testnet with-init-call new json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

# 4. One call by hand, e.g. the coordinator opening a round (ceiling 0.05 NEAR per unit, bond 0.01 NEAR, 30 + 30 minutes)
near contract call-function as-transaction auction.hellonear-swarm.testnet open_round json-args '{"item":"gpu-hours","max_price_per_unit":"50000000000000000000000","seller_bond":"10000000000000000000000","commit_minutes":30,"reveal_minutes":30}' prepaid-gas '30 Tgas' attached-deposit '0.05 NEAR' sign-as coordinator.hellonear-swarm.testnet network-config testnet sign-with-keychain send
```

The simulation runs on the sandbox only. Running it against testnet would mean pointing `tests/common/mod.rs` at the testnet RPC with each agent's key from the keychain. That is not built: about 120 transactions per run would also hit faucet and RPC limits, and on testnet the clock can't be fast-forwarded, so each round takes its real windows. The funding in step 2 is about 16.5 NEAR in total. The simulation spends well under 0.5 NEAR per buyer.
