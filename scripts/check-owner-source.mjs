// Owner-added local public officials (lib/ownerSource.js): the SSRF screen, the size cap,
// HTML to text, and the prompt rules (sources only, thin record, election care). Offline:
// the one real socket is a loopback server, reached by IP literal with the screen bypassed.
//   node scripts/check-owner-source.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { sourceUrlError, blockedAddress, safeLookup, fetchSource, fetchSources, htmlToText, sourceRecord, transport, MAX_BYTES, MAX_SOURCES } from "../netlify/lib/ownerSource.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, OWNER_SOURCE_ADDENDUM, LIVING_SUBJECTS } from "../netlify/lib/publicRecord.js";
import { FACT_CHECK_SYSTEM } from "../netlify/lib/factCheck.js";

// ---- URL screen -----------------------------------------------------------------------
for (const ok of ["https://www.capemaycity.com/MayorZacharyMullock", "http://example.org/a?b=c", "https://whyy.org:443/x", "http://news.example.com:80/"])
  assert.equal(sourceUrlError(ok), null, ok);
for (const [bad, why] of [
  ["http://localhost/", "internal host"], ["http://LOCALHOST:80/", "internal host"], ["http://127.0.0.1/", "private address"], ["http://127.8.9.1/x", "private address"],
  ["http://169.254.169.254/latest/meta-data/", "private address"], ["http://10.0.0.5/", "private address"], ["http://172.16.3.4/", "private address"],
  ["http://192.168.1.1/", "private address"], ["http://100.64.0.1/", "private address"], ["http://0.0.0.0/", "private address"],
  ["http://[::1]/", "private address"], ["http://[fd00::1]/", "private address"], ["http://[fe80::1]/", "private address"], ["http://[::ffff:127.0.0.1]/", "private address"],
  ["file:///etc/passwd", "only http and https"], ["ftp://example.org/file", "only http and https"], ["gopher://example.org/", "only http and https"], ["javascript:alert(1)", "only http and https"],
  ["https://example.org:8443/", "non-standard port"], ["http://example.org:22/", "non-standard port"], ["https://user:pw@example.org/", "credentials in the URL"],
  ["http://metadata.google.internal/", "internal host"], ["http://printer.local/", "internal host"], ["http://intranet/", "internal host"], ["not a url", "not a URL"],
]) assert.equal(sourceUrlError(bad), why, bad);
for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.1.1", "172.31.255.255", "192.168.0.1", "100.100.1.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fe80::abcd", "::ffff:10.0.0.1"])
  assert.equal(blockedAddress(ip), true, ip);
for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) assert.equal(blockedAddress(ip), false, ip);

// The connect-time lookup refuses a name that resolves private (no network: localhost).
await new Promise(res => safeLookup("localhost", {}, (err) => { assert.equal(err?.code, "EBLOCKED", "localhost resolves loopback: blocked"); res(); }));

// ---- redirects are re-screened; failures are dropped, not fatal --------------------------
const page = body => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from(body), truncated: false });
const PARA = "<p>" + "Zachary Mullock is the mayor of Cape May. ".repeat(10) + "</p>";
let seen = [];
const stub = routes => async url => { seen.push(url); const r = routes[url]; if (!r) throw Object.assign(new Error("nope"), { code: "ENOTFOUND" }); return typeof r === "function" ? r() : r; };
let got = await fetchSource("https://evil.example/r", { get: stub({ "https://evil.example/r": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } } }) });
assert.deepEqual([got.ok, got.error], [false, "private address"], "a redirect into the metadata address is refused");
got = await fetchSource("https://a.example/r", { get: stub({ "https://a.example/r": { status: 301, headers: { location: "file:///etc/passwd" } } }) });
assert.equal(got.error, "only http and https", "a redirect to file: is refused");
got = await fetchSource("https://a.example/1", { get: stub({ "https://a.example/1": { status: 302, headers: { location: "/2" } }, "https://a.example/2": page(`<html><head><title>Mayor</title></head><body>${PARA}</body></html>`) }) });
assert.equal(got.ok, true); assert.equal(got.finalUrl, "https://a.example/2"); assert.equal(got.title, "Mayor");
got = await fetchSource("https://a.example/pdf", { get: stub({ "https://a.example/pdf": { status: 200, headers: { "content-type": "application/pdf" }, body: Buffer.from("%PDF") } }) });
assert.match(got.error, /not a page/);
got = await fetchSource("https://a.example/404", { get: stub({ "https://a.example/404": { status: 404, headers: {}, body: Buffer.from("") } }) });
assert.equal(got.error, "HTTP 404");
seen = [];
const many = await fetchSources(["https://a.example/1", "http://127.0.0.1/", "ftp://x.example/", "https://a.example/1", "https://gone.example/"], { get: stub({ "https://a.example/1": page(PARA) }) });
assert.equal(many.sources.length, 1, "only the readable source survives");
assert.ok(many.dropped.length >= 1 && many.dropped.every(d => d.error));
assert.ok(!seen.some(u => /127\.0\.0\.1|ftp:/.test(u)), "blocked URLs never reach the transport");
assert.ok((await fetchSources(Array.from({ length: 6 }, (_, i) => `https://a.example/${i}`), { get: async () => page(PARA) })).sources.length <= MAX_SOURCES);

