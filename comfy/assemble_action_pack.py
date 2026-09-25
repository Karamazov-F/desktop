#!/usr/bin/env python3
"""Extract all action clips into pack sprites + update pack.json (full action set)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable
PACK = HERE.parent / "packs" / "sample-human"
SPRITES = PACK / "sprites"
PACK_JSON = PACK / "pack.json"
VIDEOS = HERE / "videos"

# latest clip file name pattern from batch prefixes
CLIPS = [
    ("idle", "idle_quiet", 0, {"loop": True, "pingpong": True, "fps": 16}),
    ("blink", "blink", 0, {"loop": False, "fps": 12}),
    ("stretch", "stretch", 0, {"loop": False, "label": "伸懒腰", "fps": 16}),
    ("sleep", "sleep", 0, {"loop": True, "pingpong": True, "label": "睡觉", "fps": 8}),
    ("happy", "happy", 0, {"loop": False, "label": "开心", "fps": 12}),
    ("meow", "wave_hi", 0, {"loop": False, "label": "挥手", "fps": 16}),
]


def newest(glob_pat: str) -> Path:
    files = sorted(VIDEOS.glob(glob_pat), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise SystemExit(f"missing video {glob_pat} under {VIDEOS}")
    return files[0]


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
    for state_id, clip_key, count, _meta in CLIPS:
        mp4 = newest(f"{clip_key}_*.mp4")
        print("extract", state_id, "<-", mp4.name)
        subprocess.run(
            [
                PY,
                str(HERE / "extract_video_frames.py"),
                str(mp4),
                "--prefix",
                state_id,
                "--count",
                str(count),
            ],
            cwd=HERE,
            check=True,
        )

    subprocess.run([PY, str(HERE / "seam_bridge.py")], cwd=HERE, check=True)
    # freeze AFTER bridge so donor mouth matches contact / frame0
    subprocess.run([PY, str(HERE / "freeze_mouth.py")], cwd=HERE, check=True)

    d = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    states = {}
    for state_id, _clip, _c, meta in CLIPS:
        frames = list_frames(state_id)
        if len(frames) < 1:
            raise SystemExit(f"no frames for {state_id}")
        # blink: keep a few mid frames if very short; still ok
        entry = {
            "frames": frames,
            "fps": meta.get("fps", 16),
            "loop": bool(meta.get("loop")),
        }
        if meta.get("pingpong"):
            entry["pingpong"] = True
        if meta.get("label"):
            entry["label"] = meta["label"]
        states[state_id] = entry

    d["states"] = states
    d["version"] = "0.4.0"
    d["persona"]["summary"] = "安静礼貌的桌边伙伴；挥手/开心会微笑，站立时闭嘴。"
    d["persona"]["systemPrompt"] = (
        "你是桌宠「小杏」：安静礼貌的 Q 版女孩，住在用户电脑桌面。"
        "用简体中文，每次回复尽量不超过 40 字。"
        "可以配合挥手、开心、伸懒腰、睡觉；站立待机时保持安静闭嘴。"
        "不要输出舞台说明或动作标记。不要扮演其他知名 IP。"
    )
    d["dialogue"] = {
        "onAction": {
            "meow": ["嗨～", "你好呀。", "我在这儿。"],
            "stretch": ["伸个懒腰…", "嗯…活动一下。"],
            "sleep": ["先眯一会儿…", "Zzz…"],
            "happy": ["嘿嘿。", "听到啦。"],
        },
        "rules": [
            {
                "keywords": ["你好", "嗨", "在吗", "hello", "hi", "挥手"],
                "lines": ["嗯，我在。", "嗨～", "你好呀。"],
                "action": "meow",
            },
            {
                "keywords": ["睡", "困", "休息", "晚安"],
                "lines": ["那…我睡一会儿？", "好，眯一下。"],
                "action": "sleep",
            },
            {
                "keywords": ["累", "懒腰", "活动"],
                "lines": ["那就伸个懒腰吧。", "嗯，活动一下。"],
                "action": "stretch",
            },
            {
                "keywords": ["开心", "高兴", "哈哈"],
                "lines": ["听到你这么说，我也开心。", "嘿嘿。"],
                "action": "happy",
            },
        ],
        "fallback": [
            "嗯…可以说「你好」或「困了」试试。",
            "我还在学怎么聊天。",
        ],
        "fallbackAction": None,
    }
    PACK_JSON.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {k: len(v["frames"]) for k, v in states.items()}
    print(json.dumps({"ok": True, "version": d["version"], "frames": summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
