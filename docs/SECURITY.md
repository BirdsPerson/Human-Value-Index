# Security: who may act on a case file

This repository is public. A case number (`HVI-XXXXXXXX`) is handed to a subject at intake and,
until the subject secures the file to an email address, it is the only key to that file. So a
case number is a credential, and the rules below follow from that.

## The rule (netlify/lib/auth.js `requireCaseAuth`)

| file is | a write on it (and a private read of it) is allowed to |
|---|---|
| **unclaimed** (no `case:<id>` marker in `hvi-accounts`) | whoever holds the number. The UI says so: CLAIM YOUR FILE WITH YOUR EMAIL TO PROTECT IT. |
| **claimed** by an email account | only a request carrying that account's session cookie (`hvi_sid`, the magic-link login). Nobody else: `401 sign-in` without a session, `403 not-yours` with another account's. |
| **the owner's** (listed in env `HVI_OWNER_CASES`) | only a session of an owner account, whether or not the case is claimed. Never the number alone. |

Every endpoint that takes a case id calls `requireCaseAuth(req, caseId, { write })` before it
changes anything and before it returns the file's private parts. A refusal body carries
`{ error, code: "sign-in" | "not-yours", secured: true }`. The stores being unreachable throws, and
the endpoint fails closed with its own 5xx. `scripts/check-caseauth.mjs` enumerates
`netlify/functions/*.js` and fails the build when a function that takes a case id and has a POST
path does not call the helper, or calls it after its first write primitive; it then runs the
matrix above against the live handlers on in-memory Blobs.

Public views that merge a file's own part into a public one (the Assembly, the elections, a
petition, the proposals docket) still answer when the file's part is refused: they omit it and set
`secured: true` on the view instead of failing the whole page.

## Inventory: what a bare case number lets a caller do

R = read, W = write. "gated" = `requireCaseAuth`; "open" = the number (or nothing) is enough and
the data is already public elsewhere.

| endpoint | with a case id, GET | POST | gate |
|---|---|---|---|
| `/api/case` | R exists + visit count (metered per IP) | – | open (this is how a subject logs on with the number) |
| `/api/file` | R the whole current file: score, tier, verdict, breakdown, flags, history, photo | – | **gated read** |
| `/api/me` | R who is signed in; `?caseId=` adds `secured` (is the held file claimed?) | W claim a case to the session | session (`requireAccount`) |
| `/api/avatar` | R the photo spec (also on the public pen card) | W redraw the likeness (spends Anthropic) | open R, **gated W** |
| `/api/quest` | R directives + vouches | W accept / complete / abandon | **gated R+W** |
| `/api/intake-session` | – | W open an interview or appeal on an existing case; a new case needs nothing | **gated W** when a case id is given |
| `/api/intake-chat` | – | W a typed interview turn (spends Anthropic, writes the plan) | **gated W** |
| `/api/intake-score` | – | W score a transcript onto the file (spends Anthropic); replays return the file | **gated W** |
| `/api/refer` | R referrals left this cycle (`owner: true` only to the owner's session) | W refer a public figure, charged to the case; owner cases skip caps and may file from sources | **gated W**; owner powers need the owner's session |
| `/api/casino` | R wallet, tables, stats | W allowance, bets, poker | **gated R+W** |
| `/api/economy` | R apartment + wallet (`?chip=1` the balance) | W collect UBI, buy / sell positions | **gated R+W** |
| `/api/market` | R shares + open orders | W place an order | **gated R+W** |
| `/api/shops` | R wardrobe, furniture, flat, balance | W buy, upgrade, wear, save, place | **gated R+W** |
| `/api/eb-claim` | – | W grant real-purchase copies to the case | **gated W** |
| `/api/leagues` | R entry, ratings, season lines | W enter / change / withdraw | **gated R+W** |
| `/api/elections` | R own ballots, seats, candidacy, write-in self | W ballot, write-in, declare, resign | **soft R** (own part withheld), **gated W** |
| `/api/assembly` | R own ballot | W cast a ballot | **soft R**, **gated W** |
| `/api/petition/:slug` | R own vote | W vote | **soft R**, **gated W** |
| `/api/proposals` | R own ballot + signatures; review queue (owner) | W file, cosign, ballot; review (owner) | **soft R**, **gated W**; owner = signed-in owner account only |
| `/api/chess` | R record (what the board shows) | W start / file a game | open R, **gated W** |
| `/api/aquarium` | R donations, records (what the tanks show) | W permit / donate | open R, **gated W** |
| `/api/ski` | R bests (what the boards show) | W permit / file a run | open R, **gated W** |
| `/api/tournament` | R own events, places, honours (what the boards show) | W enter an event / submit a card | open R, **gated W** |
| `/api/purge` | – | W delete the file | **gated W** (same rule; it was already session-gated for claimed files) |

Takes no case id: `hunt` (arcade initials), `evaluate` (survey text only), `request` (dispute form),
`eb-virtual`, `find`, `social`, `funnel`, `paper`, `pen`, `plan`, `figure`, `sprite`, `atlas`,
`arrivals`, `ebtv-frame`, the `*-tick` and `*-background` jobs (`tournament-tick` included), `login`,
`login-verify`, `logout`, `prune`.

## The owner's case number

- It lives only in the environment: `HVI_OWNER_CASES` (comma list), set in Netlify for production.
  `netlify/lib/auth.js isOwnerCase` is the one reader; `prune.js`, `refer.js`, `economy.js` and
  `proposals.js` go through it. Unset, nobody is the owner and the owner's extras (the review queue,
  the referral caps, the prune exemption, the one-allowance exemption) are off; the function logs
  a warning once per cold start in production.
- There is no committed digest of it as a fallback: a case id has 36^8 possibilities, so a bare
  SHA-256 is reversed by brute force in hours. The environment is the authority.
- The proprietor record's server half (`{case, owner, since, by, at}`) lives in the Blobs store
  `hvi-proprietors`, written by `scripts/set-proprietor.mjs`; only the public half
  (`src/city/proprietors.json`: census key and display name) is committed.
- `scripts/recalibrate.mjs` writes citizens into `docs/calibration/*-applied.json` as `SUBJECT XXXX`,
  never as case numbers. Test scripts use `HVI-OWNERAAA` through the env var.
- **History.** The owner's case number was committed in plaintext from `0fceb3c` (2026-09) until
  this change, in `auth.js`, `prune.js`, `proprietors.json`, a calibration record and four check
  scripts. It is still in git history; rewriting a public repository's history is the owner's call
  and was not done. It does not need to be: the owner's case is claimed by the owner's email account,
  so (claim-takeover was always refused and) every write and private read on it now requires the
  owner's session. The leaked number is a label, not a key.

## What the owner must do to keep acting as himself

Be signed in (SECURE BY EMAIL on MY FILE) on every device he plays from. The session cookie lasts
30 days; when it expires, the UI says THIS FILE IS SECURED TO AN EMAIL ADDRESS. SIGN IN WITH THAT
ADDRESS TO ACT ON IT, and every action on the file is refused until he does. Operator scripts that
write to Blobs directly (`set-athletic-record.mjs`, `set-proprietor.mjs`) are unaffected; the one
that reads his leagues panel over HTTP prints a note instead of the panel when it is refused.

## Checking

```
node scripts/check-caseauth.mjs     # the static scan and the matrix
node scripts/check-auth.mjs         # magic links, sessions, claims
node scripts/check-legal.mjs        # purge: confirm, ownership, what it deletes
node scripts/run-checks.mjs         # everything
```
