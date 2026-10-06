// THE EB SHOP's staff, live (Scott, 2026-10-05: "bots that actually walk around and do stuff,
// or sit behind the counter and talk to each other, or that you could interact with"). The six
// hosts of EBSN (Scott's own characters: eb-command-center/edit/qvc_hosts.md) work the shop
// floor in shifts on the city's clock: one at the register, one walking the floor, one at the
// turntable presenting the featured item. The rest are off the clock in THE UNION LOUNGE
// upstairs. They talk to each other in short bubbles, one at a time per room, and a tap turns
// one to you with a pitch for a real item from the live stock.
//
// Pure and deterministic (building id + machine day and hour): every viewer sees the same
// crew at the same hour. No plans or ids in the sim change: the hosts are drawn over the
// room (funnelProps.js) and never enter the census. Scripted lines only; hostSay() is the one
// seam a future voice or chat would replace (EB's voice stack: vox.py CARDs, library voices).

export const HOST_IDS = ["carol", "dale", "asuka", "hector", "joan", "vern"];   // hosts.png order

// Wardrobe from each host's looks (eb-command-center/hosts/<host>/looks): no two alike.
// top, bottom, accent (collar, tie, bow), skin, hair; build: w (shoulders), h (height) in sprite px.
export const HOSTS = {
  dale: { name: "DALE", crew: "day", top: "#7a5432", bottom: "#4a3420", accent: "#f2df8a", hair: "#8a7a6a", skin: "#e0b48c", w: 12, h: 30, walk: 1.0 },
  carol: { name: "CAROL", crew: "day", top: "#c25a7a", bottom: "#3a5a9a", accent: "#7ab4e8", hair: "#e8cf8a", skin: "#f0c8a8", w: 12, h: 28, dress: true, walk: 0.9 },
  vern: { name: "VERN", crew: "night", top: "#26324a", bottom: "#3a3a40", accent: "#9aa4b4", hair: "#7a6a5a", skin: "#d8b498", w: 11, h: 30, walk: 0.6 },
  joan: { name: "JOAN", crew: "night", top: "#8a8a90", bottom: "#5a2a4a", accent: "#7a3a6a", hair: "#9a4a2a", skin: "#ecc4a4", w: 11, h: 27, walk: 0.7 },
  hector: { name: "HÉCTOR", crew: "intl", top: "#2a2a30", bottom: "#22222a", accent: "#7a2a2a", hair: "#2a2420", skin: "#b88a64", w: 13, h: 30, walk: 0.9 },
  asuka: { name: "ASUKA", crew: "intl", top: "#efe6d4", bottom: "#8a4a2a", accent: "#e88aa8", hair: "#141418", skin: "#f0d0b4", w: 10, h: 26, walk: 0.8 },
};
// The shop's three dayparts, as EBSN schedules them: the day shift, La Hora Internacional,
// Liquidation Hour after midnight.
const CREW_PAIR = { day: ["dale", "carol"], intl: ["hector", "asuka"], night: ["vern", "joan"] };
export const blockOf = (hour) => (hour >= 6 && hour < 14 ? "day" : hour >= 14 && hour < 22 ? "intl" : "night");

function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Who is on: the daypart's pair and one other host covering a shift, roles dealt by the day.
// -> { register, floor, turntable, off: [hosts in the lounge] }
export function shiftAt(buildingId, day, hour) {
  const block = blockOf(((hour % 24) + 24) % 24);
  const day0 = block === "night" && hour < 6 ? day - 1 : day;   // the night shift started yesterday
  const pair = CREW_PAIR[block];
  const rest = HOST_IDS.filter(h => !pair.includes(h));
  const k = h32(`${buildingId}|${day0}|${block}`);
  const cover = rest[k % rest.length];
  const crew = [...pair, cover];
  const r = (k >>> 8) % 6, perms = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1], [2, 1, 0]][r];
  const off = rest.filter(h => h !== cover);
  return { block, register: crew[perms[0]], floor: crew[perms[1]], turntable: crew[perms[2]], on: crew, off };
}

