import { useEffect, useMemo, useState } from "react";
import { FAMOUS_FIGURES, slugify } from "../figures.js";
import { readCaseId, readLastResult } from "../Intake.jsx";

// Everyone uploaded into the Substrate: the figures on file, every citizen and referral
// the census returns, and this browser's own file. Loaded once per visit to #city.

const base = () => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" }));

function withSelf(list) {
  const caseId = readCaseId(), last = readLastResult();
  if (!caseId || !last || last.caseId !== caseId) return list;
  const tag = caseId.slice(-4);
  const name = `Subject ${tag}`;
  const i = list.findIndex(s => s.name === name);
  // Your sealed verdict and breakdown open on your own card. Everything the sim reads
  // (slug, tier, warmth, competence, sprite) stays as the census has it, so you see
  // yourself in the same job, at the same place, as every other viewer does.
  const own = { verdict: last.verdict, breakdown: last.breakdown, rubric: last.rubric ?? 1, you: true, caseId };
  if (i >= 0) { const out = list.slice(); out[i] = { ...list[i], ...own, avatar: list[i].avatar || last.avatar || null }; return out; }
  // Not in the census (offline, or not yet indexed): the server's slug, so the job matches.
  return [...list, { name, score: last.score, tier: last.tier, avatar: last.avatar || null, kind: "citizen", slug: `citizen-${tag.toLowerCase()}`, ...own }];
}

// Dev only: #city?stress=400 fills the city with numbered copies to test the frame rate.
function stress(list) {
  if (!import.meta.env?.DEV) return list;
  const m = /stress=(\d+)/.exec(window.location.hash + window.location.search);
  const n = m ? Math.min(3000, +m[1]) : 0;
  const out = list.slice();
  for (let i = 0; out.length < n; i++) {
    const f = list[i % list.length];
    out.push({ ...f, qualifier: `copy ${i}`, slug: `${f.slug}-copy-${i}`, name: `${f.name} #${i}`, you: false });
  }
  return out;
}

export function useRoster() {
  const [census, setCensus] = useState("pending");
  const [extra, setExtra] = useState([]);
  // Your own file lands in this browser after the census may already be in: the app
  // syncs it from the server and announces it. Re-merge when it does.
  const [selfV, setSelfV] = useState(0);
  useEffect(() => {
    const bump = () => setSelfV(v => v + 1);
    window.addEventListener("hvi-file", bump);
    window.addEventListener("hvi-case", bump);
    return () => { window.removeEventListener("hvi-file", bump); window.removeEventListener("hvi-case", bump); };
  }, []);
  useEffect(() => {
    let off = false;
    fetch("/api/pen").then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(d => {
      if (off) return;
      // A referral of someone already on file is the same person: skip it by name or slug.
      const have = new Set(FAMOUS_FIGURES.flatMap(f => [f.name, slugify(f.name)]));
      const out = [];
      for (const s of d?.subjects || []) {
        if (!s || !s.name || typeof s.score !== "number") continue;
        const slug = s.slug || slugify(s.baseName || s.name);
        if (have.has(s.name) || have.has(slug) || (s.baseName && have.has(s.baseName))) continue;
        have.add(s.name); have.add(slug);
        out.push({ ...s, slug, kind: s.kind === "citizen" ? "citizen" : "figure" });
      }
      setExtra(out);
      setCensus("ok");
    }).catch(() => { if (!off) setCensus("down"); });
    return () => { off = true; };
  }, []);
  const roster = useMemo(() => stress(withSelf([...base(), ...extra])), [extra, selfV]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { roster, census };
}
