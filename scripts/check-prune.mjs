// The daily retention sweep (netlify/lib/prune.js) against fixtures: which case files,
// accounts, counters, tokens and requests go, which stay, dry run writes nothing, and a
// tight budget resumes from the cursor. In-memory Blobs. Run: node scripts/check-prune.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { if (globalThis.__slow) await new Promise(r => setTimeout(r, globalThis.__slow)); return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    list({ prefix = "", paginate } = {}) {
      // Real Blobs does not promise order; hand keys back reversed, two pages.
      const keys = [...s.keys()].filter(k => k.startsWith(prefix)).reverse().map(key => ({ key }));
      const pages = [{ blobs: keys.slice(0, 3), directories: [] }, { blobs: keys.slice(3), directories: [] }];
      if (paginate) return (async function* () { yield* pages; })();
      return Promise.resolve({ blobs: keys, directories: [] });
    },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = console.log = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

process.env.HVI_OWNER_CASES = "HVI-OWNERAAA";   // the owner's case comes from the environment (lib/auth.js)
const { prune, lastActivity, bucketEnd, isRawIpKey, requestDate } = await import("../netlify/lib/prune.js");
const { getStore } = await import("@netlify/blobs");
const S = name => getStore({ name });
const NOW = Date.parse("2026-09-29T12:00:00Z");
const iso = t => new Date(t).toISOString();
const DAY = 86_400_000;
const has = (store, k) => globalThis.__blobs.get(store)?.has(k) ?? false;

// ---- pure rules ----
assert.equal(lastActivity({ created: "2024-01-01T00:00:00Z", history: [{ at: "2024-02-01T00:00:00Z" }, { at: "2026-01-01T00:00:00Z", kind: "recalibration" }, { at: "2026-02-01T00:00:00Z", cause: "review" }] }), Date.parse("2024-02-01T00:00:00Z"), "Department changes are not the subject's activity");
assert.equal(lastActivity({ created: "2020-01-01T00:00:00Z", quests: { done: [{ at: "2026-03-01T00:00:00Z" }] } }), Date.parse("2026-03-01T00:00:00Z"), "a directive counts");
assert.equal(lastActivity({ history: [{ at: "2025-01-01T00:00:00Z", cause: "vouch" }] }), Date.parse("2025-01-01T00:00:00Z"));
assert.equal(lastActivity({ history: [] }), null, "an undated file has no activity date");
assert.equal(bucketEnd("2026-09:refer-case:HVI-X"), Date.parse("2026-10-01T00:00:00Z"));
assert.equal(bucketEnd("2026-12:refer-case:HVI-X"), Date.parse("2027-01-01T00:00:00Z"));
assert.equal(bucketEnd("2026-09-20:global-anthropic"), Date.parse("2026-09-21T00:00:00Z"));
assert.equal(bucketEnd("2026-09-20T23:file-ip:0123456789abcdef"), Date.parse("2026-09-21T00:00:00Z"));
assert.equal(bucketEnd("2026-09-20T10:59:evaluate-ip:0123456789abcdef"), Date.parse("2026-09-20T11:00:00Z"));
assert.equal(bucketEnd("index"), null);
assert.ok(isRawIpKey("2026-09-29:session-ip:203.0.113.9"));
assert.ok(isRawIpKey("2026-09-29T10:15:evaluate-ip:2001:db8:1:2::/64"));
assert.ok(isRawIpKey("2026-09-29:evaluate-ip-day:unknown"));
assert.ok(!isRawIpKey("2026-09-29:session-ip:0123456789abcdef"));
assert.ok(!isRawIpKey("2026-09-29T10:login-email:" + "a".repeat(64) + ":2"));
assert.ok(!isRawIpKey("2026-09-29:session-case:HVI-7Q2M4K9D"));
assert.equal(requestDate("req-2024-09-01-abcd1234:mailed"), Date.parse("2024-09-01T00:00:00Z"));
assert.equal(requestDate("TEST"), null);

