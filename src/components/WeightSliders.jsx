import { FACTORS } from "../lib/scoring";
import { Slider } from "./ui";

const NOTES = {
  interactability: "How busy and sociable the place tends to be",
};

/**
 * Weights are stored raw. Each slider runs 0–0.50 independently, and the set
 * is normalised to 1.0 only when scoring, so one drag never moves the others.
 */
export default function WeightSliders({ weights, onChange, was, heavyLast = true }) {
  const sum = FACTORS.reduce((t, f) => t + weights[f.key], 0);

  return (
    <div className="stack">
      {FACTORS.map((factor, i) => {
        const last = i === FACTORS.length - 1;
        const note = was ? (was[factor.key] !== weights[factor.key] ? `Was ${fmt(was[factor.key])} — the tick marks your old value` : null) : NOTES[factor.key];

        return (
          <div
            key={factor.key}
            style={{
              padding: "14px 0 15px",
              borderBottom: last && heavyLast ? "2px solid var(--ink)" : "1px solid var(--hairline)",
              display: "grid",
              gap: 9,
            }}
          >
            <div className="spread">
              <div className="grow" style={{ fontSize: 20 }}>
                {factor.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--sans)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "var(--pine)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(weights[factor.key])}
              </div>
            </div>

            <Slider
              label={factor.label}
              value={weights[factor.key]}
              was={was?.[factor.key]}
              onChange={(next) => onChange({ ...weights, [factor.key]: next })}
            />

            {note && (
              <div className="aside" style={{ fontSize: 15 }}>
                {note}
              </div>
            )}
          </div>
        );
      })}

      <div className="spread" style={{ paddingTop: 12 }}>
        <span className="meta" style={{ letterSpacing: ".14em", color: "var(--label)" }}>
          Sum of weights
        </span>
        <span className="meta" style={{ letterSpacing: ".14em", color: "var(--ink)" }}>
          {sum.toFixed(2)} · normalised to 1.00
        </span>
      </div>
    </div>
  );
}

function fmt(n) {
  return n.toFixed(2).replace(/^0/, "");
}
