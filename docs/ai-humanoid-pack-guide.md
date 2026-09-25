# AI 做人形角色标准样例 — 完整步骤

面向：作者侧用 AI 出图，打成可换的角色包（多帧状态机，不是 Spine）。  
播放器约定动作名仍用：`idle` / `blink` / `sleep` / `stretch` / `meow` / `happy`（人形里 `meow` = 打招呼或开口说话）。

仓库里已有占位目录：`packs/sample-human/`（先填图，再改 `pack.json` 里路径）。

---

## 0. 先定规格（全角色统一，不要中途改）

| 项 | 建议值 | 原因 |
|----|--------|------|
| 画布 | **512×512** 出图，再缩到 **256×256** 或 **128×128** 进包 | 出图够细节；桌宠最终用小图 |
| 视角 | **全身、正面略 3/4、脚踩画布底边** | 各动作对齐，切换不「飘」 |
| 背景 | **纯色绿幕 `#00FF00` 或纯白**，后期抠成透明 PNG | AI 直接出透明往往脏边 |
| 风格句 | 写死一句，每张提示词都复制 | 例如：`chibi anime girl, clean lineart, flat color, soft shading` |
| 禁止 | 换发型/换衣服/换年龄；实景照片风；半身特写 | 一致性会崩 |

人形动作语义（文件仍用旧 id，方便托盘）：

| 状态 id | 人形演什么 | 建议帧数 |
|---------|------------|----------|
| `idle` | 站立待机（可 1 张，或 2 张轻微呼吸） | 1–2 |
| `blink` | 同姿势闭眼 | 1 |
| `happy` | 微笑 / 比心（可选） | 1–2 |
| `sleep` | 坐着打瞌睡或趴桌睡，带轻微起伏 | 3–4，loop |
| `stretch` | 双手上举伸懒腰 | 4–6，不 loop |
| `meow` | **挥手打招呼** 或 **张嘴说话**（单击用） | 3–4，不 loop |

---

## 1. 写「角色圣经」（5 分钟，后面全靠它）

新建文本 `character-bible.txt`，例如：

```text
名字：小杏（样例，勿用真人明星脸）
性别外观：少女，约头身 2.5～3 头身 Q版
发型：黑色双马尾，红色发带
眼睛：棕色大眼
服装：白色衬衫 + 深蓝背带裙 + 黑袜 + 棕色小皮鞋
性格气质：安静、礼貌
固定风格：chibi, anime, clean lineart, flat color, white outline optional
固定镜头：full body, standing on ground, centered, same character sheet
禁止：realistic photo, different outfit, adult face, celebrity likeness
```

有一张满意的「设定三视图/立绘」更好：后面所有动作都 **以这张为参考图（img2img / 垫图）**。

---

## 2. 先只做一张「基准 idle」（最重要）

### 提示词模板（复制后只改动作句）

**正向（英文通常更稳，可中英混）：**

```text
chibi anime girl, black twin tails, red ribbon, brown eyes,
white shirt, navy overall dress, black socks, brown shoes,
full body, front three-quarter view, feet on bottom edge, centered,
clean lineart, flat color, soft shading, simple design,
solid green background #00FF00,
same character, character sheet consistency
```

**反向：**

```text
photo, realistic, 3d render, blurry, extra fingers, extra arms,
different clothes, different hairstyle, cropped, close-up,
busy background, text, watermark, celebrity, complex background
```

### 操作要点

1. 多抽几张，**只留一张**当 `ref_idle.png`（设定基准）。  
2. 不要急着做动作；基准不过关，后面全废。  
3. 用抠图工具去绿幕 → 透明 PNG → 居中裁切到正方形。

推荐抠图：Photopea / Photoshop / remove.bg / 本地 RMBG。桌宠最终要 **透明底**。

---

## 3. 用基准图生成其它状态（一致性关键）

原则：**永远垫着 `ref_idle.png`**，改「动作描述」，少改外形描述。

### 各动作提示（在共用外形句后面追加）

**blink**

```text
same pose as reference, eyes closed, blinking, full body, green screen
```

**happy**

```text
same character as reference, gentle smile, one hand waving near chest,
full body, green screen
```

**sleep（出 3～4 张，姿势接近、略有起伏）**

```text
same character as reference, sitting and dozing off, head tilted down,
eyes closed, peaceful, full body visible, green screen
```

