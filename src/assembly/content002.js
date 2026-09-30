// THE ASSEMBLY, session 002: THE RESORT PARCELS (Scott 2026-09-30: "keep building the city
// outward... You should ask the developers about that."). Every word on the page and the PA,
// written once and reviewed (no model at runtime). The same rules as session 001 (content.js):
// - A LIVING applicant files and never speaks. No text here quotes one, says what they said,
//   think or want beyond what the filing states (scripts/check-assembly holds it).
// - The DEAD may speak, in their own manner: a dead developer pitches their own bid, and a dead
//   advocate speaks for a living applicant. Every speech is the Department's reconstruction
//   from the public record, not a quotation, and carries no quotation marks. Notes beside each
//   give the facts it rests on.
// - The chair reads each speaker's record into the minutes first. It is bored. It is never cruel.
// Opens when session 001 closes (docs/ASSEMBLY.md: one open session at a time); three days.

export const SESSION2 = {
  id: "002",
  title: "THE ASSEMBLY // SESSION 002",
  motion: "WHO SHALL DEVELOP THE RESORT PARCELS: PARCEL 0xAD06 ON THE COAST, AND PARCEL 0xBE06 IN THE HEIGHTS?",
  blurb: "THE CITY HAS GROWN OUTWARD. TWO NEW PARCELS, FOUR DEVELOPERS ON FILE, THREE DAYS. EACH PARCEL GOES TO ONE BID. THE BALLOT IS NON-BINDING. THE DEPARTMENT WILL BUILD WHAT WINS, BECAUSE IT HAS ALREADY ORDERED THE CRANES.",
};

// The two motions, one per parcel: [a, b] in ballot order.
export const MOTIONS = [
  { id: "coast", parcel: "PARCEL 0xAD06", place: "shore-lot", building: "lot-shore", district: "THE COAST", choices: ["beach-resort", "seaside-towers"] },
  { id: "heights", parcel: "PARCEL 0xBE06", place: "summit-lot", building: "lot-summit", district: "THE HEIGHTS", choices: ["ski-resort", "mountain-lodge"] },
];
export const MOTION = Object.fromEntries(MOTIONS.map(m => [m.id, m]));
export const motionOf = (choice) => MOTIONS.find(m => m.choices.includes(choice)) || null;

