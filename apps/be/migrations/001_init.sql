-- Initial backend schema (docs/api-contract.md §5). Mastra owns the `mastra` schema; the backend never writes there.
create extension if not exists vector;

create table users (
  id text primary key,
  near_account_id text not null unique,
  created_at timestamptz not null default now()
);

-- NEP-413 login challenges. A nonce is used at most once and expires after a few minutes.
create table auth_nonces (
  nonce text primary key,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Only the SHA-256 of the session token is stored, so a database leak does not leak sessions.
create table sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

create table minds (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  template_id text not null,
  name text not null,
  soul jsonb not null,
  model text,
  outlayer_wallet_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index minds_user on minds (user_id, created_at desc);

-- Skill metadata for the permission screen (#15). The engine catalog stays the source of truth for tools.
create table skills (
  id text primary key,
  name text not null,
  skill_md text,
  tool_bindings jsonb not null default '[]',
  required_connections jsonb not null default '[]',
  permissions jsonb not null default '{}',
  version text not null default '1'
);

-- Equipped skills. A revoked permission keeps the skill equipped without wallet access (#15).
create table mind_skills (
  mind_id text not null references minds (id) on delete cascade,
  skill_id text not null,
  position int not null default 0,
  granted_at timestamptz not null default now(),
  sub_wallet_id text,
  revoked_at timestamptz,
  primary key (mind_id, skill_id)
);

create table runs (
  id text primary key,
  mind_id text not null references minds (id) on delete cascade,
  thread_id text,
  workflow_id text,
  status text not null,
  model text,
  usage jsonb,
  cost_usd numeric,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index runs_mind on runs (mind_id, started_at desc);

create table run_events (
  run_id text not null references runs (id) on delete cascade,
  seq int not null,
  type text not null,
  node_id text,
  payload jsonb not null,
  ts timestamptz not null,
  primary key (run_id, seq)
);

-- Account-level secrets (#18). `ciphertext` is AES-256-GCM (iv | tag | data), bound to user and name.
create table secrets (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  name text not null,
  ciphertext text not null,
  allowed_hosts text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- The Autopilot input the backend last sent, so it can send the Mind config again when the Mind changes (#21).
create table autopilots (
  mind_id text not null references minds (id) on delete cascade,
  workflow_id text not null,
  input jsonb not null default '{}',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (mind_id, workflow_id)
);
