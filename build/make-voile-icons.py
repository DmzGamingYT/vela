#!/usr/bin/env python3
"""Génère l'icône « voilier » de Vela et ses déclinaisons.

Maître 1024 px, carré arrondi macOS (rayon 22 %), fond transparent autour.
Le dessin reste volontairement plat : deux voiles (crème et grise), une coque
corail, un soleil couchant en aplat translucide, la mer bleu nuit dessous.
Aucun dégradé, aucune ombre, aucun texte. Tout est local (Pillow) ; les courbes
du SVG sont échantillonnées, donc la géométrie est la même qu'à l'écran.

Sorties dans build/icon-voile/ :
  icon.svg, icon-mono.svg, icon-1024.png,
  icon-512/128/64/32/16.png, iconTemplate.png, iconTemplate@2x.png,
  icon-preview.png.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "icon-voile"
OUT.mkdir(parents=True, exist_ok=True)

# --- Palette ---------------------------------------------------------------
NIGHT = (27, 33, 80, 255)      # #1B2150
SEA = (38, 48, 122, 255)       # #26307A
WAVE = (59, 74, 168, 255)      # #3B4AA8
SUN = (232, 128, 90)           # #E8805A, posé à 28 %
SAIL = (246, 239, 228, 255)    # #F6EFE4
SAIL_SOFT = (185, 190, 203, 255)  # #B9BECB
HULL = (232, 128, 90, 255)     # #E8805A
HULL_DARK = (196, 98, 63, 255)  # #C4623F

# --- Géométrie (repère 200, celui du SVG) ----------------------------------
TILE = (0, 0, 200, 200)
RADIUS = 46
GLOW = (100, 98, 52)
LEFT_SAIL = [(96, 38), (96, 128), (46, 128)]
RIGHT_SAIL = [(106, 64), (106, 128), (142, 128)]
MAST = (95, 34, 98, 132)
HULL_SHAPE = [(32, 132), (168, 132), (150, 152), (50, 152)]
HULL_EDGE = [(50, 152), (150, 152), (146, 156), (54, 156)]
# Boîte du bateau (sans la mer), pour le gabarit monochrome.
MARK = (32, 34, 168, 156)

S = 8  # suréchantillonnage : contours nets à toutes les tailles

# --- Courbes ---------------------------------------------------------------


def quad(p0, c, p1, n=48):
    """Échantillonne une courbe quadratique, point d'arrivée compris."""
    points = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        points.append(
            (u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])
        )
    return points


def chaine(depart, segments):
    """Enchaîne des segments `(controle, arrivee)` en réfléchissant le contrôle
    comme le fait la commande `T` du SVG."""
    points = [depart]
    courant, controle = depart, None
    for controle_brut, arrivee in segments:
        reflet = controle_brut
        if controle_brut is None:
            reflet = (2 * courant[0] - controle[0], 2 * courant[1] - controle[1])
        points.extend(quad(courant, reflet, arrivee))
        courant, controle = arrivee, reflet
    return points


# La crête de la mer : quatre vagues de 60 px, celle de droite se referme un
# peu plus haut (200, 154 au lieu de 200, 156).
CRETE = chaine((0, 156), [((30, 146), (60, 156)), (None, (120, 156)), (None, (180, 156)), (None, (200, 154))])
EAU = (
    CRETE
    + quad((200, 154), (200, 200), (154, 200), 32)
    + [(46, 200)]
    + quad((46, 200), (0, 200), (0, 154), 32)[1:]
)
ECUME = chaine((0, 158), [((30, 148), (60, 158)), (None, (120, 158)), (None, (180, 158))]) + [(200, 156)]


def pts(shape, origine=(0, 0)):
    return [((x - origine[0]) * S, (y - origine[1]) * S) for x, y in shape]


def render_master():
    image = Image.new("RGBA", (200 * S, 200 * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        [(TILE[0]) * S, (TILE[1]) * S, (TILE[2] - 1) * S, (TILE[3] - 1) * S],
        radius=RADIUS * S,
        fill=NIGHT,
    )

    # Le soleil est translucide : il se compose sur un calque, sinon le PNG
    # garderait des pixels à moitié opaques au lieu du mélange avec le fond.
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [(GLOW[0] - GLOW[2]) * S, (GLOW[1] - GLOW[2]) * S, (GLOW[0] + GLOW[2]) * S, (GLOW[1] + GLOW[2]) * S],
        fill=(*SUN, 71),
    )
    image.alpha_composite(glow)

    draw = ImageDraw.Draw(image)
    draw.polygon(pts(EAU), fill=SEA)
    draw.line(pts(ECUME), fill=WAVE, width=2 * S, joint="curve")
    draw.polygon(pts(LEFT_SAIL), fill=SAIL)
    draw.polygon(pts(RIGHT_SAIL), fill=SAIL_SOFT)
    draw.rectangle([MAST[0] * S, MAST[1] * S, MAST[2] * S, MAST[3] * S], fill=SAIL)
    draw.polygon(pts(HULL_SHAPE), fill=HULL)
    draw.polygon(pts(HULL_EDGE), fill=HULL_DARK)

    # Tout est dessiné à pleine page : le masque du carré arrondi coupe les
    # coins, sinon la mer et l'écume débordent de la tuile aux angles.
    masque = Image.new("L", image.size, 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        [0, 0, (200 * S) - 1, (200 * S) - 1], radius=RADIUS * S, fill=255
    )
    image.putalpha(ImageChops.multiply(image.getchannel("A"), masque))

    master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    tuile = image.resize((832, 832), Image.LANCZOS)
    master.alpha_composite(tuile, (96, 96))
    master.save(OUT / "icon-1024.png")
    return master


