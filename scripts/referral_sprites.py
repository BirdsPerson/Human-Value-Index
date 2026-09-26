#!/opt/homebrew/bin/python3
"""Draw likenesses for referred public figures. The reader for the pending queue.

/api/refer scores a referred figure and stores it in the hvi-figures Blobs store with
spriteStatus "pending" and a sprite_look written by the scoring model. This job, run by
launchd every 10 minutes on the Mac (com.hvi.referral-sprites), finds those cards,
generates the sprite with the same Higgsfield pipeline as the 62 on file
(scripts/sprites.py), uploads the 64x48 sheet to hvi-sprites and marks the card ready.
The pen polls /api/pen and swaps the placeholder for /api/sprite/<slug>.

  python3 scripts/referral_sprites.py                  # one pass over the queue
  python3 scripts/referral_sprites.py --dry-run        # list the queues, generate nothing
  python3 scripts/referral_sprites.py --retry-failed   # put every "failed" card back in the queue
  python3 scripts/referral_sprites.py --takedown <slug>  # withdraw a referred figure for good

Blobs are reached through the Netlify CLI (site linked in this repo), so run from the
repo directory. A failure that belongs to one figure (Higgsfield's filter on real people
fires at random, or the image won't process) is retried on later runs, up to
MAX_ATTEMPTS, then the card is marked "failed" and keeps its placeholder. A failure of the
plumbing (Higgsfield logged out or out of credits, a CLI missing, an upload refused) stops
the run and leaves every card as it was.
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


# Keep in step with figureIndexEntry in netlify/lib/store.js.
INDEX_KEYS = ("slug", "name", "qualifier", "score", "tier", "breakdown", "verdict", "verdictStatus", "noDangle", "wikidata",
              "born", "died", "sprite", "spriteStatus", "referredBy", "at", "people", "source")


def index_entry(card):
    return {k: card.get(k) for k in INDEX_KEYS}


def update_index(card, remove=False):
    # ponytail: the CLI has no conditional writes, so a referral landing between this read
    # and write can drop out of the index. repair_index() puts any such card back on the
    # next pass, from the card blobs themselves.
    idx = get_json("hvi-figures", "index") or {"cards": []}
    cards = [c for c in idx.get("cards", []) if c.get("slug") != card["slug"]]
    if not remove:
        cards.insert(0, index_entry(card))
    idx["cards"] = cards
    set_json("hvi-figures", "index", idx)


def card_keys():
    out = json.loads(cli("blobs:list", "hvi-figures", "--json") or "{}")
    return [b["key"] for b in out.get("blobs", []) if b.get("key") and b["key"] != "index"]


def repair_index(idx):
    """Re-index card blobs missing from the index (lost to a write race). Returns the index."""
    have = {c.get("slug") for c in idx.get("cards", [])}
    missing = [k for k in card_keys() if k not in have]
    for key in missing:
        card = get_json("hvi-figures", key)
        if not card or card.get("removed") or not card.get("slug"):
            continue
        update_index(card)
        log(f"reindexed {key} (missing from the index)")
    return (get_json("hvi-figures", "index") or {"cards": []}) if missing else idx


def remember_look(slug, look):
    LOOKS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    looks = json.loads(LOOKS_CACHE.read_text()) if LOOKS_CACHE.exists() else {}
    looks[slug] = look
    LOOKS_CACHE.write_text(json.dumps(looks, indent=1, sort_keys=True))


# A referral whose model returned no look is drawn from this, never from sprites.py's
# GENERIC_LOOK ("their most iconic signature prop"), which for a notorious figure could
# mean weapons or crime props.
NEUTRAL_LOOK = ("their usual public appearance: everyday hairstyle and plain, neutral everyday clothes "
                "in muted colours, standing with hands at their sides, no props")


class Plumbing(Exception):
    """Not this figure's fault: stop the run, charge no attempts, keep the raw image."""


class FigureFailed(Exception):
    """This figure's own failure: counts an attempt."""


PLUMBING_HINTS = ("login", "log in", "auth", "unauthori", "forbidden", "credit", "balance", "insufficient",
                  "quota", "payment", "401", "402", "403", "network", "enotfound", "econn", "timed out", "timeout")


def generate(card, raw):
    name = card.get("name") or card.get("wikiTitle")   # qualifier already stripped
    try:
        S.generate(name, raw, look=card.get("look") or NEUTRAL_LOOK)
    except FileNotFoundError as e:
        raise Plumbing(f"higgsfield CLI not found: {e}") from e
    except subprocess.TimeoutExpired as e:
        raise Plumbing(f"higgsfield timed out: {e}") from e
    except RuntimeError as e:
        msg = str(e)
        if "job not completed" in msg:
            raise FigureFailed(msg) from e          # nsfw / filtered: this figure
        if any(h in msg.lower() for h in PLUMBING_HINTS):
            raise Plumbing(msg) from e
        raise FigureFailed(msg) from e
    except OSError as e:                            # download of a finished job failed
        raise Plumbing(f"download failed: {e}") from e


