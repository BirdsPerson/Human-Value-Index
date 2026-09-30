// THE PEOPLE'S PETITION, hourly (docs/PETITION.md): folds each voted file's period into its
// lean history, grants a review where the trigger has held for 72 hours (at most 3 a day,
// site-wide), and rewrites the crowd's People signal. It never runs a review: the Mac's
// scripts/petition-review.mjs reads the queue. No paid API is called here.
import { getStore } from "@netlify/blobs";
import { getFigure } from "../lib/store.js";
import { STORE, tick } from "../lib/petition.js";

export default async () => {
  try {
    const report = await tick({ store: getStore({ name: STORE, consistency: "strong" }), getCard: getFigure });
    console.log("petition tick", JSON.stringify(report));
  } catch (err) {
    console.error("petition tick failed", err?.name, err?.message);
  }
};

export const config = { schedule: "@hourly" };
