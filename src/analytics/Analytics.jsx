// THE NUMBERS: the data desk of the Public Figure Index (method v4, docs/design/SCALE.md §3).
// Lazy-loaded from FigureIndex.jsx. Every chart is computed from the live roster (figures.js +
// /api/pen figures) and every cutoff and centre from calibration.json, so it grows and re-tunes
// without edits here. Five tabs: WORTH (the ladder), SECTIONS (the nine dimensions), THE CUBE
// (cubrants), THE PLANET (region × tier), OVER TIME (the ladder as the weekly runs record it).
// Forms (dataviz procedure): magnitude -> bars in one hue; part-to-whole -> 100% stacked bar;
// distribution -> histogram from zero with n; relationship -> scatter / shaded grid with the
// value printed. Every chart has a tooltip, direct labels, an aria-label with N, and a table.

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CAL from "../../netlify/lib/calibration.json" with { type: "json" };
import { fetchPen } from "../penClient.js";
import { displayName, getTier, TIERS, LADDER_VERSION } from "../figures.js";
import { CENTRE, CUBRANT_LINES, SCARCITY_AXIS, WARMTH_AXIS, COMPETENCE_AXIS } from "../cube.js";
import { pointOf } from "../cube3d.js";
import { CubrantLegend } from "../CubePanel.jsx";
import Sparkline from "../ui/Sparkline.jsx";
import { Chip, ChipStrip, Disclosure, Frame } from "../ui/index.js";
import {
  mergeRoster, tierCounts, histogram, tierMarkers, quadrantShare, categoryProfile, eraOf, domainOf,
  groupAverages, coverage, topBottom, scatterPoints, DIMS, mean,
  dimHistograms, cubrantCounts, correlationMatrix, regionTierCrosstab, ladderShares,
} from "./aggregate.js";
import { regionOf, countryOf, representation, REGIONS } from "../origin.js";
import "./analytics.css";

const Cube3D = lazy(() => import("../Cube3D.jsx"));

// Marks: validated for the #0a0f0a surface (L 0.48-0.67, adjacent CVD >= 6 with direct
// labels + 2px gaps, normal-vision >= 15). Order is fixed; colour follows the family.
const Q_COLOR = { ADMIRED: "#26a65b", ENVIED: "#c98500", "TRUSTED RESERVE": "#3c8fd6", DISMISSED: "#e46262", UNPLACED: "#4b7c5e" };
const FAM_COLOR = { good: "#26a65b", charm: "#c98500", harm: "#e46262", dim: "#4b7c5e", pending: "#3c8fd6" };
const MARK = "#26a65b";

const pct = (x) => `${Math.round(x * 100)}%`;
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
const r0 = (x) => (x === null || x === undefined ? "—" : Math.round(x));
const DIM_LABEL = { care: "CARE", alignment: "ALIGNMENT", utility: "UTILITY", adaptability: "ADAPTABILITY", legacy: "LEGACY", network: "NETWORK", physical: "PHYSICAL", threat: "THREAT", redundancy: "REDUNDANCY" };
const short = (label) => label.split(" ")[0];

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

