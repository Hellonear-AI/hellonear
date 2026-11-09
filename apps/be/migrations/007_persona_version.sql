-- Persona version (#116): bumped when a Mind's name or soul changes, so the engine reads memory under a new
-- resource and a renamed Mind does not bring back its old name. 0 = never changed (today's memory id).
alter table minds add column persona_version integer not null default 0;
