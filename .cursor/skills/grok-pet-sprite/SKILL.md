---
name: grok-pet-sprite
description: >-
  Author-side desktop-pet character pack pipeline via Grok Imagine (greenscreen
  still → I2V clip → chroma-key sprites → pack.json). Trigger: Grok Imagine,
  Character Sprite, 绿幕小人, 角色包, 鲸鱼娘, 小鲸, xiao-jing, 二创出包, grok 出帧.
---

# Grok → 桌宠角色包

作者侧流程。用户不依赖 Cursor / MCP。DeepSeek 只当文本，不宣传能看图。不做大众向制作器，不做侵权官发脸包。

对照：静图/I2V 本机备选见 `comfyui-pet-pipeline`。Comfy `8188` 通了走 Wan；不通走本 skill。

## 硬验收（没亲眼看到不算完成）

- 窗口 content size ≥ `pack.size`（含边距）
- 读 idle / 动作帧：头顶与脚完整进 256²，绿幕抠净
- 托盘文案与动作一致（`meow` 必须 `label: 挥手`，禁止残留「喵喵叫」）
- 触发后帧序列真的在变；动作 ≥6 帧
- idle 与其视频同源；不要把另一套裁切的静图硬盖成 `idle_0`

## 法律与人设

- 外形只用**公开关键词**自生成 Q 版精灵，不搬运他人立绘。
- 鲸鱼娘：蓝发、呆毛、鲸鳍耳、蓝瞳、深蓝女仆+白围裙、鲸尾。灵感可写「溟月 / ZipZipPipe」，角色名自定（现包 `xiao-jing` / 小鲸），禁止自称官方。
- 先写 `packs/<id>/_author/character-bible.md` 再出图。

## 目录约定

```text
packs/<id>/
  pack.json
  sprites/<state>_N.png   # 256 RGBA 透明
  ref/ref_idle.png        # 抠好的静图身份证
  ref/grok_*.jpg|mp4      # 原始 Imagine 产物
  _author/                # 人设与一次性脚本，不进 .dpet
```

核心状态：`idle`（loop+pingpong，24fps 全帧）/ `meow`（挥手，不 loop）/ `walk`（原地走，loop、不 pingpong；左右用 `scaleX(-1)`，不要出两套片）/ `stretch` / `sleep` / `happy` / `blink`。缺状态时播放器回退 idle，但托盘只列出已有动作。自动切动作默认关（`lifeStream: false`），只循环待机；走起来后要停就点托盘「待机」。

## 管线（已跑通）

### 0. 登录与 Cookie

1. 用户在本机浏览器登录 grok.com。
2. 隐私横幅用 CDP 点「全部允许」。不点会拦截后续点击。
3. 不要对已 Connect 的 Comfy 标签 `navigate` 去 Grok；Grok 用独立 Imagine 标签。

### 1. 绿幕静图（身份证）

Imagine 出 **单人全身** Q 版，脚在画幅下方。

必含：`solo, single character, full body, solid green screen #00FF00, mouth closed, chibi, cel-shaded`

禁止：`character sheet` / 多视图 / 双人 / 半身。

保存：`packs/<id>/ref/grok_idle_base.jpg` → `python comfy/process_to_pack.py <jpg> packs/<id>/ref/ref_idle.png`

### 2. Idle 视频

Character Sprite / Quick Animate 从该静图出 ~6s 呼吸/摆尾即可。相机锁死、闭嘴。

### 3. 动作视频（挥手等）

1. 打开静图 post，点缩略图 1。
2. 右侧 **動画を作成 → Add Prompt**（不要 Quick Animate，那会再出一段 idle）。
3. 底栏切 **動画**，关掉 **動画音声**，默认 480p / 6s 够用。
4. 提示词只写动作 + 锁镜头 + 同装同发 + 绿幕 + 闭嘴 + 回站立。例（挥手）：

```text
Same character, same outfit, same hair, full body on solid green screen #00FF00.
Locked camera, no zoom, no pan. She waves hello with her right hand: arm raises,
waves twice, then returns to her side. Mouth stays closed. Feet planted. Solo.
```

5. 提交后等新 post（URL `/imagine/post/<uuid>`）。中帧必须看见手臂举起；若全程站立，改提示重跑，不要进包。

行走必须是**侧身剪影**（鼻尖朝右、只露一只眼、不看镜头）。正脸踏步再 `scaleX(-1)` 看起来仍对着镜头，左右走会错。禁止正脸行走片进包。

先从静图出一张 **side profile 站立**（图模式，快），再对该侧身静图 Add Prompt 出原地走。不要从正脸静图直接 I2V 走路。

```text
Same character, same navy maid outfit, same blue whale-fin hair,
full body on solid green screen #00FF00. STRICT side profile facing right:
nose points right, only one eye visible, NOT looking at camera.
In-place walk cycle like a treadmill. Locked camera. Does not translate.
Mouth closed. Solo. Never turn to face camera.
```

