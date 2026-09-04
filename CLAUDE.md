# rSpace — working notes for Claude

rSpace scores public "third spaces" in San José — parks, courts, libraries,
community centers, cafés, open space — against priorities each person sets
themselves. It is Rishaan's entry for the Janyaa Social Innovation Challenge
2026.

Live: https://rspace-blush.vercel.app · Repo: https://github.com/rishaank/rSpace

> **Dormant since 2026-09-03.** The Vercel project and the Supabase project are
> paused, and both refresh workflows are disabled, so the live URL returns 503
> and nothing runs on a schedule. Nothing was deleted and everything below is
> still accurate for a running instance. Read `HIBERNATION.md` before changing
> anything or waking it up. The three Google Maps APIs are disabled too, so
> there is no surface left that can be called or billed.

## Run it

```bash
npm install && npm run dev      # http://localhost:5173
```

Never run the dev server with `Bash`; use the Browser pane's preview tools.
`.claude/launch.json` already defines the `rspace` server.

The app works with **no** environment variables at all: the catalogue is
generated at build time into `src/lib/catalogue.json` and `community.json`,
and accounts fall back to `localStorage`. `src/lib/data.js` is the only file that knows whether Supabase
is configured — nothing above it branches.

## Stack and layout

Vite + React 19 + React Router 7, Supabase (auth + Postgres), Google Maps /
Places (New) / Routes. No TypeScript, no CSS framework — plain CSS with custom
properties in `src/styles.css`. Rishaan writes vanilla HTML/CSS/JS and is
learning Java; keep the code plain and skip clever abstractions.

