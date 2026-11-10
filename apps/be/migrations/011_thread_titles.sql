-- Renamed chats (#207): the owner's own title for a thread. It wins over the first message and over the engine's
-- generated title (`thread.titled`, #86). Deleting the thread deletes its title.
create table thread_titles (
  mind_id text not null references minds (id) on delete cascade,
  thread_id text not null,
  title text not null,
  updated_at timestamptz not null default now(),
  primary key (mind_id, thread_id)
);
