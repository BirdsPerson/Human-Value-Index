// Production Blobs from a local script (the Mac jobs). Same stores the functions use,
// reached with the Netlify CLI's own login token, so conditional writes (onlyIfNew /
// onlyIfMatch) work here too. The netlify CLI's blobs:set has no etag, which is why
// referral_sprites.py needs repair_index(); this path doesn't.
import { getStore } from "@netlify/blobs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { figureIndexEntry } from "../../netlify/lib/store.js";

export const SITE_ID = "3ac3fcb8-cab4-489b-8ea9-1e4153b87941";

function token() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const cfg = JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, "utf8"));
  const t = Object.values(cfg.users || {})[0]?.auth?.token;
  if (!t) throw new Error("no Netlify token: run `netlify login` or set NETLIFY_AUTH_TOKEN");
  return t;
}

let tok;
export const store = name => getStore({ name, siteID: SITE_ID, token: (tok ??= token()), consistency: "strong" });

export async function figureIndex() {
  const idx = await store("hvi-figures").get("index", { type: "json" });
  return (idx?.cards || []).filter(c => c?.slug);
}

// Every Wikidata id already on file in production (referrals and earlier engine runs).
export async function prodQids() {
  return new Set((await retry(figureIndex)).map(c => c.wikidata).filter(Boolean));
}

export const getCard = slug => (slug && slug !== "index" ? retry(() => store("hvi-figures").get(slug, { type: "json" })) : null);

// Card first (only if the slug is new), then the index under an etag. Returns false when
// the slug was already taken (the caller picks another or skips).
// Blobs over the public internet drop the odd request ("fetch failed"); conditional
// writes make a retry safe.
async function retry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !/fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(String(e?.message || e) + String(e?.cause?.code || ""))) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

export async function createCard(card) {
  return retry(() => createCardOnce(card));
}

async function createCardOnce(card) {
  const figs = store("hvi-figures");
  const res = await figs.setJSON(card.slug, card, { onlyIfNew: true });
  // A retry after a dropped response finds its own card already written: carry on to the index.
  if (!res.modified && (await figs.get(card.slug, { type: "json" }))?.run !== card.run) return false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await figs.getWithMetadata("index", { type: "json" });
    const base = cur?.data?.cards || [];
    const cards = [figureIndexEntry(card), ...base.filter(c => c.slug !== card.slug)];
    const w = await figs.setJSON("index", { cards }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (w.modified) return true;
  }
  throw new Error(`index write race lost 8 times for ${card.slug}; card saved, index not`);
}
