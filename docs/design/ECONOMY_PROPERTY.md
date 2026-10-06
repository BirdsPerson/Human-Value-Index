# ECONOMY + PROPERTY — design for review (2026-10-05)

Status: **SLICE 1 BUILT (2026-10-05)**, see "As built: slice 1" at the end. Slices 2-4 are design. **Scott's ladder decisions (2026-10-05)** and the first build of slice 2 (the cutaways) are in "Slice 2: the floor tier and the cutaways" at the end. ROADMAP items 5 (Economy v1), b1c
(THE MALL), b5 (civic machine), e (economy -> unrest). Inspired by Internet City (one shared city, a
plot per player, centre dear and edge free, build and dress your building, the storefront carries
your brand and links, idle harvest, leaderboards, rivals, a market), moved into the Substrate.
Flowchart: https://claude.ai/artifact/1KJUsgePMTk6ZskbJQYMUq (the loop, the ladder, where Prefects / Assembly / uploads plug in).

**Fixed by Scott:** every citizen gets a daily UBI in CYCLES and an ASSIGNED APARTMENT by tier, as today.
Nobody has to do anything; the city runs itself. Anyone can climb: rent better -> buy a unit -> a
building -> a block. NPC moguls buy in the same market. **Wealth never raises the score; conduct does.**
CYCLES are never bought with money and never cashed out (the house-chips rule).

## 1. The loop

`UBI lands in your TRAY` -> `COLLECT on return` -> spend / save / invest / buy -> property and shops
earn into the TRAY (rent, takings, yields) -> the Prefects collect upkeep and permits, inspect, evict
-> property concentration and evictions feed district MOOD and LEGITIMACY -> unrest -> back to the
Assembly, which approves big builds. The economy closes once per real UTC day (00:05, a scheduled
function), reading yesterday's published plans and summaries, so every number is deterministic
from the sim and recomputable.

## 2. Currency and the ladder (prices in CYCLES, ¢)

| Item | Value |
|---|---|
| UBI | **1,000 ¢ per real day** per assessed citizen |
| Assigned apartment | **free**, by tier (the Meridian / brownstones and lofts / the projects), never lost |
| Your citizen's own spending | ~300 ¢/day, automatic, at the shops its schedule visits (the sim's leisure visits; this is what player shops sell to) |
| Net saving if you do nothing else | **~700 ¢/day** |
| Tray cap (uncollected income) | 7 days of each stream; the excess RETURNS TO THE COMMONS (burned in v1) |

Assessed value = BASE x RING x DEMAND (district crowding, mood and vacancy from yesterday's summary,
0.8-1.25), re-assessed weekly. RING is distance to the centre (HQ / the Meridian):

| Ring (districts) | x | Unit (flat) | Building (6 flats + ground-floor shop) | Block (4 buildings + frontage) |
|---|---|---|---|---|
| CORE (Finance, HQ, the Strip) | 6 | 54,000 | 240,000 | 1.32 M + Assembly |
| INNER (Campus, Arts, Archive, Arena) | 2.5 | 22,500 | 100,000 | 550,000 + Assembly |
| RESORT (the Coast, the Heights) | 1.5 | 13,500 | 60,000 | 330,000 + Assembly |
| OUTER (Commons, Works, Sprawl) | 1 | **9,000** | **40,000** | **220,000** + Assembly |
| FRONTIER (unbuilt lots in the growth districts, MASTER_PLAN phase 2) | land free | n/a | build 30,000 + 5% permit | Assembly |

- **Rent** (formula, never owner-set) = value / 60 per day x occupancy. Tenants: players moving up, and
  the sim's own census (a district with crowding fills owned flats with NPC tenants; their rent is
  minted from the sim). **Upkeep** = 0.3% of value per day, collected by the Prefect.
- **Department stock** sells at assessed value; the Department buys back at 85%.
- **Player-to-player sales** go through THE MARKET only, priced within ±20% of assessed value, 5% fee
  burned. The band stops a sale for 1 ¢ to your alt.
- **Re-indexing:** BASE moves monthly with the median balance so the ladder stays ~2 weeks / ~2 months.

## 3. Five citizens, worked

| Who | What happens |
|---|---|
| **Idle** | Never acts; collects weekly: 4,900 ¢. Away 3 weeks: still 4,900 (cap); "RETURNED TO THE COMMONS." Assigned flat, no obligations, score unchanged. |
| **Saver** | 700/day -> day 13 an OUTER flat (9,000), let at ~135/day less 27 upkeep -> ~810/day -> day ~62 an OUTER building (40,000) -> ~1,470/day -> a block ~7 months later, sooner with Assembly luck. |
| **Shop owner** | Day 8: licence 2,000 + fit-out 3,000, leases a TO LET unit on COMMONS PARADE. A café that fits the district nets ~600/day after rent and hands -> a building by ~day 40. Five losing days in seven: CLOSED, the 5,000 is gone, back to saving. |
| **Investor** | 700/day into the industries. Avg ~0.2%/day, can lose. Beats saving by a few % a month; beats it by more by backing what the crowd ignores (SPORT while everyone piles into FINANCE). |
| **NPC mogul** | JOHN D. ROCKEFELLER (dead, on file; speaks pre-written lines only). Treasury seeded 300,000 from record and tier, no UBI. Buys ESTATE PARADE flats the Department cannot let; the Prefect evicts his arrears like anyone's. |

## 4. Investing (deterministic from the sim)

