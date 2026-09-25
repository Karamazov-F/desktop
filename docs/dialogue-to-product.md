# 工作流：对话设定 → 完整产品（以小杏为准）

目标：用**一个角色**跑通「人设 → 动作 → 台词 → 桌宠可聊」的闭环；LLM 后接，不挡路。

```text
_author/ 人物·动作·对话设定
    ↓ 精简进包
pack.json  persona + dialogue + states
    ↓
动画管线（ref → I2V 首尾锁 → 切帧）
    ↓
Electron：气泡 + 托盘动作 +「打开对话」
    ↓ 自检
verify_dialogue.js / 托盘实测
```

## 1. 作者侧设定（完整）

目录：`packs/sample-human/_author/`

| 文件 | 用途 |
|------|------|
| `character-bible.md` | 人物、气质、systemPrompt |
| `actions.md` | 动作表、制作标准、对话→动作映射 |
| `dialogue.md` | 通道与语气 |

## 2. 运行时进包（精简）

写进 `pack.json`（用户领包即带人设）：

- `persona`：`displayName` / `greeting` / `systemPrompt` / `summary`
- `dialogue.onAction`：播动作时的气泡
- `dialogue.rules`：关键词 → 台词 + `action`
- `dialogue.fallback`：未命中兜底
- `states.*.label`：托盘中文

格式说明见 `docs/pack-format.md`（v0.3）。

## 3. 产品交互（已接通）

| 入口 | 行为 |
|------|------|
| 启动 / 换角 | 问候气泡 |
| 单击 | 挥手 + `onAction.meow` |
| 双击 | 伸懒腰 + 台词 |
| 托盘「打招呼」 | 问候 + 挥手 |
| 托盘「打开对话…」 | 聊天窗；本地规则回复并驱动动作 |
| 托盘动作 | 播帧 + `onAction` 台词 |

## 4. 下一阶段（已接通）

- `persona.systemPrompt` + DeepSeek：托盘打开「DeepSeek 对话」且本机有 API Key
- 失败回退本地 `rules` / `fallback`
- 白名单工具：`play_action` / `move_pet` / `remember` / `forget` / `glance_screen`
- 记忆开关真正读写 `%APPDATA%/…/memory/<packId>.json`（默认关）
- 截屏感知默认关；开启后截主屏，发给视觉模型（与文本模型分开能力）
- 作者出包：`npm run packer` → `.dpet`

## 5. 验收清单

```powershell
cd app
node ../scripts/verify_dialogue.js
# 托盘：角色选「小杏」→ 打招呼 → 打开对话 → 输入「你好」「困了」
```

- [ ] 气泡可见且不裁切头顶  
- [ ] 「你好」→ 挥手动画 + 短句  
- [ ] 「困了」→ 睡觉 + 短句  
- [ ] 乱输入 → fallback，不崩  
