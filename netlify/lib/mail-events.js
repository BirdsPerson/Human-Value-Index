// DEPARTMENT MAIL: one day's events for one file (netlify/lib/mail-gen.js turns them into letters).
// Read once per real day per file, at its first visit to the mail room that day. Everything here is
// already published somewhere on the site (the paper, the market board, the shop's wall, the
// marquee); the only private inputs are the file's own holdings and its assigned flat. A source that
// does not answer is left out of the day's post, and logged: the post that day is a little thinner
// (a missing source never invents a letter, and never stops the others).
import { getStore } from "@netlify/blobs";
import * as SIM from "../../src/city/sim.js";
import { paperStore } from "./paper-store.js";
import { paperDate } from "./paper-notices.js";
import { readBoard } from "./market.js";
import { ledger, caseHash } from "./economy-db.js";
import { apartmentOf } from "./economy.js";
import { readBoard as readHunt } from "./hunt-store.js";
import { STORE as FUNNELS } from "./funnels.js";
import { getRecord as tourneyRecord } from "./tournament-store.js";

const soft = (what, p) => p.catch(err => { console.warn(`mail: ${what} unread`, err?.message); return null; });

// The default io: the real stores. check-mail.mjs passes its own.
export const liveIo = {
  // today's edition, else the latest printed (the paper prints at its first press run of the day)
  async edition(date) {
    const s = paperStore();
    const ed = await s.edition(date);
    if (ed) return ed;
    const idx = await s.index();
    return idx?.editions?.[0] ? s.edition(idx.editions[0].date) : null;
  },
  // the file's shares, priced and explained by today's board
  async holdings(caseId) {
    const L = ledger();
    if (!L) return null;
    const v = await L.rpc("econ_view", { case_hash: caseHash(caseId), since: new Date().toISOString().slice(0, 10), limit: 1 });
    const shares = (v?.shares || []).filter(s => Number(s.units) > 0);
    if (!shares.length) return [];
    const board = await readBoard();
    const row = Object.fromEntries((board?.rows || []).map(r => [r.slug, r]));
    return shares.filter(s => row[s.slug]).map(s => ({ slug: s.slug, name: String(row[s.slug].name).toUpperCase(), units: Number(s.units), price: row[s.slug].price, chg: row[s.slug].chg, why: row[s.slug].why ? String(row[s.slug].why).toUpperCase() : null }));
  },
  // the EB SHOP's wall, as last read (the funnel's cached copy: the post never calls Shopify itself)
  async shopPicks() {
    const c = await getStore({ name: FUNNELS, consistency: "strong" }).get("shop", { type: "json" });
    return (c?.items || []).slice(0, 12).map(i => ({ handle: i.handle, title: i.title, price: i.price }));
  },
  // the file's tournament results (the final standings write them, tournament-awards.js)
  async honours(caseId) { return ((await tourneyRecord(caseId))?.honours || []).slice(0, 5).map(h => ({ id: h.id, name: h.name, line: h.line, place: h.place, div: h.div })); },
  async hunt(day) { const b = await readHunt(day); return b?.top?.[0] ? { day, top: { score: b.top[0].score } } : null; },
};

// -> the events lettersFor reads (mail-gen.js)
export async function gatherEvents(caseId, rec, { nowMs = Date.now(), first = false, io = liveIo } = {}) {
  const date = paperDate(nowMs), clock = SIM.machineClock(nowMs);
  const [edition, holdings, shopPicks, hunt, honours] = await Promise.all([
    soft("the paper", io.edition(date)), soft("the holdings", io.holdings(caseId)), soft("the shop", io.shopPicks()), soft("the marquee", io.hunt(clock.day - 1)),
    soft("the honours", io.honours ? io.honours(caseId) : Promise.resolve([])),
  ]);
  return { caseId, date, nowMs, machineDay: clock.day, mt: clock.mt, first, edition, holdings: holdings || [], apartment: apartmentOf(caseId, rec), shopPicks: shopPicks || [], hunt, honours: honours || [] };
}
