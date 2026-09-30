import { useEffect, useMemo, useState } from "react";
import { baseRoster, mergeCensus } from "./roster.js";
import { setRoster } from "./sim.js";
import { readCaseId, readLastResult } from "../caseFile.jsx";
import { fetchPen } from "../penClient.js";
import { startSectors, planMode, setSelf } from "./planClient.js";

// Everyone uploaded into the Substrate. Since scaling step 4 (docs/CITY_SPEC.md "Sectors")
// the city does not download them: the published plan's summary draws the crowds and each
// district's window brings its people (planClient.js). mode "sectors" then; the roster here
// is the figures on file and your own file. Without a split day ("legacy") it is what it
// always was: the figures on file, every citizen and referral the census returns (all of
// /api/pen, page by page), and this browser's own file.

const base = baseRoster;

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
  const [mode, setMode] = useState(planMode);
  const [census, setCensus] = useState("pending");
  const [extra, setExtra] = useState([]);
  // Your own file lands in this browser after the census may already be in: the app
  // syncs it from the server and announces it. Re-merge when it does.
  const [selfV, setSelfV] = useState(0);
  useEffect(() => {
    const bump = () => setSelfV(v => v + 1);
    const flip = () => setMode(planMode());
    window.addEventListener("hvi-file", bump);
    window.addEventListener("hvi-case", bump);
    window.addEventListener("hvi-plan-mode", flip);
    let off = false;
    startSectors().then(m => { if (!off) setMode(m); });
    return () => { off = true; window.removeEventListener("hvi-file", bump); window.removeEventListener("hvi-case", bump); window.removeEventListener("hvi-plan-mode", flip); };
  }, []);
  useEffect(() => {
    if (mode === "sectors") { setCensus("ok"); return; }
    if (mode !== "legacy") return;
    let off = false;
    fetchPen().then(list => {
      if (off) return;
      setExtra(mergeCensus(list));
      setCensus("ok");
    }).catch(() => { if (!off) setCensus("down"); });
    return () => { off = true; };
  }, [mode]);
  const roster = useMemo(() => {
    if (mode !== "legacy") {
      const list = withSelf(base());
      const me = list.find(s => s.you);
      setSelf(me || null);
      return list;
    }
    const list = stress(withSelf([...base(), ...extra]));
    setRoster(list);   // leisure is placed with room capacity in mind, across this whole roster
    return list;
  }, [extra, selfV, mode]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { roster, census, mode };
}
