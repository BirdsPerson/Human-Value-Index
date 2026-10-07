// THE COURTS: freeze the live engine as a version (docs/design/BASKETBALL.md 4.2, 4.12). Copies
// src/play/hoops/engine/ to src/play/hoops/engine-vN/ (N = the engine's VERSION) and records the
// version's fixture tapes, scripts/fixtures/hoops-vN-records.json: the check bot and the casual human
// (scripts/hoops-bots.mjs), 5v5 / 3v3 / 1v1, every level, a throw-in by the human; each record must replay
// to its result forever (check-hoops.mjs). replay.js must route version N to the frozen copy.
// Run once per shipped version, when its behaviour is final: node scripts/freeze-hoops.mjs
import { cpSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S = await import("../src/play/hoops/engine/index.js");
const R = await import("../src/play/hoops/roster.js");
const B = await import("./hoops-bots.mjs");
const IQ = await import("./hoops-iq.mjs");
const V = S.VERSION, root = new URL("../src/play/hoops/", import.meta.url);
const to = fileURLToPath(new URL(`engine-v${V}/`, root));
if (existsSync(to) && !process.argv.includes("--force")) { console.error(`engine-v${V} exists; a frozen version is never rewritten (--force only before it ships)`); process.exit(1); }
cpSync(fileURLToPath(new URL("engine/", root)), to, { recursive: true });

const street = (ids) => ids.map(k => { const p = R.playerPool(R.FALLBACK).find(q => q.key === k); const pos = R.ROLES[k] || null; return [k, p.name, p.r, pos ? S.POS_ARCH[pos] : null, pos, null]; });
const cam = (id) => ({ id, adj: { zoom: 5, height: 5, follow: 5 }, controls: "camera" });
const TAPES = [
  { seed: 505001, bot: "check", cam: "2k", cfg: { mode: "5v5", fmt: "quarters", shot: 24, level: "rookie", home: IQ.realFive(R, "arts"), away: IQ.realFive(R, "hq") } },
  { seed: 505002, bot: "casual", cam: "baseline", cfg: { mode: "5v5", fmt: "quarters", shot: 24, level: "hof", home: IQ.realFive(R, "finance"), away: IQ.realFive(R, "archive") } },
  { seed: 505003, bot: "casual", cam: "drive", cfg: { mode: "5v5", fmt: "to21", shot: 14, level: "pro", home: IQ.realFive(R, "arena"), away: IQ.realFive(R, "strip") } },
  { seed: 505004, bot: "casual", cam: "broadcast", cfg: { mode: "5v5", fmt: "quarters", shot: 24, level: "allstar", inb: "me", home: IQ.realFive(R, "sprawl"), away: IQ.realFive(R, "works") } },
  { seed: 505005, bot: "casual", cam: "2k", cfg: { mode: "3v3", shot: 24, level: "allstar", to: 21, mitt: true, home: street(["kobe-bryant", "lebron-james", "michael-jordan"]), away: street(["stephen-curry", "magic-johnson", "kareem-abdul-jabbar"]) } },
  { seed: 505006, bot: "casual", cam: "low", cfg: { mode: "3v3", shot: 14, level: "rookie", to: 11, mitt: false, home: street(["nikola-jokic", "allen-iverson", "jaylen-brown"]), away: street(["joel-embiid", "tyrese-maxey", "julius-erving"]) } },
  { seed: 505007, bot: "casual", cam: "skybox", cfg: { mode: "1v1", shot: 24, level: "pro", to: 11, mitt: false, home: street(["tyrese-maxey"]), away: street(["jalen-brunson"]) } },
  { seed: 505008, bot: "casual", cam: "high", cfg: { mode: "1v1", shot: 24, level: "hof", to: 21, mitt: true, home: street(["dennis-rodman"]), away: street(["phil-jackson"]) } },
];
const records = TAPES.map(({ seed, bot, cam: c, cfg }) => {
  const st = S.newGame(seed, cfg), fn = bot === "check" ? B.checkBot(S, { t: 0, lastA: -9 }) : B.casualHuman(S, seed), masks = [];
  for (let f = 0; st.phase !== "over" && f < 200000; f++) { const m = fn(st); masks.push(m); S.step(st, m); }
  if (st.phase !== "over") throw new Error(`tape ${seed} did not finish`);
  const rec = { version: V, seed, cfg, cam: cam(c), inputLog: S.rleEncode(masks), result: S.resultOf(st) };
  if (JSON.stringify(S.replay(JSON.parse(JSON.stringify(rec)))) !== JSON.stringify(rec.result)) throw new Error(`tape ${seed} does not replay`);
  console.log(seed, cfg.mode, cfg.level, rec.result.score, rec.inputLog.length);
  return rec;
});
writeFileSync(new URL(`./fixtures/hoops-v${V}-records.json`, import.meta.url), JSON.stringify({ note: `recorded on hoops engine v${V} (src/play/hoops/engine-v${V}/, frozen by scripts/freeze-hoops.mjs): the check bot and the casual human (scripts/hoops-bots.mjs), 5v5 / 3v3 / 1v1 at every level, one with the human throwing it in; cam is the record's camera metadata (it never reaches the engine); every record must replay to its result`, records }) + "\n");
console.log(`froze engine-v${V} and ${records.length} tapes`);
