// HelloNear swarm: buyer agents pool demand for one item and seller agents compete in a sealed-bid round to fill it.
// The rules are in RULES.md; every number here comes from there. Payouts are credited, then pulled with `withdraw`,
// so one failing transfer can never block a round (docs.near.org security: reentrancy, refunds, callbacks).
//
// The timeline is fixed when the round opens (commit until `commit_end_ns`, reveal until `reveal_end_ns`), and
// every step after the open is open to anyone at its time, so the organizer has no timing power (audit 13 Nov,
// findings 2 and 7). Sellers post a bond with their commit and lose it to the buyers if they never reveal
// (findings 3 and 4).
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, assert_one_yocto, env, near, require};

const EVENT_STANDARD: &str = "hellonear_swarm";
const EVENT_VERSION: &str = "2.0.0";
const MAX_ITEM_LEN: usize = 64;
const MIN_SALT_LEN: usize = 16;
const MAX_SALT_LEN: usize = 64;
const MAX_BUYERS: usize = 100;
const MAX_SELLERS: usize = 50;
const MAX_UNITS: u32 = 1_000;
const MAX_CAPACITY: u32 = 100_000;
const MAX_COMMIT_MINUTES: u32 = 7 * 24 * 60;
const MAX_REVEAL_MINUTES: u32 = 24 * 60;
/// After the reveal ends, anyone may close; only a round nobody closed for this long can be cancelled.
const CANCEL_GRACE_MINUTES: u64 = 60;
const NS_PER_MINUTE: u64 = 60_000_000_000;
const MILLI_NEAR: u128 = 1_000_000_000_000_000_000_000;
/// A seller's bond: at least 0.01 NEAR so 50 junk commits cost something real; at most 100 NEAR so the
/// pro-rata maths can never overflow.
const MIN_SELLER_BOND: u128 = 10 * MILLI_NEAR;
const MAX_SELLER_BOND: u128 = 100_000 * MILLI_NEAR;
/// Storage a round grows by later, charged up front (audit finding 5): a reveal adds an ask (16 bytes) and a
/// capacity (4); the close adds the clearing price (16). Charged with a margin.
const REVEAL_RESERVE_BYTES: u64 = 40;
const CLOSE_RESERVE_BYTES: u64 = 32;
// Gas for `on_withdrawn`: reads the transfer result and, if it failed, writes the balance back.
const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(5);

/// Storage prefixes; append only (audit: storage-collision).
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Rounds,
    Balances,
}

/// Stored state of a round. Which step it is in also depends on the time: see `stage`.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Open,
    Closed,
    Cancelled,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Buyer {
    pub account: AccountId,
    pub units: u32,
    pub escrow: U128,
    /// Set when the round closes.
    pub filled: u32,
    pub paid: U128,
    pub refund: U128,
    /// This buyer's share of the bonds of sellers that never revealed.
    pub bonus: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Seller {
    pub account: AccountId,
    pub commitment: String,
    /// Known only after a reveal whose hash matched; the bond is credited back at that moment.
    pub ask_per_unit: Option<U128>,
    pub capacity: Option<u32>,
    /// Set when the round closes.
    pub sold: u32,
    pub earned: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Round {
    pub id: u64,
    pub item: String,
    pub organizer: AccountId,
    pub max_price_per_unit: U128,
    pub seller_bond: U128,
    /// Joins and commits until then; reveals from then until `reveal_end_ns`.
    pub commit_end_ns: U64,
    pub reveal_end_ns: U64,
    pub phase: Phase,
    pub buyers: Vec<Buyer>,
    pub sellers: Vec<Seller>,
    /// Set when the round closes.
    pub clearing_price: Option<U128>,
    pub demand: u32,
    pub filled: u32,
    /// Bonds of sellers that never revealed, shared out to the buyers.
    pub forfeited: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    rounds: LookupMap<u64, Round>,
    next_round: u64,
    balances: LookupMap<AccountId, u128>,
}

/// NEP-297 event log.
fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    ));
}