```
src/
  lib/        scoring, the four generated files (catalogue.json,
              community.json, events.json, geography.json), Supabase +
              Google adapters, describe, cache, app store
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
| I — interactability | Count of social amenities the city lists on site (`null` on an OSM row) | `popularity / 100` |
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

Interests filter the map; they never affect a score. That filter is **on by
default** whenever the profile has any interests picked — the map opens on the
places the reader said they would go out for, not on all 565. It cannot start
on with an empty interest list, because it would match nothing and the map
would open empty. When it does empty the map, "Look past my interests" is the
first remedy the empty state offers, ahead of distance and cost.

### Interests, picked and typed

`INTEREST_GROUPS` in `src/lib/seed.js` is the picker's vocabulary, and there
is one rule about it: **every option in it is carried by at least one place.**
An option that matches nothing empties the map and gives the reader no way to
tell a bad filter from a bad neighborhood. Two used to break the rule —
"Volunteering", which nothing in the city's data could satisfy until
`community.json` existed, and "Faith groups", which nothing still can, so it
is gone.

The list grew from 16 to 22 by fixing the mapping rather than by inventing
words. `SKATE` and `BMX` used to map to a literal `"Sport"` that
`interestsFrom` then threw away, so skate parks surfaced no interest at all;
`BASE`, `SOFT` and `VOLL` mapped to nothing. `PARK_TYPE_INTERESTS` is new and
reads the park *type* rather than an amenity row, because an open-space or
trail parcel has nothing built on it to list and is still the answer to
"somewhere to walk".

A **typed** interest is matched differently, in `matchesInterests`. There is
no set to test against, so it is matched against what the sources actually
published about a place: its name, the sentence built from its amenity codes,
the codes themselves through `catalogue.amenity_labels`, and its category. The
picker reports the count *before* the interest is added — "7 places match
skate", "0 places match cricket" — so an empty result is stated at the point
the reader chooses it rather than discovered two screens later on a blank map.
Adding one that matches nothing is still allowed: it is their profile, and
being told is not the same as being stopped.

## Where the data comes from

Every place list is **generated, never hand-edited**, and there are two of
them. `src/lib/catalogue.json` is the city's own property — parks, community
centers, libraries — from the City of San José's open data service, which is
CC-BY, needs no key, and has no quota. `src/lib/community.json` is everything
a person spends an afternoon in that the city does *not* own, and so does not
publish: independent cafés, the open space preserves the county and the
Midpeninsula district run, and somewhere to volunteer. That comes from
OpenStreetMap through Overpass — also free and keyless, but **ODbL, which
requires attribution**, so the source string travels with the file and the
profile screen and the detail screen both print it.

`src/lib/seed.js` concatenates the two into `PLACES`. Nothing above it knows
there were two files.

```bash
node scripts/sync-sanjose.mjs     # city facts     (free, ~30s)
node scripts/sync-community.mjs   # osm facts      (free, one request)
node scripts/place-ids.mjs        # google ids     (free SKU, 32/day)
node scripts/refresh-places.mjs   # google facts   (the paid tier — see below)
node scripts/sync-events.mjs      # library events (free, ~30s — see below)
node scripts/sync-geography.mjs   # zips and towns (free; run once a decade)
```

**These run on a schedule; you should rarely run them by hand.**
`.github/workflows/refresh-catalogue.yml` runs the first four daily at 09:00
UTC, pushes the rows to Supabase, and commits `catalogue.json` and
`community.json`; `.github/workflows/refresh-events.yml` runs `sync-events.mjs`
every four hours and commits `events.json`. Since Vercel builds from the repo,
those commits are the deploy. There is no server to run them on: rSpace is a
static bundle, and the files are *build inputs*, so the schedule belongs to
the build rather than the app.

`sync-geography.mjs` is deliberately **not** scheduled. Its source is the 2020
Census, which by definition does not change until 2030.

Both catalogue generators are idempotent — two consecutive runs produce a byte-identical
file. If that ever stops being true, something is fighting it for ownership of
a field, which is what `refresh-places.mjs` overwriting the city's address used
to do.

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
It re-writes rows in place and never touches the city's half — **the city is
authoritative for a facility's name, address, and location; Google only for
its reputation.** Google's `formattedAddress` is deliberately not read: it
used to win, and then the next sync put the city's back, which is what made
the generator non-idempotent.

Carrying Google's half onto a re-synced row matches on the name, then on a
nearby name sharing a *distinctive* word. Matching on address alone is not
safe — 23 addresses here belong to more than one site, and it once put
Almaden Community Center's rating and a named reviewer's words onto Parma
Park. Anything ambiguous is dropped with a warning instead of guessed.

### The OpenStreetMap half

`sync-community.mjs` adds 236 places in three groups, and each one is defined
by a rule over a *published tag* rather than by a list of names:

| Group | Rule | Count |
|---|---|---|
| Food | `amenity=cafe` or `ice_cream` inside the city, **with no `brand*` tag** | ~202 |
| Outdoors | `leisure=nature_reserve` where OSM says `access=yes` or `permissive`, plus `highway=trailhead` | ~30 |
| Service | the organisations named in `VOLUNTEER_ORGS`, located by OSM | 4 |

Three things about OSM that shape the file, and that are the opposite of how
the city's service is treated:

- **The city publishes an inventory; OSM publishes whatever a volunteer
  mapped.** An absent tag therefore proves nothing, so every rule needs a tag
  to be *present* before it claims anything. That matters most on open space:
  half of `leisure=nature_reserve` around here is conservation easement and
  habitat mitigation land — real, and closed — so a preserve has to say out
  loud that it is open. That drops two thirds of them.
- **The chain filter is `brand`, not a list of names.** `brand` and
  `brand:wikidata` are OSM's own way of saying a shopfront is one of many, so
  "small and local" is read off the data instead of being argued about here.
  It takes 284 cafés down to 202 and it is what removes Starbucks and
  Yogurtland while keeping Nirvana Soul.
- `VOLUNTEER_ORGS` is the one hand-written table, and it holds *names only* —
  what each org is, where it is, and what it is called all come back from OSM.
  **Trash Punx is missing on purpose**: they run cleanups at a creek on a
  Saturday, there is no site to map, and inventing a headquarters is the
  class of claim this repo exists to have removed.

Two known consequences, both accepted:

- A community row carries `popularity: null` and `rating: null`, because
  nothing counts amenities at a café and it has no `google_place_id`. Those
  two components drop out and their weight redistributes, which is the same
  path a degraded city row takes. A nearby café therefore scores on distance,
  transit and cost alone. Measured from downtown: cafés are about half the
  top 50 and none of the top 20, and their median is 57 against Sport's 65.
- `Google Cafeteria, Marketplace` is in there. It is a private corporate
  canteen, and OSM carries no tag saying so — no `access`, no `operator`.
  Filtering it would mean a hand-written exclusion, which is the thing the
  brand rule exists to avoid.

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
  `.btn.ghost.clay` is the outlined form of it, used by Sign out and Delete my
  account. Those two were italic `.linkbtn` text links, which read as
  footnotes rather than as the account controls on the screen.
- Icons are one stroked 24×24 set in `ui.jsx` (`heart`, `map`, `sapling`,
  `person`, `filters`). The heart is the save control everywhere — use
  `<SaveButton>`, never a `♡` glyph.
- The brand mark is a pin that is also a lowercase `r` (`<Mark>`), and the
  wordmark is `<Wordmark>`: lowercase `r`, capital `S`, always one word. Below
  32px the `r` is dropped and the pin runs solid. `public/favicon.svg` draws
  the **same path**, so the tab icon and the in-app mark cannot drift; the
  PNGs beside it come from `./scripts/icons.sh` and should be regenerated
  whenever that SVG changes.
- **The reader's display settings live on `.device`**, because every screen is
  inside one. `profile.text_scale` becomes `--ui-scale`, which drives a `zoom`
  on the frame's children — *not* a root font-size, because the screens size
  their own type inline in px and inline px ignores a root font-size. Zoom
  scales used values, so the boxes grow with the words. `.map`, `.mapgl`,
  `.scrim` and the status bar are excluded: Google draws its own labels and
  scaling its canvas only blurs it.
- `profile.simple_ui` puts `.simple` on the frame: bigger buttons, chips and
  stepper, and anything marked `when-detailed` hidden. Each screen marks its
  own supporting detail, so the CSS never guesses what is expendable.
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
  gets, so checking anyway condemned the whole session to the drawn map.
- **The live map cannot be verified from any automation surface**, and the way
  it fails there looks exactly like a bug in this repo. Measured, in both the
  Browser pane and a scripted real Chrome tab: `document.visibilityState` is
  permanently `hidden`, `document.hasFocus()` is false, and
  `requestAnimationFrame` delivers **0 frames in 2 seconds** (about 4 during a
  screenshot, against the ~120 a real tab would get).

  What that produces is a trap. The map itself comes up healthy —
  `getRenderingType()` reaches `VECTOR`, a `<canvas>` is created, tiles paint
  in a screenshot, `getBounds()` resolves. But **no `AdvancedMarkerElement`
  ever mounts**: the markers construct, take `map` and `position` without
  throwing, and sit at `element.isConnected === false` forever. A default pin
  with no custom content does the same, so it is not the `content` node. Their
  mounting rides the same frame loop the tiles do not need.

  So `pins: 0` on a `VECTOR` map with a painted canvas is **the expected
  reading in automation and proves nothing**. Do not go looking for the bug —
  there isn't one to find, and a "clean baseline" run with the working tree
  stashed reproduces it identically, which makes the false trail convincing.
  If the map has to be checked, open it in a real foreground browser window
  and look.
- The map is built **once**. Markers are diffed against the place list and the
  selection only rewrites a marker's class and label. Rebuilding the marker
  set on every render re-ran `fitBounds` and snapped the view back mid-pan.
- The live map **frames the ranking's leader**, not the whole catalogue:
  `MapScreen` passes `focus={visible[0]}` and `MapCanvas` centres on it at
  `FOCUS_ZOOM` (14, about 2.5 miles across the frame). Fitting all 300-odd
  pins was a view of San José in which the top place was one indistinguishable
  rectangle. Reframing happens when the pin set changes or the ranking finds a
  new leader — never on selection, which would fight a pan.
- Because of that zoom, the selected place can sit outside the view, so
  stepping through the ranking `panTo`s it — but **only when it is off-screen**,
  so tapping a visible pin never shifts the map under the tap.
- The **Geocoding API is a separate product** and is not enabled on the key.
  Neighborhood names come from Places `addressComponents`, not the Geocoder.
- Every Google call returns `null` on failure instead of throwing. Screens must
  degrade — the profiler to `src/lib/geography.js`, the address field to the
  same, the map to the drawn one. Silent hangs were the original bug; never
  `await` a Google call without a fallback path.

The drawn "paper" map in `MapCanvas` is a first-class fallback, not a
placeholder. It projects lat/lng into a band inset from the header and sheet.
It always fits every pin by construction, so it ignores `focus` — the two maps
frame differently on purpose, and the drawn one cannot zoom without losing the
property that makes it readable.

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
  expensive fields, and it is the binding constraint on catalogue size. Two
  limits apply and **the tighter one is not the monthly allowance**:

  | Limit | Value | Where |
  |---|---|---|
  | Places Enterprise free tier | 1,000 / month | Google's pricing |
  | `GetPlaceRequestPerDayPerProject` | **150 / day** | set on the Cloud project |

  The daily cap is what actually stops a full pass — a first attempt at all
  329 rows got 74 in and then took `HTTP 429` for the rest. The script now
  tells the two 429s apart: a per-minute rate limit backs off and retries, the
  daily cap stops the run, saves what it got, and says when it resets.
  Rows refreshed within 14 days are skipped, so a re-run costs nothing.
- `scripts/place-ids.mjs` resolves the IDs. An IDs-only text search is a free
  SKU, but the quota is 32/day, so a full pass spans several days.
- At render time only two calls survive — the photo and the transit time —
  and both go through `src/lib/cache.js`, which caches in `localStorage` and
  stops making calls once a per-browser monthly ceiling is hit. Concurrent
  asks for the same key share one request.
- **The photo waits for a tap.** Place Photo is an *Enterprise* SKU, so its
  allowance is 1,000 a month for everybody who uses rSpace, and it used to
  fire on arriving at a detail screen — which meant stepping through the
  ranking spent the month on places nobody paused to look at. `PhotoBand` in
  `PlaceDetail.jsx` shows a "Show photo" button instead. A photo an earlier
  visit already bought still appears immediately: `cachedPhoto()` reads the
  cache synchronously and never calls Google, so the tap is needed once per
  place, not once per visit. The transit time is *not* gated the same way —
  it is an Essentials call with ten thousand behind it, and the score is
  incomplete without it.
- The address field passes an `AutocompleteSessionToken`. A whole
  type-then-pick sequence then bills as one **free** session instead of one
  charged request per keystroke — provided `resolveSuggestion` keeps to
  Essentials fields (`location`, `addressComponents`).

The per-browser ceiling is a safety net, not a guarantee: it counts one
browser, not everyone. The real hard stop is the per-day quota on the Cloud
project, and it is now set.

### Seeing what has actually been used

Three places, in order of how much they tell you:

1. **Google Cloud console → APIs & Services → Metrics**, filtered to the
   Maps APIs, on project `nodal-unity-483903-g6`. Traffic by API and by
   response code, up to 30 days. This is real usage, everybody's, and it is
   the number that decides the bill.
   `https://console.cloud.google.com/google/maps-apis/metrics?project=nodal-unity-483903-g6`
