---
name: comfyui-pet-pipeline
description: >-
  Operate local ComfyUI for desktop-pet-custom sprite production.
  Trigger: ComfyUI, 出图, 基准图, ref_idle, pet_sprite, 精灵帧, Queue Prompt,
  Browser MCP + Comfy, 8188.
---

# ComfyUI 桌宠素材操作规范

面向本仓库 `desktop-pet-custom`：Agent 用 **API 为主、Browser MCP 为辅** 操作本机 ComfyUI，产出可进包的静图/动作素材。

## 本机常量（勿猜）

| 项 | 值 |
|----|-----|
| ComfyUI | `L:\ai\comfy\ComfyUI-aki-v2\ComfyUI` |
| API | `http://127.0.0.1:8188`（请求必须 `--noproxy "*"` / 勿走系统代理） |
| 仓库脚本 | `comfy/run_pet_pipeline.py` |
| 基准图 | `packs/sample-human/ref/ref_idle.png` |
| 输入目录 | `ComfyUI\input\pet_pipeline\` |
| 输出目录 | `ComfyUI\output\pet_pipeline\` |
| UI 工作流 | `user\default\workflows\pet_sprite_pipeline.json` |
| 底模 | `novaAnimeXL_ilV190.safetensors` |

## 总原则

1. **跑图优先走 API**（`run_pet_pipeline.py` / `POST /prompt`）。稳定、可重复、不抢标签页。
2. **Browser MCP 只用于**：确认页面状态、看报错横幅、点「工作流/运行」、检查节点缺输入。不要用它替代 API 排队。
3. **禁止**在已 Connect 的 ComfyUI 标签上 `browser_navigate` 到外站（会弄丢用户页面）。需要外站时新开标签或让用户另开。
4. 探测 API 时清掉 `HTTP_PROXY`/`HTTPS_PROXY`，或用 `curl.exe --noproxy "*"`。代理挂掉时 PowerShell 默认请求会误伤 localhost。

## Browser MCP 接通清单

1. 用户 Chrome 打开 `http://127.0.0.1:8188/` 且页面正常。
2. 在该标签点扩展 **Browser MCP → Connect**。
3. Agent：`browser_snapshot` 标题含 `ComfyUI` 即接通。
4. 点击偶发 `No tab with given id`：先重新 `snapshot` 再点；仍失败则改 API。

## 两条工作流（勿混）

### A. 基准静图（第 3 步 / 无垫图）

```powershell
cd <repo>\comfy
python run_pet_pipeline.py ref --seed <n>
python run_pet_pipeline.py promote-ref
# 再复制到 packs/sample-human/ref/ref_idle.png
```

- 提示词必须含：`solo, single character, full body, green screen`
- **禁止**：`character sheet` / `reference sheet` / 多视图
- 验收：画面只有一个人、全身、脚在下方、绿幕

### B. 动作（主线：I2V → 切帧）

逐帧 IP-Adapter+姿势已验证帧差过大，**弃用作出包主路径**。

```powershell
python run_wan_i2v.py --action "waving hello with one hand, arm raises then returns to side" --prefix pet_pipeline/video/wave_flf --frames 49
python extract_video_frames.py videos\wave_flf_00001.mp4 --prefix meow --count 8
python verify_i2v_consistency.py
..\app\node_modules\electron\dist\electron.exe ..\scripts\verify_pet_display.js sample-human
```

要点：首尾同参考（`end_image`+`fun_or_fl2v_model`）；`umt5` fp8 走 `CLIPLoader(wan)`；idle 必须由同一 `ref_idle` 抠绿；动作 ≥6 帧；验证不过不算完成。

## UI 操作顺序（需要点界面时）

1. `browser_snapshot` 确认在 ComfyUI。
2. 若未加载：菜单/工作流 → `pet_sprite_pipeline`（或拖入仓库 JSON）。
3. 看红色「缺少所需输入」→ 补 Load Image 路径。
4. 改正向提示（动作句）时保留风格句。
5. 点「运行」或用 API `sprite`（优先 API）。
6. 产物在 `output/pet_pipeline/`；合格帧再裁到 256² 透明，写入 `packs/.../sprites/`。

## 与作者流程的衔接

见 `docs/author-pipeline.md`：

- 第 3 步 = 工作流 A（基准静图）
- 第 4 步起 = 视频/动作管线（Seedance 等）；Comfy B 仅作备选出帧

## 推荐外部技能（skills.sh）

安装后可配合阅读，不替代本规范：

| 技能 | 用途 | 安装量级 |
|------|------|----------|
| `mckruz/comfyui-expert@comfyui-api` | REST 排队/轮询 | ~1.5K |
| `mckruz/comfyui-expert@comfyui-workflow-builder` | 自然语言→工作流 JSON | ~1.5K |
| `mckruz/comfyui-expert@comfyui-character-gen` | 角色一致性方案选型 | ~400 |
| `mckruz/comfyui-expert@comfyui-troubleshooter` | 报错排查 | ~600 |

本机已安装（`~/.cursor/skills/` junction）：

- `comfyui-api`
- `comfyui-workflow-builder`
- `comfyui-character-gen`
- `comfyui-troubleshooter`

源码：`~/.cursor/skills/mckruz-comfyui-expert/`

说明：生态里几乎没有「点 Comfy 画布」的成熟高安装技能；行业共识是 **API 操作图**。本 skill 补齐本仓库路径与 Browser MCP 纪律。

## 失败速查

| 现象 | 处理 |
|------|------|
| API 连接被拒 / 走 22307 | `--noproxy "*"`；清环境代理变量 |
| Browser「Not connected」 | 用户在 ComfyUI 标签重新 Connect |
| 「此页面无法自动化」 | 多半在 chrome:// 或坏页；回到 8188 再 Connect |
| OpenposePreprocessor HF 错误 | 用姿势图直连 ControlNet（已是默认） |
| 出设定表双人 | 换 seed 重跑 A；提示词去掉 sheet |
| UI 缺输入 | 选好 ref / pose 文件名后重跑 |
