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

**Deployed (testnet, 3 Nov 2026): `hellonear-registry.testnet`**

- Deploy + `new` init in one transaction: [`ALEtdSpw…`](https://explorer.testnet.near.org/transactions/ALEtdSpwWYJyw63dZPKPBUKvk3tEqrJe2GycEZMjEn2x)
- On-chain `code_hash` `7Xp6eabRy8NTfAdg3WMfuWpMpoQgZSxLewTudwCouwV9` = SHA-256 (base58) of the tested WASM.
- Smoke test on testnet: `publish_skill` "pay" ([`EyGivqUT…`](https://explorer.testnet.near.org/transactions/EyGivqUTDcwDPtDVRAKBc5nVG7cWafXYFxLca8F5y7fe)), `register_mind` "penny-demo" ([`uEHrkTvu…`](https://explorer.testnet.near.org/transactions/uEHrkTvuGyE3kRaPAVMs2VHuekvZEuHPQprMGYRYjM3)), `equip_skill` ([`DB85q43g…`](https://explorer.testnet.near.org/transactions/DB85q43gveaA2HvNujhftw9bguSWN9WtKa3wYYPbM4A3)), each with its NEP-297 event; `unequip_skill` without 1 yoctoNEAR rejected on-chain. `penny-demo` and `pay` stay as demo data.
- The account's full-access key is in Axel's macOS keychain only; redeploys go through Axel.
