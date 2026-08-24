import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store";
import { cachedPhoto, hasMapsKey, placePhoto, transitMinutes } from "../lib/google";
import { EVENTS_SOURCE, eventsFor, whenLabel } from "../lib/events";
import { COMMUNITY_SOURCE, SOURCE } from "../lib/seed";
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
  // expensive Places tiers out of the render path entirely. The transit time
  // is the only thing left that has to be asked for on arrival: the score
  // below is incomplete without it, and Compute Routes is an Essentials call
  // with 10,000 a month behind it.
  //
  // The photo is not fetched here. Place Photo bills at the Enterprise tier
  // that has 1,000 a month, so it waits for a tap — see PhotoBand.
  useEffect(() => {
    if (!place || !hasMapsKey) return;
    let alive = true;

    transitMinutes(origin, place)
      .then((minutes) => {
        if (!alive) return;
        // A null transit time is left null on purpose: the transport
        // component then drops out of the score and its weight spreads over
        // the rest, which is what the starred total below is reporting.
        setLive({ transit_minutes: minutes });
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
      <PhotoBand key={place.id} place={place} onBack={() => navigate(-1)} />

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
              // Dropped rather than guessed when the price is unknown. Every
              // city site is free and says so; OpenStreetMap publishes no
              // price for a café, and "Entry fee" on a coffee shop was the
              // old copy filling that silence with a claim.
              place.price_level === 0 && "Free entry",
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

        <Provenance place={place} />
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
 * Who says so. OpenStreetMap's licence asks for attribution wherever its data
 * is shown, and the city's asks for it too — but the better reason to print
 * this is that every number on the screen above is meant to be checkable, and
 * a row links straight to the record it was built from.
 */
function Provenance({ place }) {
  const osm = /^osm-(node|way|relation)-(\d+)$/.exec(place.source ?? "");

  return (
    <div className="pad" style={{ padding: "16px 24px 28px", borderTop: "1px solid var(--hairline)" }}>
      <p className="aside" style={{ fontSize: 15.5 }}>
        From{" "}
        {osm ? (
          <a
            href={`https://www.openstreetmap.org/${osm[1]}/${osm[2]}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit" }}
          >
            {COMMUNITY_SOURCE}
          </a>
        ) : (
          SOURCE
        )}
        {place.rating != null && ". Rating, reviews and the quote above from Google"}.
      </p>
    </div>
  );
}

/**
 * The header band, and the one Google call on this screen that the reader
 * starts themselves.
 *
 * Place Photo bills at the Enterprise tier — 1,000 requests a month for
 * everybody who uses rSpace, not per person — and it used to fire on arrival,
 * so stepping through the ranking spent the month's allowance on places
 * nobody paused to look at. A tap is the whole difference between a photo
 * somebody wanted and a photo that merely happened.
 *
 * A photo an earlier visit already bought is shown without asking: the cache
 * holds it for a week, and `cachedPhoto` reads that without touching Google.
 * So the tap is needed once per place, not once per visit.
 */
function PhotoBand({ place, onBack }) {
  // undefined — never asked. null — asked, and there is nothing to show.
  const [photo, setPhoto] = useState(() => cachedPhoto(place));
  const [loading, setLoading] = useState(false);

  const offer = hasMapsKey && place.google_place_id && photo === undefined;

  async function load() {
    setLoading(true);
    setPhoto(await placePhoto(place));
    setLoading(false);
  }

  return (
    <div
      style={{
        height: 196,
        flex: "none",
        background: "#d5d8c6",
        backgroundImage: photo ? `url("${photo}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: "0 20px 16px",
      }}
    >
      <button
        type="button"
        className="btn ghost"
        style={{ position: "absolute", top: 20, left: 20, width: 36, height: 36, background: "var(--paper)", fontSize: 17 }}
        onClick={onBack}
        aria-label="Go back"
      >
        ‹
      </button>

      {offer && (
        <button
          type="button"
          className="btn xs ghost"
          style={{ width: "auto", padding: "0 16px", background: "var(--paper)" }}
          disabled={loading}
          onClick={load}
        >
          {loading ? "Loading…" : "Show photo"}
        </button>
      )}

      {/* Google was asked and had nothing — or this browser has already spent
          its share of the month. Either way there is no second tap to offer. */}
      {photo === null && place.google_place_id && (
        <span
          className="eyebrow"
          style={{ background: "var(--paper)", padding: "5px 9px", color: "var(--label)" }}
        >
          No photo
        </span>
      )}
    </div>
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
