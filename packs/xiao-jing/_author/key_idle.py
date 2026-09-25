"""Chroma-key Grok JPEG to 256 RGBA PNG for desktop-pet idle."""
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "ref" / "grok_idle_base.jpg"
out_dir = ROOT / "sprites"
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / "idle_0.png"

im = Image.open(src).convert("RGBA")
arr = np.asarray(im).astype(np.float32)
r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
# Grok chroma is vivid #00FF00; keep character (not high-G, low-R/B)
green = (g > 140) & (g > r * 1.35) & (g > b * 1.35)
a[green] = 0
arr[:, :, 3] = a
keyed = Image.fromarray(arr.astype(np.uint8), "RGBA")

alpha = np.asarray(keyed)[:, :, 3]
ys, xs = np.where(alpha > 16)
if not len(xs):
    raise SystemExit("no opaque pixels after key")
pad = 24
x0, x1 = max(0, xs.min() - pad), min(keyed.width, xs.max() + pad)
y0, y1 = max(0, ys.min() - pad), min(keyed.height, ys.max() + pad)
crop = keyed.crop((int(x0), int(y0), int(x1), int(y1)))
# square canvas, feet toward bottom
side = max(crop.width, crop.height)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
ox = (side - crop.width) // 2
oy = side - crop.height  # sit on bottom
canvas.paste(crop, (ox, oy), crop)
final = canvas.resize((256, 256), Image.Resampling.LANCZOS)
final.save(out)
print("wrote", out, final.size, "bbox", (x0, y0, x1, y1))
