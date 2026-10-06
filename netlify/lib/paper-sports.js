// SPORTS for THE DAILY COMPLIANCE (docs/PAPER.md): the leagues, the Departmental Cup, the
// tennis ladder, the Pit, the weekend race and the aquarium's plaques, as they stood when the
// edition went to press. Pure given the day's civic block (the published summary's .civic) and
// the press time in machine hours; every line is the sim's own result, no invented play.
import * as L from "../../src/city/leagues.js";
import { decidedAt, sportTableAt, cupTableAt, leaguesView } from "../../src/city/civic.js";
import { cardFor, resultLine as pitLine, billLine } from "../../src/city/pit.js";
import { standings as raceStandings, racerName, lastRace, nextRace, resultLine as raceLine, fmt as raceFmt } from "../../src/city/race.js";

const plural = (n, one, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;
const ORD = (n) => `${n}${n % 10 === 1 && n !== 11 ? "ST" : n % 10 === 2 && n !== 12 ? "ND" : n % 10 === 3 && n !== 13 ? "RD" : "TH"}`;
export const LEAGUE_HREF = (sp) => `#city/league/${sp}`;

const resultText = (m) => {
  const w = L.winnerOf(m), sp = m.sport;
  const [a, b] = m.sides, [x, y] = m.score;
  const stage = m.stage && m.stage !== "regular" ? `${L.STAGE_NAME[m.stage]}: ` : "";
  if (!w) return `${stage}${L.sportTeamName(a, sp)} ${x}, ${L.sportTeamName(b, sp)} ${y}. LEVEL.`;
  const wi = m.sides.indexOf(w);
  return `${stage}${L.sportTeamName(w, sp)} ${m.score[wi]}, ${L.sportTeamName(m.sides[1 - wi], sp)} ${m.score[1 - wi]}${m.tiebreak ? " (ON THE DEPARTMENT'S TIEBREAK)" : ""}.`;
};

// The best line in a decided match's box score, by the sport's MVP measure.
function starOf(m, rosters) {
  const box = L.boxScore(m, rosters);
  let best = null;
  box.sides.forEach((lines, s) => lines.forEach(x => {
    const v = L.MVP_VALUE[m.sport]({ hr: 0, rbi: 0, runs: 0, h: 0, pts: 0, reb: 0, ast: 0, passTd: 0, rushTd: 0, recTd: 0, passYds: 0, rushYds: 0, recYds: 0, sacks: 0, int: 0, goals: 0, assists: 0, cs: 0, saves: 0, ...x });
    if (!best || v > best.v) best = { v, x, team: m.sides[s] };
  }));
  if (!best) return null;
  const { x } = best, sp = m.sport;
  const stat = sp === "baseball" ? (x.ip ? `${x.ip} INNINGS, ${plural(x.k || 0, "STRIKEOUT")}` : `${x.h || 0} FOR ${x.ab || 0}, ${plural(x.hr || 0, "HOME RUN")}, ${x.rbi || 0} RBI`)
    : sp === "basketball" ? `${x.pts || 0} POINTS, ${x.reb || 0} REBOUNDS, ${x.ast || 0} ASSISTS`
      : sp === "football" ? (x.pos === "K" ? `${plural(x.fg || 0, "FIELD GOAL")}` : `${(x.passYds || 0) + (x.rushYds || 0) + (x.recYds || 0)} YARDS, ${plural((x.passTd || 0) + (x.rushTd || 0) + (x.recTd || 0), "TOUCHDOWN")}`)
        : x.pos === "GK" ? `${plural(x.saves || 0, "SAVE")}` : `${plural(x.goals || 0, "GOAL")}, ${plural(x.assists || 0, "ASSIST")}`;
  return { name: String(x.name).toUpperCase(), team: L.sportTeamName(best.team, sp), stat };
}

// block: the day's civic block; T: press time in machine hours; T0: the last edition's press time.
// -> {season, leagues: [...], cup, tennis, pit, race, headlines: [{kind, text, weight, href}]}
export function sportsSection(block, T, T0) {
  const out = { leagues: [], cup: null, tennis: null, pit: null, race: null, headlines: [] };
  const lg = block?.leagues;
  const h = Math.max(0, Math.min(24, T - (block?.day - 1) * 24));
  if (lg && leaguesView(block)) {
    const V = leaguesView(block);
    out.season = lg.season;
    for (const sp of L.SPORTS) {
      const done = decidedAt(block, sp, h);
      const fresh = done.filter(m => (m.day - 1) * 24 + m.to > T0);
      const latest = (fresh.length ? fresh : done).slice(-5).reverse();
      const table = sportTableAt(block, sp, h);
      const stats = done.length ? L.seasonStats(sp, done, V.rosters[sp]) : { players: {} };
      const leaders = L.leadersOf(sp, stats.players, 3).slice(0, 3).filter(c => c.rows.length)
        .map(c => ({ label: c.label, rows: c.rows.map(x => ({ name: String(x.name).toUpperCase(), team: L.sportTeamName(x.team, sp), value: x[c.key] })) }));
      const featured = latest.find(m => m.stage === "final") || latest[0];
      const star = featured ? starOf(featured, V.rosters[sp]) : null;
      const sl = lg.sports?.[sp] || {};
      const next = [];
      for (let d = block.day; d <= block.day + 3 && next.length < 3; d++) {
        for (const s of L.slotsOn(sp, d)) {
          if ((d - 1) * 24 + s.from <= T || next.length >= 3) continue;
          const stage = L.stageOf(sp, s.md, lg.season - 1);
          if (stage === "off") continue;
          const pairs = stage === "regular" ? L.roundOf(lg.season - 1, sp, s.md).slice(0, 2) : [];
          next.push({ day: d, at: s.from, stage: L.STAGE_NAME[stage], text: pairs.length ? pairs.map(([a, b]) => `${L.sportTeamName(a, sp)} V ${L.sportTeamName(b, sp)}`).join("; ") : `${L.STAGE_NAME[stage]} AT ${L.SPORT[sp].ground}` });
        }
      }
      out.leagues.push({
        sport: sp, name: L.SPORT[sp].name, ground: L.SPORT[sp].ground, href: LEAGUE_HREF(sp), stage: sl.stage || null,
        champion: sl.champion ? L.sportTeamName(sl.champion, sp) : null,
        results: latest.map(resultText),
        table: table.map(r => ({ pos: r.pos, team: L.sportTeamName(r.id, sp), p: r.p || 0, w: r.w || 0, d: r.d || 0, l: r.l || 0, pts: r.pts || 0, form: r.form || "" })),
        leaders, star, next,
      });
      const fin = fresh.find(m => m.stage === "final");
      if (fin && L.winnerOf(fin)) out.headlines.push({ kind: "champion", sport: L.SPORT[sp].name, team: L.sportTeamName(L.winnerOf(fin), sp), weight: 90, href: LEAGUE_HREF(sp), text: `${L.sportTeamName(L.winnerOf(fin), sp)} WIN THE ${L.SPORT[sp].name} FINAL` });
      else if (fresh.length) {
        const m = fresh[fresh.length - 1], w = L.winnerOf(m);
        if (w) out.headlines.push({ kind: "result", sport: L.SPORT[sp].name, winner: L.sportTeamName(w, sp), loser: L.sportTeamName(L.loserOf(m), sp), score: `${Math.max(...m.score)}-${Math.min(...m.score)}`, margin: Math.abs(m.score[0] - m.score[1]) / Math.max(1, ...m.score), stage: m.stage !== "regular" ? L.STAGE_NAME[m.stage] : null, ground: L.SPORT[sp].ground, weight: (m.stage === "semi" ? 38 : 26) + Math.min(10, Math.abs(m.score[0] - m.score[1])), href: LEAGUE_HREF(sp), text: resultText(m), tiebreak: Boolean(m.tiebreak) });
      }
    }
    const cup = cupTableAt(block, h);
    out.cup = { href: "#city/league/cup", rows: cup.slice(0, 10).map((r, i) => ({ pos: i + 1, team: L.teamName(r.id), pts: r.pts })), last: lg.cup?.last ? { season: lg.cup.last.season, champion: L.teamName(lg.cup.last.champion) } : null };
    const run = L.ladderRun(V.tennis, V.season, T);
    const tm = run.matches.filter(m => (m.day - 1) * 24 + m.to > T0).slice(-3).reverse();
    const nm = (k) => String(run.info.get(k)?.name || k).toUpperCase();
    out.tennis = { href: "#city/league/tennis", ladder: run.ladder.slice(0, 8).map((k, i) => ({ rung: i + 1, name: nm(k), w: run.stats[k]?.w || 0, l: run.stats[k]?.l || 0 })),
      results: tm.map(m => `${nm(m.win === 0 ? m.a : m.b)} BEAT ${nm(m.win === 0 ? m.b : m.a)}${m.sets?.length ? ` ${m.sets.map(s => s.join("-")).join(" ")}` : ""}${m.moved ? ", AND TAKES THE RUNG" : ""}.`) };
    const pr = L.pitRun(V.season, T);
    out.pit = { href: "#city/league/pit", rank: pr.rank.slice(0, 5).map((r, i) => ({ pos: i + 1, name: String(r.name).toUpperCase(), w: r.w, l: r.l, d: r.d, pts: r.pts })), results: [], next: [] };
  }
  // THE PIT's card (clock-only): the last card's results, the next card's bill.
  const today = Math.floor(T / 24) + 1;
  out.pit ||= { href: "#city/league/pit", rank: [], results: [], next: [] };
  for (let d = today; d > today - 8; d--) {
    const card = cardFor(d);
    if (!card) continue;
    const done = card.filter(b => (d - 1) * 24 + b.from + 2 / 3 <= T);
    if (!done.length) continue;
    out.pit.results = done.map(pitLine).reverse();
    out.pit.when = d;
    if (done.some(b => (d - 1) * 24 + b.from + 2 / 3 > T0) && done.find(b => b.main)) {
      out.headlines.push({ kind: "pit", weight: 40, href: "#city/league/pit", text: `THE PIT: ${pitLine(done.find(b => b.main)).replace(/\.$/, "")}` });
    }
    break;
  }
  for (let d = today; d < today + 8; d++) {
    const card = cardFor(d);
    if (!card) continue;
    const ahead = card.filter(b => (d - 1) * 24 + b.from > T);
    if (ahead.length) { out.pit.next = ahead.map(billLine); out.pit.nextDay = d; break; }
  }
  // THE WEEKEND RACE (clock-only)
  const last = lastRace(T), nxt = nextRace(T);
  out.race = { href: "#heights", last: last ? { day: last.day, name: last.name, line: raceLine(last), podium: last.results.filter(x => x.place && x.place <= 3).map(x => ({ place: x.place, name: racerName(x.slug), time: raceFmt(x.total) })) } : null,
    next: nxt ? { day: nxt.day, name: nxt.name } : null,
    standings: raceStandings(T).slice(0, 5).map((r, i) => ({ pos: i + 1, name: racerName(r.slug), pts: r.pts, wins: r.wins })) };
  if (last && last.starts.length && last.starts[last.starts.length - 1].at > T0) out.headlines.push({ kind: "race", weight: 35, href: "#heights", text: `${racerName(last.results.find(x => x.place === 1)?.slug || "")} WINS THE ${last.name}` });
  return out;
}

// The aquarium's plaques (records passed by the server's replay of the catch): -> rows
export function aquariumRecords(tanks, speciesName = (sp) => String(sp).toUpperCase(), sinceDay = -Infinity) {
  const rows = [];
  for (const [sp, t] of Object.entries(tanks || {})) {
    const r = t?.record;
    if (!r) continue;
    rows.push({ species: speciesName(sp), holder: r.holder, weight: `${(r.cw / 100).toFixed(2)} LB`, length: `${(r.tl / 10).toFixed(1)} IN`, day: r.day, fresh: Number(r.day) > sinceDay, href: "#aquarium" });
  }
  return rows.sort((a, b) => (b.day || 0) - (a.day || 0));
}
export { ORD };
