// Builds src/lib/geography.json — every ZIP code and every town around the
// South Bay, so "where are you?" can be answered without Google.
//
//   node scripts/sync-geography.mjs
//
// This exists because the profiler could only recognise thirteen things. The
// address field fell back to the city's own planning areas when Google was
// unreachable, and that list is Willow Glen, Almaden, Berryessa and ten more
// — so a reader in Mountain View got nothing, and a reader who typed their
// ZIP got nothing either, on a field whose placeholder reads "e.g. Japantown
// or 95112". Both are the commonest way a person answers that question.
//
// Source is the U.S. Census Bureau's TIGERweb service: public domain, no key,
// no quota, no referrer restriction — the same free re-runnable tier as the
// City of San José layers, and nowhere near a Google SKU. Two geographies:
//
//   ZIP Code Tabulation Areas   the census stand-in for a ZIP's territory
//   Incorporated Places + CDPs  towns, and the named unincorporated ones
//
// A ZCTA is not literally a ZIP code — it is the tract-built area the Census
// draws around one — but it is the only free authority that publishes a
// boundary for one at all, and for placing an origin it is exact enough.
//
// The window is the South Bay and its edges rather than San José alone: the
// catalogue stops at the city line, but the reader does not, and a Palo Alto
// student measuring distance to a San José park is asking a question rSpace
// can answer.

import { writeFileSync } from "node:fs";

const OUT = new URL("../src/lib/geography.json", import.meta.url);

const TIGERWEB = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";

// Santa Clara County and a margin — down to Watsonville, up to Hayward, west
// to the coast. Anything further away than this and the whole catalogue is
// out of range anyway, since the distance component scores zero past 8 miles.
const WINDOW = {
  xmin: -122.35,
  ymin: 36.85,
  xmax: -121.2,
  ymax: 37.55,
  spatialReference: { wkid: 4326 },
};

// TIGERweb publishes each geography several times over, once per vintage, and
// only the Census 2020 group answers a spatial query — the ACS-vintage copies
// of the same layer return "Failed to execute query" for the identical
// request. These three ids are the 2020 ones.
const LAYERS = {
  zctas: { service: "PUMA_TAD_TAZ_UGA_ZCTA", layer: 7 },
  cities: { service: "Places_CouSub_ConCity_SubMCD", layer: 25 },
  towns: { service: "Places_CouSub_ConCity_SubMCD", layer: 26 },
};

async function query({ service, layer }) {
  const url =
    `${TIGERWEB}/${service}/MapServer/${layer}/query?` +
    new URLSearchParams({
      geometry: JSON.stringify(WINDOW),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "BASENAME,POP100,INTPTLAT,INTPTLON",
      returnGeometry: "true",
      f: "json",
    });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${service}/${layer}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`${service}/${layer}: ${data.error.message}`);
  if (data.exceededTransferLimit) {
    throw new Error(`${service}/${layer}: response was truncated — narrow the window`);
  }
  return data.features ?? [];
}

/* ── Geometry ─────────────────────────────────────────────────── */

