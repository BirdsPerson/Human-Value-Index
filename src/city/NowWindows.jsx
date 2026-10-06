// NOW IN THE SUBSTRATE as tiled windows (DEPARTMENT OS, 2026-10-05): the district
// occupancy map (teletext block mosaic: each district a tile of 32 blocks, lit by the
// share of its capacity in use), the Loop monitor, the Assembly box, the gossip log and
// the bulletin (fixtures, the Pit, the night). Its own chunk: City.jsx lazy-loads it.
// Everything here is data the city page already holds; nothing is fetched.
import { memo, useState } from "react";
import { Frame, Button, ButtonRow, Headline } from "../ui/index.js";
import { DISTRICT, TRAIN } from "./simApi.js";

const N = 32;   // blocks per tile: 8 x 4
// A fixed scatter (13 is coprime with 32), so a quarter-full district reads as a teletext
// mosaic rather than a bar.
const ORDER = Array.from({ length: N }, (_, i) => (i * 13) % N);
const SHORT = (name) => name.replace(/^THE /, "").replace("QUARTER", "QTR");
// Occupancy level: 0 empty, 1 under a quarter, 2 under half, 3 under 85%, 4 full, 5 over capacity.
const level = (count, cap) => {
  if (!count) return 0;
  const f = cap ? count / cap : 0;
  return f > 1 ? 5 : f >= 0.85 ? 4 : f >= 0.5 ? 3 : f >= 0.25 ? 2 : 1;
};
const LEGEND = [[1, "UNDER 25%"], [2, "UNDER 50%"], [3, "UNDER 85%"], [4, "FULL"], [5, "OVER CAPACITY"], [0, "EMPTY"]];

// Two paths per tile (lit, unlit): a whole map is forty <path>s, not 640 elements.
function blocks(lit) {
  const on = new Set(ORDER.slice(0, lit));
  let a = "", b = "";
  for (let i = 0; i < N; i++) {
    const x = i % 8, y = (i / 8) | 0, r = `M${x + 0.08} ${y + 0.1}h0.84v0.8h-0.84z`;
    if (on.has(i)) a += r; else b += r;
  }
  return [a, b];
}

function Tile({ x, onDistrict }) {
  const d = DISTRICT[x.id];
  const lv = level(x.count, x.cap);
  const lit = x.count ? Math.max(1, Math.min(N, Math.round((x.count / (x.cap || 1)) * N))) : 0;
  const [on, off] = blocks(lit);
  const pct = x.cap ? Math.round((x.count / x.cap) * 100) : 0;
  return (
    <li>
      <button type="button" className={`nw-cell lv${lv}`} onClick={() => onDistrict(x.id)}
        aria-label={`${x.name}: ${x.count} inside, capacity ${x.cap}, ${pct}% full. Enter the district.`}>
        <svg className="nw-blk" viewBox="0 0 8 4" preserveAspectRatio="none" aria-hidden="true">
          <path className="off" d={off} /><path className="on" d={on} />
        </svg>
        <span className="nm" aria-hidden="true">{SHORT(d?.name || x.name)}</span>
        <span className="ct" aria-hidden="true">{x.count}</span>
      </button>
    </li>
  );
}

// North to south, then west to east, from the districts' own rectangles (sim.js).
function mapOrder(districts) {
  const key = (x) => { const r = DISTRICT[x.id]?.rect || { x: 0, y: 0, w: 0, h: 0 }; return [Math.round((r.y + r.h / 2) / 20), r.x + r.w / 2]; };
  return districts.slice().sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
}

function NowWindows({ lines, stats, asm, events = [], onDistrict, children }) {
  const [reading, setReading] = useState(false);
  const busy = stats.districts.slice().sort((a, b) => b.count - a.count).slice(0, 3).filter(x => x.count > 0);
  const trains = [];
  for (const r of stats.riders || []) { const t = trains.find(g => g.t === r.t); if (t) t.n++; else trains.push({ t: r.t, n: 1 }); }
  return (
    <section className="hvi-now" aria-labelledby="hvi-city-now-h">
      <Headline id="hvi-city-now-h" page="P300" tone="cy">NOW IN THE SUBSTRATE</Headline>
      <div className="hvi-now-tiles">
        <Frame title="MAP.SYS // WHO IS WHERE" tone="var(--eb-cyan)" className="nw-map">
          <ul className="nw-grid" aria-label="Districts by occupancy, north to south">
            {mapOrder(stats.districts).map(x => <Tile key={x.id} x={x} onDistrict={onDistrict} />)}
          </ul>
          <ul className="nw-legend" aria-label="Key: lit blocks are the share of a district's capacity in use">
            {LEGEND.map(([lv, l]) => <li key={lv}><i className={`lv${lv}`} aria-hidden="true" />{l}</li>)}
          </ul>
          {busy.length > 0 && <p className="nw-busy">BUSIEST: {busy.map(x => `${x.name} (${x.count})`).join(", ")}.</p>}
        </Frame>
        <Frame title="LOOP.MON" tone="var(--eb-cyan)" className="nw-loop">
          <p className="nw-big">{stats.transit} ABOARD <span>// {stats.waiting} ON PLATFORMS</span></p>
          {trains.length > 0 && (
            <ul className="nw-trains" aria-label="Riders named so far, by train">
              {trains.map(g => (
                <li key={g.t}><span className="n">{TRAIN[g.t]?.name || g.t}</span>
                  <span className="b" aria-hidden="true">{Array.from({ length: Math.min(20, g.n) }, (_, i) => <i key={i} />)}</span><span className="v">{g.n}</span></li>
              ))}
            </ul>
          )}
          {trains.length > 0 && <p className="nw-note">NAMED RIDERS, FROM THE DISTRICTS ON SCREEN. ONE BLOCK, ONE PASSENGER, TWENTY AT MOST.</p>}
          <p className="nw-note">THE LOOP DOES NOT STOP FOR YOU. IT STOPS FOR THE TIMETABLE.</p>
        </Frame>
        {asm && (
          <Frame title={asm.open ? "ASSEMBLY // IN SESSION" : "ASSEMBLY // ADJOURNED"} tone="var(--eb-amber)" className="nw-asm">
            <p className="nw-asm-l">{asm.label}</p>
            {asm.note && <p className="nw-note">{asm.note}</p>}
            {reading && asm.read?.length > 0 && <ul className="nw-read" id="nw-asm-read">{asm.read.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <ButtonRow>
              {asm.open && <Button variant="push" tone="am" href="#assembly" aria-label="Vote: open the Assembly's ballot">VOTE</Button>}
              {asm.read?.length > 0
                ? <Button variant="push" tone="sec" aria-expanded={reading} aria-controls="nw-asm-read" onClick={() => setReading(r => !r)}>{reading ? "CLOSE" : "READ"}</Button>
                : <Button variant="push" tone="sec" href="#assembly">READ</Button>}
            </ButtonRow>
          </Frame>
        )}
        <Frame title={`GOSSIP.LOG // ${events.length} NOTED`} className="nw-gossip">
          <ul className="nw-log">
            {events.slice(0, 3).map((e, i) => <li key={`${e.h}-${i}`}>{e.text}</li>)}
            {!events.length && <li>NOTHING WORTH REPEATING. YET.</li>}
          </ul>
        </Frame>
        {(lines.length > 0 || children) && (
          <Frame title="BULLETIN" className="nw-bull">
            {lines.length > 0 && <ul className="nw-log">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            {children}
          </Frame>
        )}
      </div>
    </section>
  );
}

export default memo(NowWindows);
