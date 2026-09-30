// THE PEOPLE'S PETITION (docs/PETITION.md), on Netlify Blobs. The rules are in
// src/petition.js; this file is the storage, the vote, the tally, the hourly tick and the
// queue the Mac's review job reads (scripts/petition-review.mjs).
//
// Store hvi-petitions. <p> is the evaluation period (the length of the figure's scoreHistory):
//   v/<slug>/<p>/<voterKey>   one vote per assessed case per period {c, rev, q, at, ip, dev}
//                             onlyIfNew, then CAS on the etag (a change of mind within the period)
//   t/<slug>/<p>              the tally {seen: {voterKey: [rev, choice, quadrant]}, hold, opened}
//                             a fold of the votes, idempotent per voter revision (as the Assembly)
//   ip/<slug>/<p>/<ipHash>    {keys: [voterKey]} capped: files voting on this file from one address
//   dev/<slug>/<p>/<devHash>  {keys: [voterKey]} ... from one device
//   a/<slug>                  {period, at}: this file has votes (the tick's worklist)
//   h/<slug>                  {periods: {<p>: {votes, voters, byQuadrant, warmth, score, petition}}}
//                             the lean of every period, kept for good (the likability history)
//   q/<slug>/<p>              {slug, period, grantedAt, status, ...}: a granted review. It never
//                             says which way the people leaned: the review is blind to it.
//   cap/grants/<day>, cap/runs/<day>   {keys: [...]}: at most reviewsPerDay a day, site-wide
//   summary                   {at, figures: {slug: {reading, n}}}: the crowd's People signal
//
// Every function takes its store and lookups as arguments, so scripts/check-petition.mjs runs
// them against an in-memory store with Netlify Blobs' etag semantics.
import { createHash } from "node:crypto";
import { deviceHash } from "./assembly.js";
import { effectivelyGated, seriousHarm, validHarmReview } from "./intake.js";
import * as P from "../../src/petition.js";
import { cube } from "../../src/cube.js";
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";

export const STORE = "hvi-petitions";
export const CFG = P.CFG;
export const LIMITS = P.CFG.limits;
export const HEAL_EVERY_MS = 10 * 60 * 1000;
export const HEAL_MAX_VOTERS = 2000;   // past this a GET stops recounting (docs/PETITION.md: the DB trigger)
export const REVIEW_NOTE = "THE PEOPLE PETITIONED. THE DEPARTMENT RE-EXAMINED THE RECORD. IT WAS NOT TOLD WHICH WAY THEY LEANED.";

export const KEYS = {
  vote: (s, p, vk) => `v/${s}/${p}/${vk}`, votes: (s, p) => `v/${s}/${p}/`,
  tally: (s, p) => `t/${s}/${p}`,
  ip: (s, p, h) => `ip/${s}/${p}/${h}`, dev: (s, p, h) => `dev/${s}/${p}/${h}`,
  active: (s) => `a/${s}`, actives: "a/",
  lean: (s) => `h/${s}`,
  queue: (s, p) => `q/${s}/${p}`, queueOf: (s) => `q/${s}/`, queues: "q/",
  grants: (day) => `cap/grants/${day}`, runs: (day) => `cap/runs/${day}`,
  summary: "summary",
};

const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
// A case number is a credential: the store never holds it, only a salted hash.
export const voterKey = (caseId) => sha(`${salt()}:petition:${caseId}`).slice(0, 16);
export { deviceHash };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

// ---- the file ----------------------------------------------------------------------------------
// Public-figure files only: the 62 on record (src/figures.js) and referred/engine figures
// (hvi-figures). A citizen's file is never a petition target.
const ROSTER = new Map(FAMOUS_FIGURES.map(f => [slugify(f.name), f]));
export const isPlayerSlug = (slug) => /^citizen-/.test(String(slug || ""));

// Sensitive files take no opinion: harm-gated and serious-cap files, any case-by-case harm
// finding (made or pending), a withheld verdict, a candidate in a pending election, a local
// official, a file the Department keeps out of the pen's jokes. The flag says only CLOSED.
export function closedToOpinion(f, kind) {
  if (!f) return true;
  if (validHarmReview(f.harmReview) || f.harmReviewPending) return true;
  const b = f.breakdown;
  if (b && (effectivelyGated(b, f.harmReview) || seriousHarm(b))) return true;
  if (kind === "referral" && f.verdictStatus !== "published") return true;
  return Boolean(f.candidate || f.localOfficial || f.noDangle);
}