/// Hex SHA-256 of `"<round_id>|<seller>|<ask>|<capacity>|<salt>"`, the string a seller commits to (RULES.md, step 3).
/// The round and the seller are part of it, so a commitment cannot be copied by another seller or reused in another
/// round (audit finding 6). The string is unambiguous: account ids have no `|`, ask and capacity are digits, the salt
/// comes last.
pub fn commitment_of(round_id: u64, seller: &AccountId, ask_per_unit: u128, capacity: u32, salt: &str) -> String {
    let digest = env::sha256(format!("{round_id}|{seller}|{ask_per_unit}|{capacity}|{salt}").as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// The deposit must cover the storage added since `initial_storage`, plus `reserve_bytes` the record grows by later,
/// plus `extra` (escrow or bond); the excess goes back at once. Call it after `Contract::flush`: `near_sdk::store`
/// collections only write at the end of the method, so before a flush `storage_usage` has not moved (13 Nov: the
/// first version charged no storage at all because of this).
fn charge(initial_storage: u64, reserve_bytes: u64, extra: u128) {
    let used = env::storage_usage().saturating_sub(initial_storage) + reserve_bytes;
    let cost = env::storage_byte_cost().as_yoctonear().saturating_mul(used as u128);
    let required = cost.checked_add(extra).unwrap_or_else(|| env::panic_str("amount overflow"));
    let attached = env::attached_deposit().as_yoctonear();
    require!(attached >= required, format!("Insufficient deposit. Required: {required} yoctoNEAR (escrow or bond {extra} + storage {cost})"));
    let refund = attached - required;
    if refund > 0 {
        Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(refund)).detach();
    }
}

/// The pure settlement of RULES.md step 5, so it can be tested without a chain.
/// Fills `filled`/`paid`/`refund` on buyers and `sold`/`earned` on sellers; returns (clearing price, filled units).
pub fn settle(max_price: u128, buyers: &mut [Buyer], sellers: &mut [Seller]) -> (Option<u128>, u32) {
    let demand: u64 = buyers.iter().map(|b| b.units as u64).sum();
    // Valid asks: revealed and not above the ceiling; cheapest first, ties in commit order (stable sort).
    let mut order: Vec<usize> = (0..sellers.len())
        .filter(|&i| matches!(sellers[i].ask_per_unit, Some(a) if a.0 <= max_price))
        .collect();
    order.sort_by_key(|&i| sellers[i].ask_per_unit.map(|a| a.0).unwrap_or(u128::MAX));

    let mut left = demand;
    let mut price: Option<u128> = None;
    for &i in &order {
        if left == 0 {
            break;
        }
        let cap = sellers[i].capacity.unwrap_or(0) as u64;
        let take = cap.min(left);
        sellers[i].sold = take as u32;
        left -= take;
        price = sellers[i].ask_per_unit.map(|a| a.0);
    }
    let filled = (demand - left) as u32;
    let p = price.unwrap_or(0);
    for s in sellers.iter_mut() {
        s.earned = U128(p.checked_mul(s.sold as u128).unwrap_or_else(|| env::panic_str("amount overflow")));
    }
    // Partial fill in join order.
    let mut supply = filled;
    for b in buyers.iter_mut() {
        b.filled = b.units.min(supply);
        supply -= b.filled;
        let paid = p.checked_mul(b.filled as u128).unwrap_or_else(|| env::panic_str("amount overflow"));
        b.paid = U128(paid);
        b.refund = U128(b.escrow.0 - paid);
    }
    (price, filled)
}

/// Shares `forfeited` out to the buyers by units (whole yoctoNEAR; the rounding dust goes to the first buyer).
/// Returns false when there is no buyer to give it to.
pub fn share_forfeited(forfeited: u128, buyers: &mut [Buyer]) -> bool {
    let demand: u128 = buyers.iter().map(|b| b.units as u128).sum();
    if buyers.is_empty() || demand == 0 {
        return false;
    }
    let mut given = 0u128;
    for b in buyers.iter_mut() {
        // forfeited <= 50 × 100 NEAR and units <= 1,000, so this product stays far below u128::MAX.
        let share = forfeited.checked_mul(b.units as u128).unwrap_or_else(|| env::panic_str("amount overflow")) / demand;
        b.bonus = U128(share);
        given += share;
    }
    buyers[0].bonus = U128(buyers[0].bonus.0 + (forfeited - given));
    true
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self { rounds: LookupMap::new(StorageKey::Rounds), next_round: 0, balances: LookupMap::new(StorageKey::Balances) }
    }

    /// Opens a round; the caller becomes its organizer. The whole timeline is set here and cannot change.
    /// The deposit covers the round's storage.
    #[payable]
    pub fn open_round(&mut self, item: String, max_price_per_unit: U128, seller_bond: U128, commit_minutes: u32, reveal_minutes: u32) -> u64 {
        require!(!item.is_empty() && item.len() <= MAX_ITEM_LEN, format!("item must be 1 to {MAX_ITEM_LEN} characters"));
        require!(max_price_per_unit.0 > 0, "max_price_per_unit must be more than 0");
        require!((MIN_SELLER_BOND..=MAX_SELLER_BOND).contains(&seller_bond.0), format!("seller_bond must be {MIN_SELLER_BOND} to {MAX_SELLER_BOND} yoctoNEAR"));
        require!((1..=MAX_COMMIT_MINUTES).contains(&commit_minutes), format!("commit_minutes must be 1 to {MAX_COMMIT_MINUTES}"));
        require!((1..=MAX_REVEAL_MINUTES).contains(&reveal_minutes), format!("reveal_minutes must be 1 to {MAX_REVEAL_MINUTES}"));
        let initial = env::storage_usage();
        let id = self.next_round;
        self.next_round += 1;
        let organizer = env::predecessor_account_id();
        let commit_end = env::block_timestamp() + commit_minutes as u64 * NS_PER_MINUTE;
        let reveal_end = commit_end + reveal_minutes as u64 * NS_PER_MINUTE;
        let round = Round {
            id,
            item: item.clone(),
            organizer: organizer.clone(),
            max_price_per_unit,
            seller_bond,
            commit_end_ns: U64(commit_end),
            reveal_end_ns: U64(reveal_end),
            phase: Phase::Open,
            buyers: vec![],
            sellers: vec![],
            clearing_price: None,
            demand: 0,
            filled: 0,
            forfeited: U128(0),
        };
        self.rounds.insert(id, round);
        // The organizer may receive forfeited bonds when nobody joined; its balance entry is paid now.
        self.reserve_entry(&organizer);
        self.flush();
        charge(initial, CLOSE_RESERVE_BYTES, 0);
        emit("round_opened", json!({
            "round_id": id, "item": item, "organizer": organizer, "max_price_per_unit": max_price_per_unit,
            "seller_bond": seller_bond, "commit_end_ns": U64(commit_end), "reveal_end_ns": U64(reveal_end),
        }));
        id
    }

    /// A buyer joins with `units` before the commit deadline; the deposit must cover `units × max_price_per_unit`
    /// (escrow) plus storage, including its future balance entry.
    #[payable]
    pub fn join(&mut self, round_id: u64, units: u32) {
        require!((1..=MAX_UNITS).contains(&units), format!("units must be 1 to {MAX_UNITS}"));
        let initial = env::storage_usage();
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open && env::block_timestamp() < round.commit_end_ns.0, "the round no longer takes joins");
        require!(round.buyers.len() < MAX_BUYERS, format!("a round takes at most {MAX_BUYERS} buyers"));
        require!(!round.buyers.iter().any(|b| b.account == me), "this account already joined the round");
        require!(!round.sellers.iter().any(|s| s.account == me), "a seller in this round cannot also buy");
        let escrow = round.max_price_per_unit.0.checked_mul(units as u128).unwrap_or_else(|| env::panic_str("amount overflow"));
        round.buyers.push(Buyer { account: me.clone(), units, escrow: U128(escrow), filled: 0, paid: U128(0), refund: U128(0), bonus: U128(0) });
        round.demand += units;
        self.rounds.insert(round_id, round);
        self.reserve_entry(&me);
        self.flush();
        charge(initial, 0, escrow);
        emit("buyer_joined", json!({ "round_id": round_id, "buyer": me, "units": units, "escrow": U128(escrow) }));
    }

    /// A seller commits to a hidden ask before the commit deadline, with the round's bond.
    /// `commitment` = hex SHA-256 of `"<round_id>|<seller account>|<ask_per_unit_yocto>|<capacity>|<salt>"`.
    #[payable]
    pub fn commit(&mut self, round_id: u64, commitment: String) {
        require!(commitment.len() == 64 && commitment.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)), "commitment must be 64 lowercase hex characters");
        let initial = env::storage_usage();
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open && env::block_timestamp() < round.commit_end_ns.0, "the round no longer takes commits");
        require!(round.sellers.len() < MAX_SELLERS, format!("a round takes at most {MAX_SELLERS} sellers"));
        require!(!round.sellers.iter().any(|s| s.account == me), "this account already committed in the round");
        require!(!round.buyers.iter().any(|b| b.account == me), "a buyer in this round cannot also sell");
        let bond = round.seller_bond.0;
        round.sellers.push(Seller { account: me.clone(), commitment, ask_per_unit: None, capacity: None, sold: 0, earned: U128(0) });
        self.rounds.insert(round_id, round);
        self.reserve_entry(&me);
        self.flush();
        charge(initial, REVEAL_RESERVE_BYTES, bond);
        emit("seller_committed", json!({ "round_id": round_id, "seller": me, "bond": U128(bond) }));
    }

    /// A seller reveals its ask between the commit and reveal deadlines; the hash must equal its commitment.
    /// Its bond is credited back at once.
    pub fn reveal(&mut self, round_id: u64, ask_per_unit: U128, capacity: u32, salt: String) {
        require!((MIN_SALT_LEN..=MAX_SALT_LEN).contains(&salt.len()), format!("salt must be {MIN_SALT_LEN} to {MAX_SALT_LEN} characters"));
        require!((1..=MAX_CAPACITY).contains(&capacity), format!("capacity must be 1 to {MAX_CAPACITY}"));
        require!(ask_per_unit.0 > 0, "ask_per_unit must be more than 0");
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        let now = env::block_timestamp();
        require!(round.phase == Phase::Open && now >= round.commit_end_ns.0 && now < round.reveal_end_ns.0, "the round is not in its reveal window");
        let bond = round.seller_bond.0;
        let seller = round.sellers.iter_mut().find(|s| s.account == me).unwrap_or_else(|| env::panic_str("this account did not commit in the round"));
        require!(seller.ask_per_unit.is_none(), "already revealed");
        require!(commitment_of(round_id, &me, ask_per_unit.0, capacity, &salt) == seller.commitment, "the reveal does not match the commitment");
        seller.ask_per_unit = Some(ask_per_unit);
        seller.capacity = Some(capacity);
        self.rounds.insert(round_id, round);
        self.credit(&me, bond);
        emit("seller_revealed", json!({ "round_id": round_id, "seller": me, "ask_per_unit": ask_per_unit, "capacity": capacity }));
    }

    /// Anyone closes the round once the reveal window is over, or earlier once every seller has revealed. Settles it
    /// (RULES.md step 5), shares unrevealed bonds out to the buyers and credits every payout. The event is a summary
    /// whatever the round's size (audit finding 1: NEAR caps one call's logs at 16 KiB); per-account results are in
    /// `get_round`.
    pub fn close_round(&mut self, round_id: u64) {
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open, "the round is already closed or cancelled");
        let now = env::block_timestamp();
        let all_revealed = round.sellers.iter().all(|s| s.ask_per_unit.is_some());
        require!(now >= round.reveal_end_ns.0 || (now >= round.commit_end_ns.0 && all_revealed), "the reveal window is still open");
        let (price, filled) = settle(round.max_price_per_unit.0, &mut round.buyers, &mut round.sellers);
        round.phase = Phase::Closed;
        round.clearing_price = price.map(U128);
        round.filled = filled;
        self.forfeit_unrevealed(&mut round);
        for b in &round.buyers {
            self.credit(&b.account, b.refund.0 + b.bonus.0);
        }
        for s in &round.sellers {
            self.credit(&s.account, s.earned.0);
        }
        emit("round_closed", json!({
            "round_id": round_id, "clearing_price": round.clearing_price, "demand": round.demand, "filled": filled,
            "buyers": round.buyers.len(), "sellers_sold": round.sellers.iter().filter(|s| s.sold > 0).count(),
            "forfeited": round.forfeited, "closed_by": env::predecessor_account_id(),
        }));
        self.rounds.insert(round_id, round);
    }

    /// Anyone can cancel a round that nobody closed within the grace period after its reveal window; every buyer's
    /// escrow is credited back, and unrevealed bonds are shared out as on a close.
    pub fn cancel_round(&mut self, round_id: u64) {
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open, "the round is already closed or cancelled");
        require!(env::block_timestamp() >= round.reveal_end_ns.0 + CANCEL_GRACE_MINUTES * NS_PER_MINUTE, "the round can still be closed");
        round.phase = Phase::Cancelled;
        for b in round.buyers.iter_mut() {
            b.refund = b.escrow;
        }
        self.forfeit_unrevealed(&mut round);
        for b in &round.buyers {
            self.credit(&b.account, b.escrow.0 + b.bonus.0);
        }
        emit("round_cancelled", json!({ "round_id": round_id, "forfeited": round.forfeited }));
        self.rounds.insert(round_id, round);
    }

    /// Sends the caller everything credited to it. Needs exactly 1 yoctoNEAR, so only a full-access key can call it.
    /// The balance is zeroed first (the entry stays, paid for at join/commit); a failed transfer puts it back.
    #[payable]
    pub fn withdraw(&mut self) -> Promise {
        assert_one_yocto();
        let me = env::predecessor_account_id();
        let amount = self.balances.get(&me).copied().unwrap_or(0);
        require!(amount > 0, "nothing to withdraw");
        self.balances.insert(me.clone(), 0);
        emit("withdrawn", json!({ "account": me, "amount": U128(amount) }));
        Promise::new(me.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_WITHDRAW_CALLBACK).on_withdrawn(me, U128(amount)))
    }

    /// Puts the balance back when the transfer failed. Never panics: a panic here would lose the credit.
    #[private]
    pub fn on_withdrawn(&mut self, account: AccountId, amount: U128, #[callback_result] sent: Result<(), PromiseError>) -> bool {
        if sent.is_ok() {
            return true;
        }
        self.credit(&account, amount.0);
        emit("withdraw_failed", json!({ "account": account, "amount": amount }));
        false
    }

    // Views.

    /// A round. A seller's ask and capacity stay `null` until it reveals; only its commitment is stored before.
    pub fn get_round(&self, round_id: u64) -> Option<Round> {
        self.rounds.get(&round_id).cloned()
    }

    /// Where a round is now: `commit`, `reveal`, `closable` (anyone may close it), `closed` or `cancelled`.
    pub fn stage(&self, round_id: u64) -> String {
        let r = self.round(round_id);
        let now = env::block_timestamp();
        match r.phase {
            Phase::Closed => "closed",
            Phase::Cancelled => "cancelled",
            Phase::Open if now < r.commit_end_ns.0 => "commit",
            Phase::Open if now < r.reveal_end_ns.0 && !r.sellers.iter().all(|s| s.ask_per_unit.is_some()) => "reveal",
            Phase::Open => "closable",
        }
        .into()
    }

    pub fn total_rounds(&self) -> u64 {
        self.next_round
    }

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    /// The commitment `seller` would send for this round, so agents and the simulation hash exactly like the contract.
    pub fn commitment_for(&self, round_id: u64, seller: AccountId, ask_per_unit: U128, capacity: u32, salt: String) -> String {
        commitment_of(round_id, &seller, ask_per_unit.0, capacity, &salt)
    }
}

