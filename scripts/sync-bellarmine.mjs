// Pulls Bellarmine College Preparatory's club roster into
// src/lib/bellarmine.json, and works out which of them the city's third
// spaces could actually host.
//
//   node scripts/sync-bellarmine.mjs
//
// rSpace's reader is a Bellarmine student, and the question this answers is
// the one the catalogue on its own cannot: "my club needs somewhere to meet
// that isn't a classroom — where?" The catalogue already knows what is on the
// ground at all 329 sites, because the city publishes it. What it did not know
// is what anyone at school is trying to do.
//
// Source is bcp.org's own clubs page. It is a Finalsite build, so the club
// list is not in the page HTML at all — it is a tab element fetched separately
// from /fs/elements/{id}. That endpoint serves the same markup the browser
// renders, needs no key, and has no quota, which puts this in the same free,
// re-runnable tier as sync-sanjose.mjs and sync-events.mjs rather than
// anywhere near the paid Google scripts.
//
// Like the catalogue and the events file this is a build input, not a render
// time fetch: the app stays a static bundle with no key in it, and freshness
// comes from how often the workflow runs. A club roster changes about twice a
// year, so it runs weekly.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "src/lib/catalogue.json");
const OUT = join(ROOT, "src/lib/bellarmine.json");

const PAGE = "https://www.bcp.org/student-life/student-clubs-and-organizations";

// The Finalsite element that holds the eight category tabs. Element ids are
// stable for the life of a page's layout; if the school rebuilds the page this
// 404s or comes back empty, and the sanity check at the bottom stops the run
// rather than writing an empty roster over a good one.
const ELEMENT = "https://www.bcp.org/fs/elements/5248";

// 960 W Hedding St. Geocoded once against OpenStreetMap and written down,
// because the Geocoding API is not enabled on this project's Maps key and a
// campus does not move. Everything measured from here is a haversine, same as
// the distance component in scoring.js.
const CAMPUS = {
  name: "Bellarmine College Preparatory",
  address: "960 W Hedding St, San Jose, CA 95126",
  lat: 37.3428035,
  lng: -121.9181034,
};

/* What a club needs from a place, in the city's own vocabulary.
   ------------------------------------------------------------------
   Two mechanisms, and both of them resolve to something San José
   publishes rather than to an opinion about the club.

   1. CLUB_AMENITIES below, for clubs whose activity has a literal amenity
      code in layer 554. The rule for being in this table is strict: the
      amenity has to BE the thing the club plays on. Pickleball Club needs a
      pickleball court, and the city lists which parks have one. The clubs
      that are not here are not here on purpose — the city has no code for
      badminton, cricket, fencing or climbing, and inventing one by pointing
      Cricket Club at a soccer field would be the same class of guess as the
      hand-typed popularity score that sync-sanjose.mjs exists to have
      replaced.

   2. STUDY_CATEGORIES, for the four tabs whose clubs meet by sitting around a
      table and talking — Academic, Finance, Political Science, STEM. Those
      land on the 25 library rows, which the catalogue already marks with the
      Reading interest. This is the one judgement call in the file, it is made
      per category rather than per club so it cannot be quietly tuned one club
      at a time, and it is written into the output as `via` so the app can say
      why a place matched.

   Art, Hobbies & Special Interests, Service & Justice and Sports get nothing
   beyond table 1. Cooking Club wants a kitchen and the city does list which
   community centres have one — but that flag is on layer 187 and does not
   survive into catalogue.json, so it cannot be matched yet. Food4All and Key
   Club do serve real places, and nothing in any dataset here says which.
   Those clubs come out with no home, which is the honest answer and is
   reported as a count rather than hidden. */

const CLUB_AMENITIES = {
  "Pickleball Club": ["PICKLE"],
  "Skate Club": ["SKATE"],
  "Volleyball Association": ["VOLL"],
  "Futsal Club": ["FUTSAL"],
  "Chess Club": ["GAMETB"],
  "Board Games Club": ["GAMETB", "PNGPNG"],
  "Board Game Design Club": ["GAMETB"],
  "Mahjong Club": ["GAMETB"],
  "Magic: The Gathering Club": ["GAMETB"],
  "Villainous Club": ["GAMETB"],
  "Dungeons and Dragons Club": ["GAMETB"],
  "Pokémon Club": ["GAMETB"],
};

const STUDY_CATEGORIES = new Set(["Academic", "Finance", "Political Science", "STEM"]);

const STUDY_INTEREST = "Reading";

const ENTITIES = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  ldquo: '"',
  rdquo: '"',
  rsquo: "\u2019",
  lsquo: "\u2018",
  mdash: "\u2014",
  ndash: "\u2013",
  eacute: "\u00e9",
  hellip: "\u2026",
  lt: "<",
  gt: ">",
};

// Named and numeric both, and an unknown name is left alone rather than
// blanked — a catch-all that swallowed &eacute; is what first turned
// Pokémon Club into "Pok mon Club".
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => ENTITIES[name] ?? whole);

const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Enough of a paragraph to say what the club is, and no more. */
function firstSentence(body) {
  const trimmed = body.trim();
  const stop = trimmed.search(/[.!?](\s|$)/);
  return stop === -1 ? trimmed : trimmed.slice(0, stop + 1);
}

/**
 * Every club's own words about itself.
 *
 * Most blocks label this "Club Description:", which is the field to read —
 * never "Mission Statement:", which sounds better and is not reliable:
 * bcp.org has the Career Club's mission pasted under Academic Research
 * Mentoring. A few clubs (Bellarmine Rugby) skip the labels entirely and
 * write plain paragraphs, so the fallback is the first real sentence after
 * the contact line.
 *
 * There is deliberately no meeting time here. The page publishes none — not
 * for one club out of the seventy-nine — so the app says when a club meets
 * exactly as often as the school does, which is never. Guessing "Thursdays at
 * lunch" from prose is how a summary becomes a claim.
 */