- **Seven district industries:** FINANCE (Finance), LEISURE (the Strip), KNOWLEDGE (Campus + Archive),
  INDUSTRY (the Works), CULTURE (Arts), SPORT (Arena), RESORT (Coast + Heights). Min 100 ¢, 3-day lock.
- Daily yield_i = clamp(0.3% x (I_i - 1) + 0.2%, -1%, +1%) x H_i, where I_i is the district index from
  yesterday's summary (filled worker-hours, mean job satisfaction, shop profit, mood; 1 = city mean).
- **Herding thins returns:** H_i = 1 / (1 + 2 x max(0, 7 s_i - 1)), s_i = the industry's share of all
  invested CYCLES. Fair share earns full yield; double share earns a third. Losses are never thinned.
- **Business stakes:** buy up to 49% of any open shop (player or NPC) at a formula price (30 days of
  its trailing profit). Profit shares pro rata; a closure wipes the stake.
- Not securities, not money: simulated returns on a play currency (section 11).

## 5. Property, shops, NPC moguls

- **Ownership** = a row (unit / building / block) with one owner: a case, an NPC slug, or the
  Department. Transfer only by Department sale, MARKET sale, buy-back, or Prefect seizure.
- **Player shops** use `enterprise.js` unchanged with the player as owner: a trade from the 25, a
  TO LET storefront (players and NPC entrepreneurs compete for the 24) or the ground floor of a
  building you own (a new storefront). Takings x 0.25 per real day (κ, tuned in slice 3 so a
  thriving shop nets ~1-2x UBI). Losing days debit your balance; closed at 5/7 losing days or 0 ¢.
- **NPC moguls** (≤ 12: business/finance record, competence ≥ 70): same prices, upkeep, permits and
  Prefects. Buy only what a player has passed on: listings unsold 24 h, or Department stock in a
  district over 20% vacant. ≤ 1 buy per mogul per day, ≤ 4 citywide, ≤ 20% of a district's units each.
  Living moguls act only ("ACQUIRED. NO STATEMENT ON FILE."); the dead speak pre-written lines.
- **Big builds need the Assembly:** any block, any new build in CORE, anything over 8 storeys. The
  permit files a BUILD proposal through the existing docket (owner approval -> 3-day session ->
  players decide, the substrate advisory); the 5% permit fee is non-refundable.

## 6. Building customization and uploads

- **Pixel parts catalog** (CYCLES sink, 50-2,000 ¢): facade material, awning, fascia frame, roof
  props, window dressing per trade, lighting, 16 colours from the city palette. Always safe.
- **Uploads:** sign 256x64, banner 128x256, billboard 512x256 (the MASTER_PLAN reserved sites only).
  PNG/JPEG/WebP ≤ 200 KB, static. Server re-encodes to PNG, strips metadata, snaps to the city's
  32-colour palette (uploads look like the city). 3 uploads per case per day.
