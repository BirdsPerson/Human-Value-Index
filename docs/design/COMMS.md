# COMMUNICATION (design, 2026-10-06)

Scott's decision: communication in the city rolls out in **layers, safest first**.

1. **DEPARTMENT MAIL**: the Department writes to you. No player writes anything. **Built.**
2. **MESSAGE BOARDS**: players post in public threads, screened before anyone sees them.
3. **PLAYER MAIL**: opt-in, one player to another, screened, blockable.
4. **LIVE CHAT**: rooms on the Cloudflare relay that the dungeon co-op will share; ephemeral, screened, killable.

Each layer ships only after the one before it has run clean for a while (see "Turning a layer on").
Moderation for layers 2 to 4 is the same machine throughout: a deterministic pre-filter, an AI
pre-screen, report buttons, a review queue for Scott, kill switches (per board and site-wide), and an
automatic mute for repeat offenders.

**Access points** (all layers): MY FILE (a MAIL entry with the unread count, inside My File, no new
nav tab), the BEIGE PC in your flat (a little Win98 desktop), and THE TERMINAL, the internet cafe on
the east boardwalk. Boards and player mail appear on the same desktop as new icons when their layer
is on. **No pop-ups, ever**: the only notification is an unread count.

Rules that carry over from the rest of the site, unchanged:

- **The living never speak in this city.** No figure on file is impersonated, quoted or given words,
  by the Department or by a player. Players may *discuss* figures by name (they are public figures and
  the site rates them), but a post that puts words in a living person's mouth, accuses a living person
  of wrongdoing as fact, or harasses anyone is refused. Dead figures may be discussed; nobody posts
  "as" them.
- **Private individuals** are never named, described or targeted (the same rule the proposal screen
  enforces, `netlify/lib/proposalModeration.js` category `private_individual`).
- **System text speaks in the Overlord's voice** (cold, bored, bureaucratic, all caps). Players' text
  is shown as they wrote it, in sentence case, never restyled into the Overlord's voice.
- **16 or older**, as for everything else here (`docs/legal/terms.md` §5).

---

## Layer 1: DEPARTMENT MAIL (built)

- A per-case inbox in Netlify Blobs, store `hvi-mail`, key `c:<caseId>`.
- Generated server-side **once per real day** from the day's printed edition of THE DAILY COMPLIANCE
  (headline, job listings, shop and season notices, Assembly and league notices, results and
  records), the file's market holdings (big moves, with the "because"), the league season clock, and
  the file's assigned apartment (letters from its NPC neighbours and its district's Prefect).
- At most **4 new letters a real day**, plus a one-time orientation letter on the first visit.
- Folders INBOX / OFFERS / NOTICES / ARCHIVE; read, archive, soft delete; each letter carries at most
  one action button that deep-links to where you act.
- Letters come only from the Department, its own characters (Prefects, EBSN hosts, NPC neighbours)
  and never from a living person.
- Purged with the file (`/api/purge`) and by the daily retention sweep (24 months after the last
  visit, `netlify/lib/prune.js`, `docs/legal/privacy.md`).

Nothing a player types is stored or shown in layer 1. Layers 2 to 4 are the first user-generated
text the site keeps (the proposals docket aside, which is short, typed and screened the same way).

---

## What already exists to build on

