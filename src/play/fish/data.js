// THE WATERS: the fishing game's data (docs/CITY_SPEC.md "PLAYABLE SPORTS / Fishing"). Pure, no DOM,
// no Math.random, no transcendental Math (sin, exp, cbrt can differ between engines; a catch is
// re-played on the server by netlify/functions/aquarium.js and must come out to the hundredth of
// a pound). Read by sim.js, the renderer, the aquarium, the endpoint and scripts/check-fish.mjs.

// ---- the spots -------------------------------------------------------------------------------------
// Shape {id, name, water: "ocean" | "river" | "lake" | "estuary", ...}: the shape the river
// layout (src/city/river.js, from the mountain to the sea) exports its fishing spots in. THE PIER
// and THE BREAK exist on the coast today (sim.js places "pier" and "surf"); the other three are the
// river's reaches as data until river.js lands, when its list replaces them here (same ids where
// the river names the same water). depth: feet at the far end of a cast; cast: yards at full power.
export const SPOTS = [
  { id: "pier", name: "THE PIER", water: "ocean", depth: 22, cast: 46, place: "pier", building: "the-pier", district: "coast", note: "FISHING BY PERMIT. THE PERMIT IS THIS SENTENCE." },
  { id: "break", name: "THE BREAK", water: "ocean", depth: 9, cast: 52, place: "surf", building: "the-break", district: "coast", note: "SURF CASTING. THE WAVES ARE SCHEDULED." },
  { id: "estuary", name: "THE RIVER MOUTH", water: "estuary", depth: 11, cast: 40, place: null, building: null, district: null, note: "WHERE THE RIVER MEETS THE SEA. BRACKISH. SO ARE WE." },
  { id: "river", name: "THE FOOTHILLS REACH", water: "river", depth: 7, cast: 30, place: null, building: null, district: null, note: "FAST WATER UNDER THE HEIGHTS. THE CURRENT IS UNSUPERVISED." },
  { id: "lake", name: "THE RESERVOIR", water: "lake", depth: 26, cast: 40, place: null, building: null, district: null, note: "THE CITY'S DRINKING WATER. CATCH AND RELEASE IS ENCOURAGED. KEEPING IS NOTED." },
];
export const SPOT = Object.fromEntries(SPOTS.map(s => [s.id, s]));
export const WATERS = ["ocean", "river", "lake", "estuary"];

// ---- the tackle ------------------------------------------------------------------------------------
// sink: feet per tick while the reel is idle (a popper floats); still/moving: how much a fish likes
// the lure sitting or swimming (multiplies the species' own taste for it).
export const LURES = [
  { id: "worm", name: "NIGHTCRAWLER", short: "WORM", bait: true, sink: 0.05, still: 1.2, moving: 0.5 },
  { id: "minnow", name: "LIVE MINNOW", short: "MINNOW", bait: true, sink: 0.035, still: 1, moving: 0.9 },
  { id: "spoon", name: "SILVER SPOON", short: "SPOON", bait: false, sink: 0.11, still: 0.15, moving: 1.3 },
  { id: "popper", name: "TOPWATER POPPER", short: "POPPER", bait: false, sink: 0, still: 0.2, moving: 0.7, pop: 1.8 },
];
export const LURE = Object.fromEntries(LURES.map(l => [l.id, l]));

