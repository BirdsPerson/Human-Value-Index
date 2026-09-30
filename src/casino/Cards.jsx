import { SUIT_GLYPH } from "./rules.js";

// A playing card in the terminal's own furniture: a framed rank and suit. "??" is face down.
export function Card({ code, small = false }) {
  if (!code || code === "??") return <span className={`cz-card back${small ? " sm" : ""}`} aria-label="face-down card">▒▒</span>;
  const r = code[0] === "T" ? "10" : code[0], s = code[1];
  const red = s === "h" || s === "d";
  const name = { A: "ace", K: "king", Q: "queen", J: "jack" }[code[0]] || r;
  const suit = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" }[s];
  return <span className={`cz-card${red ? " red" : ""}${small ? " sm" : ""}`} aria-label={`${name} of ${suit}`}>{r}{SUIT_GLYPH[s]}</span>;
}

export function Hand({ cards, small, label }) {
  return <span className="cz-hand" aria-label={label}>{(cards || []).map((c, i) => <Card key={i} code={c} small={small} />)}</span>;
}

// A figure's file photo: the first frame of its sprite sheet (as the Assembly shows advocates).
export function Sprite({ src, name, size = "m" }) {
  const initials = String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  return (
    <span className={`cz-sprite ${size}`} role="img" aria-label={name} style={src ? { backgroundImage: `url(${src})` } : undefined}>
      {!src && <span className="ini">{initials}</span>}
    </span>
  );
}
