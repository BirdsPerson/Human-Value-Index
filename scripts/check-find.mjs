// FIND (city search + FIND ME) checks. Pure node, no DOM.
//   node scripts/check-find.mjs
// The matcher (accents, qualifiers, ranking, the top eight), the deep link's slug, and the
// find target at work, riding the Loop, at home (asleep at night), and inside a cutaway floor.
import { baseRoster } from "../src/city/roster.js";
import { setRoster, whereAt, keyOf, BUILDING, PLACES, TRAIN, lineTrainsAt as trainsAt, machineClock } from "../src/city/sim.js";   // every line's trains
import { roomIn } from "../src/city/simApi.js";
import { fold, buildIndex, searchIndex, bySlug, findTarget, findLine, whereShort, findHref, asleepAt } from "../src/city/find.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL ${m}`); } return c; };

// A roster like the live one: the figures on file, census arrivals (an accent, a qualifier,
// namesakes), and the viewer's own citizen file.
const base = baseRoster();
const like = (i, extra) => ({ ...base[i % base.length], qualifier: undefined, ...extra });
const census = [
  like(3, { name: "Snoop Dogg", slug: "snoop-dogg", kind: "figure" }),
  like(5, { name: "André 3000", slug: "andre-3000", kind: "figure", qualifier: "rapper" }),
  like(7, { name: "Andre Agassi", slug: "andre-agassi", kind: "figure" }),
  like(8, { name: "Andrew Bell", slug: "andrew-bell", kind: "figure" }),
  like(9, { name: "Jack Johnson", slug: "jack-johnson-boxer", qualifier: "boxer", kind: "figure" }),
  like(11, { name: "Jack Johnson", slug: "jack-johnson-musician", qualifier: "musician", kind: "figure" }),
  like(13, { name: "Subject 7f3a", slug: "citizen-7f3a", kind: "citizen", you: true, caseId: "HVI-TEST-7F3A" }),
];
const roster = [...base, ...census];
setRoster(roster);
const index = buildIndex(roster);

// 1. fold: accents off, case off, punctuation to spaces
ok(fold("André 3000") === "andre 3000", `fold accent: ${fold("André 3000")}`);
ok(fold("  O'Neal, Shaq ") === "o neal shaq", "fold punctuation");
ok(fold("") === "" && fold(null) === "", "fold empty");

// 2. the index: one entry per subject, display names carry qualifiers
ok(index.length === new Set(roster.map(keyOf)).size, "index: one entry per key");
ok(index.some(e => e.name === "Jack Johnson (boxer)") && index.some(e => e.name === "Jack Johnson (musician)"), "index: namesakes keep qualifiers");

// 3. search
const names = (q, n) => searchIndex(index, q, n).map(e => e.name);
ok(names("snoop")[0] === "Snoop Dogg", `snoop -> ${names("snoop")}`);
ok(/^Andr[eé] /.test(names("andre")[0]) && names("andre").indexOf("Andrew Bell") > 1, `andre: whole word before Andrew -> ${names("andre")}`);
ok(names("andre").includes("André 3000 (rapper)") && names("andre").includes("Andre Agassi"), `andre finds both: ${names("andre")}`);
ok(names("ANDRÉ 3000")[0] === "André 3000 (rapper)", `accented, upper: ${names("ANDRÉ 3000")}`);
ok(names("rapper")[0] === "André 3000 (rapper)", "qualifier is searchable");
ok(names("jack boxer")[0] === "Jack Johnson (boxer)", `multi-word prefix: ${names("jack boxer")}`);
ok(names("dogg")[0] === "Snoop Dogg", "a later word's start");
ok(names("oop")[0] === "Snoop Dogg", "substring, last resort");
ok(names("").length === 0 && names("   ").length === 0, "empty query -> nothing");
ok(names("zzzqqq").length === 0, "no match -> nothing");
ok(searchIndex(index, "a").length === 8, "top eight only");
ok(searchIndex(index, "a", 3).length === 3, "n respected");
ok(names("subject")[0] === "Subject 7f3a", "your own file is findable");

