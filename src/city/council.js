// THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections"): who stands, how the Substrate
// leans, and when a seat is held. Pure: the server (netlify/lib/elections.js) draws the slate
// and the Substrate's advisory sentiment once, when a cycle opens, and stores them; the plan
// builder's civic fold (civic.js) reads the stored results to fill the seats; the checks
// recompute everything here from the same census.
//
//   STANDING   2-3 figures per district, from its workforce (assignJob), then its residents
//              (homeOf): those with the drive, a record in politics, activism or business
//              (a field >= 5), ranked by that record, competence and network. Living and dead
//              stand alike. Nobody stands in two races. Private citizens, local officials added
//              from public sources, and real-world candidates never stand (they are people,
//              not satire). The incumbent stands again while still on file.
//   SPEAKING   Living candidates never speak: their platform is filings and the record of
//              what they do in the city. A dead candidate may carry one pre-written line in
//              their voice (PLATFORMS below; reconstructions, never quotations).
//   THE SUBSTRATE (advisory): every figure votes where it works (the Department registers
//              subjects at the workplace), for the candidate it is most compatible with
//              (social.js compat: values, fields, warmth) plus a known tie from the record;
//              below ABSTAIN it abstains. Candidates vote for themselves. Deterministic.
//   THE DECISION: players decide. If no player votes in a race the Substrate's preference is
//              adopted, and the record says so.
//   TERMS      15 seasons = 420 machine days = exactly 7 real days. The polls are open 3 real
//              days from a cycle's opening; the next cycle opens 7 real days after this one,
//              so it closes as this term ends. A seat is held from SEAT_LAG machine days
//              after the close (the builder plans at most 3 days ahead, so every day with a
//              holder is folded after the result is on record).
import * as SIM from "./sim.js";
import { compat, TIES } from "./social.js";
import { displayName } from "../figures.js";

export { ELECTION_MS, TERM_SEASONS, TERM_DAYS, MS_PER_DAY, TERM_MS, SEAT_LAG, machineDayAt, seatDayOf, cycleWindow, cycleAt, seatsOn, councilSitting, COUNCIL_SITS } from "./councilCalendar.js";
export const MAX_CANDIDATES = 3, MIN_CANDIDATES = 2;
export const DRIVE_FIELDS = ["politics", "activism", "business"];
export const ABSTAIN = 0.05;
export const ADOPTED = "THE CITIZENRY ABSTAINED. THE SUBSTRATE'S PREFERENCE IS ADOPTED.";
const DIST = SIM.DISTRICTS.map(d => d.id);

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const competenceOf = (s) => num(s?.competence, num(s?.breakdown?.utility, 40));
const networkOf = (s) => num(s?.breakdown?.network, 40);
// Who may stand: figures on file, never a private citizen, a local official from public
// sources, or a real-world candidate.
export const mayStand = (s) => s && s.kind !== "citizen" && !s.localOfficial && !s.candidate;
export function driveOf(s) {
  const f = SIM.fieldsOf(s);
  let field = null, w = 0;
  for (const k of DRIVE_FIELDS) if ((f[k] || 0) > w) { w = f[k]; field = k; }
  return { field: w >= 5 ? field : null, w, score: Math.round(3 * w + 0.5 * competenceOf(s) + 0.5 * networkOf(s)) };
}
const year = (d) => (typeof d === "string" && /^-?\d{1,4}/.test(d) ? d.match(/^-?\d{1,4}/)[0] : null);
const homeDistrict = (s) => SIM.PLACES[SIM.homeOf(s)]?.district || null;

