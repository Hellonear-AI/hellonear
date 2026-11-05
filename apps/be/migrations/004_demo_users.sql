-- Judge try-out mode (#43): a session without a wallet login. Demo users are deleted after 7 days.
alter table users add column is_demo boolean not null default false;
create index users_demo_created on users (created_at) where is_demo;
