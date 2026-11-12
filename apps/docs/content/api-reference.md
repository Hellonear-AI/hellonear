---
title: API reference
description: Every route of the HelloNear backend API, rendered from the OpenAPI spec, with the hosted server at https://api.hellonear.xyz.
---

The HelloNear backend API is described by an OpenAPI 3 spec, kept in the repository at [`docs/openapi.json`](https://github.com/Hellonear-AI/hellonear/blob/main/docs/openapi.json) and served here at [/openapi.json](/openapi.json). The prose contract, with every field and event, is [`docs/api-contract.md`](https://github.com/Hellonear-AI/hellonear/blob/main/docs/api-contract.md).

- **Server:** `https://api.hellonear.xyz` (NEAR testnet), or `http://localhost:4000` when you [run it locally](/run-locally).
- **Auth:** every route except health, status and auth needs the session cookie `hn_session`. Get one as a guest with `POST /v1/auth/demo`, or sign in with a NEAR wallet (NEP-413).
- **Errors:** `{ error, ...details }` with an HTTP status. See [Errors](/errors).
- **Streams:** chat, approval and workflow runs answer with server-sent events. See [Streaming events](/events).

A worked example with curl is in the [Quickstart](/quickstart#through-the-api), and every route in a table is in the [API overview](/api).
