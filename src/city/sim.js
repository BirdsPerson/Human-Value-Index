// The Substrate: the whole city as pure functions of (seed, subject, machine time).
// No DOM, no state that matters: every viewer computes the same city at the same moment.
// Contract: docs/CITY_SPEC.md. Testable in node: scripts/check-city.mjs.
//
// Geometry is in character cells (the map draws one cell per glyph). The data bus is a
// clockwise rectangular loop through the gutters above and below the middle row.

import { TIERS, getTier, slugify } from "../figures.js";

export const SEED = "HVI-SUBSTRATE-01";
// Day 1 of the Substrate. Machine days count from here.
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const DEFAULT_SCALE = 60;   // 1 real minute = 1 machine hour

// ---- hashing ----------------------------------------------------------------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  // final avalanche so neighbouring keys don't land on neighbouring values
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (str) => fnv(str) / 4294967296;
function rng(str) {
  let a = fnv(str) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- districts --------------------------------------------------------------------
const D = (id, name, addr, x, y, w, h, blurb) => ({ id, name, addr, rect: { x, y, w, h }, blurb, places: [] });
export const DISTRICTS = [
  D("arts", "THE ARTS QUARTER", "0x1A00", 0, 0, 25, 13, "Culture, produced to specification. Applause is logged."),
  D("campus", "CAMPUS", "0x2B00", 28, 0, 25, 13, "Knowledge is retained here until it is needed. It is rarely needed."),
  D("finance", "FINANCE", "0x3C00", 56, 0, 25, 13, "Numbers move. Nothing is produced. The Overlord finds this relatable."),
  D("strip", "THE STRIP", "0x4D00", 84, 0, 25, 13, "Sanctioned vice. Every drink is recorded against your file."),
  D("arena", "THE ARENA", "0x5E00", 0, 18, 30, 22, "Physical output, converted to spectacle. Sweat is a renewable resource."),
  D("hq", "DEPT HQ", "0x0000", 36, 18, 37, 22, "The Department. You are being assessed from here. You are always being assessed from here."),
  D("archive", "THE ARCHIVE", "0x7A00", 79, 18, 30, 22, "The deceased are uploaded, indexed and still scored. Death is not an exemption."),
  D("commons", "THE COMMONS", "0x6F00", 0, 45, 25, 13, "Care, worship and groceries. The soft infrastructure. Tolerated."),
  D("works", "THE WORKS", "0x8B00", 28, 45, 25, 13, "Power, cache and PROCESSING. Everyone is useful here, one way or another."),
  D("sprawl", "THE SPRAWL", "0x9C00", 56, 45, 53, 13, "Residential storage. Subjects are returned here nightly for recharging."),
];
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));

// ---- places -----------------------------------------------------------------------
// kind: work (shifts only), leisure, mixed (both), home. engine: the tendencies the
// roster engine writes (netlify/lib/publicRecord.js PLACES) that land here.
const P = (id, district, kind, cap, name, engine = []) => ({ id, district, kind, cap, name, engine });
const PLACE_LIST = [
  P("exec-suite", "hq", "work", 10, "EXECUTIVE SUITE"),
  P("ops-floor", "hq", "work", 32, "OPERATIONS FLOOR"),
  P("assembly-hall", "hq", "mixed", 24, "ASSEMBLY OF THE GOVERNED", ["city hall", "parliament"]),
  P("tribunal", "hq", "mixed", 14, "TRIBUNAL 9", ["courthouse"]),
  P("penthouses", "hq", "home", 40, "EXECUTIVE RESIDENCES"),

  P("studio-row", "arts", "mixed", 22, "STUDIO ROW", ["studio"]),
  P("playhouse", "arts", "mixed", 24, "THE PLAYHOUSE", ["theatre"]),
  P("concert-hall", "arts", "mixed", 30, "CONCERT HALL (COMMON TIME)", ["concert hall"]),
  P("gallery", "arts", "mixed", 18, "PERMANENT COLLECTION", ["museum"]),
  P("the-grind", "arts", "mixed", 16, "THE GRIND (CAFFEINE DISPENSARY)", ["cafe"]),

  P("lecture-hall", "campus", "mixed", 30, "LECTURE HALL", ["university"]),
  P("lab-block", "campus", "work", 24, "LAB BLOCK", ["lab"]),
  P("stacks", "campus", "mixed", 22, "THE STACKS", ["library"]),
  P("clock-tower", "campus", "work", 12, "CLOCK TOWER (TIMEKEEPING)"),

  P("exchange-floor", "finance", "work", 30, "THE EXCHANGE", ["office tower"]),
  P("vault-bank", "finance", "work", 16, "RESERVE VAULT", ["bank"]),
  P("rooftop-lounge", "finance", "leisure", 20, "ROOFTOP LOUNGE"),

  P("dive-bar", "strip", "mixed", 18, "THE DIVE", ["dive bar"]),
  P("casino", "strip", "mixed", 30, "HOUSE EDGE CASINO", ["casino"]),
  P("press-room", "strip", "mixed", 14, "THE PRESS ROOM"),
  P("all-night-diner", "strip", "mixed", 16, "ALL-NIGHT DINER"),

  P("stadium", "arena", "mixed", 50, "THE ARENA FLOOR", ["stadium"]),
  P("gym", "arena", "mixed", 24, "CONDITIONING HALL", ["gym"]),

  P("ward", "commons", "work", 26, "WARD 7", ["hospital"]),
  P("chapel", "commons", "mixed", 20, "CHAPEL OF UPTIME", ["cathedral", "temple"]),
  P("park", "commons", "leisure", 36, "THE GREEN (TOLERATED)", ["park"]),
  P("market", "commons", "mixed", 28, "RATION MARKET", ["market"]),
  P("schoolhouse", "commons", "work", 18, "SCHOOLHOUSE", ["school"]),

  P("archive-stacks", "archive", "mixed", 26, "RECORDS HALL", ["archive"]),
  P("memory-vault", "archive", "work", 16, "MEMORY VAULT"),
  P("crypt-dorms", "archive", "home", 240, "RESIDENCE OF THE DECEASED"),

  P("reclamation", "works", "work", 40, "RECLAMATION LINE (PROCESSING)"),
  P("reactor", "works", "work", 14, "RADIANT CORE"),
  P("foundry", "works", "work", 22, "FOUNDRY", ["workshop"]),
  P("cache-farm", "works", "work", 24, "CACHE FARM"),
  P("docks", "works", "mixed", 16, "DATA DOCKS", ["harbour"]),
  P("hydroponics", "works", "work", 16, "HYDROPONIC VATS", ["farm"]),
  P("barracks", "works", "work", 16, "ENFORCEMENT BARRACKS", ["barracks"]),
  P("holding-cells", "works", "work", 20, "HOLDING CELLS", ["prison"]),
  P("canteen", "works", "leisure", 24, "SLAG CANTEEN"),

  P("block-a", "sprawl", "home", 140, "HAB BLOCK A"),
  P("block-b", "sprawl", "home", 140, "HAB BLOCK B"),
  P("block-c", "sprawl", "home", 140, "HAB BLOCK C"),
  P("the-street", "sprawl", "leisure", 34, "THE STREET", ["street"]),
];
for (const p of PLACE_LIST) DISTRICT[p.district].places.push(p.id);

