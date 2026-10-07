// WHO HAS WHAT IN THEIR FLAT (Scott, 2026-10-06: "apartments shouldn't be cookie-cutter, they should
// reflect the character who lives there"). Pure data and pure functions: every figure gets 2-4
// signature props (catalog ids: furniture.js, signatureProps.js), deterministically, from
//   1. CURATED: the best-known figures, documented public interests only (below);
//   2. props-by-figure.json: one cheap Haiku pass over everyone else (scripts/props-ai-pass.mjs), the
//      model picking only from the fixed vocabulary, cached here so it is a one-time cost;
//   3. RULES: in-world job tag + the file's drive + a nudge of taste, for anyone the first two miss
//      (citizens, new arrivals, figures the model could not place).
// A figure the Department's harm review gated, or whose cube family is "harm", gets neutral props
// (books, a bonsai, a radio) unless the table says otherwise: no flat makes a joke of a grave harm.
// Render-only: the sim never reads any of this. JETSAM! cabinets are rare on purpose: only for people
// whose interests include games or tech, plus about one flat in sixty.
import BY_FIGURE from "./props-by-figure.json" with { type: "json" };
import { jobOf } from "./sim.js";
import { familyOf } from "./cityKit.js";
import { driveOf } from "./drives.js";
import { slugify } from "../figures.js";
import { h01, surname } from "./tower.js";

export const MAX_PER_FLAT = 5;
export const RANDOM_JETSAM = 1 / 60;

// the vocabulary the AI pass may pick from, with the hint it is shown: id -> what it says about a person
export const VOCAB = {
  "guitar-acoustic": "plays acoustic guitar", "guitar-electric": "plays electric guitar", "guitar-wall": "a serious guitar collection",
  "guitar-rack": "several guitars", keys: "keyboards / synths", piano: "plays piano", "drum-kit": "drummer", turntables: "DJ / turntables",
  "mic-stand": "singer / performer / speaker", violin: "violin", "horn-stand": "saxophone / trumpet / jazz horn", "record-wall": "record collector / music obsessive",
  "poster-wall": "pop-culture / film / music fan", "chess-table": "chess", "card-table": "cards / bridge / poker / magic", "tennis-rack": "tennis",
  "tennis-console": "tennis video game on the TV", "golf-bag": "golf", "putting-mat": "golf (practice)", "basketball-hoop": "basketball", "ball-rack": "team ball sports (football, soccer, baseball)",
  "heavy-bag": "boxing / combat training", "dumbbell-rack": "weightlifting / bodybuilding", weights: "gym / fitness", "training-dummy": "martial arts", dartboard: "darts / pub games",
  surfboards: "surfing / ocean sport", skateboards: "skateboarding", bicycle: "cycling", "fishing-rods": "fishing / angling", "meditation-corner": "meditation / yoga / contemplation",
  "canvas-rack": "painter", easel: "painting", "sculpture-stand": "sculptor", "pottery-wheel": "ceramics / craft", "camera-tripod": "photography",
  typewriter: "novelist / journalist / poet", "writing-desk": "historical writer / letters / philosopher", "book-towers": "voracious reader / scholar",
  chalkboard: "mathematician / theoretical scientist", telescope: "astronomy / space", microscope: "biologist / medicine", "lab-bench": "chemist / experimental scientist / inventor",
  "map-wall": "explorer / geographer / traveller", mainframe: "computing pioneer / programmer", "tesla-coil": "electrical inventor", "model-rocket": "space / rockets",
  "model-plane": "aviation / pilot", "radio-set": "radio / broadcasting / wartime or retro tech", "film-projector": "filmmaker / cinephile", "movie-camera": "director / film",
  "chef-range": "professional cook / chef", "knife-rack": "chef's knives / cooking", "sewing-machine": "tailor / seamstress / fashion maker", "dress-form": "fashion designer",
  greenhouse: "gardening / botany / farming", bonsai: "quiet contemplative gardening", "spinning-wheel": "hand-spinning / handcraft / self-reliance",
  "trophy-cabinet": "a career of trophies and awards", "flag-podium": "head of state / politician / public speaker", "saddle-stand": "horse riding / equestrian",
  arcade: "plays video games (only if well documented)", pc: "computer / programming", "record-player": "vinyl listener", aquarium: "fish / aquarium",
};
export const VOCAB_IDS = Object.keys(VOCAB);