2. **Google Maps Platform → Quotas**, same project. Shows each per-day cap
   and how close today's traffic is to it — the caps in the table above are
   the only thing that actually stops a runaway, since Maps is not eligible
   for a Cloud spend cap. The `Any spend alert` budget on the billing account
   ($1, first threshold 1%) is a tripwire that emails; it stops nothing.
   `https://console.cloud.google.com/google/maps-apis/quotas?project=nodal-unity-483903-g6`
3. **The profile screen**, bottom section. `spending()` in `src/lib/cache.js`
   counts what *this browser* has spent against `BUDGETS` this month, and the
   profile prints it under the four data sources. Useful for checking that a
   change actually reduced calls — it is how the photo-on-tap change was
   verified — but it is one browser and it says so.

The two "usage" pages worth **not** confusing: Billing → Reports shows dollars
after the $200 credit is applied and therefore reads $0 whatever happens, and
the per-SKU breakdown only appears once something bills.

### The quotas that make this free

Google's free tier is **per SKU per month**; Cloud quotas are **per day**. So
the rule for every cap is `daily × 31 ≤ the SKU's monthly allowance`. Set on
project `nodal-unity-483903-g6` (Janyaa rSpace Maps):

| API | Quota | Set | Tier · monthly free | Why |
|---|---|---|---|---|
| Places | `GetPlaceRequest` / day | **30** | Enterprise · 1,000 | 30×31 = 930 |
| Places | `GetPhotoMediaRequest` / day | **30** | Enterprise · 1,000 | photos are Enterprise, not Essentials |
| Places | `AutocompletePlacesRequest` / day | **300** | Essentials · 10,000 | was 175,000 |
| Places | `SearchTextRequest` / day | **32** | Essentials IDs-only · free | 32×31 = 992, safe even if the mask widens |
| Places | `SearchNearby` / `SearchMedia` / `SearchReviewPosts` per day | **1** | — | rSpace never calls them |
| Maps JS | `Map loads` / day | 300 | Essentials · 10,000 | |
| Maps JS | `3D Map loads` / day, `Maps Grounding Widget` / day | **1** | — | never used; 3D was unlimited |
| Routes | `ComputeRoutes` / day | 150 | Essentials · 10,000 | 150×31 = 4,650 |
| Routes | `ComputeRouteMatrix` / day | **1** | — | never used |

