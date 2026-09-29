# HVI Roadmap — the nightly loop's backlog

Read by `scripts/hvi_nightly.sh` every night (02:00, launchd `com.hvi.nightly`).
The loop takes the TOP unblocked item that fits one night, ships it (HVI rule:
ship when checks pass), and moves it to Done with the commit. Scott reorders or
adds items by telling Claude in chat; Claude edits this file.

Status tags: [next] [blocked: reason] [in progress] [needs Scott]

## Backlog (priority order)

1. [in progress: slices 1 and 2 shipped, see Done] **Side quests → vouches.**
   Remaining slices: (b) [next] vouch → score effect: DECIDED by Scott 2026-09-28: +2 to that category per vouch (max +14 across 7); show it on the file and in the breakdown; each vouch appends a history entry with cause "vouch" (src/movement.js: YOUR CHANGES, not a visit, not capped);
   (c2) bring someone (needs a second player or a referral; witness shipped as c1);
   (d) real-world Directives
   reported back via appeal; (e) text-chat quests on Haiku (capped); (f) offers from
   roster-engine dead figures, not just the 7 hand-written ones.
   Original brief: Figures (dead only; living figures never speak)
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

3. [partly done: emergent relationships shipped b5619ab — next: Overlord lines for the dead, relationships feeding the People view] **NPC encounters.** Co-located figures (same place, same hour) have encounters,
   generated nightly in a small batch (Haiku, capped). Each encounter is a one-line
   Overlord log + a relationship delta computed from the pair's value lenses. The
   aggregate becomes a figure-to-figure People view (likability from peers) for figures
   without YouGov data. City gossip feed + encounter log on cards. Never for living
   people saying words (actions only for the living).

4. **Directives & promotions.** Weakest-category Directives delivered by a fitting
   figure; tier promotion ceremonies; floors/districts unlocked by tier.

5. **Economy v1** (unblocked 2026-09-28: DNS moved to Netlify, Resend domain verified, email login live):
   CYCLES UBI daily, invest in 7 district industries (herding thins returns), job
   ladder wages, society-allocation readout. Wealth never raises score; conduct does.

6. **Realism:** more places per district, day/night palette, weather, news → city
   events (a scandal empties a district, a promotion fills the bar).

7. **Pen long-press pickup** on touch, so a swipe that starts on a subject scrolls.

8. **Backfill field/domain on every subject.** 104 of 185 subjects (referrals + engine) carry no field, so analytics by field covers only 81. Classify field + era from Wikidata occupation/P106 and birth date for every card (cheap, no model needed where Wikidata has it), store on the card and index, and make referral + engine paths set it at creation.

9. **City polish from the iso build:** ward curtains drawn too tall; verify the "+K" crowd badge on a real crowded room; test pinch/twist on a real phone. STREET view is back burner (kept, not default).

10. **Shared animation rig recoloured per person** (Scott 2026-09-28: faces hidden, identity by colours). Extract each subject's palette (hair, skin, top, bottom, shoes, accent) from their existing sprite; draw a small shared rig once (4-direction walk, sit, desk work, cheers, dance) in the design-system style; recolour per subject client-side (zero image generation). Real face only in front idle + file photo. Use in CITY iso, STREET, pen, building cutaways.

11. **HQ as a tall SimTower building (~12 floors) of Overlord departments:** Intake, Records, Archive stacks, Calibration Lab (shows current method version), Review Board, Tribunal, Holding Cells, Operations, Executive Suite, roof. Real sim use per floor.

12. **Holding Cells with meaning:** subjects under Review (arraignment/summons, appeals under hearing, harm reviews, news re-scores) walk into a holding cell until their case is heard at the Tribunal, then are released ("RELEASED. FILE AMENDED."). Driven by real events; visible "who is in trouble" board.

## Guardrails (the loop must obey)

- One item per night; stop at the time budget and report partial work honestly.
- All scripts/check-*.mjs + scripts/check_sprite_qa.py + build must pass before push.
- Budgets per night: ≤10 Higgsfield credits; ≤$3 Anthropic API (count calls).
- Never change calibration.json weights (that's the Sunday calibration loop + Scott).
- Content rules: no founders/prophets; living people never speak or vouch; sprite QA.
- Write the summary to MORNING_REPORT.md (## Shipped / ## Needs you) and run
  ~/projects/organize/collect_reports.py.

## Done

- 2026-09-29 Social tick drops withdrawn subjects (commit in git log, "Social tick: forget
  withdrawn subjects"): every advance forgets pairs, events, names and friend-pull boosts
  of anyone missing from the census; the tick reads the census strictly (a failed figure
  read throws and writes nothing), social-seed refuses a figure-less /api/pen. Check:
  check-social withdraws a subject mid-run and through the tick.

- 2026-09-28 De-crowding + no dead/alive split: capacity-aware leisure placement with
  same-kind overflow, 8 new rooms, Hab Block D, Hab floors renamed RESIDENCE LEVEL n;
  every death label/year/ghost line removed from the UI; bundle check for death markers.

- 2026-09-28 Method v3.1/v3.2 scoring (55f766e, b12bf1e), analytics view (88eda07), STREET city (334bc39), emergent relationships (b5619ab), SimCity iso city of cutaway buildings (c9cc8df).

- 2026-09-28 Side quests slice 2, witness directives (91f148e): 7 more dead figures, one
  per category, each ask you to be in the building while they and a named partner are
  both on its floors (Gandhi+Mandela, Mandela+Tubman, Tesla+Curie, Einstein+Newton,
  Socrates+Marcus Aurelius, Franklin+Holiday, Pelé+Ruth). The held directive shows both
  locations and a countdown to the next meeting; REPORT MEETING on either file inside
  that building; /api/quest re-checks the meeting against the sim. Still one vouch per
  category: a category's other directive closes once it has one. check-quests covers
  meeting rates over 14 machine days, the countdown, and the new rules.
- 2026-09-27 Side quests slice 1 (3bd6439): 7 dead figures (one per category) offer a
  "find me" directive; accept on MY FILE > DIRECTIVES, find the figure in the city,
  open its file inside the same building, REPORT CONTACT; /api/quest re-checks contact
  against the sim server-side; vouch stored on the case and listed on MY FILE. Caps: 1
  held, 2/day, 60 s minimum, each figure once, 60 calls/IP/hour, intake required. No
  score effect yet. Check: scripts/check-quests.mjs. `node scripts/run-checks.mjs` runs
  every check.
- 2026-09-26 City v1 (c9175a6), City v2 train/buildings/3D (ee5602d), design + mobile pass (5a7478c), public launch.
