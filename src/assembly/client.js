// /api/assembly for the browser: the page (#assembly) and the city (the lot, the board, the
// PA). One shared copy, refreshed at most every 30 s; "hvi-assembly" fires when it changes.
// The case number and a per-device id ride along: the device id is a random token kept in
// localStorage, so one terminal cannot vote as a caucus (netlify/lib/assembly.js LIMITS).

let cache = null, at = 0, inflight = null;
const DEVICE_KEY = "hvi-device";

export function deviceId() {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d || !/^[a-f0-9]{32}$/.test(d)) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      d = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch { return null; }
}

const publish = (d) => { cache = d; at = Date.now(); try { window.dispatchEvent(new CustomEvent("hvi-assembly", { detail: d })); } catch { /* no window */ } return d; };

export const assemblyNow = () => cache;

export function loadAssembly({ force = false, caseId = null } = {}) {
  if (!force && !caseId && cache && Date.now() - at < 30000) return Promise.resolve(cache);
  if (inflight && !caseId) return inflight;
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const p = fetch(`/api/assembly${q}`, { cache: "no-store" })
    .then(r => r.json().then(d => (r.ok ? d : Promise.reject(d?.error || "The Assembly is unreachable."))))
    .then(publish);
  if (!caseId) { inflight = p; p.finally(() => { inflight = null; }).catch(() => {}); }
  return p;
}

export async function castBallot(caseId, choice, reasons) {
  const r = await fetch("/api/assembly", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, choice, reasons, device: deviceId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Assembly refused your ballot. It gave no reason. It does not owe you one.");
  publish(d);
  return d;
}
