-- Chat threads (#54): the user's message of each chat run, so the backend can list threads and replay them
-- without reading the engine's `mastra` schema. Resumed runs (approve/decline) have none.
alter table runs add column user_message text;
create index runs_thread on runs (mind_id, thread_id, started_at) where thread_id is not null;
