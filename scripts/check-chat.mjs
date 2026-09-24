// Self-check for the typed intake channel helpers. Run: node scripts/check-chat.mjs
import assert from "node:assert/strict";
import { AGENT_PROMPT, CHAT_PROMPT, FIRST_MESSAGE, fillVars, splitEnd, END_MARKER } from "../netlify/lib/agentPrompt.js";
import { messagesError, toClaudeMessages, planOf } from "../netlify/functions/intake-chat.js";
import { initState, step, turnInstruction, closeState, isThin, wantsOut } from "../netlify/lib/interview.js";
import { pickQuestions, pickAppealQuestions } from "../netlify/lib/intake.js";

// variables: every placeholder in the real prompt gets filled, unknowns fall back
const vars = { case_number: "HVI-ABCDEFGH", visit_number: "2", focus_dimensions: "care", question_plan: "Q1\nQ2", returning_note: "Back." };
for (const t of [AGENT_PROMPT, CHAT_PROMPT, FIRST_MESSAGE]) assert.ok(!fillVars(t, vars).includes("{{"), "unfilled placeholder");
assert.ok(fillVars(AGENT_PROMPT, vars).includes("Q1\nQ2"));
assert.equal(fillVars("{{ case_number }}|{{visit_number}}|{{mystery}}", {}), "HVI-UNFILED|1|");
assert.equal(fillVars("{{case_number}}", { case_number: "$& $1" }), "$& $1", "no replacement-pattern surprises");

// end marker
assert.deepEqual(splitEnd(`Your file is submitted. ${END_MARKER}`), { reply: "Your file is submitted.", end: true });
assert.deepEqual(splitEnd(`Done.\n${END_MARKER}\ntrailing`), { reply: "Done.", end: true });
assert.deepEqual(splitEnd("  Next question.  "), { reply: "Next question.", end: false });
assert.deepEqual(splitEnd(END_MARKER), { reply: "", end: true });

// message validation
assert.equal(messagesError([]), null);
assert.equal(messagesError([{ role: "agent", text: "hi" }, { role: "user", text: "hello" }]), null);
assert.ok(messagesError("nope"));
assert.ok(messagesError([{ role: "system", text: "x" }]));
assert.ok(messagesError([{ role: "user", text: 5 }]));
assert.ok(messagesError([{ role: "user", text: "a" }, { role: "agent", text: "b" }]), "last turn must be the subject's");
assert.ok(messagesError([{ role: "user", text: "   " }]), "empty reply");
assert.ok(messagesError(Array(61).fill({ role: "user", text: "x" })));
assert.equal(messagesError(Array(59).fill(0).map((_, i) => ({ role: i % 2 ? "agent" : "user", text: "x" }))), null, "a full nine-section interview fits");
assert.ok(messagesError([{ role: "user", text: "x".repeat(20001) }]));

// API shape: starts with user, alternates, merges runs
const m = toClaudeMessages([{ role: "agent", text: "A" }, { role: "user", text: "u1" }, { role: "user", text: "u2" }]);
assert.deepEqual(m.map(x => x.role), ["user", "assistant", "user"]);
assert.equal(m[2].content, "u1\nu2");

// ---- interview state machine (server-side plan tracking) ----
assert.ok(!CHAT_PROMPT.includes("{{question_plan}}"), "the typed Officer never sees the whole plan");
const RICH = "Every Saturday I coach 12 kids at Little League and drive my mother to Temple.";
const plan = pickQuestions([]).plan;
assert.equal(plan.length, 9);

// full run, substantive answers: every item asked exactly once, then a clean close
{
  let st = initState(plan), asked = [], d;
  ({ state: st, directive: d } = step(st, "Yes."));              // answers "Shall we begin?"
  while (d.kind !== "close") { if (d.kind === "ask") asked.push(d.item); ({ state: st, directive: d } = step(st, RICH)); }
  assert.deepEqual(asked, [...Array(9).keys()], "each item asked once, in order");
  assert.equal(d.reason, "complete");
  assert.ok(st.items.every(i => i.status === "done"));
}
// thin answers: exactly one follow-up per item, then the plan moves on
{
  let st = initState(plan), d, followups = 0, asks = 0;
  ({ state: st, directive: d } = step(st, "Sure."));
  while (d.kind !== "close") {
    if (d.kind === "followup") followups++; else asks++;
    ({ state: st, directive: d } = step(st, "Fine."));
  }
  assert.equal(asks, 9);
  assert.equal(followups, 9, "one follow-up per thin item, never two");
  assert.ok(st.items.every(i => i.followups <= 1));
}
// "That's everything" after four answers closes at once; the rest stay unasked
{
  let st = initState(plan), d;
  ({ state: st, directive: d } = step(st, "Go."));
  for (let i = 0; i < 4; i++) ({ state: st, directive: d } = step(st, RICH));
  ({ state: st, directive: d } = step(st, "That's everything."));
  assert.equal(d.kind, "close");
  assert.equal(d.reason, "subject");
  assert.equal(st.items.filter(i => i.status === "pending").length, 4);
  ({ state: st, directive: d } = step(st, RICH));
  assert.equal(d.kind, "close", "a closed interview stays closed");
}
// hard cap closes even if the state is somehow mid-plan
{
  const st = { ...initState(plan), processed: 20, cur: 3 };
  assert.equal(step(st, RICH).directive.reason, "cap");
}
// appeals run the same machine over the appeal plan only
{
  const ap = pickAppealQuestions([{ asked: [] }], ["physical"]).plan;
  let st = initState(ap), d, seen = [];
  ({ state: st, directive: d } = step(st, "Ready."));
  while (d.kind !== "close") { if (d.kind === "ask") seen.push(st.items[d.item].dimension); ({ state: st, directive: d } = step(st, RICH)); }
  assert.ok(seen.every(x => x === "physical" || x === "adaptability"), "appeal plan respected");
  assert.equal(seen.filter(x => x === "physical").length, 3);
}
// the per-turn instruction: one question, covered sections named, no plan dump
{
  let st = initState(plan), d;
  ({ state: st, directive: d } = step(st, "Go."));
  ({ state: st, directive: d } = step(st, RICH));
  const ins = turnInstruction(st, d);
  assert.ok(ins.includes(plan[1].text) && !ins.includes(plan[2].text), "only the current question");
  assert.match(ins, new RegExp(`do NOT ask about these again: ${plan[0].dimension}`));
  const fu = turnInstruction(st, { kind: "followup", item: 1 });
  assert.match(fu, /ONE short follow-up/);
  assert.match(turnInstruction(closeState(st), { kind: "close", reason: "complete" }), /closing line/);
}
// heuristics
for (const t of ["That's everything.", "that is all", "I'm done", "Okay that's it thanks", "Bye!", "nothing else", "I have to go"]) assert.ok(wantsOut(t), t);
for (const t of ["I never stop working", "That's it for my career, then I moved to data", "No more than twice a week"]) assert.ok(!wantsOut(t), t);
assert.ok(isThin("Fine.") && isThin("I guess I'm okay"));
assert.ok(!isThin("Maybe ten people.") && !isThin("About 500 on LinkedIn") && !isThin(RICH));
// plans stored before the state machine: fall back to the plan text
assert.deepEqual(planOf({ vars: { question_plan: "Q1\nQ2" } }).map(q => q.text), ["Q1", "Q2"]);

console.log("check-chat: ok");
