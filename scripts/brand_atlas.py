#!/usr/bin/env python3
"""Scott's real brand marks, pixel-adapted for the city: public/brand/atlas.{png,json}.

Every mark starts from the real artwork in Scott's own projects (paths in SOURCES and
public/brand/BRAND_SOURCES.md), never a redraw from memory. Each one is downsampled by
coverage vote: every output pixel takes the brand colour that covers most of its cell in
the source, or stays clear if too little does. That keeps colours pure (no muddy blends)
and silhouettes crisp at 1x; thin neon strokes are thickened first so they survive as 1px
lines, and the one size the vote cannot carry (the 8px EB emblem) is drawn by hand. Neon variants bake a two-step halo in the same colour, so a
lit sign glows without any per-frame blur (and never strobes: the glow is in the pixels).

    python3 scripts/brand_atlas.py            rebuild (needs the source repos on this Mac)
    python3 scripts/brand_atlas.py --preview  also write an 8x preview sheet to /tmp

The atlas is committed, so Netlify never needs the sources. Rebuild when a mark changes.
"""
import hashlib
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HOME = os.path.expanduser("~")
P = lambda *a: os.path.join(HOME, "projects", *a)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "brand")

SOURCES = {
    "eb": P("ebtv", "tv", "web", "site", "assets", "eb-logo-bolt.jpg"),
    "ebshop": P("eb-command-center", "assets", "ebshop_watermark.png"),
    "jetsam": P("JETSAM!", "store-assets", "jettison-cards", "brand-cabinet.py"),
    "jetsam-icon": P("JETSAM!", "public", "icon-512-v2.png"),
    "irenes": P("irenes-specials", "Irene's Specials", "large specials 9-5-12.ai"),
    "iridescent": P("iridescent-site", "mark.svg"),
    "beacon": os.path.join(HOME, "collective-services", "beacon", "beacon_logo.png"),
    "brainforest": P("brainforest-analytica", "public", "assets", "brand", "BA_logo_border.png"),
    "anamnesis": P("anamnesis", "apple-touch-icon.png"),
}

# Brand colours, sampled from the artwork (and matching each project's own tokens).
EB = {"amber": (255, 170, 45), "cyan": (43, 198, 222), "red": (244, 70, 63)}         # ebtv eb.css
EBSHOP = {"teal": (81, 237, 220), "white": (232, 236, 236)}
JETSAM = {"white": (238, 241, 246), "accent": (45, 190, 190)}                        # brand-cabinet.py
IRENE = {"brick": (140, 22, 34), "olive": (163, 160, 40), "ink": (35, 31, 32)}        # irenes site tokens
IRID = {"games": (76, 201, 240), "violet": (139, 115, 231), "media": (242, 108, 203),
        "studio": (255, 202, 108), "mint": (6, 214, 160)}                             # iridescent tokens
BEACON = {"bg": (61, 43, 150), "white": (246, 246, 252), "blue": (46, 120, 230), "violet": (120, 70, 220)}
BRAIN = {"pale": (160, 198, 255)}                                                    # BRAND.md --brand-pale
ANAM = {"green": (150, 240, 170)}


def classify(rgb, mask, pal, maxd=90.0):
    """Per source pixel: index of the nearest brand colour, or -1 (not ink)."""
    cols = np.array(list(pal.values()), dtype=np.float32)
    d = np.linalg.norm(rgb[..., None, :].astype(np.float32) - cols[None, None], axis=-1)
    k = d.argmin(-1)
    k[(d.min(-1) > maxd) | ~mask] = -1
    return k


