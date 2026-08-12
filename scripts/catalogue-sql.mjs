// Prints the catalogue as SQL, for loading it without the service role key.
//
//   node scripts/catalogue-sql.mjs > /tmp/catalogue.sql
//   node scripts/catalogue-sql.mjs --batch 60 --only 2   # one batch at a time
//
// scripts/seed.mjs is the normal path and needs SUPABASE_SERVICE_ROLE_KEY.
// This exists for the case where the key is not to hand and the rows have to
// go in over a SQL connection instead — the statements are plain upserts on
// `slug`, so an existing row keeps its uuid and the favorites pointing at it
// survive.

import { readCatalogue } from "./catalogue.mjs";

const COLUMNS = [
  "slug", "google_place_id", "name", "category", "address", "lat", "lng",
  "rating", "reviews", "price_level", "popularity", "hours", "interests",
  "summary", "quote", "quote_author", "quote_rating", "closed", "closed_on",
  "source", "city_facility_id", "city_location_id", "neighborhood",
  "district", "amenities", "acres", "condition", "parking_spaces", "refreshed",
];

function quote(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    if (!value.length) return "'{}'";
    return `array[${value.map((v) => quote(String(v))).join(",")}]::text[]`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

const { places } = readCatalogue();

const rows = places.map((p) => {
  const record = {
    slug: p.id,
    google_place_id: p.google_place_id ?? null,
    name: p.name,
    category: p.category,
    address: p.address ?? null,
    lat: p.lat,
    lng: p.lng,
    rating: p.rating ?? null,
    reviews: p.reviews ?? 0,
    price_level: p.price_level ?? null,
    popularity: p.popularity ?? null,
    hours: p.hours ?? null,
    interests: p.interests ?? [],
    summary: p.summary ?? null,
    quote: p.quote ?? null,
    quote_author: p.quote_author ?? null,
    quote_rating: p.quote_rating ?? null,
    closed: p.closed === true,
    closed_on: p.closed_on ?? null,
    source: p.source,
    city_facility_id: p.city_facility_id ?? null,
    city_location_id: p.city_location_id ?? null,
    neighborhood: p.neighborhood ?? null,
    district: p.district ?? null,
    amenities: p.amenities ?? [],
    acres: p.acres ?? null,
    condition: p.condition ?? null,
    parking_spaces: p.parking_spaces ?? null,
    refreshed: p.refreshed ?? null,
  };
  return `(${COLUMNS.map((c) => quote(record[c])).join(", ")})`;
});

const batchArg = process.argv.indexOf("--batch");
const size = batchArg > -1 ? Number(process.argv[batchArg + 1]) : 60;
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? Number(process.argv[onlyArg + 1]) : null;

const updates = COLUMNS.filter((c) => c !== "slug")
  .map((c) => `${c} = excluded.${c}`)
  .join(",\n    ");

const batches = [];
for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));

batches.forEach((batch, index) => {
  if (only != null && only !== index) return;
  console.log(
    `insert into public.third_spaces (${COLUMNS.join(", ")}) values\n` +
      `  ${batch.join(",\n  ")}\n` +
      `on conflict (slug) do update set\n    ${updates};`
  );
});

console.error(`${rows.length} rows in ${batches.length} batches of ${size}.`);
