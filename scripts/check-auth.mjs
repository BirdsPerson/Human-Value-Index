// Magic-link auth with an in-memory Blobs store and a fake Resend. Run: node scripts/check-auth.mjs
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

// ---- fake Resend ----
process.env.RESEND_API_KEY = "re_test";
let sent = [], resendMode = "ok", verifyCalls = 0;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith("/verify")) { verifyCalls++; return new Response("{}", { status: 200 }); }
  assert.match(url, /api\.resend\.com\/emails/);
  assert.equal(init.headers["User-Agent"], "human-value-index/1.0", "non-default UA");
  const b = JSON.parse(init.body);
  if (resendMode === "unverified") return new Response(JSON.stringify({ name: "validation_error", message: "The mail.humanvalueindex.com domain is not verified." }), { status: 403 });
  if (resendMode === "down") return new Response("oops", { status: 500 });
  sent.push(b); return new Response(JSON.stringify({ id: "x" }), { status: 200 });
};

const A = await import("../netlify/lib/auth.js");
const login = (await import("../netlify/functions/login.js")).default;
const verify = (await import("../netlify/functions/login-verify.js")).default;
const me = (await import("../netlify/functions/me.js")).default;
const logout = (await import("../netlify/functions/logout.js")).default;
const store = await import("../netlify/lib/store.js");

const HOST = "https://humanvalueindex.com";
const post = (fn, path, body, { ip = "192.0.2.1", cookie, origin = HOST } = {}) =>
  fn(new Request(HOST + path, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), { ip });
const get = (fn, path, cookie) => fn(new Request(HOST + path, { headers: cookie ? { cookie } : {} }), { ip: "192.0.2.1" });
const read = async r => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers });
const tokenFrom = mail => new URL(mail.text.match(/https:\/\/\S+/)[0]).searchParams.get("t");

// pure helpers
assert.ok(A.emailValid("Scott@Example.com"));
assert.ok(!A.emailValid("not-an-email"));
assert.ok(!A.emailValid("a@b"));
assert.equal(A.maskEmail("scott@example.com"), "s***@e***.com");
assert.equal(A.accountKey("A@B.COM "), A.accountKey("a@b.com"), "key ignores case and whitespace");

// no enumeration: new and existing addresses get the identical response
let r1 = await read(await post(login, "/api/login", { email: "new@example.com" }));
await A.upsertAccount("old@example.com");
let r2 = await read(await post(login, "/api/login", { email: "old@example.com" }, { ip: "192.0.2.2" }));
assert.equal(r1.status, 200); assert.deepEqual(r1.body, r2.body, "same body whether or not the account exists");
assert.equal(sent.length, 2);
assert.equal(sent[0].from, A.FROM_DEFAULT);
assert.match(sent[0].text, /expires in fifteen minutes/);
assert.equal((await read(await post(login, "/api/login", { email: "nope" }))).status, 400);
assert.equal((await read(await post(login, "/api/login", { email: "x@example.com" }, { origin: "https://evil.example" }))).status, 403, "foreign origin refused");

