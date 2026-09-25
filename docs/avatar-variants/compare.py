#!/opt/homebrew/bin/python3
"""Comparison sheet: rows = CURRENT, A, B, C; each subject at 3x, plus a 1x strip per row."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util as u
sp = u.spec_from_file_location("V", Path(__file__).parent / "variants.py"); V = u.module_from_spec(sp); sp.loader.exec_module(V)

def current(slug):
    for p in [ROOT / "public/sprites" / f"{slug}.png", Path.home() / ".cache/hvi-avatar-audit/blobs" / f"{slug}.png"]:
        if p.exists(): return Image.open(p).convert("RGBA")
    return None

ROWS = [("CURRENT", current)] + [(spec["label"], (lambda k: lambda s: (Image.open(V.OUT / k / f"{s}.png").convert("RGBA") if (V.OUT / k / f"{s}.png").exists() else None))(k)) for k, spec in V.SPECS.items()]
S = 3; CW, CH = 34 * S, 50 * S; LABEL = 150
n = len(V.SUBJECTS)
strip_h = 60
W = LABEL + n * CW; H = len(ROWS) * (CH + strip_h + 10) + 30
sheet = Image.new("RGBA", (W, H), (236, 232, 224, 255)); d = ImageDraw.Draw(sheet)
for i, s in enumerate(V.SUBJECTS): d.text((LABEL + i * CW + 4, 8), s[:14], fill=(60, 60, 60, 255))
y = 30
for label, get in ROWS:
    d.text((6, y + CH // 2), label, fill=(20, 20, 20, 255))
    cols = []
    for i, s in enumerate(V.SUBJECTS):
        im = get(s)
        if im is None: d.text((LABEL + i * CW + 20, y + CH // 2), "n/a", fill=(150, 0, 0, 255)); continue
        fr = im.crop((0, 0, 32, 48))
        a = np.asarray(fr); cols.append(len({tuple(p[:3]) for p in a[a[..., 3] > 0]}))
        sheet.alpha_composite(fr.resize((32 * S, 48 * S), Image.NEAREST), (LABEL + i * CW + S, y))
        sheet.alpha_composite(fr, (LABEL + i * 36 + 4, y + CH + 8))   # 1x pen scale strip
    d.text((6, y + CH + 20), f"1x · colours ~{int(np.median(cols)) if cols else 0}", fill=(60, 60, 60, 255))
    y += CH + strip_h + 10
sheet.save(V.OUT / "compare.png"); print("wrote", V.OUT / "compare.png", sheet.size)
