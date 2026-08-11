import { Link, Navigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { Device } from "../components/ui";

// 01 · / — Welcome
export default function Welcome() {
  const { session, profile, places } = useApp();

  if (session) return <Navigate to={profile?.name ? "/map" : "/onboarding/you"} replace />;

  return (
    <Device tone="pine">
      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "44px 30px 0" }}>
          <div className="eyebrow" style={{ color: "var(--sage)", letterSpacing: ".24em" }}>
            San José · Bay Area
          </div>
          <h1
            className="display lg"
            style={{ color: "var(--paper)", paddingTop: 18, margin: 0 }}
          >
            Third
            <br />
            Space
          </h1>
          <div style={{ width: 72, height: 2, background: "var(--sage)", margin: "26px 0" }} />
          <p style={{ fontSize: 21, lineHeight: 1.45, color: "#dfe6d3", margin: 0 }}>
            A guide to the public places near you worth spending time in — parks, courts,
            libraries, community centers, and the people already there.
          </p>
        </div>

        <div className="foot" style={{ padding: "40px 30px 40px", display: "grid", gap: 12 }}>
          <p
            className="aside"
            style={{ color: "var(--sage)", paddingBottom: 6, fontSize: 16 }}
          >
            {places.length} places listed · free to use
          </p>
          <Link to="/signup" className="btn paper">
            Create an account
          </Link>
          <Link to="/login" className="btn outline-light">
            I already have one
          </Link>
        </div>
      </div>
    </Device>
  );
}
