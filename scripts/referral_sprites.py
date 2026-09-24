#!/opt/homebrew/bin/python3
"""Draw likenesses for referred public figures. The reader for the pending queue.

/api/refer scores a referred figure and stores it in the hvi-figures Blobs store with
spriteStatus "pending" and a sprite_look written by the scoring model. This job, run by
launchd every 10 minutes on the Mac (com.hvi.referral-sprites), finds those cards,
generates the sprite with the same Higgsfield pipeline as the 62 on file
(scripts/sprites.py), uploads the 64x48 sheet to hvi-sprites and marks the card ready.
The pen polls /api/pen and swaps the placeholder for /api/sprite/<slug>.

  python3 scripts/referral_sprites.py            # one pass over the queue
  python3 scripts/referral_sprites.py --dry-run  # list the queue, generate nothing

Blobs are reached through the Netlify CLI (site linked in this repo), so run from the
repo directory. Failures (Higgsfield's filter on real people fires at random) are
retried on later runs, up to MAX_ATTEMPTS, then the card is marked "failed" and keeps
its placeholder.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = Path.home() / "Library" / "Logs" / "hvi-referral-sprites.log"
LOOKS_CACHE = Path.home() / ".cache" / "hvi-sprites" / "referral-looks.json"
MAX_ATTEMPTS = 3
PER_RUN = 6          # ponytail: bounds one run's spend (~12 credits); the rest wait 10 minutes

_spec = importlib.util.spec_from_file_location("sprites", ROOT / "scripts" / "sprites.py")
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)


def log(msg):
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def cli(*args, input_path=None):
    cmd = ["netlify", *args]
    if input_path:
        cmd += ["--input", str(input_path)]
    res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    if res.returncode != 0:
        raise RuntimeError(f"netlify {' '.join(args[:3])} failed: {(res.stderr or res.stdout).strip()[:300]}")
    return res.stdout


def get_json(store, key):
    out = cli("blobs:get", store, key).strip()
    return json.loads(out) if out else None


def set_json(store, key, data):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        path = f.name
    try:
        cli("blobs:set", store, key, input_path=path)
    finally:
        Path(path).unlink(missing_ok=True)


def update_index(card):
    # ponytail: the CLI has no conditional writes, so a referral landing in the same
    # second can race this read-modify-write. The window is ~1s every 10 minutes; the
    # card blob stays authoritative and the next pass rewrites the entry.
    idx = get_json("hvi-figures", "index") or {"cards": []}
    keep = ("slug", "name", "score", "tier", "breakdown", "verdict", "sprite", "spriteStatus", "referredBy", "at")
    entry = {k: card.get(k) for k in keep}
    idx["cards"] = [entry if c.get("slug") == card["slug"] else c for c in idx.get("cards", [])]
    if not any(c.get("slug") == card["slug"] for c in idx["cards"]):
        idx["cards"].insert(0, entry)
    set_json("hvi-figures", "index", idx)


def remember_look(slug, look):
    LOOKS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    looks = json.loads(LOOKS_CACHE.read_text()) if LOOKS_CACHE.exists() else {}
    looks[slug] = look
    LOOKS_CACHE.write_text(json.dumps(looks, indent=1, sort_keys=True))


def draw(card):
    slug, name = card["slug"], card.get("wikiTitle") or card["name"]
    if card.get("look"):
        S.LOOKS[slug] = card["look"]
        remember_look(slug, card["look"])
    raw = S.CACHE / f"{slug}.png"
    if not raw.exists():
        S.generate(name, raw)
    sheet = S.process(raw)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name
    try:
        sheet.save(path)
        cli("blobs:set", "hvi-sprites", slug, input_path=path)
    finally:
        Path(path).unlink(missing_ok=True)


def main():
    dry = "--dry-run" in sys.argv
    idx = get_json("hvi-figures", "index") or {"cards": []}
    pending = [c for c in idx.get("cards", []) if c.get("spriteStatus") == "pending"]
    log(f"queue: {len(pending)} pending of {len(idx.get('cards', []))} referred figures")
    if dry:
        for c in pending:
            log(f"  pending {c['slug']}")
        return 0
    for entry in pending[:PER_RUN]:
        slug = entry["slug"]
        card = get_json("hvi-figures", slug)
        if not card or card.get("spriteStatus") != "pending":
            continue
        attempt = int(card.get("spriteAttempts") or 0) + 1
        try:
            draw(card)
            card.update(spriteStatus="ready", sprite=f"/api/sprite/{slug}?v={int(time.time())}", spriteAttempts=attempt,
                        spriteAt=datetime.now(timezone.utc).isoformat())
            log(f"ready  {slug} (attempt {attempt})")
        except Exception as e:  # one bad figure must not sink the run
            # A cached raw that failed to process would fail forever; drop it so the retry regenerates.
            if "higgsfield" not in str(e):
                (S.CACHE / f"{slug}.png").unlink(missing_ok=True)
            card["spriteAttempts"] = attempt
            if attempt >= MAX_ATTEMPTS:
                card["spriteStatus"] = "failed"
            log(f"FAIL   {slug} (attempt {attempt}/{MAX_ATTEMPTS}{', giving up' if attempt >= MAX_ATTEMPTS else ''}): {str(e)[:200]}")
        set_json("hvi-figures", slug, card)
        update_index(card)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"RUN FAILED: {e}")
        sys.exit(1)