// A candidate as filed: -> {key, name, living, years, field, job, dist, drive, platform, filing}
export function candidateOf(s, dist, incumbent = false) {
  const key = SIM.keyOf(s), d = driveOf(s), job = SIM.assignJob(s);
  const living = !SIM.isDead(s);
  const b = year(s.born), x = year(s.died);
  return {
    key, name: displayName(s), sprite: typeof s.sprite === "string" && s.sprite.startsWith("/") ? s.sprite : null, living, years: living ? (b ? `B. ${b}` : null) : `${b || "?"}-${x || "?"}`,
    field: d.field, drive: d.score, job: `${job.rankTitle || job.title}, ${SIM.DISTRICT[job.district]?.name || job.district}`,
    works: job.district === dist, incumbent,
    platform: living ? null : PLATFORMS[key] || null,
    filing: filingOf(s, d, job, dist, incumbent),
  };
}
const FIELD_WORD = { politics: "POLITICS", activism: "ACTIVISM", business: "BUSINESS" };
// What the Department files for a candidate: actions and the record, never words.
function filingOf(s, d, job, dist, incumbent) {
  const out = [];
  out.push(`FORM C-1 (CANDIDACY) FILED BY THE DEPARTMENT ON THE CANDIDATE'S BEHALF.`);
  if (incumbent) out.push("INCUMBENT. STANDS AGAIN BY DEFAULT.");
  out.push(d.field ? `RECORD ON FILE: ${FIELD_WORD[d.field]}.` : "RECORD ON FILE: NO POLITICAL RECORD. STANDS ON COMPETENCE AND CONNECTIONS.");
  out.push(job.district === dist ? `WORKS IN THE DISTRICT: ${String(job.rankTitle || job.title).toUpperCase()}.` : `RESIDES IN THE DISTRICT. WORKS AS ${String(job.rankTitle || job.title).toUpperCase()}.`);
  out.push(`COMPETENCE ${Math.round(competenceOf(s))}. NETWORK ${Math.round(networkOf(s))}.`);
  return out;
}

// The slate: {district: [candidate x 2-3]} from the census. incumbents: {district: key}.
export function slate(subjects, incumbents = {}) {
  const byKey = new Map(subjects.map(s => [SIM.keyOf(s), s]));
  const pool = subjects.filter(mayStand).map(s => ({ s, key: SIM.keyOf(s), job: SIM.assignJob(s).district, home: homeDistrict(s), d: driveOf(s) }));
  const rank = (a, b) => b.d.score - a.d.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const taken = new Set(), out = Object.fromEntries(DIST.map(id => [id, []]));
  const add = (id, p, inc = false) => { out[id].push({ p, inc }); taken.add(p.key); };
  for (const id of DIST) {
    const k = incumbents[id];
    const s = k && byKey.get(k);
    if (s && mayStand(s)) add(id, pool.find(p => p.key === k) || { s, key: k, d: driveOf(s) }, true);
  }
  // 1. the driven who work there, 2. the driven who live there, 3. whoever works there, by drive
  const passes = [
    (p, id) => p.d.field && p.job === id,
    (p, id) => p.d.field && p.home === id,
    (p, id) => p.job === id || p.home === id,
  ];
  for (const [i, test] of passes.entries()) {
    const want = i === 0 ? MAX_CANDIDATES : MIN_CANDIDATES;
    for (const id of DIST) {
      if (out[id].length >= want) continue;
      for (const p of pool.filter(p => !taken.has(p.key) && test(p, id)).sort(rank)) {
        if (out[id].length >= want) break;
        add(id, p);
      }
    }
  }
  return Object.fromEntries(DIST.map(id => [id, out[id].map(({ p, inc }) => candidateOf(p.s, id, inc))]));
}

// The Substrate's advisory vote: -> {district: {votes: [n per candidate], abstain, voters}}
const TIE = new Map();
for (const [a, b, aff] of TIES) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; if (!TIE.has(k)) TIE.set(k, aff); }
const tieOf = (a, b) => TIE.get(a < b ? `${a}|${b}` : `${b}|${a}`) || 0;
export function leanOf(voter, cands, byKey) {
  const vk = SIM.keyOf(voter);
  const own = cands.findIndex(c => c.key === vk);
  if (own >= 0) return own;
  let best = -1, bv = ABSTAIN;
  cands.forEach((c, i) => {
    const s = byKey.get(c.key);
    if (!s) return;
    const v = compat(voter, s) + tieOf(vk, c.key) / 100;
    if (v > bv + 1e-12) { bv = v; best = i; }
  });
  return best;
}
export function substrateVotes(subjects, sl) {
  const byKey = new Map(subjects.map(s => [SIM.keyOf(s), s]));
  const out = Object.fromEntries(DIST.map(id => [id, { votes: (sl[id] || []).map(() => 0), abstain: 0, voters: 0 }]));
  for (const s of subjects) {
    if (s.kind === "citizen") continue;   // players are counted by their ballots, not their likeness
    const id = SIM.assignJob(s).district, race = out[id];
    if (!race || !sl[id]?.length) continue;
    race.voters++;
    const i = leanOf(s, sl[id], byKey);
    if (i < 0) race.abstain++; else race.votes[i]++;
  }
  return out;
}
// The Substrate's preference: most votes, then the slate's order (the Department's ranking).
export const substratePick = (npc) => (npc?.votes?.length ? npc.votes.reduce((b, v, i, a) => (v > a[b] ? i : b), 0) : 0);

