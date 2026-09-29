// The legal/trust layer: /api/request (validation, honeypot, rate limit, stored, mailed to
// the operator via the Resend stub) and /api/purge (confirm, ownership, what it deletes).
// In-memory Blobs, fake Resend. Run: node scripts/check-legal.mjs
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
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = console.log = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

// ---- the mailer stub: a fake Resend ----
process.env.RESEND_API_KEY = "re_test";
let sent = [], mailMode = "ok";
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /api\.resend\.com\/emails/);
  if (mailMode === "down") return new Response("oops", { status: 500 });
  sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 });
};

const request = (await import("../netlify/functions/request.js")).default;
const R = await import("../netlify/functions/request.js");
const purge = (await import("../netlify/functions/purge.js")).default;
const A = await import("../netlify/lib/auth.js");
const S = await import("../netlify/lib/store.js");
const { ipHash } = await import("../netlify/lib/http.js");

const HOST = "https://humanvalueindex.com";
const post = (fn, path, body, { ip = "192.0.2.9", cookie, origin = HOST } = {}) =>
  fn(new Request(HOST + path, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), { ip });
const read = async r => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers });
const store = name => globalThis.__blobs.get(name) || new Map();

// ---- /api/request ----
const good = { kind: "correction", relationship: "representative", name: "Pat Agent", file: "Some Figure", problem: "The verdict says he was convicted. He was not.", email: "Pat@Example.com" };

// validation: each field
for (const [k, v] of [["kind", "sue"], ["relationship", "fan"], ["name", ""], ["file", ""], ["problem", "short"], ["email", "nope"], ["name", "x".repeat(121)], ["problem", "x".repeat(4001)]]) {
  const r = await read(await post(request, "/api/request", { ...good, [k]: v }));
  assert.equal(r.status, 400, `bad ${k} refused`);
  assert.ok(r.body.error.length > 10);
}
assert.equal(sent.length, 0, "nothing mailed for invalid requests");
assert.equal(store("hvi-requests").size, 0, "nothing stored for invalid requests");

// foreign origin and method
assert.equal((await post(request, "/api/request", good, { origin: "https://evil.example" })).status, 403);
assert.equal((await request(new Request(HOST + "/api/request"), { ip: "1" })).status, 405);

// honeypot: quiet 200, nothing stored or mailed
let r = await read(await post(request, "/api/request", { ...good, website: "http://spam" }));
assert.equal(r.status, 200); assert.equal(store("hvi-requests").size, 0); assert.equal(sent.length, 0);

// a good request: stored, then mailed to the operator with the requester as Reply-To
r = await read(await post(request, "/api/request", good));
assert.equal(r.status, 200); assert.match(r.body.message, /A human does, every one of them/);
const rec = store("hvi-requests").get(r.body.id)?.data;
assert.ok(rec, "stored under its id");
assert.equal(rec.email, "pat@example.com"); assert.equal(rec.relationship, "representative"); assert.equal(rec.status, "new");
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].to, ["staglias@me.com"], "mailed to the operator's own inbox only");
assert.equal(sent[0].reply_to, "pat@example.com");
assert.match(sent[0].subject, /\[HVI CORRECTION\] Some Figure/);
assert.match(sent[0].text, /He was not\./);
assert.ok(store("hvi-requests").has(`${r.body.id}:mailed`), "mail receipt stored");

// mail down: still filed (stored), no receipt
mailMode = "down";
r = await read(await post(request, "/api/request", { ...good, kind: "takedown" }));
assert.equal(r.status, 200); assert.ok(store("hvi-requests").get(r.body.id)); assert.ok(!store("hvi-requests").has(`${r.body.id}:mailed`));
mailMode = "ok";

// rate limit: PER_IP_DAILY per address (the honeypot and invalid ones were never charged)
for (let i = 2; i < R.PER_IP_DAILY; i++) assert.equal((await post(request, "/api/request", good)).status, 200);
r = await read(await post(request, "/api/request", good));
assert.equal(r.status, 429, "sixth request from one address refused");
assert.equal((await post(request, "/api/request", good, { ip: "198.51.100.7" })).status, 200, "another address is unaffected");

