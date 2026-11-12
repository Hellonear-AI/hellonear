---
title: Errors
description: The shape of every error the HelloNear API returns, what each status means, and the codes you are most likely to meet.
---

Every error is JSON: `{ "error": "<code>", ...details }` with an HTTP status. The `error` code is stable; details depend on the code.

## Status codes

| Status | Meaning |
|---|---|
| `400` | The request is wrong: `invalid_json`, `invalid_body`, an unknown skill, an unknown time zone |
| `401` | `unauthorized` (no session or an expired one), `invalid_signature`, `invalid_nonce` (wallet sign-in) |
| `403` | Not allowed: `bad_origin` (a state-changing request from an origin not in `FE_ORIGIN`), `demo_not_allowed` (an owner action from a try-out user) |
| `404` | Not found. **Another user's Mind or run answers `404`, never `403`**, so ids cannot be probed |
| `409` | A conflict with the current state, such as `not_awaiting_approval`, `not_running`, `thread_busy`, `wallet_not_empty`, `already_connected` |
| `413` | `body_too_large` (bodies are at most 256 KB) |
| `422` | `not_a_quote` (TEE Explorer upload of anything but a hex quote) |
| `429` | A rate limit: `demo_run_limit`, `demo_rate_limited`, `relay_rate_limited`, `mail_rate_limited` |
| `503` | A service HelloNear depends on failed |

## Why 503 and never 502

When OutLayer, Composio, the engine or the NEAR RPC fails, the answer is **`503`**, never `502`. Behind Cloudflare a `502` or `504` body is replaced by Cloudflare's own HTML page, so the caller would lose the error. Two families:

- `…_error`: the service answered with a failure; details carry its status (for example `outlayerStatus`, `composioStatus`).
- `…_unreachable` and `engine_unavailable`: no answer; details carry `reason` (`timeout` or a network code such as `ECONNREFUSED`).

Every 5xx is logged on the server as one line with the route, code and details, never keys.

## Payment results

A payment refused by the wallet is not an HTTP error of your request; it is the tool's result inside the run:

| Result | Meaning |
|---|---|
| `policy_denied` | Over the per-payment or daily limit, or to an address not on the list. Refused in the TEE before signing, so there is **no transaction** |
| `wallet_frozen` | The owner froze the wallet. No transaction |
| `pending_approval` | The wallet's own approval threshold applies; it resolves to `success` with a `tx_hash`, or `failed` |

Never show a transaction link, or "rejected on-chain", for a refused payment.

## Run errors

A run that fails sends a `run.error` event with a code, for example `run_interrupted` when a backend restarted mid-run. See [Streaming events](/events).

The full list of codes per route is in [`docs/api-contract.md`](https://github.com/Hellonear-AI/hellonear/blob/main/docs/api-contract.md) §7.
