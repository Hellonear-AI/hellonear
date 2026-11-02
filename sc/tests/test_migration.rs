// Upgrade test on a local NEAR sandbox: v0.1.0 (the WASM live on hellonear-registry.testnet,
// tests/fixtures/registry-v0.1.0.wasm, code hash 7Xp6eabRy8NTfAdg3WMfuWpMpoQgZSxLewTudwCouwV9)
// → current code + `migrate` in the same transaction. Data written by v0.1.0 must survive.
use near_api::{AccountId, NearToken};
use near_sdk::serde_json::{Value, json};

async fn create_account(sandbox: &near_sandbox::Sandbox, name: &str) -> testresult::TestResult<near_api::Account> {
    let id: AccountId = name.parse()?;
    sandbox.create_account(id.clone()).initial_balance(NearToken::from_near(10)).send().await?;
    Ok(near_api::Account(id))
}

#[tokio::test]
async fn upgrade_from_v0_1_keeps_all_data() -> testresult::TestResult<()> {
    let v0_1 = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/registry-v0.1.0.wasm"))?;
    let current = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    let alice = create_account(&sandbox, "alice.sandbox").await?;
    let contract = create_account(&sandbox, "registry.sandbox").await?.as_contract();
    let call = |method: &str, args: Value, deposit: NearToken, who: &near_api::Account| {
        contract.call_function(method, args).transaction().deposit(deposit).with_signer(who.account_id().clone(), signer.clone())
    };

    // 1. v0.1.0 with data, like testnet today.
    near_api::Contract::deploy(contract.account_id().clone()).use_code(v0_1).with_init_call("new", json!({}))?.with_signer(signer.clone()).send_to(&net).await?.assert_success();
    call("publish_skill", json!({ "skill_id": "pay", "metadata_uri": "ipfs://pay", "price": "7" }), NearToken::from_near(1), &alice).send_to(&net).await?.assert_success();
    call("register_mind", json!({ "mind_id": "penny", "metadata_uri": "ipfs://penny", "wallet": "penny-wallet.sandbox" }), NearToken::from_near(1), &alice).send_to(&net).await?.assert_success();
    call("equip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }), NearToken::from_near(1), &alice).send_to(&net).await?.assert_success();
    let before: Value = contract.call_function("get_mind", json!({ "mind_id": "penny" })).read_only().fetch_from(&net).await?.data;

    // 2. Upgrade: new code + migrate in one transaction, signed by the contract account.
    let upgrade = near_api::Contract::deploy(contract.account_id().clone())
        .use_code(current)
        .with_init_call("migrate", json!({ "skill_ids": ["pay"] }))?
        .with_signer(signer.clone())
        .send_to(&net)
        .await?;
    let logs: Vec<String> = upgrade.logs().into_iter().map(|l| l.to_string()).collect();
    upgrade.assert_success();
    assert!(logs.iter().any(|l| l.contains("\"state_migrated\"")), "migration event: {logs:?}");

    // 3. Everything v0.1.0 wrote is still readable, unchanged.
    let after: Value = contract.call_function("get_mind", json!({ "mind_id": "penny" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(after, before);
    let skill: Value = contract.call_function("get_skill", json!({ "skill_id": "pay" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(skill["price"], "7");
    let ids: Vec<String> = contract.call_function("minds_of", json!({ "owner": "alice.sandbox" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(ids, vec!["penny".to_string()]);
    let total: u32 = contract.call_function("total_minds", json!({})).read_only().fetch_from(&net).await?.data;
    assert_eq!(total, 1);

    // 4. The upgraded contract keeps working, and migrate is private.
    call("unequip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }), NearToken::from_yoctonear(1), &alice).send_to(&net).await?.assert_success();
    call("register_mind", json!({ "mind_id": "rex", "metadata_uri": "ipfs://rex", "wallet": "rex-wallet.sandbox" }), NearToken::from_near(1), &alice).send_to(&net).await?.assert_success();
    call("migrate", json!({ "skill_ids": [] }), NearToken::from_yoctonear(0), &alice).send_to(&net).await?.assert_failure();
    let ids: Vec<String> = contract.call_function("minds_of", json!({ "owner": "alice.sandbox" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(ids, vec!["penny".to_string(), "rex".to_string()]);
    Ok(())
}
