# rSpace — working notes for Claude

rSpace scores public "third spaces" in San José — parks, courts, libraries,
community centers — against priorities each person sets themselves. It is
Rishaan's entry for the Janyaa Social Innovation Challenge 2026.

Live: https://rspace-blush.vercel.app · Repo: https://github.com/rishaank/rSpace

## Run it

```bash
npm install && npm run dev      # http://localhost:5173
```

Never run the dev server with `Bash`; use the Browser pane's preview tools.
`.claude/launch.json` already defines the `rspace` server.

The app works with **no** environment variables at all: the catalogue is
generated at build time into `src/lib/catalogue.json` and accounts fall back to
`localStorage`. `src/lib/data.js` is the only file that knows whether Supabase
is configured — nothing above it branches.

## Stack and layout

Vite + React 19 + React Router 7, Supabase (auth + Postgres), Google Maps /
Places (New) / Routes. No TypeScript, no CSS framework — plain CSS with custom
properties in `src/styles.css`. Rishaan writes vanilla HTML/CSS/JS and is
learning Java; keep the code plain and skip clever abstractions.

```
src/
  lib/        scoring, catalogue.json (generated), Supabase + Google adapters,
              describe, cache, app store
  components/ ui.jsx (design primitives, icons, brand), MapCanvas, RankFactors
  routes/     one file per screen, each headed with its design number
supabase/     schema and RLS
scripts/      sync-sanjose (city data), place-id resolver, Google refresh,
              seed loader, icons.sh
```

`src/lib/store.jsx` is a single context holding session, profile, weights,
favorites, and the scored place list. Keep object identities stable there —
`origin` is memoised because the map effect keys off it and a fresh object every
render rebuilds the map.

## The scoring algorithm

`Score = aI + bD + cT + dP + eC`, all in `src/lib/scoring.js`.

| Component | Source | Normalisation |
|---|---|---|
| I — interactability | Count of social amenities the city lists on site | `popularity / 100` |
| D — distance | Haversine from the profile's neighborhood | `1 − miles / 8`, per request, never stored |
| T — transport | Routes API, transit mode | `1 − minutes / 30` |
| P — popularity | rating × review volume | `0.65·stars + 0.35·log-scaled reviews` |
| C — cost | `price_level` 0–4, missing → **2** | `1 − level / 4` |

Two rules that are easy to break:

- Weights are stored **raw** and normalised to 1.0 **at query time**. Do not
  normalise on write — it is what lets a missing component redistribute
  cleanly.
- A component that comes back `null` drops out and its weight is redistributed
  across the rest. That produces the `89*` and hatched-bar treatment on the
  degraded place screen.

The reader never types a weight. They drag the five factors into order in
`RankFactors.jsx`, and position maps to weight through `RANK_WEIGHTS` —
`[.30 .25 .20 .15 .10]`, first place worth three times last. `weightsForOrder`
and `orderForWeights` convert both ways, so the `score_weights` columns and
everything downstream are unchanged, and weights saved by the old sliders
still read back as a sensible order.

`popularity` used to be the one input that was **not** measured — a hand-typed
0–100 guess, because Google exposes no busy-times signal on any free SKU. It is
measured now. `sync-sanjose.mjs` counts the distinct social amenities the city
lists as actually being on the site plus their total units, log-scaled, so a
park with courts, a playground, a dog run, and picnic tables outscores one with
a single lawn. Nothing on a row is hand-set any more.

Interests filter the map; they never affect a score.

## Where the data comes from

The catalogue is **generated, never hand-edited**. `src/lib/catalogue.json` is
written by `scripts/sync-sanjose.mjs` from the City of San José's open data
service, which is CC-BY, needs no key, and has no quota — so it can be re-run
at will and costs nothing.

```bash
node scripts/sync-sanjose.mjs     # city facts    (free, ~30s)
node scripts/place-ids.mjs        # google ids    (free, IDs-only SKU)
node scripts/refresh-places.mjs   # google facts  (the paid tier — see below)
```

Layers used, all from `geo.sanjoseca.gov/.../OPN_OpenDataService/MapServer`:

