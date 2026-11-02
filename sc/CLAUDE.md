# CLAUDE.md — sc/

Mind registry contract: Mind ↔ owner ↔ wallet ↔ skill. Owner: Axel. Issue: #12. Design notes: `research.md` 8.3.

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
- **Deployed contract: `hellonear-registry.testnet` (testnet, 3 Nov 2026).** Env name for consumers: `REGISTRY_CONTRACT_ID` (with `NEAR_NETWORK=testnet`). Details and tx links in `README.md`. Its full-access key is only in Axel's keychain; ask Axel before any redeploy or migration.
- Deploy with the `new` init call in the same transaction (front-running protection).
- Commands and the interface are in `README.md`; run unit tests, the sandbox test and clippy before every push/merge that touches `sc/`.
- Use `CARGO_BUILD_JOBS=4` on laptops.
