// The site-wide GAMEPAD LAYER's doorbell, the only part in the entry script: the first time a
// pad shows up (the Gamepad API's gamepadconnected, or a non-null getGamepads() on a slow poll)
// it fetches src/ui/padLayer.js, its own chunk, and hands over. Nothing else runs here.
const n = typeof navigator !== "undefined" ? navigator : null;
if (n && n.getGamepads && typeof window !== "undefined") {
  let iv = 0;
  const go = () => {
    if (!iv) return;
    clearInterval(iv); iv = 0;
    removeEventListener("gamepadconnected", go);
    import("./padLayer.js").then(m => m.start()).catch(() => {});
  };
  const any = () => { try { return [...(n.getGamepads() || [])].some(Boolean); } catch { return false; } };
  iv = setInterval(() => { if (any()) go(); }, 1500);
  addEventListener("gamepadconnected", go);
}
