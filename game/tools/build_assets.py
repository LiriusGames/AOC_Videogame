# Age of Comics: The Golden Years — videogame asset pipeline
# Converts the original board game art into 16-bit style spritesheets + JS atlas.
import os, json
from PIL import Image, ImageEnhance

_GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.environ.get("AOC_ASSETS", os.path.join(os.path.dirname(_GAME), "Assets"))
OUT = os.path.join(_GAME, "assets")
os.makedirs(OUT, exist_ok=True)

GENRES = ["scifi", "crime", "romance", "horror", "superheroes", "western"]

def retro(im, target_w, colors=24, sat=1.18, con=1.06, max_h=None):
    """Downscale + palette-quantize an image into a 16-bit looking sprite. Keeps alpha."""
    has_alpha = im.mode == "RGBA"
    ratio = target_w / im.width
    if max_h is not None and im.height * ratio > max_h:
        ratio = max_h / im.height
    size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
    im = im.resize(size, Image.LANCZOS)
    alpha = im.split()[3] if has_alpha else None
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    rgb = ImageEnhance.Contrast(rgb).enhance(con)
    q = rgb.quantize(colors, method=Image.MEDIANCUT).convert("RGB")
    if alpha is not None:
        # hard-edge alpha for a crisp pixel silhouette
        a = alpha.point(lambda v: 255 if v > 120 else 0)
        q = q.convert("RGBA")
        q.putalpha(a)
    return q

def crisp(im, target_w, max_h=None):
    """Resize only — NO palette crunch. Anything that functions as an ICON
    (tokens, coins, faces, genre marks) stays clean; the 16-bit treatment
    lives on the poster-scale surfaces (scenes, covers, vignettes)."""
    im = im.convert("RGBA")
    ratio = target_w / im.width
    if max_h is not None and im.height * ratio > max_h:
        ratio = max_h / im.height
    size = (max(1, round(im.width * ratio)), max(1, round(im.height * ratio)))
    out_c = im.resize(size, Image.LANCZOS)
    out_c.putalpha(out_c.split()[3].point(lambda v: 255 if v > 120 else 0))
    return out_c