- **Pipeline:** pre-filter (size, dimensions, perceptual-hash blocklist, OCR for URLs / phones / QR
  codes) -> **AI screen: claude-haiku-4-5 vision**, one call, same pattern and fail-closed rule as
  `proposalModeration.js` (refuses: any photo of a real person, yourself included; likeness of living
  people; sexual; hate symbols; violence; private info; third-party brands that aren't yours), about
  $0.002 each, cap `HVI_UPLOAD_MOD_DAILY_CAP` = 100/day under `chargeGlobal` -> **Scott's queue**
  (nothing shows publicly until approved; a `#permits` owner review like the docket's; a stable
  `## Uploads awaiting you` section in MORNING_REPORT, not a Needs-you bullet) -> live.
- **Report button** on every sign: 3 reports from distinct files hide it pending review.
- **Kill switch:** one flag (`econ/flags` blob + env `HVI_UPLOADS=off`) renders every upload as the
  pixel fallback (the name in the city's lettering) instantly; one tap from the owner review.

## 7. Storefront: name and links (the player's funnel)

The fascia shows the player's display handle (screened like a proposal title; never the case number).
Up to 3 https links: no shorteners, redirects followed and the final host checked, Google Safe
Browsing, a host blocklist (adult, gambling, anything selling CYCLES), then Scott's queue as for
uploads; re-checked weekly. Out via the existing `utm()`: `utm_source=humanvalueindex&utm_medium=
storefront&utm_campaign=<unit>`, `rel="nofollow ugc noopener"`, a YOU ARE LEAVING THE SUBSTRATE
interstitial. Clicks counted per storefront per day (as `/api/funnel`), shown to the owner.

## 8. Idle income, leaderboards, rivals

- Every stream (UBI, rent, takings, yields, stakes) posts to the TRAY at the daily close; COLLECT
  moves it to the balance with one Overlord line summarising the absence. 7-day cap per stream.
- **Boards** (weekly, top 25, by handle): THE LEDGER (net worth), LANDHOLDERS, SHOPKEEPERS (takings),
  FOOT TRAFFIC, and CLEAN HANDS (owners with no evictions). Moguls appear on them.
- **Rivals:** one auto-assigned (nearest net worth in your district), up to 3 picked. A rival feed.

## 9. Prefects, legitimacy, unrest

- **Inspections** (the INSPECTIONS directive): upkeep arrears, unpermitted parts, vacancy. **Evictions:**
  a tenant 3 days in arrears returns to their assigned flat (never the street). An owner 7 days behind
  on upkeep: seized, sold by the Department. **Permits:** licence, change of use, customization; the
  PERMITS directive halves fees that day, CURFEW shuts evening trade.
- **Mood factor `prop`** (-12..4): concentration (share of a district's units held by its top 10
  owners, moguls included), evictions in the last 3 days, owner-occupancy. Evictions under a PEOPLE
  council add clash, lowering legitimacy.
- **First unrest event** (ROADMAP e): a REPUDIATED district goes on RENT STRIKE: tenants stop paying,
  the Prefect cannot evict until legitimacy recovers. Anonymous crowds only; no named living person in it.

## 10. The Overlord's lines (cold, never cruel)

- DAILY ALLOWANCE DEPOSITED. EXISTING REMAINS SUFFICIENT.
- YOU WERE AWAY 6 DAYS. THE CITY DID NOT NOTICE. HERE IS YOUR MONEY.
- UNIT 4C ACQUIRED. YOUR HUMAN VALUE IS UNCHANGED. WE WANTED YOU TO HEAR IT FROM US.
- FINANCE IS CROWDED. EVERYONE HAD THE SAME IDEA, WHICH IS HOW YOU KNOW IT WAS NOT ONE.
- TENANCY TERMINATED FOR ARREARS. YOUR ASSIGNED APARTMENT KEPT YOUR SPOT.
- SIGNAGE RECEIVED. A HUMAN WILL LOOK AT IT. THIS IS RARE. ENJOY IT.
- ALL SIGNAGE REVERTED TO DEPARTMENT STANDARD. EXPRESSION RESUMES WHEN EXPRESSION BEHAVES.
- THE LEDGER: RANKED BY CYCLES, NOT BY WORTH. THE DEPARTMENT KEEPS THOSE APART ON PURPOSE.

## 11. Legal guardrails (a new terms section 11, beside the casino's 10)

- CYCLES: no purchase, no cash-out, no exchange with house chips (separate stores), no prizes, may be
  reset. No paid boosts. 16+, like everything else.
- **No gifts or transfers of CYCLES between players. Decided.** A transfer channel turns alts into UBI
  farms and gives CYCLES an outside price (a grey market), which is exactly what keeps the casino and
  the investing on the safe side of "thing of value". Players only meet through formula-priced
  channels: rent (owners can't set it), shop visits (the sim chooses them, players can't), banded
  MARKET sales, formula-priced stakes.
- Uploads and links: you warrant the rights; we may refuse or remove anything; takedowns via the
  dispute form; nothing is published unscreened.

## 12. Data: this is the documented database trigger

Balances are the trigger docs/ASSEMBLY.md and CITY_SPEC named: sustained concurrent human writes, and
transfers touching two accounts at once (tenant -> landlord, buyer -> seller), which per-key Blobs CAS
cannot make atomic. **Recommend Supabase Postgres** (free tier to start), server-only (service key in
Netlify Functions; RLS denies the browser). Tables: `citizens` (case hash, handle, verified email,
device / IP hashes, UBI vesting), `ledger` (double-entry against the Department, unique (kind, ref,
day) so the daily close is idempotent; balance ≥ 0 by constraint), `properties`, `tenancies`,
`holdings`, `stakes`, `businesses`, `parts`, `uploads` (status: pending / ai_ok / approved / rejected
/ killed), `links`, `reports`, `rivals`, `closes`. **Stays on Blobs:** approved sign PNGs (static),
flags. **The sim stays immutable:** the close publishes an `econ` block (owners, fascias, vacancies)
that the next day's plan reads, the way it reads the Assembly's result.

## 13. Anti-abuse

One UBI per assessed case (an interview: the real cost of an alt), and one UBI case per verified
email; 2 per device, 4 new enrolments per IP hash per week; UBI vests from the file's third day.
Landlord / tenant / MARKET counterparts may not share a device or IP hash. Cluster flags (same
device, mirrored trades) go to the owner review. Rate limits on every write, as the casino's.

## 14. Phases

1. **UBI + assigned apartment + investing:** Supabase ledger, daily close, TRAY / COLLECT, the seven
   industries with herding, the file's WALLET, terms section 11.
2. **Property ladder:** units / buildings / blocks, rent, upkeep, the MARKET, Prefect inspections and
   evictions, NPC moguls, Assembly for big builds, the `prop` mood factor.
3. **Player shops + customization + uploads:** enterprise.js owners, parts, the upload and link
   pipeline, Scott's queue, report button, kill switch.
4. **Leaderboards, rivals, idle income across every stream** (caps, absence summaries), rent strike.

## 15. Open questions for Scott (5)

1. **Supabase free project now** ($0; Pro is $25/mo only if it outgrows the free tier)?
   Recommend: yes, it is the trigger the docs already name.
2. **Uploads:** every one waits for you, forever, or players with 5 approved uploads skip the queue
   (the AI screen and report button still apply)? Recommend: all wait for the first 60 days, then decide.
3. **Living figures as moguls** (acting only, no words), or dead figures only? Recommend: both.
4. **Rent strike** as the first unrest event? Recommend: yes.
5. **The numbers:** UBI 1,000, an OUTER flat 9,000, a building 40,000, CORE x6. Recommend: ship
   these and tune from the first month's ledger.

## As built: slice 1 (2026-10-05)

Scott approved slice 1 on 2026-10-05: UBI 1,000 per real day per assessed case, the assigned
apartment by tier, the citizen's ~300/day auto-spend, a 7-day tray, no purchase / cash-out /
transfer, a free Supabase project for the ledger. Moguls, property, shops, uploads and boards wait.

- **The ledger:** Supabase project `hvi-ledger` (ref `tdjdlfrtnmfbzieulrqu`, us-east-1, Free plan,
  in its own free organisation "Human Value Index"). Schema: `supabase/migrations/`. Double entry
  (`econ_txns` + `econ_entries`, append-only by trigger; balances maintained under row locks in
  id order; citizen accounts never below zero), one UBI per case per day (`econ_ubi_claims` primary
  key), positions (`econ_investments`, the value is the `inv:<hash>:<industry>` account), the daily
  `econ_returns` with the summary each was read from. RLS on, no policies, no grants to anon or
  authenticated: Netlify Functions call `econ_*` with the service role (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, production secrets). A txn touching two cases is refused by the
  database itself. Case numbers never reach it: a salted hash (`HVI_IP_SALT`, as the proposals).
- **Code:** `src/economy/rules.js` (numbers, industries, the yield, herding, lines),
  `netlify/lib/economy-db.js` (Supabase or the in-memory twin), `netlify/lib/economy.js`,
  `netlify/functions/economy.js` (`/api/economy`: collect / buy / sell, nothing else),
  `netlify/functions/econ-close.js` (hourly; closes each real day once), `src/economy/` (#economy,
  MY FILE's WALLET and MY APARTMENT, the header's balance chip). Check: `scripts/check-economy.mjs`
  (`HVI_ECON_PG=1` runs it against a real Postgres too).
- **UBI:** no daily close needed: COLLECT posts every waiting day (at most 7, from the file's third
  day) in one txn, each day +1,000 and the citizen's own spending (260-340, fixed by case and day).
  Older days are never minted ("RETURNED TO THE COMMONS"). Enrolment on first COLLECT: 4 new wallets
  per IP hash per week, 2 per device id, 1 per secured email; owner cases exempt.
- **The industry index**, from the last machine day of the real day (60 machine days to a real day):
  I = 0.5 mood + 0.25 foot traffic (the far view's counts) + 0.25 storefront takings, each the
  industry's figure over the seven's mean (an industry with no storefronts is neutral on takings).
  Yield and herding exactly as section 4; credit = trunc(value x ppm / 1e6). No summary: I = 1.
- **Closed state:** with no ledger configured the board and the apartment still read and every
  write answers THE TREASURY IS NOT YET OPEN.
- **Slice 2 needs:** properties / tenancies tables and the Department's stock per ring, rent and
  upkeep in the daily close (multi-case txns: tenant -> landlord, the reason for Postgres), THE
  MARKET with the +-20% band, Prefect inspections and evictions, NPC moguls, the Assembly docket
  for big builds, the `prop` mood factor in the civic fold (the close publishing an `econ` block the
  next plan reads), and lifting the one-case-per-txn rule only for those formula-priced legs.

## Slice 2: the floor tier and the cutaways (Scott, 2026-10-05)

**Decided:**
- **The ladder:** assigned flat -> buy a flat -> **own a whole FLOOR** -> building -> block. The
  floor is the new tier and the flex: your name on the floor plaque and on the lift's panel.
  Penthouse floors cost the most: a floor's price climbs with its height (a premium per storey,
  the PH / top floor dearest), on top of RING x DEMAND. Numbers to be set with the ledger.
- **Rooms:** every room of a flat is its own thing. Owners dress each room (a purpose and pixel
  furniture from a catalog), visitors see it, and the citizen uses the rooms on the city clock.
- **Build first:** SimTower cutaways of every tower, no money or ownership. **Built 2026-10-05**
  (docs/CITY_SPEC.md "Tower cutaways"): every tower's storeys, flats and rooms, with stable ids
  (`<building>:L<level>[:<unit>[:<purpose>]]`), an `owner` slot on every floor and unit (THE
  DEPARTMENT), and rooms as `{purpose, furniture[]}`, so ownership and dressing are data only.

**Next, for the ownership slice:** `properties` rows keyed by those ids (unit = flat, `:L<n>` =
floor, the building id), the floor price (height premium) and the furniture catalog with prices;
the plan reading owners and dressing from the close's `econ` block (the sim stays immutable);
MY APARTMENT's unit (today `G-07`, a hash of 24) switched to the cutaway flat (`residentFlat`)
so the file and the tower name the same door.

## § The Living Market (design and slice 1, 2026-10-05)

**Scott's governing principles (2026-10-05). Every rule below has to satisfy both.**
> "I want it to always be democratic. A fair society that actually has upward mobility, rewards
> savviness as well as hard work — a model for living alongside a superintelligence that
> provides, while keeping the ambition and sense of value humans most fear losing."

> "There should always be some way things can be justified. We don't want to confine behaviour
> so much that, like when you play a game long enough, you feel the machinery. We'd rather see
> things get polarized occasionally and then some deus ex machina presents itself to stabilize
> things."

The first gives three tests, each an assertion in `scripts/check-market.mjs`:

1. **Democratic.** Every knob that decides who can get rich is DATA with a default, applied only
   at a real-day boundary, never mid-day and never backwards, and listed on THE BALLOT below so
   the Assembly can vote on it.
2. **Upward mobility.** A newcomer with only the allowance climbs: no holder may own more than
   3% of any human; the NPC class is held back per human (guardrails, then walls); daily moves
   are bounded; backing the overlooked pays. Checks: a UBI-only saver reaches the first rung
   (an OUTER flat, 9,000) by day 13, and a newcomer who puts every allowance into the market
   still reaches it within 16 days in every seed; with default knobs, 100 citizens of every kind
   and the whole NPC class, the top 1% hold **13.2%** of market wealth after 90 days (bound 25%).
3. **Savvy and hard work both pay.** Labour's month is 4,500 (the slice-3 wage band, 150 a day).
   Skill's month, measured (a citizen who reads the board each morning: recent activity against
   the record, price against fair value), is **0.64x** labour's (0.57, 0.60, 0.76 over three
   seeds; band 0.5x-2x). Doing both beats either alone in every seed; chasing yesterday's risers
   loses to reading the city. Crowded savvy earns less (the herd fills at its own price).

