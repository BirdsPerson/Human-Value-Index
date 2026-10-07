// One cheap model pass that picks each figure's signature props (src/city/figureProps.js step 2).
//
//   node scripts/props-ai-pass.mjs [--dry-run] [--resume]
//
// One short Haiku request per figure, in one Message Batch (50% price), the model choosing ONLY from the
// fixed vocabulary (VOCAB) and answering {"props": [ids]}, or an empty list when it does not clearly know
// the person. Results are validated against the catalog and cached in src/city/props-by-figure.json, so it
// is a one-time cost: only figures not already there are asked. Skipped on purpose: the curated table's
// people, and anyone the harm review gated or the cube calls "harm" (they get neutral props).
// Budget: aborts when the projected cost passes $1, and charges one call per request to the site-wide
// Anthropic counter (HVI_ANTHROPIC_DAILY_CAP, the same peekGlobal/chargeGlobal roster-grow uses).
// Needs ANTHROPIC_API_KEY (and optionally HVI_ANTHROPIC_DAILY_CAP) in the environment.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { baseRoster } from "../src/city/roster.js";
import { familyOf } from "../src/city/cityKit.js";
import { CURATED, VOCAB, VOCAB_IDS } from "../src/city/figureProps.js";
import { CATALOG } from "../src/city/furniture.js";
import { figureIndex, peekGlobal, chargeGlobal } from "./roster/prod.mjs";
import { createBatch, getBatch, batchResults, resultText, resultUsage, estimateDollars, actualDollars, approxTokens } from "./roster/batch.mjs";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_DOLLARS = 1;
const OUT = new URL("../src/city/props-by-figure.json", import.meta.url).pathname;
const STATE_DIR = `${homedir()}/.cache/hvi-props`, STATE = `${STATE_DIR}/state.json`;
const log = (m) => console.log(`[props-ai] ${m}`);

const SYSTEM = `You dress the flats of famous people in a pixel-art city. For each person you are given, pick 2 to 4 props from the list below that best match their DOCUMENTED, PUBLIC interests, hobbies, crafts, sports or trade. Use the ids exactly as written.

${VOCAB_IDS.map(id => `${id}: ${VOCAB[id]}`).join("\n")}

Rules:
- Only well-documented public interests: an instrument they play, a sport they play, a craft or collection, the tools of their trade.
- If you do not clearly know the person, or cannot match at least 2 props to documented interests, answer {"props":[]}.
- Never choose from rumour, crime, scandal, health, sexuality, religion, politics beyond an office held, or wealth. Never invent an interest. For a living person use only interests they have shared publicly.
- No speech, no jokes, nothing defamatory. Prefer variety over the obvious.
- Choose "arcade" only for people with a well-documented love of video games, and "pc" only for programmers.
Answer with JSON only: {"props":["id","id"]}`;

const year = (d) => (d ? String(d).match(/^-?\d+/)?.[0] : null);
const userFor = (c) => `Name: ${c.name}${c.born ? ` (born ${year(c.born)}${c.died ? `, died ${year(c.died)}` : ", living"})` : ""}${c.wikidata ? `\nWikidata: ${c.wikidata}` : ""}`;

async function candidates() {
  const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const rows = new Map();
  for (const b of baseRoster()) rows.set(b.slug, b);
  for (const r of await figureIndex()) if (r && r.slug && !r.removed && !rows.has(r.slug)) rows.set(r.slug, { ...r, kind: "figure" });
  const out = [];
  for (const [slug, s] of rows) {
    if (CURATED[slug] || have[slug]) continue;
    let harm = Boolean(s.harmReview?.decision);
    try { harm = harm || familyOf(s).family === "harm"; } catch { /* no breakdown */ }
    if (harm) continue;
    out.push({ slug, name: s.name, born: s.born, died: s.died, wikidata: s.wikidata });
  }
  return { have, list: out.sort((a, b) => a.slug.localeCompare(b.slug)) };
}

async function dailyCap() {
  let v = process.env.HVI_ANTHROPIC_DAILY_CAP;
  return /^\d+$/.test(v || "") ? Number(v) : 1000;
}

function parseProps(text) {
  try {
    const j = JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || "{}");
    const ids = [...new Set((Array.isArray(j.props) ? j.props : []).filter(id => VOCAB[id] && CATALOG[id]))];
    return ids.length >= 2 ? ids.slice(0, 4) : null;
  } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  mkdirSync(STATE_DIR, { recursive: true });
  let st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
  if (!st || !args.includes("--resume")) {
    const { list } = await candidates();
    const sysTok = approxTokens(SYSTEM), inTok = list.reduce((n, c) => n + sysTok + approxTokens(userFor(c)) + 10, 0), outTok = list.length * 30;
    const est = estimateDollars(MODEL, inTok, outTok);
    log(`${list.length} figures to place, ~${inTok} input + ${outTok} output tokens, projected $${est.toFixed(3)} at batch prices (limit $${MAX_DOLLARS})`);
    if (est > MAX_DOLLARS) throw new Error(`projected $${est.toFixed(2)} passes the $${MAX_DOLLARS} limit: ABORT`);
    if (args.includes("--dry-run") || !list.length) return;
    const cap = await dailyCap(), used = await peekGlobal();
    log(`site-wide Anthropic counter: ${used}/${cap}; this run needs ${list.length} calls`);
    const res = await chargeGlobal(list.length, cap);
    if (!res.ok) throw new Error(`site-wide cap: ${list.length} calls would pass ${cap} (used ${res.count}): ABORT, nothing spent`);
    log(`charged ${list.length} calls (now ${res.count}/${cap})`);
    const requests = list.map((c, i) => ({ custom_id: `f${i}`, params: { model: MODEL, max_tokens: 80, temperature: 0, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: userFor(c) }] } }));
    const batch = await createBatch(requests);
    st = { batch: batch.id, ids: list.map(c => c.slug), est, calls: list.length };
    writeFileSync(STATE, JSON.stringify(st));
    log(`batch ${batch.id} created`);
  }
  let b;
  for (let i = 0; ; i++) {
    b = await getBatch(st.batch);
    if (b.processing_status === "ended") break;
    if (i > 360) { log("batch still running; rerun with --resume later"); return; }
    await new Promise(r => setTimeout(r, 20000));
  }
  const results = await batchResults(b);
  const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  let placed = 0, unplaced = 0;
  const usages = [];
  st.ids.forEach((slug, i) => {
    const r = results.get(`f${i}`);
    usages.push(resultUsage(r));
    const ids = parseProps(resultText(r));
    if (ids) { have[slug] = ids; placed++; } else unplaced++;
  });
  const sorted = Object.fromEntries(Object.entries(have).sort(([a], [z]) => a.localeCompare(z)));
  writeFileSync(OUT, JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}") + "\n");
  const actual = actualDollars(MODEL, usages);
  log(`placed ${placed}, left to the rules ${unplaced}; actual spend $${actual.toFixed(4)} (estimate $${st.est.toFixed(3)}), ${st.calls} calls charged`);
  writeFileSync(STATE, JSON.stringify({ ...st, done: true, actual }));
}
main().catch(e => { console.error(e.message); process.exit(1); });
