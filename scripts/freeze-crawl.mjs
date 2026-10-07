// THE DUNGEON: freeze the live engine as a version (docs/design/DUNGEON.md 3.2, 6). Copies
// src/play/crawl/engine/ to src/play/crawl/engine-vN/ (N = the engine's VERSION) and records the
// version's fixture tapes, scripts/fixtures/crawl-vN-records.json: the first-timer bot
// (scripts/crawlBot.mjs) at every level, both endings, a seat that circles until the Auditor files it,
// and a two-seat party (the co-op-ready shape). Each record {v, cfg, logs, claim} must replay to its
// claim forever (check-crawl.mjs); replay.js routes version N to the frozen copy.
// Run once per shipped version, when its behaviour is final: node scripts/freeze-crawl.mjs [--force]
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S = await import("../src/play/crawl/engine/index.js");
const B = await import("./crawlBot.mjs");
const V = S.VERSION, root = new URL("../src/play/crawl/", import.meta.url);
const to = fileURLToPath(new URL(`engine-v${V}/`, root));
if (existsSync(to) && !process.argv.includes("--force")) { console.error(`engine-v${V} exists; a frozen version is never rewritten (--force only before it ships)`); process.exit(1); }
if (existsSync(to)) rmSync(to, { recursive: true });
cpSync(fileURLToPath(new URL("engine/", root)), to, { recursive: true });

const cfgOf = (seed, level, extra = {}) => ({ runId: `fix-v${V}-${level}-${seed}`, theme: "subbasements", level, entry: 4, day: 20368, cleared: 0, seats: ["fixture-seat-0"], seed, at: 1791331200000, v: V, hand: 1, controls: "assist", ...extra });
const tape = (cfg, wordsFor) => {
  const st = S.newRun(cfg), logs = cfg.seats.map(() => []);
  for (let f = 0; f < 90000 && st.phase !== "filed"; f++) { const ws = wordsFor(st, f); ws.forEach((w, k) => logs[k].push(w)); S.step(st, ws); }
  if (st.phase !== "filed") throw new Error(`${cfg.runId} did not file`);
  const rec = { v: V, cfg, logs: logs.map(S.rleEncode), claim: S.claimOf(st) };
  if (JSON.stringify(S.replay(JSON.parse(JSON.stringify(rec)))) !== JSON.stringify(rec.claim)) throw new Error(`${cfg.runId} does not replay`);
  return rec;
};
const records = [];
// the first-timer at every level: the first seeds that end by the lift and by a loss
for (const level of S.LEVEL_ORDER) {
  const want = new Set(["lift", "lost"]);
  for (let s = 1; want.size && s < 400; s++) {
    const seed = 700000 + s * 7919, cfg = cfgOf(seed, level), bot = B.firstTimer(seed);
    const rec = tape(cfg, (st) => [bot(st)]);
    if (!want.has(rec.claim.exit)) continue;
    want.delete(rec.claim.exit); records.push(rec);
    console.log(level, seed, rec.claim.exit, rec.claim.why, `B${rec.claim.depth}`, rec.logs[0].length);
  }
}
// a seat that circles its arrival room until the Auditor files it (the shift rule's honesty)
{
  const cfg = cfgOf(31, "clerk", { runId: `fix-v${V}-circle` });
  let cx = null, cy = null;
  records.push(tape(cfg, (st, f) => {
    const P = st.ents.find(e => e.k === "player"); if (cx == null) { cx = P.x; cy = P.y; }
    const dx = cx - P.x, dy = cy - P.y;
    return [S.pack({ head: dx * dx + dy * dy > 4 ? S.headingOf(dx, dy) : Math.floor(f / 20) % 16, mag: 2, roll: f % 50 === 0 })];
  }));
  console.log("circle", records.at(-1).claim.exit);
}
// a two-seat party: the bot on seat 0, seat 1 standing by the lift car (logs[] per seat)
{
  const seed = 811, cfg = cfgOf(seed, "intern", { runId: `fix-v${V}-two-seats`, seats: ["fixture-seat-0", "fixture-seat-1"] }), bot = B.firstTimer(seed);
  records.push(tape(cfg, (st, f) => [bot(st), S.pack({ head: (f >> 5) % 16, mag: f % 240 < 30 ? 1 : 0, attack: f % 40 === 0 })]));
  console.log("two seats", records.at(-1).claim.exit);
}
writeFileSync(new URL(`./fixtures/crawl-v${V}-records.json`, import.meta.url), JSON.stringify({ note: `recorded on crawl engine v${V} (src/play/crawl/engine-v${V}/, frozen by scripts/freeze-crawl.mjs): the first-timer bot at every level with both endings, a circling seat filed by the Auditor, a two-seat party; every record must replay to its claim`, records }) + "\n");
console.log(`froze engine-v${V} and ${records.length} tapes`);
