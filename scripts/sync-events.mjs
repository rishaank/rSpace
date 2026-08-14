// Pulls what is actually happening at San José's libraries into
// src/lib/events.json.
//
//   node scripts/sync-events.mjs
//
// The catalogue says a place exists and scores it. This says something is on
// there on Thursday, which is the one thing a reader can act on today and the
// one thing nothing else in the app knows.
//
// Source is San José Public Library's own events service, the same one behind
// sjpl.bibliocommons.com. It needs no key, has no quota, and is not a Google
// SKU — so like sync-sanjose.mjs this can be re-run at will and costs nothing.
// That is why it runs on a schedule and the paid Google scripts do not.
//
// It is deliberately not read at render time. Events belong to the same
// build-input pipeline as the catalogue: the app stays a static bundle with no
// key in it and no request to make, and freshness comes from how often the
// workflow runs rather than from the browser doing work on every visit.
//
// Two limits of the upstream service shape this script:
//
//   - It ignores every date filter parameter tried (startDate, dateFrom,
//     from, …) and returns the whole year regardless, so the horizon is
//     applied here.
//   - Its pages are not sorted by date — every page spans about a year — so
//     there is no early exit and all of them have to be walked.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "src/lib/catalogue.json");
const OUT = join(ROOT, "src/lib/events.json");

const FEED = "https://gateway.bibliocommons.com/v2/libraries/sjpl/events";
const PAGE_SIZE = 200;
const MAX_PAGES = 60;

// How far ahead to keep. Two weeks is what a "what's on near me" question
// actually means; past that the list stops being a prompt and becomes a
// directory, and the file grows for no one.
const HORIZON_DAYS = 14;

async function fetchPage(page) {
  const response = await fetch(`${FEED}?limit=${PAGE_SIZE}&page=${page}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} on page ${page}`);
  return response.json();
}

/**
 * Branch name to catalogue slug.
 *
 * The feed names a branch "Almaden"; the catalogue calls it "Almaden Library"
 * and also carries a separate "Almaden Library & Community Center" row, so a
 * loose contains-match has two answers and would pick one at random. Same
 * trap as the address matching in refresh-places.mjs, and the same rule
 * applies: match exactly or not at all.
 */
// The five branches the feed abbreviates past recognition, mapped straight to
// a slug. Written out rather than fuzzy-matched because a loose match here is
// actively dangerous: "Alum Rock" also matches Alum Rock Park, Cherry Flats
// Reservoir and the Alum Rock Youth Center, and putting a library story time
// in a park is the same class of error that once moved a named reviewer's
// words onto Parma Park. Every target below was checked to be the only
// library row matching that branch.
const ALIASES = {
  "King Library": "dr-martin-luther-king-jr-library",
  "Alum Rock": "dr-roberto-cruz-alum-rock-library",
  "Mt. Pleasant": "mt-pleasant-neighborhood-library-bridge-branch",
  Tully: "tully-community-library",
  "East SJ Carnegie": "east-san-jose-carnegie-library",
};

function normalise(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildIndex(places) {
  const index = new Map();
  for (const place of places) {
    const key = normalise(place.name);
    // A duplicate normalised name would make both unreachable rather than
    // silently shadowing one of them.
    if (index.has(key)) index.set(key, null);
    else index.set(key, place.id);
  }
  return index;
}

function resolveBranch(branch, index, slugs) {
  const alias = ALIASES[branch];
  // A stale alias must fail loudly rather than quietly dropping a branch:
  // slugs move when the city renames a site, as almaden-community-center did.
  if (alias) return slugs.has(alias) ? alias : null;

  // The full name the catalogue would use for a library branch, tried first,
  // so "Almaden" lands on "Almaden Library" and never on the combined site.
  const full = index.get(normalise(`${branch} Library`));
  if (full) return full;
  return index.get(normalise(branch)) ?? null;
}

async function main() {
  const catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8"));
  const index = buildIndex(catalogue.places);
  const slugs = new Set(catalogue.places.map((p) => p.id));

  for (const [branch, slug] of Object.entries(ALIASES)) {
    if (!slugs.has(slug)) console.error(`alias "${branch}" points at a slug that is gone: ${slug}`);
  }

  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 86400000;

  const events = new Map();
  const locations = new Map();
  const unmatched = new Map();
  let scanned = 0;
  let pages = 1;

  for (let page = 1; page <= Math.min(pages, MAX_PAGES); page++) {
    const body = await fetchPage(page);
    pages = body.events.pagination.pages;

    for (const [id, location] of Object.entries(body.entities.locations ?? {})) {
      locations.set(id, location.name);
    }

    for (const key of body.events.items) {
      const event = body.entities.events[key];
      const def = event?.definition;
      scanned++;
      if (!def || def.isCancelled) continue;

      const start = Date.parse(event.indexStart ?? def.start);
      if (!Number.isFinite(start) || start < now || start > horizon) continue;

      // An online event is not a reason to go anywhere, and this app is about
      // places you can stand in.
      if (!def.branchLocationId) continue;

      events.set(event.id, {
        branchId: def.branchLocationId,
        title: def.title,
        start: new Date(start).toISOString(),
        end: event.indexEnd ?? def.end ?? null,
        registration: Boolean(def.registrationInfo?.registrationRequired),
      });
    }
  }

  // Group onto catalogue slugs, dropping anything whose branch this repo has
  // no row for rather than inventing a place to hang it on.
  const bySlug = {};
  let kept = 0;
  for (const event of events.values()) {
    const branch = locations.get(event.branchId);
    if (!branch) continue;
    const slug = resolveBranch(branch, index, slugs);
    if (!slug) {
      unmatched.set(branch, (unmatched.get(branch) ?? 0) + 1);
      continue;
    }
    const { branchId: _branchId, ...rest } = event;
    (bySlug[slug] ??= []).push(rest);
    kept++;
  }

  for (const list of Object.values(bySlug)) {
    list.sort((a, b) => a.start.localeCompare(b.start));
  }

  const body = {
    source: "San José Public Library",
    horizon_days: HORIZON_DAYS,
    places: Object.keys(bySlug).length,
    count: kept,
    by_slug: Object.fromEntries(Object.entries(bySlug).sort(([a], [b]) => a.localeCompare(b))),
  };

  // Keep the old timestamp when nothing else moved, so an unchanged run
  // produces a byte-identical file. This runs six times a day and every
  // commit is a deploy — a `generated` that always ticks would mean six
  // rebuilds a day whether or not a single event changed. Same idempotency
  // rule sync-sanjose.mjs holds itself to.
  let generated = new Date().toISOString();
  try {
    const previous = JSON.parse(readFileSync(OUT, "utf8"));
    const { generated: was, ...rest } = previous;
    if (JSON.stringify(rest) === JSON.stringify(body)) generated = was;
  } catch {
    // No previous file, or an unreadable one: this run defines it.
  }

  writeFileSync(OUT, JSON.stringify({ generated, ...body }, null, 2) + "\n");

  console.error(
    `Scanned ${scanned} events, kept ${kept} in the next ${HORIZON_DAYS} days ` +
      `across ${Object.keys(bySlug).length} places.`
  );
  for (const [branch, n] of unmatched) {
    console.error(`  no catalogue row for "${branch}" (${n} events dropped)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
