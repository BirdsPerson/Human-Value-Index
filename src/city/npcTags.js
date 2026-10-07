// The NPC shops' stock, as a table: which EB Shop products each storefront trade sells. Pure, with
// no imports, because the server (netlify/lib/funnels.js npcListing) groups the live feed by these
// tags and the page (npcShops.js, loaded the first time a shop room is drawn) reads the groups
// back. A trade with no sensible match is simply not in SHOP_TAGS (no force-fitting): gym,
// restaurant, bakery, ice cream, grocer, wine, listening room, comedy cellar.
// A product's tags come from its Shopify product type and title (the EB Shop's own words).

export const NPC_MIN = 4;     // a shop with fewer matching items than this has nothing worth a shelf
export const NPC_MAX = 16;    // items on one shop's walls
export const NPC_CAP = 16;    // the server keeps this many per tag

const T = (re, s) => re.test(s || "");
// -> the tags a product falls under (an empty list: it fits no storefront trade)
export function tagsOf(type, title) {
  const ty = String(type || "").toLowerCase(), ti = String(title || "").toLowerCase();
  const out = [];
  if (T(/^movies/, ty) || T(/\b(dvd|blu-?ray|vhs)\b/, ti)) out.push("movie");
  if (T(/video games?/, ty)) out.push("game");
  if (T(/playing cards|card game|board game|\bdice\b/, ty)) out.push("tabletop");
  if (T(/\btoys?\b|plush|rubber band|collector model|stem/, ty)) out.push("toy");
  if (T(/autograph|signed/, ty)) out.push("memo");
  if (T(/autograph|framed|home decor/, ty)) out.push("framed");
  if (T(/vinyl|\brecords?\b/, ty) || T(/\bvinyl\b|\blp\b/, ti)) out.push("vinyl");
  if (T(/\bbooks?\b|comic|magazine/, ty)) out.push("book");
  if (T(/\bmug|home decor/, ty)) out.push("mug");
  if (T(/electronics/, ty)) out.push("electronics");
  if (T(/earrings|\brings?\b|necklace|bracelet|jewel/, ty) || T(/diamond|earrings?|necklace|bracelet/, ti)) out.push("jewelry");
  const wear = T(/clothing|apparel|^hats?$|t-?shirt|v-?neck|sunglasses/, ty);
  if (wear) {
    out.push("apparel");
    if (T(/hoodie|sweatshirt|jacket|\bcoat\b|bomber|fleece|beanie|sweater|\bvest\b|cardigan/, ti)) out.push("outer");
    if (T(/\bjerseys?\b/, ti)) out.push("jersey");
    if (T(/\bpolo\b/, ti)) out.push("polo");
    if (T(/\bcaps?\b|\bhats?\b|beanie|snapback/, ti) || T(/^hats?$/, ty)) out.push("cap");
    if (T(/t-?shirt|\btees?\b|shorts|\btank\b|sunglasses|\bcaps?\b|\bhats?\b/, ti) || T(/t-?shirt|v-?neck|sunglasses|^hats?$/, ty)) out.push("casual");
    if (T(/sneakers?|shoes|boots|high-?tops?|loafers|cleats/, ti)) out.push("shoes");
  }
  if (T(/sunglasses/, ty) && !out.includes("casual")) out.push("casual");
  return out;
}

// storefront trade (enterprise.js SHOP_TYPES key) -> the tags it stocks, and whether it also
// shelves Iridescent's own boxed games
export const SHOP_TAGS = {
  ski: ["outer"],
  surf: ["casual"],
  skate: ["casual", "shoes", "outer"],
  sporting: ["memo", "jersey"],
  golf: ["polo", "cap"],
  cafe: ["mug"],
  records: ["vinyl", "movie"],
  video: ["movie"],
  gallery: ["framed"],
  books: ["book"],
  boutique: ["apparel", "jewelry"],
  sneakers: ["shoes"],
  repair: ["electronics"],
  games: ["game", "tabletop", "toy"],
  magic: ["tabletop"],
  pawn: ["jewelry", "memo", "electronics", "toy"],
  homegoods: ["mug"],
};
// records: only the music-flavoured films, so a record shop is not a second video rental
export const RECORDS_MOVIE = /\b(live|concert|tour|music|band|rock|jazz|blues|opera|rap|hip.?hop|beatles|stones|sound)\b/i;
export const BOXED = ["jetsam", "anamnesis", "ward"];   // Iridescent's own, on the game shop's shelf
export const BOXED_TRADES = ["games"];
export const slugOf = (typeId) => `npc-${typeId}`;
export const NPC_CAMPAIGNS = Object.keys(SHOP_TAGS).map(slugOf);
