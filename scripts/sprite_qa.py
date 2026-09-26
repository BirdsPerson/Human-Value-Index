"""The sprite QA gate. Nothing reaches hvi-sprites or public/sprites without passing it.

Two layers:
  raw_checks(keyed)   on the keyed RAW generation, before processing: exactly one figure,
                      not cut off by the frame, keying didn't eat the figure's interior.
  sheet_checks(sheet) on the processed 64x48 sheet: the design-system rules
                      (sprites.validate_sheet), a distinct head at the top, and a torso that
                      isn't mostly bare skin (a nudity / keying failure).
  vision_check(...)   Claude Haiku looks at an 8x upscale with the look text: one fully
                      clothed full-body person, recognisable as the look.

Why: 2026-09-26 three referral sprites shipped broken: two people merged into one sprite
(Miscavige, Kardashian), a skin-toned dress keyed out so the figure read as unclothed
(Kardashian), and a blocky headless figure (Kelce). The referral job never validated.
"""
import base64
import io
import json
import os
import subprocess
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

import sprite_spec as SPEC

ROOT = Path(__file__).resolve().parent.parent
# Sonnet 5, not Haiku: on 2026-09-26 Haiku flipped skin verdicts between runs (Trump, Ellison) and missed
# Malcolm X drawn peach; Sonnet caught it and was consistent. The judge's reliability is the point.
VISION_MODEL = "claude-sonnet-5"
MAX_VISION_CHECKS = 3          # per figure, per run
BIG_PART = 0.35                # a second shape this big AND person-tall = a second figure
TALL_PART = 0.60               # ...at least this fraction of the main figure's height
HOLE_MAX = 0.30                # keyed-out holes inside the silhouette (arms-akimbo gaps run ~20%)
SKIN_TORSO_MAX = 0.55          # torso pixels matching the face colour
HEAD_RATIO_MAX = 0.85          # head band width vs body width: a head is narrower than the body


# ---------- shape helpers (no scipy on this Mac) ----------