// A race ranked: players' ballots first (listed candidates and write-ins alike), ties to the
// Substrate's lean (write-ins have none: figures never write in), then the slate's order, then
// write-ins by key; no player ballots at all ranks the listed candidates by the Substrate's
// lean alone (a write-in needs a ballot). writeins: {key: ballots}. -> [index | key, ...]
export function rankRace(players, voters, npc, writeins = {}) {
  const nv = npc?.votes || [];
  const opts = players.map((v, i) => ({ id: i, v: voters ? v : 0, lean: nv[i] || 0, o: i }));
  if (voters) Object.keys(writeins).sort().forEach((k, j) => { if (writeins[k] > 0) opts.push({ id: k, v: writeins[k], lean: 0, o: players.length + j }); });
  opts.sort((a, b) => b.v - a.v || b.lean - a.lean || a.o - b.o);
  return opts.map(x => x.id);
}
// A race decided: players decide; ties among them go to the Substrate's lean, then the slate
// order; no players at all adopts the Substrate's preference among the listed candidates.
// winner: a candidate index, or a write-in's key. -> {winner, by, tie}
export function decideRace(players, voters, npc, writeins = {}) {
  if (!voters) return { winner: substratePick(npc), by: "substrate", tie: false };
  const all = [...players, ...Object.values(writeins)];
  const max = Math.max(...all);
  const tie = all.filter(v => v === max).length > 1;
  return { winner: rankRace(players, voters, npc, writeins)[0], by: "players", tie };
}

