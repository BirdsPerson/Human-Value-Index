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

// FRIENDLY FIGURES (on by default): the figures at the table play loosely (roster.js FRIENDLY_CAP), so a casual
// player can win. Off: they play at their file's rating.
const FKEY = "hvi-cards-friendly";
const readF = () => { try { return localStorage.getItem(FKEY) !== "0"; } catch { return true; } };
export function setFriendly(on) {
  try { localStorage.setItem(FKEY, on ? "1" : "0"); } catch { /* private mode: this page only */ }
  try { window.dispatchEvent(new CustomEvent("hvi-cards-friendly", { detail: on })); } catch { /* no window */ }
}
export function useFriendly() {
  const [f, set] = useState(readF);
  useEffect(() => { const on = (e) => set(Boolean(e.detail)); window.addEventListener("hvi-cards-friendly", on); return () => window.removeEventListener("hvi-cards-friendly", on); }, []);
  return f;
}
