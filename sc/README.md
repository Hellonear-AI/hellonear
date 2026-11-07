# sc — Mind registry contract

Records Mind ↔ owner ↔ wallet ↔ skills on NEAR (#12). No custody logic: a Mind's wallet lives in OutLayer; this contract only stores its address.

**Owner:** Axel · Context: `research.md` 8.3 · Scaffolded with `cargo near new` (official template).

## Interface

| Method | Kind | Notes |
|---|---|---|
| `new()` | init | Call in the **same transaction as the deploy** so nobody can front-run initialization |
| `migrate(skill_ids)` | private init | Upgrades v0.1.0 state to versioned records; only the contract account can call it (see below) |
| `register_mind(mind_id, metadata_uri, wallet)` | payable | Owner = caller. Attach NEAR for storage; excess refunded. Max 100 Minds per account |
| `publish_skill(skill_id, metadata_uri, price: U128)` | payable | Publisher = caller. `price` in yoctoNEAR (`"0"` = free); it cannot be changed later |
| `equip_skill(mind_id, skill_id)` | payable | Owner only; skill must be published; max 32 skills per Mind. Attach `price` + storage: the price goes to the publisher, the excess is refunded; equipping again after an unequip pays again (#56). The sandbox test attaches price + 0.01 NEAR and 30 Tgas (5.6 Tgas burnt) |
| `on_skill_paid(…)` | private callback | Refunds the owner if the transfer to the publisher fails (e.g. the account was deleted); never panics |
| `unequip_skill(mind_id, skill_id)` | 1 yoctoNEAR | Owner only; freed storage refunded |
| `set_wallet(mind_id, wallet)` | ≥ 1 yoctoNEAR | Owner only; pays extra storage if the address is longer |
| `get_mind`, `get_skill`, `minds_of(owner, from_index?, limit?)`, `total_minds` | view | `minds_of` returns at most 50 per call |

Events (NEP-297, standard `hellonear_registry` v1.1.0): `mind_registered`, `skill_published`, `skill_equipped` (`mind_id`, `skill_id`, `price`, `publisher`; price and publisher added in 1.1.0), `skill_payment_refunded` (`mind_id`, `skill_id`, `payer`, `price`), `skill_unequipped`, `wallet_set`.

## Build and test

```sh
cargo near build non-reproducible-wasm     # target/near/hellonear_mind_registry.wasm (~193 KB)
cargo test --lib                           # 17 unit tests
cargo test --test test_registry            # deploys the WASM to a local NEAR sandbox and runs real transactions, incl. publisher payment and refund
cargo test --test test_migration           # upgrades from v0.1.0 (+ migrate) and from v0.2.0 (code only), checks nothing is lost
cargo clippy --all-targets
```

Set `CARGO_BUILD_JOBS=4` on laptops to keep builds cool.

## Upgrades and state versioning

Follows [Updating Contracts](https://docs.near.org/smart-contracts/release/upgrade) and the official [`enum-updates`](https://github.com/near-examples/update-migrate-rust/tree/main/enum-updates) example:

- Every stored Mind and Skill is a versioned enum (`src/versioned.rs`). To change a record, add a `V2` variant and convert old variants when reading; existing records keep working without a full rewrite.
- A change to the **top-level** contract struct needs a migration: keep the old layout as a struct (like `ContractV0_1` in `src/migrate.rs`), add a `#[private] #[init(ignore_state)] migrate`, deploy and call it **in the same transaction**, and add a sandbox test that upgrades from the previous WASM (keep it in `tests/fixtures/`).
- Storage prefixes in `StorageKey` are append-only.
- Upgrades are possible because the account keeps a full-access key (Axel's keychain). Removing every full-access key would lock the code ([docs](https://docs.near.org/smart-contracts/release/upgrade)); not planned during the hackathon.

v0.2.0 → v0.3.0 upgrade (#56): the state layout did not change, so it is a code-only deploy (no init call; `test_migration` covers it from the exact v0.2.0 WASM). Deployed 7 Nov 2026 (see below).

```sh
cargo near deploy build-non-reproducible-wasm hellonear-registry.testnet without-init-call network-config testnet sign-with-keychain send
```

v0.1.0 → v0.2.0 upgrade (skills from the `skill_published` events):

```sh
cargo near deploy build-non-reproducible-wasm hellonear-registry.testnet with-init-call migrate json-args '{"skill_ids":["pay"]}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

## Source verification

Not verified yet: the testnet deploy used a non-reproducible build, so `contract_source_metadata.build_info` is `null`. Per [Production Builds](https://docs.near.org/smart-contracts/anatomy/reduce-size) and the [SourceScan guide](https://github.com/SourceScan/verification-guide), verification needs a **reproducible build** (`cargo near deploy build-reproducible-wasm …`, Docker/OrbStack, all changes committed and pushed) from a **public** repository, then **Verify and Publish** on the NearBlocks contract page. Do this once the repo is public (#22).

## Deploy (testnet)

```sh
cargo near deploy build-non-reproducible-wasm <account>.testnet with-init-call new json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

**Deployed (testnet): `hellonear-registry.testnet`, now v0.3.0**

Upgrade v0.2.0 → v0.3.0 (7 Nov 2026, from `main` at `7b713d1`):
- Code-only deploy, no init call: [`ESMY36Uo…`](https://explorer.testnet.near.org/transactions/ESMY36UoFcdWuw5fbShbNx13Fvf2NB1z1qWWypJNyCwp). Before it, `cargo test` passed locally (17 unit, 2 registry sandbox, 2 migration incl. v0.2.0 → current).
- On-chain `code_hash` `D4N7PhEuY7JZQp3yjiAnCoJcFc8sLY6ahZN794qy4JKr` = SHA-256 (base58) of the local WASM; `contract_source_metadata.version` 0.3.0.
- After the upgrade, `total_minds` is still 1 and `get_mind("penny-demo")`, `get_skill("pay")` read back unchanged.
- Write round-trip: `unequip_skill` then `equip_skill` of the free skill `pay` on `penny-demo` ([`HK7wDgyV…`](https://explorer.testnet.near.org/transactions/HK7wDgyVvpxf15gWEZTypDdM6xVdr32MQ1m2U7J3ACf7)); both emit `hellonear_registry` 1.1.0, `skill_equipped` carries `price` "0" and `publisher`; state back to the same.
- Not proven on testnet yet: a **paid** equip (no paid skill is published there). The sandbox test covers it.


Upgrade v0.1.0 → v0.2.0 (3 Nov 2026, from `main` at `8a81f6a`):
- Deploy + `migrate {"skill_ids":["pay"]}` in one transaction: [`3nuc3u4a…`](https://explorer.testnet.near.org/transactions/3nuc3u4aKMH8XLq1NDF4DuMivQ2R6UbowUgJ3zjzAhss), event `state_migrated` (minds 1, skills 1).
- On-chain `code_hash` `4u2JFQFEMSKtTy9XZ4GQVQtxzyRRSYjQboiotf76R3or` = SHA-256 (base58) of the v0.2.0 WASM built from that commit; `contract_source_metadata.version` 0.2.0.
- `get_mind`, `get_skill`, `minds_of`, `total_minds` identical before and after (snapshot over testnet RPC).
- Write round-trip after the upgrade: `unequip_skill` ([`4ViBEJ6N…`](https://explorer.testnet.near.org/transactions/4ViBEJ6Nxpoe2kz9YWLTFLPMKc26DrRZ3DaTXXgHVCBc)) then `equip_skill` ([`6diDXaAY…`](https://explorer.testnet.near.org/transactions/6diDXaAYmT8pMtVemsv4xtmzSE8DW7WM5Uprim6aU2a5)); state back to the same.

First deploy, v0.1.0 (3 Nov 2026):

- Deploy + `new` init in one transaction: [`ALEtdSpw…`](https://explorer.testnet.near.org/transactions/ALEtdSpwWYJyw63dZPKPBUKvk3tEqrJe2GycEZMjEn2x)
- On-chain `code_hash` `7Xp6eabRy8NTfAdg3WMfuWpMpoQgZSxLewTudwCouwV9` = SHA-256 (base58) of the tested WASM.
- Smoke test on testnet: `publish_skill` "pay" ([`EyGivqUT…`](https://explorer.testnet.near.org/transactions/EyGivqUTDcwDPtDVRAKBc5nVG7cWafXYFxLca8F5y7fe)), `register_mind` "penny-demo" ([`uEHrkTvu…`](https://explorer.testnet.near.org/transactions/uEHrkTvuGyE3kRaPAVMs2VHuekvZEuHPQprMGYRYjM3)), `equip_skill` ([`DB85q43g…`](https://explorer.testnet.near.org/transactions/DB85q43gveaA2HvNujhftw9bguSWN9WtKa3wYYPbM4A3)), each with its NEP-297 event; `unequip_skill` without 1 yoctoNEAR rejected on-chain. `penny-demo` and `pay` stay as demo data.
- The account's full-access key is in Axel's macOS keychain only; redeploys go through Axel.
