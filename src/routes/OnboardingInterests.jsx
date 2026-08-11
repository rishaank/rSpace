import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { INTEREST_GROUPS } from "../lib/seed";
import { AppBar, Chip, Device } from "../components/ui";

// 08 · /onboarding/interests
export default function OnboardingInterests() {
  const { profile, saveProfile } = useApp();
  const navigate = useNavigate();
  const [picked, setPicked] = useState(profile?.interests ?? []);

  function toggle(item) {
    setPicked((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  }

  async function submit() {
    await saveProfile({ interests: picked });
    navigate("/onboarding/weights");
  }

  return (
    <Device>
      <AppBar title="Interests" trail="Optional" back={false} />

      <div className="scroll" style={{ display: "flex", flexDirection: "column" }}>
        <div className="pad" style={{ paddingTop: 24 }}>
          <h2 className="display">
            What would you
            <br />
            go out for?
          </h2>
          <p className="prose" style={{ paddingTop: 11 }}>
            Pick any number. Interests filter the map — they don&rsquo;t change a place&rsquo;s
            score. Off by default.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 22, display: "grid", gap: 18 }}>
          {INTEREST_GROUPS.map((group) => (
            <div key={group.name} style={{ display: "grid", gap: 10 }}>
              <div className="section-head">{group.name}</div>
              <div className="chips">
                {group.items.map((item) => (
                  <Chip key={item} on={picked.includes(item)} onClick={() => toggle(item)}>
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="foot pad" style={{ padding: "16px 24px 34px", display: "grid", gap: 11 }}>
          <p className="aside" style={{ textAlign: "center" }}>
            {picked.length} selected
          </p>
          <button type="button" className="btn" onClick={submit}>
            Continue
          </button>
        </div>
      </div>
    </Device>
  );
}