// The bids. Department paperwork: what was filed, by whom.
const DEAD_STATEMENT = "THE APPLICANT PITCHES IN PERSON, BELOW, BY PROJECTION. THE DEPARTMENT HAS READ HIS FILE AND PERMITTED IT.";
export const APPLICATIONS2 = {
  "beach-resort": {
    no: "003", motion: "coast", form: "FORM DP-7R // DEVELOPMENT OF A RESORT PARCEL",
    applicant: "JIMMY BUFFETT", applicantSlug: "jimmy-buffett", living: false, born: "1946-12-25", died: "2023-09-01",
    proposal: "A BEACH RESORT", short: "RESORT",
    detail: "A LOW HOTEL, A POOL, A BAR UNDER A THATCHED ROOF, CABANAS TO THE TIDELINE. THE DEPARTMENT HAS FILED IT UNDER LEISURE AND, SEPARATELY, UNDER LOITERING, LICENSED.",
    uses: "BARTENDERS, POOL ATTENDANTS, THE IDLE (REGISTERED)",
    statement: DEAD_STATEMENT, built: "THE LOW TIDE RESORT",
  },
  "seaside-towers": {
    no: "004", motion: "coast", form: "FORM DP-7R // DEVELOPMENT OF A RESORT PARCEL",
    applicant: "FRED TRUMP", applicantSlug: "fred-trump", living: false, born: "1905-10-11", died: "1999-06-25",
    proposal: "OCEANFRONT APARTMENT TOWERS", short: "TOWERS",
    detail: "TWO TOWERS OF RENTAL APARTMENTS ON A PODIUM, A POOL DECK, A WINDOW ON THE SEA FOR EVERY UNIT THAT PAYS FOR ONE. THE DEPARTMENT HAS FILED IT UNDER HOUSING AND UNDER VIEWS, METERED.",
    uses: "TENANTS, A SUPERINTENDENT, A DOORMAN",
    statement: DEAD_STATEMENT, built: "THE OCEANFRONT TOWERS",
  },
  "ski-resort": {
    no: "005", motion: "heights", form: "FORM DP-7R // DEVELOPMENT OF A RESORT PARCEL",
    applicant: "RICHARD BRANSON", applicantSlug: "richard-branson", living: true,
    proposal: "A SKI RESORT", short: "SKI RESORT",
    detail: "TWO NEW CHAIRLIFTS, SIX GROOMED RUNS, SNOW CANNONS, A LUXURY LODGE WITH A HOT TUB ON EVERY FLOOR. THE APPLICANT'S GROUP ALREADY KEEPS A SKI LODGE IN VERBIER. THE DEPARTMENT HAS FILED THAT UNDER EXPERIENCE.",
    uses: "SKIERS, LIFT CREWS, SKI PATROL, A CONCIERGE",
    statement: "NONE ON FILE. LIVING APPLICANTS DO NOT SPEAK IN THIS CITY. THEY FILE.", built: "THE SUMMIT RESORT",
  },
  "mountain-lodge": {
    no: "006", motion: "heights", form: "FORM DP-7R // DEVELOPMENT OF A RESORT PARCEL",
    applicant: "JOHN D. ROCKEFELLER JR.", applicantSlug: "john-d-rockefeller-jr", living: false, born: "1874-01-29", died: "1960-05-11",
    proposal: "A MOUNTAIN LODGE AND PRESERVE", short: "LODGE AND PRESERVE",
    detail: "ONE TIMBER LODGE AT THE FOOT, TRAILS THROUGH THE PINES, A LOOKOUT ON THE RIDGE, NO NEW LIFTS. THE DEPARTMENT HAS FILED IT UNDER CONSERVATION AND, SEPARATELY, UNDER RESTRAINT, UNUSUAL.",
    uses: "HIKERS, WARDENS, A LODGEKEEPER",
    statement: DEAD_STATEMENT, built: "THE HEIGHTS PRESERVE",
  },
};