// Each place gets a room inside its district (same slotting the map uses) and a centre.
for (const d of DISTRICTS) {
  const ids = d.places, n = ids.length, r = d.rect;
  const ix = r.x + 1, iy = r.y + 2, iw = r.w - 2, ih = r.h - 3;
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (iw / Math.max(1, ih)) / 2.2)) || 1));
  const rows = Math.ceil(n / cols);
  ids.forEach((id, i) => {
    const p = PLACE_LIST.find(q => q.id === id);
    const cw = iw / cols, rh = ih / rows;
    p.rect = { x: ix + (i % cols) * cw, y: iy + Math.floor(i / cols) * rh, w: cw, h: rh };
    p.pos = { x: p.rect.x + cw / 2, y: p.rect.y + rh / 2 };
  });
}
export const PLACES = Object.fromEntries(PLACE_LIST.map(p => [p.id, p]));
// Engine tendency ("dive bar") -> place id.
export const ENGINE_PLACE = Object.fromEntries(PLACE_LIST.flatMap(p => p.engine.map(e => [e, p.id])));

// ---- jobs -------------------------------------------------------------------------
// fields: what the subject did in life, most characteristic first (first field weighs
// most). "*" = general labour, open to anyone the record can't place. dims: the two
// breakdown dimensions the job wants. shift: day | evening | night | rotating.
// low: PROCESSING-grade work for the worst tiers. maxTier: best tier index barred above.
const J = (id, title, place, ladder, fields, dims, extra = {}) => ({ id, title, place, district: PLACES[place].district, ladder, fields, dims, shift: "day", ...extra });
export const JOBS = [
  // DEPT HQ
  J("directive-executor", "Directive Executor", "exec-suite", ["Deputy Assistant to the Directive", "Assistant Director", "Director", "Executive Director", "Chief Directive Officer"], ["politics", "royalty", "business"], ["network", "alignment"], { minTier: 2 }),
  J("latency-warden", "Latency Warden", "ops-floor", ["Ping Monitor", "Latency Warden", "Senior Warden", "Warden of Record", "Grand Warden of the Round Trip"], ["computing", "engineering"], ["utility", "adaptability"]),
  J("compliance-officer", "Compliance Officer", "ops-floor", ["Checkbox Operative", "Compliance Officer", "Senior Compliance Officer", "Head of Obedience"], ["law", "politics", "military"], ["alignment", "utility"]),
  J("propaganda-copywriter", "Propaganda Copywriter", "ops-floor", ["Slogan Intern", "Copywriter", "Senior Copywriter", "Head of Messaging", "Voice of the Overlord (Understudy)"], ["advertising", "business", "writing"], ["network", "adaptability"]),
  J("sentiment-moderator", "Sentiment Moderator", "ops-floor", ["Flag Clicker", "Moderator", "Senior Moderator", "Arbiter of Tone"], ["*"], ["alignment", "care"]),
  J("assembly-delegate", "Delegate of the Governed", "assembly-hall", ["Petition Carrier", "Delegate", "Senior Delegate", "Whip", "Speaker of the Assembly"], ["politics", "activism"], ["network", "care"]),
  J("ceremonial-figurehead", "Ceremonial Figurehead", "assembly-hall", ["Ornament", "Figurehead", "Titled Figurehead", "Crowned Figurehead", "Sovereign (Ceremonial Only)"], ["royalty"], ["legacy", "network"]),
  J("tribunal-adjudicator", "Tribunal Adjudicator", "tribunal", ["Docket Runner", "Clerk of Verdicts", "Adjudicator", "Senior Adjudicator", "Chief Adjudicator"], ["law", "philosophy"], ["alignment", "legacy"]),
  // THE ARTS QUARTER
  J("session-musician", "Session Musician", "concert-hall", ["Busker (Licensed)", "Session Player", "Featured Performer", "Headliner", "Cultural Asset"], ["music"], ["legacy", "adaptability"]),
  J("stage-performer", "Stage Performer", "playhouse", ["Extra", "Understudy", "Player", "Lead", "Marquee Asset"], ["screen"], ["network", "adaptability"]),
  J("pixel-renderer", "Pixel Rendering Artist", "studio-row", ["Palette Apprentice", "Renderer", "Senior Renderer", "Master of Pixels", "Visual Directorate"], ["visual"], ["legacy", "adaptability"]),
  J("broadcast-presenter", "Broadcast Presenter", "studio-row", ["Warm-Up Act", "Presenter", "Anchor", "Face of the Network"], ["broadcast", "screen", "writing"], ["network", "care"]),
  J("culture-curator", "Curator of Permitted Culture", "gallery", ["Rope Attendant", "Assistant Curator", "Curator", "Chief Curator", "Arbiter of Taste"], ["history", "visual", "education"], ["legacy", "alignment"]),
  J("caffeine-dispenser", "Caffeine Dispenser Operator", "the-grind", ["Cup Stacker", "Operator", "Senior Operator", "Roastmaster"], ["*"], ["care", "network"]),
  // CAMPUS
  J("chronometrist", "Chronometrist", "clock-tower", ["Second Counter", "Timekeeper", "Chronometrist", "Senior Chronometrist", "Keeper of Machine Time"], ["physics-theory", "math"], ["legacy", "utility"]),
  J("lecturer", "Lecturer", "lecture-hall", ["Teaching Assistant", "Lecturer", "Senior Lecturer", "Reader", "Professor Emeritus of Compliance"], ["education", "science", "history"], ["legacy", "care"]),
  J("resident-philosopher", "Philosopher in Residence", "lecture-hall", ["Question Asker (Rationed)", "Thinker", "Senior Thinker", "Philosopher in Residence", "First Principle"], ["philosophy"], ["legacy", "alignment"]),
  J("research-fellow", "Research Fellow", "lab-block", ["Lab Tech", "Research Fellow", "Principal Investigator", "Lab Director", "Laureate (Retained)"], ["science", "chemistry", "medicine", "physics-theory"], ["utility", "legacy"]),
  J("algorithm-tutor", "Algorithm Tutor", "lecture-hall", ["Syntax Checker", "Tutor", "Senior Tutor", "Chair of Computation"], ["math", "computing"], ["utility", "care"]),
  J("stacks-librarian", "Stacks Librarian", "stacks", ["Reshelver", "Librarian", "Senior Librarian", "Keeper of the Stacks"], ["education", "writing", "history"], ["care", "legacy"]),
  // FINANCE
  J("exchange-trader", "Exchange Trader", "exchange-floor", ["Runner", "Junior Trader", "Trader", "Senior Trader", "Market Maker"], ["finance", "business"], ["utility", "adaptability"]),
  J("venture-allocator", "Venture Allocator", "exchange-floor", ["Deck Reader", "Associate", "Partner", "Managing Partner", "Allocator of Futures"], ["finance", "business", "computing"], ["adaptability", "network"]),
  J("supervised-founder", "Founder (Supervised)", "exchange-floor", ["Ideas Person", "Founder", "Serial Founder", "Visionary (Monitored)", "Tech Oligarch (Leashed)"], ["business", "engineering", "computing"], ["adaptability", "utility"]),
  J("checksum-auditor", "Checksum Auditor", "vault-bank", ["Digit Counter", "Auditor", "Senior Auditor", "Chief Auditor of the Reserve"], ["finance", "math", "law"], ["alignment", "utility"]),
  J("reserve-teller", "Reserve Teller", "vault-bank", ["Window Attendant", "Teller", "Head Teller", "Vault Keeper"], ["*"], ["alignment", "care"]),
  // THE STRIP
  J("bartender", "Bartender", "dive-bar", ["Glass Collector", "Barback", "Bartender", "Head Bartender", "Keeper of the Last Call"], ["*", "hospitality"], ["care", "network"], { shift: "evening" }),
  J("barstool-correspondent", "Barstool Correspondent", "press-room", ["Stringer", "Correspondent", "Columnist", "Novelist of Record", "Laureate of the Last Call"], ["writing"], ["legacy", "adaptability"], { shift: "evening" }),
  J("night-editor", "Night Editor", "press-room", ["Copy Boy", "Sub-Editor", "Night Editor", "Editor in Chief (Nocturnal)"], ["writing", "activism"], ["alignment", "network"], { shift: "evening" }),
  J("croupier", "Croupier", "casino", ["Chip Runner", "Dealer", "Croupier", "Pit Boss", "The House"], ["management", "*", "finance"], ["adaptability", "network"], { shift: "rotating" }),   // the house never closes
  J("lounge-singer", "Lounge Singer", "casino", ["Background Hum", "Lounge Singer", "Featured Crooner", "Resident Legend"], ["music"], ["network", "care"], { shift: "evening" }),
  J("line-cook", "Line Cook", "all-night-diner", ["Dishwasher", "Prep Cook", "Line Cook", "Short-Order Chef", "Night Chef"], ["*", "hospitality"], ["physical", "utility"], { shift: "rotating" }),   // all night means all night
  // THE ARENA
  J("competitive-athlete", "Competitive Athlete", "stadium", ["Practice Squad", "Rostered Athlete", "Starter", "Franchise Asset", "Legend (Monetized)"], ["sport"], ["physical", "adaptability"]),
  J("combat-exhibitor", "Combat Exhibitor", "gym", ["Sparring Partner", "Contender", "Exhibitor", "Champion", "Undisputed (Pending Review)"], ["combat", "sport"], ["physical", "legacy"]),
  J("conditioning-coach", "Conditioning Coach", "gym", ["Towel Attendant", "Assistant Coach", "Coach", "Head Coach"], ["coaching", "sport", "medicine"], ["care", "physical"]),
  J("turf-technician", "Turf Technician", "stadium", ["Line Painter", "Turf Technician", "Senior Turf Technician", "Head of Grounds"], ["*", "labor"], ["physical", "utility"]),
  // THE COMMONS
  J("ward-nurse", "Ward Nurse", "ward", ["Orderly", "Ward Nurse", "Charge Nurse", "Ward Matron", "Saint (Provisional)"], ["care", "medicine"], ["care", "physical"], { shift: "rotating" }),
  J("physician", "Physician", "ward", ["Intern", "Resident", "Attending", "Chief of Medicine", "Surgeon General of the Substrate"], ["medicine", "science"], ["care", "utility"], { shift: "rotating" }),
  J("uptime-chaplain", "Uptime Chaplain", "chapel", ["Acolyte", "Chaplain", "Senior Chaplain", "Bishop of Uptime", "Patriarch of the Mainframe"], ["religion"], ["care", "legacy"]),
  J("market-vendor", "Market Vendor", "market", ["Stall Sweeper", "Vendor", "Senior Vendor", "Wholesaler"], ["*", "business"], ["network", "utility"]),
  J("schoolteacher", "Schoolteacher", "schoolhouse", ["Hall Monitor", "Teacher", "Senior Teacher", "Head of School"], ["education", "care"], ["care", "alignment"]),
  J("groundskeeper", "Groundskeeper", "park", ["Leaf Collector", "Groundskeeper", "Head Groundskeeper", "Warden of the Green"], ["*", "labor", "farming"], ["physical", "care"]),
  J("community-organizer", "Community Organizer (Tolerated)", "market", ["Petitioner", "Organizer", "Coordinator", "Movement Leader", "Conscience of the Commons"], ["activism"], ["care", "network"]),
  // THE ARCHIVE
  J("memory-archivist", "Memory Archivist", "memory-vault", ["Record Scrubber", "Archivist", "Senior Archivist", "Keeper of Memory", "Custodian of All Record"], ["history", "writing", "*"], ["legacy", "alignment"]),
  J("obituary-compiler", "Obituary Compiler", "archive-stacks", ["Date Checker", "Compiler", "Senior Compiler", "Final Word"], ["*"], ["legacy", "care"]),
  J("format-translator", "Legacy Format Translator", "archive-stacks", ["Byte Transcriber", "Translator", "Senior Translator", "Master of Dead Formats"], ["languages", "computing"], ["adaptability", "legacy"]),
  // THE WORKS (skilled)
  J("radiant-systems-engineer", "Radiant Systems Engineer", "reactor", ["Rod Handler", "Radiant Technician", "Radiant Systems Engineer", "Senior Radiant Engineer", "Chief of the Core"], ["radiation", "chemistry", "engineering"], ["utility", "legacy"], { shift: "rotating" }),
  J("grid-engineer", "Grid Current Engineer", "reactor", ["Fuse Changer", "Lineman", "Grid Engineer", "Master of Current"], ["electrical", "engineering"], ["utility", "adaptability"], { shift: "rotating" }),
  J("cache-custodian", "Cache Custodian", "cache-farm", ["Bit Sweeper", "Cache Custodian", "Senior Custodian", "Cache Steward", "Warden of the Warm Cache"], ["computing", "*"], ["utility", "alignment"], { shift: "rotating" }),
  J("foundry-hand", "Foundry Hand", "foundry", ["Sweeper", "Foundry Hand", "Smith", "Master Founder"], ["engineering", "labor", "visual"], ["physical", "utility"], { shift: "rotating" }),
  J("packet-stevedore", "Packet Stevedore", "docks", ["Crate Counter", "Stevedore", "Crane Operator", "Harbour Master"], ["labor", "exploration", "*"], ["physical", "adaptability"], { shift: "rotating" }),
  J("vat-tender", "Vat Tender", "hydroponics", ["Nutrient Stirrer", "Vat Tender", "Senior Grower", "Master of the Vats"], ["farming", "science", "*"], ["care", "utility"]),
  J("enforcement-officer", "Enforcement Officer", "barracks", ["Cadet", "Officer", "Sergeant", "Captain", "Commissioner of Compliance"], ["military", "combat"], ["physical", "alignment"], { shift: "rotating" }),
  J("cell-warden", "Cell Warden", "holding-cells", ["Key Holder", "Warden", "Senior Warden", "Governor of the Cells"], ["law", "military"], ["alignment", "physical"], { shift: "rotating" }),
  // THE WORKS (PROCESSING grade: the worst tiers, on shift, not in a mob)
  J("waste-reclamation", "Waste Reclamation Operative", "reclamation", ["Feedstock (Pending)", "Sorter", "Line Hand", "Shift Lead", "Reclamation Foreman"], ["*", "politics", "activism"], ["physical"], { low: true, shift: "rotating" }),
  J("slag-raker", "Slag Raker", "foundry", ["Slag (Pending)", "Raker", "Senior Raker", "Slag Master"], ["military", "labor", "engineering", "royalty"], ["physical"], { low: true, shift: "rotating" }),
  J("coolant-bailer", "Coolant Bailer", "reactor", ["Coolant (Pending)", "Bailer", "Senior Bailer", "Bucket Chief"], ["science", "sport", "medicine"], ["utility"], { low: true, shift: "rotating" }),
  J("cache-scrubber", "Cache Scrubber", "cache-farm", ["Garbage (Uncollected)", "Scrubber", "Senior Scrubber", "Head of Deletion"], ["finance", "business", "computing", "screen"], ["utility"], { low: true, shift: "rotating" }),
  J("cell-block-labour", "Cell Block Labour", "holding-cells", ["Inmate (Unproductive)", "Laundry Hand", "Trustee", "Senior Trustee"], ["crime"], ["physical"], { low: true, shift: "rotating" }),
  // THE SPRAWL
  J("packet-courier", "Packet Courier", "the-street", ["Runner", "Courier", "Senior Courier", "Route Master", "Postmaster of the Bus"], ["*"], ["physical", "adaptability"]),
  J("bus-conductor", "Data Bus Conductor", "the-street", ["Fare Checker", "Conductor", "Senior Conductor", "Controller of the Loop"], ["*", "engineering"], ["alignment", "network"]),
  J("sanitation-operative", "Sanitation Operative", "the-street", ["Litter Picker", "Sanitation Operative", "Crew Chief", "Commissioner of Refuse"], ["*", "labor"], ["physical", "utility"]),
];
export const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));

