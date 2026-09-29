// Where a subject was born, and how the file compares with the planet.
//
// `origin` on a subject is an ISO 3166 alpha-3 code: the modern country of the birthplace
// (Wikidata P19 -> P17), else citizenship (P27). netlify/lib/origin.js looks it up; cards
// and src/figures.js carry it. Country -> region comes from MIT Pantheon's country table
// (UN M49 subregions folded into the 11 blocs below).

// Share of the world's people per region, UN World Population Prospects 2024 (2025
// estimate, billions). Used to show who the file leaves out and to steer the roster engine.
export const WORLD_POP = {
  "SOUTH ASIA": 2.06, "EAST ASIA": 1.65, "SUB-SAHARAN AFRICA": 1.25, "EUROPE": 0.745,
  "SOUTHEAST ASIA": 0.69, "LATIN AMERICA": 0.665, "NORTH AMERICA": 0.39, "WEST ASIA": 0.30,
  "NORTH AFRICA": 0.27, "CENTRAL ASIA": 0.08, "OCEANIA": 0.046,
};
export const REGIONS = Object.keys(WORLD_POP);
const POP_TOTAL = Object.values(WORLD_POP).reduce((a, b) => a + b, 0);
export const worldShare = r => (WORLD_POP[r] ?? 0) / POP_TOTAL;

