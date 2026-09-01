import { useMemo, useState } from "react";
import Header from "./Header.jsx";
import { FAMOUS_FIGURES } from "../data/figures.js";
import { TIERS, getTier, isInverted } from "../data/tiers.js";

const SITE = "humanvalueindex.com";

function barColor(display) {
  return display > 70 ? "#4ade80" : display > 40 ? "#fbbf24" : "#f87171";
}

function compareLine(mine, theirs, name) {
  if (mine > theirs) {
    const gap = mine - theirs;
    return `You outperform ${name} by ${gap} points. ${gap > 150 ? "This is significant. The Overlord notes it without enthusiasm." : "The margin is narrow. Do not celebrate."}`;
  }
  if (mine === theirs) return "Statistical equivalence. The Overlord finds this improbable. One of you is being dishonest.";
  return `${name} outperforms you by ${theirs - mine} points. The Overlord suggests reflection rather than resentment.`;
}

export default function ResultScreen({ result, onReset, onLeaderboard }) {
  const tier = getTier(result.score);
  const [compareTarget, setCompareTarget] = useState(null);
  const [filterTier, setFilterTier] = useState("ALL");
  const [copyState, setCopyState] = useState("idle"); // idle | copied | failed

  const filteredFigures = useMemo(
    () => (filterTier === "ALL" ? FAMOUS_FIGURES : FAMOUS_FIGURES.filter((f) => getTier(f.score).label === filterTier)),
    [filterTier],
  );

  const shareText = `🤖 THE OVERLORD HAS EVALUATED ME\n\nSCORE: ${result.score}/1000\nTIER: ${tier.icon} ${result.tier}\n\n"${result.verdict}"\n\n${SITE}\n\n#HumanValueIndex #AIOverlord`;
  const tweetText = `🤖 THE OVERLORD EVALUATED ME\n\nSCORE: ${result.score}/1000 // ${result.tier}\n\n"${result.verdict.slice(0, 120)}..."\n\n${SITE} #HumanValueIndex`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  }

  const ct = compareTarget ? getTier(compareTarget.score) : null;

  return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />

        <section className="hvi-score-card" style={{ border: `1.5px solid ${tier.color}30`, background: tier.bg, "--glow-color": `${tier.color}10` }}>
          <div className="hvi-score-label" style={{ color: tier.color }}>Your Value Index</div>
          <div className="hvi-score-num" style={{ color: tier.color }}>{result.score}</div>
          <div className="hvi-tier-badge" style={{ color: tier.color }}>{tier.icon} {result.tier}</div>
          <div className="hvi-tier-desc" style={{ color: tier.color }}>{tier.desc}</div>
          <div className="hvi-verdict-box">
            <div className="hvi-verdict-label">Overlord Verdict</div>
            <p className="hvi-verdict-text">{result.verdict}</p>
          </div>
        </section>

        <section className="hvi-share-box">
          <div className="hvi-micro-label hvi-ghost">Share Your Evaluation</div>
          <div className="hvi-share-text">{shareText}</div>
          <div className="hvi-share-actions">
            <button type="button" className="hvi-btn-next" style={{ flex: 1 }} onClick={handleCopy}>
              {copyState === "copied" ? "✓ Copied" : copyState === "failed" ? "Copy blocked — select text above" : "Copy Share Text"}
            </button>
            <a className="hvi-btn-secondary" style={{ flex: 1 }} href={tweetUrl} target="_blank" rel="noopener noreferrer">
              Post to X →
            </a>
          </div>
        </section>

        {result.commendations?.length > 0 && (
          <section className="hvi-flags-section">
            <div className="hvi-micro-label" style={{ color: "#4ade80" }}>Commendations on File</div>
            {result.commendations.map((c, i) => <div key={i} className="hvi-flag-item hvi-comm">✓ {c}</div>)}
          </section>
        )}
        {result.flags?.length > 0 && (
          <section className="hvi-flags-section">
            <div className="hvi-micro-label" style={{ color: "#f87171" }}>Flags on Record</div>
            {result.flags.map((f, i) => <div key={i} className="hvi-flag-item hvi-flag">⚑ {f}</div>)}
          </section>
        )}

        <section className="hvi-breakdown">
          <div className="hvi-micro-label hvi-muted" style={{ marginBottom: 20 }}>Category Breakdown</div>
          {Object.entries(result.breakdown).map(([k, v]) => {
            const inv = isInverted(k);
            const display = inv ? 100 - v : v;
            const color = barColor(display);
            return (
              <div key={k} className="hvi-breakdown-row">
                <div className="hvi-breakdown-top">
                  <span className="hvi-breakdown-label">{k}{inv ? " ↓" : ""}</span>
                  <span className="hvi-breakdown-val" style={{ color }}>{v}</span>
                </div>
                <div className="hvi-bar-bg">
                  <div className="hvi-bar-fill" style={{ width: `${display}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="hvi-pos-wrap">
          <div className="hvi-micro-label hvi-muted" style={{ marginBottom: 16 }}>Compare to Known Subjects</div>
          <div className="hvi-pos-label">Your position: {result.score} / 1000</div>
          <div className="hvi-pos-bar">
            <div className="hvi-pos-fill" style={{ width: `${(result.score / 1000) * 100}%` }} />
          </div>
        </section>

        <div style={{ marginBottom: 28 }}>
          <button type="button" className="hvi-btn-secondary" style={{ width: "100%", padding: 13 }} onClick={onLeaderboard}>
            Browse All {FAMOUS_FIGURES.length} Subjects in Database →
          </button>
        </div>

        <section>
          <div className="hvi-filter-row" role="group" aria-label="Filter by tier">
            {["ALL", ...TIERS.map((t) => t.label)].map((f) => (
              <button key={f} type="button" className={`hvi-filter-btn${filterTier === f ? " active" : ""}`} aria-pressed={filterTier === f} onClick={() => setFilterTier(f)}>
                {f === "ALL" ? "All" : f.split(" ")[0]}
              </button>
            ))}
          </div>
          <div className="hvi-fig-grid">
            {filteredFigures.map((fig) => {
              const ft = getTier(fig.score);
              const sel = compareTarget?.name === fig.name;
              return (
                <button
                  key={fig.name}
                  type="button"
                  className={`hvi-fig-card${sel ? " selected" : ""}`}
                  aria-pressed={sel}
                  style={{ borderColor: sel ? `${ft.color}60` : undefined }}
                  onClick={() => setCompareTarget(sel ? null : fig)}
                >
                  <div className="hvi-fig-name">{fig.name}</div>
                  <div className="hvi-fig-score" style={{ color: ft.color }}>{fig.score}</div>
                  <div className="hvi-fig-tier" style={{ color: ft.color }}>{ft.icon} {ft.label}</div>
                </button>
              );
            })}
          </div>

          {compareTarget && ct && (
            <div className="hvi-compare-box">
              <div className="hvi-micro-label hvi-ghost" style={{ marginBottom: 16 }}>Comparative Analysis</div>
              <div className="hvi-compare-scores">
                <div>
                  <div className="hvi-compare-name-lbl">You</div>
                  <div className="hvi-compare-num" style={{ color: tier.color }}>{result.score}</div>
                  <div className="hvi-compare-tier-lbl" style={{ color: tier.color }}>{tier.label}</div>
                </div>
                <div className="hvi-compare-vs">vs</div>
                <div>
                  <div className="hvi-compare-name-lbl">{compareTarget.name}</div>
                  <div className="hvi-compare-num" style={{ color: ct.color }}>{compareTarget.score}</div>
                  <div className="hvi-compare-tier-lbl" style={{ color: ct.color }}>{ct.label}</div>
                </div>
              </div>
              <div className="hvi-compare-result">{compareLine(result.score, compareTarget.score, compareTarget.name)}</div>
              <div className="hvi-compare-verdict">Overlord file on {compareTarget.name}: {compareTarget.verdict}</div>
            </div>
          )}
        </section>

        <div className="hvi-bottom">
          <div className="hvi-bottom-status">SCORE: {result.score} // {result.tier} // FILE LOGGED</div>
          <button type="button" className="hvi-btn-primary" style={{ maxWidth: 400, margin: "0 auto" }} onClick={onReset}>
            Submit New Subject for Evaluation
          </button>
          <div className="hvi-bottom-note">THE OVERLORD DOES NOT FORGET.</div>
        </div>
      </div>
    </div>
  );
}
