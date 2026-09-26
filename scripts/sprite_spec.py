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
BACKGROUNDS = {"magenta": "pure magenta (#FF00FF)", "green": "pure bright green (#00FF00)", "cyan": "pure cyan (#00FFFF)"}
BACKGROUND_TMPL = ("on a perfectly flat solid {bg} background, no backdrop, no scenery, "
                   "no shadow, no ground, no text")
BACKGROUND = BACKGROUND_TMPL.format(bg=BACKGROUNDS["magenta"])

# Single figure. {look} only: names trip the public-figure filter and add nothing at 32px.
SINGLE_PROMPT = "Full-body " + STYLE + ". The character: {look}. Single character centered with margin, " + BACKGROUND + "."
# Retries after a failed QA gate (scripts/sprite_qa.py): insist on one clothed person, and move
# off magenta so a pink or skin-toned outfit can't be keyed out.
RETRY_EMPHASIS = ("ONE single person alone in the image, never two, no second character, no reflection, "
                  "fully clothed in the described outfit")


def single_prompt(look, attempt=1):
    bg = BACKGROUNDS["magenta"] if attempt <= 1 else (BACKGROUNDS["green"] if attempt == 2 else BACKGROUNDS["cyan"])
    extra = "" if attempt <= 1 else RETRY_EMPHASIS + ". "
    return ("Full-body " + STYLE + ". The character: " + look + ". " + extra +
            "Single character centered with margin, " + BACKGROUND_TMPL.format(bg=bg) + ".")

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


# ---- skin tone: a hard likeness requirement (2026-09-26: MLK drawn light, Lincoln dark) ----
# Every subject has a band (scripts/skin.json, grounded in the Wikipedia lead image). The band goes
# into every prompt, into the vision check, and the gate compares the sprite's face lightness (CIE L*)
# against the band's range. Ranges overlap on purpose: the check catches wrong, not slightly off.
SKIN_BANDS = ["very fair", "fair", "medium", "olive", "light brown", "brown", "dark brown", "very dark"]
# Lightness order for comparing bands: olive is a hue beside medium, not a step darker.
SKIN_ORDER = {"very fair": 0, "fair": 1, "medium": 2, "olive": 2.5, "light brown": 3, "brown": 4, "dark brown": 5, "very dark": 6}
SKIN_L = {                      # acceptable face L* on the finished 12-colour sprite
    "very fair": (64, 100), "fair": (60, 100), "medium": (46, 88), "olive": (46, 84),
    "light brown": (38, 76), "brown": (20, 66), "dark brown": (14, 56), "very dark": (8, 48),
}
SKIN_PHRASE = {
    "very fair": "very fair pale skin", "fair": "fair light skin", "medium": "medium skin tone",
    "olive": "olive skin", "light brown": "light brown skin", "brown": "brown skin",
    "dark brown": "dark brown skin", "very dark": "very dark brown skin",
}
_SKIN_WORDS = re.compile(r"\b(skin|complexion)\b", re.I)


def with_skin(look, band):
    """Put the recorded skin band at the front of the look, replacing any skin words the look had."""
    if not band or band not in SKIN_PHRASE:
        return look
    parts = [p for p in (look or "").split(",") if not _SKIN_WORDS.search(p)]
    return ", ".join([SKIN_PHRASE[band]] + [p.strip() for p in parts if p.strip()])
