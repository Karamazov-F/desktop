# ComfyUI 桌宠精灵生产线（5070 Ti）

面向 `desktop-pet-custom`：先出一张基准 idle，再 **Wan2.2 I2V 短视频 → 抽帧抠绿** 进包。  
（旧 IP-Adapter+姿势逐帧路径帧差过大，仅作备选。）

## 本机路径

| 项 | 路径 |
|----|------|
| ComfyUI 根目录 | `L:\ai\comfy\ComfyUI-aki-v2\ComfyUI` |
| WebUI | http://127.0.0.1:8188 |
| 参考图 | `input\pet_pipeline\ref\ref_idle.png` |
| 姿势图 | `input\pet_pipeline\poses\` |
| 出图 | `output\pet_pipeline\` |
| 仓库脚本 | `desktop-pet-custom\comfy\` |

## 需要的模型（已按这个名字下）

| 用途 | 文件 | 目录 |
|------|------|------|
| 底模（已有） | `novaAnimeXL_ilV190.safetensors` | `models/checkpoints` |
| CLIP Vision | `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | `models/clip_vision` |
| IP-Adapter | `ip-adapter-plus_sdxl_vit-h.safetensors` | `models/ipadapter` |
| OpenPose（轻量 Control-LoRA） | `control-lora-openposeXL2-rank256.safetensors` | `models/controlnet` |

自定义节点（你这边已有）：`ComfyUI_IPAdapter_plus`、`comfyui_controlnet_aux`。

模型下完后若列表里看不到，重启一次 ComfyUI。

## 一键命令（推荐）

在仓库里：

```powershell
cd C:\Users\Administrator\Projects\desktop-pet-custom\comfy

# 1) 检查模型是否下完
python run_pet_pipeline.py check

# 2) 生成候选基准立绘（不需要 IP-Adapter）
python run_pet_pipeline.py ref

# 3) 把最新候选复制成 ref_idle.png
python run_pet_pipeline.py promote-ref

# 4) 用姿势 + 参考图出动作帧（默认挥手 pose_ref）
python run_pet_pipeline.py sprite --pose pose_wave.png --seed 42

# 换动作示例
python run_pet_pipeline.py sprite --pose pose_stretch.png --prompt "chibi anime girl, ..., arms raised stretching, solid green background"
python run_pet_pipeline.py sprite --pose pose_sleep.png --prompt "chibi anime girl, ..., sitting dozing, eyes half closed, solid green background"
python run_pet_pipeline.py sprite --pose pose_idle.png
```

输出在 ComfyUI 的 `output\pet_pipeline\out_*.png`。满意后抠绿幕 → 缩到 128/256 → 放进 `packs/sample-human/`。

## 在浏览器里用（可视化）

1. 打开 http://127.0.0.1:8188  
2. 菜单 **Load** → 选仓库里的 `comfy\pet_sprite_workflow.json`（UI 工作流）  
3. 左边 `Load Image`：选 `pet_pipeline/ref/ref_idle.png`  
4. 右边姿势图：选 `pet_pipeline/poses/pose_wave.png` 等  
5. 改正向提示里的**动作句**，点 Queue  

若只有 API JSON：也可把 `pet_sprite_api_prompt.json` 拖进画布（新版 ComfyUI 支持），或直接用上面的 `run_pet_pipeline.py`。

## 参数建议（5070 Ti）

| 参数 | 建议 | 说明 |
|------|------|------|
| 分辨率 | 1024² | Illustrious/SDXL 舒服；出图后再缩 |
| steps | 26–32 | 再高收益小 |
| cfg | 4.5–6 | 太高容易脸崩 |
| IP-Adapter weight | 0.65–0.85 | 太高动作跟不住；太低不像同一个人 |
| ControlNet strength | 0.65–0.8 | 太高肢体僵；太低姿势飘 |
| 采样 | euler / normal | 稳 |

## 日常流水线

1. **只做一张**满意的 `ref_idle.png`（绿幕全身）。  
2. 每个动作：换 pose 图 + 改提示词里的动作句，其它风格句不要动。  
3. 同一动作可换 seed 抽 3–5 张，挑肢体最干净的。  
4. 抠图 → 对齐脚底 → 写入 pack。

## 姿势图怎么用

仓库脚本已生成黑底火柴人：`pose_idle / pose_wave / pose_stretch / pose_sleep`。

**默认工作流不跑 OpenposePreprocessor**（它会再下 HuggingFace 检测权重，你这台机器代理下容易挂）。火柴人图直接进 ControlNet 即可。

若你之后想「照片 → 骨架」：annotator 权重会下到  
`ComfyUI\custom_nodes\comfyui_controlnet_aux\ckpts\lllyasviel\Annotators\`  
（`body_pose_model.pth` / `hand_pose_model.pth` / `facenet.pth`），下完后可在图里加回 OpenposePreprocessor。

## 已验证

- 底模 txt2img 出基准：`python run_pet_pipeline.py ref` → `promote-ref`
- 全链路 sprite（IP-Adapter + Control-LoRA OpenPose）：`python run_pet_pipeline.py sprite --pose pose_wave.png`
- 输出目录：`ComfyUI\output\pet_pipeline\`
- UI 工作流：ComfyUI → Load → `pet_sprite_pipeline`（已拷到 `user\default\workflows\`）

抽图后若出现「角色设定表多格」或漂姿势：换一张**单人全身** `ref_idle.png`，并把提示词写成「single character, one figure only」。

