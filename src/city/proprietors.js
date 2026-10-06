// PROPRIETORS: a business in the city with a subject on record as its owner (Scott, 2026-10-06:
// GOODNIGHT IRENE'S "OWNED BY MY CHARACTER"). There is no property ladder yet, so ownership is an
// operator's record, like the athletic record: written only by scripts/set-proprietor.mjs (never by
// a public API), reviewed and deployed with the code. docs/design/ECONOMY_PROPERTY.md.
//
// Two files, one record. proprietors.json (here, in the bundle) carries what the city shows: the
// owner's public census key and display name. netlify/lib/proprietors.json (server only) carries the
// case id, which never reaches the client. No economic effect: no income, no CYCLES, no upkeep; when
// the business ladder lands, a record here carries over and the ladder's rules apply to it as to anyone.
//
//   proprietorOf(placeId)  -> {kind: "subject", id (census key), name, label: "PROPRIETOR: <name>"} | null
//   proprietorLine(placeId) -> "PROPRIETOR: SUBJECT 7AUZ" | null
import RECORD from "./proprietors.json" with { type: "json" };

export const PROPRIETORS = RECORD;
const OWNERS = new Map();
export function proprietorOf(placeId) {
  const r = RECORD[placeId];
  if (!r || !r.owner || !r.name) return null;
  if (!OWNERS.has(placeId)) OWNERS.set(placeId, Object.freeze({ kind: "subject", id: r.owner, name: r.name, label: `PROPRIETOR: ${r.name}` }));
  return OWNERS.get(placeId);
}
export const proprietorLine = (placeId) => proprietorOf(placeId)?.label || null;
// Who may be put on record: the city's own landmark businesses that are ours to give. SAM'S PIZZA PALACE
// is a real business that lent the city its name: it is never on record as anyone's.
export const OWNABLE = ["goodnight-irenes"];
