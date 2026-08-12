-- Places are now addressed by their Google place ID rather than found by a
-- text search, and the description they carry is derived from Google's own
-- facts instead of being written by hand.
--
-- `quote` already existed but held an invented blurb. It now holds one real
-- review, verbatim, which Google's terms require to be attributed — hence
-- quote_author and quote_rating alongside it.

alter table public.third_spaces
  add column if not exists summary text,
  add column if not exists quote_author text,
  add column if not exists quote_rating int check (quote_rating between 1 and 5);

comment on column public.third_spaces.google_place_id is
  'Google place ID. Exempt from Google''s caching limits, so it is stored indefinitely and turns every runtime lookup into a Place Details call instead of a Text Search.';

comment on column public.third_spaces.summary is
  'One sentence composed from Google''s types, editorial summary, and amenity flags by src/lib/describe.js. Never hand-written.';

comment on column public.third_spaces.quote is
  'One real Google review, verbatim and unmodified. Refresh at least every 30 days to stay inside Google''s caching terms.';

comment on column public.third_spaces.popularity is
  'Hand-set 0-100 estimate of how sociable a place is. Google exposes no free busy-times signal, so this is the one input that is not measured.';
