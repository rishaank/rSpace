// Pushes the generated catalogue into Supabase. Needs the service role key,
// since third_spaces is read-only to signed-in users.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed.mjs
//
// Regenerate both halves first — scripts/sync-sanjose.mjs for the city's own
// facilities and scripts/sync-community.mjs for the OpenStreetMap ones. They
// share one table: `third_spaces` stores what a place is, not who published
// it, and every row carries `source` saying which.
//
// The invest list has no table — it is derived from the city's published
// assessments and ships with the build.

import { createClient } from "@supabase/supabase-js";
// Read the file rather than importing src/lib/seed.js: that module does a
// plain JSON import, which Vite resolves and Node refuses without an import
// attribute. See scripts/catalogue.mjs.
import { readCatalogue, readCommunity } from "./catalogue.mjs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const places = [...readCatalogue().places, ...readCommunity().places].map(({ id, closed_on, ...rest }) => ({
  slug: id,
  closed_on: closed_on ?? null,
  ...rest,
}));

// Upserting 300+ rows in one request times out on the free tier.
const BATCH = 100;
let written = 0;

for (let i = 0; i < places.length; i += BATCH) {
  const batch = places.slice(i, i + BATCH);
  const { error } = await supabase.from("third_spaces").upsert(batch, { onConflict: "slug" });
  if (error) throw error;
  written += batch.length;
  console.error(`  ${written}/${places.length}`);
}

console.log(`Seeded ${written} places.`);
