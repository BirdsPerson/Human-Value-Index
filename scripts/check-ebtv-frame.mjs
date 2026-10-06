// The city's TVs (src/city/ebtvFrame.js, netlify/functions/ebtv-frame.js): a frame under 3 minutes
// old is the picture, anything else is the OFF AIR card; one fetch at most every 30 s, none from a
// hidden tab; the function never crashes without its store.
// Run: node scripts/check-ebtv-frame.mjs
import assert from "node:assert/strict";
import { frameFresh, fetchDue, REFRESH_MS, STALE_MS, ebtvFrame, watchHref, tvBox, takeTvBoxes } from "../src/city/ebtvFrame.js";

const now = 1_800_000_000_000;
// staleness -> picture or test card
assert.equal(frameFresh({ at: now - 10_000 }, now), true, "a 10 s old frame is on air");
assert.equal(frameFresh({ at: now - STALE_MS + 1 }, now), true, "just under 3 min is still on air");
assert.equal(frameFresh({ at: now - STALE_MS }, now), false, "3 min old is OFF AIR");
assert.equal(frameFresh(null, now), false, "no frame is OFF AIR");
assert.equal(frameFresh({}, now), false, "a frame without a timestamp is OFF AIR, never a confident picture");
assert.equal(frameFresh({ at: "yesterday" }, now), false, "a garbled timestamp is OFF AIR");
assert.equal(frameFresh({ at: now + 30_000 }, now), true, "a grabber clock 30 s fast is forgiven");
assert.equal(frameFresh({ at: now + 10 * 60_000 }, now), false, "a frame from the future is not");
// refresh throttle
assert.equal(REFRESH_MS, 30_000);
assert.equal(fetchDue(null, now), true, "never asked: ask");
assert.equal(fetchDue(now - 5_000, now), false, "asked 5 s ago: wait");
assert.equal(fetchDue(now - REFRESH_MS, now), true, "asked 30 s ago: ask");
assert.equal(fetchDue(null, now, true), false, "a hidden tab never asks");
// node has no window: no fetch, no frame (the test card), never a throw
assert.equal(ebtvFrame(now), null);
assert.match(watchHref(), /^https:\/\/electricbasement\.tv\/watch\?utm_source=humanvalueindex&utm_medium=city&utm_campaign=ebtv-tv$/);
// the tap boxes: taken once, capped
for (let i = 0; i < 100; i++) tvBox(0, 0, 1, 1);
assert.equal(takeTvBoxes().length, 32); assert.equal(takeTvBoxes().length, 0);

// the function: no Netlify environment here, so getStore throws and it must say 503, not crash
const { default: fn } = await import("../netlify/functions/ebtv-frame.js");
assert.equal((await fn(new Request("http://x/api/ebtv-frame"))).status, 503);
assert.equal((await fn(new Request("http://x/api/ebtv-frame", { method: "POST" }))).status, 405);
console.log("check-ebtv-frame: ok");
