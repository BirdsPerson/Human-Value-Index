#!/opt/homebrew/bin/python3
"""Sixteen sprites from one Higgsfield image: the roster engine's cheap sprite path.

    python3 scripts/roster/grid.py cohort.json out.json   # [{slug, look}] x <=16 -> results

One nano_banana_pro generation draws a 4x4 grid of chibi figures from their LOOKS only.
Names never go in the prompt: the public-figure filter blocks on names, and one blocked
name would sink all sixteen. The grid is sliced along its gutters (found from the magenta
background, not assumed), and each cell is written to the sprite cache
(~/.cache/hvi-sprites/<slug>.png) exactly where scripts/referral_sprites.py looks for a
paid raw: that job then processes and uploads it for free. A cell that fails validation
is deleted from the cache so the same job regenerates that one figure on its own.
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sprites as S  # noqa: E402

COLS, ROWS = 4, 4
GRID_DIR = S.CACHE / "grids"

STYLE = (
    "Every character: full-body 16-bit pixel art video game sprite, cute chibi proportions (big head about 40% of "
    "total height, about 2.5 heads tall), standing, front three-quarter view facing slightly left, the signature prop "
    "drawn oversized so it reads at tiny size, chunky visible pixels as if drawn on a 32x48 pixel grid, limited "
    "16-colour palette, flat cel shading with light from the top-left, 1-pixel dark outline, no anti-aliasing, no "
    "dithering, entire body visible head to feet. All sixteen share one consistent art style and the same scale."
)


def grid_prompt(looks):
    cells = []
    for i, look in enumerate(looks):
        r, c = divmod(i, COLS)
        cells.append(f"Row {r + 1}, column {c + 1}: {look}.")
    return (
        f"A sprite sheet: a 4 by 4 grid of sixteen different characters, one character per cell, evenly spaced in "
        f"four rows and four columns with wide empty gaps between them so no two characters touch or overlap. "
        + " ".join(cells) + " " + STYLE +
        " The whole image background is one perfectly flat solid pure magenta (#FF00FF) with no grid lines, no "
        "borders, no frames, no labels, no numbers, no text, no shadows and no ground."
    )


def generate_grid(looks, dest):
    cmd = ["higgsfield", "generate", "create", S.MODEL, "--prompt", grid_prompt(looks),
           "--resolution", "4k", "--aspect_ratio", "2:3", "--wait", "--json"]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=1500)
    if res.returncode != 0:
        raise RuntimeError(f"higgsfield failed: {(res.stderr or res.stdout).strip()[:300]}")
    job = json.loads(res.stdout)
    job = job[0] if isinstance(job, list) else job
    if job.get("status") != "completed" or not job.get("result_url"):
        raise RuntimeError(f"higgsfield job not completed: {job.get('status')}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(job["result_url"], dest)
    return job.get("id")


def figure_mask(rgb):
    """True where a pixel is not the magenta background (same tolerance family as key_out)."""
    a = rgb.astype(int)
    d = np.sqrt(((a - np.array(S.KEY)) ** 2).sum(-1))
    return d > 110


def gutters(profile, n):
    """n-1 cut positions: the emptiest line inside a window around each expected boundary."""
    size = len(profile)
    cuts = []
    for k in range(1, n):
        centre = size * k // n
        lo, hi = max(1, centre - size // (3 * n)), min(size - 1, centre + size // (3 * n))
        window = profile[lo:hi]
        # Several equally empty lines: take the middle of that run.
        best = window.min()
        idx = np.nonzero(window <= best)[0]
        cuts.append(lo + int(idx[len(idx) // 2]))
    return [0, *cuts, size]


def slice_grid(img):
    """PIL image -> list of 16 cell boxes (x0, y0, x1, y1) in row-major order."""
    rgb = np.asarray(img.convert("RGB"))
    mask = figure_mask(rgb)
    xs = gutters(mask.sum(0), COLS)
    ys = gutters(mask.sum(1), ROWS)
    return [(xs[c], ys[r], xs[c + 1], ys[r + 1]) for r in range(ROWS) for c in range(COLS)], mask


def validate_cell(mask, box):
    """Why a cell is unusable, or None. A figure must be present and must not be cut by the
    cell edge (a gutter that ran through a figure means two figures overlapped)."""
    x0, y0, x1, y1 = box
    m = mask[y0:y1, x0:x1]
    if m.size == 0:
        return "empty cell"
    frac = m.mean()
    if frac < 0.01:
        return f"no figure ({frac:.3f})"
    edge = max(m[:, :2].mean(), m[:, -2:].mean(), m[:2, :].mean(), m[-2:, :].mean())
    if edge > 0.08:
        return f"figure cut by the cell edge ({edge:.2f})"
    # Two figures in one cell (the model drifted off the grid): the columns holding figure
    # pixels split into separate runs with a wide empty gap between them.
    cols = m.any(0)
    runs, gap, in_run = 0, 0, False
    for v in cols:
        if v:
            if not in_run and (runs == 0 or gap >= 0.10 * len(cols)):
                runs += 1
            in_run, gap = True, 0
        else:
            in_run, gap = False, gap + 1
    if runs > 1:
        return f"{runs} figures in one cell"
    return None


def main(cohort_path, out_path):
    cohort = json.loads(Path(cohort_path).read_text())
    if not 1 <= len(cohort) <= COLS * ROWS:
        raise SystemExit("cohort must have 1..16 entries")
    looks = [c["look"] for c in cohort]
    # A short cohort still fills the sheet: repeats of the last look pad the grid and are dropped.
    while len(looks) < COLS * ROWS:
        looks.append(looks[-1])
    tag = Path(out_path).stem
    sheet_path = GRID_DIR / f"{tag}.png"
    job_id = None
    if not sheet_path.exists():
        job_id = generate_grid(looks, sheet_path)
    img = Image.open(sheet_path)
    boxes, mask = slice_grid(img)
    results = []
    for c, box in zip(cohort, boxes):
        raw = S.CACHE / f"{c['slug']}.png"
        reason = validate_cell(mask, box)
        if reason is None:
            pad = 12
            x0, y0, x1, y1 = box
            crop = img.convert("RGB").crop((max(0, x0 - 0), max(0, y0 - 0), x1, y1))
            framed = Image.new("RGB", (crop.width + 2 * pad, crop.height + 2 * pad), S.KEY)
            framed.paste(crop, (pad, pad))
            raw.parent.mkdir(parents=True, exist_ok=True)
            framed.save(raw)
            try:
                S.process(raw)          # the same processing the upload job will run
            except Exception as e:     # noqa: BLE001
                reason = f"process failed: {e}"
                raw.unlink(missing_ok=True)
        results.append({"slug": c["slug"], "ok": reason is None, "reason": reason, "box": list(box)})
    Path(out_path).write_text(json.dumps({"sheet": str(sheet_path), "job": job_id, "cells": results}, indent=1))
    ok = sum(r["ok"] for r in results)
    print(f"grid {tag}: {ok}/{len(results)} cells usable ({sheet_path})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
