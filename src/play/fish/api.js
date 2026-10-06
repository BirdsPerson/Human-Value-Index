// /api/aquarium from the browser: the permit, the donation, the tanks (netlify/functions/aquarium.js).
// The page fishes without it; only a donation needs the network and a case file.
const DEVICE_KEY = "hvi-device";   // the same per-device token the Assembly sends (src/assembly/client.js)
function deviceId() {
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
async function call(method, body, q = "") {
  const r = await fetch(`/api/aquarium${q}`, method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, device: deviceId() }) });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw Object.assign(new Error(j?.error || `THE AQUARIUM DID NOT ANSWER (${r.status}).`), { status: r.status });
  return j;
}
export const loadAquarium = (caseId) => call("GET", null, caseId ? `?caseId=${encodeURIComponent(caseId)}` : "");
export const startTrip = (caseId, spot) => call("POST", { caseId, action: "trip", spot });
// v: the sim the trip was played on (2, one button; 1, EXPERT). A donation without one is v1.
export const donateCatch = (caseId, tripId, n, claim, inputLog, v = 2) => call("POST", { caseId, action: "donate", tripId, n, claim, inputLog, v });