Three traps worth remembering:

- **Place Photo is an Enterprise SKU** (1,000/month), not Essentials. It is the
  second most expensive thing the app can do after a Place Details refresh —
  which is why it is now behind a tap rather than fired on view.
- `GetPlaceRequest` is one quota covering three different jobs — the nightly
  refresh, the address picker's `fetchFields`, and the photo lookup. They share
  the same 30/day, which is why the workflow only asks for 25.
- **Quotas count requests, not SKUs.** Which tier a call bills at is decided by
  its field mask, and no quota can see that. `SearchTextRequest` was 150/day,
  which is free only while `place-ids.mjs` asks for IDs only — widen that mask
  to an Enterprise field and 4,650 calls against a 1,000 allowance is roughly
  $128/month. It is 32/day now so the cap holds whatever the mask asks for.
  A full re-resolve of ~329 rows therefore takes ~11 days rather than one run;
  IDs are stable, so that is the right trade.

There is no spend cap on any of this. Google's spend-cap budgets only cover
Gemini, Agent Platform, Cloud Run, and Cloud Run Functions — Maps is not
eligible — so the daily quotas are the only enforcement, and the `Any spend
alert` budget on the billing account (all projects, all services, $1, first
threshold at 1% = $0.01) is only a tripwire. It emails; it does not stop
anything.

