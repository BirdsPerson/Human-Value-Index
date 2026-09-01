import { useMemo } from "react";
import Header from "./Header.jsx";
import { FAMOUS_FIGURES } from "../data/figures.js";
import { TIERS, getTier } from "../data/tiers.js";

export default function LeaderboardScreen({ result, onBack }) {
  const tier = result ? getTier(result.score) : null;
  const tierGroups = useMemo(() => {
    const sorted = [...FAMOUS_FIGURES].sort((a, b) => b.score - a.score);
    return TIERS.map((t) => ({ ...t, figures: sorted.filter((f) => getTier(f.score).label === t.label) }));
  }, []);

  return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <div className="hvi-lb-heading">KNOWN SUBJECTS DATABASE // {FAMOUS_FIGURES.length} ON FILE</div>

        {result && tier && (
          <div className="hvi-lb-you" style={{ border: `1px solid ${tier.color}`, background: tier.bg }}>
            <div>
              <div className="hvi-compare-name-lbl">YOUR SCORE</div>
              <div className="hvi-lb-you-score" style={{ color: tier.color }}>{result.score}</div>
              <div className="hvi-fig-tier" style={{ color: tier.color }}>{tier.icon} {result.tier}</div>
            </div>
            <button type="button" className="hvi-btn-secondary" onClick={onBack}>← Back to Results</button>
          </div>
        )}

        {tierGroups.map((tg) => tg.figures.length > 0 && (
          <section key={tg.label}>
            <h2 className="hvi-lb-tier-header" style={{ color: tg.color, borderColor: `${tg.color}30` }}>
              {tg.icon} {tg.label} ({tg.figures.length})
            </h2>
            {tg.figures.map((fig) => (
              <div key={fig.name} className="hvi-lb-card">
                <div className="hvi-lb-card-top">
                  <span className="hvi-lb-name">{fig.name}</span>
                  <span className="hvi-lb-score" style={{ color: tg.color }}>{fig.score}</span>
                </div>
                <div className="hvi-lb-verdict">{fig.verdict}</div>
              </div>
            ))}
          </section>
        ))}

        <div className="hvi-bottom">
          <button type="button" className="hvi-btn-primary" style={{ maxWidth: 400, margin: "0 auto" }} onClick={onBack}>
            {result ? "Back to My Results" : "Submit to Evaluation"}
          </button>
        </div>
      </div>
    </div>
  );
}
