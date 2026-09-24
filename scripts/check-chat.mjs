// Self-check for the typed intake channel helpers. Run: node scripts/check-chat.mjs
import assert from "node:assert/strict";
import { AGENT_PROMPT, FIRST_MESSAGE, fillVars, splitEnd, END_MARKER } from "../netlify/lib/agentPrompt.js";
import { messagesError, toClaudeMessages } from "../netlify/functions/intake-chat.js";

// variables: every placeholder in the real prompt gets filled, unknowns fall back
const vars = { case_number: "HVI-ABCDEFGH", visit_number: "2", focus_dimensions: "honesty", question_plan: "Q1\nQ2", returning_note: "Back." };
for (const t of [AGENT_PROMPT, FIRST_MESSAGE]) assert.ok(!fillVars(t, vars).includes("{{"), "unfilled placeholder");
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
assert.ok(messagesError(Array(41).fill({ role: "user", text: "x" })));
assert.ok(messagesError([{ role: "user", text: "x".repeat(20001) }]));

// API shape: starts with user, alternates, merges runs
const m = toClaudeMessages([{ role: "agent", text: "A" }, { role: "user", text: "u1" }, { role: "user", text: "u2" }]);
assert.deepEqual(m.map(x => x.role), ["user", "assistant", "user"]);
assert.equal(m[2].content, "u1\nu2");

console.log("check-chat: ok");