def draw(card):
    slug = card["slug"]
    if card.get("look"):
        remember_look(slug, card["look"])
    raw = S.CACHE / f"{slug}.png"
    if not raw.exists():
        generate(card, raw)
    try:
        sheet = S.process(raw)
    except Exception as e:
        # A cached raw that fails to process would fail forever; drop it so the retry regenerates.
        raw.unlink(missing_ok=True)
        raise FigureFailed(f"process failed: {e}") from e
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        path = f.name
    try:
        sheet.save(path)
        try:
            cli("blobs:set", "hvi-sprites", slug, input_path=path)
        except (RuntimeError, OSError, subprocess.TimeoutExpired) as e:
            raise Plumbing(str(e)) from e           # the paid raw stays cached for the retry
    finally:
        Path(path).unlink(missing_ok=True)


def set_card(slug, **changes):
    card = get_json("hvi-figures", slug)
    if not card or card.get("removed"):
        raise SystemExit(f"no referred figure {slug!r}")
    card.update(changes)
    set_json("hvi-figures", slug, card)
    update_index(card)
    return card


def takedown(slug):
    card = get_json("hvi-figures", slug)
    if not card:
        raise SystemExit(f"no referred figure {slug!r}")
    # A tombstone, not a delete: the slug stays taken, so the person can't be re-referred.
    set_json("hvi-figures", slug, {"slug": slug, "removed": True, "wikidata": card.get("wikidata"),
                                   "removedAt": datetime.now(timezone.utc).isoformat()})
    update_index({"slug": slug}, remove=True)
    try:
        cli("blobs:delete", "hvi-sprites", slug, "--force")
    except RuntimeError as e:
        log(f"takedown {slug}: sprite delete failed ({e}); card is withdrawn regardless")
    log(f"withdrew {slug}")


def retry_failed(idx):
    for entry in [c for c in idx.get("cards", []) if c.get("spriteStatus") == "failed"]:
        set_card(entry["slug"], spriteStatus="pending", spriteAttempts=0)
        log(f"requeued {entry['slug']}")


def arg_after(flag):
    i = sys.argv.index(flag)
    if i + 1 >= len(sys.argv):
        raise SystemExit(f"{flag} needs a slug")
    return sys.argv[i + 1]


def main():
    if "--takedown" in sys.argv:
        takedown(arg_after("--takedown"))
        return 0
    dry = "--dry-run" in sys.argv
    idx = get_json("hvi-figures", "index") or {"cards": []}
    if not dry:
        idx = repair_index(idx)
    if "--retry-failed" in sys.argv:
        retry_failed(idx)
        idx = get_json("hvi-figures", "index") or {"cards": []}
    cards = idx.get("cards", [])
    pending = [c for c in cards if c.get("spriteStatus") == "pending"]
    # Verdicts publish after the automatic fact-check in /api/refer; "withheld" means the
    # check couldn't run, so the pen shows score and tier only. Listed, not acted on.
    withheld = [c for c in cards if c.get("verdictStatus") != "published"]
    log(f"queue: {len(pending)} pending of {len(cards)} referred figures; {len(withheld)} verdicts withheld")
    if dry:
        for c in pending:
            log(f"  pending {c['slug']}")
        for c in withheld:
            log(f"  withheld {c['slug']}")
        return 0
    # PER_RUN bounds generations (spend); a raw already in the cache (a roster-engine grid
    # cell, or a paid raw from a failed upload) is processed and uploaded for free.
    generated = 0
    for entry in pending:
        slug = entry["slug"]
        cached = (S.CACHE / f"{slug}.png").exists()
        if not cached and generated >= PER_RUN:
            continue
        card = get_json("hvi-figures", slug)
        if not card or card.get("removed") or card.get("spriteStatus") != "pending":
            continue
        if not cached:
            generated += 1
        attempt = int(card.get("spriteAttempts") or 0) + 1
        try:
            draw(card)
            card.update(spriteStatus="ready", sprite=f"/api/sprite/{slug}?v={int(time.time())}", spriteAttempts=attempt,
                        spriteAt=datetime.now(timezone.utc).isoformat())
            log(f"ready  {slug} (attempt {attempt})")
        except FigureFailed as e:  # one bad figure must not sink the run
            card["spriteAttempts"] = attempt
            if attempt >= MAX_ATTEMPTS:
                card["spriteStatus"] = "failed"
            log(f"FAIL   {slug} (attempt {attempt}/{MAX_ATTEMPTS}{', giving up' if attempt >= MAX_ATTEMPTS else ''}): {str(e)[:200]}")
        except Plumbing as e:
            log(f"STOP   {slug}: plumbing failure, no attempt charged, run ended: {str(e)[:200]}")
            return 1
        set_json("hvi-figures", slug, card)
        update_index(card)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"RUN FAILED: {e}")
        sys.exit(1)
