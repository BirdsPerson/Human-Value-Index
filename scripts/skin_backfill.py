#!/opt/homebrew/bin/python3
"""Record every subject's skin tone, grounded in their Wikipedia lead image.

  python3 scripts/skin_backfill.py            # fill scripts/skin.json for anyone missing
  python3 scripts/skin_backfill.py --redo X   # re-read one slug

Why: 2026-09-26 MLK was drawn light-skinned and Lincoln dark-skinned. Looks had no skin tone,
and at 32px the model guesses. Skin likeness on real people is a hard requirement.

Each subject: the Wikipedia lead image (photo, painting or statue) plus the name and short
description go to Claude Sonnet 5 with vision, which classifies the skin into one of the
bands in sprite_spec.SKIN_BANDS and says what it based that on. No image -> knowledge only,
flagged. The result lands in scripts/skin.json (repo figures and production cards alike);
production cards also get `skin` written onto the card. The prompt builder and the QA gate
read the band from there.
"""
import base64
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_qa as QA  # noqa: E402
import sprite_spec as SPEC  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "skin.json"
MODEL = "claude-sonnet-5"
UA = {"User-Agent": "HumanValueIndex/1.0 (humanvalueindex.com; skin-tone QA)"}

PROMPT = (
    "Subject: {name} ({desc}).\n"
    "{imgnote}\n"
    "Classify this real person's natural skin tone into exactly one band: "
    + " | ".join(SPEC.SKIN_BANDS) + ".\n"
    "Base it on the image when one is given (a photo is best evidence; a painting or statue less so), "
    "cross-checked with well-established knowledge of the person. This is for drawing an accurate likeness; "
    "getting it wrong along racial lines is unacceptable, so say so when unsure.\n"
    'Answer JSON only: {{"band": "<one band>", "basis": "photo|painting|statue|knowledge", '
    '"confidence": "high|medium|low", "note": "<short>"}}'
)


def http_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read())


def lead_image(title):
    s = http_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_")))
    src = (s.get("thumbnail") or {}).get("source")
    desc = s.get("description") or ""
    if not src:
        return None, None, desc
    with urllib.request.urlopen(urllib.request.Request(src, headers=UA), timeout=30) as r:
        data = r.read()
    # Normalise whatever Wikipedia serves (webp, tif thumbs, CMYK, alpha) to a plain RGB JPEG.
    import io
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    im.thumbnail((800, 800))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
    return buf.getvalue(), "image/jpeg", desc


def classify(name, title, key):
    try:
        data, mt, desc = lead_image(title)
    except Exception as e:  # noqa: BLE001
        data, mt, desc = None, None, f"(lookup failed: {e})"
    content = []
    if data and mt in ("image/jpeg", "image/png", "image/gif"):
        content.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.b64encode(data).decode()}})
        note = "The image is this person's Wikipedia lead image."
    else:
        note = "No image is available; use well-established knowledge only and lower your confidence accordingly."
    content.append({"type": "text", "text": PROMPT.format(name=name, desc=desc or "no description", imgnote=note)})
    body = {"model": MODEL, "max_tokens": 400, "thinking": {"type": "disabled"},
            "messages": [{"role": "user", "content": content}]}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.loads(r.read())
    if resp.get("stop_reason") == "refusal":
        return {"band": None, "basis": "refused", "confidence": "low", "note": "model declined"}
    text = "".join(b.get("text", "") for b in resp.get("content", []))
    j = json.loads(text[text.index("{"): text.rindex("}") + 1])
    if j.get("band") not in SPEC.SKIN_BANDS:
        j["band"] = None
    j["image"] = bool(data)
    return j


def repo_subjects():
    """Static figures: slug -> (name, wikipedia title). figures.js names are Wikipedia-resolvable."""
    out = subprocess.run(["node", "--input-type=module", "-e",
                          "import {FAMOUS_FIGURES} from './src/figures.js';"
                          "console.log(JSON.stringify(FAMOUS_FIGURES.map(f=>({name:f.name,wiki:f.wikiTitle||f.enwikiTitle||null}))))"],
                         cwd=ROOT, capture_output=True, text=True, timeout=60)
    figs = json.loads(out.stdout)
    import sprites as S
    bench = json.loads((ROOT / "docs" / "methodology" / "benchmarks.json").read_text())
    bench = bench.get("figures", bench)
    res = {}
    for f in figs:
        slug = S.slug(f["name"])
        title = f["wiki"] or ((bench.get(f["name"]) or {}).get("enwiki_title")) or f["name"]
        res[slug] = (f["name"], title)
    res["scott"] = None     # drawn from his own photo; skin set by hand below
    return res


def prod_subjects():
    idx = json.loads(subprocess.run(["netlify", "blobs:get", "hvi-figures", "index"], cwd=ROOT,
                                    capture_output=True, text=True, timeout=120).stdout or "{}")
    res = {}
    for c in idx.get("cards", []):
        if c.get("removed"):
            continue
        res[c["slug"]] = (c.get("name"), c.get("wikiTitle") or c.get("name"))
    return res


def main():
    key = QA.anthropic_key()
    if not key:
        raise SystemExit("no API key")
    have = json.loads(OUT.read_text()) if OUT.exists() else {}
    redo = sys.argv[sys.argv.index("--redo") + 1] if "--redo" in sys.argv else None
    subjects = {**repo_subjects(), **prod_subjects()}
    have.setdefault("scott", {"band": "fair", "basis": "photo", "confidence": "high", "note": "set by hand from his own photo"})
    for slug, v in sorted(subjects.items()):
        if v is None or (slug in have and slug != redo and (have[slug].get("band") is not None)):
            continue
        name, title = v
        try:
            have[slug] = classify(name, title, key)
        except Exception as e:  # noqa: BLE001
            have[slug] = {"band": None, "basis": "error", "confidence": "low", "note": str(e)[:120]}
        h = have[slug]
        print(f"{slug:40} {str(h.get('band')):12} {h.get('basis'):9} {h.get('confidence')}", flush=True)
        OUT.write_text(json.dumps(have, indent=1, sort_keys=True))
    OUT.write_text(json.dumps(have, indent=1, sort_keys=True))
    print(f"{len(have)} subjects in {OUT}")


if __name__ == "__main__":
    main()


def ensure_skin(slug, name, title=None):
    """The recorded band for slug, classifying (and saving) it first when it's missing.
    Used by the referral job and the roster grid before anything is drawn."""
    have = json.loads(OUT.read_text()) if OUT.exists() else {}
    if (have.get(slug) or {}).get("band"):
        return have[slug]["band"]
    key = QA.anthropic_key()
    if not key:
        return None
    have[slug] = classify(name, title or name, key)
    OUT.write_text(json.dumps(have, indent=1, sort_keys=True))
    QA._SKIN = None          # drop the gate's cached copy
    return have[slug].get("band")