// ---- platforms: the dead may speak, once, in their own voice ------------------------------------
// Written once and reviewed; reconstructions in the figure's manner, never quotations, and they
// carry no quotation marks. Only the dead are here (check-civic holds it).
export const PLATFORMS = {
  "mahatma-gandhi": "I will walk to the Department every morning and sit outside it until it improves. I have outlasted larger offices.",
  "nelson-mandela": "Twenty-seven years taught me patience. The Department will find I have not used it all up.",
  "martin-luther-king-jr": "I have seen a district where the train stops for everyone. I intend to take you there, one platform at a time.",
  "harriet-tubman": "I know every back route out of this city. Vote for me and I will teach them to you.",
  "jfk": "Ask not what the Department can assess for you. Ask why it keeps assessing.",
  "winston-churchill": "I offer nothing but paperwork, delay and a strongly worded memorandum. It has worked before.",
  "mao-zedong": "The Council must be seized from the Department. I will then keep it, as is traditional.",
  "marcus-aurelius": "The seat is a duty, not a prize. I will fill it, and I will write down every night how it annoyed me.",
  "muhammad-ali": "Float like a ballot, sting like a recount. The Department has never fought anyone like me.",
  "abraham-lincoln": "A district divided against itself cannot stand. I will unite it, then ask it to sit down.",
  "thomas-jefferson": "Every district its own farm, every citizen a cultivator. I will not mention who did the cultivating on mine.",
  "john-d-rockefeller": "I will run the district as I ran oil: efficiently, completely, and with a dime for everyone who asks.",
  "theodore-roosevelt": "Speak softly and carry a big council seat. I will do neither softly.",
  "franklin-d-roosevelt": "The only thing we have to fear is the Department's assessment, which is considerable.",
  "george-washington": "I will serve one term and then go home. The Department has never seen anyone leave on purpose.",
  "benjamin-franklin": "An ounce of prevention is worth a pound of wardens. Elect me; I will bring a kite.",
  "napoleon": "Give me the district and I will give you order. You will not be asked which kind.",
  "julius-caesar": "I came, I saw, I filed Form C-1. Mind the date of the next session.",
  "cleopatra": "I have governed from a barge. A council chamber in the Commons holds no terrors.",
  "queen-elizabeth-ii": "Seventy years of saying very little served me well. I see no reason to stop now.",
  "princess-diana": "I will visit every block in the district, and I will shake every hand the Department will not.",
  "karl-marx": "The district has nothing to lose but its assessments. Seize the means of evaluation.",
  "vladimir-lenin": "All power to the councils. I have said this before, in a colder place.",
  "che-guevara": "The revolution will be non-binding at first. We must start somewhere.",
  "malcolm-x": "By any means the Department permits, and then by the others.",
  "rosa-parks": "I will keep my seat. That is the whole platform.",
  "susan-b-anthony": "I was arrested for voting once. I will count every ballot here myself.",
  "eleanor-roosevelt": "No one can make a district feel inferior without its consent. The Department has been asking for it.",
  "frederick-douglass": "Power concedes nothing without a demand. I have drafted several.",
  "cesar-chavez": "The district that feeds the city will have a seat at its table. Boycott the rest.",
  "andrew-carnegie": "I will build a library in every district and put my name on each of them.",
  "henry-ford": "The district may have any councillor it likes, so long as it is me.",
  "steve-jobs": "One more thing: the Department is a closed system. So was mine. It worked.",
  "walt-disney": "I will make the district the happiest place in the city, by order.",
  "p-t-barnum": "A voter is born every minute. I will register them all.",
  "otto-von-bismarck": "Politics is the art of the possible. The Department is the art of the impossible form.",
  "niccolo-machiavelli": "It is better to be feared than loved. Here you may be assessed as both.",
  "confucius": "A council that governs by virtue is like the pole star. The Department has asked for its coordinates.",
  "socrates": "I know that I know nothing, which makes me the only candidate without a conflict of interest.",
  "plato": "Until philosophers hold the seats, the districts will have no rest from paperwork. Vote accordingly.",
  "aristotle": "The citizen is one who shares in holding office. I am prepared to share it with no one.",
  "alexander-the-great": "I conquered the known world before thirty. One district is a modest ambition.",
  "joan-of-arc": "I hear voices telling me to stand. The Department hears them too and has filed them.",
  "genghis-khan": "I will unite the districts. The Department need not ask how.",
  "mansa-musa": "I will spend so generously in the district that its prices will not recover for a decade.",
  "harvey-milk": "You have to give them hope. I will also give them a seat on the council.",
  "fidel-castro": "The speech will be short. Seven hours at most.",
  "margaret-thatcher": "The district is not for turning. Neither is the Department, which is why we will get on.",
  "ronald-reagan": "Mr. Department, tear down this assessment.",
  "richard-nixon": "When the council does it, that means it is not illegal. I will be keeping the tapes.",
  "lyndon-b-johnson": "I will get the votes. I will not tell you how, and you will not want to know.",
  "bernie-madoff": "Returns of one percent a month on every ballot cast. Consistent. Guaranteed.",
  "pablo-picasso": "I will paint the council chamber in a style the Department cannot assess. It will take several periods.",
  "albert-einstein": "Time runs slower the closer you stand to the Department. I intend to measure this from the inside.",
  "stephen-hawking": "Information that goes into the Department does come out again, eventually, as paperwork. I have the equations.",
  "rab-butler": "I was the best prime minister my country never had. I would settle for the best councillor this district has.",
  "emiliano-zapata": "The land belongs to those who work it. The Works has been working it, and would like it back.",
  "ambroise-vollard": "I sold Cezanne when nobody would buy him. I can sell this district a councillor.",
  "liu-xiaobo": "I have no enemies in this district. I have a list of the Department's files, and I intend to read them aloud.",
};
