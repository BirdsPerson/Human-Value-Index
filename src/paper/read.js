// THE DAILY COMPLIANCE, read side (docs/PAPER.md "Reading"). Pure: no DOM, no React, so
// scripts/check-paper.mjs runs it on a built edition.
//
// An edition is stored as printed, in ALL CAPS (v1 and v2 alike). The reader turns a printed line
// into segments a person can read: sentence case for the copy (headlines and kickers keep their
// caps; the renderer decides which is which), proper names restored, and every name the paper
// knows linked to where it goes: a figure to their file, a team to its table, a district to the
// city at that place, a venue to its building, an institution to its room.
//
//   entsOf(data)            -> the name table for one edition: {UPPER: {h, n?}}
//   matcherOf(ents)         -> a compiled matcher (one regex, longest name first)
//   segments(text, m, seen) -> [{t, h?}] (seen: the names already linked in this block, linked once)
//   briefOf(ed)             -> TODAY IN 30 SECONDS: [{text, h, act}]
//   nextOf(story, ed)       -> one next step for a story: {act, h}

// The city's institutions and rooms, as the copy names them, and the route that answers each.
// Every route here is one the app answers (check-paper holds them to validHref).
export const GLOSSARY = {
  "THE DEPARTMENT": { n: "the Department" }, "THE OVERLORD": { n: "the Overlord" },
  "THE PIT": { h: "#city/league/pit" }, "THE OCTAGON": { h: "#city/league/pit" },
  "THE ASSEMBLY": { h: "#assembly" }, "THE DOCKET": { h: "#docket" }, "THE COUNCIL": { h: "#elections" }, "THE POLLS": { h: "#elections" },
  "THE TREASURY": { h: "#economy" }, "HUMAN VALUE INDEX": { h: "#market" }, "THE HUMAN VALUE INDEX": { h: "#market" },
  "THE INDEX": { h: "#market", n: "the Index" }, "THE MARKET": { h: "#market" }, "THE STABILIZER": { h: "#market" },
  "THE AQUARIUM": { h: "#aquarium" }, "THE WATERS": { h: "#fish" }, "THE MOUNTAIN": { h: "#heights" }, "THE WEEKEND RACE": { h: "#heights" },
  "INTAKE": { h: "#arrivals", n: "Intake" }, "THE PROCESSING HALL": { h: "#arrivals" },
  "THE MALL": { h: "#enterprise" }, "THE SMALL BUSINESS REGISTER": { h: "#enterprise" },
  "THE ARCADE": { h: "#city/strip/the-arcade" }, "THE LANES": { h: "#bowling" }, "THE DEPARTMENT LINKS": { h: "#golf" },
  "THE CARD ROOM": { h: "#cards" }, "THE TENNIS LADDER": { h: "#city/league/tennis" }, "THE DEPARTMENTAL CUP": { h: "#city/league/cup" },
  "ELECTRIC BASEMENT TV": { h: "#city/arts/studio-block", n: "Electric Basement TV" }, "EBTV": { h: "#city/arts/studio-block", n: "EBTV" },
  "PREFECT DIRECTIVES": { h: "#prefects", n: "Prefect directives" }, "THE PREFECT": { h: "#prefects", n: "the Prefect" },
  "NEW YORK": { n: "New York" },
};
// Every text colour the paper's stylesheet uses, on the surface it sits on (Paper.jsx puts the paper
// on --panel; a selected tab or an action is --accent-ink on --accent). check-paper holds each to
// WCAG AA in every theme, and fails on a colour in the stylesheet that is not listed here.
export const PAPER_PAIRS = [["--fg", "--panel"], ["--fg-dim", "--panel"], ["--fg-mute", "--panel"], ["--accent", "--panel"],
  ["--warn", "--panel"], ["--harm", "--panel"], ["--accent-ink", "--accent"]];
// the external channel (THE SET's CH 9 and the city's TVs show it): opened in a new tab
export const EBTV_WATCH = "https://electricbasement.tv/watch?utm_source=hvi&utm_medium=paper&utm_campaign=hvi-paper";

const ACRONYMS = new Set(["HVI", "EBTV", "TV", "TVS", "UTC", "DJ", "HQ", "RBI", "MVP", "CEO", "AI", "UK", "USA", "NYC", "NFL", "NBA", "MLB", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "PSI", "OK"]);
const PROPER = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER", "I"]);
const SMALL = new Set(["OF", "AND", "THE", "AT", "IN", "ON", "FOR", "A", "AN", "DE", "LA", "VON", "VAN", "DA", "DU", "DEL", "TO", "V"]);
const up = (s) => String(s ?? "").toUpperCase();
// printed in capitals (a word with a digit in it, like PARCEL 0xAD06, does not count either way)
export const shouty = (s) => { if (typeof s !== "string") return false; const w = s.replace(/\S*\d\S*/g, " "); return /[A-Z]/.test(w) && !/[a-z]/.test(w); };
const stripQ = (n) => String(n).replace(/\s*\([^)]*\)\s*$/, "");
export const slugOf = (name) => {
  const s = stripQ(name).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return ({ "john-f-kennedy": "jfk", "vladimir-putin": "putin" })[s] ?? s;
};

