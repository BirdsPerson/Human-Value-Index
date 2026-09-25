#!/opt/homebrew/bin/python3
"""Pass 1 of the avatar design system: three proportion specs, one 4x4 grid each, same 16 subjects.

    python3 docs/avatar-variants/variants.py gen      # 3 grids (~12 Higgsfield credits), cached
    python3 docs/avatar-variants/variants.py process  # slice + post-process each spec -> docs/avatar-variants/<spec>/<slug>.png
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts")); sys.path.insert(0, str(ROOT / "scripts/roster"))
import sprites as S  # noqa: E402
import grid as G     # noqa: E402

OUT = ROOT / "docs/avatar-variants"
CACHE = S.CACHE / "variants"
SUBJECTS = ["albert-einstein", "marie-curie", "harriet-tubman", "jfk", "elon-musk", "genghis-khan", "dolly-parton",
            "taylor-swift", "mother-teresa", "socrates", "michael-jackson", "martin-luther-king-jr", "keanu-reeves",
            "pel", "queen-elizabeth-ii", "kobe-bryant"]
EXTRA_LOOKS = {"dolly-parton": "tall platinum-blonde big-hair wig, hourglass silhouette in a rhinestone-studded pastel pink outfit, oversized acoustic guitar slung across the body"}

COMMON = ("standing, front three-quarter view facing slightly left, arms relaxed, feet together on one baseline, "
          "the signature prop held close to the body and never wider than the shoulders plus one hand, "
          "chunky visible pixels as if drawn on a 32x48 pixel grid, 1-pixel dark outline, no anti-aliasing, no dithering, "
          "entire body visible head to feet. All sixteen share one consistent art style and exactly the same height.")
SPECS = {
    "A-classic": dict(label="A · classic 16-bit", colours=16, style=(
        "Every character: full-body 16-bit pixel art video game sprite, compact proportions: head about one third of "
        "total height (about 3 heads tall), limited 16-colour palette, flat cel shading with light from the top-left, "
        + COMMON)),
    "B-slim": dict(label="B · slim", colours=14, style=(
        "Every character: full-body 16-bit pixel art video game sprite, slim natural proportions: head about one "
        "quarter of total height (about 4 heads tall), slender limbs, narrow shoulders, limited 14-colour palette, "
        "flat cel shading with light from the top-left, " + COMMON)),
    "C-minimal": dict(label="C · minimal", colours=10, style=(
        "Every character: full-body minimalist pixel art sprite, slim proportions: head about one quarter of total "
        "height (about 4 heads tall), simple blocky shapes, very limited 10-colour palette, flat two-tone shading "
        "with no highlights and no small details, only the silhouette, hair, signature outfit colours and one "
        "simple prop, " + COMMON)),
}
TARGET_H = S.H - 3      # every figure is exactly this tall: uniform height is rule #1
MAX_W = S.W - 2


def looks():
    L = dict(S.LOOKS); L.update(EXTRA_LOOKS)
    return [L[s] for s in SUBJECTS]


def gen():
    CACHE.mkdir(parents=True, exist_ok=True)
    for key, spec in SPECS.items():
        dest = CACHE / f"{key}.png"
        if dest.exists():
            print("cached", key); continue
        G.STYLE = spec["style"]
        print("gen", key, flush=True)
        G.generate_grid(looks(), dest)
        print("ok", key, flush=True)


def fit_height(idx, ink, accents):
    """Scale by HEIGHT so every body is the same size; a wide prop is clipped by the width budget, never shrinks the body."""
    h, w = idx.shape
    s = TARGET_H / h
    tw = max(1, round(w * s))
    small = S.mode_downsample(idx, ink, tw, TARGET_H, accents=accents)
    if tw > MAX_W:   # prop over budget: trim equally from both sides
        cut = tw - MAX_W; small = small[:, cut // 2: cut // 2 + MAX_W]
    return small


def process_cell(img, colours):
    a = S.crop(S.key_out(img))
    idx, pal = S.palette_indices(a)
    small, pal = S.reduce_palette(fit_height(idx, S.ink_mask(a), S.accent_classes(idx, pal)), pal, n=colours - 1)
    f1 = S.place(small)
    f2 = S.walk_frame(f1)
    return Image.fromarray(np.concatenate([S.render(f1, pal), S.render(f2, pal)], axis=1), "RGBA")


def process():
    for key, spec in SPECS.items():
        src = CACHE / f"{key}.png"
        if not src.exists():
            print("missing grid", key); continue
        img = Image.open(src).convert("RGB")
        boxes, mask = G.slice_grid(img)
        d = OUT / key; d.mkdir(parents=True, exist_ok=True)
        bad = []
        for slug, box in zip(SUBJECTS, boxes):
            why = G.validate_cell(mask, box)
            if why: bad.append((slug, why))
            try:
                process_cell(img.crop(box), spec["colours"]).save(d / f"{slug}.png")
            except Exception as e:
                bad.append((slug, str(e)))
        print(key, "bad:", bad)


if __name__ == "__main__":
    {"gen": gen, "process": process}[sys.argv[1]]()
