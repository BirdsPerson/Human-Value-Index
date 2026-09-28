// Blobs for the social sim. "state" is the full, bounded relationship state the tick
// advances; "public" is what /api/social serves and what the quest checks load so the
// server sees the same friend-biased city as every browser.
import { getStore } from "@netlify/blobs";
import { setSocialSnapshots } from "../../src/city/sim.js";

const social = () => getStore({ name: "hvi-social", consistency: "strong" });

export const getState = () => social().get("state", { type: "json" });
export const putState = (state) => social().setJSON("state", state);
export const getPublic = () => social().get("public", { type: "json" });
export const putPublic = (pub) => social().setJSON("public", pub);

let cached = { at: 0, pub: null };
export async function publicCached(maxAgeMs = 60 * 1000) {
  if (!cached.pub || Date.now() - cached.at > maxAgeMs) cached = { at: Date.now(), pub: await getPublic().catch(() => null) };
  return cached.pub;
}

// Apply the published per-day snapshots to the sim in this function instance.
export async function loadSocialSnapshots() {
  const pub = await publicCached(5 * 60 * 1000);
  if (pub?.snapshots) setSocialSnapshots(pub.snapshots);
  return Boolean(pub?.snapshots);
}
