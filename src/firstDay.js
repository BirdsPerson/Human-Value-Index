// YOUR FIRST DAY: the five things a new file is shown after its interview, each one tap to the
// right room, each ticked by what actually happened (the server's state; this device's records
// only where no server keeps one). Pure: stepsFrom() turns the state src/FirstDay.jsx gathers
// into the steps it draws. Checked by scripts/check-firstday.mjs.

// INVEST OR SAVE goes here. The single place to point it at the market page when it lands.
export const MARKET_HREF = "#market";

export const INTRO = "THE DEPARTMENT EXPECTS FIVE THINGS. NONE ARE MANDATORY. ALL ARE NOTED.";
export const DONE_LINE = "ORIENTATION COMPLETE. YOU ARE NOW ORDINARY.";

// Your own citizen in the city: the census slug every server function uses (citizen-<last 4>).
export const selfFindHref = (caseId) => (caseId ? `#city?find=citizen-${String(caseId).slice(-4).toLowerCase()}` : "#city");

// ---- this device's notes (try/catch: a private window simply forgets) ------------------------
const key = (caseId, what) => `hvi-fd:${caseId}:${what}`;
export function noted(caseId, what) {
  try { return Boolean(caseId) && localStorage.getItem(key(caseId, what)) === "1"; } catch { return false; }
}
export function note(caseId, what) {
  try { if (caseId) localStorage.setItem(key(caseId, what), "1"); } catch { /* the Department forgets, for once */ }
  try { window.dispatchEvent(new CustomEvent("hvi-firstday", { detail: { caseId, what } })); } catch { /* no window */ }
}
// Games played on this device: tennis and golf keep their results only here.
export function localGames() {
  const n = (k) => { try { const j = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(j) ? j.length : 0; } catch { return 0; } };
  return { tennis: n("hvi-tennis-exhibitions"), golf: n("hvi-golf-rounds") };
}

// ---- the steps ------------------------------------------------------------------------------
// state (any part may be missing while it loads; missing reads as not yet done):
//   econ      the /api/economy GET for the case: {open, wallet} ({gate: true} when refused)
//   assembly  the /api/assembly?caseId= GET: {session: {state}, mine}
//   leagues   the /api/leagues?caseId= GET: {eligible, entry, drafted}
//   chess     the /api/chess?caseId= record: {w, d, l}
//   games     localGames()
//   saved, petition, city   this device's notes (chose SAVE; voted on a petition; found self)
// -> [{id, n, label, note, href, status: "done" | "todo" | "later", optional}]
//   "later": the step cannot be taken yet (treasury shut, allowance vesting, leagues not drafting
//   this file). It is shown, and left out of the count.
export function stepsFrom(s = {}, caseId = null) {
  const econ = s.econ && !s.econ.gate ? s.econ : null;
  const w = econ?.open ? econ.wallet : null;
  const shut = Boolean(s.econ?.gate) || econ?.open === false;
  const vesting = Boolean(w?.tray?.vesting);

  const collected = Boolean(w && w.enrolled && (w.tray?.days === 0 || (w.recent || []).some(t => t.kind === "ubi" && t.day === w.today)));
  const invested = Boolean(w && ((w.positions || []).length > 0 || (w.recent || []).some(t => t.kind === "buy")));

  const sitting = s.assembly?.session?.state === "open";
  const voted = Boolean((sitting && s.assembly?.mine) || s.petition);

  const lg = s.leagues;
  const entered = Boolean(lg && ((lg.entry?.sports || []).length > 0 || (lg.drafted || []).length > 0));
  const undraftable = Boolean(lg && !lg.eligible && !entered);

  const c = s.chess || {};
  const g = s.games || {};
  const played = (c.w || 0) + (c.d || 0) + (c.l || 0) + (g.tennis || 0) + (g.golf || 0) > 0;

  const st = (done, later = false) => (done ? "done" : later ? "later" : "todo");
  return [
    { id: "collect", n: 1, label: "COLLECT YOUR CYCLES", href: "#economy",
      note: collected ? "TRAY EMPTY. THE DEPARTMENT HAS PAID YOU. DO NOT THANK IT."
        : shut ? "THE TREASURY IS NOT YET OPEN."
        : vesting ? `YOUR ALLOWANCE VESTS ON ${w.vestDay}, YOUR FILE'S THIRD DAY. THE DEPARTMENT LIKES TO SEE WHETHER YOU STAY.`
        : "1,000 A DAY. THE TRAY KEEPS SEVEN.",
      status: st(collected, shut || vesting) },
    { id: "invest", n: 2, label: "INVEST OR SAVE", href: MARKET_HREF,
      note: invested ? "A POSITION ON FILE. THE DISTRICTS THANK YOU. THEY DO NOT." : s.saved ? "YOU CHOSE TO SAVE. PRUDENCE, NOTED." : shut ? "THE TREASURY IS NOT YET OPEN. SAVING NEEDS NO TREASURY." : "BACK A DISTRICT, OR KEEP IT ALL IN CASH.",
      status: st(invested || Boolean(s.saved)), canSave: !invested && !s.saved },
    { id: "vote", n: 3, label: "CAST A VOTE", href: sitting || !s.assembly ? "#assembly" : "#scores",
      note: voted ? "BALLOT RECEIVED. NON-BINDING. NOTED ANYWAY."
        : sitting || !s.assembly ? "THE ASSEMBLY IS SITTING. ONE BALLOT. NON-BINDING."
        : "NO SESSION SITTING. PETITION A FAMOUS FILE INSTEAD.",
      status: st(voted) },
    { id: "league", n: 4, label: "JOIN A LEAGUE", href: "#file?at=leagues",
      note: entered ? "ENTERED. THE DRAFT WILL DECIDE WHAT YOU ARE WORTH. AGAIN." : undraftable ? "THE LEAGUES ARE NOT DRAFTING THIS FILE." : "YOUR CITIZEN GOES INTO THE NEXT DRAFT.",
      status: st(entered, undraftable) },
    { id: "play", n: 5, label: "PLAY A GAME", href: "#play",
      note: played ? "A RESULT ON FILE. THE DEPARTMENT WATCHED." : "TENNIS, GOLF OR CHESS. FINISH ONE.",
      status: st(played) },
    { id: "city", n: 6, label: "FIND YOURSELF IN THE CITY", href: selfFindHref(caseId), optional: true,
      note: s.city ? "LOCATED. YOU WERE WHERE THE DEPARTMENT LEFT YOU." : "FIND ME. FOLLOW YOURSELF TO WORK.",
      status: st(Boolean(s.city)) },
  ];
}

// -> {done, total, complete, next}: the count over the steps that can be taken now, optional
// steps aside; complete when every one of those is done (and at least one could be taken).
export function progressOf(steps) {
  const counted = steps.filter(x => !x.optional && x.status !== "later");
  const done = counted.filter(x => x.status === "done").length;
  return { done, total: counted.length, complete: counted.length > 0 && done === counted.length, next: steps.find(x => x.status === "todo") || null };
}