提交后轮询要短（几秒一次，总共别空等一分钟）。中帧必须看见侧身迈步；不要出左右两套片。

「最後のフレームを追加」易被缩略图挡住；可跳过，本地用同 clip 的首尾站立帧。

### 4. 下载（curl 会超时）

`assets.grok.com` 用系统 curl 常超时。在 Imagine 页：

```js
const v = document.querySelector('video');
const r = await fetch(v.currentSrc, { credentials: 'include' });
// arrayBuffer → base64 data URL，再写 packs/<id>/ref/grok_<action>.mp4
```

`canvas.toDataURL` 会 tainted，不要用。PowerShell 会吃 Python 引号：**写成 `_author/*.py` 再 `python 该文件`**。

### 5. 抽帧抠绿

```powershell
python comfy\extract_video_frames.py packs\<id>\ref\grok_idle.mp4 --prefix idle --count 0 --shared-bbox --pack-sprites packs\<id>\sprites
python comfy\extract_video_frames.py packs\<id>\ref\grok_wave.mp4 --prefix meow --count 0 --shared-bbox --pack-sprites packs\<id>\sprites
python comfy\extract_video_frames.py packs\<id>\ref\grok_walk.mp4 --prefix walk --count 0 --shared-bbox --pack-sprites packs\<id>\sprites
```

行走片只做**侧身原地走循环**，不要平移出画，不要正脸。开步前站立帧可从 pack 列表裁掉。不要 pingpong（会倒着走）。

`--count 0` = 源片全帧。Grok Imagine 默认 24fps / 6s，抽稀到 16 帧再配 8fps 会明显一顿一顿。不要改成 GIF：桌宠要真透明，GIF 只有 256 色、alpha 脏边，播放器本来就是 PNG 序列。

`--shared-bbox` 整段共用裁切/缩放，避免尾巴摆动时角色乱跳。不要逐帧 `process_one`。

idle **不要**用另一套 bbox 的静图覆盖 `idle_0`（会跳）。静图只放 `ref/ref_idle.png`。

`idle`/`sleep`：全帧 24fps；若首尾姿势不同（鲸尾左右）加 `pingpong`，避免 6s 循环跳变。`meow`/`stretch`/`happy`：不 loop，首尾尽量回站立。播放器间隔下限 32ms，可到 24–30fps。

### 6. pack.json

`states.meow.label` 必须是 `挥手`。`states.walk.label` 必须是 `走`。`size` 256²。跑：

```powershell
python packs\<id>\_author\update_pack.py
node scripts\check-packs.js
app\node_modules\electron\dist\electron.exe scripts\verify_pet_display.js <id>
```

`verify_pet_display` 必须走 `window.__petTest.pinFrame`（停 idle 定时器、钉双层）。只改 `#sprite.src` 会截到待机。偶发 GPU `0x0`：设 `ELECTRON_DISABLE_GPU=1` 重跑。`sizeOk` 仍以 `getContentSize` 为准。

## 已验证锚点（小鲸 0.4.0）

| 项 | 值 |
|----|----|
| 包 | `packs/xiao-jing` |
| 静图 post | `c638c06f-c19a-471c-9eba-ff30ddd2a329` |
| idle 视频 | `ef0f2caa-53e5-4baa-8e61-c5462bb460f1`（944²） |
| 挥手视频 | `d8e48088-5f2b-451b-ae26-5c68d931aab8`（544²） |
| 行走视频 | `1927ad13-448c-4fee-b9d5-18cf1c37e202`（侧身 544²，从静图 `2dc09c7b-…`） |
| 显示 | content 288×392 ≥ 256；idle 顶/底边距通过；走 128 帧 loop；朝左 `scaleX(-1)` |

未做（下次打磨）：自动切动作逻辑（用户另定）；`stretch` / `sleep` / `happy` / `blink`；两段视频 bbox 未对齐时切动作会微跳；Grok UI 锁尾帧。

## 失败速查

| 现象 | 处理 |
|------|------|
| Cookie 挡点击 | CDP 点「全部允许」 |
| curl grok 超时 | 页内 `fetch` + credentials |
| PowerShell 解析失败 | 写 `.py` 再跑 |
| idle 循环跳动 | `--shared-bbox`；勿混静图裁切 |
| 挥手看起来像 idle | 看中帧；没举手就重跑 |
| 行走看起来像 idle | 看中帧腿是否迈步；站立片头从 pack 列表裁掉 |
| 朝左仍正脸对镜头 | 行走片必须侧身；正脸+翻转无效，重做侧身静图再 I2V |
| 等视频太久 | 短轮询几次；不要一次 await 几十秒 |
| 左右要两套行走片 | 禁止；托盘「朝向」走 `facing` IPC + CSS 翻转 |
| 托盘仍写喵喵叫 | `states.meow.label = 挥手` |
| Comfy 8188 连接被拒 | 继续 Grok；探测加 `--noproxy "*"` |
| 验证截图 0×0 | `ELECTRON_DISABLE_GPU=1` 重跑 |