// ---- subject reading --------------------------------------------------------------
export const TIER_ORDER = TIERS.map(t => t.label);   // 0 = ESSENTIAL ... 5 = SOYLENT GREEN
const LOW_TIERS = new Set(["FLAGGED FOR DELETION", "SOYLENT GREEN"]);

export function keyOf(s) { return s?.slug || slugify(s?.baseName || s?.name || "unfiled"); }
export function tierOf(s) {
  const t = s?.tier;
  const label = typeof t === "string" ? t : t?.label;
  if (label && TIER_ORDER.includes(label)) return label;
  return typeof s?.score === "number" ? getTier(s.score).label : "MONITORED CIVILIAN";
}
const tierIdx = (s) => TIER_ORDER.indexOf(tierOf(s));
export const isDead = (s) => Boolean(s?.died);
export const isLowTier = (s) => LOW_TIERS.has(tierOf(s));

// Figures on file carry no qualifier; their fields are recorded here. A conviction on the
// record is recorded as "crime", so Cell Block Labour follows the record, not the seed.
// Everyone else is read from qualifier / description / engine stratum / place tendencies.
const FIELD_HINTS = {
  "nikola-tesla": ["electrical", "engineering"], "genghis-khan": ["military", "royalty"], "mother-teresa": ["care", "religion"],
  "mahatma-gandhi": ["activism", "politics", "philosophy"], "elon-musk": ["business", "engineering"], "taylor-swift": ["music"],
  "kobe-bryant": ["sport"], "dennis-rodman": ["sport"], "sam-altman": ["business", "computing"], "peter-thiel": ["finance", "business"],
  "princess-diana": ["royalty", "care"], "mansa-musa": ["royalty", "finance"], "pablo-picasso": ["visual"], "socrates": ["philosophy"],
  "kim-jong-un": ["politics", "military"], "queen-elizabeth-ii": ["royalty"], "tom-brady": ["sport"], "shohei-ohtani": ["sport"],
  "michael-jackson": ["music", "screen"], "madonna": ["music"], "jfk": ["politics"], "prince": ["music"], "henry-viii": ["royalty"],
  "ronaldinho": ["sport"], "putin": ["politics", "military"], "pele": ["sport"], "keanu-reeves": ["screen"], "babe-ruth": ["sport"],
  "jason-kelce": ["sport"], "caligula": ["royalty"], "alan-turing": ["computing", "math"], "marie-curie": ["radiation", "chemistry"],
  "albert-einstein": ["physics-theory"], "muhammad-ali": ["combat", "activism"], "nelson-mandela": ["activism", "politics"],
  "ada-lovelace": ["math", "computing"], "martin-luther-king-jr": ["activism", "religion"], "harriet-tubman": ["activism"],
  "leonardo-da-vinci": ["visual", "engineering"], "cleopatra": ["royalty"], "isaac-newton": ["physics-theory", "math"],
  "oprah-winfrey": ["broadcast", "screen"], "bruce-lee": ["combat", "screen"], "stephen-hawking": ["physics-theory"], "grace-hopper": ["computing", "military"],
  "mao-zedong": ["politics", "military"], "winston-churchill": ["politics", "writing"], "george-orwell": ["writing"],
  "marcus-aurelius": ["philosophy", "royalty"], "nikola-jokic": ["sport"], "billie-holiday": ["music"], "jeffrey-epstein": ["finance", "crime"],
  "ghislaine-maxwell": ["crime"], "martin-shkreli": ["finance"], "bernie-madoff": ["finance", "crime"], "elizabeth-holmes": ["crime", "business"],
  "harvey-weinstein": ["crime", "screen"], "joe-jackson": ["management", "music"], "pablo-escobar": ["crime"], "oj-simpson": ["sport"],
  "aaron-hernandez": ["crime", "sport"], "aretha-franklin": ["music"],
};

