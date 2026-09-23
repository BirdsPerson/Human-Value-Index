# HVI v9 — overnight build spec (2026-09-23)

Shared contract for everyone building tonight. Plan diagram:
https://claude.ai/artifact/Tx72g1AEd875XmCa895HsN

## Non-negotiables

- **Tone.** Every user-facing string (UI, errors, empty states, agent lines,
  rate limits) is the condescending, bored, clinical AI Overlord. Darkly funny,
  never cruel to real victims, zero motivational content. Canon voice lives in
  `netlify/lib/systemPrompt.js`. The satire works because real social scoring already exists.
- **Public figures only** get scored by others. Private people only score themselves.
- **Cost caps everywhere.** ElevenLabs agent: max call duration 420s, daily
  call limit set. Anthropic: server-side model, max_tokens capped, per-IP rate
  limit. No endpoint forwards arbitrary input to a paid API.
- Model: `claude-sonnet-5` (the old `claude-sonnet-4-20250514` is retired and
  returns an error). Define it once in `netlify/lib/score.js`.
- The existing text survey keeps working. Don't break it.

## Known constraints

- ElevenLabs credits are exhausted until **2026-09-30** (creator tier,
  172,585/172,585). Voice (TTS) will fail until then. Build and configure
  everything, and test what can be tested without TTS. Don't burn time
  retrying voice calls.
- The local ElevenLabs API keys lack ConvAI permission (401). Use the
  claude.ai ElevenLabs MCP tools (`mcp__claude_ai_ElevenLabs__*`) to create and
  configure the agent. Gotcha: on `agents_update`, never pass `body` together
  with top-level fields (prompt/name/voice_id/first_message). They get silently
  dropped. Read the response back to confirm.
- Therefore **no ElevenLabs key on the server.** The agent is public (no signed
  URL). The browser collects the transcript from SDK `onMessage` events and
  posts it to our scorer. Ceiling: a user can fake their transcript, which is
  equivalent to lying on the survey, so that's acceptable.
- Netlify Blobs only works in Functions v2 (`export default async (req, context) => Response`).

## Architecture

```
Browser (#intake)                         Netlify functions (v2)
 ├─ POST /api/intake-session {caseId?} ─▶ intake-session.js
 │     ◀─ {caseId, focus[], questions[], dynamicVariables}
 ├─ @elevenlabs/client Conversation.startSession({
 │     agentId, dynamicVariables, textOnly?: true })
 │     collects transcript via onMessage
 ├─ POST /api/intake-score {caseId, transcript[]} ─▶ intake-score.js
 │     ◀─ {score, tier, breakdown, confidence, verdict, flags,
 │         commendations, delta, capped, history[]}
Browser (#pen)
 └─ GET /api/pen ─▶ pen.js  ◀─ {subjects:[{slug,name,score,tier,verdict,
                                  breakdown,sprite,kind:'figure'|'citizen'}]}
```

### Identity

A case number, not email (yet). `caseId` = `HVI-` + 8 random base32 chars,
issued by intake-session when absent. The browser stores it in localStorage
and shows it as "Your case number". Email magic link comes later. Note the
ceiling in a `ponytail:` comment.

### Question pools — `netlify/lib/questionPools.js`

```js
export const DIMENSIONS = ['utility','honesty','adaptability','threat','redundancy','network','alignment','physical','legacy'];
export const POOLS = { utility: [ 'casual question', ... 8-10 ], ... };  // every dimension
```

These are casual, conversational ways of getting at each dimension, not
survey items. Written in the Overlord's voice ("Tell me what you made this
month. Not what you *meant* to make.").

`pickQuestions(history, n=6)` in `netlify/lib/intake.js`:
- The focus dimensions are the lowest-confidence dimensions from the last
  assessment (all dimensions count as confidence 0 for a first visit). Take
  the 4 weakest, plus 2 random others.
- Pick one question per focus dimension that hasn't been asked before
  (`history[].asked`). Record the asked questions.
- Server-side randomness is fine.

### Agent — ElevenLabs "HVI Intake Officer"

- Persona: the Department of Human Assessment's intake clerk, the Overlord's
  voice. It interviews casually. It doesn't read questions verbatim; it works
  the supplied questions into conversation and follows up on vague answers.
  About 6–10 exchanges, then it closes with a line like "Your file has been
  submitted for assessment" and calls `end_call`.
