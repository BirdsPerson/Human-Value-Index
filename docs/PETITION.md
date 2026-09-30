# THE PEOPLE'S PETITION (2026-09-30)

The People's Vote from docs/story/STORYLINE_TOURNAMENT.md, approved by Scott on 2026-09-29
(ROADMAP item c). Scott's rule of 2026-09-30: **one vote per voter per figure per
EVALUATION PERIOD**. When the Department re-evaluates the file, everyone may vote again.

## What it is

- On every **public figure's** file (the subject card in the pen and the city, and the
  Public Figure Index's open file): THE PEOPLE'S PETITION. Three buttons, TOO HIGH /
  FAIR / TOO LOW. No free text. The machine's number sits beside the people's lean.
  Citizens' (players') files never carry it; the API refuses them.
- **Votes never move a score.** Enough of them can buy one machine re-examination, which
  does not know which way the people leaned.
- **Who votes:** any assessed case file (as with the Assembly). The case number is the
  credential. Limits per file and period: 3 voting cases per IP hash, 2 per device (random
  id in localStorage, salted and hashed); 60 votes per IP hash per hour; 30 votes per case per
  day; 5 changes of mind per period. The owner's case has no exemption.
- **Closed to opinion** (neutral flag, "FILE CLOSED TO OPINION", no reason given):
  harm-gated and serious-cap files, any case-by-case harm finding (made or pending), a
  withheld verdict, a candidate in a pending election, a local official, a no-dangle file.

## The evaluation period

The period is the number of entries in the figure's `scoreHistory` (src/figures.js for the
62 on record, the hvi-figures card for referred and engine figures). Any new entry (a method
change, a record re-read, a harm review, a petition review) starts a new period. A vote's key
is (voter, figure, period): within a period a vote can change; in a new one everyone votes
fresh. Old periods keep their tallies and their lean for good.

## Thresholds (netlify/lib/calibration.json `petition`)

| State | Condition |
|---|---|
| QUIET / STIRRING | under 5 / under 25 voters this period |
| NOTED | 25 voters this period |
| review asked for | 40 voters; one direction (TOO HIGH or TOO LOW; FAIR never asks) has a Wilson 95% lower bound of at least 0.60 of all votes; it wins at least 55% in at least 3 of the 4 cube-quadrant cohorts with at least 5 voters each (each voter's cohort is their own file's quadrant); no cohort supplies over half the votes |
| REVIEW PENDING | the above held unbroken for 72 hours (a break or a change of side restarts the clock); granted by the hourly tick |
| caps | at most 3 reviews granted a day site-wide (strongest first) and at most 3 run a day; one review per file per 30 days |

Before a review is granted, counts show rounded to 5 and shares to 5% (no live countdown to
organise against). The design's "2% / 3% of weekly-active" floors and the 14-day rolling
window are not built: there is no weekly-active measure yet, and the period replaces the
window.

## The review

`scripts/petition-review.mjs`, on the Mac (launchd `com.hvi.petition-review`, hourly at :25),
reads the queue (`q/<slug>/<period>` entries, which carry no direction). For each, while the
day's 3 run slots last: the existing rescore pipeline (`scripts/rescore-lib.mjs` rescoreOne:
median of 3 Sonnet readings, the Haiku fact-check with its living rules and delete-only
guard). The job handed to the model is built from the figure alone (`reviewJob`: name, died,
wiki title, harm review): it never hears that there was a petition or which way it leaned.
Each section moves at most ±60; a section the new reading leaves unassessed keeps its value;
a verdict that did not pass the fact-check never replaces the old one. The move is logged on
the file as cause `review`, sub `petition`, note "THE PEOPLE PETITIONED ..." (shown as
PETITION REVIEW under THE DEPARTMENT'S CHANGES), which opens a new evaluation period.
Roster files are rewritten in a throwaway worktree of origin/main, checked, committed and
pushed (Netlify deploys); referred files are written to hvi-figures (CAS) and re-indexed.
A petition on a period the Department closed on its own meanwhile is marked superseded; a
review that fails three times is marked failed. Cost: at most 3 reviews a day, about $0.05
each. The file shows the result against the lean: THE DEPARTMENT CONCURS / DISSENTS /
THE RECORD STANDS (under 2 points).

## The People signal (likability)

Each period's lean becomes a crowd reading on the likability scale around the machine's own
conduct reading for that period: `warmth + 50 x (TOO LOW - TOO HIGH) / voters` (TOO LOW
says the public regards the subject above the record). Periods are pooled with weight
voters x 0.5^(periods back). The blend (src/petition.js `blendPeople`):

- With a YouGov reading: the poll is a prior worth 100 voters,
  `likability = (100 x YouGov + n x crowd) / (100 + n)`.
- Without one: the crowd alone once it has 25 (decay-weighted) voters, shrunk toward 50 by the
  same pseudo-count the YouGov seeding uses (20): `(n x crowd + 20 x 50) / (n + 20)`.

It feeds the cube's likability axis (so RATIFIED / CONTESTED and the octant) for referred
figures through the census (/api/pen) and for the 62 on record in THE CUBE view; the file's
petition panel shows it beside the lean. It never touches the score.

## Storage (Blobs store `hvi-petitions`, see netlify/lib/petition.js)

`v/<slug>/<p>/<voterKey>` one vote (onlyIfNew, then CAS); `t/<slug>/<p>` the tally folded on
write by CAS, idempotent per voter revision, with the hold; `ip/…`, `dev/…` capped lists;
`a/<slug>` the tick's worklist; `h/<slug>` the lean of every period; `q/<slug>/<p>` the
queue; `cap/grants/<day>`, `cap/runs/<day>` the daily caps; `summary` the crowd readings.
A GET recounts a period from its votes every 10 minutes (under 2,000 voters), as does the
hourly tick (`netlify/functions/petition-tick.js`, no model calls).

**When to move to a database** (same trigger as docs/ASSEMBLY.md): past ~2,000 voters in one
file's period (recounts stop, the tally blob passes ~60 KB), sustained writes over ~5 per
second on one file, or the hourly tick passing ~15 s (a few hundred voted files: move it to a
background function first). Then: votes as rows with a unique (slug, period, voter) key,
tallies as GROUP BY, the hold and the queue as tables.

## Checks

`scripts/check-petition.mjs`: one vote per period and the re-opening after a new
scoreHistory entry, change within a period and the revision cap, player and closed files
refused, every limit (owner included), the tally equal to the votes under 320 concurrent
writes with and without lost folds, the trigger (threshold, bridging, Wilson, cohort
dominance, FAIR), the 72-hour hold and its restart, the daily grant and run caps, the
cooldown, supersession, the review blind to direction, the ±60 cap and its log entry, the
roster line rewrite, and the likability blend end to end.
