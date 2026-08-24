import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { FACTORS, normalisedWeights, orderForWeights } from "../lib/scoring";
import { COMMUNITY_SOURCE, GENERATED, SOURCE } from "../lib/seed";
import { EVENTS_GENERATED, EVENTS_SOURCE } from "../lib/events";
import { GEOGRAPHY_GENERATED, GEOGRAPHY_SOURCE } from "../lib/geography";
import { BUDGETS, hasMapsKey } from "../lib/google";
import { spending } from "../lib/cache";
import { Device, Meter, TabBar } from "../components/ui";

// Four generators, four licences, four dates. Two of these ask for
// attribution by name — OpenStreetMap is ODbL and the city's service is
// CC-BY — and the honest place to give it is the one screen that says where
// everything in the app came from.
const SOURCES = [
  { name: SOURCE, generated: GENERATED },
  { name: COMMUNITY_SOURCE, generated: null },
  // The events feed stamps a full ISO timestamp; only the day is meaningful
  // to a reader, and the rest wrapped the row onto three lines.
  { name: EVENTS_SOURCE, generated: EVENTS_GENERATED?.slice(0, 10) },
  { name: GEOGRAPHY_SOURCE, generated: GEOGRAPHY_GENERATED },
];

// 15 · /profile
export default function Profile() {
  const { profile, weights, favorites, ranked, signOut } = useApp();
  const navigate = useNavigate();
  const shown = normalisedWeights(weights);
  const regulars = ranked.filter((p) => favorites.includes(p.id)).slice(0, 3);

  return (
    <Device>
      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ background: "var(--pine)", padding: "20px 24px 22px", flex: "none" }}>
          <div className="row" style={{ gap: 16 }}>
            <div
              style={{
                width: 74,
                height: 74,
                flex: "none",
                background: "var(--pale)",
                border: "1px solid var(--ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                color: "var(--pine)",
              }}
            >
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="grow">
              <div style={{ fontWeight: 500, fontSize: 31, lineHeight: 1.1, letterSpacing: "-.02em", color: "var(--paper)" }}>
                {profile.name}
              </div>
              <div className="meta" style={{ color: "var(--sage)", display: "block", paddingTop: 6 }}>
                {profile.age} · {profile.location}
              </div>
            </div>
          </div>

          <div className="chips" style={{ paddingTop: 16 }}>
            {(profile.interests ?? []).map((interest) => (
              <span key={interest} className="chip on-dark">
                {interest}
              </span>
            ))}
            <Link to="/profile/edit" className="chip on-dark dashed" style={{ textDecoration: "none" }}>
              + Add
            </Link>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="section-head">Your priorities</div>
          {/* Listed in the order they were ranked, so this reads back the
              same way it was set. */}
          {orderForWeights(weights).map((key, i) => (
            <Meter
              key={key}
              name={`${i + 1}. ${FACTORS.find((f) => f.key === key).short}`}
              value={Math.min(shown[key] * 2, 1)}
              text={`${Math.round(shown[key] * 100)}%`}
              thin
            />
          ))}
          <div style={{ paddingTop: 12 }}>
            <Link to="/profile/weights" className="btn xs ghost">
              Re-tune priorities
            </Link>
          </div>
        </div>

        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="section-head">Saved places</div>
          {regulars.length ? (
            regulars.map((place) => (
              <Link key={place.id} to={`/place/${place.id}`} className="rowlink" style={{ fontSize: 18 }}>
                <span>{place.name}</span>
                <span className="chev">›</span>
              </Link>
            ))
          ) : (
            <p className="aside" style={{ padding: "12px 0" }}>
              Save a place and it shows up here.
            </p>
          )}
        </div>

        <DataNote />

        <div className="foot pad" style={{ padding: "20px 24px 20px", display: "grid", gap: 12 }}>
          <Link to="/profile/edit" className="btn xs ghost">
            Edit profile
          </Link>
          <button
            type="button"
            className="btn xs ghost clay"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <TabBar />
    </Device>
  );
}

/**
 * Where the app's facts come from, and what this browser has spent asking
 * Google for the two it cannot store.
 *
 * The spend half is deliberately modest about what it knows. It counts one
 * browser, so it is not the bill — the bill is capped by the per-day quotas
 * on the Cloud project, which is the only number that binds everybody at
 * once. What it does show is the shape of the thing: photos are on the tier
 * with a thousand calls a month behind it, which is why they now wait for a
 * tap, and transit times are on the tier with ten thousand, which is why they
 * do not.
 */
function DataNote() {
  const spent = spending();

  return (
    <div className="pad" style={{ paddingTop: 20 }}>
      <div className="section-head">Where this comes from</div>
      {SOURCES.map((source) => (
        <div
          key={source.name}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            borderBottom: "1px solid var(--hairline)",
            padding: "9px 0",
          }}
        >
          <span className="grow" style={{ fontSize: 16.5, lineHeight: 1.35 }}>
            {source.name}
          </span>
          {source.generated && (
            <span className="meta" style={{ flex: "none", fontSize: 14 }}>
              {source.generated}
            </span>
          )}
        </div>
      ))}

      {hasMapsKey && (
        <>
          <div className="section-head" style={{ paddingTop: 18 }}>
            <span>Google calls from this browser</span>
            <span>this month</span>
          </div>
          {BUDGETS.map((budget) => (
            <Meter
              key={budget.bucket}
              name={budget.label}
              value={Math.min((spent[budget.bucket] ?? 0) / budget.ceiling, 1)}
              text={`${spent[budget.bucket] ?? 0}/${budget.ceiling}`}
              tone="mid"
              thin
            />
          ))}
          <p className="aside" style={{ fontSize: 15.5, paddingTop: 9 }}>
            A photo is an Enterprise call — a thousand a month for everybody who
            uses rSpace — which is why it waits for a tap. A transit time is an
            Essentials call, with ten thousand behind it, so it does not. These
            two counts are one browser: the cap that actually binds is the
            per-day quota on the Google Cloud project.
          </p>
        </>
      )}
    </div>
  );
}
