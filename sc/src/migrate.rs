// State migration (docs.near.org/smart-contracts/release/upgrade, "Migrating the State").
// Deploy the new code and call `migrate` in the same transaction.
use crate::versioned::{MindV1, SkillV1, VersionedMind, VersionedSkill};
use crate::*;

/// Contract state exactly as v0.1.0 stored it (deployed to hellonear-registry.testnet on
/// 3 Nov 2026). Keep it while any deployment may still hold this layout.
#[near(serializers = [borsh])]
pub struct ContractV0_1 {
    minds: IterableMap<String, MindV1>,
    minds_by_owner: LookupMap<AccountId, Vec<String>>,
    skills: LookupMap<String, SkillV1>,
}

#[near]
impl Contract {
    /// Migrates v0.1.0 state to versioned records. Only the contract account can call it.
    ///
    /// v0.1.0 stored skills in a `LookupMap`, which cannot be iterated, so the caller passes
    /// every published `skill_id` (from the `skill_published` NEP-297 events). An id that is
    /// not in the old state aborts the migration, so a typo cannot silently drop data.
    /// Gas grows with the number of Minds; fine for testnet sizes, batch it for large state.
    #[private]
    #[init(ignore_state)]
    pub fn migrate(skill_ids: Vec<String>) -> Self {
        let mut old: ContractV0_1 = env::state_read().unwrap_or_else(|| env::panic_str("no v0.1.0 state to migrate"));

        let mut minds: IterableMap<String, VersionedMind> = IterableMap::new(StorageKey::VersionedMinds);
        for (id, mind) in old.minds.iter() {
            minds.insert(id.clone(), VersionedMind::V1(mind.clone()));
        }
        let mind_count = minds.len();
        old.minds.clear();

        let mut skills: LookupMap<String, VersionedSkill> = LookupMap::new(StorageKey::VersionedSkills);
        for id in &skill_ids {
            let skill = old.skills.remove(id).unwrap_or_else(|| env::panic_str(&format!("skill_id not found in v0.1.0 state: {id}")));
            skills.insert(id.clone(), VersionedSkill::V1(skill));
        }

        old.minds.flush();
        old.skills.flush();
        minds.flush();
        skills.flush();

        emit("state_migrated", json!({ "from": "0.1.0", "to": env!("CARGO_PKG_VERSION"), "minds": mind_count, "skills": skill_ids.len() }));
        Self { minds, minds_by_owner: old.minds_by_owner, skills }
    }
}

#[cfg(test)]
impl ContractV0_1 {
    pub fn for_test(minds: IterableMap<String, MindV1>, minds_by_owner: LookupMap<AccountId, Vec<String>>, skills: LookupMap<String, SkillV1>) -> Self {
        Self { minds, minds_by_owner, skills }
    }
}