// ---- what they say -------------------------------------------------------------------------
// Short, in their own voices, aware of where they work. Bubbles, all caps like the rest of the
// city. Facts about products come only from the live listing (title, price): nothing else is
// asserted, and nobody promises shipping, returns or discounts (the host bible's hard rule).
export const CHATTER = {
  dale: [
    "BEHOLD. A WALL OF THINGS PEOPLE ONCE LOVED.",
    "HEAL THROUGH COMMERCE, CAROL. IT IS ALL WE HAVE.",
    "THE DEPARTMENT SCORED ME A 61. I SCORED THIS SHELF A TEN.",
    "EVERY SCRATCH ON A DISC IS SOMEBODY'S SATURDAY.",
    "I WAS ALMOST FAMOUS ONCE. FOR SOMETHING. HAR—",
    "WE DON'T SELL OBJECTS. WE SELL SECOND CHANCES. USED.",
    "IF THE CENSUS WANTS A COUNT: ONE SALE. I'M COUNTING IT TWICE.",
    "THE PRICE TAG IS NOT A NUMBER. IT IS A HANDSHAKE.",
    "SOMEONE ON THE LOOP JUST LOOKED IN. I FELT IT.",
    "I NEVER GOLF ON A SHIFT. I THINK ABOUT GOLF ON A SHIFT.",
    "CAROL, STRAIGHTEN THE DVDS. THEY CAN SENSE WEAKNESS.",
    "FIVE DOLLARS. FOR A WHOLE FILM. WITH AN ENDING.",
  ],
  carol: [
    "I DUSTED THE BIN. IT DUSTED ME BACK.",
    "I HELD THIS ONE ALL NIGHT. IT DOESN'T JUDGE.",
    "MY PASTOR WARNED ME ABOUT A STORE LIKE THIS. HE WAS RIGHT. I'M STAYING.",
    "THE MARCH '89 ISSUE AND I ARE NOT DISCUSSING IT.",
    "IF I DON'T SELL ONE TODAY I'LL LIE DOWN ON THE RECORDS.",
    "THE PRIZE COUNTER BOY ACROSS TOWN HAS EYES LIKE A PAROLE HEARING.",
    "I'D BURY THIS ONE IN THE GARDEN. FOR SAFEKEEPING. HA.",
    "THE CENSUS ASKED MY AGE. I GAVE THEM A RANGE.",
    "SOMEDAY I'M TAKING A BOAT. ALL THE DVDS ARE COMING.",
    "DALE, THE MAN AT THE DOOR IS BROWSING WITH INTENT.",
    "THEY SAY IT'S JUST A STORE. NOTHING IS JUST A STORE, HONEY.",
    "I KNOW EVERY SPINE ON THAT SHELF BY TOUCH. DON'T ASK HOW.",
  ],
  vern: [
    "NOTHING SELLS DOWN HERE. WE SELL IT ANYWAY.",
    "THE DEPARTMENT RATES THIS SHOP. I RATE IT LOWER.",
    "I COVERED A SHIFT UPSTAIRS ONCE. ONCE.",
    "ITEM NUMBER FOUR. A FILM. IT ENDS. MOST THINGS DO.",
    "WHEN I'M GONE, SOMEONE ELSE CAN ALPHABETISE THIS.",
    "THE SMOKEMASTER 9000 IS NOT FOR SALE. NOR IS IT FOR ANYTHING.",
    "I HAVE BEEN DOWN HERE SINCE THE BINS WERE NEW. THEY WERE NOT NEW.",
    "THE PRICE IS THE PRICE. I AM NOT AUTHORISED TO FEEL OTHERWISE.",
    "THE LOOP RUNS ON TIME. I DO NOT.",
    "ANYWAY. FIVE DOLLARS.",
    "JOAN, SOMEONE LOOKED AT THE SHELF. LOWER YOUR EXPECTATIONS.",
  ],
  joan: [
    "MM. THE LIGHT IN HERE IS VERY HONEST AT THIS HOUR.",
    "EVERY CASE HAS A SMALL HISTORY. THIS ONE HAS A CRACK.",
    "THE DAY SHIFT STILL THINKS SOMEONE IS WATCHING. HOW SWEET.",
    "I TOOK A CERAMICS CLASS. THE GLAZE LOOKED EXACTLY LIKE THIS SPINE.",
    "IT'S QUIET, DOWN HERE. I FIND THAT GENEROUS.",
    "THE DEPARTMENT GAVE ME A SCORE. I DIDN'T OPEN THE ENVELOPE.",
    "A BIRD LANDED ON THE SIGN THIS MORNING. IT DIDN'T BUY ANYTHING EITHER.",
    "VERN, YOU'VE SHELVED IT UPSIDE DOWN. IT'S LOVELIER THAT WAY.",
    "MY MOTHER'S KITCHEN HAD THIS EXACT HUM.",
    "THERE'S NO HURRY. THERE IS NEVER ANY HURRY.",
    "SOMEONE MADE THIS FILM ON PURPOSE. ISN'T THAT SOMETHING.",
  ],
  hector: [
    "AMIGOS, EL PRECIO ES REAL. THE PRICE IS REAL.",
    "A GOOD SHELF SELLS ITSELF. A GREAT SHELF NEEDS ME.",
    "ASUKA, LA SEÑORA ONLY ASKED IF IT WAS IN STOCK.",
    "BIENVENIDOS. EVERYTHING ON THE WALL IS FOR SALE. TODO.",
    "LOOK AT THE CASE. THE CASE TELLS YOU EVERYTHING.",
    "THE DEPARTMENT WANTS QUOTAS. I WANT A CUSTOMER WHO LEAVES HAPPY.",
    "ONE ITEM, ONE PERSON. THAT IS THE WHOLE JOB.",
    "SI LO VES, LO QUIERES. IF YOU SEE IT, YOU WANT IT.",
    "I DON'T TRANSLATE EVERYTHING SHE SAYS. I TRANSLATE THE PRICE.",
    "THE TURNTABLE IS SLOW ON PURPOSE. GIVES YOU TIME TO FALL IN LOVE.",
    "AMIGOS, THE REGISTER IS OPEN. MY HEART IS OPEN. MOSTLY THE REGISTER.",
  ],
  asuka: [
    "THIS SHOP IS A SPIRITUAL SITE. NOBODY HAS TOLD THE SHOP.",
    "WHY IS THE MAN SHOUTING. ...IS HE UNWELL.",
    "THE TAPE ON THE BOTTOM SHELF. DO NOT PLAY IT AFTER MIDNIGHT.",
    "THERE IS A ROOM ABOVE US THAT STAYS COLD. IT IS THE LOUNGE.",
    "EVERY OBJECT HERE WAS SOMEBODY'S. SOME OF THEM STILL ARE.",
    "THE CENSUS COUNTS NINE IN THIS ROOM. I COUNT TEN.",
    "HÉCTOR SAYS SMILE. I AM SMILING. THIS IS IT.",
    "IF YOU HEAR THE TURNTABLE WHEN IT IS OFF, THAT IS NORMAL.",
    "THE DEPARTMENT SEES EVERYTHING. NOT IN HERE. IN HERE SOMETHING ELSE DOES.",
    "IT IS A VERY GOOD FILM. WHOEVER WATCHES IT RECEIVES A VISITOR.",
    "PLEASE RETURN THE DISC TO ITS CASE. IT PREFERS THE DARK.",
  ],
};
// Off the clock, upstairs.
export const OFF_LINES = {
  dale: "OFF THE CLOCK. MY HANDS STILL WANT TO SELL.",
  carol: "I'M ON BREAK. THE BREAK IS SPIRITUAL.",
  vern: "I AM NOT HERE. I AM IN THE LOUNGE.",
  joan: "MM. EVEN THE SOFA HAS A STORY.",
  hector: "DESCANSO, AMIGOS. TEN MINUTES. MAYBE NINE.",
  asuka: "THE LOUNGE IS COLDER THAN THE SHOP. AS EXPECTED.",
};