def crop_ink(k):
    ys, xs = np.where(k >= 0)
    return k[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def thicken(k, r):
    """Grow every class by r source px into clear pixels, so a thin neon line survives a
    small size as a 1px line instead of vanishing under the vote threshold."""
    if r < 1:
        return k
    out = k.copy()
    for c in range(int(k.max()) + 1):
        m = Image.fromarray(((k == c) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))
        grow = (np.asarray(m) > 0) & (out < 0)
        out[grow] = c
    return out


def vote(k, h, pal, thr=0.28, w=None, weight=None, grow=0.0):
    """Coverage-vote downsample of a class map to height h (width keeps the aspect).
    weight: per-class multipliers (the letter ink beats its own drop shadow);
    grow: thicken lines by this fraction of an output cell first."""
    H, W = k.shape
    if w is None:
        w = max(1, round(W * h / H))
    k = thicken(k, int(H / h * grow))
    n = len(pal)
    wt = np.array(weight or [1.0] * n)
    cols = list(pal.values())
    out = np.zeros((h, w, 4), np.uint8)
    ys = np.linspace(0, H, h + 1)
    xs = np.linspace(0, W, w + 1)
    for j in range(h):
        y0, y1 = int(ys[j]), max(int(ys[j]) + 1, int(ys[j + 1]))
        for i in range(w):
            x0, x1 = int(xs[i]), max(int(xs[i]) + 1, int(xs[i + 1]))
            cell = k[y0:y1, x0:x1]
            cnt = np.bincount(cell[cell >= 0].ravel(), minlength=n)
            if cnt.sum() / cell.size >= thr:
                out[j, i] = (*cols[int((cnt * wt).argmax())], 255)
    return out


def quantize(img, h, pal, w=None, alpha_thr=110):
    """Box-downsample an RGBA picture (backgrounds included) and snap to the palette."""
    if w is None:
        w = max(1, round(img.width * h / img.height))
    small = np.asarray(img.convert("RGBA").resize((w, h), Image.BOX), dtype=np.float32)
    cols = np.array(list(pal.values()), dtype=np.float32)
    d = np.linalg.norm(small[..., None, :3] - cols[None, None], axis=-1)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = cols[d.argmin(-1)].astype(np.uint8)
    out[..., 3] = np.where(small[..., 3] >= alpha_thr, 255, 0)
    return out


def neon(px, pad=2):
    """Bake a stepped halo in each ink pixel's own colour: 1px at 45%, 2px at 18%."""
    h, w = px.shape[:2]
    out = np.zeros((h + pad * 2, w + pad * 2, 4), np.uint8)
    ink = px[..., 3] > 0
    for r, a in ((2, 46), (1, 115)):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r or (r == 2 and abs(dx) + abs(dy) > 3):
                    continue
                sl = out[pad + dy:pad + dy + h, pad + dx:pad + dx + w]
                m = ink & (sl[..., 3] < a)
                sl[m, :3] = px[m, :3]
                sl[m, 3] = a
    out[pad:pad + h, pad:pad + w][ink] = px[ink]
    return out


# ---- sources -> class maps ----------------------------------------------------------------
def eb_maps():
    rgb = np.asarray(Image.open(SOURCES["eb"]).convert("RGB"))
    bright = rgb.max(-1) > 150
    k = classify(rgb, bright, EB, maxd=110)
    full = crop_ink(k)
    emblem = crop_ink(k[:400])            # the box, the bolt and the battery dashes
    return full, emblem


def ebshop_maps():
    im = np.asarray(Image.open(SOURCES["ebshop"]).convert("RGBA"))
    k = classify(im[..., :3], im[..., 3] > 128, EBSHOP, maxd=120)
    k = crop_ink(k)
    # the cart is everything left of the first wide clear column gap
    cols = (k >= 0).any(0)
    gap = next(x for x in range(40, len(cols)) if not cols[x:x + 12].any())
    return k, crop_ink(k[:, :gap])


def jetsam_map():
    spec = importlib.util.spec_from_file_location("brand_cabinet", SOURCES["jetsam"])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    im = np.asarray(mod.logotype(220))     # the game's own logotype, Anton sheared, cyan offset
    return crop_ink(classify(im[..., :3], im[..., 3] > 128, JETSAM, maxd=120))


def irene_maps():
    import subprocess, tempfile
    tmp = tempfile.mkdtemp()
    subprocess.run(["pdftoppm", "-r", "300", "-png", "-singlefile", SOURCES["irenes"], os.path.join(tmp, "p")], check=True)
    page = Image.open(os.path.join(tmp, "p.png")).convert("RGB")
    k300 = 300 / 40
    box = tuple(int(v * k300) for v in (72, 38, 250, 122))     # the lockup on the specials sheet
    rgb = np.asarray(page.crop(box))
    dark = rgb.min(-1) < 200                                   # drop the pale brick-wall backdrop
    k = crop_ink(classify(rgb, dark, IRENE, maxd=80))
    H, W = k.shape
    arch = crop_ink(k[: int(H * 0.56), int(W * 0.49):int(W * 0.8)])        # oven arch + the flame
    return k, arch


def iridescent_img(s=400):
    """mark.svg's four rounded squares with its four gradients, rasterised at s px."""
    im = Image.new("RGBA", (s, s))
    u = s / 40
    stops = [("games", "violet", (0, 1, 1, 0)), ("violet", "media", (0, 0, 1, 1)),
             ("media", "studio", (1, 0, 0, 1)), ("studio", "mint", (1, 1, 0, 0))]
    boxes = [(1, 1), (22, 1), (22, 22), (1, 22)]
    for (bx, by), (a, b, (x1, y1, x2, y2)) in zip(boxes, stops):
        n = int(17 * u)
        yy, xx = np.mgrid[0:n, 0:n] / n
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / (dx * dx + dy * dy), 0, 1)[..., None]
        g = (np.array(IRID[a]) * (1 - t) + np.array(IRID[b]) * t).astype(np.uint8)
        tile = Image.fromarray(np.dstack([g, np.full((n, n), 255, np.uint8)]), "RGBA")
        m = Image.new("L", (n, n))
        ImageDraw.Draw(m).rounded_rectangle((0, 0, n - 1, n - 1), radius=int(3 * u), fill=255)
        im.paste(tile, (int(bx * u), int(by * u)), m)
    return im


