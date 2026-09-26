#!/opt/homebrew/bin/python3
"""Redraw named sprites through the QA gate (repo figures and production cards alike).

  python3 scripts/redraw_gated.py --budget 25 slug[=look override] ...

Each figure: up to 3 attempts (attempt 2+ insists on one clothed person and moves off magenta),
every attempt through scripts/sprite_qa.py gate() with the subject's recorded skin tone. Only a
passing sprite is saved (repo: public/sprites + manifest; production: hvi-sprites + card ready,
quarantine cleared, version bumped). Stops before the Higgsfield credit budget is exceeded.
Writes a contact sheet of the results to docs/sprite-redraw-<date>.png.
"""
import json
import subprocess
import sys
import tempfile
import time
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprites as S  # noqa: E402
import sprite_qa as QA  # noqa: E402
import referral_sprites as R  # noqa: E402

ROOT = S.ROOT
COST = 2      # credits per single generation (nano_banana_pro 1k)


def credits():
    out = subprocess.run(["higgsfield", "account", "status"], capture_output=True, text=True).stdout
    try:
        return float(out.split(" credits")[0].split()[-1])
    except Exception:  # noqa: BLE001
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    budget = float(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else 25
    args = [a for a in args if a != str(budget) and a != str(int(budget))]
    start = credits()
    spent = 0
    results = []
    key = QA.anthropic_key()
    for spec in args:
        slug, _, override = spec.partition("=")
        repo = (ROOT / "public" / "sprites" / f"{slug}.png").exists() or slug in S.LOOKS or (ROOT / "docs" / "sprite-quarantine" / f"{slug}.png").exists()
        card = None if repo else R.get_json("hvi-figures", slug)
        if not repo and not card:
            results.append((slug, False, "no such subject", None)); continue
        name = card.get("name") if card else slug.replace("-", " ").title()
        look = override or (card.get("look") if card else S.LOOKS.get(slug)) or R.NEUTRAL_LOOK
        skin = QA.skin_of(slug) or (card or {}).get("skin")
        if not skin:
            results.append((slug, False, "no recorded skin tone", None)); continue
        raw = S.CACHE / f"{slug}.png"
        ok, why, sheet = False, ["not attempted"], None
        for attempt in (1, 2, 3):
            if spent + COST > budget:
                why = [f"stopped: credit budget {budget} reached"]; break
            raw.unlink(missing_ok=True)
            try:
                S.generate(name, raw, look=look, attempt=attempt, skin=skin)
                spent += COST
            except Exception as e:  # noqa: BLE001  (filtered jobs are not charged)
                why = [f"generation failed: {str(e)[:120]}"]
                continue
            try:
                sheet = S.process(raw)
            except Exception as e:  # noqa: BLE001
                why = [f"process failed: {e}"]; continue
            ok, why = QA.gate(sheet, look, keyed=S.key_out(Image.open(raw)), validate_sheet=S.validate_sheet,
                              key=key, skin=skin)
            print(f"{slug} attempt {attempt}: {'PASS' if ok else 'FAIL'} {'; '.join(why)[:160]}", flush=True)
            if ok:
                break
        if ok:
            if repo:
                sheet.save(ROOT / "public" / "sprites" / f"{slug}.png")
                S.preview(sheet, ROOT / "docs" / "sprite-previews" / f"{slug}.png")
                S.update_manifest([slug])
                (ROOT / "docs" / "sprite-quarantine" / f"{slug}.png").unlink(missing_ok=True)
            else:
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                    sheet.save(f.name)
                    R.cli("blobs:set", "hvi-sprites", slug, input_path=f.name)
                card = R.get_json("hvi-figures", slug)
                card.pop("spriteQuarantined", None)
                card.update(look=look, skin=skin, spriteQA="passed", spriteStatus="ready", spriteAttempts=0,
                            sprite=f"/api/sprite/{slug}?v={int(time.time())}", spriteAt=datetime.now(timezone.utc).isoformat())
                R.set_json("hvi-figures", slug, card)
                R.update_index(card)
            R.remember_look(slug, look)
        results.append((slug, ok, "; ".join(why), sheet if ok else None))
    # contact sheet of the passing redraws
    passed = [(s, sh) for s, ok, _, sh in results if ok]
    if passed:
        sc, per = 4, 8
        rows = (len(passed) + per - 1) // per
        cs = Image.new("RGBA", (per * (32 * sc + 10), rows * (48 * sc + 24)), (236, 232, 222, 255))
        d = ImageDraw.Draw(cs)
        for i, (s, sh) in enumerate(passed):
            x, y = (i % per) * (32 * sc + 10), (i // per) * (48 * sc + 24)
            cs.alpha_composite(sh.crop((0, 0, 32, 48)).resize((32 * sc, 48 * sc), Image.NEAREST), (x, y))
            d.text((x, y + 48 * sc + 4), s[:20], fill=(0, 0, 0, 255))
        out = ROOT / "docs" / f"sprite-redraw-{date.today().isoformat()}.png"
        if out.exists():
            prev = Image.open(out).convert("RGBA")
            both = Image.new("RGBA", (max(prev.width, cs.width), prev.height + cs.height), (236, 232, 222, 255))
            both.alpha_composite(prev, (0, 0)); both.alpha_composite(cs, (0, prev.height)); cs = both
        cs.save(out)
    end = credits()
    print(json.dumps({"results": [(s, ok, w[:200]) for s, ok, w, _ in results], "credits_start": start,
                      "credits_end": end, "spent_estimate": spent}, indent=1))


if __name__ == "__main__":
    main()
