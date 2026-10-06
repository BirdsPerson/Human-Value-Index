#!/usr/bin/env python3
"""EBTV on the city's TVs: one pixelated frame of whatever Electric Basement TV is airing.

Every 30 s (launchd, scripts/com.hvi.ebtv-frame.plist): ffmpeg grabs one frame from the public
stream (live.electricbasement.tv, or a live preemption from the channel feed), PIL shrinks it to
96x54 in 24 colours, and the netlify CLI (already logged in; no secret) writes it with the
now-playing title to Netlify Blobs (store hvi-ebtv, key frame). /api/ebtv-frame serves it.

Stream down / unreachable: nothing is published. The frame's `at` ages and the game shows its
OFF AIR card after 3 minutes (src/city/ebtvFrame.js), so a dead stream never reads as live.
Log: ~/Library/Logs/hvi-ebtv-frame.log (one line per failure, one per hour while healthy).
"""
import base64, io, json, os, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timezone
from PIL import Image

STREAM = "https://live.electricbasement.tv/live/master.m3u8"
NOW = "https://live.electricbasement.tv/live/now.json"
FEED = "https://electricbasement.tv/channel_schedule.json"   # activePreemption lives here
SITE_ID = "3ac3fcb8-cab4-489b-8ea9-1e4153b87941"              # human-value-index on Netlify
LOG = os.path.expanduser("~/Library/Logs/hvi-ebtv-frame.log")
W, H, COLORS = 96, 54, 24


def log(msg):
    with open(LOG, "a") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} {msg}\n")


def get_json(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hvi-ebtv-frame"}), timeout=8) as r:
            return json.load(r)
    except Exception:
        return None


def source():
    """-> (stream url, title, up next): a live preemption wins over the loop, as on the web player."""
    feed = get_json(FEED) or {}
    p = feed.get("activePreemption") or {}
    if p.get("videoURL"):
        ends = p.get("endsAt")
        try:
            live = not ends or datetime.fromisoformat(ends.replace("Z", "+00:00")) > datetime.now(timezone.utc)
        except ValueError:
            live = False
        if live:
            return p["videoURL"], p.get("title") or "EB Team Live", None
    now = get_json(NOW) or {}
    title = (now.get("title") or "").removeprefix("Basement Feature: ").strip() or None
    return STREAM, title, (now.get("upNext") or None)


def grab(url):
    """One frame as a PIL image, or None (stream down)."""
    try:
        res = subprocess.run(["/opt/homebrew/bin/ffmpeg", "-nostdin", "-loglevel", "error", "-rw_timeout", "10000000",
                              "-i", url, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                             capture_output=True, timeout=25)
    except subprocess.TimeoutExpired:
        log(f"DOWN ffmpeg timed out on {url}")
        return None
    if res.returncode or not res.stdout:
        log(f"DOWN ffmpeg {res.returncode}: {res.stderr.decode(errors='replace').strip()[-200:]}")
        return None
    return Image.open(io.BytesIO(res.stdout)).convert("RGB")


def pixelate(img):
    small = img.resize((W, H), Image.BOX)
    return small.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def main():
    url, title, up_next = source()
    img = grab(url)
    if img is None:
        return 1
    buf = io.BytesIO()
    pixelate(img).save(buf, "PNG", optimize=True)
    rec = {"at": int(time.time() * 1000), "title": title and title[:80], "upNext": up_next and up_next[:80],
           "png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(rec, f)
        path = f.name
    try:
        res = subprocess.run(["netlify", "blobs:set", "hvi-ebtv", "frame", "--input", path],
                             capture_output=True, text=True, timeout=60, cwd=tempfile.gettempdir(),
                             env={**os.environ, "NETLIFY_SITE_ID": SITE_ID})
    except (OSError, subprocess.TimeoutExpired) as e:
        log(f"PUBLISH failed: {e}")
        return 1
    finally:
        os.unlink(path)
    if res.returncode:
        log(f"PUBLISH failed: {(res.stderr or res.stdout).strip()[-200:]}")
        return 1
    if time.localtime().tm_min == 0 and time.localtime().tm_sec < 30:   # an hourly heartbeat
        log(f"OK {len(buf.getvalue())} bytes, {title!r}")
    if "-v" in sys.argv:
        print(f"published {len(buf.getvalue())} bytes, {title!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
