#!/usr/bin/env python3
"""Holding Pen sprite pipeline: famous figure name -> 32x48 two-frame walk sheet.

  python3 scripts/sprites.py "Albert Einstein" "Marie Curie" Socrates
  python3 scripts/sprites.py --all                 # every FAMOUS_FIGURES name in src/
  python3 scripts/sprites.py --reprocess --all     # re-run post-processing on cached raws, zero credits
  python3 scripts/sprites.py --selftest            # offline asserts, no network

Per name: Higgsfield nano_banana_pro (1k, 2:3, ~2 credits) -> raw PNG cached in
~/.cache/hvi-sprites/<slug>.png -> chroma key -> crop -> 16-colour palette ->
mode-downsample to fit 30x45 -> derived walk frame -> 1px outline ->
public/sprites/<slug>.png (64x48) + manifest.json + 8x preview in docs/sprite-previews/
(+ _lineup.png and _walk.gif of every sprite at 3x pen scale).

Idempotent: a name whose sheet already exists is skipped. A name whose raw is
cached is reprocessed without spending credits.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sprites"
PREVIEW = ROOT / "docs" / "sprite-previews"
CACHE = Path(os.environ.get("HVI_SPRITE_CACHE", Path.home() / ".cache" / "hvi-sprites"))
MODEL = "nano_banana_pro"
W, H = 32, 48
COLOURS = 16
OUTLINE = (24, 16, 32, 255)  # one ink colour for every figure, so the pen reads as one set
KEY = (255, 0, 255)       # magenta: no famous outfit or glowing prop is magenta
FINE_COLOURS = 48         # pre-quantize before voting
INK = -2                  # cell index meaning "outline ink"
INK_MAX = 32              # raw pixel with every channel below this is linework
INK_FRAC = 0.34           # share of a cell that must be linework to become ink
ACCENT_SAT = 0.55         # vivid ...
ACCENT_SHARE = 0.04       # ... and rare (< 4% of the figure) = signature-prop colour
ACCENT_FRAC = 0.22        # share of a cell an accent needs to claim it
HOUSE_PALETTE = None      # optional fixed palette (list of RGB) every figure snaps to

# At 32px a face carries nothing. Silhouette, hair, outfit, colour, one prop.
LOOKS = {
    "albert-einstein": "wild untamed white hair sticking out in all directions, bushy white mustache, baggy grey wool cardigan sweater over a white shirt, brown baggy trousers, holding a stick of white chalk",
    "marie-curie": "dark brown hair pulled up in a bun, long charcoal-black high-collared Victorian dress to the ankles with grey fold highlights, one arm raised holding up a glass flask of bright glowing radioactive cyan-green liquid with a few hard-edged pixel sparkles around it",
    "socrates": "bald on top with curly grey hair at the sides, big full bushy grey beard, snub nose, stocky, wearing a plain white ancient Greek toga (himation) wrapped around the body and over the left shoulder, brown leather sandals, right arm raised high with the index finger pointing straight up at the sky, the lecturing gesture from David's painting The Death of Socrates",
    "princess-diana": "short voluminous feathered golden-blonde hair swept to the side, wearing an oversized sparkling silver diamond tiara on top of the hair, a white pearl choker necklace, elegant off-the-shoulder midnight-blue velvet evening gown falling straight to the ankles, long white opera gloves, one hand held gracefully at the waist",
    "mansa-musa": "dark brown skin, tall pointed golden crown, short black beard, long flowing white robe with wide gold embroidered trim reaching the ankles, a golden sceptre in one hand and the other hand raised holding up a huge shining gold nugget, as in the 1375 Catalan Atlas portrait of the king of Mali",
    "martin-shkreli": "slim young man, short messy dark brown hair, grey zip-up hoodie over a black t-shirt, dark blue jeans, white sneakers, both hands holding up an oversized ornate engraved silver jewellery-box album case (the one-of-a-kind Wu-Tang Clan album), plain metal with no lettering",
    "bernie-madoff": "older man, short neat combed-back silver-white hair, dark navy pinstripe business suit, white shirt, navy tie, black dress shoes, one hand holding a long curling strip of white stock-market ticker tape that loops out oversized in front of him, Wall Street financier look",
    "elizabeth-holmes": "slim woman, long straight blonde hair worn down past the shoulders, black high-neck turtleneck sweater, black slim trousers, black flats, one hand raised holding up an oversized tiny-looking empty clear glass sample vial with a bright red cap, the Silicon Valley startup founder magazine-cover pose",
    "harvey-weinstein": "large heavyset man with a broad round silhouette, short messy dark hair greying at the sides, dark stubble, black tuxedo with white shirt and black bow tie, black shoes, holding up an oversized shiny golden film-award statuette, Hollywood movie producer at an awards night",
    "joe-jackson": "tall stern older man, dark brown skin, thin black mustache, black cowboy hat with a wide brim, sharp charcoal three-piece suit with a gold watch chain, black shoes, holding up an oversized shiny gold record disc, 1970s music manager of the Jackson 5",
    "pablo-escobar": "stocky man, curly black hair, thick black mustache, light-blue short-sleeve polo shirt, blue jeans, white sneakers, holding an oversized classic black-and-white football (soccer ball) under one arm, 1980s Medellin football-club patron look",
    "oj-simpson": "tall athletic man, dark brown skin, short black hair, 1970s Buffalo Bills American football uniform: royal blue jersey with red and white shoulder stripes and no numbers, white pants, blue socks, holding an oversized white football helmet with a red stripe under one arm",
    "aaron-hernandez": "tall muscular young man, light brown skin, short black buzz-cut hair, New England Patriots American football uniform: navy blue jersey with red and white shoulder trim and no numbers, silver pants, navy socks, holding an oversized brown American football in one hand",
    "aretha-franklin": "full-figured woman, dark brown skin, short black curled hair, wearing the famous grey felt hat with an enormous oversized sparkling rhinestone-edged grey bow on the front, long elegant grey coat to the ankles, holding a vintage silver microphone, the Queen of Soul",
    "oprah-winfrey": "big voluminous shoulder-length wavy dark brown hair with caramel highlights, warm brown skin, royal purple talk-show host pantsuit with padded shoulders, gold hoop earrings, black heels, one arm raised in a cheerful wave, the other hand holding up an oversized shiny gold microphone",
    "bruce-lee": "short neat black hair, lean muscular build, bright yellow full-body jumpsuit with a thick black stripe running down each side of the arms and legs, black-and-yellow sneakers, standing in a confident martial-arts ready stance with both fists raised in front of the chest",
    "stephen-hawking": "short brown hair, large rectangular glasses, slim figure in a dark navy suit jacket over a light blue shirt, sitting in a big black electric wheelchair with chunky wheels and a small grey computer screen on the armrest, a glowing blue-purple spiral galaxy floating beside his head",
    "grace-hopper": "short curly white-grey hair, rimless glasses, dark navy-blue US Navy officer's uniform with gold sleeve stripes and brass buttons, white shirt and black tie, navy skirt to the knee, black shoes, holding up an oversized glowing green computer punch card in one hand",
    "mao-zedong": "stocky, slicked-back black hair with a high receding hairline, grey-green high-buttoned Mao suit tunic with four patch pockets and matching baggy trousers, black cloth shoes, one arm raised in a stiff formal wave, a small bright red star badge pinned on the chest",
    "winston-churchill": "stout round rotund build, bald head with wisps of ginger-grey hair, black bowler hat, black three-piece suit with a grey waistcoat and gold watch chain, white shirt with a navy polka-dot bow tie, a big fat cigar in the mouth, one hand raised high making a V for victory sign with two fingers",
    "george-orwell": "tall very thin gaunt figure, dark brown hair combed back, pencil-thin mustache, shabby brown tweed jacket with elbow patches over a dark shirt and knitted tie, baggy grey flannel trousers, holding an oversized red hardback book with a big black number 1984 printed on the cover",
    "marcus-aurelius": "curly brown hair, full curly brown beard, Roman emperor in a white tunic under a deep crimson-purple toga draped over one shoulder, a golden laurel wreath on the head, brown sandals, holding an oversized open parchment scroll of writing in both hands",
    "nikola-jokic": "very tall broad basketball player, short brown hair, light stubble, navy-blue basketball jersey with gold-yellow trim and a big yellow number 15, navy basketball shorts, white high-top sneakers, balancing an oversized orange basketball on one hand",
    "billie-holiday": "black hair slicked back in an updo with a big white gardenia flower tucked over one ear, warm brown skin, elegant long ivory-white 1940s satin evening gown to the floor, standing beside a tall oversized silver vintage microphone on a stand, singing",
    "jeffrey-epstein": "tall, thick swept-back grey-silver hair, pale skin, wearing a plain navy-blue crewneck sweater over a white collared shirt, grey slacks, dark loafers, one hand holding an oversized black leather-bound address book",
    "ghislaine-maxwell": "short dark brown bob haircut, pale skin, wearing a fitted black blazer over a white blouse, black trousers, black flats, a small pearl necklace, one hand holding an oversized black designer handbag",
    "babe-ruth": "big barrel-chested heavyset build, round belly, white New York Yankees pinstripe baseball uniform with thin navy pinstripes, navy pinstriped baseball cap, navy socks, black cleats, resting a huge oversized light-tan wooden baseball bat on one shoulder",
    "jason-kelce": "tall heavyset friendly build, long full bushy brown beard, shaggy brown hair, wearing a loose midnight-green football jersey with a big white number 62 and white sleeve stripes, grey sweatpants, sneakers, holding a big brown football in one hand, cheerful thumbs-up with the other",
    "caligula": "short curly light-brown Roman hair with a golden laurel wreath crown, clean shaven, young, wearing a white Roman toga with a wide purple border draped over a deep purple tunic, brown leather sandals, holding up a large gold Roman coin in one hand",
    "alan-turing": "slim build, short neat dark-brown side-parted 1940s hair, clean shaven, brown tweed sports jacket over a white shirt and dark tie, grey flannel trousers, holding up a large wide paper punched tape strip covered in black dots and ones and zeros, next to a tall grey metal computer cabinet with glowing orange valve lamps",
    "muhammad-ali": "tall slim athletic build, dark brown skin, short black hair, wearing a long white satin robe with black trim tied at the waist, white athletic shoes, holding up a huge shiny gold championship belt with a big round gold medallion above his head in celebration",
    "nelson-mandela": "elderly, short cropped grey-white hair, dark brown skin, wearing a loose colourful long-sleeved Madiba batik shirt in bright gold, orange and brown patterns, dark trousers, one fist raised in the air, the other hand holding a small open book",
    "ada-lovelace": "dark brown hair parted in the middle and pulled into looped braids over the ears, wearing a wide off-the-shoulder 1840s royal-blue satin ball gown with a full bell skirt to the floor and a white lace trim, holding up a large brass gear-wheel cog of Babbage's Analytical Engine",
    "martin-luther-king-jr": "dark brown skin, short black hair, thin black mustache, wearing a dark charcoal suit, white shirt and dark tie, standing at a wooden lectern podium with a microphone, one hand raised open-palm while giving a speech",
    "harriet-tubman": "dark brown skin, a plain white headwrap scarf tied around the head, long dark-brown 1860s dress with a white collar and a long skirt to the ankles, a grey wool shawl over the shoulders, holding up a large glowing brass oil lantern with warm yellow light, the North Star shining above",
    "leonardo-da-vinci": "elderly, very long flowing white hair and a very long flowing white beard down to the chest, dark-red Renaissance robe to the ankles with a black cap, holding up a large parchment sheet showing a sketch of a flying machine with wings",
    "cleopatra": "straight glossy black bob haircut with blunt bangs, a gold cobra uraeus headband on the forehead, heavy black eyeliner, wide gold and turquoise beaded collar necklace, long white linen Egyptian dress to the ankles with a gold belt, holding an oversized golden crook sceptre",
    "isaac-newton": "long curly shoulder-length white powdered 17th-century periwig, wearing a long dark-brown coat with a white cravat, brown breeches and white stockings, black buckled shoes, holding up a huge shiny bright-red apple in one hand",
    "queen-elizabeth-ii": "short tightly curled silver-white hair, wearing a matching bright turquoise wool coat and a round turquoise brimmed hat with a small flower, triple-strand white pearl necklace, white gloves, sensible black low-heeled shoes, an oversized black leather handbag hanging from her forearm",
    "tom-brady": "tall athletic build, short swept-back brown hair, navy blue American football jersey with red and white shoulder stripes and a white number 12, silver football pants, white socks, black cleats, one arm raised holding an oversized brown American football with white laces ready to pass",
    "shohei-ohtani": "tall lean athlete, short black hair under a royal blue Los Angeles Dodgers baseball cap, white Dodgers home baseball uniform with blue script and the number 17, blue belt, blue socks, holding an oversized light wooden baseball bat resting on his shoulder",
    "michael-jackson": "black fedora hat tilted forward over curly black shoulder-length hair, bright red leather jacket with many zippers and a V-shaped pattern over a white t-shirt, black trousers cropped at the ankle showing white socks and black loafers, one oversized sparkling white sequined glove on the raised hand, poised up on his toes in a dance pose",
    "madonna": "messy teased platinum blonde hair with a big black lace bow tied on top, 1980s outfit: black lace top under a cropped black jacket, layered silver crucifix-free bead necklaces, black mini skirt over black leggings, ankle boots, a stack of many oversized rubber bangle bracelets on one raised arm, holding a big silver stage microphone",
    "jfk": "thick side-parted reddish-brown hair with a full swoop at the front, slim charcoal-navy two-button suit, white shirt, thin dark navy tie, black shoes, one hand raised high in a friendly wave, holding a small American flag in the other hand",
    "prince": "big curly black hair, thin mustache, deep royal blue-violet ruffled Victorian-style long coat with gold buttons over a white frilly lace shirt, tight violet trousers, heeled boots, holding an oversized gold Love Symbol-shaped electric guitar",
    "henry-viii": "very broad stocky square body, short red-ginger beard, flat black Tudor cap with a white feather, enormous padded red and gold brocade doublet with huge puffed slashed sleeves, wide brown fur-trimmed overcoat, white hose, gold chain across the chest, hands on hips in the Holbein portrait pose, holding a large roasted turkey leg",
    "ronaldinho": "long curly black hair held back by a white headband, huge toothy smile, bright yellow Brazil national football shirt with green trim and the number 10, blue shorts, white socks, white football boots, balancing an oversized white football on one raised knee",
    "putin": "short stocky man, short thinning light-brown hair receding at the top, dark navy business suit, white shirt, burgundy tie, black shoes, standing stiffly with hands clasped in front, beside an oversized wooden podium with a microphone",
    "pel": "dark brown skin, short black hair, bright yellow Brazil national football shirt with a green collar and the number 10, blue shorts, white socks, black football boots, one fist punched up high in joyful goal celebration, an oversized black-and-white football at his feet",
    "keanu-reeves": "shoulder-length straight dark brown hair, short dark beard, long black leather trench coat reaching the ankles over black clothes, small black sunglasses, black boots, calmly holding a tiny cute beagle puppy in his arms",
    "nikola-tesla": "tall and very thin, slicked-back centre-parted black hair, thin black mustache, dark charcoal three-piece suit with a white wing collar and black bow tie, holding up a large Tesla coil crackling with bright electric-blue lightning arcs",
    "genghis-khan": "stocky, long drooping thin black mustache and wispy chin beard, tall conical Mongol hat with a thick brown fur brim and red top, long padded deep-red Mongol deel robe with gold trim and a wide gold sash, brown leather riding boots, one hand holding up a large shining golden paiza tablet",
    "mother-teresa": "small stooped elderly woman, white cotton sari with three bright blue stripes along the border, draped over the head as a veil and wrapped around the body, a small wooden cross pinned at the shoulder, brown sandals, hands pressed together in prayer holding a large string of brown wooden rosary beads",
    "mahatma-gandhi": "very thin elderly man, completely bald head, round wire-rimmed spectacles, white homespun khadi dhoti wrapped around the waist and a white shawl draped over one shoulder, bare thin arms and legs, brown sandals, holding a tall wooden walking staff taller than himself",
    "elon-musk": "tall broad-shouldered white man with fair skin, short dark brown hair, plain black t-shirt under a black blazer, dark jeans, black boots, holding up a big white-and-silver model rocket with a bright orange flame at its base",
    "taylor-swift": "tall and slender, long wavy honey-blonde hair with straight-cut bangs, sparkly sequined iridescent silver-blue bodysuit, knee-high glittering silver boots, holding a sparkly acoustic guitar",
    "kobe-bryant": "tall athletic, shaved head, thin goatee, purple and gold Los Angeles Lakers basketball jersey number 24, gold basketball shorts with purple trim, white sneakers, holding an orange basketball on one palm",
    "dennis-rodman": "tall and lean, short spiky hair dyed in bright rainbow stripes, red Chicago Bulls basketball jersey number 91 with black trim, red basketball shorts, black sneakers, holding an orange basketball under one arm",
    "sam-altman": "slim and short, short tousled brown hair, plain grey crewneck sweater over a white t-shirt collar, dark blue jeans, white sneakers, holding up a big glowing white chat speech bubble with three dots inside",
    "peter-thiel": "tall white man with fair skin, short neat greying light-brown hair, dark navy business suit with a white open-collar shirt and no tie, black dress shoes, holding up a big ivory-white chess king piece with a cross on top",
    "pablo-picasso": "stocky, completely bald head, blue-and-white horizontal striped Breton sailor shirt, loose beige trousers, espadrilles, holding a big wooden painter's palette covered in bright blobs of paint and a paintbrush",
    "kim-jong-un": "short and stocky round build, short black hair with the sides shaved very high and a flat top, dark charcoal buttoned high-collar Mao-style tunic suit and matching trousers, black shoes, one hand raised in a wave",
}
GENERIC_LOOK = "wearing their single most recognisable signature outfit and hairstyle, holding their one most iconic signature prop"

PROMPT = (
    "Full-body 16-bit pixel art video game sprite of {name}: {look}. "
    "Cute chibi proportions (big head about 40% of total height, about 2.5 heads tall), standing, front three-quarter view facing slightly left. "
    "The signature prop is drawn oversized, about as big as the head, so it still reads at tiny size. Chunky visible pixels as if drawn on a 32x48 pixel grid, limited 16-colour palette, "
    "flat cel shading with light from the top-left, 1-pixel dark outline around the whole figure, "
    "no anti-aliasing, no dithering. Single character centered, entire body visible head to feet with margin, "
    "on a perfectly flat solid pure magenta (#FF00FF) background, no shadow, no ground, no text."
)


def slug(name):
    # Same rule as the SPEC / Pen.jsx: lowercase, spaces -> '-', drop anything not [a-z0-9-].
    return re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-"))


# ---------- generation ----------

def generate(name, dest):
    prompt = PROMPT.format(name=name, look=LOOKS.get(slug(name), GENERIC_LOOK))
    cmd = ["higgsfield", "generate", "create", MODEL, "--prompt", prompt,
           "--resolution", "1k", "--aspect_ratio", "2:3", "--wait", "--json"]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if res.returncode != 0:
        raise RuntimeError(f"higgsfield failed for {name}: {res.stderr.strip() or res.stdout.strip()}")
    jobs = json.loads(res.stdout)
    job = jobs[0] if isinstance(jobs, list) else jobs
    if job.get("status") != "completed" or not job.get("result_url"):
        raise RuntimeError(f"higgsfield job not completed for {name}: {job.get('status')}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(job["result_url"], dest)
    (dest.with_suffix(".json")).write_text(json.dumps({"name": name, "job_id": job["id"], "prompt": prompt}, indent=2))


# ---------- processing ----------

def key_out(rgba):
    """Transparent wherever the pixel is close to the corner-sampled background colour."""
    a = np.asarray(rgba.convert("RGBA")).astype(np.int32)
    corners = np.concatenate([a[:8, :8], a[:8, -8:], a[-8:, :8], a[-8:, -8:]]).reshape(-1, 4)[:, :3]
    bg = np.median(corners, axis=0)
    rgb = a[..., :3]
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    # magenta spill on anti-aliased edges: red and blue both well above green
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # (also catches dark magenta fringe blended into the outline; a real purple like Prince's is bluer than this)
    spill = ((np.minimum(r, b) - g > 80) & (np.abs(r - b) < 70)) if bg[0] > 200 and bg[2] > 200 and bg[1] < 80 else np.zeros(r.shape, bool)
    alpha = np.where((dist < 110) | spill, 0, 255)
    a[..., 3] = alpha
    return a.astype(np.uint8)


def crop(a):
    ys, xs = np.nonzero(a[..., 3])
    assert len(ys), "nothing left after keying"
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def palette_indices(a, n=FINE_COLOURS):
    """Fine pre-quantize of opaque pixels so mode-voting sees clean colour classes.
    Returns (idx HxW with -1 = transparent, palette nx3)."""
    opaque = a[..., 3] > 0
    px = a[..., :3][opaque]
    strip = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB")
    q = strip.quantize(colors=n, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[: n * 3], dtype=np.uint8).reshape(-1, 3)
    idx = np.full(a.shape[:2], -1, dtype=np.int32)
    idx[opaque] = np.asarray(q).reshape(-1)
    return idx, pal


def accent_classes(idx, pal):
    """Fine colours that are vivid and rare: the glowing vial, the gold crown, the red tie.
    They win any cell they cover a quarter of, or the signature prop dissolves."""
    used, counts = np.unique(idx[idx >= 0], return_counts=True)
    total = counts.sum()
    rgb = pal[used].astype(float) / 255
    mx, mn = rgb.max(1), rgb.min(1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    keep = (sat > ACCENT_SAT) & (mx > 0.55) & (counts / total < ACCENT_SHARE)
    return set(used[keep].tolist())


def ink_mask(a):
    """The generator's own linework: near-black opaque pixels."""
    return (a[..., 3] > 0) & (a[..., :3].max(-1) < INK_MAX)