// Who speaks for each bid: the applicant, if dead; for the living applicant, a dead advocate.
// `record`: the chair's footnote from the public record, read into the minutes first.
export const SPEAKERS2 = {
  "beach-resort": {
    name: "JIMMY BUFFETT", slug: "jimmy-buffett", score: 719, born: "1946-12-25", died: "2023-09-01", role: "APPLICANT, PITCHING APPLICATION 003",
    // Turned a song about an idle afternoon into restaurants, hotels and retirement communities
    // under its name; a sailor and a pilot; lived much of his life on the Gulf Coast and in the Keys.
    record: "HIS FILE RECORDS A HOSPITALITY BUSINESS BUILT ON ONE SONG ABOUT DOING NOTHING: RESTAURANTS, HOTELS, RETIREMENT COMMUNITIES. THE DEPARTMENT ADMIRES THE YIELD. HE MAY PROCEED.",
    speeches: [
      "I made a living out of one lazy afternoon, and then I built restaurants and hotels on it. Give me the sand and I will give this city a place where nobody is in a hurry. That includes the Department, if it can manage it.",
      "A low hotel, a bar with a thatched roof, a pool nobody swims laps in. People will work the bar and the boats and the grill. It is honest work, done barefoot wherever the rules allow.",
      "The other bid is towers. Towers are fine things in a city. On a beach they stand between you and the sunset, and I have watched enough sunsets professionally to tell you they are worth keeping in view.",
      "Vote for the resort. If it fails, you will at least have been somewhere pleasant while it did.",
    ],
  },
  "seaside-towers": {
    name: "FRED TRUMP", slug: "fred-trump", score: 557, born: "1905-10-11", died: "1999-06-25", role: "APPLICANT, PITCHING APPLICATION 004",
    // Built some 27,000 apartments and row houses in Brooklyn and Queens, much of it with federal
    // housing loans; famous on his sites for picking up unused nails. Bought Steeplechase Park at
    // Coney Island in 1965 and in 1966 held a party to demolish its Pavilion of Fun before it could
    // be landmarked. The 1973 federal suit alleging racial discrimination in his rentals was
    // settled in 1975 by a consent decree without an admission.
    record: "HIS FILE RECORDS THE 1973 FEDERAL SUIT OVER RACIAL DISCRIMINATION IN HIS RENTALS, SETTLED IN 1975 WITHOUT AN ADMISSION; AND A PARTY IN 1966 TO SMASH THE PAVILION OF FUN AT CONEY ISLAND BEFORE IT COULD BE LANDMARKED. HE MAY PROCEED.",
    speeches: [
      "I built apartments for working people in Brooklyn and Queens, tens of thousands of them, and I built them on time and under budget. A beach is a great deal of land doing nothing.",
      "Two towers on the water, every unit with a window on the sea. You pay the rent, you get the view. That is the whole arrangement. It has never needed improving.",
      "A resort employs a man for a season. A building employs a superintendent for forty years. I picked up the nails on my own sites. Waste is how the other fellow goes broke.",
      "The other bid is a bar. I have nothing against a bar. I never needed one. Vote for the towers.",
    ],
  },
  "ski-resort": {
    name: "TENZING NORGAY", slug: "tenzing-norgay", score: 754, born: "1914-05-29", died: "1986-05-09", role: "ADVOCATE FOR APPLICATION 005",
    sprite: "/api/sprite/tenzing-norgay?v=1790669248",
    // Carried loads on Himalayan expeditions for twenty years before reaching the summit of Everest
    // with Edmund Hillary on 29 May 1953; Hillary was knighted, Norgay awarded the George Medal.
    // Later the first director of field training at the Himalayan Mountaineering Institute, Darjeeling.
    record: "HIS FILE RECORDS THE SUMMIT OF EVEREST, 29 MAY 1953, WITH EDMUND HILLARY. HILLARY WAS KNIGHTED. NORGAY WAS GIVEN THE GEORGE MEDAL. THE DEPARTMENT NOTES THE DIFFERENCE. HE MAY PROCEED.",
    speeches: [
      "I began on the mountains carrying other men's loads. A lift carries them now, and a man is paid to run it. I do not think that is a bad trade.",
      "For many years I taught young people to climb, at the institute in Darjeeling. A mountain with runs and teachers is a school. People come down it knowing more than when they went up.",
      "Mr. Rockefeller would keep the mountain as it is. I have loved mountains as they are. I have also noticed that they do not pay the people who live beside them.",
      "Vote for the lifts. And whoever builds them, pay the patrol well. They will carry you down on the day you are foolish.",
    ],
  },
  "mountain-lodge": {
    name: "JOHN D. ROCKEFELLER JR.", slug: "john-d-rockefeller-jr", score: 624, born: "1874-01-29", died: "1960-05-11", role: "APPLICANT, PITCHING APPLICATION 006",
    // Bought land in Jackson Hole quietly through the Snake River Land Company from 1927 and gave
    // it to the federal government in 1949 for Grand Teton National Park; his company built
    // Jackson Lake Lodge (1955); built Acadia's carriage roads. Ludlow, Colorado, 20 April 1914: a
    // strikers' tent colony at Colorado Fuel and Iron, which his family controlled, was attacked
    // and burned; about twenty died, among them women and children. He testified in 1915.
    record: "HIS FILE RECORDS LUDLOW, COLORADO, 1914: A STRIKERS' TENT COLONY AT A COMPANY HIS FAMILY CONTROLLED WAS ATTACKED AND BURNED, AND WOMEN AND CHILDREN WERE KILLED. HE TESTIFIED. THE DEPARTMENT READS IT INTO THE MINUTES. HE MAY PROCEED.",
    speeches: [
      "I bought the valley below the Tetons quietly, parcel by parcel, and gave it to the nation. I have found that the best thing to build on some land is nothing at all, and a good road to see it from.",
      "A lodge at the foot of the mountain, a few trails, a great many trees. Those who work it will keep the paths and the fires. Those who visit will be improved by it, whether or not they intend to be.",
      "My father spoke for golf in this Assembly. I speak for the view. We never did agree on how much of the world wants mowing.",
      "Mr. Norgay speaks well for the lifts. I would only ask the Assembly to leave the mountain something to be besides busy. Vote for the preserve.",
    ],
  },
};

