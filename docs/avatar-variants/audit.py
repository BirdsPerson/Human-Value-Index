#!/opt/homebrew/bin/python3
"""Measure every sprite sheet: proportions, colours, fill. Frame 0 of each 64x48 sheet."""
import glob, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = [ROOT / "public/sprites", Path.home() / ".cache/hvi-avatar-audit/blobs"]
OUT = ROOT / "docs/avatar-variants"

def measure(path):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :32]                      # frame 0
    alpha = a[..., 3] > 0
    ys, xs = np.nonzero(alpha)
    if not len(ys): return None
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    h = bot - top + 1
    widths = alpha[top:bot + 1].sum(1)
    # neck = narrowest row between 15% and 55% of height, after the head's widest row
    lo, hi = int(h * .15), int(h * .55)
    head_widest = int(np.argmax(widths[: max(hi, 1)]))
    start = max(lo, head_widest)
    seg = widths[start:hi] if hi > start else widths[lo:hi]
    neck = start + int(np.argmin(seg)) if len(seg) else int(h * .35)
    cols = {tuple(p) for p in a[alpha][:, :3]}
    core = float(np.median(widths))
    return dict(slug=path.stem, height=int(h), width=int(right - left + 1), head_px=int(neck),
                head_ratio=round(neck / h, 3), colours=len(cols), fill=round((right - left + 1) / 32, 2),
                prop_overhang=round((right - left + 1) / max(core, 1), 2))

rows = []
for d in SRC:
    for f in sorted(glob.glob(str(d / "*.png"))):
        if Path(f).stem.startswith("_"): continue
        m = measure(Path(f))
        if m: m["source"] = "repo" if "public" in str(d) else "blobs"; rows.append(m)
rows.sort(key=lambda r: r["head_ratio"])
(OUT / "audit.json").write_text(json.dumps(rows, indent=1))
hr = np.array([r["head_ratio"] for r in rows]); hh = np.array([r["height"] for r in rows]); cc = np.array([r["colours"] for r in rows])
print(f"n={len(rows)} head_ratio min {hr.min():.2f} median {np.median(hr):.2f} max {hr.max():.2f} | height {hh.min()}-{hh.max()} | colours {cc.min()}-{cc.max()} median {np.median(cc):.0f}")
# contact sheet sorted by head ratio, 3x, with a ratio bar
S, per = 3, 16
n = len(rows); rws = (n + per - 1) // per
sheet = Image.new("RGBA", (per * 34 * S, rws * 56 * S), (236, 232, 224, 255))
from PIL import ImageDraw
dr = ImageDraw.Draw(sheet)
for i, r in enumerate(rows):
    src = next(d / f"{r['slug']}.png" for d in SRC if (d / f"{r['slug']}.png").exists())
    fr = Image.open(src).convert("RGBA").crop((0, 0, 32, 48)).resize((32 * S, 48 * S), Image.NEAREST)
    x, y = (i % per) * 34 * S, (i // per) * 56 * S
    sheet.alpha_composite(fr, (x + S, y))
    dr.text((x + 2, y + 48 * S + 2), f"{r['head_ratio']:.2f}", fill=(40, 40, 40, 255))
sheet.save(OUT / "audit-contact.png")
print("wrote", OUT / "audit-contact.png")