// one word of a name in title case: "HOUSE" -> "House", "IRENE'S" -> "Irene's", "JR." -> "Jr.", "0XAD06" kept
function titleWord(w, first) {
  if (!w) return w;
  if (/\d/.test(w)) return w.replace(/^0X/, "0x");
  if (ACRONYMS.has(w.replace(/[^A-Z]/g, ""))) return w;
  if (!first && SMALL.has(w)) return w.toLowerCase();
  return w.split(/(?=[-])/).map(p => p.replace(/^(-?)(\p{L})(.*)$/u, (_, d, a, b) => d + a + b.toLowerCase())).join("");
}
// a name in title case; a trailing descriptor in brackets reads in lower case: "Aurum (the floor, tier checked)"
export function titleCase(s) {
  const m = /^(.*?)(\s*\(.*\))?$/.exec(String(s));
  const words = m[1].split(/(\s+)/);
  let first = true;
  const head = words.map(w => { if (/^\s+$/.test(w) || !w) return w; const r = titleWord(w, first); first = false; return r; }).join("");
  return head + (m[2] ? m[2].toLowerCase() : "");
}
// a run of copy (no names in it) in lower case, acronyms, days and months kept
function lowerRun(s) {
  return s.replace(/[\p{L}\d][\p{L}\d'.]*/gu, (w) => {
    const bare = w.replace(/[.']+$/, "");
    if (/\d/.test(w)) return w.replace(/^0X/, "0x");
    if (ACRONYMS.has(bare) || bare === "I") return w;
    if (PROPER.has(bare)) return bare[0] + bare.slice(1).toLowerCase() + w.slice(bare.length);
    return w.toLowerCase();
  });
}

// ---- the name table -------------------------------------------------------------------------------
// data: the API's answer ({edition, ents?}). The edition's own ents (v2) or the ones the API looked
// up for a v1 edition, then everything the edition's listings name themselves.
export function entsOf(data) {
  const ed = data?.edition || data;
  const out = {};
  const add = (k, h, n, p) => { k = up(k).trim(); if (!k || k.length < 3 || out[k]) return; out[k] = { ...(h ? { h } : {}), ...(n ? { n } : {}), ...(p ? { p: 1 } : {}) }; };
  const fig = (name, key) => { if (!name) return; add(name, `#market/${key || slugOf(name)}`); };
  for (const [k, v] of Object.entries(GLOSSARY)) add(k, v.h, v.n);
  for (const src of [ed?.ents, data?.ents]) for (const [k, v] of Object.entries(src || {})) add(k, v.h, v.n, v.p);
  for (const d of ed?.city?.districts || []) add(d.name, d.href || `#city/${d.id}`);
  for (const lg of ed?.sports?.leagues || []) {
    add(lg.ground, lg.href);
    for (const r of lg.table || []) { add(r.team, lg.href); if (/^THE \S+ \S+/.test(r.team)) add(r.team.slice(4), lg.href); }   // headlines drop the THE
    for (const c of lg.leaders || []) for (const r of c.rows) fig(r.name);
    if (lg.star) fig(lg.star.name);
    for (const d of lg.divisions || []) { add(d.name, d.href); add(d.ground, d.href); }
  }
  for (const r of ed?.sports?.cup?.rows || []) add(r.team, ed.sports.cup.href);
  for (const r of ed?.sports?.tennis?.ladder || []) fig(r.name);
  for (const r of ed?.sports?.pit?.rank || []) fig(r.name);
  for (const r of ed?.sports?.race?.standings || []) fig(r.name);
  for (const r of ed?.sports?.race?.last?.podium || []) fig(r.name);
  for (const t of ed?.sports?.tournaments || []) add(t.name, t.href);
  for (const x of [...(ed?.markets?.up || []), ...(ed?.markets?.down || [])]) add(x.name, x.href);
  for (const c of ed?.politics?.council || []) if (c.key) fig(c.name, c.key);
  for (const p of ed?.politics?.prefects || []) add(p.prefect, "#prefects");
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function matcherOf(ents) {
  const keys = Object.keys(ents).sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(`(?<![\\p{L}\\d])(?:${keys.map(esc).join("|")})(?![\\p{L}\\d])`, "gu") : null;
  return { ents, re };
}

// -> [{t, h?}]. Shouty copy is re-cased (sentence case, names restored); copy already in mixed case
// keeps its case and only gains links. seen: a Set of names already linked in this block.
export function segments(text, m, seen = new Set(), opts = {}) {
  const s = String(text ?? "");
  if (!s) return [];
  const loud = shouty(s), U = up(s);
  const hits = [];
  if (m?.re && U.length === s.length) { m.re.lastIndex = 0; for (let x; (x = m.re.exec(U));) hits.push([x.index, x[0]]); }
  const out = [];
  let at = 0;
  const plain = (t) => { if (t) out.push({ t: loud ? lowerRun(t) : t }); };
  for (const [i, k] of hits) {
    plain(s.slice(at, i));
    const e = m.ents[k], raw = s.slice(i, i + k.length);
    let t = !loud ? raw : e.n || titleCase(raw);
    if (loud && /^the /i.test(t) && !e.n) t = "the" + t.slice(3);
    const link = e.h && !seen.has(k) && !opts.nolink;
    if (link) seen.add(k);
    out.push(link ? { t, h: e.h, k } : { t });
    at = i + k.length;
  }
  plain(s.slice(at));
  if (loud) {
    // sentence starts: the first letter, and the first after . ! ? and a space
    let start = true;
    for (const seg of out) {
      seg.t = seg.t.replace(/[\p{L}\d]|[.!?](?=\s)/gu, (c) => {
        if (/[.!?]/.test(c)) { start = true; return c; }
        if (start) { start = false; return c.toUpperCase(); }
        return c;
      });
    }
  }
  return out;
}
// the names a headline carries, each linked once: [{t, h}] (IN THIS STORY under a headline that is
// itself one link)
export function namesIn(text, m, seen = new Set()) {
  return segments(text, m, seen).filter(x => x.h);
}
// plain text of segments (the brief, aria labels)
export const textOf = (segs) => segs.map(x => x.t).join("");
// a printed line read aloud as one string
export const readable = (s, m) => textOf(segments(s, m, new Set(), { nolink: true }));

// ---- one next step per story --------------------------------------------------------------------
const SPORT_HREF = { BASEBALL: "#city/league/baseball", BASKETBALL: "#city/league/basketball", FOOTBALL: "#city/league/football", SOCCER: "#city/league/soccer" };
export function nextOf(h, ed) {
  const k = h?.kind;
  if (k === "result" || k === "champion" || k === "pyramid") return { act: "See the table", h: SPORT_HREF[h.sport] || h.href };
  if (k === "pit") return { act: "See the Pit's next card", h: "#city/league/pit" };
  if (k === "race") return { act: "See the mountain and the standings", h: "#heights" };
  if (k === "tournament") return { act: "See the leaderboard", h: h.href };
  if (k === "directive") return { act: "Read the directives", h: "#prefects" };
  if (k === "mood") { const d = (ed?.city?.districts || []).find(x => h.text.includes(x.name)); return { act: `Go to ${d ? titleCase(d.name).replace(/^The /, "the ") : "the district"}`, h: d ? (d.href || `#city/${d.id}`) : "#city" }; }
  if (k === "arrivals") return { act: "Meet the new files", h: "#arrivals" };
  if (k === "shop") return { act: "Visit the shop", h: h.href };
  if (k === "index" || k === "market" || k === "stabilizer") return { act: "Open the market", h: "#market" };
  if (k === "assembly") return { act: "See the vote", h: "#assembly" };
  if (k === "election") return { act: "See the new council", h: "#elections" };
  if (k === "record") return { act: "See the tanks", h: "#aquarium" };
  if (k === "river") return { act: "Go fishing", h: "#fish" };
  if (k === "emergence" || k === "plaza") return { act: "See it in the city", h: h.href || "#city" };
  if (k === "notice") return { act: "Try it", h: h.href || "#paper" };
  return { act: "Read more", h: h?.href || "#city" };
}

// ---- TODAY IN 30 SECONDS ------------------------------------------------------------------------
// The three to five things that happened, a plain line and one tap each, from the edition alone
// (so an archived edition reads the same brief it would have on its day).
export function briefOf(ed, m) {
  const out = [];
  const line = (s) => readable(String(s).replace(/[.!]+$/, ""), m) + ".";
  const lead = ed?.front?.lead;
  if (lead) out.push({ text: line(lead.text), ...nextOf(lead, ed) });
  for (const h of (ed?.front?.stories || []).slice(0, 2)) out.push({ text: line(h.text), ...nextOf(h, ed) });
  const mk = ed?.markets;
  if (mk) {
    const top = mk.up?.[0];
    out.push({ text: `The Human Value Index is at ${mk.level} (${mk.chg}).${top ? ` Biggest riser: ${readable(top.name, m)}, ${top.chg}.` : ""}`, act: "Open the market", h: top?.href || "#market" });
  }
  const c = (ed?.classifieds || []).find(x => /^(VOTE|ENTER)$/.test(x.act)) || (ed?.classifieds || [])[0];
  if (c) out.push({ text: `You can take part: ${readable(c.title, m).replace(/^./, ch => ch.toLowerCase())}.`, act: titleCase(c.act).replace(/^./, ch => ch.toUpperCase()), h: c.href });
  return out.slice(0, 5);
}
