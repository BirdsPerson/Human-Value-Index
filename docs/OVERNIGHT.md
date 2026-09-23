# HVI v9 overnight build (2026-09-23)

## Draft deploy

- **Draft URL:** https://6ab38e8d8db9da2d39e39942--human-value-index.netlify.app
- Deploy log: https://app.netlify.com/projects/human-value-index/deploys/6ab3881f849c3272bac07095
- Function logs: https://app.netlify.com/projects/human-value-index/logs/functions?scope=deploy:6ab3881f849c3272bac07095
- This is a draft deploy only. Production is unchanged, nothing is committed or pushed, and the working tree is still uncommitted.
- **HTTP status: 401.** Every path (`/`, `/api/pen`, `/sprites/manifest.json`) returns 401, a Netlify team login redirect (`app.netlify.com/edge-access`). Production and humanvalueindex.com return 401 too. Log in to Netlify in the browser and the draft will load. I couldn't load it from here, so nothing on the draft itself has been clicked through yet. The screenshots below come from local runs.
- Before deploying: `npm run build` passed (only warning: the 633 KB ElevenLabs chunk). All five self-checks passed: check-functions, check-http, check-intake, check-pen, and check-question-pools (90 questions).

## What was built

- **Holding Pen (`#pen`).** A plaza in the style of the Mii Plaza with all 62 famous figures plus citizens from `/api/pen`. You can grab a subject (mouse or touch). It dangles and kicks, and when you drop it, its card opens with the score, tier, 9-dimension breakdown and verdict. Movement depends on tier: SOYLENT GREEN shuffles near the PROCESSING door. New arrivals drop in from the top. With reduced motion on, subjects wander more slowly and don't bob. Epstein and Hernandez open their file when tapped instead of dangling.
- **Intake (`#intake`).** A voice-first interview with the ElevenLabs "HVI Intake Officer", with a "Type instead" text fallback on the same agent. It shows your case number and a live transcript, then scores the transcript and shows a result screen: delta and cap line, value-over-time sparkline, commendations, flags, and category bars with evidence %. "Enter the Holding Pen" places you in the pen with a YOU marker. If credits or the connection fail, it shows an in-character budget line and a "Take the Written Survey" button. Connecting gives up after 15s, server calls after 30s, and the connecting screen has a Withdraw button.
- **Backend (Functions v2 + Blobs).** `intake-session` issues the case number and a question plan from 90 pooled questions, focused on your 4 weakest dimensions plus 2 random, and never repeats a question you were already asked. `intake-score` runs the Claude scorer on the transcript and blends each dimension by confidence. Each visit can move the score at most ±60, and only by as much as the blended breakdown changed, so the phantom-delta bug is fixed. An identical resubmit returns the saved result without calling the model. A failed scoring attempt gives the day's attempt back. `pen` reads the index of the newest 200 citizens. Public verdicts are cut to 280 characters and screened for links, emails, handles and phone numbers.
- **Written survey (`/api/evaluate`).** Still works, now on the shared `score.js` (`claude-sonnet-5`). It returns only the six expected fields.
- **Cost and abuse caps.**
  - Evaluate: 8 per minute and 20 per day per IP.
  - Intake-session: 5 per case and 20 per IP per day.
  - Intake-score: 5 per case and 25 per IP per day.
  - Global Anthropic cap: 1000 calls a day (`HVI_ANTHROPIC_DAILY_CAP`).
  - IPv6 addresses are limited per /64 block.
  - If Blobs is down, requests are refused rather than let through.
  - The CORS wildcard is removed, and POSTs from other websites get a 403.
- **Live ElevenLabs agent** `agent_9601m36j7tcef7db0kf1e55kbp25` (version `agtvrsn_9101m36m4wr0efhv7prb351e3hde`):
  - Origin allowlist, with the origin header required.
  - Hangs up after 40s of silence.
  - File uploads are off.
  - Limits: 420s max per call, 100 calls a day, 5 at once.
  - New prompt with typing, protected-group and disability rules.
  - Config is in `docs/agent.json`, the prompt in `docs/agent-prompt.md`.
- **Sprites.** 5 of 62 figures have real sprites: Einstein, Curie, Socrates, Diana and Mansa Musa. The others show generated stand-ins coloured by tier.

## How to try each piece (on the draft, after logging in to Netlify)

