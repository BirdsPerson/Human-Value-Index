// THE NIGHTLIFE QUARTERS as city data (Scott 2026-09-30: "nightclubs in a downtown district, more
// than one; the one near FINANCE higher end, plus higher-end restaurants; the one in the
// LOWER-INCOME district more clubs, dance clubs, other kinds of clubs, liquor stores"). Pure data
// and pure functions, no imports: sim.js spreads these into its own lists like venueSim.js and
// storefrontSim.js, so the venues are laid out, staffed and visited like any other place.
// docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS"; the placement: docs/planning/MASTER_PLAN.md.
//
//   UPTOWN    the CBD row's east end, past Finance and the Strip, down the ring's east side
//             (x 113-125, y -1-27): marble and
//             glass. AURUM (the nightclub: the velvet rope, a door that reads your tier, the VIP
//             mezzanine and its bottle service, the DJ booth), THE CEILING (a rooftop lounge on a
//             glass tower), THE BITTERS (cocktails), THE CUT (a steakhouse), HINOKI (an omakase
//             counter), THE MINOR KEY (a jazz supper club). Its patrons skew to the top tiers.
//   DOWNTOWN  below it towards the Sprawl, the projects' side of the city (x 113-136, y 28.5-46): brick, murals,
//             roll-down gates. VOLTAGE and STROBE (dance clubs), THE CYPHER (hip-hop), BASEMENT 0x00
//             (punk, down the stairs), KARAOKE BOX, EIGHT BALL (a pool hall), THE HECKLE (comedy),
//             THE COOP (fried chicken and the halal cart, 24 hours), LIQUOR 24 and CUT-RATE SPIRITS.
//             Later, cheaper, louder, busier. Its patrons skew to the lower and middle tiers.
//
// No adult venues: the site is 16+. Nothing here is a strip club or anything like one, and
// scripts/check-nightlife.mjs holds the list of venue types to that.

export const UPTOWN_RECT = { x: 113, y: -1, w: 12, h: 28 };
export const DOWNTOWN_RECT = { x: 113, y: 28.5, w: 23, h: 17.5 };
// [id, name, addr, rect, blurb]: appended to sim.js DISTRICTS after everything else (a sector is
// a district, in order), expansion districts off the Loop (the Strip's and the Archive's stations
// are within reach on foot; the Engine Shuttle and the East Line will stop here: MASTER_PLAN.md).
export const NIGHT_DISTRICTS = [
  ["uptown", "UPTOWN", "0xE100", UPTOWN_RECT, "Marble, glass and a velvet rope. The door reads your tier before it reads your face.", ["strip", "archive"]],
  ["downtown", "DOWNTOWN", "0xE200", DOWNTOWN_RECT, "Brick, bass and roll-down gates. Open late, cheap, loud. The Department hears all of it.", ["archive", "sprawl"]],
];

// Lots (map cells), laid out by hand. Both quarters stand east of the Loop's ring, every door within
// a short walk of a Loop station (the Strip's, the Archive's: sim.js ACCESS_R, 32 cells; the
// Archive is the planned East Line's interchange). Uptown runs north to south along the ring from
// the CBD row's east end: two columns, AURUM across both with its forecourt (the rope) in front.
// Downtown below it, towards the Sprawl: three rows, the two dance clubs double-width.
const UW = 113.5, UE = 119.2, UC = 5.3;
const DX = [113.5, 119.2, 124.9, 130.6], DY = [29, 35.2, 41.4], DH = 4.2;
// streets two cells wide between the rows, so every front is seen over the roofs of the row in front
export const NIGHT_LOTS = {
  "the-ceiling": { x: UW, y: -0.5, w: UC, h: 4.4 },
  "the-bitters": { x: UE, y: -0.5, w: UC, h: 4.4 },
  aurum: { x: UW, y: 5.9, w: 11, h: 6.2 },
  "the-cut": { x: UW, y: 14.2, w: UC, h: 4.4 },
  hinoki: { x: UE, y: 14.2, w: UC, h: 4.4 },
  "minor-key": { x: UW, y: 20.8, w: 11, h: 5.4 },
  voltage: { x: DX[0], y: DY[0], w: 11, h: DH },
  "the-cypher": { x: DX[2], y: DY[0], w: UC, h: DH },
  "liquor-24": { x: DX[3], y: DY[0], w: UC, h: DH },
  strobe: { x: DX[0], y: DY[1], w: 11, h: DH },
  "the-heckle": { x: DX[2], y: DY[1], w: UC, h: DH },
  "eight-ball": { x: DX[3], y: DY[1], w: UC, h: DH },
  basement: { x: DX[0], y: DY[2], w: UC, h: DH },
  "karaoke-box": { x: DX[1], y: DY[2], w: UC, h: DH },
  "the-coop": { x: DX[2], y: DY[2], w: UC, h: DH },
  "cut-rate": { x: DX[3], y: DY[2], w: UC, h: DH },
};

