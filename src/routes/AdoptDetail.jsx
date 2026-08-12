import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { listNeeds } from "../lib/data";
import { describeNeed } from "../lib/describe";
import { AppBar, Device } from "../components/ui";

// The city's real Adopt-A-Park / Adopt-A-Trail program. This screen used to
// end in a mailto to an invented neighborhood association; the contact below
// is the one the city publishes.
const PROGRAMME =
  "https://www.sanjoseca.gov/your-government/departments-offices/parks-recreation-neighborhood-services/get-involved/adopt-a-park";
const PROGRAMME_EMAIL = "adopt-a-park@sanjoseca.gov";

// 19 · /adopt/:id — Site detail
export default function AdoptDetail() {
  const { id } = useParams();
  const [needs, setNeeds] = useState(null);

  useEffect(() => {
    listNeeds().then(setNeeds);
  }, []);

  if (!needs) return <Loading />;

  const need = needs.find((n) => n.id === id);
  if (!need) return <Navigate to="/adopt" replace />;

  return (
    <Device>
      <AppBar title="Where to invest" />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="eyebrow moss" style={{ letterSpacing: ".2em" }}>
            {[need.category, need.neighborhood].filter(Boolean).join(" · ")}
          </div>
          <h2 className="display" style={{ fontSize: 34, paddingTop: 7 }}>
            {need.name}
          </h2>
          <p className="prose" style={{ fontSize: 17.5, paddingTop: 9, color: "var(--text-2)" }}>
            {describeNeed(need)}
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div style={{ display: "flex", border: "1px solid var(--ink)" }}>
            <Stat label="Condition" value={need.condition != null ? Math.round(need.condition * 100) : "—"} />
            <Stat label="Equity" value={need.equity_score ?? "—"} />
            <Stat label="Need" value={need.need} dark />
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="section-head">What the survey scored lowest</div>
          {need.weakest?.length ? (
            need.weakest.map((item) => (
              <div
                key={item.label}
                className="spread"
                style={{
                  borderBottom: "1px solid var(--hairline)",
                  padding: "8px 0",
                  fontSize: 16.5,
                  color: "var(--text-3)",
                }}
              >
                <span>{item.label}</span>
                <span style={{ color: item.score < 0.7 ? "var(--clay)" : "var(--ink)" }}>
                  {Math.round(item.score * 100)}
                </span>
              </div>
            ))
          ) : (
            <p className="aside" style={{ padding: "12px 0" }}>
              The survey scored the site overall but broke out no categories.
            </p>
          )}
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-head">The neighborhood around it</div>
          {[
            ["Census tract", need.tract],
            ["Population", need.population?.toLocaleString()],
            ["Median household income", need.median_income && `$${need.median_income.toLocaleString()}`],
            [
              "Healthy Places Index",
              need.hpi_percentile != null && `${need.hpi_percentile} percentile`,
            ],
            ["Equity Index score", need.equity_score && `${need.equity_score} of 10`],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                className="spread"
                style={{
                  borderBottom: "1px solid var(--hairline)",
                  padding: "8px 0",
                  fontSize: 16.5,
                  color: "var(--text-3)",
                }}
              >
                <span>{label}</span>
                <span style={{ color: "var(--ink)" }}>{value}</span>
              </div>
            ))}
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="notice" style={{ fontSize: 16 }}>
            Every number here is published by the City of San José — the {need.assessed ?? "latest"}{" "}
            park condition assessment and the Equity Index. rSpace doesn&rsquo;t collect or hold
            funds.
          </div>
        </div>

        <div className="foot pad" style={{ padding: "14px 24px 30px", display: "grid", gap: 10 }}>
          <a className="btn sm" href={PROGRAMME} target="_blank" rel="noreferrer">
            Adopt-a-Park program
          </a>
          <a className="btn sm ghost" href={`mailto:${PROGRAMME_EMAIL}`}>
            Email the city
          </a>
        </div>
      </div>
    </Device>
  );
}

function Loading() {
  return (
    <Device>
      <AppBar title="Where to invest" />
      <div className="scroll pad pulsing" style={{ paddingTop: 24, display: "grid", gap: 12 }}>
        <div className="skel soft" style={{ width: "35%" }} />
        <div className="skel" style={{ width: "72%", height: 30 }} />
        <div className="skel soft" style={{ width: "94%" }} />
        <div className="skel soft" style={{ width: "60%" }} />
        <div className="skel" style={{ height: 74, marginTop: 8 }} />
        <div className="skel soft" style={{ width: "45%", marginTop: 8 }} />
        <div className="skel soft" style={{ width: "88%" }} />
        <div className="skel soft" style={{ width: "80%" }} />
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
      <div
        className={dark ? "eyebrow sage" : "eyebrow"}
        style={dark ? { fontSize: 10.5, letterSpacing: ".16em" } : undefined}
      >
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
