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

class Sheet:
    def __init__(self, name, cell_w, cell_h, cols):
        self.name, self.cw, self.ch, self.cols = name, cell_w, cell_h, cols
        self.sprites = []  # (key, img)
        self.atlas = {}
    def add(self, key, img):
        self.sprites.append((key, img))
    def save(self):
        rows = (len(self.sprites) + self.cols - 1) // self.cols
        canvas = Image.new("RGBA", (self.cols * self.cw, rows * self.ch), (0, 0, 0, 0))
        for i, (key, img) in enumerate(self.sprites):
            x = (i % self.cols) * self.cw
            y = (i // self.cols) * self.ch
            # center inside cell
            ox = x + (self.cw - img.width) // 2
            oy = y + (self.ch - img.height) // 2
            canvas.paste(img, (ox, oy), img if img.mode == "RGBA" else None)
            self.atlas[key] = {"sheet": self.name, "x": ox, "y": oy, "w": img.width, "h": img.height}
        canvas.save(os.path.join(OUT, self.name + ".png"))
        print(self.name, canvas.size, len(self.sprites), "sprites")
        sheet_sizes[self.name] = {"w": canvas.width, "h": canvas.height}
        return self.atlas

atlas = {}
sheet_sizes = {}

# ---------------------------------------------------------------- cards sheet
CARD_W = 72  # sprite width; 745x1040 -> 72x100
cards = Sheet("cards", 74, 102, 12)

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

# --------------------------------------------------------------- tokens sheet
tokens = Sheet("tokens", 48, 48, 10)
IDEA_FILE = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
             "horror": "Horror", "superheroes": "Superheroes", "western": "Western"}
for g in GENRES:
    p = os.path.join(ASSETS, r"#02_ROUND TOKENS\IDEAS", f"Ideas_{IDEA_FILE[g]}.png")
    tokens.add(f"idea_{g}", retro(Image.open(p).convert("RGBA"), 30, 12))
MASTERY = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
           "horror": "Horror", "superheroes": "Super", "western": "Western"}
for g in GENRES:
    p = os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY19_Mastery", f"Mastery_{MASTERY[g]}.png")
    tokens.add(f"mastery_{g}", retro(Image.open(p).convert("RGBA"), 42, 16))
for v in (1, 2, 5, 10):
    p = os.path.join(ASSETS, r"#02_ROUND TOKENS\COINS", f"${v}.png")
    tokens.add(f"coin_{v}", retro(Image.open(p).convert("RGBA"), 26, 12))
for v, f in ((1, "1 STAR PNG.png"), (2, "2 STARS PNG.png"), (3, "3 STARS PNG.png")):
    tokens.add(f"vp_{v}", retro(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\VP", f)).convert("RGBA"), 28, 12))
tokens.add("hype", retro(Image.open(os.path.join(ASSETS, r"#02_ROUND TOKENS\Hype.png")).convert("RGBA"), 28, 12))
tokens.add("ticket", retro(Image.open(os.path.join(ASSETS, r"#04_CUSTOM SHAPED TILES\#AOCTGY18_Transport ticket\TicketPNG.png")).convert("RGBA"), 46, 14))
tokens.add("bettercolor", retro(Image.open(os.path.join(ASSETS, r"#03_TILES\#AOCTGY12_Better Color\better_color.png")).convert("RGBA"), 30, 14))
# genre icons from order tile fronts
ORDER_FOLDER = {"scifi": "Scifi", "crime": "Crime", "romance": "Romance",
                "horror": "Horror", "superheroes": "Superheroes", "western": "Western"}
for g in GENRES:
    p = os.path.join(ASSETS, rf"#03_TILES\#AOCTGY15_Orders\{ORDER_FOLDER[g]}", f"Order_{g}_front.png")
    tokens.add(f"gicon_{g}", retro(Image.open(p).convert("RGBA"), 26, 12))
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
# publisher logos from player mats (top-left corner)
MATS = {"brown": "Player Mat Brown.png", "salmon": "Player Mat Pink.png",
        "teal": "Player Mat Teal.png", "yellow": "Player Mat Yellow.png"}
for name, f in MATS.items():
    mat = Image.open(os.path.join(ASSETS, r"#01_BOARDS\#AOCTGY02_Player Mats", f))
    logo = mat.crop((30, 12, 220, 200))
    scenes.add(f"logo_{name}", retro(logo, 40, 12))
atlas.update(scenes.save())

# ------------------------------------------------------------------- faces
faces = Sheet("faces", 28, 28, 12)
for kind, sub in (("writer", r"#05_CARDS\#AOCTGY20B_Writers\Writers Front"),
                  ("artist", r"#05_CARDS\#AOCTGY20C_Artists\Artists Front")):
    prefix = "Writer" if kind == "writer" else "Artist"
    for g in GENRES:
        for suffix in ("1", "2", "2B", "3"):
            card = Image.open(os.path.join(ASSETS, sub, f"{prefix} {CRE_FOLDER[g]} {suffix}.png"))
            face = card.crop((26, 840, 148, 962))  # caricature circle, bottom-left
            faces.add(f"face_{kind}_{g}_{suffix}", retro(face, 26, 14))
# publisher bosses, cropped from the box-art office scene
box_src = Image.open(os.path.join(ASSETS, r"#10_BOX\AOC squared image.jpg"))
BOSSES = {
    "yellow": (520, 820, 690, 990),    # Goldie Marsh — at the drafting table
    "salmon": (1020, 840, 1180, 1000), # Rex Calloway — behind the desk
    "teal":   (1545, 705, 1705, 865),  # Vivian Cole — with the fresh issues
    "brown":  (75, 645, 245, 815),     # Mortimer Quill — man of mystery
}
for color, crop_box in BOSSES.items():
    faces.add(f"boss_{color}", retro(box_src.crop(crop_box), 44, 22))
atlas.update(faces.save())
# hi-res versions for the setup screen cards (44px reads as mush at card size);
# 96px sprites need their own sheet — the faces cells are far too small
bosses_big = Sheet("bosses", 100, 104, 4)
BOSSBIG = {
    "yellow": (530, 825, 680, 975),
    "salmon": (1025, 845, 1175, 995),
    "teal":   (1555, 700, 1700, 845),
    "brown":  (85, 645, 240, 800),
}
for color, crop_box in BOSSBIG.items():
    bosses_big.add(f"bossbig_{color}", retro(box_src.crop(crop_box), 96, 32))
atlas.update(bosses_big.save())

# ----------------------------------------------------------------- title art
box_art = Image.open(os.path.join(ASSETS, r"#10_BOX\AOC squared image.jpg"))
title = retro(box_art, 300, 48)
title.save(os.path.join(OUT, "title.png"))
atlas["title"] = {"sheet": "title", "x": 0, "y": 0, "w": title.width, "h": title.height}
print("title", title.size)

# ------------------------------------------------------------------- atlas js
sheet_sizes["title"] = {"w": title.width, "h": title.height}
with open(os.path.join(OUT, "atlas.js"), "w", encoding="utf-8") as fh:
    fh.write("// generated by tools/build_assets.py\nconst ATLAS = ")
    fh.write(json.dumps(atlas))
    fh.write(";\nconst SHEET_SIZES = ")
    fh.write(json.dumps(sheet_sizes))
    fh.write(";\n")
print("atlas.js written,", len(atlas), "entries")
