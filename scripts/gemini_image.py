"""Google Gemini image backend for the sprite pipeline (Nano Banana Pro, called directly).

  HVI_SPRITE_BACKEND=gemini|higgsfield   default: gemini when the Keychain item exists, else higgsfield
  HVI_GEMINI_DAILY_IMAGES=10             hard cap (a grid is 16 figures), counted in ~/.cache/hvi-sprites/gemini-usage.json
  HVI_GEMINI_MONTHLY_USD=10              hard monthly spend cap, summed from the same ledger
  HVI_GEMINI_MODEL=gemini-3-pro-image    override the model id

Key: macOS Keychain item `hvi-gemini` (account $USER), else env GEMINI_API_KEY. The key travels
only in the x-goog-api-key header; it is never printed, logged, or written.

Failures raise RuntimeError with the same wording the higgsfield path uses, so callers classify
them unchanged: a safety block says "job not completed" (this figure's fault), a cap or auth
problem says "quota"/"401"/"403" (plumbing, no attempt charged).

ponytail: Batch API (50% off, ~$0.067/grid) is not wired in: it is async (submit, persist a job id,
poll next run, then slice) and the grid caller is synchronous, so it is a state machine, not a tweak.
It would save ~$2 on the 461 backlog at 2K; revisit if volume grows.
"""
import base64
import datetime
import io
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL = os.environ.get("HVI_GEMINI_MODEL", "gemini-3-pro-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
DAILY_CAP = int(os.environ.get("HVI_GEMINI_DAILY_IMAGES", "10"))     # a grid is 16 figures: 10/day = up to 160
MONTHLY_USD = float(os.environ.get("HVI_GEMINI_MONTHLY_USD", "10"))   # hard stop, summed from the ledger
PRICE = {"1K": 0.134, "2K": 0.134, "4K": 0.24}   # USD per output image, standard (not batch)
CACHE = Path(os.environ.get("HVI_SPRITE_CACHE", Path.home() / ".cache" / "hvi-sprites"))
USAGE = CACHE / "gemini-usage.json"
RETRY_CODES = {429, 500, 502, 503, 504}
_key = None


def keychain_key():
    global _key
    if _key is None:
        try:
            res = subprocess.run(["security", "find-generic-password", "-a", os.environ.get("USER", ""),
                                  "-s", "hvi-gemini", "-w"], capture_output=True, text=True, timeout=20)
            _key = res.stdout.strip() if res.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            _key = ""
    return _key


def api_key():
    return keychain_key() or os.environ.get("GEMINI_API_KEY", "").strip()


def backend():
    """Explicit HVI_SPRITE_BACKEND wins; otherwise gemini only once the Keychain item exists
    (a stray GEMINI_API_KEY in a shell is a fallback key, not a reason to switch)."""
    b = os.environ.get("HVI_SPRITE_BACKEND", "").strip().lower()
    if b in ("gemini", "higgsfield"):
        return b
    return "gemini" if keychain_key() else "higgsfield"


def _usage():
    try:
        return json.loads(USAGE.read_text())
    except (OSError, ValueError):
        return {}


def _count(n, size):
    today = datetime.date.today().isoformat()
    u = _usage()
    day = u.setdefault(today, {"images": 0, "usd": 0.0})
    day["images"] += n
    day["usd"] = round(day["usd"] + n * PRICE.get(size, 0.134), 3)
    USAGE.parent.mkdir(parents=True, exist_ok=True)
    USAGE.write_text(json.dumps(u, indent=1, sort_keys=True))
    return day


def _post(body, key):
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(4):           # 1 try + 3 retries
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            if e.code in RETRY_CODES and attempt < 3:
                time.sleep(5 * 2 ** attempt)
                continue
            raise RuntimeError(f"gemini HTTP {e.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3:
                time.sleep(5 * 2 ** attempt)
                continue
            raise RuntimeError(f"gemini network error: {e}") from None


def parse(resp):
    """Response JSON -> (png bytes, None) or (None, block reason)."""
    block = (resp.get("promptFeedback") or {}).get("blockReason")
    if block:
        return None, f"prompt blocked ({block})"
    cands = resp.get("candidates") or []
    for c in cands:
        for p in (c.get("content") or {}).get("parts") or []:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), None
    reason = cands[0].get("finishReason") if cands else "no candidates"
    return None, f"no image returned ({reason})"


def generate(prompt, dest, aspect="2:3", size="1K", label="image"):
    """One image -> dest (always PNG). Returns a short id for the sidecar metadata."""
    key = api_key()
    if not key:
        raise RuntimeError("gemini auth: no key (Keychain hvi-gemini or GEMINI_API_KEY)")
    used = _usage().get(datetime.date.today().isoformat(), {}).get("images", 0)
    if used >= DAILY_CAP:
        raise RuntimeError(f"gemini daily quota reached: {used}/{DAILY_CAP} images today "
                           f"(raise HVI_GEMINI_DAILY_IMAGES to allow more)")
    month = datetime.date.today().isoformat()[:7]
    spent = sum(v.get("usd", 0) for k, v in _usage().items() if k.startswith(month))
    if spent + PRICE.get(size, 0.134) > MONTHLY_USD:
        raise RuntimeError(f"gemini monthly quota reached: ${spent:.2f} of ${MONTHLY_USD:.2f} spent in {month} "
                           f"(raise HVI_GEMINI_MONTHLY_USD to allow more)")
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"],
                                 "imageConfig": {"aspectRatio": aspect, "imageSize": size}}}
    resp = _post(body, key)
    data, why = parse(resp)
    if data is None:
        raise RuntimeError(f"gemini job not completed for {label}: {why}")
    day = _count(1, size)
    from PIL import Image   # normalise to PNG: a JPEG reply would smear the magenta key
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(data)).convert("RGB").save(dest, "PNG")
    print(f"gemini {MODEL} {size} {aspect}: 1 image ${PRICE.get(size, 0.134):.3f}; "
          f"today {day['images']}/{DAILY_CAP} images ~${day['usd']:.2f}", flush=True)
    return resp.get("responseId") or f"gemini:{MODEL}"


