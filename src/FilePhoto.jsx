import { useEffect, useRef } from "react";
import { SPRITE_W, SPRITE_H, paintAvatar, paintPlaceholder, loadImage } from "./sprites.js";
import { sanitizeAvatar } from "./avatar.js";
import { getTier } from "./figures.js";
import { TermBox } from "./term.jsx";

// The subject's pixel likeness, framed like the photo stapled to a dossier. Every subject
// file shows one: public figures their sprite, citizens their procedural file photo (or
// the Department's hand-drawn sprite), and anyone without one the tier-coloured stand-in.

const strict = (n) => String(n || "").toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
const folded = (n) => strict(String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, ""));

// What to draw: { img: [urls to try] } | { spec } | {}.
export function photoSource(subject) {
  if (!subject) return {};
  const av = sanitizeAvatar(subject.avatar);
  if (av?.kind === "sprite") return { img: [av.url] };
  if (av?.kind === "procedural") return { spec: av.spec };
  if (typeof subject.sprite === "string" && subject.sprite) return { img: [subject.sprite] };
  if (subject.kind === "citizen" || subject.you) return {};
  const tries = [subject.slug, strict(subject.name), folded(subject.name)].filter(Boolean);
  return { img: [...new Set(tries)].map(s => `/sprites/${s}.png`) };
}

export function photoCaption(subject) {
  if (!subject) return "SUBJECT";
  if (subject.kind === "citizen" || subject.you || /^Subject [A-Z2-7]{4}$/.test(subject.name || "")) {
    const last4 = (subject.caseId || "").slice(-4) || (subject.name || "").replace(/^Subject /, "");
    return `SUBJECT ${last4 || "UNFILED"}`;
  }
  return String(subject.name || "SUBJECT").toUpperCase();
}

function PhotoCanvas({ subject, scale, label }) {
  const ref = useRef(null);
  const src = photoSource(subject);
  // scale is in the key: a new canvas size clears the bitmap, so it must redraw
  const key = JSON.stringify(src) + (subject?.score ?? "") + (subject?.name ?? "") + ":" + scale;
  useEffect(() => {
    let dead = false;
    const c = ref.current;
    if (!c) return;
    const draw = (sheet) => {
      if (dead || !sheet) return;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(sheet, 0, 0, SPRITE_W, SPRITE_H, 0, 0, c.width, c.height);   // frame 0 only
    };
    const stand = () => paintPlaceholder(subject?.slug || strict(subject?.name) || "subject", getTier(subject?.score ?? 500).color, 1);
    if (src.spec) { draw(paintAvatar(src.spec, 1)); return; }
    if (!src.img?.length) { draw(stand()); return; }
    (async () => {
      for (const u of src.img) { const img = await loadImage(u); if (img) return draw(img); if (dead) return; }
      draw(stand());
    })();
    return () => { dead = true; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={SPRITE_W * scale} height={SPRITE_H * scale} className="hvi-photo-canvas"
    role="img" aria-label={label} style={{ width: SPRITE_W * scale, height: SPRITE_H * scale }} />;
}

// compact: a bare framed thumbnail for lists and tooltips.
export default function FilePhoto({ subject, scale = 3, compact = false, caption }) {
  const cap = caption || photoCaption(subject);
  const label = `File photo: ${subject?.name || cap}`;
  if (compact) return <span className="hvi-photo-thumb"><PhotoCanvas subject={subject} scale={scale} label={label} /></span>;
  return (
    <div className="hvi-photo" style={{ width: `calc(${SPRITE_W * scale}px + 7ch)` }}>
      <TermBox title="FILE PHOTO">
        <div className="hvi-photo-body"><PhotoCanvas subject={subject} scale={scale} label={label} /></div>
        <div className="hvi-photo-cap">{cap}</div>
      </TermBox>
    </div>
  );
}

export const FILE_PHOTO_CSS = `
  .hvi-photo { flex: none; max-width: 100%; }
  .hvi-photo-body { display: flex; justify-content: center; padding: 4px 6px; background: rgba(0,0,0,0.25); }
  .hvi-photo-canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
  .hvi-photo-cap { font-size: 10px; letter-spacing: 1px; color: var(--text-muted); text-align: center; margin-top: 4px; white-space: nowrap; }
  .hvi-photo-thumb { display: inline-flex; flex: none; border: 1px solid var(--text-ghost); background: rgba(0,0,0,0.25); padding: 1px; vertical-align: middle; }
  .hvi-file-head { display: flex; gap: 14px; align-items: flex-start; }
  .hvi-file-head > .hvi-file-text { flex: 1; min-width: 0; }
  .hvi-card-panel .hvi-card-head { align-items: flex-start; flex-wrap: nowrap; }
  .hvi-row-btn { align-items: center; }
  .hvi-row-btn .hvi-photo-thumb { margin: 1px 0; }
  .hvi-photo-update { margin-top: 6px; }
  @media (max-width: 480px) { .hvi-file-head { gap: 10px; } }
`;
