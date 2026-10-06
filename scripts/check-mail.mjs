// DEPARTMENT MAIL (docs/design/COMMS.md layer 1; src/mail/, netlify/lib/mail-*.js, netlify/functions/mail.js)
// and its access points (MY FILE, the BEIGE PC, THE TERMINAL):
//   inbox ops     deliver once a date, never an id twice; read, unread, archive, delete (soft), restore,
//                 read-all; the trash empties after 30 days; 24-month retention; the cap
//   generation    the same events give the same letters, byte for byte; at most PER_DAY a day (+ the
//                 orientation letter once); one per kind; every sender one of the city's own; no quote
//                 marks; no figure on the roster signs a letter; every action one of the site's rooms
//   the rate      sixty real days of visits: never more than PER_DAY new letters a date
//   end to end    /api/mail with in-memory Blobs: a GET delivers, a second GET adds nothing, ops change
//                 flags only, there is no send; /api/purge removes the mail
//   the cafe      THE TERMINAL (src/city/terminal.js): the days before CAFE_DAY byte for byte the earlier
//                 code's (scripts/fixtures/terminal-pre.json); from it, attendants and visitors; the room,
//                 the tap, the building page
//   the PC        BEIGE PC in the catalog, the upgrade chain, playable at home (#mail?at=home); every flat
//                 shows one when its resident has none placed
// node scripts/check-mail.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

// ---- in-memory @netlify/blobs (get, getWithMetadata, setJSON with etags, delete, list) ----------------
globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true }; return next(spec, ctx); } });
const __warn = console.warn, __err = console.error; console.warn = console.error = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } else if (process.env.VERBOSE) console.log("  ok", msg); };
const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");

const MM = await import("../src/mail/mail.js");
const G = await import("../netlify/lib/mail-gen.js");
const SIM = await import("../src/city/sim.js");
const { baseRoster } = await import("../src/city/roster.js");
const { paperDate } = await import("../netlify/lib/paper-notices.js");
const edition = JSON.parse(read("scripts/fixtures/mail-edition.json"));
const DAY = 86400000;

