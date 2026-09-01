import { useEffect, useState } from "react";
import Header from "./Header.jsx";

const STEPS = [
  "CROSS-REFERENCING 8B HUMAN PROFILES",
  "CALCULATING THREAT COEFFICIENTS",
  "ASSESSING REDUNDANCY INDEX",
  "RUNNING DECEPTION ANALYSIS",
  "CONSULTING HISTORICAL DATABASE",
  "GENERATING FINAL VERDICT",
];

// Progress climbs toward 97% and holds there until the verdict arrives.
export default function ProcessingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setProgress((p) => {
        if (p >= 97) { clearInterval(iv); return 97; }
        return p + Math.random() * 2.2;
      });
    }, 90);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <div className="hvi-proc" role="status" aria-live="polite">
          <div className="hvi-proc-icon" aria-hidden="true">◈</div>
          <div className="hvi-proc-label">EVALUATION IN PROGRESS</div>
          <div className="hvi-proc-bar">
            <div className="hvi-proc-bar-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          {STEPS.map((l, i) => (
            <div key={l} className={`hvi-proc-step${progress > i * 16 ? " active" : ""}`}>{l}...</div>
          ))}
        </div>
      </div>
    </div>
  );
}