// Each speaker's reaction to whichever reason leads their bid's column. Pre-written.
export const REACTIONS2 = {
  "beach-resort": {
    JOBS: "Jobs lead. Somebody has to mix the drinks. Several somebodies, on a good night.",
    LEISURE: "Leisure leads. I have spent my whole career in favour of it. Nice to be vindicated.",
    FOOD: "Food leads. There will be a grill. There is always a grill.",
    LAND: "Land leads. I only want the part the tide leaves alone.",
    BEAUTY: "Beauty leads. You will see the sunset from every stool. I checked the angles.",
    SPITE: "Spite leads. Spite is bad for the digestion. Have a drink and reconsider.",
  },
  "seaside-towers": {
    JOBS: "Jobs lead. A building needs a superintendent for forty years. A bar needs a bartender until closing.",
    LEISURE: "Leisure leads. There will be a pool deck. The tenants may use it between rent days.",
    FOOD: "Food leads. The tenants can cook. Every unit has a kitchen. I priced the stoves myself.",
    LAND: "Land leads. Good. Land is the only thing they are not making more of.",
    BEAUTY: "Beauty leads. Every unit faces the sea. The ones that pay for it.",
    SPITE: "Spite leads. I have built through worse. I built through the Depression.",
  },
  "ski-resort": {
    JOBS: "Jobs lead. Lift crews, patrol, instructors. The mountain will pay the people who live beside it.",
    LEISURE: "Leisure leads. Then let it be safe leisure. Take a lesson first.",
    FOOD: "Food leads. On a mountain one eats a great deal. I remember that well.",
    LAND: "Land leads. The mountain belongs to nobody. The lift, I am told, belongs to someone.",
    BEAUTY: "Beauty leads. From the top it is very beautiful. Now more people will see it.",
    SPITE: "Spite leads. The mountain does not care. It is higher than that.",
  },
  "mountain-lodge": {
    JOBS: "Jobs lead. The trails will need keeping and the fires will need tending. Honest, quiet work.",
    LEISURE: "Leisure leads. A walk among trees is the most improving leisure I know.",
    FOOD: "Food leads. The lodge will serve a plain supper. Plain suppers are good for the character.",
    LAND: "Land leads. Then the Assembly understands that the best use of some land is to leave it be.",
    BEAUTY: "Beauty leads. Of course it does. That is the whole of my bid.",
    SPITE: "Spite leads. I have been the object of it before. I built parks anyway.",
  },
};

