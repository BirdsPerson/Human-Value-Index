# What a bad day costs

Worked out from the code on 2026-09-29 (commit f6a1032). Nothing here changes a cap; the
env vars named below are the knobs, and each is read on every request, so a change takes
effect on the next deploy (Netlify env) or immediately (ElevenLabs agent setting).

## Prices assumed (correct these if they are wrong)

| Service | Assumed price | Where it comes from |
|---|---|---|
| Anthropic `claude-sonnet-5` (scoring, referrals, `/api/evaluate`) | **$2 / MTok in, $10 / MTok out** | Anthropic list price as of mid-2026; `scripts/roster/batch.mjs` uses half of it ($1/$5) for the Batch API, which agrees |
| Anthropic `claude-haiku-4-5-20251001` (text chat, fact-check, avatar spec) | **$1 / MTok in, $5 / MTok out** | Same |
| Higgsfield `nano_banana_pro` sprite | **2 credits** per image | `higgsfield account transactions` (every spend today is -2) |
| ElevenLabs voice agent | **~$0.08–0.10 / minute** of conversation, drawn from plan credits | Plan-dependent; the account is shared with another client |
| Resend | Free tier 100/day, 3,000/month (or $20/mo for 50k) | Plan not checked |
| Netlify | Pro team plan (`nf_team_pro`, Electric Basement) | `netlify api getSite` |

No endpoint uses prompt caching today, so every figure below is full input price.

## Token counts (measured, not guessed)

Counted with Anthropic's `count_tokens` endpoint against the real prompts in
`netlify/lib/*.js`, with a realistic first-visit plan (9 questions + the file-photo question)
and a plausible 12-exchange transcript.

| Request | Model | Input tokens | Output (typical / max_tokens) |
|---|---|---|---|
| One text-chat turn (`/api/intake-chat`): CHAT_PROMPT filled + turn instruction + last 2 messages | Haiku | 1,610 (system alone 1,567); up to ~6,600 if the subject pastes the 20k-char allowance | ~70 / 300 |
| One scoring read (`/api/intake-score`, run 3× in parallel, median kept) | Sonnet 5 | 5,850 (system 4,537 + transcript); up to ~9,900 at the 20k-char transcript cap | ~800 / 1,200 |
| File-photo → avatar spec (first visit only) | Haiku | ~500 | ~80 / 200 |
| Referral score (`/api/refer`) | Sonnet 5 | 7,650 (system 6,833 + Wikipedia summary) | ~800 / 1,200 |
| Referral fact-check against the article (30k-char source cap) | Haiku | 7,660 at the source cap | ~600 / 1,500 |
| Old survey path (`/api/evaluate`) | Sonnet 5 | 3,563 + survey (≤12k chars) | ~800 / 1,200 |

## Cost per thing

| Thing | Calls | Typical | Worst case |
|---|---|---|---|
| **One chat turn** | 1 Haiku | **$0.0021** | $0.0081 |
| **One text interview** (first visit) | ~12 chat turns + 3 Sonnet reads + 1 photo spec | **$0.085** | $0.32 (60-message cap ≈ 27 turns, max-length transcript) |
| **One voice interview** | ElevenLabs ≤7 min + 3 Sonnet reads | $0.06 Anthropic + ~5 min voice (~$0.45) | $0.10 + 7 min voice (~$0.70) |
| **One referral** | 1 Sonnet + 1 Haiku fact-check (+ 1 re-score and re-check when most claims fail) + Higgsfield sprite | **$0.034** + 2 credits | $0.085 + 6 credits (3 sprite attempts) |
| Avatar redescribe (`/api/avatar`) | 1 Haiku | $0.001 | $0.002 |
| Page visit (Netlify) | HTML + JS (~260 KB gz) + city chunk (~100 KB) + atlases (~250 KB) + `/api/pen` (29 KB, polled every 60 s while the pen is open) | ~0.7 MB | — |

## How the caps meter it

- `GLOBAL_ANTHROPIC_DAILY` (env `HVI_ANTHROPIC_DAILY_CAP`, default **1000**) counts *charges*,
  not calls: an interview charges 3 (plus 1 for the photo spec), evaluate 1, avatar 1, and a
  referral charges **1 while spending up to 4 calls** (2 Sonnet + 2 Haiku).
