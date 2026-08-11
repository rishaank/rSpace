# Third Space

A guide to the public places in San José worth spending time in — parks, courts,
libraries, community centers — scored against what each person actually cares
about. Built for the Janyaa Social Innovation Challenge 2026.

**Live: [rspace-rishaank.vercel.app](https://rspace-rishaank.vercel.app)**

Implemented one-to-one from `Third Space — App Screens.dc.html`: all 26 screens
across six flows, mobile web at 390 × 844.

## Running it

```bash
npm install && npm run dev
```

It works with no configuration. Without API keys the app runs against the
curated seed list of 25 San José third spaces, storing accounts, profiles,
weights, and favourites in `localStorage`. Every flow is complete in that mode.

To wire up the real services, copy `.env.example` to `.env.local` and fill in
what you have — each key is picked up independently:

| Key | Turns on |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Real auth and persistence |
| `VITE_GOOGLE_MAPS_API_KEY` | Live map, address autocomplete, live ratings, transit times |
| `VITE_GOOGLE_MAPS_MAP_ID` | Swaps the drawn map for the live Google map (needs a real Map ID) |

Enable **Maps JavaScript API**, **Places API (New)**, and **Routes API** on the
Google key, and restrict it by HTTP referrer. The referrer list needs both the
deployed origin and `http://localhost:5173/*`, or local development falls back
to the paper map and seeded transit times.

### Supabase setup

```bash
supabase db push
```

Or paste `supabase/migrations/0001_init.sql` into the SQL editor. Then seed the
catalogue:

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed.mjs
```

## The scoring algorithm

`Score = aI + bD + cT + dP + eC`, all in [src/lib/scoring.js](src/lib/scoring.js).

| Component | Source | Normalisation |
|---|---|---|
| **I** — interactability | Places popularity / busy-times proxy | `popularity / 100` |
| **D** — distance | Haversine from the user's neighborhood | `1 − miles / 8`, computed per request, never stored |
| **T** — transport | Routes API, transit mode | `1 − minutes / 30` |
| **P** — popularity | Places rating × review volume | `0.65 · stars + 0.35 · log-scaled reviews` |
| **C** — cost | `price_level` 0–4, missing falls back to **2** | `1 − level / 4` |

Weights default to 0.30 / 0.25 / 0.20 / 0.15 / 0.10 and are stored **raw** in
`score_weights`. They are normalised to sum 1.0 at query time, which is why
dragging one slider never yanks the others — the behaviour the design calls for.

When a component comes back `null` — Google unreachable, no transit route — it
drops out and its weight is redistributed across the rest. That is what produces
the `89*` and hatched-bar treatment on the degraded place screen.

## Two deliberate deviations from the spec

1. **`third_spaces` stores raw Google inputs, not pre-normalised `*_score`
   columns.** Re-tuning the normalisation then costs nothing; storing
   `interactability_score` would mean a re-seed on every change. `distance_score`
   and `total_score` are computed per request exactly as specified.
2. **Categories follow the design, not the spec's first draft.** Gathering /
   Sport / Service / Other, which map onto Hanging Out / Sports / Volunteering /
   Etc.

One design element is intentionally not shipped: the mock `9:41` status bar
appears only in the ≥ 480 px desktop preview frame, where it reads as part of
the phone chrome. Real phones get their own status bar.

## Layout

```
src/
  lib/        scoring, seed data, Supabase + Google adapters, app store
  components/ design-system primitives, map canvas, weight sliders
  routes/     one file per screen, each headed with its design number
supabase/     schema and RLS
scripts/      seed loader
```

`src/lib/data.js` is the single data surface. It branches on whether Supabase is
configured; nothing above it knows the difference.

## Interest keywords

Fifteen, in three groups (`src/lib/seed.js`) — sport & movement, making &
learning, community. They filter the map and never affect a score.
