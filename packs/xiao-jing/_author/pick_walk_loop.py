"""Find a walk loop start that matches the last frame (skip standing intro)."""
from pathlib import Path

from PIL import Image
import numpy as np

SPRITES = Path(__file__).resolve().parents[1] / "sprites"
files = sorted(
    SPRITES.glob("walk_*.png"),
    key=lambda p: int(p.stem.rsplit("_", 1)[-1]),
)
last = np.asarray(Image.open(files[-1]).convert("RGBA"), dtype=np.float32)
scores = []
for i, p in enumerate(files[:-1]):
    arr = np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32)
    mse = float(np.mean((arr - last) ** 2))
    scores.append((mse, i, p.name))
best = sorted(scores)[:12]
print("best matches to last frame:")
for mse, i, name in best:
    print(f"  {name} idx={i} mse={mse:.1f}")
print("early frames mse:")
for mse, i, name in scores[:28]:
    print(f"  {name} idx={i} mse={mse:.1f}")
