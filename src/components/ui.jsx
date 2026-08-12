import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

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


/* The 390 × 844 frame. On a real phone it's just the viewport; the status
   bar only appears in the desktop preview frame, never on device. It used to
   read a fixed 9:41 — it shows the actual clock now, so nothing on screen is
   a prop. */
export function Device({ tone = "paper", children }) {
  const [now, setNow] = useState(clockTime);

  useEffect(() => {
    const timer = setInterval(() => setNow(clockTime()), 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`device on-${tone}`}>
      <div className="device-status" aria-hidden="true">
        <span>{now}</span>
        <span className="tick">▪▪▪ ⌁</span>
      </div>
      {children}
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