Routes stays at 150/day because rSpace sends no traffic-aware options and only
asks for `routes.duration`, which is a Compute Routes **Essentials** request.
Adding `routingPreference: TRAFFIC_AWARE` would move it to Pro (5,000/month)
and 150/day would no longer be safe — drop it to 150 → 30 if that ever changes.

## What's on at a place

`src/lib/events.json` is what is actually happening at a place in the next
**14 days**, generated by `scripts/sync-events.mjs` and read through
`src/lib/events.js`. It shows as one line on the map sheet and a
"Happening here" list on the detail screen.

Source is San José Public Library's own events service — the one behind
`sjpl.bibliocommons.com`:

```
https://gateway.bibliocommons.com/v2/libraries/sjpl/events?limit=200&page=N
```

No key, no quota, not a Google SKU, ~30s for a full pass. That is why it can
run six times a day (`.github/workflows/refresh-events.yml`) while the Google
scripts run once. **Only libraries have a feed**, so 25 places out of 565 have
events and the rest render nothing — absent is the honest state, not an empty
"no events" panel implying the place is quiet.

Four things about the upstream feed that cost time to find:

- It **ignores every date filter** tried — `startDate`, `dateFrom`, `from`,
  with and without times. The horizon is applied here instead.
- Its pages are **not sorted by date**. Every page spans about a year, so
  there is no early exit and all ~34 have to be walked.
- The event's real content is on `definition`, not the event: `title`,
  `start`, `branchLocationId`, `isCancelled`, `registrationInfo`. The event
  itself carries only `indexStart` / `indexEnd` and registration counts.
- Branch names arrive abbreviated and do **not** match catalogue names. The
  join is exact-only, tried as `"<branch> Library"` first so `Almaden` lands
  on `Almaden Library` rather than `Almaden Library & Community Center`, plus
  a written-out `ALIASES` table for the five the feed shortens past
  recognition (`King Library`, `Alum Rock`, `Mt. Pleasant`, `Tully`,
  `East SJ Carnegie`). **Do not loosen this into a contains-match**: `Alum
  Rock` also matches Alum Rock Park, Cherry Flats Reservoir and the Alum Rock
  Youth Center, and a fuzzy join puts library story time in a park. An alias
  pointing at a slug that no longer exists warns rather than silently
  dropping the branch.

