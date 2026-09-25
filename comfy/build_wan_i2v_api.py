#!/usr/bin/env python3
"""Build a Wan2.2 I2V API prompt adapted to this machine's model filenames."""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXAMPLE = Path(
    r"L:\ai\comfy\ComfyUI-aki-v2\ComfyUI\custom_nodes"
    r"\ComfyUI-WanVideoWrapper\example_workflows"
    r"\wanvideo2_2_I2V_A14B_example_WIP.json"
)
OUT_UI = HERE / "wan22_i2v_pet_wave_workflow.json"
OUT_API = HERE / "wan22_i2v_pet_api.json"

# Models present on this machine
HIGH = "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
LOW = "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
VAE = "wan_2.1_vae.safetensors"
T5 = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"
LORA_HIGH = "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"
LORA_LOW = "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"
START_IMAGE = "pet_pipeline/ref/ref_idle.png"

POS = (
    "chibi anime girl, brown twin tails, red ribbon, white shirt, navy overall dress, "
    "black socks, brown shoes, full body, standing on green screen, "
    "waving hello with one hand, cute motion, locked camera, static background, "
    "same character, solid green background"
)
NEG = (
    "camera move, zoom, pan, text, watermark, multiple characters, character sheet, "
    "blurry, lowres, distorted face, extra fingers, morphing clothes, different outfit"
)


def patch_ui_workflow() -> dict:
    wf = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    for n in wf["nodes"]:
        t = n.get("type")
        w = n.get("widgets_values")
        if t == "WanVideoModelLoader":
            # high/low by id from example: 22 high, 71 low
            if n["id"] == 22:
                w[0] = HIGH
            elif n["id"] == 71:
                w[0] = LOW
            w[1] = "bf16"
            w[2] = "fp8_e4m3fn_scaled"
            w[3] = "offload_device"
            # attention mode may be last
            if len(w) >= 5:
                w[4] = "sdpa"
        elif t == "WanVideoVAELoader":
            w[0] = VAE
            if len(w) > 1:
                w[1] = "bf16"
        elif t == "LoadWanVideoT5TextEncoder":
            w[0] = T5
            w[1] = "bf16"
            if len(w) > 2:
                w[2] = "offload_device"
        elif t == "WanVideoLoraSelect":
            # 56 high strength-ish, 97 low — map by id
            if n["id"] == 56:
                w[0] = LORA_HIGH
                w[1] = 1.0
            elif n["id"] == 97:
                w[0] = LORA_LOW
                w[1] = 1.0
        elif t == "LoadImage":
            w[0] = START_IMAGE
        elif t == "WanVideoTextEncode":
            w[0] = POS
            w[1] = NEG
        elif t == "CLIPTextEncode":
            # native bridge prompts if present
            text = w[0] if isinstance(w, list) else ""
            if "panda" in str(text).lower() or "nature" in str(text).lower():
                w[0] = POS
            else:
                w[0] = NEG
        elif t == "WanVideoImageToVideoEncode":
            # width, height, num_frames, ...
            # Keep modest for 5070 Ti: 512x512, 33 frames (~2s @16fps)
            w[0] = 512
            w[1] = 512
            w[2] = 33
        elif t == "ImageResizeKJv2":
            w[0] = 512
            w[1] = 512
        elif t == "VHS_VideoCombine":
            if isinstance(w, dict):
                w["filename_prefix"] = "pet_pipeline/video/wave"
                w["frame_rate"] = 16
            elif isinstance(w, list) and len(w) >= 3:
                w[2] = "pet_pipeline/video/wave"
        elif t == "WanVideoSampler":
            # lightx2v 4 steps
            # widgets typically: steps, cfg, shift, seed, ...
            if isinstance(w, list) and len(w) >= 1:
                w[0] = 4  # steps
                if len(w) > 1:
                    w[1] = 1.0  # cfg
        elif t == "INTConstant" and n.get("title") == "Steps":
            w[0] = 4
        elif t == "INTConstant" and n.get("title") == "Split_step":
            w[0] = 2
    OUT_UI.write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT_UI)
    return wf