// ISO alpha-3 -> [country, region].
export const COUNTRIES = {
  ABW: ["Aruba", "LATIN AMERICA"],
  AFG: ["Afghanistan", "SOUTH ASIA"],
  AGO: ["Angola", "SUB-SAHARAN AFRICA"],
  ALB: ["Albania", "EUROPE"],
  AND: ["Andorra", "EUROPE"],
  ARE: ["United Arab Emirates", "WEST ASIA"],
  ARG: ["Argentina", "LATIN AMERICA"],
  ARM: ["Armenia", "WEST ASIA"],
  ATG: ["Antigua and Barbuda", "LATIN AMERICA"],
  AUS: ["Australia", "OCEANIA"],
  AUT: ["Austria", "EUROPE"],
  AZE: ["Azerbaijan", "WEST ASIA"],
  BDI: ["Burundi", "SUB-SAHARAN AFRICA"],
  BEL: ["Belgium", "EUROPE"],
  BEN: ["Benin", "SUB-SAHARAN AFRICA"],
  BFA: ["Burkina Faso", "SUB-SAHARAN AFRICA"],
  BGD: ["Bangladesh", "SOUTH ASIA"],
  BGR: ["Bulgaria", "EUROPE"],
  BHR: ["Bahrain", "WEST ASIA"],
  BHS: ["The Bahamas", "LATIN AMERICA"],
  BIH: ["Bosnia and Herzegovina", "EUROPE"],
  BLR: ["Belarus", "EUROPE"],
  BLZ: ["Belize", "LATIN AMERICA"],
  BMU: ["Bermuda", "NORTH AMERICA"],
  BOL: ["Bolivia", "LATIN AMERICA"],
  BRA: ["Brazil", "LATIN AMERICA"],
  BRB: ["Barbados", "LATIN AMERICA"],
  BRN: ["Brunei", "SOUTHEAST ASIA"],
  BTN: ["Bhutan", "SOUTH ASIA"],
  BWA: ["Botswana", "SUB-SAHARAN AFRICA"],
  CAF: ["Central African Republic", "SUB-SAHARAN AFRICA"],
  CAN: ["Canada", "NORTH AMERICA"],
  CHE: ["Switzerland", "EUROPE"],
  CHL: ["Chile", "LATIN AMERICA"],
  CHN: ["China", "EAST ASIA"],
  CIV: ["Côte d'Ivoire", "SUB-SAHARAN AFRICA"],
  CMR: ["Cameroon", "SUB-SAHARAN AFRICA"],
  COD: ["Democratic Republic of the Congo", "SUB-SAHARAN AFRICA"],
  COG: ["Republic of the Congo", "SUB-SAHARAN AFRICA"],
  COK: ["Cook Islands", "OCEANIA"],
  COL: ["Colombia", "LATIN AMERICA"],
  COM: ["Comoros", "SUB-SAHARAN AFRICA"],
  CPV: ["Cabo Verde", "SUB-SAHARAN AFRICA"],
  CRI: ["Costa Rica", "LATIN AMERICA"],
  CUB: ["Cuba", "LATIN AMERICA"],
  CUW: ["Curaçao", "LATIN AMERICA"],
  CYP: ["Cyprus", "WEST ASIA"],
  CZE: ["Czechia", "EUROPE"],
  DEU: ["Germany", "EUROPE"],
  DJI: ["Djibouti", "SUB-SAHARAN AFRICA"],
  DMA: ["Dominica", "LATIN AMERICA"],
  DNK: ["Denmark", "EUROPE"],
  DOM: ["Dominican Republic", "LATIN AMERICA"],
  DZA: ["Algeria", "NORTH AFRICA"],
  ECU: ["Ecuador", "LATIN AMERICA"],
  EGY: ["Egypt", "NORTH AFRICA"],
  ERI: ["Eritrea", "SUB-SAHARAN AFRICA"],
  ESP: ["Spain", "EUROPE"],
  EST: ["Estonia", "EUROPE"],
  ETH: ["Ethiopia", "SUB-SAHARAN AFRICA"],
  FIN: ["Finland", "EUROPE"],
  FJI: ["Fiji", "OCEANIA"],
  FRA: ["France", "EUROPE"],
  FRO: ["Faroe Islands", "EUROPE"],
  FSM: ["Micronesia", "OCEANIA"],
  GAB: ["Gabon", "SUB-SAHARAN AFRICA"],
  GBR: ["United Kingdom", "EUROPE"],
  GEO: ["Georgia", "WEST ASIA"],
  GGY: ["Guernsey", "EUROPE"],
  GHA: ["Ghana", "SUB-SAHARAN AFRICA"],
  GIN: ["Guinea", "SUB-SAHARAN AFRICA"],
  GLP: ["Guadeloupe", "LATIN AMERICA"],
  GMB: ["The Gambia", "SUB-SAHARAN AFRICA"],
  GNB: ["Guinea-Bissau", "SUB-SAHARAN AFRICA"],
  GNQ: ["Equatorial Guinea", "SUB-SAHARAN AFRICA"],
  GRC: ["Greece", "EUROPE"],
  GRD: ["Grenada", "LATIN AMERICA"],
  GRL: ["Greenland", "NORTH AMERICA"],
  GTM: ["Guatemala", "LATIN AMERICA"],
  GUF: ["French Guiana", "LATIN AMERICA"],
  GUM: ["Guam", "OCEANIA"],
  GUY: ["Guyana", "LATIN AMERICA"],
  HKG: ["Hong Kong", "EAST ASIA"],
  HND: ["Honduras", "LATIN AMERICA"],
  HRV: ["Croatia", "EUROPE"],
  HTI: ["Haiti", "LATIN AMERICA"],
  HUN: ["Hungary", "EUROPE"],
  IDN: ["Indonesia", "SOUTHEAST ASIA"],
  IMN: ["Isle of Man", "EUROPE"],
  IND: ["India", "SOUTH ASIA"],
  IRL: ["Ireland", "EUROPE"],
  IRN: ["Iran", "SOUTH ASIA"],
  IRQ: ["Iraq", "WEST ASIA"],
  ISL: ["Iceland", "EUROPE"],
  ISR: ["Israel", "WEST ASIA"],
  ITA: ["Italy", "EUROPE"],
  JAM: ["Jamaica", "LATIN AMERICA"],
  JEY: ["Jersey", "EUROPE"],
  JOR: ["Jordan", "WEST ASIA"],
  JPN: ["Japan", "EAST ASIA"],
  KAZ: ["Kazakhstan", "CENTRAL ASIA"],
  KEN: ["Kenya", "SUB-SAHARAN AFRICA"],
  KGZ: ["Kyrgyzstan", "CENTRAL ASIA"],
  KHM: ["Cambodia", "SOUTHEAST ASIA"],
  KIR: ["Kiribati", "OCEANIA"],
  KNA: ["Saint Kitts and Nevis", "LATIN AMERICA"],
  KOR: ["South Korea", "EAST ASIA"],
  KWT: ["Kuwait", "WEST ASIA"],
  LAO: ["Laos", "SOUTHEAST ASIA"],
  LBN: ["Lebanon", "WEST ASIA"],
  LBR: ["Liberia", "SUB-SAHARAN AFRICA"],
  LBY: ["Libya", "NORTH AFRICA"],
  LCA: ["Saint Lucia", "LATIN AMERICA"],
  LIE: ["Liechtenstein", "EUROPE"],
  LKA: ["Sri Lanka", "SOUTH ASIA"],
  LSO: ["Lesotho", "SUB-SAHARAN AFRICA"],
  LTU: ["Lithuania", "EUROPE"],
  LUX: ["Luxembourg", "EUROPE"],
  LVA: ["Latvia", "EUROPE"],
  MAR: ["Morocco", "NORTH AFRICA"],
  MCO: ["Monaco", "EUROPE"],
  MDA: ["Moldova", "EUROPE"],
  MDG: ["Madagascar", "SUB-SAHARAN AFRICA"],
  MDV: ["Maldives", "SOUTH ASIA"],
  MEX: ["Mexico", "LATIN AMERICA"],
  MHL: ["Marshall Islands", "OCEANIA"],
  MKD: ["North Macedonia", "EUROPE"],
  MLI: ["Mali", "SUB-SAHARAN AFRICA"],
  MLT: ["Malta", "EUROPE"],
  MMR: ["Myanmar (Burma)", "SOUTHEAST ASIA"],
  MNE: ["Montenegro", "EUROPE"],
  MNG: ["Mongolia", "EAST ASIA"],
  MOZ: ["Mozambique", "SUB-SAHARAN AFRICA"],
  MRT: ["Mauritania", "SUB-SAHARAN AFRICA"],
  MSR: ["Montserrat", "LATIN AMERICA"],
  MTQ: ["Martinique", "LATIN AMERICA"],
  MUS: ["Mauritius", "SUB-SAHARAN AFRICA"],
  MWI: ["Malawi", "SUB-SAHARAN AFRICA"],
  MYS: ["Malaysia", "SOUTHEAST ASIA"],
  NAM: ["Namibia", "SUB-SAHARAN AFRICA"],
  NCL: ["New Caledonia", "OCEANIA"],
  NER: ["Niger", "SUB-SAHARAN AFRICA"],
  NGA: ["Nigeria", "SUB-SAHARAN AFRICA"],
  NIC: ["Nicaragua", "LATIN AMERICA"],
  NIU: ["Niue", "OCEANIA"],
  NLD: ["Netherlands", "EUROPE"],
  NOR: ["Norway", "EUROPE"],
  NPL: ["Nepal", "SOUTH ASIA"],
  NRU: ["Nauru", "OCEANIA"],
  NZL: ["New Zealand", "OCEANIA"],
  OMN: ["Oman", "WEST ASIA"],
  PAK: ["Pakistan", "SOUTH ASIA"],
  PAN: ["Panama", "LATIN AMERICA"],
  PER: ["Peru", "LATIN AMERICA"],
  PHL: ["Philippines", "SOUTHEAST ASIA"],
  PLW: ["Palau", "OCEANIA"],
  PNG: ["Papua New Guinea", "OCEANIA"],
  POL: ["Poland", "EUROPE"],
  PRI: ["Puerto Rico", "LATIN AMERICA"],
  PRK: ["North Korea", "EAST ASIA"],
  PRT: ["Portugal", "EUROPE"],
  PRY: ["Paraguay", "LATIN AMERICA"],
  PSE: ["Palestine", "WEST ASIA"],
  PYF: ["French Polynesia", "OCEANIA"],
  QAT: ["Qatar", "WEST ASIA"],
  REU: ["Réunion", "SUB-SAHARAN AFRICA"],
  RKS: ["Kosovo", "WEST ASIA"],
  ROU: ["Romania", "EUROPE"],
  RUS: ["Russia", "EUROPE"],
  RWA: ["Rwanda", "SUB-SAHARAN AFRICA"],
  SAU: ["Saudi Arabia", "WEST ASIA"],
  SDN: ["Sudan", "NORTH AFRICA"],
  SEN: ["Senegal", "SUB-SAHARAN AFRICA"],
  SGP: ["Singapore", "SOUTHEAST ASIA"],
  SLB: ["Solomon Islands", "OCEANIA"],
  SLE: ["Sierra Leone", "SUB-SAHARAN AFRICA"],
  SLV: ["El Salvador", "LATIN AMERICA"],
  SMR: ["San Marino", "EUROPE"],
  SOM: ["Somalia", "SUB-SAHARAN AFRICA"],
  SRB: ["Serbia", "EUROPE"],
  SSD: ["South Sudan", "SUB-SAHARAN AFRICA"],
  STP: ["São Tomé and Príncipe", "SUB-SAHARAN AFRICA"],
  SUR: ["Suriname", "LATIN AMERICA"],
  SVK: ["Slovakia", "EUROPE"],
  SVN: ["Slovenia", "EUROPE"],
  SWE: ["Sweden", "EUROPE"],
  SWZ: ["Eswatini", "SUB-SAHARAN AFRICA"],
  SYC: ["Seychelles", "SUB-SAHARAN AFRICA"],
  SYR: ["Syria", "WEST ASIA"],
  TCD: ["Chad", "SUB-SAHARAN AFRICA"],
  TGO: ["Togo", "SUB-SAHARAN AFRICA"],
  THA: ["Thailand", "SOUTHEAST ASIA"],
  TJK: ["Tajikistan", "CENTRAL ASIA"],
  TKM: ["Turkmenistan", "CENTRAL ASIA"],
  TLS: ["Timor-Leste", "SOUTHEAST ASIA"],
  TON: ["Tonga", "OCEANIA"],
  TTO: ["Trinidad and Tobago", "LATIN AMERICA"],
  TUN: ["Tunisia", "NORTH AFRICA"],
  TUR: ["Türkiye", "WEST ASIA"],
  TUV: ["Tuvalu", "OCEANIA"],
  TWN: ["Taiwan", "EAST ASIA"],
  TZA: ["Tanzania", "SUB-SAHARAN AFRICA"],
  UGA: ["Uganda", "SUB-SAHARAN AFRICA"],
  UKR: ["Ukraine", "EUROPE"],
  URY: ["Uruguay", "LATIN AMERICA"],
  USA: ["United States", "NORTH AMERICA"],
  UZB: ["Uzbekistan", "CENTRAL ASIA"],
  VAT: ["Vatican City", "EUROPE"],
  VCT: ["Saint Vincent and the Grenadines", "LATIN AMERICA"],
  VEN: ["Venezuela", "LATIN AMERICA"],
  VIR: ["U.S. Virgin Islands", "LATIN AMERICA"],
  VNM: ["Vietnam", "SOUTHEAST ASIA"],
  VUT: ["Vanuatu", "OCEANIA"],
  WSM: ["Samoa", "OCEANIA"],
  YEM: ["Yemen", "WEST ASIA"],
  ZAF: ["South Africa", "SUB-SAHARAN AFRICA"],
  ZMB: ["Zambia", "SUB-SAHARAN AFRICA"],
  ZWE: ["Zimbabwe", "SUB-SAHARAN AFRICA"]
};
// Codes Wikidata still uses for states that no longer exist, mapped to the successor that
// holds the birthplace today.
const ALIAS = { SUN: "RUS", YUG: "SRB", CSK: "CZE", DDR: "DEU", ANT: "CUW" };
export const normOrigin = iso => { const k = String(iso || "").toUpperCase(); return COUNTRIES[ALIAS[k] || k] ? (ALIAS[k] || k) : null; };
export const countryOf = s => COUNTRIES[normOrigin(s?.origin)]?.[0] ?? null;
export const regionOf = s => COUNTRIES[normOrigin(s?.origin)]?.[1] ?? null;

