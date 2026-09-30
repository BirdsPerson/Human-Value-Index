// The social tick: advances the Substrate's relationships to the current machine hour
// (1 real minute = 1 machine hour, so an hourly run covers ~60 machine hours). Pure JS, no
// LLM, deterministic from the seed and the stored state (src/city/social.js). The first run
// fast-forwards 30 machine days so the city isn't empty.
//
// Runs in a background function (netlify/functions/social-tick-background.js, 15 min) that
// the hourly scheduled function triggers. The work goes in chunks of CHUNK_HOURS machine
// hours, aligned to the machine clock, with a checkpoint after each: the state is written
// only if nobody else wrote it since this run read it (Blobs etag, onlyIfMatch), so a
// killed run loses at most one chunk and a stale or concurrent worker can never roll the
// ledger back. A lease keeps two workers from running at once. After budgetMs the run
// stops starting chunks and publishes what it has; the next hour picks up from there.
//
// Scaling step 6 (docs/CITY_SPEC.md "Relations"): the ledger is 64 pair buckets under a
// header (netlify/lib/social-store.js), and each chunk is one 6-machine-hour window of a
// published day: the tick reads who was where from that window's sector files (plans.js
// format 2), falls back to the day's one-file plan (format 1), then to the sim. All three
// give the same city for the same plan (scripts/check-social.mjs).
import { machineClock, SEED, rosterVersion, WINDOW_H } from "../../src/city/sim.js";
import { emptyState, advance, publish, publishAll, fromV1, sectorPresence } from "../../src/city/social.js";
import { fullRoster } from "../../src/city/roster.js";

export const FAST_FORWARD_DAYS = 30;
export const CHUNK_HOURS = WINDOW_H;          // one sector window per chunk
export const MAX_HOURS_PER_RUN = 24 * 40;   // a longer backlog catches up over the next runs
export const ROSTER_LOG = 48;                // processed ranges kept in state.rosters

export class TickConflict extends Error {
  constructor(msg) { super(msg); this.name = "TickConflict"; }
}

// Record which roster (sim.js rosterVersion: every key, tier and print) produced machine
// hours [from, to). Contiguous ranges under one roster merge, so the record is the same
// however the work was chunked.
function noteRoster(state, from, to, ver) {
  const log = (state.rosters ||= []);
  const last = log[log.length - 1];
  if (last && last[2] === ver && last[1] === from) last[1] = to;
  else log.push([from, to, ver]);
  if (log.length > ROSTER_LOG) log.splice(0, log.length - ROSTER_LOG);
}

// Which published plan placed each machine day the tick processed ("sim" when none), so a
// ledger can be traced to the city it saw. Bounded like the roster log.
function notePlan(state, day, ver) {
  const log = (state.plans ||= {});
  log[day] = ver || "sim";
  const days = Object.keys(log).map(Number).sort((x, y) => x - y);
  for (const d of days.slice(0, Math.max(0, days.length - ROSTER_LOG))) delete log[d];
}

