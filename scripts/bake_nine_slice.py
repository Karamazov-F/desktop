"""Crop + compact a scale9 patch: corners stay, only a thin center strip is kept."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "app" / "renderer" / "ui"
MID = 8


def crop_alpha(im: Image.Image, pad: int = 1) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    alpha = a[:, :, 3]
    ys, xs = np.where(alpha > 8)
    if not len(xs):
        return im
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(a.shape[1], int(xs.max()) + 1 + pad)
    y1 = min(a.shape[0], int(ys.max()) + 1 + pad)
    a = a[y0:y1, x0:x1]
    transparent = a[:, :, 3] == 0
    a[transparent] = 0
    return Image.fromarray(a, "RGBA")


def radius(im: Image.Image) -> int:
    a = np.array(im)
    solid = a[:, :, 3] > 200
    h, w = solid.shape
    top = 0
    for y in range(h):
        if solid[y].any():
            top = y
            break
    for x in range(w):
        col = np.where(solid[:, x])[0]
        if not len(col):
            continue
        if int(col[0]) <= top + 1:
            stable = True
            for k in range(6):
                if x + k >= w:
                    stable = False
                    break
                c = np.where(solid[:, x + k])[0]
                if not len(c) or int(c[0]) > top + 1:
                    stable = False
                    break
            if stable:
                return x
    return min(w, h) // 4


def compact(im: Image.Image, slice_px: int, mid: int = MID) -> Image.Image:
    w, h = im.size
    s = int(slice_px)
    if 2 * s + mid > w or 2 * s + mid > h:
        raise SystemExit(f"slice {s} + mid {mid} does not fit {w}x{h}")
    out = Image.new("RGBA", (2 * s + mid, 2 * s + mid), (0, 0, 0, 0))
    # 9 tiles from the source (center strip taken just inside the corner)
    tiles = {
        "tl": (0, 0, s, s),
        "t": (s, 0, s + mid, s),
        "tr": (w - s, 0, w, s),
        "l": (0, s, s, s + mid),
        "c": (s, s, s + mid, s + mid),
        "r": (w - s, s, w, s + mid),
        "bl": (0, h - s, s, h),
        "b": (s, h - s, s + mid, h),
        "br": (w - s, h - s, w, h),
    }
    dest = {
        "tl": (0, 0),
        "t": (s, 0),
        "tr": (s + mid, 0),
        "l": (0, s),
        "c": (s, s),
        "r": (s + mid, s),
        "bl": (0, s + mid),
        "b": (s, s + mid),
        "br": (s + mid, s + mid),
    }
    for key, box in tiles.items():
        out.paste(im.crop(box), dest[key])
    return out


def bake(src_name: str, extra: int = 3) -> dict:
    out = UI / src_name
    raw = UI / src_name.replace(".png", ".src.png")
    if not raw.exists():
        Image.open(out).save(raw)
    im = crop_alpha(Image.open(raw))
    r = radius(im)
    slice_px = min(r + extra, im.size[0] // 2 - MID - 1, im.size[1] // 2 - MID - 1)
    patch = compact(im, slice_px)
    patch.save(out)
    return {"file": src_name, "radius": r, "slice": slice_px, "patch": list(patch.size)}


def main() -> None:
    meta = {
        "dialog-9slice.png": bake("dialog-9slice.png", extra=3),
        "btn-send-9slice.png": bake("btn-send-9slice.png", extra=3),
        "btn-speak-9slice.png": bake("btn-speak-9slice.png", extra=3),
    }
    (UI / "nine-slice.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