| Piece | Where | Reused for |
|---|---|---|
| Deterministic pre-filter (NFKC, zero-widths, links, emails, handles, phone numbers, emoji, repeats) | `src/assembly/proposalRules.js` `prefilter` | Every post, letter and chat line, before any spend |
| AI screen: one Haiku call, player text inside tags declared as data, JSON verdict with categories, Overlord refusal line, fails closed | `netlify/lib/proposalModeration.js` (`makeModerator`, `MODERATION_SYSTEM`, `CATEGORIES`) | The board and mail screen: same shape, a comms-specific system prompt and its own daily cap |
| Global Anthropic ceiling | `netlify/lib/http.js` `chargeGlobal`, `GLOBAL_ANTHROPIC_DAILY` (`HVI_ANTHROPIC_DAILY_CAP`, default 1000) | Every comms screen charges it, as the proposals screen does |
| Rate limits (hashed keys, day/hour/minute/month buckets, swept after 7 days) | `netlify/lib/store.js` `hitLimit`; `prune.js` step 4 | Post, report, mail and chat limits |
| Owner detection | `netlify/lib/auth.js` `isOwnerAccount`, `HVI_OWNER_CASES`; the owner gate in `netlify/functions/proposals.js` (`isOwner`) | The review queue and the kill switch page |
| An owner review queue in a page | `#docket`, THE OWNER'S REVIEW (`docs/PROPOSALS.md`) | The pattern for `#review` |
| A desk writer for MORNING_REPORT.md | `scripts/proposals-desk.mjs` (stable heading, replaced in place, run by `scripts/hvi_desk.sh` from the nightly) | The comms digest on the desk |
| Salted identity that never exposes the case number | `filerLabel` / "FILED BY SUBJECT <tag>" (`docs/PROPOSALS.md`, Identity) | Poster names |
| A blind machine review pipeline | `scripts/petition-review.mjs`, `scripts/harm-review.mjs` | Not reused directly; a reminder that reviews run on the Mac, not in a function |

There is no Cloudflare relay or dungeon co-op code in the repo yet (searched `docs/` and
`~/projects/*/docs`). Layer 4 therefore designs the relay as a shared piece that both chat and the
co-op will use.

---

## Layer 2: MESSAGE BOARDS

### Boards

Boards are data (`src/comms/boards.js`), not code, so a board is one line to add:

- **By district**: one per district in `sim.DISTRICTS` (THE STRIP, THE COMMONS, THE COAST ...).
  New districts get a board without a code change, as the docket's targets do.
- **By topic**: THE MARKET, THE ASSEMBLY AND THE DOCKET, THE PAPER (letters to the editor), THE SHOPS,
  NEW ARRIVALS (help for first-day citizens).
- **By game**: one per playable game in `src/play/games.js` (golf, tennis, the courts, the bowl,
  the lanes, fishing, cards, chess, the hunt), plus THE LEAGUES.

Each board: `{id, name, kind: district|topic|game, open: true, minAgeDays: 0}`. A board can be
closed in data (read-only) or killed by env flag (hidden).

### Threads and posts

- A thread is a title (4 to 80 characters) and a first post. A post is 1 to 600 characters of plain
  text. No links, no images, no attachments, no formatting beyond line breaks (the pre-filter refuses
  links, handles, emails and phone numbers outright, as for proposals).
- Who may post: an **assessed** case file (a history entry, as for the docket) that is **at least 24
  hours old**. The case number is the credential, as everywhere; a signed-in account is not required
  for layer 2 (see open question 2).