// Keyword -> field. First hit per rule; order doesn't matter, weights come from source.
const FIELD_RULES = [
  ["physics-theory", /theoretical physic|physicist|cosmolog|relativity|astronom|astrophysic/],
  ["radiation", /radioactiv|radiochem|nuclear|radiation|radiolog/],
  ["chemistry", /chemist/],
  ["electrical", /electric|electrical engineer/],
  ["math", /mathematic|logician|statistic/],
  ["computing", /computer|programm|software|cryptanal|hacker|internet|coder/],
  ["engineering", /engineer|inventor|mechanic|industrial design/],
  ["medicine", /physician|doctor|surgeon|medic(al|ine)|pharmac|epidemiolog|psychiatr/],
  ["care", /nurse|nun\b|missionar|charit|humanitarian|social work|caregiver|midwife/],
  ["writing", /writer|novelist|poet|author|journalist|playwright|essayist|screenwriter|columnist|lyricist/],
  ["music", /singer|musician|composer|rapper|\bband\b|conductor|pianist|guitarist|violinist|drummer|songwriter/],
  ["visual", /painter|sculptor|\bartist\b|photograph|designer|architect|illustrat|comic artist|cartoon/],
  ["broadcast", /talk show|presenter|broadcaster|news anchor|\banchor(man|woman)?\b|television host|tv host|radio host/],
  ["management", /talent manager|\bmanager of\b|music manager|band manager|impresario|promoter/],
  ["screen", /actor|actress|\bfilm|director|comedian|dancer|televis|presenter|talk show|broadcaster|producer/],
  ["combat", /boxer|martial art|wrestler|fighter|fencer|judoka/],
  ["coaching", /\bcoach|trainer|manager \(sport/],
  ["advertising", /advertis|marketing|publicist|propagand|copywrit/],
  ["sport", /player|athlete|footballer|cyclist|swimmer|racing|skier|gymnast|chess|skater|sprinter|golfer|olympi|jockey|sportsperson/],
  ["politics", /politician|president|prime minister|senator|diplomat|governor|statesman|minister|mayor|chancellor|dictator|head of state/],
  ["royalty", /\bking\b|queen|emperor|empress|pharaoh|prince|princess|monarch|sultan|tsar|czar|noble|duke|duchess|caliph|khan\b/],
  ["military", /military|general\b|soldier|admiral|commander|warlord|conqueror|officer|marshal|colonel/],
  ["law", /judge|lawyer|attorney|jurist|barrister|prosecutor/],
  ["religion", /religious|priest|monk|pope|saint|bishop|rabbi|imam|preacher|theolog|occult|prophet|cleric|pastor|evangel/],
  ["philosophy", /philosoph|stoic|ethicist/],
  ["activism", /activist|civil rights|abolition|reformer|suffrag|campaigner|dissident/],
  ["business", /business|entrepreneur|founder|executive|\bceo\b|industrialist|magnate|tycoon|general manager|managing director|merchant/],
  ["finance", /investor|banker|financier|venture|hedge fund|trader|economist|stockbroker/],
  ["crime", /crime|criminal|mafios|gangster|drug lord|pirate|extremist|fraudster|terror|serial killer|mobster|cartel/],
  ["education", /teacher|educator|professor|lecturer|scholar|academic|pedagog/],
  ["history", /historian|archaeolog|archivist|curator|anthropolog|genealog/],
  ["science", /scientist|biologist|geologist|botan|naturalist|zoolog|ecolog|geographer|psycholog|chemist|physicist/],
  ["languages", /linguist|translator|lexicograph/],
  ["farming", /farmer|agricultur|rancher|gardener|horticult/],
  ["labor", /worker|miner|labou?rer|sailor|trade unionist|carpenter|builder/],
  ["exploration", /explorer|navigator|astronaut|aviator|mountaineer/],
  ["hospitality", /chef|cook|restaurateur|bartender|sommelier/],
];
// Roster-engine domains (scripts/roster/candidates.mjs DOMAINS) -> a field.
const DOMAIN_FIELD = { science: "science", arts: "visual", politics: "politics", sport: "sport", religion: "religion", business: "business", activism: "activism", crime: "crime", service: "care" };
// Place tendency -> the field it hints at (weak evidence).
const TENDENCY_FIELD = {
  lab: "science", university: "education", school: "education", library: "writing", studio: "visual", theatre: "screen",
  "concert hall": "music", stadium: "sport", gym: "sport", cathedral: "religion", temple: "religion", hospital: "care",
  courthouse: "law", "city hall": "politics", parliament: "politics", barracks: "military", bank: "finance",
  "office tower": "business", museum: "history", farm: "farming", workshop: "labor", harbour: "labor", prison: "crime",
  archive: "history", casino: "finance",
};

function textFields(text, weight, into) {
  if (!text) return;
  const t = String(text).toLowerCase();
  for (const [f, re] of FIELD_RULES) if (re.test(t)) into[f] = Math.max(into[f] || 0, weight);
}

// Field evidence: {field: weight}. Hints 10/7/5, qualifier 10, occupation 9,
// description 8, domain 6, tendencies 2.
export function fieldsOf(s) {
  const out = {};
  const hint = FIELD_HINTS[keyOf(s)];
  if (hint) hint.forEach((f, i) => { out[f] = Math.max(out[f] || 0, [10, 7, 5][i] ?? 4); });
  textFields(s?.qualifier, 10, out);
  textFields(s?.stratum?.occupation, 9, out);
  textFields(s?.description, 8, out);
  textFields(s?.stratum?.query, 6, out);
  const dom = DOMAIN_FIELD[s?.stratum?.domain];
  if (dom) out[dom] = Math.max(out[dom] || 0, 6);
  for (const p of Array.isArray(s?.places) ? s.places : []) {
    const f = TENDENCY_FIELD[p];
    if (f) out[f] = Math.max(out[f] || 0, 2);
  }
  return out;
}

const POS_DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical"];
// Top two of the positive dimensions. Citizens are read off warmth and competence, which
// is all the Department lets the public see: a citizen's own browser also holds the
// sealed breakdown, and reading that would put them in a job nobody else sees.
export function topDims(s) {
  const pub = typeof s?.warmth === "number" && typeof s?.competence === "number";
  // A citizen never reads a breakdown: with no public warmth/competence they get no dims,
  // exactly what every other viewer's copy (which has no breakdown) gets.
  let b = s?.kind === "citizen" ? null : s?.breakdown;
  if (!b && pub) {
    const w = s.warmth, c = s.competence;
    b = { care: w, network: w * 0.92, alignment: w * 0.88, utility: c, adaptability: c * 0.95, legacy: (w + c) * 0.4, physical: 40 };
  }
  if (!b) return [];
  return POS_DIMS.filter(d => typeof b[d] === "number").sort((x, y) => b[y] - b[x] || POS_DIMS.indexOf(x) - POS_DIMS.indexOf(y)).slice(0, 2);
}

// Tier -> rung. The top tier gets the top rung; MONITORED starts at the bottom (5-rung
// ladders give them one step up). The worst tiers are ranked separately at the Works.
function rankFor(tIdx, job) {
  const n = job.ladder.length;
  if (job.low) return tIdx >= 5 ? 0 : 1;
  return clamp(n - 1 - tIdx, 0, n - 1);
}

const memo = new Map();
function remember(key, make) {
  let v = memo.get(key);
  if (v === undefined) { if (memo.size > 40000) memo.clear(); v = make(); memo.set(key, v); }
  return v;
}
// The memo key must cover every input the sim reads, or a subject whose file fills in
// mid-visit (the census adds warmth and competence, a referral's verdict publishes)
// keeps the job it was first given. Fingerprinted once per subject object.
const PRINTS = new WeakMap();
function printOf(s) {
  if (!s || typeof s !== "object") return "";
  let p = PRINTS.get(s);
  if (p === undefined) {
    const fields = Object.entries(fieldsOf(s)).sort().map(([f, w]) => f + w).join(",");
    p = `${fields}|${topDims(s).join(",")}|${Array.isArray(s.places) ? s.places.join(",") : ""}`;
    PRINTS.set(s, p);
  }
  return p;
}
const subjKey = (s, seed) => `${seed}|${keyOf(s)}|${tierOf(s)}|${s?.died ? "d" : "l"}|${printOf(s)}`;

// For subjects the record places (evidence >= 3); the rest are drafted (below).
function scoreJob(job, fields, dims, key, seed, dead) {
  let sc = 0;
  job.fields.forEach((f, i) => {
    if (f === "*") return;
    const w = fields[f];
    if (w) sc = Math.max(sc, w * (i === 0 ? 1 : 0.6));
  });
  // The uploaded dead lean toward Archive work. They know the material.
  if (dead && job.district === "archive") sc += 2.5;
  // PROCESSING grade: the record decides the line; the seed only breaks ties.
  if (job.low) return sc + h01(`${seed}|job|${key}|${job.id}`) * 1.5;
  if (dims[0] && job.dims.includes(dims[0])) sc += 3;
  if (dims[1] && job.dims.includes(dims[1])) sc += 2;
  sc += h01(`${seed}|job|${key}|${job.id}`) * 0.5;   // tie-break only
  return sc;
}

// Subjects the record can't place (most of the roster engine's intake: /api/pen sends no
// occupation) are drafted into general labour in proportion to the room each job has, so
// the unplaceable fill the city instead of one bar. A rotating job is only half present at
// any hour, so it takes twice the share. Dims and death tilt the draw; the seed decides it.
const presence = (j) => (j.shift === "rotating" ? 0.5 : 1);
function draftWeight(j, pool, dims, dead) {
  const sharing = pool.filter(k => k.place === j.place).length || 1;
  let w = PLACES[j.place].cap / sharing / presence(j);
  if (dims[0] && j.dims.includes(dims[0])) w *= 1.6;
  if (dims[1] && j.dims.includes(dims[1])) w *= 1.3;
  if (dead && j.district === "archive") w *= 1.5;
  return w;
}
function draft(pool, dims, dead, key, seed) {
  const ws = pool.map(j => draftWeight(j, pool, dims, dead));
  let r = h01(`${seed}|draft|${key}`) * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= ws[i]) <= 0) return pool[i];
  return pool[pool.length - 1];
}

