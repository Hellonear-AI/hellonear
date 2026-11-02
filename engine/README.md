# engine

AI engine HelloNear: Mastra server yang menjalankan Mind (soul, skill, memory, tool, scheduler) dengan model dari NEAR AI Cloud.

**PIC:** Axel · Issue: #5 (spike tool calling), #11 (kerangka) · Rujukan: `research.md` 7.1, 8.2, 9.2.

## Setup

1. `cp .env.example .env` lalu isi `NEARAI_API_KEY` (dari https://cloud.near.ai atau credit NEAR Builders).
2. Stack yang direncanakan: `@mastra/core` 1.81.0 (di-pin), provider bawaan `nearai` (contoh `model: 'nearai/z-ai/glm-5.3-flash'`), Postgres + pgvector.

Catatan: model reasoning NEAR AI memakai sebagian `max_tokens` untuk reasoning, jadi beri batas yang cukup longgar.
