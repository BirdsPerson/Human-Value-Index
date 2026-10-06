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