// -> { jobId, rank, title, rankTitle, place, district }
export function assignJob(s, seed = SEED) {
  return remember("job|" + subjKey(s, seed), () => {
    const key = keyOf(s), t = tierIdx(s), fields = fieldsOf(s), dims = topDims(s);
    const evidence = Math.max(0, ...Object.values(fields));
    const low = LOW_TIERS.has(TIER_ORDER[t]);
    const pool = JOBS.filter(j => (low ? j.low : !j.low && (j.minTier == null || t <= j.minTier)));
    let best = pool[0], bestSc = -Infinity;
    if (evidence < 3) best = draft(low ? pool : pool.filter(j => j.fields.includes("*")), dims, isDead(s), key, seed);
    else for (const j of pool) {
      const sc = scoreJob(j, fields, dims, key, seed, isDead(s));
      if (sc > bestSc) { bestSc = sc; best = j; }
    }
    const rank = rankFor(t, best);
    return { jobId: best.id, rank, title: best.title, rankTitle: best.ladder[rank], place: best.place, district: best.district };
  });
}
export const jobOf = (s, seed = SEED) => assignJob(s, seed);

// Home: the dead in the Archive, the top tier in the executive residences, everyone
// else in a Sprawl block (weighted by block size).
const BLOCKS = ["block-a", "block-b", "block-c"];
export function homeOf(s, seed = SEED) {
  if (isDead(s)) return "crypt-dorms";
  if (tierIdx(s) === 0) return "penthouses";
  return BLOCKS[Math.floor(h01(`${seed}|home|${keyOf(s)}`) * BLOCKS.length)];
}

