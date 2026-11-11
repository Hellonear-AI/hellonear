-- Auto-approve rules (#167): what a Mind may do without asking, chosen by the owner. `{ tools: [toolId], payment:
-- { maxNear } | null }`; empty means every approval tool asks, as before. The engine decides per call; the OutLayer
-- policy still checks every payment in the TEE.
alter table minds add column auto_approve jsonb not null default '{}'::jsonb;