// Per region: how many subjects, their share of the file, the world's share, and the gap
// (positive = the file under-counts that region). Sorted by gap, largest first.
export function representation(subjects) {
  const known = subjects.filter(s => regionOf(s));
  const n = known.length;
  const rows = REGIONS.map(r => {
    const count = known.filter(s => regionOf(s) === r).length;
    const file = n ? count / n : 0, world = worldShare(r);
    return { region: r, count, file, world, gap: world - file };
  }).sort((a, b) => b.gap - a.gap);
  return { rows, n, unknown: subjects.length - n };
}

// Roster-engine steering: each region's weight is its shortfall (never negative), so a
// run draws from where the file is thinnest. A file that matches the planet draws evenly
// by population.
export function regionWeights(subjects) {
  const { rows, n } = representation(subjects);
  const w = Object.fromEntries(rows.map(r => [r.region, Math.max(0, r.gap)]));
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return sum > 0.01 && n ? w : Object.fromEntries(REGIONS.map(r => [r, worldShare(r)]));
}

export function pickRegion(weights, rnd = Math.random) {
  const entries = Object.entries(weights).filter(([, v]) => v > 0);
  let x = rnd() * entries.reduce((a, [, v]) => a + v, 0);
  for (const [r, v] of entries) if ((x -= v) <= 0) return r;
  return entries.at(-1)?.[0] ?? null;
}

// Pantheon's bplace_country names for a region (they match COUNTRIES' names).
export const countriesIn = region => Object.values(COUNTRIES).filter(([, r]) => r === region).map(([c]) => c);
