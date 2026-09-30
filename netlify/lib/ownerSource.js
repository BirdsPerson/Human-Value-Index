// Owner-added local public officials (Scott, 2026-09-30): a real public official with no
// Wikipedia article gets in ONLY through an owner case with public source links. The pages
// are fetched here, server side, and become the whole record: the scorer and the
// fact-check read these sources and nothing else. Used by /api/refer.
//
// SSRF: the URL is the owner's, but a fetcher that follows it anywhere is still a way into
// the network the function runs on. Only http(s) on the default ports, no credentials, no
// IP-literal or DNS answer in a private, loopback, link-local, CGNAT, multicast or reserved
// range. The address check runs inside the socket's own DNS lookup (pinned), so a name
// can't resolve clean for the check and private for the connect. Redirects are followed by
// hand (max 3) and every hop is checked again.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

export const MAX_SOURCES = 3;
export const MAX_BYTES = 200 * 1024;          // raw page cap; a larger page is truncated, not refused
export const MAX_TEXT = 12000;                // per source, into the scorer (cost: ~3k tokens each)
export const FETCH_MS = 8000;
const MAX_REDIRECTS = 3;
const UA = "HumanValueIndex/1.0 (https://humanvalueindex.com; owner source fetch)";

// ---- address screening --------------------------------------------------------------
const v4 = ip => ip.split(".").map(Number);
function blockedV4(ip) {
  const [a, b] = v4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224                 // this-net, private, loopback, multicast + reserved
    || (a === 100 && b >= 64 && b <= 127)                             // CGNAT
    || (a === 169 && b === 254)                                       // link-local (cloud metadata)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)  // private
    || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) // IETF, benchmarking
    || (a === 192 && b === 88 && v4(ip)[2] === 99);
}
function blockedV6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return blockedV4(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true;   // mapped, hex form: refuse rather than decode
  if (s === "::" || s === "::1") return true;
  const head = parseInt(s.split(":")[0] || "0", 16);
  return (head & 0xfe00) === 0xfc00       // fc00::/7 unique local
    || (head & 0xffc0) === 0xfe80         // fe80::/10 link-local
    || (head & 0xff00) === 0xff00         // multicast
    || head === 0x2001 && parseInt(s.split(":")[1] || "0", 16) === 0x0db8   // documentation
    || head === 0x0064 || head === 0x2002 || head === 0;                    // NAT64, 6to4, other ::/16
}
export function blockedAddress(ip) {
  const fam = net.isIP(String(ip).replace(/^\[|\]$/g, ""));
  if (fam === 4) return blockedV4(ip);
  if (fam === 6) return blockedV6(ip);
  return true;
}

// Pure: the reason a URL may not be fetched, or null. DNS is checked at connect time.
export function sourceUrlError(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return "not a URL"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "only http and https";
  if (u.username || u.password) return "credentials in the URL";
  if (u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80"))) return "non-standard port";
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || !host.includes(".") && !net.isIP(host)) return "internal host";
  if (net.isIP(host) && blockedAddress(host)) return "private address";
  if (String(raw).length > 1000) return "URL too long";
  return null;
}

// dns.lookup that refuses private answers; handed to the socket so the check is the connect.
export function safeLookup(hostname, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => blockedAddress(a.address))) {
      const e = new Error(`blocked address for ${hostname}`); e.code = "EBLOCKED"; return cb(e);
    }
    if (options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

// One GET, no redirects followed: { status, headers, body (Buffer, <= max), truncated }.
function getOnce(url, { max = MAX_BYTES, ms = FETCH_MS, lookup = safeLookup } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, { method: "GET", lookup, timeout: ms, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "Accept-Encoding": "gzip, deflate, br" } }, res => {
      const enc = String(res.headers["content-encoding"] || "").toLowerCase();
      const stream = enc === "gzip" || enc === "x-gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = []; let size = 0, done = false;
      const finish = truncated => { if (done) return; done = true; clearTimeout(t); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).subarray(0, max), truncated }); };
      stream.on("data", c => {
        if (done) return;
        chunks.push(c); size += c.length;
        if (size >= max) { finish(true); req.destroy(); }
      });
      stream.on("end", () => finish(false));
      stream.on("error", e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
    // Whole-request deadline, not only socket idle: a slow drip can't hold the function.
    const t = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", e => { clearTimeout(t); reject(e); });
    req.end();
  });
}

// The transport, swappable by the offline checks (scripts/check-functions.mjs).
export const transport = { get: getOnce };

// url -> { ok: true, url, finalUrl, title, text, truncated } or { ok: false, url, error }.
export async function fetchSource(url, { get = transport.get } = {}) {
  let cur = String(url || "").trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = sourceUrlError(cur);
    if (bad) return { ok: false, url, error: bad };
    let r;
    try { r = await get(cur); } catch (e) { return { ok: false, url, error: e?.code === "EBLOCKED" ? "private address" : e?.code === "ETIMEDOUT" ? "timeout" : "unreachable" }; }
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers?.location) {
      try { cur = new URL(r.headers.location, cur).href; } catch { return { ok: false, url, error: "bad redirect" }; }
      continue;
    }
    if (r.status < 200 || r.status >= 300) return { ok: false, url, error: `HTTP ${r.status}` };
    const type = String(r.headers?.["content-type"] || "").toLowerCase();
    if (type && !/text\/html|application\/xhtml|text\/plain/.test(type)) return { ok: false, url, error: `not a page (${type.split(";")[0]})` };
    const raw = Buffer.from(r.body || "").toString("utf8");
    const { title, text } = /text\/plain/.test(type) ? { title: "", text: raw } : htmlToText(raw);
    if (text.length < 200) return { ok: false, url, error: "no readable text" };
    return { ok: true, url, finalUrl: cur, title, text, truncated: Boolean(r.truncated) };
  }
  return { ok: false, url, error: "too many redirects" };
}

// ---- HTML -> text ---------------------------------------------------------------------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", middot: "·", copy: "©" };
export const decodeEntities = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; }
  return ENT[e.toLowerCase()] ?? m;
});
export function htmlToText(html) {
  let h = String(html || "");
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] || "").replace(/\s+/g, " ").trim()).slice(0, 200);
  // Main content first when the page marks it: navigation menus otherwise fill the budget.
  const main = /<(main|article)\b[^>]*>([\s\S]*)<\/\1>/i.exec(h);
  if (main && main[2].replace(/<[^>]+>/g, "").trim().length > 400) h = main[2];
  h = h.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form|select|button)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(h).replace(/[ \t\r\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text };
}

// Several URLs, fetched in parallel, de-duplicated. Returns { sources: ok[], dropped: failed[] }.
export async function fetchSources(urls, opts) {
  const list = [...new Set((Array.isArray(urls) ? urls : []).map(u => String(u || "").trim()).filter(Boolean))].slice(0, MAX_SOURCES);
  const got = await Promise.all(list.map(u => fetchSource(u, opts)));
  return { sources: got.filter(g => g.ok), dropped: got.filter(g => !g.ok).map(g => ({ url: g.url, error: g.error })) };
}

// The record the scorer and the fact-check read: each source under its own "==" heading
// (selectSource in lib/factCheck.js splits on those), each capped.
export const sourceRecord = (sources, max = MAX_TEXT) =>
  sources.map((s, i) => `== SOURCE ${i + 1}: ${s.finalUrl || s.url}${s.title ? ` (${s.title})` : ""} ==\n${s.text.slice(0, max)}`).join("\n\n");