function figureOf(f, slug, kind) {
  const q = f.breakdown ? cube(f.breakdown) : null;
  return {
    slug, kind, name: f.name, qualifier: f.qualifier ?? null, score: f.score, tier: f.tier,
    warmth: q ? q.warmth : f.warmth ?? null, breakdown: f.breakdown || null, verdict: f.verdict ?? null,
    harm: f.harm ?? null, harmReview: f.harmReview ?? null, died: f.died ?? null, wikiTitle: f.wikiTitle || null,
    scoreHistory: Array.isArray(f.scoreHistory) ? f.scoreHistory : [], people: f.people ?? null,
    period: P.periodOf(f), closed: closedToOpinion(f, kind),
  };
}
// getCard(slug) -> the hvi-figures card or null. -> the figure or null.
export async function figureFor(slug, getCard) {
  if (!/^[a-z0-9-]{1,80}$/.test(String(slug || "")) || isPlayerSlug(slug)) return null;
  const r = ROSTER.get(slug);
  if (r) return figureOf(r, slug, "roster");
  const c = await getCard(slug);
  if (!c || c.removed || c.slug !== slug) return null;
  return figureOf(c, slug, "referral");
}

// The voter's cohort: their own file's quadrant, from its latest assessment.
export function voterQuadrant(rec) {
  const hs = (rec?.history || []).filter(h => h && !h.voided);
  const e = hs[hs.length - 1];
  if (!e) return -1;
  return P.quadrantIndex(e.quadrant || (e.breakdown ? cube(e.breakdown).quadrant : "UNPLACED"));
}
const assessed = (rec) => Array.isArray(rec?.history) && rec.history.some(h => h && !h.voided);

// ---- the tally -----------------------------------------------------------------------------------
const emptyTally = (opened) => ({ seen: {}, at: null, healedAt: 0, hold: null, opened: opened || null });
// Fold votes {vk: {rev, c, q}} into the period's tally, each only over an older revision, and
// move the hold. -> true when the tally holds them all.
export async function fold(store, slug, period, votes, { tries = 10, now = Date.now(), heal = false, opened = null } = {}) {
  const key = KEYS.tally(slug, period);
  for (let i = 0; i < tries; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const t = cur?.data ? structuredClone(cur.data) : emptyTally(opened);
    let changed = false;
    for (const [vk, v] of Object.entries(votes)) {
      const have = t.seen[vk];
      if (have && have[0] >= v.rev) continue;
      t.seen[vk] = [v.rev, P.CHOICES.indexOf(v.c), typeof v.q === "number" ? v.q : -1];
      changed = true;
    }
    if (!changed && !heal) return true;
    t.hold = P.nextHold(t.hold, P.countsOf(t.seen), now);
    t.at = new Date(now).toISOString();
    if (heal) t.healedAt = now;
    if (!t.opened && opened) t.opened = opened;
    const res = await store.setJSON(key, t, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20 * (i + 1));
  }
  return false;
}
async function listKeys(store, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    keys.push(...page.blobs.map(b => b.key));
    cursor = page.cursor;
  } while (cursor);
  return keys;
}
// Recount a period from its votes (a fold that lost its race is healed here).
export async function heal(store, slug, period, { now = Date.now(), tries = 8 } = {}) {
  const prefix = KEYS.votes(slug, period);
  const keys = await listKeys(store, prefix);
  const votes = {};
  for (let i = 0; i < keys.length; i += 50) {
    const got = await Promise.all(keys.slice(i, i + 50).map(k => store.get(k, { type: "json" })));
    got.forEach((v, j) => { if (v && P.CHOICES.includes(v.c)) votes[keys[i + j].slice(prefix.length)] = v; });
  }
  if (!(await fold(store, slug, period, votes, { now, tries, heal: true }))) throw new Error("petition heal: lost the tally race");
  return Object.keys(votes).length;
}
export const readTally = async (store, slug, period) => (await store.get(KEYS.tally(slug, period), { type: "json" })) || emptyTally();

// ---- a vote ------------------------------------------------------------------------------------------
async function claim(store, key, id, cap) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const keys = cur?.data?.keys || [];
    if (keys.includes(id)) return true;
    if (keys.length >= cap) return false;
    const res = await store.setJSON(key, { keys: [...keys, id] }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(3 + Math.random() * 10);
  }
  return false;
}

export function parseVote(body) {
  const choice = String(body?.choice || "").toLowerCase();
  if (!P.CHOICES.includes(choice)) return { error: "Choose: TOO HIGH, FAIR or TOO LOW. The Department does not read free text." };
  return { choice };
}

