-- Paid data (#150): each payment buys one report once. The tx hash is the key, so a hash can never be redeemed twice.
create table shop_purchases (
  tx_hash text primary key,
  mind_id text not null references minds(id) on delete cascade,
  item text not null,
  payment_id text not null,
  created_at timestamptz not null default now()
);
