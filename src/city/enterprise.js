// THE MALL: emergent small business (ROADMAP b1c; Scott 2026-09-30: "if people get dissatisfied
// with their jobs, they should try to open their own businesses... Shaun White would be the
// perfect guy to start a ski shop / snowboard shop at the foot of the mountain").
// docs/CITY_SPEC.md "THE MALL". Pure: the plan builder (netlify/lib/plans.js) runs it once per
// machine day, before it builds the day, so every viewer sees the same city; browsers only read
// what it publishes (the day's summary, and each subject's satisfaction in the window files).
//
//   SATISFACTION  per subject per machine day, 0..100, from that day's plan: FIT (the job's fields
//                 and dimensions against the subject's record), PAY (the rung of the ladder), the
//                 COMMUTE (hours in transit on a working day), the work district's MOOD (crowding,
//                 tier mix, housing: the civic fold's own measures, from the same plan) and FRIENDS
//                 AT WORK (coworkers met off shift). A rest day is not scored for the streak.
//   OPENING       a living subject with an entrepreneur's profile (a record in business, finance
//                 or management; or competence, network and adaptability all high; or a record
//                 that fits a trade) whose satisfaction is under 35 on 7 working days (a fair day,
//                 35-44, holds the count; a good one, 45 and up, clears it) QUITS and
//                 opens a shop of the kind their record says, in a vacant storefront unit of a
//                 district that suits it. At most 2 openings a day, one business per owner.
//   STAFF         hired from the dissatisfied (under 50 yesterday), best fit first: their work
//                 moves to the shop. Nobody works two places: an owner or a hand is nobody else's.
//   TRADE         customers come by the sim's own leisure visits (shopsFor below pulls them, by
//                 the subject's fields and the district's foot traffic); takings = visits x price
//                 x fit (the district for the trade, the owner for the trade); costs = rent + wages.
//                 5 losing days of the last 7: CLOSED (the owner back to their assigned job, the unit
//                 TO LET from the day after next). 4 good days: another hand (to 3); 8: a SECOND
//                 LOCATION if a fitting unit is vacant.
//   LICENCE 0001  SHAUN WHITE (Scott's example): if he is on file, living and holds no business,
//                 the Department grants him the first licence and the Heights base unit nearest
//                 the lifts, once. Documented as a grant; every later licence follows the rules.
//
// The state rides the chain: each day's format-1 plan carries `ent` (the state in effect that
// day), and the builder also keeps the latest in a blob (ent/latest) so a gap in the plans does
// not lose the register. Published days never change; every change starts at a day boundary.
import * as SIM from "./sim.js";
import { displayName } from "../figures.js";
import { dayStats } from "./civic.js";
import { UNIT_LIST, UNIT_IDS, UNIT_FACE } from "./storefrontSim.js";

export const ENT_V = 1;
export const LOW_SAT = 35, STREAK_DAYS = 7, MAX_OPEN = 2, HIRE_SAT = 50;
export const LOSS_DAYS = 5, GOOD_DAYS = 4, EXPAND_DAYS = 8, MAX_STAFF = 3, MAX_UNITS = 2, RELET_DAYS = 2, COOLDOWN = 14;
export const SHAUN = "shaun-white";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`${SIM.SEED}|ent|${s}`) / 4294967296;

// ---- the units -------------------------------------------------------------------------------------
export const UNITS = Object.fromEntries(UNIT_LIST.map(([id, district, lot, name]) => [id, { id, district, lot, name, face: UNIT_FACE[id] }]));
// The rent a unit costs a day (credits), by district: the Strip's frontage is dear, the estates cheap.
const RENT = { strip: 60, campus: 45, coast: 48, heights: 48, commons: 30, sprawl: 24 };
// Foot traffic: how much of a district's passing trade a shop sees (a multiplier on its pull).
const TRAFFIC = { strip: 1.35, coast: 1.2, campus: 1.05, heights: 0.95, commons: 1.0, sprawl: 0.85 };
const WAGE = 16;

