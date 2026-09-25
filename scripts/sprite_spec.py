"""The avatar design system, encoded once (docs/avatar-design-system.md, style C "minimal").

scripts/sprites.py (single figures) and scripts/roster/grid.py (16 per image) both read
their prompt text and post-processing numbers from here, so a sprite drawn today and one
drawn by next month's roster run come out the same shape.
"""
import re

# ---- geometry: every sheet is two 32x48 frames; every BODY is exactly FIGURE_H tall ----
W, H = 32, 48
FIGURE_H = 45          # rows the body occupies before the outline; rule #1 is uniform height
MAX_W = W - 2          # width budget inside the outline; a wider prop is trimmed, never shrinks the body
COLOURS = 12           # 11 fills + the one house outline ink
MAX_PARTS = 1          # connected shapes per frame: a prop must touch the body
SPECK_PX = 24          # floating bits this small (sparkles, stars) are erased, not failed

# ---- the look of the house style ----
STYLE = (
    "minimalist pixel art sprite, slim natural proportions: head about one quarter of total height "
    "(about 4 heads tall), simple blocky shapes, limited 12-colour palette with one shade step for skin and "
    "hair, flat two-tone shading with no highlights and no small details: only the silhouette, the hair, "
    "the signature outfit colours and one simple prop. Standing, front three-quarter view facing slightly "
    "left, arms relaxed, feet together on one baseline. The prop is HELD IN ONE HAND, touching the body, "
    "held vertically or close to the chest, never floating, never detached and never wider than the "
    "shoulders plus one hand. Chunky visible pixels as if drawn on a 32x48 pixel grid, 1-pixel dark "
    "outline, no anti-aliasing, no dithering, entire body visible head to feet"
)
BACKGROUND = ("on a perfectly flat solid pure magenta (#FF00FF) background, no backdrop, no scenery, "
              "no shadow, no ground, no text")

# Single figure. {look} only: names trip the public-figure filter and add nothing at 32px.
SINGLE_PROMPT = "Full-body " + STYLE + ". The character: {look}. Single character centered with margin, " + BACKGROUND + "."

# One cell of a 4x4 sheet; grid.py wraps these in the sheet instructions.
GRID_STYLE = ("Every character: full-body " + STYLE + ". All sixteen share one consistent art style and "
              "exactly the same height.")

# ---- looks: props in hand, no exaggeration ----
_SIZE_WORDS = re.compile(r"\b(oversized|huge|enormous|giant|gigantic)\s+", re.I)
_RAISED = re.compile(r"\bholding up\b|\braised holding\b", re.I)
HAND_RULE = "every prop held in one hand close to the body"


def normalize_look(look):
    """Old LOOKS drew props 'oversized, about as big as the head' for the chibi style.
    The house style wants them held and in proportion: strip the size words, and say so."""
    if not look:
        return look
    out = _SIZE_WORDS.sub("", look)
    out = _RAISED.sub("holding", out)
    out = re.sub(r"\s{2,}", " ", out).strip().rstrip(".")
    if HAND_RULE not in out:
        out += ", " + HAND_RULE
    return out