// io: { census, putPublic, putSubjects? (64 per-subject shards), windows? ((day, w) -> the
//   window's sector files, plans.js loadWindows), plans? (days -> {day: ver} loaded into the
//   sim, the one-file plans) } plus either
//   load() -> { state, etag } and save(state, etag) -> newEtag (throws TickConflict), with an
//   optional lease { acquire(run, ms) -> bool, release(run) }   (netlify/lib/social-store.js)
// or the plain getState()/putState(state) pair (benchmarks: no conditional writes).
// opts.checkpointMs: checkpoint after a chunk only if this long has passed since the last
// one (0, the default: every chunk); the run's last chunk always checkpoints.
export async function tick(nowMs = Date.now(), io, opts = {}) {
  const clock = opts.clock || Date.now;
  const t0 = clock();
  const budgetMs = opts.budgetMs ?? Infinity;
  const run = opts.run || `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const nowHour = Math.floor(machineClock(nowMs).mt);

  if (io.lease && !(await io.lease.acquire(run, opts.leaseMs ?? 16 * 60 * 1000))) {
    return { skipped: "another run holds the lease", run };
  }
  try {
    // The census first: the tick forgets anyone missing from it, so a failed read must
    // write nothing (census() throws rather than pass for an empty city).
    // Where the time goes (reported with the run): Blobs I/O vs the sim itself.
    const t = { io: 0, sim: 0 };
    const timed = async (k, f) => { const a = clock(); try { return await f(); } finally { t[k] += clock() - a; } };
    const roster = fullRoster(await timed("io", () => io.census()));
    let { state, etag, migrated } = await timed("io", () => (io.load ? io.load() : io.getState().catch(() => null).then(state => ({ state, etag: null }))));
    const save = io.save ? (s, e) => io.save(s, e) : async (s) => { await io.putState(s); return null; };
    if (state && state.v !== 2) state = fromV1(state);
    if (!state || state.seed !== SEED) {
      const start = nowHour - 24 * FAST_FORWARD_DAYS;
      state = emptyState(start - (((start % 24) + 24) % 24), SEED);
    }
    const from = state.hour;
    const target = Math.min(nowHour, state.hour + MAX_HOURS_PER_RUN);
    let chunks = 0, saved = clock(), dirty = false;
    const sources = { sectors: 0, plan: 0, sim: 0 }, f1 = {};
    while (state.hour < target) {
      if (chunks > 0 && clock() - t0 >= budgetMs) break;
      const a = state.hour;
      const b = Math.min(target, (Math.floor(a / CHUNK_HOURS) + 1) * CHUNK_HOURS);
      const day = Math.floor(a / 24) + 1, w = Math.floor((a - (day - 1) * 24) / WINDOW_H);
      // Who was where: the window's sector files, else the day's one-file plan, else the sim.
      let win = null, ver = null;
      if (io.windows) win = await timed("io", () => io.windows(day, w)).catch(err => { console.error("social tick: sector windows unreadable, the one-file plan decides", day, w, err?.message); return null; });
      if (win) { ver = win.ver; sources.sectors++; }
      else {
        if (io.plans && !(day in f1)) f1[day] = (await timed("io", () => io.plans([day])).catch(err => { console.error("social tick: plans unreadable, the sim decides", err?.message); return {}; }))[day] || null;
        ver = f1[day] || null;
        sources[ver ? "plan" : "sim"]++;
      }
      const c = clock();
      advance(state, roster, b, win ? { presence: sectorPresence(win) } : {});
      t.sim += clock() - c;
      noteRoster(state, a, b, rosterVersion());
      notePlan(state, day, ver);
      chunks++; dirty = true;
      const last = state.hour >= target || clock() - t0 >= budgetMs;
      if (last || !opts.checkpointMs || clock() - saved >= opts.checkpointMs) {
        state.tick = { run, at: new Date(clock()).toISOString(), chunk: chunks };
        etag = await timed("io", () => save(state, etag));   // checkpoint; TickConflict if the ledger moved under us
        saved = clock(); dirty = false;
      }
    }
    if (dirty) {   // (only when the budget ran out between a skipped checkpoint and the loop test)
      state.tick = { run, at: new Date(clock()).toISOString(), chunk: chunks };
      etag = await timed("io", () => save(state, etag));
    }
    if (migrated && !chunks) etag = await timed("io", () => save(state, etag));   // a migration lands even with nothing to advance
    const c = clock();
    const pub = publish(state, state.hour);
    const bySubject = publishAll(state, roster.map(s => s.slug), { relations: SUBJECT_RELATIONS, events: SUBJECT_EVENTS });
    pub.at = new Date(nowMs).toISOString();
    t.sim += clock() - c;
    if (io.putSubjects) await timed("io", () => io.putSubjects(bySubject, { hour: state.hour, at: pub.at }));
    // The city view only: a subject's relations live in its shard (/api/social/<slug>). With
    // opts.legacyPublic the view also carries bySubject, as it did before step 6.
    await timed("io", () => io.putPublic(opts.legacyPublic ? { ...pub, bySubject: trimSubjects(bySubject) } : pub));
    if (io.after) await timed("io", () => io.after(state));
    return { run, hour: state.hour, nowHour, from, sources, migrated: migrated || undefined, behind: nowHour - state.hour, chunks, ms: Math.round(clock() - t0), simMs: Math.round(t.sim), ioMs: Math.round(t.io), counts: pub.counts };
  } finally {
    if (io.lease) await io.lease.release(run).catch(() => {});
  }
}

// What a subject's shard holds (/api/social/<slug>), and the trimmed copy in the one-blob
// public view (what /api/social?subject= served before shards: 8 relations, 5 events).
export const SUBJECT_RELATIONS = 12, SUBJECT_EVENTS = 8;
function trimSubjects(bySubject) {
  const out = {};
  for (const [k, v] of Object.entries(bySubject)) out[k] = { relations: v.relations.slice(0, 8), events: v.events.slice(0, 5) };
  return out;
}