// What each venue is. scripts/check-nightlife.mjs holds every type to this list and refuses any
// adult venue type (the site is 16+).
export const VENUE_TYPES = ["nightclub", "rooftop-lounge", "cocktail-bar", "steakhouse", "sushi-counter", "jazz-supper-club",
  "dance-club", "hip-hop-club", "punk-basement", "karaoke", "pool-hall", "comedy-club", "late-night-food", "liquor-store"];
export const FORBIDDEN_TYPES = /strip|gentlemen|exotic|adult|burlesque|peep|cabaret.*(adult|nude)|nude|topless|lap.?danc|brothel|escort|sex/i;

// [id, district, kind, cap, name, engine tendencies, type]
export const NIGHT_PLACES = [
  ["aurum", "uptown", "mixed", 30, "AURUM (THE FLOOR, TIER CHECKED)", ["nightclub", "night club"], "nightclub"],
  ["aurum-vip", "uptown", "mixed", 10, "AURUM MEZZANINE (BOTTLE SERVICE, VIP)", ["vip lounge"], "nightclub"],
  ["ceiling", "uptown", "mixed", 16, "THE CEILING (ROOFTOP LOUNGE, ALTITUDE BILLED)", ["rooftop bar", "rooftop lounge"], "rooftop-lounge"],
  ["bitters", "uptown", "mixed", 14, "THE BITTERS (COCKTAILS, AUDITED)", ["cocktail bar"], "cocktail-bar"],
  ["the-cut", "uptown", "mixed", 18, "THE CUT (STEAKHOUSE, MARKET PRICE)", ["steakhouse"], "steakhouse"],
  ["hinoki", "uptown", "mixed", 10, "HINOKI (OMAKASE, CHEF'S CHOICE IS FINAL)", ["sushi bar", "sushi restaurant"], "sushi-counter"],
  ["minor-key", "uptown", "mixed", 22, "THE MINOR KEY (JAZZ SUPPER CLUB)", ["jazz club", "supper club"], "jazz-supper-club"],
  ["voltage", "downtown", "mixed", 30, "VOLTAGE (DANCE CLUB, NO DRESS CODE)", ["dance club", "disco"], "dance-club"],
  ["strobe", "downtown", "mixed", 28, "STROBE (DANCE CLUB, FLASHING LOGGED)", ["rave"], "dance-club"],
  ["cypher", "downtown", "mixed", 24, "THE CYPHER (HIP-HOP, BARS COUNTED)", ["hip hop club"], "hip-hop-club"],
  ["basement", "downtown", "mixed", 18, "BASEMENT 0x00 (PUNK, ALL AGES 16+)", ["punk venue", "music venue"], "punk-basement"],
  ["karaoke-box", "downtown", "mixed", 14, "KARAOKE BOX (PITCH CORRECTION DENIED)", ["karaoke bar"], "karaoke"],
  ["eight-ball", "downtown", "mixed", 14, "EIGHT BALL (POOL HALL, CALL YOUR POCKET)", ["pool hall", "billiards"], "pool-hall"],
  ["the-heckle", "downtown", "mixed", 20, "THE HECKLE (COMEDY, LAUGHTER METERED)", ["comedy club"], "comedy-club"],
  ["the-coop", "downtown", "mixed", 12, "THE COOP (CHICKEN AND HALAL, 24 HOURS)", ["fried chicken", "halal cart", "late-night food"], "late-night-food"],
  ["liquor-24", "downtown", "mixed", 6, "LIQUOR 24 (ID CHECKED, TIER NOTED)", ["liquor store"], "liquor-store"],
  ["cut-rate", "downtown", "mixed", 6, "CUT-RATE SPIRITS (BULK, BAGGED)", ["off licence", "bottle shop"], "liquor-store"],
];
export const NIGHT_TYPE = Object.fromEntries(NIGHT_PLACES.map(p => [p[0], p[6]]));
export const NIGHT_PLACE_IDS = NIGHT_PLACES.map(p => p[0]);
export const NIGHT_SET = new Set(NIGHT_PLACE_IDS);
export const UPTOWN_VENUES = NIGHT_PLACES.filter(p => p[1] === "uptown").map(p => p[0]);
export const DOWNTOWN_VENUES = NIGHT_PLACES.filter(p => p[1] === "downtown").map(p => p[0]);