// ---- the trades ------------------------------------------------------------------------------------
// label (the register), sub (the sign's second line), tags (the Overlord's last word, one drawn by
// hash), group (how the window and the room are drawn: storefrontDraw.js), districts (where the trade
// suits; elsewhere it trades at 0.7), shift (day: 9-19; evening: 12-24), price (credits a visit),
// fields (whose custom it draws: subject fields), awning colour.
const T = (label, sub, tags, group, districts, shift, price, fields, awning) => ({ label, sub, tags, group, districts, shift, price, fields, awning });
export const SHOP_TYPES = {
  ski: T("SKI & SNOWBOARD SHOP", "SKI. SNOWBOARD.", ["NO REFUNDS."], "boards", ["heights"], "day", 16, ["sport", "exploration"], "#2563eb"),
  surf: T("SURF SHOP", "SURF. WAX. LEASHES.", ["THE OCEAN IS NOT LIABLE.", "WIPEOUTS ARE LOGGED."], "boards", ["coast"], "day", 13, ["sport", "exploration"], "#0891b2"),
  skate: T("SKATE SHOP", "DECKS. TRUCKS. WHEELS.", ["SKATING IS A TIER EVENT.", "THE PAVEMENT IS SCORED."], "boards", ["sprawl", "strip", "campus"], "day", 11, ["sport", "screen"], "#ea580c"),
  sporting: T("SPORTING GOODS", "BALLS. BATS. WHISTLES.", ["EXERCISE IS MANDATORY. EQUIPMENT IS NOT.", "WINNING SOLD SEPARATELY."], "gear", ["sprawl", "commons", "heights"], "day", 12, ["sport", "soccer", "gridiron", "tennis", "coaching"], "#16a34a"),
  gym: T("GYM", "IRON. SWEAT. RECEIPTS.", ["REPS ARE COUNTED.", "PAIN IS A SUBSCRIPTION."], "gear", ["sprawl", "commons", "strip"], "day", 10, ["sport", "combat", "coaching"], "#dc2626"),
  golf: T("PRO SHOP", "CLUBS. TEES. LESSONS.", ["THE HANDICAP IS PERMANENT.", "FORE IS A REQUEST, NOT A WARNING."], "gear", ["heights", "campus", "coast"], "day", 18, ["sport", "finance", "business"], "#15803d"),
  restaurant: T("RESTAURANT", "TABLES. PLATES. JUDGEMENT.", ["THE KITCHEN IS SUPERVISED.", "COMPLIMENTS TO THE DEPARTMENT."], "food", ["strip", "commons", "coast"], "evening", 15, ["hospitality", "finance", "screen"], "#b91c1c"),
  cafe: T("CAFE", "COFFEE. TEA. WAITING.", ["REFILLS ARE RATIONED.", "SIT. YOU ARE BEING SERVED."], "food", ["campus", "commons", "sprawl"], "day", 8, ["writing", "education", "visual", "computing"], "#92400e"),
  bakery: T("BAKERY", "BREAD. PASTRY. CRUMBS.", ["THE OVEN IS ALSO MONITORED.", "FRESH UNTIL AUDITED."], "food", ["commons", "sprawl", "campus"], "day", 8, ["hospitality", "visual", "farming"], "#d97706"),
  icecream: T("ICE CREAM PARLOUR", "CONES. SCOOPS. SPRINKLES.", ["MELTING IS NOT A REFUND EVENT.", "ONE SCOOP PER SUBJECT."], "food", ["coast", "strip", "commons"], "day", 7, ["finance", "care", "screen"], "#db2777"),
  records: T("RECORD STORE", "VINYL. TAPES. OPINIONS.", ["B-SIDES ARE LOGGED.", "NO LISTENING WITHOUT A FILE."], "records", ["campus", "strip", "sprawl"], "day", 11, ["music", "writing", "broadcast"], "#7c3aed"),
  venue: T("LISTENING ROOM", "LIVE. LOUD. LICENSED.", ["THE ENCORE IS PRE-APPROVED.", "APPLAUSE IS COUNTED."], "stage", ["strip", "campus", "coast"], "evening", 14, ["music", "screen", "management"], "#9333ea"),
  comedy: T("COMEDY CELLAR", "STAND-UP. SIT DOWN.", ["LAUGHTER IS RECORDED.", "HECKLES ARE FILED."], "stage", ["strip", "campus"], "evening", 13, ["screen", "writing", "broadcast"], "#c026d3"),
  video: T("VIDEO RENTAL", "TAPES. DISCS. LATE FEES.", ["BE KIND. REWIND. COMPLY.", "LATE FEES ARE PERMANENT."], "records", ["strip", "sprawl", "commons"], "day", 9, ["screen", "broadcast", "writing"], "#1d4ed8"),
  gallery: T("GALLERY", "WALLS. FRAMES. PRICES.", ["DO NOT TOUCH. DO NOT UNDERSTAND.", "TASTE IS ASSESSED AT THE DOOR."], "art", ["campus", "commons", "strip"], "day", 17, ["visual", "history", "music"], "#a16207"),
  books: T("BOOKSHOP", "BOOKS. MAPS. SILENCE.", ["READING IS LOGGED.", "THE ENDINGS HAVE BEEN APPROVED."], "books", ["campus", "commons", "sprawl"], "day", 10, ["writing", "education", "history", "philosophy"], "#065f46"),
  boutique: T("BOUTIQUE", "CLOTHES. SHOES. MIRRORS.", ["THE MIRROR IS A CAMERA.", "FIT IS ASSIGNED."], "clothes", ["strip", "campus", "coast"], "day", 16, ["visual", "screen", "music"], "#be185d"),
  sneakers: T("SNEAKER BOUTIQUE", "LIMITED. NUMBERED. QUEUED.", ["THE QUEUE IS THE PRODUCT.", "ONE PAIR PER FILE."], "clothes", ["strip", "sprawl", "campus"], "day", 18, ["sport", "music", "business"], "#f97316"),
  repair: T("REPAIR SHOP", "FIXED. SOLDERED. WARRANTIED (NOT).", ["IF IT IS BROKEN, IT WAS SCHEDULED.", "PARTS ARE COUNTED."], "tools", ["sprawl", "commons", "campus"], "day", 12, ["computing", "engineering", "electrical", "labor"], "#475569"),
  games: T("GAME SHOP", "CARTRIDGES. CONSOLES. CONTINUES.", ["HIGH SCORES ARE PROPERTY OF THE DEPARTMENT.", "PRESS START TO COMPLY."], "tools", ["campus", "strip", "sprawl"], "day", 12, ["computing", "screen", "math"], "#4f46e5"),
  magic: T("MAGIC SHOP", "TRICKS. CARDS. VANISHING.", ["NOTHING VANISHES FROM THE RECORD.", "THE REVEAL IS LOGGED."], "tools", ["strip", "coast"], "day", 11, ["screen", "religion", "crime"], "#6d28d9"),
  wine: T("WINE MERCHANT", "BOTTLES. CORKS. NOTES.", ["CONSUMPTION IS RECORDED AGAINST YOUR FILE.", "VINTAGES ARE ASSESSED."], "bottles", ["strip", "campus", "heights"], "evening", 17, ["hospitality", "finance", "royalty", "screen"], "#7f1d1d"),
  grocer: T("CORNER GROCER", "MILK. BREAD. RATIONS.", ["PORTIONS ARE ASSIGNED.", "THE QUEUE IS THE SERVICE."], "goods", ["sprawl", "commons", "coast"], "day", 7, ["farming", "care", "labor"], "#4d7c0f"),
  pawn: T("PAWN SHOP", "BUY. SELL. FORGET.", ["EVERYTHING HAS A PRICE. YOURS IS ON FILE.", "NO QUESTIONS. ONLY RECORDS."], "goods", ["strip", "sprawl"], "day", 13, ["finance", "crime", "business"], "#854d0e"),
  homegoods: T("HOME GOODS", "LINENS. LAMPS. SERENITY.", ["SERENITY IS SOLD BY THE METRE.", "A TIDY HOME IS A COMPLIANT HOME."], "goods", ["commons", "campus", "sprawl"], "day", 14, ["visual", "care", "business"], "#0f766e"),
};

