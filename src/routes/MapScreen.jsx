import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/store";
import { CATEGORIES } from "../lib/seed";
import { nextEvent, whenLabel } from "../lib/events";
import { formatMiles } from "../lib/scoring";
import {
  Chip,
  Device,
  Icon,
  RankedList,
  SaveButton,
  SheetNav,
  Slider,
  Stars,
  TabBar,
  Toggle,
} from "../components/ui";
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

// The interest filter starts on, so the map opens on the places the reader
// said they would actually go out for rather than on all 300-odd. It can only
// start on when there is something to match against — with no interests picked
// it would match nothing and the map would open empty.
function defaultFilters(interests) {
  return { ...DEFAULT_FILTERS, interestsOnly: interests.length > 0 };
}

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

  // Stable identity: `visible` keys off it, and the map's pin set keys off
  // that in turn.
  const interests = useMemo(() => profile.interests ?? [], [profile.interests]);
  const defaults = defaultFilters(interests);

  const [filters, setFilters] = useState(defaults);
  const [sheet, setSheet] = useState(false);
  const [list, setList] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const visible = useMemo(() => apply(ranked, filters, interests), [ranked, filters, interests]);

  const selected = visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  // `visible` is already highest score first, so a step is a step through the
  // ranking. -1 when nothing is selected, which only happens with no results.
  const at = visible.findIndex((p) => p.id === selected?.id);

  // What would bring results back, for the empty state. Ordered by how likely
  // each one is to be the filter actually in the way — the interest filter is
  // on by default now, so it leads.
  const wider = Math.min(Math.max(filters.within * 2, 1), MAX_DISTANCE);
  const widerLabel = `${wider} ${wider === 1 ? "mile" : "miles"}`;
  const anyInterest = apply(ranked, { ...filters, interestsOnly: false }, interests);
  const widened = apply(ranked, { ...filters, within: wider }, interests);
  const relaxed = apply(ranked, { ...filters, cost: "any" }, interests);

  const remedies = [
    filters.interestsOnly &&
      anyInterest.length > 0 && {
        id: "interests",
        label: "Look past my interests",
        note: `${anyInterest.length} places match everything except your interests.`,
        fix: () => setFilters((f) => ({ ...f, interestsOnly: false })),
      },
    wider > filters.within &&
      widened.length > 0 && {
        id: "within",
        label: `Widen to ${widerLabel}`,
        note: `Widening the distance to ${widerLabel} finds ${widened.length} of them.`,
        fix: () => setFilters((f) => ({ ...f, within: wider })),
      },
    filters.cost !== "any" &&
      relaxed.length > 0 && {
        id: "cost",
        label: "Allow paid entry",
        note: `${relaxed.length} places match everything except the cost filter.`,
        fix: () => setFilters((f) => ({ ...f, cost: "any" })),
      },
  ].filter(Boolean);

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
        focus={visible[0]}
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
          <div className="meta when-detailed" style={{ marginLeft: "auto", color: "var(--label)" }}>
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
            {/* On simpler screens the shortcut tabs go and the Filters sheet
                is the one way in, rather than two ways to do one thing. */}
            <FilterTab
              className="when-detailed"
              on={!filters.categories.length}
              onClick={() => setFilters((f) => ({ ...f, categories: [] }))}
            >
              All
            </FilterTab>
            {CATEGORIES.slice(0, 3).map((c) => (
              <FilterTab
                key={c}
                className="when-detailed"
                on={filters.categories.includes(c)}
                onClick={() => setCategory(c)}
              >
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
            {remedies[0]?.note ?? "Nothing nearby fits this combination."}
          </p>
          <div style={{ display: "grid", gap: 10, paddingTop: 8 }}>
            {/* The likeliest way back is the filled button; the rest are
                offered, not urged. */}
            {remedies.map((remedy, i) => (
              <button
                key={remedy.id}
                type="button"
                className={i === 0 ? "btn sm" : "btn sm ghost"}
                onClick={remedy.fix}
              >
                {remedy.label}
              </button>
            ))}
            <button type="button" className="linkbtn clay" onClick={() => setFilters(defaults)}>
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {selected && !sheet && list && (
        <div className="sheet inline">
          <div
            style={{
              padding: "14px 24px 10px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "2px solid var(--ink)",
            }}
          >
            <div className="display sm" style={{ fontSize: 24 }}>
              All {visible.length} place{visible.length === 1 ? "" : "s"}
            </div>
            <button type="button" className="sheetopen" onClick={() => setList(false)}>
              Done
            </button>
          </div>

          <RankedList
            places={visible}
            currentId={selected.id}
            onPick={(id) => {
              setSelectedId(id);
              setList(false);
            }}
            meta={(place) =>
              `${place.category} · ${formatMiles(place.miles)} · ${
                place.price_level === 0 ? "free" : "paid"
              }`
            }
          />

          <TabBar />
        </div>
      )}

      {selected && !sheet && !list && (
        <div className="sheet">
          <SheetNav
            index={at}
            count={visible.length}
            onStep={(step) => setSelectedId(visible[at + step].id)}
            onOpenList={() => setList(true)}
            listLabel="All places"
          />

          <div style={{ padding: "14px 24px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div className="grow">
              <div className="display sm" style={{ fontSize: 25 }}>
                {selected.name}
              </div>
              <div className="meta" style={{ display: "block", paddingTop: 5 }}>
                {selected.category} · {formatMiles(selected.miles)} ·{" "}
                {selected.price_level === 0 ? "No charge" : "Some charge"}
              </div>
              {/* The one line on this card that is about right now rather than
                  about the place in general, so it survives simpler screens
                  when the rows below it don't. */}
              <Soon slug={selected.id} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="score" style={{ fontSize: 38, lineHeight: 0.9 }}>
                {selected.total}
              </div>
              <div className="eyebrow">score</div>
            </div>
          </div>

          {/* Name, distance, score and the two buttons are the card. Everything
              between is supporting detail, and simpler screens drop it — the
              detail screen still carries all of it. */}
          <div className="pad when-detailed" style={{ paddingTop: 12 }}>
            <SheetRow label="Google rating">
              {selected.rating == null ? (
                "Not rated"
              ) : (
                <Stars rating={selected.rating} reviews={selected.reviews} size={14} />
              )}
            </SheetRow>
            {/* Transit used to read "6 min · Bus 25" from a hand-typed field.
                Nothing measured that, so the row now carries what the city
                actually lists on the site. The real transit time is a Routes
                call, and it happens on the detail screen. */}
            {selected.neighborhood && (
              <SheetRow label="Neighborhood">{selected.neighborhood}</SheetRow>
            )}
            {selected.acres != null && <SheetRow label="Size">{selected.acres} acres</SheetRow>}
            {selected.summary && (
              <p className="aside" style={{ fontSize: 16, paddingTop: 8, fontStyle: "normal" }}>
                {selected.summary}
              </p>
            )}
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
            defaults={defaults}
            interests={interests}
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

// Only libraries have a feed, so most places show nothing here.
function Soon({ slug }) {
  const event = nextEvent(slug);
  if (!event) return null;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", paddingTop: 7 }}>
      <span className="eyebrow moss" style={{ flex: "none" }}>
        {whenLabel(event.start)}
      </span>
      <span
        style={{
          fontSize: 16,
          color: "var(--text-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {event.title}
      </span>
    </div>
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

function FilterSheet({ filters, setFilters, defaults, interests, count, onDone }) {
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
          onClick={() => setFilters(defaults)}
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
            Re-scoring…
          </div>
        </div>
        {/* Indeterminate: the old bar sat at a hardcoded 64%, which reported
            progress nothing was measuring. */}
        <div className="track" role="progressbar" aria-label="Saving your priorities">
          <i />
        </div>
      </div>

      <div className="sheet">
        <div className="pad pulsing" style={{ paddingTop: 16, display: "grid", gap: 9 }}>
          <div className="skel" style={{ width: "62%" }} />
          <div className="skel soft" style={{ width: "40%" }} />
          <div className="skel soft" style={{ width: "78%" }} />
        </div>
        <div className="pad aside" style={{ paddingTop: 16, fontSize: 16.5 }}>
          Saving your priorities.
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