def mode_downsample(idx, ink, tw, th, coverage=0.45, ink_frac=INK_FRAC, accents=frozenset()):
    """Each target cell takes its most common palette index, transparent below coverage,
    INK (-2) when enough of the cell is linework, so eyes and inner lines survive."""
    h, w = idx.shape
    out = np.full((th, tw), -1, dtype=np.int32)
    ys = np.linspace(0, h, th + 1).astype(int)
    xs = np.linspace(0, w, tw + 1).astype(int)
    for j in range(th):
        for i in range(tw):
            sl = (slice(ys[j], max(ys[j + 1], ys[j] + 1)), slice(xs[i], max(xs[i + 1], xs[i] + 1)))
            cell = idx[sl].ravel()
            solid = cell[cell >= 0]
            if solid.size / max(cell.size, 1) < coverage:
                continue
            acc = [c for c in accents if (solid == c).any()]
            acc_hits = sum(int((solid == c).sum()) for c in acc)
            if acc and acc_hits / solid.size >= ACCENT_FRAC:
                out[j, i] = max(acc, key=lambda c: int((solid == c).sum()))
            elif ink[sl].sum() / solid.size >= ink_frac:
                out[j, i] = INK
            else:
                inked = ink[sl].ravel()[cell >= 0]
                rest = solid[~inked] if (~inked).any() else solid
                out[j, i] = np.bincount(rest).argmax()
    return out