// INTPTLAT / INTPTLON is the Census "internal point": guaranteed to fall
// inside the shape, which a centroid is not — several ZCTAs here are
// horseshoes around a hill.
function pointOf(a) {
  const lat = Number(a.INTPTLAT);
  const lng = Number(a.INTPTLON);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// Even-odd across every ring at once, not ring by ring. Doing it per ring and
// taking the first hit would count a point in one of San José's unincorporated
// holes as being in San José; counting all the crossings together lets the
// hole cancel the outer ring, which is what an ESRI polygon's rings mean.
function inPolygon(point, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const straddles = yi > point.lat !== yj > point.lat;
      if (straddles && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function boundsOf(rings) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, east, south, north };
}

function overlaps(a, b) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

/* ── Pull ─────────────────────────────────────────────────────── */

console.error("Reading the Census Bureau's TIGERweb service…");

const [zctaRows, cityRows, townRows] = await Promise.all([
  query(LAYERS.zctas),
  query(LAYERS.cities),
  query(LAYERS.towns),
]);

console.error(
  `  ${zctaRows.length} ZIP areas · ${cityRows.length} incorporated places · ` +
    `${townRows.length} census designated places`
);

// The Census writes place names in ASCII. San José writes its own with the
// accent, and so does every other line of copy in this app, so the one name
// that differs is spelled the way the city spells it. A display spelling of
// the same place, not a change to what the Bureau published.
const SPELLINGS = { "San Jose": "San José" };

// Incorporated places first: where a CDP and a town both cover a point, the
// town that actually governs it wins.
const areas = [...cityRows, ...townRows]
  .filter((r) => r.geometry?.rings && r.attributes.BASENAME)
  .map((r, i) => ({
    name: SPELLINGS[r.attributes.BASENAME] ?? r.attributes.BASENAME,
    incorporated: i < cityRows.length,
    population: r.attributes.POP100 ?? null,
    point: pointOf(r.attributes),
    rings: r.geometry.rings,
    bounds: boundsOf(r.geometry.rings),
  }))
  .filter((a) => a.point);

/* ── Naming a ZIP ─────────────────────────────────────────────────
   Which town a ZIP belongs to is a question about where its people are, and
   two simpler readings of it both fail.

   Asking which town contains the ZCTA's interior point answers "none" for a
   third of them: a ZCTA runs out into the hills and its middle goes with it,
   so 95120 (Almaden) lands in unincorporated open space above the houses.
   Falling back to the nearest boundary fixes those and breaks others — it
   put Los Gatos's 95032 in San José, because the hills its middle sits in
   happen to be nearer the San José line.

   Taking whichever town covers the most *area* is wrong in the other
   direction: 95037 is Morgan Hill, but most of its square mileage is the
   empty half of Coyote Valley that San José annexed, so area alone hands
   Morgan Hill's ZIP to San José.

   So the first question is whether a town's own middle is inside this ZIP.
   That is what a suburb's ZIP is *for*, and it settles Morgan Hill, Gilroy,
   Watsonville, Half Moon Bay and every other town out on its own. Only the
   ZIPs left over — the ones carved out of one big city, where no town centre
   falls inside them — are settled on area. */

const GRID = 24;

// Low, because this only runs after the town-centre test has failed, and by
// then the candidates are San José's outer ZIPs against unincorporated hills
// that outweigh them. Below this the ZIP really is county land: 95140 is
// Mount Hamilton, and it is not a suburb of whichever town has a corner of it.
const MIN_SHARE = 0.08;

function insideZip(rings, bounds) {
  return (a) =>
    a.point.lng >= bounds.west &&
    a.point.lng <= bounds.east &&
    a.point.lat >= bounds.south &&
    a.point.lat <= bounds.north &&
    inPolygon(a.point, rings);
}

function largestShare(rings, bounds, nearby) {
  const counts = new Map();
  let sampled = 0;

  for (let i = 0; i < GRID; i++) {
    const lat = bounds.south + ((bounds.north - bounds.south) * (i + 0.5)) / GRID;
    for (let j = 0; j < GRID; j++) {
      const lng = bounds.west + ((bounds.east - bounds.west) * (j + 0.5)) / GRID;
      const point = { lat, lng };
      if (!inPolygon(point, rings)) continue;
      sampled++;

      const town = nearby.find(
        (a) =>
          point.lng >= a.bounds.west &&
          point.lng <= a.bounds.east &&
          point.lat >= a.bounds.south &&
          point.lat <= a.bounds.north &&
          inPolygon(point, a.rings)
      );
      if (town) counts.set(town.name, (counts.get(town.name) ?? 0) + 1);
    }
  }

  if (!sampled) return null;
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] / sampled >= MIN_SHARE ? best[0] : null;
}

function townFor(rings) {
  const bounds = boundsOf(rings);
  const nearby = areas.filter((a) => overlaps(a.bounds, bounds));
  if (!nearby.length) return null;

  // Several can qualify where a CDP sits beside a town — Interlaken's centre
  // and Watsonville's are both inside 95076. The one with the people wins.
  const centred = nearby
    .filter(insideZip(rings, bounds))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  if (centred.length) return centred[0].name;

  return largestShare(rings, bounds, nearby);
}

/* ── Build ────────────────────────────────────────────────────── */

const inWindow = (p) =>
  p.lng >= WINDOW.xmin && p.lng <= WINDOW.xmax && p.lat >= WINDOW.ymin && p.lat <= WINDOW.ymax;

// A town only clipping the corner of the window keeps its boundary for the
// naming above, but is not itself somewhere this app can answer questions
// about — Tracy and Livermore are thirty miles past the furthest place in
// the catalogue.
const cities = areas
  .filter((a) => inWindow(a.point))
  .map(({ name, incorporated, population, point }) => ({
    name,
    incorporated,
    population,
    lat: Number(point.lat.toFixed(5)),
    lng: Number(point.lng.toFixed(5)),
  }))
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name));

// An unpopulated ZCTA is a business park, an airport, or a PO box range — real
// ZIPs, but not answers to "where do you live", and listing them puts 95196
// above 95112 in a picker sorted any way at all.
const zips = zctaRows
  .filter((r) => /^\d{5}$/.test(r.attributes.BASENAME) && r.geometry?.rings)
  .filter((r) => (r.attributes.POP100 ?? 0) > 0 && pointOf(r.attributes))
  // Same for a ZIP that only clips the corner of it.
  .filter((r) => inWindow(pointOf(r.attributes)))
  .map((r) => ({
    zip: r.attributes.BASENAME,
    city: townFor(r.geometry.rings),
    lat: Number(pointOf(r.attributes).lat.toFixed(5)),
    lng: Number(pointOf(r.attributes).lng.toFixed(5)),
    population: r.attributes.POP100,
  }))
  .sort((a, b) => a.zip.localeCompare(b.zip));

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      generated: new Date().toISOString().slice(0, 10),
      source: "U.S. Census Bureau TIGERweb, 2020 Census (public domain) · tigerweb.geo.census.gov",
      window: WINDOW,
      cities,
      zips,
    },
    null,
    2
  )}\n`
);

console.error(`\nWrote ${zips.length} ZIP areas and ${cities.length} towns.`);
console.error(`  ZIPs that are mostly county land: ${zips.filter((z) => !z.city).length}`);
console.error(`  largest towns: ${cities.slice(0, 5).map((c) => c.name).join(" · ")}`);