// The figures on the census whose record says a trade outright (the census carries no occupation
// for a referral, so the Department reads it off the name, like sim.js FIELD_HINTS).
const HINT_TYPE = {
  "shaun-white": "ski",
  "kelly-slater": "surf", "laird-hamilton": "surf",
  "tony-hawk": "skate", "bob-burnquist": "skate", "bam-margera": "skate", "steve-o": "skate", "johnny-knoxville": "skate", "chris-pontius": "skate",
  "tiger-woods": "golf", "phil-mickelson": "golf", "rory-mcilroy": "golf", "bubba-watson": "golf", "john-daly": "golf", "jack-nicklaus": "golf", "rickie-fowler": "golf", "sergio-garcia": "golf",
  "gordon-ramsay": "restaurant", "paula-deen": "bakery", "martha-stewart": "homegoods", "jerry-seinfeld": "cafe", "wes-anderson": "bakery",
  "rick-rubin": "records", "jack-white": "records", "david-byrne": "records", "jimmy-page": "records", "dave-matthews": "venue", "steve-aoki": "venue", "kid-cudi": "records", "rza": "records", "el-p": "records",
  "ronnie-fieg": "sneakers", "michael-jordan": "sneakers", "pharrell-williams": "boutique", "kanye-west": "boutique", "rupaul": "boutique", "zendaya": "boutique",
  "criss-angel": "magic", "david-blaine": "magic",
  "shigeru-miyamoto": "games", "takashi-tezuka": "games", "alexey-pajitnov": "games", "mrbeast": "icecream", "warren-buffett": "icecream",
  "stephen-king": "books", "j-k-rowling": "books", "salman-rushdie": "books", "jonathan-franzen": "books", "max-brooks": "books", "daniel-kraus": "books", "noam-chomsky": "books",
  "francis-ford-coppola": "wine", "roman-coppola": "wine", "sofia-coppola": "wine",
  "mark-rober": "repair", "tim-berners-lee": "repair", "jensen-huang": "repair",
  "quentin-tarantino": "video", "kevin-smith": "video",
  "dave-chappelle": "comedy", "chris-rock": "comedy", "louis-ck": "comedy", "bill-burr": "comedy", "jim-jefferies": "comedy", "russell-peters": "comedy",
  "mike-tyson": "gym", "arnold-schwarzenegger": "gym", "dwayne-johnson": "gym", "roy-jones-jr": "gym", "sylvester-stallone": "gym", "john-cena": "gym",
  "michael-phelps": "sporting", "wayne-gretzky": "sporting", "derek-jeter": "sporting", "joe-namath": "sporting",
};
// A field on the record -> the trade it suggests (the strongest field wins).
const FIELD_TYPE = {
  hospitality: "restaurant", music: "records", visual: "gallery", writing: "books", screen: "video", broadcast: "records",
  sport: "sporting", soccer: "sporting", gridiron: "sporting", tennis: "sporting", combat: "gym", coaching: "gym",
  computing: "repair", engineering: "repair", electrical: "repair", math: "games", business: "grocer", finance: "pawn",
  management: "venue", farming: "grocer", care: "cafe", crime: "pawn", exploration: "sporting", education: "books",
  history: "books", philosophy: "books", advertising: "boutique", labor: "repair", royalty: "wine", religion: "books",
};
// The trades a field may set up in: anyone else's record says nothing.
const TRADE_FIELDS = new Set(Object.keys(FIELD_TYPE));
// No record of a trade: the strongest public dimension picks one.
const DIM_TYPE = {
  physical: ["gym", "sporting", "skate"], care: ["cafe", "bakery", "grocer"], network: ["restaurant", "venue", "boutique"],
  utility: ["repair", "games", "grocer"], adaptability: ["boutique", "sneakers", "video"], legacy: ["books", "gallery", "records"],
  alignment: ["grocer", "homegoods", "books"],
};

const FIELDS = new WeakMap();
const fieldsOf = (s) => { let f = FIELDS.get(s); if (!f) { f = SIM.fieldsOf(s); FIELDS.set(s, f); } return f; };
const evidenceOf = (f) => Math.max(0, ...Object.values(f));
const isCitizen = (s) => s?.kind === "citizen";

