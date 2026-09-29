// A referred figure's file detail. The census (/api/pen) leaves out what only an open
// file shows (the verdict, the file's movement log, a harm finding: FILE_ONLY in
// netlify/lib/refer.js); /api/figure/<slug> serves them, fetched once per file per visit.
import { useEffect, useState } from "react";

const cache = new Map();   // slug -> Promise<subject|null>

// Does this subject's file need the detail fetch? Census figures arrive without a
// verdict key at all; anyone carrying one (the figures on file, your own card) doesn't.
export const needsDetail = (s) => Boolean(s && s.referred && s.kind === "figure" && s.slug && !s.you && !("verdict" in s));

export function loadFileDetail(slug) {
  if (!cache.has(slug)) {
    cache.set(slug, fetch(`/api/figure/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null)).then(d => d?.subject || null)
      .catch(() => null)
      .then(s => { if (!s) cache.delete(slug); return s; }));   // a failure is retried on the next open
  }
  return cache.get(slug);
}

// The subject with its file detail merged in once it lands. loading is true until then.
export function useFileDetail(subject) {
  const need = needsDetail(subject);
  const slug = need ? subject.slug : null;
  const [got, setGot] = useState(null);   // { slug, detail }
  useEffect(() => {
    if (!slug) return;
    let off = false;
    loadFileDetail(slug).then(d => { if (!off) setGot({ slug, detail: d || { verdict: null } }); });
    return () => { off = true; };
  }, [slug]);
  if (!need) return { subject, loading: false };
  if (got?.slug !== slug) return { subject, loading: true };
  const d = got.detail;
  return { subject: { ...subject, verdict: d.verdict ?? null, scoreHistory: d.scoreHistory ?? null, harmReview: d.harmReview ?? null, breakdown: subject.breakdown ?? d.breakdown ?? null }, loading: false };
}