// token: single use, and an expired one fails
const t1 = tokenFrom(sent[0]);
assert.ok(!JSON.stringify([...globalThis.__blobs.get("hvi-auth").keys()]).includes(t1), "raw token never stored");
let v = await verify(new Request(`${HOST}/api/login/verify?t=${t1}`));
assert.equal(v.status, 302); assert.match(v.headers.get("location"), /auth=ok#intake/);
const setCookie = v.headers.get("set-cookie");
for (const f of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) assert.ok(setCookie.includes(f), `cookie has ${f}`);
const sid = setCookie.match(/hvi_sid=([^;]+)/)[1];
const cookie = `hvi_sid=${sid}`;
assert.ok(!JSON.stringify([...globalThis.__blobs.get("hvi-auth").keys()]).includes(sid), "raw session id never stored");
v = await verify(new Request(`${HOST}/api/login/verify?t=${t1}`));
assert.match(v.headers.get("location"), /auth=expired/, "token is single-use");
assert.equal(v.headers.get("set-cookie"), null);
const tOld = await A.issueToken("late@example.com", Date.now() - A.TOKEN_TTL_MS - 1000);
assert.equal(await A.consumeToken(tOld), null, "expired token refused");
assert.equal(await A.consumeToken("garbage"), null);

// /api/me: masked email only
let m = await read(await get(me, "/api/me", cookie));
assert.deepEqual(m.body, { signedIn: true, email: "n***@e***.com", cases: [], owner: false });
assert.equal(m.headers.get("cache-control"), "no-store");
assert.equal((await read(await get(me, "/api/me"))).body.signedIn, false);
assert.equal((await read(await get(me, "/api/me", "hvi_sid=forged-value-xxxxxxxxxxxxxxxxxxxx"))).body.signedIn, false);

// claim: needs a real case; unique per account; owner case marks the owner
await (store.updateCase("HVI-AAAAAAAA", () => ({ caseId: "HVI-AAAAAAAA", history: [] })));
await (store.updateCase("HVI-KKN67AUZ", () => ({ caseId: "HVI-KKN67AUZ", history: [] })));
assert.equal((await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-AAAAAAAA" }))).status, 401, "claim needs a session");
assert.equal((await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-BBBBBBBB" }, { cookie }))).status, 404);
let c = await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-AAAAAAAA" }, { cookie }));
assert.equal(c.status, 200); assert.deepEqual(c.body.cases, ["HVI-AAAAAAAA"]);
assert.equal((await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-AAAAAAAA" }, { cookie }))).status, 200, "re-claim by owner is fine");
// a second account can't take it
const t2 = tokenFrom(sent[1]);
const sid2 = (await verify(new Request(`${HOST}/api/login/verify?t=${t2}`))).headers.get("set-cookie").match(/hvi_sid=([^;]+)/)[1];
assert.equal((await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-AAAAAAAA" }, { cookie: `hvi_sid=${sid2}` }))).status, 409, "case belongs to one account");
c = await read(await post(me, "/api/me", { action: "claim", caseId: "HVI-KKN67AUZ" }, { cookie: `hvi_sid=${sid2}` }));
assert.equal(c.body.owner, true, "claiming the owner case makes the account owner");
const req2 = new Request(HOST, { headers: { cookie: `hvi_sid=${sid2}` } });
assert.ok(A.isOwnerAccount((await A.requireAccount(req2)).account));

// logout revokes server-side
let lo = await post(logout, "/api/logout", {}, { cookie });
assert.match(lo.headers.get("set-cookie"), /Max-Age=0/);
assert.equal((await read(await get(me, "/api/me", cookie))).body.signedIn, false, "revoked session is dead");

// rate limits: per email (3 per 15 min) and per IP (10 per hour)
sent = [];
for (let i = 0; i < 3; i++) assert.equal((await post(login, "/api/login", { email: "spam@example.com" }, { ip: `198.51.100.${i}` })).status, 200);
assert.equal((await post(login, "/api/login", { email: "spam@example.com" }, { ip: "198.51.100.9" })).status, 429, "per-email limit");
for (let i = 0; i < 10; i++) await post(login, "/api/login", { email: `u${i}@example.com` }, { ip: "203.0.113.7" });
assert.equal((await post(login, "/api/login", { email: "u99@example.com" }, { ip: "203.0.113.7" })).status, 429, "per-IP limit");

// domain not verified: in-character 503 and at most one verify call per hour
resendMode = "unverified";
let u = await read(await post(login, "/api/login", { email: "a1@example.com" }, { ip: "192.0.2.50" }));
assert.equal(u.status, 503); assert.equal(u.body.error, A.MAIL_ROOM_CLOSED);
await post(login, "/api/login", { email: "a2@example.com" }, { ip: "192.0.2.51" });
assert.equal(verifyCalls, 1, "verify throttled to hourly");
// a plain Resend failure still looks like success (no enumeration)
resendMode = "down";
assert.equal((await post(login, "/api/login", { email: "a3@example.com" }, { ip: "192.0.2.52" })).status, 200);

// /api/file: the server's current file wins over any browser cache; voided entries never show
const file = (await import("../netlify/functions/file.js")).default;
await store.updateCase("HVI-FILETEST", () => ({ caseId: "HVI-FILETEST", avatar: { kind: "sprite", url: "/sprites/scott.png" },
  history: [{ score: 475, tier: "MONITORED CIVILIAN", at: "a" }, { score: 660, tier: "TOLERATED GENERALIST", warmth: 69, competence: 63, quadrant: "ADMIRED", breakdown: { care: 68 }, verdict: "v", rubric: 3, simulated: true, at: "b" }, { score: 570, tier: "TOLERATED GENERALIST", voided: true, at: "c" }],
  voided: [{ score: 570, verdict: "the Trump test" }] }));
let f = await read(await get(file, "/api/file?caseId=HVI-FILETEST"));
assert.equal(f.status, 200);
assert.equal(f.body.latest.score, 660, "latest non-voided entry");
assert.equal(f.body.latest.quadrant, "ADMIRED");
assert.deepEqual(f.body.history.map(h => h.score), [475, 660], "voided entries never listed");
assert.ok(!JSON.stringify(f.body).includes("Trump"), "the voided list never leaves the server");
assert.equal(f.body.avatar.url, "/sprites/scott.png");
assert.equal(f.headers.get("cache-control"), "no-store");
assert.equal((await read(await get(file, "/api/file?caseId=HVI-ZZZZZZZZ"))).status, 404);
assert.equal((await read(await get(file, "/api/file?caseId=nope"))).status, 400);
// metered like /api/case
let last;
for (let i = 0; i < 61; i++) last = await file(new Request(HOST + "/api/file?caseId=HVI-FILETEST"), { ip: "198.18.0.9" });
assert.equal(last.status, 429, "file reads are metered per IP");

console.log = __err; console.log("check-auth: ok");
