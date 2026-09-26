#!/opt/homebrew/bin/python3
"""Self-check for the sprite QA gate (scripts/sprite_qa.py). Synthetic images, no network.

  python3 scripts/check_sprite_qa.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprite_qa as Q  # noqa: E402
import sprite_spec as SPEC  # noqa: E402

OUT = (24, 16, 32)
SKIN_FAIR = (241, 180, 145)
SKIN_DARK = (92, 58, 38)
SHIRT = (40, 70, 140)
PANTS = (30, 30, 40)
HAIR = (60, 40, 30)


def person(canvas, x0, y0, h, skin=SKIN_FAIR, shirt=SHIRT):
    """Draw a crude standing person into an RGBA array (head narrower than the body)."""
    head_h, head_w, body_w = h // 5, max(3, h // 7), max(5, h // 4)
    cx = x0 + body_w // 2
    canvas[y0: y0 + head_h // 3, cx - head_w // 2: cx + head_w // 2 + 1] = HAIR + (255,)
    canvas[y0 + head_h // 3: y0 + head_h, cx - head_w // 2: cx + head_w // 2 + 1] = skin + (255,)
    canvas[y0 + head_h: y0 + int(h * 0.6), x0: x0 + body_w] = shirt + (255,)
    canvas[y0 + int(h * 0.6): y0 + h, x0 + 1: x0 + body_w - 1] = PANTS + (255,)


def raw_img(people, w=400, h=600):
    a = np.zeros((h, w, 4), np.uint8)
    for (x, y, ph) in people:
        person(a, x, y, ph)
    return a


def sheet_img(skin=SKIN_FAIR, shirt=SHIRT):
    f = np.zeros((48, 32, 4), np.uint8)
    person(f, 10, 2, 45, skin=skin, shirt=shirt)
    # outline ring
    solid = f[..., 3] > 0
    ring = np.zeros_like(solid)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        ring |= np.roll(solid, (dy, dx), (0, 1))
    ring &= ~solid
    f[ring] = OUT + (255,)
    return Image.fromarray(np.concatenate([f, f], axis=1), "RGBA")


def main():
    fails = 0

    def check(name, cond):
        nonlocal fails
        print(("ok   " if cond else "FAIL ") + name)
        fails += 0 if cond else 1

    one = raw_img([(150, 60, 480)])
    check("one person in the raw passes", Q.raw_checks(one) is None)
    two = raw_img([(40, 60, 480), (240, 60, 480)])
    check("two people in the raw are rejected", Q.raw_checks(two) is not None)
    touching = raw_img([(40, 60, 480), (240, 60, 480)])
    touching[530:540, 40:360] = PANTS + (255,)           # a ground line joining them (the Miscavige case)
    check("two touching people are still rejected", Q.raw_checks(touching) is not None)
    cropped = raw_img([(150, 0, 590)])
    check("a head cut by the top edge is rejected", Q.raw_checks(cropped) is not None)
    holed = raw_img([(150, 60, 480)])
    holed[160:520, 156:264] = 0                           # keying ate the dress (the Kardashian case)
    check("a keyed-out interior is rejected", Q.raw_checks(holed) is not None)

    good = sheet_img()
    check("a clothed sprite passes the sheet checks", Q.sheet_checks(good) is None)
    nude = sheet_img(shirt=SKIN_FAIR)
    check("a skin-coloured torso is rejected", Q.sheet_checks(nude) is not None)

    check("fair face in the fair band passes", Q.skin_band_check(Q._frame(good), "fair") is None)
    check("fair face drawn for a dark-brown subject is flagged", Q.skin_band_check(Q._frame(good), "dark brown") is not None)
    dark = sheet_img(skin=SKIN_DARK)
    check("dark face drawn for a fair subject is flagged", Q.skin_band_check(Q._frame(dark), "fair") is not None)
    check("dark face in the dark-brown band passes", Q.skin_band_check(Q._frame(dark), "dark brown") is None)

    ok, why = Q.gate(good, "a man", vision=False, skin=None)
    check("no recorded skin tone never passes the gate", ok is False)
    ok, why = Q.gate(good, "a man", vision=False, skin="dark brown")
    check("a skin mismatch fails the gate (no vision)", ok is False)
    ok, why = Q.gate(good, "a man", vision=False, skin="fair")
    check("a good sprite passes the gate (no vision)", ok is True)

    # Vision unavailable is never a pass.
    orig = Q.vision_check
    Q.vision_check = lambda *a, **k: (None, ["vision check unavailable: no API key"])
    ok, why = Q.gate(good, "a man", skin="fair")
    check("vision unavailable does not publish", ok is False)
    Q.vision_check = lambda *a, **k: (False, ["skin tone does not match"])
    ok, why = Q.gate(good, "a man", skin="fair")
    check("a vision skin failure rejects", ok is False)
    Q.vision_check = orig

    check("with_skin puts the band first and drops old skin words",
          SPEC.with_skin("tan skin, black suit", "dark brown").startswith("dark brown skin, black suit"))

    # Policy: the referral job never uploads a sprite that failed the gate.
    import referral_sprites as R
    uploads = []
    R.cli = lambda *a, **k: uploads.append(a) or ""
    R.S.process = lambda raw: good
    R.S.key_out = lambda im: one
    R.QA.gate = lambda *a, **k: (False, ["2 separate figures in one image"])
    R.remember_look = lambda *a, **k: None
    import tempfile
    tmp = Path(tempfile.mkdtemp())
    R.S.CACHE = tmp
    (tmp / "test-person.png").write_bytes(b"x")
    R.Image = type("I", (), {"open": staticmethod(lambda p: None)})
    try:
        R.draw({"slug": "test-person", "name": "Test Person", "look": "suit", "skin": "fair"}, 1)
        check("a failed gate raises instead of uploading", False)
    except R.FigureFailed:
        check("a failed gate raises FigureFailed", True)
    check("nothing was uploaded", not any("blobs:set" in a for a in uploads))
    check("the failed raw is dropped for a clean retry", not (tmp / "test-person.png").exists())

    print("ALL SPRITE QA CHECKS PASS" if not fails else f"{fails} FAILED")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
