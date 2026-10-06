// THE DAILY COMPLIANCE's Blobs (store hvi-paper): the adapter netlify/lib/paper.js publishEdition
// takes. e/<date> is written once (onlyIfNew) and never changed; the index under its etag.
import { getStore } from "@netlify/blobs";
import { STORE, INDEX_KEY, editionKey } from "./paper.js";

export function paperStore(s = () => getStore({ name: STORE, consistency: "strong" })) {
  return {
    async get(key) { return s().get(key, { type: "json" }); },
    async getWithEtag(key) { const r = await s().getWithMetadata(key, { type: "json" }); return r ? { data: r.data, etag: r.etag } : null; },
    async setNew(key, json) { return (await s().setJSON(key, json, { onlyIfNew: true })).modified; },
    async setIf(key, json, etag) { return (await s().setJSON(key, json, etag ? { onlyIfMatch: etag } : { onlyIfNew: true })).modified; },
    edition: (date) => s().get(editionKey(date), { type: "json" }),
    index: () => s().get(INDEX_KEY, { type: "json" }),
  };
}