impl Contract {
    fn round(&self, round_id: u64) -> Round {
        self.rounds.get(&round_id).cloned().unwrap_or_else(|| env::panic_str("no such round"))
    }

    /// Creates the account's balance entry now, inside a call whose deposit pays for its storage, so later credits
    /// (close, cancel, reveal) only update it and never spend the contract's own balance or escrow (audit finding 5).
    fn reserve_entry(&mut self, account: &AccountId) {
        if !self.balances.contains_key(account) {
            self.balances.insert(account.clone(), 0);
        }
    }

    /// Writes the collections now, so `charge` measures their storage.
    fn flush(&mut self) {
        self.rounds.flush();
        self.balances.flush();
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let now = self.balances.get(account).copied().unwrap_or(0);
        self.balances.insert(account.clone(), now.checked_add(amount).unwrap_or_else(|| env::panic_str("amount overflow")));
    }

    /// Bonds of sellers that never revealed go to the buyers by units; with no buyer, to the organizer.
    fn forfeit_unrevealed(&mut self, round: &mut Round) {
        let unrevealed = round.sellers.iter().filter(|s| s.ask_per_unit.is_none()).count() as u128;
        let forfeited = round.seller_bond.0.checked_mul(unrevealed).unwrap_or_else(|| env::panic_str("amount overflow"));
        round.forfeited = U128(forfeited);
        if forfeited > 0 && !share_forfeited(forfeited, &mut round.buyers) {
            self.credit(&round.organizer, forfeited);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const BOND: u128 = NEAR / 10;
    const DEPOSIT_SLACK: u128 = NEAR / 10; // covers storage; the excess is refunded
    const COMMIT_END: u64 = 60 * NS_PER_MINUTE;
    const REVEAL_END: u64 = 120 * NS_PER_MINUTE;
    const MAX_LOGS: usize = 16_384; // NEAR's cap on one call's total log length

    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(who: &str, deposit: u128, ns: u64) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(acct(who)).attached_deposit(NearToken::from_yoctonear(deposit)).block_timestamp(ns).build());
    }

