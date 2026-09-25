// The typed interview's progress, kept on the case's pending plan in Blobs. The server
// decides every move; the model only phrases the one it is handed. Haiku tracking a
// nine-item plan by itself repeated questions and ignored "that's everything".

export const MAX_FOLLOWUPS_PER_ITEM = 1;

// A reply this short with no number or proper noun is thin: one follow-up, then move on.
// ponytail: word-count heuristic; a model-side classification if it misfires on real users
const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|dozen|dozens|hundreds|thousands|daily|weekly|monthly|yearly)\b/i;
export function isThin(text) {
  const t = String(text || "").trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (/\d/.test(t) || NUMBER_WORDS.test(t)) return false;
  // a capitalised word after the first counts as a concrete detail (a name, a place)
  if (words.slice(1).some(w => /^[A-Z][a-z]/.test(w))) return false;
  return words.length < 12;
}

// Messages that are nothing but "I'm finished". Answers that merely contain "stop" or
// "that's it" are answers, not exits, so the whole message must be the exit phrase.
const EXIT = "that( i|')?s (all|everything|it)|i'?m (done|finished|leaving)|we'?re done|no more|nothing (else|more)|(good)?bye|stop|done|finished|end (it|this|the interview)|i (have to|need to|gotta) (go|run)|i'?m out";
const DONE_RE = new RegExp(`^((ok(ay)?|well|yeah|so|um+|alright)\\s+)*(${EXIT})(\\s+(thanks|thank you|for now|for today|now|bye|goodbye|i think))*$`, "i");
export function wantsOut(text) {
  const t = String(text || "").toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
  return DONE_RE.test(t);
}

// plan: [{ dimension, text }]
export function initState(plan) {
  return {
    items: (plan || []).map(q => ({ dimension: q.dimension || "section", text: q.text, status: "pending", followups: 0 })),
    cur: -1,          // index of the item currently on the table; -1 = only the opener so far
    processed: 0,     // subject messages already handled
    closed: false,
    last: null,       // the last directive, replayed if the client retries the same turn
  };
}

// Handles the subject's newest message. Pure: returns the next state and the directive.
// directive: { kind: "ask" | "followup" | "close", item?, reason? }
export function step(state, userText) {
  const s = structuredClone(state);
  s.processed += 1;
  const cap = s.items.length * 2 + 2;   // backstop: every item plus one follow-up each, plus opener and close

  const close = reason => {
    s.closed = true;
    s.last = { kind: "close", reason };
    return { state: s, directive: s.last };
  };
  if (s.closed) return close(s.last?.reason || "closed");
  if (wantsOut(userText)) return close("subject");
  if (s.processed > cap) return close("cap");

  const cur = s.items[s.cur];
  if (cur) {
    // The file photo takes whatever it gets: "brown hair, hoodie" is a complete answer.
    if (cur.status === "asked" && cur.dimension !== "file photo" && cur.followups < MAX_FOLLOWUPS_PER_ITEM && isThin(userText)) {
      cur.followups += 1;
      cur.status = "followed_up";
      s.last = { kind: "followup", item: s.cur };
      return { state: s, directive: s.last };
    }
    cur.status = "done";
  }
  const next = s.items.findIndex(i => i.status === "pending");
  if (next === -1) return close("complete");
  s.cur = next;
  s.items[next].status = "asked";
  s.last = { kind: "ask", item: next };
  return { state: s, directive: s.last };
}

// The per-turn instruction appended to the Officer's system prompt.
export function turnInstruction(state, directive) {
  const covered = state.items.filter((it, i) => it.status === "done" || (i !== directive.item && it.status !== "pending"));
  const remaining = state.items.filter(it => it.status === "pending").length;
  const lines = ["", "", "THIS TURN (the Department's clerk tracks the plan; you only phrase this one move):"];
  if (covered.length) lines.push(`Already covered, do NOT ask about these again: ${covered.map(it => it.dimension).join(", ")}.`);
  if (directive.kind === "ask") {
    const it = state.items[directive.item];
    lines.push(it.dimension === "file photo"
      ? `React to the subject's last message in one short flat line if it deserves one, then ask this, starting with the words "For the file photo": "${it.text}" It is optional; say so flatly.`
      : `React to the subject's last message in one short flat line if it deserves one, then ask this now, in your own words: "${it.text}"`);
    lines.push(`Ask only this one question. ${remaining} more after it.`);
  } else if (directive.kind === "followup") {
    const it = state.items[directive.item];
    lines.push(`The subject answered the ${it.dimension} question thinly. Ask ONE short follow-up for specifics about ${it.dimension} (what, when, how many). Do not ask anything else. Do not repeat the original question word for word.`);
  } else {
    lines.push(directive.reason === "subject"
      ? "The subject wants to stop. Acknowledge it flatly in one line, deliver a one-sentence closing, and end the message with the marker."
      : "The plan is complete. Deliver the closing line now and end the message with the marker. Ask nothing.");
  }
  return lines.join("\n");
}

// The model ended on its own (the subject asked to leave in words the regex missed).
export function closeState(state, reason = "subject") {
  return { ...state, closed: true, last: { kind: "close", reason } };
}