// 4. the deep link: #city?find=<slug>, keeping ?at=, dropping a stale floor
ok(findHref("snoop-dogg") === "#city?find=snoop-dogg", findHref("snoop-dogg"));
ok(findHref("snoop-dogg", "?at=10:00&floor=2&find=old") === "#city?at=10%3A00&find=snoop-dogg", findHref("snoop-dogg", "?at=10:00&floor=2&find=old"));
ok(bySlug(index, "snoop-dogg")?.name === "Snoop Dogg", "bySlug");
ok(bySlug(index, "SNOOP-DOGG")?.name === "Snoop Dogg", "bySlug ignores case");
ok(bySlug(index, "nobody-here") === null && bySlug(index, "") === null, "bySlug miss");
ok(bySlug(index, "citizen-7f3a")?.s.you === true, "FIND ME's subject by its citizen slug");

// 5. find targets over two machine days, every subject: every mode is met and consistent
const mt0 = Math.floor(machineClock(Date.parse("2026-09-29T12:00:00Z")).mt / 24) * 24;
const seen = { work: 0, riding: 0, home: 0, asleep: 0, inside: 0, platform: 0, street: 0 };
let checked = 0;
for (const e of index) {
  for (let h = 0; h < 48; h += 0.25) {
    const mt = mt0 + h, t = findTarget(e.s, mt), w = whereAt(e.s, mt);
    checked++;
    const line = findLine(e.s, t, mt);
    if (!ok(line.includes(" — ") && line.endsWith("."), `line shape ${e.key}@${h}: ${line}`)) break;
    if (!ok(typeof whereShort(t, mt) === "string", "whereShort")) break;
    if (t.mode === "riding") {
      seen.riding++;
      ok(w.sub === "riding" && TRAIN[t.trainId] && t.car >= 0 && t.car < TRAIN[t.trainId].cars, `riding ${e.key}@${h}`);
      // the camera follows the car they are in: the census point is that car's
      const car = trainsAt(mt).find(tr => tr.id === t.trainId)?.cars[t.car];
      ok(car && Math.hypot(car.x - t.x, car.y - t.y) < 0.05, `riding ${e.key}@${h}: car at (${car?.x},${car?.y}), subject at (${t.x},${t.y})`);
      ok(/^.+ — ABOARD (LOOP|SHORE LINE|ALPINE LINE|WEST LINE|CENTRAL LINE|EAST LINE) \d+, CAR \d, BOUND FOR .+\./.test(line), `riding line: ${line}`);
    } else if (t.mode === "inside") {
      seen.inside++;
      const b = BUILDING[t.buildingId], f = b?.floors[t.floor];
      // the cutaway opens on their floor and room: that room is on that floor
      ok(b && f && f.places.includes(t.placeId), `inside ${e.key}@${h}: ${t.placeId} on ${t.buildingId} floor ${t.floor}`);
      const r = roomIn(w, e.s);
      ok(r && r.buildingId === t.buildingId && r.floor === t.floor && r.placeId === t.placeId && r.mode === "here", `inside agrees with roomIn ${e.key}@${h}`);
      ok(t.x === b.pos.x && t.y === b.pos.y, "inside: the camera goes to the building");
      if (w.activity === "work") { seen.work++; ok(line.includes("ON SHIFT"), `work line: ${line}`); }
      if (w.activity === "home") {
        seen.home++;
        ok(PLACES[t.placeId].kind === "home", `home is a home: ${t.placeId}`);
        if (asleepAt(mt)) { seen.asleep++; ok(line.includes("ASLEEP"), `asleep line: ${line}`); }
        else ok(line.includes("AT HOME"), `home line: ${line}`);
      }
    } else if (t.mode === "platform") {
      seen.platform++;
      ok(t.stationId && (w.sub === "waiting" || w.sub === "alighting"), `platform ${e.key}@${h}`);
    } else if (t.mode === "street") {
      seen.street++;
      ok(w.activity === "commute" && w.sub === "walking" && Number.isFinite(t.x) && Number.isFinite(t.y), `street ${e.key}@${h}`);
    } else if (t.mode === "classified") {
      ok(/^hq/.test(t.buildingId) && line.includes("CLASSIFIED"), `classified ${e.key}@${h}`);
    } else ok(false, `unknown mode ${t.mode}`);
  }
}
for (const [k, n] of Object.entries(seen)) ok(n > 0, `mode never met in two days: ${k}`);

console.log(`check-find: ${checked} targets, ${JSON.stringify(seen)}`);
if (fails) { console.log(`check-find: ${fails} FAILED`); process.exit(1); }
console.log("check-find: OK");
