#!/usr/bin/env python3
"""Pin contact frame for action handoff / loop policy.

- idle / sleep: first only (pingpong loops; hard last=contact causes pop)
- meow / blink / stretch / happy: first + last (return to standing contact)
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from process_to_pack import process_one

PACK = Path(
    r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\sample-human"
)
SPRITES = PACK / "sprites"
REF = PACK / "ref" / "ref_idle.png"

FIRST_ONLY = {"idle", "sleep"}
BOTH = {"meow", "blink", "stretch", "happy"}


def ensure_contact() -> Path:
    contact = SPRITES / "contact.png"
    process_one(REF, contact)
    # Standing/default contact must be mouth-closed (dialogue actions may smile mid-clip).
    contact = paint_closed_mouth(contact)
    shutil.copy2(contact, SPRITES / "idle.png")
    return contact


def paint_closed_mouth(path: Path) -> Path:
    """Close open mouth without leaving a flat gray patch."""
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).copy().astype(np.float32)
    a = arr[..., 3] > 16
    ys, xs = np.where(a)
    if len(xs) == 0:
        return path
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    h, w = y1 - y0, x1 - x0
    # cheek sample (above mouth, left/right)
    cy0, cy1 = y0 + int(h * 0.22), y0 + int(h * 0.30)
    lx0, lx1 = x0 + int(w * 0.28), x0 + int(w * 0.38)
    rx0, rx1 = x0 + int(w * 0.62), x0 + int(w * 0.72)
    cheeks = []
    for ya0, ya1, xa0, xa1 in ((cy0, cy1, lx0, lx1), (cy0, cy1, rx0, rx1)):
        patch = arr[ya0:ya1, xa0:xa1]
        m = patch[..., 3] > 16
        if m.any():
            cheeks.append(patch[m][:, :3])
    if not cheeks:
        return path
    skin = np.concatenate(cheeks, 0).mean(axis=0)

    mx0 = x0 + int(w * 0.40)
    mx1 = x0 + int(w * 0.60)
    my0 = y0 + int(h * 0.33)
    my1 = y0 + int(h * 0.43)
    region = arr[my0:my1, mx0:mx1]
    lum = region[..., :3].mean(axis=2)
    # replace cavity / dark lip interior only; keep outlines lightly
    mask = (region[..., 3] > 16) & (lum < 150)
    for c in range(3):
        ch = region[..., c]
        ch[mask] = skin[c]
        region[..., c] = ch
    arr[my0:my1, mx0:mx1] = region
    im2 = Image.fromarray(arr.astype(np.uint8), "RGBA")
    draw = ImageDraw.Draw(im2)
    cx = (mx0 + mx1) // 2
    cy = my0 + int((my1 - my0) * 0.55)
    draw.arc([cx - 6, cy - 2, cx + 6, cy + 4], start=15, end=165, fill=(70, 40, 40, 255), width=2)
    im2.save(path)
    return path


def frame_index(path: Path) -> int:
    try:
        return int(path.stem.rsplit("_", 1)[-1])
    except ValueError:
        return -1


def list_frames(prefix: str) -> list[Path]:
    frames = sorted(SPRITES.glob(f"{prefix}_*.png"), key=frame_index)
    return [f for f in frames if frame_index(f) >= 0]


def bridge_prefix(prefix: str, contact: Path, mode: str) -> None:
    frames = list_frames(prefix)
    if len(frames) < 1:
        print(f"skip {prefix}: no frames")
        return
    if len(frames) == 1:
        shutil.copy2(contact, frames[0])
        print(f"bridged {prefix}: single frame <- contact")
        return
    if mode == "both":
        shutil.copy2(contact, frames[0])
        shutil.copy2(contact, frames[-1])
        print(f"bridged {prefix}: {frames[0].name} & {frames[-1].name} (n={len(frames)})")
    else:
        shutil.copy2(contact, frames[0])
        print(f"bridged {prefix}: {frames[0].name} only (n={len(frames)})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefixes", nargs="*", default=None)
    args = ap.parse_args()
    contact = ensure_contact()
    print("contact", contact)
    prefixes = args.prefixes or sorted(FIRST_ONLY | BOTH)
    for p in prefixes:
        if not list_frames(p):
            continue
        mode = "first" if p in FIRST_ONLY else "both"
        bridge_prefix(p, contact, mode)


if __name__ == "__main__":
    main()
