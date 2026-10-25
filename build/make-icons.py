"""Génère le kit d'icônes Vela depuis le rendu PNG du favicon SVG."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path("/tmp/velaicon/favicon.svg.png")
BUILD = ROOT / "build"
SITE = ROOT / "site" / "public"

img = Image.open(SRC).convert("RGBA")
assert img.size == (1024, 1024), img.size

# --- macOS iconset ---
iconset = BUILD / "icon.iconset"
iconset.mkdir(exist_ok=True)
for size in (16, 32, 128, 256, 512):
    img.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    if size in (16, 32, 128, 256, 512) and size * 2 <= 1024:
        img.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")

# --- Windows ICO ---
img.save(BUILD / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# --- PNG utilitaires ---
img.resize((512, 512), Image.LANCZOS).save(BUILD / "icon-512.png")
img.resize((180, 180), Image.LANCZOS).save(SITE / "apple-touch-icon.png")
img.resize((32, 32), Image.LANCZOS).save(SITE / "favicon-32x32.png")

print("OK")
