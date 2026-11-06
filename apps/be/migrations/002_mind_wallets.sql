-- One OutLayer wallet per Mind (#14, #15). The agent key (`wk_…`) is encrypted like secrets, AAD = mind id.
-- The handoff_url from /register is never stored: owner actions are built by the backend and signed in our FE.
create table mind_wallets (
  mind_id text primary key references minds (id) on delete cascade,
  wallet_id text not null,
  near_account_id text not null,
  key_ciphertext text not null,
  created_at timestamptz not null default now()
);
