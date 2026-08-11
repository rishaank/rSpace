import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { AppBar, Device, Ticks } from "../components/ui";
import WeightSliders from "../components/WeightSliders";

// 09 · /onboarding/weights — Sliders
export default function OnboardingWeights() {
  const { weights, saveWeights } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(weights);

  async function submit() {
    await saveWeights(draft);
    navigate("/onboarding/done");
  }

  return (
    <Device>
      <AppBar title="Your priorities" trail="IV / IV" back={false} />
      <Ticks step={4} />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 22 }}>
          <h2 className="display" style={{ fontSize: 36 }}>
            What makes a place
            <br />
            worth the trip?
          </h2>
          <p className="prose" style={{ paddingTop: 10, fontSize: 16.5 }}>
            Set the weight of each factor. Every place is scored against your answers. Re-tune any
            time from your profile.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-head">
            <span>Factor</span>
            <span>Weight</span>
          </div>
          <WeightSliders weights={draft} onChange={setDraft} />
        </div>

        <div className="foot pad" style={{ padding: "14px 24px 32px" }}>
          <button type="button" className="btn" onClick={submit}>
            See the results
          </button>
        </div>
      </div>
    </Device>
  );
}
