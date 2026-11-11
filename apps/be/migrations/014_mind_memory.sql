-- Memory switches (#209), read by the engine on every run: "Remember things about you" (working memory) and
-- "Search past chats" (semantic recall). Both on by default, as every Mind ran before.
alter table minds add column memory_enabled boolean not null default true;
alter table minds add column memory_recall boolean not null default true;
