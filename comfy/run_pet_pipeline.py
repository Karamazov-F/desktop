#!/usr/bin/env python3
"""Queue a ComfyUI API prompt and wait for images."""
from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
HERE = Path(__file__).resolve().parent
COMFY_ROOT = Path(r"L:\ai\comfy\ComfyUI-aki-v2\ComfyUI")
INPUT_REF = COMFY_ROOT / "input" / "pet_pipeline" / "ref" / "ref_idle.png"


def get(url: str):
    import subprocess

    proc = subprocess.run(
        ["curl.exe", "-s", "--max-time", "60", url],
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    if proc.returncode == 0 and proc.stdout.strip():
        return json.loads(proc.stdout)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def post(url: str, payload: dict):
    """POST JSON. Prefer curl on Windows — urllib sometimes drops /prompt."""
    import subprocess
    import tempfile

    data = json.dumps(payload)
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        f.write(data)
        tmp = f.name
    try:
        proc = subprocess.run(
            [
                "curl.exe",
                "-s",
                "-H",
                "Content-Type: application/json",
                "--data-binary",
                f"@{tmp}",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            # fallback urllib
            req = urllib.request.Request(
                url,
                data=data.encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        return json.loads(proc.stdout)
    finally:
        Path(tmp).unlink(missing_ok=True)


def queue_prompt(prompt: dict, client_id: str = "pet-pipeline") -> str:
    out = post(f"{COMFY}/prompt", {"prompt": prompt, "client_id": client_id})
    if "error" in out:
        raise RuntimeError(out)
    return out["prompt_id"]


def wait_history(prompt_id: str, timeout_s: float = 600) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        hist = get(f"{COMFY}/history/{prompt_id}")
        if prompt_id in hist:
            return hist[prompt_id]
        time.sleep(1.5)
    raise TimeoutError(f"prompt {prompt_id} timed out")


def check_models() -> list[str]:
    missing = []
    checks = [
        COMFY_ROOT / "models" / "checkpoints" / "novaAnimeXL_ilV190.safetensors",
        COMFY_ROOT
        / "models"
        / "clip_vision"
        / "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors",
        COMFY_ROOT / "models" / "ipadapter" / "ip-adapter-plus_sdxl_vit-h.safetensors",
        COMFY_ROOT
        / "models"
        / "controlnet"
        / "control-lora-openposeXL2-rank256.safetensors",
    ]
    # Expected approximate sizes (MB) — reject tiny/incomplete files
    min_mb = {
        "novaAnimeXL_ilV190.safetensors": 5000,
        "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors": 2300,
        "ip-adapter-plus_sdxl_vit-h.safetensors": 700,
        "control-lora-openposeXL2-rank256.safetensors": 700,
    }
    for p in checks:
        if not p.exists() or p.stat().st_size < min_mb[p.name] * 1024 * 1024:
            missing.append(str(p))
    return missing


def load_prompt(path: Path, *, prompt_text: str | None, pose: str | None, seed: int | None) -> dict:
    prompt = json.loads(path.read_text(encoding="utf-8"))
    if prompt_text and "6" in prompt:
        prompt["6"]["inputs"]["text"] = prompt_text
    if pose and "11" in prompt:
        prompt["11"]["inputs"]["image"] = f"pet_pipeline/poses/{pose}"
    if seed is not None and "3" in prompt:
        prompt["3"]["inputs"]["seed"] = seed
    return prompt


def promote_latest_ref():
    """Copy newest ref candidate to ref_idle.png for IP-Adapter."""
    cand = COMFY_ROOT / "output" / "pet_pipeline" / "ref_candidates"
    if not cand.exists():
        return None
    files = sorted(cand.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return None
    INPUT_REF.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(files[0], INPUT_REF)
    return INPUT_REF


def main():
    ap = argparse.ArgumentParser(description="Run desktop-pet ComfyUI pipeline")
    ap.add_argument(
        "mode",
        choices=["check", "ref", "sprite", "promote-ref"],
        help="check models / generate idle ref / generate action sprite / copy latest ref",
    )
    ap.add_argument("--prompt", default=None, help="override positive prompt")
    ap.add_argument(
        "--pose",
        default="pose_ref.png",
        help="pose file under input/pet_pipeline/poses/",
    )
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.mode == "check":
        missing = check_models()
        if missing:
            print("MISSING or incomplete:")
            for m in missing:
                print(" -", m)
            raise SystemExit(1)
        print("OK: all required models present")
        return

    if args.mode == "promote-ref":
        path = promote_latest_ref()
        if not path:
            raise SystemExit("no ref candidates in output/pet_pipeline/ref_candidates")
        print("promoted", path)
        return

    try:
        get(f"{COMFY}/system_stats")
    except Exception:
        # urllib flaky on some Windows/Comfy setups — probe with curl
        import subprocess

        probe = subprocess.run(
            ["curl.exe", "-s", "-o", "NUL", "-w", "%{http_code}", f"{COMFY}/system_stats"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if probe.stdout.strip() != "200":
            raise SystemExit(f"ComfyUI not reachable at {COMFY}") from None

    if args.mode == "ref":
        prompt = load_prompt(
            HERE / "generate_ref_idle_api.json",
            prompt_text=args.prompt,
            pose=None,
            seed=args.seed,
        )
    else:
        missing = check_models()
        if missing:
            raise SystemExit("models incomplete:\n" + "\n".join(missing))
        if not INPUT_REF.exists():
            raise SystemExit(
                f"missing {INPUT_REF}\n"
                "Run: python run_pet_pipeline.py ref && python run_pet_pipeline.py promote-ref"
            )
        prompt = load_prompt(
            HERE / "pet_sprite_api_prompt.json",
            prompt_text=args.prompt,
            pose=args.pose,
            seed=args.seed,
        )

    print("queueing…")
    pid = queue_prompt(prompt)
    print("prompt_id", pid)
    hist = wait_history(pid)
    status = hist.get("status", {})
    if status.get("status_str") == "error" or status.get("completed") is False:
        print(json.dumps(hist.get("status"), ensure_ascii=False, indent=2))
        raise SystemExit("generation failed")
    images = []
    for node_out in hist.get("outputs", {}).values():
        for img in node_out.get("images", []):
            images.append(img)
    print("done:", images)


if __name__ == "__main__":
    main()