function Table({ caption, head, rows, open = false }) {
  return (
    <Disclosure title="TABLE VIEW" className="hvi-an-table" defaultOpen={open}>
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

// Horizontal bars in one hue, value labelled at the end. rows: {label, value, text, lines, lead?, band?: [lo, hi] on the same scale}
function HBars({ rows, max, color = MARK, tip, reference }) {
  const m = max || Math.max(1, ...rows.map(r => Math.max(r.value || 0, r.band ? r.band[1] : 0)));
  return (
    <div className="hvi-an-hbars" role="list">
      {rows.map(r => (
        <div key={r.label} className="hvi-an-hrow" role="listitem">
          <span className="lab">{r.lead}{r.label}</span>
          <span className="track" {...markProps(tip, r.lines)}>
            {r.band && <span className="band" style={{ left: `${(r.band[0] / m) * 100}%`, width: `${((r.band[1] - r.band[0]) / m) * 100}%` }} aria-hidden="true" />}
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
// WORTH

function TierChart({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const rows = tierCounts(subjects);
  const shares = ladderShares(subjects);
  const outside = shares.filter(r => !r.inside);
  const top = rows[0];
  const caption = `${TIERS.length} RUNGS, CUT AT FIXED SCORES (LADDER V${LADDER_VERSION}). THE BRACKET BEHIND EACH BAR IS THE SHARE OF THE UNGATED FILE THE DEPARTMENT EXPECTS THAT RUNG TO HOLD; ` +
    (outside.length ? `${outside.map(r => short(r.label)).join(", ")} ${outside.length === 1 ? "SITS" : "SIT"} OUTSIDE. TWO WEEKLY RUNS OUTSIDE AND A CUT MOVE IS PROPOSED, NEVER APPLIED.` : "EVERY RUNG SITS INSIDE ITS BRACKET TODAY.") +
    (top.count <= Math.max(2, subjects.length * 0.015) ? " THE DEPARTMENT NOTES A SHORTAGE OF ESSENTIAL INFRASTRUCTURE." : "");
  const m = Math.max(...shares.map(r => Math.max(r.share, r.band ? r.band[1] : 0)), 0.01);
  return (
    <Section title="DISTRIBUTION OF WORTH" meta={`N ${subjects.length} · UNGATED ${shares.reduce((a, r) => a + r.count, 0)}`} caption={caption}>
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`Subjects per tier, ${subjects.length} files`}>
        <HBars tip={tip} max={m} rows={shares.map(t => ({
          label: t.label, value: t.share, text: `${t.count} · ${pct1(t.share)}`, band: t.band,
          color: t.inside ? MARK : Q_COLOR.ENVIED,
          lead: <span className="ico" style={{ color: t.color }} aria-hidden="true">{t.icon} </span>,
          lines: [t.label, `${t.count} UNGATED FILES · ${pct1(t.share)}`, `FROM ${t.min}`, t.band ? `GUIDANCE ${pct(t.band[0])}–${pct(t.band[1])} · ${t.inside ? "INSIDE" : "OUTSIDE"}` : "NO BAND"],
        }))} />
        {tip.node}
      </div>
      <Table caption="Subjects per tier (all files, and the ungated share against its guidance band)" head={["TIER", "FROM", "N", "SHARE", "UNGATED N", "UNGATED SHARE", "BAND"]}
        rows={rows.map((t, i) => [t.label, t.min, t.count, pct1(t.pct), shares[i].count, pct1(shares[i].share), shares[i].band ? `${pct(shares[i].band[0])}–${pct(shares[i].band[1])}` : "—"])} />
    </Section>
  );
}

function Histogram({ subjects }) {
  const box = useRef(null); const tip = useTip(box); const w = useWidth(box);
  const b = histogram(subjects, 50);
  const markers = tierMarkers();
  const H = 200, pad = { l: 28, r: 8, t: 30, b: 22 };
  const iw = Math.max(0, w - pad.l - pad.r), ih = H - pad.t - pad.b;
  const ymax = Math.max(1, ...b.map(x => x.count));
  const x = v => pad.l + (v / 1000) * iw, y = v => pad.t + ih - (v / ymax) * ih;
  const bw = iw / b.length;
  const gated = subjects.filter(s => s.score < 100).length;
  return (
    <Section title="SCORE HISTOGRAM" meta={`N ${subjects.length} · BUCKETS OF 50`} caption={`EACH COLUMN IS FIFTY POINTS OF HUMAN VALUE, FROM ZERO. DASHED LINES ARE THE ${markers.length} CUTS IN FORCE TODAY. THE SPIKE AT 0–99 IS THE HARM GATE (${gated} FILES), NOT A TAIL.`}>
      <div ref={box} className="hvi-an-chart">
        {w > 0 && (
          <svg width={w} height={H} role="group" aria-label={`Score histogram, buckets of 50, ${subjects.length} files`}>
            <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
            <text x={pad.l - 6} y={pad.t + 4} textAnchor="end" className="ax">{ymax}</text>
            <text x={pad.l - 6} y={pad.t + ih} textAnchor="end" className="ax">0</text>
            {[0, 500, 1000].map(v => <text key={v} x={x(v)} y={H - 6} textAnchor={v === 0 ? "start" : v === 1000 ? "end" : "middle"} className="ax">{v}</text>)}
            {b.map(k => k.count > 0 && (
              <g key={k.lo} {...markProps(tip, [`${k.lo}–${k.hi}`, `${k.count} SUBJECTS`, getTier(k.lo).label])}>
                <rect x={x(k.lo) + 1} y={y(k.count)} width={Math.max(1, bw - 2)} height={pad.t + ih - y(k.count)} fill={k.lo < 100 ? Q_COLOR.DISMISSED : MARK} />
                <rect x={x(k.lo)} y={pad.t} width={bw} height={ih} fill="transparent" />
              </g>
            ))}
            {markers.map((m, i) => (
              <g key={m.label} aria-hidden="true">
                <line x1={x(m.min)} x2={x(m.min)} y1={pad.t - 4} y2={pad.t + ih} stroke="var(--fg-mute)" strokeDasharray="3 3" />
                <text x={x(m.min)} y={pad.t - 10 - (i % 2) * 10} textAnchor="middle" className="mk">{m.icon}{m.min}</text>
              </g>
            ))}
          </svg>
        )}
        {tip.node}
      </div>
      <Table caption="Subjects per 50-point bucket" head={["BUCKET", "N", "TIER AT ITS FLOOR"]} rows={b.map(k => [`${k.lo}–${k.hi}`, k.count, getTier(k.lo).label])} />
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
// SECTIONS

const WEIGHT_OF = (d) => (WARMTH_AXIS[d] != null ? WARMTH_AXIS[d] * (1 - CAL.realityIndex) : (COMPETENCE_AXIS[d] || 0) * CAL.realityIndex);

function DimensionGrid({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const hs = dimHistograms(subjects, 5);
  const ymax = Math.max(1, ...hs.map(h => h.max));   // one shared y scale, so the panels compare
  const W = 160, H = 64, pad = { l: 2, r: 2, t: 6, b: 12 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / 20;
  return (
    <Section title="THE NINE SECTIONS" meta={`N ${subjects.length} · BINS OF 5 · ONE Y SCALE`}
      caption="EACH PANEL IS ONE SECTION OF THE FILE, 0 TO 100, FROM ZERO. THE TICK IS ITS MEDIAN. SHARED Y SCALE: A TALL PANEL IS A SECTION THE ENGINE RATES ALIKE FOR EVERYONE. ↓ LOWER IS BETTER. THE WEIGHT IS THE SECTION'S SHARE OF THE SCORE.">
      <div ref={box} className="hvi-an-chart">
        <div className="hvi-an-grid9" role="list" aria-label={`Nine section histograms, ${subjects.length} files`}>
          {hs.map(h => (
            <div key={h.dim} className="hvi-an-panel" role="listitem">
              <div className="hvi-an-panel-head"><span>{DIM_LABEL[h.dim]}{h.lowerIsBetter ? " ↓" : ""}</span><span className="dim">MED {r0(h.median)} · W {WEIGHT_OF(h.dim).toFixed(2)}</span></div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${DIM_LABEL[h.dim]}: median ${r0(h.median)}, mean ${r0(h.mean)}, ${h.n} assessed`}>
                <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
                {h.bins.map((b, i) => b.count > 0 && (
                  <g key={b.lo} {...markProps(tip, [`${DIM_LABEL[h.dim]} ${b.lo}–${b.hi}`, `${b.count} FILES`])}>
                    <rect x={pad.l + i * bw + 0.5} y={pad.t + ih - (b.count / ymax) * ih} width={Math.max(1, bw - 1)} height={(b.count / ymax) * ih} fill={MARK} />
                  </g>
                ))}
                {h.median != null && <line x1={pad.l + (h.median / 100) * iw} x2={pad.l + (h.median / 100) * iw} y1={pad.t - 2} y2={pad.t + ih + 2} stroke="var(--fg)" strokeWidth={1.5} />}
                {[0, 50, 100].map(v => <text key={v} x={pad.l + (v / 100) * iw} y={H - 2} textAnchor={v === 0 ? "start" : v === 100 ? "end" : "middle"} className="ax">{v}</text>)}
              </svg>
            </div>
          ))}
        </div>
        {tip.node}
      </div>
      <Table caption="Each section: assessed files, median, mean, weight in the score" head={["SECTION", "N", "MEDIAN", "MEAN", "WEIGHT", "LOWER IS BETTER"]}
        rows={hs.map(h => [DIM_LABEL[h.dim], h.n, r0(h.median), r0(h.mean), WEIGHT_OF(h.dim).toFixed(3), h.lowerIsBetter ? "YES" : "NO"])} />
    </Section>
  );
}

function Profile({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const groups = useMemo(() => {
    const out = [{ id: "ALL", label: "ALL", pick: () => true }];
    const byDomain = groupAverages(subjects, domainOf, 3).rows.map(r => r.label);
    for (const d of byDomain) out.push({ id: `d:${d}`, label: d, pick: s => domainOf(s) === d });
    for (const t of tierCounts(subjects)) if (t.count >= 3) out.push({ id: `t:${t.label}`, label: short(t.label), pick: s => getTier(s.score).label === t.label });
    return out;
  }, [subjects]);
  const [sel, setSel] = useState("ALL");
  const g = groups.find(x => x.id === sel) || groups[0];
  const all = categoryProfile(subjects);
  const sub = g.id === "ALL" ? all : categoryProfile(subjects.filter(g.pick));
  const n = g.id === "ALL" ? subjects.length : subjects.filter(g.pick).length;
  return (
    <Section title="CATEGORY PROFILE" meta={`${g.label} · N ${n}`} caption="MEAN OF EACH SECTION, ASSESSED FILES ONLY, FROM ZERO TO 100. THREAT AND REDUNDANCY: LOWER IS BETTER.">
      <ChipStrip label="Compare a group with everyone">
        {groups.map(x => <Chip key={x.id} pressed={x.id === sel} onClick={() => setSel(x.id)}>{x.label}</Chip>)}
      </ChipStrip>
      {g.id !== "ALL" && <div className="hvi-an-key"><span className="sw" style={{ background: MARK }} />{g.label} <span className="refk" aria-hidden="true" />ALL</div>}
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`Mean per section for ${g.label}, ${n} files`}>
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

function Correlations({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const { dims, r, n } = correlationMatrix(subjects);
  const shade = (v) => (v == null ? "transparent" : v >= 0 ? `rgba(38,166,91,${(0.08 + 0.72 * Math.abs(v)).toFixed(2)})` : `rgba(228,98,98,${(0.08 + 0.72 * Math.abs(v)).toFixed(2)})`);
  return (
    <Section title="HOW THE SECTIONS MOVE TOGETHER" meta={`PEARSON r · N ${n} FULL FILES`}
      caption="EACH CELL IS THE CORRELATION OF TWO SECTIONS ACROSS THE FILE: GREEN TOGETHER, RED APART, DARKER IS STRONGER, THE VALUE PRINTED. CARE AND ALIGNMENT ARE NEARLY ONE SECTION; THREAT RUNS AGAINST BOTH. CORRELATION IS NOT EVIDENCE OF SEPARATE THINGS.">
      <div ref={box} className="hvi-an-chart">
        <div className="hvi-an-corr" role="grid" aria-label={`Correlation grid of the nine sections over ${n} files`} style={{ gridTemplateColumns: `6ch repeat(${dims.length}, minmax(0, 1fr))` }}>
          <div className="hd" role="columnheader" />
          {dims.map(d => <div key={d} className="hd" role="columnheader" title={DIM_LABEL[d]}>{DIM_LABEL[d].slice(0, 4)}</div>)}
          {dims.map((d, i) => (
            <div key={d} className="row" role="row" style={{ display: "contents" }}>
              <div className="hd" role="rowheader" title={DIM_LABEL[d]}>{DIM_LABEL[d].slice(0, 5)}</div>
              {dims.map((e, j) => (
                <div key={e} role="gridcell" className={`cell${i === j ? " diag" : ""}`} style={{ background: shade(r[i][j]) }}
                  {...markProps(tip, [`${DIM_LABEL[d]} × ${DIM_LABEL[e]}`, `r = ${r[i][j] == null ? "—" : r[i][j].toFixed(2)}`])}>
                  {r[i][j] == null ? "—" : r[i][j].toFixed(2).replace(/^(-?)0\./, "$1.")}
                </div>
              ))}
            </div>
          ))}
        </div>
        {tip.node}
      </div>
      <Table caption="Pearson correlation between sections" head={["SECTION", ...dims.map(d => DIM_LABEL[d].slice(0, 5))]}
        rows={dims.map((d, i) => [DIM_LABEL[d], ...r[i].map(v => (v == null ? "—" : v.toFixed(2)))])} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// THE CUBE

function CubeTab({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const occ = cubrantCounts(subjects);
  const pts = useMemo(() => subjects.map(pointOf).filter(Boolean), [subjects]);
  const [filter, setFilter] = useState("ALL");
  const shown = filter === "ALL" ? pts : pts.filter(p => p.cubrant === filter);
  const biggest = [...occ.rows].sort((a, b) => b.count - a.count)[0];
  const fmtW = (w) => Object.entries(w).map(([d, x]) => `${d === "redundancy" || d === "threat" ? `(100−${DIM_LABEL[d]})` : DIM_LABEL[d]} ×${x}`).join(" + ");
  return (
    <>
      <Section title="THE CUBE" meta={`${pts.length} PLACED · CENTRES ${CENTRE.conduct} / ${CENTRE.competence} / ${CENTRE.scarcity}`}
        caption={`EVERY FILE AS ONE POINT: CONDUCT × COMPETENCE × SCARCITY, THE MACHINE'S THREE AXES. THE PLANES SIT AT THE FILE'S MEDIANS (METHOD V4, FROZEN IN CALIBRATION) AND CUT IT INTO EIGHT CUBRANTS, SHADED BY FAMILY. DRAG TO TURN. ${biggest ? `THE BIGGEST CELL, ${biggest.label}, HOLDS ${pct1(biggest.pct)}; WITH CONDUCT AND COMPETENCE CORRELATED AT ABOUT 0.8 THE DIAGONAL CELLS CANNOT GET MUCH SMALLER WITHOUT INVENTING AXES NOBODY CAN RECOMPUTE.` : ""}`}>
        <ChipStrip label="Filter the cube by cubrant">
          <Chip pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>ALL {pts.length}</Chip>
          {occ.rows.map(r => <Chip key={r.label} pressed={filter === r.label} onClick={() => setFilter(r.label)} tone={r.family === "good" ? "accent" : r.family === "charm" ? "warn" : r.family === "harm" ? "harm" : "mute"}>{r.label} {r.count}</Chip>)}
        </ChipStrip>
        <div className="hvi-an-chart hvi-an-cube">
          <Suspense fallback={<div className="hvi-cube-wait" style={{ height: 420 }} role="status">[ .. ] ASSEMBLING THE CUBE █</div>}>
            <Cube3D points={shown} height={520} label={`Cubrant cube with ${shown.length} of ${pts.length} files. ${occ.rows.map(r => `${r.label} ${r.count}`).join(", ")}; ${occ.pending} pending. The table below lists the counts.`} />
          </Suspense>
          <CubrantLegend />
        </div>
        <Table caption="Where the file sits in the cube" head={["CUBRANT", "SIGNS (CONDUCT · COMPETENCE · SCARCITY)", "N", "SHARE", "LINE"]} open
          rows={[...occ.rows.map(r => [r.label, ["+++", "++−", "+−+", "+−−", "−++", "−+−", "−−+", "−−−"][occ.rows.indexOf(r)], r.count, pct1(r.pct), CUBRANT_LINES[r.label]]), ["PENDING THE THIRD AXIS", "—", occ.pending, pct1(occ.n ? occ.pending / occ.n : 0), "The scarcity axis is read at the next assessment."]]} />
      </Section>
      <Section title="CUBRANT OCCUPANCY" meta={`N ${occ.n}`} caption={`WHERE THE FILE SITS, AS SHARES. THE AXES: CONDUCT = ${fmtW(WARMTH_AXIS)}; COMPETENCE = ${fmtW(COMPETENCE_AXIS)}; SCARCITY = ${fmtW(SCARCITY_AXIS)}. SCARCITY REUSES TWO SECTIONS THAT SIT IN COMPETENCE AT SMALL WEIGHTS; IT NEVER MOVES THE SCORE.`}>
        <div ref={box} className="hvi-an-chart" role="group" aria-label={`Cubrant occupancy, ${occ.n} files`}>
          <Stacked tip={tip} label="Cubrant occupancy" parts={[...occ.rows.map(r => ({ label: r.label, count: r.count, color: FAM_COLOR[r.family] })), { label: "PENDING", count: occ.pending, color: FAM_COLOR.pending }]} />
          {tip.node}
        </div>
        <Table caption="Cubrant occupancy" head={["CUBRANT", "FAMILY", "N", "SHARE"]} rows={[...occ.rows.map(r => [r.label, r.family.toUpperCase(), r.count, pct1(r.pct)]), ["PENDING", "—", occ.pending, pct1(occ.n ? occ.pending / occ.n : 0)]]} />
      </Section>
    </>
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
    tip.showAt(r.left - b.left + sx(best.x), r.top - b.top + sy(best.y) - 6, [displayName(best), `CONDUCT ${best.x} · COMPETENCE ${best.y}`, `${best.quadrant} · ${best.score}`]);
  };
  return (
    <Section title="CONDUCT × COMPETENCE (SCM)" meta={`N ${pts.length}`} caption={`EACH DOT IS A FILE. THE SOLID CROSS IS THE ABSOLUTE TRUST LINE AT ${cut}, WHERE THE PEOPLE'S JUDGE IS HEARD; THE DASHED CROSS IS THE FILE'S MIDDLE (${CENTRE.conduct}, ${CENTRE.competence}), WHERE THE CUBRANTS SPLIT. MOST OF THE FILE SITS ABOVE BOTH LINES: IT IS A FILE OF ACHIEVERS.`}>
      <div ref={box} className="hvi-an-chart">
        {size > 0 && (
          <svg width={size} height={size} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={tip.hide}
            role="img" aria-label={`Scatter of ${pts.length} subjects by conduct and competence; see the table view for values`}>
            <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="var(--line)" />
            <line x1={sx(cut)} x2={sx(cut)} y1={pad} y2={pad + inner} stroke="var(--line-hi)" />
            <line x1={pad} x2={pad + inner} y1={sy(cut)} y2={sy(cut)} stroke="var(--line-hi)" />
            <line x1={sx(CENTRE.conduct)} x2={sx(CENTRE.conduct)} y1={pad} y2={pad + inner} stroke="var(--fg-mute)" strokeDasharray="3 3" />
            <line x1={pad} x2={pad + inner} y1={sy(CENTRE.competence)} y2={sy(CENTRE.competence)} stroke="var(--fg-mute)" strokeDasharray="3 3" />
            <text x={pad + inner - 4} y={pad + 14} textAnchor="end" className="ql">ADMIRED</text>
            <text x={pad + 4} y={pad + 14} className="ql">ENVIED</text>
            <text x={pad + inner - 4} y={pad + inner - 6} textAnchor="end" className="ql">TRUSTED RESERVE</text>
            <text x={pad + 4} y={pad + inner - 6} className="ql">DISMISSED</text>
            <text x={pad + inner / 2} y={size - 8} textAnchor="middle" className="ax">CONDUCT →</text>
            <text x={12} y={pad + inner / 2} textAnchor="middle" className="ax" transform={`rotate(-90 12 ${pad + inner / 2})`}>COMPETENCE →</text>
            {pts.map(p => <circle key={p.name} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={Q_COLOR[p.quadrant] || Q_COLOR.UNPLACED} stroke="var(--bg)" strokeWidth={2} />)}
          </svg>
        )}
        {tip.node}
      </div>
      <Table caption="Conduct and competence per subject" head={["SUBJECT", "CONDUCT", "COMPETENCE", "SCM QUADRANT"]}
        rows={[...pts].sort((a, b) => b.y - a.y).map(p => [displayName(p), p.x, p.y, p.quadrant])} />
    </Section>
  );
}

function QuadrantShare({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const parts = quadrantShare(subjects).map(p => ({ ...p, color: Q_COLOR[p.label] }));
  return (
    <Section title="SCM QUADRANT SHARE" meta="CONDUCT × COMPETENCE AT 50" caption="THE ABSOLUTE READING THE PEOPLE'S JUDGE USES. CROWDED AT ADMIRED, WHICH IS WHY THE CUBRANTS SPLIT AT THE FILE'S MIDDLE INSTEAD.">
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`Quadrant share, ${subjects.length} files`}>
        <Stacked parts={parts} tip={tip} label="Quadrant share" />
        {tip.node}
      </div>
      <Table caption="Subjects per quadrant" head={["QUADRANT", "N", "SHARE"]} rows={parts.map(p => [p.label, p.count, pct1(p.pct)])} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// THE PLANET

function RegionTier({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const { tiers, rows, total, n } = regionTierCrosstab(subjects);
  const shade = (v) => `rgba(38,166,91,${(0.05 + 0.8 * Math.min(1, v * 1.6)).toFixed(2)})`;
  return (
    <Section title="REGION × TIER" meta={`N ${n} · ${rows.length} REGIONS`}
      caption="EACH CELL IS THE NUMBER OF FILES FROM THAT BIRTH REGION ON THAT RUNG; THE SHADE IS THE SHARE OF THE REGION'S OWN FILES (ROWS, NOT COLUMNS). SMALL REGIONS ARE NOISE AND THE DEPARTMENT KNOWS IT: READ THE N FIRST.">
      <div ref={box} className="hvi-an-chart">
        <div className="hvi-an-xtab" role="grid" aria-label={`Region by tier crosstab, ${n} files`} style={{ gridTemplateColumns: `minmax(9ch, 14ch) 4ch repeat(${tiers.length}, minmax(0, 1fr))` }}>
          <div className="hd" role="columnheader">REGION</div><div className="hd" role="columnheader">N</div>
          {tiers.map(t => <div key={t} className="hd" role="columnheader" title={t}>{short(t).slice(0, 4)}</div>)}
          {rows.map(r => (
            <div key={r.region} role="row" style={{ display: "contents" }}>
              <div className="hd" role="rowheader">{r.region}</div><div className="hd n" role="gridcell">{r.n}</div>
              {r.counts.map((c, i) => (
                <div key={tiers[i]} role="gridcell" className={`cell${r.n < 10 ? " small" : ""}`} style={{ background: c ? shade(r.shares[i]) : "transparent" }}
                  {...markProps(tip, [`${r.region} · ${tiers[i]}`, `${c} OF ${r.n} · ${pct1(r.shares[i])}`, ...(r.n < 10 ? ["FEWER THAN TEN FILES: NOISE"] : [])])}>{c || ""}</div>
              ))}
            </div>
          ))}
          <div className="hd" role="rowheader">ALL</div><div className="hd n" role="gridcell">{n}</div>
          {total.map((c, i) => <div key={tiers[i]} role="gridcell" className="cell tot">{c}</div>)}
        </div>
        {tip.node}
      </div>
      <Table caption="Files per birth region and tier" head={["REGION", "N", ...tiers.map(short)]} rows={[...rows.map(r => [r.region, r.n, ...r.counts]), ["ALL", n, ...total]]} />
    </Section>
  );
}

function GroupChart({ subjects, title, keyFn, caption, noun }) {
  const box = useRef(null); const tip = useTip(box);
  const { rows, held, unknown } = groupAverages(subjects, keyFn, 3);
  const all = mean(subjects.map(s => s.score));
  return (
    <Section title={title} meta={`MEAN ${r0(all)}`} caption={caption}>
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`${title}, ${subjects.length} files`}>
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

// Birth region on file vs the planet: the bar is the file's share, the tick the world's.
function Representation({ subjects }) {
  const box = useRef(null); const tip = useTip(box);
  const { rows, n, unknown } = representation(subjects);
  const byWorld = [...rows].sort((a, b) => b.world - a.world);
  const m = Math.max(...rows.map(r => Math.max(r.file, r.world)), 0.01);
  const countries = groupAverages(subjects, countryOf, 1).rows.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const worst = rows[0];
  return (
    <Section title="WHO IS ON FILE" meta={`N ${n}`}
      caption={`BAR: SHARE OF THE FILE BY BIRTH REGION. TICK: SHARE OF THE PLANET (UN 2025). ${worst && worst.gap > 0 ? `${worst.region} IS ${pct(worst.world)} OF HUMANITY AND ${pct(worst.file)} OF THE FILE. THE DEPARTMENT IS CORRECTING THIS.` : "THE FILE MATCHES THE PLANET. THE DEPARTMENT IS SUSPICIOUS."}`}>
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`Representation by birth region, ${n} files`}>
        <HBars tip={tip} max={m} reference rows={byWorld.map(r => ({
          label: `${r.region} (${r.count})`, value: r.file, ref: r.world, text: `${pct(r.file)} / ${pct(r.world)}`,
          color: r.gap > 0.02 ? Q_COLOR.DISMISSED : MARK,
          lines: [r.region, `FILE ${pct(r.file)} · ${r.count} SUBJECTS`, `PLANET ${pct(r.world)}`, r.gap > 0 ? `SHORT BY ${Math.round(r.gap * n)} FILES` : "OVER-SAMPLED"],
        }))} />
        {tip.node}
      </div>
      {unknown > 0 && <p className="hvi-an-note">{unknown} WITHOUT A BIRTHPLACE ON RECORD.</p>}
      <Table caption="Subjects per birth country" head={["COUNTRY", "N", "MEAN"]} rows={countries.map(r => [r.label, r.n, r0(r.mean)])} />
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
    <Section title="COVERAGE" meta={`N ${c.n}`} caption="MOST FILES WERE OPENED BY SOMEONE ELSE. THE PEOPLE HAVE BEEN CONSULTED ON FEW OF THEM; THEIR VERDICT IS THE JUDGE LINE ON A FILE, NOT AN AXIS OF THE CUBE.">
      <div ref={box} className="hvi-an-chart" role="group" aria-label={`Coverage, ${c.n} files`}>
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

// ---------------------------------------------------------------------------
// OVER TIME: what the weekly calibration run recorded (public/scale/shares.json, appended by
// scripts/calibrate.mjs). One row per run: date, method, n, the share on each rung.

function OverTime() {
  const [runs, setRuns] = useState(null);
  useEffect(() => { let off = false; fetch("/scale/shares.json").then(r => (r.ok ? r.json() : null)).then(d => { if (!off) setRuns(Array.isArray(d?.runs) ? d.runs : []); }).catch(() => { if (!off) setRuns([]); }); return () => { off = true; }; }, []);
  if (runs === null) return <Section title="THE LADDER OVER TIME" meta="LOADING"><p className="hvi-an-cap">[ .. ] PULLING THE RUNS █</p></Section>;
  const labels = TIERS.map(t => t.label);
  const rows = runs.map(r => ({ ...r, shares: labels.map(l => r.shares?.[l] ?? 0) }));
  return (
    <Section title="THE LADDER OVER TIME" meta={`${rows.length} RUN${rows.length === 1 ? "" : "S"} ON RECORD`}
      caption={rows.length < 2
        ? "ONE RUN ON RECORD: THE DAY THE LADDER WAS CUT. THE WEEKLY CALIBRATION APPENDS A ROW EACH SUNDAY; A LINE NEEDS TWO POINTS. THE DEPARTMENT DECLINES TO DRAW ONE FROM ONE."
        : "EACH RUNG'S SHARE OF THE UNGATED FILE AT EACH WEEKLY RUN, OLDEST FIRST. THE ROSTER GROWS BETWEEN RUNS, SO A MOVE IS NEW FILES AS MUCH AS MOVED ONES; A CUT CHANGE IS MARKED BY ITS METHOD."}>
      <div className="hvi-an-hbars" role="list" aria-label={`Share per rung over ${rows.length} runs`}>
        {labels.map((l, i) => {
          const series = rows.map(r => Math.round(r.shares[i] * 1000));
          const last = rows.length ? rows[rows.length - 1].shares[i] : 0;
          return (
            <div key={l} className="hvi-an-hrow" role="listitem">
              <span className="lab">{l}</span>
              <span className="track spark"><Sparkline series={series} w={120} h={14} /></span>
              <span className="val">{pct1(last)}</span>
            </div>
          );
        })}
      </div>
      <Table caption="Share of the ungated file per rung, per calibration run" head={["RUN", "METHOD", "N", ...labels.map(short)]} open
        rows={rows.map(r => [r.date, r.method, r.n, ...r.shares.map(pct1)])} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
const TABS = [
  { id: "worth", label: "WORTH" }, { id: "sections", label: "SECTIONS" }, { id: "cube", label: "THE CUBE" }, { id: "planet", label: "THE PLANET" }, { id: "time", label: "OVER TIME" },
];
const TAB_KEY = "hvi-an-tab";
const readTab = () => { try { const t = localStorage.getItem(TAB_KEY); return TABS.some(x => x.id === t) ? t : "worth"; } catch { return "worth"; } };

export default function Analytics({ figures }) {
  const [tab, setTabState] = useState(readTab);
  const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* not remembered */ } };
  const [pen, setPen] = useState(null);
  useEffect(() => {
    let off = false;
    fetchPen({ kind: "figure" }).then(list => { if (!off) setPen(list); }).catch(() => { if (!off) setPen([]); });
    return () => { off = true; };
  }, []);
  const everyone = useMemo(() => mergeRoster(figures, pen || []), [figures, pen]);
  // Birth region / country filter: every chart reads the filtered set, except WHO IS ON FILE
  // and REGION × TIER, which are about the whole file's spread.
  const [region, setRegion] = useState(null);
  const [country, setCountry] = useState("");
  const regions = useMemo(() => REGIONS.filter(r => everyone.some(s => regionOf(s) === r)), [everyone]);
  const countries = useMemo(() => {
    const m = new Map();
    for (const s of everyone) { const c = countryOf(s); if (c && (!region || regionOf(s) === region)) m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [everyone, region]);
  const subjects = useMemo(() => everyone.filter(s => (!region || regionOf(s) === region) && (!country || countryOf(s) === country)), [everyone, region, country]);
  const pickRegion = (r) => { setRegion(r); setCountry(""); };
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
        {subjects.length !== everyone.length ? ` // FILTERED FROM ${everyone.length}` : ""}
      </div>
      <ChipStrip label="The numbers, by desk" className="hvi-an-tabs">
        {TABS.map(t => <Chip key={t.id} pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>)}
      </ChipStrip>
      {tab !== "time" && (
        <div className="hvi-an-filter">
          <ChipStrip label="Filter by birth region">
            <Chip pressed={!region} onClick={() => pickRegion(null)}>ALL REGIONS</Chip>
            {regions.map(r => <Chip key={r} pressed={region === r} onClick={() => pickRegion(r)}>{r}</Chip>)}
          </ChipStrip>
          <label className="hvi-an-country">
            <span>COUNTRY</span>
            <select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">ALL{region ? ` IN ${region}` : ""} ({countries.reduce((a, [, n]) => a + n, 0)})</option>
              {countries.map(([c, n]) => <option key={c} value={c}>{c.toUpperCase()} ({n})</option>)}
            </select>
          </label>
          {subjects.length === 0 && pen !== null && <p className="hvi-an-empty">NO FILES MATCH. THE DEPARTMENT HAS NOT YET PROCESSED THAT PART OF THE PLANET.</p>}
        </div>
      )}
      {tab === "worth" && <>
        <TierChart subjects={subjects} />
        <Histogram subjects={subjects} />
        <Extremes subjects={subjects} />
        <GroupChart subjects={subjects} title="VALUE BY FIELD" keyFn={domainOf} noun="FIELD" caption="MEAN SCORE PER FIELD OF ENDEAVOUR, FROM ZERO. THE LINE IS THE MEAN OF EVERYONE." />
        <GroupChart subjects={subjects} title="VALUE BY ERA" keyFn={eraOf} noun="ERA" caption="MEAN SCORE BY BIRTH ERA. ANTIQUITY IS JUDGED ON WHAT SURVIVED OF IT." />
      </>}
      {tab === "sections" && <>
        <DimensionGrid subjects={subjects} />
        <Profile subjects={subjects} />
        <Correlations subjects={subjects} />
      </>}
      {tab === "cube" && <>
        <CubeTab subjects={subjects} />
        <Scatter subjects={subjects} />
        <QuadrantShare subjects={subjects} />
      </>}
      {tab === "planet" && <>
        <RegionTier subjects={everyone} />
        <Representation subjects={everyone} />
        <GroupChart subjects={subjects} title="VALUE BY REGION" keyFn={regionOf} noun="REGION" caption="MEAN SCORE BY BIRTH REGION. SMALL SAMPLES ARE NOISE, AND THE DEPARTMENT KNOWS IT." />
        <Coverage subjects={subjects} />
      </>}
      {tab === "time" && <OverTime />}
    </div>
  );
}
