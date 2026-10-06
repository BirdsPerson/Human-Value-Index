// The Public Figure Index and the compare registry. Compact rows (rank, photo, name,
// score, tier) that open to the verdict on tap; FIND on top and the tiers as one
// sideways-scrolling filter strip. Every verdict used to print inline: 62 paragraphs,
// about 15 phone screens. Now it is one screen of names and the file you asked for.

import { lazy, Suspense, useDeferredValue, useMemo, useState } from "react";
import { TIERS, getTier, displayName } from "./figures.js";
import FilePhoto from "./FilePhoto.jsx";
import { Rule, padL } from "./term.jsx";
import { Button, ButtonRow, Chip, Chips, ChipStrip, ListRow, TextField, ScreenHead } from "./ui/index.js";
import "./figureIndex.css";
import PetitionPanel from "./PetitionPanel.jsx";
import Sparkline, { sparkLabelOf } from "./ui/Sparkline.jsx";

// ANALYTICS loads only when asked for (charts are their own chunk).
const Analytics = lazy(() => import("./analytics/Analytics.jsx"));
const VIEW_KEY = "hvi-fi-view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "analytics" ? "analytics" : "rankings"; } catch { return "rankings"; } };

// FIND matches any part of the name or its qualifier, ignoring case and accents.
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const matcher = (q) => { const f = fold(q); return f ? (fig) => fold(displayName(fig)).includes(f) : null; };
const short = (label) => label.split(" ")[0];

// Counts follow FIND: each chip says how many it would show.
function TierStrip({ figures, match, filter, onFilter, label }) {
  const pool = useMemo(() => (match ? figures.filter(match) : figures), [figures, match]);
  const counts = useMemo(() => {
    const c = {};
    for (const f of pool) { const t = getTier(f.score).label; c[t] = (c[t] || 0) + 1; }
    return c;
  }, [pool]);
  return (
    <ChipStrip label={label}>
      <Chip pressed={filter === "ALL"} onClick={() => onFilter("ALL")}>ALL {pool.length}</Chip>
      {TIERS.map(t => (
        <Chip key={t.label} tone={t.color} pressed={filter === t.label} onClick={() => onFilter(t.label)}
          aria-label={`${t.label}: ${counts[t.label] || 0}`}>
          {short(t.label)} {counts[t.label] || 0}
        </Chip>
      ))}
    </ChipStrip>
  );
}

function Thumb({ fig }) {
  return <FilePhoto subject={fig} scale={1} compact />;
}

function Empty({ q }) {
  return (
    <div className="hvi-fi-empty" role="status">
      NO SUBJECT ON RECORD MATCHES “<span className="as-typed">{q}</span>”. THE DEPARTMENT HAS NOT MISPLACED THEM. YOU HAVE.
    </div>
  );
}

