#!/opt/homebrew/bin/python3
"""One-off: redraw the whole sprite catalog in the house design system (scripts/sprite_spec.py).

    python3 scripts/redraw_catalog.py plan <prod-looks.json>   # write the work list
    python3 scripts/redraw_catalog.py grids                    # generate + slice (resumable, ~4 credits/grid)
    python3 scripts/redraw_catalog.py singles                  # redo cells that failed validation (~2 credits each)
    python3 scripts/redraw_catalog.py sheet                    # before/after contact sheet

Work lives in ~/.cache/hvi-sprites/redraw/: plan.json, grids, and new/<slug>.png sheets.
Nothing is published from here; publishing is a separate, deliberate step.
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts")); sys.path.insert(0, str(ROOT / "scripts/roster"))
import sprites as S  # noqa: E402
import grid as G     # noqa: E402
SPEC = S.SPEC

WORK = S.CACHE / "redraw"
NEW = WORK / "new"
PLAN = WORK / "plan.json"
# Pass 1's style-C sheet already holds these in the house style: reprocess for free.
VARIANT_SHEET = S.CACHE / "variants" / "C-minimal.png"
VARIANT_ORDER = ["albert-einstein", "marie-curie", "harriet-tubman", "jfk", "elon-musk", "genghis-khan", "dolly-parton",
                 "taylor-swift", "mother-teresa", "socrates", "michael-jackson", "martin-luther-king-jr", "keanu-reeves",
                 "pel", "queen-elizabeth-ii", "kobe-bryant"]
REDRAW_FROM_VARIANT = {"elon-musk", "dolly-parton"}   # their props floated in pass 1
# Referral cards scored before looks existed carry a faceless neutral brief: give them one.
LOOK_OVERRIDES = {
    "bill-clinton": "tall broad-shouldered older man, thick swept silver-white hair, ruddy friendly face, dark navy suit, white shirt, light-blue tie, a gold tenor saxophone held in the right hand against the body",
    "benjamin-netanyahu": "stocky older man, short grey hair combed to the side, dark navy suit, white shirt, blue tie, a closed dark leather folder held in the left hand against the body",
    "dolly-parton": "tall platinum-blonde big-hair wig, hourglass silhouette in a rhinestone-studded pastel pink outfit, an acoustic guitar held upright in the right hand against the side of the body",
    "elon-musk": "tall broad-shouldered white man with fair skin, short dark brown hair, plain black t-shirt under a black blazer, dark jeans, black boots, a small white-and-silver model rocket held upright in the right hand against the chest",
}


def process_raw_image(img):
    """A cell (or single) RGB image -> sheet via the standard pipeline, framed in background colour."""
    rgb = img.convert("RGB")
    a = np.asarray(rgb).astype(int)
    k = 8
    bg = tuple(int(v) for v in np.median(np.concatenate([a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:]]).reshape(-1, 3), axis=0))
    pad = 12
    framed = Image.new("RGB", (rgb.width + 2 * pad, rgb.height + 2 * pad), bg)
    framed.paste(rgb, (pad, pad))
    tmp = WORK / "_cell.png"
    framed.save(tmp)
    return S.process(tmp)


def save_result(slug, sheet, results, source):
    NEW.mkdir(parents=True, exist_ok=True)
    # The full QA gate (scripts/sprite_qa.py), vision included: a failure is recorded, never shipped.
    why = S.QA.sheet_checks(sheet, S.validate_sheet)
    if why is None:
        ok, reasons = S.QA.vision_check(sheet, (LOOKS_OVERRIDE.get(slug) if "LOOKS_OVERRIDE" in globals() else None) or S.LOOKS.get(slug),
                                        skin=S.QA.skin_of(slug))
        why = None if ok is True else "QA gate: " + "; ".join(reasons)
    sheet.save(NEW / f"{slug}.png")
    results[slug] = {"ok": why is None, "reason": why, "source": source}


def plan(prod_looks_path):
    WORK.mkdir(parents=True, exist_ok=True)
    repo = sorted(json.loads((ROOT / "public/sprites/manifest.json").read_text()))
    prod = json.loads(Path(prod_looks_path).read_text())
    subjects = []
    for slug in repo:
        subjects.append({"slug": slug, "where": "repo", "look": LOOK_OVERRIDES.get(slug) or S.LOOKS[slug]})
    for slug, v in prod.items():
        look = LOOK_OVERRIDES.get(slug) or v.get("look")
        if not look:
            raise SystemExit(f"no look for {slug}")
        subjects.append({"slug": slug, "where": "prod", "look": look})
    reuse = [s["slug"] for s in subjects if s["slug"] in VARIANT_ORDER and s["slug"] not in REDRAW_FROM_VARIANT]
    draw = [s for s in subjects if s["slug"] not in reuse]
    grids = [draw[i:i + 16] for i in range(0, len(draw), 16)]
    PLAN.write_text(json.dumps({"subjects": subjects, "reuse": reuse, "grids": grids}, indent=1))
    print(f"{len(subjects)} subjects: {len(reuse)} reused from the style-C sheet, {len(draw)} to draw in {len(grids)} grids")


def results_load():
    p = WORK / "results.json"
    return json.loads(p.read_text()) if p.exists() else {}


def results_save(r):
    (WORK / "results.json").write_text(json.dumps(r, indent=1))


def grids():
    p = json.loads(PLAN.read_text())
    results = results_load()
    # free: reprocess the pass-1 sheet
    img = Image.open(VARIANT_SHEET).convert("RGB")
    boxes, _ = G.slice_grid(img)
    for slug, box in zip(VARIANT_ORDER, boxes):
        if slug in p["reuse"] and slug not in results:
            save_result(slug, process_raw_image(img.crop(box)), results, "variant-C")
    results_save(results)
    for i, cohort in enumerate(p["grids"]):
        dest = WORK / f"grid-{i}.png"
        looks = [c["look"] for c in cohort]
        while len(looks) < 16:
            looks.append(looks[-1])
        if not dest.exists():
            print(f"gen grid {i} ({len(cohort)} figures)", flush=True)
            G.generate_grid(looks, dest)
        img = Image.open(dest).convert("RGB")
        boxes, mask = G.slice_grid(img)
        for c, box in zip(cohort, boxes):
            if c["slug"] in results and results[c["slug"]]["ok"]:
                continue
            why = G.validate_cell(mask, box)
            if why:
                results[c["slug"]] = {"ok": False, "reason": f"cell: {why}", "source": f"grid-{i}"}
                continue
            try:
                save_result(c["slug"], process_raw_image(img.crop(box)), results, f"grid-{i}")
            except Exception as e:  # noqa: BLE001
                results[c["slug"]] = {"ok": False, "reason": f"process: {e}", "source": f"grid-{i}"}
        results_save(results)
    bad = {k: v["reason"] for k, v in results.items() if not v["ok"]}
    print(f"{sum(v['ok'] for v in results.values())} ok, {len(bad)} failed: {bad}")


def single(look, dest):
    prompt = SPEC.SINGLE_PROMPT.format(look=SPEC.normalize_look(look))   # one-off 2026-09-26 redraw; new work uses sprites.generate (skin-aware)
    cmd = ["higgsfield", "generate", "create", S.MODEL, "--prompt", prompt,
           "--resolution", "1k", "--aspect_ratio", "2:3", "--wait", "--json"]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout).strip()[:200])
    job = json.loads(res.stdout)
    job = job[0] if isinstance(job, list) else job
    if job.get("status") != "completed":
        raise RuntimeError(f"status {job.get('status')}")
    urllib.request.urlretrieve(job["result_url"], dest)


def singles(only=None, attempts=2):
    p = json.loads(PLAN.read_text())
    looks = {s["slug"]: s["look"] for s in p["subjects"]}
    results = results_load()
    todo = only or [k for k, v in results.items() if not v["ok"]]
    for slug in todo:
        for n in range(attempts):
            dest = WORK / f"single-{slug}-{n}.png"
            try:
                if not dest.exists():
                    single(looks[slug], dest)
                save_result(slug, process_raw_image(Image.open(dest)), results, f"single-{n}")
            except Exception as e:  # noqa: BLE001
                results[slug] = {"ok": False, "reason": f"single: {e}", "source": f"single-{n}"}
            results_save(results)
            print(slug, results[slug], flush=True)
            if results[slug]["ok"]:
                break


def old_sheet(slug, where):
    if where == "repo":
        return Image.open(ROOT / "public/sprites" / f"{slug}.png").convert("RGBA")
    p = WORK / "old" / f"{slug}.png"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["netlify", "blobs:get", "hvi-sprites", slug, "--output", str(p)], cwd=ROOT,
                       capture_output=True, timeout=120)
    return Image.open(p).convert("RGBA")


def sheet(dest, scale=3, per_row=12):
    p = json.loads(PLAN.read_text())
    subs = p["subjects"]
    rows = (len(subs) + per_row - 1) // per_row
    cw, ch = S.W * scale + 6, S.H * scale * 2 + 16
    out = Image.new("RGBA", (per_row * cw, rows * ch), (236, 232, 222, 255))
    for i, s in enumerate(subs):
        x, y = (i % per_row) * cw, (i // per_row) * ch
        for j, im in enumerate([old_sheet(s["slug"], s["where"]), Image.open(NEW / f"{s['slug']}.png").convert("RGBA")
                                if (NEW / f"{s['slug']}.png").exists() else None]):
            if im is None:
                continue
            f = im.crop((0, 0, S.W, S.H)).resize((S.W * scale, S.H * scale), Image.NEAREST)
            out.alpha_composite(f, (x + 3, y + j * (S.H * scale + 8)))
    out.save(dest)
    print("sheet", dest)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "plan":
        plan(sys.argv[2])
    elif cmd == "grids":
        grids()
    elif cmd == "singles":
        singles(sys.argv[2:] or None)
    elif cmd == "sheet":
        sheet(Path(sys.argv[2]))