def defringe(im):
    """Backfill the RGB under transparency with the art's average opaque
    color, keeping the true alpha — edge pixels then blend into art color
    instead of black during LANCZOS."""
    a = im.split()[3]
    solid = a.point(lambda v: 255 if v > 200 else 0)
    stat_src = Image.composite(im.convert("RGB"), Image.new("RGB", im.size), solid)
    px = [p for p, s in zip(stat_src.getdata(), solid.getdata()) if s]
    avg = tuple(sum(c[i] for c in px) // len(px) for i in range(3)) if px else (128, 128, 128)
    base = Image.new("RGBA", im.size, avg + (255,))
    base.alpha_composite(im)
    base.putalpha(a)
    return base

class Sheet:
    # fmt="webp" for the HD sheets: unquantized halftone art compresses ~8x
    # better as lossy webp than PNG (cardshd was 8.7MB); alpha is preserved.
    # The ext is recorded in SHEET_SIZES so ui-core/assets.js resolve the file.
    def __init__(self, name, cell_w, cell_h, cols, fmt="png"):
        self.name, self.cw, self.ch, self.cols, self.fmt = name, cell_w, cell_h, cols, fmt
        self.sprites = []  # (key, img)
        self.atlas = {}
    def add(self, key, img):
        self.sprites.append((key, img))
    def save(self):
        rows = (len(self.sprites) + self.cols - 1) // self.cols
        canvas = Image.new("RGBA", (self.cols * self.cw, rows * self.ch), (0, 0, 0, 0))
        for i, (key, img) in enumerate(self.sprites):
            # a sprite may never escape its cell: oversized ones would
            # overlap neighbours and/or clip at the sheet edge (this
            # corrupted the faces sheet once — 44px bosses in 28px cells)
            if img.width > self.cw or img.height > self.ch:
                print(f"  WARN {self.name}/{key}: {img.width}x{img.height} cropped to cell {self.cw}x{self.ch}")
                img = img.crop((0, 0, min(img.width, self.cw), min(img.height, self.ch)))
            x = (i % self.cols) * self.cw
            y = (i // self.cols) * self.ch
            # center inside cell
            ox = x + (self.cw - img.width) // 2
            oy = y + (self.ch - img.height) // 2
            canvas.paste(img, (ox, oy), img if img.mode == "RGBA" else None)
            self.atlas[key] = {"sheet": self.name, "x": ox, "y": oy, "w": img.width, "h": img.height}
        if self.fmt == "webp":
            canvas.save(os.path.join(OUT, self.name + ".webp"), quality=90, method=6)
        else:
            canvas.save(os.path.join(OUT, self.name + ".png"))
        print(self.name, canvas.size, len(self.sprites), "sprites")
        sheet_sizes[self.name] = {"w": canvas.width, "h": canvas.height}
        if self.fmt != "png":
            sheet_sizes[self.name]["ext"] = self.fmt
        return self.atlas

atlas = {}
sheet_sizes = {}

# ---------------------------------------------------------------- cards sheet
CARD_W = 72  # sprite width; the re-exported scans yield up to 72x106 covers
cards = Sheet("cards", 74, 108, 12)

ORIGINALS = [  # (id, file, genre, bonus, title)
    (1,  "Originals_1.png",  "western",     "fan",    "Kings of the Plains"),
    (2,  "Originals_2.png",  "western",     "ticket", "Outlaws"),
    (3,  "Originals_3.png",  "western",     "ideas",  "Hey Ranger"),
    (4,  "Western 4.png",    "western",     "money",  "Wild Annie"),
    (8,  "Originals_8.png",  "superheroes", "fan",    "Star-Spangled Duo!"),
    (9,  "Originals_9.png",  "superheroes", "ticket", "Angel of Liberty"),
    (10, "Originals_10.png", "superheroes", "ideas",  "Miss Tiger"),
    (11, "Originals_11.png", "superheroes", "money",  "Freedom Comics"),
    (15, "Originals_15.png", "scifi",       "fan",    "Stories of Tomorrow"),
    (16, "Originals_16.png", "scifi",       "ticket", "Future Wonder"),
    (17, "Originals_17.png", "scifi",       "ideas",  "Neptunio"),
    (18, "Originals_18.png", "scifi",       "money",  "Alien Worlds"),
    (22, "Originals_22.png", "romance",     "fan",    "Just a Feeling"),
    (23, "Originals_23.png", "romance",     "ticket", "Heartbreakers!"),
    (24, "Originals_24.png", "romance",     "ideas",  "Love Letter"),
    (25, "Originals_25.png", "romance",     "money",  "Teen Drama"),
    (29, "Originals_29.png", "horror",      "fan",    "Haunting Tales"),
    (30, "Originals_30.png", "horror",      "ticket", "True Terror"),
    (31, "Originals_31.png", "horror",      "ideas",  "It Lives"),
    (32, "Originals_32.png", "horror",      "money",  "Carmilla!"),
    (36, "Originals_36.png", "crime",       "fan",    "Killer Dames"),
    (37, "Originals_37.png", "crime",       "ticket", "Call the Police"),
    (38, "Originals_38.png", "crime",       "ideas",  "It's a Felony"),
    (39, "Originals_39.png", "crime",       "money",  "Gang Wars!"),
]
for oid, f, g, b, t in ORIGINALS:
    p = os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20_Originals\Front", f)
    im = Image.open(p)
    cards.add(f"orig_{oid}", retro(im, CARD_W, 28))
    # bare cover: strip the card frame + bonus banner -> looks like a real comic
    w, h = im.size
    cover = im.crop((round(w * .095), round(h * .125), round(w * .905), round(h * .955)))
    cards.add(f"cover_orig_{oid}", retro(cover, CARD_W, 28))

# rip-offs: 4 per genre, folder names use capitalized genre names
RIP_FOLDER = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
              "horror": "Horror", "superheroes": "Superheroes", "western": "Western"}
for g in GENRES:
    for i in range(1, 5):
        p = os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20A_Ripoffs\Front", f"{RIP_FOLDER[g]}_ripoff_{i}.png")
        im = Image.open(p).convert("RGBA")
        cards.add(f"rip_{g}_{i}", retro(im, CARD_W, 28))
        w, h = im.size
        cover = im.crop((round(w * .095), round(h * .125), round(w * .905), round(h * .955)))
        cards.add(f"cover_rip_{g}_{i}", retro(cover, CARD_W, 28))

CRE_FOLDER = {"crime": "Crime", "horror": "Horror", "romance": "Romance",
              "scifi": "Scifi", "superheroes": "Super", "western": "Western"}
for kind, sub in (("writer", r"#05_CARDS\#AOCTGY20B_Writers\Writers Front"),
                  ("artist", r"#05_CARDS\#AOCTGY20C_Artists\Artists Front")):
    prefix = "Writer" if kind == "writer" else "Artist"
    for g in GENRES:
        for suffix in ("1", "2", "2B", "3"):
            p = os.path.join(ASSETS, sub, f"{prefix} {CRE_FOLDER[g]} {suffix}.png")
            cards.add(f"{kind}_{g}_{suffix}", retro(Image.open(p), CARD_W, 24))

# backs
for g, f in (("scifi","scifi_back.png"),("crime","crime_back.png"),("romance","romance_back.png"),
             ("horror","horror_back.png"),("superheroes","superheroes_back.png"),("western","western_back.png")):
    cards.add(f"back_orig_{g}", retro(Image.open(os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20_Originals\Back", f)), CARD_W, 16))
for v in (1, 2, 3):
    cards.add(f"back_writer_{v}", retro(Image.open(os.path.join(ASSETS, rf"#05_CARDS\#AOCTGY20B_Writers\Writers Back\Writer back {v}.png")), CARD_W, 16))
    cards.add(f"back_artist_{v}", retro(Image.open(os.path.join(ASSETS, rf"#05_CARDS\#AOCTGY20C_Artists\Artists Back\Artist back 0{v}.png")), CARD_W, 16))
atlas.update(cards.save())

# ------------------------------------------------- print-era HD cards sheet
# The restyle shows covers and deck backs at paper size inside the panels:
# LANCZOS only, NO palette crunch — the halftone dots of the printed art ARE
# the period look. Stored at 3x the pixel cover; sprHD() in ui-core rescales
# call-site scales automatically, so the pixel sprites stay the board's face.
HD_W = 216
cardshd = Sheet("cardshd", 220, 312, 8, fmt="webp")
def hd_cover(im):
    w, h = im.size
    return im.crop((round(w * .095), round(h * .125), round(w * .905), round(h * .955)))
for oid, f, g, b, t in ORIGINALS:
    im = Image.open(os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20_Originals\Front", f)).convert("RGBA")
    cardshd.add(f"hd_cover_orig_{oid}", crisp(hd_cover(im), HD_W, max_h=308))
for g in GENRES:
    for i in range(1, 5):
        p = os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20A_Ripoffs\Front", f"{RIP_FOLDER[g]}_ripoff_{i}.png")
        cardshd.add(f"hd_cover_rip_{g}_{i}", crisp(hd_cover(Image.open(p).convert("RGBA")), HD_W, max_h=308))
for g, f in (("scifi","scifi_back.png"),("crime","crime_back.png"),("romance","romance_back.png"),
             ("horror","horror_back.png"),("superheroes","superheroes_back.png"),("western","western_back.png")):
    cardshd.add(f"hd_back_orig_{g}", crisp(Image.open(os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20_Originals\Back", f)).convert("RGBA"), HD_W, max_h=308))
for v in (1, 2, 3):
    cardshd.add(f"hd_back_writer_{v}", crisp(Image.open(os.path.join(ASSETS, rf"#05_CARDS\#AOCTGY20B_Writers\Writers Back\Writer back {v}.png")).convert("RGBA"), HD_W, max_h=308))
    cardshd.add(f"hd_back_artist_{v}", crisp(Image.open(os.path.join(ASSETS, rf"#05_CARDS\#AOCTGY20C_Artists\Artists Back\Artist back 0{v}.png")).convert("RGBA"), HD_W, max_h=308))
atlas.update(cardshd.save())

# --------------------------------------------------------------- tokens sheet
tokens = Sheet("tokens", 48, 48, 10)
IDEA_FILE = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
             "horror": "Horror", "superheroes": "Superheroes", "western": "Western"}
# the whole token family is ICONS at chip scale — crisp (resize-only), no
# palette crunch; idea coins store at 40px (they display up to ~40 on the
# café table, and used to be a 30px upscale)
for g in GENRES:
    p = os.path.join(ASSETS, r"#02_ROUND TOKENS\IDEAS", f"Ideas_{IDEA_FILE[g]}.png")
    tokens.add(f"idea_{g}", crisp(Image.open(p).convert("RGBA"), 40))
MASTERY = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
           "horror": "Horror", "superheroes": "Super", "western": "Western"}
for g in GENRES:
    p = os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY19_Mastery", f"Mastery_{MASTERY[g]}.png")
    tokens.add(f"mastery_{g}", crisp(Image.open(p).convert("RGBA"), 42))
for v in (1, 2, 5, 10):
    p = os.path.join(ASSETS, r"#02_ROUND TOKENS\COINS", f"${v}.png")
    tokens.add(f"coin_{v}", crisp(Image.open(p).convert("RGBA"), 26))
for v, f in ((1, "1 STAR PNG.png"), (2, "2 STARS PNG.png"), (3, "3 STARS PNG.png")):
    tokens.add(f"vp_{v}", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\VP", f)).convert("RGBA"), 28))
tokens.add("hype", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\Hype.png")).convert("RGBA"), 28))
tokens.add("ticket", crisp(Image.open(os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY18_Transport ticket\TicketPNG.png")).convert("RGBA"), 46))
tokens.add("bettercolor", crisp(Image.open(os.path.join(ASSETS, r"#03_TILES\#AOCTGY12_Better Color\better_color.png")).convert("RGBA"), 30))
# genre icons from order tile fronts
ORDER_FOLDER = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
                "horror": "Horror", "superheroes": "Superheroes", "western": "Western"}
for g in GENRES:
    p = os.path.join(ASSETS, rf"#03_TILES\#AOCTGY15_Orders\{ORDER_FOLDER[g]}", f"Order_{g}_front.png")
    tokens.add(f"gicon_{g}", crisp(Image.open(p).convert("RGBA"), 26))

# print-era HD twins of the whole token family (3x masters, webp) — spr()'s
# auto-HD serves these at every size, killing the fractional-scale crunch
tokenshd = Sheet("tokenshd", 142, 142, 7, fmt="webp")
for g in GENRES:
    tokenshd.add(f"hd_idea_{g}", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\IDEAS", f"Ideas_{IDEA_FILE[g]}.png")).convert("RGBA"), 120))
    tokenshd.add(f"hd_mastery_{g}", crisp(Image.open(os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY19_Mastery", f"Mastery_{MASTERY[g]}.png")).convert("RGBA"), 126))
    tokenshd.add(f"hd_gicon_{g}", crisp(Image.open(os.path.join(ASSETS, rf"#03_TILES\#AOCTGY15_Orders\{ORDER_FOLDER[g]}", f"Order_{g}_front.png")).convert("RGBA"), 78))
for v in (1, 2, 5, 10):
    tokenshd.add(f"hd_coin_{v}", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\COINS", f"${v}.png")).convert("RGBA"), 78))
for v, f in ((1, "1 STAR PNG.png"), (2, "2 STARS PNG.png"), (3, "3 STARS PNG.png")):
    tokenshd.add(f"hd_vp_{v}", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\VP", f)).convert("RGBA"), 84))
tokenshd.add("hd_hype", crisp(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\Hype.png")).convert("RGBA"), 84))
tokenshd.add("hd_ticket", crisp(Image.open(os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY18_Transport ticket\TicketPNG.png")).convert("RGBA"), 138))
tokenshd.add("hd_bettercolor", crisp(Image.open(os.path.join(ASSETS, r"#03_TILES\#AOCTGY12_Better Color\better_color.png")).convert("RGBA"), 90))
atlas.update(tokenshd.save())
# meeple recolored per player
meeple_src = Image.open(os.path.join(ASSETS, r"#06_CUSTOM SHAPED MEEPLES\#AOCTGY21_Meeple\Meeple.png")).convert("RGBA")
bbox = meeple_src.split()[3].getbbox()
meeple_src = meeple_src.crop(bbox)
PLAYER_COLORS = {"yellow": (245, 200, 110), "salmon": (229, 151, 122), "teal": (91, 165, 159), "brown": (142, 81, 78)}
for name, (r_, g_, b_) in PLAYER_COLORS.items():
    m = meeple_src.resize((round(22 * meeple_src.width / meeple_src.height), 22), Image.LANCZOS)
    a = m.split()[3].point(lambda v: 255 if v > 120 else 0)
    solid = Image.new("RGBA", m.size, (r_, g_, b_, 255))
    dark = Image.new("RGBA", m.size, (max(0, r_-70), max(0, g_-70), max(0, b_-70), 255))
    out_m = Image.composite(solid, Image.new("RGBA", m.size, (0, 0, 0, 0)), a)
    # 1px bottom-right shade for depth
    shifted = Image.new("L", m.size, 0); shifted.paste(a, (-1, -1))
    edge = Image.composite(dark, Image.new("RGBA", m.size, (0, 0, 0, 0)), Image.composite(Image.new("L", m.size, 0), a, shifted))
    out_m.alpha_composite(edge)
    tokens.add(f"meeple_{name}", out_m)
atlas.update(tokens.save())

# ----------------------------------------------------------------- staff sheet
# The Publisher rail shows editors as people, not meeples: four 1950s staffers
# (two men, two women) drawn as pixel maps and palette-swapped into each
# publishing house's colors. Grid legend: . transparent / O ink outline /
# S skin, T skin shade / H hair / C house color, D house dark (garment) /
# W white shirt or blouse / G gray trousers / K near-black (shoes, hat band).
STAFF_MAPS = [
    # 0 — man in a fedora and house-color suit, white shirt, dark tie
    """
....ODDDO....
...ODDDDDO...
...OKKKKKO...
.ODDDDDDDDDO.
..OOOOOOOOO..
...OSSSSSO...
...OSESESO...
...OTSSSTO...
....OSSSO....
...OWWWWWO...
..OCCWDWCCO..
.OCCCWDWCCCO.
.OCCCWDWCCCO.
.OCOCWWWCOCO.
.OCOCCCCCOCO.
.OTOCCCCCOTO.
..OODDDDDOO..
...ODDDDDO...
...ODDODDO...
...ODDODDO...
...OKKOKKO...
....OO.OO....
""",
    # 1 — woman with an updo, white blouse, house-color pencil skirt
    """
.............
....OHHHO....
...OHHHHHO...
..OHHHHHHHO..
..OHSSSSSHO..
..OHSESESHO..
..OHTSSSTHO..
...OSSSSSO...
....OSSSO....
...OWWWWWO...
..OWWWWWWWO..
.OWOWWWWWOWO.
.OWOWWWWWOWO.
.OTOWWWWWOTO.
..OODCCCDOO..
...OCCCCCO...
...OCCCCCO...
..OCCCCCCCO..
..OCCCCCCCO..
...OOSOSOO...
....OSOSO....
....OKOKO....
""",
    # 2 — man in shirtsleeves with house-color suspenders, gray trousers
    """
.............
.............
.............
....OHHHO....
...OHHHHHO...
...OHSSSHO...
...OSESESO...
...OTSSSTO...
....OSSSO....
...OWWWWWO...
..OWCWWWCWO..
.OWWCWWWCWWO.
.OWOCWWWCOWO.
.OWOCWWWCOWO.
.OTOWWWWWOTO.
..OODDDDDOO..
...OCCCCCO...
...OCCOCCO...
...OCCOCCO...
...OCCOCCO...
...OKKOKKO...
....OO.OO....
""",
    # 3 — woman with a bob cut in a house-color day dress, dark belt
    """
.............
.............
....OHHHO....
..OHHHHHHHO..
..OHHHHHHHO..
..OHSSSSSHO..
..OHSESESHO..
..OHTSSSTHO..
..OHHSSSHHO..
....OSSSO....
...OCCCCCO...
..OCCCCCCCO..
.OCOCCCCCOCO.
.OCOCDDDCOCO.
.OTOCCCCCOTO.
...OCCCCCO...
..OCCCCCCCO..
..OCCCCCCCO..
.OCCCCCCCCCO.
...OOSOSOO...
....OSOSO....
....OKOKO....
""",
]
# per-character skin + hair, for a mixed 1950s newsroom
STAFF_TONES = [
    {"S": (236, 188, 148), "T": (206, 152, 112), "H": (74, 50, 34)},    # light skin (hair unseen under hat)
    {"S": (150, 100, 66),  "T": (122, 76, 48),   "H": (28, 24, 24)},    # deep skin, black updo
    {"S": (196, 142, 96),  "T": (166, 112, 72),  "H": (32, 28, 28)},    # tan skin, black slick
    {"S": (240, 196, 160), "T": (210, 160, 120), "H": (146, 74, 42)},   # light skin, auburn bob
]
STAFF_FIXED = {"O": (26, 21, 18), "E": (30, 26, 24), "W": (244, 238, 222), "G": (108, 104, 100), "K": (34, 32, 32)}

def staff_sprite(map_txt, tones, house, house_dark, scale=2):
    rows = [r for r in map_txt.strip("\n").split("\n")]
    w, h = max(len(r) for r in rows), len(rows)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pal = dict(STAFF_FIXED, C=house, D=house_dark, **tones)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                im.putpixel((x, y), pal[ch] + (255,))
    return im.resize((w * scale, h * scale), Image.NEAREST)

staff = Sheet("staff", 28, 48, 8)
for name, (r_, g_, b_) in PLAYER_COLORS.items():
    house = (r_, g_, b_)
    house_dark = (max(0, r_ - 74), max(0, g_ - 74), max(0, b_ - 74))
    for i, (map_txt, tones) in enumerate(zip(STAFF_MAPS, STAFF_TONES)):
        staff.add(f"staff_{name}_{i}", staff_sprite(map_txt, tones, house, house_dark))

# the press-wire teleprinter (modeled on a Model 15: glass paper window up
# top, sloped cast-metal body with brass plates, paper bail arm sticking out
# right, and a protruding tray of round keys)
from PIL import ImageDraw
def teletype_sprite():
    W, H = 48, 44
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    OUT = (23, 22, 27, 255); BODY = (38, 38, 46, 255); MID = (52, 52, 62, 255)
    HILIT = (76, 77, 88, 255); GLASS = (56, 64, 80, 255); PAPER = (242, 234, 216, 255)
    BRASS = (185, 143, 53, 255); ARM = (168, 172, 180, 255); KEY = (104, 105, 116, 255)
    # glass top with the paper visible inside
    d.rectangle([6, 0, 40, 11], fill=GLASS, outline=OUT, width=2)
    d.rectangle([13, 2, 31, 8], fill=PAPER)
    d.rectangle([8, 8, 38, 9], fill=MID)                    # typebar basket hint
    # main sloped body
    d.rectangle([2, 11, 44, 26], fill=BODY, outline=OUT, width=2)
    d.rectangle([4, 13, 42, 14], fill=HILIT)                # top edge catches light
    d.rectangle([5, 16, 15, 21], fill=BRASS, outline=OUT)   # instruction plate
    # paper bail arm, protruding to the right of the body
    d.rectangle([40, 16, 47, 17], fill=ARM)
    d.rectangle([45, 16, 47, 23], fill=ARM)
    # lower front, a little wider, with the small brass switch labels
    d.rectangle([0, 26, 46, 34], fill=BODY, outline=OUT, width=2)
    d.rectangle([4, 29, 10, 32], fill=BRASS)
    d.rectangle([36, 29, 42, 32], fill=BRASS)
    # keyboard tray: three staggered rows of round keys
    d.rectangle([0, 34, 46, 43], fill=OUT)
    for row, y in ((0, 35), (1, 38), (2, 41)):
        for i in range(9):
            x = 3 + i * 5 + (row % 2) * 2
            d.rectangle([x, y, x + 2, y + 1], fill=KEY)
    return im
atlas.update(staff.save())
machine = Sheet("machine", 48, 44, 1)
machine.add("teletype", teletype_sprite())
atlas.update(machine.save())

# --------------------------------------------------------------- scenes sheet
board = Image.open(os.path.join(ASSETS, r"#01_BOARDS\#AOCTGY01_Board\AOC_MainBoard_Front_Common_V08.png"))
scenes = Sheet("scenes", 200, 150, 4)
def cover_crop(im, ratio):
    """Center-crop an image to the given aspect ratio (w/h)."""
    w, h = im.size
    if w / h > ratio:  # too wide
        nw = round(h * ratio)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / ratio)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))

SCENE_W, SCENE_H = 176, 120
VIGNETTES = {  # tight character-focused crops on the main board (no bubbles/slots)
    "scene_hire":      (1190, 560, 1530, 766),   # the handshake
    "scene_develop":   (1665, 552, 2035, 766),   # artist at the drafting table
    "scene_ideas":     (2612, 552, 2790, 700),   # the thinker
    "scene_print":     (1170, 1140, 1560, 1355), # pressman feeding the rotary
    "scene_royalties": (1495, 1690, 1790, 1930), # accountant with the receipts
    "scene_sales":     (2205, 1730, 2470, 1945), # newsstand vendor
    "scene_newsstand": (2570, 1650, 2830, 1990),
}
# circular character portraits for the action tiles.
# Drop a PNG into game/assets/custom/<action>.png (e.g. hire.png) to override.
PORTRAITS = {  # tight head/torso crops on the main board
    "hire":      (1250, 465, 1530, 745),
    "develop":   (1755, 560, 2035, 766),
    "ideas":     (2620, 505, 2790, 700),
    "print":     (1170, 1150, 1400, 1360),
    "royalties": (1530, 1690, 1790, 1905),
    "sales":     (2210, 1735, 2470, 1945),
}
CUSTOM_DIR = os.path.join(OUT, "custom")
PORT_D = 100  # portrait diameter in px
def circle_portrait(im):
    im = cover_crop(im, 1.0)
    tile = retro(im, PORT_D, 32)
    mask = Image.new("L", (PORT_D, PORT_D), 0)
    from PIL import ImageDraw as _ImageDraw
    d = _ImageDraw.Draw(mask)
    d.ellipse((0, 0, PORT_D - 1, PORT_D - 1), fill=255)
    out_im = Image.new("RGBA", (PORT_D, PORT_D), (0, 0, 0, 0))
    out_im.paste(tile.convert("RGBA"), (0, 0), mask)
    ring = _ImageDraw.Draw(out_im)
    ring.ellipse((0, 0, PORT_D - 1, PORT_D - 1), outline=(34, 29, 22, 255), width=4)
    ring.ellipse((3, 3, PORT_D - 4, PORT_D - 4), outline=(239, 230, 208, 255), width=2)
    return out_im

for action, box in PORTRAITS.items():
    custom = os.path.join(CUSTOM_DIR, action + ".png")
    src = Image.open(custom) if os.path.exists(custom) else board.crop(box)
    scenes.add("port_" + action, circle_portrait(src))

# action badge icons: the typewriter & brushes from the creative cards
wcard = Image.open(os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20B_Writers\Writers Front\Writer Super 2.png"))
scenes.add("icon_typewriter", retro(wcard.crop((170, 380, 575, 730)), 34, 12))
acard = Image.open(os.path.join(ASSETS, r"#05_CARDS\#AOCTGY20C_Artists\Artists Front\Artist Super 2.png"))
scenes.add("icon_brushes", retro(acard.crop((170, 380, 575, 730)), 34, 12))

# two frames per scene: frame B nudges a body region 2px down (idle bob)
ANIM_BAND = {  # (x0, y0, x1, y1) in 176x120 tile space
    "scene_hire":      (20, 18, 165, 96),
    "scene_develop":   (86, 6, 176, 96),
    "scene_ideas":     (30, 4, 165, 92),
    "scene_print":     (8, 6, 120, 88),
    "scene_royalties": (60, 4, 176, 92),
    "scene_sales":     (55, 30, 140, 105),
    "scene_newsstand": (20, 20, 156, 100),
}
for key, box in VIGNETTES.items():
    crop = cover_crop(board.crop(box), SCENE_W / SCENE_H)
    tile = retro(crop, SCENE_W, 40, max_h=SCENE_H)
    scenes.add(key, tile)
    band = ANIM_BAND.get(key)
    if band:
        frame_b = tile.copy()
        region = tile.crop(band)
        frame_b.paste(region, (band[0], band[1] + 2))
        scenes.add(key + "_b", frame_b)
# calendar tile front
scenes.add("calendar", retro(Image.open(os.path.join(ASSETS, r"#03_TILES\#AOCTGY16_Calendar\Crime\Calendar_Front.png")).convert("RGBA"), 60, 16))
# publisher marks: user-prepared die-cut plates, one file per house
# (game/assets/custom). Two fringe traps live here: transparent pixels are
# BLACK in the RGB channels, so both the plate's own soft die-cut edges and
# any padding must be backfilled with the plate's color BEFORE the resize +
# quantize, or a dark contour line rings the mark.
MARKS = {"yellow": "Yellow.png", "salmon": "Pink.png", "teal": "Teal.png", "brown": "Brown.png"}
def custom_img(name):
    im = Image.open(os.path.join(CUSTOM_DIR, name + ".png")).convert("RGBA")
    b = im.split()[3].getbbox()
    # every cutout shares the black-under-transparency edge trap
    return defringe(im.crop(b) if b else im)
for name, f in MARKS.items():
    plate = Image.open(os.path.join(OUT, "custom", f)).convert("RGBA")
    bbox = plate.split()[3].getbbox()
    if bbox:
        plate = plate.crop(bbox)
    pad = 3
    art = retro(defringe(plate), 42 - 2 * pad, 16)
    sq = Image.new("RGBA", (42, 42), (0, 0, 0, 0))
    sq.paste(art, (pad + (42 - 2 * pad - art.width) // 2, pad + (42 - 2 * pad - art.height) // 2), art)
    scenes.add(f"logo_{name}", sq)
atlas.update(scenes.save())

# ------------------------------------------------------------------- faces
# pre-masked caricature discs. The caricatures are hand-drawn at slightly
# different positions per card, so a uniform crop can't center all 48:
# instead the drawing's ink bounding box is detected (dark strokes on cream
# stock) and a fixed 150px window is RE-CENTERED on it, clamped to the badge
# region so the card frame / name plate never leak in. The circle is baked
# here so the UI ring never crops the drawing. A user-provided cutout in
# game/assets/custom (e.g. "Face Writer Crime 1.png") overrides the crop.
# two sizes per face (mip pair, like boss_/bossbig_): 26px for the small
# chips/bands, 56px for panels, reveals and detail panes — storing only 26px
# and upscaling 2-3x was what made faces look fuzzy. Both sizes skip the
# palette quantize: ink drawings keep their period feel without it.
faces = Sheet("faces", 28, 28, 12)
facesbig = Sheet("facesbig", 58, 58, 10)
# print-era third size: one 120px master per face/mystery/boss — spr()'s
# auto-HD serves it (with big/sm aliasing) so every face renders from a
# master, never an upscale. Lossy webp keeps 54 masters ~lightweight.
faceshd = Sheet("faceshd", 124, 124, 10, fmt="webp")
def face_disc(im, d=26):
    tile = crisp(im, d)
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d - 1, d - 1), fill=255)
    out_f = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    out_f.paste(tile, (0, 0), mask)
    # the ink ring is baked (the CSS circle frame is gone everywhere)
    ImageDraw.Draw(out_f).ellipse((0, 0, d - 1, d - 1), outline=(34, 29, 22, 255), width=max(1, d // 26))
    return out_f
# the user supplies cutout heads named by CREATIVE (game/assets/custom/
# Faces_PNG/**/<Name>.png) — the names live in js/data.js, so parse the two
# name tables and match loosely (case/punctuation-insensitive: "D.J." ≡ "DJ")
def parse_names(varname):
    djs = open(os.path.join(_GAME, "js", "data.js"), encoding="utf-8").read()
    m = re.search(varname + r"\s*=\s*\{(.*?)\};", djs, re.S)
    out_n = {}
    for gm in re.finditer(r"(\w+):\s*\[(.*?)\]", m.group(1), re.S):
        out_n[gm.group(1)] = re.findall(r'"([^"]+)"', gm.group(2))
    return out_n
import re
NAME_TABLE = {"writer": parse_names("WRITER_NAMES"), "artist": parse_names("ARTIST_NAMES")}
def norm_name(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())
FACE_CUTOUTS = {}
for root_d, _dirs, fs in os.walk(os.path.join(CUSTOM_DIR, "Faces_PNG")):
    for fn in fs:
        if fn.lower().endswith((".png", ".psd")):
            FACE_CUTOUTS[norm_name(os.path.splitext(fn)[0])] = os.path.join(root_d, fn)
import difflib
def find_cutout(cname):
    key = norm_name(cname)
    if key in FACE_CUTOUTS:
        return FACE_CUTOUTS[key]
    # tolerate small spelling drifts ("Zabjaku"/"Zhabjaku") but never guess
    # across genuinely different names
    close = difflib.get_close_matches(key, FACE_CUTOUTS.keys(), n=1, cutoff=0.8)
    return FACE_CUTOUTS[close[0]] if close else None
CREAM = (242, 234, 216, 255)  # the card-stock tone (disc fallbacks + sticker rims)
from PIL import ImageFilter
def sticker(im, d):
    """Bare cutout with a baked cream 'sticker' rim — no circle frame
    (user's call), reads on light AND dark surfaces."""
    im = defringe(im)
    a = im.split()[3].point(lambda v: 255 if v > 120 else 0)
    rim = a.filter(ImageFilter.MaxFilter(13))
    base = Image.new("RGBA", im.size, (0, 0, 0, 0))
    base.paste(Image.new("RGBA", im.size, CREAM), (0, 0), rim)
    base.alpha_composite(im)
    pad = 8  # the rim must never touch the crop edge
    padded = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    padded.paste(base, (pad, pad), base)
    return crisp(padded, d, max_h=d)

FACE_SCAN = (16, 830, 158, 972)   # frame-free zone used to find the ink
FACE_ZONE = (8, 822, 166, 980)    # the window may slide within this
FACE_SIDE = 150
def face_crop(card):
    scan = card.crop(FACE_SCAN).convert("L")
    ink = scan.point(lambda v: 255 if v < 150 else 0)
    bb = ink.getbbox()
    if bb:
        cx = FACE_SCAN[0] + (bb[0] + bb[2]) // 2
        cy = FACE_SCAN[1] + (bb[1] + bb[3]) // 2
    else:
        cx = (FACE_SCAN[0] + FACE_SCAN[2]) // 2
        cy = (FACE_SCAN[1] + FACE_SCAN[3]) // 2
    x0 = max(FACE_ZONE[0], min(cx - FACE_SIDE // 2, FACE_ZONE[2] - FACE_SIDE))
    y0 = max(FACE_ZONE[1], min(cy - FACE_SIDE // 2, FACE_ZONE[3] - FACE_SIDE))
    return card.crop((x0, y0, x0 + FACE_SIDE, y0 + FACE_SIDE))
missing_faces = []
for kind, sub in (("writer", r"#05_CARDS\#AOCTGY20B_Writers\Writers Front"),
                  ("artist", r"#05_CARDS\#AOCTGY20C_Artists\Artists Front")):
    prefix = "Writer" if kind == "writer" else "Artist"
    for g in GENRES:
        for i, suffix in enumerate(("1", "2", "2B", "3")):
            cname = NAME_TABLE[kind][g][i]
            cut = find_cutout(cname)
            if cut:
                # user cutout → bare sticker head (no circle frame)
                head = Image.open(cut).convert("RGBA")
                faces.add(f"face_{kind}_{g}_{suffix}", sticker(head, 26))
                facesbig.add(f"facebig_{kind}_{g}_{suffix}", sticker(head, 56))
                faceshd.add(f"hd_face_{kind}_{g}_{suffix}", sticker(head, 120))
            else:
                # card crop → still needs the disc to hide its square edges
                # (resolves itself as the remaining cutouts arrive)
                missing_faces.append(cname)
                card = Image.open(os.path.join(ASSETS, sub, f"{prefix} {CRE_FOLDER[g]} {suffix}.png"))
                face = face_crop(card)
                faces.add(f"face_{kind}_{g}_{suffix}", face_disc(face))
                facesbig.add(f"facebig_{kind}_{g}_{suffix}", face_disc(face, 56))
                faceshd.add(f"hd_face_{kind}_{g}_{suffix}", face_disc(face, 120))
if missing_faces:
    print("  note: no cutout for", ", ".join(missing_faces), "- using card crops")
# the classified ad: the detailed generic trade tools as the same bare
# sticker cutouts — only the content says "unknown writer/artist"
for kind, fsrc in (("writer", "Micro icon Generic Writer"), ("artist", "Micro icon Generic Artist")):
    icon = custom_img(fsrc)
    faces.add("mystery_" + kind, sticker(icon, 26))
    facesbig.add("mysterybig_" + kind, sticker(icon, 56))
    faceshd.add("hd_mystery_" + kind, sticker(icon, 120))
atlas.update(faces.save())
atlas.update(facesbig.save())
# publisher bosses, cropped from the box-art office scene. BOTH boss sizes
# live on their own sheet: the 28px faces cells cannot hold 44px portraits
# (adding them there once corrupted the last creative row).
box_src = Image.open(os.path.join(ASSETS, r"#10_BOX\AOC squared image.jpg"))
BOSSES = {
    # headroom matters: these render at 26px in the rivals strip and order
    # chips, where a hair-grazing crop reads as a decapitation
    "yellow": (515, 788, 695, 968),    # Goldie Marsh — at the drafting table
    "salmon": (1012, 806, 1188, 982),  # Rex Calloway — behind the desk
    "teal":   (1538, 672, 1712, 846),  # Vivian Cole — with the fresh issues
    "brown":  (68, 612, 250, 794),     # Mortimer Quill — man of mystery
}
BOSSBIG = {
    "yellow": (530, 825, 680, 975),
    "salmon": (1025, 845, 1175, 995),
    "teal":   (1555, 700, 1700, 845),
    "brown":  (85, 645, 240, 800),
}
bosses_big = Sheet("bosses", 100, 104, 4)
for color, crop_box in BOSSBIG.items():
    bosses_big.add(f"bossbig_{color}", retro(box_src.crop(crop_box), 96, 32))
for color, crop_box in BOSSES.items():
    bosses_big.add(f"boss_{color}", retro(box_src.crop(crop_box), 44, 22))
    # native-size variant for the tiny uses (setup rivals strip at 26px):
    # fractional downscales of the 44px sprite came out ragged
    bosses_big.add(f"bosssm_{color}", crisp(box_src.crop(crop_box).convert("RGBA"), 26))
    # the 120px master (headroom crop — hair-grazing reads as decapitation)
    faceshd.add(f"hd_boss_{color}", crisp(box_src.crop(crop_box).convert("RGBA"), 120))
atlas.update(bosses_big.save())
atlas.update(faceshd.save())

# ------------------------------------------------- custom cutout icon sheets
# user-drawn cutouts (game/assets/custom): per-genre writer/artist trade
# icons, the Writer/Artist tag ribbons + generic micro glyphs, the six genre
# symbols, and the action vignettes that crown the redesigned panels
# (custom_img moved up beside defringe — the faces section needs it too)

CUSTOM_GENRE = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
                "horror": "Horror", "superheroes": "Superhero", "western": "Western"}
# crisp (resize-only) throughout: these render at 14-36px, where the
# 16-bit quantize only added speckle
icons = Sheet("icons", 60, 48, 8)
for g in GENRES:
    icons.add(f"wicon_{g}", crisp(custom_img(f"Typewriting {CUSTOM_GENRE[g]}"), 56, max_h=44))
    icons.add(f"aicon_{g}", crisp(custom_img(f"Artist {CUSTOM_GENRE[g]}"), 56, max_h=44))
    icons.add(f"genreicon_{g}", crisp(custom_img(f"{CUSTOM_GENRE[g]} Icon"), 34, max_h=30))
icons.add("tag_writer", crisp(custom_img("Writer Tag"), 48, max_h=24))
icons.add("tag_artist", crisp(custom_img("Artist Tag"), 48, max_h=24))
icons.add("micro_writer", crisp(custom_img("Micro icon Generic Writer"), 20, max_h=22))
icons.add("micro_artist", crisp(custom_img("Micro icon Generic Artist"), 20, max_h=22))
atlas.update(icons.save())

# HD twins of the cutout icon family (3x masters, webp)
iconshd = Sheet("iconshd", 172, 136, 6, fmt="webp")
for g in GENRES:
    iconshd.add(f"hd_wicon_{g}", crisp(custom_img(f"Typewriting {CUSTOM_GENRE[g]}"), 168, max_h=132))
    iconshd.add(f"hd_aicon_{g}", crisp(custom_img(f"Artist {CUSTOM_GENRE[g]}"), 168, max_h=132))
    iconshd.add(f"hd_genreicon_{g}", crisp(custom_img(f"{CUSTOM_GENRE[g]} Icon"), 102, max_h=90))
iconshd.add("hd_tag_writer", crisp(custom_img("Writer Tag"), 144, max_h=72))
iconshd.add("hd_tag_artist", crisp(custom_img("Artist Tag"), 144, max_h=72))
iconshd.add("hd_micro_writer", crisp(custom_img("Micro icon Generic Writer"), 60, max_h=66))
iconshd.add("hd_micro_artist", crisp(custom_img("Micro icon Generic Artist"), 60, max_h=66))
atlas.update(iconshd.save())

vign = Sheet("vign", 124, 104, 4)
VIG_FILES = {"hire": "Hire Handshake", "develop": "Develop drawing man",
             "ideas": "Ideas Thinkin mang", "print": "Print press",
             "royalties": "Royalties lady counting", "sales": "Sales", "hype": "Hype"}
for key, f in VIG_FILES.items():
    vign.add(f"vig_{key}", retro(custom_img(f), 120, 32, max_h=100))
atlas.update(vign.save())

# print-era HD vignettes + logos: the panel-header emblems and letterhead
# marks at full line-art fidelity (crisp, no quantize) — panelHead and the
# paper surfaces prefer these via sprHD()/hd_ lookups
vignhd = Sheet("vignhd", 248, 212, 4, fmt="webp")
for key, f in VIG_FILES.items():
    vignhd.add(f"hd_vig_{key}", crisp(custom_img(f), 240, max_h=204))
for name, f in MARKS.items():
    plate = Image.open(os.path.join(OUT, "custom", f)).convert("RGBA")
    bbox = plate.split()[3].getbbox()
    if bbox:
        plate = plate.crop(bbox)
    hd_pad = 8
    art = crisp(defringe(plate), 128 - 2 * hd_pad, max_h=128 - 2 * hd_pad)
    sq = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    sq.paste(art, (hd_pad + (128 - 2 * hd_pad - art.width) // 2, hd_pad + (128 - 2 * hd_pad - art.height) // 2), art)
    vignhd.add(f"hd_logo_{name}", sq)
atlas.update(vignhd.save())

# ----------------------------------------------------------------- title art
box_art = Image.open(os.path.join(ASSETS, r"#10_BOX\AOC squared image.jpg"))
# print-era: the box illustration at real resolution (it was quantized to
# 300px and UPSCALED on screen — the single most visible low-res surface)
title = crisp(box_art.convert("RGBA"), 900)
title.save(os.path.join(OUT, "title.webp"), quality=92, method=6)
atlas["title"] = {"sheet": "title", "x": 0, "y": 0, "w": title.width, "h": title.height}
print("title", title.size)

# ------------------------------------------------------------- film grain
# a deterministic noise tile for the Projection Room overlays (#film-layer):
# white speckle with baked-in low alpha, tiled + step-animated in CSS
import random
_rnd = random.Random(1948)
grain = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
gp = grain.load()
for y in range(128):
    for x in range(128):
        v = _rnd.random()
        if v > 0.86:
            lum = 255 if v > 0.965 else 190
            gp[x, y] = (lum, lum, lum, _rnd.randint(26, 64))
grain.save(os.path.join(OUT, "grain.png"))
print("grain", grain.size)

# CRT tube displacement map for the tube-glass lens (SVG feDisplacementMap:
# R/G encode x/y offsets around 128). Two lessons from user review: the map
# must be HIGH RES (a 256px map stretched over the screen turned curves into
# stepped kinks on straight ink lines) and the falloff must be r^4-steep so
# the CENTER of the picture — where all the text lives — stays dead flat and
# only the outer frame curves, like the real sets (and the good CRT shaders).
N = 1024
bmap = Image.new("RGB", (N, N))
bp = bmap.load()
for y in range(N):
    for x in range(N):
        nx = (x - (N - 1) / 2) / ((N - 1) / 2)
        ny = (y - (N - 1) / 2) / ((N - 1) / 2)
        r2 = (nx * nx + ny * ny) / 2   # 0 center, 1 corners
        f = r2 * r2                    # quartic falloff: flat middle
        bp[x, y] = (round(127.5 + nx * f * 127), round(127.5 + ny * f * 127), 128)
bmap.save(os.path.join(OUT, "barrel.png"))
print("barrel", bmap.size)

# ------------------------------------------------------------------- atlas js
sheet_sizes["title"] = {"w": title.width, "h": title.height, "ext": "webp"}
with open(os.path.join(OUT, "atlas.js"), "w", encoding="utf-8") as fh:
    fh.write("// generated by tools/build_assets.py\nconst ATLAS = ")
    fh.write(json.dumps(atlas))
    fh.write(";\nconst SHEET_SIZES = ")
    fh.write(json.dumps(sheet_sizes))
    fh.write(";\n")
print("atlas.js written,", len(atlas), "entries")
