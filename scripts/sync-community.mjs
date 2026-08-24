// Builds src/lib/community.json — the third spaces the City of San José does
// not own, and therefore does not publish.
//
//   node scripts/sync-community.mjs
//
// The catalogue is the city's own list of city property: parks, community
// centers, libraries. That is 329 places and every one of them is real, but
// it is also every one of them a *municipal facility*. Three kinds of place a
// person actually spends an afternoon in are missing from it by construction:
//
//   Food        the independent café you can sit in for two hours
//   Outdoors    the open space preserves, which the county and the
//               Midpeninsula district own, not the city
//   Service     somewhere to volunteer, which is nobody's parcel at all
//
// Source is OpenStreetMap, read through the Overpass API: no key, no quota,
// no referrer restriction, one request for the whole pass. It is ODbL, which
// unlike the city's CC-BY requires attribution wherever the data is shown —
// `SOURCE` below is written into the file for that reason and the detail
// screen prints it.
//
// OSM is a different kind of source from the city's service and this file
// treats it as one. The city publishes an authoritative inventory of what it
// owns; OSM publishes whatever a volunteer mapped, which means a tag being
// absent proves nothing. So every rule below is written to need a tag to be
// *present* before it claims anything, and rows that stay silent are dropped
// rather than assumed.

import { readFileSync, writeFileSync } from "node:fs";

import { readCatalogue } from "./catalogue.mjs";

const OUT = new URL("../src/lib/community.json", import.meta.url);

const OVERPASS = "https://overpass-api.de/api/interpreter";

const SOURCE = "OpenStreetMap contributors (ODbL) · openstreetmap.org";

// Open space is deliberately read from a wider box than the city limits: the
// preserves worth walking in — Rancho San Antonio, Sierra Vista, Almaden
// Quicksilver, Santa Teresa — are exactly the ones the city does not own, and
// half of them sit just past its line. Cafés stay inside the city, where the
// rest of the catalogue is.
const REGION = "37.15,-122.15,37.55,-121.55";

const QUERY = `
[out:json][timeout:180];
area["name"="San Jose"]["boundary"="administrative"]["admin_level"="8"]->.sj;
(
  nwr["amenity"="cafe"](area.sj);
  nwr["amenity"="ice_cream"](area.sj);
  nwr["leisure"="nature_reserve"](${REGION});
  node["highway"="trailhead"](${REGION});
  nwr["name"~"Second Harvest",i](${REGION});
  nwr["name"~"Our City Forest",i](${REGION});
  nwr["name"~"Veggielution",i](${REGION});
);
out tags center;
`;

/* ── Volunteering ─────────────────────────────────────────────────
   The one hand-written table in this file, and it is a list of names rather
   than of facts: what each organisation is, where it is, and what it is
   called are all read back out of OSM. Naming them is a judgement — these
   are the food-bank and urban-forestry groups a San José student can turn up
   to — and it is made here, once, in the open.

   Trash Punx is missing on purpose. They run cleanups, and a cleanup is at a
   creek or an underpass on a Saturday, not at an address; OSM has no node
   for them because there is no site to map. rSpace can say where a place is
   or it can say nothing, and inventing a headquarters for a group that
   works out of a car park is the kind of claim the rest of this repo exists
   to have removed. */

const VOLUNTEER_ORGS = [
  { match: /second harvest/i, name: "Second Harvest of Silicon Valley", what: "food bank" },
  { match: /our city forest/i, name: "Our City Forest", what: "urban forestry" },
  { match: /veggielution/i, name: "Veggielution", what: "community farm" },
];

/* ── Fetch ────────────────────────────────────────────────────── */

console.error("Reading OpenStreetMap through Overpass…");

const response = await fetch(OVERPASS, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    // Overpass asks for a contactable agent so it can throttle a runaway
    // script rather than blocking the whole address it came from.
    "User-Agent": "rSpace/1.0 (https://github.com/rishaank/rSpace)",
  },
  body: new URLSearchParams({ data: QUERY }),
});