// [id, name, district, floors top-down: [code, floor name, [places]], lot]
export const NIGHT_BUILDINGS = [
  ["aurum", "AURUM", "uptown", [["1F", "THE MEZZANINE (BOTTLE SERVICE)", ["aurum-vip"]], ["G", "THE FLOOR (DJ BOOTH)", ["aurum"]]]],
  ["the-ceiling", "THE CEILING", "uptown", [["RF", "THE ROOF (LOUNGE)", ["ceiling"]], ["G", "THE LIFT LOBBY (GUEST LIST)", ["ceiling"]]]],
  ["the-bitters", "THE BITTERS", "uptown", [["G", "THE BAR (STIRRED, NEVER SHAKEN WITHOUT A PERMIT)", ["bitters"]]]],
  ["the-cut", "THE CUT", "uptown", [["G", "THE DINING ROOM (LEATHER, LOGGED)", ["the-cut"]]]],
  ["hinoki", "HINOKI", "uptown", [["G", "THE COUNTER (EIGHT SEATS, TEN CHAIRS)", ["hinoki"]]]],
  ["minor-key", "THE MINOR KEY", "uptown", [["G", "THE SUPPER ROOM AND THE BANDSTAND", ["minor-key"]]]],
  ["voltage", "VOLTAGE", "downtown", [["G", "THE DANCE FLOOR", ["voltage"]]]],
  ["the-cypher", "THE CYPHER", "downtown", [["G", "THE FLOOR AND THE BOOTH", ["cypher"]]]],
  ["liquor-24", "LIQUOR 24", "downtown", [["G", "THE COUNTER (BEHIND GLASS)", ["liquor-24"]]]],
  ["strobe", "STROBE", "downtown", [["G", "THE DANCE FLOOR (LIGHTS ON A TIMER)", ["strobe"]]]],
  ["the-heckle", "THE HECKLE", "downtown", [["G", "THE ROOM (TWO-DRINK MINIMUM, ENFORCED)", ["the-heckle"]]]],
  ["eight-ball", "EIGHT BALL", "downtown", [["G", "THE TABLES (CHALK RATIONED)", ["eight-ball"]]]],
  ["basement", "BASEMENT 0x00", "downtown", [["G", "THE STAIRS (MIND THE HEAD)", ["basement"]], ["B1", "THE BASEMENT (THE PIT, THE STAGE)", ["basement"]]]],
  ["karaoke-box", "KARAOKE BOX", "downtown", [["G", "THE ROOMS (ONE MIC EACH)", ["karaoke-box"]]]],
  ["the-coop", "THE COOP", "downtown", [["G", "THE COUNTER AND THE CART", ["the-coop"]]]],
  ["cut-rate", "CUT-RATE SPIRITS", "downtown", [["G", "THE AISLES (BAGGED)", ["cut-rate"]]]],
].map(b => [...b, NIGHT_LOTS[b[0]]]);
export const NIGHT_ARCH = {
  aurum: "nightclub", "the-ceiling": "rooftower", "the-bitters": "cocktail", "the-cut": "steakhouse", hinoki: "omakase", "minor-key": "supperclub",
  voltage: "danceclub", strobe: "danceclub", "the-cypher": "hiphop", basement: "punk", "karaoke-box": "karaoke", "eight-ball": "poolhall",
  "the-heckle": "comedy", "the-coop": "chicken", "liquor-24": "liquor", "cut-rate": "liquor",
};

