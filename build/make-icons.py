"""Ancien chemin d'export du kit d'icônes (Pillow), depuis `build/icon-1024.png`.

Le chemin de référence est désormais `build/make-icons.cjs` : il rend chaque
taille nativement depuis `build/icon-safari.svg` (et `icon-safari-small.svg`
sous 64 px), ce qui garde l'anneau net à 16 px, au lieu de rééchantillonner
le 1024. Ce script-ci reste utilisable sur une machine qui n'a pas Electron
sous la main ; il ne produit plus le gabarit de barre de menus, qui vient
maintenant de `build/icon-template-safari.svg` via le script Node.
"""
import subprocess
from pathlib import Path

from PIL import Image

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

# Le gabarit de barre de menus n'est plus dessiné ici : il vient de
# build/icon-template-safari.svg, rendu par build/make-icons.cjs.

print("OK : icon.icns, icon.ico, icon-512.png (gabarit de menu : voir make-icons.cjs)")