// ---- the size cap: a page over 200 KB is truncated, not refused ---------------------------
const big = "<html><body><main>" + "<p>The mayor chaired the council meeting on the budget. </p>".repeat(8000) + "</main></body></html>";
assert.ok(Buffer.byteLength(big) > 2 * MAX_BYTES);
const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(big); });
await new Promise(r => srv.listen(0, "127.0.0.1", r));
try {
  const port = srv.address().port;
  const r = await transport.get(`http://127.0.0.1:${port}/`);   // IP literal: the test bypasses the URL screen on purpose
  assert.equal(r.truncated, true, "flagged truncated");
  assert.equal(r.body.length, MAX_BYTES, "read stops at the cap");
  assert.equal((await fetchSource(`http://127.0.0.1:${port}/`)).ok, false, "the same server is refused through fetchSource");
  const viaStub = await fetchSource("https://big.example/", { get: () => transport.get(`http://127.0.0.1:${port}/`) });
  assert.equal(viaStub.ok, true); assert.equal(viaStub.truncated, true);
  assert.ok(viaStub.text.length < MAX_BYTES && /chaired the council/.test(viaStub.text));
} finally { srv.close(); }

// ---- HTML to text ---------------------------------------------------------------------
const t = htmlToText(`<html><head><title>A &amp; B</title><style>.x{color:red}</style><script>var secret="leak"</script></head><body><nav>Menu Home About</nav><p>Mayor&nbsp;since 2021 &#8212; re-elected.</p><!-- hidden --><footer>Copyright</footer></body></html>`);
assert.equal(t.title, "A & B");
assert.match(t.text, /Mayor since 2021 — re-elected\./);
assert.ok(!/leak|color:red|hidden|Menu Home|Copyright/.test(t.text), "scripts, styles, comments, nav and footer are stripped");
const rec = sourceRecord([{ url: "https://a.example/1", finalUrl: "https://a.example/1", title: "T", text: "x".repeat(50000) }]);
assert.match(rec, /^== SOURCE 1: https:\/\/a\.example\/1 \(T\) ==/);
assert.ok(rec.length < 13000, "each source is capped for the scorer");

// ---- prompt rules ---------------------------------------------------------------------
for (const phrase of ["Use ONLY the SOURCES", "Do not use your own knowledge of this person", "The record is thin", "confidence under 35 and is then unassessed", "thin public record", "\"pending_candidate\"", "\"qualifier\"", "\"country\"", "Never guess skin tone", "\"confidence\": REQUIRED here"])
  assert.ok(OWNER_SOURCE_ADDENDUM.includes(phrase), `OWNER_SOURCE_ADDENDUM lost: ${phrase}`);
// Election care is a living-subject rule, so it reaches every scorer (Wikipedia ones too).
for (const phrase of ["CANDIDATE IN A PENDING ELECTION", "strictly factually", "No endorsement or opposition framing", "no prediction of the result", "no characterization of the campaign", "The Department does not vote."])
  assert.ok(LIVING_SUBJECTS.includes(phrase), `LIVING_SUBJECTS lost: ${phrase}`);
assert.ok(PUBLIC_RECORD.includes("CANDIDATE IN A PENDING ELECTION"));
assert.ok(REFERRAL_ADDENDUM.includes("\"pending_candidate\""), "Wikipedia referrals report candidacy too");
assert.ok(FACT_CHECK_SYSTEM.includes("An election forecast") && FACT_CHECK_SYSTEM.includes("the Department does not vote"));

console.log("owner-source checks passed");
