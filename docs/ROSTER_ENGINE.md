# Roster engine

Grows the Human Value Index by ~48 public figures a week, cheaply, and fills the octants
famous people never reach (BELOVED, OVERLOOKED, INDULGED) with the ordinary middle.

```
Saturday 03:00  com.hvi.roster-grow  ->  node scripts/roster-grow.mjs --n 48
Sunday   21:00  com.hvi.calibrate    ->  measures the roster, new figures included
every 10 min    com.hvi.referral-sprites -> uploads sprites / redraws failed cells
```

## One run

| Stage | What happens | Cost |
|---|---|---|
| candidates | `scripts/roster/candidates.mjs`: MIT Pantheon (fame band = language editions) for broad domains, Wikidata SPARQL for service lives (nurses, missionaries, social workers, teachers, physicians, Nobel Peace) and the convicted. Mix: 50% middle (15-60 language editions), 20% service, 15% notorious, 15% famous. Deduped by Wikidata id against the 62 and production. Resolved like a referral: human, not a minor, life dates from Wikidata. | free |
| scoring | One Message Batch, Sonnet 5 at 50% price, system prompt cached. Each person read 3 times; per-dimension median; verdict from the closest reading (same as `rescore-lib`). Declined by 2 of 3 reads (minor, victim, pending case, not human) = dropped. Also returns `sprite_look` and `places`. | batch |
| factcheck | One Message Batch, Haiku, verdict vs the Wikipedia article (30k chars). Unsupported claims cut; a check that fails withholds the verdict. | batch |
| sprites | `scripts/roster/grid.py`: 16 figures per 4k Higgsfield image, prompted by looks only (names trip the public-figure filter). Sliced on the magenta gutters; each cell validated (figure present, not cut by an edge, one figure per cell) and written to the raw cache. | ~1 grid per 16 |
| store | Cards into production `hvi-figures` (`source: "roster-engine"`, `stratum`, `places`, `harm`, `people: null`), conditional index writes. | free |
| upload | `scripts/referral_sprites.py` processes the cached cells (no generation) and redraws failed cells singly, within the credit budget. | redraws only |
| report | `## Roster engine` in MORNING_REPORT.md, then the desk collector. | free |

State lives in `~/.cache/hvi-roster/state.json`. A batch still processing when the run's
wait limit passes is picked up by the next invocation.

## Budgets (checked before spending)

- `HVI_ROSTER_MAX_DOLLARS` (default 3): the cohort is trimmed until the token estimate at
  batch prices fits.
- `HVI_ROSTER_MAX_CREDITS` (default 20): grids first; single redraws only with what's left.
  Failed cells past that keep their placeholder (`spriteStatus: "failed"`).
- `HVI_GRID_CREDITS` (default 4): credits per 4k grid, used by the guard.

## The building

The Holding Pen seats ~74. Past `BUILDING_POP` (110) subjects, roster-engine figures go to
the registry and the cube without walking in; hand referrals and citizens always enter.

## Commands

```
node scripts/roster-grow.mjs --dry-run --n 16   # sample a cohort + cost estimate, no spending
node scripts/roster-grow.mjs --status           # runs, stages, costs
node scripts/check-roster.mjs                   # self-check (no network)
```