// ---- opening hours -----------------------------------------------------------------------------
// [open, close] in machine hours; close past 24 runs into the next morning. The clubs 22:00 to 03:00
// uptown (the rope closes early: scarcity is the product), 04:00 downtown (later, louder).
export const HOURS = {
  aurum: [22, 27], "aurum-vip": [22, 27], ceiling: [17, 25], bitters: [17, 26], "the-cut": [17.5, 23.5], hinoki: [18, 23], "minor-key": [19, 25],
  voltage: [22, 28], strobe: [22, 28], cypher: [22, 28], basement: [21, 28], "karaoke-box": [20, 27], "eight-ball": [16, 27], "the-heckle": [20, 25.5],
  "the-coop": [0, 24], "liquor-24": [10, 26], "cut-rate": [9, 26],
};
// Is the place open at machine hour h (any hour, wrapped)? Places without hours are always open.
export function openAt(placeId, h) {
  const o = HOURS[placeId];
  if (!o) return true;
  if (o[1] - o[0] >= 24) return true;
  const x = ((h % 24) + 24) % 24;
  return (x >= o[0] && x < o[1]) || (x + 24 >= o[0] && x + 24 < o[1]);
}
// Open for the whole stay [from, to) (machine hours; to may run past 24)?
export function openThrough(placeId, from, to) {
  const o = HOURS[placeId];
  if (!o || o[1] - o[0] >= 24) return true;
  const x = ((from % 24) + 24) % 24, d = to - from;
  return (x >= o[0] && x + d <= o[1] + 1e-9) || (x + 24 >= o[0] && x + 24 + d <= o[1] + 1e-9);
}
// When the place closes for a stay starting at `from` (machine hours on the same clock as from).
export function closeFor(placeId, from) {
  const o = HOURS[placeId];
  if (!o || o[1] - o[0] >= 24) return Infinity;
  const x = ((from % 24) + 24) % 24, base = from - x;
  return x >= o[0] && x < o[1] ? base + o[1] : x + 24 < o[1] ? base - 24 + o[1] : base + o[1];
}
const fmt = (h) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.round((x % 1) * 60)).padStart(2, "0")}`; };
export const hoursLine = (placeId) => { const o = HOURS[placeId]; return !o ? "" : o[1] - o[0] >= 24 ? "OPEN 24 HOURS" : `OPEN ${fmt(o[0])}-${fmt(o[1])}`; };

// ---- the staff -----------------------------------------------------------------------------------
// [id, title, place, ladder, fields, dims, extra]. Club staff on the night shift (21:30 on), the
// restaurants' on the evening; draft caps keep each a few. The performers are not staff: they are
// booked by the night (LINEUP, below) and work their set.
export const NIGHT_JOBS = [
  ["door-supervisor", "Door Supervisor (Aurum)", "aurum", ["Rope Holder", "Door Supervisor", "Head of Door", "Arbiter of the Rope"], ["combat", "military", "*"], ["physical", "alignment"], { shift: "night", draft: 3 }],
  ["bottle-host", "Bottle Service Host", "aurum-vip", ["Ice Bucket Carrier", "Host", "Senior Host", "Keeper of the Sparklers"], ["hospitality"], ["network", "care"], { shift: "night", draft: 3 }],
  ["lounge-attendant", "Rooftop Lounge Attendant", "ceiling", ["Cushion Fluffer", "Attendant", "Head Attendant", "Steward of the View"], ["hospitality"], ["care", "network"], { shift: "evening", draft: 3 }],
  ["mixologist", "Mixologist", "bitters", ["Garnish Cutter", "Bartender", "Mixologist", "Head Mixologist", "Keeper of the Bitters"], ["hospitality", "chemistry"], ["care", "utility"], { shift: "evening", draft: 3 }],
  ["steakhouse-chef", "Steakhouse Chef", "the-cut", ["Butcher's Boy", "Line Cook", "Grill Chef", "Chef de Cuisine", "Master of the Cut"], ["hospitality"], ["utility", "physical"], { shift: "evening", draft: 3 }],
  ["itamae", "Itamae (Sushi Chef)", "hinoki", ["Rice Washer", "Wakiita", "Itamae", "Master of the Counter"], ["hospitality"], ["utility", "legacy"], { shift: "evening", draft: 2 }],
  ["supper-club-waiter", "Supper Club Waiter", "minor-key", ["Busser", "Waiter", "Captain", "Maitre d' (Machine Approved)"], ["hospitality", "music"], ["care", "network"], { shift: "evening", draft: 3 }],
  ["club-bartender", "Club Bartender (Voltage)", "voltage", ["Glass Collector", "Barback", "Bartender", "Head Bartender"], ["hospitality", "*"], ["physical", "network"], { shift: "night", draft: 3 }],
  ["strobe-bartender", "Club Bartender (Strobe)", "strobe", ["Glass Collector", "Barback", "Bartender", "Head Bartender"], ["hospitality", "*"], ["physical", "network"], { shift: "night", draft: 3 }],
  ["cypher-host", "Floor Host (The Cypher)", "cypher", ["Wristband Checker", "Host", "Floor Captain", "Keeper of the Cypher"], ["hospitality", "music"], ["network", "physical"], { shift: "night", draft: 3 }],
  ["basement-door", "Door and Sound (Basement)", "basement", ["Stamp Inker", "Door", "Sound", "Keeper of the Stairs"], ["music", "*"], ["physical", "adaptability"], { shift: "night", draft: 2 }],
  ["karaoke-host", "Karaoke Host", "karaoke-box", ["Mic Wiper", "Host", "Senior Host", "Keeper of the Songbook"], ["music", "hospitality"], ["network", "care"], { shift: "night", draft: 2 }],
  ["pool-hall-attendant", "Pool Hall Attendant", "eight-ball", ["Chalk Monitor", "Rack Boy", "Attendant", "House Shark"], ["hospitality", "*"], ["utility", "network"], { shift: "evening", draft: 2 }],
  ["comedy-door", "Comedy Club Door", "the-heckle", ["Two-Drink Enforcer", "Door", "Booker", "Keeper of the Light"], ["comedy", "hospitality"], ["network", "alignment"], { shift: "evening", draft: 2 }],
  ["fry-cook", "Fry Cook (The Coop)", "the-coop", ["Breading Hand", "Fry Cook", "Cart Captain", "Keeper of the White Sauce"], ["*", "hospitality"], ["physical", "utility"], { shift: "rotating", draft: 4 }],
  ["liquor-clerk", "Liquor Clerk (Liquor 24)", "liquor-24", ["Shelf Stacker", "Clerk", "Night Manager", "Keeper of the Till"], ["*", "business"], ["alignment", "utility"], { shift: "evening", draft: 2 }],
  ["liquor-clerk-2", "Liquor Clerk (Cut-Rate)", "cut-rate", ["Shelf Stacker", "Clerk", "Night Manager", "Keeper of the Till"], ["*", "business"], ["alignment", "utility"], { shift: "evening", draft: 2 }],
];

// ---- who goes, by tier band (0 the top two tiers, 1 the middle, 2 the lowest) ------------------
// The skew: uptown pulls the top band and barely the bottom; downtown the reverse. The mezzanine is
// the top band's only (the door sends everyone else back down).
export const NIGHT_LEISURE_BAND = [
  { aurum: 2.4, "aurum-vip": 3, ceiling: 2.6, bitters: 2, "the-cut": 2.2, hinoki: 2, "minor-key": 2.2,
    voltage: 0.15, strobe: 0.15, cypher: 0.15, basement: 0.1, "karaoke-box": 0.2, "eight-ball": 0.15, "the-heckle": 0.4, "the-coop": 0.1, "liquor-24": 0.05, "cut-rate": 0.05 },
  { aurum: 0.8, ceiling: 0.7, bitters: 0.9, "the-cut": 0.5, hinoki: 0.45, "minor-key": 0.9,
    voltage: 1.4, strobe: 1.3, cypher: 1.2, basement: 1, "karaoke-box": 1.2, "eight-ball": 1.2, "the-heckle": 1.2, "the-coop": 1, "liquor-24": 0.5, "cut-rate": 0.5 },
  { aurum: 0.15, bitters: 0.1, "minor-key": 0.15,
    voltage: 2.2, strobe: 2.1, cypher: 2, basement: 1.6, "karaoke-box": 1.6, "eight-ball": 1.8, "the-heckle": 1.2, "the-coop": 1.8, "liquor-24": 1, "cut-rate": 1 },
];
export const NIGHT_LEISURE_FIELD = {
  music: { "minor-key": 2, voltage: 1.2, cypher: 1.2, basement: 1.5, "karaoke-box": 1, aurum: 1 },
  screen: { "the-heckle": 2, aurum: 0.8, "karaoke-box": 0.8 }, comedy: { "the-heckle": 4 }, writing: { bitters: 1, "the-heckle": 1, "the-coop": 0.5 },
  finance: { "the-cut": 2, aurum: 1.2, ceiling: 1.2, "aurum-vip": 1.5 }, business: { "the-cut": 1.5, ceiling: 1, hinoki: 1, "aurum-vip": 1 },
  royalty: { "aurum-vip": 2, ceiling: 1.5 }, sport: { "eight-ball": 1.5, voltage: 0.6 }, hospitality: { hinoki: 1.5, bitters: 1.5, "the-coop": 1 },
  activism: { basement: 1.5 }, crime: { "eight-ball": 1.2, "liquor-24": 1 }, labor: { "eight-ball": 1, "cut-rate": 1, "the-coop": 1 },
  visual: { strobe: 1, basement: 1 },
};
// Overflow families (sim.js FAMILY: 0 the bars, 1 cafes and diners). A full club spills into the
// next club, never into a park at three in the morning (sim.js holds the chain to what is open).
export const NIGHT_FAMILY = [
  [0, "aurum"], [0, "aurum-vip"], [0, "ceiling"], [0, "bitters"], [0, "minor-key"], [0, "voltage"], [0, "strobe"], [0, "cypher"], [0, "basement"],
  [0, "karaoke-box"], [0, "eight-ball"], [0, "the-heckle"], [1, "the-cut"], [1, "hinoki"], [1, "the-coop"], [4, "liquor-24"], [4, "cut-rate"],
];
// Fields the records carry under other words: the jazz bassist, the DJ; the comedians (screen too).
export const NIGHT_FIELD_RULES = [["music", /bassist|saxophonist|trumpeter|disc jockey|\bdj\b/], ["comedy", /comedian|stand-up|comedienne/]];

// ---- the night out --------------------------------------------------------------------------------
// Who goes out tonight, by the machine weekday (1-7 as sim.js counts; 5 Friday, 6 Saturday).
export const NIGHT_OUT_P = { 1: 0.06, 2: 0.06, 3: 0.08, 4: 0.16, 5: 0.34, 6: 0.38, 7: 0.08 };
// THE ROPE at AURUM: the top band walks in; the middle band waits and is let in about one time in
// three; the lowest is turned away (and goes downtown). -> "ADMIT" | "WAIT" | "REFUSED"
export function ropeCheck(band, r) {
  if (band === 0) return "ADMIT";
  if (band === 1) return r < 0.35 ? "WAIT" : "REFUSED";
  return "REFUSED";
}
export const ROPE_PLACES = new Set(["aurum", "aurum-vip"]);

// ---- the lineups ------------------------------------------------------------------------------------
// Performers on file (the census of 2026-09-30, found by field: music or comedy on the record;
// the dead and the living alike, a booked set is their trade), each with what they can play.
// [slug, the bill's name, kinds]. A lineup is a pure function of the machine day: every viewer
// reads the same bill, and a booked performer works the set (sim.js: a work stop at the venue).
export const PERFORMERS = [
  ["madonna", "MADONNA", ["dj", "headline"]],
  ["taylor-swift", "TAYLOR SWIFT", ["headline", "karaoke"]],
  ["michael-jackson", "MICHAEL JACKSON", ["headline", "dj"]],
  ["prince", "PRINCE", ["headline", "jazz", "dj"]],
  ["billie-holiday", "BILLIE HOLIDAY", ["jazz"]],
  ["aretha-franklin", "ARETHA FRANKLIN", ["jazz", "headline"]],
  ["arild-andersen", "ARILD ANDERSEN", ["jazz"]],
  ["sting", "STING", ["jazz", "headline"]],
  ["john-oates", "JOHN OATES", ["dj", "headline"]],
  ["dolly-guleria", "DOLLY GULERIA", ["dj", "headline"]],
  ["travis-scott", "TRAVIS SCOTT", ["hiphop"]],
  ["ninja", "NINJA", ["hiphop"]],
  ["jack-white", "JACK WHITE", ["punk"]],
  ["jim-jefferies", "JIM JEFFERIES", ["comedy"]],
];
export const PERFORMER = Object.fromEntries(PERFORMERS.map(([slug, name, kinds]) => [slug, { slug, name, kinds }]));
// The sets: [venue, kind wanted, from, to, the bill's word]. Booked in this order each night, so
// the headline rooms get first pick and nobody plays two rooms at once.
export const SETS = [
  ["aurum", "dj", 23, 25.5, "ON THE DECKS"],
  ["minor-key", "jazz", 20.5, 23, "AT THE BANDSTAND"],
  ["the-heckle", "comedy", 21, 22.5, "HEADLINING"],
  ["cypher", "hiphop", 23.5, 25.5, "ON THE MIC"],
  ["voltage", "dj", 23, 26, "ON THE DECKS"],
  ["strobe", "dj", 23.5, 26.5, "ON THE DECKS"],
  ["basement", "punk", 22.5, 24, "ON STAGE (DOWN THE STAIRS)"],
  ["ceiling", "headline", 21, 22.5, "ACOUSTIC, ON THE ROOF"],
];
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export const nh01 = (s) => fnv(`HVI-NIGHT|${s}`) / 4294967296;
const LINEUPS = new Map();
// The night's bill (machine day): [{venue, slug, name, from, to, word}]. A set with nobody free to
// play it is left off (the Department plays a playlist; the bill says so: OPEN DECKS / OPEN MIC).
export function lineupFor(day) {
  if (LINEUPS.has(day)) return LINEUPS.get(day);
  const booked = new Set(), out = [];
  for (const [venue, kind, from, to, word] of SETS) {
    // one night in five a room takes the night off from booking (the house plays)
    if (nh01(`dark|${venue}|${day}`) < 0.2) continue;
    const pool = PERFORMERS.filter(([slug, , kinds]) => kinds.includes(kind) && !booked.has(slug));
    if (!pool.length) continue;
    // rotate through the pool by the day, from a hashed start per room, so every name comes round
    const start = fnv(`HVI-NIGHT|start|${venue}`) % pool.length;
    const [slug, name] = pool[(start + day) % pool.length];
    booked.add(slug);
    out.push({ venue, slug, name, from, to, word });
  }
  if (LINEUPS.size > 64) LINEUPS.clear();
  LINEUPS.set(day, out);
  return out;
}
// A performer's set tonight, if booked: {venue, from, to} | null
export function gigOf(key, day) {
  if (!PERFORMER[key]) return null;
  return lineupFor(day).find(g => g.slug === key) || null;
}

// ---- fixtures: the sets pull a crowd like a game (sim.js gamesOn) ------------------------------------
// Pure: every night from the set's start; sim.js reads NIGHT_FIXTURES like VENUE_FIXTURES.
export const NIGHT_FIXTURES = Object.fromEntries(SETS.map(([venue, , from, to]) => [venue, [{ days: [1, 2, 3, 4, 5, 6, 7], from, to: Math.min(to, 24), name: "TONIGHT" }]]));

// ---- the prefects' hook (prefects.js chooseDirective) ------------------------------------------------
// A district's nightlife pulls its prefect's target control: downtown towards curfews and
// inspections first (more on the big nights), uptown towards leniency (capital is lenient with itself).
export function nightPressure(id, weekday) {
  if (id === "downtown") return weekday === 6 ? 1.4 : weekday === 5 ? 0.9 : 0.5;   // Saturday: the curfew; Friday: inspections
  if (id === "uptown") return -0.3;
  return 0;
}