function summaryFor(rest) {
  const labelled = rest.match(/Club Description:?\s*(?:<\/strong>)?([\s\S]*?)<\/p>/i);
  if (labelled) return firstSentence(text(labelled[1]));

  for (const match of rest.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const body = text(match[1]);
    // Skip the contact line, stray <meta> wrappers, and empty paragraphs.
    if (body.length < 40 || /^Contact:/i.test(body)) continue;
    return firstSentence(body);
  }
  return null;
}

async function fetchElement() {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(ELEMENT, {
        headers: { "user-agent": "rSpace catalogue sync (github.com/rishaank/rSpace)" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${ELEMENT}`);
      return await response.text();
    } catch (error) {
      if (attempt === 3) throw error;
      console.error(`${error.message} — retrying (${attempt}/3)`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

/**
 * The element is one <section class="fsPanel"> per category tab. Inside a
 * panel the category is the fsElementTitle heading and every other <h2> opens
 * a club. Splitting on the panels first is what keeps a club's category
 * attached to it — the club headings themselves carry no category at all.
 */
function parseClubs(html) {
  const panels = html.split(/<section[^>]*class="[^"]*fsPanel[^"]*"/).slice(1);
  const clubs = [];

  for (const panel of panels) {
    const title = panel.match(/<h2[^>]*class="fsElementTitle"[^>]*>([\s\S]*?)<\/h2>/);
    if (!title) continue;
    const category = text(title[1]);

    // Everything after the panel's own heading, split on the club headings.
    const body = panel.slice(title.index + title[0].length);
    const blocks = body.split(/<h2(?![^>]*fsElementTitle)[^>]*>/).slice(1);

    for (const block of blocks) {
      const end = block.indexOf("</h2>");
      if (end === -1) continue;

      const name = text(block.slice(0, end));
      if (!name) continue;

      // Half the blocks link the moderator's address and half type it in
      // plain, sometimes behind a name ("Jessica Lew-Munoz at jlewmunoz@…"),
      // so the link is tried first and the raw address is the fallback.
      const rest = block.slice(end);
      const linked = rest.match(/mailto:([^"?]+)/);
      const bare = rest.match(/[A-Za-z0-9._%+-]+@bcp\.org/);

      clubs.push({
        id: slugify(name),
        name,
        category,
        contact: (linked ? linked[1] : bare?.[0])?.trim().toLowerCase() ?? null,
        summary: summaryFor(rest),
      });
    }
  }

  return clubs;
}

/** What a place has to offer for this club, or an empty list. */
function needsFor(club) {
  const amenities = CLUB_AMENITIES[club.name] ?? [];
  const needs = amenities.map((code) => ({ via: "amenity", value: code }));
  if (STUDY_CATEGORIES.has(club.category)) needs.push({ via: "interest", value: STUDY_INTEREST });
  return needs;
}

function matches(place, need) {
  if (need.via === "amenity") return (place.amenities ?? []).includes(need.value);
  return (place.interests ?? []).includes(need.value);
}

const html = await fetchElement();
const clubs = parseClubs(html);

// A Finalsite rebuild would leave the selectors above matching nothing, and a
// roster of four clubs written over a roster of eighty is worse than a stale
// file — the app would quietly report that almost nothing at school has
// anywhere to go. Anything under half the count last seen is a parse failure,
// not a small year.
if (clubs.length < 40) {
  throw new Error(`Only ${clubs.length} clubs parsed — the page layout has probably changed.`);
}

const duplicates = clubs.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicates.length) console.warn(`Duplicate club ids, keeping both: ${duplicates.join(", ")}`);

const catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8"));

for (const club of clubs) club.needs = needsFor(club);

// Precomputed both ways, the way events.json is: the app should read an
// answer, not recompute a join over 329 places on every render.
const bySlug = {};
for (const place of catalogue.places) {
  const here = clubs.filter((club) => club.needs.some((need) => matches(place, need)));
  if (here.length) bySlug[place.id] = here.map((club) => club.id);
}

const homeless = clubs.filter((club) => !Object.values(bySlug).some((ids) => ids.includes(club.id)));

const unknownAmenities = Object.entries(CLUB_AMENITIES)
  .filter(([name]) => !clubs.some((club) => club.name === name))
  .map(([name]) => name);
if (unknownAmenities.length) {
  console.warn(`Mapped clubs no longer on the page: ${unknownAmenities.join(", ")}`);
}

const next = {
  generated: new Date().toISOString(),
  source: "Bellarmine College Preparatory",
  url: PAGE,
  campus: CAMPUS,
  count: clubs.length,
  placed: clubs.length - homeless.length,
  places: Object.keys(bySlug).length,
  clubs,
  by_slug: bySlug,
};

// Idempotent like the other two generators: an unchanged roster rewrites the
// same bytes, so the weekly workflow does not commit — and every commit here
// is a deploy.
let previous = null;
try {
  previous = JSON.parse(readFileSync(OUT, "utf8"));
} catch {
  previous = null;
}
if (previous) {
  const same = JSON.stringify({ ...previous, generated: "" }) === JSON.stringify({ ...next, generated: "" });
  if (same) next.generated = previous.generated;
}

writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`);

console.log(
  `${clubs.length} clubs · ${next.placed} with somewhere off campus to meet · ` +
    `${next.places} of ${catalogue.places.length} places host at least one`
);
if (homeless.length) {
  console.log(`No match in the city's data for ${homeless.length}: ${homeless.map((c) => c.name).join(", ")}`);
}
