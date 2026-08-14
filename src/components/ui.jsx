import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";

/* ── Icons ────────────────────────────────────────────────────────
   One stroked 24×24 set, from the design. `filled` applies to the
   heart only, which doubles as the saved state.                     */

const PATHS = {
  heart: <path d="M12 20.2C12 20.2 3.6 14.9 3.6 9.4A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.4 2.7c0 5.5-8.4 10.8-8.4 10.8z" />,
  map: (
    <>
      <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  sapling: (
    <>
      <path d="M12 21v-7.4" />
      <path d="M12 13.6C12 9.8 9.3 7.8 5 7.8c0 3.9 2.8 5.8 7 5.8z" />
      <path d="M12 13.6c0-3.4 2.4-5.3 6.4-5.3 0 3.5-2.4 5.3-6.4 5.3z" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 20.4c1.2-4 4-6.1 7.2-6.1s6 2.1 7.2 6.1" />
    </>
  ),
  filters: <path d="M3 6h18M7 12h10M10 18h4" />,
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6z" />,
};

export function Icon({ name, size = 21, filled = false, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/* The mark: a pin that is also a lowercase r. Below 32px the r is
   dropped and the pin runs solid, per the brand notes. */
export function Mark({ size = 24, ink = "var(--pine)", letter = "var(--paper)" }) {
  const height = Math.round((size * 72) / 64);
  return (
    <svg width={size} height={height} viewBox="0 0 64 72" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path
        d="M6 2h52a4 4 0 0 1 4 4v44a4 4 0 0 1-4 4H40l-8 14-8-14H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"
        fill={ink}
      />
      {size >= 32 && (
        <text
          x="32"
          y="43"
          textAnchor="middle"
          fontFamily="Newsreader,serif"
          fontWeight="500"
          fontSize="42"
          fill={letter}
        >
          r
        </text>
      )}
    </svg>
  );
}

export function Wordmark({ size = 56, light = false }) {
  return (
    <span className={`wordmark${light ? " light" : ""}`} style={{ fontSize: size }}>
      <span className="r">r</span>Space
    </span>
  );
}

/* Five stars, filled to the nearest half by clipping the last one. */
export function Stars({ rating, reviews, size = 16 }) {
  if (rating == null) return null;

  return (
    <div className="stars">
      <div className="row" role="img" aria-label={`${rating} out of 5`}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - i));
          return (
            <span key={i} style={{ position: "relative", width: size, height: size, display: "block" }}>
              <Icon name="star" size={size} style={{ position: "absolute", inset: 0, opacity: 0.35 }} />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${fill * 100}%`,
                  overflow: "hidden",
                }}
              >
                <Icon name="star" size={size} filled />
              </span>
            </span>
          );
        })}
      </div>
      {reviews != null && (
        <span className="count">
          {rating.toFixed(1)} · {reviews.toLocaleString()} review{reviews === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/* The heart is the save control everywhere it appears. */
export function SaveButton({ saved, onClick, size = 54, bare = false, label }) {
  return (
    <button
      type="button"
      className={`savebtn${bare ? " bare" : ""}`}
      aria-pressed={saved}
      aria-label={label ?? (saved ? "Remove from saved" : "Save this place")}
      onClick={onClick}
      style={bare ? undefined : { width: size, height: size }}
    >
      <Icon name="heart" size={bare ? 19 : 21} filled={saved} />
    </button>
  );
}


/* ── Bottom-sheet controls (both map screens) ─────────────────────
   The sheet shows one place at a time. These step through the ranking
   without going back to the map, or open the whole of it.            */

/**
 * Steps through the ranking and opens the whole of it. This used to be a
 * full-width row inside the card, which spent 37pt of a 390pt screen on two
 * arrows and a count. It is a tab now: one bordered group riding the card's
 * top rule, so it reads as part of the card and costs the card nothing.
 *
 * The count is the control that opens the list — the reader's position in the
 * ranking and the way to see the rest of it are the same thing. At either end
 * the arrow is disabled rather than dropped, so the group keeps its shape.
 */
export function SheetNav({ index, count, onStep, onOpenList, listLabel }) {
  return (
    <div className="sheetnav">
      <button
        type="button"
        className="step"
        disabled={index <= 0}
        aria-label="Previous place"
        onClick={() => onStep(-1)}
      >
        ‹
      </button>
      <button type="button" className="count" onClick={onOpenList} aria-label={listLabel}>
        <b>{index + 1}</b>
        <span aria-hidden="true"> / </span>
        <span className="sr-only">of </span>
        {count}
      </button>
      <button
        type="button"
        className="step"
        disabled={index >= count - 1}
        aria-label="Next place"
        onClick={() => onStep(1)}
      >
        ›
      </button>
    </div>
  );
}

// Open the list on the place the sheet was showing rather than at the top —
// the reader may have stepped a long way down a 300-row ranking. Named, so
// the ref fires on mount instead of on every render.
function showCurrent(el) {
  el?.scrollIntoView({ block: "center" });
}

/**
 * The whole ranking as rows, highest first. Both map screens show one; only
 * the number and the line under the name differ, so `meta` is a function and
 * `need` swaps the score for the city's need number in clay.
 */
export function RankedList({ places, currentId, onPick, meta, need = false }) {
  return (
    <div className="scroll pad" style={{ paddingBottom: 6 }}>
      {places.map((place) => (
        <button
          key={place.id}
          type="button"
          className={`placerow${place.id === currentId ? " on" : ""}`}
          ref={place.id === currentId ? showCurrent : undefined}
          onClick={() => onPick(place.id)}
        >
          <div className={`n${need ? " need" : ""}`}>{need ? place.need : place.total}</div>
          <div className="grow">
            <div className="title">{place.name}</div>
            <div className="meta" style={{ display: "block", paddingTop: 4 }}>
              {meta(place)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* The 390 × 844 frame. On a real phone it's just the viewport; the status
   bar only appears in the desktop preview frame, never on device. It used to
   read a fixed 9:41 — it shows the actual clock now, so nothing on screen is
   a prop.

   It also carries the reader's display settings, because every screen is
   inside one. `--ui-scale` drives a `zoom` on the frame's children rather
   than a font-size: this codebase sizes type in px inline, and inline px
   ignores a root font-size, so nothing else reaches all of it. */
export function Device({ tone = "paper", children }) {
  const { profile } = useApp();
  const [now, setNow] = useState(clockTime);

  useEffect(() => {
    const timer = setInterval(() => setNow(clockTime()), 15000);
    return () => clearInterval(timer);
  }, []);

  const scale = profile?.text_scale ?? 1;

  return (
    <div
      className={`device on-${tone}${profile?.simple_ui ? " simple" : ""}`}
      style={scale === 1 ? undefined : { "--ui-scale": scale }}
    >
      <div className="device-status" aria-hidden="true">
        <span>{now}</span>
        <span className="tick">▪▪▪ ⌁</span>
      </div>
      {children}
    </div>
  );
}

/* ── Display settings ─────────────────────────────────────────────
   Shown twice: once in the profiler, where the age just entered picks
   the opening answer, and again in the profile, where it is changed. */

const TEXT_SCALES = [
  { value: 1, label: "Standard" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Largest" },
];

/** What an age implies, before the reader says otherwise. */
export function displayForAge(age) {
  if (!Number.isFinite(age)) return { text_scale: 1, simple_ui: false };
  if (age >= 70) return { text_scale: 1.3, simple_ui: true };
  if (age >= 60) return { text_scale: 1.15, simple_ui: true };
  return { text_scale: 1, simple_ui: false };
}

export function DisplayChoice({ value, onChange }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div className="eyebrow">Text size</div>
        <div className="chips">
          {TEXT_SCALES.map((size) => (
            <Chip
              key={size.value}
              on={value.text_scale === size.value}
              onClick={() => onChange({ ...value, text_scale: size.value })}
              style={{ fontSize: 16.5 * size.value }}
            >
              {size.label}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div className="spread">
          <div className="eyebrow">Simpler screens</div>
          <Toggle
            on={value.simple_ui}
            label="Simpler screens"
            onChange={(on) => onChange({ ...value, simple_ui: on })}
          />
        </div>
        <div className="aside" style={{ fontSize: 15.5 }}>
          Bigger buttons, and the secondary details on each place left out.
        </div>
      </div>
    </div>
  );
}

function clockTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The boot screen. It traces the map screen's own layout — header rule, map
 * band, bottom sheet, tab bar — so the app resolves into place rather than
 * cutting from an empty frame. `label` is announced to screen readers, which
 * get no benefit from the shapes.
 */
export function Loading({ label = "Loading rSpace" }) {
  return (
    <Device>
      <div className="pad" style={{ padding: "8px 24px 10px", borderBottom: "2px solid var(--ink)", flex: "none" }}>
        <div className="skel pulsing" style={{ width: "45%", height: 22 }} />
      </div>
      <div className="track" role="progressbar" aria-label={label}>
        <i />
      </div>

      <div className="grow pulsing" style={{ position: "relative", background: "var(--track)", minHeight: 0 }}>
        <span className="sr-only">{label}</span>
      </div>

      <div style={{ flex: "none", borderTop: "2px solid var(--ink)" }}>
        <div className="pad pulsing" style={{ padding: "16px 24px 0", display: "grid", gap: 9 }}>
          <div className="skel" style={{ width: "62%", height: 20 }} />
          <div className="skel soft" style={{ width: "40%" }} />
          <div className="skel soft" style={{ width: "78%" }} />
        </div>
        <div className="pad pulsing" style={{ padding: "16px 24px" }}>
          <div className="skel" style={{ height: 50 }} />
        </div>
        <TabBar />
      </div>
    </Device>
  );
}

export function AppBar({ title, trail, back = true, onBack }) {
  const navigate = useNavigate();
  return (
    <div className="appbar">
      {back && (
        <button
          type="button"
          className="iconbtn"
          onClick={onBack ?? (() => navigate(-1))}
          aria-label="Go back"
        >
          ‹
        </button>
      )}
      <h1>{title}</h1>
      {trail && <div className="trail">{trail}</div>}
    </div>
  );
}

export function Ticks({ step, of = 4 }) {
  return (
    <div className="ticks" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < step ? "on" : ""} />
      ))}
    </div>
  );
}

export function Field({ label, hint, bad, adorn, ...input }) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={`field${bad ? " bad" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {adorn ? (
        <div className="adorn">
          <input id={id} {...input} />
          {adorn}
        </div>
      ) : (
        <input id={id} {...input} />
      )}
      {hint && <div className={`hint${bad ? " bad" : ""}`}>{hint}</div>}
    </div>
  );
}

export function Chip({ on, children, ...rest }) {
  return (
    <button type="button" className="chip" aria-pressed={Boolean(on)} {...rest}>
      {children}
      {on ? " ✓" : ""}
    </button>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      className="toggle"
      aria-pressed={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

export function Slider({ value, onChange, max = 0.5, step = 0.01, was, label }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="slider">
      <div className="line" />
      <div className="fill" style={{ width: `${pct}%` }} />
      <div className="knob" style={{ left: `${pct}%` }} />
      {was != null && <div className="was" style={{ left: `${(was / max) * 100}%` }} />}
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// `text` overrides the printed number when the bar is drawn on a different
// scale than the value it reports — weights fill 0–0.5 but read as .00–.50.
export function Meter({ name, value, thin, tone = "full", text }) {
  const missing = value == null;
  return (
    <div className={`meter${thin ? " thin" : ""}${missing ? " off" : ""}`}>
      <div className="name">{name}</div>
      <div className={`bar${missing ? " hatched" : ""}${tone === "mid" ? " mid" : ""}`}>
        {!missing && <i style={{ width: `${Math.round(value * 100)}%` }} />}
      </div>
      <div className="val">
        {text ?? (missing ? "—" : value >= 1 ? "1.0" : value.toFixed(2).replace(/^0/, ""))}
      </div>
    </div>
  );
}

export function Alarm({ title, children }) {
  return (
    <div className="alarm" role="status">
      <div className="eyebrow clay">{title}</div>
      <p>{children}</p>
    </div>
  );
}

export function TabBar() {
  const tabs = [
    ["/map", "Map", "map"],
    ["/saved", "Saved", "heart"],
    ["/adopt", "Adopt", "sapling"],
    ["/profile", "Profile", "person"],
  ];

  return (
    <nav className="tabbar">
      {tabs.map(([to, label, icon]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
