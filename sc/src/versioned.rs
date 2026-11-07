// Versioned records (docs.near.org/smart-contracts/release/upgrade, "State versioning";
// pattern from near-examples/update-migrate-rust/enum-updates).
//
// Every stored Mind and Skill is an enum variant, so a future version can add a variant
// (e.g. `MindV2`) and convert old records when they are read, without rewriting all of
// storage in one migration. Never remove or reorder variants that may still be stored.
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct MindV1 {
    pub owner: AccountId,
    pub metadata_uri: String,
    /// The Mind's own wallet (an OutLayer address on NEAR).
    pub wallet: AccountId,
    pub skills: Vec<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct SkillV1 {
    pub publisher: AccountId,
    pub metadata_uri: String,
    /// Price in yoctoNEAR, paid to `publisher` by the owner on every `equip_skill` (#56).
    pub price: U128,
}

/// The latest record shapes. Views and methods work with these.
pub type Mind = MindV1;
pub type Skill = SkillV1;

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub enum VersionedMind {
    V1(MindV1),
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub enum VersionedSkill {
    V1(SkillV1),
}

impl From<VersionedMind> for Mind {
    fn from(v: VersionedMind) -> Self {
        match v {
            VersionedMind::V1(m) => m,
        }
    }
}

impl From<Mind> for VersionedMind {
    fn from(m: Mind) -> Self {
        VersionedMind::V1(m)
    }
}

impl From<VersionedSkill> for Skill {
    fn from(v: VersionedSkill) -> Self {
        match v {
            VersionedSkill::V1(s) => s,
        }
    }
}

impl From<Skill> for VersionedSkill {
    fn from(s: Skill) -> Self {
        VersionedSkill::V1(s)
    }
}