def reduce_palette(f, pal, n=COLOURS - 1):
    """Ward-style greedy merge of the colours actually used, down to n (+ ink).
    Small saturated accents (the signature prop) survive because they are far from
    everything else; median cut would average them into the dress."""
    f = f.copy()
    for u in np.unique(f[f >= 0]):  # near-black fills are linework: fold into the one ink colour
        if pal[u].max() < INK_MAX:
            f[f == u] = INK
    used, counts = np.unique(f[f >= 0], return_counts=True)
    groups = [([u], pal[u].astype(float), c) for u, c in zip(used, counts)]
    while len(groups) > n:
        best = None
        for x in range(len(groups)):
            for y in range(x + 1, len(groups)):
                (_, cx, nx), (_, cy, ny) = groups[x], groups[y]
                cost = nx * ny / (nx + ny) * ((cx - cy) ** 2).sum()
                if best is None or cost < best[0]:
                    best = (cost, x, y)
        _, x, y = best
        (mx, cx, nx), (my, cy, ny) = groups[x], groups[y]
        merged = (mx + my, (cx * nx + cy * ny) / (nx + ny), nx + ny)
        groups = [g for k, g in enumerate(groups) if k not in (x, y)] + [merged]
    new_pal = np.array([g[1] for g in groups], dtype=np.uint8)
    remap = {m: k for k, g in enumerate(groups) for m in g[0]}
    g = f.copy()
    for old, new in remap.items():
        g[f == old] = new
    if HOUSE_PALETTE is not None:
        new_pal = snap_to_house(new_pal)
    return g, new_pal