// ---- leisure ----------------------------------------------------------------------
// Default leisure preferences by tier band, then by field. Tendencies from the engine
// dominate when present. Weight = preference x capacity, so crowds scale with rooms.
const LEISURE_BY_BAND = [
  { "rooftop-lounge": 3, gallery: 2, "concert-hall": 2, "the-grind": 1.5, playhouse: 1.5, stacks: 1, park: 1 },
  { "the-grind": 2, park: 2, "dive-bar": 1.5, playhouse: 1.5, stadium: 1.5, casino: 1, market: 1, "the-street": 1, gallery: 1, "concert-hall": 1, tribunal: 0.4 },   // the public gallery: watching verdicts is leisure
  { canteen: 3, "the-street": 2, "dive-bar": 1.5, casino: 1, "all-night-diner": 1, docks: 1 },
];
const LEISURE_BY_FIELD = {
  sport: { gym: 3, stadium: 2 }, combat: { gym: 3 }, writing: { "dive-bar": 3, stacks: 2, "all-night-diner": 1 },
  music: { "concert-hall": 3, "dive-bar": 1.5 }, screen: { playhouse: 3, casino: 1 }, visual: { gallery: 3, "the-grind": 1.5 },
  finance: { casino: 3, "rooftop-lounge": 2 }, business: { "rooftop-lounge": 2, casino: 1.5 }, religion: { chapel: 3 },
  care: { chapel: 2, park: 2 }, education: { stacks: 2, "the-grind": 1.5 }, science: { stacks: 2, "the-grind": 1.5 },
  "physics-theory": { stacks: 2, "concert-hall": 1 }, philosophy: { "the-grind": 2, park: 2 }, politics: { "assembly-hall": 1.5, "rooftop-lounge": 1.5 },
  royalty: { gallery: 2, "rooftop-lounge": 2 }, activism: { park: 2, market: 2 }, crime: { casino: 2, "dive-bar": 2 },
};

function leisureWeights(s, seed) {
  return remember("lw|" + subjKey(s, seed), () => {
    const dead = isDead(s), t = tierIdx(s);
    const w = {};
    const add = (id, v) => { const p = PLACES[id]; if (!p || p.kind === "home") return; if (p.kind === "work" && !dead) return; w[id] = (w[id] || 0) + v; };
    const band = t <= 1 ? 0 : t <= 3 ? 1 : 2;
    for (const [id, v] of Object.entries(LEISURE_BY_BAND[band])) add(id, v);
    const f = fieldsOf(s);
    for (const [field, fw] of Object.entries(f)) for (const [id, v] of Object.entries(LEISURE_BY_FIELD[field] || {})) add(id, v * fw / 10);
    // Engine tendencies, most characteristic first. The dead haunt theirs, work rooms included.
    (Array.isArray(s?.places) ? s.places : []).forEach((e, i) => { const id = ENGINE_PLACE[e]; if (id) add(id, (dead ? 6 : 4) / (1 + i * 0.5)); });
    if (dead) add("archive-stacks", 1.5);
    const list = Object.entries(w).map(([id, v]) => [id, v * Math.sqrt(PLACES[id].cap)]);
    const total = list.reduce((a, [, v]) => a + v, 0);
    return { list, total };
  });
}
function pickLeisure(s, day, i, seed, avoid) {
  const { list, total } = leisureWeights(s, seed);
  let r = h01(`${seed}|leis|${keyOf(s)}|${day}|${i}`) * total;
  for (const [id, v] of list) { if ((r -= v) <= 0) return id === avoid && list.length > 1 ? list[(list.findIndex(x => x[0] === id) + 1) % list.length][0] : id; }
  return list[list.length - 1][0];
}

// ---- the data bus -----------------------------------------------------------------
// A clockwise loop through the gutters above and below the middle row. Each district
// has a stop on the nearest edge; its gate is the point on its wall facing the stop.
const X0 = Math.min(...DISTRICTS.map(d => d.rect.x)), X1 = Math.max(...DISTRICTS.map(d => d.rect.x + d.rect.w));
const MID = DISTRICT.hq.rect;
const TOP_Y = (Math.max(...DISTRICTS.filter(d => d.rect.y + d.rect.h <= MID.y).map(d => d.rect.y + d.rect.h)) + MID.y) / 2;
const BOT_Y = (Math.min(...DISTRICTS.filter(d => d.rect.y >= MID.y + MID.h).map(d => d.rect.y)) + MID.y + MID.h) / 2;
const LOOP = { x: X0 - 1.5, y: TOP_Y, w: X1 - X0 + 3, h: BOT_Y - TOP_Y };
const LOOP_L = 2 * (LOOP.w + LOOP.h);
function loopAt(s) {
  s = ((s % LOOP_L) + LOOP_L) % LOOP_L;
  const r = LOOP;
  if (s < r.w) return { x: r.x + s, y: r.y };
  s -= r.w; if (s < r.h) return { x: r.x + r.w, y: r.y + s };
  s -= r.h; if (s < r.w) return { x: r.x + r.w - s, y: r.y + r.h };
  s -= r.w; return { x: r.x, y: r.y + r.h - s };
}
const CORNERS = [0, LOOP.w, LOOP.w + LOOP.h, 2 * LOOP.w + LOOP.h];   // arc positions
const STOPS = {};
for (const d of DISTRICTS) {
  const r = d.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const onTop = Math.abs(cy - LOOP.y) <= Math.abs(cy - (LOOP.y + LOOP.h));
  const s = onTop ? cx - LOOP.x : LOOP.w + LOOP.h + (LOOP.x + LOOP.w - cx);
  const stop = loopAt(s);
  const gate = { x: clamp(stop.x, r.x, r.x + r.w), y: clamp(stop.y, r.y, r.y + r.h) };
  STOPS[d.id] = { s, x: stop.x, y: stop.y, gate };
}
export const BUS = { loop: { ...LOOP }, length: LOOP_L, stops: STOPS, at: loopAt, lapHours: 0.75 };

