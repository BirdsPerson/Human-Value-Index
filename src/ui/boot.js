// The WarGames logon plays once per device. After that the terminal is simply on.
// Storage can be missing (private mode, blocked site data): then it plays every time,
// which is the old behaviour, and still skippable.
const KEY = "hvi-booted";
export function bootSeen() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function markBootSeen() { try { localStorage.setItem(KEY, "1"); } catch { /* the Overlord will simply boot again */ } }
