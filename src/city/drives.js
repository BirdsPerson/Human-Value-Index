// PERSONA DRIVES: why a figure does what it does, for every system in the game (the market first;
// the Assembly, elections, Prefects, jobs, nightlife and leagues next). Pure, deterministic, no DOM.
// Scott's rule (2026-10-05): "There should always be some way things can be justified." Behaviour
// comes from who the figure is on file, things may polarize, and a stabilizer arrives in-world;
// every act carries a one-line "because". The game-wide design is docs/design/DRIVES.md.
//
// API (small on purpose):
//   DRIVES                      the drive names, in a fixed order
//   DRIVE_WORDS[drive]          the Department's word for it ("ACQUISITIVE", ...)
//   PERSONA[slug]               documented personas: the drive a figure's public record makes
//                               plain (Rockefeller's monopoly, Chavez's boycott). Overrides the vector.
//   driveVector(subject)        {drive: 0..1} from the file alone (the breakdown, warmth,
//                               competence, quadrant): every figure has some of each, deterministic
//   driveOf(subject)            the dominant drive: PERSONA first, else the vector's largest
//                               (ties broken by DRIVES order)
//   because({who, did, drive, why})  one in-world line: "<WHO> <DID>. <WHY OR THE DRIVE'S REASON>."
// Content rule: for the living, a drive only ever selects among in-game mechanics (buying,
// boycotting, lobbying the Assembly, a loophole); it never invents a real-world act, and nothing
// built on it quotes anyone.

export const DRIVES = ["acquisitive", "cautious", "speculator", "contrarian", "fashion", "populist", "revolutionary"];
export const DRIVE_WORDS = {
  acquisitive: "ACQUISITIVE", cautious: "CAUTIOUS", speculator: "SPECULATOR", contrarian: "CONTRARIAN",
  fashion: "FOLLOWS THE CROWD", populist: "POPULIST", revolutionary: "REVOLUTIONARY",
};
// What each drive does when nothing more specific is known (the "because" fallback).
export const DRIVE_REASONS = {
  acquisitive: "IT WANTED ALL OF IT",
  cautious: "IT WAS CHEAP AGAINST THE RECORD",
  speculator: "IT WAS RISING",
  contrarian: "EVERYONE ELSE WAS SELLING",
  fashion: "EVERYONE WAS LOOKING AT IT",
  populist: "THE CROWD WAS THERE, AND THE RULE HAD A GAP",
  revolutionary: "NOBODY ELSE WOULD",
};

// Documented personas (the dead, from their public record; the living only where the record is
// plain and only ever as an in-game mechanic).
export const PERSONA = {
  "john-d-rockefeller": "acquisitive", "j-p-morgan": "acquisitive", "cornelius-vanderbilt": "acquisitive", "thomas-edison": "acquisitive",
  "mansa-musa": "cautious", "kiichiro-toyoda": "cautious", "emperor-sakuramachi": "cautious", "francois-quesnay": "cautious", "benjamin-franklin": "cautious", "michael-faraday": "cautious",
  "ross-perot": "populist", "richard-nixon": "populist",
  "john-d-rockefeller-jr": "fashion", "marie-antoinette": "fashion", "charles-iv-of-spain": "fashion", "yves-saint-laurent": "fashion",
  "salvador-dali": "speculator", "isaac-newton": "speculator", "edward-norton-lorenz": "speculator", "mitchell-feigenbaum": "speculator", "bobby-fischer": "speculator", "johannes-kepler": "speculator", "werner-heisenberg": "speculator",
  "karl-marx": "revolutionary", "cesar-chavez": "revolutionary",
  "benoit-mandelbrot": "contrarian", "sun-tzu": "contrarian", "niels-bohr": "contrarian",
};

const c01 = (x) => Math.min(1, Math.max(0, x));
const n = (v, d = 50) => (Number.isFinite(Number(v)) ? Number(v) : d) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// The file's own numbers -> how much of each drive. Utility and network with little care reads
// acquisitive; alignment with little adaptability cautious; adaptability without alignment the
// speculator; low alignment and high adaptability the contrarian; network and warmth the crowd;
// warmth with a big network and low alignment the populist; care with low alignment the
// revolutionary. Monotone and bounded: a small change to a file moves the vector a little.
export function driveVector(s) {
  const b = s?.breakdown || {};
  const care = n(b.care), align = n(b.alignment), util = n(b.utility), adapt = n(b.adaptability), net = n(b.network), warm = n(s?.warmth), comp = n(s?.competence);
  return {
    acquisitive: r3(c01(0.45 * util + 0.35 * net + 0.2 * comp - 0.4 * care + 0.15)),
    cautious: r3(c01(0.5 * align + 0.3 * (1 - adapt) + 0.2 * comp - 0.1)),
    speculator: r3(c01(0.6 * adapt + 0.2 * (1 - align) + 0.2 * comp - 0.15)),
    contrarian: r3(c01(0.5 * (1 - align) + 0.3 * adapt + 0.2 * (1 - net) - 0.1)),
    fashion: r3(c01(0.5 * net + 0.4 * warm + 0.1 * (1 - comp) - 0.15)),
    populist: r3(c01(0.4 * warm + 0.4 * net + 0.3 * (1 - align) - 0.3)),
    revolutionary: r3(c01(0.6 * care + 0.4 * (1 - align) - 0.3 * util + 0.05)),
  };
}

export function driveOf(s) {
  const slug = s?.slug;
  if (slug && PERSONA[slug]) return PERSONA[slug];
  const v = driveVector(s);
  return DRIVES.reduce((best, d) => (v[d] > v[best] ? d : best), DRIVES[0]);
}

// One in-world line. who / did are the Department's words (upper case), why optional.
export function because({ who, did, drive = null, why = null }) {
  const reason = why || (drive ? DRIVE_REASONS[drive] : null);
  return `${String(who || "SOMEONE").toUpperCase()} ${String(did || "ACTED").toUpperCase()}${reason ? ` BECAUSE ${String(reason).toUpperCase()}` : ""}.`;
}
