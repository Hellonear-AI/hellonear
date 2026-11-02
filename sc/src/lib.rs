// HelloNear Mind registry: Mind ↔ owner ↔ wallet ↔ skills (#12).
// No custody logic here: a Mind's wallet lives in OutLayer; this contract only records it.
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, assert_one_yocto, env, near, require};

mod migrate;
pub mod versioned;
pub use versioned::{Mind, Skill};
use versioned::{VersionedMind, VersionedSkill};

const MAX_ID_LEN: usize = 64;
const MAX_URI_LEN: usize = 256;
const MAX_SKILLS_PER_MIND: usize = 32;
// Bounds the per-owner list so register_mind's gas cannot grow without limit (audit: gas-griefing).
const MAX_MINDS_PER_OWNER: usize = 100;
const MAX_PAGE: u32 = 50;
const EVENT_STANDARD: &str = "hellonear_registry";
const EVENT_VERSION: &str = "1.0.0";

/// Storage prefixes. The borsh tag of each variant is its prefix, so only ever append
/// variants; never reorder or remove them (audit: storage-collision).
#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    /// v0.1.0 Minds (unversioned). Emptied by `migrate`.
    Minds,
    MindsByOwner,
    /// v0.1.0 Skills (unversioned). Emptied by `migrate`.
    Skills,
    VersionedMinds,
    VersionedSkills,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    minds: IterableMap<String, VersionedMind>,
    minds_by_owner: LookupMap<AccountId, Vec<String>>,
    skills: LookupMap<String, VersionedSkill>,
}

fn require_valid_id(id: &str, what: &str) {
    require!(!id.is_empty() && id.len() <= MAX_ID_LEN, format!("{what} must be 1-{MAX_ID_LEN} characters"));
    require!(
        id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_'),
        format!("{what} may only contain a-z, 0-9, '-' and '_'")
    );
}

fn require_valid_uri(uri: &str) {
    require!(uri.len() <= MAX_URI_LEN, format!("metadata_uri must be at most {MAX_URI_LEN} characters"));
}

/// NEP-297 event log.
fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    ));
}

/// Charges the caller for storage added since `initial_storage`, refunding any excess.
fn charge_storage(initial_storage: u64) {
    let used = env::storage_usage().saturating_sub(initial_storage);
    let cost = env::storage_byte_cost().saturating_mul(used as u128);
    let attached = env::attached_deposit();
    require!(attached >= cost, format!("Insufficient deposit for storage. Required: {} yoctoNEAR", cost.as_yoctonear()));
    let refund = attached.saturating_sub(cost);
    if refund > NearToken::from_yoctonear(0) {
        Promise::new(env::predecessor_account_id()).transfer(refund).detach();
    }
}

