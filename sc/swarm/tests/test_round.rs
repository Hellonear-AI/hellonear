// One full round on a local NEAR sandbox, with the numbers of RULES.md's worked example and real transfers.
mod common;
use common::{NEAR, Swarm, commitment, u};
use near_sdk::serde_json::json;

const BOND: u128 = NEAR / 10;

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
    // Measured once the deploy (signed by the contract account itself) has settled.
    let free_at_start = swarm.contract_free().await?;

    let opened = swarm
        .call(&org, "open_round", json!({ "item": "gpu-hours", "max_price_per_unit": (3 * NEAR).to_string(), "seller_bond": BOND.to_string(), "commit_minutes": 10, "reveal_minutes": 10 }), slack)
        .await?;
    assert!(opened.logs().iter().any(|l| l.contains("\"round_opened\"")));
    let id: u64 = opened.assert_success().json()?;

    swarm.call(&b1, "join", json!({ "round_id": id, "units": 4 }), 12 * NEAR + slack).await?.assert_success();
    swarm.call(&b2, "join", json!({ "round_id": id, "units": 3 }), 9 * NEAR + slack).await?.assert_success();
    // Too little escrow is refused, and the deposit comes back.
    assert!(swarm.call(&b2, "join", json!({ "round_id": id, "units": 1 }), NEAR).await?.is_failure());

    let asks = [(2 * NEAR, 5, "s1-salt-sixteen-ch"), (25 * NEAR / 10, 5, "s2-salt-sixteen-ch"), (4 * NEAR, 5, "s3-salt-sixteen-ch"), (NEAR, 5, "s4-never-reveals!!")];
    // A commit without the bond is refused.
    let c0 = commitment(&swarm, id, &sellers[0], asks[0].0, asks[0].1, asks[0].2).await?;
    assert!(swarm.call(&sellers[0], "commit", json!({ "round_id": id, "commitment": c0 }), BOND / 2).await?.is_failure());
    for (s, (ask, cap, salt)) in sellers.iter().zip(asks) {
        let c = commitment(&swarm, id, s, ask, cap, salt).await?;
        swarm.call(s, "commit", json!({ "round_id": id, "commitment": c }), BOND + slack).await?.assert_success();
    }
    // Before the reveal, nobody can see an ask on chain, and nobody can reveal yet.
    let open = swarm.view("get_round", json!({ "round_id": id })).await?;
    assert!(open["sellers"].as_array().unwrap().iter().all(|s| s["ask_per_unit"].is_null()));
    assert!(swarm.call(&sellers[0], "reveal", json!({ "round_id": id, "ask_per_unit": asks[0].0.to_string(), "capacity": 5, "salt": asks[0].2 }), 0).await?.is_failure(), "too early");

    swarm.advance_minutes(10).await?;
    assert_eq!(swarm.view("stage", json!({ "round_id": id })).await?, "reveal");
    // A seller cannot change its ask after seeing the others.
    assert!(swarm.call(&sellers[0], "reveal", json!({ "round_id": id, "ask_per_unit": NEAR.to_string(), "capacity": 5, "salt": asks[0].2 }), 0).await?.is_failure());
    for (s, (ask, cap, salt)) in sellers.iter().zip(asks).take(3) {
        swarm.call(s, "reveal", json!({ "round_id": id, "ask_per_unit": ask.to_string(), "capacity": cap, "salt": salt }), 0).await?.assert_success();
    }
    // seller-4 never reveals, so nobody can close before the window ends: not even the organizer.
    assert!(swarm.call(&org, "close_round", json!({ "round_id": id }), 0).await?.is_failure());

    swarm.advance_minutes(10).await?;
    // Anyone can close once the window is over: here buyer-2 does.
    let closed = swarm.call(&b2, "close_round", json!({ "round_id": id }), 0).await?;
    assert!(closed.logs().iter().any(|l| l.contains("\"round_closed\"")));
    closed.assert_success();
    let r = swarm.view("get_round", json!({ "round_id": id })).await?;
    assert_eq!(r["phase"], "Closed");
    assert_eq!(u(&r["clearing_price"]), 25 * NEAR / 10);
    assert_eq!(r["filled"], 7);
    assert_eq!(u(&r["forfeited"]), BOND);

    // The bluffer's bond goes to the buyers by units (4/7 and 3/7, the dust to the first).
    let (bonus1, bonus2) = (BOND - BOND * 3 / 7, BOND * 3 / 7);
    let expected = [
        (&b1, 2 * NEAR + bonus1),
        (&b2, 15 * NEAR / 10 + bonus2),
        (&sellers[0], 125 * NEAR / 10 + BOND),
        (&sellers[1], 5 * NEAR + BOND),
        (&sellers[2], BOND),
        (&sellers[3], 0),
    ];
    for (who, amount) in expected {
        assert_eq!(u(&swarm.view("balance_of", json!({ "account_id": who })).await?), amount, "{who}");
    }

    // Pull the payout (1 yoctoNEAR, as the contract asks): the NEAR really arrives, and the balance goes to zero.
    assert!(swarm.call(&sellers[0], "withdraw", json!({}), 0).await?.is_failure(), "withdraw needs 1 yoctoNEAR");
    let before = swarm.near_of(&sellers[0]).await?;
    swarm.call(&sellers[0], "withdraw", json!({}), 1).await?.assert_success();
    let gained = swarm.near_of(&sellers[0]).await? - before;
    let owed = 125 * NEAR / 10 + BOND;
    assert!(gained > owed - NEAR / 100 && gained <= owed, "seller-1 gained {gained}");
    assert_eq!(u(&swarm.view("balance_of", json!({ "account_id": sellers[0] })).await?), 0);
    assert!(swarm.call(&sellers[3], "withdraw", json!({}), 1).await?.is_failure(), "the bluffer has nothing left");

    // The contract never paid storage out of its own balance or the escrow (audit finding 5).
    let mut held = 0u128;
    for who in [&b1, &b2, &sellers[1], &sellers[2], &org] {
        held += u(&swarm.view("balance_of", json!({ "account_id": who })).await?);
    }
    let free = swarm.contract_free().await?;
    assert!(free >= free_at_start + held, "free {free} < start {free_at_start} + still held {held}");
    Ok(())
}