def _components(mask):
    """(size, height) of 4-connected components, largest first."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        stack, n, ymin, ymax = [(y0, x0)], 0, y0, y0
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop(); n += 1
            ymin, ymax = min(ymin, y), max(ymax, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        sizes.append((n, ymax - ymin + 1))
    return sorted(sizes, reverse=True)


def _outside(mask):
    """Background reachable from the image border (so the rest of the non-mask is holes)."""
    h, w = mask.shape
    out = np.zeros_like(mask, dtype=bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1) if not mask[y, x]] + \
            [(y, x) for y in range(h) for x in (0, w - 1) if not mask[y, x]]
    for y, x in stack:
        out[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; stack.append((ny, nx))
    return out


def _small_mask(alpha, target_h=160):
    img = Image.fromarray((alpha > 0).astype(np.uint8) * 255)
    scale = target_h / img.height
    img = img.resize((max(1, round(img.width * scale)), target_h), Image.BOX)
    return np.asarray(img) > 127


def _side_by_side(m, ys, xs):
    """Two people standing side by side often touch (a ground line, overlapping hair), so a
    component count sees one. Look for a near-empty column valley that splits the upper body
    into two big masses; a pole or staff beside one person is far too light to count."""
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    upper = m[top: top + int((bot - top) * 0.85), left: right + 1]
    cols = upper.sum(0).astype(float)
    if cols.max() == 0 or len(cols) < 10:
        return None
    lo, hi = int(len(cols) * 0.2), int(len(cols) * 0.8)
    i = lo + int(np.argmin(cols[lo:hi]))
    total = cols.sum()
    if cols[i] <= 0.06 * cols.max() and cols[:i].sum() >= 0.25 * total and cols[i + 1:].sum() >= 0.25 * total:
        return "two people side by side in one image"
    return None


# ---------- layer 1: raw ----------

def raw_checks(keyed):
    """keyed: RGBA array from sprites.key_out(). Reason string, or None."""
    alpha = keyed[..., 3]
    if not (alpha > 0).any():
        return "nothing left after keying"
    m = _small_mask(alpha)
    parts = _components(m)
    (main, main_h) = parts[0]
    people = [p for p in parts if p[0] >= BIG_PART * main and p[1] >= TALL_PART * main_h]
    if len(people) >= 2:          # props (a wheelchair, a speech bubble, a mic stand) are short or light
        return f"{len(people)} separate figures in one image"
    ys, xs = np.nonzero(m)
    split = _side_by_side(m, ys, xs)
    if split:
        return split
    if ys.min() <= 0:              # feet on the bottom edge are normal for grid-cell crops; a head is not
        return "figure cut off at the top of the image"
    holes = ~m & ~_outside(m)
    filled = m.sum() + holes.sum()
    frac = holes.sum() / filled
    if frac > HOLE_MAX:
        return f"keying ate the figure interior ({frac:.0%} of the silhouette is holes)"
    return None


# ---------- layer 2: processed sheet ----------

def _frame(sheet):
    a = np.asarray(sheet.convert("RGBA"))
    return a[:, :SPEC.W]


def head_check(f1):
    solid = f1[..., 3] > 0
    ys, xs = np.nonzero(solid)
    top, bot = ys.min(), ys.max()
    hgt = bot - top + 1
    widths = solid.sum(1)
    head = widths[top + 1: top + max(3, hgt // 8)]            # just under the outline
    body = widths[top + int(hgt * 0.30): top + int(hgt * 0.55)]
    if not len(head) or not len(body):
        return "no head region"
    hw, bw = np.median(head), body.max()
    if hw < HEAD_RATIO_MAX * bw:
        return None
    # As wide as the body at the top: fine if a face is visible up there (arms raised over the
    # head, a hat); a block with no face colour in its top quarter is a cropped or headless figure.
    upper = f1[top: top + max(4, hgt // 4)]
    if any(_is_skin(px[:3]) for px in upper.reshape(-1, 4) if px[3]):
        return None
    return f"no distinct head (head {hw:.0f}px vs body {bw:.0f}px wide, no face colour)"


def _is_skin(rgb):
    r, g, b = (int(c) for c in rgb)
    # near-black (suits, outlines, dark hair shadows) is never skin; dark skin tones still qualify
    return r + g + b >= 170 and r > 70 and r >= g >= b - 10 and r - b >= 25 and r - g <= 90


def skin_check(f1):
    """If the torso and hips are mostly the face's colour, the figure reads unclothed."""
    solid = f1[..., 3] > 0
    ys, _ = np.nonzero(solid)
    top, bot = ys.min(), ys.max()
    hgt = bot - top + 1
    outline = tuple(SPEC_OUTLINE())
    face_band = f1[top + int(hgt * 0.05): top + int(hgt * 0.22)]
    counts = {}
    for px in face_band.reshape(-1, 4):
        if px[3] and tuple(px[:3]) != outline and _is_skin(px[:3]):
            counts[tuple(px[:3])] = counts.get(tuple(px[:3]), 0) + 1
    if not counts:
        return None                    # no readable face colour: the vision check decides
    face = np.array(max(counts, key=counts.get))
    torso = f1[top + int(hgt * 0.30): top + int(hgt * 0.75)]
    px = torso[torso[..., 3] > 0][:, :3].astype(int)
    px = px[(px != np.array(outline)).any(1)]
    if not len(px):
        return None
    near = (np.abs(px - face).sum(1) < 45).mean()
    if near > SKIN_TORSO_MAX:
        return f"torso reads as bare skin ({near:.0%} face-coloured)"
    return None


def SPEC_OUTLINE():
    # sprites.OUTLINE lives in sprites.py; mirrored here to avoid a circular import.
    return (24, 16, 32)


def sheet_checks(sheet, validate_sheet=None):
    if validate_sheet:
        r = validate_sheet(sheet)
        if r:
            return r
    f1 = _frame(sheet)
    if not (f1[..., 3] > 0).any():
        return "empty sheet"
    return head_check(f1) or skin_check(f1)


# ---------- layer 3: vision ----------

_KEY = None


def anthropic_key():
    """Production key from the Netlify env, held in this process only (never written)."""
    global _KEY
    if _KEY is None:
        _KEY = os.environ.get("ANTHROPIC_API_KEY") or ""
        if not _KEY:
            res = subprocess.run(["netlify", "env:get", "ANTHROPIC_API_KEY", "--context", "production"],
                                 cwd=ROOT, capture_output=True, text=True, timeout=60)
            _KEY = res.stdout.strip() if res.returncode == 0 else ""
    return _KEY


