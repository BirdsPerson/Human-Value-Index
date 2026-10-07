# Basketball engine: the research appendix

Companion to `BASKETBALL.md`. Seven web-grounded passes (Perplexity, 2026-10-06) plus the
code read of `src/play/hoops/` on `origin/main` 8826c41. Every claim the design leans on is
listed here with its source number; a claim the research could **not** confirm is marked
UNVERIFIED and the design treats it as a design choice, not a fact. Sources are numbered
once, at the end, and referenced as [n].

## A. The evolution of NBA 2K's controls

| Era | What changed | What was praised / hated | Sources |
|---|---|---|---|
| 2K1 (Dreamcast, 2000) | Face buttons for shoot/pass; analog or d-pad movement; selectable control schemes | The manual confirms the options; no reliable button-by-button record survives in the sources | [1] |
| 2K5–2K7 | IsoMotion: contextual dribble moves on **LT + left stick** | Expressive, but less reliable than later right-stick systems (retrospective) | [2] |
| 2K8 | Shot Stick: right stick is the primary shooting input (buttons kept) | GamesRadar: sensitive, frustrating for newcomers; a button preferred for long range; stick shooting left fewer easy dribble moves | [3] |
| 2K13 | Control Stick: right stick dribbles; **hold LT** switches it to Shot Stick; Signature Skills | Versatile but daunting ("so many combinations casual players struggle"); praised for intuitive stick dribbling | [4][5][6] |
| 2K14 | Pro Stick (dribble, shoot and more by stick direction + trigger); next-gen Eco-Motion | Livelier reactions; controls similar enough not to relearn | [7][8][9] |
| 2K16 | Shot meter + shot feedback overlay | Easier to diagnose releases (no contemporary consensus in the sources) | — |
| 2K17 | Pro Stick shooting: fill the meter, straight up/down input; aim accuracy matters; layup timing | More control, steeper learning curve; "one more thing to manage" | [10][11] |
| 2K20 | Dribble rework; later used as the reference feel ("2K22 moves back toward 2K20") | — | [12] |
| 2K21 | **Pro Stick shot aiming** (hold and aim the meter) | Backlash strong enough that 2K removed it | [12][13] |
| 2K22 | Timing-based shooting returns; emphasis on shot coverage + timing; new meter; meter-off boost | Addressed the aiming resistance | [12] |
| 2K24 | **ProPLAY** (animations from real NBA footage); Shot Timing Visual Cue: Jump / Set Point / Push / Release; defensive adrenaline (an on-ball bump removes boosts) | — | [14][15] |
| 2K25 | Dribble Engine; **Rhythm Shooting** (RS down then up at the set point); Shot Timing Profiles (Low / Normal / High risk); **Defensive Movement System** (right stick slides laterally to cut off a drive); spacing engine (20+ locations inside the arc) and revised basket-cut logic; redesigned help logic | Developer goals; a 2K26 reviewer calls 2K25's meter hard to time and movement sluggish | [15][16][17] |
| 2K26 | **Green or Miss** on higher difficulties; rhythm shooting kept; tempo of the RS motion changes the release | Praised as skill-based; criticised as unforgiving; forum users split on meter accuracy and lag | [18][19][20] |

UNVERIFIED by the sources (treated as design choices, not facts): the exact 2K18/2K19 stance
and Takeover changes; 2K20's "size-ups on RS up"; 2K23's three adrenaline boosts per possession
(widely reported, but no official report surfaced in the search); 2K26 "Shot Canceling".

**What the history says to a builder.** Three lessons recur across twenty years [3][4][12][18]:
(1) *consistency beats novelty* — the series' worst-received year (2K21 aiming) added an input
dimension, and the most praised changes (2K13/2K14 Pro Stick, 2K22) consolidated one; (2) *timing
is the skill people accept; aiming is the one they reject*; (3) *every new stick job needs a
button fallback* (2K8 kept buttons, 2K26 users report button shooting "more consistent").

## B. 2K's defensive controls (Xbox, 2K24/2K25 manuals)

