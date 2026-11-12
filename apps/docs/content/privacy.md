---
title: Privacy: what is kept
description: What the TEE protects, what HelloNear stores, what is never stored, and how the owner deletes it.
---

The TEE protects the model calls. It does not make HelloNear's own backend blind: a Mind that remembers its owner needs that memory stored somewhere. This table says exactly where the line is.

| Data | Who can see it | Kept? |
|---|---|---|
| **Prompts and replies while the model runs** | Nobody outside the TEE: not the cloud provider, not the model host, not NEAR AI. Each reply's signature is checked against the hardware attestation | HelloNear keeps the chat itself (next row); inside the TEE the operator cannot read it |
| **Chat history** | The owner, and HelloNear's backend (Postgres, **not** in a TEE) | Yes, so the Mind can continue a chat. Deleting a chat also deletes its semantic-recall vectors (`engine/src/threads.ts`) |
| **The Mind's memory of its owner** (working memory) | The owner (Mind settings → Memory), and HelloNear's backend | Yes, until the owner edits or clears it in Settings (`engine/src/memory.ts`) |
| **API keys and connection secrets** | Nobody in plain text: AES-256-GCM, bound to the owner and the secret's name (`apps/be/src/crypto.ts`). The model only ever writes `{{secrets.NAME}}` | Encrypted, until the owner deletes it |
| **Secrets and wallet tokens during a run** | Only the tool that uses them | **Never** in prompts, traces or stored run snapshots: they live in an in-memory map, and a test scans every table for them |
| **Proofs behind the Verified badge** | Anyone with the run | Signatures, hashes and Intel's TDX quote only, never the conversation text |
| **Guest sessions** | The guest | Deleted with all their Minds after the retention period (7 days) |

So: HelloNear can keep your chats and memory to be useful, and you can delete them. It never stores your secrets in a form it can read back to the model, and the AI provider never sees your prompts outside the TEE.

---
