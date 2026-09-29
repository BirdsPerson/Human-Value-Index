// ANALYTICS for the Public Figure Index. Lazy-loaded from FigureIndex.jsx.
// Every chart is computed from the live roster (figures.js + /api/pen figures) and every
// cutoff from calibration.json, so it grows and re-tunes without edits here.
// Forms (dataviz procedure): magnitude -> bars in one hue; part-to-whole -> 100% stacked
// bar (four named parts read more precisely along one axis than as donut angles, and a
// bar stays legible at 390px); relationship -> scatter. Categorical marks use a palette
// validated against the page surface (docs/design-system.md, ANALYTICS). Every chart has
// a hover/tap tooltip, direct labels, and a table view.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CAL from "../../netlify/lib/calibration.json" with { type: "json" };
import { displayName, getTier } from "../figures.js";
import { Chip, ChipStrip, Disclosure, Frame } from "../ui/index.js";
import {
  mergeRoster, tierCounts, histogram, tierMarkers, quadrantShare, categoryProfile, eraOf, domainOf,
  groupAverages, coverage, topBottom, scatterPoints, DIMS, mean,
} from "./aggregate.js";
import "./analytics.css";

// Marks: validated for the #0a0f0a surface (L 0.48-0.67, adjacent CVD >= 6 with direct
// labels + 2px gaps, normal-vision >= 15). Order is fixed; colour follows the quadrant.
const Q_COLOR = { ADMIRED: "#26a65b", ENVIED: "#c98500", "TRUSTED RESERVE": "#3c8fd6", DISMISSED: "#e46262", UNPLACED: "#4b7c5e" };
const MARK = "#26a65b";

const pct = (x) => `${Math.round(x * 100)}%`;
const r0 = (x) => (x === null || x === undefined ? "—" : Math.round(x));
const DIM_LABEL = { care: "CARE", alignment: "ALIGNMENT", utility: "UTILITY", adaptability: "ADAPTABILITY", legacy: "LEGACY", network: "NETWORK", physical: "PHYSICAL", threat: "THREAT", redundancy: "REDUNDANCY" };

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// One tooltip per chart. show() takes the triggering element (mouse, focus or tap).
function useTip(box) {
  const [tip, setTip] = useState(null);
  const show = (el, lines) => {
    const b = box.current?.getBoundingClientRect(); const r = el.getBoundingClientRect?.();
    if (!b || !r) return;
    setTip({ x: r.left - b.left + r.width / 2, y: r.top - b.top, lines });
  };
  const showAt = (x, y, lines) => setTip({ x, y, lines });
  const hide = () => setTip(null);
  const node = tip && (
    <div className="hvi-an-tip" role="status" style={{ left: Math.max(8, Math.min(tip.x, (box.current?.clientWidth || 300) - 8)), top: tip.y }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? "t" : ""}>{l}</div>)}
    </div>
  );
  return { show, showAt, hide, node };
}

// Props that make a mark hoverable, focusable and tappable.
const markProps = (tip, lines, label) => ({
  tabIndex: 0, role: "img", "aria-label": label || lines.join(", "),
  onMouseEnter: e => tip.show(e.currentTarget, lines), onMouseLeave: tip.hide,
  onFocus: e => tip.show(e.currentTarget, lines), onBlur: tip.hide,
  onClick: e => tip.show(e.currentTarget, lines),
});

function Table({ caption, head, rows }) {
  return (
    <Disclosure title="TABLE VIEW" className="hvi-an-table">
      <div className="hvi-an-tablewrap">
        <table>
          <caption>{caption}</caption>
          <thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Disclosure>
  );
}

function Section({ title, meta, caption, children }) {
  return (
    <Frame title={title} meta={meta} className="hvi-an-sec">
      {caption && <p className="hvi-an-cap">{caption}</p>}
      {children}
    </Frame>
  );
}

