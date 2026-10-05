// Who will play THE DEPARTMENT LINKS against you. The course was never built, so nobody on file
// is a member; these are the golfers on file (the census of 2026-10-05, /api/figure/<slug>) and a
// few files that record the game. The rating (0..99) is a golf rating set here, like the Pit's
// fighters and the park's chess players: a golf fact, not a reading of competence.
//
// Content rule: the living appear and play; they never speak and are never quoted. Nobody here
// says anything. The "why" lines are the Department's, about the game.
// [slug, name, rating, shirt, trousers, why]
// HINTS: a head for a figure whose file has no likeness drawn yet (/api/sprite/<slug> answers 404
// "Likeness pending"): avatar.js fields, near enough to the figure. Used only until the file's own
// sprite exists; then the file's face is cut and used (looks.js).
export const GOLFERS = [
  ["tiger-woods", "TIGER WOODS", 97, "#d82800", "#000000", "FIFTEEN MAJORS. TIED AT THE CEILING; THE DEPARTMENT DECLINES TO SETTLE IT."],
  ["jack-nicklaus", "JACK NICKLAUS", 97, "#f8b800", "#0058f8", "EIGHTEEN MAJORS. TIED AT THE CEILING; THE DEPARTMENT DECLINES TO SETTLE IT."],
  ["rory-mcilroy", "RORY MCILROY", 91, "#3cbcfc", "#fcfcfc", "COMPLETED THE CAREER GRAND SLAM AT AUGUSTA IN 2025. THE DEPARTMENT WAITED ELEVEN YEARS TOO."],
  ["phil-mickelson", "PHIL MICKELSON", 88, "#fcfcfc", "#000000", "SIX MAJORS, PLAYED LEFT-HANDED BY A RIGHT-HANDED MAN. THE DEPARTMENT FINDS THIS UNTIDY."],
  ["john-daly", "JOHN DALY", 79, "#f878f8", "#f8b800", "WON THE 1991 PGA CHAMPIONSHIP AS THE NINTH ALTERNATE. LONG OFF THE TEE. WIDE OF IT TOO."],
  ["michael-jordan", "MICHAEL JORDAN", 62, "#d82800", "#fcfcfc", "SIX TITLES IN ANOTHER SPORT. A COMMITTED AMATEUR HERE. THE DEPARTMENT RATES THE AMATEUR."],
  ["bill-murray", "BILL MURRAY", 55, "#00a800", "#bcbcbc", "PLAYED A GREENKEEPER IN CADDYSHACK (1980). WON THE PEBBLE BEACH PRO-AM IN 2011, WITH A PROFESSIONAL."],
  ["jfk", "JOHN F. KENNEDY", 52, "#fcfcfc", "#7c7c7c", "PLAYED ON HARVARD'S FRESHMAN GOLF TEAM, THEN KEPT HIS GAME OUT OF THE PAPERS."],
  ["babe-ruth", "BABE RUTH", 46, "#0000bc", "#fcfcfc", "714 HOME RUNS, AND GOLF ALL WINTER. SWINGS FOR THE FENCES ON A COURSE WITHOUT ANY."],
  ["adam-sandler", "ADAM SANDLER", 38, "#f8b800", "#7c7c7c", "PLAYED A HOCKEY PLAYER WHO DRIVES LIKE A SLAPSHOT (HAPPY GILMORE, 1996). THE DEPARTMENT RATES THE PUTTING."],
];
export const HINTS = {
  "tiger-woods": { skin: "brown", hair_style: "buzz", hair_color: "black" },
  "jack-nicklaus": { skin: "fair", hair_style: "side_part", hair_color: "blonde" },
  "rory-mcilroy": { skin: "fair", hair_style: "curly", hair_color: "dark_brown" },
  "phil-mickelson": { skin: "light_tan", hair_style: "short", hair_color: "brown" },
  "john-daly": { skin: "fair", hair_style: "long", hair_color: "blonde", facial_hair: "stubble" },
  "michael-jordan": { skin: "deep", hair_style: "bald", hair_color: "black" },
  "bill-murray": { skin: "fair", hair_style: "side_part", hair_color: "grey", facial_hair: "stubble" },
  "jfk": { skin: "fair", hair_style: "side_part", hair_color: "auburn" },
  "babe-ruth": { skin: "fair", hair_style: "short", hair_color: "dark_brown" },
  "adam-sandler": { skin: "light_tan", hair_style: "curly", hair_color: "dark_brown", facial_hair: "stubble" },
};
const BUNDLED = new Set(["jfk", "babe-ruth"]);
export const golfers = () => GOLFERS.map(([slug, name, rating, shirt, pants, why]) => ({
  slug, name, rating, shirt, pants, why, hint: HINTS[slug] || null, sprite: BUNDLED.has(slug) ? `/sprites/${slug}.png` : `/api/sprite/${slug}`,
}));
export const golferBySlug = (slug) => golfers().find(g => g.slug === slug) || null;
