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
import { machineClock, SEED, rosterVersion } from "../../src/city/sim.js";
import { emptyState, advance, publish, publishAll } from "../../src/city/social.js";
import { fullRoster } from "../../src/city/roster.js";

export const FAST_FORWARD_DAYS = 30;
export const CHUNK_HOURS = 6;
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

// io: { census, putPublic } plus either
//   load() -> { state, etag } and save(state, etag) -> newEtag (throws TickConflict), with an
//   optional lease { acquire(run, ms) -> bool, release(run) }   (netlify/lib/social-store.js)
// or the plain getState()/putState(state) pair (benchmarks: no conditional writes).
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
    let { state, etag } = await timed("io", () => (io.load ? io.load() : io.getState().catch(() => null).then(state => ({ state, etag: null }))));
    const save = io.save ? (s, e) => io.save(s, e) : async (s) => { await io.putState(s); return null; };
    if (!state || state.seed !== SEED) {
      const start = nowHour - 24 * FAST_FORWARD_DAYS;
      state = emptyState(start - (((start % 24) + 24) % 24), SEED);
    }
    const from = state.hour;
    const target = Math.min(nowHour, state.hour + MAX_HOURS_PER_RUN);
    let chunks = 0;
    while (state.hour < target) {
      if (chunks > 0 && clock() - t0 >= budgetMs) break;
      const a = state.hour;
      const b = Math.min(target, (Math.floor(a / CHUNK_HOURS) + 1) * CHUNK_HOURS);
      const c = clock();
      advance(state, roster, b);
      t.sim += clock() - c;
      noteRoster(state, a, b, rosterVersion());
      chunks++;
      state.tick = { run, at: new Date(clock()).toISOString(), chunk: chunks };
      etag = await timed("io", () => save(state, etag));   // checkpoint; TickConflict if the ledger moved under us
    }
    const c = clock();
    const pub = publish(state, state.hour);
    pub.bySubject = publishAll(state, roster.map(s => s.slug), { relations: 8, events: 5 });
    pub.at = new Date(nowMs).toISOString();
    t.sim += clock() - c;
    await timed("io", () => io.putPublic(pub));
    return { run, hour: state.hour, nowHour, from, behind: nowHour - state.hour, chunks, ms: Math.round(clock() - t0), simMs: Math.round(t.sim), ioMs: Math.round(t.io), counts: pub.counts };
  } finally {
    if (io.lease) await io.lease.release(run).catch(() => {});
  }
}
