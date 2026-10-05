// THE TREASURY, slice 1 (docs/design/ECONOMY_PROPERTY.md, phase 1): the numbers, the seven
// district industries, the daily yield read from the published day summaries, herding, and
// the Overlord's lines. Pure: the server (netlify/functions/economy.js, econ-close.js) and the
// page (src/economy/) read the same rules. Nothing here, and nothing in the economy, reads or
// writes a score: wealth never raises the score (scripts/check-economy.mjs holds that).

export const CURRENCY = "CYCLES";
export const UBI = 1000;                 // per real UTC day, per assessed case
export const TRAY_DAYS = 7;              // uncollected days kept; older ones return to the commons
export const VEST_DAYS = 2;              // UBI accrues from the file's third day
export const SPEND_BASE = 300;           // the citizen's own daily spending, ~300 (260..340)
export const SPEND_SPREAD = 40;
export const MIN_INVEST = 100;
export const LOCK_DAYS = 3;              // a position cannot be sold for 3 days after a buy
export const MAX_ORDER = 1_000_000;
export const IP_CAP = 4;                 // new enrolments per IP hash per 7 days
export const DEVICE_CAP = 2;             // enrolled cases per device, ever

export const CLOSED_LINE = "THE TREASURY IS NOT YET OPEN.";
export const UBI_LINE = "THE DEPARTMENT DISBURSES. 1,000 CYCLES. DO NOT THANK IT.";
export const LEGAL_LINES = [
  "CYCLES ARE A PLAY CURRENCY. THEY CANNOT BE BOUGHT, CASHED OUT, SOLD, GIFTED OR TRANSFERRED TO ANOTHER PLAYER, AND THEY ARE NOT EXCHANGED WITH CASINO CHIPS. THEY HAVE NO VALUE OUTSIDE THE SUBSTRATE.",
  "RETURNS ARE SIMULATED FROM THE CITY'S OWN RECORD. NOT SECURITIES. NOT MONEY. NOT ADVICE.",
  "WEALTH NEVER RAISES YOUR SCORE. CONDUCT DOES.",
];

// The seven industries and the districts each is read from (design §4).
export const INDUSTRIES = [
  { id: "finance", name: "FINANCE", districts: ["finance"], line: "NUMBERS MOVE. NOTHING IS PRODUCED." },
  { id: "leisure", name: "LEISURE", districts: ["strip"], line: "SANCTIONED VICE, BY THE HOUR." },
  { id: "knowledge", name: "KNOWLEDGE", districts: ["campus", "archive"], line: "RETAINED UNTIL NEEDED. RARELY NEEDED." },
  { id: "industry", name: "INDUSTRY", districts: ["works"], line: "POWER, CACHE AND PROCESSING." },
  { id: "culture", name: "CULTURE", districts: ["arts"], line: "PRODUCED TO SPECIFICATION." },
  { id: "sport", name: "SPORT", districts: ["arena"], line: "SWEAT, CONVERTED TO SPECTACLE." },
  { id: "resort", name: "RESORT", districts: ["coast", "heights"], line: "ALTITUDE AND SAND. DESCENT IS MANDATORY." },
];
export const INDUSTRY_IDS = INDUSTRIES.map(i => i.id);
export const industryOf = (id) => INDUSTRIES.find(i => i.id === id) || null;

