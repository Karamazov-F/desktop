#!/usr/bin/env python3
"""Queue Wan2.2 I2V API prompt and wait for MP4."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import run_pet_pipeline as r
from build_wan_i2v_api import POS, NEG, START_IMAGE, build_minimal_api
from PIL import Image

HERE = Path(__file__).resolve().parent
COMFY_INPUT_REF = r.COMFY_ROOT / "input" / "pet_pipeline" / "ref" / "ref_idle.png"
PACK_REF = Path(
    r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\sample-human\ref\ref_idle.png"
)


def ensure_ref_512():
    src = PACK_REF if PACK_REF.exists() else COMFY_INPUT_REF
    img = Image.open(src).convert("RGB")
    img = img.resize((512, 512), Image.Resampling.LANCZOS)
    COMFY_INPUT_REF.parent.mkdir(parents=True, exist_ok=True)
    img.save(COMFY_INPUT_REF)
    print("ref ready", COMFY_INPUT_REF, img.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default="waving hello with one hand")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--prefix", default="pet_pipeline/video/wave")
    ap.add_argument("--frames", type=int, default=49)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument(
        "--extra-neg",
        default="",
        help="extra negative prompt (e.g. mouth motion bans)",
    )
    ap.add_argument("--extra-pos", default="", help="extra positive prompt clauses")
    args = ap.parse_args()

    ensure_ref_512()
    build_minimal_api()
    prompt = json.loads((HERE / "wan22_i2v_pet_api.json").read_text(encoding="utf-8"))
    pos = (
        "chibi anime girl, brown twin tails, red ribbon, white shirt, navy overall dress, "
        "black socks, brown shoes, full body, standing on green screen, "
        f"{args.action}, cute motion, locked camera, static background, "
        "same character, solid green background"
    )
    if args.extra_pos.strip():
        pos = pos + ", " + args.extra_pos.strip()
    neg = NEG
    if args.extra_neg.strip():
        neg = neg + ", " + args.extra_neg.strip()
    prompt["16"]["inputs"]["text"] = pos
    prompt["17"]["inputs"]["text"] = neg
    prompt["67"]["inputs"]["image"] = START_IMAGE
    prompt["89"]["inputs"]["width"] = args.size
    prompt["89"]["inputs"]["height"] = args.size
    prompt["89"]["inputs"]["num_frames"] = args.frames
    prompt["27"]["inputs"]["seed"] = args.seed
    prompt["90"]["inputs"]["seed"] = args.seed
    prompt["60"]["inputs"]["filename_prefix"] = args.prefix
    prompt["60"]["inputs"]["frame_rate"] = 16

    print("queueing Wan I2V…")
    pid = r.queue_prompt(prompt)
    print("prompt_id", pid)
    hist = r.wait_history(pid, timeout_s=1800)
    status = hist.get("status", {})
    print("status", status.get("status_str"))
    if status.get("status_str") == "error":
        print(json.dumps(status, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    print("outputs", hist.get("outputs"))
    out_root = r.COMFY_ROOT / "output"
    videos = sorted(out_root.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if videos:
        print("latest video", videos[0])
        dest = HERE / "videos" / videos[0].name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(videos[0], dest)
        print("copied", dest)


if __name__ == "__main__":
    main()