// ---- fixtures ----
async function seed() {
  globalThis.__blobs = new Map();
  const cases = S("hvi-cases"), pen = S("hvi-pen"), acc = S("hvi-accounts"), auth = S("hvi-auth"), lim = S("hvi-limits"), req = S("hvi-requests");
  const old = iso(NOW - 800 * DAY), recent = iso(NOW - 30 * DAY), edge = iso(NOW - 700 * DAY);
  const file = (id, at, extra = {}) => cases.setJSON(id, { caseId: id, created: at, history: [{ at, score: 500 }], ...extra });
  await file("HVI-OLDAAAAA", old);                                                      // expired, unsecured
  await file("HVI-OLDBBBBB", old);                                                      // expired, account's only file
  await file("HVI-OLDCCCCC", old);                                                      // expired, account keeps another
  await file("HVI-NEWCCCCC", recent);
  await file("HVI-EDGEAAAA", edge);                                                     // 23 months: kept
  await file("HVI-RECALAAA", old, { history: [{ at: old, score: 1 }, { at: recent, score: 2, kind: "recalibration" }] }); // only the Department touched it: expired
  await file("HVI-QUESTAAA", old, { quests: { active: null, done: [{ id: "q", at: recent }] } });                     // a recent directive keeps it
  await cases.setJSON("HVI-UNDATEDA", { caseId: "HVI-UNDATEDA", history: [] });          // no date: never expired on a guess
  await file("HVI-OWNERAAA", old);                                                      // the owner's file never expires
  await cases.setJSON("not-a-case", { junk: true });
  for (const id of ["HVI-OLDAAAAA", "HVI-NEWCCCCC"]) await pen.setJSON(`citizen:${id}`, { updated: old });
  await pen.setJSON("index", { cards: [{ key: "citizen:HVI-OLDAAAAA" }, { key: "citizen:HVI-NEWCCCCC" }] });
  await acc.setJSON("acct-b", { email: "b@example.com", cases: ["HVI-OLDBBBBB"] });
  await acc.setJSON("case:HVI-OLDBBBBB", { acct: "acct-b" });
  await acc.setJSON("acct-c", { email: "c@example.com", cases: ["HVI-OLDCCCCC", "HVI-NEWCCCCC"] });
  await acc.setJSON("case:HVI-OLDCCCCC", { acct: "acct-c" });
  await acc.setJSON("case:HVI-NEWCCCCC", { acct: "acct-c" });
  await auth.setJSON("tok:expired", { email: "x@example.com", exp: NOW - 1000, used: true });
  await auth.setJSON("tok:live", { email: "y@example.com", exp: NOW + 60_000, used: false });
  await auth.setJSON("tok:b", { email: "b@example.com", exp: NOW + 60_000, used: false });   // goes with account b
  await auth.setJSON("sess:old", { acct: "acct-c", exp: NOW - DAY });
  await auth.setJSON("sess:live", { acct: "acct-c", exp: NOW + DAY });
  await auth.setJSON("verify-at", { at: NOW });
  const h = "0123456789abcdef";
  for (const k of [`2026-09-01:session-ip:${h}`, `2026-09-21T11:file-ip:${h}`, `2026-09-21T11:59:evaluate-ip:${h}`, "2026-08:refer-case:HVI-NEWCCCCC", "2026-09-21:global-anthropic"]) await lim.setJSON(k, { count: 1 }); // stale
  for (const k of [`2026-09-29:session-ip:${h}`, `2026-09-23:score-ip:${h}`, "2026-09:refer-case:HVI-NEWCCCCC", "2026-09-22T12:login-email:abc:1"]) await lim.setJSON(k, { count: 1 }); // kept
  for (const k of ["2026-09-29:session-ip:203.0.113.9", "2026-09-29T10:15:evaluate-ip:2001:db8:1:2::/64"]) await lim.setJSON(k, { count: 1 }); // raw IP: gone today
  await lim.setJSON("mystery", { count: 1 });
  await req.setJSON("req-2024-09-01-aaaaaaaa", { at: "2024-09-01" });
  await req.setJSON("req-2024-09-01-aaaaaaaa:mailed", { at: "2024-09-01" });
  await req.setJSON("req-2024-10-15-bbbbbbbb", { at: "2024-10-15" });                 // under 24 months
  await req.setJSON("req-2026-09-29-cccccccc", { at: "2026-09-29", file: "TEST" });
}
const snapshot = () => JSON.stringify([...globalThis.__blobs].filter(([, m]) => m.size).map(([n, m]) => [n, [...m.keys()].sort()]));

