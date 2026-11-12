# CLAUDE.md — sc/

Mind registry contract: Mind ↔ owner ↔ wallet ↔ skill. Owner: Axel. Issue: #12. Plan and decisions: #3, #4.

**Update this file in the same PR whenever you change the contract interface, build/test/deploy commands, the deployed account id, or SDK versions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Rust 1.93.0 (pinned in `rust-toolchain.toml` by `cargo near new`), `near-sdk` **5.29.x**, `cargo-near` 0.22.0. `near-sdk` 5.30.0 needs rustc 1.95, so do not bump it without also bumping the toolchain (checked 3 Nov). `near-sdk-js` is community-only; do not use it.
- Use the `near-smart-contracts` and `near-contract-audit` agent skills; run the audit skill before the contract is considered done.
- Local tests: `near-sandbox` / `near-workspaces`. Deploy to **testnet** only.

## Conventions

- `#[payable]` writes with storage deposit measured via `env::storage_usage()` before/after; refund the excess.
- `assert_one_yocto()` on sensitive methods (unequip, ownership changes); `set_wallet` requires at least 1 yoctoNEAR because it may also need to pay for storage. Either way a function-call key cannot call them.
- `U128` for prices; `near_sdk::store` collections with unique `BorshStorageKey` prefixes; `#[derive(PanicOnDefault)]`; `overflow-checks = true`; paginate list views (`minds_of`).
- No custody logic here; wallets live in OutLayer.
- Payments (#56): the only NEAR the contract moves is a skill's price, from the owner to the publisher, inside `equip_skill`. Any transfer whose failure would leave NEAR in the contract needs a `#[private]` callback that refunds the payer and never panics (docs.near.org security: refunds). Keep the `skill_equipped` event fields stable: the UI reads them.
- **Deployed contract: `hellonear-registry.testnet` (testnet), v0.3.0 since 7 Nov 2026** (#56, `equip_skill` pays the publisher); redeployed from a reproducible build on 12 Nov 2026, code hash `GUxsMNJd…`, source verified on NearBlocks/SourceScan. v0.1.0 and v0.2.0 fixtures in `tests/fixtures/` for upgrade tests, each equal to the code hash that was on-chain. Env name for consumers: `REGISTRY_CONTRACT_ID` (with `NEAR_NETWORK=testnet`). Details and tx links in `README.md`. Its full-access key is only in Axel's keychain; ask Axel before any redeploy or migration.
- Deploy with the `new` init call in the same transaction (front-running protection).
- **State is versioned** (`src/versioned.rs`): never change a stored struct in place. Add a new enum variant and convert on read. Top-level layout changes need a `#[private] #[init(ignore_state)] migrate`, the old layout kept in `src/migrate.rs`, a sandbox upgrade test from the previous WASM (`tests/fixtures/`), and the deploy + migrate in one transaction. `StorageKey` is append-only. Follow https://docs.near.org/smart-contracts/release/upgrade.
- Always deploy with `cargo near deploy build-reproducible-wasm …` (Docker/OrbStack, committed and pushed to the public repo), then Verify and Publish on NearBlocks, so the source stays verified. See `README.md`.
- Commands and the interface are in `README.md`; run unit tests, the sandbox test and clippy before every push/merge that touches `sc/`.
- Use `CARGO_BUILD_JOBS=4` on laptops.
