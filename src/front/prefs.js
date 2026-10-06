// The desk's two settings, kept on this device (localStorage, every access in try/catch: a private
// window or blocked storage just gets the defaults):
//   hvi-theme     DISPLAY: which token set (src/ui/themes.css); index.html applies it before paint
//   hvi-widgets   WIDGETS: which windows sit beside the logon, in order
// scripts/check-themes.mjs reads THEMES; scripts/check-desk.mjs reads WIDGETS and DEFAULT_WIDGETS.

export const THEMES = [
  { id: "green", name: "DEPARTMENT GREEN", note: "THE ISSUED PHOSPHOR. DEFAULT.", sw: ["#0a0f0a", "#0d140d", "#c8f5d8", "#4ade80", "#2bc6de"] },
  { id: "amber", name: "AMBER MONITOR", note: "THE SAME TERMINAL, WARMER. NOT FRIENDLIER.", sw: ["#0c0904", "#130e05", "#ffdca8", "#ffb000", "#ffcf70"] },
  { id: "win31", name: "WIN 3.1", note: "TEAL DESKTOP. NAVY TITLE BARS. PROGRAM MANAGER.", sw: ["#5fb3b3", "#ffffff", "#000000", "#000080", "#006a78"] },
  { id: "platinum", name: "PLATINUM", note: "SYSTEM 7 GREY. A WHITE MENU BAR.", sw: ["#a8a8a8", "#eeeeee", "#000000", "#30308f", "#005f6b"] },
  { id: "contrast", name: "HIGH CONTRAST", note: "BLACK, WHITE, YELLOW. NO SCANLINES.", sw: ["#000000", "#000000", "#ffffff", "#ffff00", "#00ffff"] },
];
const THEME_BG = { green: "#0a0f0a", amber: "#0c0904", win31: "#5fb3b3", platinum: "#a8a8a8", contrast: "#000000" };

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };

// what the boot line chose (or the attribute's absence: green)
export const currentTheme = () => document.documentElement.getAttribute("data-theme") || "green";
export const savedTheme = () => (THEMES.some(t => t.id === get("hvi-theme")) ? get("hvi-theme") : null);
export function applyTheme(id) {
  const t = THEMES.some(x => x.id === id) ? id : "green";
  const el = document.documentElement;
  if (t === "green") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", t);
  el.style.background = THEME_BG[t];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BG[t]);
}
// null: forget the pick, follow the device again
export function saveTheme(id) {
  put("hvi-theme", id);
  if (id) return applyTheme(id);
  const mq = (q) => { try { return window.matchMedia(q).matches; } catch { return false; } };
  applyTheme(mq("(prefers-contrast: more)") ? "contrast" : mq("(prefers-color-scheme: light)") ? "platinum" : "green");
}

// ---- WIDGETS -----------------------------------------------------------------------------------
export const WIDGETS = [
  { id: "market", name: "MARKET.TKR", note: "TOP RISERS AND FALLERS, WITH THE BECAUSE" },
  { id: "wire", name: "WIRE.TKR", note: "NEWS AND TRENDING, ONE LINE AT A TIME" },
  { id: "cam", name: "SUBSTRATE.CAM", note: "THE CITY FROM ABOVE, THE MACHINE HOUR" },
  { id: "notice", name: "NOTICE", note: "THE STANDING NOTICE. OK DISMISSES IT" },
  { id: "file", name: "YOUR FILE", note: "YOUR SCORE, TIER, MAIL AND FIRST DAY" },
  { id: "flat", name: "YOUR FLAT", note: "A CUTAWAY OF YOUR FLAT AND WHO IS HOME" },
  { id: "watch", name: "SURVEILLANCE", note: "FOLLOWS ONE PUBLIC FIGURE, THEN ANOTHER" },
  { id: "set", name: "THE SET", note: "A LITTLE TELEVISION. SIX CHANNELS, ALL LOCAL" },
  { id: "paper", name: "TODAY'S PAPER", note: "THE DAILY COMPLIANCE'S FRONT PAGE" },
  { id: "cups", name: "TOURNAMENTS", note: "WHAT IS OPEN NOW, AND WHO LEADS" },
  { id: "league", name: "LEAGUE TABLE", note: "THE DEPARTMENTAL CUP, TOP FIVE" },
];
export const DEFAULT_WIDGETS = ["market", "wire", "watch", "set", "notice"];
const KNOWN = new Set(WIDGETS.map(w => w.id));
export function loadWidgets() {
  try {
    const v = JSON.parse(get("hvi-widgets") || "null");
    if (Array.isArray(v)) return [...new Set(v.filter(id => KNOWN.has(id)))];
  } catch { /* defaults */ }
  return DEFAULT_WIDGETS.slice();
}
export const saveWidgets = (ids) => put("hvi-widgets", ids ? JSON.stringify(ids) : null);
