#!/opt/homebrew/bin/python3
"""Draw likenesses for referred public figures. The reader for the pending queue.

/api/refer scores a referred figure and stores it in the hvi-figures Blobs store with
spriteStatus "pending" and a sprite_look written by the scoring model. This job, run by
launchd every 10 minutes on the Mac (com.hvi.referral-sprites), finds those cards,
generates the sprite with the same Higgsfield pipeline as the 62 on file
(scripts/sprites.py), uploads the 64x48 sheet to hvi-sprites and marks the card ready.
The pen polls /api/pen and swaps the placeholder for /api/sprite/<slug>; each pass then
repacks the production atlas (scripts/prod-atlas.mjs) when any ready sprite changed.

  python3 scripts/referral_sprites.py                  # one pass over the queue
  python3 scripts/referral_sprites.py --dry-run        # list the queues, generate nothing
  python3 scripts/referral_sprites.py --retry-failed   # put every "failed" card back in the queue
  python3 scripts/referral_sprites.py --takedown <slug>  # withdraw a referred figure for good
  python3 scripts/referral_sprites.py --takedown <slug> --excluded  # withdraw by policy (founders/prophets)

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
sys.path.insert(0, str(ROOT / "scripts"))
import sprite_qa as QA  # noqa: E402
import skin_backfill as SKIN  # noqa: E402
from PIL import Image  # noqa: E402


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


def index_sync(*args):
    """The figure index is written only from Node (scripts/index-sync.mjs: 64 shards, conditional
    writes); this job writes cards and asks Node to re-derive their entries. Raises on failure."""
    res = subprocess.run(["node", str(ROOT / "scripts" / "index-sync.mjs"), *args], cwd=ROOT,
                         capture_output=True, text=True, timeout=300)
    if res.returncode != 0:
        raise RuntimeError(f"index-sync {' '.join(args[:2])} failed: {(res.stderr or res.stdout).strip()[:300]}")
    return res.stdout


def load_index():
    """The whole index as {"cards": [...]}, or an exception: never a partial or empty stand-in."""
    return json.loads(index_sync("--dump"))


def update_index(card, remove=False):
    # The entry is derived from the card as stored (a withdrawn card drops out), so `remove`
    # needs no separate path; kept for callers (scripts/redraw_gated.py).
    index_sync(card["slug"])


def repair_index(idx):
    """Index card blobs missing from the index and resync entries behind their card. Returns the index."""
    out = index_sync("--repair").strip()
    for line in out.splitlines():
        log(line)
    return load_index() if out else idx


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


def generate(card, raw, attempt=1, skin=None):
    name = card.get("name") or card.get("wikiTitle")   # qualifier already stripped
    try:
        S.generate(name, raw, look=card.get("look") or NEUTRAL_LOOK, attempt=attempt, skin=skin)
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


def draw(card, attempt=1):
    slug = card["slug"]
    if card.get("look"):
        remember_look(slug, card["look"])
    raw = S.CACHE / f"{slug}.png"
    # Skin tone is a hard likeness requirement: no band, no drawing.
    skin = card.get("skin") or SKIN.ensure_skin(slug, card.get("name"), card.get("wikiTitle"))
    if not skin:
        raise FigureFailed("no recorded skin tone (classification failed); not drawing a real person without one")
    card["skin"] = skin
    if not raw.exists():
        generate(card, raw, attempt, skin)
    try:
        sheet = S.process(raw)
    except Exception as e:
        # A cached raw that fails to process would fail forever; drop it so the retry regenerates.
        raw.unlink(missing_ok=True)
        raise FigureFailed(f"process failed: {e}") from e
    # The QA gate (scripts/sprite_qa.py): nothing is uploaded or marked ready unless the raw holds
    # exactly one un-eaten figure, the sheet meets the design system, and Claude sees one fully
    # clothed person matching the look. A failed gate drops the raw so the retry regenerates
    # with a different background and an insistence on one clothed person.
    ok, why = QA.gate(sheet, card.get("look") or NEUTRAL_LOOK, keyed=S.key_out(Image.open(raw)),
                      validate_sheet=S.validate_sheet, skin=skin)
    if ok is not True:
        if why and why[0].startswith(("vision check unavailable", "vision check failed")):
            raise Plumbing("; ".join(why))          # no charge: the raw stays for the next run
        raw.unlink(missing_ok=True)
        raise FigureFailed("QA gate: " + "; ".join(why))
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


def takedown(slug, excluded=False):
    card = get_json("hvi-figures", slug)
    if not card:
        raise SystemExit(f"no referred figure {slug!r}")
    # A tombstone, not a delete: the slug stays taken, so the person can't be re-referred.
    # excluded: withdrawn by policy (netlify/lib/excluded.js), so a re-referral gets the
    # "sealed by policy" line rather than "withdrawn".
    tomb = {"slug": slug, "removed": True, "wikidata": card.get("wikidata"),
            "removedAt": datetime.now(timezone.utc).isoformat()}
    if excluded:
        tomb["excluded"] = True
    set_json("hvi-figures", slug, tomb)
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


def sync_harm_reviews(idx):
    # Heads of state gated through state force wait for Scott's case-by-case call; keep the
    # "## Harm reviews" section of MORNING_REPORT.md current. Best-effort: never blocks sprites.
    try:
        res = subprocess.run(["node", str(ROOT / "scripts" / "harm-reviews.mjs"), "--stdin"], cwd=ROOT,
                             input=json.dumps(idx), capture_output=True, text=True, timeout=180)
        if res.returncode != 0:
            log(f"harm reviews: {res.stderr.strip()[:200]}")
    except (OSError, subprocess.TimeoutExpired) as e:
        log(f"harm reviews skipped: {e}")


def rebuild_atlas():
    """Repack the production sprite atlas (scripts/prod-atlas.mjs) so browsers fetch a few
    sheets, not one /api/sprite per face. It exits in two Blobs reads when no ready sprite
    changed, so every pass calls it (which also retries a pack a failed pass missed).
    Best-effort: a sprite missing from the atlas still loads from its own URL."""
    try:
        res = subprocess.run(["node", str(ROOT / "scripts" / "prod-atlas.mjs")], cwd=ROOT,
                             capture_output=True, text=True, timeout=600)
        out = (res.stdout or res.stderr or "").strip().splitlines()
        if res.returncode != 0 or (out and "unchanged" not in out[0]):
            log(" / ".join(out)[:300] if out else f"atlas: exit {res.returncode}")
    except (OSError, subprocess.TimeoutExpired) as e:
        log(f"atlas skipped: {e}")


def check_plans():
    """The plan builder's stall alarm (scripts/plan-health.mjs): a manifest without tomorrow
    puts a section on MORNING_REPORT.md, a recovery removes it. It rides this 10-minute job
    so no new launchd agent is needed. Best-effort: never stops the sprite run."""
    try:
        subprocess.run(["node", str(ROOT / "scripts" / "plan-health.mjs")], cwd=ROOT,
                       capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as e:
        log(f"plan health skipped: {e}")


def main():
    if "--takedown" in sys.argv:
        takedown(arg_after("--takedown"), excluded="--excluded" in sys.argv)
        rebuild_atlas()
        return 0
    dry = "--dry-run" in sys.argv
    if not dry:
        check_plans()
    idx = load_index()
    if not dry:
        idx = repair_index(idx)
    if "--retry-failed" in sys.argv:
        retry_failed(idx)
        idx = load_index()
    cards = idx.get("cards", [])
    pending = [c for c in cards if c.get("spriteStatus") == "pending"]
    # Verdicts publish after the automatic fact-check in /api/refer; "withheld" means the
    # check couldn't run, so the pen shows score and tier only. Listed, not acted on.
    withheld = [c for c in cards if c.get("verdictStatus") != "published"]
    log(f"queue: {len(pending)} pending of {len(cards)} referred figures; {len(withheld)} verdicts withheld")
    if not dry:
        sync_harm_reviews(idx)
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
            draw(card, attempt)
            card.pop("spriteQuarantined", None)
            card.update(spriteQA="passed", spriteStatus="ready", sprite=f"/api/sprite/{slug}?v={int(time.time())}", spriteAttempts=attempt,
                        spriteAt=datetime.now(timezone.utc).isoformat())
            log(f"ready  {slug} (attempt {attempt})")
        except FigureFailed as e:  # one bad figure must not sink the run
            card["spriteAttempts"] = attempt
            card["spriteQA"] = str(e)[:300]
            if attempt >= MAX_ATTEMPTS:
                card["spriteStatus"] = "failed"
            log(f"FAIL   {slug} (attempt {attempt}/{MAX_ATTEMPTS}{', giving up' if attempt >= MAX_ATTEMPTS else ''}): {str(e)[:200]}")
        except Plumbing as e:
            log(f"STOP   {slug}: plumbing failure, no attempt charged, run ended: {str(e)[:200]}")
            rebuild_atlas()
            return 1
        set_json("hvi-figures", slug, card)
        update_index(card)
    rebuild_atlas()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"RUN FAILED: {e}")
        sys.exit(1)