`sync-events.mjs` is idempotent the way `sync-sanjose.mjs` is: it keeps the
previous `generated` timestamp when nothing else changed, so an unchanged run
writes a byte-identical file. Without that the timestamp alone would tick on
every run and each of the six daily runs would commit — and every commit is a
deploy.

Events are deliberately **not** part of the score. Every scoring input is
measured and stable; a number that moved because it is Tuesday would be a
different kind of claim. They are a badge, like interests.

## Answering "where are you?"

`src/lib/geography.json` is 98 ZIP codes and 78 towns across the South Bay,
generated by `scripts/sync-geography.mjs` from the Census Bureau's TIGERweb
service — public domain, no key, no quota — and read through
`src/lib/geography.js`.

It exists because the profiler could recognise **thirteen things**. The only
offline fallback for the address field was `NEIGHBORHOODS`, the city's own
planning areas, so a reader in Mountain View matched nothing and a reader who
typed their ZIP matched nothing — on a field whose placeholder read "e.g.
Japantown or 95112". Worse, on the location-denied screen the Continue button
was gated on a `startsWith` match against those same thirteen, so typing a ZIP
left it grey with no explanation.

It is now the **fast path, not only the fallback**. A ZIP or a town name is
answered from this file in a keystroke, with no request at all — quicker than
a round trip to Places and one fewer billable call. Google is asked only for
what it is actually better at, a street address or a cross street, and the two
lists are shown together rather than one replacing the other.

Three things in the generator that took work:

- **TIGERweb publishes each geography several times over, once per vintage,
  and only the Census 2020 copies answer a spatial query.** The ACS-vintage
  layer ids return `Failed to execute query` for the byte-identical request.
  Layer 7 (ZCTAs), 25 (incorporated places) and 26 (CDPs) are the working ones.
- **Naming a ZIP is a question about people, and two simpler readings both
  fail.** Which town contains the ZCTA's interior point answers "none" for a
  third of them, because a ZCTA runs into the hills and its middle goes with
  it — 95120 lands in open space above Almaden. Falling back to the nearest
  boundary fixes those and breaks others: it put Los Gatos's 95032 in San
  José. Taking whichever town covers the most *area* is wrong the other way:
  most of 95037's square mileage is the empty half of Coyote Valley that San
  José annexed, so area alone hands Morgan Hill's ZIP to San José. What works
  is asking first whether a *town's own middle* is inside the ZIP — that is
  what a suburb's ZIP is for — and only settling the leftovers, the ZIPs
  carved out of one big city, on area. Three ZIPs still come back unnamed and
  are shown as bare ZIPs; 95140 is Mount Hamilton and is not a suburb of
  anywhere.
- `nameForPoint()` ranks the thirteen districts and the 78 towns **together**,
  and leaves San José itself out of the town list because its districts
  already stand for it. The old `nearestNeighborhood()` could only ever answer
  with one of the thirteen, so a phone in Mountain View was told it was in
  Alviso.

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
- `0004_display_settings.sql` **is applied**. It adds `text_scale` (1–1.3) and
  `simple_ui` to `profiles`, both with defaults, so every profile written
  before it reads back as the standard screen rather than as null.
- `0005_community_places.sql` **is applied**. Two CHECK constraints were
  written when the city's service was the only source and both reject the
  OpenStreetMap rows: `category` was an enum without `Food` or `Outdoors`, and
  `source` was an enum that cannot list an element id. `source` is now a
  pattern (`osm-(node|way|relation)-\d+`) so an unrecognised source is still
  rejected without enumerating four hundred thousand values.
- **`listPlaces()` unions Supabase with the bundled catalogue**, Supabase
  winning where it has the row. The generators commit to the repo and push to
  Supabase in the same workflow run, so anything that widens the catalogue
  leaves the table a step behind the bundle until the next run — without the
  union those places are simply invisible to signed-in readers for a day.
  `toggleFavorite` uses `maybeSingle()` for the same reason and returns
  quietly when the row is not in the table yet; `single()` threw.
