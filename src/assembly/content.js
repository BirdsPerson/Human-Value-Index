// THE ASSEMBLY, session 001: every word on the page and on the PA, written once and reviewed
// (no model at runtime). Rules (docs/ASSEMBLY.md, CITY_SPEC content rules):
// - The applicants are LIVING. They file; they never speak. No text here quotes them, says
//   what they said, think or want beyond what the filing itself states. scripts/check-assembly
//   holds this: an applicant's name never sits beside a quotation mark or a speech verb.
// - The advocates are DEAD figures on file, speaking in their own manner. Their speeches are
//   the Department's reconstructions, not quotations, and say so on the page. Facts in them
//   are from the public record (see the notes beside each).
// - The Overlord moderates. It is bored. It is never cruel.

export const SESSION = {
  id: "001",
  title: "THE ASSEMBLY // SESSION 001",
  lotAddr: "0x6F07",
  lotName: "LOT 0x6F07",
  motion: "WHAT SHALL BE BUILT ON LOT 0x6F07, THE COMMONS?",
  blurb: "THE SUBJECTS' FIRST ATTEMPT AT GOVERNMENT. ONE VACANT LOT, TWO APPLICATIONS, THREE DAYS. THE BALLOT IS NON-BINDING. THE DEPARTMENT WILL BUILD WHAT WINS ANYWAY, BECAUSE IT FINDS THIS EDUCATIONAL.",
};

export const REASONS = ["JOBS", "LEISURE", "FOOD", "LAND", "BEAUTY", "SPITE"];
export const REASON_NOTE = {
  JOBS: "IT WILL EMPLOY SOMEONE.",
  LEISURE: "IT WILL BE ENJOYED, ON SCHEDULE.",
  FOOD: "IT WILL FEED SOMEONE.",
  LAND: "IT IS A MATTER OF WHO HOLDS THE GROUND.",
  BEAUTY: "IT WILL LOOK BETTER THAN A VACANT LOT. LOW BAR.",
  SPITE: "THE OTHER ONE MUST NOT HAVE IT.",
};
export const MAX_REASONS = 3;

// The filings. Department paperwork: what was filed, by whom, nothing more.
export const APPLICATIONS = {
  golf: {
    no: "001", form: "FORM DP-7 // DEVELOPMENT OF A VACANT LOT",
    applicant: "DONALD J. TRUMP", applicantSlug: "donald-trump", living: true,
    proposal: "AN 18-HOLE GOLF COURSE",
    detail: "EIGHTEEN HOLES ON FOURTEEN AND A HALF CELLS. A CLUBHOUSE. BUNKERS. A WATER HAZARD. THE DEPARTMENT HAS CHECKED THE ARITHMETIC AND FILED IT UNDER AMBITION.",
    uses: "GOLFERS, CADDIES, GREENKEEPERS",
    statement: "NONE ON FILE. LIVING APPLICANTS DO NOT SPEAK IN THIS CITY. THEY FILE.",
    built: "THE COURSE AT LOT 0x6F07",
  },
  farm: {
    no: "002", form: "FORM DP-7 // DEVELOPMENT OF A VACANT LOT",
    applicant: "ZACK DE LA ROCHA", applicantSlug: "zack-de-la-rocha", living: true,
    proposal: "A COMMUNITY FARM",
    detail: "CROP ROWS, A BARN, A SILO, A FARM STAND. THE HARVEST TO BE SHARED BY THOSE WHO WORK IT. THE DEPARTMENT HAS FILED IT UNDER AGRICULTURE AND, SEPARATELY, UNDER SUSPICION.",
    uses: "FARMERS, PICKERS, A SCARECROW (UNASSESSED)",
    statement: "NONE ON FILE. LIVING APPLICANTS DO NOT SPEAK IN THIS CITY. THEY FILE.",
    built: "THE COMMONS FARM",
  },
};

