// THE DEPT OF PLANNING (the master plan, 2026-09-30; Scott: "Maybe we should hire a city
// planner"). The office stands in the Commons beside THE ASSEMBLY (venueSim.js). In its drawing
// office two advocates argue every development the city votes on: ROBERT MOSES, who builds, and
// JANE JACOBS, who defends the neighbourhood. Neither is on file; they are the Department's
// reconstructions of two positions, drawn at their lecterns (props, never subjects), and their
// lines are marked as reconstructions and never quoted (the rule for words in the manner of
// anyone who cannot speak for themselves: docs/CITY_SPEC.md "Council elections", PLATFORMS).
//
// THE HOOK FOR FUTURE SESSIONS (docs/planning/MASTER_PLAN.md "The Dept of Planning"):
//   - a motion's choices: add each choice id to POSITIONS with a Moses line and a Jacobs line;
//     planningLines() reads the session in progress (every choice) or decided (the winner).
//   - citizen proposals carried as acts (src/city/acts.js): BY_TYPE answers every BUILD, POLICY,
//     RENAME and EVENT act with the act's own title; nothing to add per proposal.
//   - the master plan's own moves: PLAN_LINES.
// City.jsx reads planningLines() into the PA (the Commons and the map, with the Assembly's).

import { paintAvatar } from "../sprites.js";

export const ADVOCATES = {
  moses: { name: "ROBERT MOSES", short: "R. MOSES", brief: "BUILD", spec: { skin: "fair", hair_style: "bald", hair_color: "grey", build: "broad", top_color: "charcoal", bottom_color: "charcoal", facial_hair: "none", accessory: "briefcase" } },
  jacobs: { name: "JANE JACOBS", short: "J. JACOBS", brief: "NEIGHBOURHOODS", spec: { skin: "fair", hair_style: "short", hair_color: "white", build: "slim", top_color: "oatmeal", bottom_color: "brown", facial_hair: "none", accessory: "glasses" } },
};
const R_M = "THE DEPARTMENT'S RECONSTRUCTION OF ROBERT MOSES (BUILD)", R_J = "THE DEPARTMENT'S RECONSTRUCTION OF JANE JACOBS (NEIGHBOURHOODS)";

// choice id -> [Moses, Jacobs]
export const POSITIONS = {
  golf: ["EIGHTEEN HOLES IS A PUBLIC WORK IF IT IS BIG ENOUGH. A PARKWAY TO THE FIRST TEE HAS ALREADY BEEN DRAWN.", "A COURSE IS A FENCE WITH A FLAG IN IT. NOBODY WATCHES A STREET FROM THE NINTH HOLE."],
  farm: ["A FARM IS LAND WAITING TO BE USED. A PARKING STRUCTURE HAS BEEN SKETCHED OVER IT, FOR LATER.", "A FARM WITH A STALL AT THE GATE PUTS EYES ON THE STREET AT DAWN. THE COMMONS GETS A REASON TO BE OUTSIDE."],
  "beach-resort": ["A LOW RESORT WASTES A BEACHFRONT. THE CAUSEWAY IT DESERVES IS IN A DRAWER.", "LOW BUILDINGS, A BAR ON THE SAND, CABANAS FOR RENT. THE BOARDWALK KEEPS ITS SUN. ACCEPTABLE."],
  "seaside-towers": ["TWO TOWERS ON A PODIUM. CALL IT THE FIRST STAGE.", "TOWERS SET BACK IN A PLAZA, A POOL NOBODY ELSE MAY USE. THIS HAS BEEN SEEN BEFORE. IT WAS CALLED RENEWAL."],
  "ski-resort": ["THREE LIFTS AND A LODGE. THE MOUNTAIN, FINALLY PUT TO WORK.", "WHO LIVES IN THE BUNKHOUSE, AND DOES THE LIFT RUN FOR THEM? THE QUESTION HAS BEEN FILED."],
  "mountain-lodge": ["A PRESERVE IS LAND WAITING FOR A HIGHWAY.", "TRAILS, A LOOKOUT, A PORCH. SMALL, OLD, CHEAP TO ENTER. APPROVED."],
};
// a carried act, by type -> [Moses, Jacobs]; {T} is the act's title
export const BY_TYPE = {
  BUILD: ["{T}: BUILD IT, AND BUILD THE ROAD TO IT FIRST.", "{T}: BUILD IT SMALL, BUILD IT MIXED, AND LEAVE THE OLD BUILDINGS STANDING BESIDE IT."],
  POLICY: ["{T}: A POLICY IS A PROJECT WITHOUT CONCRETE. UNMOVED.", "{T}: WHO ON THE STREET WAS ASKED? THE QUESTION HAS BEEN FILED."],
  RENAME: ["{T}: NAMES OUTLAST OBJECTIONS. THEY ALWAYS HAVE.", "{T}: A NAME IS FINE. A NEIGHBOURHOOD IS NOT A NAME."],
  EVENT: ["{T}: AN EVENT NEEDS A STADIUM. SITES ARE AVAILABLE.", "{T}: AN EVENT IN THE STREET IS THE STREET WORKING."],
};
// the master plan itself
export const PLAN_LINES = [
  [R_M, "THE PIT ON RECLAIMED WORKS LAND IS A PROPER PUBLIC WORK. IT SHOULD HAVE BEEN TWICE THE SIZE."],
  [R_J, "THE ESTATE GARDENS PUT GREEN WHERE PEOPLE ALREADY LIVE, NOT WHERE THEY MIGHT BE MOVED TO. MORE OF THIS."],
  [R_M, "THE FOOTHILLS ARE A BUFFER. A BUFFER IS A HIGHWAY THAT HAS NOT BEEN BUILT YET."],
  [R_J, "THE SCHOOL MOVED AWAY FROM THE FOUNDRY. THE CHILDREN WERE NOT CONSULTED. THEY WOULD HAVE AGREED."],
];