// ---- dry run writes nothing ----
await seed();
const before = snapshot();
const dry = await prune({ now: NOW, dryRun: true });
assert.equal(snapshot(), before, "dry run changed the stores");
assert.equal(dry.cases.expired, 4);
assert.equal(dry.cases.undated, 1);
assert.equal(dry.limits.stale, 5);
assert.equal(dry.limits.rawIp, 2);
assert.equal(dry.requests.expired, 2);
assert.equal(dry.auth.tokens, 1);
assert.equal(dry.auth.sessions, 1);
assert.equal(dry.done, true);

// ---- the real run ----
const r = await prune({ now: NOW });
assert.equal(r.errors, 0);
assert.equal(r.done, true);
for (const id of ["HVI-OLDAAAAA", "HVI-OLDBBBBB", "HVI-OLDCCCCC", "HVI-RECALAAA"]) assert.ok(!has("hvi-cases", id), `${id} should be gone`);
for (const id of ["HVI-NEWCCCCC", "HVI-EDGEAAAA", "HVI-QUESTAAA", "HVI-UNDATEDA", "HVI-OWNERAAA", "not-a-case"]) assert.ok(has("hvi-cases", id), `${id} should stay`);
assert.ok(!has("hvi-pen", "citizen:HVI-OLDAAAAA"));
assert.deepEqual((await S("hvi-pen").get("index")).cards.map(c => c.key), ["citizen:HVI-NEWCCCCC"]);
assert.ok(!has("hvi-accounts", "acct-b"), "an account left with no files is deleted");
assert.ok(!has("hvi-accounts", "case:HVI-OLDBBBBB"));
assert.ok(!has("hvi-auth", "tok:b"), "and so are its sign-in links");
assert.deepEqual((await S("hvi-accounts").get("acct-c")).cases, ["HVI-NEWCCCCC"], "an account with another file keeps it");
assert.ok(!has("hvi-accounts", "case:HVI-OLDCCCCC"));
assert.ok(!has("hvi-auth", "tok:expired") && has("hvi-auth", "tok:live"));
assert.ok(!has("hvi-auth", "sess:old") && has("hvi-auth", "sess:live") && has("hvi-auth", "verify-at"));
assert.deepEqual([...globalThis.__blobs.get("hvi-limits").keys()].sort(), ["2026-09-22T12:login-email:abc:1", "2026-09-23:score-ip:0123456789abcdef", "2026-09-29:session-ip:0123456789abcdef", "2026-09:refer-case:HVI-NEWCCCCC", "mystery"]);
assert.deepEqual([...globalThis.__blobs.get("hvi-requests").keys()].sort(), ["req-2024-10-15-bbbbbbbb", "req-2026-09-29-cccccccc"]);
assert.equal(r.cases.cursor, null, "a full pass leaves no cursor");
// A second run finds nothing more.
const again = await prune({ now: NOW });
assert.equal(again.cases.expired + again.limits.stale + again.limits.rawIp + again.requests.expired + again.auth.tokens + again.auth.sessions, 0);

// ---- bounded batches resume from the cursor ----
await seed();
const seen = [];
let run, guard = 0;
do {
  run = await prune({ now: NOW, batch: 3 });
  seen.push(run.cases.read);
  assert.ok(++guard < 10, "cursor never wrapped");
} while (run.cases.cursor);
assert.deepEqual(seen, [3, 3, 3], "nine case files, three per run");
for (const id of ["HVI-OLDAAAAA", "HVI-OLDBBBBB", "HVI-OLDCCCCC", "HVI-RECALAAA"]) assert.ok(!has("hvi-cases", id));
const wrap = await prune({ now: NOW, batch: 3 });
assert.equal(wrap.cases.read, 3, "the next pass starts from the top");

// ---- out of time: stops cleanly, the cursor marks where ----
await seed();
globalThis.__slow = 30;
const slow = await prune({ now: NOW, budgetMs: 1 });
globalThis.__slow = 0;
assert.equal(slow.done, false, "a run out of time says so");
assert.ok(has("hvi-cases", "HVI-OLDAAAAA") || slow.cases.read > 0);

// ---- the scheduled function: daily, and HVI_PRUNE_DRY_RUN=1 holds its hand ----
const fn = await import("../netlify/functions/prune.js");
assert.equal(fn.config.schedule, "@daily");
await seed();
const pre = snapshot();
process.env.HVI_PRUNE_DRY_RUN = "1";
await fn.default();
assert.equal(snapshot(), pre, "HVI_PRUNE_DRY_RUN=1 deleted something");
delete process.env.HVI_PRUNE_DRY_RUN;

console.log = __err;
console.log("check-prune: ALL PASS");
