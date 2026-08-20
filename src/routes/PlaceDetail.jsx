import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store";
import { hasMapsKey, placePhoto, transitMinutes } from "../lib/google";
import { EVENTS_SOURCE, eventsFor, whenLabel } from "../lib/events";
import {
  BELLARMINE_SOURCE,
  BELLARMINE_URL,
  clubsFor,
  milesFromCampus,
  reasonFor,
} from "../lib/bellarmine";
import { FACTORS, formatMiles, scorePlace } from "../lib/scoring";
import { Alarm, Device, Meter, SaveButton, Stars } from "../components/ui";

// 13 · /place/:id — Detail  ·  25 · Google data unavailable  ·  26 · Closed
export default function PlaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { allPlaces, ranked, weights, origin, favorites, toggleFavorite } = useApp();

  const place = allPlaces.find((p) => p.id === id);
  const [live, setLive] = useState(null);
  const [stale, setStale] = useState(false);

  // The rating, review count, price, and quote already sit on the row —
  // refresh-places.mjs writes them from the listing, which keeps the two
  // expensive Places tiers out of the render path entirely. What is left is
  // the photo, which has no stored form, and the transit time, which depends
  // on this user's origin. Both are cached in ./lib/cache.js.
  useEffect(() => {
    if (!place || !hasMapsKey) return;
    let alive = true;

    Promise.all([placePhoto(place), transitMinutes(origin, place)])
      .then(([photo, minutes]) => {
        if (!alive) return;
        // A null transit time is left null on purpose: the transport
        // component then drops out of the score and its weight spreads over
        // the rest, which is what the starred total below is reporting.
        setLive({ photo, transit_minutes: minutes });
        setStale(minutes == null);
      })
      .catch(() => alive && setStale(true));

    return () => {
      alive = false;
    };
  }, [place, origin]);

  if (!place) return <Navigate to="/map" replace />;
  if (place.closed) return <Closed place={place} ranked={ranked} />;

  const merged = { ...place, ...(live ?? {}) };
  const { total, components, miles } = scorePlace(merged, weights, origin);
  const saved = favorites.includes(place.id);

  return (
    <Device>
      <div
        style={{
          height: 196,
          flex: "none",
          background: "#d5d8c6",
          backgroundImage: merged.photo ? `url("${merged.photo}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 22px 12px",
        }}
      >
        <button
          type="button"
          className="btn ghost"
          style={{ position: "absolute", top: 20, left: 20, width: 36, height: 36, background: "var(--paper)", fontSize: 17 }}
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ‹
        </button>
      </div>

      <div className="scroll">
        {stale && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <Alarm title="No transit time right now">
              We couldn&rsquo;t reach Google&rsquo;s routing just now, so transit access is left out
              of the score below. Everything else on this page is stored, and unaffected.
            </Alarm>
          </div>
        )}

        <div className="pad" style={{ paddingTop: 18 }}>
          <h2 className="display" style={{ fontSize: 36 }}>
            {place.name}
          </h2>
          {merged.summary && (
            <p className="prose" style={{ fontSize: 17.5, color: "var(--text-2)", paddingTop: 9 }}>
              {merged.summary}
            </p>
          )}
          {/* Each clause is dropped rather than filled in when the field is
              missing — the city publishes no opening hours for most sites,
              and a plausible-looking "Open till 9" was invented copy. */}
          <p className="aside" style={{ fontSize: 17, color: "var(--text-4)", paddingTop: 9 }}>
            {[
              place.address,
              miles != null && `${formatMiles(miles)} away`,
              place.price_level === 0 ? "Free entry" : "Entry fee",
              place.hours,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {merged.rating != null && (
            <div style={{ paddingTop: 9 }}>
              <Stars rating={merged.rating} reviews={merged.reviews} />
            </div>
          )}
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-head strong">
            <span>Score</span>
            <span
              className="score"
              style={{ fontSize: 26, lineHeight: 1, color: stale ? "var(--moss)" : "var(--pine)" }}
            >
              {total}
              {stale ? "*" : ""}
            </span>
          </div>

          {FACTORS.map((factor) => (
            <Meter
              key={factor.key}
              name={factor.short}
              value={components[factor.key]}
              tone={(components[factor.key] ?? 0) >= 0.9 ? "full" : "mid"}
            />
          ))}

          {stale && (
            <p className="aside" style={{ fontSize: 15.5, paddingTop: 9, color: "var(--clay)" }}>
              *Transit weight redistributed across the other four factors.
            </p>
          )}
        </div>

        <Happening slug={merged.id} />

        <Clubs place={merged} />

        {merged.quote && (
          <div className="pad" style={{ padding: "16px 24px 24px" }}>
            <blockquote className="quote">
              <p>&ldquo;{merged.quote}&rdquo;</p>
              {/* Google's terms require the reviewer's own rating and name to
                  travel with the quote, so the stars here are the reviewer's,
                  not the place's. */}
              <footer style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {merged.quote_rating != null && <Stars rating={merged.quote_rating} size={13} />}
                <span>{merged.quote_author ?? "A Google reviewer"}</span>
              </footer>
            </blockquote>
          </div>
        )}
      </div>

      <div
        className="pad"
        style={{
          flex: "none",
          padding: "14px 24px max(30px, env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--edge)",
          display: "flex",
          gap: 10,
        }}
      >
        <a
          className="btn sm"
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=transit`}
          target="_blank"
          rel="noreferrer"
        >
          {stale ? "Try again" : "Get directions"}
        </a>
        <SaveButton saved={saved} onClick={() => toggleFavorite(place.id)} size={50} />
      </div>
    </Device>
  );
}

