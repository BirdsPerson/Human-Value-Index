// THE SUBSTRATE's census for the Assembly's advisory count (netlify/lib/assembly.js
// refreshSubstrate): the full roster the city simulates (the figures on file plus the census,
// src/city/roster.js) and each district's mood today (the civic fold). Strict: a failed census
// read throws, and the count keeps its last snapshot rather than count a city of nobody.
import { censusSubjects } from "./census.js";
import { fullRoster } from "../../src/city/roster.js";
import { todayMoods } from "./plans.js";

export const substrateSource = () => async () => {
  const [census, moods] = await Promise.all([censusSubjects({ strict: true }), todayMoods().catch(() => null)]);
  return { subjects: fullRoster(census), moods };
};
