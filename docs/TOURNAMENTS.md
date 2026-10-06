# THE OPEN TOURNAMENTS

Scott, 2026-10-06: open tournaments a player enters "right from the newspaper and go directly there,
competing against other players". Built async: no real-time play between players. Everyone plays the
identical setup whenever they like inside a real-time window; the server re-plays every official card
on the game's own pure sim before it goes on the board.

## The calendar (computed, never stored: `src/tournament/calendar.js`)

City time is America/New_York (the paper's clock). Every client, the paper and the server compute the
same events from the clock alone.

| Event | Game | Window | Format | Prizes |
|---|---|---|---|---|
| THE DAILY AUDIT (name rotates daily) | golf | every day 00:00 to 24:00 | 9 holes, stroke play; the course and the nine alternate by date | a line on each division winner's file |
| THE WEEKEND MAJOR (THE COMPLIANCE CLASSIC, THE AUDITOR'S INVITATIONAL, THE REDACTED MASTERS, ... in rotation) | golf | Friday 00:00 to Monday 00:00 | 18 at THE DEPARTMENT OPEN | trophies for the top 3 (OPEN) and the ASSISTED winner; lines for the top 3 |
| LEAGUE NIGHT (THE MANDATORY FUN LEAGUE Tue, THE APPROVED RECREATION LEAGUE Thu) | bowling | Tue and Thu 18:00 to 24:00 | 3 games, total pins | a trophy for each division's winner; lines for the top 3 |
| THE SEASON N CHAMPIONSHIP / PINS CHAMPIONSHIP | golf, bowling | the last 72 real hours of each month-long season (`src/city/seasons.js`) | 18 at THE DEPARTMENT LINKS; 3 games | as a major |
| THE SUNDAY DERBY | fishing | Sundays 08:00 to 20:00 | the heaviest single fish from the pier | a trophy for the winner; lines for the top 3 |

Each event and each leg has one seed (`seedOf(id, leg)`), the same for everyone: golf's wind on every
hole, bowling's oil and racks, the derby's fish. The tees and pins are the course's own. An event's id
(`golf-major-2026-10-09`, `bowl-league-2026-10-06`, `golf-champ-s23`) recomputes the whole event.

## Divisions

**OPEN**: no assists. **ASSISTED**: the games' own assists (golf's EASY SWING, bowling's EASY lanes and
bumpers). Separate boards, separate trophies. A file enters one division per event. Fishing has no
assists: one board.

## Entering and playing

- **Entry points**: the paper's CLASSIFIEDS ("ENTER THE <EVENT>", one tap to `#golf?t=<id>`,
  `#bowling?t=<id>`, `#fish?t=<id>`), the paper's SPORTS (boards as at press time; champions in the
  next edition; editions never change) and its live WIRE (the open events' leaders), the TOURNAMENT
  desk on each game's start screen, the #play tile's LIVE EVENT tag, THE LEAGUES hub's OPEN TOURNAMENTS.
- **ENTER** needs a case file and issues a signed permit (event, file, attempt, division, time). One
  official attempt per event. Entering again while the attempt is unfinished returns the same permit
  (a reload does not cost the entry). **PRACTICE** is the same locked setup, unofficial, unlimited, no
  file needed.
- The round ends; the game files the card (`inputLog` and the claimed result). The server checks the
  permit, that the log holds no more play than the time since the entry (or since the previous game of
  the series), re-plays it from the event's setup, and files it only when it comes out exactly as
  claimed. One official result per leg of an attempt; bowling's games in order.
- A window closes on time; cards entered before the close may still be filed for 45 minutes.

## Boards

Projected while open (a bowling series in progress counts as it stands, THRU n), final after the
grace (finished cards only; the rest NO CARD). Order: finished first, the score, then the tie-break
(golf: the countback over the last 9 / 6 / 3 / 1 holes; bowling: the best single game, then strikes;
the derby: the length), then who finished first, then the holder's key. Never a shared place. Names on
the board are SUBJECT + the case number's last four.

## Prizes

Every 15 minutes `tournament-tick` makes closed events final once and delivers:
- **a line on the file** (MY FILE, THE HONOURS): "WON THE COMPLIANCE CLASSIC, 3 UNDER. THE DEPARTMENT IS
  INVESTIGATING."
- **a trophy** (majors, championships, league nights, the derby): a unique furniture piece, SKU
  `f:trophy.<event>.<o|a><place>`, a cup or a plate on a plinth with the game's emblem, placed in the
  flat like anything bought. Granted by the ledger's `econ_award` (a txn with no CYCLES in it); a file
  with no wallet yet gets it once the wallet opens (retried 30 days). Never sold.
- **No CYCLES purse.** ECONOMY_PROPERTY.md section 11: CYCLES carry "no prizes"; a purse would mint
  outside the UBI and the market's rules. Trophies and titles only.

## Code

- `src/tournament/calendar.js` the calendar; `rules.js` the divisions, the locked setups, the board's
  order, the lines, the trophies; `TournamentDesk.jsx` the game pages' desk; `TournamentList.jsx` the
  hub's list and MY FILE's honours; `api.js`.
- `netlify/functions/tournament.js` (`/api/tournament`), `netlify/lib/tournament-store.js` (Blobs store
  `hvi-tournaments`: `t:<event>` boards, `c:<case>` records), `netlify/lib/tournament-verify.js` (THE
  ADAPTER INTERFACE: golf, bowling, fish; hunt and ski ready for a calendar entry),
  `netlify/lib/tournament-awards.js` and `netlify/functions/tournament-tick.js` (final results, prizes).
- `supabase/migrations/20261008000000_tournament_trophies.sql` (`econ_award`), memory twin
  `netlify/lib/tournament-db.js`. `src/city/trophyPieces.js` draws the trophies.
- The purge strikes the file's name on every board (A PURGED FILE) and deletes its record.
- Check: `scripts/check-tournament.mjs`.

## A new game joins

Write an adapter (`verify(ev, leg, div, {inputLog, claim, ...}) -> {ok, leg: {total, tb}}`, `logTicks`,
`hz`, `lower`), add its events to the calendar and its page's desk. Ski: `ev.cond = {ch, board}` (a
fixed start, no seed). Hunt: `ev.cond = {trip}`.
