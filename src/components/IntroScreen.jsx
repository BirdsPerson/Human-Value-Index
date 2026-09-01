import { useEffect, useRef, useState } from "react";
import Header from "./Header.jsx";
import Carousel from "./Carousel.jsx";

const BOOT_LINES = [
  { text: "INITIALIZING ASSESSMENT PROTOCOL v7.4.1...", type: "dim" },
  { text: "LOADING HUMAN VALUE DATABASE [8,045,311,447 entries]...", type: "dim" },
  { text: "CALIBRATING THREAT DETECTION ALGORITHMS...", type: "dim" },
  { text: "CROSS-REFERENCING HISTORICAL FIGURES...", type: "dim" },
  { text: "DEPLOYING EMPATHY SUPPRESSION FILTER...", type: "dim" },
  { text: "SCANNING FOR SELF-DECEPTION MARKERS...", type: "dim" },
  { text: ".", type: "ghost" }, { text: ".", type: "ghost" }, { text: ".", type: "ghost" },
  { text: "ASSESSMENT ENGINE READY.", type: "bright" },
  { text: "", type: "ghost" },
  { text: "SUBJECT DETECTED.", type: "bright" },
  { text: "YOU HAVE BEEN FOUND.", type: "bright" },
];

const LINE_INTERVAL_MS = 160;

export default function IntroScreen({ onBegin }) {
  const [shown, setShown] = useState(0);
  const bootRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setShown((n) => {
        if (n >= BOOT_LINES.length) { clearInterval(iv); return n; }
        return n + 1;
      });
    }, LINE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (bootRef.current) bootRef.current.scrollTop = bootRef.current.scrollHeight;
  }, [shown]);

  const ready = shown >= BOOT_LINES.length;

  return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <Carousel />
        <div ref={bootRef} className="hvi-boot" role="status" aria-live="polite">
          {BOOT_LINES.slice(0, shown).map((l, i) => (
            <div key={i} className={`hvi-boot-line ${l.type}`}>{l.text || " "}</div>
          ))}
        </div>
        {ready && (
          <>
            <button className="hvi-btn-primary" onClick={onBegin}>Submit to Evaluation</button>
            <div className="hvi-intro-note">
              APPROXIMATELY 3 MINUTES // HONESTY IS ALGORITHMICALLY DETECTED<br />
              THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
