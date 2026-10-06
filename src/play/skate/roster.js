// Who skates. You (your own file's face), or a skater on file. Everyone wears the same kit shape (a tee,
// trousers, shoes); the colours are theirs. The living appear and skate; they never speak.
export const SKATERS = [
  { key: "you", name: "YOU", shirt: "#dc2626", pants: "#1e3a8a", deck: "#facc15" },
  { key: "bob-burnquist", name: "BOB BURNQUIST", shirt: "#16a34a", pants: "#3f3f46", deck: "#f97316", sprite: "/api/sprite/bob-burnquist" },
  { key: "johnny-knoxville", name: "JOHNNY KNOXVILLE", shirt: "#f8fafc", pants: "#1d4ed8", deck: "#ef4444", sprite: "/api/sprite/johnny-knoxville" },
  { key: "bam-margera", name: "BAM MARGERA", shirt: "#7c3aed", pants: "#18181b", deck: "#22d3ee", sprite: "/api/sprite/bam-margera" },
];
export const SKATER = Object.fromEntries(SKATERS.map(s => [s.key, s]));
