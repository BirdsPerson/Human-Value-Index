// THE DEPARTMENT OPEN: eighteen famous holes, re-surveyed by the Department and played as one
// course. Layouts are facts (par, yardage, the bend, the hazards and where they sit); every shape
// on screen is drawn here, from these numbers. No course's art, logo or map is copied. Each hole
// carries an in-world name, a small credit ("AFTER: <COURSE> NO. <N>") and one Department note.
// No quotes from anyone, living or dead.
//
// One compact object per hole. Adding a hole is adding an object (course.js builds the geometry
// deterministically from it). Units are yards. "a" is yards along the centre line from the tee;
// "l" is yards across it, + to the golfer's right. Angles round the green: 0 short (the front),
// 90 right, 180 long (the back), 270 left.
//
//   par, yards        the card
//   bend              [[at (0..1 of the way), degrees]]: the line turns there; - left, + right
//   fw                [from a, [half widths, start .. end]] or null (a par 3: no fairway)
//   corridor          half width of the playable strip (out of bounds past it); default 50
//   green             [radius, [fall deg, fall size], [pin deg, pin share of radius]]
//   haz               hazards, each a tuple:
//     ["b", a, l, r]               a bunker
//     ["gb", deg, r]               a bunker hugging the green
//     ["w", a, l, r]               a pond
//     ["gw", deg, r]               water hugging the green
//     ["sea", side, a0, a1, off]   water past |off| yards on one side (-1 left, 1 right), a0..a1
//     ["cross", a0, a1, kind, l0, l1]   a band across the hole: kind "w" water, "b" sand, "waste"
//     ["pews", a0, a1, l0, l1]     a long bunker cut by strips of grass
//     ["island", a0, collar, deg, half]  water everywhere from a0 on, but the green, its collar
//                                  and a path in at deg (half wide)
//     ["ob", side, off, a0, a1]    out of bounds past |off| on one side (a fence, a hotel, a road)
//     ["obback", d]                out of bounds d yards past the back of the green (a road, a wall)
//     ["t", a, l, r]               one particular tree
//   trees             [kind, density 0..1]: "pine", "oak", "cypress", "palm", "gorse", "none"
//   scene             the horizon: "parkland", "links", "ocean", "pines"
//   elev              -1 (downhill) .. 1 (uphill): how the hole looks, not how it plays
//   gallery           the side the crowd stands near the green: -1 left, 1 right, 0 behind
//   road              [from, to] yards past the back of the green: a road in play (geometry v2), the
//                     wall (out of bounds) past it
// Geometry v2 replaces the drawn green, bunkers and water with OpenStreetMap's where holes/osm.js
// has the hole (course.js); these numbers still place the pin, the green's fall, the trees and the
// zones OSM does not map.