// ---- 1. the best-known figures: documented, public interests only ---------------------------------
export const CURATED = {
  // music
  "john-lennon": ["guitar-acoustic", "piano", "mic-stand"], "paul-mccartney": ["guitar-wall", "guitar-electric", "piano"], prince: ["guitar-wall", "guitar-electric", "keys"],
  "ringo-starr": ["drum-kit", "record-wall"], "george-harrison": ["guitar-electric", "greenhouse", "meditation-corner"], "jimmy-page": ["guitar-electric", "guitar-rack"],
  "eddie-van-halen": ["guitar-electric", "guitar-rack"], slash: ["guitar-wall", "mic-stand"], "jerry-garcia": ["guitar-electric", "easel"], "bob-dylan": ["guitar-acoustic", "typewriter", "easel"],
  "jack-white": ["guitar-electric", "drum-kit"], "david-gilmour": ["guitar-electric", "guitar-rack"], "tom-morello": ["guitar-electric", "book-towers"], "elvis-presley": ["guitar-acoustic", "mic-stand", "record-wall"],
  "bob-marley": ["guitar-acoustic", "ball-rack", "record-wall"], "miles-davis": ["horn-stand", "heavy-bag", "easel"], "john-coltrane": ["horn-stand", "book-towers"],
  "billie-holiday": ["mic-stand", "record-wall"], "aretha-franklin": ["piano", "mic-stand"], "taylor-swift": ["guitar-acoustic", "piano", "record-wall"], madonna: ["mic-stand", "poster-wall"],
  "billy-joel": ["piano", "guitar-acoustic"], "dolly-parton": ["guitar-acoustic", "sewing-machine"], "rick-rubin": ["record-wall", "meditation-corner"], "steve-aoki": ["turntables", "record-wall"],
  madlib: ["turntables", "record-wall"], "frank-sinatra": ["mic-stand", "easel"], sting: ["guitar-acoustic", "meditation-corner"], "phil-collins": ["drum-kit", "mic-stand"],
  "david-byrne": ["bicycle", "guitar-electric"], "dave-matthews": ["guitar-acoustic", "mic-stand"], "jimmy-buffett": ["guitar-acoustic", "fishing-rods"], "hank-williams": ["guitar-acoustic", "mic-stand"],
  "paul-simon": ["guitar-acoustic", "record-wall"], "keanu-reeves": ["guitar-electric", "book-towers"], "stephen-king": ["typewriter", "guitar-electric", "book-towers"],
  // chess, cards, tennis, golf and the rest of sport
  "peter-thiel": ["chess-table", "book-towers"], "alan-turing": ["mainframe", "chalkboard", "chess-table"],
  "stanley-kubrick": ["movie-camera", "chess-table", "camera-tripod"], "benjamin-franklin": ["chess-table", "lab-bench", "writing-desk"], "warren-buffett": ["card-table", "book-towers"],
  "bill-gates": ["card-table", "book-towers"], "david-blaine": ["card-table", "mic-stand"], "criss-angel": ["card-table", "poster-wall"],
  "arthur-ashe": ["tennis-console", "tennis-rack", "book-towers"], "serena-williams": ["tennis-rack", "trophy-cabinet", "dress-form"], "venus-williams": ["tennis-rack", "dress-form"],
  "john-mcenroe": ["tennis-rack", "guitar-electric", "tennis-console"], "suzanne-lenglen": ["tennis-rack", "trophy-cabinet"],
  "tiger-woods": ["golf-bag", "putting-mat", "trophy-cabinet"], "jack-nicklaus": ["golf-bag", "putting-mat"], "phil-mickelson": ["golf-bag", "putting-mat"], "rory-mcilroy": ["golf-bag", "putting-mat"],
  "bubba-watson": ["golf-bag", "putting-mat"], "rickie-fowler": ["golf-bag", "putting-mat"], "michael-jordan": ["basketball-hoop", "golf-bag", "trophy-cabinet"], "lebron-james": ["basketball-hoop", "ball-rack", "trophy-cabinet"],
  "kareem-abdul-jabbar": ["basketball-hoop", "book-towers", "record-wall"], "magic-johnson": ["basketball-hoop", "trophy-cabinet"], "larry-bird": ["basketball-hoop", "trophy-cabinet"],
  "stephen-curry": ["basketball-hoop", "golf-bag"], "charles-barkley": ["basketball-hoop", "golf-bag"], "kobe-bryant": ["basketball-hoop", "trophy-cabinet", "movie-camera"],
  "muhammad-ali": ["heavy-bag", "trophy-cabinet", "mic-stand"], "roy-jones-jr": ["heavy-bag", "basketball-hoop"],
  "bruce-lee": ["training-dummy", "heavy-bag", "book-towers"], "jackie-chan": ["training-dummy", "movie-camera"], "chuck-norris": ["training-dummy", "heavy-bag"],
  "tom-brady": ["ball-rack", "dumbbell-rack", "trophy-cabinet"], "peyton-manning": ["ball-rack", "chalkboard"], "babe-ruth": ["ball-rack", "trophy-cabinet"], "shohei-ohtani": ["ball-rack", "trophy-cabinet"],
  "jason-kelce": ["ball-rack", "dumbbell-rack"], "lionel-messi": ["ball-rack", "trophy-cabinet"], "cristiano-ronaldo": ["ball-rack", "trophy-cabinet", "dumbbell-rack"], pele: ["ball-rack", "trophy-cabinet"],
  ronaldinho: ["ball-rack", "trophy-cabinet"], "kelly-slater": ["surfboards", "trophy-cabinet"], "laird-hamilton": ["surfboards", "dumbbell-rack"], "duke-kahanamoku": ["surfboards", "trophy-cabinet"],
  "tony-hawk": ["skateboards", "arcade"], "bob-burnquist": ["skateboards", "trophy-cabinet"], "shaun-white": ["skateboards", "guitar-electric"], 
  "arnold-schwarzenegger": ["dumbbell-rack", "weights", "trophy-cabinet"], "dwayne-johnson": ["dumbbell-rack", "weights"], "sylvester-stallone": ["heavy-bag", "easel"],
  // games and tech
  "shigeru-miyamoto": ["arcade", "guitar-acoustic", "greenhouse"], "alexey-pajitnov": ["arcade", "chess-table"], "takashi-tezuka": ["arcade", "greenhouse"], ninja: ["arcade", "pc"],
  "elon-musk": ["model-rocket", "arcade", "mainframe"], "steve-jobs": ["meditation-corner", "record-wall"], "ray-kurzweil": ["keys", "book-towers", "mainframe"], "tim-berners-lee": ["mainframe", "book-towers"],
  "grace-hopper": ["mainframe", "chalkboard", "radio-set"], "ada-lovelace": ["mainframe", "writing-desk", "book-towers"], "mark-rober": ["lab-bench", "mainframe"],
  // science
  "nikola-tesla": ["tesla-coil", "lab-bench", "book-towers"], "albert-einstein": ["chalkboard", "violin", "book-towers"], "marie-curie": ["lab-bench", "microscope", "chalkboard"],
  "isaac-newton": ["telescope", "writing-desk", "lab-bench"], "galileo-galilei": ["telescope", "writing-desk"], "johannes-kepler": ["telescope", "chalkboard"], "nicolaus-copernicus": ["telescope", "map-wall"],
  "carl-sagan": ["telescope", "book-towers", "map-wall"], "neil-degrasse-tyson": ["telescope", "book-towers"], "stephen-hawking": ["chalkboard", "book-towers"], "charles-darwin": ["microscope", "greenhouse", "book-towers"],
  "gregor-mendel": ["greenhouse", "microscope"], "michael-faraday": ["lab-bench", "chalkboard"], "ernest-rutherford": ["lab-bench", "chalkboard"], "niels-bohr": ["chalkboard", "book-towers"],
  "werner-heisenberg": ["chalkboard", "piano"], "j-robert-oppenheimer": ["chalkboard", "book-towers", "saddle-stand"], "thomas-edison": ["lab-bench", "record-player", "film-projector"],
  "neil-armstrong": ["model-rocket", "flag-podium"], "john-glenn": ["model-rocket", "flag-podium"], "edmund-hillary": ["map-wall", "book-towers"], "tenzing-norgay": ["map-wall", "meditation-corner"],
  // art, letters, film
  "leonardo-da-vinci": ["easel", "writing-desk", "sculpture-stand"], michelangelo: ["sculpture-stand", "canvas-rack"], "pablo-picasso": ["easel", "canvas-rack", "pottery-wheel"],
  "frida-kahlo": ["easel", "canvas-rack", "greenhouse"], "salvador-dali": ["easel", "canvas-rack"], "diego-rivera": ["easel", "canvas-rack"], "bob-ross": ["easel", "canvas-rack"],
  "ai-weiwei": ["pottery-wheel", "camera-tripod"], "george-orwell": ["typewriter", "book-towers", "greenhouse"], "oscar-wilde": ["writing-desk", "book-towers"], "jack-kerouac": ["typewriter", "book-towers"],
  "hunter-s-thompson": ["typewriter", "book-towers"], "william-shakespeare": ["writing-desk", "book-towers"], "jane-austen": ["piano", "writing-desk"],
  "emily-dickinson": ["greenhouse", "writing-desk"], "charles-dickens": ["writing-desk", "book-towers"], "maya-angelou": ["typewriter", "book-towers"],
  "alfred-hitchcock": ["movie-camera", "film-projector"], "steven-spielberg": ["movie-camera", "film-projector"], "george-lucas": ["film-projector", "movie-camera"], "quentin-tarantino": ["film-projector", "poster-wall", "record-wall"],
  "martin-scorsese": ["film-projector", "poster-wall"], "christopher-nolan": ["movie-camera", "film-projector"], "akira-kurosawa": ["movie-camera", "easel"], "charlie-chaplin": ["movie-camera", "violin", "piano"],
  "buster-keaton": ["movie-camera", "film-projector"], "david-lynch": ["movie-camera", "easel"], "jim-carrey": ["easel", "mic-stand"],
  // kitchen
  "gordon-ramsay": ["chef-range", "knife-rack"], "martha-stewart": ["chef-range", "greenhouse", "knife-rack"], "paula-deen": ["chef-range", "knife-rack"],
  // office-holders and the rest of public life
  "george-washington": ["flag-podium", "saddle-stand", "greenhouse"], "abraham-lincoln": ["flag-podium", "book-towers", "writing-desk"], "thomas-jefferson": ["book-towers", "map-wall", "greenhouse", "violin"],
  "theodore-roosevelt": ["flag-podium", "book-towers", "heavy-bag"], "franklin-d-roosevelt": ["flag-podium", "radio-set"], "barack-obama": ["basketball-hoop", "flag-podium", "book-towers"],
  "jimmy-carter": ["flag-podium", "fishing-rods"], "winston-churchill": ["easel", "flag-podium", "book-towers"], "jfk": ["flag-podium", "book-towers"], "ronald-reagan": ["flag-podium", "saddle-stand"],
  "bernie-sanders": ["flag-podium", "book-towers"], "nelson-mandela": ["flag-podium", "heavy-bag", "book-towers"], "mahatma-gandhi": ["spinning-wheel", "book-towers"], "martin-luther-king-jr": ["flag-podium", "book-towers"],
  "rosa-parks": ["sewing-machine", "book-towers"], "queen-elizabeth-ii": ["saddle-stand", "flag-podium"], "oprah-winfrey": ["book-towers", "greenhouse"], "socrates": ["writing-desk", "book-towers"],
  "marcus-aurelius": ["writing-desk", "book-towers"], "leonardo-dicaprio": ["movie-camera", "poster-wall"],
};
// the slugs of the people the table must not leave out of the neutral rule
const NEUTRAL = ["book-towers", "bonsai", "radio-set", "map-wall", "dartboard", "greenhouse"];

