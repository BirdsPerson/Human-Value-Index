# HVI avatar design system

**Style C "minimal", as chosen by Scott on 2026-09-25, with two tweaks: props held in the hand and 12 colours.**

Every avatar follows these rules: public figures, engine figures, referrals, Scott's own
sprite, and the procedural citizen photos. The rules live in code in one place,
`scripts/sprite_spec.py`, which both generators (`scripts/sprites.py` for single figures,
`scripts/roster/grid.py` for sixteen per image) read. Change a rule there, not in a prompt.

## Canvas
- A sheet is 64×48: two 32×48 frames, stand and walk. The walk frame is derived: body up 1px, left leg up 1px, so no second generation.
- **The body is always exactly 45px tall,** head top to feet (`FIGURE_H`). Feet sit on row 46. Rows 1 and 47 are left for the outline and the walk bob.
- **Scale by height, never by bounding box.** Width is budgeted at 30px (`MAX_W`). A prop wider than that is trimmed evenly from both sides, and the body never shrinks to make room. The old fit-the-box rule is why a guitar made its owner 37px tall.

## Proportions
- Head about ¼ of the body, so about 4 heads tall. Slim, natural limbs, shoulders about 12px.
- Procedural citizens (`src/avatar.js`) use the same plan: head 11px, head top on row 4, feet on row 46. The tier-coloured stand-ins (`src/sprites.js`) match, and all of them are the same height.

## Pose
Front three-quarter view facing slightly left, arms relaxed, feet together on one baseline. One neutral stance for everyone. Personality comes from the outfit and the prop, not from the pose.

## Palette and shading
- **12 colours in total** (`COLOURS`): 11 fills plus one house outline ink, `#181020`.
- Flat two-tone shading: one shade step for skin and hair, and no highlights or small details.
- Signature accents (the glowing vial, the gold crown, the red jacket) are vivid and rare. The palette merge keeps them.

## Likeness budget
Silhouette, hair, signature outfit colours, and **one** prop. Nothing else.
- **The prop is held in one hand and touches the body.** Hold it vertically or close to the chest, never floating or detached, and never wider than the shoulders plus one hand.
- `normalize_look()` removes old size words ("oversized", "huge") from looks and appends "every prop held in one hand close to the body".
- Faces carry nothing at 32px. Don't spend detail there.

## Forbidden
- Backgrounds, backdrops, scenery, ground shadows, text, logos and names. Jersey numbers are allowed only when they are the identity.
- Weapons, crime props, prison clothing, blood and victims. `netlify/lib/look.js` enforces this on every generated look.
- Names in generation prompts. Prompts use looks only: the public-figure filter blocks names, and one blocked name would sink a whole grid.

## Enforcement
`scripts/sprites.py`:
- `process()` erases floating specks up to 24px (`drop_specks`), such as sparkles and stars.
- `validate_sheet()` rejects:
  - a body height outside 45–47px including the outline
  - more than 12 colours
  - a filled backdrop
  - a detached part over 4px

Grid cells that fail validation are redrawn one at a time. `python3 scripts/sprites.py --check-catalog` validates every sprite in `public/sprites`.

## Economy
- **Default: 16 per image through the 4×4 grid,** 4 credits a grid, about 0.25 credits a figure. Single generations only for failed cells, about 2 credits each.
- Every raw is cached, so re-processing under new numbers (height, palette) costs nothing. Only a change in *proportions* needs new generations.

## History
- **The audit (pass 1)** found 92 sprites at 37–47px tall, with chibi early figures (head about 40%) and slimmer later ones. Details are in `docs/avatar-variants/`: `audit.json`, `audit-contact.png`, `compare.png`.
- **Pass 2 (2026-09-25)** redrew the whole catalog in this style: `scripts/redraw_catalog.py`. The before/after contact sheet is `docs/avatar-variants/redraw-before-after.png`.
