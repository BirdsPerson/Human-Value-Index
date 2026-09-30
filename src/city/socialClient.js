// The browser's door to the social ledger (/api/social). Loads the published per-day
// snapshots into the sim (friends pull each other toward shared haunts; see social.js)
// and serves the gossip, the city-wide web and one subject's associates.
import { useEffect, useState } from "react";
import { setSocialSnapshots } from "./sim.js";

const REFRESH_MS = 10 * 60 * 1000;   // new machine days publish new snapshots
let city = null, cityAt = 0, inflight = null;
const bySubject = new Map();

export function ensureSocial(force = false) {
  if (typeof fetch !== "function") return Promise.resolve(null);
  if (!force && city && Date.now() - cityAt < REFRESH_MS) return Promise.resolve(city);
  if (inflight) return inflight;
  inflight = fetch("/api/social").then(r => (r.ok ? r.json() : null)).then(d => {
    if (d?.ready) {
      city = d; cityAt = Date.now();
      if (setSocialSnapshots(d.snapshots || {}) && typeof window !== "undefined") window.dispatchEvent(new Event("hvi-social"));
    }
    return city;
  }).catch(() => city).finally(() => { inflight = null; });
  return inflight;
}

// City-wide: {friends, rivals, events, counts}; null until loaded or if the ledger is down.
export function useSocial() {
  const [d, setD] = useState(city);
  useEffect(() => {
    let off = false;
    const pull = () => ensureSocial().then(x => { if (!off) setD(x); });
    pull();
    const iv = setInterval(pull, REFRESH_MS);
    return () => { off = true; clearInterval(iv); };
  }, []);
  return d;
}

// One subject: {relations: [{key, name, affinity, level, meetings, lastPlace}], events}, from
// the subject's own shard (/api/social/<slug>), never the whole city.
export function useAssociates(slug) {
  const [d, setD] = useState(() => bySubject.get(slug) || null);
  useEffect(() => {
    if (!slug || typeof fetch !== "function") return;
    let off = false;
    const hit = bySubject.get(slug);
    if (hit && Date.now() - hit.at < REFRESH_MS) { setD(hit); return; }
    fetch(`/api/social/${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)).then(x => {
      if (off || !x) return;
      const v = { at: Date.now(), ready: Boolean(x.ready), relations: x.relations || [], events: x.events || [] };
      bySubject.set(slug, v); setD(v);
    }).catch(() => {});
    return () => { off = true; };
  }, [slug]);
  return d;
}
