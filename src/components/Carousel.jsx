import { useMemo } from "react";
import { FAMOUS_FIGURES } from "../data/figures.js";
import { getTier } from "../data/tiers.js";

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Carousel() {
  // Shuffle once per mount rather than on every render.
  const items = useMemo(() => shuffle(FAMOUS_FIGURES).slice(0, 24), []);
  const doubled = [...items, ...items];
  return (
    <div className="hvi-carousel-wrap" aria-hidden="true">
      <div className="hvi-carousel-track">
        {doubled.map((fig, i) => {
          const t = getTier(fig.score);
          return (
            <div key={`${fig.name}-${i}`} className="hvi-carousel-item">
              <span className="hvi-carousel-name">{fig.name}</span>
              <span className="hvi-carousel-score" style={{ color: t.color }}>{fig.score}</span>
              <span className="hvi-carousel-tier" style={{ color: t.color }}>{t.icon}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
