// Pushes the curated seed list into Supabase. Needs the service role key,
// since third_spaces and adopt_applications are read-only to signed-in users.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed.mjs

import { createClient } from "@supabase/supabase-js";
import { PLACES, APPLICANTS } from "../src/lib/seed.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const places = PLACES.map(({ id, closed_on, google_place_id, ...rest }) => ({
  slug: id,
  closed_on: closed_on ?? null,
  google_place_id,
  // Rows with a place ID have had their name, address, coordinates, rating,
  // summary, and quote written from the live listing by refresh-places.mjs.
  source: google_place_id ? "google_places" : "manual_seed",
  ...rest,
}));

const applications = APPLICANTS.map(({ id, ...rest }) => ({ slug: id, ...rest }));

const { error: placeError, count: placeCount } = await supabase
  .from("third_spaces")
  .upsert(places, { onConflict: "slug", count: "exact" });

if (placeError) throw placeError;

const { error: applicationError, count: applicationCount } = await supabase
  .from("adopt_applications")
  .upsert(applications, { onConflict: "slug", count: "exact" });

if (applicationError) throw applicationError;

console.log(`Seeded ${placeCount ?? places.length} places, ${applicationCount ?? applications.length} applications.`);