/**
 * What is on here in the next fortnight. Only libraries publish a feed, so
 * this is absent on most places — and absent is the honest state, not an
 * empty "no events" panel implying the place is quiet.
 *
 * The list is capped: a busy branch runs 60 things in two weeks, and a wall of
 * them buries the rest of the screen. The count says what the cap hid.
 */
function Happening({ slug }) {
  const events = eventsFor(slug);
  if (!events.length) return null;

  const shown = events.slice(0, 6);

  return (
    <div className="pad" style={{ paddingTop: 18 }}>
      <div className="section-head">
        <span>Happening here</span>
        <span>{events.length} in the next two weeks</span>
      </div>

      {shown.map((event) => (
        <div
          key={`${event.start}-${event.title}`}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            borderBottom: "1px solid var(--hairline)",
            padding: "9px 0",
          }}
        >
          {/* Wide enough for the longest label the formatter can produce,
              "Tomorrow 10:30 AM", at slightly tighter tracking than the
              eyebrow's default — otherwise it wraps and the rows stop
              lining up. */}
          <span className="eyebrow moss" style={{ flex: "none", width: 122, letterSpacing: ".09em" }}>
            {whenLabel(event.start)}
          </span>
          <span className="grow" style={{ fontSize: 17, lineHeight: 1.35 }}>
            {event.title}
          </span>
          {event.registration && (
            <span className="meta" style={{ flex: "none", fontSize: 14 }}>
              sign up
            </span>
          )}
        </div>
      ))}

      <p className="aside" style={{ fontSize: 15.5, paddingTop: 9 }}>
        From {EVENTS_SOURCE}.
      </p>
    </div>
  );
}

/**
 * The Bellarmine clubs that could hold a meeting here.
 *
 * Same rule as Happening above: absent on the places nothing matches, rather
 * than an empty panel implying no one at school would come. A club is listed
 * because the city publishes that this site has the thing the club does —
 * Pickleball Club against the city's pickleball courts, Chess Club against
 * its game tables, the four talk-and-table tabs against a library — so every
 * row can say why it is here.
 *
 * Distance is measured from campus, not from the reader's home. The score
 * above already answers "how far is this from where I live"; a club meeting
 * starts at the last bell, and that is a different question.
 */