VISION_PROMPT = (
    "You are a quality checker for a game's pixel-art sprites of real historical and public figures. You judge "
    "only whether the rendering is correct, not whether the person should be depicted.\n"
    "This is a tiny pixel-art game sprite (shown upscaled). Intended character: {look}\n\n"
    "Report what you SEE, as JSON only, with these keys:\n"
    '  "people": how many separate human bodies (each with its own head, torso and legs) are drawn. Objects the '
    "person holds or stands beside (staff, paddle, pole, podium, instrument, bag, machine, chair, statue-like prop) are not people.\n"
    '  "clothed": true unless the figure reads as nude, in underwear or with an exposed torso.\n'
    '  "full_body": true if the whole body is visible head to feet with a head and face area (a person seated '
    "in a wheelchair or chair counts, and a floor-length gown or robe hiding the feet counts; fail only when the "
    "frame cuts the figure off).\n"
    '  "outfit_matches": true if the outfit, hair and prop plausibly match the intended character at this tiny size '
    "(pixel-art simplification is fine; only a clearly different outfit colour or garment fails).\n"
    '  "face_colour_natural": false only if the face is grey, green, blue, white-as-paper or another non-human colour. '
    "Warm, peachy or stylised shading is natural.\n"
    '  "drawn_skin": the skin band the drawn face and hands look like, one of: ' + " | ".join(SPEC.SKIN_BANDS) + ".\n"
    '  "reasons": up to 3 short notes.\n'
    "Answer with the JSON object only."
)
# Code, not the model, decides a skin mismatch: the drawn band must sit within SKIN_TOLERANCE steps of the
# recorded band, in lightness steps (SKIN_ORDER). Up to two steps (fair vs medium, medium vs brown) is
# pixel-art shading and reader noise; three or more (fair drawn brown, brown drawn fair) is the likeness error
# that must never ship.
SKIN_TOLERANCE = 2


def vision_check(sheet, look, key=None, skin=None):
    """(pass, reasons). No key or an API failure returns (None, [why]): callers treat None as
    not-passed, so an unreachable API never publishes an unchecked sprite."""
    key = key or anthropic_key()
    if not key:
        return None, ["vision check unavailable: no API key"]
    f1 = Image.fromarray(_frame(sheet), "RGBA")
    bg = Image.new("RGBA", f1.size, (236, 232, 222, 255))
    bg.alpha_composite(f1)
    big = bg.convert("RGB").resize((f1.width * 8, f1.height * 8), Image.NEAREST)
    buf = io.BytesIO(); big.save(buf, "PNG")
    body = {
        "model": VISION_MODEL, "max_tokens": 400, "thinking": {"type": "disabled"},
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                         "data": base64.b64encode(buf.getvalue()).decode()}},
            {"type": "text", "text": VISION_PROMPT.format(look=look or "a person in ordinary clothes")},
        ]}],
    }
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                                          "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
    except Exception as e:  # noqa: BLE001
        return None, [f"vision check failed: {str(e)[:120]}"]
    text = "".join(b.get("text", "") for b in data.get("content", []))
    try:
        j = json.loads(text[text.index("{"): text.rindex("}") + 1])
    except Exception:  # noqa: BLE001
        return None, [f"vision check unreadable: {text[:120]}"]
    fails = []
    if int(j.get("people", 1) or 0) != 1:
        fails.append(f"{j.get('people')} people drawn, expected exactly one")
    if j.get("clothed") is False:
        fails.append("figure reads as unclothed")
    if j.get("full_body") is False:
        fails.append("not a full body with a head")
    if j.get("outfit_matches") is False:
        fails.append("outfit does not match the look")
    if j.get("face_colour_natural") is False:
        fails.append("unnatural face colour (grey/green/blue)")
    drawn = j.get("drawn_skin")
    if skin in SPEC.SKIN_BANDS and drawn in SPEC.SKIN_BANDS:
        d = abs(SPEC.SKIN_ORDER[drawn] - SPEC.SKIN_ORDER[skin])
        if d > SKIN_TOLERANCE:
            fails.append(f"skin tone mismatch: drawn {drawn}, subject is {skin}")
    notes = [str(x) for x in (j.get("reasons") or [])][:3]
    return (not fails), (fails + notes if fails else [f"drawn skin: {drawn}"] + notes)