// -> {type, why, skill (0..1: how well the owner knows the trade)}
export function shopTypeOf(s) {
  const key = SIM.keyOf(s);
  if (HINT_TYPE[key]) return { type: HINT_TYPE[key], why: "THE RECORD NAMES THE TRADE", skill: 1 };
  const f = fieldsOf(s);
  const best = Object.entries(f).filter(([k, w]) => FIELD_TYPE[k] && w >= 5).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  if (best) {
    let type = FIELD_TYPE[best[0]];
    // a variant by hash, so a city of musicians is not one record store
    if (type === "records" && h01(`v|${key}`) < 0.35) type = "venue";
    if (type === "sporting" && (s?.breakdown?.physical ?? 0) >= 80 && h01(`v|${key}`) < 0.5) type = "gym";
    if (type === "restaurant" && h01(`v|${key}`) < 0.3) type = "bakery";
    if (type === "video" && h01(`v|${key}`) < 0.3) type = "comedy";
    return { type, why: "A RECORD THAT FITS A TRADE", skill: best[1] >= 8 ? 0.8 : 0.6 };
  }
  const dims = SIM.topDims(s);
  const opts = DIM_TYPE[dims[0]] || DIM_TYPE.alignment;
  return { type: opts[Math.floor(h01(`dim|${key}`) * opts.length)], why: "THE DEPARTMENT ASSIGNED THE TRADE", skill: 0.4 };
}

// -> null | why (the entrepreneur's profile). Only the living act.
export function profileOf(s) {
  if (!s || SIM.isDead(s) || isCitizen(s) || SIM.isLowTier(s)) return null;
  const key = SIM.keyOf(s), f = fieldsOf(s), b = s.breakdown || {};
  if ((f.business || 0) >= 5 || (f.finance || 0) >= 5 || (f.management || 0) >= 5) return "A RECORD IN BUSINESS";
  const comp = typeof s.competence === "number" ? s.competence : b.utility;
  if (comp >= 70 && (b.network ?? 0) >= 65 && (b.adaptability ?? 0) >= 70) return "COMPETENT, CONNECTED, ADAPTABLE";
  if (HINT_TYPE[key]) return "A RECORD THAT FITS A TRADE";
  for (const [k, w] of Object.entries(f)) if (TRADE_FIELDS.has(k) && w >= 7) return "A RECORD THAT FITS A TRADE";
  return null;
}

// How much a subject likes a trade's shop (0..1.2): their fields against the trade's.
function affinity(s, type) {
  const f = fieldsOf(s), t = SHOP_TYPES[type];
  let a = 0;
  t.fields.forEach((k, i) => { if (f[k]) a = Math.max(a, (f[k] / 10) * (i === 0 ? 1 : 0.7)); });
  return a;
}