def render_mono():
    image = Image.new("RGBA", (200 * S, 200 * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(pts(LEFT_SAIL), fill=(0, 0, 0, 255))
    draw.polygon(pts(RIGHT_SAIL), fill=(0, 0, 0, 255))
    draw.rectangle([MAST[0] * S, MAST[1] * S, MAST[2] * S, MAST[3] * S], fill=(0, 0, 0, 255))
    draw.polygon(pts(HULL_SHAPE), fill=(0, 0, 0, 255))
    draw.polygon(pts(HULL_EDGE), fill=(0, 0, 0, 255))
    crop = image.crop((MARK[0] * S, MARK[1] * S, MARK[2] * S, MARK[3] * S))
    for size in (16, 32):
        inner = size - 2
        mark = crop.resize((inner, inner), Image.LANCZOS)
        tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        tile.alpha_composite(mark, (1, 1))
        name = "iconTemplate.png" if size == 16 else "iconTemplate@2x.png"
        tile.save(OUT / name)


def write_svg():
    (OUT / "icon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="1024" height="1024"
     role="img" aria-labelledby="vela-title vela-desc">
  <title id="vela-title">Vela</title>
  <desc id="vela-desc">Un voilier à deux voiles sur une coque corail, devant un soleil couchant, sur un fond bleu nuit arrondi.</desc>
  <!-- Icône plate : aucun dégradé, aucune ombre, aucun texte. Le carré
       arrondi occupe tout le cadre ; build/make-voile-icons.py le pose sur
       un canevas transparent de 1024 px, marge macOS comprise. -->
  <style>
    .tile { fill: #1B2150; }
    .sun { fill: #E8805A; opacity: .28; }
    .sea { fill: #26307A; }
    .foam { fill: none; stroke: #3B4AA8; stroke-width: 2; }
    .sail { fill: #F6EFE4; }
    .sail--soft { fill: #B9BECB; }
    .hull { fill: #E8805A; }
    .hull--edge { fill: #C4623F; }
  </style>
  <rect class="tile" x="0" y="0" width="200" height="200" rx="46" />
  <circle class="sun" cx="100" cy="98" r="52" />
  <path class="sea" d="M0 156 Q30 146 60 156 T120 156 T180 156 T200 154 L200 154 Q200 200 154 200 L46 200 Q0 200 0 154 Z" />
  <path class="foam" d="M0 158 Q30 148 60 158 T120 158 T180 158 L200 156" />
  <path class="sail" d="M96 38 L96 128 L46 128 Z" />
  <path class="sail--soft" d="M106 64 L106 128 L142 128 Z" />
  <rect class="sail" x="95" y="34" width="3" height="98" />
  <path class="hull" d="M32 132 L168 132 L150 152 L50 152 Z" />
  <path class="hull--edge" d="M50 152 L150 152 L146 156 L54 156 Z" />
</svg>
""",
        encoding="utf-8",
    )
    (OUT / "icon-mono.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="32 34 136 122" width="16" height="16"
     style="color:#000" role="img" aria-label="Vela">
  <!-- Gabarit monochrome pour la barre de menus : noir plein, fond transparent.
       macOS inverse lui-même les images « template ». -->
  <style>.mark { fill: currentColor; }</style>
  <path class="mark" d="M96 38 L96 128 L46 128 Z" />
  <path class="mark" d="M106 64 L106 128 L142 128 Z" />
  <rect class="mark" x="95" y="34" width="3" height="98" />
  <path class="mark" d="M32 132 L168 132 L150 152 L50 152 Z" />
  <path class="mark" d="M50 152 L150 152 L146 156 L54 156 Z" />
</svg>
""",
        encoding="utf-8",
    )


def write_preview(master):
    for size in (512, 128, 64, 32, 16):
        master.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")

    sheet = Image.new("RGB", (1024, 560), (244, 242, 237))
    draw = ImageDraw.Draw(sheet)
    for y in range(0, 560, 28):
        for x in range(0, 1024, 28):
            if (x // 28 + y // 28) % 2:
                draw.rectangle([x, y, x + 27, y + 27], fill=(234, 231, 224))
    layout = [(512, 56, 24), (128, 608, 216), (64, 776, 248), (32, 880, 264), (16, 952, 272)]
    for size, x, y in layout:
        icon = Image.open(OUT / f"icon-{size}.png")
        sheet.paste(icon, (x, y), icon)
    sheet.save(OUT / "icon-preview.png")


if __name__ == "__main__":
    master = render_master()
    render_mono()
    write_svg()
    write_preview(master)
    for path in sorted(OUT.iterdir()):
        print(path.name)