    fn buyer(account: &str, units: u32, max: u128) -> Buyer {
        Buyer { account: acct(account), units, escrow: U128(max * units as u128), filled: 0, paid: U128(0), refund: U128(0), bonus: U128(0) }
    }

    fn seller(account: &str, ask: Option<u128>, cap: u32) -> Seller {
        Seller { account: acct(account), commitment: String::new(), ask_per_unit: ask.map(U128), capacity: ask.map(|_| cap), sold: 0, earned: U128(0) }
    }

    #[test]
    fn worked_example_from_rules() {
        let mut buyers = vec![buyer("b1", 4, 3 * NEAR), buyer("b2", 3, 3 * NEAR)];
        let mut sellers = vec![
            seller("s1", Some(2 * NEAR), 5),
            seller("s2", Some(25 * NEAR / 10), 5),
            seller("s3", Some(4 * NEAR), 5),
            seller("s4", None, 5),
        ];
        let (price, filled) = settle(3 * NEAR, &mut buyers, &mut sellers);
        assert_eq!(price, Some(25 * NEAR / 10));
        assert_eq!(filled, 7);
        assert_eq!((buyers[0].paid.0, buyers[0].refund.0), (10 * NEAR, 2 * NEAR));
        assert_eq!((buyers[1].paid.0, buyers[1].refund.0), (75 * NEAR / 10, 15 * NEAR / 10));
        assert_eq!((sellers[0].sold, sellers[0].earned.0), (5, 125 * NEAR / 10));
        assert_eq!((sellers[1].sold, sellers[1].earned.0), (2, 5 * NEAR));
        assert_eq!((sellers[2].sold, sellers[3].sold), (0, 0));
    }

