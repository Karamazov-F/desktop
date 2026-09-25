#!/usr/bin/env python3
"""Freeze mouth ROI across non-dialogue action frames.

Uses a donor frame's lower-face band and pastes it onto every frame so idle /
blink / stretch / sleep never lip-flap. Dialogue actions (meow, happy) are skipped.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

SPRITES = Path(
    r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\sample-human\sprites"
)
NO_MOUTH = ("idle", "blink", "stretch", "sleep")


def frame_index(path: Path) -> int:
    try:
        return int(path.stem.rsplit("_", 1)[-1])
    except ValueError:
        return -1


def opaque_bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    a = arr[..., 3] > 16
    ys, xs = np.where(a)
    if len(xs) == 0:
        h, w = arr.shape[:2]
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def mouth_band(arr: np.ndarray) -> tuple[int, int, int, int]:
    """Return (x0,y0,x1,y1) mouth-ish band from character opaque bbox."""
    x0, y0, x1, y1 = opaque_bbox(arr)
    h = max(1, y1 - y0)
    w = max(1, x1 - x0)
    # chibi: head is ~top 45% of body bbox; mouth in lower third of head
    head_y1 = y0 + int(h * 0.48)
    my0 = y0 + int(h * 0.30)
    my1 = min(head_y1 + int(h * 0.04), y1)
    mx0 = x0 + int(w * 0.32)
    mx1 = x0 + int(w * 0.68)
    if my1 <= my0 or mx1 <= mx0:
        return x0, y0, x1, y1
    return mx0, my0, mx1, my1


def freeze_prefix(prefix: str) -> None:
    frames = sorted(
        (p for p in SPRITES.glob(f"{prefix}_*.png") if frame_index(p) >= 0),
        key=frame_index,
    )
    if len(frames) < 2:
        print(f"skip {prefix}: {len(frames)} frames")
        return
    donor = np.asarray(Image.open(frames[0]).convert("RGBA"))
    x0, y0, x1, y1 = mouth_band(donor)
    patch = donor[y0:y1, x0:x1].copy()
    # soft edge
    ph, pw = patch.shape[:2]
    yy, xx = np.mgrid[0:ph, 0:pw]
    edge = np.minimum.reduce(
        [yy, ph - 1 - yy, xx, pw - 1 - xx]
    ).astype(np.float32)
    fade = np.clip(edge / max(3.0, min(ph, pw) * 0.15), 0, 1)[..., None]

    for p in frames[1:]:
        arr = np.asarray(Image.open(p).convert("RGBA")).copy()
        # clamp band to this frame size
        h, w = arr.shape[:2]
        xa0, ya0, xa1, ya1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
        if xa1 <= xa0 or ya1 <= ya0:
            continue
        src = patch[: ya1 - ya0, : xa1 - xa0]
        f = fade[: ya1 - ya0, : xa1 - xa0]
        dst = arr[ya0:ya1, xa0:xa1].astype(np.float32)
        src_f = src.astype(np.float32)
        blended = src_f * f + dst * (1.0 - f)
        arr[ya0:ya1, xa0:xa1] = blended.astype(np.uint8)
        Image.fromarray(arr, "RGBA").save(p)
    print(f"froze mouth on {prefix}: n={len(frames)} band=({x0},{y0})-({x1},{y1})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefixes", nargs="*", default=list(NO_MOUTH))
    args = ap.parse_args()
    for p in args.prefixes:
        freeze_prefix(p)


if __name__ == "__main__":
    main()
