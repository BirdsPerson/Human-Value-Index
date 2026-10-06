// THE GAMES (#play): one tile per entry, in this order. ONE LINE PER GAME so concurrent
// additions merge cleanly. Shape:
//   { href: "#route", title: "SHORT TITLE", name: "plain name", icon: "<key in gameIcons.js>", note: "ONE LINE" }
// The tile's accessible name is "Play <name>". A tile whose route App.jsx does not serve yet
// renders dim, "COMING SOON" (routesIn() reads App.jsx at build; vite.config.js defines it).
// Icons already drawn: tennis golf hoops football soccer fish tank rook card market joystick trophy ski bowling cards skate.
export const GAMES = [
  { href: "#tennis", title: "TENNIS", name: "tennis", icon: "tennis", note: "EXHIBITIONS AGAINST THE FAMOUS. KEYS, TOUCH OR PAD" },
  { href: "#golf", title: "GOLF", name: "golf", icon: "golf", note: "NINE HOLES. THE COURSE THE ASSEMBLY DECLINED" },
  { href: "#hoops", title: "BASKETBALL", name: "basketball", icon: "hoops", note: "FIVE ON FIVE, WITH THE LEAGUE'S OWN TEAMS" },
  { href: "#football", title: "FOOTBALL", name: "football", icon: "football", note: "THE GRIDIRON. THE LEAGUE'S OWN TEAMS" },
  { href: "#soccer", title: "SOCCER", name: "soccer", icon: "soccer", note: "THE PITCH. THE LEAGUE'S OWN TEAMS" },
  { href: "#ski", title: "SKIING", name: "skiing", icon: "ski", note: "THE WHOLE MOUNTAIN. LIFTS, PARK, PIPE, RACES" },
  { href: "#skate", title: "SKATE", name: "skateboarding", icon: "skate", note: "THE PARK, THE VERT RAMP, THE PLAZA. TWO-MINUTE RUNS" },
  { href: "#bowling", title: "BOWLING", name: "bowling", icon: "bowling", note: "THE LANES, ON THE STRIP. TEN PINS, ONE TO FOUR BOWLERS" },
  { href: "#fish", title: "FISHING", name: "fishing", icon: "fish", note: "FISH THE PIER AND THE RIVER" },
  { href: "#hunt", title: "TAGGED OUT", name: "the light-gun hunting cabinet", icon: "hunt", note: "THE BAR CABINET. BUCKS ONLY. A VIDEO GAME" },
  { href: "#aquarium", title: "AQUARIUM", name: "the aquarium", icon: "tank", note: "THE TANKS. EVERY DONATION CHECKED BY REPLAY" },
  { href: "#chess", title: "CHESS", name: "chess", icon: "rook", note: "A STONE TABLE OPPOSITE A FIGURE ON FILE" },
  { href: "#cards", title: "CARDS", name: "the card room: hearts, spades, solitaire", icon: "cards", note: "HEARTS AND SPADES WITH FIGURES. SOLITAIRE AT HOME" },
  { href: "#casino", title: "CASINO", name: "the casino", icon: "card", note: "PLAY CHIPS ONLY. THE HOUSE IS THE MACHINE" },
  { href: "#market", title: "MARKET", name: "the market", icon: "market", note: "SHARES IN HUMANS. PRICES MOVE WITH THE CITY" },
  { href: "#city/strip/the-arcade", title: "ARCADE", name: "the arcade: JETSAM! and more", icon: "joystick", note: "JETSAM! AND ANAMNESIS CABINETS, ON THE STRIP" },
  { href: "#city/league", title: "LEAGUES", name: "the leagues", icon: "trophy", note: "THE CITY'S SEASONS. STANDINGS, BOX SCORES" },
];

// The room a link opens: "#city/league?x" -> "#city".
export const roomOf = (href) => href.split(/[/?]/)[0];

// The routes App.jsx serves, read from its source: every `routePath === "#x"`,
// `route === "#x"` and `.startsWith("#x")` comparison. Used at build (vite.config.js) and by checks.
export function routesIn(appSource) {
  const out = new Set();
  for (const m of appSource.matchAll(/\b(?:routePath|route|path)\s*===\s*"(#[a-z0-9-]+)|startsWith\("(#[a-z0-9-]+)/g)) out.add(m[1] || m[2]);
  return [...out].sort();
}

/* global __HVI_ROUTES__ */
const ROUTES = typeof __HVI_ROUTES__ !== "undefined" ? new Set(__HVI_ROUTES__) : null;
export const isLive = (g, routes = ROUTES) => !routes || routes.has(roomOf(g.href));
