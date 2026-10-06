// DEPARTMENT MAIL, the post itself (docs/design/COMMS.md, layer 1). PURE: lettersFor(E) turns one
// real day's events into that day's letters for one file, the same events giving the same letters,
// byte for byte (scripts/check-mail.mjs). The events are gathered by netlify/lib/mail-events.js from
// what the city has already published: today's DAILY COMPLIANCE (its lead, its classifieds, its
// sports, its markets, its prefects), the file's holdings on THE MARKET, the leagues' calendar, the
// shops' season, the EB SHOP's stock, the file's assigned flat, the open tournaments' calendar and the
// file's own tournament results.
//
// The rules (Scott's, for anything said in the city):
//   - nobody writes but the Department's own offices and the city's own characters: the EBSN hosts,
//     the prefects (machines), and the neighbours, who are invented here (NEIGHBOURS) and are nobody
//     on file. A living person never writes, speaks or is quoted. No letter carries a quotation mark.
//   - every line passes the paper's own filter (paper.js printable: no quote marks, no line that
//     labels anybody by being alive or not).
//   - at most PER_DAY letters a real day (src/mail/mail.js), plus the orientation letter once.
//   - one action per letter, always one of the site's own rooms.
import { PER_DAY, validAction } from "../../src/mail/mail.js";
import { printable } from "./paper.js";
import * as SIM from "../../src/city/sim.js";
import * as L from "../../src/city/leagues.js";
import { PREFECT, DIRECTIVES } from "../../src/city/prefectData.js";
import { INDUSTRIES } from "../../src/city/emergence.js";
import { LANES_DAY, LANES_JOBS } from "../../src/city/lanes.js";
import { PLAZA_DAY, PLAZA_JOBS } from "../../src/city/shorePlaza.js";
import { CAFE_DAY, CAFE_JOBS, CAFE_HREF } from "../../src/city/terminal.js";
import { CLOTHES, collectionOf, inSeason } from "../../src/economy/shops.js";
import { STORES } from "../../src/economy/stores.js";
import { stepsFrom } from "../../src/firstDay.js";
import { eventsBetween, statusOf, whenText, hrefOf } from "../../src/tournament/calendar.js";   // THE DEPARTMENT'S OPEN TOURNAMENTS

const h32 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const h01 = (str) => h32(str) / 4294967296;
const pick = (list, key) => list[h32(key) % list.length];
const up = (s) => String(s ?? "").toUpperCase();
const cyc = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const last4 = (caseId) => String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();

// ---- who writes ---------------------------------------------------------------------------------------
// The offices (the Department's own) and the city's characters. Nothing else may sign a letter.
export const OFFICES = {
  dept: { name: "THE DEPARTMENT // CORRESPONDENCE", addr: "correspondence@dept.hvi" },
  labour: { name: "THE BUREAU OF LABOUR ALLOCATION", addr: "vacancies@labour.dept.hvi" },
  paper: { name: "THE DAILY COMPLIANCE, CIRCULATION", addr: "circulation@paper.dept.hvi" },
  market: { name: "THE MARKET, SURVEILLANCE DESK", addr: "surveillance@market.dept.hvi" },
  assembly: { name: "THE CLERK OF THE ASSEMBLY", addr: "clerk@assembly.dept.hvi" },
  leagues: { name: "THE LEAGUES' DRAFT OFFICE", addr: "draft@leagues.dept.hvi" },
  fixtures: { name: "THE FIXTURES SECRETARY", addr: "fixtures@leagues.dept.hvi" },
  aquarium: { name: "THE AQUARIUM, CURATOR'S OFFICE", addr: "curator@aquarium.dept.hvi" },
  arcade: { name: "TAGGED OUT, THE MARQUEE", addr: "marquee@arcade.dept.hvi" },
  terminal: { name: "THE TERMINAL, FRONT COUNTER", addr: "counter@terminal.dept.hvi" },
};
const STORE_ADDR = Object.fromEntries(STORES.map(s => [s.id, { name: `${s.name}, STOCK OFFICE`, addr: `stock@${s.id}.shops.dept.hvi` }]));
// The EBSN hosts (src/city/hostsLive.js): the shop channel's own cast, our characters.
export const HOST_NAMES = { dale: "DALE", carol: "CAROL", vern: "VERN", joan: "JOAN", hector: "HÉCTOR", asuka: "ASUKA" };
// THE NEIGHBOURS: invented for the post, nobody on file (check-mail holds that none shares a name
// with a figure on the roster). A neighbour is the same person every time they write to a flat.
export const NEIGHBOURS = [
  "MRS. ODELL PRAGER", "MR. AUGUSTIN VELLACOTT", "MS. NETTIE BRAMWELL-OKAFOR", "MR. CASIMIR DUNWOODY", "MRS. LORNA QUILLFEATHER",
  "MR. BARNABY OSTRANDER", "MS. PHILIPPA WRENCH", "MR. TEODOR HALLORAN-MBEKI", "MRS. GWENDOLYN STARLING-PIKE", "MR. OSWIN FAIRWEATHER",
  "MS. DELPHINE ARBOGAST", "MR. LUCIUS PENHALIGON",
];
export const SENDERS = new Set([...Object.values(OFFICES), ...Object.values(STORE_ADDR)].map(o => o.name)
  .concat(Object.values(HOST_NAMES).map(n => `${n}, EBSN`), NEIGHBOURS.map(n => n), Object.values(PREFECT).map(p => `PREFECT ${p.code} // ${p.name}`)));

