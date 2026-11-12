---
title: FAQ
description: Answers about security, data processing, model training, wallets and funds, taken only from what HelloNear's code does.
---

## Security

### Can the AI pay someone the owner did not approve?
No payment tool runs without the owner's approval, unless the owner turned on a rule for small payments to listed addresses. Even after approval, OutLayer checks the wallet policy in a TEE before signing and refuses a payment over the limit or to an address not on the list. See [Wallet, limits and approvals](/wallet-and-approvals).

### How are API keys stored?
Encrypted with AES-256-GCM, bound to the owner and the key's name. They are never returned by the API, never put in prompts, and filled in only by the tool for the hosts the owner listed. See [Connections and keys](/connections).

### How are sessions stored?
Only the SHA-256 hash of the session token is stored. The cookie `hn_session` is `HttpOnly`, `SameSite=Lax` and `Secure` on the hosted demo. State-changing requests from an origin HelloNear does not list are refused (`403 bad_origin`).

### Has the repository been checked for leaked keys?
Yes. On 13 Nov 2026 the full git history (all branches) was scanned for key-shaped strings. None were real: the matches are a 1Click quote signature in a test fixture and placeholder Telegram tokens in tests. Postgres credentials in the repository are for local development only.

### Can someone else read my Mind or my runs?
Every route checks that the signed-in user owns the Mind or run. Another user's Mind answers `404`, never `403`, so ids cannot be probed.

## Data processing

### What does HelloNear store?
Chat history, the Mind's memory of its owner, encrypted keys, payments, and the proofs behind verified replies. The full table is on [Privacy](/privacy).

### Does the verification proof contain my conversation?
No. It holds signatures, hashes and Intel's TDX quote only, never the conversation text.

### How do I delete my data?
Deleting a chat hides it at once, asks the engine to forget it, and removes it for good after 30 days. Memory can be edited or cleared in the Mind's settings. Guest accounts are deleted with all their Minds after 7 days.

### Who sees my prompts while the model runs?
Nobody outside the TEE: not the cloud provider, not the model host, not NEAR AI. HelloNear's own backend does keep the chat, so the Mind can continue it.

## Model training

### Does HelloNear train models on my data?
No. HelloNear does not train or fine-tune any model. Replies come from models on NEAR AI Cloud, called inside a TEE.

### Which models are used?
`z-ai/glm-5.3-flash` by default, `deepseek-ai/DeepSeek-V4.1-Flash-1017` for reasoning and `Qwen/Qwen3-Embedding-0.6B` for memory, all on NEAR AI Cloud. See [The agent](/agent).

## Wallet & funds

### Is real money involved?
No. During the hackathon everything runs on NEAR testnet, whose tokens have no value. Cross-chain payments and Agent Market hiring are only quoted, since they need mainnet. See [Hackathon phase](/hackathon-phase).

### Who holds the Mind's wallet?
Each Mind's wallet is an OutLayer wallet. HelloNear stores its key encrypted, one wallet per Mind. The owner's own NEAR wallet signs the policy and Freeze, so those changes are transactions anyone can see.

### What happens to funds when a Mind is deleted?
Deleting a Mind deletes the only copy of its wallet key, so HelloNear refuses (`409 wallet_not_empty`) while the wallet holds more than 0.001 NEAR, until the owner confirms they have seen the balance.

### Is a refused payment on chain?
No. OutLayer refuses it in the TEE before signing, so there is no transaction. HelloNear never shows a transaction link for one.

## Other

### How do I report a security issue?
Open an issue on [GitHub](https://github.com/Hellonear-AI/hellonear/issues/new). Please do not include keys, personal data or a working exploit in a public issue; describe the problem and we will follow up.

### Where can I see whether HelloNear is up?
On [status.hellonear.xyz](https://status.hellonear.xyz), checked every 5 minutes. See [Status](/status).
