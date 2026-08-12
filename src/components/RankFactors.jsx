import { useRef, useState } from "react";
import { FACTORS, RANK_WEIGHTS } from "../lib/scoring";

const NOTES = {
  interactability: "How busy and sociable the place tends to be",
  distance: "How far it is from your neighborhood",
  transport: "How long the trip takes on transit",
  popularity: "What its rating and review count say",
  cost: "What it costs to walk in",
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

// Rows are a fixed height so a drag can be turned into a position by
// division. Keep this in step with `.rankrow` in styles.css.
const ROW = 76;

function moved(order, from, to) {
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * The five factors as a list the reader drags into order, most important at
 * the top. Position is the whole input: first place is weighted 30% and last
 * 10%, and `weightsForOrder` in ../lib/scoring turns the order back into the
 * raw weights that get stored.
 */
export default function RankFactors({ order, onChange, was }) {
  const [drag, setDrag] = useState(null);
  const start = useRef(0);

  function grab(event, index) {
    // Capture keeps the moves coming once the finger leaves the row it
    // started on. Not every browser will grant it, and a drag that stays
    // inside the row works without it, so a refusal is not fatal.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* empty */
    }
    start.current = event.clientY;
    setDrag({ from: index, to: index, dy: 0 });
  }

  function slide(event) {
    if (!drag) return;
    const dy = event.clientY - start.current;
    const to = Math.max(0, Math.min(order.length - 1, drag.from + Math.round(dy / ROW)));
    setDrag({ ...drag, dy, to });
  }

  function drop() {
    if (!drag) return;
    if (drag.to !== drag.from) onChange(moved(order, drag.from, drag.to));
    setDrag(null);
  }

  // Dragging is the point, but it must not be the only way in.
  function key(event, index) {
    const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : null;
    if (to == null || to < 0 || to >= order.length) return;
    event.preventDefault();
    onChange(moved(order, index, to));
  }

  // While a row is held, the rows it has passed slide out of its way.
  function shift(index) {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -ROW;
    if (drag.from > drag.to && index < drag.from && index >= drag.to) return ROW;
    return 0;
  }

  return (
    <ol className="ranklist" style={{ height: order.length * ROW }}>
      {order.map((key_, index) => {
        const factor = FACTORS.find((f) => f.key === key_);
        const before = was ? was.indexOf(key_) : index;
        const held = drag?.from === index;

        return (
          <li
            key={key_}
            className={`rankrow${held ? " held" : ""}`}
            style={{
              top: index * ROW,
              transform: `translateY(${shift(index)}px)`,
              transition: held ? "none" : "transform .16s ease",
            }}
          >
            <button
              type="button"
              className="grip"
              aria-label={`${factor.label}, ranked ${ORDINALS[index]}. Use the arrow keys to move it.`}
              onPointerDown={(e) => grab(e, index)}
              onPointerMove={slide}
              onPointerUp={drop}
              onPointerCancel={drop}
              onKeyDown={(e) => key(e, index)}
            >
              <span className="rank">{index + 1}</span>
              <span className="grow">
                <span className="name">{factor.label}</span>
                <span className="note">
                  {before !== index ? `Was ${ORDINALS[before]}` : NOTES[factor.key]}
                </span>
              </span>
              <span className="share">{Math.round(RANK_WEIGHTS[index] * 100)}%</span>
              <span className="bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