// the limiter never stores the address itself
const keys = [...store("hvi-limits").keys()].join(" ");
assert.ok(!keys.includes("192.0.2.9"), "no raw IP in limiter keys");
assert.ok(keys.includes(`request-ip:${ipHash("192.0.2.9")}`), "hashed IP key");

// ---- /api/purge ----
const CASE = "HVI-AAAAAAAA", CASE2 = "HVI-BBBBBBBB", CASE3 = "HVI-CCCCCCCC";
await S.updateCase(CASE, () => ({ caseId: CASE, history: [{ score: 500, transcript: [{ role: "user", text: "secret" }] }] }));
await S.putPenCard(CASE, { slug: "citizen-aaaa", name: "Subject AAAA", score: 500, kind: "citizen", updated: "t" });
assert.equal((await S.listPenCards()).length, 1);

assert.equal((await post(purge, "/api/purge", { caseId: CASE, confirm: "HVI-WRONG000" })).status, 400, "confirm must repeat the case");
assert.equal((await post(purge, "/api/purge", { caseId: "nope", confirm: "nope" })).status, 400);
r = await read(await post(purge, "/api/purge", { caseId: CASE, confirm: CASE.toLowerCase() }));
assert.equal(r.status, 200); assert.equal(r.body.accountDeleted, false);
assert.equal(await S.getCase(CASE), null, "case record deleted");
assert.equal((await S.listPenCards()).length, 0, "pen card and index entry removed");
assert.equal((await post(purge, "/api/purge", { caseId: CASE, confirm: CASE })).status, 404, "second purge: already gone");

// a secured file: only its account may purge it; the last file takes the account with it
await S.updateCase(CASE2, () => ({ caseId: CASE2, history: [{ score: 600 }] }));
await S.updateCase(CASE3, () => ({ caseId: CASE3, history: [{ score: 610 }] }));
const { key } = await A.upsertAccount("owner@example.com");
await A.claimCase(key, CASE2); await A.claimCase(key, CASE3);
await A.issueToken("owner@example.com");
const sid = await A.createSession(key);
const cookie = `hvi_sid=${sid}`;
const other = await A.upsertAccount("other@example.com");
const otherCookie = `hvi_sid=${await A.createSession(other.key)}`;

assert.equal((await post(purge, "/api/purge", { caseId: CASE2, confirm: CASE2 })).status, 401, "no session: refused");
assert.equal((await post(purge, "/api/purge", { caseId: CASE2, confirm: CASE2 }, { cookie: otherCookie })).status, 401, "another account: refused");
assert.ok(await S.getCase(CASE2), "refused purge deleted nothing");

r = await read(await post(purge, "/api/purge", { caseId: CASE2, confirm: CASE2 }, { cookie }));
assert.equal(r.status, 200); assert.equal(r.body.accountDeleted, false, "account still holds another file");
assert.deepEqual((await A.getAccount(key)).cases, [CASE3]);
assert.equal(await store("hvi-accounts").get(`case:${CASE2}`), undefined, "case marker gone");

r = await read(await post(purge, "/api/purge", { caseId: CASE3, confirm: CASE3 }, { cookie }));
assert.equal(r.status, 200); assert.equal(r.body.accountDeleted, true);
assert.equal(await A.getAccount(key), null, "account (the email) deleted with its last file");
assert.match(r.headers.get("set-cookie") || "", /Max-Age=0/, "cookie cleared");
const leftovers = [...store("hvi-auth").values()].filter(v => v.data?.email === "owner@example.com");
assert.equal(leftovers.length, 0, "sign-in token records for the address deleted");
assert.ok(await A.getAccount(other.key), "other accounts untouched");

process.stdout.write("check-legal: ok\n");
