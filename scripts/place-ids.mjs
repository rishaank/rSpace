// Resolves a real Google place ID for every seeded row and prints them as a
// patch you can paste into src/lib/seed.js.
//
// Text Search asking for `places.id` only is the "Text Search Essentials
// (IDs Only)" SKU, which Google charges nothing for and does not cap — so
// this can be re-run freely. Everything the app does at runtime keys off the
// id this produces, which turns a search into a lookup.
//
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/place-ids.mjs
//
// The browser key is referrer-restricted, so the request carries the same
// Referer the app sends from localhost.

import { PLACES } from "../src/lib/seed.js";

const key = process.env.VITE_GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("Set VITE_GOOGLE_MAPS_API_KEY.");
  process.exit(1);
}

const results = [];

for (const place of PLACES) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // IDs only. Adding any other field moves this to a paid SKU.
      "X-Goog-FieldMask": "places.id",
      Referer: "http://localhost:5173/",
    },
    body: JSON.stringify({
      textQuery: `${place.name} ${place.address ?? ""} San Jose CA`.trim(),
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 2000 } },
      maxResultCount: 1,
    }),
  });

  if (!response.ok) {
    console.error(`${place.id}: HTTP ${response.status} ${await response.text()}`);
    results.push({ slug: place.id, placeId: null });
    continue;
  }

  const data = await response.json();
  const id = data.places?.[0]?.id ?? null;
  console.error(`${place.id} → ${id ?? "not found"}`);
  results.push({ slug: place.id, placeId: id });
}

console.log(JSON.stringify(Object.fromEntries(results.map((r) => [r.slug, r.placeId])), null, 2));