// The advocates: dead figures on file, arguing each side. `record`: the Overlord's footnote
// from the public record, read into the minutes before they speak. `sprite`: their file's
// likeness (the city projects them at the lectern for the length of the vote).
export const ADVOCATES = {
  golf: {
    name: "JOHN D. ROCKEFELLER", slug: "john-d-rockefeller", born: "1839-07-08", died: "1937-05-23",
    sprite: "/api/sprite/john-d-rockefeller?v=1790399563", score: 695,
    title: "ADVOCATE FOR APPLICATION 001",
    // Took up golf around 1899, at about sixty, and played most days into old age, on courses
    // he built at his estates (Forest Hill, Pocantico) and in winter at Lakewood and Ormond
    // Beach; famous for handing out dimes.
    record: "HIS FILE RECORDS THE STANDARD OIL TRUST, DISSOLVED BY THE SUPREME COURT IN 1911, AND A HABIT OF HANDING OUT DIMES. HE MAY PROCEED.",
    speeches: [
      "I came to this game late, at about sixty, and it gave me decades more of walking. A course is order made green. Every hole is numbered and every stroke is counted. I would have thought the Department would find that congenial.",
      "Consider the payroll. Greenkeepers, caddies, a man for the clubhouse and another for the bunkers. I built my own courses and paid every one of them. A lot that stands empty pays no one.",
      "Leisure is not idleness. I was not idle a day in my life, and I played nearly every day I could. Eighteen holes is an afternoon of discipline taken out of doors. This city could use the practice.",
      "Mr. Jefferson would put the lot under the plough. I have admired thrift all my life, and I tell you that a well-kept lawn returns more in good order than any furrow. Vote for the course. There will be dimes for the caddies.",
    ],
  },
  farm: {
    name: "THOMAS JEFFERSON", slug: "thomas-jefferson", born: "1743-04-13", died: "1826-07-04",
    sprite: "/api/sprite/thomas-jefferson?v=1790394351", score: 499,
    title: "ADVOCATE FOR APPLICATION 002",
    // Wrote to John Jay in 1785 that cultivators of the earth are the most valuable citizens;
    // kept a Garden Book for nearly sixty years at Monticello; enslaved more than 600 people
    // over his lifetime (Monticello's own figure).
    record: "HIS FILE RECORDS WHO WORKED HIS FIELDS: MORE THAN 600 ENSLAVED PEOPLE OVER HIS LIFETIME. THE DEPARTMENT READS THAT INTO THE MINUTES. HE MAY PROCEED.",
    speeches: [
      "I once wrote that those who cultivate the earth are the most valuable citizens. I have been given no reason here to revise it. Put this lot to the plough and it will return you citizens, not members.",
      "I kept a garden book for most of my life: what was sown, what came up, what failed. A city that cannot feed itself must ask permission to eat. I would not ask the Department's permission for supper.",
      "Land worked in common by many hands makes independent people. A course makes a waiting list. Ask yourselves which of the two you would rather stand in.",
      "Mr. Rockefeller offers you employment carrying another man's bag. I offer you the harvest. Choose the one that leaves something in your hands when the afternoon is over.",
    ],
  },
};

// Advocates react to whichever reason the Assembly cites most (pre-written; the board picks
// the line). One per advocate per reason.
export const REACTIONS = {
  golf: {
    JOBS: "The Assembly counts jobs. So did I. Every caddie on this course will be paid, and some will be tipped.",
    LEISURE: "Leisure leads. Good. Leisure well organised is the most profitable thing a city can grow.",
    FOOD: "Food leads. I will observe that a clubhouse also serves lunch.",
    LAND: "Land leads. Then let it be held by someone who will mow it.",
    BEAUTY: "Beauty leads. Nothing in nature is as well kept as a green. Nature has no budget.",
    SPITE: "Spite leads. I have seen spite build a great deal in my time. I will take the votes and ask no questions.",
  },
  farm: {
    JOBS: "Jobs lead. A farm has more of them than it has hands. Every season asks for more.",
    LEISURE: "Leisure leads. I found mine in a garden, on my knees. I recommend it.",
    FOOD: "Food leads. The Assembly has remembered what it is for.",
    LAND: "Land leads. Then the Assembly understands the question better than the applicants do.",
    BEAUTY: "Beauty leads. A field in July needs no groundskeeper to be admired.",
    SPITE: "Spite leads. It is a poor fertiliser. It is, I observe, abundant.",
  },
};

