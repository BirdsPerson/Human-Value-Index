# HVI Roadmap — the nightly loop's backlog

Read by `scripts/hvi_nightly.sh` every night (02:00, launchd `com.hvi.nightly`).
The loop takes the TOP unblocked item that fits one night, ships it (HVI rule:
ship when checks pass), and moves it to Done with the commit. Scott reorders or
adds items by telling Claude in chat; Claude edits this file.

Status tags: [next] [blocked: reason] [in progress] [needs Scott]

## Backlog (priority order)

1. [next] **Side quests → vouches.** Figures (dead only; living figures never speak)
   offer quests in their own voice, matched to their value lens. Two kinds:
   in-game (visit a place, bring someone, talk to a figure, witness an event in the
   city) and real-world Directives (reported back via appeal). Completing one earns a
   capped vouch in that figure's category (Tubman → care, Hemingway → nerve/physical,
   Curie → persistence/utility). Quest log on MY FILE. Overlord copy. Cost: text-chat
   quests on Haiku; cap per player per day. Acceptance: a player can accept, complete
   and receive a vouch end-to-end; vouch visible on the file; checks for caps/abuse.

2. **Your character in the city.** Player picks job (from 3 offers at a terminal) and
   2-3 hangouts; their sprite follows that schedule in the sim; "follow me" camera;
   promotion requests up the ladder. Passive (SimTower), no action controls.

3. **NPC encounters.** Co-located figures (same place, same hour) have encounters,
   generated nightly in a small batch (Haiku, capped). Each encounter is a one-line
   Overlord log + a relationship delta computed from the pair's value lenses. The
   aggregate becomes a figure-to-figure People view (likability from peers) for figures
   without YouGov data. City gossip feed + encounter log on cards. Never for living
   people saying words (actions only for the living).

4. **Directives & promotions.** Weakest-category Directives delivered by a fitting
   figure; tier promotion ceremonies; floors/districts unlocked by tier.

5. [blocked: email login — 4 Namecheap DNS records never published] **Economy v1:**
   CYCLES UBI daily, invest in 7 district industries (herding thins returns), job
   ladder wages, society-allocation readout. Wealth never raises score; conduct does.

6. **Realism:** more places per district, day/night palette, weather, news → city
   events (a scandal empties a district, a promotion fills the bar).

7. **Pen long-press pickup** on touch, so a swipe that starts on a subject scrolls.

## Guardrails (the loop must obey)

- One item per night; stop at the time budget and report partial work honestly.
- All scripts/check-*.mjs + scripts/check_sprite_qa.py + build must pass before push.
- Budgets per night: ≤10 Higgsfield credits; ≤$3 Anthropic API (count calls).
- Never change calibration.json weights (that's the Sunday calibration loop + Scott).
- Content rules: no founders/prophets; living people never speak or vouch; sprite QA.
- Write the summary to MORNING_REPORT.md (## Shipped / ## Needs you) and run
  ~/projects/organize/collect_reports.py.

## Done

- 2026-09-26 City v1 (c9175a6), City v2 train/buildings/3D (ee5602d), design + mobile pass (5a7478c), public launch.
