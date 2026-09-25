#!/usr/bin/env python3
"""Build a loadable ComfyUI UI workflow for pet Wan2.2 I2V and install it."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXAMPLE = Path(
    r"L:\ai\comfy\ComfyUI-aki-v2\ComfyUI\custom_nodes"
    r"\ComfyUI-WanVideoWrapper\example_workflows"
    r"\wanvideo2_2_I2V_A14B_example_WIP.json"
)
OUT_REPO = HERE / "wan22_i2v_pet_ui.json"
OUT_COMFY = Path(
    r"L:\ai\comfy\ComfyUI-aki-v2\ComfyUI\user\default\workflows"
    r"\pet_wan22_i2v_小杏.json"
)

HIGH = "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
LOW = "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
VAE = "wan_2.1_vae.safetensors"
T5_CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
LORA_HIGH = "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"
LORA_LOW = "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"
START_IMAGE = "pet_pipeline/ref/ref_idle.png"

POS = (
    "chibi anime girl, brown twin tails, red ribbon, white shirt, navy overall dress, "
    "black socks, brown shoes, full body, standing on green screen, "
    "subtle idle standing loop, gentle breathing, very slight sway, arms at sides, "
    "mouth firmly closed, lips sealed, silent, no talking, "
    "locked camera, static background, same character, solid green background"
)
NEG = (
    "camera move, zoom, pan, text, watermark, multiple characters, character sheet, "
    "blurry, lowres, distorted face, extra fingers, morphing clothes, different outfit, "
    "talking, speaking, lip sync, mouth opening and closing, chewing, open mouth"
)


def main():
    wf = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in wf["nodes"]}

    for n in wf["nodes"]:
        t = n.get("type")
        w = n.get("widgets_values")
        if t == "WanVideoModelLoader":
            if n["id"] == 22:
                w[0] = HIGH
            elif n["id"] == 71:
                w[0] = LOW
            w[1] = "bf16"
            w[2] = "fp8_e4m3fn_scaled"
            w[3] = "offload_device"
            if len(w) >= 5:
                w[4] = "sdpa"
        elif t == "WanVideoVAELoader":
            w[0] = VAE
            if len(w) > 1:
                w[1] = "bf16"
        elif t == "CLIPLoader":
            w[0] = T5_CLIP
            w[1] = "wan"
            if len(w) > 2:
                w[2] = "default"
        elif t == "WanVideoLoraSelect":
            if n["id"] == 56:
                w[0], w[1] = LORA_HIGH, 1.0
            elif n["id"] == 97:
                w[0], w[1] = LORA_LOW, 1.0
        elif t == "LoadImage":
            w[0] = START_IMAGE
        elif t == "CLIPTextEncode":
            text = str(w[0]) if isinstance(w, list) else ""
            # crude: longer/positive vs negative by content
            if "camera move" in text.lower() or "blurry" in text.lower() or "watermark" in text.lower():
                w[0] = NEG
            else:
                w[0] = POS
        elif t == "WanVideoTextEncode":
            w[0], w[1] = POS, NEG
            n["mode"] = 2  # Never — use CLIP bridge instead
        elif t == "WanVideoImageToVideoEncode":
            # width, height, num_frames, ...
            w[0], w[1], w[2] = 512, 512, 65
        elif t == "VHS_VideoCombine":
            if isinstance(w, dict):
                w["filename_prefix"] = "pet_pipeline/video/pet_ui"
                w["frame_rate"] = 16
        elif t == "INTConstant" and n.get("title") == "Steps":
            w[0] = 4
        elif t == "INTConstant" and n.get("title") == "Split_step":
            w[0] = 2
        elif t == "LoadWanVideoT5TextEncoder":
            # broken for fp8-scaled on this machine — never execute
            n["mode"] = 2  # Never
            w[0] = T5_CLIP

    # Rewire sampler text_embeds: WanVideoTextEncode(16) → WanVideoTextEmbedBridge(46)
    bridge_id = 46
    for L in wf["links"]:
        # [link_id, src, src_slot, dst, dst_slot, type]
        if L[3] in (27, 90) and L[5] == "WANVIDEOTEXTEMBEDS":
            L[1] = bridge_id
            L[2] = 0

    # Update node input link ids on samplers for text_embeds
    for sid in (27, 90):
        for inp in nodes[sid].get("inputs", []):
            if inp.get("name") == "text_embeds":
                # keep existing link id numbers; they now point from bridge
                pass

    # Connect end_image from same LoadImage (67) as start_image
    # find start_image link id
    start_link = None
    for inp in nodes[89].get("inputs", []):
        if inp.get("name") == "start_image":
            start_link = inp.get("link")
    load_img = 67
    new_link_id = int(wf.get("last_link_id", 200)) + 1
    wf["last_link_id"] = new_link_id
    # link: LoadImage IMAGE out slot 0 → ImageToVideo end_image
    end_slot = None
    for i, inp in enumerate(nodes[89].get("inputs", [])):
        if inp.get("name") == "end_image":
            end_slot = i
            inp["link"] = new_link_id
            break
    if end_slot is not None:
        wf["links"].append(
            [new_link_id, load_img, 0, 89, end_slot, "IMAGE"]
        )
        # also set fun_or_fl2v if widget exists — widgets[?] 
        w = nodes[89].get("widgets_values")
        if isinstance(w, list) and len(w) >= 8:
            # typical: ..., force_offload, fun_or_fl2v, tiled_vae
            w[7] = True  # fun_or_fl2v_model for end frame

    # Helpful note
    for n in wf["nodes"]:
        if n.get("type") == "Note" and "native ComfyUI text" in str(n.get("widgets_values", "")):
            n["widgets_values"] = [
                "【小杏桌宠 I2V】\n"
                "1) Load Image 用 input/pet_pipeline/ref/ref_idle.png\n"
                "2) 文本走 CLIPLoader(wan)+Bridge（右侧）；左侧 T5 已设为 Never（本机 fp8 不兼容）\n"
                "3) 改正向提示里的动作句；非对话动作加 mouth closed / 负向加 talking\n"
                "4) num_frames 建议 4n+1（65/49/33/17/81）\n"
                "5) 脚本批量入口：desktop-pet-custom/comfy/batch_action_clips.py"
            ]

    OUT_REPO.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_COMFY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_REPO, OUT_COMFY)
    # ASCII alias for easier browsing
    alias = OUT_COMFY.parent / "pet_wan22_i2v.json"
    shutil.copy2(OUT_REPO, alias)
    print("wrote", OUT_REPO)
    print("wrote", OUT_COMFY)
    print("wrote", alias)


if __name__ == "__main__":
    main()