function Clubs({ place }) {
  const clubs = clubsFor(place.id);
  if (!clubs.length) return null;

  const shown = clubs.slice(0, 8);
  const miles = milesFromCampus(place);

  return (
    <div className="pad" style={{ paddingTop: 18 }}>
      <div className="section-head">
        <span>Bellarmine clubs</span>
        <span>{clubs.length} could meet here</span>
      </div>

      {shown.map((club, i) => {
        const reason = reasonFor(club);
        // A library matches 29 clubs for the same reason 29 times over, and
        // printing it on every row turns the answer into wallpaper. The
        // reason is a heading for the run of clubs under it, not a property
        // of each one.
        const heading = i === 0 || reason !== reasonFor(shown[i - 1]);

        return (
          <div
            key={club.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "baseline",
              borderBottom: "1px solid var(--hairline)",
              padding: "9px 0",
            }}
          >
            <span className="grow" style={{ fontSize: 17, lineHeight: 1.35 }}>
              {club.name}
            </span>
            {heading && (
              <span className="meta" style={{ flex: "none", fontSize: 14, color: "var(--label)" }}>
                {reason}
              </span>
            )}
          </div>
        );
      })}

      <p className="aside" style={{ fontSize: 15.5, paddingTop: 9 }}>
        {clubs.length > shown.length && `And ${clubs.length - shown.length} more. `}
        {miles != null && `Campus is ${formatMiles(miles)} away. `}
        Roster from{" "}
        <a href={BELLARMINE_URL} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
          {BELLARMINE_SOURCE}
        </a>
        , which publishes no meeting times — so neither does this.
      </p>
    </div>
  );
}

// 26 · Place closed / stale listing
function Closed({ place, ranked }) {
  const navigate = useNavigate();
  const alternatives = ranked
    .filter((p) => p.category === place.category)
    .slice(0, 3);

  return (
    <Device>
      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            height: 180,
            flex: "none",
            background: "#d5d8c6",
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            padding: "0 22px 12px",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(245,242,232,.55)" }} />
          <button
            type="button"
            className="btn ghost"
            style={{ position: "absolute", top: 16, left: 20, width: 36, height: 36, background: "var(--paper)", fontSize: 17 }}
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            ‹
          </button>
          <div
            className="eyebrow"
            style={{
              position: "relative",
              color: "var(--paper)",
              background: "var(--clay)",
              padding: "5px 10px",
              letterSpacing: ".16em",
            }}
          >
            Permanently closed
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <h2
            className="display"
            style={{
              fontSize: 33,
              color: "var(--text-4)",
              textDecoration: "line-through",
              textDecorationThickness: 1,
            }}
          >
            {place.name}
          </h2>
          <p className="prose" style={{ fontSize: 17.5, paddingTop: 12, color: "var(--text-2)" }}>
            Google marked this place permanently closed on {place.closed_on}. It no longer counts
            toward your scores, and we&rsquo;ve removed it from the map.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 22 }}>
          <div className="section-head">Three open places like it</div>
          {alternatives.map((p) => (
            <Link key={p.id} to={`/place/${p.id}`} className="placerow" style={{ alignItems: "baseline" }}>
              <div className="n" style={{ fontSize: 25, width: 42 }}>
                {p.total}
              </div>
              <div className="grow">
                <div style={{ fontSize: 19.5 }}>{p.name}</div>
                <div className="meta">
                  {formatMiles(p.miles)} · {p.price_level === 0 ? "free" : "paid"}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="notice">Think this is wrong? Tell us and we&rsquo;ll re-check the listing.</div>
        </div>

        <div className="foot pad" style={{ padding: "14px 24px 30px" }}>
          <Link to="/map" className="btn sm">
            Back to the map
          </Link>
        </div>
      </div>
    </Device>
  );
}
