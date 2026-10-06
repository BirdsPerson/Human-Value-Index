// DISPLAY's themes (src/ui/themes.css) hold WCAG AA: every pair of tokens the components put text
// on is at least 4.5:1, in DEPARTMENT GREEN (src/ui/tokens.css) and in every theme layered on it.
// The theme list in the DISPLAY panel (src/front/prefs.js) and index.html's boot line must name
// exactly the themes the stylesheet defines. Pure: reads the CSS, no browser.
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const bare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const coreCss = read("src/coreScreens.css");
const tokensCss = bare(read("src/ui/tokens.css")), themesCss = bare(read("src/ui/themes.css")), uiCss = read("src/ui/ui.css");
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const base = decls(tokensCss.match(/:root\s*{([\s\S]*?)\n}/)[1]);
const themes = { green: {} };
for (const m of themesCss.matchAll(/:root\[data-theme="([\w-]+)"\]\s*{([\s\S]*?)\n}/g)) themes[m[1]] = decls(m[2]);

// the role defaults ui.css gives (var(--x, fallback)) when a theme does not set them
const DEFAULTS = { "--bar": "var(--fg-dim)", "--bar-ink": "var(--accent-ink)", "--bar-cur": "var(--accent)", "--bar-cur-bg": "var(--accent-ink)",
  "--bar-cur-hot": "var(--warn)", "--door-n": "var(--hot)", "--ttl-bg": "var(--panel)", "--ttl-fg": "var(--fg)", "--ttl-mute": "var(--fg-mute)", "--desk": "var(--bg)" };
for (const k of ["--bar", "--bar-ink", "--bar-cur", "--bar-cur-bg", "--bar-cur-hot", "--ttl-bg", "--ttl-fg", "--ttl-mute", "--door-n"]) {
  if (!uiCss.includes(`var(${k},`) && !coreCss.includes(`var(${k},`)) { console.error(`FAIL ui.css no longer reads ${k}: the theme role is dead`); process.exit(1); }
}

function resolve(set, name, depth = 0) {
  const v = set[name] ?? DEFAULTS[name];
  if (v == null || depth > 8) return null;
  const m = v.match(/^var\((--[\w-]+)\)$/);
  return m ? resolve(set, m[1], depth + 1) : v;
}
function rgb(hex) {
  const h = String(hex).replace("#", "");
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return null;
  const f = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
}
const lum = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [text, surface]: what the components actually do (docs/design-system.md)
const PAIRS = [
  ["--fg", "--bg"], ["--fg-dim", "--bg"], ["--fg-mute", "--bg"], ["--fg", "--desk"], ["--fg-dim", "--desk"],
  ["--fg", "--panel"], ["--fg-dim", "--panel"], ["--fg-mute", "--panel"], ["--fg", "--panel-hi"], ["--fg-mute", "--panel-hi"],
  ["--accent", "--bg"], ["--accent", "--panel"], ["--accent-ink", "--accent"],
  ["--warn", "--panel"], ["--harm", "--panel"], ["--eb-cyan", "--panel"], ["--eb-amber", "--panel"],
  ["--bar-ink", "--bar"], ["--hot", "--bar"], ["--bar-cur", "--bar-cur-bg"], ["--bar-cur-hot", "--bar-cur-bg"], ["--door-n", "--accent"],
  ["--ttl-fg", "--ttl-bg"], ["--ttl-mute", "--ttl-bg"],
];
const AA = 4.5;
let bad = 0;
for (const [name, over] of Object.entries(themes)) {
  const set = { ...base, ...over };
  const worst = [];
  for (const [t, s] of PAIRS) {
    const a = rgb(resolve(set, t)), b = rgb(resolve(set, s));
    if (!a || !b) { console.error(`FAIL ${name}: ${t} on ${s} is not a plain hex colour (${resolve(set, t)} / ${resolve(set, s)})`); bad++; continue; }
    const r = ratio(a, b);
    if (r < AA) { console.error(`FAIL ${name}: ${t} on ${s} is ${r.toFixed(2)}:1 (AA needs ${AA})`); bad++; }
    worst.push(r);
  }
  if (worst.length) console.log(`${name}: ${PAIRS.length} pairs, lowest ${Math.min(...worst).toFixed(2)}:1`);
}

// the lists agree: the DISPLAY panel, the boot line and the stylesheet
const ids = Object.keys(themes).sort().join(",");
const prefs = read("src/front/prefs.js").split("export const WIDGETS")[0];
const listed = [...prefs.matchAll(/\{ id: "([\w-]+)", name:/g)].map(m => m[1]).sort().join(",");
if (listed !== ids) { console.error(`FAIL src/front/prefs.js THEMES (${listed}) != themes.css (${ids})`); bad++; }
const boot = read("index.html").match(/\^\(([\w|]+)\)\$/)?.[1].split("|").sort().join(",");
if (boot !== ids) { console.error(`FAIL index.html boot line (${boot}) != themes.css (${ids})`); bad++; }

if (bad) process.exit(1);
console.log(`check-themes ok: ${Object.keys(themes).length} themes, AA on every pair`);
