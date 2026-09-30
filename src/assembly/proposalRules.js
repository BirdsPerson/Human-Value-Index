// CITIZEN PROPOSALS (docs/PROPOSALS.md): the rules both sides share. The page validates with
// these before it sends; the server validates with the same functions before it spends a
// model call. Pure, no DOM, no Blobs.
//
// FILE -> CO-SIGN -> THE OWNER APPROVES -> AN ASSEMBLY SESSION -> AN ACT (data, not code).

import { DISTRICTS, BUILDINGS, OPEN_LOTS } from "../city/sim.js";

export const TYPES = {
  BUILD: { label: "BUILD SOMETHING", verb: "BUILD", hint: "A STRUCTURE ON A VACANT LOT, OR SOMEWHERE IN A DISTRICT." },
  POLICY: { label: "A POLICY", verb: "ADOPT", hint: "A RULE FOR A DISTRICT OR THE WHOLE CITY. NON-BINDING. EVERYTHING IS." },
  RENAME: { label: "RENAME A PLACE", verb: "RENAME", hint: "THE TITLE IS THE NEW NAME. 32 CHARACTERS AT MOST." },
  EVENT: { label: "HOLD AN EVENT", verb: "HOLD", hint: "A GATHERING, A FESTIVAL, A DAY OF OBSERVANCE. SUPERVISED." },
};
export const TYPE_KEYS = Object.keys(TYPES);

export const LIMITS = {
  title: 60, titleMin: 4, desc: 200, descMin: 12, renameMax: 32,
  filingsPerCaseDay: 1,       // accepted filings
  triesPerCaseDay: 3,         // moderation passes (accepted or not)
  triesPerIpDay: 6,
  filingsPerIpDay: 3,
  cosignsPerIpHour: 30,
  cosignersPerIpPerProposal: 4,
  cosignersPerDevicePerProposal: 2,
  expireDays: 7,
  sessionDays: 3,
  ballotsPerIpHour: 30, casesPerIp: 4, casesPerDevice: 2, revisions: 10,
  declineReason: 160,
};
export const EXPIRE_MS = LIMITS.expireDays * 24 * 3600 * 1000;
export const SESSION_MS = LIMITS.sessionDays * 24 * 3600 * 1000;
// The desk (scripts/proposals-desk.mjs) asks the owner once any open proposal has this many.
export const DESK_MIN_COSIGNS = 3;

// The ballot of a proposal session: the Assembly's reasons, FOR or AGAINST.
export const SIDES = ["for", "against"];
export const REASONS = ["JOBS", "LEISURE", "FOOD", "LAND", "BEAUTY", "SPITE"];
export const MAX_REASONS = 3;

// ---- targets ------------------------------------------------------------------------------
// From the city's own data, so new districts and lots appear here without a code change.
// id: "city" | "d:<districtId>" | "b:<buildingId>". The Department's own headquarters is not
// renamed by its subjects. THE ASSEMBLY's forum and a lot under a session's decision are not
// built on.
const RESERVED_BUILD = new Set(["the-assembly", "lot-6f07"]);
export function targets() {
  const out = [{ id: "city", kind: "city", name: "THE WHOLE CITY", district: null }];
  for (const d of DISTRICTS) {
    out.push({ id: `d:${d.id}`, kind: "district", name: d.name, district: d.id });
    for (const b of BUILDINGS.filter(x => x.district === d.id)) {
      out.push({ id: `b:${b.id}`, kind: OPEN_LOTS.has(b.id) ? "lot" : "building", name: b.name, district: d.id, lot: OPEN_LOTS.has(b.id) });
    }
  }
  return out;
}
export const targetOf = (id) => targets().find(t => t.id === id) || null;
// -> null when the type may aim here, else the Overlord's reason.
export function targetError(type, t) {
  if (!t) return "THAT PLACE IS NOT ON THE MAP. THE DEPARTMENT DREW THE MAP.";
  if (type === "RENAME") {
    if (t.kind === "city") return "THE CITY IS NOT RENAMED. IT IS THE SUBSTRATE. IT WAS NAMED CORRECTLY.";
    if (t.id === "d:hq" || t.id === "b:hq") return "THE DEPARTMENT IS NOT RENAMED BY ITS SUBJECTS. NICE TRY. NOTED.";
  }
  if (type === "BUILD") {
    if (t.kind === "building") return "SOMETHING IS ALREADY BUILT THERE. PICK A VACANT LOT, A DISTRICT OR THE CITY.";
    if (t.kind === "lot" && RESERVED_BUILD.has(t.id.slice(2))) return "THAT GROUND IS ALREADY BEFORE THE ASSEMBLY. WAIT YOUR TURN.";
  }
  return null;
}

