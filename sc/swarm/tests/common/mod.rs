// A local NEAR sandbox with one parent account and every agent as a real sub-account of it, created by a
// CreateAccount transaction signed by the parent (as on testnet), so each action traces back to one agent.
#![allow(dead_code)]
use near_api::{AccountId, NearToken};
use near_sdk::serde_json::{Value, json};

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

pub struct Swarm {
    pub sandbox: near_sandbox::Sandbox,
    pub net: near_api::NetworkConfig,
    pub signer: std::sync::Arc<near_api::Signer>,
    pub parent: AccountId,
    pub contract: near_api::Contract,
}

impl Swarm {
    /// Starts a sandbox, makes `swarm.sandbox`, deploys the contract to `auction.swarm.sandbox` with `new`.
    pub async fn start() -> testresult::TestResult<Self> {
        let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
        let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
        let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = near_api::Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        let parent: AccountId = "swarm.sandbox".parse()?;
        sandbox.create_account(parent.clone()).initial_balance(NearToken::from_near(5_000)).send().await?;
        // Right after start the patched key can still be missing (seen at block 1); wait until final blocks show it (signing reads the nonce there).
        let pk: near_api::PublicKey = near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PUBLIC_KEY.parse()?;
        for _ in 0..50 {
            if near_api::Account(parent.clone()).access_key(pk).at(near_api::Reference::Final).fetch_from(&net).await.is_ok() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        let swarm = Self { sandbox, net, signer, parent: parent.clone(), contract: near_api::Contract("auction.swarm.sandbox".parse()?) };
        swarm.sub_account("auction", 10).await?;
        near_api::Contract::deploy(swarm.contract.account_id().clone())
            .use_code(wasm)
            .with_init_call("new", json!({}))?
            .with_signer(swarm.signer.clone())
            .send_to(&swarm.net)
            .await?
            .assert_success();
        Ok(swarm)
    }

    /// Creates `<name>.swarm.sandbox` with a CreateAccount transaction from the parent.
    pub async fn sub_account(&self, name: &str, near: u128) -> testresult::TestResult<AccountId> {
        let id: AccountId = format!("{name}.{}", self.parent).parse()?;
        let pk: near_api::PublicKey = near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PUBLIC_KEY.parse()?;
        near_api::Account::create_account(id.clone())
            .fund_myself(self.parent.clone(), NearToken::from_near(near))
            .with_public_key(pk)
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?
            .assert_success();
        Ok(id)
    }

    /// A call signed by `who`, with a deposit in yoctoNEAR and up to 300 Tgas.
    pub async fn call(&self, who: &AccountId, method: &str, args: Value, deposit: u128) -> testresult::TestResult<near_api::types::transaction::result::TransactionResult> {
        Ok(self
            .contract
            .call_function(method, args)
            .transaction()
            .deposit(NearToken::from_yoctonear(deposit))
            .gas(near_api::NearGas::from_tgas(300))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await?)
    }

    pub async fn view(&self, method: &str, args: Value) -> testresult::TestResult<Value> {
        Ok(self.contract.call_function(method, args).read_only::<Value>().fetch_from(&self.net).await?.data)
    }

    pub async fn near_of(&self, who: &AccountId) -> testresult::TestResult<u128> {
        Ok(near_api::Tokens::account(who.clone()).near_balance().fetch_from(&self.net).await?.total.as_yoctonear())
    }
}

/// The commitment a seller sends, computed by the contract's own view so the hash matches exactly.
pub async fn commitment(swarm: &Swarm, ask: u128, capacity: u32, salt: &str) -> testresult::TestResult<String> {
    Ok(swarm.view("commitment_for", json!({ "ask_per_unit": ask.to_string(), "capacity": capacity, "salt": salt })).await?.as_str().unwrap_or_default().to_string())
}

pub fn u(v: &Value) -> u128 {
    v.as_str().and_then(|s| s.parse().ok()).unwrap_or(0)
}