1. **Landing / survey:** open the draft URL and take the written survey as before. You should get a score, a tier and a verdict.
2. **Holding Pen:** open `#pen`. Drag Einstein and let go. His card should open. Try it at phone width too.
3. **Intake:** open `#intake` and press "Begin Intake". **It will not connect on the draft**, for two reasons. ElevenLabs is out of credits until 2026-09-30. And the agent's origin allowlist doesn't include `*--human-value-index.netlify.app`. What you *should* see is the budget line plus a "Take the Written Survey" button. The full intake flow has only been tested locally, through a dev hook against the real `/api/intake-score`.
4. **Returning visit:** after a real intake, reload `#intake`. The case number should be kept, and the plan should target your weakest sections. This needs ElevenLabs credits.
5. **Self-checks locally:** `for f in scripts/check-*.mjs; do node $f; done` and `python3 scripts/sprites.py --selftest`.

## Screenshots

`docs/screens/` (from local runs):
- `landing-1280.png`: landing with the new entry buttons
- `pen-1280.png`, `pen-held-1280.png`, `pen-card-1280.png`: plaza, a subject being held, the card after dropping it
- `pen-400.png`, `pen-card-400.png`, `pen-you-400.png`: phone width, card, and your own subject with the YOU marker
- `intake-1280.png`, `intake-fallback-1280.png`, `intake-400.png`: intake lobby and the out-of-credits fallback
- `intake-result-400.png`: a real result screen (scored 471 by the live Claude API)

`docs/sprite-previews/`: `_lineup.png` (all 5 real sprites), `_walk.gif` (walk cycle), plus one PNG each for albert-einstein, marie-curie, socrates, princess-diana and mansa-musa.

## What needs Scott

1. **Look at the draft.** Log in to Netlify, open the URL above, and give feedback on the pen and intake look and feel.
2. **Commit and ship.** Nothing is committed. Pushing to GitHub deploys to production automatically. `dist/` is tracked in git and was rebuilt, so its asset filenames changed.
3. **Audition the voice** (River, George or Callum) once ElevenLabs credits return on 2026-09-30. Then run the agent test `test_9401m36j8tkaeedapspakfb1w8hv` and do one real voice intake with a mic.
4. **ElevenLabs daily_limit.** It is still 100. The reviewer suggested lowering it once credits return. Your call.
5. **Anthropic daily cap.** The default is 1000 calls a day. Set `HVI_ANTHROPIC_DAILY_CAP` in the Netlify env to what one bad day should be allowed to cost. Nobody has checked the per-call price.
6. **Capped verdict wording.** When a score is capped, the verdict describes the raw reading. Example: a "Soylent Green" joke on a recorded 426. Options: leave it, re-prompt, or label the verdict "this session's reading".
7. **Verdicts on the pen.** They are shortened and screened, but a private person's plain name could still get through if the model ignores its rule. Options: keep as is, or take verdicts off the pen entirely.
8. **Intake-score IP limit (25 per day).** It was added but isn't in the SPEC. Keep it or drop it.
9. **40s silence hang-up.** A text user who stops typing for 40s gets hung up. Raise it if that annoys people.
10. **Preview hosts for voice.** To test voice on deploy previews, add the preview hosts to the agent's allowlist in the ElevenLabs dashboard. It's unknown whether ElevenLabs accepts wildcards.
11. **Sprites for the other 57 figures.** About 114 Higgsfield credits at 2 each. Write LOOKS lines by hand first for people known by their face (Altman, Thiel, Kelce, etc.).
12. **Local dev key issue.** netlify-cli 27.5 `netlify dev` swaps `ANTHROPIC_API_KEY` for a Netlify AI Gateway token, which gets a 401. Locally, use `netlify functions:serve` plus vite, or turn off AI Gateway for the site. After the next production deploy, run one survey to confirm production uses the real key.
13. **Not tested on a real device:** touch dragging, HiDPI, and reduced motion in a browser.
14. **Turing and Cleopatra still dangle** when grabbed. The reviewer judged that neither reads as a hanging gag. Say so if you disagree.
15. **Cleanup notes, no action needed now.** The evaluate limiter writes one small Blobs key per IP per minute, and these are never pruned. Local test cases exist only in `.netlify/blobs-serve`, not in production.