export const FAMOUS = [
  // source: https://en.wikipedia.org/wiki/Pebble_Beach_Golf_Links (7: par 3, 87-109 yards)
  { id: "pebble-7", name: "THE LITTLE DROP", after: "PEBBLE BEACH NO. 7", par: 3, yards: 109,
    bend: [], fw: null, corridor: 36, green: [8.5, [0, 0.22], [200, 0.4]],
    haz: [["sea", 1, 30, 160, 13], ["cross", 122, 170, "w", -60, 60], ["sea", -1, 85, 160, 15], ["gb", 0, 3.2], ["gb", 60, 3], ["gb", 120, 2.6], ["gb", 230, 3.2], ["gb", 300, 3]],
    trees: ["cypress", 0.25], scene: "ocean", elev: -1, gallery: -1,
    note: "THE SHORTEST HOLE ON THE CARD. THE PACIFIC IS RIGHT THERE, AND IT IS NOT IMPRESSED." },
  // source: https://www.usga.org/articles/2010/04/oakmonts-fatal-attraction-2147486176.html (3: par 4, 428, Church Pews left)
  { id: "oakmont-3", name: "THE PEWS", after: "OAKMONT NO. 3", par: 4, yards: 428,
    bend: [], fw: [150, [15, 14, 12]], corridor: 52, green: [12, [0, 0.32], [60, 0.5]],
    haz: [["pews", 215, 315, -44, -17], ["b", 255, 19, 5], ["b", 280, 21, 4], ["gb", 300, 4], ["gb", 70, 4], ["gb", 30, 3]],
    trees: ["oak", 0.25], scene: "parkland", elev: 0, gallery: 1,
    note: "THE CONGREGATION SITS TO THE LEFT: TWELVE ROWS OF SAND. SERVICES RUN ALL DAY." },
  // source: https://en.wikipedia.org/wiki/Augusta_National_Golf_Club (13: par 5, 545, creek in front, dogleg left)
  { id: "augusta-13", name: "THE CREEK BEND", after: "AUGUSTA NATIONAL NO. 13", par: 5, yards: 545,
    bend: [[0.47, -38]], fw: [160, [18, 20, 16]], corridor: 54, green: [14, [0, 0.38], [110, 0.5]],
    haz: [["sea", -1, 150, 480, 26], ["cross", 497, 512, "w", -60, 60], ["gb", 160, 4], ["gb", 200, 3.5], ["gb", 140, 3]],
    trees: ["pine", 0.75], scene: "pines", elev: 0, gallery: 1,
    note: "A CREEK RUNS DOWN THE LEFT AND ACROSS THE FRONT. GO FOR IT IN TWO AND IT GOES FOR YOU." },
  // source: https://golf.com/travel/carnoustie-holes-british-open/ (6: par 5, 578, OB fence left, two fairway bunkers)
  { id: "carnoustie-6", name: "THE ALLEY", after: "CARNOUSTIE NO. 6", par: 5, yards: 578,
    bend: [[0.6, 6]], fw: [140, [19, 18, 15]], corridor: 54, green: [13, [90, 0.2], [250, 0.4]],
    haz: [["ob", -1, 25, 0, 600], ["b", 228, -5, 4.5], ["b", 268, 4, 4.5], ["cross", 352, 362, "w", 4, 60], ["b", 470, -12, 4], ["gb", 280, 4], ["gb", 60, 3.5]],
    trees: ["gorse", 0.45], scene: "links", elev: 0, gallery: 1,
    note: "OUT OF BOUNDS LEFT, THE WHOLE WAY. THE NARROW ROUTE IS FASTER. THE WIDE ROUTE IS STILL HERE TOMORROW." },
  // source: https://www.theopen.com/latest/postage-stamp-troon (8: par 3, 123, five bunkers incl. the Coffin)
  { id: "troon-8", name: "THE POSTAGE STAMP", after: "ROYAL TROON NO. 8", par: 3, yards: 123,
    bend: [], fw: null, corridor: 40, green: [7, [90, 0.34], [180, 0.3]],
    haz: [["gb", 270, 4.5], ["gb", 0, 3], ["gb", 70, 3], ["gb", 115, 3], ["gb", 200, 3]],
    trees: ["gorse", 0.6], scene: "links", elev: -1, gallery: -1,
    note: "THE GREEN IS SMALL ENOUGH TO MAIL. THE BUNKER ON THE LEFT IS NAMED FOR WHAT IT HOLDS." },
  // source: https://en.wikipedia.org/wiki/Pebble_Beach_Golf_Links (8: par 4, 428, second shot over the chasm)
  { id: "pebble-8", name: "THE CHASM", after: "PEBBLE BEACH NO. 8", par: 4, yards: 428,
    bend: [[0.55, 9]], fw: [150, [17, 16]], corridor: 50, green: [11, [0, 0.36], [300, 0.45]],
    haz: [["sea", 1, 160, 470, 24], ["cross", 266, 332, "w", -14, 60], ["gb", 290, 3.5], ["gb", 200, 3], ["gb", 150, 2.5]],
    trees: ["cypress", 0.2], scene: "ocean", elev: 1, gallery: -1,
    note: "UP THE HILL BLIND, THEN OVER THE CLIFF. THE SECOND SHOT IS THE WHOLE HOLE." },
  // source: https://www.globalgolfermag.com/hole-by-hole-guide-to-merion-golf-club/ (11: par 4, 367, brook left and round the green)
  { id: "merion-11", name: "THE BROOK", after: "MERION EAST NO. 11", par: 4, yards: 367,
    bend: [[0.6, 7]], fw: [130, [16, 15, 13]], corridor: 48, green: [11, [0, 0.3], [90, 0.4]],
    haz: [["sea", -1, 226, 340, 20], ["gw", 0, 5], ["gw", 35, 5], ["gw", 90, 5], ["gw", 145, 5], ["gw", 180, 5], ["gb", 270, 3.5]],
    trees: ["oak", 0.6], scene: "parkland", elev: -1, gallery: 1,
    note: "A BROOK ON THREE SIDES OF THE GREEN. A GRAND SLAM WAS FINISHED HERE. YOURS CAN WAIT." },
  // source: https://www.golfdigest.com/story/bethpage-black-fourth-hole-video (4: par 5, 517, cross bunkers, uphill)
  { id: "bethpage-4", name: "THE CROSS BUNKERS", after: "BETHPAGE BLACK NO. 4", par: 5, yards: 517,
    bend: [[0.52, -18]], fw: [150, [17, 16, 14]], corridor: 52, green: [12, [0, 0.4], [250, 0.4]],
    haz: [["cross", 200, 252, "b", -38, -19], ["cross", 384, 404, "b", -6, 34], ["gb", 300, 4], ["gb", 60, 3.5], ["gb", 20, 3]],
    trees: ["oak", 0.7], scene: "parkland", elev: 1, gallery: -1,
    note: "A PUBLIC COURSE. THE SIGN AT THE FIRST TEE WARNS YOU. THE FOURTH IS WHY." },
  // source: https://en.wikipedia.org/wiki/Augusta_National_Golf_Club (12: par 3, 155, Rae's Creek in front)
  { id: "augusta-12", name: "THE SHORT CREEK", after: "AUGUSTA NATIONAL NO. 12", par: 3, yards: 155,
    bend: [], fw: null, corridor: 44, green: [10, [0, 0.25], [70, 0.5]],
    haz: [["cross", 112, 131, "w", -60, 60], ["gb", 0, 3.4], ["gb", 160, 3], ["gb", 215, 3]],
    trees: ["pine", 0.9], scene: "pines", elev: 0, gallery: 0,
    note: "THE WIND SWIRLS IN THE TREES AND NOWHERE ELSE. THE CREEK WAITS IN FRONT, PATIENT AS EVER." },
  // source: https://en.wikipedia.org/wiki/Riviera_Country_Club (10: par 4, 315, bunker left, narrow green guarded right)
  { id: "riviera-10", name: "THE TEMPTATION", after: "RIVIERA NO. 10", par: 4, yards: 315,
    bend: [[0.6, 10]], fw: [120, [18, 15, 10]], corridor: 48, green: [8.5, [180, 0.34], [180, 0.4]],
    haz: [["b", 212, -16, 8], ["gb", 35, 3.5], ["gb", 85, 3.5], ["gb", 140, 3], ["gb", 265, 3]],
    trees: ["palm", 0.4], scene: "parkland", elev: 0, gallery: -1,
    note: "SHORT ENOUGH TO TEMPT YOU. SHORT ENOUGH TO EMBARRASS YOU. PICK ONE." },
  // source: http://www.golfwithphilsokol.com/pine-valley (7: par 5, 636, Hell's Half Acre 285-380 yards)
  { id: "pine-valley-7", name: "HELL'S HALF ACRE", after: "PINE VALLEY NO. 7", par: 5, yards: 636,
    bend: [], fw: [130, [17, 16, 14]], corridor: 50, green: [10, [0, 0.3], [150, 0.4]],
    haz: [["cross", 285, 380, "waste", -60, 60], ["gb", 0, 3.5], ["gb", 80, 3.5], ["gb", 160, 3.5], ["gb", 240, 3.5], ["gb", 300, 3]],
    trees: ["pine", 0.9], scene: "pines", elev: 0, gallery: 1,
    note: "HALF AN ACRE OF SAND ACROSS THE FAIRWAY. SOMEBODY MEASURED IT. IT IS MORE THAN HALF." },
  // source: https://www.allgolfholes.com/courses/california/cypress-point-club/16th-hole (16: par 3, 231, carry the Pacific)
  { id: "cypress-16", name: "THE CARRY", after: "CYPRESS POINT NO. 16", par: 3, yards: 231,
    bend: [], fw: null, corridor: 50, green: [12, [90, 0.24], [30, 0.4]],
    haz: [["cross", 26, 198, "w", -26, 60], ["sea", 1, 0, 270, 17], ["cross", 248, 300, "w", -60, 60], ["gb", 300, 3.5], ["gb", 230, 3], ["gb", 120, 3]],
    trees: ["cypress", 0.5], scene: "ocean", elev: 0, gallery: -1,
    note: "TWO HUNDRED YARDS OF OCEAN, OR THE LONG WAY ROUND ON THE LEFT. NOBODY REMEMBERS THE LONG WAY." },
  // source: https://www.golfcoursegurus.com/reviews/whistling-straits-straits/ (18: par 4, 500-520, creek before the green)
  { id: "straits-18", name: "THE LAST CREEK", after: "WHISTLING STRAITS NO. 18", par: 4, yards: 520,
    bend: [[0.5, -8]], fw: [140, [19, 17, 15]], corridor: 54, green: [16, [270, 0.3], [300, 0.5]],
    haz: [["b", 232, -22, 5], ["b", 252, 24, 5], ["b", 300, -26, 4], ["b", 330, 27, 4], ["cross", 486, 498, "w", -60, 14], ["gb", 90, 4], ["gb", 160, 3.5]],
    trees: ["gorse", 0.3], scene: "links", elev: 0, gallery: 1,
    note: "BUNKERS BEYOND COUNTING. SOMEBODY COUNTED THEM ANYWAY. THE NUMBER IS NOT HELPING." },
  // source: https://en.wikipedia.org/wiki/Pebble_Beach_Golf_Links (18: par 5, 543, the bay down the left)
  { id: "pebble-18", name: "THE SEAWALL", after: "PEBBLE BEACH NO. 18", par: 5, yards: 543,
    bend: [[0.35, -8], [0.72, -10]], fw: [150, [18, 18, 14]], corridor: 52, green: [12, [270, 0.28], [60, 0.4]],
    haz: [["sea", -1, 0, 570, 23], ["ob", 1, 44, 0, 570], ["t", 300, 14, 4.5], ["b", 440, -15, 5], ["gb", 280, 4], ["gb", 0, 3], ["gb", 110, 3]],
    trees: ["cypress", 0.3], scene: "ocean", elev: 0, gallery: 1,
    note: "THE BAY RUNS THE LENGTH OF THE HOLE ON THE LEFT. A TREE STANDS IN THE FAIRWAY. BOTH ARE ON THE MAP." },
  // source: https://launchpointgolf.com/reviews/tpc-sawgrass-stadium-course-review/ (17: par 3, 137, island green ~78 ft)
  { id: "sawgrass-17", name: "THE ISLAND GREEN", after: "TPC SAWGRASS NO. 17", par: 3, yards: 137,
    bend: [], fw: null, corridor: 46, green: [13, [0, 0.22], [60, 0.5]],
    haz: [["island", 32, 2.5, 225, 2.2], ["gb", 30, 2.2]],
    trees: ["oak", 0.2], scene: "parkland", elev: 0, gallery: 0,
    note: "WATER ON EVERY SIDE. THERE IS A PATH TO THE GREEN FOR THE STAFF. THE DEPARTMENT ASKS YOU NOT TO USE IT." },
  // source: https://launchpointgolf.com/reviews/tpc-sawgrass-stadium-course-review/ (18: par 4, 462, water left)
  { id: "sawgrass-18", name: "THE LONG POND", after: "TPC SAWGRASS NO. 18", par: 4, yards: 462,
    bend: [[0.55, -16]], fw: [140, [17, 16, 14]], corridor: 50, green: [12, [270, 0.28], [80, 0.4]],
    haz: [["sea", -1, 40, 470, 21], ["b", 255, 20, 5], ["gb", 90, 4], ["gb", 30, 3]],
    trees: ["oak", 0.6], scene: "parkland", elev: 0, gallery: 1,
    note: "THE POND RUNS DOWN THE LEFT ALL THE WAY HOME. THE CROWD HAS SEEN IT HAPPEN BEFORE." },
  // source: https://en.wikipedia.org/wiki/Old_Course_at_St_Andrews (17: par 4, 495, hotel sheds, the bunker, road and wall)
  { id: "standrews-17", name: "THE ROAD HOLE", after: "ST ANDREWS OLD NO. 17", par: 4, yards: 495,
    bend: [[0.45, 18]], fw: [150, [22, 19, 15]], corridor: 54, green: [11, [300, 0.34], [270, 0.4]],
    haz: [["ob", 1, 22, 60, 250], ["ob", 1, 18, 430, 540], ["obback", 6], ["gb", 300, 3.4], ["b", 350, -20, 4]], road: [2, 8],
    trees: ["none", 0], scene: "links", elev: 0, gallery: -1,
    note: "DRIVE OVER THE OLD SHEDS. THE ROAD BEHIND THE GREEN IS IN PLAY. SO IS THE WALL." },
  // source: https://en.wikipedia.org/wiki/Old_Course_at_St_Andrews (18: par 4, 357, Swilcan Burn, Valley of Sin, no bunkers)
  { id: "standrews-18", name: "THE VALLEY OF SIN", after: "ST ANDREWS OLD NO. 18", par: 4, yards: 357,
    bend: [], fw: [40, [36, 36, 30]], corridor: 60, green: [17, [0, 0.48], [160, 0.5]],
    haz: [["cross", 18, 25, "w", -60, 60], ["ob", 1, 32, 0, 420]],
    trees: ["none", 0], scene: "links", elev: 0, gallery: 1,
    note: "NO BUNKERS. A HOLLOW IN FRONT OF THE GREEN DOES THE WORK. THE TOWN WATCHES FROM THE RIGHT." },
];
