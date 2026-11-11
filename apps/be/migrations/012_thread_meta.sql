-- Chat threads the owner renamed or deleted (#207). Threads themselves are still derived from `runs`.
-- `title`: the owner's own title; it wins over the first message and over the engine's `thread.titled`.
-- `deleted_at`: the thread is gone for the owner at once (every list, its messages, its runs); its runs are purged
-- for good 30 days later, no undo. `forgotten_at`: when the engine dropped the thread's memory (retried until then).
create table thread_meta (
  mind_id text not null references minds (id) on delete cascade,
  thread_id text not null,
  title text,
  deleted_at timestamptz,
  forgotten_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (mind_id, thread_id)
);
create index thread_meta_deleted on thread_meta (deleted_at) where deleted_at is not null;
