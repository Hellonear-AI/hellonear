-- Payments made by a Mind's payment tools through its OutLayer wallet (#42, option B): the receipts.
-- Refused transfers are recorded too (no tx: OutLayer refuses before signing).
create table wallet_payments (
  id text primary key,
  mind_id text not null references minds (id) on delete cascade,
  to_account text not null,
  amount_yocto numeric(40, 0) not null,
  status text not null check (status in ('pending', 'sent', 'policy_denied', 'wallet_frozen', 'failed')),
  tx_hash text,
  outlayer_request_id text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wallet_payments_mind on wallet_payments (mind_id, created_at desc);
