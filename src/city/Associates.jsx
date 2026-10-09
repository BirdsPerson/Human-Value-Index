// ASSOCIATES: who a subject has been seen with, from the social ledger. Actions only:
// nobody, living or dead, is quoted. Rendered inside every subject file.
import { useAssociates } from "./socialClient.js";

const LEVEL = {
  close: ["INSEPARABLE", "var(--accent)"], friends: ["FRIEND", "var(--accent)"], acquaintance: ["ACQUAINTANCE", "var(--fg-dim)"],
  rivals: ["RIVAL", "var(--warn)"], nemesis: ["NEMESIS", "var(--harm)"],
};

export function Associates({ slug }) {
  const d = useAssociates(slug);
  if (!slug) return null;
  const rel = (d?.relations || []).filter(r => r.level !== "acquaintance").slice(0, 6);
  const acq = (d?.relations || []).filter(r => r.level === "acquaintance").length;
  return (
    <div className="hvi-assoc" aria-label="Associates">
      <div className="hvi-assoc-h">ASSOCIATES <span>{d ? `${rel.length} ON FILE${acq ? ` // ${acq} ACQUAINTANCE${acq === 1 ? "" : "S"}` : ""}` : "CONSULTING THE LEDGER"}</span></div>
      {d && !rel.length && <div className="hvi-assoc-none">NO ONE HAS BEEN SEEN WITH THIS SUBJECT OFTEN ENOUGH TO MATTER. THE DEPARTMENT KEEPS WATCHING.</div>}
      {rel.length > 0 && (
        <ul className="hvi-assoc-list">
          {rel.map(r => {
            const [label, color] = LEVEL[r.level] || ["", "var(--fg-dim)"];
            const w = Math.min(100, Math.abs(r.affinity));
            return (
              <li key={r.key}>
                <span className="n">{r.name}</span>
                <span className="lv" style={{ color }}>{label}</span>
                <span className="bar" aria-hidden="true"><span style={{ width: `${w}%`, background: color }} /></span>
                <span className="meta">{r.meetings}× {r.lastPlace ? `// ${r.lastPlace}` : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
      {d?.group && (
        <div className="hvi-assoc-group">
          GROUP: {d.group.name} // {d.group.size} ON FILE{d.group.hangout ? ` // HOME: ${d.group.hangout}` : ""}
          <span> WITH {d.group.others.map(o => o.name).join(", ").toUpperCase()}</span>
        </div>
      )}
      {d?.events?.[0] && <div className="hvi-assoc-last">LATEST: {d.events[0].text}</div>}
    </div>
  );
}

export const ASSOC_CSS = `
  .hvi-assoc { margin: var(--s3) 0; }
  .hvi-assoc-h { color: var(--fg-dim); font-size: var(--t-xs); letter-spacing: .08em; margin-bottom: var(--s2); }
  .hvi-assoc-h span { color: var(--fg-mute); margin-left: var(--s2); }
  .hvi-assoc-group { margin-top: var(--s2); color: var(--accent); font-size: var(--t-xs); line-height: 1.5; }
  .hvi-assoc-group span { color: var(--fg-mute); }
  .hvi-assoc-none, .hvi-assoc-last { color: var(--fg-mute); font-size: var(--t-xs); line-height: 1.5; }
  .hvi-assoc-last { margin-top: var(--s2); }
  .hvi-assoc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .hvi-assoc-list li { display: grid; grid-template-columns: minmax(0, 1.4fr) auto minmax(40px, 1fr); gap: 4px var(--s2); align-items: center; font-size: var(--t-xs); }
  .hvi-assoc-list .n { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hvi-assoc-list .lv { letter-spacing: .06em; }
  .hvi-assoc-list .bar { height: 6px; background: var(--line); display: block; }
  .hvi-assoc-list .bar span { display: block; height: 100%; }
  .hvi-assoc-list .meta { grid-column: 1 / -1; color: var(--fg-mute); }
`;