def selftest():
    """Offline: mocked responses through parse, cap, and generate. No network, no key."""
    import tempfile
    from PIL import Image
    global _key, _post, USAGE, DAILY_CAP
    buf = io.BytesIO(); Image.new("RGB", (4, 6), (255, 0, 255)).save(buf, "PNG")
    ok = {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png",
                                                               "data": base64.b64encode(buf.getvalue()).decode()}}]},
                          "finishReason": "STOP"}], "responseId": "r1"}
    assert parse(ok)[0] == buf.getvalue()
    assert parse({"promptFeedback": {"blockReason": "SAFETY"}}) == (None, "prompt blocked (SAFETY)")
    assert parse({"candidates": [{"finishReason": "IMAGE_SAFETY"}]})[1] == "no image returned (IMAGE_SAFETY)"
    saved = (_key, _post, USAGE, DAILY_CAP)
    with tempfile.TemporaryDirectory() as d:
        try:
            _key, USAGE, DAILY_CAP = "test", Path(d) / "u.json", 1
            _post = lambda body, key: ok   # noqa: E731
            out = Path(d) / "x.png"
            assert generate("p", out) == "r1" and Image.open(out).size == (4, 6)
            try:
                generate("p", out); raise AssertionError("cap not enforced")
            except RuntimeError as e:
                assert "quota" in str(e)
            DAILY_CAP = 5
            _post = lambda body, key: {"candidates": [{"finishReason": "IMAGE_SAFETY"}]}   # noqa: E731
            try:
                generate("p", out, label="x"); raise AssertionError("block not raised")
            except RuntimeError as e:
                assert "job not completed" in str(e) and "IMAGE_SAFETY" in str(e)
            assert json.loads(USAGE.read_text())[datetime.date.today().isoformat()]["images"] == 1
        finally:
            _key, _post, USAGE, DAILY_CAP = saved
    print("gemini_image selftest ok")


if __name__ == "__main__":
    selftest()
