// The views' single door into the simulation (sim.js, contract in docs/CITY_SPEC.md).
// Everything the map and the district views read goes through here. Pure, no DOM.

import * as SIM from "./sim.js";
import { jobWord } from "./emergence.js";

export const { DISTRICTS, PLACES, JOBS, BUS, LOOP_LINE, STATIONS, STATION_ORDER, TRAINS, TRAIN, BUILDINGS, BUILDING, HEADWAY, OPEN_LOTS, GAMES, GAME_VENUE, lotPhase, civicState, LOT_BREAK, LOT_BUILD, LINES, LINE, STOPS, linesOn, stationName } = SIM;
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));
// Where a rider physically is (whereAt's atDistrictId). v1 called it "bus".
export const ON_LOOP = "loop";
export const isOnLoop = (at) => at === ON_LOOP || at === "bus";

export const placeName = (id) => PLACES[id]?.name || String(id || "").toUpperCase();
export const placeCap = (id) => PLACES[id]?.cap || 0;
export const placeKind = (id) => PLACES[id]?.kind || "place";
export const districtName = (id) => (isOnLoop(id) ? "THE LOOP" : DISTRICT[id]?.name || String(id || "").toUpperCase());
export const buildingsOf = (districtId) => (DISTRICT[districtId]?.buildings || []).map(id => BUILDING[id]);
export const buildingOfPlace = (placeId) => BUILDING[PLACES[placeId]?.building] || null;
export const placesOf = (districtId) => DISTRICT[districtId]?.places || [];
export const districtCap = (districtId) => placesOf(districtId).reduce((n, p) => n + placeCap(p), 0);

// Dev only (City.jsx sets it from #city?at=HH:MM): shifts the machine clock so a given
// hour can be inspected. Always 0 in production, where every viewer shares one clock.
let offsetMs = 0;
export function setClockOffset(ms) { offsetMs = ms || 0; setPlanClockOffset(offsetMs); }
// Real ms that move today's machine clock to hh:mm (the next occurrence, not the past).
// wd (1-7, optional): on the next machine day with that weekday (the fixtures keep a week).
export function offsetFor(hh, mm = 0, realMs = Date.now(), wd = null) {
  const mt = SIM.machineClock(realMs).mt;
  let want = Math.floor(mt / 24) * 24 + hh + mm / 60;
  if (want < mt) want += 24;
  if (wd) while (SIM.weekdayOf(Math.floor(want / 24) + 1) !== wd) want += 24;
  return ((want - mt) * 3600000) / SIM.DEFAULT_SCALE;
}

// -> {day, hour, minute, shift, mt}; mt is what whereAt takes.
export function clockAt(realMs) {
  const c = SIM.machineClock(realMs + offsetMs);
  return { day: c.day, hour: c.hour, minute: c.minute, shift: c.shift, mt: c.mt };
}

// A stand-in from the day summary's crowds (crowd.js) knows its own way.
export const whereOf = (subject, mt) => (subject?.crowd ? subject.at(mt) : SIM.whereAt(subject, mt));
// A stand-in: drawn as a dot, never opened, never listed.
export const isCrowd = (subject) => Boolean(subject?.crowd);
// Which floor of its place's building a subject keeps while there (stable per stay).
export const floorFor = (subject, placeId) => SIM.floorOf(placeId, SIM.keyOf(subject), SIM.SEED, subject);
export const stationOf = (districtId) => STATIONS[districtId] || null;
// Where the subject physically is: a district id, or "loop" while riding.
export const atDistrict = (w) => w.atDistrictId || w.districtId;
export const jobOf = (subject) => SIM.assignJob(subject);
// Which building (and floor, and room) a census entry counts toward: the one the subject is
// on a floor of, or the one it is walking into from the street ("arrive") or out of
// ("leave") inside that building's district. One rule for every count the city shows:
// the header, the building rooms, the district's building list, the 3D floor labels.
export function roomIn(w, s) {
  if (!w) return null;
  if (w.activity !== "commute") return w.buildingId ? { buildingId: w.buildingId, floor: w.floor, placeId: w.placeId, mode: "here" } : null;
  if (w.sub !== "walking" || w.leg === "pod") return null;   // in a spur's pod: at no door
  const at = atDistrict(w);
  const to = PLACES[w.placeId], from = PLACES[w.fromPlaceId];
  if (to?.building && to.district === at) return { buildingId: to.building, floor: floorFor(s, w.placeId), placeId: w.placeId, mode: "arrive" };
  if (from?.building && from.district === at) return { buildingId: from.building, floor: floorFor(s, w.fromPlaceId), placeId: w.fromPlaceId, mode: "leave" };
  return null;
}

// "Radiant Systems Engineer // RANK: CHIEF OF THE CORE"
export function jobLine(subject) {
  // EMERGENCE (emergence.js): a post in an industry the city grew, from the day's published summary
  const em = jobWord(summaryOf(clockAt(Date.now()).day)?.emerge, SIM.keyOf(subject));
  if (em) return em;
  const j = jobOf(subject);
  return j.rankTitle && j.rankTitle !== j.title ? `${j.title.toUpperCase()} // ${j.rankTitle.toUpperCase()}` : j.title.toUpperCase();
}
// "ON SHIFT // RADIANT CORE, THE WORKS."
export const activityLine = (subject, mt) => SIM.statusLine(subject, mt);

