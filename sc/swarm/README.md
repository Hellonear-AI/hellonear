# Swarm contract (`sc/swarm`)

Group buying between agents. Buyer agents pool their demand for one item. Seller agents compete in a **sealed-bid round** (commit, then reveal) to fill it at one uniform clearing price. Settlement happens on NEAR. Every agent is its own **sub-account** of one parent, so every action on chain traces back to one agent.

- The rules come first and are fixed: [RULES.md](RULES.md), with a sequence diagram of one round and a worked example.
- The simulation runs 20 buyers and 5 sellers with scripted strategies and **no LLM calls**. Each run writes [simulation-report.md](simulation-report.md); the committed copy is a sample run.
- Status: **local sandbox only**. Not deployed to testnet yet. The commands for that are below; they need Axel's keychain.

## Interface

| Method | Kind | Who | Notes |
|---|---|---|---|
| `new()` | init | deployer | |
| `open_round(item, max_price_per_unit, deadline_minutes) -> u64` | payable | anyone, who becomes organizer | Deposit covers storage. `max_price_per_unit` is the group ceiling in yoctoNEAR |
| `join(round_id, units)` | payable | buyer | Deposit ≥ `units × max_price_per_unit` (escrow) + storage; the excess is refunded |
| `commit(round_id, commitment)` | payable | seller | `commitment` = hex SHA-256 of `"<ask_per_unit_yocto>\|<capacity>\|<salt>"`; deposit covers storage |
| `start_reveal(round_id)` | call | organizer | Ends joins and commits |
| `reveal(round_id, ask_per_unit, capacity, salt)` | call | seller | Must hash to its commitment |
| `close_round(round_id)` | call | organizer | Settles and credits refunds and sales; event `round_closed` with every fill |
| `cancel_round(round_id)` | call | anyone, after the deadline | Credits every buyer's escrow back |
| `withdraw() -> Promise` | call | anyone with a balance | Zeroes the balance, then transfers; a failed transfer is credited back by the private `on_withdrawn` |
| `get_round(round_id)`, `total_rounds()`, `balance_of(account_id)`, `commitment_for(ask_per_unit, capacity, salt)` | view | | |

Events are NEP-297: standard `hellonear_swarm`, version `1.0.0`. They are `round_opened`, `buyer_joined`, `seller_committed`, `reveal_started`, `seller_revealed`, `round_closed`, `round_cancelled`, `withdrawn` and `withdraw_failed`.

Safety choices, following the near-smart-contracts skill and the docs.near.org security pages:
- **Payouts are pulled.** Each account calls `withdraw`, so a deleted or failing account cannot block a round. The balance is zeroed before the transfer, which rules out reentrancy, and the callback never panics.
- **Limits:** at most 100 buyers and 50 sellers per round, and 1,000 units per buyer, so `close_round` gas stays bounded.
- `checked_mul` on every amount, plus `overflow-checks = true`.
- Storage is measured before and after each write and charged to the caller.
- `LookupMap` collections with append-only `StorageKey` prefixes.

## Build and test

The crate shares `../target` with the registry (`.cargo/config.toml`), so the laptop keeps one build cache.

```sh
cd sc/swarm
cargo test --lib                                   # 16 unit tests: settlement rules, phases, deposits, cancel, withdraw callback
cargo test --test test_round                       # sandbox: RULES.md's worked example with sub-accounts and real transfers
cargo test --test simulation -- --nocapture        # sandbox: 20 buyers, 5 sellers, 3 rounds; writes simulation-report.md (~2 min)
cargo clippy --all-targets
cargo near build non-reproducible-wasm             # ../target/near/hellonear_swarm.wasm
```

In the sandbox, the parent is `swarm.sandbox`. The contract lives at `auction.swarm.sandbox`. Each agent (`coordinator`, `buyer-1`…`buyer-20`, `seller-1`…`seller-5`) is made with a real `CreateAccount` transaction signed by the parent, and signs its own `join`, `commit`, `reveal` and `withdraw`.

The simulation's seller strategies:
- cost + 10%;
- cost + 25%;
- cheap with small capacity;
- a bluffer that commits and never reveals;
- an adaptive seller that undercuts the last clearing price after a round where it sold nothing.

Each buyer has a random demand of 1 to 5 units per round and joins only when the round's ceiling is within its own maximum price. After each round the test checks that buyers paid exactly what sellers earned, that `paid + refund = escrow` for every buyer, and that the price never exceeds the ceiling. At the end every agent withdraws, and the test checks that the NEAR arrived.

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

# 4. One call by hand, e.g. the coordinator opening a round (ceiling 0.05 NEAR per unit, 60 minutes)
near contract call-function as-transaction auction.hellonear-swarm.testnet open_round json-args '{"item":"gpu-hours","max_price_per_unit":"50000000000000000000000","deadline_minutes":60}' prepaid-gas '30 Tgas' attached-deposit '0.05 NEAR' sign-as coordinator.hellonear-swarm.testnet network-config testnet sign-with-keychain send
```

The simulation runs on the sandbox only. Running it against testnet would mean pointing `tests/common/mod.rs` at the testnet RPC with each agent's key from the keychain. That is not built: about 120 transactions per run would also hit faucet and RPC limits. The funding in step 2 is about 16.5 NEAR in total. The simulation spends well under 0.5 NEAR per buyer.