// ---------------------------------------------------------------------------
// #leaderboard: the whole index, grouped by tier, highest first. `result` is the
// visitor's own file, ranked in among them.
export default function FigureIndex({ figures, result, onPrimary }) {
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const dq = useDeferredValue(q);
  const sorted = useMemo(() => [...figures].sort((a, b) => b.score - a.score), [figures]);
  const rank = useMemo(() => new Map(sorted.map((f, i) => [f.name, i + 1])), [sorted]);
  const match = useMemo(() => matcher(dq), [dq]);
  const shown = sorted.filter(f => (filter === "ALL" || getTier(f.score).label === filter) && (!match || match(f)));
  const groups = TIERS.map(t => ({ ...t, figures: shown.filter(f => getTier(f.score).label === t.label) })).filter(g => g.figures.length);
  const you = result && typeof result.score === "number" ? { score: result.score, tier: getTier(result.score) } : null;
  const youRank = you ? sorted.filter(f => f.score > you.score).length + 1 : null;
  const showYou = you && !match && (filter === "ALL" || filter === you.tier.label);
  const w = String(sorted.length).length;

  return (
    <div className="hvi-fi">
      <ScreenHead title="PUBLIC FIGURE INDEX"
        meta={`KNOWN SUBJECTS DATABASE // ${figures.length} ON FILE // ${view === "analytics" ? "THE NUMBERS, AGGREGATED. THE DEPARTMENT FINDS THEM RESTFUL." : "RANKED BY VALUE. TAP A NAME TO READ ITS FILE."}`} />
      <ChipStrip label="Index view" className="hvi-fi-views">
        <Chip pressed={view === "rankings"} onClick={() => setView("rankings")}>RANKINGS</Chip>
        <Chip pressed={view === "analytics"} onClick={() => setView("analytics")}>ANALYTICS</Chip>
      </ChipStrip>
      {view === "analytics" ? (
        <Suspense fallback={<div className="hvi-fi-count" role="status">[ .. ] TABULATING █</div>}>
          <Analytics figures={figures} />
        </Suspense>
      ) : <>
      <TextField label="FIND" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="a name on record"
        enterKeyHint="search" spellCheck={false} autoCapitalize="off" aria-controls="hvi-fi-list" />
      <TierStrip figures={figures} match={match} filter={filter} onFilter={setFilter} label="Filter by tier" />
      <div className="hvi-fi-count" aria-live="polite">
        {shown.length === figures.length ? `${shown.length} SUBJECTS` : `${shown.length} OF ${figures.length} SUBJECTS`}
        {showYou ? ` // YOUR FILE RANKS ${youRank} OF ${sorted.length + 1}` : ""}
      </div>
      <div id="hvi-fi-list">
        {shown.length === 0 && <Empty q={dq} />}
        {groups.map(g => {
          const rows = g.figures.map(fig => {
            const t = getTier(fig.score);
            return (
              <ListRow key={fig.name} className="hvi-fi-row"
                lead={<><span className="rk" aria-hidden="true">{padL(rank.get(fig.name), w)}</span><Thumb fig={fig} /></>}
                label={displayName(fig)} spark={<Sparkline s={fig} />} value={padL(fig.score, 3)} tone={t.color} tag={short(t.label)} tagOptional
                aria-label={`${rank.get(fig.name)}. ${displayName(fig)}, ${fig.score}, ${t.label}. ${sparkLabelOf(fig)}. Read the file.`} subAsTyped>
                <Chips className="hvi-fi-chips">
                  <Chip tone={t.color}>{t.label}</Chip>
                  {fig.quadrant && <Chip tone={fig.quadrant === "ADMIRED" ? "accent" : fig.quadrant === "DISMISSED" || fig.quadrant === "FEARED" ? "harm" : "warn"}>{fig.quadrant}</Chip>}
                  {you && <Chip tone="mute">{you.score > fig.score ? `YOU +${you.score - fig.score}` : you.score < fig.score ? `YOU −${fig.score - you.score}` : "YOU ±0"}</Chip>}
                </Chips>
                <p className="hvi-fi-verdict">{fig.verdict}</p>
                <a className="hvi-fi-dispute" href={`#dispute?file=${encodeURIComponent(displayName(fig))}`}>DISPUTE THIS FILE</a>
                <PetitionPanel subject={fig} />
              </ListRow>
            );
          });
          // your own file, ranked in among them
          if (showYou && you.tier.label === g.label) {
            const at = g.figures.findIndex(f => f.score <= you.score);
            rows.splice(at < 0 ? rows.length : at, 0, (
              <div key="__you" className="ui-row hvi-fi-you" aria-label={`Your file: ${you.score}, ${you.tier.label}, rank ${youRank}.`}>
                <span className="lead"><span className="rk">{padL("▶", w)}</span></span>
                <span className="name">YOUR FILE</span>
                <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
                <Sparkline s={{ you: true, score: you.score, history: result.history }} />
                <span className="val">{padL(you.score, 3)}</span>
                <span className="tag opt">[{short(you.tier.label)}]</span>
              </div>
            ));
          }
          return (
            <section key={g.label} className="hvi-fi-group" aria-label={`${g.label}: ${g.figures.length}`}>
              <Rule label={`${g.label} (${g.figures.length})`} tone={g.color} />
              <div role="list">{rows.map((r, i) => <div role="listitem" key={r.key ?? i}>{r}</div>)}</div>
            </section>
          );
        })}
      </div>
      </>}
      <ButtonRow stackOnMobile>
        <Button variant="primary" onClick={onPrimary}>{result ? "Back to my results" : "Submit to evaluation"}</Button>
      </ButtonRow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The result screen's "compare to known subjects": pick one to set beside your file.
// Nearest to your score first (the comparisons worth making), capped at a short list
// until you search, filter or ask for all of them.
const CAP = 8;
export function FigurePicker({ figures, score, filter, onFilter, selected, onSelect }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const dq = useDeferredValue(q);
  const match = useMemo(() => matcher(dq), [dq]);
  const ordered = useMemo(() => [...figures].sort(typeof score === "number"
    ? (a, b) => Math.abs(a.score - score) - Math.abs(b.score - score) || b.score - a.score
    : (a, b) => b.score - a.score), [figures, score]);
  const list = ordered.filter(f => (filter === "ALL" || getTier(f.score).label === filter) && (!match || match(f)));
  const capped = !all && !match && list.length > CAP + 2;
  const rows = capped ? list.slice(0, CAP) : list;
  return (
    <div className="hvi-fi-pick">
      <TextField label="FIND" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="a name on record"
        enterKeyHint="search" spellCheck={false} autoCapitalize="off" />
      <TierStrip figures={figures} match={match} filter={filter} onFilter={onFilter} label="Filter known subjects by tier" />
      {list.length === 0 ? <Empty q={dq} /> : typeof score === "number" && <div className="hvi-fi-count">NEAREST TO YOUR FILE ({score}) FIRST</div>}
      <div role="list">
        {rows.map(fig => {
          const t = getTier(fig.score);
          const on = selected?.name === fig.name;
          return (
            <div role="listitem" key={fig.name}>
              <ListRow className="hvi-fi-row" lead={<Thumb fig={fig} />} label={displayName(fig)} spark={<Sparkline s={fig} />} value={padL(fig.score, 3)}
                tone={t.color} tag={short(t.label)} tagOptional selected={on} onClick={() => onSelect(on ? null : fig)}
                aria-label={`${displayName(fig)}, ${fig.score}, ${t.label}. ${sparkLabelOf(fig)}. ${on ? "Clear the comparison" : "Compare"}.`} />
            </div>
          );
        })}
      </div>
      {capped && <Button variant="secondary" block onClick={() => setAll(true)}>Show all {list.length}</Button>}
    </div>
  );
}
