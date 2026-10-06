// FilePhoto's frame and thumb styles, injected once by App.jsx. Kept apart from FilePhoto.jsx
// so the entry bundle carries the CSS but not the sprite painter (sprites.js, avatar.js).
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
