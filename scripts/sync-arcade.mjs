// THE ARCADE's cabinet list, synced from the Iridescent works list (the studio site's
// works.json), so a new game gets a cabinet without anyone touching the city. Runs before
// every build (package.json "build"). Reads, first that answers:
//   1. $ARCADE_WORKS (a path or an https URL)
//   2. ../iridescent-site/works.json (a checkout beside this one: Scott's Mac, the nightly loop)
//   3. https://iridescent-studio.netlify.app/works.json (if the studio site ever publishes it)
// and writes src/city/arcade.json. When none answers (a Netlify build has no sibling checkout)
// the committed arcade.json stands and the build goes on: this never fails a build.
// scripts/check-funnels.mjs fails a pre-push run when the committed list is behind a works.json
// it can read, so the list cannot go stale on this machine.
//
// A games-division work becomes:
//   status "live"                       LIVE: a playable cabinet (play = embed, or the
//                                       "Play in the browser" link)
//   status "beta", or a `beta`/`play`   BETA: playable, marked BETA (not a full release)
//     URL on a work not yet live
//   anything else ("in-development")    OUT OF ORDER: a dark cabinet, no build to play
//   Human Value Index itself            LIVE, and self: you are already inside it
// Neighbours: entries already in arcade.json with "neighbour": true are other people's games
// the city hosts a tribute cabinet for (INTERNET CITY, internetcitygame.com). The works list
// never has them, so the sync keeps them, after Iridescent's own, exactly as they were.
// House games: entries with "house": true are OUR OWN playable games (golf, the hunt, tennis...) as
// bar cabinets (src/city/houseGames.js). The works list never has them either: kept, last, as they were.
//   node scripts/sync-arcade.mjs [--check]   (--check: exit 1 if arcade.json would change)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/city/arcade.json");
const SIBLING = join(ROOT, "..", "iridescent-site", "works.json");
const PUBLIC = "https://iridescent-studio.netlify.app/works.json";
const SELF = "human-value-index";

// Read with the checkout it came from: a worktree's sibling is the main tree's sibling too.
function siblingPaths() {
  const out = [SIBLING];
  try {
    const git = readFileSync(join(ROOT, ".git"), "utf8").match(/gitdir: (.*)/);
    if (git) out.push(join(git[1].trim(), "..", "..", "..", "..", "iridescent-site", "works.json"));
  } catch { /* a plain checkout: .git is a directory */ }
  return out;
}

export async function readWorks() {
  const env = process.env.ARCADE_WORKS;
  const tries = [];
  if (env) tries.push(env);
  tries.push(...siblingPaths(), PUBLIC);
  for (const src of tries) {
    try {
      if (/^https?:/.test(src)) {
        const r = await fetch(src, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j)) return { works: j, from: src };
      } else if (existsSync(src)) {
        const j = JSON.parse(readFileSync(src, "utf8"));
        if (Array.isArray(j)) return { works: j, from: src };
      }
    } catch { /* next source */ }
  }
  return null;
}

const itchOf = (w) => (w.links || []).find(l => /itch\.io/.test(l.u || ""))?.u || null;
const browserOf = (w) => w.play || w.embed || (w.links || []).find(l => /browser/i.test(l.t || "") && /^https:/.test(l.u || ""))?.u || null;
const oneLine = (s) => String(s || "").split(/(?<=\.)\s/)[0].slice(0, 160);

export function cabinetsFrom(works) {
  const games = works.filter(w => w.division === "games" && w.slug && w.title);
  const out = games.map(w => {
    const self = w.slug === SELF;
    const live = w.status === "live";
    const beta = !live && (w.status === "beta" || Boolean(w.beta || w.play));
    const status = live ? "live" : beta ? "beta" : "dev";
    const play = status === "dev" ? null : (beta ? (w.beta || w.play || browserOf(w)) : browserOf(w));
    return {
      slug: w.slug, title: w.title, status, role: w.role || "", year: w.year || "", line: oneLine(w.blurb),
      play: self ? null : play, itch: itchOf(w), self: self || undefined,
    };
  });
  // playable first (live, then beta), the dark ones last; the works list's own order within
  const rank = { live: 0, beta: 1, dev: 2 };
  return out.map((c, i) => [c, i]).sort((a, b) => rank[a[0].status] - rank[b[0].status] || a[1] - b[1]).map(([c]) => JSON.parse(JSON.stringify(c)));
}

export function houseIn(text) {
  try { const j = JSON.parse(text); return Array.isArray(j) ? j.filter(c => c && c.house === true) : []; } catch { return []; }
}
export function neighboursIn(text) {
  try { const j = JSON.parse(text); return Array.isArray(j) ? j.filter(c => c && c.neighbour === true) : []; } catch { return []; }
}

async function main() {
  const check = process.argv.includes("--check");
  const got = await readWorks();
  if (!got) { console.log("sync-arcade: no works.json reachable; the committed src/city/arcade.json stands"); return; }
  const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const next = JSON.stringify([...cabinetsFrom(got.works), ...neighboursIn(prev), ...houseIn(prev)], null, 2) + "\n";
  if (next === prev) { console.log(`sync-arcade: arcade.json current (${got.from})`); return; }
  if (check) { console.log(`sync-arcade: arcade.json is behind ${got.from}; run node scripts/sync-arcade.mjs`); process.exit(1); }
  writeFileSync(OUT, next);
  console.log(`sync-arcade: arcade.json updated from ${got.from}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.log(`sync-arcade: ${e.message}; the committed arcade.json stands`); });