def iridescent_sprite(h):
    """Four squares with a clear gutter, each a 2-stop gradient snapped to the tokens."""
    q = max(1, (h - 1) // 2)
    out = np.zeros((q * 2 + 1, q * 2 + 1, 4), np.uint8)
    pairs = [("games", "violet"), ("violet", "media"), ("media", "studio"), ("studio", "mint")]
    origins = [(0, 0), (q + 1, 0), (q + 1, q + 1), (0, q + 1)]
    for (ox, oy), (a, b) in zip(origins, pairs):
        for y in range(q):
            for x in range(q):
                corner = q >= 4 and (x in (0, q - 1)) and (y in (0, q - 1))
                if corner:
                    continue
                t = (x + y) / max(1, 2 * q - 2)
                out[oy + y, ox + x] = (*(IRID[a] if t < 0.5 else IRID[b]), 255)
    return out


def ba_map():
    im = np.asarray(Image.open(SOURCES["brainforest"]).convert("RGBA"))
    return crop_ink(np.where(im[..., 3] > 128, 0, -1))


def anam_map():
    rgb = np.asarray(Image.open(SOURCES["anamnesis"]).convert("RGB"))
    return crop_ink(np.where(rgb[..., 1] > 120, 0, -1))


def jetsam_icon_map():
    rgb = np.asarray(Image.open(SOURCES["jetsam-icon"]).convert("RGB"))
    k = classify(rgb, rgb.max(-1) > 90, JETSAM, maxd=70)
    return crop_ink(k[100:420, 140:400])


# ---- hand tuning --------------------------------------------------------------------------
# At 8px the vote turns the emblem into a blob. This one is drawn by hand off the 12px vote:
# the same chevron box (notched left, pointed right), the bolt crossing the midline, cyan
# battery dashes either side of its lower stroke. a amber, c cyan, . clear.
HAND = {
    "eb-bolt-8": [
        "aaaaaaaaa..",
        ".a..aa...a.",
        "..a.aa....a",
        "..aaaaaaaaa",
        "..a..aa..a.",
        ".acc.a.ca..",
        ".acca.cca..",
        "aaaaaaaa...",
    ],
}


def hand(rows, pal):
    out = np.zeros((len(rows), len(rows[0]), 4), np.uint8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                out[y, x] = (*pal[ch], 255)
    return out


# ---- the sprite list ----------------------------------------------------------------------
def build():
    S = {}
    eb_full, eb_emb = eb_maps()
    for h in (12, 16, 24, 32, 48, 64, 96):
        S[f"eb-logo-{h}"] = vote(eb_full, h, EB, thr=0.3, grow=0.2 if h <= 16 else 0.1)
    S["eb-bolt-8"] = hand(HAND["eb-bolt-8"], {"a": EB["amber"], "c": EB["cyan"]})
    for h in (12, 16, 24):
        S[f"eb-bolt-{h}"] = vote(eb_emb, h, EB, thr=0.3, grow=0.1 if h <= 12 else 0)

    shop, cart = ebshop_maps()
    for h in (6, 8, 12, 16, 24):
        S[f"ebshop-{h}"] = vote(shop, h, EBSHOP, thr=0.3)
    for h in (6, 8, 12, 16):
        S[f"ebshop-cart-{h}"] = vote(cart, h, EBSHOP, thr=0.3, grow=0.2)

    jet = jetsam_map()
    for h in (6, 7, 10, 14, 20, 28):
        S[f"jetsam-{h}"] = vote(jet, h, JETSAM, thr=0.34)
    jic = jetsam_icon_map()
    for h in (8, 12, 16):
        S[f"jetsam-j-{h}"] = vote(jic, h, JETSAM, thr=0.34)

    ire, arch = irene_maps()
    for h in (16, 24, 32, 48, 64):
        S[f"irenes-{h}"] = vote(ire, h, IRENE, thr=0.26, weight=[1.2, 0.55, 1.7])
    for h in (6, 8, 12, 16):
        S[f"irenes-arch-{h}"] = vote(arch, h, IRENE, thr=0.3, weight=[1.2, 0.55, 1.7], grow=0.15)

    for h in (5, 7, 9, 13):
        S[f"iridescent-{h}"] = iridescent_sprite(h)

    beacon = Image.open(SOURCES["beacon"]).convert("RGBA")
    for h in (16, 24, 32, 48):
        S[f"beacon-{h}"] = quantize(beacon, h, BEACON)
    mark = beacon.crop((110, 60, 316, 290))
    for h in (8, 12, 16):
        S[f"beacon-mark-{h}"] = quantize(mark, h, BEACON)

    ba = ba_map()
    for h in (6, 8, 12, 16, 24):
        S[f"brainforest-{h}"] = vote(ba, h, BRAIN, thr=0.3, grow=0.15 if h <= 8 else 0)

    an = anam_map()
    for h in (6, 8, 12):
        S[f"anamnesis-{h}"] = vote(an, h, ANAM, thr=0.4)

    # neon (night) variants for the lit signs
    for key in ("eb-logo-24", "eb-logo-32", "eb-logo-48", "eb-logo-64", "eb-logo-96", "eb-bolt-12", "eb-bolt-16", "eb-bolt-24",
                "ebshop-12", "ebshop-16", "ebshop-24", "jetsam-10", "jetsam-14", "jetsam-20", "jetsam-28",
                "irenes-arch-12", "irenes-arch-16"):
        S[key.rsplit("-", 1)[0] + "-neon-" + key.rsplit("-", 1)[1]] = neon(S[key])
    return S


def pack(S, width=384):
    keys = sorted(S, key=lambda k: (-S[k].shape[0], k))
    x = y = row = 0
    rects = {}
    for k in keys:
        h, w = S[k].shape[:2]
        if x + w > width:
            x, y, row = 0, y + row + 1, 0
        rects[k] = (x, y, w, h)
        x += w + 1
        row = max(row, h)
    H = y + row
    sheet = np.zeros((H, width, 4), np.uint8)
    for k, (x, y, w, h) in rects.items():
        sheet[y:y + h, x:x + w] = S[k]
    return sheet, rects


def main():
    S = build()
    sheet, rects = pack(S)
    os.makedirs(OUT, exist_ok=True)
    png = os.path.join(OUT, "atlas.png")
    Image.fromarray(sheet, "RGBA").save(png, optimize=True)
    v = hashlib.sha1(open(png, "rb").read()).hexdigest()[:10]
    sprites = {}
    for k, (x, y, w, h) in sorted(rects.items()):
        base, _, size = k.rpartition("-")
        neon_ = base.endswith("-neon")
        mark = base[:-5] if neon_ else base
        sprites[k] = {"x": x, "y": y, "w": w, "h": h, "mark": mark, "size": int(size), "neon": neon_, "pad": 2 if neon_ else 0}
    doc = {"v": v, "png": f"atlas.png?v={v}", "w": sheet.shape[1], "h": sheet.shape[0],
           "sources": {k: v_.replace(HOME, "~") for k, v_ in SOURCES.items()}, "sprites": sprites}
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump(doc, f, indent=1)
        f.write("\n")
    print(f"brand atlas: {len(sprites)} sprites, {sheet.shape[1]}x{sheet.shape[0]}, v={v}")
    if "--preview" in sys.argv:
        bg = Image.new("RGBA", (sheet.shape[1], sheet.shape[0]), (24, 22, 30, 255))
        bg.alpha_composite(Image.fromarray(sheet, "RGBA"))
        bg.resize((sheet.shape[1] * 4, sheet.shape[0] * 4), Image.NEAREST).save(sys.argv[-1] if sys.argv[-1].endswith(".png") else "/tmp/brand-preview.png")


if __name__ == "__main__":
    main()