| Action | Input | Sources |
|---|---|---|
| Move defender | Left stick | [21] |
| Intense defence / defensive stance | Hold **LT** | [21] |
| Sprint | Hold **RT** | [21] |
| Hands up | Hold **RS up** | [21] |
| Contest | Flick **RS** toward the shooter, release | [21] |
| Steal | Tap **X** | [21] |
| Block / rebound | Tap **Y** | [21] |
| Take charge | Hold **B** | [21] |
| Switch to nearest defender | Tap **A** | [21] |
| Icon switch | Tap **RB**, then the defender's button | [21] |
| Call double team | Hold **LB**; tap LB then a button = icon double team | [21] |
| Crowd the dribbler | Hold **LT** + left stick toward the handler | [21] |
| Ball denial | Hold **LT** near the man | [21] |
| Off-ball deny hands | Hold **RS** off ball | [21] |
| Fast defensive shuffle | **LT + RT** + left stick | [21] |
| Cut-off / lateral slide | 2K24: left stick shades the handler while LT held; 2K25: **right stick** slides laterally (Defensive Movement System) | [15][17] |
| Defensive Assist Strength | Controller setting: how much the game steers the defender | [21] |

Coach settings (team or per player): on-ball pressure Smother / Tight / Moderate / Gap; off-ball
Deny / Tight / Sag; pick-and-roll coverage Switch / Hedge / Drop (soft) / Show (hard hedge) / ICE /
Trap / Under / Over; zones 2-3, 3-2, 1-3-1, matchup; full-court press presets; help and double-team
settings [21][22]. Post-patch 2K25 report: switch-on-PnR, off-ball pressure, pre-rotate and
transition settings "generally work"; ICE, hedge depth and the help button are inconsistent; team
and player instructions can override each other [22].

Community complaints (subjective, consistent across years): ice-skating defenders, "suction" into
animations, brick-wall body-ups, steal spam, off-ball defence being tedious [21][22].

## C. 2K's passing and playcalling (2K25 Xbox manual unless noted)

| Action | Input | Sources |
|---|---|---|
| Normal pass | Tap **A**, aim with left stick | [23] |
| Skip pass | **Hold A** | [23] |
| Bounce pass | Tap **B** | [23] |
| Flashy pass | Double-tap **B** | [23] |
| Lob | Tap **Y** | [23] |
| Alley-oop | Double-tap **Y** | [23] |
| Icon pass | **RB**, then the receiver's button | [23] |
| Get-open pass | Hold **B**: receiver cuts to get open; release to pass | [23] |
| Lead-to-basket pass | Hold **Y**: receiver cuts to the rim; release to pass | [23] |
| Give-and-go | Hold **A** to pass and keep control of the passer; release to get it back | [23] |
| Fake pass | **Y + B** | [23] |
| Jump pass | **RB + LB** | [23] |
| Touch pass | Pass input before the catch settles | [23] |
| Pick controls | Hold **LB**: roll vs fade, screen side | [23] |
| Playcalling | **D-pad left**: up to 16 favourite actions (plays, isolations, give-and-gos) | [24] |

**Pass target profile.** The receiver is chosen by weighting **Direction** (where the stick
points), **Distance** (nearer teammates) and **Openness** (less guarded). Defaults quoted: 55/40/5
(one version) and a community 2K20 setup of 60/30/10 [25][26]. Pass outcomes depend on receiver
choice, defender position, pass type and attributes; directional steals contest passing lanes
[21][25]. 2K25's spacing engine gives the AI spacing targets and reworked basket-cut logic to
stop untimely cuts clogging driving lanes [15].

UNVERIFIED: exact tempo / crash-the-boards / get-back coach labels per edition; whether 2K's
made-basket inbound is automatic or user-run, its 5-second count, and how 2K enforces 8-second,
3-second and closely-guarded violations (the sources did not settle it; the design makes these
explicit choices and keeps them switchable).

## D. Camera-relative input

- 2K reads the left stick in the **active camera's screen directions**, not fixed court axes.
  In side-on views (2K, Broadcast, Side) the court keeps one orientation so up-stick is one
  sideline all game; in end-on or swivelling views the same stick direction maps to a different
  court direction as the camera turns [27][28].
- **Auto Flip** decides whether the camera flips on a change of possession; **Flip Style** (Spin /
  Cut) is how the transition looks. Both are camera behaviour, not control assists [27].
- Right-stick dribble moves are **not** plain "move toward the rim" commands: directions select
  move categories (escape dribbles left/right, size-ups up, shot down), and 2K's manual phrases
  stepback as "RS away from hoop" — rim-relative in screen terms [29][30].
- Guides steer defenders away from Broadcast/Side (weaker down-court visibility and rotation)
  toward end-to-end views [27][28].
- Other sports games: EA FC/FIFA interpret the stick against the view (the Pro camera follows one
  player); Rocket League's Ball Cam changes the view, not the steering axes [31].

