// Resolves a real Google place ID for every catalogue row that lacks one and
// writes them back into src/lib/catalogue.json.
//
// Text Search asking for `places.id` only is the "Text Search Essentials
// (IDs Only)" SKU, which Google charges nothing for and does not cap — so
// this can be re-run freely. Everything the app does at runtime keys off the
// id this produces, which turns a search into a lookup.
//
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/place-ids.mjs
//   VITE_GOOGLE_MAPS_API_KEY=… node scripts/place-ids.mjs --all   # re-resolve
//
// The browser key is referrer-restricted, so the request carries the same
// Referer the app sends from localhost.

import { readCatalogue, writeCatalogue } from "./catalogue.mjs";

const key = process.env.VITE_GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("Set VITE_GOOGLE_MAPS_API_KEY.");
  process.exit(1);
}

const catalogue = readCatalogue();
const all = process.argv.includes("--all");
const pending = catalogue.places.filter((p) => all || !p.google_place_id);

console.error(`Resolving ${pending.length} of ${catalogue.places.length} places.`);

const results = [];

for (const place of pending) {
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

// Two city sites can sit close enough that Google returns the same listing
// for both — a park and the community center inside it, say. A place ID is
// unique in third_spaces, so the second one is left null rather than written
// and rejected at push time.
const taken = new Set(catalogue.places.map((p) => p.google_place_id).filter(Boolean));
const found = new Map();

for (const { slug, placeId } of results) {
  if (!placeId || taken.has(placeId)) {
    if (placeId) console.error(`${slug}: ${placeId} already claimed, left unresolved`);
    continue;
  }
  taken.add(placeId);
  found.set(slug, placeId);
}

for (const place of catalogue.places) {
  if (found.has(place.id)) place.google_place_id = found.get(place.id);
}

writeCatalogue(catalogue);
console.error(`\nWrote ${found.size} place IDs.`);