if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
const { elements = [] } = await response.json();
console.error(`  ${elements.length} elements`);

/* ── Shape ────────────────────────────────────────────────────── */

function pointOf(element) {
  if (element.lat != null) return { lat: element.lat, lng: element.lon };
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  return null;
}

function addressOf(tags) {
  const number = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (!street) return null;
  return number ? `${number} ${street}` : street;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function sentenceList(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// Same rule as the city summaries in sync-sanjose.mjs and src/lib/describe.js:
// every clause is switched on a tag that came back, so the worst case is a
// short sentence rather than a wrong one.
function describe(opening, tags) {
  const notes = [
    tags.outdoor_seating === "yes" && "seating outside",
    tags.indoor_seating === "yes" && "seating inside",
    tags.internet_access === "wlan" && "wi-fi",
    tags.wheelchair === "yes" && "step-free access",
    tags.takeaway === "only" && "takeaway only",
  ].filter(Boolean);

  return notes.length ? `${opening} Has ${sentenceList(notes)}.` : opening;
}

/* ── The three groups ─────────────────────────────────────────── */

// A café that carries a brand is a chain: `brand` and `brand:wikidata` are
// OSM's own way of saying "this shopfront is one of many", and they are what
// separates Starbucks and Yogurtland from Nirvana Soul. Reading a published
// tag is the whole filter — there is no list of chain names in this file to
// go stale or to argue with.
function isChain(tags) {
  return Object.keys(tags).some((k) => k === "brand" || k.startsWith("brand:"));
}

// `access` is read only when it says something. Absent means unmapped, which
// is not the same as open — see the note on open space below.
function isClosedToPublic(tags) {
  return tags.access === "private" || tags.access === "no";
}

function cafeRow(element, tags) {
  if (isChain(tags) || isClosedToPublic(tags)) return null;

  const dessert = tags.amenity === "ice_cream";
  return {
    category: "Food",
    interests: dessert ? ["Food & meals"] : ["Food & meals", "Coffee & tea"],
    price_level: null, // OSM publishes no price, so the scorer's own fallback applies
    summary: describe(dessert ? "An independent dessert shop." : "An independent café.", tags),
  };
}

// Open space is the one group where an absent tag is dangerous. Half of what
// comes back under `leisure=nature_reserve` is a conservation easement or a
// habitat mitigation parcel — real land, closed to the public, and listing
// one as somewhere to spend a Saturday would be a straightforwardly false
// claim. So this needs OSM to say out loud that the place is open. That drops
// about two thirds of them, and the ones that survive are the preserves and
// county parks people actually walk in.
function openSpaceRow(element, tags) {
  const trailhead = tags.highway === "trailhead";
  if (!trailhead && tags.access !== "yes" && tags.access !== "permissive") return null;

  return {
    category: "Outdoors",
    interests: ["Walking", "Trails & nature"],
    price_level: 0,
    summary: describe(
      trailhead
        ? "A marked trailhead."
        : `Open space${tags.operator ? ` run by ${tags.operator}` : ""}.`,
      tags
    ),
  };
}

function volunteerRow(element, tags) {
  const org = VOLUNTEER_ORGS.find((o) => o.match.test(tags.name));
  if (!org || isClosedToPublic(tags)) return null;

  return {
    category: "Service",
    interests: ["Volunteering"],
    price_level: 0,
    // No opening hours are claimed and no shift times are: the point of a
    // row here is that the organisation has a door in San José, and their own
    // site is where you find out when to be at it.
    summary: describe(`${org.name} — ${org.what}.`, tags),
  };
}

/* ── Build ────────────────────────────────────────────────────── */

const catalogue = readCatalogue();

// Districts come from the catalogue's own anchors, the same way sync-sanjose
// backfills them onto community centers and libraries. Nothing here carries a
// neighborhood: OSM has no equivalent of the city's association-area layer,
// and the honest answer to a question with no source is no answer.
const DISTRICT_MILES = 4;

function districtFor(point) {
  let best = null;
  for (const d of catalogue.neighborhoods) {
    const gap = metresBetween(d, point);
    if (!best || gap < best.gap) best = { name: d.name, gap };
  }
  // Nearest-anchor only means anything inside the city. Long Ridge is twenty
  // miles up Skyline and belongs to no San José district at all, and calling
  // it "West Valley" because that anchor is the least far away would be a
  // made-up answer to a question the data cannot answer.
  return best && best.gap <= DISTRICT_MILES * 1609 ? best.name : null;
}

function metresBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const cityIds = new Set(catalogue.places.map((p) => p.id));
const places = [];
const seen = new Set();

for (const element of elements) {
  const tags = element.tags ?? {};
  const point = pointOf(element);
  if (!tags.name || !point) continue;

  const kind =
    tags.amenity === "cafe" || tags.amenity === "ice_cream"
      ? cafeRow(element, tags)
      : tags.leisure === "nature_reserve" || tags.highway === "trailhead"
        ? openSpaceRow(element, tags)
        : volunteerRow(element, tags);
  if (!kind) continue;

  // OSM maps the same site more than once — a preserve as a relation and
  // again as the way inside it, a café as a node and as the building around
  // it. Same name within 200 m is one place, the same rule the city catalogue
  // uses for its duplicated pools and trail reaches.
  if (
    places.some(
      (p) => p.name.trim().toLowerCase() === tags.name.trim().toLowerCase() &&
        metresBetween(p, point) <= 200
    )
  ) {
    continue;
  }

  let id = slugify(tags.name);
  if (!id) continue;
  // A slug the city already owns would silently overwrite a park when the two
  // files are concatenated, so it is the newcomer that gives way.
  if (cityIds.has(id) || seen.has(id)) id = `${id}-osm-${element.id}`;
  if (seen.has(id)) continue;
  seen.add(id);

  places.push({
    id,
    source: `osm-${element.type}-${element.id}`,
    city_facility_id: null,
    city_location_id: null,
    google_place_id: null,
    name: tags.name,
    category: kind.category,
    address: addressOf(tags),
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
    neighborhood: null,
    district: districtFor(point),
    price_level: kind.price_level,
    // Interactability counts the amenities the *city* lists on a site, and
    // there is no equivalent count here. Null rather than zero: the scorer
    // drops a null component and spreads its weight over the rest, whereas
    // zero would be a claim that there is nothing to do at Rancho San Antonio.
    popularity: null,
    amenities: [],
    interests: kind.interests,
    parking_spaces: null,
    acres: null,
    condition: null,
    // OSM's own opening_hours syntax, passed through unmodified. It is
    // published, it is checkable, and rewriting it into prose would be this
    // file inventing a claim about when somewhere is open.
    hours: tags.opening_hours ?? null,
    summary: kind.summary,
    rating: null,
    reviews: 0,
    quote: null,
    quote_author: null,
    quote_rating: null,
  });
}

places.sort((a, b) => a.name.localeCompare(b.name));

const counts = places.reduce((t, p) => ({ ...t, [p.category]: (t[p.category] ?? 0) + 1 }), {});

/* ── Write ────────────────────────────────────────────────────── */
//
// Idempotent the same way sync-sanjose.mjs is: an unchanged pass keeps the
// previous `generated` date, so a scheduled run that found nothing new leaves
// the file byte-identical and commits nothing. Every commit here is a deploy.

let previous = null;
try {
  previous = JSON.parse(readFileSync(OUT, "utf8"));
} catch {
  // First run.
}

const same = previous && JSON.stringify(previous.places) === JSON.stringify(places);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      generated: same ? previous.generated : new Date().toISOString().slice(0, 10),
      source: SOURCE,
      region: REGION,
      places,
    },
    null,
    2
  )}\n`
);

console.error(`\nWrote ${places.length} places.`);
console.error(
  `  by category: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`
);
console.error(`  with an address: ${places.filter((p) => p.address).length}`);
console.error(`  with opening hours: ${places.filter((p) => p.hours).length}`);