## E. What makes basketball basketball (NBA rulebook unless marked)

| Rule | Detail | Sources |
|---|---|---|
| Throw-in after a made basket | Scored-on team inbounds from behind its own end line; the thrower **may run the end line** and may pass to a teammate behind it; **5 seconds** from when the ball is at his disposal | [32] |
| Throw-in after OOB / violation | Nearest boundary spot; **no running**; 5 seconds | [32] |
| Throw-in after a foul | Spot by rule (frontcourt/backcourt and end-line exceptions); shooting fouls and bonus fouls shoot instead | [32][36] |
| 8-second rule | Team control in the backcourt must get the ball into the frontcourt within 8 s | [33] |
| Frontcourt status / over-and-back | Ball + both feet of the dribbler wholly in the frontcourt (or a pass/loose ball touching it); a team in frontcourt control may not be first to touch it back in the backcourt; **no violation if the defence tipped it** | [33][34] |
| Shot clock | 24 s on possession; **14 s after an offensive rebound off the rim**; defensive foul with a frontcourt throw-in: max(remaining, 14); backcourt throw-in: 24; OOB off the defence keeps the unexpired time | [33] |
| 3 seconds | Offensive: no more than 3 consecutive seconds in the lane with team control in the frontcourt (suspended while a shot is in the air); NBA defensive 3 seconds = technical FT + possession (FIBA has no defensive rule) | [36][37] |
| Closely guarded | NBA: only the 5-second back-to-the-basket rule below the FT line extended; FIBA: 5 s when held with a defender within 1 m; NCAA men: 5 s within 6 ft | [34][36][38] |
| Timeouts | 7 per team in regulation, max 4 in Q4, 2 after the later of the 3:00 mark / second mandatory; 2 per OT; in the last 2:00 a timeout can **advance the ball to the frontcourt** | [35] |
| Fouls | Shooting foul: made basket + 1 FT, else 2 or 3; team penalty from the **5th team foul per quarter** and from the **2nd in the last 2:00**; **6 fouls out**; offensive fouls count personally but **not** toward the team penalty | [36] |
| Jump ball | NBA jumps; FIBA alternates possession after the opening jump | [34][36] |

## F. Team play (coaching sources)

- **Roles over positions.** Useful AI tags: primary/secondary handler, wing, screener, roller,
  spacer, rim runner, post, rebounder, rim protector; one player may hold several [39][40].
- **Who brings it up.** After a defensive rebound the rebounder (often a big) secures and
  **outlets to a guard or wing**; the big runs the floor or rim-runs. Grab-and-go is a
  player-specific read (a big with handle and vision), never the default [41][42].
- **Inbounder trails** the play after the throw-in; transition shape: ball up the middle or a
  slot, wings wide, big to the rim, trailer behind [42][43].
- **Possession flow.** Secure → outlet → push or organise → early offence while the defence is
  unset → half-court alignment (five-out, four-out-one-in, Horns) → first action (pick-and-roll,
  hand-off, pin-down, post entry, isolation) → reads (mismatch, roller, open shooter, move it) →
  second side (swing/skip) → shot → crash/get-back plan decided before the shot [40][42][44].
- **Man defence.** Ball-you-man; deny one pass away; help side two passes away; "on the line, up
  the line"; help the helper; controlled closeouts; box out. The **pick-up point** in a normal
  half-court defence is around the three-point line; picking up at half court is more aggressive;
  **full-court pressure is a deliberate, situational choice, not the default** [44][45][46].
- **PnR coverages.** Drop, hedge/show, switch, ICE/down/blue, blitz/trap, under/over, chosen by
  handler, screener, shooters, spacing and situation [44].
- **Zones.** 2-3, 3-2, 1-3-1, matchup [44].
- **When teams press.** After made baskets, trailing late, to change rhythm (diamond 1-2-1-1 is
  one shape); it exposes the defence when broken [45][46].
