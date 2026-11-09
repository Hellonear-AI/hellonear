-- One AgentMail inbox per Mind (#96), created when the owner equips the `email-address` skill.
-- `key_slot` says which AgentMail key (organization) holds the inbox: 0 = AGENTMAIL_API_KEY, 1 = AGENTMAIL_API_KEY_2.
-- AgentMail's own `client_id` for the inbox is the Mind id, so a retried create returns the same inbox.
create table mind_inboxes (
  mind_id text primary key references minds (id) on delete cascade,
  inbox_id text not null,
  email text not null,
  key_slot integer not null default 0,
  created_at timestamptz not null default now()
);

-- Every send a Mind's `mail_send` tool attempts (#96), like wallet_payments: the FE lists them as sent mail, and the
-- try-out cap counts them. Refused sends are kept too, with AgentMail's error code.
create table mail_sends (
  id text primary key,
  mind_id text not null references minds (id) on delete cascade,
  inbox_id text not null,
  to_addresses text[] not null,
  subject text not null,
  body_preview text not null,
  status text not null check (status in ('pending', 'sent', 'rejected', 'rate_limited', 'failed')),
  message_id text,
  thread_id text,
  error_code text,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mail_sends_mind on mail_sends (mind_id, created_at desc);
