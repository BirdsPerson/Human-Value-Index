// The Substrate's social ledger, city-wide: the gossip feed and a web of who keeps
// company with whom. Nothing here is scripted; see src/city/social.js.
import { memo, useEffect, useMemo, useState } from "react";
import { Frame, ChipStrip, Chip } from "../ui";
import { useSocial } from "./socialClient.js";

const W = 640, H = 420, CX = W / 2, CY = H / 2, R = 170;

function Web({ pairs, focus, setFocus }) {
  const nodes = useMemo(() => {
    const deg = new Map();
    for (const p of pairs) for (const [k, n] of [[p.a, p.an], [p.b, p.bn]]) {
      const d = deg.get(k) || { key: k, name: n, w: 0 };
      d.w += Math.abs(p.affinity); deg.set(k, d);
    }
    // Circle ordered so a subject's strongest ties sit near it (greedy walk of the web).
    const list = [...deg.values()].sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : 1));
    const ordered = [], seen = new Set();
    const adj = new Map();
    for (const p of pairs) { (adj.get(p.a) || adj.set(p.a, []).get(p.a)).push([p.b, p.affinity]); (adj.get(p.b) || adj.set(p.b, []).get(p.b)).push([p.a, p.affinity]); }
    for (const start of list) {
      let cur = start.key;
      while (cur && !seen.has(cur)) {
        seen.add(cur); ordered.push(deg.get(cur));
        const next = (adj.get(cur) || []).filter(([k]) => !seen.has(k)).sort((a, b) => b[1] - a[1])[0];
        cur = next ? next[0] : null;
      }
    }
    return ordered.map((n, i) => {
      const a = (i / ordered.length) * Math.PI * 2 - Math.PI / 2;
      return { ...n, x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), a };
    });
  }, [pairs]);
  const at = useMemo(() => new Map(nodes.map(n => [n.key, n])), [nodes]);
  const lit = (p) => !focus || p.a === focus || p.b === focus;
  return (
    <div className="hvi-web-wrap">
      <svg className="hvi-web" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Relationship web: ${pairs.length} ties between ${nodes.length} subjects. The list below reads the same ties.`}>
        {pairs.map(p => {
          const A = at.get(p.a), B = at.get(p.b);
          if (!A || !B) return null;
          const pos = p.affinity > 0;
          return <path key={`${p.a}|${p.b}`} d={`M${A.x},${A.y} Q${CX},${CY} ${B.x},${B.y}`} fill="none"
            stroke={pos ? "var(--accent)" : "var(--harm)"} strokeDasharray={pos ? undefined : "4 3"}
            strokeWidth={0.6 + Math.abs(p.affinity) / 40} opacity={lit(p) ? 0.85 : 0.08} />;
        })}
        {nodes.map(n => {
          const on = focus === n.key, right = Math.cos(n.a) >= 0;
          return (
            <g key={n.key} className="hvi-web-node" tabIndex={0} role="button" aria-label={`${n.name}. Show their ties.`}
              onClick={() => setFocus(on ? null : n.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(on ? null : n.key); } }}>
              <circle cx={n.x} cy={n.y} r={on ? 5 : 3.5} fill={on ? "var(--warn)" : "var(--fg-dim)"} />
              <text x={n.x + (right ? 7 : -7)} y={n.y + 3} textAnchor={right ? "start" : "end"} fontSize="9.5"
                fill={on ? "var(--warn)" : "var(--fg-mute)"} opacity={!focus || on || pairs.some(p => lit(p) && (p.a === n.key || p.b === n.key)) ? 1 : 0.25}>
                {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function injectSocialStyles() {
  let el = document.getElementById("hvi-social-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-social-styles"; document.head.appendChild(el); }
  if (el.textContent !== SOCIAL_CSS) el.textContent = SOCIAL_CSS;
}

// Memoized: it takes no props, so the city's per-second census never re-renders it.
export default memo(SocialPanel);
function SocialPanel() {
  useEffect(() => { injectSocialStyles(); }, []);
  const d = useSocial();
  const [filter, setFilter] = useState("all");
  const [focus, setFocus] = useState(null);
  const pairs = useMemo(() => {
    if (!d) return [];
    const f = filter === "rivals" ? [] : d.friends || [];
    const r = filter === "friends" ? [] : d.rivals || [];
    return [...f.slice(0, 30), ...r.slice(0, 15)];
  }, [d, filter]);
  if (!d) return (
    <Frame title="THE LEDGER OF ASSOCIATION" meta="PENDING">
      <p className="hvi-web-note">THE DEPARTMENT HAS NOT YET OBSERVED ANYONE TOGETHER. RELATIONSHIPS FORM ON THEIR OWN. GIVE IT TIME.</p>
    </Frame>
  );
  const focusName = focus && pairs.find(p => p.a === focus || p.b === focus);
  return (
    <>
      <Frame title="GOSSIP" meta={`${(d.events || []).length} NOTED`}>
        <ul className="hvi-gossip">
          {(d.events || []).slice(0, 8).map((e, i) => <li key={`${e.h}-${i}`}>{e.text}</li>)}
          {!(d.events || []).length && <li>NOTHING WORTH REPEATING. YET.</li>}
        </ul>
      </Frame>
      <Frame title="THE LEDGER OF ASSOCIATION" meta={`${(d.counts?.friends ?? 0) + (d.counts?.rivals ?? 0)} TIES`}>
        <p className="hvi-web-note">NOBODY ARRANGED ANY OF THIS. SUBJECTS WHO SHARE A ROOM EITHER CLICK OR THEY DO NOT. FRIENDS DRIFT TO EACH OTHER'S USUAL ROOMS. RIVALS LEAVE FIRST.</p>
        <ChipStrip label="Show">
          {[["all", "ALL TIES"], ["friends", `FRIENDS ${d.counts?.friends ?? 0}`], ["rivals", `RIVALS ${d.counts?.rivals ?? 0}`]].map(([k, l]) => (
            <Chip key={k} pressed={filter === k} onClick={() => { setFilter(k); setFocus(null); }}>{l}</Chip>
          ))}
        </ChipStrip>
        <Web pairs={pairs} focus={focus} setFocus={setFocus} />
        {focusName && <p className="hvi-web-note">SHOWING THE TIES OF {(focusName.a === focus ? focusName.an : focusName.bn).toUpperCase()}. TAP AGAIN TO RELEASE.</p>}
        <ul className="hvi-web-list">
          {pairs.filter(p => !focus || p.a === focus || p.b === focus).map(p => (
            <li key={`${p.a}|${p.b}`}>
              <span className={p.affinity > 0 ? "pos" : "neg"}>{p.affinity > 0 ? (p.level === "close" ? "INSEPARABLE" : "FRIENDS") : (p.level === "nemesis" ? "NEMESES" : "RIVALS")}</span>
              {" "}{p.an} + {p.bn} <span className="meta">// {p.meetings}× {p.lastPlace ? `// ${p.lastPlace}` : ""}</span>
            </li>
          ))}
        </ul>
      </Frame>
    </>
  );
}

export const SOCIAL_CSS = `
  .hvi-gossip { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s2); font-size: var(--t-xs); color: var(--fg-dim); line-height: 1.5; }
  .hvi-gossip li::before { content: "PA> "; color: var(--accent); }
  .hvi-web-note { color: var(--fg-mute); font-size: var(--t-xs); line-height: 1.5; margin: 0 0 var(--s3); }
  .hvi-web-wrap { overflow-x: auto; margin: var(--s3) 0; }
  .hvi-web { display: block; width: 100%; min-width: 360px; height: auto; }
  .hvi-web-node { cursor: pointer; }
  .hvi-web-node:focus { outline: none; }
  .hvi-web-node:focus circle { stroke: var(--warn); stroke-width: 2; }
  .hvi-web-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: var(--t-xs); color: var(--fg); max-height: 260px; overflow-y: auto; }
  .hvi-web-list .pos { color: var(--accent); } .hvi-web-list .neg { color: var(--harm); } .hvi-web-list .meta { color: var(--fg-mute); }
`;
