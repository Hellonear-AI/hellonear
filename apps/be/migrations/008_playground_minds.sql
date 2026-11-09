-- Attack Playground (#129): one hidden Mind per user and attack scenario. It pays from the shared demo wallet,
-- reads the sample inbox, gets none of the owner's secrets, and never shows in the owner's Mind list.
alter table minds add column playground_attack text;
create unique index minds_playground on minds (user_id, playground_attack) where playground_attack is not null;
