-- Mind as Seller (#181): what a Mind sells over the 402 pattern, paid to that Mind's own wallet.
create table mind_offers (
  mind_id text not null references minds (id) on delete cascade,
  item text not null,
  title text not null,
  price_yocto numeric(40, 0) not null,
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (mind_id, item)
);

-- Each payment buys one offer once, like shop_purchases (009): the tx hash is the key.
create table offer_purchases (
  tx_hash text primary key,
  buyer_mind_id text not null references minds (id) on delete cascade,
  seller_mind_id text not null references minds (id) on delete cascade,
  item text not null,
  payment_id text not null,
  created_at timestamptz not null default now()
);
