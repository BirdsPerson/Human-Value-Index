#!/opt/homebrew/bin/python3
"""(SUPERSEDED 2026-10: public/og-image.png now comes from iridescent-site/scripts/cards.py; running this overwrites it.) The share card (public/og-image.png, 1200x630): the city at district zoom, the logo, and
five scores read live from src/figures.js so the numbers match the site on the day it is drawn.

  python3 scripts/og-card.py CITY.png FONT_DIR [OUT]

CITY.png: an element screenshot of the CITY canvas (#city?at=18:30, zoomed in once from FIT,
1600x900 viewport). FONT_DIR holds FiraMono-{Regular,Medium,Bold}.ttf (google/fonts, ofl/firamono).
This Mac's ffmpeg has no drawtext, so text is PIL.
"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
BG, FG, DIM, MUTE, LINE = "#0a0f0a", "#c8f5d8", "#86c9a0", "#5a9170", "#1f4a2c"
ACCENT, WARN, HARM = "#4ade80", "#fbbf24", "#f87171"
PICK = [("TUBMAN", "Harriet Tubman"), ("CURIE", "Marie Curie"), ("EINSTEIN", "Albert Einstein"),
        ("MUSK", "Elon Musk"), ("GENGHIS KHAN", "Genghis Khan")]

def scores():
    js = "import('./src/figures.js').then(m=>console.log(JSON.stringify(Object.fromEntries(m.FAMOUS_FIGURES.map(f=>[f.name,f.score])))))"
    return json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

def main(city_path, font_dir, out=ROOT / "public" / "og-image.png"):
    f = lambda w, s: ImageFont.truetype(str(Path(font_dir) / f"FiraMono-{w}.ttf"), s)
    W, H, SPLIT = 1200, 630, 430
    card = Image.new("RGB", (W, H), BG)

    # The city, right of the split, cropped to the Bowl, the Diamond, the Loop and HQ.
    city = Image.open(city_path).convert("RGB")
    cw, ch = W - SPLIT, H
    box_w = min(city.width, 1180); box_h = round(box_w * ch / cw)
    top = max(0, min(city.height - box_h, 70))
    city = city.crop((0, top, box_w, top + box_h)).resize((cw, ch), Image.LANCZOS)
    city = ImageEnhance.Brightness(city).enhance(1.12)
    card.paste(city, (SPLIT, 0))
    # Fade the city's left edge into the page so the column reads as one surface.
    fade = Image.new("L", (160, H))
    for x in range(160):
        ImageDraw.Draw(fade).line([(x, 0), (x, H)], fill=round(255 * (1 - x / 159) ** 1.6))
    card.paste(Image.new("RGB", (160, H), BG), (SPLIT, 0), fade)

    d = ImageDraw.Draw(card)
    x = 48
    d.rectangle([x, 50, x + 7, 150], fill=ACCENT)                      # the site's cursor bar
    d.text((x + 24, 42), "HUMAN VALUE", font=f("Bold", 50), fill=ACCENT)
    d.text((x + 24, 96), "INDEX", font=f("Bold", 50), fill=ACCENT)
    # Plain English for a stranger's feed: what it is, before the lore.
    d.text((x, 172), "A SATIRE. THE MACHINE SCORES HUMANS.", font=f("Regular", 17), fill=DIM)

    s = scores()
    y = 222
    d.line([(x, y - 12), (SPLIT - 20, y - 12)], fill=LINE, width=2)
    for label, name in PICK:
        v = s[name]
        col = ACCENT if v >= 700 else WARN if v >= 300 else HARM
        d.text((x, y), label, font=f("Medium", 26), fill=FG)
        num = f"{v:03d}"
        tw = d.textlength(num, font=f("Bold", 30))
        d.text((SPLIT - 20 - tw, y - 3), num, font=f("Bold", 30), fill=col)
        y += 46
    d.line([(x, y - 2), (SPLIT - 20, y - 2)], fill=LINE, width=2)

    d.text((x, 498), "HUNDREDS ASSESSED.", font=f("Bold", 28), fill=WARN)
    d.text((x, 534), "YOU'RE NEXT.", font=f("Bold", 28), fill=WARN)
    d.text((x, 584), "GET SCORED · SEE THE CITY · PLAY", font=f("Medium", 17), fill=DIM)
    d.rectangle([0, 0, W - 1, H - 1], outline=LINE, width=2)
    card.save(out, optimize=True)
    print(out, {n: s[n] for _, n in PICK})

if __name__ == "__main__":
    main(*sys.argv[1:])