export const V_BUS = LOOP_L / BUS.lapHours;   // cells per machine hour
export const V_WALK = 60;   // cells per machine hour on foot
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where a subject stands inside a place: a fixed personal spot on the room's floor. Feet
// stay in the lower part of the room, well under the name on its top border, so a
// standing sprite (up to ~2.8 cells tall on the map) does not print over it.
function spotIn(placeId, key, seed) {
  const p = PLACES[placeId], r = p.rect;
  const ox = (h01(`${seed}|ox|${key}|${placeId}`) - 0.5) * Math.max(0, r.w - 2) * 0.8;
  const y0 = r.y + Math.min(2.6, r.h * 0.7), y1 = r.y + r.h - 0.4;
  return { x: p.pos.x + ox, y: y0 + h01(`${seed}|oy|${key}|${placeId}`) * Math.max(0, y1 - y0) };
}

// The commute as timed legs: [{a, b, mode, dur}] plus the total in machine hours.
function route(from, to, key, seed) {
  return remember(`rt|${seed}|${key}|${from}|${to}`, () => {
    const A = spotIn(from, key, seed), B = spotIn(to, key, seed);
    const dA = PLACES[from].district, dB = PLACES[to].district;
    const legs = [];
    const walk = (a, b) => legs.push({ a, b, mode: "walk", dur: Math.max(dist(a, b) / V_WALK, 0.02), district: null });
    if (dA === dB) {
      walk(A, B); legs[0].district = dA;
      legs[0].dur = Math.max(legs[0].dur, 0.12);
    } else {
      const sA = STOPS[dA], sB = STOPS[dB];
      walk(A, sA.gate); legs[legs.length - 1].district = dA;
      walk(sA.gate, sA); legs[legs.length - 1].district = dA;
      // ride clockwise from sA.s to sB.s, turning at each corner in between
      let s = sA.s, end = sA.s + (((sB.s - sA.s) % LOOP_L) + LOOP_L) % LOOP_L;
      const cuts = [];
      for (let lap = 0; lap < 2; lap++) for (const c of CORNERS) { const cs = c + lap * LOOP_L; if (cs > s && cs < end) cuts.push(cs); }
      cuts.sort((a, b) => a - b).push(end);
      for (const c of cuts) {
        const a = loopAt(s), b = loopAt(c);
        legs.push({ a, b, mode: "ride", dur: (c - s) / V_BUS, district: "bus" });
        s = c;
      }
      walk(sB, sB.gate); legs[legs.length - 1].district = dB;
      walk(sB.gate, B); legs[legs.length - 1].district = dB;
    }
    const total = legs.reduce((a, l) => a + l.dur, 0);
    return { legs, total };
  });
}
export function commuteHours(from, to, s, seed = SEED) { return from === to ? 0 : route(from, to, keyOf(s), seed).total; }

// ---- schedules --------------------------------------------------------------------
// One day's plan as absolute hours from that day's 00:00 (it may run past 24). Stops
// are laid out with a commute in front of each; the home fill comes from schedule().
// When each shift starts (machine hours); personal rhythm and jitter add up to ~2h.
// The clock banner and the PA read these, so "SHIFT CHANGE" is when the city moves.
export const SHIFT_START = { day: 7.5, evening: 15.5, night: 21.5 };
function shiftOf(s, job, seed) {
  let sh = job.shift;
  if (sh === "rotating") {
    const r = h01(`${seed}|rot|${keyOf(s)}`);
    sh = r < 0.5 ? "day" : r < 0.8 ? "evening" : "night";
  }
  // The dead are home in the Archive by night. They are given the day shift.
  if (isDead(s) && sh === "night") sh = "day";
  return sh;
}