| # | Layer | What it gives |
|---|---|---|
| 187 | Community Centers | centers, gym / kitchen / parking / senior-nutrition flags |
| 188 | Parks | parks, acreage, type, status, **planning area** |
| 337 | Library | branch names and addresses |
| 554 | Park Amenities & Sports Fields | what is on the ground → `interests`, `popularity` |
| 557 | Park Condition Assessment | 2025 condition scores + HPI percentile |
| 548 | Equity Index Census Tracts | population, income, equity score |
| 549 | Neighborhoods | the 297 fine-grained association areas |

Two geographies, deliberately:

- `place.neighborhood` is the fine one from layer 549 — accurate on a place
  ("Northside-Backesto").
- `place.district` is the city's **planning area** — the ~13 names a resident
  would recognise (Willow Glen, Almaden, Alum Rock). `NEIGHBORHOODS` is built
  from these and drives the profiler's chips.

Ordering the picker any other way has been tried and is wrong: by tract
population it leads with "Trimble Business Area", by park count with "Ballbach
and Sofa". Both are real; neither is anywhere a reader calls home.

Google is still the only source for ratings, review counts, photos, and
quotes, and `refresh-places.mjs` is still the only thing that pays for them.
It re-writes rows in place and never touches the city's half — the city is
authoritative for a facility's name and location, Google for its reputation.

## Design system

The source of truth is the Claude Design project (see "Design handoff" below).
Style is "fieldnote": Newsreader for anything readable, Archivo Narrow for
buttons and tab labels, hairline rules instead of cards.

- **No rounded corners, no shadows inside the app, no card containers.**
  Sections are separated by 1px `--hairline` rules and 2px `--ink` heavy rules.
- **Only buttons are uppercase.** Grey structural labels — field labels, section
  heads, metadata, tab bar, app bar titles — are sentence-case Newsreader
  15.5px `--label`. This was a deliberate correction; do not reintroduce tracked
  grey caps, it is the main thing that made the UI look generated.
- **Accent eyebrows keep the tracked caps**: `.eyebrow.moss`, `.pine`, `.clay`,
  `.sage`, plus `.section-head.strong` on ink. Colour is carrying meaning there.
- `--pine` is the only action colour. `--clay` is only ever errors, warnings,
  destructive actions, and Adopt need-scores — never anything positive.
- Icons are one stroked 24×24 set in `ui.jsx` (`heart`, `map`, `sapling`,
  `person`, `filters`). The heart is the save control everywhere — use
  `<SaveButton>`, never a `♡` glyph.
- The brand mark is a pin that is also a lowercase `r` (`<Mark>`), and the
  wordmark is `<Wordmark>`: lowercase `r`, capital `S`, always one word. Below
  32px the `r` is dropped and the pin runs solid. `public/favicon.svg` draws
  the **same path**, so the tab icon and the in-app mark cannot drift; the
  PNGs beside it come from `./scripts/icons.sh` and should be regenerated
  whenever that SVG changes.
- The status bar only renders in the ≥480px desktop preview frame; real phones
  get their own. It shows the **real** clock — it used to read a fixed `9:41`,
  and nothing on screen should be a prop.
- `.device` is `height: 100dvh`, not `min-height`. With `min-height` a long
  screen grows past the viewport, the page itself scrolls instead of `.scroll`,
  and the tab bar slides under Safari's floating toolbar.
- The tab bar pads with `env(safe-area-inset-bottom)` only. Do not add a fixed
  bottom padding — Safari already reserves that strip and it double-pads.

## Google Maps — hard-won details

All of these cost real debugging time. Do not undo them.

- `loadMaps()` waits for the `callback=` parameter. With `loading=async` the
  script's `onload` fires **before** the API is usable, and `importLibrary` and
  `Geocoder` are missing off a stub namespace.
- Constructors must come from `importLibrary("maps")` / `("marker")`. Calling
  `new google.maps.Map()` off the global builds a container that never paints.
- Advanced markers need a **real Map ID**. Google's sample `DEMO_MAP_ID`
  produces a grey, tile-less map. `MapCanvas` gates the live map on a real ID
  and falls back to the drawn map, including a paint check a few seconds in.
- The paint check **skips a hidden tab and waits for `visibilitychange`**. The
  vector map renders off `requestAnimationFrame`, which a background tab never
  gets, so checking anyway condemned the whole session to the drawn map. This
  also means the live map cannot be verified in a headless browser pane —
  `getRenderingType()` stays `UNINITIALIZED` there no matter how healthy the
  key is.
