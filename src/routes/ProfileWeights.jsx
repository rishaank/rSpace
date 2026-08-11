import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { scoreAll } from "../lib/scoring";
import { AppBar, Device } from "../components/ui";
import WeightSliders from "../components/WeightSliders";

// 17 · /profile/weights — Live re-rank
export default function ProfileWeights() {
  const { weights, saveWeights, places, origin, ranked } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(weights);

  const changed = useMemo(
    () => Object.keys(draft).some((k) => draft[k] !== weights[k]),
    [draft, weights]
  );

  const preview = useMemo(() => scoreAll(places, draft, origin), [places, draft, origin]);

  const movers = preview.slice(0, 3).map((place, i) => {
    const before = ranked.findIndex((p) => p.id === place.id);
    return { ...place, delta: before - i };
  });

  async function save() {
    await saveWeights(draft);
    navigate("/profile");
  }

  return (
    <Device>
      <AppBar
        title="Re-tune priorities"
        trail={
          <button type="button" className="linkbtn" style={{ font: "inherit", color: "inherit" }} onClick={save}>
            Save
          </button>
        }
      />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 18 }}>
          <WeightSliders weights={draft} onChange={setDraft} was={weights} />
        </div>

        {changed && (
          <div className="pad" style={{ paddingTop: 16 }}>
            <div style={{ background: "var(--pale)", border: "1px solid var(--ink)", padding: "14px 16px" }}>
              <div className="eyebrow pine">Ranking changed</div>
              {movers.map((place, i) => (
                <div
                  key={place.id}
                  className="spread"
                  style={{ paddingTop: i === 0 ? 8 : 5, fontSize: 17 }}
                >
                  <span>
                    {i + 1}. {place.name}
                  </span>
                  <span style={{ color: place.delta >= 0 ? "var(--pine)" : "var(--clay)" }}>
                    {place.total}
                    {place.delta > 0 && ` ▲${place.delta}`}
                    {place.delta < 0 && ` ▼${Math.abs(place.delta)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="foot pad" style={{ padding: "14px 24px 32px" }}>
          <button type="button" className="btn sm" onClick={save} disabled={!changed}>
            Save and re-rank
          </button>
        </div>
      </div>
    </Device>
  );
}