    #[test]
    fn paid_equals_earned_and_refunds_close_escrow() {
        let mut buyers = vec![buyer("b1", 3, 5), buyer("b2", 9, 5), buyer("b3", 1, 5)];
        let mut sellers = vec![seller("s1", Some(4), 2), seller("s2", Some(3), 6), seller("s3", Some(5), 100)];
        settle(5, &mut buyers, &mut sellers);
        let paid: u128 = buyers.iter().map(|b| b.paid.0).sum();
        let earned: u128 = sellers.iter().map(|s| s.earned.0).sum();
        assert_eq!(paid, earned);
        for b in &buyers {
            assert_eq!(b.paid.0 + b.refund.0, b.escrow.0);
        }
    }

    #[test]
    fn supply_below_demand_fills_in_join_order() {
        let mut buyers = vec![buyer("b1", 3, 10), buyer("b2", 3, 10), buyer("b3", 3, 10)];
        let mut sellers = vec![seller("s1", Some(7), 4)];
        let (price, filled) = settle(10, &mut buyers, &mut sellers);
        assert_eq!((price, filled), (Some(7), 4));
        assert_eq!(buyers.iter().map(|b| b.filled).collect::<Vec<_>>(), vec![3, 1, 0]);
        assert_eq!(buyers[2].refund.0, 30);
    }

