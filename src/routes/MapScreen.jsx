import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/store";
import { CATEGORIES } from "../lib/seed";
import { formatMiles } from "../lib/scoring";
import { Chip, Device, Icon, SaveButton, Slider, TabBar, Toggle } from "../components/ui";
import MapCanvas from "../components/MapCanvas";

const COSTS = [
  { id: "free", label: "Free only", max: 0 },
  { id: "cheap", label: "Under $10", max: 1 },
  { id: "any", label: "Any", max: 4 },
];

const MAX_DISTANCE = 8;

const DEFAULT_FILTERS = {
  categories: [],
  interestsOnly: false,
  within: MAX_DISTANCE,
  cost: "any",
};

function apply(places, filters, interests) {
  const ceiling = COSTS.find((c) => c.id === filters.cost).max;
  return places.filter((place) => {
    if (filters.categories.length && !filters.categories.includes(place.category)) return false;
    if (filters.interestsOnly && !place.interests.some((i) => interests.includes(i))) return false;
    if (place.miles != null && place.miles > filters.within) return false;
    if ((place.price_level ?? 2) > ceiling) return false;
    return true;
  });
}

// 11 · /map — Default   ·   12 · Filter sheet   ·   22 · Nothing matches   ·   23 · Scoring
export default function MapScreen() {
  const { ranked, profile, origin, scoring, favorites, toggleFavorite } = useApp();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const visible = useMemo(
    () => apply(ranked, filters, profile.interests ?? []),
    [ranked, filters, profile.interests]
  );

  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;

  // What would bring results back, for the empty state.
  const wider = Math.min(Math.max(filters.within * 2, 1), MAX_DISTANCE);
  const widerLabel = `${wider} ${wider === 1 ? "mile" : "miles"}`;
  const widened = apply(ranked, { ...filters, within: wider }, profile.interests ?? []);
  const relaxed = apply(ranked, { ...filters, cost: "any" }, profile.interests ?? []);

  const activePills = [
    ...filters.categories.map((c) => ({ id: c, label: c, clear: () => setCategory(c) })),
    filters.within < MAX_DISTANCE && {
      id: "within",
      label: `Under ${filters.within} mi`,
      clear: () => setFilters((f) => ({ ...f, within: MAX_DISTANCE })),
    },
    filters.cost !== "any" && {
      id: "cost",
      label: COSTS.find((c) => c.id === filters.cost).label,
      clear: () => setFilters((f) => ({ ...f, cost: "any" })),
    },
    filters.interestsOnly && {
      id: "interests",
      label: "My interests",
      clear: () => setFilters((f) => ({ ...f, interestsOnly: false })),
    },
  ].filter(Boolean);

  function setCategory(category) {
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(category)
        ? f.categories.filter((c) => c !== category)
        : [...f.categories, category],
    }));
  }

  if (scoring) return <Scoring places={ranked.slice(0, 4)} origin={origin} />;

  return (
    <Device>
      <MapCanvas
        places={visible}
        selectedId={selected?.id}
        onSelect={setSelectedId}
        origin={origin}
      />

      <div className="mapheader">
        <div
          className="pad"
          style={{
            padding: "8px 24px 10px",
            borderBottom: "2px solid var(--ink)",
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div className="display sm">
            {visible.length ? `${visible.length} place${visible.length === 1 ? "" : "s"}` : "No places"}
          </div>
          <div className="meta" style={{ marginLeft: "auto", color: "var(--label)" }}>
            {profile.location}
          </div>
        </div>

        {visible.length === 0 && activePills.length > 0 ? (
          <div
            className="pad"
            style={{
              padding: "9px 24px",
              borderBottom: "1px solid var(--edge)",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {activePills.map((pill) => (
              <button key={pill.id} type="button" className="chip on" style={{ padding: "5px 11px", fontSize: 15.5 }} onClick={pill.clear}>
                {pill.label} ×
              </button>
            ))}
          </div>
        ) : (
          <div
            className="pad"
            style={{
              padding: "9px 24px",
              borderBottom: "1px solid var(--edge)",
              display: "flex",
              alignItems: "center",
              gap: 15,
            }}
          >
            <FilterTab on={!filters.categories.length} onClick={() => setFilters((f) => ({ ...f, categories: [] }))}>
              All
            </FilterTab>
            {CATEGORIES.slice(0, 3).map((c) => (
              <FilterTab key={c} on={filters.categories.includes(c)} onClick={() => setCategory(c)}>
                {c}
              </FilterTab>
            ))}
            <button
              type="button"
              className="linkbtn"
              style={{
                marginLeft: "auto",
                fontFamily: "var(--sans)",
                fontStyle: "normal",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: ".01em",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => setSheet(true)}
            >
              <Icon name="filters" size={17} />
              Filters
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 && (
        <div
          className="scroll"
          style={{ position: "relative", padding: "60px 30px 0", display: "grid", gap: 16, alignContent: "start" }}
        >
          <div style={{ width: 52, height: 2, background: "var(--ink)" }} />
          <h2 className="display md">
            {activePills.length === 1
              ? "Nothing matches that filter."
              : `Nothing matches all ${activePills.length} filters.`}
          </h2>
          <p className="prose" style={{ fontSize: 17.5, color: "var(--text-2)" }}>
            {wider > filters.within && widened.length > 0
              ? `Widening the distance to ${widerLabel} finds ${widened.length} of them.`
              : relaxed.length > 0
                ? `${relaxed.length} places match everything except the cost filter.`
                : "Nothing nearby fits this combination."}
          </p>
          <div style={{ display: "grid", gap: 10, paddingTop: 8 }}>
            {wider > filters.within && widened.length > 0 && (
              <button
                type="button"
                className="btn sm"
                onClick={() => setFilters((f) => ({ ...f, within: wider }))}
              >
                Widen to {widerLabel}
              </button>
            )}
            {filters.cost !== "any" && relaxed.length > 0 && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => setFilters((f) => ({ ...f, cost: "any" }))}
              >
                Allow paid entry
              </button>
            )}
            <button type="button" className="linkbtn clay" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {selected && !sheet && (
        <div className="sheet">
          <div style={{ padding: "14px 24px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div className="grow">
              <div className="eyebrow moss" style={{ fontSize: 10.5 }}>
                Best match for you
              </div>
              <div className="display sm" style={{ fontSize: 25, paddingTop: 5 }}>
                {selected.name}
              </div>
              <div className="meta" style={{ display: "block", paddingTop: 5 }}>
                {selected.category} · {formatMiles(selected.miles)} ·{" "}
                {selected.price_level === 0 ? "No charge" : "Some charge"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="score" style={{ fontSize: 38, lineHeight: 0.9 }}>
                {selected.total}
              </div>
              <div className="eyebrow">score</div>
            </div>
          </div>

          <div className="pad" style={{ paddingTop: 12 }}>
            <SheetRow label="Google rating">
              {selected.rating} · {selected.reviews} reviews
            </SheetRow>
            <SheetRow label="Nearest transit">
              {selected.transit_minutes} min · {selected.transit_line}
            </SheetRow>
          </div>

          <div className="pad" style={{ padding: "14px 24px 16px", display: "flex", gap: 10 }}>
            <Link to={`/place/${selected.id}`} className="btn sm">
              Read more
            </Link>
            <SaveButton
              saved={favorites.includes(selected.id)}
              onClick={() => toggleFavorite(selected.id)}
              size={50}
            />
          </div>

          <TabBar />
        </div>
      )}

      {!selected && visible.length === 0 && <TabBar />}

      {sheet && (
        <>
          <button type="button" className="scrim" aria-label="Close filters" onClick={() => setSheet(false)} />
          <FilterSheet
            filters={filters}
            setFilters={setFilters}
            interests={profile.interests ?? []}
            count={visible.length}
            onDone={() => setSheet(false)}
          />
        </>
      )}
    </Device>
  );
}

function FilterTab({ on, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        background: "none",
        border: 0,
        padding: "0 0 2px",
        cursor: "pointer",
        fontFamily: "var(--sans)",
        fontWeight: on ? 700 : 600,
        fontSize: 14,
        letterSpacing: ".01em",
        color: on ? "var(--ink)" : "var(--label)",
        borderBottom: on ? "2px solid var(--pine)" : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function SheetRow({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        borderTop: "1px solid var(--hairline)",
        padding: "6px 0",
        fontSize: 16,
        color: "var(--text-3)",
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--ink)" }}>{children}</span>
    </div>
  );
}

function FilterSheet({ filters, setFilters, interests, count, onDone }) {
  return (
    <div className="sheet">
      <div
        style={{
          padding: "16px 24px 10px",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "2px solid var(--ink)",
        }}
      >
        <div className="display sm" style={{ fontSize: 27 }}>
          Filters
        </div>
        <button
          type="button"
          className="linkbtn clay"
          style={{
            fontFamily: "var(--sans)",
            fontStyle: "normal",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: ".01em",
          }}
          onClick={() => setFilters(DEFAULT_FILTERS)}
        >
          Reset
        </button>
      </div>

      <div className="scroll pad" style={{ paddingTop: 18, display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="eyebrow">Category</div>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                on={filters.categories.includes(c)}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    categories: f.categories.includes(c)
                      ? f.categories.filter((x) => x !== c)
                      : [...f.categories, c],
                  }))
                }
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
          <div className="spread">
            <div className="eyebrow">Match my interests</div>
            <Toggle
              on={filters.interestsOnly}
              label="Match my interests"
              onChange={(on) => setFilters((f) => ({ ...f, interestsOnly: on }))}
            />
          </div>
          <div className="aside" style={{ fontSize: 15.5 }}>
            {interests.length ? interests.join(", ").toLowerCase() : "No interests picked yet"}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
          <div className="spread">
            <div className="eyebrow">Within</div>
            <div
              style={{
                fontFamily: "var(--sans)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--pine)",
              }}
            >
              {filters.within} mi
            </div>
          </div>
          <Slider
            label="Distance in miles"
            value={filters.within}
            max={MAX_DISTANCE}
            step={0.5}
            onChange={(within) => setFilters((f) => ({ ...f, within }))}
          />
        </div>

        <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
          <div className="eyebrow">Cost</div>
          <div className="chips">
            {COSTS.map((c) => (
              <Chip key={c.id} on={filters.cost === c.id} onClick={() => setFilters((f) => ({ ...f, cost: c.id }))}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="pad" style={{ padding: "20px 24px 34px" }}>
        <button type="button" className="btn sm" onClick={onDone}>
          Show {count} place{count === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

// 23 · /map — Scoring in progress
function Scoring({ places, origin }) {
  return (
    <Device>
      <MapCanvas places={places} origin={origin} loading onSelect={() => {}} />

      <div className="mapheader">
        <div className="pad" style={{ padding: "8px 24px 10px", borderBottom: "2px solid var(--ink)" }}>
          <div className="display sm" style={{ color: "var(--ghost)" }}>
            Scoring places…
          </div>
        </div>
        <div style={{ height: 3, background: "var(--track)" }}>
          <div style={{ width: "64%", height: "100%", background: "var(--pine)" }} />
        </div>
      </div>

      <div className="sheet">
        <div className="pad pulsing" style={{ paddingTop: 16, display: "grid", gap: 9 }}>
          <div className="skel" style={{ width: "62%" }} />
          <div className="skel soft" style={{ width: "40%" }} />
          <div className="skel soft" style={{ width: "78%" }} />
        </div>
        <div className="pad aside" style={{ paddingTop: 16, fontSize: 16.5 }}>
          Pulling live ratings and transit times from Google. Usually under two seconds.
        </div>
        <div className="pad" style={{ paddingTop: 16 }}>
          <div style={{ height: 50, background: "var(--track)" }} />
        </div>
        <div style={{ marginTop: 16 }}>
          <TabBar />
        </div>
      </div>
    </Device>
  );
}
