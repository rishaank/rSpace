import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { listApplicants } from "../lib/data";
import { Device, TabBar } from "../components/ui";

// 18 · /adopt — Applicants
export default function Adopt() {
  const [applicants, setApplicants] = useState([]);

  useEffect(() => {
    listApplicants().then(setApplicants);
  }, []);

  return (
    <Device>
      <div className="pad" style={{ padding: "8px 24px 12px", borderBottom: "2px solid var(--ink)", flex: "none" }}>
        <h2 className="display" style={{ fontSize: 30, lineHeight: 1.08 }}>
          Adopt a third space
        </h2>
        <p className="prose" style={{ fontSize: 16.5, paddingTop: 7 }}>
          Local groups asking for help to open or keep open a public space. Listings only — no money
          changes hands here.
        </p>
      </div>

      <AdoptTabs />

      <div className="scroll pad">
        {applicants.map((a) => (
          <Link
            key={a.id}
            to={`/adopt/${a.id}`}
            style={{
              display: "grid",
              gap: 7,
              padding: "16px 0",
              borderBottom: "1px solid var(--hairline)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div className="spread">
              <div className="grow" style={{ fontSize: 21, lineHeight: 1.2, color: "var(--ink)" }}>
                {a.name}
              </div>
              <div
                className="eyebrow"
                style={{
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: "var(--paper)",
                  background: "var(--moss)",
                  padding: "3px 8px",
                }}
              >
                {a.category}
              </div>
            </div>
            <p className="prose" style={{ fontSize: 16.5 }}>
              {a.summary}
            </p>
            <div className="meta" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>{a.neighborhood}</span>
              <span>Filed {a.filed}</span>
              <span style={{ color: "var(--pine)" }}>Need score {a.need}</span>
            </div>
          </Link>
        ))}
      </div>

      <TabBar />
    </Device>
  );
}

export function AdoptTabs() {
  const style = ({ isActive }) => ({
    flex: 1,
    padding: "10px 0",
    textAlign: "center",
    fontFamily: "var(--sans)",
    fontWeight: isActive ? 700 : 600,
    fontSize: 11.5,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color: isActive ? "var(--ink)" : "var(--text-5)",
    borderBottom: isActive ? "2px solid var(--pine)" : "none",
    textDecoration: "none",
  });

  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--edge)", flex: "none" }}>
      <NavLink to="/adopt" end style={style}>
        Applicants
      </NavLink>
      <NavLink to="/adopt/map" style={style}>
        Where to invest
      </NavLink>
    </div>
  );
}