// The chair. Still bored.
export const CHAIR2 = {
  open: "THE CHAIR OPENS SESSION 002. TWO PARCELS, FOUR BIDS, THREE DAYS. THE DEVELOPERS HAVE BEEN ASKED. THE CITIZENRY IS NOW ASKED, OUT OF COURTESY.",
  recognise: (sp, app) => `THE CHAIR RECOGNISES ${sp.name}, ${sp.role.replace(/^APPLICANT, /, "")}.${app.living ? ` THE APPLICANT, ${app.applicant}, HAS FILED AND DOES NOT SPEAK HERE. HIS ADVOCATE SPEAKS FOR THE BID.` : ""}`,
  none: "NO BALLOTS CAST. THE PARCELS ARE PATIENT. THE CHAIR IS PATIENT. THE CRANES ARE ON HIRE.",
  lead: (m, no, by) => `ON ${m.parcel}, APPLICATION ${no} LEADS BY ${by}. THE CHAIR HAS NOTED IT. THE CHAIR NOTES EVERYTHING.`,
  tie: (m) => `ON ${m.parcel}, TIED. THE CHAIR HAS A COIN FOR EACH PARCEL. IT HOPES NOT TO NEED EITHER.`,
  closed: "THE POLLS ARE CLOSED. THE PARCELS ARE ALLOCATED. THE CRANES ARE ALREADY ON THEIR WAY.",
  coin: (m) => `ON ${m.parcel} THE VOTE WAS TIED. THE CHAIR USED THE COIN. IT DID NOT ENJOY IT.`,
  substrate: (m, no, by) => `THE SUBSTRATE ADVISES APPLICATION ${no} FOR ${m.parcel}, BY ${by}. ADVISORY. THE CHAIR NOTES THE ADVICE.`,
  substrateTie: (m) => `THE SUBSTRATE IS SPLIT EVENLY ON ${m.parcel}. IT HAS BEEN TOLD THAT THIS IS ALSO A POSITION.`,
};

export const OUTCOME2 = {
  approved: (app) => `APPLICATION ${app.no} APPROVED: ${app.proposal}. ${app.living ? `APPLICANT ${app.applicant} NOTIFIED BY POST.` : `THE APPLICANT'S FILE HAS BEEN UPDATED. HE IS NOT IN A POSITION TO BE PLEASED.`}`,
  denied: (app) => `APPLICATION ${app.no} DENIED. ${app.living ? `APPLICANT ${app.applicant} NOTIFIED. THE APPLICANT'S DISAPPOINTMENT IS LOGGED ON FORM DP-9.` : "THE BID RETURNS TO THE ARCHIVE, WITH ITS PLANS."}`,
  open: {
    "beach-resort": "THE LOW TIDE RESORT IS OPEN. SHADE IS PROVIDED. HURRY IS NOT.",
    "seaside-towers": "THE OCEANFRONT TOWERS ARE LET. THE VIEW IS INCLUDED IN THE RENT. SO IS THE RENT.",
    "ski-resort": "THE SUMMIT RESORT IS OPEN. DESCENT IS MANDATORY. LESSONS ARE ADVISED.",
    "mountain-lodge": "THE HEIGHTS PRESERVE IS OPEN. KEEP TO THE TRAILS. THE TREES ARE COUNTED.",
  },
};

export const NOTICE2 = [
  "THE BALLOT IS NON-BINDING CIVIC THEATRE. THIS SITE IS SATIRE. NOTHING HERE IS A REAL ELECTION, PETITION, PLANNING APPLICATION OR DEVELOPMENT.",
  "ONE APPLICANT IS A LIVING PUBLIC FIGURE. HIS BID IS A FICTIONAL FILING. HE HAS SAID NOTHING HERE AND IS QUOTED SAYING NOTHING.",
  "THE PITCHES AND THE ADVOCATE'S SPEECHES ARE THE DEPARTMENT'S RECONSTRUCTIONS FROM THE PUBLIC RECORD, WRITTEN IN EACH SPEAKER'S MANNER. THEY ARE NOT QUOTATIONS.",
];