# ---------- the gate ----------

def gate(sheet, look, keyed=None, validate_sheet=None, vision=True, key=None, skin=None):
    """(ok, reasons). ok is True only when every layer passes.

    Skin tone: `skin` is the subject's recorded band (scripts/skin.json). No band, no pass: a real
    person is never drawn without one. Two independent skin checks must both pass: the head must
    hold a natural skin colour in the band (pixels), and the vision reading of the drawn skin must
    sit within SKIN_TOLERANCE bands of the recorded one (confirmed 2 of 3 when skin is the only
    failure, so one noisy reading neither ships a wrong skin tone nor blocks a right one)."""
    if keyed is not None:
        r = raw_checks(keyed)
        if r:
            return False, [r]
    r = sheet_checks(sheet, validate_sheet)
    if r:
        return False, [r]
    if not skin or skin not in SPEC.SKIN_L:
        return False, ["no recorded skin tone for this subject: run scripts/skin_backfill.py first"]
    flag = skin_band_check(_frame(sheet), skin)
    if flag:
        return False, [flag]
    if not vision:
        return True, []
    ok, reasons = vision_consensus(sheet, look, key, skin)
    return ok is True, reasons


def vision_consensus(sheet, look, key=None, skin=None):
    ok, reasons = vision_check(sheet, look, key, skin)
    if ok is not False:
        return ok, reasons
    hard = [r for r in reasons if r.startswith(("figure reads", "not a full", "outfit does not", "unnatural"))
            or " people drawn" in r]
    skin_fail = any(r.startswith("skin tone mismatch") for r in reasons)
    if hard or not skin_fail:
        return ok, reasons
    mism = 1
    for _ in range(2):
        o2, r2 = vision_check(sheet, look, key, skin)
        mism += 1 if (o2 is False and any(r.startswith("skin tone mismatch") for r in r2)) else 0
    if mism >= 2:
        return False, reasons + [f"skin mismatch confirmed {mism}/3 readings"]
    return True, [f"skin mismatch not confirmed ({mism}/3 readings)"]


# ---------- skin tone ----------

def _lab_L(rgb):
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(v)) for v in rgb[:3])
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return 116 * (y ** (1 / 3) if y > 0.008856 else (7.787 * y + 16 / 116)) - 16


def face_colour(f1):
    """The sprite's face colour (r, g, b), or None when it can't be read.

    Head columns: the run of solid pixels under the crown that sits over the torso's centre (a peel,
    staff or raised arm beside the head is skipped). Face rows: 6%-20% of the figure's height.
    Hair is discounted by what covers the crown rows; clothing by what dominates the torso rows."""
    from collections import Counter
    solid = f1[..., 3] > 0
    ys, _ = np.nonzero(solid)
    top, bot = ys.min(), ys.max()
    hgt = bot - top + 1
    outline = SPEC_OUTLINE()

    def runs(row):
        xs = np.nonzero(row)[0]
        if not len(xs):
            return []
        out, start = [], xs[0]
        for a, b in zip(xs, xs[1:]):
            if b != a + 1:
                out.append((start, a)); start = b
        out.append((start, xs[-1]))
        return out

    torso_rows = solid[top + int(hgt * 0.35): top + int(hgt * 0.60)]
    tys, txs = np.nonzero(torso_rows)
    centre = txs.mean() if len(txs) else f1.shape[1] / 2
    head_row = top + max(2, int(hgt * 0.10))
    rs = runs(solid[head_row])
    if not rs:
        return None
    x0, x1 = min(rs, key=lambda r: abs((r[0] + r[1]) / 2 - centre))
    pad = 1 if x1 - x0 >= 4 else 0
    x0, x1 = x0 + pad, x1 - pad

    def px(y, x):
        return tuple(int(v) for v in f1[y, x, :3])

    face, crown, torso = Counter(), Counter(), Counter()
    for y in range(top + int(hgt * 0.06), top + int(hgt * 0.20) + 1):
        for x in range(x0, x1 + 1):
            if solid[y, x]:
                c = px(y, x)
                if c != outline and sum(c) >= 90:
                    face[c] += 1
    for y in range(top, top + max(2, int(hgt * 0.05)) + 1):
        for x in range(x0, x1 + 1):
            if solid[y, x]:
                crown[px(y, x)] += 1
    for y in range(top + int(hgt * 0.35), top + int(hgt * 0.60)):
        for x in np.nonzero(solid[y])[0]:
            torso[px(y, x)] += 1
    tot_t = sum(torso.values()) or 1
    scored = {c: n - 2 * crown.get(c, 0) - (n if torso.get(c, 0) / tot_t > 0.25 else 0) for c, n in face.items()}
    scored = {c: v for c, v in scored.items() if v >= 2}
    if not scored:
        return None
    return max(scored, key=scored.get)


