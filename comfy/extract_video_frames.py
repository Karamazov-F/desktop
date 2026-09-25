#!/usr/bin/env python3
"""Extract evenly spaced frames from MP4, then chroma-key into pack sprites."""
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from process_to_pack import process_one

FFMPEG = "ffmpeg.exe"


def extract(mp4: Path, out_dir: Path, count: int) -> list[Path]:
    """count<=0 means keep every decoded frame (max temporal density)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "raw_%03d.png"
    subprocess.run(
        [FFMPEG, "-y", "-i", str(mp4), "-vsync", "0", str(pattern)],
        check=True,
        capture_output=True,
    )
    files = sorted(out_dir.glob("raw_*.png"))
    if not files:
        raise RuntimeError(f"ffmpeg produced no frames from {mp4}")
    if count > 0 and len(files) > count:
        idxs = [round(i * (len(files) - 1) / max(count - 1, 1)) for i in range(count)]
        files = [files[i] for i in idxs]
    return files


def clear_prefix(pack: Path, prefix: str) -> None:
    for old in pack.glob(f"{prefix}_*.png"):
        old.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4")
    ap.add_argument(
        "--count",
        type=int,
        default=0,
        help="frames to keep; 0 = all frames (highest density)",
    )
    ap.add_argument("--prefix", required=True, help="e.g. meow -> meow_0.png")
    ap.add_argument(
        "--pack-sprites",
        default=r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\sample-human\sprites",
    )
    ap.add_argument(
        "--shared-bbox",
        action="store_true",
        help="one crop/scale for the whole clip so the sprite does not bounce",
    )
    args = ap.parse_args()
    mp4 = Path(args.mp4)
    pack = Path(args.pack_sprites)
    clear_prefix(pack, args.prefix)
    with tempfile.TemporaryDirectory() as td:
        raws = extract(mp4, Path(td), args.count)
        dsts = []
        for i, src in enumerate(raws):
            dst = pack / f"{args.prefix}_{i}.png"
            if args.count == 1 and args.prefix in {"idle", "blink", "happy"}:
                dst = pack / f"{args.prefix}.png"
            dsts.append(dst)
        if args.shared_bbox:
            from process_to_pack import process_clip

            process_clip(raws, dsts)
        else:
            for src, dst in zip(raws, dsts):
                process_one(src, dst)
                print("wrote", dst)
        print(f"total {args.prefix}: {len(raws)}")


if __name__ == "__main__":
    main()