// ---- the letter ----------------------------------------------------------------------------------------
// id: stable for the event (a notice about the same session or the same record is one letter, however
// many days the event runs: deliver() never adds an id twice); the daily ones carry the date.
function letter(E, { id, kind, folder, from, subject, body, action = null }, pri) {
  return { pri, m: { id, day: E.date, at: E.nowMs, kind, folder, from: { name: from.name, addr: from.addr || null }, subject: up(subject), body: body.filter(Boolean).map(up), action: action && validAction(action) ? action : null, read: false, archived: false, deleted: 0 } };
}

// ---- the orientation letter (once, the first day) -------------------------------------------------------
export function welcomeLetter(E) {
  const steps = stepsFrom({}, E.caseId).filter(s => !s.optional);
  const L1 = letter(E, {
    id: `welcome-${last4(E.caseId)}`, kind: "welcome", folder: "inbox", from: OFFICES.dept,
    subject: `WELCOME, SUBJECT ${last4(E.caseId)}. YOUR FIRST DAY, IN WRITING`,
    body: [
      `SUBJECT ${last4(E.caseId)}: YOUR FILE IS OPEN AND THIS IS YOUR DEPARTMENT MAIL. LETTERS ARRIVE A FEW AT A TIME, A FEW TIMES A DAY AT MOST. THE DEPARTMENT DOES NOT SPAM. IT SCHEDULES.`,
      "YOUR FIRST DAY, AS A CHECKLIST. NONE OF IT IS MANDATORY. ALL OF IT IS NOTED.",
      ...steps.map(s => `${s.n}. ${s.label}. ${s.note}`),
      "YOU MAY READ THIS MAIL FROM MY FILE, FROM THE BEIGE PC THE DEPARTMENT ISSUED TO YOUR FLAT, OR FROM THE PUBLIC PCS AT THE TERMINAL ON THE EAST BOARDWALK. ALL THREE ARE LOGGED.",
    ],
    action: { label: "COLLECT YOUR CYCLES", href: "#economy" },
  }, 1000);
  return L1.m;
}

