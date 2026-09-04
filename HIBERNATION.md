# rSpace is hibernating

Taken offline **2026-09-03**. Nothing was deleted. Every step below is a
toggle, and reversing them in order brings the app back exactly as it was.

Read this top to bottom if you are waking it up. It should take about ten
minutes, most of which is waiting for Supabase to unpause.

---

## What was switched off, and why each one mattered

| # | Surface | State now | Why it had to be touched |
|---|---|---|---|
| 1 | GitHub Actions — `Refresh the catalogue` | disabled | Ran daily, committed to `main`, and every commit is a Vercel deploy |
| 2 | GitHub Actions — `Refresh events` | disabled | Same, six times a day |
| 3 | Vercel project `rspace` | paused | The three `*.vercel.app` domains now return `503 DEPLOYMENT_PAUSED` |
| 4 | Supabase project `rspace` | paused | Auth and Postgres are offline; data is retained |
| 5 | Google Maps, Places (New), Routes APIs | disabled | The API key alone could still be spent against — see below |

Deliberately **not** touched:

- The GitHub repo is still public. The code is the Janyaa submission; there is
  nothing to hide in it and nothing about it costs money.
- Vercel environment variables are intact, so unpausing restores a working
  build with no re-entry of keys.
- Supabase project `janyaa-hub` is a **different, live app with real users**.
  It was not touched and must not be.

---

## 5 · Google, and why disabling the APIs was the only thing that worked

Google Cloud project `nodal-unity-483903-g6` ("Janyaa rSpace Maps") is owned by
**sunil.kotian@gmail.com**. No other Google account signed in on this Mac can
see it; they all get "You need additional access", which looks like a broken
link and is not one.

**Maps JavaScript API, Places API (New) and Routes API are all disabled.**

The reason this mattered more than it looks. The key was restricted by HTTP
referrer to the rSpace domains, and that restriction is not security. On the
day of shutdown, a request that simply *claimed* to come from
`rspace-blush.vercel.app` — by sending that one header — was accepted and
served real data, with the site already paused. The key had shipped inside the
public JavaScript bundle for months, so anyone holding a copy could spend
against it. The referrer rule only ever stopped honest callers.

Disabling the APIs is what actually closed it. Re-tested afterwards with the
identical spoofed request: Places and Routes now answer

```
403 PERMISSION_DENIED — "... has not been used in project 714345111476
before or it is disabled."
```

Four APIs are deliberately left enabled — Cloud Monitoring, Cloud Logging,
Service Usage, Service Management. They have generous free tiers and no
traffic, and disabling Service Usage would take away the ability to re-enable
anything else.

The API key itself was **not** deleted, and it is still valid. That is the
point: re-enabling three APIs restores Google completely, with no new key to
generate and nothing to update in Vercel or `.env.local`.

## Waking rSpace back up

Do these in order. Steps 1 and 2 can be done from a phone.

**1 · Google** — sign in as **sunil.kotian@gmail.com** and click **ENABLE** on
each of these three:

- https://console.cloud.google.com/apis/api/maps-backend.googleapis.com/metrics?project=nodal-unity-483903-g6
- https://console.cloud.google.com/apis/api/places.googleapis.com/metrics?project=nodal-unity-483903-g6
- https://console.cloud.google.com/apis/api/routes.googleapis.com/metrics?project=nodal-unity-483903-g6

Without this the app still loads, but the map falls back to the drawn "paper"
map and transit times drop out of the score. That is by design — every Google
call has a fallback — so it fails quietly rather than visibly. Check the map
screen before assuming it worked.

**2 · Supabase** — open
https://supabase.com/dashboard/project/derofupvnoucaujweiug and click
**Restore project**. It takes a few minutes. Nothing needs to be re-entered;
the tables, the row-level security and the user accounts all come back as
they were.

**3 · Vercel** — open
https://vercel.com/rishaank/rspace/settings and click **Unpause**, or run:

```bash
cd ~/Documents/GitHub/rSpace && npx vercel --prod
```

**4 · The two data schedules** — from inside the repo:

```bash
gh workflow enable "Refresh the catalogue" && gh workflow enable "Refresh events"
```

**5 · Check it** — https://rspace-blush.vercel.app should return a page rather
than a 503. The events list will be stale by however long the app slept; the
next scheduled run repairs it, or force one now:

```bash
gh workflow run "Refresh events"
```

---

## The backup, and when you would need it

`~/Documents/rSpace-offline-backup/` (on this Mac, outside the repo because
the repo is public and this contains real user rows):

| File | What it is |
|---|---|
| `supabase-data-2026-09-03.json` | Every row: 8 profiles, 9 auth users, 2 favorites, 7 weight rows, 328 catalogue rows |
| `migrations/` | Copy of `supabase/migrations/` as it stood |
| `env.local.backup` | The four environment values, `chmod 600`. **Contains live secrets — never commit it** |
| `vercel-project.json` | The Vercel project and org ids |
| `git-commit-at-shutdown.txt` | The commit `main` was on |

You only need this if Supabase deletes the paused project. Supabase does not
promise to keep a free-tier project paused forever, so if rSpace is going to
sleep for more than a few months, check on it once in a while — or accept
that a rebuild means re-running the migrations and re-importing that JSON.

The 328 catalogue rows are the least valuable thing in the backup: they are
regenerated from `src/lib/catalogue.json` in the repo by `scripts/seed.mjs`.
The profiles and favorites are the only data that exists nowhere else.
