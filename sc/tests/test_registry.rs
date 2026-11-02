// Integration test on a local NEAR sandbox chain: deploys the real WASM and calls it
// with real transactions (pattern from the cargo-near template).
use near_api::{AccountId, NearToken};
use near_sdk::serde_json::{Value, json};

async fn create_account(sandbox: &near_sandbox::Sandbox, name: &str) -> testresult::TestResult<near_api::Account> {
    let id: AccountId = name.parse()?;
    sandbox.create_account(id.clone()).initial_balance(NearToken::from_near(10)).send().await?;
    Ok(near_api::Account(id))
}

#[tokio::test]
async fn registry_works_on_a_real_chain() -> testresult::TestResult<()> {
    let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;

    let alice = create_account(&sandbox, "alice.sandbox").await?;
    let bob = create_account(&sandbox, "bob.sandbox").await?;
    let contract = create_account(&sandbox, "registry.sandbox").await?.as_contract();

    near_api::Contract::deploy(contract.account_id().clone())
        .use_code(wasm)
        .with_init_call("new", json!({}))?
        .with_signer(signer.clone())
        .send_to(&net)
        .await?
        .assert_success();

    // Register with 1 NEAR attached: storage is charged and the rest refunded.
    let before = alice.tokens().near_balance().fetch_from(&net).await?.total;
    let reg = contract
        .call_function("register_mind", json!({ "mind_id": "penny", "metadata_uri": "ipfs://penny", "wallet": "penny-wallet.sandbox" }))
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(alice.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?;
    let logs: Vec<String> = reg.logs().into_iter().map(|l| l.to_string()).collect();
    reg.assert_success();
    assert!(logs.iter().any(|l| l.starts_with("EVENT_JSON:") && l.contains("\"mind_registered\"")), "NEP-297 event: {logs:?}");
    let after = alice.tokens().near_balance().fetch_from(&net).await?.total;
    let spent = before.saturating_sub(after);
    assert!(spent < NearToken::from_millinear(100), "excess deposit refunded, spent only {spent}");
    assert!(spent > NearToken::from_yoctonear(0));

    let mind: Value = contract.call_function("get_mind", json!({ "mind_id": "penny" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(mind["owner"], "alice.sandbox");
    assert_eq!(mind["wallet"], "penny-wallet.sandbox");

    // Without a storage deposit the call fails.
    contract
        .call_function("register_mind", json!({ "mind_id": "rex", "metadata_uri": "ipfs://rex", "wallet": "rex.sandbox" }))
        .transaction()
        .with_signer(alice.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_failure();

    // Bob publishes a skill; Bob cannot equip it on Alice's Mind, Alice can.
    contract
        .call_function("publish_skill", json!({ "skill_id": "pay", "metadata_uri": "ipfs://pay", "price": "0" }))
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(bob.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_success();
    contract
        .call_function("equip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }))
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(bob.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_failure();
    contract
        .call_function("equip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }))
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(alice.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_success();
    let mind: Value = contract.call_function("get_mind", json!({ "mind_id": "penny" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(mind["skills"], json!(["pay"]));

    // Unequip needs exactly 1 yoctoNEAR.
    contract
        .call_function("unequip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }))
        .transaction()
        .with_signer(alice.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_failure();
    contract
        .call_function("unequip_skill", json!({ "mind_id": "penny", "skill_id": "pay" }))
        .transaction()
        .deposit(NearToken::from_yoctonear(1))
        .with_signer(alice.account_id().clone(), signer.clone())
        .send_to(&net)
        .await?
        .assert_success();

    let ids: Vec<String> = contract.call_function("minds_of", json!({ "owner": "alice.sandbox" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(ids, vec!["penny".to_string()]);
    Ok(())
}