const view = (v, period) => (v ? { choice: v.c, rev: v.rev, at: v.at, period } : null);
const CLOSED_LINE = "This file is closed to opinion. The Department does not say why.";

// io: {store, getCase(caseId), getCard(slug), hitLimit(key, max, window)}. -> {status, body}
export async function castVote(io, { caseId, slug, choice, ip, device, now = Date.now() }) {
  const { store } = io;
  if (isPlayerSlug(slug)) return { status: 403, body: { error: "Citizens' files are not open to petition. Only public figures are subject to the people's opinion. You are subject to the Department's." } };
  let lim;
  try { lim = await io.hitLimit(`petition-ip:${ip}`, LIMITS.votesPerIpHour, "hour"); } catch {
    return { status: 503, body: { error: "The Department's queue ledger is unavailable, and the petition does not count off the books. Try again shortly." }, retry: 60 };
  }
  if (!lim.ok) return { status: 429, body: { error: "Too many votes from your location this hour. Opinion is rate-limited. Return in an hour." }, retry: 3600 };
  const fig = await figureFor(slug, io.getCard);
  if (!fig) return { status: 404, body: { error: "No such public file. The petition is for public figures only." } };
  if (fig.closed) return { status: 403, body: { error: CLOSED_LINE, closed: true } };
  const rec = await io.getCase(caseId);
  if (!rec) return { status: 404, body: { error: "No such file. The Department does not lose files. You have mistyped." } };
  if (!assessed(rec)) return { status: 403, body: { error: "Only assessed subjects petition. Be assessed first; then you may have opinions about others." } };
  const vk = voterKey(caseId), dh = deviceHash(device), p = fig.period, q = voterQuadrant(rec);
  let day;
  try { day = await io.hitLimit(`petition-case:${vk}`, LIMITS.votesPerCaseDay, "day"); } catch { day = { ok: false }; }
  if (!day.ok) return { status: 429, body: { error: `${LIMITS.votesPerCaseDay} votes from your file today. The Department admires the energy and declines the rest.` }, retry: 3600 };
  const opened = { at: new Date(now).toISOString(), score: fig.score, tier: fig.tier, warmth: fig.warmth };
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store.getWithMetadata(KEYS.vote(slug, p, vk), { type: "json" });
    const prev = cur?.data || null;
    if (prev && prev.c === choice) return { status: 200, body: { vote: view(prev, p), unchanged: true, period: p } };
    if (prev && prev.rev >= LIMITS.revisions) return { status: 429, body: { error: `You have changed this vote ${LIMITS.revisions} times this evaluation. The Department has recorded your final answer as your final answer.` } };
    if (!prev) {
      if (!(await claim(store, KEYS.ip(slug, p, ip), vk, LIMITS.casesPerIp))) return { status: 429, body: { error: `${LIMITS.casesPerIp} files have already voted on this subject from your location. The Department counts people, not paperwork.` } };
      if (dh && !(await claim(store, KEYS.dev(slug, p, dh), vk, LIMITS.casesPerDevice))) return { status: 429, body: { error: `${LIMITS.casesPerDevice} files have already voted on this subject from this device. One terminal is not a movement.` } };
    }
    const vote = { c: choice, rev: (prev?.rev || 0) + 1, q, at: new Date(now).toISOString(), ip, dev: dh };
    const res = await store.setJSON(KEYS.vote(slug, p, vk), vote, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res.modified) { await sleep(3 + Math.random() * 15); continue; }
    const folded = await fold(store, slug, p, { [vk]: vote }, { now, opened });
    try { await store.setJSON(KEYS.active(slug), { period: p, at: vote.at }); } catch { /* the tick's worklist; the next vote re-marks it */ }
    return { status: 200, body: { vote: view(vote, p), changed: Boolean(prev), folded, period: p } };
  }
  return { status: 409, body: { error: "Your vote collided with itself. Submit it once. The Department only needs to hear it once." } };
}

// ---- the lean history and the People signal -----------------------------------------------------
export async function readLean(store, slug) {
  return (await store.get(KEYS.lean(slug), { type: "json" })) || { periods: {} };
}
const periodRow = (period, counts, t) => ({ period, votes: counts.votes, voters: counts.voters, byQuadrant: counts.byQuadrant, warmth: t?.opened?.warmth ?? null, score: t?.opened?.score ?? null, tier: t?.opened?.tier ?? null, openedAt: t?.opened?.at ?? null, lastAt: t?.at ?? null });
// The crowd reading for a figure: every recorded period, the live one replacing its row.
export function crowdFor(lean, live = null) {
  const rows = { ...(lean?.periods || {}) };
  if (live) rows[live.period] = { ...(rows[live.period] || {}), ...live };
  return P.crowdOf(Object.values(rows));
}