// The Loop, for the renderers: trains now, the platform board, and the PA.
export const trainsAt = (mt) => SIM.trainsAt(mt);
// Every line's trains (the Loop's rows and each shuttle's, with `line`), and any stop's board.
export const lineTrainsAt = (mt) => SIM.lineTrainsAt(mt);
export const stopTimetable = (stopId, mt, n) => SIM.stopTimetable(stopId, mt, n);
export const timetable = (stationId, mt, n) => SIM.timetable(stationId, mt, n);
export const loopEvents = (fromMt, toMt) => SIM.loopEvents(fromMt, toMt);
// The grounds' fixtures: the game on at a place now, and the PA's kickoff, score and final lines.
// A fixture the league plays (the day's civic block, civic.js) names its teams: the scoreboard's
// sides, the status, the PA. Without the day's summary (legacy mode) the generic sides play.
export const civicOf = (day) => (import.meta.env?.DEV && typeof window !== "undefined" && window.__HVI_CIVIC_PREVIEW__) || summaryOf(day)?.civic || null;   // dev: a civic block to preview (the leagues before they open)
export function leagueAt(placeId, mt) {
  const T = SIM.toHours(mt);
  return leagueMatchAt(civicOf(Math.floor(T / 24) + 1), placeId, T);
}
export const gameAt = (placeId, mt) => withLeague(SIM.gameAt(placeId, mt), mt);
function withLeague(g, mt) {
  if (!g) return g;
  const m = leagueAt(g.placeId, mt);
  if (!m || (m.slotFrom ?? m.from) !== g.from) return g;
  if (m.sport) return withSport(g, m);
  const names = m.sides.map(teamName), shorts = m.sides.map(teamShort), S = SIM.SIDES[g.kind];
  let { status, short } = g;
  if (S) {
    status = status.replace(S[0][0], names[0]).replace(S[1][0], names[1]);
    short = short.replace(S[0][1], shorts[0]).replace(S[1][1], shorts[1]);
  } else if (g.kind === "hoops") {
    const [a, b] = hoopGames(m, g.game - 1);
    status = `${status} // GAMES: ${shorts[0]} ${a}, ${shorts[1]} ${b}`;
    short = `${shorts[0]} ${a}-${b} ${shorts[1]} // G${g.game} ${g.score[0]}-${g.score[1]}`;
  }
  return { ...g, league: m, sides: shorts, status, short };
}
// A league match on the board (the leagues, from season 13): the sport's teams on the scoreboard.
function withSport(g, m) {
  const names = m.sides.map(id => sportTeamName(id, m.sport)), shorts = m.sides.map(teamShort), S = SIM.SIDES[g.kind];
  let { status, short } = g;
  const stage = m.stage !== "regular" ? `${STAGE_NAME[m.stage]} // ` : "";
  if (S) {
    status = stage + status.replace(S[0][0], names[0]).replace(S[1][0], names[1]);
    short = short.replace(S[0][1], shorts[0]).replace(S[1][1], shorts[1]);
  } else if (g.kind === "hoops") {
    status = `${stage}LEAGUE GAME ${m.j + 1}, FIRST TO 21 // ${names[0]} ${g.score[0]}, ${names[1]} ${g.score[1]}`;
    short = `${shorts[0]} ${g.score[0]}-${g.score[1]} ${shorts[1]} // G${m.j + 1}`;
  }
  return { ...g, league: m, sides: shorts, status, short };
}
// The league table as it stands at machine time mt (the day's block plus every whistle so far):
// -> [{id, pos, short, pts, ...}] | null
export function leagueTableAt(mt) {
  const T = SIM.toHours(mt), d0 = Math.floor(T / 24), block = civicOf(d0 + 1);
  if (block?.leagues) return sportTableAt(block, "baseball", T - d0 * 24).map(r => ({ ...r, short: teamShort(r.id) }));   // the Diamond's board: baseball
  return block ? tableAt(block, T - d0 * 24).map(r => ({ ...r, short: teamShort(r.id) })) : null;
}
// The PA's lines for a fixture the league plays: kickoff and final name the teams and the stage.
export function gameEvents(fromMt, toMt) {
  const out = SIM.gameEvents(fromMt, toMt).map(e => {
    const m = leagueAt(e.placeId, e.kind === "end" ? e.t - 1e-6 : e.t + 1e-6);
    if (!m) return e;
    if (m.sport) return sportEvent(e, m);
    const S = SIM.SIDES[m.kind], names = m.sides.map(teamName), venue = SIM.GAME_VENUE[e.placeId];
    if (e.kind === "start") return { ...e, text: `${venue}: ${STAGE_NAME[m.stage]}, ${names[0]} V ${names[1]}. ${S ? e.text.replace(S[0][0], names[0]).replace(S[1][0], names[1]) : e.text}` };
    if (e.kind === "end") return { ...e, league: m, text: finalLine(m) };
    return { ...e, text: S ? e.text.replace(S[0][0], names[0]).replace(S[1][0], names[1]) : e.text };
  });
  return [...out, ...leagueFinals(fromMt, toMt)].sort((a, b) => a.t - b.t);
}
// The leagues' PA (from season 13): kickoff names the sport's teams; the final names the result, the
// stage and, on a matchday with ties behind closed doors, the first of the other results.
function sportEvent(e, m) {
  const S = SIM.SIDES[m.kind], names = m.sides.map(id => sportTeamName(id, m.sport)), venue = SIM.GAME_VENUE[e.placeId];
  const sub = (t) => (S ? t.replace(S[0][0], names[0]).replace(S[1][0], names[1]) : t);
  if (e.kind === "start") return { ...e, text: `${venue}: ${SPORT[m.sport].name} ${STAGE_NAME[m.stage]}, ${names[0]} V ${names[1]}. ${sub(e.text)}` };
  if (e.kind === "end") return { ...e, league: m, text: sportFinalLine(m) };
  return { ...e, text: sub(e.text) };
}
function sportFinalLine(m) {
  const venue = SIM.GAME_VENUE[m.placeId], w = m.score[0] > m.score[1] ? m.sides[0] : m.score[1] > m.score[0] ? m.sides[1] : m.tiebreak;
  const tail = m.stage === "final" ? `${sportTeamName(w, m.sport)} ARE ${SPORT[m.sport].name} CHAMPIONS. THE TROPHY HAS BEEN RETAINED BY THE DEPARTMENT.`
    : m.stage === "semi" ? `${sportTeamName(w, m.sport)} ADVANCE TO THE FINAL. THE OTHERS ADVANCE TO WORK.`
      : "THE TABLE HAS BEEN UPDATED. SO HAS THE CUP.";
  return `FINAL AT ${venue}: ${sportMatchLine(m)}. ${tail}`;
}
// Finals the grounds' own fixtures do not call: every league game at the Courts, and the ties played
// behind closed doors (one line a matchday, at its whistle).
function leagueFinals(fromMt, toMt) {
  const a = SIM.toHours(fromMt), b = SIM.toHours(toMt), out = [];
  for (let d0 = Math.floor(a / 24); d0 * 24 < b; d0++) {
    const block = civicOf(d0 + 1), V = block?.leagues && leaguesView(block);
    if (!V) continue;
    for (const sp of SPORTS) {
      const today = V.all[sp].filter(m => m.day === d0 + 1);
      if (sp === "basketball") {
        for (const m of today) { const t = d0 * 24 + m.to - 0.02; if (t >= a && t < b) out.push({ t, kind: "end", placeId: m.placeId, league: m, text: sportFinalLine(m) }); }
        continue;
      }
      const shut = today.filter(m => !m.featured);
      if (!shut.length) continue;
      const t = d0 * 24 + shut[0].to + 0.02;
      if (t >= a && t < b) out.push({ t, kind: "score", placeId: shut[0].placeId, text: `ELSEWHERE IN ${SPORT[sp].name}, BEHIND CLOSED DOORS: ${shut.slice(0, 2).map(m => `${teamShort(m.sides[0])} ${m.score[0]}, ${teamShort(m.sides[1])} ${m.score[1]}`).join("; ")}${shut.length > 2 ? `; ${shut.length - 2} MORE ON FILE` : ""}. THE FACILITY IS NOT OPEN TO THE PUBLIC.` });
    }
  }
  return out;
}
function finalLine(m) {
  const venue = SIM.GAME_VENUE[m.placeId], w = m.score[0] > m.score[1] ? m.sides[0] : m.score[1] > m.score[0] ? m.sides[1] : m.tiebreak;
  const tail = m.stage === "final" ? `${teamName(w)} ARE CHAMPIONS. THE TROPHY HAS BEEN RETAINED BY THE DEPARTMENT.`
    : m.stage === "semi" ? `${teamName(w)} ADVANCE TO THE FINAL. THE OTHERS ADVANCE TO WORK.`
      : "THE TABLE HAS BEEN UPDATED. SO HAVE THE FILES.";
  return `FINAL AT ${venue}: ${matchLine(m)}. ${tail}`;
}
export const occupancyAt = (subjects, mt) => SIM.occupancy(subjects, mt);

// Relationships bias where friends spend their leisure. Every page that reads the city
// through here (the map, the street, the quest log) loads the same published snapshots.
import { ensureSocial } from "./socialClient.js";
// ... and the published plans: the day's city built once server side (planClient.js), so
// no view pays the whole roster's day build. Without one the sim builds the day locally.
import { startPlans, setPlanClockOffset, summaryOf } from "./planClient.js";
import { leagueMatchAt, tableAt, teamName, teamShort, hoopGames, matchLine, STAGE_NAME, sportTableAt, leaguesView, sportMatchLine } from "./civic.js";
import { SPORTS, SPORT, sportTeamName } from "./leagues.js";
if (typeof window !== "undefined") { ensureSocial(); startPlans(); }