/// Returns the storage freed since `initial_storage` (plus the attached yoctoNEAR) to the caller.
fn refund_freed_storage(initial_storage: u64) {
    let freed = initial_storage.saturating_sub(env::storage_usage());
    let refund = env::storage_byte_cost().saturating_mul(freed as u128).saturating_add(env::attached_deposit());
    if refund > NearToken::from_yoctonear(0) {
        Promise::new(env::predecessor_account_id()).transfer(refund).detach();
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            minds: IterableMap::new(StorageKey::VersionedMinds),
            minds_by_owner: LookupMap::new(StorageKey::MindsByOwner),
            skills: LookupMap::new(StorageKey::VersionedSkills),
        }
    }

    /// Registers a Mind owned by the caller. Attach enough NEAR for storage; the excess is refunded.
    #[payable]
    pub fn register_mind(&mut self, mind_id: String, metadata_uri: String, wallet: AccountId) {
        require_valid_id(&mind_id, "mind_id");
        require_valid_uri(&metadata_uri);
        require!(!self.minds.contains_key(&mind_id), "mind_id is already registered");
        let owner = env::predecessor_account_id();
        let initial = env::storage_usage();

        self.minds.insert(mind_id.clone(), Mind { owner: owner.clone(), metadata_uri, wallet: wallet.clone(), skills: vec![] }.into());
        let mut owned = self.minds_by_owner.get(&owner).cloned().unwrap_or_default();
        require!(owned.len() < MAX_MINDS_PER_OWNER, format!("an account can own at most {MAX_MINDS_PER_OWNER} Minds"));
        owned.push(mind_id.clone());
        self.minds_by_owner.insert(owner.clone(), owned);
        self.minds.flush();
        self.minds_by_owner.flush();

        charge_storage(initial);
        emit("mind_registered", json!({ "mind_id": mind_id, "owner": owner, "wallet": wallet }));
    }

    /// Publishes a skill under the caller's account. Attach enough NEAR for storage.
    #[payable]
    pub fn publish_skill(&mut self, skill_id: String, metadata_uri: String, price: U128) {
        require_valid_id(&skill_id, "skill_id");
        require_valid_uri(&metadata_uri);
        require!(!self.skills.contains_key(&skill_id), "skill_id is already published");
        let publisher = env::predecessor_account_id();
        let initial = env::storage_usage();

        self.skills.insert(skill_id.clone(), Skill { publisher: publisher.clone(), metadata_uri, price }.into());
        self.skills.flush();

        charge_storage(initial);
        emit("skill_published", json!({ "skill_id": skill_id, "publisher": publisher, "price": price }));
    }

    /// Equips a published skill on a Mind the caller owns. Attach enough NEAR for storage.
    #[payable]
    pub fn equip_skill(&mut self, mind_id: String, skill_id: String) {
        require!(self.skills.contains_key(&skill_id), "skill_id is not published");
        let initial = env::storage_usage();
        let mut mind = self.owned_mind(&mind_id);
        require!(!mind.skills.contains(&skill_id), "skill is already equipped");
        require!(mind.skills.len() < MAX_SKILLS_PER_MIND, format!("a Mind can equip at most {MAX_SKILLS_PER_MIND} skills"));
        mind.skills.push(skill_id.clone());
        self.save_mind(&mind_id, mind);

        charge_storage(initial);
        emit("skill_equipped", json!({ "mind_id": mind_id, "skill_id": skill_id }));
    }

    /// Unequips a skill. Requires exactly 1 yoctoNEAR (a full-access key signature); freed storage is refunded.
    #[payable]
    pub fn unequip_skill(&mut self, mind_id: String, skill_id: String) {
        assert_one_yocto();
        let initial = env::storage_usage();
        let mut mind = self.owned_mind(&mind_id);
        let before = mind.skills.len();
        mind.skills.retain(|s| s != &skill_id);
        require!(mind.skills.len() < before, "skill is not equipped");
        self.save_mind(&mind_id, mind);

        refund_freed_storage(initial);
        emit("skill_unequipped", json!({ "mind_id": mind_id, "skill_id": skill_id }));
    }

    /// Points a Mind at a different wallet. Attach at least 1 yoctoNEAR (so a function-call key
    /// cannot call it), plus storage if the new address is longer; any excess is refunded.
    #[payable]
    pub fn set_wallet(&mut self, mind_id: String, wallet: AccountId) {
        require!(env::attached_deposit() >= NearToken::from_yoctonear(1), "Requires attached deposit of at least 1 yoctoNEAR");
        let initial = env::storage_usage();
        let mut mind = self.owned_mind(&mind_id);
        mind.wallet = wallet.clone();
        self.save_mind(&mind_id, mind);

        if env::storage_usage() > initial { charge_storage(initial) } else { refund_freed_storage(initial) }
        emit("wallet_set", json!({ "mind_id": mind_id, "wallet": wallet }));
    }

    pub fn get_mind(&self, mind_id: String) -> Option<Mind> {
        self.minds.get(&mind_id).cloned().map(Mind::from)
    }

    pub fn get_skill(&self, skill_id: String) -> Option<Skill> {
        self.skills.get(&skill_id).cloned().map(Skill::from)
    }

    /// Mind ids owned by `owner`, paginated (at most 50 per call).
    pub fn minds_of(&self, owner: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<String> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize;
        self.minds_by_owner.get(&owner).map(|ids| ids.iter().skip(from).take(limit).cloned().collect()).unwrap_or_default()
    }

    pub fn total_minds(&self) -> u32 {
        self.minds.len()
    }

    /// Loads a Mind as the latest record shape and checks the caller owns it.
    fn owned_mind(&self, mind_id: &String) -> Mind {
        let mind: Mind = self.minds.get(mind_id).cloned().unwrap_or_else(|| env::panic_str("mind_id is not registered")).into();
        require!(mind.owner == env::predecessor_account_id(), "only the Mind's owner can do this");
        mind
    }

    /// Stores a Mind as the latest version, upgrading any older record it replaces.
    fn save_mind(&mut self, mind_id: &str, mind: Mind) {
        self.minds.insert(mind_id.to_string(), mind.into());
        self.minds.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(caller: &str, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("registry.testnet")).predecessor_account_id(acc(caller)).signer_account_id(acc(caller)).attached_deposit(deposit);
        testing_env!(b.build());
    }

    const ONE_NEAR: NearToken = NearToken::from_near(1);

    fn setup() -> Contract {
        ctx("alice.testnet", ONE_NEAR);
        let mut c = Contract::new();
        c.register_mind("penny".into(), "ipfs://penny".into(), acc("penny-wallet.testnet"));
        ctx("bob.testnet", ONE_NEAR);
        c.publish_skill("pay".into(), "ipfs://pay".into(), U128(0));
        c
    }

    #[test]
    fn register_records_owner_wallet_and_emits_event() {
        let c = setup();
        let mind = c.get_mind("penny".into()).unwrap();
        assert_eq!(mind.owner, acc("alice.testnet"));
        assert_eq!(mind.wallet, acc("penny-wallet.testnet"));
        assert_eq!(c.minds_of(acc("alice.testnet"), None, None), vec!["penny".to_string()]);
        assert_eq!(c.total_minds(), 1);
        assert!(get_logs().iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"skill_published\"")));
    }

    #[test]
    #[should_panic(expected = "mind_id is already registered")]
    fn register_rejects_duplicate_id() {
        let mut c = setup();
        ctx("bob.testnet", ONE_NEAR);
        c.register_mind("penny".into(), "ipfs://x".into(), acc("x.testnet"));
    }

    #[test]
    #[should_panic(expected = "may only contain")]
    fn register_rejects_bad_id() {
        let mut c = setup();
        ctx("alice.testnet", ONE_NEAR);
        c.register_mind("Penny!".into(), "ipfs://x".into(), acc("x.testnet"));
    }

    #[test]
    #[should_panic(expected = "Insufficient deposit for storage")]
    fn register_requires_storage_deposit() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.register_mind("rex".into(), "ipfs://rex".into(), acc("rex-wallet.testnet"));
    }

    #[test]
    fn owner_equips_and_unequips() {
        let mut c = setup();
        ctx("alice.testnet", ONE_NEAR);
        c.equip_skill("penny".into(), "pay".into());
        assert_eq!(c.get_mind("penny".into()).unwrap().skills, vec!["pay".to_string()]);
        ctx("alice.testnet", NearToken::from_yoctonear(1));
        c.unequip_skill("penny".into(), "pay".into());
        assert!(c.get_mind("penny".into()).unwrap().skills.is_empty());
    }

    #[test]
    #[should_panic(expected = "only the Mind's owner can do this")]
    fn non_owner_cannot_equip() {
        let mut c = setup();
        ctx("bob.testnet", ONE_NEAR);
        c.equip_skill("penny".into(), "pay".into());
    }

    #[test]
    #[should_panic(expected = "skill_id is not published")]
    fn cannot_equip_unpublished_skill() {
        let mut c = setup();
        ctx("alice.testnet", ONE_NEAR);
        c.equip_skill("penny".into(), "nope".into());
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn unequip_requires_one_yocto() {
        let mut c = setup();
        ctx("alice.testnet", ONE_NEAR);
        c.equip_skill("penny".into(), "pay".into());
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.unequip_skill("penny".into(), "pay".into());
    }

    #[test]
    fn set_wallet_accepts_a_longer_address_when_storage_is_paid() {
        let mut c = setup();
        let long: AccountId = "a".repeat(64).parse().unwrap();
        ctx("alice.testnet", ONE_NEAR);
        c.set_wallet("penny".into(), long.clone());
        assert_eq!(c.get_mind("penny".into()).unwrap().wallet, long);
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of at least 1 yoctoNEAR")]
    fn set_wallet_rejects_zero_deposit() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0));
        c.set_wallet("penny".into(), acc("other.testnet"));
    }

    #[test]
    #[should_panic(expected = "an account can own at most 100 Minds")]
    fn owner_mind_count_is_capped() {
        let mut c = setup();
        for i in 0..100 {
            ctx("alice.testnet", ONE_NEAR);
            c.register_mind(format!("cap{i}"), "ipfs://m".into(), acc("w.testnet"));
        }
    }

    #[test]
    fn migrate_moves_v0_1_state_to_versioned_records() {
        use crate::migrate::ContractV0_1;
        use crate::versioned::{MindV1, SkillV1};
        // Build v0.1.0 state in storage exactly as the old contract wrote it.
        ctx("registry.testnet", NearToken::from_yoctonear(0));
        let mut old_minds: IterableMap<String, MindV1> = IterableMap::new(StorageKey::Minds);
        let mut by_owner: LookupMap<AccountId, Vec<String>> = LookupMap::new(StorageKey::MindsByOwner);
        let mut old_skills: LookupMap<String, SkillV1> = LookupMap::new(StorageKey::Skills);
        old_minds.insert("penny".into(), MindV1 { owner: acc("alice.testnet"), metadata_uri: "ipfs://penny".into(), wallet: acc("w.testnet"), skills: vec!["pay".into()] });
        by_owner.insert(acc("alice.testnet"), vec!["penny".into()]);
        old_skills.insert("pay".into(), SkillV1 { publisher: acc("bob.testnet"), metadata_uri: "ipfs://pay".into(), price: U128(5) });
        env::state_write(&ContractV0_1::for_test(old_minds, by_owner, old_skills));

        let c = Contract::migrate(vec!["pay".into()]);
        let mind = c.get_mind("penny".into()).unwrap();
        assert_eq!(mind.owner, acc("alice.testnet"));
        assert_eq!(mind.skills, vec!["pay".to_string()]);
        assert_eq!(c.get_skill("pay".into()).unwrap().price, U128(5));
        assert_eq!(c.minds_of(acc("alice.testnet"), None, None), vec!["penny".to_string()]);
        assert_eq!(c.total_minds(), 1);
        assert!(get_logs().iter().any(|l| l.contains("\"state_migrated\"")));
    }

    #[test]
    #[should_panic(expected = "skill_id not found in v0.1.0 state: typo")]
    fn migrate_rejects_unknown_skill_ids() {
        use crate::migrate::ContractV0_1;
        ctx("registry.testnet", NearToken::from_yoctonear(0));
        env::state_write(&ContractV0_1::for_test(IterableMap::new(StorageKey::Minds), LookupMap::new(StorageKey::MindsByOwner), LookupMap::new(StorageKey::Skills)));
        Contract::migrate(vec!["typo".into()]);
    }

    #[test]
    fn minds_of_is_paginated() {
        let mut c = setup();
        for i in 0..5 {
            ctx("alice.testnet", ONE_NEAR);
            c.register_mind(format!("m{i}"), "ipfs://m".into(), acc("w.testnet"));
        }
        let all = c.minds_of(acc("alice.testnet"), None, None);
        assert_eq!(all.len(), 6);
        assert_eq!(c.minds_of(acc("alice.testnet"), Some(2), Some(2)), vec!["m1".to_string(), "m2".to_string()]);
        assert!(c.minds_of(acc("nobody.testnet"), None, None).is_empty());
    }
}