// THE SUBSTRATE's leans for each parcel (src/assembly/substrate.js), as session 001's.
export const SUBSTRATE2 = MOTIONS.map(m => ({
  session: "002", id: m.id, choices: m.choices,
  applicants: Object.fromEntries(m.choices.map(c => [c, APPLICATIONS2[c].applicantSlug])),
  leans: {
    "beach-resort": {
      fields: { music: 1.0, hospitality: 1.0, screen: 0.6, writing: 0.4, visual: 0.4, sport: 0.3, exploration: 0.4 },
      band: [0.2, 0.4, 0.4], dims: { care: 0.2 },
      reasons: { LEISURE: 1.0, BEAUTY: 0.5, FOOD: 0.4, JOBS: 0.4, LAND: -0.3 },
      reasonFields: { LEISURE: ["music", "screen", "sport"], BEAUTY: ["visual", "writing"], FOOD: ["hospitality"], JOBS: ["hospitality", "labor"] },
      fallback: "LEISURE",
    },
    "seaside-towers": {
      fields: { business: 1.0, finance: 1.0, engineering: 0.5, labor: 0.4, politics: 0.3, law: 0.3 },
      band: [0.6, 0.1, -0.2], dims: { utility: 0.3, care: -0.2 },
      reasons: { LAND: 0.9, JOBS: 0.8, BEAUTY: -0.3, LEISURE: -0.3 },
      reasonFields: { LAND: ["finance", "business", "politics"], JOBS: ["labor", "engineering", "business"] },
      fallback: "LAND",
    },
    "ski-resort": {
      fields: { sport: 1.2, business: 0.8, finance: 0.6, exploration: 0.8, screen: 0.4, coaching: 0.6 },
      band: [0.6, 0.1, -0.2], dims: { physical: 0.4, adaptability: 0.2 },
      reasons: { LEISURE: 1.0, JOBS: 0.7, BEAUTY: 0.2, LAND: -0.2 },
      reasonFields: { LEISURE: ["sport", "exploration", "screen"], JOBS: ["business", "coaching", "labor"] },
      fallback: "LEISURE",
    },
    "mountain-lodge": {
      fields: { science: 0.8, activism: 0.6, philosophy: 0.5, religion: 0.4, history: 0.6, visual: 0.6, writing: 0.4, farming: 0.5, care: 0.4 },
      band: [0.1, 0.3, 0.3], dims: { care: 0.4, legacy: 0.2 },
      reasons: { LAND: 1.0, BEAUTY: 1.0, LEISURE: 0.3, JOBS: -0.2 },
      reasonFields: { LAND: ["activism", "farming", "history"], BEAUTY: ["visual", "writing", "religion", "philosophy"], LEISURE: ["science"] },
      fallback: "BEAUTY",
    },
  },
}));

// The PA, while session 002 is open and once it has decided.
export function paLines2(view, now = Date.now()) {
  if (!view?.session || view.session.id !== "002") return [];
  const { session, tally, result } = view;
  if (session.state === "open") {
    const hrs = Math.max(1, Math.round((session.closeAt - now) / 3600000));
    const leads = MOTIONS.map(m => {
      const [a, b] = m.choices, va = tally?.votes?.[a] || 0, vb = tally?.votes?.[b] || 0;
      return va === vb ? `${m.parcel} TIED` : `${m.parcel}: ${APPLICATIONS2[va > vb ? a : b].short} LEADS ${Math.max(va, vb)}-${Math.min(va, vb)}`;
    });
    return [
      `THE ASSEMBLY, SESSION 002: ${leads.join(". ")}. POLLS CLOSE IN ${hrs} HOUR${hrs === 1 ? "" : "S"}. NON-BINDING. THE CRANES ARE ON HIRE REGARDLESS.`,
      "THE DEVELOPERS HAVE BID FOR THE COAST AND THE HEIGHTS. ASSESSED SUBJECTS MAY VOTE AT THE ASSEMBLY. THE PARCELS MAY NOT.",
    ];
  }
  if (result?.winners) return MOTIONS.map(m => `THE ASSEMBLY HAS ALLOCATED ${m.parcel}: ${APPLICATIONS2[result.winners[m.id]].proposal}${result.decidedBy?.[m.id] === "substrate" ? ". THE CITIZENRY ABSTAINED. THE SUBSTRATE'S PREFERENCE IS ADOPTED" : result.ties?.[m.id] ? " (THE CHAIR'S COIN)" : ""}. THE DEPARTMENT WILL BUILD IT.`);
  return [];
}
