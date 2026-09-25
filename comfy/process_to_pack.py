#!/usr/bin/env python3
"""Green-screen key + center-crop/pad to 256x256 transparent PNG for packs."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image
import numpy as np

SIZE = 256


def chroma_key(img: Image.Image, green_thresh: float = 0.35) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.asarray(rgba).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    # green screen: G high and G > R,B
    greenish = (g > 90) & (g > r * (1 + green_thresh)) & (g > b * (1 + green_thresh))
    # also near #00FF00
    near = (g > 180) & (r < 120) & (b < 120)
    mask = ~(greenish | near)
    arr[..., 3] = np.where(mask, a, 0)
    # slight edge cleanup: kill leftover green fringe
    fringe = mask & (g > r + 25) & (g > b + 25) & (g > 100)
    arr[..., 0] = np.where(fringe, np.minimum(r, (r + b) / 2), arr[..., 0])
    arr[..., 1] = np.where(fringe, np.minimum(g, (r + b) / 2 + 10), arr[..., 1])
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def tight_bbox(img: Image.Image, pad: int = 8) -> Image.Image:
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def fit_square(img: Image.Image, size: int = SIZE) -> Image.Image:
    img = tight_bbox(img)
    w, h = img.size
    # Leave headroom so bows/hair never touch the canvas edge (clip risk in pet window)
    scale = min(size / w, size / h) * 0.86
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - nw) // 2
    top_pad = max(10, size // 20)
    bottom_pad = max(6, size // 32)
    y = size - nh - bottom_pad
    if y < top_pad:
        # still too tall: recenter with equal clamps
        y = max(top_pad, (size - nh) // 2)
    canvas.paste(img, (x, y), img)
    return canvas


def process_one(src: Path, dst: Path) -> None:
    img = Image.open(src)
    out = fit_square(chroma_key(img))
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    print(f"{src.name} -> {dst}")


def _alpha_bbox(img: Image.Image, pad: int = 16) -> tuple[int, int, int, int] | None:
    alpha = np.asarray(img)[:, :, 3]
    ys, xs = np.where(alpha > 16)
    if not len(xs):
        return None
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(img.width, int(xs.max()) + 1 + pad)
    y1 = min(img.height, int(ys.max()) + 1 + pad)
    return x0, y0, x1, y1


def union_bbox(images: list[Image.Image], pad: int = 16) -> tuple[int, int, int, int]:
    box = None
    for img in images:
        b = _alpha_bbox(img, pad=0)
        if not b:
            continue
        if box is None:
            box = list(b)
        else:
            box[0] = min(box[0], b[0])
            box[1] = min(box[1], b[1])
            box[2] = max(box[2], b[2])
            box[3] = max(box[3], b[3])
    if box is None:
        raise RuntimeError("no opaque pixels in clip")
    x0, y0, x1, y1 = box
    w = images[0].width
    h = images[0].height
    return max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)


def fit_square_fixed(img: Image.Image, box: tuple[int, int, int, int], size: int = SIZE) -> Image.Image:
    """Same crop + scale + paste for every frame so the sprite does not bounce."""
    crop = img.crop(box)
    w, h = crop.size
    scale = min(size / w, size / h) * 0.86
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - nw) // 2
    top_pad = max(10, size // 20)
    bottom_pad = max(6, size // 32)
    y = size - nh - bottom_pad
    if y < top_pad:
        y = max(top_pad, (size - nh) // 2)
    canvas.paste(crop, (x, y), crop)
    return canvas


def process_clip(srcs: list[Path], dsts: list[Path]) -> tuple[int, int, int, int]:
    keyed = [chroma_key(Image.open(src)) for src in srcs]
    box = union_bbox(keyed)
    for img, dst in zip(keyed, dsts):
        dst.parent.mkdir(parents=True, exist_ok=True)
        fit_square_fixed(img, box).save(dst)
        print(f"{dst.name} shared-bbox {box}")
    return box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    args = ap.parse_args()
    process_one(Path(args.src), Path(args.dst))


if __name__ == "__main__":
    main()
