# Holding Pen sprites

`scripts/sprites.py` turns a famous figure's name into a 32×48 two-frame walk
sheet (`public/sprites/<slug>.png`, 64×48) and an entry in
`public/sprites/manifest.json` (`{slug: {frames: 2, w: 32, h: 48}}`), as the SPEC requires.

Look at `docs/sprite-previews/_lineup.png` first. It shows every sprite at 3×, which is
roughly how big they are in the pen. `_walk.gif` animates the lineup, and
`<slug>.png` is each sheet at 8×.

## Verdict on the first three

The 32px sprites read because each person has a strong silhouette: hair, outfit,
colour and one prop. The face does very little at this size.

| Figure | Recognisable? | Why |
|---|---|---|
| Albert Einstein | **Yes, instantly.** | The white hair and mustache carry it, and the grey cardigan helps. This is the strongest of the three. His prop is weak: the "oversized chalk" came out looking like a rolled paper. |
| Socrates | **Yes, as "the Greek philosopher".** | The bald head, big grey beard, white toga and raised index finger (the pose from David's *Death of Socrates*) all survive at 32px. Without the name card, someone could guess Plato. In the pen, where the card names him, it lands. |
| Marie Curie | **Only with the name card.** | The dark Victorian dress, the bun and a glowing green flask read as "lady scientist, radioactive". Nobody would guess *Curie* cold, but she's unmistakable once you know who's in the pen. This one is the weakest. |

Overall the style reads as a set: same chibi proportions, the same ink outline
on every figure, top-left light and ≤16 colours each. Mii Plaza meets SNES. I'd
ship this for all 62. The weak cases will be people defined by their **face**
rather than their look: Sam Altman, Peter Thiel, Jason Kelce. Hand-write their
`LOOKS` line so it leans on clothing and a prop (a hoodie, a Chiefs/Eagles kit,
etc.).

## Recipe (exact)

**Model:** Higgsfield `nano_banana_pro`, `--resolution 1k --aspect_ratio 2:3`
(848×1264). Each generation costs 2 credits. I picked Nano Banana Pro because
it knows what real public figures look like and handles chibi pixel art well.
It already draws on a grid (about 65×97 art pixels), so the downscale stays
clean.

**Prompt template** (the `PROMPT` constant; `{look}` comes from the `LOOKS` dict, keyed by slug):

```
Full-body 16-bit pixel art video game sprite of {name}: {look}. Cute chibi
proportions (big head about 40% of total height, about 2.5 heads tall),
standing, front three-quarter view facing slightly left. The signature prop is
drawn oversized, about as big as the head, so it still reads at tiny size.
Chunky visible pixels as if drawn on a 32x48 pixel grid, limited 16-colour
palette, flat cel shading with light from the top-left, 1-pixel dark outline
around the whole figure, no anti-aliasing, no dithering. Single character
centered, entire body visible head to feet with margin, on a perfectly flat
solid pure magenta (#FF00FF) background, no shadow, no ground, no text.
```

Einstein and Curie use exactly this template. Socrates' raw came from the
round-2 template, which lacks the "oversized prop" sentence (his signature is a
pose, not a prop). Each raw's exact prompt and job id are saved next to it in
`~/.cache/hvi-sprites/<slug>.json`.

**How to write a `LOOKS` line:** list the silhouette first, then the colour,
then one prop or pose. Never describe the face. For example:
`"wild untamed white hair sticking out in all directions, bushy white mustache,
baggy grey wool cardigan sweater over a white shirt, brown baggy trousers,
holding a stick of white chalk"`. A name with no `LOOKS` entry falls back to
"their single most recognisable signature outfit and hairstyle, holding their
one most iconic signature prop". That works for the obvious cases, but write
real lines for the rest.

**Post-processing** (all in PIL + numpy, deterministic, no credits):

1. **Key out the background.** Sample the corner median, clear pixels within RGB
   distance 110 of it, and clear magenta spill (`min(r,b) − g > 80` and
   `|r − b| < 70`). Magenta is the key because the glowing props are green.
2. **Crop** to the opaque bounding box.
3. **Fine-quantize** the figure to 48 colours with the FASTOCTREE method.
   Median cut blended the dress greys into skin and hair and made mauve mud.
4. **Mode-downsample** to fit 30×45, keeping the aspect ratio. Each target
   cell is decided in this order:
   - a *vivid, rare* colour (saturation > 0.55, value > 0.55, < 4% of the
     figure) covering ≥ 22% of the cell wins it, so the signature prop
     survives;
   - otherwise, if ≥ 34% of the cell is the generator's own linework (every
     channel < 32), the cell becomes ink, so eyes and inner lines survive;
   - otherwise the most common colour wins;
   - a cell < 45% covered stays transparent.
