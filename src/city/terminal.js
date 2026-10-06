// THE TERMINAL: the city's internet cafe (docs/design/COMMS.md, "Access"). Pure data, no imports
// beyond shorePlaza.js's (sim.js reads it; it may not import anything that imports sim.js).
//
// WHERE. Not a new building: THE SHORE PLAZA left two shops TO LET on the east boardwalk when Sam's
// and Irene's moved into the tower (shorePlaza.js PLAZA_SHELLS). The first of them, THE OLD PIZZA
// COUNTER (building id `sams-pizza`, the old lot), is let to the Department: rows of beige PCs
// along the old counter, a coffee counter where the ovens stood. Same place id, same building id,
// same lot and ground: nothing moved.
//
// THE DAY BOUNDARY (docs/planning/MASTER_PLAN.md). CAFE_DAY is the first machine day it trades: set
// past every day published at the push. Before it the shell is in no plan (as it always was), takes
// no staff and draws nobody, so a published day, or one rebuilt, is byte for byte what the code
// before built (scripts/check-mail.mjs holds the two days before it against the earlier code's
// hashes, scripts/fixtures/terminal-pre.json). From it: the attendants, the visitors. The room is
// drawn as the cafe from the deploy, and a tap on a PC opens DEPARTMENT MAIL from the deploy (mail
// does not wait for the sim).
import { PLAZA_SHELLS } from "./shorePlaza.js";

export const CAFE_DAY = 644;                        // machine day; set past every day published at the push
export const CAFE_ID = PLAZA_SHELLS[0][0];          // "boardwalk-east-to-let-a": the place (its id kept)
export const CAFE_BUILDING = "sams-pizza";          // the old lot's building (its id kept)
export const CAFE_NAME = "THE TERMINAL (INTERNET CAFE, EVERY KEYSTROKE LOGGED)";
export const CAFE_SHORT = "THE TERMINAL";
export const CAFE_FLOOR = "THE TERMINAL: PUBLIC PCS AND A COFFEE COUNTER";
export const CAFE_HREF = "#mail?at=terminal";
export const cafeOpenOn = (day) => day >= CAFE_DAY;

// THE JOBS (from CAFE_DAY): a share of the cafes' and the Parts Depot's people mind the PCs.
// [id, title, place, ladder, fields, dims, extra] (sim.js J): in JOB, not JOBS (assignment unchanged).
export const CAFE_JOBS = [
  ["cafe-attendant", "Cafe Attendant", CAFE_ID, ["Mouse Wiper", "Cafe Attendant", "Senior Attendant", "Keeper of the Log-Ins"], ["hospitality", "computing", "*"], ["care", "utility"], { shift: "evening" }],
];
export const CAFE_STAFF = [
  { job: "cafe-attendant", from: ["caffeine-dispenser", "depot-clerk", "prize-clerk"], p: 0.12 },
];
// THE PULL (from CAFE_DAY): open 08:00 to 01:00; the young and the online come most (by tier band,
// 0 the top .. 2 the lowest; plus computing and writing on the record).
export const CAFE_PULL = { band: [0.2, 0.5, 0.9], computing: 0.9, writing: 0.4, open: [8, 25] };
export const cafeHours = (hour) => hour == null || (hour >= CAFE_PULL.open[0] && hour < CAFE_PULL.open[1]) || hour < CAFE_PULL.open[1] - 24;