// ---- the candidates ------------------------------------------------------------------------------------
function candidates(E) {
  const out = [], ed = E.edition;
  const K = `${E.caseId}|${E.date}`;

  // THE PAPER: today's lead
  const lead = ed?.front?.lead;
  if (lead?.text && printable(lead.text)) out.push(letter(E, {
    id: `paper-${ed.date || E.date}`, kind: "paper", folder: "notices", from: OFFICES.paper,
    subject: `THE DAILY COMPLIANCE, NO. ${ed.no}: ${lead.text}`,
    body: [lead.deck && printable(lead.deck) ? lead.deck : null, `TODAY'S EDITION IS ON THE STAND AND IN THIS TERMINAL. ${(ed.front.stories || []).length} MORE STORIES INSIDE, THE CLASSIFIEDS, THE SCORES, THE COMICS. THE PAPER IS FREE. IT IS PAID FOR BY YOUR ATTENTION.`],
    action: { label: "READ THE PAPER", href: "#paper" },
  }, 50));

  // THE MARKET: a big move in something the file holds, with the because
  const moves = (E.holdings || []).filter(x => Number.isFinite(x.chg) && Math.abs(x.chg) >= 0.05 && x.why && printable(x.why)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg) || (a.slug < b.slug ? -1 : 1));
  if (moves[0]) {
    const x = moves[0];
    out.push(letter(E, {
      id: `market-${E.date}-${x.slug}`, kind: "market", folder: "inbox", from: OFFICES.market,
      subject: `YOUR HOLDING: ${x.name} ${x.chg > 0 ? "UP" : "DOWN"} ${pct(x.chg)}`,
      body: [`YOU HOLD ${cyc(x.units)} SHARE${x.units === 1 ? "" : "S"} IN ${x.name}, NOW ${Number(x.price).toFixed(2)} A SHARE. THE PRICE MOVED ${pct(x.chg)} ON THE DAY.`, `BECAUSE: ${x.why}`,
        x.chg > 0 ? "THE DEPARTMENT DOES NOT CONGRATULATE YOU. IT CONGRATULATES THE PRICE." : "THE DEPARTMENT DOES NOT CONSOLE. IT RECORDS."],
      action: { label: "SEE THE LISTING", href: `#market/${x.slug}` },
    }, 90));
  }

  // JOBS: the openings the city really has today (the industries it grew, the new rooms, the shops
  // short of hands in the paper). The file is never considered. It may apply.
  const jobs = [];
  const placeHref = (pid) => { const p = SIM.PLACES[pid], b = p && SIM.BUILDING[p.building]; return b ? `#city/${p.district}/${b.id}` : "#city"; };
  const placeName = (pid) => { const n = up(String(SIM.PLACES[pid]?.name || pid).replace(/\s*\(.*\)$/, "")); return /^THE |'S\b/.test(n) ? n : `THE ${n}`; };
  const AIR_NAME = { drones: "DELIVERY DRONES", heli: "HELICOPTERS" };   // as the paper names them (paper.js IND_NAME)
  for (const [id, x] of Object.entries(ed?.city?.air ? INDUSTRIES : {})) if ((ed.city.air.open || []).includes(AIR_NAME[id])) for (const j of x.jobs) jobs.push({ key: j.id, title: up(j.title), at: placeName(j.place), href: placeHref(j.place) });
  for (const [day, list] of [[LANES_DAY, LANES_JOBS], [PLAZA_DAY, PLAZA_JOBS], [CAFE_DAY, CAFE_JOBS]]) if (E.machineDay >= day) for (const j of list) jobs.push({ key: j[0], title: up(j[1]), at: placeName(j[2]), href: j[0] === "cafe-attendant" ? CAFE_HREF : placeHref(j[2]) });
  for (const c of (ed?.classifieds || []).filter(c => c.cat === "SITUATIONS VACANT" && /^STAFF WANTED AT /.test(c.title))) jobs.push({ key: c.title, title: "STAFF", at: c.title.replace(/^STAFF WANTED AT /, ""), href: "#enterprise", line: c.text });
  if (jobs.length) {
    const j = pick(jobs, `${K}|job`);
    out.push(letter(E, {
      id: `job-${E.date}-${h32(j.key).toString(36)}`, kind: "job", folder: "offers", from: OFFICES.labour,
      subject: j.title === "STAFF" ? `${j.at} IS HIRING` : `${j.at} IS HIRING A ${j.title}`,
      body: [j.title === "STAFF" ? `${j.at} IS SHORT OF HANDS. YOUR FILE WAS NOT CONSIDERED, BUT YOU MAY APPLY.` : `${j.at} IS HIRING A ${j.title}. YOUR FILE WAS NOT CONSIDERED, BUT YOU MAY APPLY.`,
        j.line && printable(j.line) ? j.line : null,
        "APPLICATIONS ARE MADE IN PERSON, BY STANDING NEAR THE PREMISES. THE BUREAU WILL NOT FORWARD YOUR ENTHUSIASM. YOUR ASSIGNED POST IS UNCHANGED UNTIL THE DEPARTMENT SAYS OTHERWISE."],
      action: { label: "GO TO THE PREMISES", href: j.href },
    }, 50));
  }

  // THE SHOPS: the season's stock (the collection turns with the city's calendar)
  const col = collectionOf(E.machineDay);
  const stock = Object.entries(CLOTHES).filter(([, c]) => c[3] && c[3].includes(col) && inSeason({ seasons: c[3] }, col));
  if (stock.length) {
    const [id, c] = pick(stock, `${K}|stock`), store = STORES.find(s => s.id === c[1]);
    out.push(letter(E, {
      id: `shop-${E.date}-${id}`, kind: "shop", folder: "offers", from: STORE_ADDR[c[1]] || OFFICES.dept,
      subject: `IN FOR ${col}: ${c[0]}, ${cyc(c[2])} CYCLES`,
      body: [`THE ${col} STOCK IS ON THE RAILS AT ${store?.name || "THE SHOPS"}, ${store?.where || ""}. ${c[0]}, ${cyc(c[2])} CYCLES, WHILE THE SEASON LASTS. WHEN IT TURNS, IT GOES.`, "WHAT YOU WEAR NEVER RAISES YOUR SCORE. CONDUCT DOES. THE SHOPS ARE HAPPY TO TAKE YOUR CYCLES ANYWAY."],
      action: { label: "SEE THE RAIL", href: `#shop/${c[1]}` },
    }, 47));
  }

  // THE ASSEMBLY: a session sitting (one letter a session), or a result just in
  const A = ed?.politics?.assembly;
  if (A?.id && A.state === "OPEN") out.push(letter(E, {
    id: `assembly-${A.id}-open`, kind: "assembly", folder: "notices", from: OFFICES.assembly,
    subject: `THE ASSEMBLY SITS: SESSION ${A.id}`,
    body: [`SESSION ${A.id} IS OPEN. ${A.voters || 0} CITIZEN${A.voters === 1 ? " HAS" : "S HAVE"} VOTED SO FAR. ONE CITIZEN, ONE BALLOT, UP TO THREE REASONS. SPITE IS A REASON.`, ...(A.motions || []).slice(0, 3).map(mo => `ON THE BALLOT: ${mo.name}, ${mo.choices}.`).filter(printable), "THE RESULT IS NON-BINDING ON THE DEPARTMENT AND BINDING ON THE CITY."],
    action: { label: "CAST YOUR BALLOT", href: "#assembly" },
  }, 70));
  const adopted = (ed?.front ? [ed.front.lead, ...(ed.front.stories || [])] : []).find(h => h?.kind === "assembly");
  if (adopted?.text && printable(adopted.text)) out.push(letter(E, {
    id: `assembly-result-${h32(adopted.text).toString(36)}`, kind: "assembly", folder: "notices", from: OFFICES.assembly,
    subject: adopted.text, body: [adopted.deck, "THE MINUTES ARE FILED. THE DISSENT IS FILED SEPARATELY, AND LOWER."], action: { label: "SEE THE RESULT", href: "#assembly" },
  }, 75));

  // THE LEAGUES: the draft, when it is near (three real days of machine time)
  const season = L.entrySeasonAt(E.mt), draftDay = L.seasonStart(season), closeDay = L.entryCloseDay(season);
  if (draftDay - E.machineDay <= 180 && draftDay >= E.machineDay) out.push(letter(E, {
    id: `draft-${season}`, kind: "draft", folder: "notices", from: OFFICES.leagues,
    subject: `THE DRAFT: MACHINE DAY ${draftDay}`,
    body: [`THE LEAGUES DRAFT FOR SEASON ${season + 1} ON MACHINE DAY ${draftDay}. ENTRIES CLOSE ON MACHINE DAY ${closeDay}. BASEBALL, BASKETBALL, FOOTBALL, SOCCER AND THE TENNIS LADDER; TWO AT MOST.`, "ENTER YOUR CITIZEN FROM MY FILE. TALENT IS OPTIONAL. ATTENDANCE IS NOT."],
    action: { label: "ENTER A LEAGUE", href: "#file?at=leagues" },
  }, 65));

  // OPEN TOURNAMENTS (src/tournament/calendar.js): the next event a citizen can enter, a major first;
  // the file's own results (its honours, netlify/lib/tournament-awards.js) as personal letters
  const evs = eventsBetween(E.nowMs, E.nowMs + 36 * 3600000).filter(ev => statusOf(ev, E.nowMs) !== "closed" && statusOf(ev, E.nowMs) !== "closing")
    .sort((a, b) => Number(Boolean(b.major)) - Number(Boolean(a.major)) || a.opens - b.opens);
  if (evs[0]) {
    const ev = evs[0], open = statusOf(ev, E.nowMs) === "open";
    out.push(letter(E, {
      id: `tourney-${ev.id}`, kind: "tournament", folder: "notices", from: OFFICES.fixtures,
      subject: `YOU ARE INVITED: ${up(ev.name)}`,
      body: [`${up(ev.name)}, ${up(ev.venue)}. ${open ? "OPEN NOW" : `OPENS ${whenText(ev.opens)}`}, CLOSES ${whenText(ev.closes)}. EVERYONE PLAYS THE SAME SETUP; EVERY CARD IS REPLAYED BY THE DEPARTMENT BEFORE IT IS BELIEVED.`,
        ev.major ? "A MAJOR. THE WINNER'S FILE CARRIES THE LINE FOR GOOD. SO DOES THE LAST PLACE'S, IN A SMALLER FONT." : "ENTRY IS FREE. LOSING IS ALSO FREE."],
      action: { label: open ? "ENTER NOW" : "SEE THE EVENT", href: hrefOf(ev) },
    }, ev.major ? 62 : 54));
  }
  for (const h of (E.honours || []).slice(0, 3)) {
    if (!h?.id || !printable(up(h.line || "")) || !printable(up(h.name || ""))) continue;
    out.push(letter(E, {
      id: `honour-${h.id}-${h.div || "open"}`, kind: "honour", folder: "inbox", from: OFFICES.fixtures,
      subject: `YOUR RESULT: ${up(h.name)}${h.place ? `, PLACE ${h.place}` : ""}`,
      body: [up(h.line), "THE RESULT IS ON YOUR FILE. THE DEPARTMENT HAS NOTED THAT YOU TRIED."],
      action: { label: "MY FILE", href: "#file" },
    }, 92));
  }

  // TOURNAMENTS: the next card at THE PIT and the weekend race, as invitations to watch; a final, as a result
  const S = ed?.sports;
  if (S?.pit?.next?.length) {
    const main = S.pit.next[S.pit.next.length - 1];
    if (printable(main)) out.push(letter(E, {
      id: `pit-${S.pit.nextDay}`, kind: "tournament", folder: "notices", from: OFFICES.fixtures,
      subject: `YOU ARE INVITED: THE PIT, MACHINE DAY ${S.pit.nextDay}`,
      body: [`FRIDAY NIGHT AT THE PIT, MACHINE DAY ${S.pit.nextDay}, DOORS AT 20:00. THE MAIN EVENT: ${main}`, "THE CROWD MAY RISE. THE CROWD MAY NOT ENTER THE RING. YOUR ATTENDANCE IS ANTICIPATED."],
      action: { label: "SEE THE CARD", href: "#city/league/pit" },
    }, 55));
  }
  if (S?.race?.next?.name && printable(up(S.race.next.name))) out.push(letter(E, {
    id: `race-${S.race.next.day}`, kind: "tournament", folder: "notices", from: OFFICES.fixtures,
    subject: `YOU ARE INVITED: ${up(S.race.next.name)}`,
    body: [`THE WEEKEND RACE ON THE MOUNTAIN, MACHINE DAY ${S.race.next.day}. TWO RUNS, ONE CLOCK, NO APPEAL.`, "SPECTATORS STAND BEHIND THE FENCE. THE FENCE IS ALSO A SPECTATOR."],
    action: { label: "SEE THE MOUNTAIN", href: "#heights" },
  }, 52));
  const champ = (ed?.front ? [ed.front.lead, ...(ed.front.stories || [])] : []).find(h => h?.kind === "champion" || h?.kind === "result");
  if (champ?.text && printable(champ.text)) out.push(letter(E, {
    id: `result-${h32(champ.text).toString(36)}`, kind: "tournament", folder: "notices", from: OFFICES.fixtures,
    subject: `RESULT: ${champ.text}`, body: [champ.deck, "THE RESULT HAS BEEN ENTERED ON EVERY FILE CONCERNED, AND ON YOURS FOR COMPLETENESS."],
    action: { label: "THE STANDINGS", href: champ.href && validAction({ label: "x", href: champ.href }) ? champ.href : "#city/league" },
  }, 48));

  // RECORDS: the aquarium's plaque (a new record), the arcade's marquee (the day's top score)
  const holder = `SUBJECT ${last4(E.caseId)}`;
  for (const r of (S?.aquarium || []).filter(r => r.fresh)) {
    const mine = r.holder === holder;
    if (!printable(r.species)) continue;
    out.push(letter(E, {
      id: `record-aq-${h32(`${r.species}|${r.day}|${r.weight}`).toString(36)}`, kind: "record", folder: mine ? "inbox" : "notices", from: OFFICES.aquarium,
      subject: mine ? `YOUR ${r.species} IS ON THE PLAQUE` : `RECORD BROKEN: ${r.species}, ${r.weight}`,
      body: [mine ? `YOUR ${r.species}, ${r.weight}, ${r.length}, IS THE CITY RECORD. THE CATCH WAS REPLAYED BY THE DEPARTMENT AND FOUND TRUE. THE PLAQUE IS ENGRAVED. IT IS NOT PERMANENT.` : `THE CITY RECORD FOR ${r.species} NOW STANDS AT ${r.weight}, ${r.length}, LANDED BY ${r.holder}. REPLAYED AND FOUND TRUE.`,
        mine ? "SOMEBODY WILL TRY TO TAKE IT. THE DEPARTMENT WILL WRITE TO YOU WHEN THEY DO." : "THE WATERS ARE OPEN. RECORDS ARE PUBLIC. SO ARE FAILURES."],
      action: { label: "SEE THE TANKS", href: "#aquarium" },
    }, mine ? 95 : 45));
  }
  if (E.hunt?.top) out.push(letter(E, {
    id: `record-hunt-${E.hunt.day}`, kind: "record", folder: "notices", from: OFFICES.arcade,
    subject: `TAGGED OUT: THE MARQUEE STANDS AT ${cyc(E.hunt.top.score)}`,
    body: [`THE TOP SCORE ON TAGGED OUT FOR MACHINE DAY ${E.hunt.day} IS ${cyc(E.hunt.top.score)}, EVERY SHOT REPLAYED ON THE SERVER BEFORE IT WENT UP. THE CABINETS ARE IN THE BARS.`, "BEAT IT AND THE MARQUEE CHANGES. THE DEPARTMENT DOES NOT."],
    action: { label: "PLAY TAGGED OUT", href: "#hunt" },
  }, 30));

  // LETTERS: one a day at most, from a neighbour, a prefect or an EBSN host (letterOf picks the writer)
  const lt = letterOf(E);
  if (lt) out.push(lt);
  return out;
}

