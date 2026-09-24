# HVI Intake Officer: system prompt

**Source of truth: `netlify/lib/agentPrompt.js`** (`AGENT_PROMPT`, `FIRST_MESSAGE`).

Two channels use it:

- **Text** (`/api/intake-chat`, Claude): reads the file directly, fills the
  variables server-side from the case's pending plan, and appends
  `CHAT_ADDENDUM`, which ends the interview with `[END_INTERVIEW]` because there
  is no end_call tool.
- **Voice** (ElevenLabs agent `agent_9601m36j7tcef7db0kf1e55kbp25`): carries a
  copy. After editing the file, push the prompt to the agent with
  `agents_update` (prompt field only, never together with `body`), then read it
  back with `agents_get`.

## Dynamic variables

| Variable | Filled by | Default placeholder (no variables supplied) |
|---|---|---|
| `case_number` | intake-session | `HVI-UNFILED` |
| `visit_number` | intake-session | `1` |
| `focus_dimensions` | intake-session | `utility, honesty, adaptability, network` |
| `question_plan` | intake-session (newline-separated) | four generic questions (see docs/agent.json) |
| `returning_note` | intake-session | `First visit. No prior file.` |