// ---- inbox ops -----------------------------------------------------------------------------------------
{
  const t0 = Date.parse("2026-10-06T14:00:00Z");
  const L = (id, extra = {}) => ({ id, day: "2026-10-06", at: t0, kind: "paper", folder: "notices", from: { name: "X", addr: null }, subject: "S", body: ["B"], action: null, read: false, archived: false, deleted: 0, ...extra });
  let { inbox, added } = MM.deliver(null, "2026-10-06", [L("a"), L("b", { folder: "offers", at: t0 - 1 }), L("c", { folder: "inbox", at: t0 - 2 })], t0);
  ok(added === 3 && inbox.days[0] === "2026-10-06" && inbox.first === "2026-10-06", "a first delivery files three letters and remembers the date");
  const again = MM.deliver(inbox, "2026-10-06", [L("d")], t0);
  ok(again.added === 0 && again.inbox === inbox, "the same date is never delivered twice (a reload adds nothing)");
  const next = MM.deliver(inbox, "2026-10-07", [L("a"), L("e", { at: t0 + DAY })], t0 + DAY);
  ok(next.added === 1 && next.inbox.mail.filter(m => m.id === "a").length === 1, "an id already on file is never added twice");
  inbox = next.inbox;
  ok(MM.unreadIn(inbox) === 4 && MM.viewOf(inbox).counts.notices.unread === 2, "the unread count, per folder");
  let r = MM.applyOp(inbox, "read", "a", t0); ok(r.changed && r.inbox.mail.find(m => m.id === "a").read, "read");
  r = MM.applyOp(r.inbox, "unread", "a", t0); ok(!r.inbox.mail.find(m => m.id === "a").read, "unread");
  r = MM.applyOp(r.inbox, "archive", "b", t0); ok(MM.folderOf(r.inbox.mail.find(m => m.id === "b")) === "archive" && MM.viewOf(r.inbox).counts.archive.n === 1, "archive: into ARCHIVE, read");
  r = MM.applyOp(r.inbox, "unarchive", "b", t0); ok(MM.folderOf(r.inbox.mail.find(m => m.id === "b")) === "offers", "unarchive: back to its own folder");
  r = MM.applyOp(r.inbox, "delete", "c", t0); ok(!MM.viewOf(r.inbox).mail.some(m => m.id === "c") && r.inbox.mail.some(m => m.id === "c"), "delete is soft: gone from every folder, kept in the store");
  r = MM.applyOp(r.inbox, "restore", "c", t0); ok(MM.viewOf(r.inbox).mail.some(m => m.id === "c"), "restore brings it back");
  r = MM.applyOp(r.inbox, "readall", "notices", t0); ok(MM.viewOf(r.inbox).counts.notices.unread === 0 && MM.unreadIn(r.inbox) > 0, "read-all, one folder at a time");
  ok(MM.applyOp(r.inbox, "send", "a").error && MM.applyOp(r.inbox, "read", "nope").error, "no such operation (there is no send), no such letter");
  r = MM.applyOp(r.inbox, "delete", "c", t0);
  ok(MM.tidy(r.inbox, t0 + 29 * DAY).mail.some(m => m.id === "c") && !MM.tidy(r.inbox, t0 + 31 * DAY).mail.some(m => m.id === "c"), "the trash is emptied after 30 days");
  ok(!MM.tidy(r.inbox, t0 + MM.RETAIN_MS + DAY).mail.length, "nothing is kept past the file's 24 months");
  const many = Array.from({ length: MM.KEEP + 40 }, (_, i) => L(`m${i}`, { at: t0 - i }));
  ok(MM.tidy({ ...MM.newInbox(), mail: many }, t0).mail.length === MM.KEEP && MM.tidy({ ...MM.newInbox(), mail: many }, t0).mail[0].id === "m0", `at most ${MM.KEEP} letters, the newest kept`);
  ok(Object.keys(MM.viewOf(inbox).mail[0]).sort().join() === "action,archived,at,body,day,folder,from,id,kind,read,subject", "the view sends the letter and its flags, nothing of the store");
  ok(MM.validAction({ label: "GO", href: "#city/coast/sams-pizza" }) && !MM.validAction({ label: "GO", href: "https://evil.example" }) && !MM.validAction({ label: "GO", href: "javascript:alert(1)" }), "an action is one of the site's own rooms, never off-site");
}

