import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { geolocate, hasMapsKey, neighborhoodFor } from "../lib/google";
import { milesBetween } from "../lib/scoring";
import { NEIGHBORHOODS } from "../lib/seed";
import { Alarm, AppBar, Device, Field, Ticks } from "../components/ui";

function nearestNeighborhood(point) {
  return NEIGHBORHOODS.reduce((best, n) =>
    milesBetween(point, n) < milesBetween(point, best) ? n : best
  );
}

// 06 · /onboarding/place — Autodetect   ·   21 · Location permission denied
export default function OnboardingPlace() {
  const { saveProfile } = useApp();
  const navigate = useNavigate();

  const [state, setState] = useState("locating"); // locating | detected | denied
  const [detected, setDetected] = useState(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let live = true;
    geolocate().then(async (result) => {
      if (!live) return;
      if (result.error) return setState("denied");

      const label = hasMapsKey
        ? await neighborhoodFor(result)
        : `${nearestNeighborhood(result).name}, San José`;
      if (!live) return;
      setDetected({ ...result, location: label ?? "Your area" });
      setState("detected");
    });
    return () => {
      live = false;
    };
  }, []);

  async function commit(place) {
    await saveProfile({ location: place.location, lat: place.lat, lng: place.lng });
    navigate("/onboarding/interests");
  }

  function pickNeighborhood(n) {
    return commit({ location: `${n.name}, San José`, lat: n.lat, lng: n.lng });
  }

  const query = typed.trim().toLowerCase();
  const typedMatch = query
    ? NEIGHBORHOODS.find((n) => n.name.toLowerCase().startsWith(query))
    : null;

  return (
    <Device>
      <AppBar
        title="Where you are"
        trail={state === "denied" ? undefined : "III / IV"}
        back={false}
      />
      {state !== "denied" && <Ticks step={3} />}

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        {state === "denied" ? (
          <>
            <div className="pad" style={{ paddingTop: 26 }}>
              <Alarm title="Location is off">
                Your browser blocked location access. That&rsquo;s fine — type a neighborhood
                instead and everything else works the same.
              </Alarm>
            </div>

            <div className="pad" style={{ paddingTop: 24 }}>
              <h2 className="display" style={{ fontSize: 31 }}>
                Tell us roughly
                <br />
                where you are.
              </h2>
            </div>

            <div className="pad" style={{ paddingTop: 22 }}>
              <Field
                label="Neighborhood or ZIP"
                placeholder="e.g. Japantown or 95112"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                style={{ fontSize: 21 }}
              />
            </div>

            <div className="pad" style={{ paddingTop: 22 }}>
              <div className="section-head">Common choices</div>
              {NEIGHBORHOODS.slice(0, 4).map((n) => (
                <button key={n.name} type="button" className="rowlink" onClick={() => pickNeighborhood(n)}>
                  <span>{n.name}</span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>

            <div className="foot pad" style={{ padding: "16px 24px 34px", display: "grid", gap: 12 }}>
              <p className="prose" style={{ textAlign: "center", fontSize: 16.5, fontStyle: "italic" }}>
                Changed your mind? Turn location on in your browser settings and reload.
              </p>
              <button
                type="button"
                className="btn"
                disabled={!typedMatch}
                onClick={() => typedMatch && pickNeighborhood(typedMatch)}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pad" style={{ paddingTop: 26 }}>
              <h2 className="display">
                Where should we
                <br />
                look from?
              </h2>
              <p className="prose" style={{ paddingTop: 11 }}>
                Distance and transit time are measured from here. A neighborhood is precise enough.
              </p>
            </div>

            <div className="pad" style={{ paddingTop: 24 }}>
              <div
                style={{
                  border: "1px solid var(--ink)",
                  background: "var(--pale)",
                  padding: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div className="row" style={{ gap: 12 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "var(--pine)",
                      outline: "3px solid var(--sage)",
                    }}
                  />
                  <div className="eyebrow pine">
                    {state === "locating" ? "Detecting…" : "Detected"}
                  </div>
                </div>

                <div className="display sm" style={{ fontWeight: 500 }}>
                  {state === "locating" ? "Checking your area" : detected.location}
                </div>

                <p className="prose" style={{ fontSize: 16.5 }}>
                  Accurate to about 300 m. We store the neighborhood, not the exact point.
                </p>

                <button
                  type="button"
                  className="btn xs"
                  disabled={state !== "detected"}
                  onClick={() => commit(detected)}
                >
                  Use this location
                </button>
              </div>
            </div>

            <div className="pad" style={{ paddingTop: 22 }}>
              <div className="section-head">Or pick a neighborhood</div>
              {NEIGHBORHOODS.slice(0, 4).map((n) => (
                <button key={n.name} type="button" className="rowlink" onClick={() => pickNeighborhood(n)}>
                  <span>{n.name}</span>
                  <span className="chev">›</span>
                </button>
              ))}
            </div>

            <div className="foot pad" style={{ padding: "16px 24px 34px" }}>
              <button
                type="button"
                className="linkbtn center"
                onClick={() => navigate("/onboarding/address")}
              >
                Enter an address instead
              </button>
            </div>
          </>
        )}
      </div>
    </Device>
  );
}
