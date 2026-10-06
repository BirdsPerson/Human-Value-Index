import PixelCard from "../play/cards/PixelCard.jsx";
import Head from "../play/cards/Head.jsx";
import { useFour } from "../play/cards/prefs.js";

// A playing card: THE CARD ROOM's pixel card (src/play/cards/art.js), its name read aloud
// ("Queen of spades"). "??" is face down. small: the opponents' and the showdown's size.
// Each card mounts with a deal (reduced motion: it is simply there).
export function Card({ code, small = false, flip = false }) {
  const four = useFour();
  return <PixelCard code={code} scale={small ? 1.25 : 1.75} four={four} className={flip ? "flip" : "deal"} />;
}

export function Hand({ cards, small, label }) {
  return <span className="cz-hand" role="group" aria-label={label}>{(cards || []).map((c, i) => <Card key={`${i}-${c}`} code={c} small={small} flip={c !== "??" && small} />)}</span>;
}

// A figure at a table: the head off their file photo (src/play/heads.js), no everyday props.
export function Sprite({ src, name, size = "m" }) {
  return <Head src={src} name={name} px={3} />;
}

// A stack of chips, drawn: one disc per step of size (a few for a short stack, a tower for a big
// one), coloured by the biggest chip it would hold.
const DENOM = [[5000, "#7c3aed"], [1000, "#f59e0b"], [500, "#7a1010"], [100, "#16181d"], [25, "#15803d"], [5, "#b3121b"], [0, "#e5e7eb"]];
export function ChipStack({ amount, label }) {
  const n = Math.max(0, Math.round(amount || 0));
  if (!n) return null;
  const discs = Math.min(12, 1 + Math.floor(Math.log2(1 + n / 10)));
  const [, col] = DENOM.find(([d]) => n >= d * 2) || DENOM[DENOM.length - 1];
  return (
    <span className="cz-stack" role="img" aria-label={label || `${n.toLocaleString("en-US")} in chips`}>
      {Array.from({ length: discs }, (_, i) => <span key={i} className="d" style={{ background: i % 2 ? col : "#c9a227", bottom: i * 3 }} />)}
    </span>
  );
}
