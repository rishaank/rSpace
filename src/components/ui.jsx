import { NavLink, useNavigate } from "react-router-dom";

/* The 390 × 844 frame. On a real phone it's just the viewport; the status
   bar only appears in the desktop preview frame, never on device. */
export function Device({ tone = "paper", children }) {
  return (
    <div className={`device on-${tone}`}>
      <div className="device-status" aria-hidden="true">
        <span>9:41</span>
        <span className="tick">▪▪▪ ⌁</span>
      </div>
      {children}
    </div>
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
  return (
    <nav className="tabbar">
      <NavLink to="/map" className={({ isActive }) => (isActive ? "active" : "")}>
        Map
      </NavLink>
      <NavLink to="/saved" className={({ isActive }) => (isActive ? "active" : "")}>
        Saved
      </NavLink>
      <NavLink to="/adopt" className={({ isActive }) => (isActive ? "active" : "")}>
        Adopt
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
        Profile
      </NavLink>
    </nav>
  );
}