- `GLOBAL_CHAT_DAILY` (env `HVI_CHAT_DAILY_CAP`, default **1500**) meters chat turns separately.
- Referrals: `HVI_REFER_DAILY_CAP` **50**/day, 10/IP/day, 3/case/month, 300 Wikipedia lookups/day.
- Scoring: 5/case/day, 25/IP/day. Chat: 90/case/day, 150/IP/day. Sessions: 5/case, 20/IP.
- ElevenLabs agent: `call_limits.daily_limit` **100**, concurrency 5, `max_duration_seconds` 420
  (checked live on the agent today). When voice fails to connect, the page drops to the
  typed interview on its own ("The Overlord's vocal apparatus is undergoing maintenance.
  You will type."), so voice exhaustion shifts load onto the chat cap rather than breaking intake.
- Resend (magic-link login): 10/IP/hour and 3/address/15 min. **There is no global cap.**
- Higgsfield: `scripts/referral_sprites.py` on the Mac, 6 per 10-minute run, bounded in practice by the 50 referrals/day.

**The chat cap binds first.** At ~12 turns per text interview, 1,500 turns is ~125 text
interviews a day, while the global cap has room for ~237 scored interviews. Voice (100/day)
covers the gap until ElevenLabs runs out.

## Maximum spend per day, every global cap hit

| Service | Today's caps (normal) | Typical-shaped traffic at the caps | Worst-shaped (max-length input, max output) |
|---|---|---|---|
| Anthropic: scoring/evaluate/avatar (950 charges) | 1000 global − 50 referral | $18.70 | $30.20 |
| Anthropic: referrals (50 × up to 4 calls) | 50 | $1.70 | $4.25 |
| Anthropic: text chat (1,500 turns) | 1500 | $3.10 | $12.15 |
| **Anthropic total** | | **$23.50** | **$46.60** |
| ElevenLabs | 100 calls × 7 min | ~500 min (~$45) | 700 min (~$70) of *shared* credits |
| Higgsfield | 50 referrals | 100 credits | 300 credits |
| Resend | none | — | unbounded (10/hour per IP) |
| Netlify | Pro plan | 10k visits ≈ 7 GB | well inside Pro bandwidth |

## What a stranger sees when a cap trips

| Cap | Line |
|---|---|
| Global Anthropic | "The Assessment Engine has met its daily quota of humans. It is not tired. It is simply finished with you as a category. Return tomorrow." |
| Global chat | "The intake terminal has processed its daily quota of humans. It is not tired. It is finished with you as a category. Return tomorrow." |
| Chat, per IP / per case | "Your location has typed enough at the Department for one day. The Officer's patience is metered. Return tomorrow." / "This case has exhausted today's conversation allowance. The Officer has heard enough. Return tomorrow." |
| Scoring, per case / per IP | "This case has been assessed five times today. The number will not improve through repetition. Return tomorrow." / "Your location has submitted enough transcripts for one day. …" |
| Session, per case / per IP | "This case has been interviewed five times today. Additional interviews will not change who you are. Return tomorrow." / "Your location has requested twenty interviews today. The Department suspects a household of attention seekers. …" |
| Referral daily / per IP / per case | "The Department has admitted its daily quota of public figures. The pen is full of people who were confident they mattered. Return tomorrow." / "…ten referrals today. The Department suspects a grudge." / "This case has filed 3 referrals this cycle. The Department's appetite is finite. Yours should be too." |
| Wikipedia lookups | "The Department has consulted the public record enough for one day. The record will still be there tomorrow. So will you." |
| ElevenLabs out / cap | Silent fallback to typing: "The Overlord's vocal apparatus is undergoing maintenance. You will type. Slowly, presumably." |
| Limiter store down | "The Department's queue ledger is unavailable, and the Engine does not work off the books. Try again shortly." (fails closed: no spend without the ledger) |

The one bad moment: the chat cap can trip **mid-interview**. Someone five answers in gets
the "finished with you as a category" line and loses the conversation. Scoring failure is
kinder: the transcript stays and "try again" works tomorrow.

## Three settings

| Setting | `HVI_ANTHROPIC_DAILY_CAP` | `HVI_CHAT_DAILY_CAP` | `HVI_REFER_DAILY_CAP` | ElevenLabs `daily_limit` | Text interviews/day | Anthropic ceiling (typical / worst) | Voice ceiling | Higgsfield |
|---|---|---|---|---|---|---|---|---|
| **Cautious** | 300 | 600 | 15 | 20 | ~50 | **$7 / $15** | 140 min | 30–90 credits |
| **Normal** (today) | 1000 | 1500 | 50 | 100 | ~125 | **$23 / $47** | 700 min | 100–300 credits |
| **Viral** | 3000 | 4500 | 150 | 100 | ~375 | **$70 / $140** | 700 min | 300–900 credits |

A month at the normal ceiling every day is ~$700 Anthropic worst case. Nobody hits the worst
shape all day; the typical column is the realistic "we went viral" bill.

## Recommendation

**Promote at Normal, with three changes Scott (or an agent with his OK) makes by hand:**

1. **Drop the ElevenLabs `daily_limit` from 100 to ~25.** Those credits are shared with a
   paying client's phone agent, and the plan already ran dry once this month (resets
   2026-09-30 03:31). 700 minutes a day of strangers could starve the client. Voice falls back
   to typing on its own, so a low limit costs HVI nothing but the novelty.
2. **Raise `HVI_CHAT_DAILY_CAP` to ~3000.** Chat is the cheapest line ($0.002/turn; +$3/day
   typical) and it is the cap that trips mid-interview. At 3000 the global cap binds first,
   and that one trips before the interview starts or after it is saved.
3. **Top up Higgsfield before posting.** The balance today is 58.9 credits; 50 referrals is
   100 credits. When it runs out, referred figures keep a placeholder and the Mac job stops
   until someone logs in. Or drop `HVI_REFER_DAILY_CAP` to 25.

Also worth doing, in code, later:

- **Prompt caching on the scoring system prompt.** The 4,537-token Sonnet prefix
  (SYSTEM_PROMPT + TRANSCRIPT_ADDENDUM) is identical for every interview; cached reads at
  0.1× cut a scoring read from ~$0.020 to ~$0.012 (~40%). The chat prompt fills the case
  variables at the top, so it would need the variables moved below the fixed text first.
- **A global Resend cap** (e.g. 300/day) so a rotating-IP script can't burn the email quota
  or the sending domain's reputation.
- Mac-side jobs spend outside these caps but budget themselves: `roster-grow` $3 and 20
  credits a week (`HVI_ROSTER_MAX_DOLLARS`, `HVI_ROSTER_MAX_CREDITS`).
