#!/usr/bin/env python3
"""Batch I2V clips for sample-human with mouth-motion policy.

Rule: mouth moves ONLY on dialogue-related actions (meow/wave, happy).
idle / blink / stretch / sleep stay mouth-closed / silent.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable

# num_frames must be 4n+1 for Wan encode
ACTIONS = [
    {
        "id": "idle",
        "prefix": "pet_pipeline/video/idle_quiet",
        "frames": 65,
        "seed": 101,
        "dialogue_mouth": False,
        "action": (
            "subtle idle standing loop, gentle breathing, very slight sway, "
            "arms relaxed at sides, feet planted, eyes calm, "
            "mouth firmly closed the entire time, lips sealed, silent, no talking"
        ),
    },
    {
        "id": "blink",
        "prefix": "pet_pipeline/video/blink",
        "frames": 17,
        "seed": 102,
        "dialogue_mouth": False,
        "action": (
            "single soft blink, standing still, arms at sides, "
            "mouth firmly closed, lips sealed, silent, no talking"
        ),
    },
    {
        "id": "stretch",
        "prefix": "pet_pipeline/video/stretch",
        "frames": 49,
        "seed": 103,
        "dialogue_mouth": False,
        "action": (
            "stretching arms upward then returning to sides, standing, "
            "mouth firmly closed, lips sealed, silent, no talking, no yawning mouth"
        ),
    },
    {
        "id": "sleep",
        "prefix": "pet_pipeline/video/sleep",
        "frames": 49,
        "seed": 104,
        "dialogue_mouth": False,
        "action": (
            "dozing standing then settling into a sleepy pose with eyes closed, "
            "peaceful, mouth firmly closed, lips sealed, silent, no talking, no snoring mouth"
        ),
    },
    {
        "id": "happy",
        "prefix": "pet_pipeline/video/happy",
        "frames": 33,
        "seed": 105,
        "dialogue_mouth": True,
        "action": (
            "happy reaction, gentle smile, slight cheerful bounce, arms at sides, "
            "brief pleasant smile only, not rapid mouth chatter"
        ),
    },
    {
        "id": "meow",
        "prefix": "pet_pipeline/video/wave_hi",
        "frames": 81,
        "seed": 106,
        "dialogue_mouth": True,
        "action": (
            "waving hello with one hand, arm raises smoothly then returns to side, "
            "feet planted, brief friendly smile while greeting, "
            "not constant talking, not chewing"
        ),
    },
]

CLOSED_NEG = (
    "talking, speaking, lip sync, mouth opening and closing repeatedly, "
    "chewing, singing, shouting, open mouth, moving mouth, mouth flapping"
)


def run_one(spec: dict) -> None:
    cmd = [
        PY,
        str(HERE / "run_wan_i2v.py"),
        "--action",
        spec["action"],
        "--prefix",
        spec["prefix"],
        "--frames",
        str(spec["frames"]),
        "--seed",
        str(spec["seed"]),
    ]
    if not spec["dialogue_mouth"]:
        cmd += ["--extra-neg", CLOSED_NEG]
    print("==>", " ".join(cmd[-8:]), flush=True)
    subprocess.run(cmd, cwd=HERE, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--only",
        nargs="*",
        default=None,
        help="subset of action ids, default all",
    )
    args = ap.parse_args()
    wanted = set(args.only) if args.only else {a["id"] for a in ACTIONS}
    for spec in ACTIONS:
        if spec["id"] not in wanted:
            continue
        run_one(spec)
    print("batch done", sorted(wanted))


if __name__ == "__main__":
    main()
