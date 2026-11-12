// HelloNear swarm: buyer agents pool demand for one item and seller agents compete in a sealed-bid round to fill it.
// The rules are in RULES.md; every number here comes from there. Payouts are credited, then pulled with `withdraw`,
// so one failing transfer can never block a round (docs.near.org security: reentrancy, refunds, callbacks).
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, env, near, require};

const EVENT_STANDARD: &str = "hellonear_swarm";
const EVENT_VERSION: &str = "1.0.0";
const MAX_ITEM_LEN: usize = 64;
const MAX_SALT_LEN: usize = 64;
const MAX_BUYERS: usize = 100;
const MAX_SELLERS: usize = 50;
const MAX_UNITS: u32 = 1_000;
const MAX_CAPACITY: u32 = 100_000;
const MAX_DEADLINE_MINUTES: u32 = 7 * 24 * 60;
const NS_PER_MINUTE: u64 = 60_000_000_000;
// Gas for `on_withdrawn`: reads the transfer result and, if it failed, writes the balance back.
const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(5);

/// Storage prefixes; append only (audit: storage-collision).
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Rounds,
    Balances,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Open,
    Reveal,
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
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Seller {
    pub account: AccountId,
    pub commitment: String,
    /// Known only after a reveal whose hash matched.
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
    pub deadline_ns: u64,
    pub phase: Phase,
    pub buyers: Vec<Buyer>,
    pub sellers: Vec<Seller>,
    /// Set when the round closes.
    pub clearing_price: Option<U128>,
    pub demand: u32,
    pub filled: u32,
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

/// Hex SHA-256 of `"<ask>|<capacity>|<salt>"`, the string a seller commits to (RULES.md, step 3).
pub fn commitment_of(ask_per_unit: u128, capacity: u32, salt: &str) -> String {
    let digest = env::sha256(format!("{ask_per_unit}|{capacity}|{salt}").as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// The deposit must cover the storage added since `initial_storage` plus `extra`; the excess goes back at once.
fn charge(initial_storage: u64, extra: u128) {
    let used = env::storage_usage().saturating_sub(initial_storage);
    let cost = env::storage_byte_cost().as_yoctonear().saturating_mul(used as u128);
    let required = cost.checked_add(extra).unwrap_or_else(|| env::panic_str("amount overflow"));
    let attached = env::attached_deposit().as_yoctonear();
    require!(attached >= required, format!("Insufficient deposit. Required: {required} yoctoNEAR (escrow {extra} + storage {cost})"));
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

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self { rounds: LookupMap::new(StorageKey::Rounds), next_round: 0, balances: LookupMap::new(StorageKey::Balances) }
    }

    /// Opens a round; the caller becomes its organizer. The deposit covers the round's storage.
    #[payable]
    pub fn open_round(&mut self, item: String, max_price_per_unit: U128, deadline_minutes: u32) -> u64 {
        require!(!item.is_empty() && item.len() <= MAX_ITEM_LEN, format!("item must be 1 to {MAX_ITEM_LEN} characters"));
        require!(max_price_per_unit.0 > 0, "max_price_per_unit must be more than 0");
        require!((1..=MAX_DEADLINE_MINUTES).contains(&deadline_minutes), format!("deadline_minutes must be 1 to {MAX_DEADLINE_MINUTES}"));
        let initial = env::storage_usage();
        let id = self.next_round;
        self.next_round += 1;
        let round = Round {
            id,
            item: item.clone(),
            organizer: env::predecessor_account_id(),
            max_price_per_unit,
            deadline_ns: env::block_timestamp() + deadline_minutes as u64 * NS_PER_MINUTE,
            phase: Phase::Open,
            buyers: vec![],
            sellers: vec![],
            clearing_price: None,
            demand: 0,
            filled: 0,
        };
        self.rounds.insert(id, round);
        charge(initial, 0);
        emit("round_opened", json!({ "round_id": id, "item": item, "organizer": env::predecessor_account_id(), "max_price_per_unit": max_price_per_unit }));
        id
    }

    /// A buyer joins with `units`; the deposit must cover `units × max_price_per_unit` (escrow) plus storage.
    #[payable]
    pub fn join(&mut self, round_id: u64, units: u32) {
        require!((1..=MAX_UNITS).contains(&units), format!("units must be 1 to {MAX_UNITS}"));
        let initial = env::storage_usage();
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open, "the round is not open");
        require!(env::block_timestamp() < round.deadline_ns, "the round is past its deadline");
        require!(round.buyers.len() < MAX_BUYERS, format!("a round takes at most {MAX_BUYERS} buyers"));
        require!(!round.buyers.iter().any(|b| b.account == me), "this account already joined the round");
        require!(!round.sellers.iter().any(|s| s.account == me), "a seller in this round cannot also buy");
        let escrow = round.max_price_per_unit.0.checked_mul(units as u128).unwrap_or_else(|| env::panic_str("amount overflow"));
        round.buyers.push(Buyer { account: me.clone(), units, escrow: U128(escrow), filled: 0, paid: U128(0), refund: U128(0) });
        round.demand += units;
        self.rounds.insert(round_id, round);
        charge(initial, escrow);
        emit("buyer_joined", json!({ "round_id": round_id, "buyer": me, "units": units, "escrow": U128(escrow) }));
    }

    /// A seller commits to a hidden ask: `commitment` = hex SHA-256 of `"<ask_per_unit_yocto>|<capacity>|<salt>"`.
    #[payable]
    pub fn commit(&mut self, round_id: u64, commitment: String) {
        require!(commitment.len() == 64 && commitment.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)), "commitment must be 64 lowercase hex characters");
        let initial = env::storage_usage();
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Open, "the round is not open");
        require!(env::block_timestamp() < round.deadline_ns, "the round is past its deadline");
        require!(round.sellers.len() < MAX_SELLERS, format!("a round takes at most {MAX_SELLERS} sellers"));
        require!(!round.sellers.iter().any(|s| s.account == me), "this account already committed in the round");
        require!(!round.buyers.iter().any(|b| b.account == me), "a buyer in this round cannot also sell");
        round.sellers.push(Seller { account: me.clone(), commitment, ask_per_unit: None, capacity: None, sold: 0, earned: U128(0) });
        self.rounds.insert(round_id, round);
        charge(initial, 0);
        emit("seller_committed", json!({ "round_id": round_id, "seller": me }));
    }

    /// The organizer ends joining and committing; sellers can now reveal.
    pub fn start_reveal(&mut self, round_id: u64) {
        let mut round = self.round(round_id);
        require!(env::predecessor_account_id() == round.organizer, "only the organizer can start the reveal");
        require!(round.phase == Phase::Open, "the round is not open");
        round.phase = Phase::Reveal;
        self.rounds.insert(round_id, round);
        emit("reveal_started", json!({ "round_id": round_id }));
    }

    /// A seller reveals its ask; the hash of the same string must equal its commitment.
    pub fn reveal(&mut self, round_id: u64, ask_per_unit: U128, capacity: u32, salt: String) {
        require!(salt.len() <= MAX_SALT_LEN, format!("salt must be at most {MAX_SALT_LEN} characters"));
        require!((1..=MAX_CAPACITY).contains(&capacity), format!("capacity must be 1 to {MAX_CAPACITY}"));
        require!(ask_per_unit.0 > 0, "ask_per_unit must be more than 0");
        let me = env::predecessor_account_id();
        let mut round = self.round(round_id);
        require!(round.phase == Phase::Reveal, "the round is not in its reveal phase");
        let seller = round.sellers.iter_mut().find(|s| s.account == me).unwrap_or_else(|| env::panic_str("this account did not commit in the round"));
        require!(seller.ask_per_unit.is_none(), "already revealed");
        require!(commitment_of(ask_per_unit.0, capacity, &salt) == seller.commitment, "the reveal does not match the commitment");
        seller.ask_per_unit = Some(ask_per_unit);
        seller.capacity = Some(capacity);
        self.rounds.insert(round_id, round);
        emit("seller_revealed", json!({ "round_id": round_id, "seller": me, "ask_per_unit": ask_per_unit, "capacity": capacity }));
    }

    /// The organizer closes the round: settles it (RULES.md step 5) and credits every payout.
    pub fn close_round(&mut self, round_id: u64) {
        let mut round = self.round(round_id);
        require!(env::predecessor_account_id() == round.organizer, "only the organizer can close the round");
        require!(round.phase == Phase::Reveal, "the round is not in its reveal phase");
        let (price, filled) = settle(round.max_price_per_unit.0, &mut round.buyers, &mut round.sellers);
        round.phase = Phase::Closed;
        round.clearing_price = price.map(U128);
        round.filled = filled;
        for b in &round.buyers {
            self.credit(&b.account, b.refund.0);
        }
        for s in &round.sellers {
            self.credit(&s.account, s.earned.0);
        }
        let fills: Vec<_> = round.buyers.iter().map(|b| json!({ "buyer": b.account, "filled": b.filled, "paid": b.paid, "refund": b.refund })).collect();
        let sales: Vec<_> = round.sellers.iter().filter(|s| s.sold > 0).map(|s| json!({ "seller": s.account, "sold": s.sold, "earned": s.earned })).collect();
        emit("round_closed", json!({ "round_id": round_id, "clearing_price": round.clearing_price, "demand": round.demand, "filled": filled, "fills": fills, "sales": sales }));
        self.rounds.insert(round_id, round);
    }

    /// Anyone can cancel a round that was not closed by its deadline; every buyer's escrow is credited back.
    pub fn cancel_round(&mut self, round_id: u64) {
        let mut round = self.round(round_id);
        require!(matches!(round.phase, Phase::Open | Phase::Reveal), "the round is already closed or cancelled");
        require!(env::block_timestamp() >= round.deadline_ns, "the round is not past its deadline");
        round.phase = Phase::Cancelled;
        for b in round.buyers.iter_mut() {
            b.refund = b.escrow;
        }
        for b in &round.buyers {
            self.credit(&b.account, b.escrow.0);
        }
        self.rounds.insert(round_id, round);
        emit("round_cancelled", json!({ "round_id": round_id }));
    }

    /// Sends the caller everything credited to it. The balance is zeroed first; a failed transfer puts it back.
    pub fn withdraw(&mut self) -> Promise {
        let me = env::predecessor_account_id();
        let amount = self.balances.remove(&me).unwrap_or(0);
        require!(amount > 0, "nothing to withdraw");
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

    pub fn total_rounds(&self) -> u64 {
        self.next_round
    }

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    /// The commitment a seller would send, so agents and the simulation hash exactly like the contract.
    pub fn commitment_for(&self, ask_per_unit: U128, capacity: u32, salt: String) -> String {
        commitment_of(ask_per_unit.0, capacity, &salt)
    }
}