- The map is built **once**. Markers are diffed against the place list and the
  selection only rewrites a marker's class and label. Rebuilding the marker
  set on every render re-ran `fitBounds` and snapped the view back mid-pan.
- The **Geocoding API is a separate product** and is not enabled on the key.
  Neighborhood names come from Places `addressComponents`, not the Geocoder.
- Every Google call returns `null` on failure instead of throwing. Screens must
  degrade — the profiler to the nearest seeded neighborhood, the address field
  to the seeded list, the map to the drawn one. Silent hangs were the original
  bug; never `await` a Google call without a fallback path.

The drawn "paper" map in `MapCanvas` is a first-class fallback, not a
placeholder. It projects lat/lng into a band inset from the header and sheet.
It always fits every pin by construction, which is why the "Show all places"
control only exists on the live map.

## Staying inside Google's free tier

The allowance is **per SKU per month**, not one pooled credit: 10,000 calls on
Essentials, 5,000 on Pro, **1,000 on Enterprise** — and `rating`,
`userRatingCount`, `priceLevel`, `photos`, `reviews`, and `editorialSummary`
are all Enterprise. A text search asking for a rating is the single most
expensive request the app could make, and the old code made one on every
detail-screen view.

So none of that is fetched at render time any more:

- Every row carries a real `google_place_id`. Place IDs are exempt from
  Google's caching limits and can be stored forever, which turns a search into
  a lookup and removes the chance of matching the wrong listing.
- `scripts/refresh-places.mjs` is the **only** thing that pays for the
  expensive fields, and with 329 places it is now the binding constraint on
  how big the catalogue can get. One row is one Enterprise event against
  1,000/month, so `--limit` defaults to **200** and rows refresh oldest-first
  — consecutive weekly runs walk the whole catalogue instead of re-pulling the
  same head of the list, and come round every 12 days, inside the 30 days
  Google's terms allow content to be cached. Do not raise the limit past ~250.
- `scripts/place-ids.mjs` resolves the IDs. An IDs-only text search is free
  and uncapped, so it can be re-run at will.
- At render time only two calls survive — the photo and the transit time —
  and both go through `src/lib/cache.js`, which caches in `localStorage` and
  stops making calls once a per-browser monthly ceiling is hit. Concurrent
  asks for the same key share one request.
- The address field passes an `AutocompleteSessionToken`. A whole
  type-then-pick sequence then bills as one **free** session instead of one
  charged request per keystroke — provided `resolveSuggestion` keeps to
  Essentials fields (`location`, `addressComponents`).

The per-browser ceiling is a safety net, not a guarantee: it counts one
browser, not everyone. The real hard stop belongs in the Cloud console under
**APIs & Services › Quotas**.

## Where a place's words come from

Nothing describing a place is written by hand. The seed used to carry invented
blurbs, one of which gave Almaden Community Center a pool it does not have.

- `summary` starts as a sentence built by `sync-sanjose.mjs` from the city's
  amenity codes ("Has basketball courts, a playground and picnic areas"), and
  is replaced by `src/lib/describe.js` once Google has been asked — its
  `editorialSummary` when there is one, otherwise `primaryTypeDisplayName`
  plus notable `types` and amenity flags. Every clause on both paths is
  switched on a field that came back; the worst case is a short sentence,
  never a wrong one.
- `quote` is one real review, verbatim and unmodified, shown with
  `quote_author` and `quote_rating` because Google's terms require
  attribution. `refresh-places.mjs` picks the review whose own rating is
  closest to the place's overall rating, so the section reads as a typical
  opinion rather than as marketing. On the detail screen the attribution
  renders as the reviewer's **stars then their name** — those stars are the
  reviewer's own rating, not the place's.
- `describeNeed()` in the same file does the same job for the invest list.
- Contradictions between the catalogue and Google's `types` are bugs. Almaden
  has no `swimming_pool`; Camden does.

## Supabase

Project `rspace`, ref `derofupvnoucaujweiug`, free tier, us-west-1. Schema and
RLS live in `supabase/migrations/0001_init.sql`.

- Every table has RLS. `third_spaces` is readable by any signed-in user;
  everything else is owner-scoped on `auth.uid()`.
