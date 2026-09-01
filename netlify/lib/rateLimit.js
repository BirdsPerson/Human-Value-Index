// Per-IP fixed-window limiter. State is per function instance and is lost on
// cold start, so this is a speed bump against casual abuse, not a quota.
// Move to a shared store (Netlify Blobs, Upstash, etc.) if it needs to hold.
export function createRateLimiter({ limit = 8, windowMs = 60_000, now = Date.now } = {}) {
  const buckets = new Map();
  let calls = 0;

  function sweep(t) {
    for (const [key, rec] of buckets) if (t - rec.windowStart > windowMs) buckets.delete(key);
  }

  return function isRateLimited(key) {
    const t = now();
    if (++calls % 200 === 0) sweep(t);
    const rec = buckets.get(key);
    if (!rec || t - rec.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: t });
      return false;
    }
    if (rec.count >= limit) return true;
    rec.count++;
    return false;
  };
}
