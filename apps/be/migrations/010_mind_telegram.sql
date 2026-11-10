-- Telegram (#168): one bot per Mind, made by the owner with @BotFather. The token is encrypted like secrets. The
-- owner's Telegram chat is bound through a one-time /start code; the bot answers nobody else.
create table mind_telegram (
  mind_id text primary key references minds(id) on delete cascade,
  bot_id bigint not null,
  bot_username text not null,
  token_ciphertext text not null,
  webhook_secret text not null,
  link_code text,
  owner_chat_id bigint,
  owner_name text,
  thread_id text,
  last_update_id bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
