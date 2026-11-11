-- Telegram approvals (#208): each Approve / Decline button carries an opaque one-time code as its callback_data. The
-- code maps here to the run and tool call it answers; no run id or amount ever goes into the button. Both codes of one
-- message are used up by the first press (used_at), so a second press does nothing.
create table telegram_approvals (
  code text primary key,
  mind_id text not null references minds(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  tool_call_id text not null,
  action text not null check (action in ('approve', 'decline')),
  -- The message's first line ("Pay 0.1 NEAR to lin1er.testnet"), kept so the edited message still says what it was.
  title text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index telegram_approvals_call on telegram_approvals (run_id, tool_call_id);
