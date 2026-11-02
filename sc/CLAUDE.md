# CLAUDE.md — sc/

Mind registry contract: Mind ↔ owner ↔ wallet ↔ skill. Owner: Axel. Issue: #12. Design notes: `research.md` 8.3.

**Update this file in the same PR whenever you change the contract interface, build/test/deploy commands, the deployed account id, or SDK versions.** Root rules in `/CLAUDE.md` also apply.

## Stack

- Rust, `near-sdk` 5.30.0, `cargo-near` 0.22.0. `near-sdk-js` is community-only; do not use it.
- Use the `near-smart-contracts` and `near-contract-audit` agent skills; run the audit skill before the contract is considered done.
- Local tests: `near-sandbox` / `near-workspaces`. Deploy to **testnet** only.

## Conventions

- `#[payable]` writes with storage deposit measured via `env::storage_usage()` before/after; refund the excess.
- `assert_one_yocto()` on sensitive methods (unequip, ownership or wallet changes).
- `U128` for prices; `near_sdk::store` collections with unique `BorshStorageKey` prefixes; `#[derive(PanicOnDefault)]`; `overflow-checks = true`; paginate list views (`minds_of`).
- No custody logic here; wallets live in OutLayer.
- Record the deployed testnet account id in this file.
