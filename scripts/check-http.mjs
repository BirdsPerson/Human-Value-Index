// Self-check for netlify/lib/http.js origin rules. Run: node scripts/check-http.mjs
import assert from "node:assert/strict";
import { allowedOrigin, foreignOrigin, makeJson, preflight } from "../netlify/lib/http.js";

const req = (url, origin) => new Request(url, { method: "POST", headers: origin ? { origin } : {} });

// same origin passes wherever the site runs (prod, deploy preview, netlify dev)
assert.equal(allowedOrigin(req("http://localhost:8888/api/evaluate", "http://localhost:8888")), "http://localhost:8888");
assert.equal(allowedOrigin(req("https://deploy-preview-3--human-value-index.netlify.app/api/x", "https://deploy-preview-3--human-value-index.netlify.app")), "https://deploy-preview-3--human-value-index.netlify.app");
// production names pass even if the function host differs
assert.equal(allowedOrigin(req("https://human-value-index.netlify.app/api/x", "https://humanvalueindex.com")), "https://humanvalueindex.com");
// other sites are refused
assert.equal(foreignOrigin(req("https://humanvalueindex.com/api/x", "https://evil.example")), true);
assert.equal(foreignOrigin(req("https://humanvalueindex.com/api/x", "https://humanvalueindex.com.evil.example")), true);
// no Origin (curl, server): not a browser on another site; the caps handle it
assert.equal(foreignOrigin(req("https://humanvalueindex.com/api/x")), false);

// headers: never a wildcard; echo only allowed origins
const bad = preflight(req("https://humanvalueindex.com/api/x", "https://evil.example"));
assert.equal(bad.headers.get("access-control-allow-origin"), null);
const ok = makeJson(req("https://humanvalueindex.com/api/x", "https://humanvalueindex.com"))(200, {});
assert.equal(ok.headers.get("access-control-allow-origin"), "https://humanvalueindex.com");

console.log("check-http: ok");
