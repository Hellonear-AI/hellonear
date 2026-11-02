# sc — Mind registry contract

Records Mind ↔ owner ↔ wallet ↔ skills on NEAR (#12). No custody logic: a Mind's wallet lives in OutLayer; this contract only stores its address.

**Owner:** Axel · Context: `research.md` 8.3 · Scaffolded with `cargo near new` (official template).

## Interface

| Method | Kind | Notes |
|---|---|---|
| `new()` | init | Call in the **same transaction as the deploy** so nobody can front-run initialization |
| `register_mind(mind_id, metadata_uri, wallet)` | payable | Owner = caller. Attach NEAR for storage; excess refunded. Max 100 Minds per account |
| `publish_skill(skill_id, metadata_uri, price: U128)` | payable | Publisher = caller. `price` is recorded only (no payments in v1) |
| `equip_skill(mind_id, skill_id)` | payable | Owner only; skill must be published; max 32 skills per Mind |
| `unequip_skill(mind_id, skill_id)` | 1 yoctoNEAR | Owner only; freed storage refunded |
| `set_wallet(mind_id, wallet)` | ≥ 1 yoctoNEAR | Owner only; pays extra storage if the address is longer |
| `get_mind`, `get_skill`, `minds_of(owner, from_index?, limit?)`, `total_minds` | view | `minds_of` returns at most 50 per call |

Events (NEP-297, standard `hellonear_registry` v1.0.0): `mind_registered`, `skill_published`, `skill_equipped`, `skill_unequipped`, `wallet_set`.

## Build and test

```sh
cargo near build non-reproducible-wasm     # target/near/hellonear_mind_registry.wasm (~174 KB)
cargo test --lib                           # 12 unit tests
cargo test --test test_registry            # deploys the WASM to a local NEAR sandbox and runs real transactions
cargo clippy --all-targets
```

Set `CARGO_BUILD_JOBS=4` on laptops to keep builds cool.

## Deploy (testnet)

```sh
cargo near deploy build-non-reproducible-wasm <account>.testnet with-init-call new json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

Deployed account: _not deployed yet_.