// ---- 3. rules: the job tag, the drive, a nudge of taste ------------------------------------------------
const JOB_TAGS = [
  ["art", /pixel-renderer|culture-curator|museum-guide|fabricator/], ["music", /musician|singer|karaoke|cypher/],
  ["scholar", /lecturer|philosopher|research|tutor|stacks-librarian|archivist|teacher|chronometrist|obituary|translator|guidance/],
  ["athlete", /athlete|combat|footballer|coach|surf|ski-instructor|conditioning|lifeguard|patrol/],
  ["broadcast", /broadcast|stage-performer|announcer|copywriter|night-editor/], ["tech", /engineer|latency|data-hall|product-manager|cache-custodian|mechanic/],
  ["cook", /cook|chef|itamae|brewer|pizza/],
];
const BY_TAG = {
  art: ["canvas-rack", "easel", "sculpture-stand", "pottery-wheel", "camera-tripod"],
  music: ["guitar-acoustic", "keys", "violin", "horn-stand", "record-wall", "mic-stand", "turntables"],
  scholar: ["book-towers", "chalkboard", "telescope", "map-wall", "writing-desk", "microscope"],
  athlete: ["dumbbell-rack", "ball-rack", "heavy-bag", "trophy-cabinet", "tennis-rack", "golf-bag", "basketball-hoop", "bicycle"],
  broadcast: ["mic-stand", "film-projector", "movie-camera", "poster-wall"],
  tech: ["mainframe", "lab-bench", "model-rocket", "chalkboard", "radio-set"],
  cook: ["chef-range", "knife-rack", "greenhouse"],
  hedonist: ["record-wall", "turntables", "dartboard", "poster-wall", "bicycle"],
};
const BY_DRIVE = {
  acquisitive: ["trophy-cabinet", "map-wall", "flag-podium"], cautious: ["book-towers", "bonsai", "radio-set", "meditation-corner"], speculator: ["chess-table", "card-table", "mainframe"],
  contrarian: ["telescope", "typewriter", "chess-table", "skateboards"], fashion: ["dress-form", "sewing-machine", "poster-wall", "record-wall"], populist: ["flag-podium", "radio-set", "dartboard", "bicycle"],
  revolutionary: ["typewriter", "book-towers", "chalkboard", "spinning-wheel"],
};
const GENERIC = ["bonsai", "greenhouse", "fishing-rods", "bicycle", "radio-set", "record-wall", "book-towers", "dartboard", "meditation-corner", "telescope", "map-wall", "writing-desk"];
// the share of tech-job people who also keep a JETSAM! cabinet (a tech job in this city says something about the hobby)
const GAMES_RATE = { tech: 1 / 8 };
const pickOf = (list, key) => list[Math.min(list.length - 1, Math.floor(h01(key) * list.length))];

