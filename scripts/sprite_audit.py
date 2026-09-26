#!/opt/homebrew/bin/python3
"""Run every published sprite through the QA gate (sheet checks + vision) and write a report.

  python3 scripts/sprite_audit.py [--out docs/sprite-audit-YYYY-MM-DD.md]

Covers public/sprites/*.png (the static roster, Scott) and every blob in the production
hvi-sprites store (referrals + roster engine). Read-only: it changes nothing, it reports.
Raw generations aren't checked here: published sheets may come from raws that have since been
replaced in the cache. The raw layer runs at generation time.
"""
import json
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprites as S  # noqa: E402
import sprite_qa as QA  # noqa: E402

ROOT = S.ROOT


def cli(*args):
    res = subprocess.run(["netlify", *args], cwd=ROOT, capture_output=True, text=True, timeout=120)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout)[:300])
    return res.stdout


def prod_items(tmp):
    keys = [b["key"] for b in json.loads(cli("blobs:list", "hvi-sprites", "--json"))["blobs"]]
    idx = json.loads(cli("blobs:get", "hvi-figures", "index") or "{}")
    names = {c["slug"]: c for c in idx.get("cards", [])}
    out = []
    for k in keys:
        dest = Path(tmp) / f"{k}.png"
        subprocess.run(["netlify", "blobs:get", "hvi-sprites", k, "--output", str(dest)], cwd=ROOT,
                       capture_output=True, timeout=120)
        if not dest.exists() or dest.stat().st_size == 0:
            out.append((k, "prod", None, None, "download failed"))
            continue
        look = None
        try:
            card = json.loads(cli("blobs:get", "hvi-figures", k))
            look = card.get("look")
        except Exception:  # noqa: BLE001
            pass
        out.append((k, "prod", dest, look or (names.get(k) or {}).get("name"), None))
    return out


def main():
    out_md = ROOT / "docs" / f"sprite-audit-{date.today().isoformat()}.md"
    if "--out" in sys.argv:
        out_md = ROOT / sys.argv[sys.argv.index("--out") + 1]
    key = QA.anthropic_key()
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        items = [(p.stem, "repo", p, S.LOOKS.get(p.stem) or p.stem.replace("-", " "), None)
                 for p in sorted((ROOT / "public" / "sprites").glob("*.png"))]
        items += prod_items(tmp)
        fails = []
        for slug, where, path, look, err in items:
            if err:
                rows.append((slug, where, False, err, "-")); continue
            sheet = Image.open(path).convert("RGBA")
            band = QA.skin_of(slug)
            pix = QA.skin_band_check(QA._frame(sheet), band) if band else "no recorded skin tone"
            ok, reasons = QA.gate(sheet, look, validate_sheet=S.validate_sheet, key=key, skin=band)
            drawn = next((r.split(": ", 1)[1] for r in reasons if r.startswith("drawn skin: ")), None)
            mism = next((r for r in reasons if r.startswith("skin tone mismatch")), None)
            skin_cell = f"{band or '?'} / pixels {'FAIL' if pix else 'ok'}" + (f" / vision drawn {drawn}" if drawn else (" / vision: " + mism if mism else ""))
            rows.append((slug, where, ok, "; ".join(reasons), skin_cell))
            print(f"{'PASS' if ok else 'FAIL'} {where:4} {slug} [{skin_cell}]: {'; '.join(reasons)[:150]}", flush=True)
            if not ok:
                fails.append((slug, sheet.copy()))
        if fails:
            per, sc = 8, 4
            rowsn = (len(fails) + per - 1) // per
            cs = Image.new("RGBA", (per * (32 * sc + 8), rowsn * (48 * sc + 8)), (236, 232, 222, 255))
            for i, (_, sh) in enumerate(fails):
                f1 = sh.crop((0, 0, 32, 48)).resize((32 * sc, 48 * sc), Image.NEAREST)
                cs.alpha_composite(f1, ((i % per) * (32 * sc + 8), (i // per) * (48 * sc + 8)))
            cs.save(ROOT / "docs" / "sprite-audit-failures.png")
    n_fail = sum(1 for r in rows if not r[2])
    lines = [f"# Sprite audit, {date.today().isoformat()}", "",
             f"{len(rows)} sprites checked ({sum(r[1] == 'repo' for r in rows)} repo, {sum(r[1] == 'prod' for r in rows)} production). "
             f"**{len(rows) - n_fail} pass, {n_fail} fail.** Gate: scripts/sprite_qa.py (design-system sheet checks, head, "
             "bare-skin torso, skin-tone band vs face lightness, then a Claude Haiku vision check told the recorded skin tone: "
             "one fully clothed full-body person matching the look and skin).", ""]
    if n_fail:
        lines += ["Failures (contact sheet: docs/sprite-audit-failures.png):", "", "| Sprite | Where | Skin (band / face L* / checks) | Reason |", "|---|---|---|---|"]
        lines += [f"| {s} | {w} | {sk} | {r.replace('|', '/')} |" for s, w, ok, r, sk in rows if not ok]
        lines.append("")
    lines += ["All results (skin: recorded band from scripts/skin.json / measured face L* / lightness flag / vision verdict):", "",
              "| Sprite | Where | Skin | Result |", "|---|---|---|---|"]
    lines += [f"| {s} | {w} | {sk} | {'pass' if ok else 'FAIL'} |" for s, w, ok, r, sk in rows]
    out_md.write_text("\n".join(lines) + "\n")
    print(f"wrote {out_md}: {len(rows)} checked, {n_fail} failed")


if __name__ == "__main__":
    main()
