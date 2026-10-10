// Who may act on a case file (docs/SECURITY.md; netlify/lib/auth.js requireCaseAuth).
//   1. Static: every function that takes a case id and has a POST path calls requireCaseAuth,
//      and calls it before the first write primitive in its handler. A new endpoint that takes
//      the number as the credential fails the build here.
//   2. No case number in the source: lib/auth.js and lib/prune.js carry none (the owner's comes
//      from HVI_OWNER_CASES), the proprietor record's server half is not committed, and the
//      bundle's sources name no file but the XXXXXXXX placeholder and the test ids.
//   3. Behaviour, on in-memory Blobs: a claimed case without a session is refused (401) before
//      anything changes; with another account's session refused (403); with its own session it
//      acts; an unclaimed case still answers to its number; the owner's case always needs the
//      owner's session, claimed or not.
// Run: node scripts/check-caseauth.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";

const root = new URL("../", import.meta.url).pathname;
const fnDir = root + "netlify/functions/";

// ---- 1. every case endpoint calls the helper, before it writes ------------------------------------
// GET-only endpoints never change a file (file.js gates its private read itself; case.js answers only
// "exists, and how many visits"). me.js claims a case to a SESSION (requireAccount), a different gate.
const ALLOW = {
  "me.js": "claiming needs a session of its own (requireAccount); nothing acts on the case by its number",
  "housing-tick.js": "scheduled, no request reaches it: the Housing Office's rounds over the census's own files",
};
const WRITES = ["updateCase(", "updateRecord(", "updateWallet(", "updateTanks(", "updateBoards(", "putGame(", "castBallot(", "castVote(", "setEntry(",
  "trade(", "collect(", "placeOrder(", "buy(", "upgrade(", "setOutfit(", "place(", "fileProposal(", "cosign(", "review(", "declareCandidacy(", "resignSeat(",
  "createFigure(", ".rpc(", "deleteCase(", "putPenCard(", "setJSON(", "callClaude(", "claudeText(", "extractSpec(", "chargeGlobal("];
const stripComments = s => s.replace(/^\s*\/\/.*$/gm, "");
let covered = [], skipped = [];
for (const f of readdirSync(fnDir).filter(f => f.endsWith(".js")).sort()) {
  const src = stripComments(readFileSync(fnDir + f, "utf8"));
  const takesCase = /\bcaseId\b|isCaseId\(/.test(src);
  const getOnly = /req\.method !== "GET"\) return/.test(src) && !/"POST"/.test(src.replace(/req\.method !== "GET"\) return[^\n]*/g, ""));
  if (!takesCase || getOnly) { skipped.push(f); continue; }
  if (ALLOW[f]) { skipped.push(f); continue; }
  assert.match(src, /import \{[^}]*\brequireCaseAuth\b[^}]*\} from "\.\.\/lib\/auth\.js"/, `${f}: takes a case id and writes, but does not import requireCaseAuth`);
  const handler = src.slice(src.indexOf("export default"));
  const at = handler.indexOf("requireCaseAuth(");
  assert.ok(at >= 0, `${f}: never calls requireCaseAuth in its handler`);
  for (const w of WRITES) {
    // a call of that name (not `.replace(` for `place(`, not `store.setJSON` for a method it is)
    const re = w.startsWith(".") ? new RegExp(w.replace(/[.(]/g, "\\$&")) : new RegExp(`(?<![\\w.$])${w.replace("(", "\\(")}`);
    const i = handler.search(re);
    assert.ok(i < 0 || i > at, `${f}: ${w.replace("(", "")} runs before requireCaseAuth`);
  }
  covered.push(f);
}
assert.ok(covered.length >= 20, `only ${covered.length} case endpoints found: the scan is broken`);
for (const must of ["casino.js", "economy.js", "market.js", "shops.js", "chess.js", "assembly.js", "elections.js", "petition.js", "proposals.js", "purge.js", "intake-score.js", "refer.js", "tournament.js", "eb-claim.js", "ski.js", "aquarium.js", "housing.js"])
  assert.ok(covered.includes(must), `${must} should be a covered case endpoint`);