const TAGS = new WeakMap();
export function subjectTags(s) {
  let t = TAGS.get(s);
  if (t == null) {
    t = [];
    try { const j = jobOf(s).jobId; for (const [tag, re] of JOB_TAGS) if (re.test(j)) { t.push(tag); break; } } catch { /* no job on file */ }
    try { if (familyOf(s).family === "charm") t.push("hedonist"); } catch { /* no family on file */ }
    TAGS.set(s, t);
  }
  return t;
}
const keyOfSubject = (s) => s?.slug || slugify(String(s?.name || "unnamed"));

function byRules(s, key) {
  const out = [];
  const add = (id) => { if (id && !out.includes(id) && out.length < 4) out.push(id); };
  const tags = subjectTags(s);
  for (const tag of tags) add(pickOf(BY_TAG[tag], `${key}|${tag}`));
  if (tags.some(tg => GAMES_RATE[tg] && h01(`${key}|games`) < GAMES_RATE[tg])) out.unshift("arcade");
  let drive = null;
  try { drive = driveOf(s); } catch { /* no breakdown */ }
  if (drive) add(pickOf(h01(`${key}|d2`) < 0.5 ? BY_DRIVE[drive] : GENERIC, `${key}|drive`));
  for (let i = 0; out.length < 2 && i < 12; i++) add(pickOf(GENERIC, `${key}|gen${i}`));
  if (h01(`${key}|jetsam`) < RANDOM_JETSAM && !out.includes("arcade")) { if (out.length >= 4) out.pop(); out.push("arcade"); }
  return out.slice(0, 4);
}