// Horizontal bars in one hue, value labelled at the end. rows: {label, value, text, lines, lead?}
function HBars({ rows, max, color = MARK, tip, reference }) {
  const m = max || Math.max(1, ...rows.map(r => r.value || 0));
  return (
    <div className="hvi-an-hbars" role="list">
      {rows.map(r => (
        <div key={r.label} className="hvi-an-hrow" role="listitem">
          <span className="lab">{r.lead}{r.label}</span>
          <span className="track" {...markProps(tip, r.lines)}>
            {r.value > 0 && <span className="bar" style={{ width: `${(r.value / m) * 100}%`, background: r.color || color }} />}
            {reference && typeof r.ref === "number" && <span className="ref" style={{ left: `${(r.ref / m) * 100}%` }} aria-hidden="true" />}
          </span>
          <span className="val">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

function Stacked({ parts, tip, label }) {
  const total = parts.reduce((a, p) => a + p.count, 0) || 1;
  return (
    <>
      <div className="hvi-an-stack" role="list" aria-label={label}>
        {parts.filter(p => p.count > 0).map(p => (
          <span key={p.label} role="listitem" className="seg" style={{ flexGrow: p.count, background: p.color }}
            {...markProps(tip, [p.label, `${p.count} · ${pct(p.count / total)}`])} />
        ))}
      </div>
      <ul className="hvi-an-legend">
        {parts.map(p => (
          <li key={p.label}><span className="sw" style={{ background: p.color }} aria-hidden="true" />{p.label} <b>{p.count}</b> <span className="dim">{pct(p.count / total)}</span></li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------

function TierChart({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const rows = tierCounts(subjects);
  const essential = rows[0];
  const caption = essential.count <= Math.max(2, subjects.length * 0.03)
    ? "THE DEPARTMENT NOTES A SHORTAGE OF ESSENTIAL INFRASTRUCTURE."
    : "ESSENTIAL INFRASTRUCTURE IS ADEQUATELY STAFFED. THIS WILL NOT LAST.";
  return (
    <Section title="DISTRIBUTION OF WORTH" meta={`N ${subjects.length}`} caption={caption}>
      <div ref={box} className="hvi-an-chart">
        <HBars tip={tip} rows={rows.map(t => ({
          label: t.label, value: t.count, text: `${t.count} · ${pct(t.pct)}`,
          lead: <span className="ico" style={{ color: t.color }} aria-hidden="true">{t.icon} </span>,
          lines: [t.label, `${t.count} SUBJECTS · ${pct(t.pct)}`, `FROM ${t.min}`],
        }))} />
        {tip.node}
      </div>
      <Table caption="Subjects per tier" head={["TIER", "FROM", "N", "SHARE"]} rows={rows.map(t => [t.label, t.min, t.count, pct(t.pct)])} />
    </Section>
  );
}

function Histogram({ subjects }) {
  const box = useRef(null); const tip = useTip(box); const w = useWidth(box);
  const b = histogram(subjects, 50);
  const markers = tierMarkers();
  const H = 190, pad = { l: 28, r: 8, t: 26, b: 22 };
  const iw = Math.max(0, w - pad.l - pad.r), ih = H - pad.t - pad.b;
  const ymax = Math.max(1, ...b.map(x => x.count));
  const x = v => pad.l + (v / 1000) * iw, y = v => pad.t + ih - (v / ymax) * ih;
  const bw = iw / b.length;
  return (
    <Section title="SCORE HISTOGRAM" meta="BUCKETS OF 50" caption="EACH COLUMN IS FIFTY POINTS OF HUMAN VALUE. DASHED LINES ARE THE TIER CUTOFFS IN FORCE TODAY.">
      <div ref={box} className="hvi-an-chart">
        {w > 0 && (
          <svg width={w} height={H} role="group" aria-label="Score histogram, buckets of 50">
            <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
            <text x={pad.l - 6} y={pad.t + 4} textAnchor="end" className="ax">{ymax}</text>
            <text x={pad.l - 6} y={pad.t + ih} textAnchor="end" className="ax">0</text>
            {[0, 500, 1000].map(v => <text key={v} x={x(v)} y={H - 6} textAnchor={v === 0 ? "start" : v === 1000 ? "end" : "middle"} className="ax">{v}</text>)}
            {b.map(k => k.count > 0 && (
              <g key={k.lo} {...markProps(tip, [`${k.lo}–${k.hi}`, `${k.count} SUBJECTS`, getTier(k.lo).label])}>
                <rect x={x(k.lo) + 1} y={y(k.count)} width={Math.max(1, bw - 2)} height={pad.t + ih - y(k.count)} rx={Math.min(3, bw / 4)} fill={MARK} />
                <rect x={x(k.lo)} y={pad.t} width={bw} height={ih} fill="transparent" />
              </g>
            ))}
            {markers.map((m, i) => (
              <g key={m.label} aria-hidden="true">
                <line x1={x(m.min)} x2={x(m.min)} y1={pad.t - 4} y2={pad.t + ih} stroke="var(--fg-mute)" strokeDasharray="3 3" />
                <text x={x(m.min)} y={pad.t - 10} textAnchor="middle" className="mk">{m.icon}{m.min}</text>
              </g>
            ))}
          </svg>
        )}
        {tip.node}
      </div>
      <Table caption="Subjects per 50-point bucket" head={["BUCKET", "N"]} rows={b.map(k => [`${k.lo}–${k.hi}`, k.count])} />
    </Section>
  );
}

function QuadrantShare({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const parts = quadrantShare(subjects).map(p => ({ ...p, color: Q_COLOR[p.label] }));
  return (
    <Section title="QUADRANT SHARE" meta="WARMTH × COMPETENCE" caption="WHERE THE MACHINE PLACES THEM. ADMIRED IS THE CROWDED END; THE DEPARTMENT IS SUSPICIOUS OF CROWDS.">
      <div ref={box} className="hvi-an-chart">
        <Stacked parts={parts} tip={tip} label="Quadrant share" />
        {tip.node}
      </div>
      <Table caption="Subjects per quadrant" head={["QUADRANT", "N", "SHARE"]} rows={parts.map(p => [p.label, p.count, pct(p.pct)])} />
    </Section>
  );
}

function Profile({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const groups = useMemo(() => {
    const out = [{ id: "ALL", label: "ALL", pick: () => true }];
    const byDomain = groupAverages(subjects, domainOf, 3).rows.map(r => r.label);
    for (const d of byDomain) out.push({ id: `d:${d}`, label: d, pick: s => domainOf(s) === d });
    for (const t of tierCounts(subjects)) if (t.count >= 3) out.push({ id: `t:${t.label}`, label: t.label.split(" ")[0], pick: s => getTier(s.score).label === t.label });
    return out;
  }, [subjects]);
  const [sel, setSel] = useState("ALL");
  const g = groups.find(x => x.id === sel) || groups[0];
  const all = categoryProfile(subjects);
  const sub = g.id === "ALL" ? all : categoryProfile(subjects.filter(g.pick));
  const n = g.id === "ALL" ? subjects.length : subjects.filter(g.pick).length;
  return (
    <Section title="CATEGORY PROFILE" meta={`${g.label} · N ${n}`} caption="MEAN OF EACH CATEGORY, ASSESSED FILES ONLY. THREAT AND REDUNDANCY: LOWER IS BETTER.">
      <ChipStrip label="Compare a group with everyone">
        {groups.map(x => <Chip key={x.id} pressed={x.id === sel} onClick={() => setSel(x.id)}>{x.label}</Chip>)}
      </ChipStrip>
      {g.id !== "ALL" && <div className="hvi-an-key"><span className="sw" style={{ background: MARK }} />{g.label} <span className="refk" aria-hidden="true" />ALL</div>}
      <div ref={box} className="hvi-an-chart">
        <HBars tip={tip} max={100} reference={g.id !== "ALL"} rows={DIMS.map((d, i) => ({
          label: DIM_LABEL[d] + (sub[i].lowerIsBetter ? " ↓" : ""), value: sub[i].mean || 0, ref: all[i].mean,
          text: r0(sub[i].mean),
          lines: [DIM_LABEL[d], `${g.label}: ${r0(sub[i].mean)} (N ${sub[i].n})`, ...(g.id !== "ALL" ? [`ALL: ${r0(all[i].mean)} (N ${all[i].n})`] : [])],
        }))} />
        {tip.node}
      </div>
      <Table caption={`Mean per category, ${g.label}`} head={["CATEGORY", g.label, "N", ...(g.id !== "ALL" ? ["ALL"] : [])]}
        rows={DIMS.map((d, i) => [DIM_LABEL[d], r0(sub[i].mean), sub[i].n, ...(g.id !== "ALL" ? [r0(all[i].mean)] : [])])} />
    </Section>
  );
}

function Scatter({ subjects }) {
  const box = useRef(null); const tip = useTip(box); const w = useWidth(box);
  const pts = scatterPoints(subjects);
  const size = Math.min(w, 460), pad = 30;
  const inner = Math.max(0, size - pad * 2);
  const sx = v => pad + (v / 100) * inner, sy = v => pad + inner - (v / 100) * inner;
  const cut = CAL.cut ?? 50;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect(); const b = box.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 196;
    for (const p of pts) { const d = (sx(p.x) - mx) ** 2 + (sy(p.y) - my) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) return tip.hide();
    tip.showAt(r.left - b.left + sx(best.x), r.top - b.top + sy(best.y) - 6, [displayName(best), `WARMTH ${best.x} · COMPETENCE ${best.y}`, `${best.quadrant} · ${best.score}`]);
  };
  return (
    <Section title="WARMTH × COMPETENCE" meta={`N ${pts.length}`} caption="EACH DOT IS A FILE. THE CROSS SITS AT THE CUT. POSITION IS THE QUADRANT; COLOUR ONLY REPEATS IT.">
      <div ref={box} className="hvi-an-chart">
        {size > 0 && (
          <svg width={size} height={size} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={tip.hide}
            role="img" aria-label={`Scatter of ${pts.length} subjects by warmth and competence; see the table view for values`}>
            <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="var(--line)" />
            <line x1={sx(cut)} x2={sx(cut)} y1={pad} y2={pad + inner} stroke="var(--line-hi)" />
            <line x1={pad} x2={pad + inner} y1={sy(cut)} y2={sy(cut)} stroke="var(--line-hi)" />
            <text x={pad + inner - 4} y={pad + 14} textAnchor="end" className="ql">ADMIRED</text>
            <text x={pad + 4} y={pad + 14} className="ql">ENVIED</text>
            <text x={pad + inner - 4} y={pad + inner - 6} textAnchor="end" className="ql">TRUSTED RESERVE</text>
            <text x={pad + 4} y={pad + inner - 6} className="ql">DISMISSED</text>
            <text x={pad + inner / 2} y={size - 8} textAnchor="middle" className="ax">WARMTH →</text>
            <text x={12} y={pad + inner / 2} textAnchor="middle" className="ax" transform={`rotate(-90 12 ${pad + inner / 2})`}>COMPETENCE →</text>
            {pts.map(p => <circle key={p.name} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={Q_COLOR[p.quadrant] || Q_COLOR.UNPLACED} stroke="var(--bg)" strokeWidth={2} />)}
          </svg>
        )}
        {tip.node}
      </div>
      <Table caption="Warmth and competence per subject" head={["SUBJECT", "WARMTH", "COMPETENCE", "QUADRANT"]}
        rows={[...pts].sort((a, b) => b.y - a.y).map(p => [displayName(p), p.x, p.y, p.quadrant])} />
    </Section>
  );
}

function GroupChart({ subjects, title, keyFn, caption, noun }) {
  const box = useRef(null); const tip = useTip(box);
  const { rows, held, unknown } = groupAverages(subjects, keyFn, 3);
  const all = mean(subjects.map(s => s.score));
  return (
    <Section title={title} meta={`MEAN ${r0(all)}`} caption={caption}>
      <div ref={box} className="hvi-an-chart">
        {rows.length === 0
          ? <p className="hvi-an-empty">NOT ENOUGH FILES PER {noun} YET. THE DEPARTMENT REQUIRES THREE BEFORE IT GENERALISES.</p>
          : <HBars tip={tip} max={1000} reference rows={rows.map(r => ({
              label: `${r.label} (${r.n})`, value: r.mean, ref: all, text: r0(r.mean),
              lines: [r.label, `MEAN ${r0(r.mean)} · N ${r.n}`, `ALL ${r0(all)}`],
            }))} />}
        {tip.node}
      </div>
      {(held > 0 || unknown > 0) && <p className="hvi-an-note">{held ? `${held} IN GROUPS UNDER 3 NOT SHOWN. ` : ""}{unknown ? `${unknown} WITHOUT ${/^[AEIOU]/.test(noun) ? "AN" : "A"} ${noun} ON RECORD.` : ""}</p>}
      <Table caption={`Mean score per ${noun.toLowerCase()}`} head={[noun, "N", "MEAN"]} rows={rows.map(r => [r.label, r.n, r0(r.mean)])} />
    </Section>
  );
}

function Coverage({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const c = coverage(subjects);
  const source = [
    { label: "ON FILE FROM THE START", count: c.record, color: Q_COLOR.ADMIRED },
    { label: "REFERRED BY THE PUBLIC", count: c.referral, color: Q_COLOR["TRUSTED RESERVE"] },
    { label: "DRAWN BY THE DEPARTMENT", count: c.engine, color: Q_COLOR.UNPLACED },
  ];
  const people = [
    { label: "RATED BY THE PEOPLE", count: c.rated, color: Q_COLOR["TRUSTED RESERVE"] },
    { label: "NOT YET ASKED", count: c.unrated, color: Q_COLOR.UNPLACED },
  ];
  return (
    <Section title="COVERAGE" meta={`N ${c.n}`} caption="MOST FILES WERE OPENED BY SOMEONE ELSE. THE PEOPLE HAVE BEEN CONSULTED ON FEW OF THEM.">
      <div ref={box} className="hvi-an-chart">
        <div className="hvi-an-sub">HOW THEY ARRIVED</div>
        <Stacked parts={source} tip={tip} label="How subjects arrived on file" />
        <div className="hvi-an-sub">PEOPLE JUDGE COVERAGE</div>
        <Stacked parts={people} tip={tip} label="People judge coverage" />
        {tip.node}
      </div>
      <Table caption="Coverage" head={["MEASURE", "N", "SHARE"]}
        rows={[...source, ...people].map(p => [p.label, p.count, pct(c.n ? p.count / c.n : 0)])} />
    </Section>
  );
}

function Extremes({ subjects }) {
  const { top, bottom, n } = topBottom(subjects, 10);
  const List = ({ rows, title }) => (
    <div className="hvi-an-list">
      <div className="hvi-an-sub">{title}</div>
      <ol>{rows.map((s, i) => (
        <li key={s.name}><span className="rk">{String(i + 1).padStart(2, " ")}. </span><span className="nm">{displayName(s)}</span><span className="dots" aria-hidden="true" /><span className="sc" style={{ color: getTier(s.score).color }}>{String(s.score).padStart(3, " ")}</span></li>
      ))}</ol>
    </div>
  );
  if (n < 2) return null;
  return (
    <Section title="THE EXTREMES" meta={`TOP & BOTTOM ${Math.min(10, n)}`} caption="THE DEPARTMENT DOES NOT PLAY FAVOURITES. IT KEEPS A LIST OF THEM.">
      <div className="hvi-an-lists">
        <List rows={top} title="HIGHEST VALUE" />
        <List rows={bottom} title="LOWEST VALUE" />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
export default function Analytics({ figures }) {
  const [pen, setPen] = useState(null);
  useEffect(() => {
    let off = false;
    fetch("/api/pen").then(r => (r.ok ? r.json() : null)).then(d => { if (!off) setPen(d?.subjects || []); }).catch(() => { if (!off) setPen([]); });
    return () => { off = true; };
  }, []);
  const subjects = useMemo(() => mergeRoster(figures, pen || []), [figures, pen]);
  const bySource = useMemo(() => {
    const c = { record: 0, referral: 0, engine: 0 };
    for (const s of subjects) c[s.source] = (c[s.source] || 0) + 1;
    return c;
  }, [subjects]);
  return (
    <div className="hvi-an">
      <div className="hvi-fi-count" aria-live="polite">
        {subjects.length} SUBJECTS // {bySource.record} ON RECORD · {bySource.referral} REFERRED · {bySource.engine} DRAFTED
        {pen === null ? " // [ .. ] PULLING REFERRALS █" : ""}
      </div>
      <TierChart subjects={subjects} />
      <Histogram subjects={subjects} />
      <QuadrantShare subjects={subjects} />
      <Profile subjects={subjects} />
      <Scatter subjects={subjects} />
      <GroupChart subjects={subjects} title="VALUE BY FIELD" keyFn={domainOf} noun="FIELD"
        caption="MEAN SCORE PER FIELD OF ENDEAVOUR. THE LINE IS THE MEAN OF EVERYONE." />
      <GroupChart subjects={subjects} title="VALUE BY ERA" keyFn={eraOf} noun="ERA"
        caption="MEAN SCORE BY BIRTH ERA. ANTIQUITY IS JUDGED ON WHAT SURVIVED OF IT." />
      <Coverage subjects={subjects} />
      <Extremes subjects={subjects} />
    </div>
  );
}