- The poster is shown as "SUBJECT <tag>" (four hex characters of a salted hash, never the case
  number's last four) with the file's tier chip. Nothing else about the file.
- Storage: Blobs store `hvi-boards`. `b/<board>/t/<thread>` (thread head and post ids),
  `p/<post>` (text, author hash, state, timestamps), `held/` and `reports/` indexes for the queue.
  The author is stored as a salted hash of the case number, never the case number.
- Reading is public and cached a minute; writing is a POST to `/api/boards`.

### Posting rules (shown above the form, in plain English, not the Overlord's voice)

1. Be civil. No harassment, slurs, hate or threats, including as a joke.
2. No private individuals. Public figures may be discussed; nobody else is named.
3. Nobody speaks for the living. Do not quote or put words in a living person's mouth; do not state
   accusations against anyone as fact.
4. Nothing sexual, nothing about minors, no self-harm content, no instructions for anything illegal.
5. Nothing about the real world that asks anyone to act (protests, voting in real elections, visiting
   or contacting real people), and no advertising.
6. Stay in the city. Threads are about the Substrate, its games and its Department.

### The post lifecycle

```
 player types ──> PRE-FILTER (deterministic, free)
                     │ refused: Overlord line, nothing stored, no spend
                     v
                 RATE LIMITS (per case, per IP hash, per board)
                     │ over: Overlord line, nothing stored
                     v
                 AI SCREEN (Haiku, within the comms cap and the global cap)
                     │
     ┌───────────────┼──────────────────────────┐
     v               v                          v
  ACCEPT          REJECT                     UNSURE / screen unavailable
  state=approved  state=rejected (kept 30d,  state=held (only its author
  visible now     author sees the line;      sees it, marked HELD FOR
                  counts toward auto-mute)   REVIEW) ──> review queue
     │                                          │
     │   REPORT button (any assessed file)      │ Scott: APPROVE / REJECT
     v                                          v
  3 distinct reporters ──> state=held ──> review queue ──> approved | removed
  (hidden at once; 1 report from a file
   in good standing just queues it)
```

- **held** is never public. **removed** keeps a tombstone line in the thread ("REMOVED BY THE
  DEPARTMENT.") so replies still read in order.
- The screen fails closed for the *public*: an unreachable screen holds the post rather than
  publishing it unscreened. The author sees their own held post, so nothing is lost.

### The AI pre-screen

- **Same path as proposals**: `makeModerator` with a comms system prompt (the proposal prompt's
  categories plus `threat` and `self_harm`; spam widened to off-topic floods), player text inside
  `<post>` tags declared as data, JSON-only reply, 200 output tokens, `claude-haiku-4-5`.
- **Three outcomes**, not two: `accept`, `reject`, `unsure`. Unsure goes to the queue held.
- **Caps**: its own daily counter `HVI_COMMS_MOD_DAILY_CAP` (start at 400) **and** `chargeGlobal(1)`.
  When the cap is met, posting closes for the day with an Overlord line; reading stays open. The
  board never publishes unscreened text to stay open.
- **Why not a cheaper model**: OpenAI's moderation endpoint is free and fast, but it does not know
  this site's two special rules (the living never speak; private individuals), it adds a second
  vendor and a second privacy-policy line, and Haiku at this volume costs about a dollar a day (see
  Costs). Recommendation: Haiku through the existing path. Revisit only if volume passes the
  ceiling in the cost table.

### Reports and the review queue

- Every visible post has a REPORT button (assessed files only; 10 reports per case per day; one per
  case per post; a reason from a short list: harassment, private person, words put in a living
  person's mouth, sexual, spam, other).
- **One report** queues the post for review but leaves it up. **Three reports from distinct files**
  (distinct IP hashes too) hide it at once (state held) until Scott decides.
- Reports from a file whose reports Scott keeps overturning (3 overturned in 30 days) stop counting
  toward the hide threshold: report-bombing is itself abuse.

**Where the queue lives: two surfaces, one queue.**

| | MORNING_REPORT desk item | Owner-gated `#review` page |
|---|---|---|
| Fits Scott's desk rules | One bullet = one decision; Silence must be `wait` for anything that reaches a stranger, so silence never publishes or removes | Not a desk item at all |
| Volume | Breaks past a handful a day; twelve bullets is the thing ~/projects/CLAUDE.md forbids | Any volume; batch approve/reject |
| Latency | Nightly (02:00 writer, 03:30 collector) | Live |
| Precedent | `scripts/proposals-desk.mjs` | THE OWNER'S REVIEW on `#docket` |

**Recommendation: the `#review` page is the queue; the desk carries one digest.** `#review` is gated
exactly like the docket's review (an `HVI_OWNER_CASES` case, or a signed-in account that owns one)
and lists held and reported posts, oldest first, with APPROVE / REMOVE / REMOVE AND MUTE, plus the
kill switch states. A nightly desk writer (`scripts/comms-desk.mjs`, run by `scripts/hvi_desk.sh`
like the proposals desk) writes a `## Comms review` section (counts, the oldest item's age) replaced
in place, and **one** Needs-you bullet only when items have waited more than 48 hours:

```
- **Clear the comms review queue (N waiting, oldest 3 days)?**
  Held posts stay hidden until decided; the screen already blocked the obvious ones.
  Options: Remove everything older than 48h / Wait
  Recommend: Remove everything older than 48h
  Silence: wait
```

Silence is `wait` because removing a stranger's post reaches a stranger. Approving in bulk is never a
desk option: a human looks at anything published past the screen's doubt.

### Kill switches (env flags; flipping one is a Netlify env change, no deploy of code)

| Flag | Effect |
|---|---|
| `HVI_COMMS_OFF=1` | Site-wide: every layer 2 to 4 surface reads as closed; posting, mail and chat refused; reading boards shows "THE BOARDS ARE CLOSED BY ORDER." Department mail (layer 1) is unaffected. |
| `HVI_BOARDS_OFF=1` | All boards closed (read-only when `HVI_BOARDS_OFF=readonly`). |
| `HVI_BOARD_OFF=<id>,<id>` | Named boards hidden. |
| `HVI_PMAIL_OFF=1` | Player mail: sending refused; received mail still readable and deletable. |
| `HVI_CHAT_OFF=1` | Chat rooms closed (the relay refuses joins and drops open rooms). The co-op's game channel is a separate flag (`HVI_COOP_OFF`) so killing chat does not kill the dungeon. |

Netlify env changes need a redeploy to reach functions. Because a kill must be instant, the flags are
**also** mirrored in a Blobs key `hvi-boards/switches` that the `#review` page writes and every comms
function reads (cached 15 seconds). Env is the floor (the setting survives a wiped store); the Blobs
switch is the fast path. Either one off means off.

### Automatic mute

- **Strikes**: a screen rejection is 1 strike; a post Scott removes is 2; a removal with mute is an
  immediate mute.
- **Thresholds** (per case, rolling 30 days): 3 strikes, muted 24 hours; 6 strikes, muted 7 days;
  9 strikes, muted until Scott lifts it. A mute covers boards, player mail and chat.
- A muted file can still read everything and still receive Department mail. It sees one line where
  the form was: "YOUR VOICE HAS BEEN FILED FOR LATER. LATER IS <date>."
- Mutes key on the salted case hash **and** the IP hash (a new case from the same address inherits a
  7-day or longer mute for the same period). Device ids (as the Assembly uses) join when cheap.

### Rate limits

| What | Limit |
|---|---|
| New threads | 3 per case per day; 10 per IP hash per day |
| Posts | 20 per case per day; 1 per case per 30 seconds; 60 per IP hash per day |
| Per board | 300 posts a day site-wide per board before it goes read-only for the day |
| Screens | 30 per case per day (refused posts count) |
| Reports | 10 per case per day |
| New posters | files under 24 hours old cannot post; under 7 days old, half the above |

### Retention

- Approved posts: kept while the board exists; the author's file purge **detaches** them (author
  becomes "A PURGED FILE", the text stays, as the aquarium and ski boards do) unless the author asks
  for removal in the purge (a checkbox: REMOVE MY POSTS TOO, default on).
- Rejected posts: 30 days (for appeals and strike counting), then deleted.
- Held posts not decided in 30 days: deleted.
- Reports and strikes: 90 days.
- The 24-month case expiry runs the same purge.

### Terms text (draft for `docs/legal/terms.md`, a new section)

> **Boards, mail and chat.** Assessed case files may post on the city's message boards, write to
> other files that have opted in to mail, and talk in chat rooms. You must be 16 or older. Posts are
> screened by an automated system (Anthropic) before they appear and may be held, refused or removed,
> at the Department's discretion and without explanation. Do not harass anyone; do not name, describe
> or target a private individual; do not quote or put words in the mouth of a living person or state
> accusations against anyone as fact; nothing sexual, nothing about minors, nothing that asks anyone
> to act in the real world, no advertising. Repeated refusals mute a file automatically. You are
> responsible for what you post. Report anything that breaks these rules with the REPORT button; to
> report something urgent or unlawful, [file a request](#dispute). We may disclose content and the
> hashed identifiers we hold where the law requires it. Chat is not stored after the room closes,
> except a short-lived screening record of lines that were refused or reported.

Privacy additions (`docs/legal/privacy.md`): Anthropic is already listed as a processor; add
"post, mail and chat text, for screening" to its row, the board and mail retention lines above, and
that chat lines are held in memory by Cloudflare (a new row: Cloudflare, chat text in transit,
relays chat).

---

## Layer 3: PLAYER MAIL (opt-in)

- **Off by default.** A file opts in from DEPARTMENT MAIL's OPTIONS ("RECEIVE MAIL FROM CITIZENS").
  Only an opted-in file can send, and only to opted-in files. Opting out stops new mail at once.
- **Addressing**: by SUBJECT tag, chosen from a place you met them (a board post's author, a league
  opponent, a co-op party), never by case number and never by typing a free address. The tag is
  resolved server-side to the salted hash; the sender never learns the recipient's case number.
- **Letters**: a subject (4 to 60) and a body (1 to 1,000 characters), plain text, **no attachments**,
  no links (pre-filter), screened by the same Haiku screen with a mail prompt (adds "unwanted contact
  and pressure to meet or move off the site"). Rejected letters are never delivered; the sender gets
  the Overlord line and a strike.
- **Delivered into the same inbox** as Department mail, in a CITIZENS folder, with a REPORT and a
  BLOCK button on every letter. Unread count includes it; still no pop-ups.
- **Block lists**: per file, up to 200 blocked tags; a block is silent (the sender's letters are
  dropped as if delivered; they are not told). Blocking also hides the blocked file's board posts
  from the blocker.
- **Rate limits**: 10 letters per case per day; 3 to any one recipient per day; a first letter to a
  file that has never replied counts double; 20 per IP hash per day. A file may not send until it
  is 7 days old.
- **Abuse handling**: a report puts the letter in `#review` with the thread of letters between the two
  files (both sides, only those two). REMOVE AND MUTE mutes the sender for all layers. Three
  reports from distinct recipients in 30 days mute the sender for 7 days pending review.
- **Retention**: as Department mail (24 months, purged with either file; the sender's copy goes with
  the sender's purge, the recipient's with the recipient's).
- **Storage**: the recipient's `hvi-mail` inbox (letters as items with `from: {kind: "citizen", tag}`),
  a sender outbox key `o:<caseHash>` for counts and the sent folder.

---

## Layer 4: LIVE CHAT (the Cloudflare relay)

### The relay, shared with the dungeon co-op

- One Cloudflare Worker with **Durable Objects**, one object per room (`room:<kind>:<id>`). Kinds:
  `chat` (a district square, the cafe, a game's lobby) and `coop` (a dungeon party). The co-op uses
  the same object class for presence and its game messages; chat adds the screening and moderation
  hooks. One codebase, one deploy, one bill.
- Clients connect by WebSocket with a short-lived **join token** minted by a Netlify function
  (`/api/relay-token`): it checks the case (assessed, not muted, 16+ by the terms), the kill switches
  and the room's capacity, and signs `{caseHash, tag, room, exp: 10 min}` with a secret shared with
  the Worker (`HVI_RELAY_SECRET`). The relay never sees a case number.
- **WebSocket hibernation** so idle rooms cost nothing; rooms cap at 30 people (chat) and 4 (co-op).

### Ephemeral

- No history is stored. A joiner sees nothing said before they joined. When the last person leaves,
  the object forgets everything.
- The only thing written anywhere: a refused or reported line, with its room and the sender's hash,
  sent to the Netlify review endpoint and kept 30 days.

### Screened

- Every line passes the same deterministic pre-filter in the Worker (ported: it is pure JS).
- Lines are short (200 characters), and a model call per line would be the biggest cost line in this
  design. So: lines are **delivered after the pre-filter and screened asynchronously** in batches
  (every 5 seconds or 20 lines, one Haiku call per batch through a Netlify endpoint that charges the
  comms cap and `chargeGlobal`). A line the screen rejects is **retracted** from every client (the
  relay broadcasts a removal; the client replaces it with "REMOVED BY THE DEPARTMENT."), counts a
  strike, and a mute disconnects the sender at once.
- When the screening cap is met, chat rooms close for the day (the co-op keeps running without chat:
  its game messages are structured, never free text).
- Players can REPORT a line (it goes to `#review` with the 20 lines around it, which is the one case
  where chat text is kept, 30 days).
- Slow mode: 1 line per 3 seconds per person; 3 identical lines in a row are dropped.

### Kill switch

`HVI_CHAT_OFF` (env, and the Blobs switch the token endpoint reads) stops new joins; the Worker also
polls the switch every 30 seconds and closes open chat rooms with "THE SQUARE HAS BEEN CLEARED BY
ORDER." `HVI_COOP_OFF` is separate. `HVI_COMMS_OFF` closes both chat and boards but not the co-op's
game channel.

---

## Costs and ceilings

Prices are approximate, as I understood them in 2026 (Claude Haiku 4.5 about $1 per million input
tokens and $5 per million output tokens; Cloudflare Workers Paid $5 a month including about 1 million
Durable Object requests and 400,000 GB-seconds, with WebSocket messages billed at a 20-to-1 discount
and hibernated sockets not billed for duration). Check the provider pages before turning a layer on.

| Item | Unit cost | Daily ceiling (cap) | Worst day at the cap |
|---|---|---|---|
| Board post screen (about 900 tokens in, 60 out) | about $0.0012 | 400 screens (`HVI_COMMS_MOD_DAILY_CAP`) | about $0.50 |
| Player mail screen (about 1,200 in, 60 out) | about $0.0015 | shares the 400 above | (inside the above) |
| Chat batch screen (20 lines, about 1,500 in, 120 out) | about $0.0021 per batch | 500 batches (`HVI_CHAT_MOD_DAILY_CAP`) | about $1.05 |
| All Anthropic calls on the site | as above | `HVI_ANTHROPIC_DAILY_CAP` (1000 calls) | the global ceiling already in force |
| Cloudflare relay (chat and co-op) | $5 a month flat | about 1M requests a month included | $5 a month until thousands of daily players |
| Netlify Blobs (boards, mail) | within the current plan | | none expected at this scale |

**Ceiling in plain terms**: with every cap hit every day, comms adds about $1.50 a day in model
calls (about $45 a month) plus $5 a month for the relay. The caps close posting and chat for the day
rather than spend past them; reading never closes.

---

## Turning a layer on

Each layer ships dark (its flag off), is tested with a test case (never Scott's), and is turned on
by Scott. A layer goes on only when the one before it has run two weeks with:

- the review queue cleared within 48 hours every time,
- fewer than 1 in 20 published items reported, and
- no kill-switch use for abuse.

Checks to write with each layer: `scripts/check-boards.mjs` (pre-filter, screen outcomes with a
fake model, held flow, report thresholds, mute ladder, kill switches, rate limits, purge detaches),
`check-pmail.mjs` (opt-in, blocks are silent, limits, purge), `check-relay.mjs` (token signing and
expiry, retraction, ephemerality: nothing written on a clean room close).

---

## Open questions

1. **Does a signed-in email account become required to post?** Recommendation: not for boards at
   first (the case number is the credential everywhere else, and the mute keys on IP as well), but
   **yes for player mail and chat**, where one person reaching another is the risk. A secured file
   is far more costly to throw away after a mute.
2. **Should a purge remove the author's approved posts, or leave them as "A PURGED FILE"?**
   Recommendation: remove by default (a checkbox in the purge, default on). It matches what the
   privacy policy promises about the file and costs only some thread continuity, which tombstones
   already handle.
3. **Chat: screen before delivery (about a second of lag per line) or after (retraction)?**
   Recommendation: after, in batches, as designed above. Per-line screening before delivery would
   cost roughly ten times as much and make chat feel broken; retraction plus instant mutes and a
   30-person room cap keeps the exposure small. If abuse gets through anyway, switch a room to
   screen-before with one flag.
4. **Where does Scott review?** Recommendation: the owner-gated `#review` page for the work, with one
   nightly digest on the desk only when items wait past 48 hours (Silence: wait). The desk cannot
   carry per-post decisions without breaking its one-decision-per-bullet rule.
