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

// #56: equipping a priced skill pays its publisher. Balances are read from the chain, so this is
// what a real owner and publisher would see.
#[tokio::test]
async fn equip_pays_the_skill_publisher() -> testresult::TestResult<()> {
    let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;

    let alice = create_account(&sandbox, "alice.sandbox").await?;
    let bob = create_account(&sandbox, "bob.sandbox").await?;
    let carol = create_account(&sandbox, "carol.sandbox").await?;
    let contract = create_account(&sandbox, "registry.sandbox").await?.as_contract();
    near_api::Contract::deploy(contract.account_id().clone())
        .use_code(wasm)
        .with_init_call("new", json!({}))?
        .with_signer(signer.clone())
        .send_to(&net)
        .await?
        .assert_success();
    let balance = |a: &near_api::Account| {
        let (a, net) = (a.clone(), net.clone());
        async move { a.tokens().near_balance().fetch_from(&net).await.map(|b| b.total) }
    };
    let call = |method: &str, args: Value, deposit: NearToken, who: &near_api::Account| {
        contract.call_function(method, args).transaction().deposit(deposit).with_signer(who.account_id().clone(), signer.clone()).send_to(&net)
    };
    let price = NearToken::from_millinear(500);

    call("register_mind", json!({ "mind_id": "penny", "metadata_uri": "ipfs://penny", "wallet": "penny-wallet.sandbox" }), NearToken::from_near(1), &alice).await?.assert_success();
    call("publish_skill", json!({ "skill_id": "pro", "metadata_uri": "ipfs://pro", "price": price.as_yoctonear().to_string() }), NearToken::from_near(1), &bob).await?.assert_success();

    // Too little deposit: fails, nothing stored, the publisher gets nothing, the owner only pays gas.
    let (alice0, bob0) = (balance(&alice).await?, balance(&bob).await?);
    call("equip_skill", json!({ "mind_id": "penny", "skill_id": "pro" }), NearToken::from_millinear(400), &alice).await?.assert_failure();
    let mind: Value = contract.call_function("get_mind", json!({ "mind_id": "penny" })).read_only().fetch_from(&net).await?.data;
    assert_eq!(mind["skills"], json!([]));
    assert_eq!(balance(&bob).await?, bob0);
    let spent = alice0.saturating_sub(balance(&alice).await?);
    assert!(spent < NearToken::from_millinear(5), "deposit refunded, spent only gas: {spent}");

    // Enough deposit: the publisher's balance goes up by exactly the price, the excess comes back.
    let alice0 = balance(&alice).await?;
    let paid = call("equip_skill", json!({ "mind_id": "penny", "skill_id": "pro" }), NearToken::from_near(1), &alice).await?;
    let logs: Vec<String> = paid.logs().into_iter().map(|l| l.to_string()).collect();
    let paid = paid.assert_success();
    println!("equip_skill with a price: gas burnt {}", paid.total_gas_burnt);
    assert!(logs.iter().any(|l| l.contains("\"skill_equipped\"") && l.contains(&format!("\"price\":\"{}\"", price.as_yoctonear())) && l.contains("\"publisher\":\"bob.sandbox\"")), "{logs:?}");
    assert_eq!(balance(&bob).await?, bob0.saturating_add(price));
    let spent = alice0.saturating_sub(balance(&alice).await?);
    println!("owner spent on a 0.5 NEAR skill: {spent}");
    assert!(spent > price && spent < price.saturating_add(NearToken::from_millinear(10)), "price + storage + gas, excess refunded: {spent}");

    // Unequip, then equip again: pays again (the contract keeps no record of past payments).
    call("unequip_skill", json!({ "mind_id": "penny", "skill_id": "pro" }), NearToken::from_yoctonear(1), &alice).await?.assert_success();
    call("equip_skill", json!({ "mind_id": "penny", "skill_id": "pro" }), NearToken::from_near(1), &alice).await?.assert_success();
    assert_eq!(balance(&bob).await?, bob0.saturating_add(price).saturating_add(price));

    // The publisher deleted their account: the transfer fails and the owner gets the price back.
    call("publish_skill", json!({ "skill_id": "gone", "metadata_uri": "ipfs://gone", "price": price.as_yoctonear().to_string() }), NearToken::from_near(1), &carol).await?.assert_success();
    carol.delete_account_with_beneficiary(bob.account_id().clone()).with_signer(signer.clone()).send_to(&net).await?.assert_success();
    let alice0 = balance(&alice).await?;
    let refunded = call("equip_skill", json!({ "mind_id": "penny", "skill_id": "gone" }), NearToken::from_near(1), &alice).await?;
    let logs: Vec<String> = refunded.logs().into_iter().map(|l| l.to_string()).collect();
    assert!(logs.iter().any(|l| l.contains("\"skill_payment_refunded\"")), "{logs:?}");
    let spent = alice0.saturating_sub(balance(&alice).await?);
    println!("owner spent when the publisher is gone: {spent}");
    assert!(spent < NearToken::from_millinear(10), "price refunded, spent only storage + gas: {spent}");
    Ok(())
}