// ---- 2. no case number in the source --------------------------------------------------------------
const ID = /HVI-[A-Z0-9]{8}/g;
for (const f of ["netlify/lib/auth.js", "netlify/lib/prune.js"]) assert.equal((readFileSync(root + f, "utf8").match(ID) || []).length, 0, `${f} carries a case number literal`);
assert.ok(!existsSync(root + "netlify/lib/proprietors.json"), "the proprietor record's server half must not be committed (it lives in Blobs hvi-proprietors)");
const TEST_IDS = new Set(["HVI-XXXXXXXX", "HVI-DEVTEST0", "HVI-SUBSTRAT"]);
function walk(dir, out = []) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = dir + "/" + e.name; if (e.isDirectory()) walk(p, out); else if (/\.(jsx?|json|html|css)$/.test(e.name)) out.push(p); } return out; }
for (const p of [...walk(root + "src"), ...walk(root + "public")]) {
  const ids = (readFileSync(p, "utf8").match(ID) || []).filter(id => !TEST_IDS.has(id));
  assert.equal(ids.length, 0, `${p.replace(root, "")}: case number in the bundle's sources: ${ids.join(", ")}`);
}

// ---- 3. behaviour --------------------------------------------------------------------------------
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
process.env.HVI_OWNER_CASES = "HVI-OWNERAAA,HVI-OWNERBBB";
process.env.ANTHROPIC_API_KEY = "test";
process.env.HVI_ECONOMY_BACKEND = "memory";   // the Treasury open on the in-memory ledger: the money endpoints reach their gate

const A = await import("../netlify/lib/auth.js");
const S = await import("../netlify/lib/store.js");
const fns = Object.fromEntries(await Promise.all(["file", "quest", "casino", "chess", "economy", "intake-session", "purge", "assembly", "proposals", "refer", "me", "leagues", "aquarium", "ski", "market", "shops", "petition", "elections", "avatar", "tournament", "housing"]
  .map(async n => [n, (await import(`../netlify/functions/${n}.js`)).default])));

