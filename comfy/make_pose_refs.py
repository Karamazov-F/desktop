#!/usr/bin/env python3
"""Generate simple full-body stick-figure pose PNGs for OpenPose reference."""
from pathlib import Path

from PIL import Image, ImageDraw

W = H = 1024
OUT = Path(r"L:\ai\comfy\ComfyUI-aki-v2\ComfyUI\input\pet_pipeline\poses")


def draw_pose(name: str, segments: list[tuple], head: tuple[int, int, int]):
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for x0, y0, x1, y1, w in segments:
        d.line([(x0, y0), (x1, y1)], fill=(255, 255, 255), width=w)
    cx, cy, r = head
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
    path = OUT / name
    img.save(path)
    print("wrote", path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_pose(
        "pose_idle.png",
        [
            (512, 235, 512, 520, 14),
            (512, 300, 380, 420, 12),
            (512, 300, 644, 420, 12),
            (512, 520, 430, 780, 14),
            (512, 520, 594, 780, 14),
        ],
        (512, 180, 55),
    )
    draw_pose(
        "pose_wave.png",
        [
            (512, 235, 512, 520, 14),
            (512, 300, 380, 420, 12),
            (512, 300, 700, 220, 12),
            (700, 220, 760, 160, 10),
            (512, 520, 430, 780, 14),
            (512, 520, 594, 780, 14),
        ],
        (512, 180, 55),
    )
    draw_pose(
        "pose_stretch.png",
        [
            (512, 255, 512, 540, 14),
            (512, 280, 360, 120, 12),
            (512, 280, 664, 120, 12),
            (512, 540, 430, 800, 14),
            (512, 540, 594, 800, 14),
        ],
        (512, 200, 55),
    )
    draw_pose(
        "pose_sleep.png",
        [
            (480, 410, 520, 560, 14),
            (500, 480, 400, 520, 12),
            (520, 500, 620, 530, 12),
            (520, 560, 470, 720, 14),
            (520, 560, 600, 720, 14),
        ],
        (480, 360, 50),
    )
    # Default slot used by the API workflow
    Image.open(OUT / "pose_wave.png").save(OUT / "pose_ref.png")
    print("wrote", OUT / "pose_ref.png")


if __name__ == "__main__":
    main()