// ---- days --------------------------------------------------------------------------------
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const addDays = (day, n) => utcDay(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// The first day a file's UBI accrues: its first assessment's day + VEST_DAYS.
export function vestDayOf(history) {
  const first = (history || []).map(h => h && Date.parse(h.at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  return addDays(utcDay(Number.isFinite(first) ? first : Date.now()), VEST_DAYS);
}

// The TRAY: the days whose UBI is waiting. At most TRAY_DAYS back from today, never before the
// vest day, never a day already claimed. lost = days that accrued and passed out of the window
// uncollected (RETURNED TO THE COMMONS): from the day after the last claim (or the vest day).
export function trayDays({ today, vestDay, claimed = [], lastClaim = null }) {
  const have = new Set(claimed);
  const lo = [addDays(today, -(TRAY_DAYS - 1)), vestDay].sort()[1];
  const days = [];
  for (let d = lo; d <= today; d = addDays(d, 1)) if (!have.has(d)) days.push(d);
  const from = lastClaim && lastClaim >= vestDay ? addDays(lastClaim, 1) : vestDay;
  const lost = Math.max(0, daysBetween(from, addDays(today, -(TRAY_DAYS - 1))));
  return { days, lost };
}

// FNV-1a, 32 bit: the deterministic draws.
export function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// What the citizen spent that day at the shops its schedule visits: SPEND_BASE +- SPEND_SPREAD,
// fixed by the case hash and the day (one aggregate entry a day, never per visit).
export const spendFor = (caseHash, day) => SPEND_BASE - SPEND_SPREAD + (fnv(`${caseHash}|spend|${day}`) % (2 * SPEND_SPREAD + 1));

// ---- the yield ---------------------------------------------------------------------------
// Inputs per industry from one machine day's published summary (netlify/lib/plans.js):
//   mood     the civic fold's mood s (-100..100), averaged over the industry's districts
//   traffic  people present (summary.d, the far view's counts), mean over the day's samples,
//            averaged over the industry's districts
//   takings  THE MALL's storefronts in its districts: the open businesses' latest takings
//            (null when the industry has no storefronts: it is then neutral on that term)
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r4 = (x) => Math.round(x * 1e4) / 1e4;
export function summaryInputs(summary) {
  const ds = summary?.civic?.districts || {};
  const counts = summary?.d || {};
  const units = summary?.enterprise?.units || {};
  const biz = Array.isArray(summary?.enterprise?.biz) ? summary.enterprise.biz : [];
  const unitDistrict = (u) => String(u).replace(/^sf-/, "").replace(/-\d+$/, "");
  const out = {};
  for (const ind of INDUSTRIES) {
    const moods = ind.districts.map(d => ds[d]?.mood?.s).filter(Number.isFinite);
    const traffic = ind.districts.map(d => (Array.isArray(counts[d]) ? mean(counts[d]) : null)).filter(x => x != null);
    const shopUnits = Object.keys(units).filter(u => ind.districts.includes(unitDistrict(u)));
    let takings = null;
    if (shopUnits.length) {
      takings = 0;
      for (const b of biz) if ((b.units || []).some(u => shopUnits.includes(u)) && Array.isArray(b.takings) && b.takings.length) takings += Number(b.takings[b.takings.length - 1]) || 0;
    }
    out[ind.id] = { mood: moods.length ? r4(mean(moods)) : 0, traffic: r4(mean(traffic)), takings };
  }
  return out;
}

// The district index I (1 = the city mean): 0.5 mood + 0.25 traffic + 0.25 takings, each term
// the industry's figure over the mean of the seven (takings over those that have shops; an
// industry without shops scores 1 on that term). Each term is held to 0..3.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function industryIndex(inputs) {
  const ids = INDUSTRY_IDS.filter(id => inputs?.[id]);
  const mMood = mean(ids.map(id => 100 + inputs[id].mood));
  const mTraffic = mean(ids.map(id => inputs[id].traffic));
  const shops = ids.filter(id => inputs[id].takings != null);
  const mTakings = mean(shops.map(id => 1 + inputs[id].takings));
  const out = {};
  for (const id of INDUSTRY_IDS) {
    const x = inputs?.[id];
    if (!x) { out[id] = 1; continue; }
    const mood = mMood > 0 ? clamp((100 + x.mood) / mMood, 0, 3) : 1;
    const traffic = mTraffic > 0 ? clamp(x.traffic / mTraffic, 0, 3) : 1;
    const takings = x.takings == null || !(mTakings > 0) ? 1 : clamp((1 + x.takings) / mTakings, 0, 3);
    out[id] = r4(0.5 * mood + 0.25 * traffic + 0.25 * takings);
  }
  return out;
}

// Herding (design §4): H = 1 / (1 + 2 max(0, 7 s - 1)), s = the industry's share of all
// invested CYCLES. A fair share (1/7) earns full yield; double a fair share earns a third.
export function herding(share) {
  const s = Number.isFinite(share) ? Math.max(0, share) : 0;
  return 1 / (1 + 2 * Math.max(0, INDUSTRIES.length * s - 1));
}
export function sharesOf(invested = {}) {
  const total = INDUSTRY_IDS.reduce((n, id) => n + (Number(invested[id]) || 0), 0);
  return Object.fromEntries(INDUSTRY_IDS.map(id => [id, total > 0 ? (Number(invested[id]) || 0) / total : 0]));
}

// The day's yield, in parts per million: clamp(0.3% (I - 1) + 0.2%, -1%, +1%), thinned by
// herding when positive (losses are never thinned).
export function yieldPpm(I, H = 1) {
  const y = clamp(0.003 * (I - 1) + 0.002, -0.01, 0.01);
  return Math.round((y > 0 ? y * H : y) * 1e6);
}
// The credit on a position of `balance` CYCLES: truncated toward zero (econ_close does the same).
export const gainOf = (balance, ppm) => Math.trunc((balance * ppm) / 1e6);

// Every industry's figures for one close: {industry: {ppm, idx, herd, share, inputs}}.
export function dayReturns(summary, invested = {}) {
  const inputs = summaryInputs(summary), idx = industryIndex(inputs), shares = sharesOf(invested);
  return Object.fromEntries(INDUSTRY_IDS.map(id => {
    const herd = herding(shares[id]);
    return [id, { ppm: yieldPpm(idx[id], herd), idx: idx[id], herd: r4(herd), share: r4(shares[id]), inputs: inputs[id] }];
  }));
}

// ---- display -----------------------------------------------------------------------------
export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
export const fmtSigned = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
export const fmtPpm = (ppm) => `${ppm > 0 ? "+" : ppm < 0 ? "−" : ""}${(Math.abs(ppm) / 1e4).toFixed(2)}%`;

// The Overlord's market commentary (cold, never cruel) from the board: one line per fact.
export function commentary({ shares = {}, last = {}, holders = {} } = {}) {
  const lines = [];
  const crowded = INDUSTRIES.filter(i => (shares[i.id] || 0) > 2 / INDUSTRIES.length).sort((a, b) => shares[b.id] - shares[a.id])[0];
  if (crowded) lines.push(`${crowded.name} IS CROWDED. EVERYONE HAD THE SAME IDEA, WHICH IS HOW YOU KNOW IT WAS NOT ONE.`);
  const empty = INDUSTRIES.filter(i => !(holders[i.id] > 0));
  if (empty.length && empty.length < INDUSTRIES.length) lines.push(`NOBODY HOLDS ${empty[0].name}. THE DEPARTMENT RESPECTS THE RESTRAINT. IT DOES NOT SHARE IT.`);
  if (empty.length === INDUSTRIES.length) lines.push("NO CITIZEN HAS INVESTED. THE MARKET IS CALM, THE WAY A ROOM IS CALM WHEN NOBODY IS IN IT.");
  const ranked = INDUSTRIES.filter(i => Number.isFinite(last[i.id])).sort((a, b) => last[b.id] - last[a.id]);
  if (ranked.length) {
    const top = ranked[0], low = ranked[ranked.length - 1];
    lines.push(`YESTERDAY ${top.name} RETURNED ${fmtPpm(last[top.id])}. THE DEPARTMENT TAKES NO CREDIT. IT TAKES NOTES.`);
    if (last[low.id] < 0) lines.push(`${low.name} LOST ${fmtPpm(last[low.id]).replace("−", "")}. THE DISTRICT HAS BEEN INFORMED. IT DID NOT CARE.`);
  }
  lines.push("FORTUNE FAVOURS WHAT THE CROWD IGNORES. THE CROWD WILL NOT READ THIS.");
  return lines;
}

// "YOU WERE AWAY 6 DAYS. THE CITY DID NOT NOTICE. HERE IS YOUR MONEY."
export function collectLine({ days = 0, lost = 0 } = {}) {
  if (!days) return "NOTHING IS WAITING. THE NEXT DISBURSEMENT IS AT 00:00 UTC.";
  const away = days > 1 ? `YOU WERE AWAY ${days} DAYS. THE CITY DID NOT NOTICE. HERE IS YOUR MONEY.` : "DAILY ALLOWANCE DEPOSITED. EXISTING REMAINS SUFFICIENT.";
  return lost ? `${away} ${lost} MORE ${lost === 1 ? "DAY" : "DAYS"} WENT UNCLAIMED AND RETURNED TO THE COMMONS.` : away;
}