第 2、3 张可加：`slightly different breathing pose, tiny movement`

**stretch（按时间顺序出 4～6 张：开始 → 举起 → 最高 → 收回）**

```text
same character as reference, stretching arms upward, yawning lightly,
sequence frame {N} of 6, full body, green screen
```

若模型不懂 sequence：就分次写  
`arms starting to rise` → `arms fully stretched up` → `arms lowering`

**meow（人形=打招呼，出 3～4 张）**

```text
same character as reference, waving right hand hello, friendly expression,
mouth slightly open, sequence frame {N} of 4, full body, green screen
```

### 工具怎么选（任选你熟的）

| 工具 | 建议用法 |
|------|----------|
| Midjourney | 垫图 + 低 `--stylize`；注意商用条款 |
| SD / ComfyUI | IP-Adapter / Reference only，权重 0.6～0.85 |
| ChatGPT / Flux 类 | 上传基准图，明确写 “keep same outfit and face” |
| 即梦 / 可灵等 | 同样：参考图 + 固定服装描述 |

**不要**指望「一次对话生成整套 Spine」。我们要的是 **按状态的 PNG 序列**。

---

## 4. 后处理流水线（每张都做）

对每张图按同一套操作，避免大小乱跳：

1. 抠成透明 PNG  
2. 画布统一 **512×512**（角色脚对齐底部，左右居中）  
3. 缩放到包内尺寸：**256×256**（推荐）或 **128×128**  
4. 文件命名见下一节  
5. 快速幻灯片预览：同一位置切换几张，看头/脚是否对齐  

可选：用 Photoshop 动作 / ImageMagick 批处理缩放。

ImageMagick 示例（已装的话）：

```powershell
magick input.png -resize 256x256 -background none -gravity South -extent 256x256 output.png
```

---

## 5. 落盘到角色包

目录：

```text
packs/sample-human/
  pack.json
  sprites/
    idle.png
    blink.png
    happy.png
    sleep_0.png
    sleep_1.png
    sleep_2.png
    sleep_3.png
    stretch_0.png … stretch_5.png
    meow_0.png … meow_3.png
  _author/                 # 可选，不进发布
    character-bible.txt
    ref_idle.png
```

`pack.json` 可直接用仓库里 `packs/sample-human/pack.json` 模板；确认 `size` 与真实像素一致。

校验：

```powershell
cd C:\Users\Administrator\Projects\desktop-pet-custom
node scripts\check-packs.js
```

---

## 6. 进桌宠查看

```powershell
cd C:\Users\Administrator\Projects\desktop-pet-custom\app
npm start
```

托盘选 **样例人形**（或你在 pack.json 里写的 name）→ 点动作 / 单击 / 双击。

---

## 7. 验收清单（过了再当「标准样例」）

- [ ] 所有动作 **同一套衣服发型**  
- [ ] 脚底大致同一水平线，切换不上下跳  
- [ ] 透明边干净（无绿边、无白底方块）  
- [ ] `idle` 必须有；`sleep`/`stretch`/`meow` 至少能播  
- [ ] 非循环动作播完会回到待机  
- [ ] 不是真人明星/正版漫角脸  
- [ ] `check-packs.js` 通过  

---

## 8. 常见翻车与处理

| 现象 | 处理 |
|------|------|
| 每张换一张脸 | 加强参考图权重；外形句逐字锁定；少形容词 |
| 有的半身有的全身 | 提示词强制 `full body, feet visible`；不合格重抽 |
| 伸懒腰帧对不上 | 减少帧数到 4；或只做关键 3 帧：起手/顶点/收回 |
| 抠图发白边 | 绿幕改纯绿，收缩选区 1px |
| 桌宠里太糊 | 包内用 256，窗口也可稍后加大 |

---

## 9. 建议你今天就做的最小集

不必一次做满 6 动作。最小可发布样例：

1. `idle` + `blink`  
2. `meow` 3 帧（打招呼）  
3. `sleep` 3 帧  

能换包、能点交互，就算标准样例 v0.1；再补 `stretch` / `happy`。

---

## 相关文件

- 格式说明：`docs/pack-format.md`  
- 方案调研：`docs/animation-pipeline-research.md`  
- 样例包目录：`packs/sample-human/`
