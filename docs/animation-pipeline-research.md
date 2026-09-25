# 角色展示方案调研（前提：美术全靠 AI 生成）

日期：2026-07-15  
范围：桌宠里「多动作」（如像素喵：睡觉 / 伸懒腰 / 喵喵叫）如何模板化、效果更好。  
你熟悉参照：Spine。

---

## 结论先说


| 目标                         | 更合适的方案                                                 |
| -------------------------- | ------------------------------------------------------ |
| **全 AI 出图、要稳定量产角色包**       | **多状态逐帧 / 短精灵序列**（扩展现有 `pack.json` 的 states）           |
| **动作连贯、肢体可复用、你愿意维护「部件模板」** | **切件人偶 + 程序摆姿势**（类 Spine 思路，但可自研格式，避开发行许可）             |
| **观感最「活」、靠现成 .moc3**       | **Live2D**（开源桌宠主流），但 **最不适合「纯 AI 从零出完整模型」**            |
| **真·Spine 工程管线**           | 动作模板最好，但：**要买编辑器/运行时可再分发的许可** + AI 只能稳做「切件」，很难端到端吐合法工程 |


在「**完全依靠 AI 生成美术**」这条硬前提下，**不推荐把 Spine / Live2D 当第一生产路径**；推荐 **逐帧状态机做 P0/P1 模板**，作者侧再用同一提示词规范刷动作；后续若切件质量够了，再上人偶或正式 Spine。

---

## 方案对比

### 1. 多状态逐帧 / 短序列（Sprite / Sheet）

**是什么**  
每个动作 = 1 张图或一小段帧（睡觉循环 4 帧、伸懒腰 6 帧、叫 3 帧张嘴）。播放器按 `state` 切。类似现在 `idle/blink/happy`，扩成 `sleep/stretch/meow`。

**AI 友好度：高**  

- 你只向模型要「同一只像素喵 + 动作描述」的图  
- 一致性靠：固定种子/角色参考图、IP-Adapter、同一套提示词模板、必要时用上一张 img2img  
- 不要求 AI 输出骨骼 JSON / moc3

**模板化：高**  

```text
packs/pixel/
  pack.json          # states: sleep, stretch, meow, idle...
  sprites/sleep_0.png … sleep_3.png
  或 sprites/sleep.png + meta: { frames, fps }
```

作者侧流水线：动作清单固定 → 批量出图 → 校验尺寸/透明底 → 打包装。

**表现**  

- 单帧可以很精致（AI 强项）  
- 弱在：动作切换可能跳切；骨架感弱于骨骼动画  
- 桌宠距离远、时长短，往往够用；小红书录屏也成立

**运行时**  
Electron + `<img>` / Canvas / Pixi 精灵即可，无额外商业 SDK。

**像素喵例子**


| 动作  | 资源                                           |
| --- | -------------------------------------------- |
| 睡觉  | 闭眼躺/缩成一团，2–4 帧呼吸或 Zzz 叠加（Zzz 可用程序图层，减 AI 负担） |
| 伸懒腰 | 站立拉长 4–8 帧序列                                 |
| 喵喵叫 | 张嘴 2–3 帧 + 可选音效（音效不靠 AI 图）                   |


---

### 2. 切件人偶 + 程序动作（「穷人版 Spine」）

**是什么**  
角色拆成：头、身体、前肢、后肢、尾巴… AI 按 **固定层名/固定画布** 出部件图；运行时用代码摆角度做睡觉（趴下旋转部件）、伸懒腰（躯干拉长/前肢上举）、叫（头+嘴层切换）。

**AI 友好度：中**  

- 必须先有「部件模板」（或 AI 分割整图，质量不稳）  
- 比「整姿出图」约束多，但比完整 Spine/Live2D 现实

**模板化：高（一旦部件表冻住）**  
所有角色共用同一套 slot 名与绑点；换皮 = 换贴图。

**表现**  

- 连续运动、循环省资源  
- 上限低于手 K 的 Spine；像提线木偶  
- 适合像素/简笔；写实吃力