const HOST = "https://humanvalueindex.com";
const req = (path, { method = "GET", body, cookie, ip = "192.0.2.1" } = {}) =>
  new Request(HOST + path, { method, headers: { "content-type": "application/json", origin: HOST, ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = async (fn, path, opts = {}) => { const r = await fn(req(path, opts), { ip: opts.ip || "192.0.2.1", params: opts.params }); return { status: r.status, body: await r.json().catch(() => null) }; };

// the world: an assessed unclaimed file, an assessed claimed file (account K), the owner's claimed
// file (K, which makes K the owner), a second owner case nobody has claimed, and a stranger account O
const assessed = id => ({ caseId: id, created: "2026-09-01T00:00:00Z", history: [{ at: "2026-09-01T00:00:00Z", score: 600, tier: "TOLERATED GENERALIST", verdict: "Fine.", breakdown: { care: 60 }, cause: "visit" }] });
const U = "HVI-UNCLAIMD", C = "HVI-CLAIMEDA", O1 = "HVI-OWNERAAA", O2 = "HVI-OWNERBBB";
for (const id of [U, C, O1, O2]) await S.updateCase(id, () => assessed(id));
const K = await A.upsertAccount("keeper@example.com");
assert.equal(await A.claimCase(K.key, C), "claimed");
assert.equal(await A.claimCase(K.key, O1), "claimed");
const cK = `hvi_sid=${await A.createSession(K.key)}`;
const Oacct = await A.upsertAccount("other@example.com");
const cO = `hvi_sid=${await A.createSession(Oacct.key)}`;

// the helper itself
const h = (id, cookie) => A.requireCaseAuth(req("/x", { cookie }), id, { write: true });
assert.deepEqual(await h(U), { ok: true, claimed: false, acct: null, session: null }, "unclaimed: the number is enough");
let r = await h(C); assert.equal(r.ok, false); assert.equal(r.status, 401); assert.equal(r.code, "sign-in");
r = await h(C, cO); assert.equal(r.status, 403); assert.equal(r.code, "not-yours");
r = await h(C, cK); assert.equal(r.ok, true); assert.equal(r.claimed, true); assert.equal(r.acct, K.key); assert.equal(r.session.key, K.key);
r = await h(O1); assert.equal(r.status, 401, "the owner's claimed case: session required");
r = await h(O1, cO); assert.equal(r.status, 403);
assert.equal((await h(O1, cK)).ok, true, "the owner's session acts on the owner's case");
r = await h(O2); assert.equal(r.status, 401, "an owner case nobody claimed still needs a session");
r = await h(O2, cO); assert.equal(r.status, 403, "and a stranger's session is not the owner's");
assert.equal((await h(O2, cK)).ok, true, "an owner account acts on any owner case");
assert.equal((await A.requireCaseAuth(req("/x"), C, { write: false })).error, A.SIGN_IN_READ_LINE, "a read says OPEN, a write says ACT");
assert.equal(A.isOwnerCase(O1), true); assert.equal(A.isOwnerCase(C), false);
delete process.env.HVI_OWNER_CASES;
assert.equal(A.isOwnerCase(O1), false, "no environment, no owner: nothing in the source names one");
process.env.HVI_OWNER_CASES = "HVI-OWNERAAA,HVI-OWNERBBB";

// every endpoint: the matrix. "ok" = anything but a refusal of the file (the endpoint's own answer).
const notRefused = (res, label) => assert.ok(res.status !== 401 && res.status !== 403, `${label}: ${res.status} ${JSON.stringify(res.body)}`);
const refused = (res, status, label) => { assert.equal(res.status, status, `${label}: ${JSON.stringify(res.body)}`); assert.equal(res.body?.secured, true, `${label}: carries secured`); assert.equal(res.body?.code, status === 401 ? "sign-in" : "not-yours"); };
const WRITES_TO_TRY = [
  ["casino claim", fns.casino, "/api/casino", id => ({ action: "claim", caseId: id })],
  ["chess start", fns.chess, "/api/chess", id => ({ action: "start", caseId: id, vs: "nobody", side: "w" })],
  ["economy collect", fns.economy, "/api/economy", id => ({ action: "collect", caseId: id })],
  ["market order", fns.market, "/api/market", id => ({ action: "order", caseId: id, side: "buy", slug: "x", amount: 100, nonce: "n" })],
  ["shops buy", fns.shops, "/api/shops", id => ({ action: "buy", caseId: id, sku: "w:x.y", nonce: "n" })],
  ["quest accept", fns.quest, "/api/quest", id => ({ action: "accept", caseId: id, questId: "nope" })],
  ["intake reopen", fns["intake-session"], "/api/intake-session", id => ({ caseId: id })],
  ["purge", fns.purge, "/api/purge", id => ({ caseId: id, confirm: id })],
  ["assembly ballot", fns.assembly, "/api/assembly", id => ({ caseId: id, choice: "golf", reasons: ["JOBS"] })],
  ["proposals cosign", fns.proposals, "/api/proposals", id => ({ action: "cosign", caseId: id, pid: "nope" })],
  ["refer", fns.refer, "/api/refer", id => ({ name: "Somebody Else", caseId: id })],
  ["leagues enter", fns.leagues, "/api/leagues", id => ({ caseId: id, sports: ["tennis"] })],
  ["aquarium trip", fns.aquarium, "/api/aquarium", id => ({ action: "trip", caseId: id, spot: "nowhere" })],
  ["ski start", fns.ski, "/api/ski", id => ({ action: "start", caseId: id, ch: "nope" })],
  ["avatar redraw", fns.avatar, "/api/avatar", id => ({ caseId: id, description: "tall, red coat, curly hair" })],
  ["elections ballot", fns.elections, "/api/elections", id => ({ caseId: id, district: "x", candidate: "y" })],
  ["tournament enter", fns.tournament, "/api/tournament", id => ({ caseId: id, action: "enter", id: "nope", div: "open" })],
  ["housing transfer", fns.housing, "/api/housing", id => ({ caseId: id, action: "transfer", unit: "nope" })],
];
// first every refusal, then the proof that nothing moved, then the allowed calls
const POST = { method: "POST" };
for (const [label, fn, path, body] of WRITES_TO_TRY) {
  refused(await call(fn, path, { ...POST, body: body(C) }), 401, `${label}: claimed, no session`);
  refused(await call(fn, path, { ...POST, body: body(C), cookie: cO }), 403, `${label}: claimed, a stranger's session`);
  refused(await call(fn, path, { ...POST, body: body(O1) }), 401, `${label}: the owner's case, no session`);
}
const pet = await call(fns.petition, "/api/petition/somebody", { ...POST, body: { caseId: C, choice: "fair" }, params: { slug: "somebody" } });
refused(pet, 401, "petition vote: claimed, no session");
assert.equal((await S.getCase(C))?.history.length, 1, "nothing changed on the claimed file");
assert.equal((await S.getCase(C))?.pending, undefined, "no interview opened on the claimed file");
assert.equal(globalThis.__blobs.get("hvi-casino")?.size || 0, 0, "no casino wallet opened by a refused request");
assert.equal(globalThis.__blobs.get("hvi-chess")?.size || 0, 0, "no chess game dealt by a refused request");
for (const [label, fn, path, body] of WRITES_TO_TRY) {
  if (label === "purge") continue;
  notRefused(await call(fn, path, { ...POST, body: body(C), cookie: cK }), `${label}: claimed, its own session`);
  notRefused(await call(fn, path, { ...POST, body: body(U) }), `${label}: unclaimed, the number`);
}
// the unclaimed file did act: its allowance is in its wallet
const unclaimedCasino = await call(fns.casino, `/api/casino?caseId=${U}`);
assert.equal(unclaimedCasino.status, 200); assert.equal(unclaimedCasino.body.claimedToday, true, "the unclaimed file collected its allowance by number");
assert.equal((await call(fns.casino, `/api/casino?caseId=${C}`, { cookie: cK })).body.claimedToday, true, "the claimed file collected with its own session");

// private reads: refused for a claimed file, open for an unclaimed one, the file's own session reads
for (const [label, fn, path] of [["file", fns.file, "/api/file"], ["quest", fns.quest, "/api/quest"], ["casino", fns.casino, "/api/casino"], ["shops", fns.shops, "/api/shops"], ["leagues", fns.leagues, "/api/leagues"], ["housing", fns.housing, "/api/housing"]]) {
  refused(await call(fn, `${path}?caseId=${C}`), 401, `${label} read: claimed, no session`);
  refused(await call(fn, `${path}?caseId=${C}`, { cookie: cO }), 403, `${label} read: claimed, a stranger`);
  notRefused(await call(fn, `${path}?caseId=${C}`, { cookie: cK }), `${label} read: its own session`);
  notRefused(await call(fn, `${path}?caseId=${U}`), `${label} read: unclaimed`);
}
const fileRead = await call(fns.file, `/api/file?caseId=${C}`);
assert.equal(fileRead.body.latest, undefined, "a refused file read carries no score, verdict or history");
assert.equal(fileRead.body.history, undefined);
// merged public views: the public part answers, the file's part is withheld and flagged
const asm = await call(fns.assembly, `/api/assembly?caseId=${C}`);
assert.equal(asm.status, 200); assert.equal(asm.body.secured, true); assert.equal(asm.body.mine, null); assert.ok(asm.body.session, "the public session still shows");
const asmK = await call(fns.assembly, `/api/assembly?caseId=${C}`, { cookie: cK });
assert.equal(asmK.body.secured, undefined, "its own session: nothing flagged");
const pr = await call(fns.proposals, `/api/proposals?caseId=${O1}&review=1`);
assert.equal(pr.body.owner, false, "the owner's number is not the owner"); assert.equal(pr.body.review, undefined); assert.equal(pr.body.secured, true);
const prK = await call(fns.proposals, `/api/proposals?caseId=${O1}&review=1`, { cookie: cK });
assert.equal(prK.body.owner, true, "the owner's session is");
const el = await call(fns.elections, `/api/elections?caseId=${C}`);
assert.equal(el.status, 200); assert.equal(el.body.secured, true); assert.equal(el.body.mine, undefined);
const ref = await call(fns.refer, `/api/refer?caseId=${O1}`);
assert.equal(ref.body.owner, undefined, "no owner flag for a bare number");
assert.equal((await call(fns.refer, `/api/refer?caseId=${O1}`, { cookie: cK })).body.owner, true);
// the nudge's question: is the file this browser holds secured?
assert.deepEqual((await call(fns.me, `/api/me?caseId=${C}`)).body, { signedIn: false, held: C, secured: true });
assert.deepEqual((await call(fns.me, `/api/me?caseId=${U}`)).body, { signedIn: false, held: U, secured: false });
assert.equal((await call(fns.me, "/api/me")).body.held, undefined);

__err(`check-caseauth: ${covered.length} case endpoints gated (${covered.join(", ")}); ${skipped.length} without a case write; matrix passed`);