// -> PA lines: the session in progress (each choice, both advocates), else the decided one's
// winner, the latest acts, and one line on the master plan. view: /api/assembly's answer.
export function planningLines(view, acts = [], k = 0) {
  const out = [];
  const say = (who, text) => out.push(`DEPT OF PLANNING // ${who === "moses" ? R_M : R_J}: ${text}`);
  const s = view?.session;
  if (s?.state === "open") {
    const choices = s.id === "002" ? ["beach-resort", "seaside-towers", "ski-resort", "mountain-lodge"] : ["golf", "farm"];
    for (const c of choices) if (POSITIONS[c]) { say("moses", POSITIONS[c][0]); say("jacobs", POSITIONS[c][1]); }
  } else if (view?.result) {
    const won = view.result.winners ? Object.values(view.result.winners) : view.result.winner ? [view.result.winner] : [];
    for (const c of won) if (POSITIONS[c]) { say("moses", `ON THE RESULT: ${POSITIONS[c][0]}`); say("jacobs", `ON THE RESULT: ${POSITIONS[c][1]}`); }
  }
  for (const a of (Array.isArray(acts) ? acts : []).slice(-2)) {
    const t = BY_TYPE[a.type];
    if (!t) continue;
    const title = String(a.title || a.type).toUpperCase().slice(0, 60);
    say("moses", t[0].replace("{T}", title)); say("jacobs", t[1].replace("{T}", title));
  }
  const pl = PLAN_LINES[((k % PLAN_LINES.length) + PLAN_LINES.length) % PLAN_LINES.length];
  out.push(`DEPT OF PLANNING // ${pl[0]}: ${pl[1]}`);
  return out;
}

// ---- the drawing office (props.js merges these) ------------------------------------------------
// The room: the two advocates at their lecterns either side of a plan chest with the day's
// drawings, the planning officers at their desks, the public gallery's chairs in front.
export const PLANNING_ROOM_TYPE = { "planning-office": "planning" };
export const PLANNING_LOOK = { planning: ["#1a2024", "#2c363c"] };
export function planningPlans(PLANS, { A, M, P, SIDE }) {
  const desk = M(A("station", "type", "staff", 1), "desk", 1.75, SIDE);
  PLANS.planning = {
    back: { head: [P("advocate:moses", 1.3), P("planChest", 2.2), P("advocate:jacobs", 1.3)], unit: [desk] },
    front: { unit: [M(A("seat", "watch", "patron"), "chair", 1.05), desk, M(A("seat", "listen", "patron"), "chair", 1.05)] },
    solo: { head: [desk, P("advocate:moses", 1.3), P("advocate:jacobs", 1.3)], unit: [M(A("seat", "watch", "patron"), "chair", 1.05)] },
  };
}
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function text(c, s, x, y, px, col, align = "center") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}
const SHEETS = {};
const sheetOf = (id) => { if (!SHEETS[id] && typeof document !== "undefined") SHEETS[id] = paintAvatar(ADVOCATES[id].spec, 2); return SHEETS[id]; };
function advocate(id) {
  const A = ADVOCATES[id];
  return {
    back(c, X, Y, W, p) {
      const img = sheetOf(id), h = 48 * p, w = 32 * p, x = X + (W - w) / 2, y = Y - h - 2 * p;
      if (img) { c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, 32, 48, Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
      // the lectern in front of them, their brief on it
      const lw = Math.min(W - 2 * p, 20 * p), lx = X + (W - lw) / 2;
      R(c, "#5a4632", lx, Y - 18 * p, lw, 18 * p); R(c, "#3a2c1e", lx, Y - 18 * p, lw, 2 * p);
      text(c, A.short, lx + lw / 2, Y - 15 * p, 3.4 * p, "#fde68a");
      text(c, A.brief, lx + lw / 2, Y - 10 * p, 3 * p, id === "moses" ? "#fca5a5" : "#86efac");
    },
  };
}
export function planningPropDrawers() {
  return {
    "advocate:moses": advocate("moses"),
    "advocate:jacobs": advocate("jacobs"),
    planChest: {
      back(c, X, Y, W, p) {
        // a plan chest, the day's drawing pinned over it: the city's grid in blue
        R(c, "#4a5560", X + p, Y - 14 * p, W - 2 * p, 14 * p);
        for (let k = 1; k < 4; k++) R(c, "#36404a", X + p, Y - 14 * p + k * 3.5 * p, W - 2 * p, p);
        const bw = W - 6 * p, bx = X + 3 * p, by = Y - 42 * p;
        R(c, "#dbeafe", bx, by, bw, 22 * p);
        c.strokeStyle = "#1d4ed8"; c.lineWidth = Math.max(1, p * 0.5);
        for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(bx + (bw * k) / 6, by + p); c.lineTo(bx + (bw * k) / 6, by + 21 * p); c.stroke(); }
        for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(bx + p, by + (22 * p * k) / 4); c.lineTo(bx + bw - p, by + (22 * p * k) / 4); c.stroke(); }
        R(c, "#dc2626", bx + bw * 0.55, by + 8 * p, 4 * p, 4 * p);   // the site under discussion
        text(c, "THE MASTER PLAN", bx + bw / 2, by - 5 * p, 3.2 * p, "#e5e7eb");
      },
    },
  };
}