**业界相近**  
Shimeji 用多帧；真正骨骼侧有 PSD→Spine + **程序生成 walk/idle** 的实验（如 [spine_anim_mcp](https://github.com/K-ulucay/spine_anim_mcp)、[spine-animation-ai](https://github.com/GenielabsOpenSource/spine-animation-ai)），核心也是「切件 + 数学动画」，不是「AI 直接梦一个 .spine」。

---

### 3. Spine（你举的例子）

**是什么**  
骨骼 + 附件 + 动画时间轴；一组资源播放睡觉/伸懒腰/叫。

**AI 友好度：中低（整包） / 中（只切件）**  

- AI 擅长：概念图、分部件图  
- AI 不擅长：一次产出可播放、无 NaN、权重正确的 Spine 工程（业内也有「程序写 deform 血泪」记录）  
- 可行路径：AI 切件 →（人/半自动）绑骨 → 动画用 **程序预设** 或编辑器手调

**表现：高**  
动作连贯、体积小、一套皮肤多动画，桌宠/游戏标准答案之一。

**模板化：高（工程内）**  
动画模板可复用到多角色，但前提是 **骨骼层级命名统一**。

**发行成本**  
官方 runtime 分发给「自己没有 Spine 许可的用户」时，集成方通常需要 **有效的 Spine 许可**（见 [Spine Runtimes License](https://en.esotericsoftware.com/spine-runtimes-license) / [spine-ts README](https://github.com/EsotericSoftware/spine-runtimes)）。开源免费桌宠要算进这一笔。  

Electron + Pixi 有官方 [@esotericsoftware/spine-pixi-v8](https://en.esotericsoftware.com/spine-pixi)，技术上可接。

---

### 4. Live2D Cubism

**是什么**  
网格变形 + 参数（转头、口型、表情）；桌宠/AI 伴常见（AnySoul、各类 Live2DPet）。

**AI 友好度：低**  

- Cubism **没有稳定公开的「脚本一键导出 moc3」产线**；重编辑器  
- 网上「图→Live2D」多是实验：分割、补全遮挡、网格、绑定，**量产成品率低**  
- 实践上：买/下现成模型，或人工绑几个，而不是每条角色包全 AI 吐 moc3

**表现：很高（「活」）**  
呼吸、视线、说话口型都自然；和截屏互动、TTS 口型很配。

**许可**  
Cubism SDK / 发布条款需单独看；比自管 PNG 重。

**结论**  
想要「市面上那种高级感桌宠脸」就选它；和「角色包全 AI 流水线」目标 **打架**，更适合以后接「别人做好的模型」。

---

### 5. 其它（略提）


| 方案                          | 一句话                     |
| --------------------------- | ----------------------- |
| DragonBones                 | 类似 Spine、偏免费生态，AI 自动化仍弱 |
| Rive                        | 现代矢量/骨骼，工具链与 AI 出图不契合   |
| Lottie                      | 设计师 AE 向，不是角色换皮主路径      |
| 程序滤镜动图（只对一张 idle 做 breathe） | 模板极强、动作语义弱，做不了认真的「伸懒腰」  |


---

## 和「作者侧出包、关注发放」怎么配合

你的获客模型是：**包在你这做，用户只换包**。关键是你这条生产线稳不稳。

```text
推荐生产线（AI 全图）:

角色圣经（设定/色卡/参考图）
    ↓
提示词模板：{角色} + {动作} + {视角/像素规格/透明底}
    ↓
出图 / 抽卡 / 人工或半自动筛一致性
    ↓
写入 pack 模板（states + fps + 可选音效）
    ↓
桌宠播放；小红书录 sleep→stretch→meow
```

Spine/Live2D 要插在「筛一致性」之后还多两步：切件、绑骨，**每个新角色的固定成本高**，和「频繁定制发活动包」不太同速。

---

## 建议落在本项目的模板形态

**P0（已有基础）继续扩：**

```json
{
  "id": "pixel",
  "states": {
    "idle": { "frames": ["sprites/idle.png"], "fps": 1 },
    "sleep": { "frames": ["sprites/sleep_0.png", "sprites/sleep_1.png"], "fps": 4, "loop": true },
    "stretch": { "frames": ["sprites/stretch_0.png", "..."], "fps": 8, "loop": false },
    "meow": { "frames": ["sprites/meow_0.png", "sprites/meow_1.png"], "fps": 6, "loop": false }
  }
}
```

**P1：** 运行时按状态机切动作（闲置→睡觉，点击→喵）；Zzz/音效程序层。  
**P2：** 若你稳定产出「头/身/肢」切件，再评估 **自研人偶格式** 或 **购入 Spine 许可上真骨骼**。  
**不优先：** 以 Live2D 为 AI 量产格式。

---

## 直接回答你的例子

> 像素喵要睡觉、伸懒腰、喵喵叫  

- **现在最合适：** AI 各出一组帧（叫的时候重点是嘴），pack 里三个 state，播放器切换。  
- **Spine 合适的时机：** 你确定长期做骨骼、愿意买许可，并且部件命名模板冻死——那时「一套件、三个动画」比「每动作整图」更省、更好看。  
- **Live2D：** 更适合「说话、看鼠标」的陪伴脸，不适合当 AI 量产三动作的第一方案。

---

## 参考链接

- Spine 运行时许可说明：[Spine Runtimes License](https://en.esotericsoftware.com/spine-runtimes-license)  
- spine-pixi：[文档](https://en.esotericsoftware.com/spine-pixi)  
- 程序化 Spine 动画实验：[GenielabsOpenSource/spine-animation-ai](https://github.com/GenielabsOpenSource/spine-animation-ai)、[K-ulucay/spine_anim_mcp](https://github.com/K-ulucay/spine_anim_mcp)  
- Live2D 桌宠路径（现成模型向）：开源 Live2DPet / AnySoul 类文档  
- 图→桌宠多动画（偏精灵表）：[Y1fe1-Yang/desktop-pet-skill](https://github.com/Y1fe1-Yang/desktop-pet-skill)  
- 图→Live2D 自动化难处（实践向）：[itch 开发笔记](https://itch.io/devlog/1525315/dev-note-3-live-2d-the-dream-that-keeps-dying)、[流水线概述文](https://waifuai.blogspot.com/2025/12/building-automated-image-to-live2d.html)