impl Contract {
    fn round(&self, round_id: u64) -> Round {
        self.rounds.get(&round_id).cloned().unwrap_or_else(|| env::panic_str("no such round"))
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let now = self.balances.get(account).copied().unwrap_or(0);
        self.balances.insert(account.clone(), now.checked_add(amount).unwrap_or_else(|| env::panic_str("amount overflow")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const DEPOSIT_SLACK: u128 = NEAR / 10; // covers storage; the excess is refunded

    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn as_caller(who: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(acct(who)).attached_deposit(NearToken::from_yoctonear(deposit)).build());
    }

    fn at_time(who: &str, ns: u64) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(acct(who)).block_timestamp(ns).build());
    }

    fn buyer(account: &str, units: u32, max: u128) -> Buyer {
        Buyer { account: acct(account), units, escrow: U128(max * units as u128), filled: 0, paid: U128(0), refund: U128(0) }
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
    fn commitment_matches_sha256_of_the_rules_string() {
        // sha256("2000000000000000000000|10|k3y"), computed with `printf %s … | shasum -a 256`.
        assert_eq!(commitment_of(2_000_000_000_000_000_000_000, 10, "k3y"), "ed9e6b7926312c1f18db3ffbfd3f69d23d65ae0c427f69a7c978af7e109dfb2b");
    }

    fn opened(c: &mut Contract) -> u64 {
        as_caller("org", NEAR);
        c.open_round("gpu-hours".into(), U128(3 * NEAR), 60)
    }

    #[test]
    fn full_round_on_the_contract() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("b1", 12 * NEAR + DEPOSIT_SLACK);
        c.join(id, 4);
        as_caller("b2", 9 * NEAR + DEPOSIT_SLACK);
        c.join(id, 3);
        let asks = [("s1", 2 * NEAR, 5, "a"), ("s2", 25 * NEAR / 10, 5, "b"), ("s3", 4 * NEAR, 5, "c")];
        for (s, ask, cap, salt) in asks {
            as_caller(s, DEPOSIT_SLACK);
            c.commit(id, commitment_of(ask, cap, salt));
        }
        as_caller("s4", DEPOSIT_SLACK);
        c.commit(id, commitment_of(NEAR, 5, "never"));
        as_caller("org", 0);
        c.start_reveal(id);
        for (s, ask, cap, salt) in asks {
            as_caller(s, 0);
            c.reveal(id, U128(ask), cap, salt.into());
        }
        as_caller("org", 0);
        c.close_round(id);
        assert!(get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"round_closed\"")));
        let r = c.get_round(id).unwrap();
        assert_eq!((r.phase, r.clearing_price, r.filled), (Phase::Closed, Some(U128(25 * NEAR / 10)), 7));
        assert_eq!(c.balance_of(acct("b1")).0, 2 * NEAR);
        assert_eq!(c.balance_of(acct("b2")).0, 15 * NEAR / 10);
        assert_eq!(c.balance_of(acct("s1")).0, 125 * NEAR / 10);
        assert_eq!(c.balance_of(acct("s2")).0, 5 * NEAR);
        assert_eq!(c.balance_of(acct("s4")).0, 0);
    }

    #[test]
    #[should_panic(expected = "the reveal does not match the commitment")]
    fn a_changed_ask_is_rejected() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("s1", DEPOSIT_SLACK);
        c.commit(id, commitment_of(5, 1, "x"));
        as_caller("org", 0);
        c.start_reveal(id);
        as_caller("s1", 0);
        c.reveal(id, U128(4), 1, "x".into());
    }

    #[test]
    #[should_panic(expected = "Insufficient deposit")]
    fn join_needs_the_whole_escrow() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("b1", 3 * NEAR); // 2 units need 6 NEAR
        c.join(id, 2);
    }

    #[test]
    #[should_panic(expected = "only the organizer can close the round")]
    fn only_the_organizer_closes() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("org", 0);
        c.start_reveal(id);
        as_caller("b1", 0);
        c.close_round(id);
    }

    #[test]
    #[should_panic(expected = "the round is not open")]
    fn no_commits_after_the_reveal_starts() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("org", 0);
        c.start_reveal(id);
        as_caller("s1", DEPOSIT_SLACK);
        c.commit(id, commitment_of(5, 1, "x"));
    }

    #[test]
    #[should_panic(expected = "a buyer in this round cannot also sell")]
    fn a_buyer_cannot_sell_in_its_round() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("b1", 3 * NEAR + DEPOSIT_SLACK);
        c.join(id, 1);
        as_caller("b1", DEPOSIT_SLACK);
        c.commit(id, commitment_of(5, 1, "x"));
    }

    #[test]
    fn cancel_after_deadline_refunds_buyers() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        as_caller("b1", 3 * NEAR + DEPOSIT_SLACK);
        c.join(id, 1);
        at_time("anyone", 61 * NS_PER_MINUTE);
        c.cancel_round(id);
        assert_eq!(c.get_round(id).unwrap().phase, Phase::Cancelled);
        assert_eq!(c.balance_of(acct("b1")).0, 3 * NEAR);
    }

    #[test]
    #[should_panic(expected = "the round is not past its deadline")]
    fn cannot_cancel_before_deadline() {
        let mut c = Contract::new();
        let id = opened(&mut c);
        at_time("anyone", 59 * NS_PER_MINUTE);
        c.cancel_round(id);
    }

    #[test]
    fn withdraw_zeroes_then_failed_transfer_restores() {
        let mut c = Contract::new();
        c.credit(&acct("b1"), 42);
        as_caller("b1", 0);
        let _ = c.withdraw();
        assert_eq!(c.balance_of(acct("b1")).0, 0);
        testing_env!(VMContextBuilder::new().predecessor_account_id(env::current_account_id()).build());
        assert!(!c.on_withdrawn(acct("b1"), U128(42), Err(PromiseError::Failed)));
        assert_eq!(c.balance_of(acct("b1")).0, 42);
    }

    #[test]
    #[should_panic(expected = "nothing to withdraw")]
    fn withdraw_needs_a_balance() {
        let mut c = Contract::new();
        as_caller("b1", 0);
        let _ = c.withdraw();
    }
}