def snap_to_house(pal):
    house = np.array(HOUSE_PALETTE, dtype=float)
    d = (((pal[:, None, :].astype(float) - house[None]) * [0.3, 0.59, 0.11]) ** 2).sum(-1)
    return house[d.argmin(1)].astype(np.uint8)


def fit(idx, ink, accents=frozenset(), max_w=W - 2, max_h=H - 3):
    """Scale to fit max_w x max_h: outline adds 1px each side, plus 1px headroom for the walk bob."""
    h, w = idx.shape
    s = min(max_w / w, max_h / h)
    return mode_downsample(idx, ink, max(1, round(w * s)), max(1, round(h * s)), accents=accents)


def place(small):
    """Centre horizontally, feet on the bottom inner row (row H-2), 1px outline room all round."""
    canvas = np.full((H, W), -1, dtype=np.int32)  # -1 transparent, INK outline, >=0 palette
    h, w = small.shape
    x0 = (W - w) // 2
    y0 = H - 1 - h
    canvas[y0:y0 + h, x0:x0 + w] = small
    return canvas


def walk_frame(f):
    """Derived frame 2: body bobs up 1px, the figure's left foot lifts 1px. No second generation."""
    ys, xs = np.nonzero(f != -1)
    top, bottom = ys.min(), ys.max()
    hip = top + int((bottom - top + 1) * 0.72)
    g = np.full_like(f, -1)
    g[top - 1:hip - 1] = f[top:hip]          # upper body up 1
    g[hip - 1:] = f[hip - 1:]                 # hip row duplicated so nothing tears
    cols = xs[ys >= hip]
    mid = (cols.min() + cols.max() + 1) // 2 if cols.size else W // 2
    g[hip:bottom, :mid] = f[hip + 1:bottom + 1, :mid]   # left leg up 1
    g[bottom, :mid] = -1
    return g


