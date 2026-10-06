// EMERGENCE in the browser (src/city/emergence.js): the day's block from the published summary
// (plans.js publishSplit writes it). Read-only: the browser never runs the chain.
import { summaryOf } from "./planClient.js";
import { clockAt } from "./simApi.js";
import { airAt, jobWord } from "./emergence.js";

// dev: window.__HVI_EMERGE_PREVIEW__ = {day: {block, places}} or a function (day) -> {block, places}
// (a preview with an industry forced open, before production reaches EMERGE_FROM)
function dayOf(day) {
  if (import.meta.env?.DEV && typeof window !== "undefined" && window.__HVI_EMERGE_PREVIEW__) {
    const p = window.__HVI_EMERGE_PREVIEW__, x = typeof p === "function" ? p(day) : p[day];
    if (x) return { b: x.block, places: x.places };
  }
  const s = summaryOf(day);
  return s?.emerge ? { b: s.emerge, places: s.places } : null;
}
export const emergeOf = (day) => dayOf(day)?.b || null;
export const emergeNow = () => emergeOf(clockAt(Date.now()).day);

// What is in the air at machine hour mt: yesterday's late flights and today's.
export function airNow(mt, caps) {
  const day = Math.floor(mt / 24) + 1, a = dayOf(day - 1), b = dayOf(day);
  if (!a && !b) return null;
  return { air: airAt([a, b].filter(Boolean), mt, caps), today: b?.b || null };
}
// The file's assignment line for a subject holding one of the industries' posts today.
export function emergeJobLine(key) {
  return jobWord(emergeNow(), key);
}