- The catalogue is readable only when signed in, so `listPlaces()` runs again
  after login, not just at boot.
- Rows are addressed by `slug` in the app; `id` stays a uuid for foreign keys.
  `listPlaces` maps `id` to the slug on read.
- `adopt_applications` was **dropped** in `0003`. The three rows it ever held
  were invented, down to their `@example.org` contacts. Where-to-invest is
  derived from the city's condition assessments and Equity Index, ships with
  the build, and has no table.
- **`0003_city_open_data.sql` has not been applied to the live project yet**,
  and neither has the 329-row catalogue been pushed. Until both happen, a
  deploy with Supabase configured still reads the old 26 rows. Run the
  migration, then `node scripts/seed.mjs`.
- "Confirm email" is **off**, so signup returns a session immediately.
- Supabase's own validator rejects `example.com` and `.test` addresses, so
  throwaway test accounts need a plausible domain. To test signed-in flows,
  insert a user into `auth.users` with `crypt(...)`, add a `profiles` row so the
  `RequireProfile` guard passes, and delete it afterwards.
- The same Supabase org holds `janyaa-hub` (`sgjcliwmzshhkhjlbdjy`), an
  unrelated live app with real user data. **Never migrate into it.**

`third_spaces` stores raw inputs (rating, review count, popularity, price
level, condition) rather than the spec's pre-normalised `*_score` columns, so
re-tuning the normalisation never needs a re-seed. `transit_minutes` and
`transit_line` were dropped in `0003`: they were hand-typed ("6", "Bus 25"),
nothing measured them, and the real number is a per-user Routes call made at
render time that was never read back off this table.

## Deploying

The Vercel project is connected to GitHub, so **pushing to `main` deploys**.

```bash
cd ~/Documents/GitHub/rSpace && npx vercel --prod    # only for a manual deploy
```

- Always `cd` into the repo first. Running `vercel` from `~` links the home
  directory and then hangs walking Rishaan's Google Drive mount.
- Do **not** use the Vercel MCP's `deploy_to_vercel`. It takes the whole source
  tree as inline tool parameters and rSpace's ~155 KB of source gets truncated
  mid-tree, producing failed builds.
- Env vars are set for production, preview, and development. They are marked
  Sensitive, so `vercel env pull` returns `[SENSITIVE]` rather than the value —
  read them from `.env.local` locally, or from the built bundle if you need to
  confirm what shipped.
- Vite inlines `VITE_*` at **build** time. Changing an env var needs a redeploy.

## Google Cloud

One key, restricted by HTTP referrer to the Vercel domains and
`http://localhost:5173/*`. Enabled: Maps JavaScript, Places (New), Routes.
Geocoding is **not** enabled and the app does not need it.

## Design handoff

The design lives in a Claude Design project; pull it with the `DesignSync` tool
rather than guessing:

```
projectId: 72f23111-bb11-4464-9dd8-e6ddd1aff8da
file:      Third Space - App Screens.dc.html
```

It is one HTML canvas of all 26 screens at 390 × 844, each captioned with its
route and state, plus a brand section and build notes at the end. `support.js`
in the same project is only the canvas renderer — ignore it.

`get_file` output exceeds the inline limit, so it is written to a tool-results
file. Extract `.content` to disk and read that. To find what changed between
revisions, strip tags and diff the text, then diff the `style="…"` vocabulary —
that surfaces token changes far faster than reading 1,300 lines.

Route files are numbered to match the handoff (`// 13 · /place/:id — Detail`).
Keep those comments in sync.

The app has since diverged from the handoff in two places, deliberately:

- Screen **18 · /adopt — Applicants** is gone, along with its tab bar. `/adopt`
  is now the invest map (screen 20), and `/adopt/:id` shows a site's published
  numbers rather than an application.
- Screen **13** dropped its `GATHERING PLACE NO. 03` eyebrow, its top-right
  heart, the photo credit, and the "From the reviews" head; the description
  moved above the address and the rating below it.

## Conventions

- Match the existing style: plain functions, no premature abstraction, comments
  that explain *why* rather than narrate.
- Screens own their layout inline; only genuinely shared things go in
  `styles.css` or `ui.jsx`.
- Verify UI changes in the browser before saying they work — this project has
  had several bugs that only appear at runtime.