- **Transition defence.** Stop the ball, protect the rim ("build a wall"), then match up [46].
- **Passing fundamentals.** Chest, bounce (not into a tall man's reach), overhead, one-hand push,
  **lead the cutter**, entry, skip, outlet, drive-and-kick, the extra pass. Interceptions come from
  telegraphing, lazy cross-court passes through help, passing into a crowded lane, passing late,
  lobs into traffic [41][45][47].
- **Basketball IQ.** Reading the help defender, spacing, timing cuts to the ball, preserving an
  advantage with the simple pass instead of over-dribbling, shot selection, time and score; a
  practical AI loop is observe → identify the advantage/threat → act → reassess [48].

## G. What the code does today (read of `src/play/hoops/`, origin/main 8826c41)

The gap analysis in `BASKETBALL.md` section 3 cites lines; the key reads are:
`sim.js` 178-179 (best player inbounds), 239 (150-frame transition window), 244 (control jumps to
the holder), 277-297 (`resetSpots`: inbound spot 3.1 m inside the court, defenders matched up at
mid-court), 554 (`sideSpot` 0.3 m inside the sideline), 562-572 (`passTarget`: direction and
distance only), 747-757 (`markSpot`: 1.0 / 1.6 m goal-side anywhere on the floor), 759-776
(`helpStep`), 880-942 (`carrier`), 960-986 (`resolveGesture`: court-axis right stick), 1001-1084
(`humanThink`), 1038-1042 (icons re-lettered per holder), 1140-1148 (`inBounds`, `turnover`),
1149-1167 (`scored`), 1434 / 1446 / 1456 (boundary clamps and the human's instant OOB), 1477-1489
(the "inbound" puts a live ball in hand); `input.js` 30-45 (world-axis stick); `Hoops.jsx` 518-531
(the mask goes straight to `step`), 547-553 (camera eased in render only); `render.js` 26-83
(camera presets); `scripts/check-hoops.mjs` 234-243 (a check asserting the inbounder stands on
the floor).

## Sources

1. NBA 2K1 Dreamcast manual — https://www.digitpress.com/library/manuals/dreamcast/nba_2k1.pdf
2. NLSC, NBA 2K8 retrospective (IsoMotion vs the right stick) — https://www.nba-live.com/ww-nba-2k8-retrospective-xbox-360-playstation-3/
3. GamesRadar, NBA 2K8 review — https://www.gamesradar.com/nba-2k8-review/2/
4. GamesRadar, NBA 2K13 review — https://www.gamesradar.com/nba-2k13-review/
5. NLSC, NBA 2K13 retrospective — https://www.nba-live.com/ww-nba-2k13-retrospective/
6. Zombiegamer, NBA 2K13 review — https://zombiegamer.co.za/nba-2k13-zombiegamer-review-my-sports-game-of-the-year
7. NLSC Wiki, NBA 2K14 features list — https://www.nba-live.com/nbalivewiki/index.php?title=NBA_2K14_Features_List
8. GeeksHaveGame, NBA 2K14 next-gen review — https://geekshavegame.com/nba-2k14-review-the-king-of-sports-video-games/
9. Gameranx, NBA 2K14 next-gen — https://gameranx.com/features/id/18788/article/nba-2k14-one-of-next-gen-s-must-haves/
10. Operation Sports, NBA 2K17 gameplay blog with Mike Wang — https://www.operationsports.com/nba-2k17-gameplay-blog-with-mike-wang/
11. NLSC, "The importance of consistent controls" — https://www.nba-live.com/mto-importance-consistent-controls/
12. r/NBA2k, 2K22 gameplay tidbits from Mike Wang (aiming removed) — https://www.reddit.com/r/NBA2k/comments/p8ng8g/2k22_gameplay_tidbits_from_mike_wang_full_blog/
13. Newsweek, NBA 2K21 patch 1.02 shooting fix — https://www.newsweek.com/nba-2k21-update-1-02-fix-shooting-patch-1-notes-1531797
14. NBA 2K24 Courtside Report, gameplay (ProPLAY, visual cues) — https://nba.2k.com/en-GB/2k24/courtside-report/gameplay/
15. NBA 2K25 Courtside Report, gameplay (Dribble Engine, Rhythm Shooting, Defensive Movement System, spacing engine) — https://nba.2k.com/2k25/courtside-report/gameplay/
16. NBA 2K25 gameplay overview — https://nba.2k.com/2k25/the-game/gameplay/
17. VICE, NBA 2K26 review — https://www.vice.com/en/article/nba-2k26-is-a-great-game-when-it-focuses-on-the-basketball-review/
18. NBA 2K26 Courtside Report, gameplay (Green or Miss) — https://nba.2k.com/2k26/courtside-report/gameplay/
19. New Game Network, NBA 2K26 review — https://www.newgamenetwork.com/article/2917/nba-2k26-review-shooting-movement-and-missed-potential/
20. Operation Sports forum, NBA 2K26 impressions — https://forums.operationsports.com/forums/forum/basketball/nba-2k-basketball/26863447-nba-2k26-impressions-thread/page20
21. NBA 2K25 Xbox online manual — https://cdn.2k.com/nba/nba-2k25/manuals/xb1/2KSWIN_NBA2K25_XB1_Online_manual_ENG.pdf
22. Operation Sports, NBA 2K25 defensive settings post-patch — https://www.operationsports.com/nba-2k25-defensive-settings-mostly-working-right-post-patch/
23. NBA 2K25 Xbox online manual (dual-language edition, passing table) — https://cdn.2k.com/nba/nba-2k25/manuals/xb1/NBA_2K25_Online_Manual_(Dual_Language)_XB1_(For_Taiwan).pdf
24. NBA 2K24 Courtside Report (D-pad playcalling) — https://nba.2k.com/en-GB/2k24/courtside-report/gameplay/
25. Operation Sports, "Pass Target Profile" — https://forums.operationsports.com/forums/forum/basketball/nba-2k-basketball/814065-pass-target-profile
26. Operation Sports, "My 2K20 sliders" (Direction 60 / Distance 30 / Openness 10) — https://forums.operationsports.com/forums/forum/basketball/nba-2k-basketball/nba-2k-basketball-sliders/892229-my-2k20-sliders
27. NBA2KW, best camera angles guide (Auto Flip, Flip Style, defence advice) — https://nba2kw.com/nba-2k23-guide-best-camera-angle-pros-cons-change-mycareer-sesttings-more
28. SegmentNext, NBA 2K23 camera angles — https://segmentnext.com/nba-2k23-camera-angles/
29. Steam community, NBA 2K21 Pro Stick controls thread — https://steamcommunity.com/app/1225330/discussions/0/5188663423644737744/
30. Operation Sports, NBA 2K21 next-gen gameplay blog part 1 (Pro Stick) — https://www.operationsports.com/nba-2k21-next-gen-gameplay-blog-part-1-of-3-pro-stick-shooting-pro-stick-dribbling-passing-more/
31. RLCD, Rocket League camera settings (Ball Cam) — https://www.rlcd.gg/blog/rocket-league-pro-camera-settings/
32. NBA Official Rulebook, Rule 8: Out-of-Bounds and Throw-In — https://official.nba.com/rule-no-8-out-of-bounds-and-throw-in/
33. NBA Official Rulebook, Rule 7: 24-Second Clock (incl. 8 seconds) — https://official.nba.com/rule-no-7-24-second-clock/
34. FIBA Official Basketball Rules 2024 — https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf
35. NBA Official Rulebook, Rule 5: Scoring and Timing (timeouts) — https://official.nba.com/rule-no-5-scoring-and-timing/
36. NBA Official Rulebook, Rule 12: Fouls and Penalties — https://official.nba.com/rule-no-12-fouls-and-penalties/
37. FIBA, official interpretations 2024 — https://refereeing.fiba.basketball/en/news/new-official-interpretations-take-effect-on-july-25-2024
38. NCAA Men's Basketball Case Book — https://ncaaorg.s3.amazonaws.com/championships/sports/basketball/rules/men/PRMBB_CaseBook.pdf
39. Basketball for Coaches, the five positions — https://www.basketballforcoaches.com/basketball-positions/
40. Coach's Clipboard, basketball terminology — https://www.coachesclipboard.net/BasketballTerminology.html
41. Coach's Clipboard, transition offense and the Carolina break (outlet) — https://www.coachesclipboard.net/TransitionOffense.html
42. Coach's Clipboard, transition offense drills — https://www.coachesclipboard.net/TransitionOffenseDrills.html
43. Online Basketball Playbook, transition plays — https://onlinebasketballplaybook.com/transition-offense-basketball-plays-for-quick-scores/
44. Coach's Clipboard, playbook (sets, coverages, zones) — https://www.coachesclipboard.net/Playbook.html
45. Breakthrough Basketball, "How to break any type of press" — https://www.breakthroughbasketball.com/offense/HowToBreakAnyPress.pdf
46. Coach's Clipboard, transition defense — https://www.coachesclipboard.net/TransitionDefense.html
47. The Bench View, basketball glossary — https://thebenchviewbasketball.com/en/basketball-glossary/
48. Underdog Hoops, "Teaching players to think the game" — https://underdoghoops.com/teaching-players-to-think-the-game/