The second shapes the NPCs and the events: behaviour comes from each figure's persona drive
(a game-wide module, `src/city/drives.js`, which the civic layer, jobs, nightlife and leagues will
adopt next; docs/design/DRIVES.md is the game-wide design), concentration is allowed to build past
the guardrails, a stabilizer arrives as an in-world event, and every price move carries a
one-line "because".

### What is traded

- **THE SEVEN INDUSTRIES**, unchanged (section 4: the daily yield, herding), still bought on the
  Treasury page; the market page points there.
- **SHARES IN HUMANS ON FILE.** Every figure the city houses (the 62 bundled and every referred or
  engine figure: 747 listed of 838 today) except the untradable, `src/market/activity.js`
  `untradable()`: the chess park's `barred()` rule (documented harm, SOYLENT GREEN, threat 80+;
  check-market holds them equal on every bundled figure), a harm review pending or decided
  `serious` / `gate`, the faiths' founders (`excluded.js`), and every private citizen (a player is
  never a stock). FLOAT 10,000 whole shares each. A holder of a human who becomes untradable can
  always sell at the last price (nobody is trapped); nobody can buy.
- **THE HUMAN VALUE INDEX**: the equal-weighted mean of every listed human's price, 1,000 at the
  first tick. The ticker on the landing leads with it.