// ---- the letters from the city's characters ------------------------------------------------------------
const NEIGHBOUR_NOTES = [
  (n, t) => [`THE LIFT IN ${t} IS OUT AGAIN. I HAVE WRITTEN TO THE DEPARTMENT. THE DEPARTMENT WROTE BACK TO SAY IT HAD RECEIVED MY LETTER. I AM WRITING TO YOU BECAUSE YOU AT LEAST HAVE LEGS.`, "IF YOU SEE THE ENGINEER, TELL HIM THE THIRD FLOOR STILL EXISTS."],
  (n, t) => [`A PARCEL FOR YOUR FLAT WAS LEFT WITH ME. IT IS FROM THE DEPARTMENT, SO I HAVE NOT OPENED IT. IT TICKS, BUT POLITELY.`, "COLLECT IT WHEN YOU LIKE. I AM IN, ALWAYS. THAT IS ALSO ON MY FILE."],
  (n, t) => [`YOUR TELEVISION. THE SHOPPING CHANNEL. AT TWO IN THE MORNING. I DO NOT OBJECT TO EBSN, I OBJECT TO HEARING EVERY PRICE TWICE THROUGH THE WALL.`, "IF YOU MUST WATCH THE LIQUIDATION HOUR, WATCH IT QUIETLY. THE WALLS IN THIS BUILDING WERE ASSESSED AS ADEQUATE."],
  (n, t) => [`THE PLANT IN THE LOBBY OF ${t} IS DYING AND NOBODY WILL ADMIT TO BEING RESPONSIBLE FOR IT. I HAVE STARTED A ROTA. YOU ARE ON THURSDAYS.`, "IT NEEDS A CUP OF WATER AND SOME ENCOURAGEMENT. MOSTLY THE WATER."],
  (n, t) => [`THE BINS ARE NOW COLLECTED ON A SCHEDULE SET BY THE PREFECT, WHICH CHANGES WITHOUT NOTICE AS A MATTER OF POLICY. I HAVE TAPED THE CURRENT ONE TO THE DOOR OF THE CHUTE ROOM.`, "IT WILL BE WRONG BY TUESDAY. THAT IS NOT MY FAULT."],
  (n, t) => [`A FEW OF US WATCH THE LEAGUE ON THE BIG SET IN THE COMMON ROOM ON FIXTURE NIGHTS. YOU WOULD BE WELCOME. BRING SOMETHING FROM SAM'S IF YOU ARE GOING THAT WAY.`, "WE CHEER FOR WHOEVER THE DEPARTMENT RATES LOWER. IT IS A SMALL REBELLION. IT IS LOGGED."],
  (n, t) => [`DID YOU BORROW MY STEPLADDER. SOMEBODY ON THIS FLOOR DID, AND THE DEPARTMENT WILL NOT TELL ME WHO, ALTHOUGH IT CERTAINLY KNOWS.`, "RETURN IT TO THE LANDING. NO QUESTIONS. THE DEPARTMENT WILL ASK THEM ANYWAY."],
  (n, t) => [`THE INSPECTORS CAME THROUGH ${t} THIS MORNING. THEY MEASURED MY CURTAINS AND WROTE SOMETHING DOWN. I THOUGHT YOU SHOULD KNOW BEFORE THEY GET TO YOURS.`, "TIDY THE HALL. THEY LIKE A TIDY HALL. NOBODY KNOWS WHY."],
];
function letterOf(E) {
  const K = `${E.caseId}|${E.date}|letter`;
  const seen = E.seen || new Set();
  const out = [];
  if (E.apartment?.buildingName) {
    const A = E.apartment, t = A.buildingName;
    const n = NEIGHBOURS[h32(`${E.caseId}|${A.building}|neighbour|${Math.floor(h01(`${K}|n`) * 3)}`) % NEIGHBOURS.length];   // one of three neighbours per file
    const flat = `${1 + (h32(n) % 9)}${"ABCDEF"[h32(`${n}|f`) % 6]}`;
    const i = h32(`${K}|note`) % NEIGHBOUR_NOTES.length, note = NEIGHBOUR_NOTES[i](n, t);
    out.push(letter(E, {
      id: `neighbour-${E.date}`, kind: "letter", folder: "inbox", from: { name: n, addr: `flat-${flat.toLowerCase()}@${String(A.building || "tower").slice(0, 24)}.homes.dept.hvi` },
      subject: `FROM ${flat}, DOWN THE HALL`, body: [`DEAR NEIGHBOUR IN ${A.unit || "YOUR FLAT"},`, ...note, `${n}, FLAT ${flat}, ${t}`],
      action: A.href ? { label: "GO HOME", href: A.href.split("?")[0] } : null,
    }, 45));
  }
  const PF = E.edition?.politics?.prefects || [];
  if (PF.length) {
    const mine = PF.find(p => p.cast === `prefect:${E.apartment?.district}`);
    const p = mine || pick(PF, `${K}|prefect`);
    const P1 = Object.values(PREFECT).find(x => x.code === p.code);
    if (P1 && printable(p.line || "")) {
      const dir = Object.entries(DIRECTIVES).find(([, d]) => d.name === p.directive)?.[1];
      const sign = P1.signoff && !String(p.line).endsWith(P1.signoff) ? P1.signoff : null;
      out.push(letter(E, {
        id: `prefect-${P1.code}-${h32(`${p.directive}|${p.line}`).toString(36)}`, kind: "letter", folder: "inbox", from: { name: `PREFECT ${P1.code} // ${P1.name}`, addr: `${P1.code.toLowerCase()}@prefects.dept.hvi` },
        subject: `DIRECTIVE IN FORCE: ${p.directive}, ${p.district}`,
        body: [mine ? "CITIZEN OF MY DISTRICT." : "CITIZEN.", p.line, dir?.desc || null, sign],
        action: { label: "SEE THE PREFECTS", href: "#prefects" },
      }, 45));
    }
  }
  if (E.shopPicks?.length) {
    const host = pick(Object.keys(HOST_NAMES), `${K}|host`), item = pick(E.shopPicks, `${K}|item`);
    const title = up(item.title), price = item.price ? `$${item.price}` : null;
    if (printable(title)) out.push(letter(E, {
      id: `host-${E.date}-${host}`, kind: "letter", folder: "offers", from: { name: `${HOST_NAMES[host]}, EBSN`, addr: `${host}@ebsn.dept.hvi` },
      subject: `${HOST_NAMES[host]}'S PICK: ${title}`,
      body: [`${HOST_NAMES[host]} HERE, FROM THE SHOPPING CHANNEL. ONE THING FROM THE EB SHOP I WOULD PUT ON AIR TODAY: ${title}${price ? `, ${price}` : ""}.`, "IT IS ON THE WALL OF THE EB SHOP AT THE UNION, AND IT IS REAL: THE SHOP SHIPS IT. THE DEPARTMENT TAKES NO COMMISSION. IT TAKES NOTES.", `SEE YOU ON AIR, ${HOST_NAMES[host]}`],
      action: { label: "SEE IT IN THE EB SHOP", href: "#city/campus/eb-shop" },
    }, 44));
  }
  const fresh = out.filter(c => !seen.has(c.m.id));
  return fresh.length ? pick(fresh, K) : null;
}