// A pitch for a real item, in the host's voice: the title and price as the listing has them.
const PITCH = {
  dale: ["BEHOLD. {T}. {P}. I'M PRACTICALLY PAYING YOU.", "{T}! FOR {P}! THAT'S LESS THAN A FEELING COSTS.", "THIS ONE'S A STEAL. {T}. {P}. TAKE IT. PLEASE."],
  carol: ["OH, THIS ONE. {T}. {P}. I'D SLEEP BESIDE IT.", "{T}, HONEY. {P}. DON'T TELL MY PASTOR.", "I'VE BEEN GUARDING {T} FOR YOU. {P}."],
  vern: ["{T}. {P}. IT WILL NOT CHANGE YOUR LIFE. IT MIGHT FILL AN EVENING.", "ITEM: {T}. PRICE: {P}. THAT IS THE WHOLE PITCH.", "{T}. {P}. I HAVE SOLD WORSE. RARELY."],
  joan: ["MM. {T}. {P}. SOMEONE CARED FOR THIS ONCE.", "HAVE A LOOK AT {T}. {P}. NO HURRY AT ALL.", "{T}. {P}. IT HAS A QUIET SORT OF CONFIDENCE."],
  hector: ["AMIGOS: {T}. {P}. PARA USTED. FOR YOU.", "{T}. {P}. LOOK AT IT. NOW LOOK AT ME. YES.", "THIS ONE, {T}. {P}. I WOULD NOT LIE TO YOU ABOUT A PRICE."],
  asuka: ["{T}. {P}. IT HAS BEEN WAITING FOR YOU SPECIFICALLY.", "THIS IS {T}. {P}. PLEASE DO NOT WATCH IT ALONE.", "{T}. {P}. THE CASE IS COLD. THAT IS A GOOD SIGN."],
};
export const priceText = (p) => { const n = Number(p); return Number.isFinite(n) ? (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`) : `$${p}`; };
// "The Sting (DVD)" -> "THE STING ON DVD"; a long title cut at a word, never mid-word.
export function shortTitle(t) {
  const m = String(t).match(/^(.*?)\s*\((DVD|VHS|BLU-RAY|CD|4K)\)\s*$/i);
  let base = (m ? m[1] : String(t)).toUpperCase().trim();
  if (base.length > 44) base = base.slice(0, 44).replace(/\s+\S*$/, "") + "…";
  return m ? `${base} ON ${m[2].toUpperCase()}` : base;
}

// THE SEAM. Everything a host says comes through here: {kind: "chatter"|"pitch"|"off", host,
// n (which line, or which tap), item}. Scripted today; a live voice or chat can replace this one
// function (and keep the same contract: short, in character, product facts only from item).
export function hostSay({ kind, host, n = 0, item = null }) {
  if (kind === "pitch" && item) {
    const list = PITCH[host] || PITCH.dale;
    return list[n % list.length].replace("{T}", shortTitle(item.title)).replace("{P}", priceText(item.price));
  }
  if (kind === "off") return OFF_LINES[host] || "OFF THE CLOCK.";
  const list = CHATTER[host] || CHATTER.dale;
  return list[n % list.length];
}

// The room's one bubble: every BEAT seconds one of the hosts on the floor says a line, shown
// for SHOW seconds (then the room is quiet until the next). Deterministic in time.
export const BEAT = 7, SHOW = 4.6;
export function chatterAt(buildingId, hosts, tSec) {
  if (!hosts.length) return null;
  const slot = Math.floor(tSec / BEAT), age = tSec - slot * BEAT;
  const k = h32(`${buildingId}|chat|${slot}`);
  const host = hosts[k % hosts.length];
  return { host, line: hostSay({ kind: "chatter", host, n: (k >>> 7) }), age, fade: age > SHOW ? 0 : Math.min(1, (SHOW - age) / 0.6, age / 0.25) };
}

// Taps: each host counts the times you have asked (this page only), so a second tap is
// another item, a third a line of banter, and round again.
const ASKED = new Map();
let PITCHING = null;   // {host, line, at (s)}: the bubble over a host who turned to you
export const pitching = () => PITCHING;
export function tapHost(host, items, nowSec, off = false) {
  const n = ASKED.get(host) || 0;
  ASKED.set(host, n + 1);
  const stock = Array.isArray(items) ? items : [];
  let item = null, line;
  if (off) line = hostSay({ kind: "off", host });
  else if (stock.length && n % 3 !== 2) { item = stock[(h32(host) + n * 7) % stock.length]; line = hostSay({ kind: "pitch", host, n, item }); }
  else line = hostSay({ kind: "chatter", host, n: n * 5 + 3 });
  PITCHING = { host, line, at: nowSec };
  return { host, line, item };
}
export function resetHosts() { ASKED.clear(); PITCHING = null; }
