#!/usr/bin/env python3
"""Rewrite pack.json idle/meow frame lists from sprites on disk."""
from __future__ import annotations

import json
from pathlib import Path

PACK_JSON = Path(
    r"C:\Users\Administrator\Projects\desktop-pet-custom\packs\sample-human\pack.json"
)
SPRITES = PACK_JSON.parent / "sprites"


def frame_index(path: Path) -> int:
    try:
        return int(path.stem.rsplit("_", 1)[-1])
    except ValueError:
        return -1


def list_frames(prefix: str) -> list[str]:
    files = sorted(
        (p for p in SPRITES.glob(f"{prefix}_*.png") if frame_index(p) >= 0),
        key=frame_index,
    )
    return [f"sprites/{p.name}" for p in files]


def main():
    d = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    idle = list_frames("idle")
    meow = list_frames("meow")
    if len(idle) < 2:
        raise SystemExit(f"idle frames < 2: {len(idle)}")
    if len(meow) < 8:
        raise SystemExit(f"meow frames < 8: {len(meow)}")

    # Match source video rate (VHS 16fps). Highest practical for this clip density.
    fps = 16
    d["states"]["idle"] = {
        "frames": idle,
        "fps": fps,
        "loop": True,
        # pingpong avoids pop when cycle ends (I2V last ≠ first)
        "pingpong": True,
    }
    d["states"]["meow"] = {
        "label": "挥手",
        "frames": meow,
        "fps": fps,
        "loop": False,
    }
    # sample-human debug/product slice: only idle + wave
    d["states"] = {
        "idle": d["states"]["idle"],
        "meow": d["states"]["meow"],
    }
    d["version"] = "0.3.3"
    PACK_JSON.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {"idle": len(idle), "meow": len(meow), "fps": fps, "version": d["version"]},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