// ---- the day's post -------------------------------------------------------------------------------------
// E: {caseId, date (the paper's date, America/New_York), nowMs, machineDay, mt, first (no post yet), seen (ids on file),
//     edition (today's DAILY COMPLIANCE, or the latest), holdings, apartment, shopPicks, hunt}
// -> letters, newest first: the orientation letter on the first day, then at most PER_DAY more. The day
//    is a mix, not a pile: the paper's lead, the best of the personal post (a holding, a record of
//    yours, a letter), the best offer (a job, the season's stock, a host's pick), the best notice (the
//    Assembly, the draft, a fixture, a record); an empty slot goes to the next best of the rest. One
//    letter per kind; a hashed nudge keeps the mix from being the same every day.
const GROUP = (m) => (m.kind === "paper" ? "paper" : m.folder === "inbox" ? "personal" : m.folder === "offers" ? "offer" : "notice");
export function lettersFor(E) {
  const seen = E.seen || new Set();   // ids already on file: a notice delivered once is not a candidate again
  const ranked = candidates(E).filter(c => !seen.has(c.m.id) && [c.m.subject, ...c.m.body].every(printable))
    .map(c => ({ ...c, r: c.pri + h01(`${E.caseId}|${E.date}|${c.m.id}`) * 12 }))
    .sort((a, b) => b.r - a.r || (a.m.id < b.m.id ? -1 : 1));
  const out = [], kinds = new Set(), taken = new Set();
  const take = (c) => { out.push(c.m); kinds.add(c.m.kind); taken.add(c.m.id); };
  for (const g of ["paper", "personal", "offer", "notice"]) { const c = ranked.find(x => GROUP(x.m) === g && !kinds.has(x.m.kind)); if (c && out.length < PER_DAY) take(c); }
  for (const c of ranked) { if (out.length >= PER_DAY) break; if (!taken.has(c.m.id) && !kinds.has(c.m.kind)) take(c); }
  const order = ranked.map(c => c.m.id);
  out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (E.first) out.unshift(welcomeLetter(E));
  return out.map((m, i) => ({ ...m, at: E.nowMs - i }));
}