def outline(f):
    """Any transparent pixel 4-adjacent to the figure becomes ink."""
    solid = f != -1
    n = np.zeros_like(solid)
    n[1:] |= solid[:-1]; n[:-1] |= solid[1:]; n[:, 1:] |= solid[:, :-1]; n[:, :-1] |= solid[:, 1:]
    return n & ~solid


def render(f, pal):
    img = np.zeros((H, W, 4), dtype=np.uint8)
    solid = f >= 0
    img[solid, :3] = pal[f[solid]]
    img[solid, 3] = 255
    img[f == INK] = OUTLINE
    img[outline(f)] = OUTLINE
    return img


def process(raw_path):
    """Raw generation -> 64x48 RGBA sheet (PIL Image)."""
    a = crop(key_out(Image.open(raw_path)))
    idx, pal = palette_indices(a)
    small, pal = reduce_palette(fit(idx, ink_mask(a), accent_classes(idx, pal)), pal)
    f1 = place(small)
    f2 = walk_frame(f1)
    sheet = np.concatenate([render(f1, pal), render(f2, pal)], axis=1)
    return Image.fromarray(sheet, "RGBA")


def preview(sheet, dest, scale=8):
    bg = Image.new("RGBA", sheet.size, (236, 232, 222, 255))
    bg.alpha_composite(sheet)
    bg.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(dest)