const neutral = (key) => { const i = Math.floor(h01(`${key}|neutral`) * NEUTRAL.length); return [NEUTRAL[i], NEUTRAL[(i + 1 + Math.floor(h01(`${key}|n2`) * (NEUTRAL.length - 1))) % NEUTRAL.length]]; };

// -> 2-4 catalog ids for one figure
export function propsFor(s) {
  const key = keyOfSubject(s);
  if (CURATED[key]) return CURATED[key];
  let harm = false;
  try { harm = Boolean(s?.harmReview?.decision) || familyOf(s).family === "harm"; } catch { /* no family on file */ }
  if (harm) return neutral(key);
  const ai = BY_FIGURE[key];
  if (Array.isArray(ai) && ai.length >= 2) return ai;
  return byRules(s, key);
}

// A flat's residents -> [{id, owner}], at most MAX_PER_FLAT, the first resident's best first
export function residentProps(list) {
  const out = [];
  if (!list || !list.length) return out;
  const per = list.map(s => ({ owner: `${surname(s)}'S`, ids: propsFor(s) }));
  for (let round = 0; round < 4 && out.length < MAX_PER_FLAT; round++) {
    for (const p of per) {
      const id = p.ids[round];
      if (id && out.length < MAX_PER_FLAT && !out.some(o => o.id === id)) out.push({ id, owner: p.owner });
    }
  }
  return out;
}

// The tag string lookOf keys on: "broadcast,hedonist,+guitar-wall~LENNON'S,+piano~LENNON'S"
export function residentTags(list) {
  if (!list || !list.length) return "";
  const out = new Set();
  for (const s of list) subjectTags(s).forEach(x => out.add(x));
  const tags = [...out].sort();
  return [...tags, ...residentProps(list).map(p => `+${p.id}~${p.owner}`)].join(",");
}
// ... and back: {tags: ["broadcast"], props: [{id, owner}]}
export function splitTags(str) {
  const tags = [], props = [];
  for (const t of str ? str.split(",") : []) {
    if (t[0] !== "+") { tags.push(t); continue; }
    const i = t.indexOf("~");
    props.push({ id: i < 0 ? t.slice(1) : t.slice(1, i), owner: i < 0 ? "" : t.slice(i + 1) });
  }
  return { tags, props };
}
