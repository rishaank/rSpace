-- Room in third_spaces for the places the City of San José does not own.
--
-- scripts/sync-community.mjs adds a second half to the catalogue, read from
-- OpenStreetMap: independent cafés, the open space preserves the county and
-- the Midpeninsula district run, and the places to volunteer. They go in the
-- same table as the city's rows, because the table stores what a place *is*
-- and `source` already says who published it.
--
-- Two CHECK constraints were written when the city's service was the only
-- source and both reject those rows.

-- 'Food' and 'Outdoors' are new categories. Nothing the city publishes is
-- either — it owns no cafés, and the preserves belong to other agencies —
-- which is exactly why the app was missing both kinds of place.
alter table public.third_spaces
  drop constraint third_spaces_category_check;

alter table public.third_spaces
  add constraint third_spaces_category_check
  check (category in ('Gathering', 'Sport', 'Food', 'Outdoors', 'Service', 'Other'));

-- `source` was an enumeration, which cannot work for OpenStreetMap: every row
-- carries the id of the element it came from, so the detail screen can link
-- back to the exact record and anyone can check it. A pattern keeps the
-- constraint meaningful — an unrecognised source is still rejected — without
-- listing four hundred thousand possible values.
alter table public.third_spaces
  drop constraint third_spaces_source_check;

alter table public.third_spaces
  add constraint third_spaces_source_check
  check (
    source in ('google_places', 'manual_seed', 'sjc-parks', 'sjc-libraries', 'sjc-community-centers')
    or source ~ '^osm-(node|way|relation)-[0-9]+$'
  );
