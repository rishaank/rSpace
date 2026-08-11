import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { listApplicants } from "../lib/data";
import { AppBar, Device } from "../components/ui";

// 19 · /adopt/:id — Applicant detail
export default function AdoptDetail() {
  const { id } = useParams();
  const [applicants, setApplicants] = useState(null);

  useEffect(() => {
    listApplicants().then(setApplicants);
  }, []);

  if (!applicants) return <Device />;

  const a = applicants.find((x) => x.id === id);
  if (!a) return <Navigate to="/adopt" replace />;

  return (
    <Device>
      <AppBar title="Application" />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="eyebrow moss" style={{ letterSpacing: ".2em" }}>
            {a.category} · {a.neighborhood}
          </div>
          <h2 className="display" style={{ fontSize: 34, paddingTop: 7 }}>
            {a.name}
          </h2>
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div style={{ display: "flex", border: "1px solid var(--ink)" }}>
            <Stat label="Ask" value={`$${a.ask.toLocaleString()}`} />
            <Stat label="Reach" value={`~${a.reach}`} />
            <Stat label="Need" value={a.need} dark />
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20, display: "grid", gap: 9 }}>
          <div className="eyebrow">What they&rsquo;re asking for</div>
          <p className="prose" style={{ fontSize: 17.5, lineHeight: 1.55, color: "var(--text-2)" }}>
            {a.detail}
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-head">Why the algorithm flags it</div>
          {a.signals.map((s) => (
            <div
              key={s.label}
              className="spread"
              style={{ borderBottom: "1px solid var(--hairline)", padding: "8px 0", fontSize: 16.5, color: "var(--text-3)" }}
            >
              <span>{s.label}</span>
              <span style={{ color: s.warn ? "var(--clay)" : "var(--ink)" }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="notice" style={{ fontSize: 16 }}>
            Contact goes straight to the group. Third Space doesn&rsquo;t collect or hold funds.
          </div>
        </div>

        <div className="foot pad" style={{ padding: "14px 24px 30px", display: "flex", gap: 10 }}>
          <a className="btn sm" href={`mailto:${a.contact}`} style={{ letterSpacing: ".14em" }}>
            Contact the group
          </a>
          <button type="button" className="btn sm ghost icon" aria-label="Follow this application">
            ♡
          </button>
        </div>
      </div>
    </Device>
  );
}

function Stat({ label, value, dark }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRight: dark ? 0 : "1px solid var(--ink)",
        background: dark ? "var(--pine)" : "none",
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".16em", color: dark ? "var(--sage)" : "var(--label)" }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 600,
          fontSize: 25,
          paddingTop: 2,
          color: dark ? "var(--paper)" : "var(--ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