// ---- names, in the Overlord's voice -------------------------------------------------------------
function surname(s) {
  // "Tyler, the Creator" is TYLER'S: a name's styling after a comma is not a surname
  const n = String(s?.baseName || s?.name || "UNFILED").replace(/\(.*?\)/g, "").split(",")[0].trim();
  const parts = n.split(/\s+/).filter(p => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p));
  return (parts[parts.length - 1] || n).toUpperCase().replace(/[^A-Z0-9'.-]/g, "");
}
export function businessName(s, type) {
  const t = SHOP_TYPES[type], sn = surname(s);
  const poss = sn.endsWith("S") ? `${sn}'` : `${sn}'S`;
  const tag = t.tags[Math.floor(h01(`tag|${SIM.keyOf(s)}|${type}`) * t.tags.length)];
  return { sign: poss, title: `${poss} ${t.sub} ${tag}`, tag };
}

// ---- who does what on a day ----------------------------------------------------------------------
// key -> {biz, role: "owner" | "staff", unit}
export function rolesOf(state) {
  const out = new Map();
  for (const b of state?.biz || []) {
    out.set(b.owner, { biz: b, role: "owner", unit: b.units[0] });
    b.staff.forEach((k, i) => out.set(k, { biz: b, role: "staff", unit: b.units[(i + 1) % b.units.length] }));
  }
  return out;
}
// The job a storefront worker works: the sim's job shape (place, shift, title).
const shopJob = (unit, type, role) => ({ id: `shop-${unit}`, title: role === "owner" ? "Proprietor" : "Shop Hand", place: unit, district: UNITS[unit].district, shift: SHOP_TYPES[type].shift, fields: SHOP_TYPES[type].fields, dims: [], ladder: ["Shop Hand", "Proprietor"] });
// Is a trade's shop open at hour h (machine hours)? day 9-19, evening 12-24.
export const openAt = (type, h) => (SHOP_TYPES[type]?.shift === "evening" ? h >= 12 || h < 0.5 : h >= 9 && h < 19);

// What the sim needs for a day (sim.setEnterprise): the storefront jobs and the shops' pull.
export function simDay(state) {
  if (!state) return null;
  const work = new Map();
  for (const [k, r] of rolesOf(state)) work.set(k, shopJob(r.unit, r.biz.type, r.role));
  const trading = [];
  for (const b of state.biz) for (const u of b.units) trading.push({ unit: u, type: b.type, traffic: TRAFFIC[UNITS[u].district] || 1 });
  const ver = `${state.day}:${fnv(JSON.stringify([...work.entries()].map(([k, j]) => [k, j.place]).concat(trading.map(t => [t.unit, t.type]))))}`;
  return { ver, work, shops: shopsFor(trading) };
}
// Each trading unit takes about 3% of a subject's leisure, more for a trade they like and a busy
// street; only while it is open (the hour the visit starts).
export const SHOP_SHARE = 0.03;
function shopsFor(trading) {
  if (!trading.length) return null;
  return (list, total, s, hour) => {
    const out = list.slice();
    for (const t of trading) {
      if (hour != null && !openAt(t.type, hour)) continue;
      out.push([t.unit, total * SHOP_SHARE * (0.4 + affinity(s, t.type)) * t.traffic]);
    }
    return out;
  };
}

// ---- satisfaction ----------------------------------------------------------------------------------
const NB = 48;
// plan: a format-1 plan; people: key -> census subject; state: the enterprise state that day (or null).
// -> Map key -> {s, f: {fit, pay, commute, mood, friends}, rest, role}
export function satisfactionDay(plan, people, state) {
  const P = plan.places, roles = rolesOf(state);
  const stats = dayStats(plan, people);
  const climate = {};
  for (const [id, x] of Object.entries(stats)) {
    const crowd = -35 * (1 - Math.exp(-(x.excess + 0.5 * x.homeOver) / 1.5));
    const tier = clamp((2.2 - x.tier) * 9, -20, 20), housing = clamp(20 * x.glass - 20 * x.proj, -14, 14);
    climate[id] = clamp(Math.round((crowd + tier + housing) / 4), -8, 8) || 0;
  }
  // pass 1: where each works today, how long in transit, where they spend their leisure
  const rows = [];
  const at = new Map();   // "place|bucket" -> Map(workPlace -> [keys])
  for (const key of Object.keys(plan.subjects).sort()) {
    const s = people.get(key);
    if (!s) continue;
    const r = roles.get(key);
    const job = r ? shopJob(r.unit, r.biz.type, r.role) : SIM.JOB[SIM.assignJob(s).jobId];
    let worked = false, commute = 0;
    const leisure = [];
    for (const g of SIM.rowSegs(P, plan.subjects[key])) {
      if (g.activity === "work") worked = true;
      else if (g.activity === "commute") commute += g.to - g.from;
      else if (g.activity === "leisure") leisure.push(g);
    }
    rows.push({ key, s, job, r, worked, commute, leisure });
    for (const g of leisure) for (let k = Math.max(0, Math.floor(g.from * 2)); k < NB && k / 2 < g.to; k++) {
      const id = `${g.placeId}|${k}`;
      let m = at.get(id); if (!m) at.set(id, m = new Map());
      let a = m.get(job.place); if (!a) m.set(job.place, a = []);
      a.push(key);
    }
  }
  const out = new Map();
  for (const x of rows) {
    const { key, s, job, r } = x;
    // FRIENDS AT WORK: coworkers met off shift today
    const met = new Set();
    for (const g of x.leisure) for (let k = Math.max(0, Math.floor(g.from * 2)); k < NB && k / 2 < g.to; k++) {
      for (const o of at.get(`${g.placeId}|${k}`)?.get(job.place) || []) if (o !== key) met.add(o);
      if (met.size >= 4) break;
    }
    const friends = met.size ? Math.min(10, 3 + 2 * met.size) : -2;
    // FIT: the job's fields and dimensions against the record
    let fit;
    if (r) fit = r.role === "owner" ? 14 : Math.round(-4 + 16 * Math.min(1, affinity(s, r.biz.type)));
    else {
      const f = fieldsOf(s), dims = SIM.topDims(s), ev = evidenceOf(f);
      let fs = 0;
      job.fields.forEach((k, i) => { if (k !== "*" && f[k]) fs = Math.max(fs, (f[k] / 10) * (i === 0 ? 1 : 0.75)); });
      const dh = (dims[0] && job.dims.includes(dims[0]) ? 1 : 0) + (dims[1] && job.dims.includes(dims[1]) ? 0.6 : 0);
      fit = ev >= 3 ? Math.round(-14 + 26 * fs + 6 * dh - (fs === 0 ? 6 : 0)) : Math.round(-9 + 8 * dh);
    }
    fit = clamp(fit, -20, 20) || 0;
    // PAY: the rung (the PROCESSING grades are paid in nothing)
    let pay;
    if (r) pay = r.role === "owner" ? ((r.biz.profit?.[r.biz.profit.length - 1] ?? 0) >= 0 ? 8 : -6) : 2;
    else {
      const j = SIM.assignJob(s);
      pay = job.low ? -16 : Math.round(-10 + 20 * (j.rank / Math.max(1, job.ladder.length - 1)));
    }
    // a day's transit past the two and a half hours a round trip with an errand costs
    const commute = x.worked ? -Math.round(clamp((x.commute - 2.5) * 5, 0, 15)) || 0 : 0;
    const mood = climate[job.district] ?? 0;
    const f = { fit, pay, commute, mood, friends };
    const sc = clamp(Math.round(52 + fit + pay + commute + mood + friends), 0, 100);
    out.set(key, { s: sc, f, rest: !x.worked, role: r?.role || null });
  }
  return out;
}
// The compact form the window files carry per subject: [s, fit, pay, commute, mood, friends, flags]
// (flags: 1 a rest day, 2 an owner, 4 a shop hand).
export const satRow = (x) => [x.s, x.f.fit, x.f.pay, x.f.commute, x.f.mood, x.f.friends, (x.rest ? 1 : 0) | (x.role === "owner" ? 2 : x.role === "staff" ? 4 : 0)];
// The Department's word for it: the worst factor names the complaint.
export function satWord(row) {
  if (!row) return null;
  const [s, fit, pay, commute, mood, friends, fl] = row;
  if (fl & 2) return s >= 55 ? "SELF-EMPLOYED. THE DEPARTMENT IS WATCHING THE BOOKS." : "SELF-EMPLOYED. THE BOOKS ARE NOT GOOD.";
  if (s >= 75) return "CONTENT. SUSPICIOUSLY.";
  if (s >= 55) return "ADEQUATE. AS DESIGNED.";
  const worst = [["fit", fit], ["pay", pay], ["commute", commute], ["mood", mood], ["friends", friends]].sort((a, b) => a[1] - b[1])[0][0];
  const why = { fit: "MISFILED. THE DEPARTMENT IS AWARE.", pay: "UNDERPAID. AS INTENDED.", commute: "IN TRANSIT, MOSTLY. THE LINE IS AWARE.", mood: "THE DISTRICT IS SOURING. SO ARE YOU.", friends: "ALONE AT WORK. NOTED." }[worst];
  return s >= LOW_SAT ? `TOLERATING IT. ${why}` : why;
}

// ---- the chain ---------------------------------------------------------------------------------------
export function genesis(day) {
  return { v: ENT_V, day, next: 1, grant: 0, biz: [], closed: [], streak: {}, cool: {}, vacant: {}, licences: 0, closures: 0, opens: [] };
}
const fitIn = (type, unit) => (SHOP_TYPES[type].districts.includes(UNITS[unit].district) ? 1 : 0.7);
const licence = (n) => String(n).padStart(4, "0");
function vacantUnits(st, day, roles) {
  const used = new Set(st.biz.flatMap(b => b.units));
  return UNIT_IDS.filter(u => !used.has(u) && !(st.vacant[u] != null && day < st.vacant[u] + RELET_DAYS));
}
// The unit a trade takes: one in a district that suits it, the nearest to its first choice's order;
// else (any trade but the mountain's and the sea's) the busiest vacant unit.
function unitFor(type, free, key) {
  const t = SHOP_TYPES[type];
  for (const d of t.districts) {
    const us = free.filter(u => UNITS[u].district === d);
    if (us.length) return type === "ski" && d === "heights" ? us[us.length - 1] : us[Math.floor(h01(`unit|${key}|${type}`) * us.length)];
  }
  if (type === "ski" || type === "surf") return null;
  const any = free.slice().sort((a, b) => (TRAFFIC[UNITS[b].district] - TRAFFIC[UNITS[a].district]) || (a < b ? -1 : 1));
  return any[0] || null;
}
// Hire for a business: the dissatisfied who suit the trade best (then the least satisfied).
function hire(st, b, sat, people, roles, n, day) {
  const pool = [];
  for (const [k, x] of sat) {
    if (roles.has(k) || x.s >= HIRE_SAT) continue;
    const s = people.get(k);
    if (!s || isCitizen(s) || SIM.isLowTier(s)) continue;
    pool.push([k, affinity(s, b.type), x.s]);
  }
  pool.sort((a, c) => c[1] - a[1] || a[2] - c[2] || (a[0] < c[0] ? -1 : 1));
  const got = [];
  for (const [k] of pool.slice(0, n)) { b.staff.push(k); roles.set(k, { biz: b, role: "staff" }); got.push(k); }
  if (got.length) b.hired = [day, got.length];
  return got;
}
const nameOf = (people, k) => { const s = people.get(k); return s ? displayName(s) : k; };

// The day's state from yesterday's: prev (state in effect yesterday, or null), plan (yesterday's
// format-1 plan, or null), people (key -> census subject), day (the day being built).
export function stepEnterprise(prev, plan, people, day) {
  const st = prev && prev.v === ENT_V ? JSON.parse(JSON.stringify(prev)) : genesis(day);
  st.day = day;
  st.opens = [];   // what happened at this boundary (the PA reads it)
  const events = st.opens;
  const sat = plan && prev ? satisfactionDay(plan, people, prev) : new Map();
  // 0. files withdrawn: an owner off the census closes the shop; a hand off it is let go
  for (const b of st.biz.slice()) {
    b.staff = b.staff.filter(k => people.has(k));
    if (!people.has(b.owner)) closeBiz(st, b, day, "FILE WITHDRAWN", events);
  }
  // 1. yesterday's trade, from yesterday's plan: visits x price x fit; rent and wages
  if (plan && prev) {
    const visits = {};
    for (const row of Object.values(plan.subjects)) for (const g of SIM.rowSegs(plan.places, row)) if (g.activity === "leisure" && UNITS[g.placeId]) visits[g.placeId] = (visits[g.placeId] || 0) + 1;
    for (const b of st.biz.slice()) {
      if (b.opened >= day) continue;
      const v = b.units.reduce((n, u) => n + (visits[u] || 0), 0);
      const fit = b.units.reduce((n, u) => n + fitIn(b.type, u), 0) / b.units.length * (0.8 + 0.4 * b.skill);
      const takings = Math.round(v * SHOP_TYPES[b.type].price * fit);
      const costs = b.units.reduce((n, u) => n + RENT[UNITS[u].district], 0) + WAGE * b.staff.length;
      const profit = takings - costs;
      b.visits = [...(b.visits || []), v].slice(-7);
      b.takings = [...b.takings, takings].slice(-7);
      b.profit = [...b.profit, profit].slice(-7);
      b.loss = b.profit.filter(p => p < 0).length;   // losing days of the last seven
      b.good = profit > 20 ? b.good + 1 : 0;
      b.total += takings;
      if (b.loss >= LOSS_DAYS) closeBiz(st, b, day, "LOSSES", events);
    }
  }
  const roles = rolesOf(st);
  // 2. the thriving grow: a hand at 4 good days, a second location at 8; a shop with nobody behind
  // the counter but its owner (LICENCE 0001 opens before anyone's satisfaction is counted) hires one
  for (const b of st.biz) {
    if (!b.staff.length && sat.size) { const got = hire(st, b, sat, people, roles, 1, day); if (got.length) events.push({ k: "hire", id: b.id, who: got.map(k => nameOf(people, k)) }); }
    if (b.good >= GOOD_DAYS && b.staff.length < MAX_STAFF && (b.hired?.[0] ?? -99) < day - 1) {
      const got = hire(st, b, sat, people, roles, 1, day);
      if (got.length) events.push({ k: "hire", id: b.id, who: got.map(k => nameOf(people, k)) });
    }
    if (b.good >= EXPAND_DAYS && b.units.length < MAX_UNITS) {
      const free = vacantUnits(st, day, roles).filter(u => SHOP_TYPES[b.type].districts.includes(UNITS[u].district) && !b.units.includes(u));
      if (free.length) {
        const u = free[Math.floor(h01(`second|${b.id}|${day}`) * free.length)];
        b.units.push(u); b.good = 0;
        st.vacant[u] = null; delete st.vacant[u];
        hire(st, b, sat, people, roles, 1, day);
        events.push({ k: "expand", id: b.id, unit: u });
      }
    }
  }
  // 3. the streaks: an entrepreneur under 35 on a working day counts one more; a good day resets
  for (const [k, x] of sat) {
    if (roles.has(k) || x.rest) continue;
    const s = people.get(k);
    if (!profileOf(s) || (st.cool[k] != null && day < st.cool[k])) { delete st.streak[k]; continue; }
    // under 35 counts a day; a fair day (35-44) holds the count; a good one (45+) clears it
    if (x.s < LOW_SAT) st.streak[k] = (st.streak[k] || 0) + 1; else if (x.s >= LOW_SAT + 10) delete st.streak[k];
  }
  for (const k of Object.keys(st.streak)) if (!people.has(k) || roles.has(k)) delete st.streak[k];
  for (const [k, until] of Object.entries(st.cool)) if (day >= until) delete st.cool[k];
  // 4. LICENCE 0001: Shaun White, the Heights base, once
  const shaun = people.get(SHAUN);
  if (!st.grant && shaun && profileOf(shaun) && !roles.has(SHAUN)) {
    const u = unitFor("ski", vacantUnits(st, day, roles), SHAUN);
    if (u) {
      const b = openBiz(st, shaun, "ski", u, day, people, roles, sat, "DEPARTMENT LICENSE 0001");
      st.grant = 1;
      events.push({ k: "open", id: b.id, grant: true });
    }
  }
  // 5. the openings: the longest streaks first, at most MAX_OPEN a day
  const ready = Object.entries(st.streak).filter(([k, n]) => n >= STREAK_DAYS && !roles.has(k)).sort((a, b) => b[1] - a[1] || h01(`open|${a[0]}|${day}`) - h01(`open|${b[0]}|${day}`));
  let opened = 0;
  for (const [k] of ready) {
    if (opened >= MAX_OPEN) break;
    const s = people.get(k);
    if (!s) continue;
    const { type } = shopTypeOf(s);
    const u = unitFor(type, vacantUnits(st, day, roles), k);
    if (!u) continue;
    const b = openBiz(st, s, type, u, day, people, roles, sat, null);
    delete st.streak[k];
    events.push({ k: "open", id: b.id });
    opened++;
  }
  // bounded: the streak map holds only the entrepreneurs counting (a hand hired today stops counting);
  // the closed list the last 24
  for (const k of Object.keys(st.streak)) if (roles.has(k)) delete st.streak[k];
  st.closed = st.closed.slice(-24);
  return st;
}
function openBiz(st, s, type, unit, day, people, roles, sat, grant) {
  const key = SIM.keyOf(s), n = businessName(s, type), was = SIM.assignJob(s);
  const b = {
    id: licence(st.next++), owner: key, who: displayName(s), type, sign: n.sign, title: n.title, units: [unit], opened: day,
    quit: was.title, why: profileOf(s), skill: shopTypeOf(s).skill, staff: [], takings: [], profit: [], visits: [], loss: 0, good: 0, total: 0,
    ...(grant ? { grant } : {}),
  };
  st.biz.push(b);
  st.licences = (st.licences || 0) + 1;
  delete st.vacant[unit];
  roles.set(key, { biz: b, role: "owner" });
  hire(st, b, sat, people, roles, 1, day);
  return b;
}
function closeBiz(st, b, day, reason, events) {
  st.biz = st.biz.filter(x => x !== b);
  for (const u of b.units) st.vacant[u] = day;
  st.cool[b.owner] = day + COOLDOWN;
  st.closures = (st.closures || 0) + 1;
  st.closed.push({ id: b.id, owner: b.owner, who: b.who, type: b.type, sign: b.sign, title: b.title, units: b.units, opened: b.opened, closed: day, reason, total: b.total });
  events.push({ k: "close", id: b.id, reason });
}

// ---- what the day's summary publishes (bounded: 24 units, the last 24 closures) ---------------------
export function publicBlock(state, people) {
  if (!state) return null;
  const units = {};
  for (const u of UNIT_IDS) units[u] = { s: "TO LET" };
  for (const c of state.closed) if (c.closed === state.day) for (const u of c.units) units[u] = { s: "CLOSED", id: c.id, sign: c.sign, type: c.type };
  const biz = state.biz.map(b => {
    b.units.forEach(u => { units[u] = { s: "OPEN", id: b.id, sign: b.sign, type: b.type }; });
    return {
      id: b.id, owner: b.owner, who: b.who, type: b.type, label: SHOP_TYPES[b.type].label, sign: b.sign, title: b.title, units: b.units,
      opened: b.opened, quit: b.quit, why: b.why, staff: b.staff.map(k => [k, nameOf(people, k)]), takings: b.takings, profit: b.profit,
      visits: b.visits || [], status: b.loss >= 3 ? "STRUGGLING" : b.good >= GOOD_DAYS ? "THRIVING" : b.opened === state.day ? "NEW" : "TRADING",
      ...(b.grant ? { grant: b.grant } : {}),
    };
  });
  const districts = {};
  for (const u of UNIT_IDS) { const d = UNITS[u].district; districts[d] ||= { units: 0, open: 0 }; districts[d].units++; if (units[u].s === "OPEN") districts[d].open++; }
  return {
    v: ENT_V, day: state.day, units, biz, closed: state.closed.slice(-12), events: state.opens || [],
    licences: state.licences || 0, closures: state.closures || 0, counting: Object.keys(state.streak).length, districts,
  };
}

// The civic fold's factor (civic.js): a district's shops, bounded -6..6. A thriving shop +2, any
// other open one +1, a closure in the last three days -3.
export function enterpriseMood(state, districtId) {
  if (!state) return 0;
  let m = 0;
  for (const b of state.biz) for (const u of b.units) if (UNITS[u].district === districtId) m += b.good >= GOOD_DAYS ? 2 : 1;
  for (const c of state.closed) if (state.day - c.closed < 3 && c.units.some(u => UNITS[u].district === districtId)) m -= 3;
  return clamp(m, -6, 6);
}
export function districtBiz(state, districtId) {
  if (!state) return null;
  const open = state.biz.filter(b => b.units.some(u => UNITS[u].district === districtId)).length;
  const closed = state.closed.filter(c => state.day - c.closed < 7 && c.units.some(u => UNITS[u].district === districtId)).length;
  return { open, closed };
}

// ---- the PA and the gossip ---------------------------------------------------------------------------
const where = (u) => `${UNITS[u].name}, ${SIM.DISTRICT[UNITS[u].district].name}`;
export function paLines(block, here = null) {
  if (!block) return [];
  const byId = new Map(block.biz.map(b => [b.id, b]));
  const closedById = new Map(block.closed.map(c => [c.id, c]));
  const inHere = (units) => !here || units.some(u => UNITS[u]?.district === here);
  const out = [];
  for (const e of block.events || []) {
    const b = byId.get(e.id) || closedById.get(e.id);
    if (!b || !inHere(b.units)) continue;
    if (e.k === "open") out.push(e.grant
      ? `NOW OPEN: ${b.title} ${where(b.units[0])}. DEPARTMENT LICENSE 0001 IS ISSUED TO ${b.who.toUpperCase()}. THE MOUNTAIN HAS BEEN INFORMED.`
      : `NOW OPEN: ${b.title} ${where(b.units[0])}. ${b.who.toUpperCase()} HAS QUIT AS ${String(b.quit).toUpperCase()}. THE DEPARTMENT HAS NOTED THE INITIATIVE.`);
    else if (e.k === "close") out.push(`CLOSED: ${b.sign} ${SHOP_TYPES[b.type].label}. THE DEPARTMENT EXPECTED THIS. ${b.who.toUpperCase()} RETURNS TO THEIR ASSIGNED POST.`);
    else if (e.k === "hire") out.push(`${b.sign} IS HIRING. ${e.who.map(w => w.toUpperCase()).join(", ")} HAS BEEN REASSIGNED. NOBODY ASKED WHY.`);
    else if (e.k === "expand") out.push(`${b.sign} HAS OPENED A SECOND LOCATION: ${where(e.unit)}. GROWTH IS PERMITTED. FOR NOW.`);
  }
  for (const b of block.biz) {
    if (!inHere(b.units)) continue;
    if (b.status === "THRIVING") out.push(`${b.sign} IS THRIVING. THE DEPARTMENT WILL BE IN TOUCH ABOUT THE TAX.`);
    else if (b.status === "STRUGGLING") out.push(`${b.sign} IS STRUGGLING. THE SHUTTERS HAVE BEEN MEASURED.`);
  }
  const toLet = Object.entries(block.units).filter(([u, x]) => x.s === "TO LET" && inHere([u])).length;
  if (toLet && !here) out.push(`${toLet} STOREFRONT${toLet === 1 ? "" : "S"} TO LET. DISSATISFACTION IS THE ONLY QUALIFICATION.`);
  return out;
}
// Overheard: gossip for the social panel's feed.
export function gossipLines(block) {
  if (!block) return [];
  const out = [];
  for (const b of block.biz) {
    if (b.staff.length) out.push(`OVERHEARD AT ${b.sign}: ${b.staff[0][1].toUpperCase()} SAYS THE NEW JOB IS FINE. THE TONE WAS LOGGED.`);
    if (b.status === "NEW") out.push(`OVERHEARD: ${b.who.toUpperCase()} QUIT. JUST WALKED OUT. OPENED A ${b.label} ON THE PARADE.`);
  }
  for (const c of block.closed.slice(-3)) out.push(`OVERHEARD: ${c.sign} IS GONE. ${c.who.toUpperCase()} IS BACK AT THE OLD POST. NOBODY MENTIONS IT.`);
  return out;
}
