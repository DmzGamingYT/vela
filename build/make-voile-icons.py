#!/usr/bin/env python3
"""Génère l'icône « voile » de Vela et ses déclinaisons.

Maître 1024 px, carré arrondi macOS (rayon 22 %), fond transparent autour.
Le dessin reste volontairement plat : deux voiles crème, une coque terracotta,
aucun dégradé, aucune ombre, aucun texte. Tout est local (Pillow).

Sorties dans build/icon-voile/ :
  icon.svg, icon-mono.svg, icon-1024.png,
  icon-512/128/64/32/16.png, iconTemplate.png, iconTemplate@2x.png,
  icon-preview.png.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "icon-voile"
OUT.mkdir(parents=True, exist_ok=True)

# --- Palette ---------------------------------------------------------------
NIGHT = (31, 30, 69, 255)       # #1F1E45
EDGE = (52, 51, 107, 255)       # #34336B
SAIL = (244, 238, 227, 255)     # #F4EEE3
SAIL_SOFT = (244, 238, 227, 184)  # même crème, 72 %
HULL = (217, 119, 79, 255)      # #D9774F

# --- Géométrie (repère 1024) ----------------------------------------------
TILE = (96, 96, 928, 928)
RADIUS = 184                    # 22 % de 832
BORDER = 6
LEFT_SAIL = [(480, 268), (312, 644), (496, 644)]
RIGHT_SAIL = [(630, 368), (552, 644), (712, 644)]
HULL_SHAPE = [(286, 636), (738, 636), (694, 704), (330, 704)]
MARK = (286, 268, 738, 704)     # boîte du bateau, pour le monochrome

S = 4  # suréchantillonnage : contours nets à toutes les tailles


def pts(shape):
    return [(x * S, y * S) for x, y in shape]


def render_master():
    image = Image.new("RGBA", (1024 * S, 1024 * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        [v * S for v in TILE],
        radius=RADIUS * S,
        fill=NIGHT,
        outline=EDGE,
        width=BORDER * S,
    )
    draw.polygon(pts(LEFT_SAIL), fill=SAIL)

    # La petite voile est composée sur un calque : l'opacité se mêle au fond,
    # au lieu de laisser des pixels semi-transparents dans le PNG.
    soft = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(soft).polygon(pts(RIGHT_SAIL), fill=SAIL_SOFT)
    image.alpha_composite(soft)

    ImageDraw.Draw(image).polygon(pts(HULL_SHAPE), fill=HULL)
    master = image.resize((1024, 1024), Image.LANCZOS)
    master.save(OUT / "icon-1024.png")
    return master


def render_mono():
    image = Image.new("RGBA", (1024 * S, 1024 * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(pts(LEFT_SAIL), fill=(0, 0, 0, 255))
    draw.polygon(pts(RIGHT_SAIL), fill=(0, 0, 0, 255))
    draw.polygon(pts(HULL_SHAPE), fill=(0, 0, 0, 255))
    crop = image.crop(tuple(v * S for v in MARK))
    for size in (16, 32):
        inner = size - 2
        mark = crop.resize((inner, inner), Image.LANCZOS)
        tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        tile.alpha_composite(mark, (1, 1))
        name = "iconTemplate.png" if size == 16 else "iconTemplate@2x.png"
        tile.save(OUT / name)


def write_svg():
    (OUT / "icon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"
     style="--vela-night:#1F1E45;--vela-edge:#34336B;--vela-sail:#F4EEE3;--vela-hull:#D9774F"
     role="img" aria-labelledby="vela-title vela-desc">
  <title id="vela-title">Vela</title>
  <desc id="vela-desc">Deux voiles crème sur une coque terracotta, dans un carré bleu nuit.</desc>
  <!-- Icône plate : aucun dégradé, aucune ombre, aucun texte. -->
  <style>
    .tile { fill: var(--vela-night); stroke: var(--vela-edge); stroke-width: 6; }
    .sail { fill: var(--vela-sail); }
    .sail--small { fill: var(--vela-sail); opacity: .72; }
    .hull { fill: var(--vela-hull); }
  </style>
  <rect class="tile" x="99" y="99" width="826" height="826" rx="181" />
  <path class="sail" d="M480 268 L312 644 L496 644 Z" />
  <path class="sail--small" d="M630 368 L552 644 L712 644 Z" />
  <path class="hull" d="M286 636 H738 L694 704 H330 Z" />
</svg>
""",
        encoding="utf-8",
    )
    (OUT / "icon-mono.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="278 260 468 452" width="16" height="16"
     style="color:#000" role="img" aria-label="Vela">
  <!-- Gabarit monochrome pour la barre de menus : noir plein, fond transparent.
       macOS inverse lui-même les images « template ». -->
  <style>.mark { fill: currentColor; }</style>
  <path class="mark" d="M480 268 L312 644 L496 644 Z" />
  <path class="mark" d="M630 368 L552 644 L712 644 Z" />
  <path class="mark" d="M286 636 H738 L694 704 H330 Z" />
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