// ---- the public view of one file ------------------------------------------------------------------
export async function queued(store, slug, period) {
  const q = await store.get(KEYS.queue(slug, period), { type: "json" });
  return q && q.status === "queued" ? q : null;
}
// What the last completed review did, set against which way the people had leaned (the file
// shows it; the review itself never saw the lean).
export function reviewOutcome(dir, delta) {
  if (typeof delta !== "number") return null;
  if (Math.abs(delta) < 2) return "THE RECORD STANDS";
  const agrees = (dir === "high" && delta < 0) || (dir === "low" && delta > 0);
  return agrees ? "THE DEPARTMENT CONCURS" : "THE DEPARTMENT DISSENTS";
}

export async function fileView(io, slug, { caseId = null, now = Date.now() } = {}) {
  const { store } = io;
  const fig = await figureFor(slug, io.getCard);
  if (!fig) return null;
  const machine = { score: fig.score, tier: fig.tier, period: fig.period };
  if (fig.closed) return { slug, closed: true, state: P.stateOf({ closed: true }), stateLine: P.STATE_LINE["CLOSED TO OPINION"], machine, rules: rules() };
  const p = fig.period;
  let t = await readTally(store, slug, p);
  const n = Object.keys(t.seen).length;
  if (n && n <= HEAL_MAX_VOTERS && now - (t.healedAt || 0) > HEAL_EVERY_MS) {
    try { await heal(store, slug, p, { now, tries: 2 }); t = await readTally(store, slug, p); } catch { /* the next read tries again */ }
  }
  const counts = P.countsOf(t.seen);
  const [q, lean] = await Promise.all([queued(store, slug, p), readLean(store, slug)]);
  const state = P.stateOf({ queued: Boolean(q), voters: counts.voters });
  const live = { period: p, votes: counts.votes, voters: counts.voters, warmth: t.opened?.warmth ?? fig.warmth };
  const crowd = crowdFor(lean, counts.voters ? live : null);
  const people = P.blendPeople(fig.people, crowd);
  const history = Object.values(lean.periods || {}).filter(r => r.period !== p && r.voters)
    .sort((a, b) => b.period - a.period).slice(0, 5)
    .map(r => ({ period: r.period, voters: r.voters, lean: P.publicCounts({ votes: r.votes, voters: r.voters }, true).lean, score: r.score, petitioned: r.petition ? { dir: r.petition.dir, delta: r.petition.delta ?? null, outcome: reviewOutcome(r.petition.dir, r.petition.delta) } : null }));
  let mine = null;
  if (caseId) mine = view(await store.get(KEYS.vote(slug, p, voterKey(caseId)), { type: "json" }), p);
  return {
    slug, closed: false, machine, state, stateLine: P.STATE_LINE[state],
    counts: P.publicCounts(counts, Boolean(q)), mine,
    people: people ? { likability: people.likability, source: people.source, crowd: people.crowd || null, polled: people.polled ?? null } : null,
    history, rules: rules(),
  };
}
const rules = () => ({ choices: P.CHOICES, ballot: P.BALLOT_RULE, noted: CFG.notedVoters, review: CFG.reviewVoters, holdHours: CFG.holdHours, reviewsPerDay: CFG.reviewsPerDay });

