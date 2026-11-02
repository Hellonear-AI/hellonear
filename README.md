# HelloNear

> Status: dalam pengembangan untuk NEAR HACKATHON (1–14 Nov 2026). README ini akan ditulis ulang untuk juri sebelum submit.

Platform AI agent persona ("Mind") di NEAR: tiap Mind punya identitas, memori, skill yang bisa di-equip, dan wallet dengan batas belanja yang ditegakkan di luar jangkauan AI.

## Struktur repo

| Folder | Isi | PIC | Issue |
|---|---|---|---|
| `apps/fe` | Aplikasi web (Next.js, NEAR Connect) | Ancung | #9 |
| `apps/landing` | Landing page | Nabil | #10 |
| `apps/be` | Backend API, Postgres + pgvector, login NEP-413 | James | #8 |
| `engine` | AI engine (Mastra, NEAR AI Cloud) | Axel | #5, #11 |
| `sc` | Contract registry Mind (Rust `near-sdk`) | Axel | #12 |
| `docs` | Kontrak API dan dokumen teknis | James + Axel | #7 |
| `research.md` | Hasil riset (draft) | semua | — |

Rencana kerja: #3. Keputusan tim: #4.

## Aturan kerja

- Tidak ada push ke `main`, merge, deploy, PR, atau submit tanpa acc Axel.
- Integration test dan load test lokal sebelum setiap push/merge; hasilnya dilaporkan di PR.
- Secret hanya di `.env` (di-gitignore). Contoh variabel ada di `.env.example` tiap folder.