- **Living people** are a number and facts about their citizen's day in the city ("WORKED 9
  WEIGHTED HOURS", "SEEN BY 267 IN PUBLIC", "STRONG FORM FOR THE DISTRICT"). No quotes, no news,
  nothing from outside the Substrate. No living figure is an NPC investor in slice 1. The knob
  `listLiving` (default on, Scott's decision) delists every living person at the next boundary;
  `state.delist` delists one (the dispute route).

### Price formation (pure, deterministic: `src/market/engine.js`)

The market reads only machine days that have ENDED (a price never reveals a published-ahead day),
one at a time, from its own input (below):

1. **Activity** A per human per machine day: WORK 0.30 (worked hours x job satisfaction, more for
   a shop owner, most for a thriving one), CROWD 0.25 (people-hours in the rooms they were out in:
   the occupancy samples), SPORT 0.20 (league rosters by rating x the team's form, the tennis
   ladder, the Pit), PLAY 0.15 (leisure hours, nightlife double), CIVIC 0.10 (a council seat, by
   approval). Each term over the day's mean (0..4), weighted, then the day rescaled to a mean of
   exactly 1. Assembly wins and file visits are reserved terms (weight 0) until each has a
   per-person record. Measured on production days 601-604: a person's day-to-day sd of log
   activity is ~0.22; the cross-section runs 0.45 (p10) to 1.36 (p90).
2. **The record** S = EMA of A (alpha 0.01 per machine day, ~28 real hours half-life) and RECENT =
   EMA of A (0.2). **Fair value** V = 100 x (0.25 + 0.75 S): 25..325, 100 for the average human. A
   new listing opens at its first day's V.
3. **The price is what they did times the mood about them**: P = V e^x. News from the city passes
   straight into P through V; x (the mispricing) moves with order flow (0.5 x net shares / FLOAT),
   boycotts and a noise (sd ~0.3% a machine day, an HMAC of the day and the slug under a server
   secret: replayable by the server, not computable from a published plan), and decays 3% a
   machine day toward 0. A value investor harvests only that decay.
4. **Bands.** One machine day moves a price at most 3% (TICK_BAND); a real day at most 15% from
   its open (DAY_BAND); a human that touches the day band is HALTED until 00:00 UTC (no orders).
   Measured: median daily move 3.2%, p90 9%, about 3% of human-days halt.
5. **No news** (a day built before the market's input existed, or an input missing 3 machine
   days after its day ended): activity unchanged, recorded as such, never invented.

### Orders: a batch auction at the next tick (after the Codex review)

- **BUY** an amount of CYCLES (min 100) or **SELL** whole shares. The order is FILED (a buy's
  CYCLES move from cash into the case's own escrow, `esc:<h>`; a sell's shares are reserved) and
  FILLS AT THE NEXT TICK (within 24 real minutes) at that tick's price: every order in the batch
  and every NPC order joins the flow, the price moves once, and everyone fills after the move at
  the ASK (P + 0.25%) or the BID (P - 0.25%). Whoever moves a price pays for the move; nobody can
  buy at a price they already know the next tick will raise. A position is held 24 hours after
  its last purchase. The batch is JOURNALED (`j/<day>`) before any fill is posted, so a re-run of
  the same tick (a lost state write) reads the same batch, reaches the same prices and posts
  nothing twice (fills are keyed by order).
- The counterparty is always the Department; a txn still touches one case only. There is no
  player-to-player path: nothing to wash, no way to pass CYCLES to an alt.
- **The daily close** (`econ-close`, hourly, once the market has rolled past the day): the
  CONCENTRATION LEVY (0.2% a day of market wealth above 50,000: cash, industries and shares at the
  close; NPCs and players alike; tripled during an emergency session) goes into `dept:commons`;
  the pool (players' levies, NPCs' levies and scandal fines) becomes that day's CITIZENS'
  DIVIDEND, split over the eligible citizens (a wallet a week old that collected in the week),
  paid with the next COLLECT beside the allowance. Concentration flows back to everyone's UBI.

### The NPC investor class (`npc:<slug>`, ids never reused)

- **Who:** 28 dead figures on file, each with its documented persona drive (`drives.js` PERSONA):
  MOGULS 300,000 (Rockefeller, J. P. Morgan, Vanderbilt: acquisitive; Mansa Musa, Kiichiro
  Toyoda: cautious; Ross Perot: populist), the IDLE RICH 120,000 (Rockefeller Jr., Marie
  Antoinette, Charles IV of Spain, Yves Saint Laurent: follow the crowd; Emperor Sakuramachi:
  cautious; Dalí: speculator), DAY TRADERS 40,000 (Newton, Lorenz, Feigenbaum, Kepler, Fischer,
  Heisenberg: speculators; Quesnay, Franklin, Faraday: cautious; Mandelbrot, Sun Tzu, Bohr:
  contrarian; Edison: acquisitive; Nixon: populist; Karl Marx and César Chávez: revolutionary).
  Up to 40, MOGUL_MAX 12. No UBI; they pay the levy (the populist finds the loophole: half). They
  do not work; slice 1 draws them at their desks on the market page's FLOOR.
- **Drives:** acquisitive (corners: two names, leaning on and past the guardrails up to the
  walls), cautious (buys below fair value), speculator (chases what rises), contrarian (buys what
  falls), the crowd (buys what is seen), populist (buys the most-seen, leans on the guardrails,
  half the levy), revolutionary (buys the overlooked and calls BOYCOTTS on the most-cornered
  human: each takes 0.2% a tick off its mispricing). Each sits down on its own cadence (4-12
  machine days), from public state only, and sells only what has fallen well out of favour.
- **Guardrails and walls.** Guardrails (votable): one NPC 3% of a human, the class 20%. Walls:
  one NPC 20%, the class 50%; nothing passes a wall. Past a guardrail for two real days, a
  **DEUS EX MACHINA** (deterministic from the state, varied by a hash of the day and the human):
  ANTITRUST (the Department orders a sale), a SCANDAL (the biggest holder is fined 5% of the
  position, paid into the dividend), or a RUN (the revolutionaries break the corner). Every NPC
  holder sells down to its guardrail, the class to 90% of its own, the biggest stays off for three
  days. Also: MARGIN CALL (the index up 20% in two real days: speculators and the crowd sell half,
  every tick, for a sixth of a day), the AUDIT (a human priced past 1.65x fair value is repriced),
  and the EMERGENCY SESSION (three NPC fortunes past half of all NPC wealth: the levy triples for
  three days and the boycotts triple for one; at most weekly). Checked: in a 120-day run with
  tight guardrails, 40 corners formed and every one was broken within 3 real days, walls never
  passed; at the default knobs over 90 days, 2 events (rare enough to read as story).
- **"Because."** Every listed human carries one line for today's move from its largest cause:
  the city's record (which term), an NPC's orders (`drives.js because()`: "J. P. MORGAN BOUGHT
  120 SHARES BECAUSE IT WANTED ALL OF IT."), the citizens' orders, or an event. No line quotes
  anyone (checked).
- **Plans stay immutable.** The NPCs live in the market state, not the city. Slice 2 gives them an
  INVESTOR job (the Exchange by day, the Members' Club after) from an absolute machine day
  MARKET_SIM_FROM, recorded with the sim and selector versions, chosen after the newest published
  plan + LOOKAHEAD + 1, so every published day rebuilds identically (Codex objection 4).

### The market's input, and immutability

The plan builder, as it splits each NEW day (`publishSplit`), runs `marketTerms` (pure) on the
plan it already holds and writes the result WRITE-ONCE to the market's own store (`hvi-market`,
`in/<day>`, naming the plan version), never into the plan: the day's files, summary, manifest
entry and version are byte-identical with and without it (checked), and a failure there never
stops the city publishing. The input outlives the plan (kept 14 real days, the plans 2 machine
days), so a delayed tick still has real inputs (Codex objection 2). A day split before this
existed has no input and reads as no news.

### The ballot (Assembly-votable; data in the market state, applied at the next 00:00 UTC)

| Knob | Default | What it protects |
|---|---|---|
| POSITION_CAP | 3% of a human per holder | nobody corners a human |
| NPC guardrails (NPC_EACH / NPC_CAP) | 3% / 20% | past them, a stabilizer arrives |
| NPC walls (NPC_EACH_HARD / NPC_HARD) | 20% / 50% | never passed |
| MOGUL_MAX | 12 | how many moguls the city tolerates |
| LEVY_RATE / LEVY_FLOOR | 0.2% a day above 50,000 | concentration flows back |
| DIVIDEND | 100% of the levy to the citizens' dividend | where it flows |
| DAY_BAND / TICK_BAND / HALTS | 15% / 3% / on | bounded moves |
| SPREAD | 0.25% each side | small edges do not pay |
| MIN_HOLD | 24 h | no day trading by citizens |
| LIST_LIVING | on | one switch delists every living person |
| GROUND_RENT | (property slice) | see "Land" below |

Slice 1 stores them, shows them on the page (THE BALLOT) and applies a change at the boundary
(`state.next`); the Assembly ballot that writes them (a KNOB proposal through the docket, the
substrate advisory, the 3-day session) is slice 2.

### Land: ground rent to everyone (Scott, 2026-10-05; property slice, design only)

Players own buildings, FLOORS (the tier between a flat and a building; the penthouse floor
carries a premium) and flats outright, and dress their rooms. The Overlord owns the ground.
Owners pay GROUND RENT on the land component of assessed value only (BASE x RING x DEMAND's land
part, never the improvements) at an Assembly-voted rate, and all of it is paid out as a citizen
dividend on top of UBI, beside the market's levy. What you build or dress is yours and untaxed.
This replaces upkeep-as-a-tax on improvements (section 2) when the property slice is built. The
market never prices land.

### One megacity, gateways (Scott, 2026-10-05)

One Substrate, one economy, one Assembly, growing outward forever on the endless grid (Snow
Crash's Street, not a set of walled apps). New "cities" are boroughs founded inside it by Assembly
vote and trade on the same market. Other worlds (a possible Internet City partnership) connect
through the Port as GATEWAYS with their own economies: no CYCLES flow across a gateway, and no
gateway's people are listed here.

### The Consortium review (Codex, 2026-10-05) and what changed

1. *Bit-for-bit replay under-specified.* Kept JS doubles (one runtime, Node 24) but every loop is
   in sorted order, every stored number rounded (prices 0.01, state 1e-6), the noise key's
   fingerprint is kept in the state, knobs change only at a boundary (`state.next`), and the
   order batch is journaled per tick. Production replays from the journal and the input store;
   the price series is the record. Residual: a Node upgrade could change `Math.exp` in the last
   bit; the series, not a recomputation, is authoritative.
2. *Retention breaks replay.* The input is archived in the market's own store for 14 real days;
   "no news" only after 3 machine days' wait.
3. *No immutable publication protocol for the input.* Write-once `in/<day>`, naming its plan
   version, outside the plan's files.
4. *MARKET_SIM_FROM moves.* Made absolute and recorded (slice 2).
5. *Front-running* (plans 3 days ahead, the sim in the browser, deterministic NPCs): fills moved
   to the next tick's batch at the post-move price, the noise under a server secret, the market
   reads only ended days. Residual: a player who reruns the sim locally can estimate the next
   few days' activity; the record's EMA moves ~1% a machine day toward it, inside the 24-hour
   hold, and the board already shows RECENT against RECORD to everyone. Bounded, and public.
6. *Sybil pumping and dividend farming.* The whole float is a hard cap (players + NPCs <= 10,000
   shares), the position cap is per holder, alts already face slice 1's enrolment caps (IP,
   device, email; one allowance per assessed case), and the dividend goes only to wallets a week
   old that collected in the week. Residual: many assessed alts can each buy 3%; their own flow
   makes them fill dearer and the 24-hour hold outlasts the impact (x decays ~50% in 23 ticks).
7. *The Department as an unbounded mint.* Bounded by the float, the bands and the levy; fills
   after the move remove the impact free lunch (measured: before that fix, the NPC moguls grew
   7x in 30 days on their own price impact; after it, nobody can). A funded reserve is not built:
   CYCLES are minted by design (UBI) and recycled by the levy.
8. *Cost at scale.* The state is ~150 bytes a human (0.1 MB now); the board ~170 KB at 747
   humans. Past ~5,000 humans the board splits (a top-N board plus per-shard lists) and the state
   splits into the figure index's 64 shards. The tick asks the ledger only for the pending batch.
   Supabase Free: one share row per holder per human; revisit at 50,000 rows.
9. *Tautological fairness tests.* Rewritten: the rung test now includes newcomers who invest
   everything; top 1% is over all holders (citizens of ten kinds and every NPC); skill is measured
   against a fixed labour benchmark across three seeds; a deliberately polarized run checks the
   stabilizers. Versioned with the engine (ENGINE_V).
10. *Living people as tradable.* Scott decided to list them; kept, with guardrails: numbers and
   in-city facts only, no living NPC investors, no quotes, one switch (`listLiving`) to delist
   them all and a per-person delist, and the terms text below. **Codex's recommendation stands
   on the record for Scott: launch with the dead only until a legal read.**

### Ledger (migration `20261005230000_market_slice1.sql`)

`econ_shares` (case, human, units, reserved, basis, locked_until), `econ_orders` (filed, filled or
refused once, the tick that filled it), `econ_dividends` (day, pool, eligible, per citizen),
accounts `esc:<h>` and `dept:commons`, txn kinds `oplace` / `ofill` / `levy`. Functions:
`econ_order_place`, `econ_orders_batch`, `econ_orders_fill`, `econ_share_totals`, `econ_rich`,
`econ_levy_close`, `econ_leaders`, and `econ_view` / `econ_purge` extended. RLS on, no grants to
anon / authenticated, service role only, as slice 1. The memory twin is `netlify/lib/market-db.js`.

### Legal (terms section 11, added text)

"THE MARKET lists shares in the city's industries and in the humans on file. Share prices are
computed only from what each person's citizen does inside the Substrate's simulation (work, crowds,
leagues, the council) and from orders placed with the Department; they are not a statement about
any real person, carry no information about them, and are never moved by news or by anything
outside the simulation. The Department is the only counterparty: you cannot buy from, sell to, or
pay another player. Shares are play positions in a play currency, not securities, not an
investment and not advice; they can lose all their value. The Department may halt, cap, levy,
adjust, delist or reset any price or position, and the Assembly may vote on the market's limits.
Some people on file are not listed, by policy, and anyone listed may ask to be delisted through
the dispute form."

### As built: slice 1 (2026-10-05)

- **Code:** `src/market/` (rules, engine, activity, the page, the Finance row), `src/city/drives.js`,
  `netlify/lib/market.js` (tick, board, orders, close), `netlify/lib/market-db.js`,
  `netlify/functions/market.js` (`/api/market`), `market-tick.js` (every 10 minutes),
  `econ-close.js` (levy and dividend), `plans.js` (`putMarket`), `economy.js` (shares on the
  wallet, the dividend in COLLECT). Check: `scripts/check-market.mjs` (+ `scripts/market-sim.mjs`).
- **Pages:** `#market` (one line, one BUY per row, MORE for the rest, THE FLOOR, THE RICHEST
  INVESTORS, THE FLOOR'S RECORD, THE BALLOT), linked from MORE ROOMS, the Treasury, MY FILE's
  wallet and the Finance district (THE EXCHANGE row). The landing's ticker is the market's
  (fetched, a minute's cache; the scores until it answers). The entry bundle stays at 83.7 KB
  gzip: nothing of the market is bundled into the logon.
- **Slice 2:** the Assembly ballot for knobs; NPC INVESTOR jobs in the sim (MARKET_SIM_FROM);
  a SimTower floor in the Reserve Tower cutaway (the hook: `#city/finance/reserve-tower`, the
  board's `floor` list); file-visit and Assembly terms; the board split past ~5,000 humans;
  industries on the same page with their own buy; per-human charts beyond today.

## Decided 2026-10-05, design only (not the market slice)

### Customization: each rung of the ladder unlocks a bigger canvas

- **FLAT:** room purposes and furniture; window light colour.
- **FLOOR:** a nameplate, a balcony, window treatment, the lift's announcement.
- **BUILDING:** facade material, the crown / roof, a wall sign, a blade sign, a rooftop billboard,
  a rooftop terrace (people actually use it on the city clock), awnings, and a construction crane
  with real-time build timers for upgrades.
- **BLOCK:** a plaza, trees, street furniture, a corner billboard.
- **SIGN MAKER** ships with the property ladder: text + neon colour + pixel font + an icon library
  (a word filter only, no uploads). Image uploads (posters, logos) unlock at day 60, with the AI
  screen and Scott's approval (section 6).
- The differentiator from Internet City: signage drives real foot traffic in the sim (the
  leisure pull), which the market's CROWD term prices. A good sign is worth something, visibly.

### THE FURNITURE & OBJECTS SHOP (ships between the market and the property ladder)

- Players buy items with CYCLES to dress their rooms, starting with the free assigned flat (no
  ownership needed to furnish your own flat). Scott's example: "a JETSAM arcade cabinet for my
  room, however many cycles."
- The catalog includes house-brand goods from Scott's own properties as in-world items, priced in
  tiers: a JETSAM cabinet (playable, or links to the JETSAM game), an EBTV set, EB Shop merch, a
  Goodnight Irene's tap, a Sam's Pizza box.
- Items appear in the cutaway room and on the resident's file. Some carry small in-sim effects
  (an arcade cabinet draws visitors; a piano lifts a room's mood), so spending is a choice, not
  only a look.
- A CYCLES sink: purchases burn CYCLES (`dept:shops` -> burned), which helps hold inflation
  against the allowance and the dividend.
- No player-to-player transfer of items, except through THE MARKET's rules if that is ever
  built (formula-priced, the Department as counterparty).

## Selling fish to the restaurants (design only, 2026-10-05; not built)

THE WATERS (`#fish`) lands fish with a species, a weight and a length; THE AQUARIUM takes donations for
plaques. Selling a catch to the city's restaurants for CYCLES is the next step, and it is not built,
because CYCLES may only follow a catch the server has re-played.

- **The sale**: from the tackle box, SELL TO <restaurant> for a price per pound by species, set by the
  restaurant's menu (a seafood place buys striped bass, flounder, sea bass and crab; a diner buys
  catfish and perch; nobody buys a bluegill; nobody may buy the protected sturgeon). Prices move with
  the season (a summer glut of bluefish is cheap) and a daily cap per restaurant (its walk-in holds
  so much). Legends are not for sale: they go to the aquarium or the wall (MOUNTED FISH).
- **Verification first**: the same check the aquarium makes. A sale is `{tripId, n, claim, inputLog}`
  against a server-issued permit (seed and start time from the server; a log no longer than the time
  since the permit); the server re-plays `src/play/fish/sim.js` in node and credits only a catch that
  comes out exactly as claimed and was kept. One sale or one donation per fish (the permit's `donated`
  list becomes `spent`). The credit is a Treasury ledger row like the market's, never a client number.
- **Bounds**: a file sells at most N pounds a machine day; a restaurant buys at most M; permits are
  already 30 an hour. A perfect bot still earns only the day's cap, so the cap is the real control.
- **Open questions**: which restaurants exist as buildings to buy (the nightlife quarters and the mall
  have food places); whether the price is posted or haggled; whether a legend's mount costs CYCLES at
  the furniture shop.
