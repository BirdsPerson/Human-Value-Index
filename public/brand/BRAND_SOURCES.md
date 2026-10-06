# Brand marks in the city

Scott's own brands, drawn from their real artwork, never from memory. `scripts/brand_atlas.py`
reads the sources below (read-only, on Scott's Mac) and writes `atlas.png` and `atlas.json` here.
Both are committed, so the Netlify build never needs the source repos. `scripts/check-brand.mjs`
holds this file to the atlas: every source path and every mark must be listed here.

Rebuild after a mark changes: `python3 scripts/brand_atlas.py` (add `--preview /tmp/p.png` for
a 4x proof sheet).

## Sources

| Mark(s) | Source file | What it is |
|---|---|---|
| `eb-logo`, `eb-bolt` | `~/projects/ebtv/tv/web/site/assets/eb-logo-bolt.jpg` | The Electric Basement neon sign: the chevron box, the bolt, the battery dashes, ELECTRIC / BASEMENT. Also the EBTV web player's channel bug. Colours from the player's `eb.css`: amber `#ffaa2d`, cyan `#2bc6de`, red `#f4463f`. `eb-bolt` is the emblem alone (the top of the same file). |
| `ebshop`, `ebshop-cart` | `~/projects/eb-command-center/assets/ebshop_watermark.png` | The EB Shop logo, white "Shop" for dark grounds. The same mark as the live storefront header (shop.electricbasement.tv serves `EBShop_Logo_Transparent_00e403a6…png`, also in `~/projects/ebshop/assets/brand/`). Teal `#51edda`. |
| `jetsam` | `~/projects/JETSAM!/store-assets/jettison-cards/brand-cabinet.py` | JETSAM!'s own logotype, rendered by its own `logotype()` function: Anton, sheared, white `#eef1f6` face over the cyan `#2dbebe` offset Scott signed off. The same code that brands the real cabinet art. |
| `jetsam-j` | `~/projects/JETSAM!/public/icon-512-v2.png` | The game's app icon, "J!". |
| `irenes`, `irenes-arch` | `~/projects/irenes-specials/Irene's Specials/large specials 9-5-12.ai` | Goodnight Irene's Brew Pub lockup from the pub's own specials sheet (an `.ai` that is really a PDF; rendered at 300 dpi with `pdftoppm`): the brick oven arch, the flame, "Goodnight" in olive, IRENE'S in black with its olive shadow, BREW PUB. Brick `#8c1622`, olive `#a3a028`, ink `#231f20` (the same tokens as `irenes-specials/site/style.css`). `irenes-arch` is the arch and flame alone. |
| `iridescent` | `~/projects/iridescent-site/mark.svg` | The studio's four rounded squares, each a two-stop gradient of its tokens (`#4CC9F0`, `#8B73E7`, `#F26CCB`, `#FFCA6C`, `#06D6A0`). Rebuilt square by square at pixel size. |
| `beacon`, `beacon-mark` | `~/collective-services/beacon/beacon_logo.png` | Beacon's app icon: the lighthouse on its wave, on violet, with the wordmark. `beacon-mark` is the lighthouse alone. |
| `brainforest` | `~/projects/brainforest-analytica/public/assets/brand/BA_logo_border.png` | Brainforest's funnel mark (the solid-stroke file; canon in `~/projects/brainforestanalytica/BRAND.md`), in the dark-ground pale blue `#a0c6ff`. |
| `anamnesis` | `~/projects/anamnesis/apple-touch-icon.png` | ANAMNESIS's phosphor "A". |

**Not found locally:** Sam's Pizza (Sam's Pizza Palace, Wildwood, is a real business that is not
Scott's; no logo file anywhere in `~/projects`, so its signs stay lettered). EBSN has no separate
logo: its on-screen ID is the EB mark beside the letters EBSN (`eb-command-center/edit/SHOWRUNNER.md`),
and that is how the city draws it. The Union Lounge has no mark.

## How the sprites are made

Each mark is classified pixel by pixel against its own brand colours, then downsampled by
coverage vote: an output pixel takes the colour that covers most of its cell, or stays clear.
No blended colours, crisp silhouettes. Thin neon strokes are thickened first so they survive as
1px lines; the 8px EB emblem is drawn by hand (the vote cannot carry it). Neon variants
(`<mark>-neon-<size>`) bake a two-step halo in each pixel's own colour, 2px each side, so a lit
sign glows without a per-frame blur and never strobes.

Sizes are 1x sprites at a few heights per mark (`atlas.json` lists them: key `<mark>-<height>`).
A draw always uses one of them at a whole-number scale.

## Using them (shops, wardrobe, clothing prints)

```js
import { drawBrand, brandReady, pickBrand } from "../city/brand.js";

// a print on a tee, 6 px tall, centred on the chest; null until the atlas has loaded
drawBrand(ctx, "ebshop-cart", chestX, chestY, 6);
// a lit sign: the neon variant
drawBrand(ctx, "eb-logo", x, y, 32, { neon: true, align: "left", valign: "top" });
```

`drawBrand(c, mark, x, y, px, {neon, align, valign, alpha, max})` picks the sprite whose
whole-number multiple best fills `px` of height and returns `{x, y, w, h}` drawn, or `null`
(not loaded yet, or `px` smaller than the smallest sprite: draw your own fallback). The atlas
loads once, on the first call, from `/brand/atlas.json`.

Suggested marks for the house-brand clothing: EB Shop tee `ebshop` or `ebshop-cart`; EBTV crew
jacket `eb-logo` (back) and `eb-bolt` (chest); JETSAM! hoodie `jetsam` or `jetsam-j`; Irene's
staff shirt `irenes-arch` (chest) or `irenes` (back). Sam's Pizza cap: no mark exists, letter it.
