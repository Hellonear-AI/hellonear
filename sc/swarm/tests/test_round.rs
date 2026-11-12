// One full round on a local NEAR sandbox, with the numbers of RULES.md's worked example and real transfers.
mod common;
use common::{NEAR, Swarm, commitment, u};
use near_sdk::serde_json::json;

#[tokio::test]
async fn worked_example_settles_and_pays_out() -> testresult::TestResult<()> {
    let swarm = Swarm::start().await?;
    let org = swarm.sub_account("coordinator", 5).await?;
    let b1 = swarm.sub_account("buyer-1", 20).await?;
    let b2 = swarm.sub_account("buyer-2", 20).await?;
    let mut sellers = vec![];
    for i in 1..=4 {
        sellers.push(swarm.sub_account(&format!("seller-{i}"), 5).await?);
    }
    let slack = NEAR / 10; // storage; the excess comes back

    let opened = swarm.call(&org, "open_round", json!({ "item": "gpu-hours", "max_price_per_unit": (3 * NEAR).to_string(), "deadline_minutes": 60 }), slack).await?;
    assert!(opened.logs().iter().any(|l| l.contains("\"round_opened\"")));
    let id: u64 = opened.assert_success().json()?;

    swarm.call(&b1, "join", json!({ "round_id": id, "units": 4 }), 12 * NEAR + slack).await?.assert_success();
    swarm.call(&b2, "join", json!({ "round_id": id, "units": 3 }), 9 * NEAR + slack).await?.assert_success();
    // Too little escrow is refused, and the deposit comes back.
    let short = swarm.call(&b2, "join", json!({ "round_id": id, "units": 1 }), NEAR).await?;
    assert!(short.is_failure());

    let asks = [(2 * NEAR, 5, "s1-salt"), (25 * NEAR / 10, 5, "s2-salt"), (4 * NEAR, 5, "s3-salt"), (NEAR, 5, "s4-never-reveals")];
    for (s, (ask, cap, salt)) in sellers.iter().zip(asks) {
        let c = commitment(&swarm, ask, cap, salt).await?;
        swarm.call(s, "commit", json!({ "round_id": id, "commitment": c }), slack).await?.assert_success();
    }
    // Before the reveal, nobody can see an ask on chain.
    let open = swarm.view("get_round", json!({ "round_id": id })).await?;
    assert!(open["sellers"].as_array().unwrap().iter().all(|s| s["ask_per_unit"].is_null()));

    assert!(swarm.call(&b1, "start_reveal", json!({ "round_id": id }), 0).await?.is_failure(), "only the organizer");
    swarm.call(&org, "start_reveal", json!({ "round_id": id }), 0).await?.assert_success();
    // A seller cannot change its ask after seeing the others.
    assert!(swarm.call(&sellers[0], "reveal", json!({ "round_id": id, "ask_per_unit": NEAR.to_string(), "capacity": 5, "salt": "s1-salt" }), 0).await?.is_failure());
    for (s, (ask, cap, salt)) in sellers.iter().zip(asks).take(3) {
        swarm.call(s, "reveal", json!({ "round_id": id, "ask_per_unit": ask.to_string(), "capacity": cap, "salt": salt }), 0).await?.assert_success();
    }

    let closed = swarm.call(&org, "close_round", json!({ "round_id": id }), 0).await?;
    assert!(closed.logs().iter().any(|l| l.contains("\"round_closed\"")));
    closed.assert_success();
    let r = swarm.view("get_round", json!({ "round_id": id })).await?;
    assert_eq!(r["phase"], "Closed");
    assert_eq!(u(&r["clearing_price"]), 25 * NEAR / 10);
    assert_eq!(r["filled"], 7);

    let expected = [(&b1, 2 * NEAR), (&b2, 15 * NEAR / 10), (&sellers[0], 125 * NEAR / 10), (&sellers[1], 5 * NEAR), (&sellers[2], 0), (&sellers[3], 0)];
    for (who, amount) in expected {
        assert_eq!(u(&swarm.view("balance_of", json!({ "account_id": who })).await?), amount, "{who}");
    }

    // Pull the payout: the NEAR really arrives, and the balance goes to zero.
    let before = swarm.near_of(&sellers[0]).await?;
    swarm.call(&sellers[0], "withdraw", json!({}), 0).await?.assert_success();
    let gained = swarm.near_of(&sellers[0]).await? - before;
    assert!(gained > 125 * NEAR / 10 - NEAR / 100 && gained <= 125 * NEAR / 10, "seller-1 gained {gained}");
    assert_eq!(u(&swarm.view("balance_of", json!({ "account_id": sellers[0] })).await?), 0);
    assert!(swarm.call(&sellers[3], "withdraw", json!({}), 0).await?.is_failure(), "the bluffer earned nothing");
    Ok(())
}