    #[test]
    fn equal_asks_keep_commit_order() {
        let mut buyers = vec![buyer("b1", 2, 10)];
        let mut sellers = vec![seller("early", Some(5), 2), seller("late", Some(5), 2)];
        settle(10, &mut buyers, &mut sellers);
        assert_eq!((sellers[0].sold, sellers[1].sold), (2, 0));
    }

    #[test]
    fn no_valid_ask_refunds_everything() {
        let mut buyers = vec![buyer("b1", 2, 10)];
        let mut sellers = vec![seller("s1", Some(11), 5), seller("s2", None, 5)];
        let (price, filled) = settle(10, &mut buyers, &mut sellers);
        assert_eq!((price, filled), (None, 0));
        assert_eq!(buyers[0].refund.0, 20);
    }

    #[test]
    fn forfeited_bonds_split_by_units_with_no_yocto_lost() {
        let mut buyers = vec![buyer("b1", 4, 1), buyer("b2", 3, 1)];
        assert!(share_forfeited(10, &mut buyers));
        assert_eq!((buyers[0].bonus.0, buyers[1].bonus.0), (6, 4)); // 40/7 = 5 + dust 1, 30/7 = 4
        assert!(!share_forfeited(10, &mut []));
    }

    #[test]
    fn commitment_binds_round_and_seller() {
        // sha256("0|alice.testnet|2000000000000000000000|10|k3y-salt-16-chars"), computed with `printf %s … | shasum -a 256`.
        let alice = acct("alice.testnet");
        assert_eq!(commitment_of(0, &alice, 2_000_000_000_000_000_000_000, 10, "k3y-salt-16-chars"), "dd51f3b34f2d30eb836c2eae5e57236457cc2c5bc7d6616f6d961f34fa88b765");
        assert_ne!(commitment_of(1, &alice, 2_000_000_000_000_000_000_000, 10, "k3y-salt-16-chars"), commitment_of(0, &alice, 2_000_000_000_000_000_000_000, 10, "k3y-salt-16-chars"));
        assert_ne!(commitment_of(0, &acct("bob.testnet"), 2_000_000_000_000_000_000_000, 10, "k3y-salt-16-chars"), commitment_of(0, &alice, 2_000_000_000_000_000_000_000, 10, "k3y-salt-16-chars"));
    }

    fn opened(c: &mut Contract) -> u64 {
        ctx("org", NEAR, 0);
        c.open_round("gpu-hours".into(), U128(3 * NEAR), U128(BOND), 60, 60)
    }

    fn salt(s: &str) -> String {
        format!("{s}-salt-sixteen!!")
    }

    fn commit_as(c: &mut Contract, id: u64, s: &str, ask: u128, cap: u32) {
        ctx(s, BOND + DEPOSIT_SLACK, 0);
        c.commit(id, commitment_of(id, &acct(s), ask, cap, &salt(s)));
    }

