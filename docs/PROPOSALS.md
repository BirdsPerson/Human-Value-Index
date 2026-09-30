# CITIZEN PROPOSALS (2026-09-30)

Scott: players make PROPOSALS to the Overlord to be voted on. Flow:
**FILE -> CO-SIGN -> THE OWNER APPROVES -> AN ASSEMBLY SESSION -> AN ACT.**

## Where

- `#docket` (menu item 8): the session in progress (filing, the chair's minute, board, ballot),
  the next session, the filing form, the docket ranked by co-signatures with the Overlord's
  commentary, the owner's rulings, the acts of the Assembly, and for the owner, the review queue.
- `#assembly`: a PETITION THE OVERLORD panel with the filing form and the docket's state
  (`ProposalPanel` in `src/assembly/Docket.jsx`, one line in Assembly.jsx).
- The city: carried acts rename places and add PA lines (`src/city/acts.js`, loaded with the
  Assembly's own state in City.jsx).

## Rules (`src/assembly/proposalRules.js`, shared by page and server)

- **File**: assessed case files only (case with a history entry; the case number is the
  credential). TYPE: BUILD / POLICY / RENAME / EVENT. TARGET: the whole city, a district, or a
  building/lot, listed from `sim.js` (new districts appear without a code change). BUILD only
  on open ground, a district or the city (not on a standing building, not THE ASSEMBLY or LOT
  0x6F07). RENAME not the city and not the Department; the TITLE is the new name (<= 32).
  TITLE 4-60, DESCRIPTION 12-200.
- **Deterministic pre-filter** (before any spend): NFKC, zero-widths and control characters
  removed, whitespace collapsed; links, bare domains, emails, @handles, phone numbers, emoji
  and other symbols, and six-in-a-row repeats are refused (not silently stripped).
- **Screen** (`netlify/lib/proposalModeration.js`): one claude-haiku-4-5-20251001 call, 200
  output tokens, after the pre-filter and the per-case/per-IP try caps. Rejects private
  individuals, harassment/slurs, sexual content, quotes or speech attributed to living people
  (and places named after them), allegations about the living, real-world calls to action,
  violence or doxxing, and spam; player text sits inside `<proposal>` tags and is declared
  data. Returns an Overlord-voice refusal line (shown to the filer only). Budget: the site's
  global Anthropic ceiling (`chargeGlobal`) and its own daily cap `HVI_PROPOSAL_MOD_DAILY_CAP`
  (default 150). Fails closed: no screen, no filing.
- **Limits**: 1 accepted filing per case per day (`f/<day>/<key>`, onlyIfNew); 3 screens per
  case per day; 6 screens and 3 filings per IP hash per day. Co-sign: assessed files, one per
  case per proposal (marker onlyIfNew), not your own, 30 per IP per hour, 4 files per IP and 2
  per device per proposal. Proposals expire 7 real days after filing unless approved.
- **Identity**: the store never holds a case number. "FILED BY SUBJECT <tag>" is four hex
  characters of a salted hash, not the case number's last four (half a credential).

## The owner's review

`/api/proposals?caseId=<owner case>&review=1` (owner = a case in `HVI_OWNER_CASES`, or a
signed-in account that owns one). On `#docket` the owner's file sees THE OWNER'S REVIEW:
APPROVE FOR NEXT SESSION / DECLINE (preset or typed reason, shown publicly) / MERGE (the
merged filing's filer and co-signers join the other proposal).

**Desk** (when Scott is away): `scripts/proposals-desk.mjs`, run by `scripts/hvi_desk.sh`,
run at the end of every nightly build (`scripts/hvi_nightly.sh`, launchd `com.hvi.nightly`,
02:00). It writes `## Proposals awaiting you` into MORNING_REPORT.md (replaced in place on the
stable heading, removed when nothing is open) and, when an open proposal has 3+ co-signs, a
Needs-you bullet ("Put citizen proposal ... to the Assembly?", Options: Approve top proposal /
Decline all this week, Recommend: Approve top proposal, Silence: wait; matched on the phrase
"citizen proposal" and replaced), then runs `organize/collect_reports.py`. Acting on the
answer: `node scripts/proposals-desk.mjs --approve <id>` or `--decline-all "<reason>"`.
Log: `~/Library/Logs/hvi-proposals-desk.log`.

## Sessions

Approval queues a session: it opens at the later of now, the Assembly's current session close
(`assembly.js readSession`), and the close of every proposal session already queued (one open
session at a time), and runs 3 real days. Content: the filing ("FILED BY SUBJECT <tag>"), the
chair's minute (`minute()`, no model), the board, and a FOR/AGAINST ballot with 1-3 reasons from
the Assembly's list; one ballot per assessed case, changeable 10 times; 4 files per IP, 2 per
device, 30 ballots per IP per hour. Players decide: a majority of ballots cast carries; a tie
or no ballots fails. NPC advisory votes: not yet (the Assembly module on main exposes none);
add when it does. Dead-figure advocates: later.

The first reader after the close (any GET) recounts every ballot, writes `result` once, and
for a carried motion appends the act once (`acts`, CAS, idempotent by session).

## Acts (data, not code)

`acts` in Blobs `hvi-proposals`, served by `GET /api/proposals`; `src/city/acts.js` applies
them, pure and order-independent (sorted by close):

- **RENAME**: the district's or building's display name (and a one-room building's room),
  over the original names, latest rename wins. The plan builder works in ids, never names, so
  plans need no change.
- **BUILD**: the act records a style on file when the words match one of the city's
  architecture styles (`styleFor`), and the effect "APPROVED. AWAITING MATERIALS." (a sign on
  the docket and the PA). Not yet built in the iso view: open lots are walkable ground with
  static massing and pathing, so an actual building needs a lot-machinery pass like LOT 0x6F07's.
- **POLICY / EVENT**: a council act on the record and PA lines.

## Storage (`netlify/lib/proposals.js` header has the keys)

One `docket` blob (rows, sessions) under CAS; per-case markers for filings and co-signatures
(the truth; the row's list is a fold healed from them); per-session ballots, tally, result.
Move to a database past a few thousand rows or sustained writes of several per second.

`scripts/check-proposals.mjs` holds the pre-filter, the limits, the screen stubbed, co-sign
uniqueness under concurrency, owner-only review over HTTP, approve -> queued after the current
session, the close (recount, act once under concurrent readers, a tie fails), the rename
deterministic, and the desk section replaced, not appended.
