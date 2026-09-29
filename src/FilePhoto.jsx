import { useEffect, useRef } from "react";
import { SPRITE_W, SPRITE_H, paintAvatar, paintPlaceholder, loadSprite, loadRepoSprite } from "./sprites.js";
import { sanitizeAvatar } from "./avatar.js";
import { getTier } from "./figures.js";

// The subject's pixel likeness, framed like the photo stapled to a dossier. Every subject
// file shows one: public figures their sprite, citizens their procedural file photo (or
// the Department's hand-drawn sprite), and anyone without one the tier-coloured stand-in.

const strict = (n) => String(n || "").toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
const folded = (n) => strict(String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, ""));

// What to draw: { img: [urls to try] } | { repo: [sprite slugs to try] } | { spec } | {}.
export function photoSource(subject) {
  if (!subject) return {};
  const av = sanitizeAvatar(subject.avatar);
  if (av?.kind === "sprite") return { img: [av.url] };
  if (av?.kind === "procedural") return { spec: av.spec };
  if (typeof subject.sprite === "string" && subject.sprite) return { img: [subject.sprite] };
  if (subject.kind === "citizen" || subject.you) return {};
  const tries = [subject.slug, strict(subject.name), folded(subject.name)].filter(Boolean);
  return { repo: [...new Set(tries)] };   // from the sprite atlas when it holds them
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
    const tries = src.repo?.length ? src.repo.map(slug => () => loadRepoSprite(slug)) : (src.img || []).map(u => () => loadSprite(u));
    if (!tries.length) { draw(stand()); return; }
    (async () => {
      for (const load of tries) { const img = await load(); if (img) return draw(img); if (dead) return; }
      draw(stand());
    })();
    return () => { dead = true; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={SPRITE_W * scale} height={SPRITE_H * scale} className="hvi-photo-canvas"
    role="img" aria-label={label} style={{ width: SPRITE_W * scale, height: SPRITE_H * scale }} />;
}

// compact: a bare framed thumbnail for lists and tooltips.
// The full photo is the print stapled to the dossier: a plain line frame with its label
// inset, not a second box-drawn frame inside the file's own box (frames nest two deep at
// most). The caption wraps under the print instead of running out of it.
export default function FilePhoto({ subject, scale = 3, compact = false, caption }) {
  const cap = caption || photoCaption(subject);
  const label = `File photo: ${subject?.name || cap}`;
  if (compact) return <span className="hvi-photo-thumb"><PhotoCanvas subject={subject} scale={scale} label={label} /></span>;
  return (
    <figure className="hvi-photo" style={{ "--photo-w": `${SPRITE_W * scale}px` }}>
      <span className="hvi-photo-ttl" aria-hidden="true">PHOTO</span>
      <div className="hvi-photo-body"><PhotoCanvas subject={subject} scale={scale} label={label} /></div>
      <figcaption className="hvi-photo-cap">{cap}</figcaption>
    </figure>
  );
}

export const FILE_PHOTO_CSS = `
  .hvi-photo { flex: none; position: relative; margin: var(--s2) 0 0; width: calc(var(--photo-w) + 2 * var(--s2) + 2px); max-width: 100%;
    border: var(--bw) solid var(--line); padding: var(--s3) var(--s2) var(--s1); box-sizing: border-box; }
  .hvi-photo-ttl { position: absolute; top: calc(-0.5em - 1px); left: var(--s2); padding: 0 var(--s1); background: var(--bg);
    font-size: var(--t-xs); line-height: 1; letter-spacing: 0.1em; color: var(--fg-mute); }
  .hvi-photo-body { display: flex; justify-content: center; background: rgba(0,0,0,0.25); }
  .hvi-photo-canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
  .hvi-photo-cap { font-size: var(--t-xs); line-height: var(--lh-tight); color: var(--fg-mute); text-align: center; margin-top: var(--s1);
    overflow-wrap: anywhere; text-wrap: balance; }
  .hvi-photo-thumb { display: inline-flex; flex: none; border: var(--bw) solid var(--line); background: rgba(0,0,0,0.25); padding: 1px; vertical-align: middle; }
  .hvi-file-head { display: flex; gap: var(--s4); align-items: flex-start; }
  .hvi-file-head > .hvi-file-text { flex: 1; min-width: 0; }
  .hvi-row-btn { align-items: center; }
  .hvi-row-btn .hvi-photo-thumb { margin: 1px 0; }
  .hvi-photo-update { margin-top: var(--s2); }
  @media (max-width: 480px) { .hvi-file-head { gap: var(--s3); } }
`;
