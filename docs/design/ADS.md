# ADS AND SPONSORSHIP — design for Scott's decision (2026-10-06)

Status: **the inventory is built (render only); nothing is for sale.** Scott, 2026-10-06: "Can we
improve the advertisements? It's a little too busy in the tennis... keep it simpler, maybe a little
simple Electric Basement one here or there. But keep the ads on the ring around the soccer stadium.
It could be individual people, and users eventually can buy that ad space... if people start
playing, that's what we're selling: VIRTUAL AD SPACE. If people can SPONSOR TEAMS, that would be
really cool."

This doc is what selling would look like. The five open questions at the end need his answer
before anything is sold.

## 0. What is built today

One inventory, `src/ads/inventory.js`, lists every place that can carry an ad. Every surface that
draws one reads from it. `scripts/check-ads.mjs` checks it.

| Surface | Slots | Drawn now | What they carry today |
|---|---|---|---|
| City billboard (the planner's reserved sites) | 10 | yes | 7 house ads (one brand each: EBTV, EB Shop, EBSN, JETSAM!, Goodnight Irene's, Beacon, Brainforest), 3 THIS SPACE AVAILABLE |
| Stadium perimeter (the Estate Pitch's ring) | 15 | yes | the ground's name on the halfway line, Electric Basement and EB Shop either side, 12 AVAILABLE |
| Court-side boards (tennis back wall and side walls, the Courts' apron) | 11 | yes | one small EB mark on each venue, the ground's name at the Courts, the rest plain or AVAILABLE |
| Venue naming rights | 7 | no | the Tennis Club, the Estate Pitch, the Courts, the Bowl, the Lanes, the Links, the Mountain |
| Team (shirt) sponsor | 10 | no | one per district; it covers that district's sides in every sport |
| League title sponsor | 4 | no | baseball, basketball, football, soccer |
| Scoreboard / score bug | 4 | no | tennis, soccer, basketball, football broadcasts |
| Arcade marquee side | 1 | no | |
| Bus / train wrap | 2 | no | the Loop, the Shore Line |
| **Total** | **64** | **36 drawn** | |

The satirical slogans ("APPLAUSE IS MONITORED", "YOUR SEAT IS ASSIGNED", "NO DUNKING ON STAFF")
are gone from the boards. The joke lives in the commentary and the Department's notices. A board
is either a brand, the ground's name, or space for sale. Golf, bowling, the hunt, football, ski
and skate have no ad boards today, so nothing there changed. Bowling's masking unit says only
THE LANES.

## 1. What is for sale

| Product | Unit | Shown where |
|---|---|---|
| **Board** (a perimeter or court-side board, one billboard) | a week | that board, every match or every view |
| **Billboard takeover** (all city billboards, or all of one venue's boards) | a week or a month | everywhere at once; the launch-week product |
| **Team sponsor** (the shirt) | a season (the leagues' season) | the shirt in every match, the team page, the standings row: "CURATED F.C., SPONSORED BY ..." |
| **Venue naming** | a season | the venue's title in the city, the game's title card: "<SPONSOR> PRESENTS THE ESTATE PITCH" (the ground keeps its name) |
| **League title** | a season | the league table's header, the fixture list |
| **Score bug** | a week | a small mark on the broadcast score bug |

"Individual people" is the board product. One board is the smallest thing anyone can buy.

## 2. Who buys: two tracks that never meet

**Recommended: two tracks, and they never touch.**

### Track 1: players, with CYCLES

- Any assessed citizen can buy a board, a billboard week or a team sponsorship **with CYCLES**.
  This is a CYCLES sink: the CYCLES are burned, "RETURNED TO THE COMMONS", as the economy already
  does with surplus.
- The creative comes from the **sign maker** (text and icons, the same tool as storefronts and
  boards). There are **no uploads** until uploads open for everyone. Moderation is the same
  pipeline as boards and storefronts: automatic filters first, then the harm review.
- It is labelled **"CITIZEN AD"** in the hover or tap card. It needs no "SPONSORED" label
  because no money changed hands.
- Price scales with the audience (section 3). The base prices sit on the economy's ladder: a
  week on a quiet board costs about a day's UBI (~1,000 ¢), and a team sponsorship costs about an
  OUTER flat (~9,000 ¢ a season).

### Track 2: real businesses, with real money, through Electric Basement

- This is sold **off-platform** by Scott as an EB service, alongside EB's client work: an order
  form, Scott approves it, then the creative goes live. Nothing in the game takes a card.
- The creative is the advertiser's real mark, pixel-adapted the way Scott's brands were
  (`scripts/brand_atlas.py`), and EB does that work as part of the fee.
- It is labelled **"SPONSORED"** on the board or in its card every time, which is FTC disclosure.
- EB invoices and handles the tax. The game only stores the slot, the dates, the creative and the
  advertiser's name.

### The wall between the tracks

- Real money never buys CYCLES, and CYCLES never become money. This is the house-chips rule in
  ECONOMY_PROPERTY.md.
- A real-money advertiser cannot pay in CYCLES. A player cannot pay EB money for a board.
- A slot holds one booking at a time, from either track, on one calendar.
- **Fairness north star:** a sponsorship never buys game advantage. A sponsored team plays the
  same sim, the same ratings and the same draft. A sponsor's name never enters the score, the
  standings order, a referee call or the matchmaking.

## 3. Pricing logic: priced from measured audience

price = base(surface) x audience(slot) x length

- `audience(slot)` is **measured impressions**, never a guess, once measurement is live:
  - city billboards: views of the map area where the billboard is on screen at a readable zoom;
  - game boards: matches played x the board's on-camera share. `audience.share` in the inventory
    is modelled now. It is replaced by the measured share.
- Until measured numbers exist, the inventory says `measured: null`. Nothing should be sold to a
  real business on a modelled number.
- Prices are reviewed monthly, the same rhythm as the economy's re-indexing.

## 4. Measurement: privacy-safe and aggregated

- An impression is counted on the client when a slot is on screen, at a readable size, for at
  least 1 second. Each slot counts at most once per session per minute.
- The client sends **counts per slot per day** and nothing else: no user id, no IP stored, no
  cookie. This uses the same batching as the existing telemetry, if any lands. **Today there is
  no city-visit or game-play telemetry in the repo** (checked 2026-10-06). That is the first
  thing to build before selling.
- Counts are stored as daily totals per slot in a Netlify Blob. They are never joined to a citizen.

## 5. Reporting to buyers

- A player sees their booking's impressions per day on their ad's card, read from the daily
  totals.
- A real-money advertiser gets a weekly PDF or email from EB, with impressions per slot per day
  and a screenshot of the live creative. EB generates it from the same totals.

## 6. Inventory calendar and approval queue

- The calendar lives on the slot: `{slot, from, to, creative, buyer, track, status}`. Statuses
  are `requested`, `approved`, `live`, `ended` and `killed`. Bookings run Monday to Sunday,
  starting at 00:05 UTC with the economy's daily close.
- **Approval queue: Scott's desk.** Real-money bookings always wait for his yes: **Silence:
  wait**, because they reach a stranger and spend money. Player bookings go through the
  automatic moderation and the harm review. Only a flagged one reaches the desk.

## 7. Content rules (both tracks)

- The audience is **16+**.
- **No:** political or issue ads, gambling or real-money casinos (the in-game casino is the
  Department's and pays nothing real), adult content, alcohol to under-21s (Goodnight Irene's is
  a house ad, shown in the city and never in a game), weapons, crypto or investment offers,
  medical claims, and impersonation (of a real person, brand or the Department).
- Real figures on the index never appear in an ad unless they bought it themselves (verified by
  EB).
- No ad can mimic the game's UI, a notice, a verdict or a score.

## 8. Legal

- Real-money ads carry a **SPONSORED** label (FTC endorsement guides).
- EB invoices, collects sales tax where it applies, and keeps the contract: the dates, the
  slots, the content rules, the kill switch and the refund terms.
- Player ads are not commercial speech for money, but they still follow the content rules. The
  terms of service need one paragraph about them.

## 9. Refunds and the kill switch

- **Kill switch:** each slot, each buyer and all ads globally (one flag). A killed slot shows
  THIS SPACE AVAILABLE at once. `creativeOf` already falls back to AVAILABLE for anything unknown,
  never to a blank.
- Refunds for real money are pro-rata for the unserved days when the house kills an ad without
  the buyer breaking the rules, and nothing when the rules were broken. CYCLES refunds follow the
  same rule and are minted back from the commons.

## 10. City 2.0: new parcels, new inventory

Every new parcel or district in City 2.0 (CITY2.md) adds billboard sites the same way the planner
reserved the first ten. The planner places them, `scripts/check-planner.mjs` holds their
clearance, and the inventory gains a slot. New venues (a ballpark, a rink) arrive with their
perimeter and naming slots in the inventory from day one. Player-owned buildings (ECONOMY_PROPERTY
slice 2) could later rent their rooftop to the ad market. That would be a CYCLES income for the
owner, behind the same moderation.

## 11. Open questions (with recommendations)

1. **Does the CYCLES track open before or after the real-money track?**
   Recommend: **CYCLES first.** It needs no money, no contracts and no invoices. It proves the
   impressions and the moderation, and it is a CYCLES sink the economy needs. Real money comes
   after measurement has run for at least four weeks.
2. **May a player sponsor a team their own citizen plays for?**
   Recommend: **yes, but nobody may sponsor the team they captain, or a team in a match they are
   playing.** The name on the shirt is vanity, not advantage. The rule removes the appearance of
   paying to win.
3. **Who prices real-money slots: a rate card, or Scott case by case?**
   Recommend: **a published rate card** (per board-week, per takeover-week, per team-season) set
   from measured impressions. A case-by-case price on a measured product reads as made up.
4. **House-ad density once paid ads exist: keep the EB marks?**
   Recommend: **keep one EB mark per venue as the floor**, and let paid ads replace the
   AVAILABLE boards and never the floor. At most a quarter of any venue's boards are house ads.
5. **Should political and issue ads stay banned when a real campaign asks?**
   Recommend: **banned, both tracks, no exceptions.** HVI's whole surface is satire about social
   scoring, and a real campaign's ad in that frame reads as an endorsement or as mockery. It is
   the same rule as no gambling.