- `0003_city_open_data.sql` **is applied**, and the catalogue is loaded — the
  live table holds the generated rows, not the old 26. Nine retired slugs were
  deleted; the two real favorites both pointed at `almaden-community-center`,
  which the city now calls `almaden-library-community-center` (same address,
  same building), so they were re-pointed before the delete rather than being
  cascade-deleted. **Check `favorites` before retiring a slug** — the FK is
  `on delete cascade` and will take real user data with it.
- "Confirm email" is **off**, so signup returns a session immediately.
- Supabase's own validator rejects `example.com` and `.test` addresses, so
  throwaway test accounts need a plausible domain. To test signed-in flows,
  insert a user into `auth.users` with `crypt(...)`, add a `profiles` row so the
  `RequireProfile` guard passes, and delete it afterwards. Signing up through
  the UI works too, but the app's own delete only removes `profiles` — clear
  `score_weights` and `auth.users` by hand afterwards.
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

Project `nodal-unity-483903-g6` ("Janyaa rSpace Maps") is owned by
**sunil.kotian@gmail.com**. None of the other Google accounts signed in on
Rishaan's machine can see it — signing in as anything else gives
"You need additional access", which looks like a broken link and is not one.

One key, restricted by HTTP referrer to the Vercel domains and
`http://localhost:5173/*`. Enabled: Maps JavaScript, Places (New), Routes.
Geocoding is **not** enabled and the app does not need it.

> **All three Maps APIs are disabled as of 2026-09-03** (see `HIBERNATION.md`).
> The referrer restriction was never the thing protecting this key: a request
> that merely sends `Referer: https://rspace-blush.vercel.app/` was accepted,
> and the key shipped inside the public JS bundle, so the restriction only ever
> stopped honest callers. Disabling the APIs is what actually stops it. The
> key itself is untouched and still valid — re-enabling the three APIs is all
> it takes to bring Google back.

Seven APIs were enabled in total and that was deliberate — four now, with
the three Maps APIs disabled above. Google turns on
~20 by default — BigQuery and its five satellites, Dataplex, Dataform,
Datastore, Cloud SQL, Cloud Trace, Analytics Hub, and three Cloud Storage
services — all of which showed no traffic over 30 days and none of which
rSpace touches. They were **disabled**, not quota'd: a quota still leaves a
billable surface open, and there is no daily cap to set on a service that
should never be called. Disabling BigQuery also takes
`cloudapis.googleapis.com` with it, which is an inert meta-service and not a
dependency of the Maps APIs.

Four non-Maps APIs are kept on purpose:

| API | Why it stays |
|---|---|
| Cloud Monitoring | backs the Maps metrics and quota-usage pages — the dashboards used to verify all of the above |
| Cloud Logging | same, for errors |
| Service Usage | disabling it removes the ability to enable or disable any API |
| Service Management | same |

All four have generous free tiers and zero usage. Re-enabling anything
retired here is a one-click undo in the console if it is ever needed.

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
- Screen **05 · /onboarding/you** gained a "How this should read" section under
  the age field. The age was collected and then never used for anything — the
  copy promised it would "flag places with age limits", which nothing did. It
  now proposes a text size and the simplified layout, which the reader can
  overrule on the spot; touching either control stops the proposing. Kept on
  screen 05 rather than added as a sixth step so the four-step flow and the
  handoff numbering both stay intact.
- Screen **13** now has a "Show photo" button in place of a photo that loaded
  itself, and a provenance line at the foot naming the source — linked to the
  exact OpenStreetMap element on the rows that came from there.
- Screen **08 · /onboarding/interests** and screen **16 · /profile/edit** both
  gained an "Or write your own" field under the chips, which reports how many
  places a typed interest matches before it is added.
- Screen **15 · /profile** gained a "Where this comes from" section: the four
  generated sources with their dates, and what this browser has spent on
  Google's two render-time calls this month.
- Screens **11** and **20** turned the sheet's step row into a tab. `‹ 3 / 320 ›`
  now rides the sheet's top rule as one bordered group instead of spending a
  37pt row inside the card, and the count is the control that opens the full
  ranking.

## Conventions

- Match the existing style: plain functions, no premature abstraction, comments
  that explain *why* rather than narrate.
- Screens own their layout inline; only genuinely shared things go in
  `styles.css` or `ui.jsx`.
- Verify UI changes in the browser before saying they work — this project has
  had several bugs that only appear at runtime.