// ---- the hourly tick ------------------------------------------------------------------------------
// For every file with votes: fold the period into the lean history, heal the tally now and
// then, and grant a review where the trigger has held for holdHours (at most reviewsPerDay a
// day, strongest first; one per file per cooldownDays). Then the summary for the People
// signal. io: {store, getCard}. -> a report.
export async function tick(io, { now = Date.now() } = {}) {
  const { store } = io;
  const slugs = (await listKeys(store, KEYS.actives)).map(k => k.slice(KEYS.actives.length));
  const report = { files: slugs.length, granted: [], held: 0, skipped: [] };
  const candidates = [];
  const summary = {};
  for (const slug of slugs) {
    const fig = await figureFor(slug, io.getCard);
    const act = await store.get(KEYS.active(slug), { type: "json" });
    const lean = await readLean(store, slug);
    const periods = new Set([act?.period, fig?.period].filter(x => typeof x === "number"));
    let changed = false;
    for (const p of periods) {
      let t = await readTally(store, slug, p);
      if (!Object.keys(t.seen).length) continue;
      if (Object.keys(t.seen).length <= HEAL_MAX_VOTERS && now - (t.healedAt || 0) > HEAL_EVERY_MS) {
        try { await heal(store, slug, p, { now }); t = await readTally(store, slug, p); } catch { /* next hour */ }
      }
      const counts = P.countsOf(t.seen);
      const prev = lean.periods[p] || {};
      lean.periods[p] = { ...periodRow(p, counts, t), ...(prev.petition ? { petition: prev.petition } : {}) };
      changed = true;
      if (!fig || fig.closed || fig.period !== p) continue;
      const trig = P.trigger(counts);
      if (!t.hold || !trig) continue;
      if (!P.holdRipe(t.hold, now)) { report.held++; continue; }
      candidates.push({ slug, period: p, strength: trig.strength, trig, voters: counts.voters });
    }
    if (changed) await store.setJSON(KEYS.lean(slug), lean);
    const crowd = crowdFor(lean);
    if (crowd) summary[slug] = crowd;
  }
  candidates.sort((a, b) => b.strength - a.strength);
  const day = dayOf(now);
  for (const c of candidates) {
    if (await store.get(KEYS.queue(c.slug, c.period), { type: "json" })) { report.skipped.push([c.slug, "already granted"]); continue; }
    if (await coolingDown(store, c.slug, now)) { report.skipped.push([c.slug, "cooldown"]); continue; }
    if (!(await claim(store, KEYS.grants(day), c.slug, CFG.reviewsPerDay))) { report.skipped.push([c.slug, "daily cap"]); continue; }
    // The queue entry carries no direction: the review is blind to it.
    const entry = { slug: c.slug, period: c.period, grantedAt: new Date(now).toISOString(), status: "queued" };
    const res = await store.setJSON(KEYS.queue(c.slug, c.period), entry, { onlyIfNew: true });
    if (!res.modified) continue;
    // The file's own record of the petition (public, never read by the review).
    await updateLean(store, c.slug, c.period, { dir: c.trig.dir, share: Math.round(c.trig.share * 100), strength: Math.round(c.trig.strength * 100) / 100, cohorts: c.trig.cohorts, voters: c.voters, grantedAt: entry.grantedAt });
    report.granted.push(c.slug);
  }
  await store.setJSON(KEYS.summary, { at: new Date(now).toISOString(), figures: summary });
  return report;
}
async function coolingDown(store, slug, now) {
  for (const k of await listKeys(store, KEYS.queueOf(slug))) {
    const q = await store.get(k, { type: "json" });
    const t = Date.parse(q?.reviewedAt || q?.grantedAt || "");
    if (Number.isFinite(t) && now - t < CFG.cooldownDays * 86400000) return true;
  }
  return false;
}
export async function updateLean(store, slug, period, petition) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(KEYS.lean(slug), { type: "json" });
    const lean = cur?.data ? structuredClone(cur.data) : { periods: {} };
    const row = lean.periods[period] || { period, votes: { high: 0, fair: 0, low: 0 }, voters: 0 };
    row.petition = { ...(row.petition || {}), ...petition };
    lean.periods[period] = row;
    const res = await store.setJSON(KEYS.lean(slug), lean, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return true;
    await sleep(5 + Math.random() * 20);
  }
  return false;
}
export const readSummary = async (store) => (await store.get(KEYS.summary, { type: "json" }))?.figures || {};

// ---- the review queue (read by scripts/petition-review.mjs) -----------------------------------------
export async function queuedReviews(store) {
  const out = [];
  for (const k of await listKeys(store, KEYS.queues)) {
    const q = await store.get(k, { type: "json" });
    if (q?.status === "queued") out.push(q);
  }
  return out.sort((a, b) => (a.grantedAt < b.grantedAt ? -1 : 1));
}
export const claimRun = (store, slug, now = Date.now()) => claim(store, KEYS.runs(dayOf(now)), slug, CFG.reviewsPerDay);
export async function finishReview(store, q, result) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(KEYS.queue(q.slug, q.period), { type: "json" });
    if (!cur?.data) return false;
    const res = await store.setJSON(KEYS.queue(q.slug, q.period), { ...cur.data, ...result }, { onlyIfMatch: cur.etag });
    if (res.modified) return true;
  }
  return false;
}
