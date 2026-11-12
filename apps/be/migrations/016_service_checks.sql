-- Status page (status.hellonear.xyz): one row per check of HelloNear or a service it depends on, every 5 minutes,
-- kept 8 days (src/status.ts). `GET /v1/status` reads the last 7 days from here.
create table service_checks (
  id bigserial primary key,
  service text not null,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('operational', 'degraded', 'down')),
  latency_ms integer,
  detail text
);
create index service_checks_service_at on service_checks (service, checked_at desc);
create index service_checks_at on service_checks (checked_at);