def build_minimal_api() -> dict:
    """Minimal dual-model I2V API graph for WanVideoWrapper."""
    # Node IDs
    prompt = {
        # fp8-scaled umt5 is rejected by LoadWanVideoT5TextEncoder; use native CLIP(wan).
        "11": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": T5,
                "type": "wan",
                "device": "default",
            },
        },
        "16": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": POS, "clip": ["11", 0]},
        },
        "17": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEG, "clip": ["11", 0]},
        },
        "18": {
            "class_type": "WanVideoTextEmbedBridge",
            "inputs": {
                "positive": ["16", 0],
                "negative": ["17", 0],
            },
        },
        "38": {
            "class_type": "WanVideoVAELoader",
            "inputs": {"model_name": VAE, "precision": "bf16"},
        },
        "56": {
            "class_type": "WanVideoLoraSelect",
            "inputs": {
                "lora": LORA_HIGH,
                "strength": 1.0,
                "low_mem_load": False,
                "merge_loras": False,
            },
        },
        "97": {
            "class_type": "WanVideoLoraSelect",
            "inputs": {
                "lora": LORA_LOW,
                "strength": 1.0,
                "low_mem_load": False,
                "merge_loras": False,
            },
        },
        "22": {
            "class_type": "WanVideoModelLoader",
            "inputs": {
                "model": HIGH,
                "base_precision": "bf16",
                "quantization": "fp8_e4m3fn_scaled",
                "load_device": "offload_device",
                "attention_mode": "sdpa",
            },
        },
        "71": {
            "class_type": "WanVideoModelLoader",
            "inputs": {
                "model": LOW,
                "base_precision": "bf16",
                "quantization": "fp8_e4m3fn_scaled",
                "load_device": "offload_device",
                "attention_mode": "sdpa",
            },
        },
        "39": {
            "class_type": "WanVideoBlockSwap",
            "inputs": {
                "blocks_to_swap": 25,
                "offload_img_emb": False,
                "offload_txt_emb": False,
                "use_non_blocking": False,
                "vace_blocks_to_swap": 0,
            },
        },
        "79": {
            "class_type": "WanVideoSetLoRAs",
            "inputs": {"model": ["22", 0], "lora": ["56", 0]},
        },
        "80": {
            "class_type": "WanVideoSetLoRAs",
            "inputs": {"model": ["71", 0], "lora": ["97", 0]},
        },
        "92": {
            "class_type": "WanVideoSetBlockSwap",
            "inputs": {"model": ["79", 0], "block_swap_args": ["39", 0]},
        },
        "93": {
            "class_type": "WanVideoSetBlockSwap",
            "inputs": {"model": ["80", 0], "block_swap_args": ["39", 0]},
        },
        "67": {
            "class_type": "LoadImage",
            "inputs": {"image": START_IMAGE},
        },
        "89": {
            "class_type": "WanVideoImageToVideoEncode",
            "inputs": {
                "vae": ["38", 0],
                "width": 512,
                "height": 512,
                # Prefer 4n+1 lengths Wan expects; longer clip → smoother cut frames
                "num_frames": 49,
                "noise_aug_strength": 0.02,
                "start_latent_strength": 1.0,
                "end_latent_strength": 1.0,
                "force_offload": True,
                # Strict first+last lock to the same ref (FLF2V-style closed loop)
                "start_image": ["67", 0],
                "end_image": ["67", 0],
                "fun_or_fl2v_model": True,
            },
        },
        # High noise pass: steps 0..2 of 4
        "27": {
            "class_type": "WanVideoSampler",
            "inputs": {
                "model": ["92", 0],
                "image_embeds": ["89", 0],
                "steps": 4,
                "cfg": 1.0,
                "shift": 5.0,
                "seed": 42,
                "force_offload": True,
                "scheduler": "dpm++_sde",
                "riflex_freq_index": 0,
                "text_embeds": ["18", 0],
                "denoise_strength": 1.0,
                "rope_function": "comfy",
                "start_step": 0,
                "end_step": 2,
                "add_noise_to_samples": False,
            },
        },
        # Low noise refine: steps 2..end
        "90": {
            "class_type": "WanVideoSampler",
            "inputs": {
                "model": ["93", 0],
                "image_embeds": ["89", 0],
                "steps": 4,
                "cfg": 1.0,
                "shift": 5.0,
                "seed": 42,
                "force_offload": True,
                "scheduler": "dpm++_sde",
                "riflex_freq_index": 0,
                "text_embeds": ["18", 0],
                "samples": ["27", 0],
                "denoise_strength": 1.0,
                "rope_function": "comfy",
                "start_step": 2,
                "end_step": -1,
                "add_noise_to_samples": False,
            },
        },
        "28": {
            "class_type": "WanVideoDecode",
            "inputs": {
                "vae": ["38", 0],
                "samples": ["90", 0],
                "enable_vae_tiling": False,
                "tile_x": 272,
                "tile_y": 272,
                "tile_stride_x": 144,
                "tile_stride_y": 128,
                "normalization": "default",
            },
        },
        "60": {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "images": ["28", 0],
                "frame_rate": 16,
                "loop_count": 0,
                "filename_prefix": "pet_pipeline/video/wave",
                "format": "video/h264-mp4",
                "pingpong": False,
                "save_output": True,
            },
        },
    }

    # Inspect sampler optional start/end step names from object_info if needed later
    OUT_API.write_text(json.dumps(prompt, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT_API)
    return prompt


def main():
    patch_ui_workflow()
    build_minimal_api()


if __name__ == "__main__":
    main()