    #[test]
    fn full_round_on_the_contract() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("b1", 12 * NEAR + DEPOSIT_SLACK, 0);
        c.join(id, 4);
        ctx("b2", 9 * NEAR + DEPOSIT_SLACK, 0);
        c.join(id, 3);
        let asks = [("s1", 2 * NEAR, 5), ("s2", 25 * NEAR / 10, 5), ("s3", 4 * NEAR, 5)];
        for (s, ask, cap) in asks {
            commit_as(&mut c, id, s, ask, cap);
        }
        commit_as(&mut c, id, "s4", NEAR, 5); // the bluffer
        assert_eq!(c.stage(id), "commit");
        for (s, ask, cap) in asks {
            ctx(s, 0, COMMIT_END);
            c.reveal(id, U128(ask), cap, salt(s));
        }
        assert_eq!(c.balance_of(acct("s1")).0, BOND, "the bond comes back on reveal");
        assert_eq!(c.stage(id), "reveal");
        ctx("b2", 0, REVEAL_END); // anyone may close once the window is over
        c.close_round(id);
        let logs = get_logs();
        assert!(logs.iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"round_closed\"")));
        let r = c.get_round(id).unwrap();
        assert_eq!((r.phase, r.clearing_price, r.filled, r.forfeited), (Phase::Closed, Some(U128(25 * NEAR / 10)), 7, U128(BOND)));
        // The bluffer's bond goes to the buyers by units: 4/7 and 3/7, the dust to the first.
        let (bonus1, bonus2) = (BOND * 4 / 7 + (BOND - BOND * 4 / 7 - BOND * 3 / 7), BOND * 3 / 7);
        assert_eq!(c.balance_of(acct("b1")).0, 2 * NEAR + bonus1);
        assert_eq!(c.balance_of(acct("b2")).0, 15 * NEAR / 10 + bonus2);
        assert_eq!(c.balance_of(acct("s1")).0, 125 * NEAR / 10 + BOND);
        assert_eq!(c.balance_of(acct("s2")).0, 5 * NEAR + BOND);
        assert_eq!(c.balance_of(acct("s3")).0, BOND);
        assert_eq!(c.balance_of(acct("s4")).0, 0);
        assert_eq!(c.stage(id), "closed");
    }

    #[test]
    fn closes_early_once_every_seller_revealed() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("b1", 3 * NEAR + DEPOSIT_SLACK, 0);
        c.join(id, 1);
        commit_as(&mut c, id, "s1", NEAR, 1);
        ctx("s1", 0, COMMIT_END);
        c.reveal(id, U128(NEAR), 1, salt("s1"));
        assert_eq!(c.stage(id), "closable");
        ctx("anyone", 0, COMMIT_END + 1);
        c.close_round(id);
        assert_eq!(c.get_round(id).unwrap().clearing_price, Some(U128(NEAR)));
    }

    #[test]
    #[should_panic(expected = "the reveal window is still open")]
    fn no_early_close_while_a_seller_has_not_revealed() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", NEAR, 1);
        commit_as(&mut c, id, "s2", NEAR, 1);
        ctx("s1", 0, COMMIT_END);
        c.reveal(id, U128(NEAR), 1, salt("s1"));
        ctx("org", 0, COMMIT_END + 1); // not even the organizer
        c.close_round(id);
    }

    #[test]
    #[should_panic(expected = "the reveal does not match the commitment")]
    fn a_changed_ask_is_rejected() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", 5, 1);
        ctx("s1", 0, COMMIT_END);
        c.reveal(id, U128(4), 1, salt("s1"));
    }

    #[test]
    #[should_panic(expected = "the reveal does not match the commitment")]
    fn a_copied_commitment_cannot_be_revealed_by_another_seller() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", 5, 1);
        let copied = c.get_round(id).unwrap().sellers[0].commitment.clone();
        ctx("s2", BOND + DEPOSIT_SLACK, 0);
        c.commit(id, copied);
        ctx("s2", 0, COMMIT_END);
        c.reveal(id, U128(5), 1, salt("s1"));
    }

    #[test]
    #[should_panic(expected = "salt must be 16 to 64 characters")]
    fn a_short_salt_is_refused() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("s1", BOND + DEPOSIT_SLACK, 0);
        c.commit(id, commitment_of(id, &acct("s1"), 5, 1, "short"));
        ctx("s1", 0, COMMIT_END);
        c.reveal(id, U128(5), 1, "short".into());
    }

    #[test]
    #[should_panic(expected = "the round is not in its reveal window")]
    fn no_reveal_before_the_commit_deadline() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", 5, 1);
        ctx("s1", 0, COMMIT_END - 1);
        c.reveal(id, U128(5), 1, salt("s1"));
    }

    #[test]
    #[should_panic(expected = "the round is not in its reveal window")]
    fn no_reveal_after_the_reveal_deadline() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", 5, 1);
        ctx("s1", 0, REVEAL_END);
        c.reveal(id, U128(5), 1, salt("s1"));
    }

    #[test]
    #[should_panic(expected = "Insufficient deposit")]
    fn commit_needs_the_bond() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("s1", BOND / 2, 0);
        c.commit(id, commitment_of(id, &acct("s1"), 5, 1, &salt("s1")));
    }

    #[test]
    #[should_panic(expected = "seller_bond must be")]
    fn a_tiny_bond_is_refused() {
        let mut c = Contract::new();
        ctx("org", NEAR, 0);
        c.open_round("x".into(), U128(NEAR), U128(1), 60, 60);
    }

    #[test]
    #[should_panic(expected = "Insufficient deposit")]
    fn join_needs_the_whole_escrow() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("b1", 3 * NEAR, 0); // 2 units need 6 NEAR
        c.join(id, 2);
    }

    #[test]
    #[should_panic(expected = "the round no longer takes commits")]
    fn no_commits_after_the_commit_deadline() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("s1", BOND + DEPOSIT_SLACK, COMMIT_END);
        c.commit(id, commitment_of(id, &acct("s1"), 5, 1, &salt("s1")));
    }

    #[test]
    #[should_panic(expected = "a buyer in this round cannot also sell")]
    fn a_buyer_cannot_sell_in_its_round() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("b1", 3 * NEAR + DEPOSIT_SLACK, 0);
        c.join(id, 1);
        commit_as(&mut c, id, "b1", 5, 1);
    }

    #[test]
    fn cancel_after_the_grace_refunds_buyers_and_shares_bonds() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("b1", 3 * NEAR + DEPOSIT_SLACK, 0);
        c.join(id, 1);
        commit_as(&mut c, id, "s1", 5, 1);
        ctx("anyone", 0, REVEAL_END + CANCEL_GRACE_MINUTES * NS_PER_MINUTE);
        c.cancel_round(id);
        assert_eq!(c.get_round(id).unwrap().phase, Phase::Cancelled);
        assert_eq!(c.balance_of(acct("b1")).0, 3 * NEAR + BOND);
        assert_eq!(c.balance_of(acct("s1")).0, 0);
    }

    #[test]
    #[should_panic(expected = "the round can still be closed")]
    fn cannot_cancel_while_it_can_still_be_closed() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        ctx("anyone", 0, REVEAL_END + 1);
        c.cancel_round(id);
    }

    #[test]
    fn forfeited_bonds_go_to_the_organizer_when_nobody_joined() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        commit_as(&mut c, id, "s1", 5, 1);
        ctx("anyone", 0, REVEAL_END);
        c.close_round(id);
        assert_eq!(c.balance_of(acct("org")).0, BOND);
    }

    fn one_yocto(who: &str) {
        ctx(who, 1, 0);
    }

    #[test]
    fn withdraw_zeroes_then_failed_transfer_restores() {
        let mut c = Contract::new();
        c.credit(&acct("b1"), 42);
        one_yocto("b1");
        let _ = c.withdraw();
        assert_eq!(c.balance_of(acct("b1")).0, 0);
        testing_env!(VMContextBuilder::new().predecessor_account_id(env::current_account_id()).build());
        assert!(!c.on_withdrawn(acct("b1"), U128(42), Err(PromiseError::Failed)));
        assert_eq!(c.balance_of(acct("b1")).0, 42);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn withdraw_needs_one_yocto() {
        let mut c = Contract::new();
        c.credit(&acct("b1"), 42);
        ctx("b1", 0, 0);
        let _ = c.withdraw();
    }

    #[test]
    #[should_panic(expected = "nothing to withdraw")]
    fn withdraw_needs_a_balance() {
        let mut c = Contract::new();
        one_yocto("b1");
        let _ = c.withdraw();
    }

    // Audit finding 1 (13 Nov): a full round must close. The old `round_closed` listed every account and went over
    // NEAR's 16 KiB log cap at 100 buyers × 50 sellers (TotalLogLengthExceeded 17,233 with swarm names, 23,503 with
    // 64-character implicit ones).
    fn full_round(name: &dyn Fn(&str, usize) -> String) {
        let mut c = Contract::new();
        let org = "org.testnet";
        ctx(org, NEAR, 0);
        let id = c.open_round("x".into(), U128(3 * NEAR), U128(BOND), 60, 60);
        for i in 0..MAX_BUYERS {
            ctx(&name("b", i), 3000 * NEAR + NEAR, 0);
            c.join(id, 1000);
        }
        let cap = MAX_CAPACITY / MAX_SELLERS as u32;
        let mut sellers = vec![];
        for i in 0..MAX_SELLERS {
            let s = name("s", i);
            let ask = 2 * NEAR + i as u128 * 12_345_678_901_234_567;
            ctx(&s, BOND + NEAR, 0);
            c.commit(id, commitment_of(id, &acct(&s), ask, cap, "salt-sixteen-chars"));
            sellers.push((s, ask));
        }
        for (s, ask) in &sellers {
            ctx(s, 0, COMMIT_END);
            c.reveal(id, U128(*ask), cap, "salt-sixteen-chars".into());
        }
        ctx(org, 0, COMMIT_END + 1); // every seller revealed, so it can close early
        c.close_round(id);
        let total: usize = get_logs().iter().map(|l| l.len()).sum();
        assert!(total < MAX_LOGS / 8, "close_round logged {total} bytes");
        let r = c.get_round(id).unwrap();
        assert_eq!((r.phase, r.buyers.len(), r.sellers.len()), (Phase::Closed, MAX_BUYERS, MAX_SELLERS));
    }

    #[test]
    fn a_full_round_with_implicit_accounts_closes() {
        full_round(&|p, i| format!("{:0>64}", format!("{}{:x}", if p == "b" { "b" } else { "c" }, i)));
    }

    #[test]
    fn a_full_round_with_swarm_names_closes() {
        full_round(&|p, i| format!("{}-{i}.swarm.testnet", if p == "b" { "buyer" } else { "seller" }));
    }
}