5. **Reduce the palette** to 15 colours plus ink with a Ward-style greedy merge.
   Accent colours stay because they sit far from everything else. Near-black
   fills fold into ink.
6. **Place** the figure centred with its feet on row 46. This leaves 1px for the
   outline all round and 1px of headroom for the bob.
7. **Frame 2 (derived, no second generation):** everything above the hip line
   (72% of the height) moves up 1px, the hip row is duplicated so nothing
   tears, and the figure's left leg lifts 1px.
8. **Outline:** every transparent pixel next to the figure (4-neighbour) becomes
   the house ink colour `#181020`. Every figure uses the same ink, which is
   what makes the set cohesive.

## Usage

```sh
python3 scripts/sprites.py "Albert Einstein" "Marie Curie" Socrates
python3 scripts/sprites.py --all              # every name: in src/figures.js (or App.jsx)
python3 scripts/sprites.py --reprocess --all  # re-run steps 1-8 on cached raws, 0 credits
python3 scripts/sprites.py --force "Name"     # regenerate (2 credits)
python3 scripts/sprites.py --selftest         # offline asserts on a synthetic figure
```

- **Idempotent.** A name whose sheet already exists is skipped. When a raw is
  cached, `--reprocess` rebuilds the sheet without calling Higgsfield. One
  failed name doesn't stop the batch, and the exit code is 1 if any failed.
- **Raw cache:** `~/.cache/hvi-sprites/` (override with `HVI_SPRITE_CACHE`). It's
  outside the repo so 1MB raws don't ship. Keep it: every processing tweak
  reruns from it for free.
- **Slug:** `name.lower().replace(" ", "-")`, then strip `[^a-z0-9-]`. This is
  ASCII-only like the JS rule, so **"Pelé" → `pel`**. Pen.jsx must use the same
  regex. If it uses a Unicode-aware `\w`, the slugs won't match.
- **Full-roster cost:** 59 remaining × 2 = **~118 credits**, plus rerolls.

## Cost of this test

My 7 generations cost 14 credits, well inside the 60 budget:

- Round 1: all three, 6 credits
- Round 2: Curie and Socrates, 4 credits
- Round 3: Curie and Einstein, 4 credits

The account went from 1158.86 to 1138.86. The other 6 credits in that drop are
three Nano Banana Pro jobs at 07:21 from another agent working in parallel.

## Iteration log

- **Round 1** (green key, "3 heads tall"). Einstein was great. Curie's green
  vial got keyed out along with the background. Socrates' hemlock cup turned
  into a dark blob.
- **Round 2.** Switched the key to magenta. Gave Curie a glowing test tube and
  gave Socrates the raised finger instead of the cup, which fixed him: a pose
  beats a small prop. Added vivid-accent priority and ink preservation to the
  downsampler.
- **Round 3.** Added an "oversized prop" sentence to the template. Curie's
  flask now reads at 32px. Einstein's chalk grew into a scroll-like shape that
  reads worse than the round-1 version, but his face gained eyes and a nose.
  Processing fixes in this round: octree fine-quantize, a mean-colour merge,
  and ink-folding near-black fills.

## Known limits / next moves

- **Figure size varies.** Scaling is fit-to-bounding-box, so a raised arm
  (Socrates) or a big prop shrinks the body a little. If the pen shows it,
  normalise on head height instead.
- **Einstein's prop.** One more generation giving him a small blackboard with
  chalk scribbles would read better than the chalk stick.
- **Curie's cold recognisability** is limited by her real look, a plain dark
  dress. That's accepted. The card does the rest.
- **The walk is subtle** (1px bob plus a 1px lifted foot). Pen.jsx should add
  horizontal travel and flip the sprite for direction. The sprites all face
  front-3/4 left, so flipping horizontally gives the right-facing version.
