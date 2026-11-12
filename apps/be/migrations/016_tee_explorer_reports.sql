-- TEE Explorer reports (#277): the proof.t16z.com report made for an Intel quote, so the "Open in TEE Explorer" link
-- uploads each quote once. Keyed by the SHA-256 of the quote's bytes; it holds only what the public report shows.
create table tee_explorer_reports (
  quote_sha256 text primary key,
  checksum text not null,
  verified boolean not null,
  created_at timestamptz not null default now()
);
