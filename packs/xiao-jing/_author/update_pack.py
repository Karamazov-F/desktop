import json
from pathlib import Path

PACK = Path(__file__).resolve().parents[1] / "pack.json"
SPRITES = PACK.parent / "sprites"


def frames(prefix: str) -> list[str]:
    files = sorted(
        SPRITES.glob(f"{prefix}_*.png"),
        key=lambda p: int(p.stem.rsplit("_", 1)[-1]),
    )
    return [f"sprites/{p.name}" for p in files]


def main() -> None:
    d = json.loads(PACK.read_text(encoding="utf-8"))
    idle = frames("idle")
    meow = frames("meow")
    walk = frames("walk")
    if len(idle) < 6:
        raise SystemExit(f"idle {len(idle)} < 6")
    if len(meow) < 6:
        raise SystemExit(f"meow {len(meow)} < 6")
    if len(walk) < 6:
        raise SystemExit(f"walk {len(walk)} < 6")
    d["states"]["idle"] = {
        "frames": idle,
        "fps": 24,
        "loop": True,
        "pingpong": True,
    }
    d["states"]["meow"] = {
        "frames": meow,
        "fps": 24,
        "loop": False,
        "label": "挥手",
    }
    d["states"]["walk"] = {
        "frames": walk,
        "fps": 24,
        "loop": True,
        "label": "走",
    }
    dialogue = d.setdefault("dialogue", {})
    on_action = dialogue.setdefault("onAction", {})
    on_action["walk"] = ["溜达一下。", "我走过去。"]
    rules = dialogue.setdefault("rules", [])
    walk_rule = next((r for r in rules if "走" in (r.get("keywords") or [])), None)
    if walk_rule:
        walk_rule["lines"] = ["那我走两步。", "好，挪过去。"]
        walk_rule["action"] = "walk"
    else:
        rules.append(
            {
                "keywords": ["走", "走路", "散步", "溜达"],
                "lines": ["那我走两步。", "好，挪过去。"],
                "action": "walk",
            }
        )
    d["version"] = "0.4.2"
    PACK.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print({"idle": len(idle), "meow": len(meow), "walk": len(walk), "version": d["version"]})


if __name__ == "__main__":
    main()