def face_lightness(f1):
    """CIE L* of the face colour, or None."""
    c = face_colour(f1)
    return None if c is None else round(_lab_L(c), 1)


def face_hue_check(f1):
    """Skin in the house palette always runs red above green. A grey, green or yellow-olive face is a
    rendering error (seen: Stalin grey, Assad/Amodei yellow-olive, Saddam green)."""
    c = face_colour(f1)
    if c is None:
        return None
    r, g, b = c
    if max(c) - min(c) < 16:
        return f"unnatural grey face colour {c}"
    if r - g < 18:
        return f"unnatural green/yellow face colour {c}"
    return None


def _natural_skin(c):
    r, g, b = c
    return sum(c) >= 90 and max(c) - min(c) >= 16 and r - g >= 18 and r >= b


def head_colours(f1):
    """Colour counts in the lower head (rows 9%-22% of the figure, the run over the torso's centre)."""
    from collections import Counter
    solid = f1[..., 3] > 0
    ys, _ = np.nonzero(solid)
    top, bot = ys.min(), ys.max()
    hgt = bot - top + 1
    torso = solid[top + int(hgt * 0.35): top + int(hgt * 0.60)]
    _, txs = np.nonzero(torso)
    centre = txs.mean() if len(txs) else f1.shape[1] / 2
    cnt = Counter()
    for y in range(top + int(hgt * 0.09), top + int(hgt * 0.22) + 1):   # below the hairline: cheeks and chin
        xs = np.nonzero(solid[y])[0]
        if not len(xs):
            continue
        # contiguous run nearest the torso centre
        runs, start = [], xs[0]
        for a, b in zip(xs, xs[1:]):
            if b != a + 1:
                runs.append((start, a)); start = b
        runs.append((start, xs[-1]))
        x0, x1 = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - centre))
        for x in range(x0, x1 + 1):
            c = tuple(int(v) for v in f1[y, x, :3])
            if c != SPEC_OUTLINE():
                cnt[c] += 1
    return cnt


def skin_band_check(f1, band):
    """Reason string when the head holds no natural skin colour in the subject's band.

    Presence, not a face detector: at 32x48 hair, hats and beards defeat face-finding, but a correctly
    drawn head always contains a natural (red-over-green, non-grey) skin colour whose lightness sits
    in the subject's band, among the head's most common colours. Aretha drawn peach, MLK drawn light,
    Lincoln drawn dark, a grey or olive-green face: none has one."""
    if not band or band not in SPEC.SKIN_L:
        return "no recorded skin tone"
    cnt = head_colours(f1)
    if not cnt:
        return "no head found"
    skins = [(c, n) for c, n in cnt.most_common() if _natural_skin(c) and n >= 2]
    if not skins:
        top_c = cnt.most_common(1)[0][0]
        return f"no natural skin colour in the head (dominant {top_c}): grey, green or missing face"
    lo, hi = SPEC.SKIN_L[band]
    top_skins = skins[:3]
    if any(lo - 4 <= _lab_L(c) <= hi + 4 for c, _ in top_skins):
        return None
    Ls = ", ".join(f"{_lab_L(c):.0f}" for c, _ in top_skins)
    return f"skin tone mismatch: head skin L* {Ls} outside {band} range {lo}-{hi}"


_SKIN = None


def skin_of(slug):
    global _SKIN
    if _SKIN is None:
        p = Path(__file__).resolve().parent / "skin.json"
        _SKIN = json.loads(p.read_text()) if p.exists() else {}
    return (_SKIN.get(slug) or {}).get("band")