// ---- the clock: the city's machine clock (src/city/sim.js machineClock, one real minute = one
// machine hour, so one real second is one machine minute) ----------------------------------------
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const HZ = 60;
// machine hours at a trip's start (real ms) plus `tick` sixtieths of a real second
export const mtAt = (at, tick = 0) => (at - CITY_EPOCH) / 60000 + tick / (HZ * 60);
export const dayOf = (mt) => Math.floor(mt / 24) + 1;
export const hourOf = (mt) => mt - Math.floor(mt / 24) * 24;
// The water year: 112 machine days (about 45 real hours), four seasons of 28, so every season
// comes round twice in a real week. Day 1 of the Substrate opens a spring.
export const YEAR_DAYS = 112;
export const SEASONS = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];
export const seasonOf = (day) => Math.floor((((day - 1) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS / 28);
// The light: dawn 05-08, day 08-17, dusk 17-20, night 20-05.
export const LIGHTS = ["DAWN", "DAY", "DUSK", "NIGHT"];
export const lightOf = (h) => (h >= 5 && h < 8 ? 0 : h >= 8 && h < 17 ? 1 : h >= 17 && h < 20 ? 2 : 3);
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// mulberry32 as a pure step: (state) -> [value in 0..1, next state]
export function rngStep(s) {
  const n = (s + 0x6d2b79f5) >>> 0;
  let t = n;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, n];
}
// The weather on the water, one per machine day, the same for every angler.
export const WEATHERS = ["CLEAR", "CLEAR", "CLEAR", "CLEAR", "OVERCAST", "OVERCAST", "RAIN", "RAIN", "FOG", "WIND"];
export const weatherOn = (day) => WEATHERS[fnv(`fishwx|${day}`) % WEATHERS.length];
// how hungry the water is in that weather (a species may add its own), and the cast in a wind
export const WX_BITE = { CLEAR: 1, OVERCAST: 1.3, RAIN: 1.15, FOG: 1.1, WIND: 0.9 };
export const WX_CAST = { CLEAR: 1, OVERCAST: 1, RAIN: 0.95, FOG: 1, WIND: 0.82 };
export function conditionsAt(at, tick = 0) {
  const mt = mtAt(at, tick), mins = Math.floor(mt * 60 + 1e-6), day = Math.floor(mins / 1440) + 1, m = mins - (day - 1) * 1440, h = m / 60;
  return { mt, day, hour: Math.floor(m / 60), minute: m % 60, season: seasonOf(day), light: lightOf(h), weather: weatherOn(day) };
}

// ---- the species ------------------------------------------------------------------------------------
// water: where it lives (spot: a legendary lives at one spot only); lb: [min, max] (the weight is
// skewed small: min + (max - min) * (u^2 + u^3) / 2); k: inches per cube-root pound (length = k * lb^(1/3),
// the anglers' weight-length rule); band: [top, bottom] as a share of the water's depth at that
// distance; lures: taste per lure; season: [spring, summer, autumn, winter]; light: [dawn, day,
// dusk, night]; wx: extra appetite in a weather; power: how hard it pulls (0..1.2); stamina: how
// long; wary: how short its bite and how easily spooked (0..1); jumps: it jumps on a run;
// rate: how common; art: the sprite (art.js); protected: never kept (released by law).
export const SPECIES = [
  // the sea
  { id: "striped-bass", name: "STRIPED BASS", water: ["ocean", "estuary"], lb: [2, 42], k: 13.7, band: [0.35, 1], lures: { worm: 0.5, minnow: 1.2, spoon: 0.8, popper: 0.6 }, season: [1.3, 0.5, 1.4, 0.2], light: [1.6, 0.6, 1.6, 1.1], power: 0.85, stamina: 1.1, wary: 0.6, rate: 1,
    art: { shape: "fish", body: "#c8c8b8", back: "#5c6c74", belly: "#fcfcfc", pattern: "stripes", mark: "#2c3438", fin: "#7c8c94", h: 0.26 } },
  { id: "bluefish", name: "BLUEFISH", water: ["ocean"], lb: [1, 18], k: 14.5, band: [0.05, 0.6], lures: { worm: 0.2, minnow: 0.9, spoon: 1.3, popper: 1.1 }, season: [0.6, 1.3, 1.1, 0], light: [1.3, 1, 1.3, 0.4], power: 0.95, stamina: 0.85, wary: 0.3, jumps: true, rate: 0.9,
    art: { shape: "fish", body: "#7cb4d8", back: "#2c6c9c", belly: "#e4f0f8", pattern: "none", fin: "#5c94bc", h: 0.24, fork: true } },
  { id: "fluke", name: "SUMMER FLOUNDER", water: ["ocean", "estuary"], lb: [1, 13], k: 13.1, band: [0.85, 1], lures: { worm: 0.8, minnow: 1.2, spoon: 0.35, popper: 0 }, season: [0.5, 1.4, 0.8, 0], light: [1, 1.2, 1, 0.3], power: 0.5, stamina: 0.8, wary: 0.4, rate: 0.8,
    art: { shape: "flat", body: "#a08c64", back: "#7c6844", belly: "#f4ecd8", pattern: "spots", mark: "#4c3c24", fin: "#8c7854", h: 0.42 } },
  { id: "sea-bass", name: "BLACK SEA BASS", water: ["ocean"], lb: [0.5, 7], k: 12.1, band: [0.75, 1], lures: { worm: 1.2, minnow: 0.8, spoon: 0.5, popper: 0 }, season: [0.8, 1.1, 1, 0.3], light: [1, 1.1, 1, 0.5], power: 0.6, stamina: 0.7, wary: 0.2, rate: 0.9,
    art: { shape: "fish", body: "#3c3c44", back: "#1c1c24", belly: "#7c7c84", pattern: "spots", mark: "#9c9ca4", fin: "#2c2c34", h: 0.34 } },
  // the river
  { id: "rainbow-trout", name: "RAINBOW TROUT", water: ["river", "lake"], lb: [0.5, 7], k: 14.3, band: [0.15, 0.7], lures: { worm: 0.9, minnow: 0.7, spoon: 1.2, popper: 0.25 }, season: [1.4, 0.6, 1.1, 0.5], light: [1.6, 0.7, 1.5, 0.3], power: 0.6, stamina: 0.8, wary: 0.7, jumps: true, rate: 1,
    art: { shape: "fish", body: "#b4c4a4", back: "#5c7c4c", belly: "#fcf4e4", pattern: "spots", mark: "#2c3c2c", fin: "#8ca47c", h: 0.24, stripe: "#e46c7c" } },
  { id: "smallmouth", name: "SMALLMOUTH BASS", water: ["river", "lake"], lb: [0.5, 6.5], k: 12.1, band: [0.3, 0.9], lures: { worm: 0.6, minnow: 1.1, spoon: 0.8, popper: 1 }, season: [0.8, 1.3, 1, 0.2], light: [1.4, 0.8, 1.4, 0.4], power: 0.75, stamina: 0.9, wary: 0.5, jumps: true, rate: 1,
    art: { shape: "fish", body: "#a48c4c", back: "#6c5c2c", belly: "#e4d8a4", pattern: "bars", mark: "#5c4c24", fin: "#8c7444", h: 0.3 } },
  { id: "catfish", name: "CHANNEL CATFISH", water: ["river", "lake", "estuary"], lb: [1, 28], k: 13, band: [0.85, 1], lures: { worm: 1.4, minnow: 0.7, spoon: 0.1, popper: 0 }, season: [0.7, 1.3, 0.9, 0.3], light: [0.9, 0.35, 1.1, 1.9], wx: { RAIN: 1.3 }, power: 0.85, stamina: 1.2, wary: 0.2, rate: 0.9,
    art: { shape: "fish", body: "#8c949c", back: "#4c545c", belly: "#e4e4e4", pattern: "spots", mark: "#2c3034", fin: "#6c747c", h: 0.22, whiskers: true } },
  { id: "bluegill", name: "BLUEGILL", water: ["river", "lake"], lb: [0.15, 1.6], k: 9.6, band: [0.2, 0.8], lures: { worm: 1.5, minnow: 0.5, spoon: 0.4, popper: 0.6 }, season: [1, 1.3, 1, 0.5], light: [1, 1.3, 1, 0.3], power: 0.22, stamina: 0.5, wary: 0.1, rate: 1.3,
    art: { shape: "pan", body: "#6c8c74", back: "#3c5c54", belly: "#f4b444", pattern: "bars", mark: "#3c4c44", fin: "#4c6c64", h: 0.5, gill: "#24245c" } },
  // the lake
  { id: "yellow-perch", name: "YELLOW PERCH", water: ["lake"], lb: [0.2, 2.2], k: 11.1, band: [0.5, 1], lures: { worm: 1.3, minnow: 1.1, spoon: 0.6, popper: 0.1 }, season: [1.1, 0.8, 1, 1.1], light: [1, 1.3, 1, 0.2], power: 0.3, stamina: 0.5, wary: 0.2, rate: 1.2,
    art: { shape: "fish", body: "#e4c84c", back: "#8c8c2c", belly: "#fcf4c4", pattern: "bars", mark: "#4c5c1c", fin: "#e47c2c", h: 0.27 } },
  { id: "pike", name: "NORTHERN PIKE", water: ["lake"], lb: [2, 26], k: 15.4, band: [0.15, 0.6], lures: { worm: 0.2, minnow: 1.1, spoon: 1.3, popper: 0.6 }, season: [1.3, 0.7, 1.3, 0.8], light: [1.1, 1.1, 1.1, 0.3], power: 0.9, stamina: 0.9, wary: 0.4, rate: 0.8,
    art: { shape: "long", body: "#7c9c5c", back: "#3c5c2c", belly: "#e4ecc4", pattern: "spots", mark: "#d4e4a4", fin: "#6c843c", h: 0.17 } },
  { id: "largemouth", name: "LARGEMOUTH BASS", water: ["lake"], lb: [0.8, 11], k: 11.6, band: [0.1, 0.8], lures: { worm: 1, minnow: 1.1, spoon: 0.7, popper: 1.2 }, season: [1, 1.3, 1, 0.2], light: [1.5, 0.7, 1.5, 0.6], power: 0.8, stamina: 0.85, wary: 0.5, jumps: true, rate: 1,
    art: { shape: "fish", body: "#8cac5c", back: "#4c6c2c", belly: "#f4f4d4", pattern: "stripe", mark: "#2c3c1c", fin: "#6c8c3c", h: 0.3, mouth: true } },
  // the river mouth
  { id: "blue-crab", name: "BLUE CRAB", water: ["estuary"], lb: [0.25, 1.1], k: 7.7, band: [0.92, 1], lures: { worm: 1.3, minnow: 1.1, spoon: 0, popper: 0 }, season: [0.6, 1.5, 1.1, 0], light: [1, 1, 1, 1.2], power: 0.25, stamina: 0.4, wary: 0.1, rate: 1.3, crab: true,
    art: { shape: "crab", body: "#4c7cbc", back: "#2c5c9c", belly: "#e4ecf4", fin: "#e44c2c", h: 0.6 } },
  { id: "eel", name: "AMERICAN EEL", water: ["estuary", "river"], lb: [0.4, 4.5], k: 25.2, band: [0.9, 1], lures: { worm: 1.4, minnow: 0.8, spoon: 0, popper: 0 }, season: [0.9, 1.2, 1, 0.3], light: [0.6, 0.2, 1, 2.2], wx: { RAIN: 1.4 }, power: 0.6, stamina: 1, wary: 0.2, rate: 0.8,
    art: { shape: "eel", body: "#6c6c3c", back: "#3c3c1c", belly: "#c4c48c", fin: "#4c4c2c", h: 0.08 } },
  { id: "white-perch", name: "WHITE PERCH", water: ["estuary"], lb: [0.3, 2.2], k: 11.9, band: [0.4, 1], lures: { worm: 1.2, minnow: 1.1, spoon: 0.7, popper: 0.2 }, season: [1.3, 1, 1, 0.5], light: [1.2, 1, 1.2, 0.6], power: 0.3, stamina: 0.5, wary: 0.2, rate: 1.1,
    art: { shape: "fish", body: "#d4d8cc", back: "#7c847c", belly: "#fcfcfc", pattern: "none", fin: "#a4aca4", h: 0.32 } },
  // the legends: one per spot, rare, only in their hours
  { id: "ghost-striper", name: "THE SILVER STRIPER", legend: true, spot: "pier", water: ["ocean"], lb: [52, 71], k: 13.7, band: [0.5, 1], lures: { worm: 0, minnow: 1, spoon: 0.2, popper: 0 }, season: [1, 0, 1, 0.2], light: [1, 0, 1, 1], power: 1.15, stamina: 1.6, wary: 0.85, rate: 0.012,
    art: { shape: "fish", body: "#e4ecec", back: "#a4b4b4", belly: "#fcfcfc", pattern: "stripes", mark: "#7c8c94", fin: "#c4d4d4", h: 0.26, glow: true } },
  { id: "bull-red", name: "THE OLD BULL RED", legend: true, spot: "break", water: ["ocean"], lb: [44, 61], k: 13.6, band: [0.6, 1], lures: { worm: 1, minnow: 1, spoon: 0.4, popper: 0 }, season: [0.4, 0.6, 1.2, 0], light: [1, 0.3, 1, 0.8], power: 1.1, stamina: 1.5, wary: 0.7, rate: 0.012,
    art: { shape: "fish", body: "#d4844c", back: "#a4542c", belly: "#fce4c4", pattern: "eyespot", mark: "#1c1c1c", fin: "#c46c3c", h: 0.27 } },
  { id: "sturgeon", name: "THE ATLANTIC STURGEON", legend: true, spot: "estuary", water: ["estuary"], lb: [80, 190], k: 16.2, band: [0.9, 1], lures: { worm: 1, minnow: 0.6, spoon: 0, popper: 0 }, season: [1.3, 0.8, 0.8, 0], light: [1, 0.7, 1, 1], power: 1.2, stamina: 1.8, wary: 0.6, rate: 0.01, protected: true,
    art: { shape: "long", body: "#7c746c", back: "#4c4844", belly: "#d4ccc4", pattern: "scutes", mark: "#c4bcac", fin: "#5c5450", h: 0.15 } },
  { id: "mossback", name: "OLD MOSSBACK", legend: true, spot: "river", water: ["river"], lb: [16, 26], k: 12.8, band: [0.6, 1], lures: { worm: 0.6, minnow: 1.2, spoon: 0.8, popper: 0.2 }, season: [1, 0.5, 1.3, 0.4], light: [1, 0, 1, 1.3], power: 1, stamina: 1.4, wary: 0.9, jumps: true, rate: 0.012,
    art: { shape: "fish", body: "#a48444", back: "#5c4c2c", belly: "#f4dca4", pattern: "spots", mark: "#c43c2c", fin: "#8c6c3c", h: 0.26 } },
  { id: "warden", name: "THE WARDEN", legend: true, spot: "lake", water: ["lake"], lb: [38, 54], k: 14.9, band: [0.2, 0.7], lures: { worm: 0, minnow: 1, spoon: 1.2, popper: 0.5 }, season: [1, 0.6, 1.4, 0.6], light: [1.2, 0.6, 1.2, 0.1], power: 1.15, stamina: 1.5, wary: 0.8, rate: 0.012,
    art: { shape: "long", body: "#9cac7c", back: "#5c6c3c", belly: "#ecf0d4", pattern: "bars", mark: "#4c5c2c", fin: "#8c7c4c", h: 0.17 } },
];
export const SPECIES_BY = Object.fromEntries(SPECIES.map(s => [s.id, s]));
// what can bite at a spot: its water's species and its own legend
export const speciesAt = (spotId) => { const sp = SPOT[spotId]; return sp ? SPECIES.filter(s => s.water.includes(sp.water) && (!s.legend || s.spot === spotId)) : []; };

// A species' appetite at an hour: rate x season x light x weather. A legend's 0 is "never then".
export function appetite(s, c) { return s.rate * s.season[c.season] * s.light[c.light] * (WX_BITE[c.weather] ?? 1) * (s.wx?.[c.weather] ?? 1); }

// Arithmetic-only cube root (Newton), so the browser and Node agree to the last bit.
export function cbrt(x) {
  if (!(x > 0)) return 0;
  let y = x < 1 ? 1 : x / 3;
  for (let i = 0; i < 40; i++) y = y - (y * y * y - x) / (3 * y * y);
  return y;
}
// hundredths of a pound -> tenths of an inch, by the species' rule
export const lengthOf = (s, cw) => Math.round(s.k * cbrt(cw / 100) * 10);
export const lbText = (cw) => { const lb = Math.floor(cw / 100), oz = Math.round(((cw % 100) * 16) / 100); return oz === 16 ? `${lb + 1} LB 0 OZ` : `${lb} LB ${oz} OZ`; };
export const lbDec = (cw) => (cw / 100).toFixed(2);
export const inText = (tl) => `${(tl / 10).toFixed(1)} IN`;
