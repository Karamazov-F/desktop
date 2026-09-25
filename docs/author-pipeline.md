# 作者侧出包流程（无美术背景版）

你的角色不是画家，是**制片 + 验收**：像以前对接美术那样，只关心「交什么文件、能不能在软件里播」。

整体路线（默认）：**一张干净静图 → AI 视频做动作 → 抽帧抠图 → 填进角色包 → 桌宠里验收。**

---

## 总流程（备份用，按步执行，不要跳）

| 步 | 你做什么 | 完成标准 |
|----|----------|----------|
| **1** | 跑通现成示例包，搞清「合格素材长什么样」 | 能在桌宠里点出 idle / 睡觉 / 伸懒腰等 |
| **2** | 锁定本包规格（尺寸、动作清单、命名） | 一张验收清单，后面所有图都按它交 |
| **3** | 拿到**唯一**一张基准静图（单人全身 idle） | 一张透明或绿幕 PNG，只有一个人 |
| **4** | 用静图 → 短视频，做出各动作 | 每个动作一段短 MP4（锁镜头） |
| **5** | 视频 → 透明 PNG 帧（对齐、抠底） | 帧文件齐，命名对上清单 |
| **6** | 写入 `pack.json`，桌宠里播一遍 | 各状态能切、不飘、回 idle 正常 |
| **7** | （可选）发角色包 / 小红书分发 | 别人能装包用 |

当前默认目标包：`packs/sample-human/`（可改名）。

进包最终格式永远是：

```text
packs/<id>/
  pack.json
  sprites/*.png    # 透明底，同尺寸，脚大致对齐
```

中间可以有 sheet、MP4；**进产品前必须拆成上面这种**（和以前引擎调动画文件一样）。

---

## 第 1 步 ✅

跑通 `packs/pixel`，确认状态切换与验收感觉。

## 第 1 步 ✅

跑通 `packs/pixel`，确认状态切换与验收感觉。

## 第 2 步 ✅（含方向 B）

- 画布 / 核心动作清单按上表（产品默认交互仍认这些名字）。
- **方向 B**：以后可加任意新状态——`pack.json` 的 `states` 里多写一项 + 对应 PNG 即可（播放器已按名字读帧）。  
  托盘中文名、单击绑哪个动作，属于后面改软件的事；**出图阶段先保证「有帧就能播」**。
- 第一包仍先凑齐核心 6 个状态；自定义动作（如 `wave2`、`dance`）作为加餐。

## 第 3 步 ✅

- 用 Comfy 文生图（无垫图）出 4 张候选；已选 `seed1001` 为基准。
- 路径：`packs/sample-human/ref/ref_idle.png`
- 其它候选：`packs/sample-human/ref/candidates/`

## 第 4 步（进行中）— 静图 → 视频 → 切帧

逐帧重生成（IP-Adapter+姿势）已验证：**帧间漂移过大，弃用作出包主路径**。

主线改回：

```text
ref_idle.png → Wan2.2 I2V 短视频（锁镜头）→ ffmpeg 抽帧 → 抠绿幕 → pack sprites
```

本机已有：`wan2.2_i2v_*_14B` + LightX2V 4step LoRA + `ComfyUI-WanVideoWrapper`。

```powershell
cd comfy
python batch_action_clips.py          # 全动作 I2V（非对话动作禁嘴部）
python assemble_action_pack.py        # 抽帧 + bridge + freeze_mouth + 写 pack
python verify_i2v_consistency.py
..\app\node_modules\electron\dist\electron.exe ..\scripts\verify_pet_display.js sample-human
```

硬要求（小杏）：

- **嘴部**：仅 `meow`/`happy` 可出现对话向口型；`idle`/`blink`/`stretch`/`sleep` 必须闭嘴且经 `freeze_mouth`
- I2V：`start_image`=`end_image`=同一 `ref_idle`；源片 16fps 全帧保留
- idle/sleep：pingpong；只钉首帧 contact（闭嘴版）
- meow/blink/stretch/happy：首尾钉 contact
- 验证：`verify_i2v_consistency.py` + `verify_pet_display.js` + `verify_dialogue.js`

旧的 `batch_sprite_states.py` 产物仅作参考，不作为验收标准。

## 第 5 步

视频帧进包后，桌宠里播「样例人形」验收连贯性。

## ComfyUI 操作规范

Agent 侧流程：`.cursor/skills/comfyui-pet-pipeline/SKILL.md`
