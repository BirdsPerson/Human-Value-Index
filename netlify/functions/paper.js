// THE DAILY COMPLIANCE (docs/PAPER.md), read side.
//   GET /api/paper               -> {today, edition (today's, else the latest printed), wire, index}
//   GET /api/paper?date=<date>   -> {edition} (immutable once printed: cached for a year)
//   GET /api/paper?index=1       -> {editions: [{date, no, headline}]}
//   GET /api/paper?wire=1        -> {wire} (the live WIRE, 60 s)
// When today's edition is missing, the first reader wakes the press (at most once a minute an
// instance) and gets the latest printed one meanwhile.
import { getStore } from "@netlify/blobs";
import { paperStore } from "../lib/paper-store.js";
import { paperDate, wireOf, DATE_RE, entsOf } from "../lib/paper.js";
import { tickSecret, TICK_HEADER, publicCached } from "../lib/social-store.js";
import { readBoard } from "../lib/market.js";
import { machineClock } from "../../src/city/sim.js";
import { tourneyWire } from "../lib/paper.js";
import { openAt } from "../../src/tournament/calendar.js";
import { readBoard as readTourney, standings, publicStandings } from "../lib/tournament-store.js";

const json = (status, body, cache = "no-store") => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache },
});
let woke = 0;
async function wake(base) {
  if (Date.now() - woke < 60_000) return;
  woke = Date.now();
  const secret = tickSecret();
  if (!secret) return;
  await fetch(`${base}/.netlify/functions/paper-build-background`, { method: "POST", headers: { [TICK_HEADER]: secret }, signal: AbortSignal.timeout(8_000) }).catch(() => {});
}
// the open tournaments' leaders (src/tournament/): a board read per open event, at most three
export async function tourneyLines(now) {
  const evs = openAt(now).sort((a, b) => b.major - a.major).slice(0, 3);
  const boards = await Promise.all(evs.map(ev => readTourney(ev.id).then(b => ({ ev, board: publicStandings(standings(b, ev, now), 2) })).catch(() => null)));
  return tourneyWire(boards.filter(Boolean));
}
export async function wire() {
  const now = Date.now();
  const [board, social, tourney] = await Promise.all([readBoard().catch(() => null), publicCached().catch(() => null), tourneyLines(now).catch(() => [])]);
  return wireOf({ mt: machineClock(now).mt, board, social, tourney });
}

// A v1 edition (printed before ents, 2026-10-05..09) is read with its names looked up now: the
// listed names on the board and the city's places, beside the edition, never written into it.
async function withEnts(ed) {
  if (!ed || ed.ents) return {};
  const board = await readBoard().catch(() => null);
  return { ents: entsOf(ed, { names: (board?.rows || []).filter(r => r?.name && r?.slug).map(r => [r.name, r.slug]) }) };
}

export default async (req, context) => {
  if (req.method !== "GET") return json(405, { error: "THE PAPER IS READ, NOT WRITTEN TO." });
  const url = new URL(req.url), store = paperStore();
  const base = context?.site?.url || process.env.URL || url.origin;
  try {
    const date = url.searchParams.get("date");
    if (date) {
      if (!DATE_RE.test(date)) return json(400, { error: "NO SUCH DATE. THE DEPARTMENT KEEPS A CALENDAR." });
      const ed = await store.edition(date);
      if (!ed) return json(404, { error: "NO EDITION WAS PRINTED THAT DAY." }, "public, max-age=60");
      return json(200, { edition: ed, ...(await withEnts(ed)) }, "public, max-age=31536000, immutable");
    }
    if (url.searchParams.get("index")) return json(200, { editions: (await store.index())?.editions || [] }, "public, max-age=120");
    if (url.searchParams.get("wire")) return json(200, { wire: await wire() }, "public, max-age=60");
    const today = paperDate(Date.now());
    const idx = (await store.index())?.editions || [];
    let ed = idx[0]?.date === today ? await store.edition(today) : null;
    if (!ed) {
      await wake(base);
      ed = idx[0] ? await store.edition(idx[0].date) : null;
    }
    return json(200, { today, edition: ed, ...(await withEnts(ed)), wire: await wire(), index: idx.slice(0, 30).map(({ date, no, headline }) => ({ date, no, headline })) }, "public, max-age=60");
  } catch (err) {
    console.error("paper read failed", err?.message);
    return json(503, { error: "THE PRESSES ARE STOPPED. THE DEPARTMENT IS LOOKING INTO IT. IT IS NOT HURRYING." });
  }
};

export const config = { path: "/api/paper" };
