// YOUR FIRST DAY (src/firstDay.js): state -> steps. Each step ticks only on the real state it
// names, the count leaves out what cannot be taken yet, and the market target is one constant
// that points at a route App.jsx serves.
//   node scripts/check-firstday.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepsFrom, progressOf, MARKET_HREF, selfFindHref, localGames, noted } from "../src/firstDay.js";

const CASE = "HVI-TESTAAAA";
const by = (steps) => Object.fromEntries(steps.map(s => [s.id, s.status]));
const today = "2026-10-05";
const wallet = (o = {}) => ({ enrolled: true, today, vestDay: "2026-09-01", positions: [], recent: [], ...o, tray: { days: 0, vesting: false, ...(o.tray || {}) } });

// Nothing loaded: all to do, nothing counted done, six steps with the city optional.
let st = stepsFrom({}, CASE);
assert.equal(st.length, 6);
assert.deepEqual(st.map(s => s.n), [1, 2, 3, 4, 5, 6]);
assert.ok(st.every(s => s.status === "todo"));
assert.equal(st.find(s => s.id === "city").optional, true);
assert.deepEqual(progressOf(st), { done: 0, total: 5, complete: false, next: st[0] });

// 1 COLLECT: done when the tray is empty and the wallet enrolled, or a UBI landed today.
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ tray: { days: 2 } }) } })).collect, "todo");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet() } })).collect, "done");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ enrolled: false }) } })).collect, "todo");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ tray: { days: 1 }, recent: [{ kind: "ubi", day: today }] }) } })).collect, "done");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ tray: { days: 1 }, recent: [{ kind: "ubi", day: "2026-10-01" }] }) } })).collect, "todo");
// vesting (the file's first two days) and a shut or refused Treasury: shown, not counted
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ enrolled: false, tray: { vesting: true } }) } })).collect, "later");
assert.equal(by(stepsFrom({ econ: { open: false } })).collect, "later");
assert.equal(by(stepsFrom({ econ: { gate: true } })).collect, "later");

// 2 INVEST OR SAVE: a position, a buy on record, or this device's SAVE.
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet() } })).invest, "todo");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ positions: [{ industry: "sport" }] }) } })).invest, "done");
assert.equal(by(stepsFrom({ econ: { open: true, wallet: wallet({ recent: [{ kind: "buy" }] }) } })).invest, "done");
assert.equal(by(stepsFrom({ saved: true })).invest, "done");
assert.equal(stepsFrom({ saved: true }).find(s => s.id === "invest").canSave, false);
assert.equal(stepsFrom({}).find(s => s.id === "invest").href, MARKET_HREF);

// 3 CAST A VOTE: this session's ballot while it sits; otherwise a petition vote.
const sitting = { session: { state: "open" } };
assert.equal(by(stepsFrom({ assembly: { ...sitting, mine: null } })).vote, "todo");
assert.equal(by(stepsFrom({ assembly: { ...sitting, mine: { choice: "beach-resort" } } })).vote, "done");
assert.equal(stepsFrom({ assembly: sitting }).find(s => s.id === "vote").href, "#assembly");
const closed = { session: { state: "closed" }, mine: { choice: "x" } };
assert.equal(by(stepsFrom({ assembly: closed })).vote, "todo", "a closed session's ballot is last session's vote");
assert.equal(stepsFrom({ assembly: closed }).find(s => s.id === "vote").href, "#scores");
assert.equal(by(stepsFrom({ assembly: closed, petition: true })).vote, "done");

// 4 JOIN A LEAGUE: an entry or a draft; a file the leagues will not draft is not counted.
assert.equal(by(stepsFrom({ leagues: { eligible: true, entry: null } })).league, "todo");
assert.equal(by(stepsFrom({ leagues: { eligible: true, entry: { sports: [] } } })).league, "todo");
assert.equal(by(stepsFrom({ leagues: { eligible: true, entry: { sports: ["tennis"] } } })).league, "done");
assert.equal(by(stepsFrom({ leagues: { eligible: false, drafted: [{ sport: "soccer" }] } })).league, "done");
assert.equal(by(stepsFrom({ leagues: { eligible: false } })).league, "later");

// 5 PLAY A GAME: a filed chess game, or a tennis/golf result on this device.
assert.equal(by(stepsFrom({ chess: { w: 0, d: 0, l: 0 }, games: { tennis: 0, golf: 0 } })).play, "todo");
assert.equal(by(stepsFrom({ chess: { w: 0, d: 0, l: 1 } })).play, "done");
assert.equal(by(stepsFrom({ games: { tennis: 0, golf: 2 } })).play, "done");

// 6 the city: optional, never counted.
assert.equal(selfFindHref("HVI-TESTAAAA"), "#city?find=citizen-aaaa");
assert.equal(stepsFrom({}, CASE).find(s => s.id === "city").href, "#city?find=citizen-aaaa");

// Everything done -> complete; the optional step does not hold it back; "later" steps leave the count.
const all = { econ: { open: true, wallet: wallet({ positions: [{ industry: "sport" }] }) }, assembly: { ...sitting, mine: { choice: "x" } },
  leagues: { eligible: true, entry: { sports: ["soccer"] } }, chess: { w: 1, d: 0, l: 0 } };
let p = progressOf(stepsFrom(all, CASE));
assert.deepEqual([p.done, p.total, p.complete], [5, 5, true]);
assert.equal(p.next?.id, "city");
// A first-day file: allowance vesting, chose to save, voted, entered, played -> complete at 4 of 4.
p = progressOf(stepsFrom({ ...all, econ: { open: true, wallet: wallet({ enrolled: false, tray: { vesting: true } }) }, saved: true }, CASE));
assert.deepEqual([p.done, p.total, p.complete], [4, 4, true]);
p = progressOf(stepsFrom({ ...all, chess: null }, CASE));
assert.deepEqual([p.done, p.complete, p.next.id], [4, false, "play"]);
assert.equal(progressOf([]).complete, false);

// No window here: the device notes read as nothing, never throw.
assert.deepEqual(localGames(), { tennis: 0, golf: 0 });
assert.equal(noted(CASE, "save"), false);

// The market target is a route App.jsx serves; when #market lands, it should point there.
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.ok(app.includes(`routePath === "${MARKET_HREF}"`), `MARKET_HREF ${MARKET_HREF} is not a route in App.jsx`);
if (MARKET_HREF !== "#market" && app.includes(`routePath === "#market"`)) console.log("NOTE #market is a route now: point MARKET_HREF in src/firstDay.js at it.");

console.log("check-firstday: OK");

// Playtest 2026-10-10: a vesting file's first rows are things it can do; the intro agrees with the tally.
{
  const { introOf, shownOrder } = await import("../src/firstDay.js");
  const vest = stepsFrom({ econ: { open: true, wallet: wallet({ enrolled: false, tray: { vesting: true } }) } }, CASE);
  assert.equal(by(vest).invest, "later", "invest cannot be taken while the allowance vests");
  const req = shownOrder(vest.filter(s => !s.optional));
  assert.notEqual(req[0].status, "later");
  assert.ok(req.slice(-2).every(s => s.status === "later"), "later steps sink to the end");
  const total = progressOf(vest).total;
  assert.equal(total, 3);
  assert.match(introOf(total), /THREE THINGS/);
  assert.match(introOf(1), /ONE THING NOW/);
  assert.equal(by(stepsFrom({ saved: true, econ: { open: true, wallet: wallet({ enrolled: false, tray: { vesting: true } }) } })).invest, "done");
}
console.log("check-firstday: playtest order ok");
