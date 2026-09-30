// The census, page by page (/api/pen is paged: netlify/functions/pen.js). The lists that
// show everyone (the Holding Pen, the cube, the analytics, the city's own fallback) read it
// here. fields: "list" (no sim inputs), "cube" (only what the cube plots), or the whole
// record; kind: "figure" | "citizen". base: an origin for scripts (node has no page).
export async function fetchPen({ fields = null, kind = null, base = "", maxPages = 500 } = {}) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams();
    if (fields) q.set("fields", fields);
    if (kind) q.set("kind", kind);
    if (cursor) q.set("cursor", cursor);
    const qs = q.toString();
    const r = await fetch(`${base}/api/pen${qs ? "?" + qs : ""}`);
    if (!r.ok) throw new Error(`pen ${r.status}`);
    const d = await r.json();
    out.push(...(d?.subjects || []));
    if (!d?.next || d.next === cursor) break;
    cursor = d.next;
  }
  return out;
}
