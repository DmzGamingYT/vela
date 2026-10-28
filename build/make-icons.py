"""Génère le kit d'icônes de l'app depuis le maître `build/icon-1024.png`.

Le maître est le rendu du SVG `build/icon-glass.svg` (voilier en verre liquide),
produit par `.freebuff/icon-render.cjs`. Aucun fichier distant : tout est local.
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

print("OK : icon.icns, icon.ico, icon-512.png")
