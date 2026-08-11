import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store";
import { hasMapsKey, lookupPlace, transitMinutes } from "../lib/google";
import { FACTORS, formatMiles, scorePlace } from "../lib/scoring";
import { Alarm, AppBar, Device, Meter, SaveButton, Stars } from "../components/ui";

// 13 · /place/:id — Detail  ·  25 · Google data unavailable  ·  26 · Closed
export default function PlaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { allPlaces, ranked, weights, origin, favorites, toggleFavorite } = useApp();

  const place = allPlaces.find((p) => p.id === id);
  const [live, setLive] = useState(null);
  const [stale, setStale] = useState(false);

  // Photo and rating come from the live listing; the stored row is the
  // fallback for everything except the photo, which has no stored form.
  useEffect(() => {
    if (!place || !hasMapsKey) return;
    let alive = true;

    Promise.all([lookupPlace(place), transitMinutes(origin, place)])
      .then(([found, minutes]) => {
        if (!alive) return;
        if (!found) return setStale(true);
        setLive({
          ...Object.fromEntries(Object.entries(found).filter(([, v]) => v != null)),
          transit_minutes: minutes,
        });
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
  const rank = ranked.findIndex((p) => p.id === place.id) + 1;

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
        <div style={{ position: "absolute", top: 20, right: 20, background: "var(--paper)" }}>
          <SaveButton saved={saved} onClick={() => toggleFavorite(place.id)} size={36} />
        </div>
        {merged.photo && (
          <div className="meta" style={{ background: "var(--paper)", padding: "4px 9px" }}>
            Photo · Google Places
          </div>
        )}
      </div>

      <div className="scroll">
        {stale && (
          <div className="pad" style={{ paddingTop: 20 }}>
            <Alarm title="Showing saved data">
              We couldn&rsquo;t reach Google just now. Ratings below are the last values we stored;
              transit time is unavailable.
            </Alarm>
          </div>
        )}

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="eyebrow moss" style={{ letterSpacing: ".2em" }}>
            {place.category} place · No. {String(rank).padStart(2, "0")}
          </div>
          <h2 className="display" style={{ fontSize: 36, paddingTop: 7 }}>
            {place.name}
          </h2>
          <p className="aside" style={{ fontSize: 17, color: "var(--text-4)", paddingTop: 7 }}>
            {place.address} ({formatMiles(miles)}) ·{" "}
            {place.price_level === 0 ? "Free entry" : "Entry fee"} · {place.hours}
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-head strong">
            <span>Score, by factor</span>
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

        <div className="pad" style={{ padding: "16px 24px 24px", display: "grid", gap: 10 }}>
          <div className="eyebrow">From the reviews</div>
          <Stars rating={merged.rating} reviews={merged.reviews} />
          {merged.quote && (
            <p className="prose" style={{ fontSize: 17.5, color: "var(--text-2)" }}>
              &ldquo;{merged.quote}&rdquo;
            </p>
          )}
        </div>
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
