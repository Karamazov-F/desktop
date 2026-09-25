# 角色包格式（v0.5）

角色包有两种形态：

1. **文件夹**：`pack.json` + 资源文件（开发 / 明文）
2. **加密包 `.dpet`**：出包工具生成，桌宠托盘「导入角色包」即可用

v0.3 起可选：`persona` / `dialogue`（对话→产品工作流见 `docs/dialogue-to-product.md`）。

## 加密包 `.dpet`

作者侧：

```powershell
cd app
npm run packer
```

- 列表里为每个动作填写 **动作名称** + **视频文件**（可添加/删除行）
- 必须有 `idle`
- 可选绿幕抠图（ffmpeg colorkey）
- 导出 `.dpet`

用户侧：托盘 → 导入角色包 → 选 `.dpet`。解密缓存位于应用 userData，不覆盖仓库内 `packs/`。

算法：AES-256-GCM + gzip 的自定义归档（见 `app/lib/dpet.js`）。这是防随手解压的分发封装，不是 DRM。

## 目录示例

```
packs/pixel/
  pack.json
  sprites/
    idle.png
    blink.png
    sleep_0.png … sleep_3.png
    stretch_0.png …
    meow_0.png …
```

## pack.json

`states` 支持两种写法（可混用）：

### 旧写法（单图）

```json
"idle": "sprites/idle.png"
```

### 新写法（多帧动作）

```json
"sleep": {
  "frames": ["sprites/sleep_0.png", "sprites/sleep_1.png"],
  "fps": 3,
  "loop": true
}
```

完整示例：

```json
{
  "id": "pixel",
  "name": "像素喵",
  "version": "0.2.0",
  "author": "desktop-pet-custom",
  "license": "CC0-1.0",
  "size": { "width": 128, "height": 128 },
  "states": {
    "idle": { "frames": ["sprites/idle.png"], "fps": 1, "loop": true },
    "sleep": {
      "frames": ["sprites/sleep_0.png", "sprites/sleep_1.png", "sprites/sleep_2.png", "sprites/sleep_3.png"],
      "fps": 3,
      "loop": true
    },
    "stretch": {
      "frames": ["sprites/stretch_0.png", "sprites/stretch_5.png"],
      "fps": 8,
      "loop": false
    },
    "meow": {
      "frames": ["sprites/meow_0.png", "sprites/meow_1.png", "sprites/meow_2.png"],
      "fps": 6,
      "loop": false
    }
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `states.idle` | **必需** |
| `frames` | 相对角色包根目录的 PNG 列表 |
| `fps` | 每秒帧数，默认 6 |
| `loop` | 是否循环；`idle`/`sleep`/`blink` 默认 true，其它默认 false |
| `label` | 可选，托盘中文名（如人形包 `meow` →「挥手」） |
| 非循环动作 | 播完自动回 `idle` |
| `persona` | 可选：`displayName` / `greeting` / `systemPrompt` / `summary` |
| `dialogue.onAction` | 可选：动作 id → 台词数组（播动作时抽一句） |
| `dialogue.rules` | 可选：`{ keywords, lines, action }` 本地对话规则 |
| `dialogue.fallback` | 可选：未命中规则时的台词 |

### 约定动作名（托盘会显示中文）

| id | 含义 | 交互 |
|----|------|------|
| `idle` | 待机 | 默认 |
| `blink` | 眨眼 | 闲置时偶尔 |
| `sleep` | 睡觉 | 闲置随机 / 托盘 / 对话 |
| `stretch` | 伸懒腰 | 双击 / 托盘 / 对话 |
| `meow` | 喵叫或挥手（用 `label` 区分） | 单击 / 托盘 / 打招呼 |
| `happy` | 开心 | 托盘 / 对话 |
| `walk` / `run` | 走 / 跑 | 托盘原地播；对话指定方向时边走边平移，到达后回 `idle` |

## 给用户怎么换成你发的包

1. 关注账号按活动说明下载 `.dpet`（或 zip）
2. 托盘 → **导入角色包** 选 `.dpet`；或解压到软件旁的 `packs/<id>/`
3. 托盘图标右键 → 选角色包

作者侧出包工具在本仓 `npm run packer`（面向作者，不是大众「角色包制作器」产品）。

## 版权

不要分发无权使用的明星/正版漫角资产。示例包为仓库内原创，CC0。