def contact_sheet(slugs, scale=3, per_row=10):
    """Every sprite at pen scale on one sheet + an animated walk GIF, for eyeballing a batch."""
    slugs = [x for x in slugs if (OUT / f"{x}.png").exists()]
    if not slugs:
        return
    cw, ch = (W + 4) * scale, (H + 4) * scale
    rows = (len(slugs) + per_row - 1) // per_row
    cols = min(per_row, len(slugs))
    frames = []
    for fr in range(2):
        img = Image.new("RGBA", (cols * cw, rows * ch), (236, 232, 222, 255))
        for k, x in enumerate(slugs):
            cell = Image.open(OUT / f"{x}.png").crop((fr * W, 0, fr * W + W, H))
            cell = cell.resize((W * scale, H * scale), Image.NEAREST)
            img.alpha_composite(cell, ((k % per_row) * cw + 2 * scale, (k // per_row) * ch + 2 * scale))
        frames.append(img)
    frames[0].save(PREVIEW / "_lineup.png")
    frames[0].convert("RGB").save(PREVIEW / "_walk.gif", save_all=True,
                                  append_images=[frames[1].convert("RGB")], duration=260, loop=0)


# ---------- manifest / names ----------

def figure_names():
    src = ""
    for p in [ROOT / "src" / "figures.js", ROOT / "src" / "App.jsx"]:
        if p.exists():
            src = p.read_text()
            if "name:" in src:
                break
    return re.findall(r'name:\s*"([^"]+)"', src)


def update_manifest(slugs):
    path = OUT / "manifest.json"
    m = json.loads(path.read_text()) if path.exists() else {}
    for s in slugs:
        m[s] = {"frames": 2, "w": W, "h": H}
    path.write_text(json.dumps(dict(sorted(m.items())), indent=2) + "\n")


def run(names, force=False, reprocess=False):
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    done, failed = [], []
    for name in names:
        s = slug(name)
        sheet_path, raw = OUT / f"{s}.png", CACHE / f"{s}.png"
        if sheet_path.exists() and not (force or reprocess):
            print(f"skip   {s} (exists)")
            done.append(s)
            continue
        try:
            if force or not raw.exists():
                print(f"gen    {s} ...", flush=True)
                generate(name, raw)
            elif reprocess:
                print(f"reproc {s} (cached raw, 0 credits)")
            sheet = process(raw)
            sheet.save(sheet_path)
            preview(sheet, PREVIEW / f"{s}.png")
            done.append(s)
            print(f"ok     {s}")
        except Exception as e:  # one bad figure must not sink the batch
            failed.append((name, str(e)))
            print(f"FAIL   {s}: {e}", file=sys.stderr)
    update_manifest(done)
    contact_sheet(sorted(json.loads((OUT / "manifest.json").read_text())))
    if failed:
        print(f"{len(failed)} failed: {', '.join(n for n, _ in failed)}", file=sys.stderr)
    return done, failed


# ---------- self-check ----------

def selftest():
    assert slug("Albert Einstein") == "albert-einstein"
    assert slug("Martin Luther King Jr.") == "martin-luther-king-jr"
    assert slug("Kim Jong-un") == "kim-jong-un"
    assert slug("Pelé") == "pel"  # ASCII-only, matches the JS rule
    # synthetic raw: key-colour field, red body block, blue legs, black eye line
    a = np.zeros((600, 400, 3), np.uint8); a[:] = KEY
    a[50:400, 120:280] = (200, 40, 40)
    a[400:560, 130:190] = (40, 40, 200); a[400:560, 210:270] = (40, 40, 200)
    tmp = CACHE / "_selftest.png"; CACHE.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a).save(tmp)
    sheet = process(tmp); tmp.unlink()
    assert sheet.size == (2 * W, H) and sheet.mode == "RGBA"
    px = np.asarray(sheet)
    f1, f2 = px[:, :W], px[:, W:]
    assert f1[..., 3].any() and f2[..., 3].any()
    assert len({tuple(c) for c in px[px[..., 3] > 0][:, :3]}) <= COLOURS + 1
    assert (f1[-1, :, 3] > 0).any(), "frame 1 outline sits on the bottom row"
    assert not np.array_equal(f1, f2), "walk frame must differ"
    assert tuple(f1[np.nonzero(f1[..., 3])[0].min(), :, :][f1[np.nonzero(f1[..., 3])[0].min(), :, 3] > 0][0]) == OUTLINE
    ys = np.nonzero(f2[..., 3])[0]
    assert ys.min() == np.nonzero(f1[..., 3])[0].min() - 1, "frame 2 bobs up 1px"
    print("sprites selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*")
    ap.add_argument("--all", action="store_true", help="every name in FAMOUS_FIGURES")
    ap.add_argument("--force", action="store_true", help="regenerate even if cached (spends credits)")
    ap.add_argument("--reprocess", action="store_true", help="rebuild sheets from cached raws")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest(); sys.exit(0)
    names = figure_names() if args.all else args.names
    if not names:
        ap.error("give names or --all")
    _, failed = run(names, force=args.force, reprocess=args.reprocess)
    sys.exit(1 if failed else 0)