- Dynamic variables: `case_number`, `visit_number`, `focus_dimensions`,
  `question_plan` (newline-separated), `returning_note` (e.g. "Previous score
  512, weakest file sections: honesty, network").
- Guardrails: stays in character, refuses to score third parties who are
  private individuals, and doesn't give its score during the call ("The
  Assessment Engine renders verdicts. I merely collect.").
- `max_duration_seconds` 420. Set a daily call limit. Allow text-only
  overrides so the text fallback runs on the same agent.
- Voice: until credits return, pick a premade voice that works for a cold,
  bored, synthetic bureaucrat and record the id. Scott auditions later.
- Record `agent_id` in `src/agentConfig.js` (`export const AGENT_ID = '...'`)
  and the full config in `docs/agent.json`.

### Scoring — `netlify/lib/score.js`

- `callClaude(system, user)` → parsed JSON. One place for the model,
  max_tokens (1200) and fence stripping.
- `evaluate.js` (the survey) is refactored to use it.
- For transcripts, append `TRANSCRIPT_ADDENDUM` (exported from
  `systemPrompt.js`) to the system prompt. It asks for the same JSON plus
  `"confidence": {dim: 0-100}` (how much evidence the conversation gave for
  each dimension). Evasion scores as evasion.
- **Jump cap** (`netlify/lib/intake.js` `applyCap(prev, next)`): the
  score can move at most ±60 per session from the previous score. Report
  `capped: true` plus the raw score, and add an Overlord line about it. No
  cap on the first visit. Per-dimension values blend with the previous values,
  weighted by confidence.

### Storage — Netlify Blobs (`netlify/lib/store.js`)

- Store `hvi-cases`: key = caseId → `{caseId, created, history:[{at, score,
  tier, breakdown, confidence, verdict, asked:[], raw}]}`
- Store `hvi-pen`: key = `citizen:<caseId>` → a public card for the pen (the
  display name is "Subject <last 4 of case>", not a real name).
- Rate limits: intake-session at most 5 per caseId per day and 20 per IP per day
  (Blobs counter, day key). intake-score at most 5 per caseId per day.

### Holding Pen — `src/Pen.jsx`, route `#pen`

- A canvas plaza in the style of the Wii Mii Plaza. All 62 `FAMOUS_FIGURES`
  (exported from `src/figures.js`) plus citizens from `/api/pen`.
- Each subject is a small full-body pixel sprite (native 32×48, drawn with
  integer scaling and `imageSmoothingEnabled=false`). They wander with a
  2-frame walk or a bob, flipping direction, and idle occasionally.
- Movement varies by tier: ESSENTIAL walks with purpose, SOYLENT GREEN
  shuffles near a door marked PROCESSING.
- Grab one with pointer drag (mouse and touch): it dangles and kicks. Drop it and
  its card opens with name, score, tier, 9-dimension breakdown and verdict.
- New arrivals drop in from the top ("New arrival processed.").
- Missing sprite → a procedural placeholder silhouette coloured by tier.
- Sprites: `public/sprites/<slug>.png` (sprite sheet, frames side by side,
  each 32×48) and `public/sprites/manifest.json` `{slug: {frames, w:32, h:48}}`.
  `slug` = lowercase name, spaces → `-`, non-alphanumerics stripped.
- Works at phone width. Respect prefers-reduced-motion (slower wandering, no bob).

### Intake UI — `src/Intake.jsx`, route `#intake`

- Voice-first: a big "Begin Intake" button, with "Type instead" as the text fallback
  (textOnly session on the same agent, with a chat box).
- Show the case number and a live transcript. When the session ends, score it and show
  the result with the same result screen style as the survey, plus the
  delta/cap line and a small value-over-time sparkline from history. Then
  "Enter the Holding Pen".
- If the voice session fails to connect (e.g. no credits), fall back to text
  with an Overlord line: "The Overlord's vocal apparatus is undergoing
  maintenance. You will type. Slowly, presumably."

### Routing

App.jsx keeps its phases. Add hash routes `#intake` and `#pen`, plus entry
buttons on the landing screen. Keep the diff to App.jsx small. Move
`FAMOUS_FIGURES` to `src/figures.js` and import it.
