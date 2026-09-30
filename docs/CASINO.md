# HOUSE EDGE CASINO

Scott, 2026-09-30: make the casino real, with real probability. Play chips only.

## Legal shape (do not loosen)

- **House chips** are play chips: a free allowance of 1,000 per UTC day per assessed case file
  (a case with history). No purchase, no cash-out, no transfer between files, no prizes.
  `/api/casino` has no action that could do any of those; `scripts/check-casino.mjs` fails if
  one appears or if anything but the casino and purge touches the chip store.
- Terms §10 (`docs/legal/terms.md`), the privacy retention line, and the cage's legal line on
  `#casino`. 16+ like the rest of the site. The responsible-play line names 1-800-GAMBLER.
- Nobody is labelled alive or dead on screen (check-no-death-labels). Living figures act only;
  dead figures speak only the pre-written lines in `netlify/lib/casino-figures.js`. Files with
  grave harm are never seated.

## Where things are

| | |
|---|---|
| `src/casino/rules.js` | limits, allowance, house edges, the roulette layout (`coverOf`, payouts 36/k - 1) |
| `netlify/lib/casino-games.js` | roulette, blackjack (6D, S17, 3:2, double, split once, insurance, 75% penetration), baccarat (8D punto banco tableau) |
| `netlify/lib/casino-poker.js` | 7-card evaluator, hold'em state machine (min-raise, short all-in, side pots), figures' play |
| `netlify/lib/casino-figures.js` | the floor and high limit pools, table talk, tells, style dossiers |
| `netlify/lib/casino-store.js` | wallet blob per case (etag CAS on every change), weekly board (last-4 only) |
| `netlify/functions/casino.js` | `/api/casino`: one server call per hand/spin/coup, node:crypto RNG, rate limits |
| `src/casino/*.jsx` | `#casino[/game][?room=high]` |
| `src/casino/cityRooms.js` | the building's floors: THE TABLES (G) and the HIGH LIMIT ROOM (2F); tapping a table opens its game |

## Rooms

The high limit room opens at 5,000 chips (held + at a poker table) or an ESSENTIAL / RETAINED
file. Higher limits, 25/50 poker blinds, and the famous gamblers and strategists on file, who
read their hands better (skill +12) and leak less (tells no better than a coin).

## Figures' styles (from the file)

aggression = threat and competence; bluff frequency = adaptability; tightness = care and
alignment; skill = competence (Monte Carlo equity with noise); tell honesty falls with competence.
