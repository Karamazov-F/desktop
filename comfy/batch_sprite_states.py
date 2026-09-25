#!/usr/bin/env python3
"""Batch-generate pack states via pet sprite API workflow."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import run_pet_pipeline as r

HERE = Path(__file__).resolve().parent
STAGING = HERE / "staging"
STYLE = (
    "solo, single character, one girl only, chibi anime girl, brown twin tails, red ribbon, "
    "brown eyes, white shirt, navy overall dress, black socks, brown shoes, full body, "
    "feet on bottom edge, centered, empty space around character, clean thick lineart, "
    "flat cel shading, solid pure green screen background #00FF00, game sprite, no text, "
    "same outfit, same hairstyle"
)
NEG_EXTRA = ", character sheet, multiple characters, inset, collage"

JOBS: list[tuple[str, str, str, int]] = [
    ("idle", "pose_idle.png", "standing idle, arms down, neutral expression", 1001),
    ("blink", "pose_idle.png", "standing idle, eyes closed, blinking", 1002),
    ("happy", "pose_idle.png", "standing, soft smile, cheerful expression", 1003),
    ("meow_0", "pose_wave.png", "waving hello with one hand raised", 2001),
    ("meow_1", "pose_wave.png", "waving hello, hand mid wave", 2002),
    ("meow_2", "pose_wave.png", "waving hello, hand high", 2003),
    ("stretch_0", "pose_stretch.png", "arms raised stretching upward", 3001),
    ("stretch_1", "pose_stretch.png", "arms raised stretching, leaning back slightly", 3002),
    ("stretch_2", "pose_stretch.png", "arms raised stretching, eyes half closed", 3003),
    ("stretch_3", "pose_stretch.png", "arms raised stretching yawn", 3004),
    ("sleep_0", "pose_sleep.png", "sitting dozing, eyes half closed", 4001),
    ("sleep_1", "pose_sleep.png", "sitting asleep, head nodding down", 4002),
    ("sleep_2", "pose_sleep.png", "sitting asleep, peaceful", 4003),
    ("sleep_3", "pose_sleep.png", "sitting asleep, slight breathe", 4004),
]


def run_one(tag: str, pose: str, action: str, seed: int) -> Path:
    api = json.loads((HERE / "pet_sprite_api_prompt.json").read_text(encoding="utf-8"))
    api["6"]["inputs"]["text"] = f"{STYLE}, {action}"
    neg = api["7"]["inputs"]["text"]
    if "character sheet" not in neg:
        api["7"]["inputs"]["text"] = neg + NEG_EXTRA
    api["11"]["inputs"]["image"] = f"pet_pipeline/poses/{pose}"
    api["3"]["inputs"]["seed"] = seed
    api["9"]["inputs"]["filename_prefix"] = f"pet_pipeline/states/{tag}"

    print(f"queue {tag} seed={seed} pose={pose}")
    pid = r.queue_prompt(api)
    print("prompt_id", pid)
    hist = r.wait_history(pid)
    status = hist.get("status", {})
    if status.get("status_str") == "error":
        raise RuntimeError(json.dumps(status, ensure_ascii=False))
    imgs = []
    for node_out in hist.get("outputs", {}).values():
        for img in node_out.get("images", []):
            imgs.append(img)
    if not imgs:
        raise RuntimeError(f"no images for {tag}")
    info = imgs[0]
    sub = (info.get("subfolder") or "").replace("\\", "/")
    src = r.COMFY_ROOT / "output" / Path(sub) / info["filename"]
    if not src.exists():
        src = r.COMFY_ROOT / "output" / info["filename"]
    dst = STAGING / f"{tag}.png"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print("staged", dst)
    return dst


def main():
    STAGING.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    for tag, pose, action, seed in JOBS:
        if only and tag not in only and not any(tag.startswith(p.rstrip("_")) for p in only):
            # allow filter like: meow sleep
            if not any(tag.startswith(p) for p in only):
                continue
        dest = STAGING / f"{tag}.png"
        if dest.exists() and dest.stat().st_size > 10000:
            print("skip existing", dest)
            continue
        run_one(tag, pose, action, seed)
    print("ALL STAGED in", STAGING)


if __name__ == "__main__":
    main()
