// A file's movement over time, and who caused it (Scott, 2026-09-28: "make the Department's
// own adjustments visible on people's files, distinct from changes people made themselves").
// Pure: used by the browser, the functions and the scripts.
//
// Causes:
//   baseline  the score a file was first recorded at (the start of a log)
//   visit     the subject's own interview           } YOUR CHANGES
//   appeal    the subject's appeal                  }
//   vouch     a vouch the subject earned            }
//   method    the Department changed its method (calibration, tier cutoffs)  } THE DEPARTMENT'S
//   record    the public record was re-read (news, a roster rescore)         } CHANGES
//   review    a case-by-case harm review, or (sub "petition") the re-examination }
//             the people petitioned for (docs/PETITION.md)                    }
export const CAUSES = ["baseline", "visit", "appeal", "vouch", "method", "record", "review"];
export const YOUR_CAUSES = ["visit", "appeal", "vouch"];
export const DEPARTMENT_CAUSES = ["method", "record", "review"];
export const validCause = c => CAUSES.includes(c);

const isNum = v => typeof v === "number" && Number.isFinite(v);

// Citizen history entries predate causes: an entry with no cause is the subject's own
// visit (or appeal); `kind: "recalibration"` is the Department's.
export function causeOf(h) {
  if (h && validCause(h.cause)) return h.cause;
  if (h?.kind === "recalibration") return "method";
  return h?.appeal ? "appeal" : "visit";
}
// Visits are the subject's own sittings (interview or appeal). Department changes and
// vouches are shown in the log but never counted as visits, never capped, never appeals.
export const isVisit = h => { const c = causeOf(h); return c === "visit" || c === "appeal"; };
export const visitCount = history => (history || []).filter(h => h && !h.voided && isVisit(h)).length;
// The visit number of one entry (1-based), counting only visits up to and including it.
export function visitNumberOf(history, entry) {
  const hs = (history || []).filter(h => h && !h.voided);
  const i = hs.indexOf(entry);
  return (i < 0 ? hs : hs.slice(0, i + 1)).filter(isVisit).length;
}

// What a browser needs of a history (public shape, no transcripts or raw readings).
export function publicHistory(history) {
  return (history || []).filter(h => h && !h.voided && isNum(h.score)).map(h => ({
    at: h.at || null, score: h.score, tier: h.tier || null, cause: causeOf(h),
    note: typeof h.note === "string" ? h.note.slice(0, 200) : null, method: h.method || null,
  }));
}

// Figures keep a compact log: [{at, score, tier, cause, note, method}], oldest first.
export function figureEntry({ at, score, tier, cause, note = null, method = null, sub = null }) {
  if (!validCause(cause)) throw new Error(`invalid cause: ${cause}`);
  if (!isNum(score)) throw new Error("score must be a number");
  return { at, score, tier, cause, ...(sub ? { sub } : {}), ...(note ? { note } : {}), ...(method ? { method } : {}) };
}
// Append to a figure's log, seeding a baseline from `before` when the log is empty.
export function appendFigureHistory(log, entry, before = null) {
  const out = Array.isArray(log) ? [...log] : [];
  if (!out.length && before && isNum(before.score)) out.push(figureEntry({ ...before, cause: "baseline" }));
  out.push(figureEntry(entry));
  return out;
}

// Ordered, validated: every entry has a known cause and a score, times never go backwards.
export function historyError(log) {
  if (!Array.isArray(log)) return "not a list";
  let prev = "";
  for (const h of log) {
    if (!h || !isNum(h.score)) return "entry without a score";
    if (h.cause != null && !validCause(h.cause)) return `unknown cause ${h.cause}`;
    if (h.at && prev && h.at < prev) return `out of order at ${h.at}`;
    if (h.at) prev = h.at;
  }
  return null;
}

// The FILE MOVEMENT list: each change with its delta against the entry before it,
// split into the subject's own changes and the Department's.
export function movement(log) {
  const rows = [];
  let prev = null;
  for (const h of log || []) {
    if (!h || !isNum(h.score)) continue;
    const cause = causeOf(h);
    rows.push({ at: h.at || null, cause, sub: h.sub || null, score: h.score, tier: h.tier || null, delta: prev === null ? null : h.score - prev, note: h.note || null, method: h.method || null });
    prev = h.score;
  }
  return {
    yours: rows.filter(r => YOUR_CAUSES.includes(r.cause)),
    department: rows.filter(r => DEPARTMENT_CAUSES.includes(r.cause)),
    baseline: rows.find(r => r.cause === "baseline") || null,
    all: rows,
  };
}

export const CAUSE_LABEL = {
  baseline: "ON FILE", visit: "INTERVIEW", appeal: "APPEAL", vouch: "VOUCH",
  method: "METHOD REVISED", record: "RECORD RE-READ", review: "HARM REVIEW",
};
export const SUB_LABEL = { petition: "PETITION REVIEW" };
export const causeLabel = (r) => SUB_LABEL[r?.sub] || CAUSE_LABEL[r?.cause] || String(r?.cause || "").toUpperCase();