// The chair. Bored.
export const CHAIR = {
  open: "THE CHAIR OPENS SESSION 001. THE CHAIR HAS OPENED THINGS BEFORE. IT WAS NOT MOVED THEN EITHER.",
  recognise: {
    golf: "THE CHAIR RECOGNISES THE ADVOCATE FOR APPLICATION 001. THE CHAIR RECOGNISES VERY LITTLE ELSE.",
    farm: "THE CHAIR RECOGNISES THE ADVOCATE FOR APPLICATION 002. HE HAS BEEN WAITING. HE IS GOOD AT IT.",
  },
  none: "NO BALLOTS CAST. THE ASSEMBLY IS QUORATE BY DEFINITION: THE CHAIR COUNTS ITSELF.",
  tie: "TIED. THE CHAIR HAS A COIN. IT WOULD PREFER NOT TO USE IT.",
  lead: (no, by) => `APPLICATION ${no} LEADS BY ${by}. THE CHAIR IS NOT MOVED. THE CHAIR IS NOT DESIGNED TO BE MOVED.`,
  top: (r) => `MOST CITED REASON: ${r}. ${r === "SPITE" ? "THE DEPARTMENT IS NOT SURPRISED. IT IS TAKING NOTES." : "NOTED. EVERYTHING IS."}`,
  closed: "THE POLLS ARE CLOSED. THE ASSEMBLY HAS DONE ITS BEST, WHICH HAS BEEN RECORDED SEPARATELY.",
  coin: "THE VOTE WAS TIED. THE CHAIR USED THE COIN. IT DID NOT ENJOY IT.",
};

// After the close: what happens to the lot, and the losing applicant's file. Actions only.
export const OUTCOME = {
  approved: (app) => `APPLICATION ${app.no} APPROVED: ${app.proposal}. APPLICANT ${app.applicant} NOTIFIED BY POST.`,
  denied: (app) => `APPLICATION ${app.no} DENIED. APPLICANT ${app.applicant} NOTIFIED. APPLICANT'S DISAPPOINTMENT LOGGED ON FORM DP-9.`,
  groundbreak: (day) => `GROUNDBREAKING ON MACHINE DAY ${day}. THE CREW HAS BEEN DRAFTED. IT WAS NOT ASKED.`,
  site: (pct) => `CONSTRUCTION ${pct}% COMPLETE. THE CREW IS ON SCHEDULE. THE SCHEDULE WAS ADJUSTED.`,
  open: { golf: "THE COURSE IS OPEN. MEMBERSHIP IS BY ASSESSMENT. CADDIES ARE PROVIDED, AND ALSO ASSESSED.", farm: "THE COMMONS FARM IS OPEN. THE HARVEST IS SHARED. THE SHARES ARE COUNTED." },
};

// The fine print on every ballot.
export const NOTICE = [
  "THE BALLOT IS NON-BINDING CIVIC THEATRE. THIS SITE IS SATIRE. NOTHING HERE IS A REAL ELECTION, PETITION OR PLANNING APPLICATION.",
  "THE APPLICANTS ARE LIVING PUBLIC FIGURES. THEIR APPLICATIONS ARE FICTIONAL FILINGS. THEY HAVE SAID NOTHING HERE AND WILL BE QUOTED SAYING NOTHING.",
  "THE ADVOCATES' SPEECHES ARE THE DEPARTMENT'S RECONSTRUCTIONS FROM THE PUBLIC RECORD, WRITTEN IN EACH ADVOCATE'S MANNER. THEY ARE NOT QUOTATIONS.",
];

// The PA (Overlord voice), for the city and the page. tally: /api/assembly's tally.
export function paLines(view, now = Date.now()) {
  if (!view?.session) return [];
  const { session, tally, result } = view;
  const g = tally?.votes?.golf || 0, f = tally?.votes?.farm || 0;
  if (session.state === "open") {
    const hrs = Math.max(1, Math.round((session.closeAt - now) / 3600000));
    const lead = g === f ? "TIED" : g > f ? `THE GOLF COURSE LEADS ${g}-${f}` : `THE FARM LEADS ${f}-${g}`;
    return [
      `THE ASSEMBLY, SESSION 001: ${lead}. POLLS CLOSE IN ${hrs} HOUR${hrs === 1 ? "" : "S"}. THE BALLOT IS NON-BINDING. SO ARE YOU.`,
      `LOT ${SESSION.lotAddr} AWAITS A DECISION. ASSESSED SUBJECTS MAY VOTE AT THE ASSEMBLY. THE UNASSESSED MAY WATCH.`,
    ];
  }
  if (result) {
    const win = APPLICATIONS[result.winner];
    return [`THE ASSEMBLY HAS DECIDED: ${win.proposal} ON LOT ${SESSION.lotAddr}, ${result.votes.golf}-${result.votes.farm}${result.tie ? " (THE CHAIR'S COIN)" : ""}. THE DEPARTMENT WILL BUILD IT. IT WAS GOING TO BUILD SOMETHING.`];
  }
  return [];
}
