"""Génère le kit d'icônes de l'app depuis le maître `build/icon-1024.png`.

Le maître est le rendu du SVG `build/icon-refonte.svg` (V à deux voiles,
soleil d'argile et horizon sur tuile crème). Le rendu passe par
`build/icon-refonte.html` et `scripts/shot.cjs`. Le gabarit monochrome est
redessiné ici, à partir de la même géométrie. Aucun fichier distant : tout
est local.
"""
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SRC = BUILD / "icon-1024.png"

img = Image.open(SRC).convert("RGBA")
assert img.size == (1024, 1024), img.size

# --- macOS : iconset complet, puis .icns ---
iconset = BUILD / "Vela.iconset"
iconset.mkdir(exist_ok=True)
for name in iconset.glob("*.png"):
    name.unlink()
for size in (16, 32, 128, 256, 512):
    img.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    img.resize((size * 2, size * 2), Image.LANCZOS).save(
        iconset / f"icon_{size}x{size}@2x.png"
    )
subprocess.run(
    ["iconutil", "-c", "icns", str(iconset), "-o", str(BUILD / "icon.icns")], check=True
)

# --- Windows : .ico multi-résolutions ---
img.save(
    BUILD / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

# --- Linux et utilitaires ---
img.resize((512, 512), Image.LANCZOS).save(BUILD / "icon-512.png")

# --- Barre de menus : V et point, noirs sur transparent --------------------
# Le gabarit ne reprend pas la tuile : macOS l'inverse selon le thème et
# attend une silhouette, pas une miniature de l'icône complète.
SCALE = 2
template = Image.new("RGBA", (1024 * SCALE, 1024 * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(template)


def p(x, y):
    return (x * SCALE, y * SCALE)


draw.polygon([p(300, 316), p(462, 316), p(512, 694)], fill=(0, 0, 0, 255))
draw.polygon([p(562, 316), p(724, 316), p(512, 694)], fill=(0, 0, 0, 255))
draw.ellipse([p(512 - 38, 274 - 38), p(512 + 38, 274 + 38)], fill=(0, 0, 0, 255))
template = template.crop(template.getbbox())
for size in (16, 32):
    inner = size - 2
    fit = template.copy()
    fit.thumbnail((inner, inner), Image.LANCZOS)
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.alpha_composite(fit, ((size - fit.width) // 2, (size - fit.height) // 2))
    name = "iconTemplate.png" if size == 16 else "iconTemplate@2x.png"
    tile.save(BUILD / name)

print("OK : icon.icns, icon.ico, icon-512.png, iconTemplate.png, iconTemplate@2x.png")