// ---- generation ----------------------------------------------------------------------------------------
const CASE = "HVI-TESTMA0T";   // a test file (never Scott's)
const rec = { history: [{ score: 512, tier: "TOLERATED", at: "2026-10-01T00:00:00Z" }] };
const { apartmentOf } = await import("../netlify/lib/economy.js");
const apt = apartmentOf(CASE, rec);
const baseE = (date, extra = {}) => {
  const nowMs = Date.parse(`${date}T15:00:00Z`), clock = SIM.machineClock(nowMs);
  return { caseId: CASE, date, nowMs, machineDay: clock.day, mt: clock.mt, first: false, edition, holdings: [], apartment: apt, shopPicks: [{ handle: "eb-tee", title: "EB Bolt Tee", price: "28.00" }], hunt: { day: clock.day - 1, top: { score: 4210 } }, ...extra };
};
{
  ok(apt && apt.buildingName, `the test file has a flat (${apt?.buildingName}, ${apt?.unit})`);
  const E = baseE("2026-10-06", { first: true, holdings: [{ slug: "test-figure", name: "A LISTED HUMAN", units: 12, price: 41.5, chg: -0.082, why: "A BAD WEEK AT THE PIT. THE FLOOR SOLD." }] });
  const a = G.lettersFor(E), b = G.lettersFor(structuredClone(E));
  ok(JSON.stringify(a) === JSON.stringify(b), "the same events give the same letters, byte for byte");
  ok(a[0].kind === "welcome" && a.length === MM.PER_DAY + 1, `the first day: the orientation letter and ${MM.PER_DAY} more (${a.map(m => m.kind).join(", ")})`);
  ok(/YOUR FIRST DAY/.test(a[0].subject) && a[0].body.some(p => /COLLECT YOUR CYCLES/.test(p)) && a[0].body.some(p => /JOIN A LEAGUE/.test(p)), "the orientation letter is the first-day checklist in writing");
  ok(a.some(m => m.kind === "market" && /DOWN/.test(m.subject) && m.body.some(p => /^BECAUSE: /.test(p)) && m.action.href === "#market/test-figure"), "a big move in a holding: a letter with the because, to the listing");
  ok(new Set(a.map(m => m.kind)).size === a.length, "one letter per kind a day");
  ok(G.lettersFor({ ...E, first: false }).length === MM.PER_DAY, "after the first day, at most PER_DAY");

  // across sixty days: the senders, the quotes, the living, the actions, the job offers, the letters
  const roster = new Set(baseRoster().map(f => f.name.toUpperCase()));
  let all = [], perDay = 0, jobs = 0, kinds = new Set(), neighbours = new Set();
  let dupes = 0;
  const seen = new Set();   // the file's post so far: what was delivered is not delivered again
  for (let d = 0; d < 60; d++) {
    const date = new Date(Date.parse("2026-10-06T12:00:00Z") + d * DAY).toISOString().slice(0, 10);
    const L = G.lettersFor(baseE(date, { seen }));
    for (const m of L) { if (seen.has(m.id)) dupes++; seen.add(m.id); }
    perDay = Math.max(perDay, L.length);
    for (const m of L) { all.push(m); kinds.add(m.kind); if (m.kind === "job") jobs++; if (m.kind === "letter" && m.id.startsWith("neighbour")) neighbours.add(m.from.name); }
  }
  ok(dupes === 0, `sixty days of post, every letter new (${seen.size} letters)`);
  ok(perDay <= MM.PER_DAY, `no day brings more than ${MM.PER_DAY} (the most: ${perDay})`);
  ok(all.every(m => G.SENDERS.has(m.from.name)), `every letter is signed by the Department's offices or the city's own characters (${[...new Set(all.map(m => m.from.name))].length} senders)`);
  ok(all.every(m => !roster.has(m.from.name.toUpperCase()) && !roster.has(m.from.name.replace(/^(MRS?|MS)\. /, ""))), "no figure on the roster ever signs a letter (a living person never writes)");
  ok(G.NEIGHBOURS.every(n => !roster.has(n.replace(/^(MRS?|MS)\. /, ""))), "the neighbours are invented: none shares a name with a figure on file");
  ok(all.every(m => ![m.subject, ...m.body].some(s => /["“”«»]/.test(s))), "no letter carries a quotation mark (nobody is quoted)");
  ok(all.every(m => !m.action || MM.validAction(m.action)), "every action is one of the site's own rooms");
  ok(all.every(m => MM.FOLDERS.includes(m.folder)), "every letter files into INBOX, OFFERS or NOTICES");
  ok(jobs > 10 && all.some(m => m.kind === "job" && /IS HIRING A DRONE (DISPATCHER|MECHANIC)/.test(m.subject) && m.body[0].includes("YOUR FILE WAS NOT CONSIDERED, BUT YOU MAY APPLY.")), `job offers from the city's real openings: the drones' depot hires (${jobs} offers in 60 days)`);
  for (const k of ["paper", "job", "shop", "assembly", "tournament", "record", "letter"]) ok(kinds.has(k), `in sixty days the post includes ${k}`);
  ok(all.some(m => m.from.name.endsWith(", EBSN") && /EB SHOP/.test(m.body[0])) && all.some(m => /^PREFECT /.test(m.from.name)) && neighbours.size >= 1, `letters from the hosts (a real shop pick), the prefects and the neighbours (${neighbours.size} neighbours)`);
  ok(neighbours.size <= 3, "a file hears from the same few neighbours");
  const rec2 = G.lettersFor(baseE("2026-10-06", { caseId: "HVI-AAAA0TST" }));
  const hon = G.lettersFor(baseE("2026-10-08", { honours: [{ id: "golf-daily-2026-10-07", name: "THE ROUTINE INSPECTION", line: "WON THE ROUTINE INSPECTION, 31 STROKES", place: 1, div: "open" }] }));
  ok(hon.some(m => m.kind === "honour" && m.folder === "inbox" && /YOUR RESULT: THE ROUTINE INSPECTION, PLACE 1/.test(m.subject)), "a tournament result of the file's own is a personal letter");
  ok(all.some(m => m.id.startsWith("tourney-") && /^YOU ARE INVITED: /.test(m.subject) && /^#(golf|bowling|fish)\?t=/.test(m.action.href)), "invitations to the open tournaments, from the calendar, one tap to enter");
  ok(rec2.some(m => m.kind === "record" && /YOUR STRIPED BASS IS ON THE PLAQUE/.test(m.subject)) || G.lettersFor(baseE("2026-10-07", { caseId: "HVI-AAAA0TST" })).some(m => m.kind === "record" && m.folder === "inbox"), "a record the file holds is its own letter, in the inbox");
  const sameSession = [G.lettersFor(baseE("2026-10-06")), G.lettersFor(baseE("2026-10-07"))].flat().filter(m => m.kind === "assembly" && /SITS/.test(m.subject));
  ok(sameSession.every(m => m.id === "assembly-002-open"), "a sitting of the Assembly is one letter however many days it sits (a stable id)");
  ok(!G.lettersFor(baseE("2026-10-07", { seen: new Set(["assembly-002-open"]) })).some(m => m.id === "assembly-002-open"), "and once on file it gives its place in the day to something new");
  ok(G.lettersFor(baseE("2026-10-06", { edition: null, shopPicks: [], hunt: null, apartment: null })).length >= 1, "with the paper and the shop silent, the post is thinner, never invented");
}

// ---- end to end: /api/mail and /api/purge -----------------------------------------------------------------
{
  const blobs = globalThis.__blobs;
  const put = (store, key, v) => { if (!blobs.has(store)) blobs.set(store, new Map()); blobs.get(store).set(key, { data: v, etag: "seed" }); };
  const id = "HVI-TESTMA2L";
  put("hvi-cases", id, { caseId: id, history: [{ score: 600, tier: "TOLERATED", at: new Date().toISOString() }], transcripts: [] });
  const today = paperDate(Date.now());
  put("hvi-paper", `e/${today}`, { ...edition, date: today });
  put("funnels", "shop", { at: Date.now(), items: [{ handle: "eb-tee", title: "EB Bolt Tee", price: "28.00" }] });
  const fn = (await import("../netlify/functions/mail.js")).default;
  const req = (method, q = "", body = null) => new Request(`https://humanvalueindex.com/api/mail${q}`, { method, headers: { "content-type": "application/json", origin: "https://humanvalueindex.com" }, body: body ? JSON.stringify(body) : undefined });
  let r = await fn(req("GET", `?caseId=${id}`), {}); let v = await r.json();
  ok(r.status === 200 && v.mail.length >= 2 && v.mail.length <= MM.PER_DAY + 1 && v.unread === v.mail.length, `the first look delivers the day's post (${v.mail.length} letters, all unread)`);
  ok(v.mail.some(m => m.kind === "welcome") && v.mail.some(m => m.kind === "paper"), "the orientation letter and the day's paper");
  r = await fn(req("GET", `?caseId=${id}`), {}); const v2 = await r.json();
  ok(v2.mail.length === v.mail.length, "a second look the same day adds nothing");
  r = await fn(req("GET", `?caseId=${id}&count=1`), {}); const c = await r.json();
  ok(c.unread === v.unread && Object.keys(c).join() === "unread", "count=1 answers the unread count only");
  const first = v.mail[0].id;
  r = await fn(req("POST", "", { caseId: id, op: "read", id: first }), {}); v = await r.json();
  ok(r.status === 200 && v.mail.find(m => m.id === first).read && v.unread === c.unread - 1, "POST read: one fewer unread");
  r = await fn(req("POST", "", { caseId: id, op: "delete", id: first }), {}); v = await r.json();
  ok(!v.mail.some(m => m.id === first), "POST delete: gone from the view");
  r = await fn(req("POST", "", { caseId: id, op: "send", id: first, to: "HVI-OTHER", body: "hi" }), {});
  ok(r.status === 400, "there is no send: a write that is not a flag is refused");
  r = await fn(req("GET", `?caseId=HVI-NOSUCH22`), {});
  ok(r.status === 404, "no file, no post");
  ok(blobs.get("hvi-mail")?.has(`c:${id}`), "the inbox is on file under the case");
  const purge = (await import("../netlify/functions/purge.js")).default;
  r = await purge(new Request("https://humanvalueindex.com/api/purge", { method: "POST", headers: { "content-type": "application/json", origin: "https://humanvalueindex.com" }, body: JSON.stringify({ caseId: id, confirm: id }) }), {});
  ok(!blobs.get("hvi-mail")?.has(`c:${id}`), `the purge removes the mail (purge answered ${r.status})`);
  ok(read("netlify/lib/prune.js").includes("await deleteMail(id)"), "the 24-month sweep removes it too");
  ok(/Department mail/.test(read("docs/legal/privacy.md")), "the privacy policy says what is kept and for how long");
}

// ---- THE TERMINAL: the day boundary, the staff, the visitors, the room ----------------------------------------
{
  const T = await import("../src/city/terminal.js");
  const { synthRoster } = await import("./synth-roster.mjs");
  const fx = JSON.parse(read("scripts/fixtures/terminal-pre.json"));
  const D = T.CAFE_DAY;
  ok(fx.cafeDay === D, `the fixture was made for CAFE_DAY ${D} (it says ${fx.cafeDay})`);
  const pl = SIM.PLACES[T.CAFE_ID], b = SIM.BUILDING[T.CAFE_BUILDING];
  ok(pl && pl.shell && pl.from === D && b.places.join() === T.CAFE_ID && /TERMINAL/.test(b.name), `the old pizza counter is THE TERMINAL (${b?.name}), the same place and building ids`);
  const roster = synthRoster(fx.n); SIM.setRoster(roster);
  const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  const whereSha = (day) => { const out = []; for (const s of roster) for (let m = 0; m < 1440; m += 30) { const w = SIM.whereAt(s, (day - 1) * 24 + m / 60); out.push(`${w.placeId}|${w.sub || ""}|${w.x.toFixed(5)}|${w.y.toFixed(5)}`); } return sha(out.join("\n")); };
  for (const d of [D - 2, D - 1]) {
    ok(sha(JSON.stringify(SIM.buildPlan(d))) === fx.plans[d], `day ${d}'s plan is byte for byte the earlier code's (a published day is never changed)`);
    ok(whereSha(d) === fx.where[d], `day ${d}: everyone where the earlier code put them, every half hour`);
  }
  const plan = SIM.buildPlan(D), ci = plan.places.indexOf(T.CAFE_ID);
  ok(sha(JSON.stringify(plan)) !== fx.plans[D] && ci >= 0 && !SIM.buildPlan(D - 1).places.includes(T.CAFE_ID), "the cafe is in the plans from its day, and not before");
  let work = 0, visit = 0;
  for (const row of Object.values(plan.subjects)) for (const seg of row.slice(1)) if (seg.length > 2 && seg[1] === ci) { if (seg[2] === 1) work++; else visit++; }
  ok(work > 0 && visit > 0, `day ${D}: ${work} shifts and ${visit} visits at THE TERMINAL`);
  let wrong = 0, before = 0;
  for (const s of roster) {
    const job = SIM.JOB[SIM.assignJob(s).jobId];
    const on = (day) => SIM.schedule(s, day).some(g => g.activity === "work" && g.placeId === T.CAFE_ID);
    if ((on(D) || on(D + 1)) && !T.CAFE_STAFF.some(p => p.from.includes(job.id))) wrong++;
    if (on(D - 1)) before++;
  }
  ok(wrong === 0 && before === 0 && !SIM.JOBS.some(j => j.place === T.CAFE_ID) && SIM.JOB["cafe-attendant"], "the attendants come from their pools, only from the day; assignment is untouched");
  globalThis.window = globalThis.window || {};
  const P = await import("../src/city/props.js");
  ok(P.typeOf(T.CAFE_ID) === "terminal", "furnished as the internet cafe");
  const rp = P.roomPlan("terminal", 400, 120, 32, 10);
  const kinds = rp.anchors.map(a => `${a.role}:${a.act}`), props = rp.rows.flatMap(r => r.items.map(i => i.prop));
  ok(kinds.includes("staff:serve") && kinds.includes("patron:type") && props.filter(p => p === "beigePc").length >= 3 && props.includes("coffeeCounter"), `rows of beige PCs and a coffee counter (${[...new Set(kinds)].join(", ")})`);
  const F = await import("../src/city/funnelProps.js");
  ok(F.funnelTapAt(T.CAFE_ID, rp, 10, 10)?.go === "#mail?at=terminal", "a tap in the room sits you at a public PC: DEPARTMENT MAIL");
  ok(/"sams-pizza": \[[^\]]*"#mail\?at=terminal"/.test(read("src/city/BuildingView.jsx")), "the building page says USE A PC");
}

// ---- the PC in your flat, MY FILE, the route ------------------------------------------------------------------
{
  const SH = await import("../src/economy/shops.js");
  const FURN = await import("../src/city/furniture.js");
  ok(FURN.CATALOG["beige-pc"] && SH.FURNITURE_PRICES["beige-pc"] <= 200 && SH.FURN_SECTIONS.some(([, l]) => l.includes("beige-pc")), "the BEIGE PC is in the catalog, cheap, at EASTGATE HOME");
  ok(SH.UPGRADES["beige-pc"] === "gaming-rig" && SH.UPGRADES["gaming-rig"] === "server-rack" && SH.UPGRADE_ONLY.has("server-rack"), "BEIGE PC -> GAMING RIG -> SERVER RACK");
  ok(["beige-pc", "gaming-rig", "server-rack"].every(id => SH.PLAY_AT_HOME[id]?.go?.startsWith("#mail?at=home")), "each opens the desktop at home");
  const unit = { id: "u", rooms: [{ id: "u:living", purpose: "living" }, { id: "u:study", purpose: "study" }] };
  const look = { rooms: { "u:living": { furniture: [] }, "u:study": { furniture: [{ item: "desk", x: 0.5 }] } } };
  const L1 = SH.withIssuedPc(look, unit);
  ok(L1.rooms["u:study"].furniture.some(f => f.item === "beige-pc" && f.placed), "a flat with no PC placed shows the issued BEIGE PC in the study");
  const L2 = SH.withIssuedPc(SH.furnishLook(look, [{ room: "u:living", spot: "f1", item: "gaming-rig" }]), unit);
  ok(!L2.rooms["u:study"].furniture.some(f => f.item === "beige-pc"), "one the resident placed (or upgraded) replaces it");
  const app = read("src/App.jsx"), intake = read("src/Intake.jsx");
  ok(/routePath === "#mail"/.test(app) && /lazy\(\(\) => import\("\.\/mail\/Mail\.jsx"\)\)/.test(app), "#mail is its own lazy chunk");
  ok(/<MyMail caseId=\{caseId\} \/>/.test(intake), "MY FILE carries the mail's line (no new nav tab)");
  const mailJsx = read("src/mail/Mail.jsx");
  ok(!/alert\(|window\.open|Notification|confirm\(/.test(mailJsx), "no pop-ups: the unread count is the only notice");
  ok(/role="toolbar"/.test(mailJsx) && /aria-current/.test(mailJsx) && /ArrowDown/.test(mailJsx) && /aria-label=\{`\$\{m\.read \? "" : "Unread\. "\}/.test(mailJsx), "the client: a toolbar, folders and rows with their state, arrow keys, rows named for screen readers");
  ok(!/from "\.\.\/\.\.\/netlify|mail-gen/.test(mailJsx), "the client never bundles the generator");
}

console.warn = __warn; console.error = __err;
console.log(`check-mail: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
