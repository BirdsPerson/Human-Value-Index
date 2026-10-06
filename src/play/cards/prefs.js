// THE CARD ROOM's per-viewer settings: the four-colour deck (accessibility: every suit its own
// ink), and the motion rule (reduced motion: cards appear where they land, no flight, no flip).
import { useEffect, useState } from "react";

const KEY = "hvi-cards-four";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export function setFour(on) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode: this page only */ }
  try { window.dispatchEvent(new CustomEvent("hvi-cards-four", { detail: on })); } catch { /* no window */ }
}
export function useFour() {
  const [four, set] = useState(read);
  useEffect(() => { const on = (e) => set(Boolean(e.detail)); window.addEventListener("hvi-cards-four", on); return () => window.removeEventListener("hvi-cards-four", on); }, []);
  return four;
}
export const reducedMotion = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
export const utcDay = () => new Date().toISOString().slice(0, 10);