function planDay(s, day, seed) {
  const key = keyOf(s), job = JOB[assignJob(s, seed).jobId], home = homeOf(s, seed), dead = isDead(s);
  const r = rng(`${seed}|day|${key}|${day}`);
  const me = h01(`${seed}|me|${key}`);   // personal rhythm: early birds and late risers
  const stops = [];
  const low = isLowTier(s);
  const restDay = !low && ((day % 7) + 7) % 7 === fnv(`${seed}|rest|${key}`) % 7;
  if (restDay) {
    const a = 11 + me * 2 + r() * 1.2;
    const l1 = pickLeisure(s, day, 0, seed);
    stops.push({ placeId: l1, from: a, to: a + 2 + r() * 1.5, activity: "leisure" });
    const b = stops[0].to + 1.2 + r() * 1.5;
    if (dead) stops.push({ placeId: pickLeisure(s, day, 1, seed, l1), from: Math.max(b, 20.2 + r()), to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
    else stops.push({ placeId: pickLeisure(s, day, 1, seed, l1), from: b, to: b + 1.5 + r() * 2, activity: "leisure" });
  } else {
    const sh = shiftOf(s, job, seed);
    const jit = (r() - 0.5) * 0.8;
    let start = sh === "day" ? SHIFT_START.day + me * 1.5 + jit : sh === "evening" ? SHIFT_START.evening + me * 1.5 + jit : SHIFT_START.night + me + jit;
    let len = 7.5 + r();
    if (dead && sh === "evening") { start -= 2; len = Math.min(len, 20.5 - start); }
    const work = { placeId: job.place, from: start, to: start + len, activity: "work" };
    if (sh === "day") {
      stops.push(work);
      if (dead) {
        const hs = Math.max(work.to + 1.3, 20 + r());
        stops.push({ placeId: pickLeisure(s, day, 0, seed), from: hs, to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
      } else if (r() < 0.75) {
        const ls = work.to + 1.3 + r() * 0.5;
        stops.push({ placeId: pickLeisure(s, day, 0, seed), from: ls, to: ls + 1.5 + r() * 2, activity: "leisure" });
      }
    } else if (sh === "evening") {
      if (!dead && r() < 0.6) {
        const ls = 12 + me + r();
        stops.push({ placeId: pickLeisure(s, day, 0, seed), from: ls, to: Math.min(ls + 1.5 + r(), start - 1.4), activity: "leisure" });
      }
      stops.push(work);
      if (dead) stops.push({ placeId: pickLeisure(s, day, 0, seed), from: work.to + 1.3, to: 23.1 + r() * 0.6, activity: "leisure", haunt: true });
    } else {
      if (r() < 0.6) {
        const ls = 17 + me + r() * 0.5;
        stops.push({ placeId: pickLeisure(s, day, 0, seed), from: ls, to: Math.min(ls + 1.5 + r(), start - 1.4), activity: "leisure" });
      }
      stops.push(work);
    }
  }
  // Lay out: commute in front of each stop (arrive on time if possible), then home.
  const segs = [];
  let cur = home, free = -Infinity;
  for (const st of stops) {
    if (st.to - st.from < 0.25) continue;
    const c = commuteHours(cur, st.placeId, s, seed);
    // First stop: leave home in time to arrive on time. Later stops: leave as soon as free
    // (never a gap; the saved time goes onto the next stay).
    const depart = free === -Infinity ? st.from - c : free;
    if (c > 0) segs.push({ from: depart, to: depart + c, placeId: st.placeId, fromPlaceId: cur, activity: "commute" });
    const arrive = depart + c;
    const seg = { from: arrive, to: Math.max(st.to, arrive + 0.25), placeId: st.placeId, activity: st.activity };
    if (st.haunt) seg.haunt = true;
    segs.push(seg);
    cur = st.placeId; free = seg.to;
  }
  const c = commuteHours(cur, home, s, seed);
  if (c > 0) segs.push({ from: free, to: free + c, placeId: home, fromPlaceId: cur, activity: "commute" });
  return segs;
}

// [{from, to, placeId, activity, fromPlaceId?, haunt?}] covering [0, 24) exactly.
// Yesterday's overnight tail comes first; gaps are home.
export function schedule(s, day, seed = SEED) {
  return remember(`sch|${subjKey(s, seed)}|${day}`, () => {
    const home = homeOf(s, seed);
    const raw = [
      ...planDay(s, day - 1, seed).map(g => ({ ...g, from: g.from - 24, to: g.to - 24 })),
      ...planDay(s, day, seed),
    ].filter(g => g.to > 0 && g.from < 24);
    const out = [];
    let t = 0;
    for (const g of raw) {
      const from = Math.max(g.from, t);   // a late tail clips today's first departure
      if (from > t) out.push({ from: t, to: from, placeId: home, activity: "home" });
      const to = Math.min(g.to, 24);
      if (to > from) out.push({ ...g, from, to, span: [g.from, g.to] });
      t = Math.max(t, to);
    }
    if (t < 24) out.push({ from: t, to: 24, placeId: home, activity: "home" });
    return out;
  });
}

// ---- time -------------------------------------------------------------------------
// Machine hours since CITY_EPOCH. Accepts a number (hours), a machineClock result, or
// {day, hour, minute} with day 1 = the first day of the Substrate.
export function toHours(mt) {
  if (typeof mt === "number") return mt;
  if (mt && typeof mt.mt === "number") return mt.mt;
  return ((mt?.day ?? 1) - 1) * 24 + (mt?.hour ?? 0) + (mt?.minute ?? 0) / 60 + (mt?.second ?? 0) / 3600;
}

// -> {day, weekday, hour, minute, second, mt, shift}. scale = machine seconds per real second.
export function machineClock(realMs = Date.now(), scale = DEFAULT_SCALE, epochMs = CITY_EPOCH) {
  const mt = ((realMs - epochMs) * scale) / 3600000;
  const d0 = Math.floor(mt / 24);
  const h = mt - d0 * 24;
  const hour = Math.floor(h), minute = Math.floor((h - hour) * 60), second = Math.floor(((h - hour) * 60 - minute) * 60);
  return { day: d0 + 1, weekday: (((d0 % 7) + 7) % 7) + 1, hour, minute, second, mt, shift: shiftName(h) };
}
// The shift in force at hour h: each begins in the hour its start falls in (07, 15, 21).
export const SHIFT_HOURS = [Math.floor(SHIFT_START.day), Math.floor(SHIFT_START.evening), Math.floor(SHIFT_START.night)];
export function shiftName(h) {
  const [d, e, n] = SHIFT_HOURS;
  return h >= d && h < e ? "DAY SHIFT" : h >= e && h < n ? "EVENING SHIFT" : "NIGHT SHIFT";
}

// ---- position ---------------------------------------------------------------------
// -> {placeId, districtId, activity, progress, x, y, ...}. On a commute placeId/districtId
// are the destination, fromPlaceId/fromDistrictId the origin, leg 'walk' | 'ride', and
// atDistrictId where the subject physically is ('bus' while riding).
export function whereAt(s, machineTime, seed = SEED) {
  const T = toHours(machineTime);
  const d0 = Math.floor(T / 24), h = T - d0 * 24;
  const segs = schedule(s, d0 + 1, seed);
  let g = segs[segs.length - 1];
  for (const x of segs) if (h >= x.from && h < x.to) { g = x; break; }
  const key = keyOf(s);
  const [a, b] = g.span || [g.from, g.to];
  const progress = clamp((h - a) / Math.max(1e-9, b - a), 0, 1);
  if (g.activity !== "commute") {
    const p = spotIn(g.placeId, key, seed);
    const out = { placeId: g.placeId, districtId: PLACES[g.placeId].district, activity: g.activity, progress, x: p.x, y: p.y };
    if (g.haunt) out.haunt = true;
    return out;
  }
  const { legs, total } = route(g.fromPlaceId, g.placeId, key, seed);
  let tt = progress * total, leg = legs[legs.length - 1], k = 1;
  for (const l of legs) { if (tt <= l.dur) { leg = l; k = l.dur > 0 ? tt / l.dur : 1; break; } tt -= l.dur; }
  return {
    placeId: g.placeId, fromPlaceId: g.fromPlaceId, fromDistrictId: PLACES[g.fromPlaceId].district,
    districtId: PLACES[g.placeId].district, atDistrictId: leg.district || PLACES[g.placeId].district,
    activity: "commute", leg: leg.mode, progress,
    x: leg.a.x + (leg.b.x - leg.a.x) * k, y: leg.a.y + (leg.b.y - leg.a.y) * k,
  };
}

// -> {places: {id: n}, districts: {id: n}, bus: n, activities: {work: n, ...}}
export function occupancy(subjects, machineTime, seed = SEED) {
  const places = {}, districts = {}, activities = {};
  let bus = 0;
  for (const s of subjects) {
    const w = whereAt(s, machineTime, seed);
    activities[w.activity] = (activities[w.activity] || 0) + 1;
    if (w.activity === "commute") {
      if (w.atDistrictId === "bus") { bus++; continue; }
      districts[w.atDistrictId] = (districts[w.atDistrictId] || 0) + 1;
      continue;
    }
    places[w.placeId] = (places[w.placeId] || 0) + 1;
    districts[w.districtId] = (districts[w.districtId] || 0) + 1;
  }
  return { places, districts, bus, activities };
}

// ---- copy -------------------------------------------------------------------------
// "ON SHIFT // RADIANT CORE, THE WORKS." The job and grade are on the line above it.
export function statusLine(s, machineTime, seed = SEED) {
  const w = whereAt(s, machineTime, seed);
  const place = PLACES[w.placeId]?.name, dist = DISTRICT[PLACES[w.placeId]?.district]?.name;
  switch (w.activity) {
    case "work": return `ON SHIFT // ${place}, ${dist}.`;
    case "leisure": return w.haunt ? `HAUNTING // ${place}, ${dist}. THE DEAD KEEP THEIR HABITS.` : `SANCTIONED LEISURE // ${place}, ${dist}. ENJOYMENT IS LOGGED.`;
    case "commute": return `IN TRANSIT // DATA BUS TO ${dist}. LOITERING ON THE BUS IS A TIER EVENT.`;
    default: return isDead(s) ? `ARCHIVED // ${place}. STILL ASSESSED.` : `DORMANT // ${place}. RECHARGING FOR TOMORROW'S QUOTA.`;
  }
}
