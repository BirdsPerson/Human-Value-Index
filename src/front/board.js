// THE LEADERBOARD's pure half (Leaderboard.jsx draws it, TourneyChannel.jsx reads it): which event is on, how a
// row reads, who moved. No React, no DOM, so scripts/check-desk.mjs can run it. The data is /api/tournament:
// the calendar (each event with its top five by division) and ?id= (one event's board, top 100).
export const DIVS = ["open", "assisted"];
const minus = (s) => String(s).replace(/^-/, "−");

// the event to show: a live one (a major first, then the most entrants, then the one closing soonest), else the
// last one finished (a final board). `game`: only that game's, for the golf channel.
export function pickEvent(events, now = Date.now(), game = null) {
  const evs = (events || []).filter(e => !game || e.game === game);
  const live = evs.filter(e => e.status === "open" && e.closes > now)
    .sort((a, b) => (Number(b.major || 0) - Number(a.major || 0)) || ((b.entrants || 0) - (a.entrants || 0)) || (a.closes - b.closes));
  if (live[0]) return { ev: live[0], live: true };
  const done = evs.filter(e => e.status === "closed" && e.leaders).sort((a, b) => b.closes - a.closes);
  return done[0] ? { ev: done[0], live: false } : null;
}
export const leadersOf = (ev, div = "open") => (ev?.leaders?.[div]?.length ? ev.leaders[div] : ev?.leaders?.[div === "open" ? "assisted" : "open"]) || [];

// a row's score as the board prints it: golf to par, bowling pins, the derby's weight
export function scoreText(ev, row) {
  if (!row) return "-";
  if (ev.game === "golf") return row.par != null ? (row.total - row.par === 0 ? "E" : minus(row.total - row.par > 0 ? `+${row.total - row.par}` : String(row.total - row.par))) : String(row.total);
  if (ev.game === "fish") return `${(row.total / 100).toFixed(2)} LB`;
  return String(row.total);
}
export const holder = (r) => String(r?.holder || "A FILE").toUpperCase();

// movement since a past snapshot ({holder: pos}): +n up n places, -n down, 0 held, null new to the board
export function moves(prev, rows) {
  const out = {};
  for (const r of rows || []) {
    const was = prev?.[r.holder];
    out[r.holder] = prev && was != null ? was - r.pos : null;
  }
  return out;
}
export const snapshot = (rows) => Object.fromEntries((rows || []).map(r => [r.holder, r.pos]));
// the arrow and its word: direction by shape as well as colour
export function arrowOf(d) {
  if (d == null) return { ch: "◆", word: "NEW", cls: "new" };
  if (d > 0) return { ch: "▲", word: `UP ${d}`, cls: "up" };
  if (d < 0) return { ch: "▼", word: `DOWN ${-d}`, cls: "dn" };
  return { ch: "■", word: "HELD", cls: "flat" };
}
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10 > 3 ? 0 : n % 10] || "TH"}`;
// "ON THE 17TH · −2"
export const bug = (hole, toPar) => `ON THE ${ordinal(hole)} · ${toPar === 0 ? "E" : minus(toPar > 0 ? `+${toPar}` : toPar)}`;
// "FINAL" or "CLOSES IN 3H"
export function whenText(ev, live, now = Date.now()) {
  if (!live) return "FINAL";
  const m = Math.max(0, Math.round((ev.closes - now) / 60000));
  return m >= 120 ? `CLOSES IN ${Math.round(m / 60)}H` : `CLOSES IN ${m}M`;
}
// the rows a size shows: S one, M five, T seven, L all (both divisions), W one at a time (the stepper picks)
export const ROWS_OF = { S: 1, M: 5, T: 7, L: 100, W: 1 };