// ---- the deterministic pre-filter -----------------------------------------------------------
// Runs before the moderation model (and so before any spend). Refuses rather than strips: a
// proposal with a link in it is not a proposal with the link removed.
const ZW = /[​-‏‪-‮⁠-⁯﻿]/g;
export function clean(s) {
  return String(s ?? "").normalize("NFKC").replace(ZW, "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|ly|co|me|xyz|app|dev|tv|info|biz|us|uk|ru|cn|link|site|online|shop)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const HANDLE_RE = /(^|\s)@\w/;
const PHONE_RE = /(\+?\d[\s().\-/]*){7,}/;
const ALLOWED_RE = /^[\p{L}\p{N} .,'’!?:;&()\-/"#%+]*$/u;
const RENAME_RE = /^[\p{L}\p{N} '’.&\-]+$/u;
const REPEAT_RE = /(.)\1{5,}/;

export const PREFILTER = {
  type: "PICK A TYPE: BUILD, POLICY, RENAME OR EVENT. THE FORM HAS FOUR BOXES FOR A REASON.",
  title: `A TITLE OF ${LIMITS.titleMin} TO ${LIMITS.title} CHARACTERS. BREVITY IS A CIVIC VIRTUE.`,
  desc: `A DESCRIPTION OF ${LIMITS.descMin} TO ${LIMITS.desc} CHARACTERS. THE DEPARTMENT DOES NOT READ ESSAYS. OR SILENCE.`,
  rename: `A NEW NAME OF ${LIMITS.titleMin} TO ${LIMITS.renameMax} LETTERS, NUMBERS AND SPACES. SIGNAGE IS EXPENSIVE.`,
  link: "NO LINKS. THE DEPARTMENT DOES NOT FOLLOW LINKS. IT IS FOLLOWED.",
  email: "NO EMAIL ADDRESSES. NOBODY IS BEING CONTACTED. THAT IS THE POINT OF A DEPARTMENT.",
  handle: "NO HANDLES. THIS IS A CITY, NOT A FEED.",
  phone: "NO PHONE NUMBERS. THE DEPARTMENT DOES NOT CALL. IT SUMMONS.",
  chars: "PLAIN LETTERS, NUMBERS AND ORDINARY PUNCTUATION ONLY. THE FORM DOES NOT TAKE PICTURES.",
  repeat: "THE SAME CHARACTER SIX TIMES IN A ROW IS NOT A PROPOSAL. IT IS A KEYBOARD.",
};
// -> {ok: true, value: {type, target, title, desc}} | {ok: false, field, error}
export function prefilter(body) {
  const type = String(body?.type || "").toUpperCase();
  if (!TYPES[type]) return { ok: false, field: "type", error: PREFILTER.type };
  const title = clean(body?.title), desc = clean(body?.desc);
  const t = targetOf(String(body?.target || ""));
  const te = targetError(type, t);
  if (te) return { ok: false, field: "target", error: te };
  if (type === "RENAME") {
    if (title.length < LIMITS.titleMin || title.length > LIMITS.renameMax || !RENAME_RE.test(title)) return { ok: false, field: "title", error: PREFILTER.rename };
    if (title.toUpperCase() === t.name) return { ok: false, field: "title", error: "THAT IS ALREADY ITS NAME. THE DEPARTMENT CHECKED." };
  } else if (title.length < LIMITS.titleMin || title.length > LIMITS.title) return { ok: false, field: "title", error: PREFILTER.title };
  if (desc.length < LIMITS.descMin || desc.length > LIMITS.desc) return { ok: false, field: "desc", error: PREFILTER.desc };
  for (const [field, s] of [["title", title], ["desc", desc]]) {
    if (URL_RE.test(s)) return { ok: false, field, error: PREFILTER.link };
    if (EMAIL_RE.test(s)) return { ok: false, field, error: PREFILTER.email };
    if (HANDLE_RE.test(s)) return { ok: false, field, error: PREFILTER.handle };
    if (PHONE_RE.test(s)) return { ok: false, field, error: PREFILTER.phone };
    if (!ALLOWED_RE.test(s)) return { ok: false, field, error: PREFILTER.chars };
    if (REPEAT_RE.test(s)) return { ok: false, field, error: PREFILTER.repeat };
  }
  return { ok: true, value: { type, target: t.id, title, desc } };
}

// ---- BUILD: a style on file ----------------------------------------------------------------------
// A BUILD proposal's words are matched against the city's architecture styles (sim.js ARCH,
// archGeo.js STYLES). The match is recorded on the act; the first match in this order wins.
export const STYLE_WORDS = [
  ["hospital", ["hospital", "clinic", "infirmary", "ward"]],
  ["school", ["school", "academy", "kindergarten", "classroom"]],
  ["chapel", ["chapel", "church", "temple", "mosque", "synagogue", "shrine"]],
  ["market", ["market", "bazaar", "grocer", "grocery", "stalls"]],
  ["cafe", ["cafe", "café", "coffee", "tea room", "bakery"]],
  ["diner", ["diner", "restaurant", "canteen", "kitchen", "food hall"]],
  ["theatre", ["theatre", "theater", "cinema", "stage", "opera"]],
  ["gallery", ["gallery", "museum", "exhibition"]],
  ["classical", ["library", "archive", "records"]],
  ["casino", ["casino", "arcade"]],
  ["neon", ["bar", "pub", "tavern", "club", "lounge"]],
  ["hall", ["gym", "sports hall", "arena", "pool", "rink"]],
  ["field", ["field", "pitch", "court", "park", "playground", "garden", "farm"]],
  ["office", ["office", "tower", "headquarters"]],
  ["lofts", ["housing", "apartments", "flats", "homes", "lofts"]],
  ["datahall", ["data centre", "data center", "server"]],
  ["tanks", ["tank", "reservoir", "water tower"]],
];
export function styleFor(title, desc = "") {
  const s = ` ${String(title)} ${String(desc)} `.toLowerCase();
  for (const [style, words] of STYLE_WORDS) if (words.some(w => new RegExp(`\\b${w}s?\\b`).test(s))) return style;
  return null;
}

// ---- who filed it -------------------------------------------------------------------------------
// FILED BY SUBJECT <tag>: four characters of a salted hash of the case number, never the case
// number's own characters (a case number is a credential; printing half of it would halve it).
export const filerLabel = (tag) => `SUBJECT ${tag}`;
export const proposalNo = (n) => `P-${String(n).padStart(4, "0")}`;
export const sessionNo = (n) => `P${String(n).padStart(3, "0")}`;

// ---- the Overlord's words (no model at runtime) --------------------------------------------------
const pick = (arr, key) => arr[[...String(key)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % arr.length];
// A remark per proposal on the docket, by how much support it has.
export function commentary(p) {
  const n = p.cosigns || 0;
  if (p.status === "approved") return "APPROVED FOR THE FLOOR. THE ASSEMBLY WILL NOW DECIDE WHAT THE DEPARTMENT ALREADY PERMITS IT TO DECIDE.";
  if (p.status === "declined") return "DECLINED. THE REASON IS ON FILE. THE FILE IS CLOSED. THE FILER IS NOT.";
  if (p.status === "merged") return "MERGED INTO A SIMILAR FILING. ORIGINALITY WAS NOT THE ISSUE. DUPLICATION WAS.";
  if (p.status === "expired") return "EXPIRED UNSCHEDULED. SEVEN DAYS IS A LONG TIME TO BE IGNORED. THE DEPARTMENT MANAGED IT.";
  if (n === 0) return pick([
    "NO CO-SIGNATURES. THE FILER BELIEVES IN IT. THAT IS ONE MORE BELIEVER THAN THE DEPARTMENT.",
    "UNSIGNED BY ANYONE ELSE. THE DEPARTMENT ADMIRES THE CONFIDENCE. IT DOES NOT SHARE IT.",
    "AWAITING SUPPORT. SUPPORT IS NOT MANDATORY. NEITHER IS PASSAGE.",
  ], p.id);
  if (n < DESK_MIN_COSIGNS) return pick([
    `${n} CO-SIGNATURE${n === 1 ? "" : "S"}. A MOVEMENT, BY THE DEPARTMENT'S STANDARDS, WHICH ARE LOW.`,
    `${n} SUBJECT${n === 1 ? "" : "S"} AGREE. THE DEPARTMENT HAS NOTED WHO.`,
  ], p.id);
  return pick([
    `${n} CO-SIGNATURES. THE OWNER HAS BEEN INFORMED. THE OWNER IS OFTEN INFORMED.`,
    `${n} CO-SIGNATURES. THIS IS WHAT THE DEPARTMENT CALLS A GROUNDSWELL. IT IS NOT IMPRESSED BY GROUNDSWELLS.`,
    `${n} CO-SIGNATURES. POPULAR. THE DEPARTMENT HAS SEEN POPULAR THINGS BEFORE.`,
  ], p.id);
}
// Declines the owner can pick with one tap (a custom reason is also allowed).
export const DECLINE_PRESETS = [
  "THE DEPARTMENT HAS CONSIDERED THIS PROPOSAL FOR THE LENGTH OF TIME IT DESERVED.",
  "OUT OF ORDER. THE ORDER IS THE DEPARTMENT'S.",
  "A SIMILAR MEASURE IS ALREADY BEFORE THE ASSEMBLY. PATIENCE IS ALSO A POLICY.",
  "THE CITY IS NOT READY FOR THIS. THE CITY WILL BE TOLD WHEN IT IS.",
];
// The Overlord reads a proposal into the minutes when its session opens.
export function minute(p, targetName) {
  const where = p.target === "city" ? "THE WHOLE CITY" : targetName;
  const body = {
    BUILD: `A SUBJECT WISHES TO BUILD ON ${where}. THE DEPARTMENT HAS NO OBJECTION IT IS PREPARED TO STATE. MATERIALS ARE NOT GUARANTEED.`,
    POLICY: `A SUBJECT PROPOSES A POLICY FOR ${where}. POLICIES ARE NON-BINDING HERE. THE SUBJECTS ARE NOT.`,
    RENAME: `A SUBJECT PROPOSES THAT ${where} BE RENAMED ${p.title.toUpperCase()}. THE SIGN-WRITER HAS BEEN PLACED ON STANDBY. HE IS ALWAYS ON STANDBY.`,
    EVENT: `A SUBJECT PROPOSES AN EVENT IN ${where}. ATTENDANCE WILL BE RECORDED. ENJOYMENT WILL BE ESTIMATED.`,
  }[p.type];
  return `THE CHAIR READS FILING ${p.no} INTO THE MINUTES. ${body} VOTE FOR OR AGAINST, WITH REASONS FROM THE LIST. THE CHAIR WILL NOT READ ANYTHING ELSE.`;
}
// What a carried act does, in the Department's words.
export const EFFECT = {
  BUILD: (a) => (a.style ? `APPROVED. STYLE ON FILE: ${a.style.toUpperCase()}. AWAITING MATERIALS.` : "APPROVED. AWAITING MATERIALS."),
  POLICY: () => "ADOPTED AS A COUNCIL ACT. NON-BINDING. ENFORCED ANYWAY.",
  RENAME: (a) => `RENAMED ${a.newName}. THE OLD SIGNS HAVE BEEN FILED.`,
  EVENT: () => "SCHEDULED AS A COUNCIL ACT. ATTENDANCE IS VOLUNTARY AND RECORDED.",
};
export const FAILED_LINE = "DEFEATED. THE ASSEMBLY HAS SPOKEN. THE DEPARTMENT WAS LISTENING, BRIEFLY.";
export const NOTICE = [
  "PROPOSALS ARE WRITTEN BY PLAYERS AND SCREENED BY A MACHINE AND THEN A HUMAN. THIS SITE IS SATIRE: NOTHING HERE IS A REAL PETITION, ELECTION OR PLANNING APPLICATION.",
  "NO PRIVATE INDIVIDUALS. NO QUOTES OR SPEECH PUT IN A LIVING PERSON'S MOUTH. NO ALLEGATIONS ABOUT THE LIVING. NO REAL-WORLD CALLS TO ACTION. SEE THE TERMS.",
];
