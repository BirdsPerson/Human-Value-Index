// The funnels, as city data (Scott, 2026-09-30: "we should always be putting our funnels to
// everything else"). Pure data, no imports: sim.js spreads these into its own lists, so the
// places and buildings are laid out, staffed and visited like any other. Appended after the
// rest, each building takes its district's next free grid cell (the Strip and Campus each
// had one), so nothing already standing moves. docs/CITY_SPEC.md "The funnels".
//
//   THE ARCADE (the Strip)  a cabinet for every Iridescent game (src/city/arcade.json)
//   EB SHOP (Campus)        the Electric Basement shop, live stock; THE UNION LOUNGE upstairs
//   EBTV                    the Arts quarter's sound stages, now ELECTRIC BASEMENT TV (sim.js)

// [id, district, kind, cap, name, engine tendencies]
export const FUNNEL_PLACES = [
  ["arcade", "strip", "mixed", 16, "THE ARCADE (PLAY IS LOGGED)", ["arcade", "video arcade", "amusement arcade"]],
  ["eb-shop", "campus", "leisure", 10, "EB SHOP (RECORDS, TAPES, ODDITIES)", ["record store", "record shop", "toy store", "comic shop"]],
  ["campus-lounge", "campus", "leisure", 12, "THE UNION LOUNGE (SUPERVISED FUN)", ["student union"]],
];

// [id, name, district, floors top-down: [code, floor name, [places]]]
export const FUNNEL_BUILDINGS = [
  ["the-arcade", "THE ARCADE", "strip", [["1F", "THE BACK ROW (TOKENS ONLY)", ["arcade"]], ["G", "CABINET FLOOR", ["arcade"]]]],
  ["eb-shop", "EB SHOP", "campus", [["1F", "THE UNION LOUNGE", ["campus-lounge"]], ["G", "THE SHOP FLOOR", ["eb-shop"]]]],
];

export const FUNNEL_ARCH = { "the-arcade": "arcade", "eb-shop": "recordshop", "studio-block": "station" };

// The prize counter is staffed; the shop's staff are cardboard (EBSN host standees, props.js),
// and nobody works the lounge.
// [id, title, place, ladder, fields, dims, extra]
export const FUNNEL_JOBS = [
  ["prize-clerk", "Prize Counter Clerk", "arcade", ["Token Sweeper", "Prize Clerk", "Senior Prize Clerk", "Keeper of the High Score"], ["*", "hospitality"], ["care", "network"], { shift: "evening", draft: 4 }],
];

// Who goes, by band (0 top tiers .. 2 the lowest) and by field; the overflow families.
export const FUNNEL_LEISURE_BAND = [
  { "eb-shop": 0.8, "campus-lounge": 0.4 },
  { arcade: 1.2, "eb-shop": 1, "campus-lounge": 0.8 },
  { arcade: 1.6, "eb-shop": 0.6, "campus-lounge": 0.4 },
];
export const FUNNEL_LEISURE_FIELD = {
  computing: { arcade: 2, "campus-lounge": 1 }, screen: { "eb-shop": 1.5, arcade: 1 }, music: { "eb-shop": 2 },
  education: { "campus-lounge": 1.5 }, science: { "campus-lounge": 1 }, visual: { "eb-shop": 1 }, sport: { arcade: 0.6 },
};
// [family index in sim.js FAMILY (0 bars, 4 markets, 5 study), place]
export const FUNNEL_FAMILY = [[0, "arcade"], [4, "eb-shop"], [5, "campus-lounge"]];
