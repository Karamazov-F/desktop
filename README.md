# desktop-pet-custom

开源可换角桌宠。主打 **角色包**（文件夹或加密 `.dpet`）；DeepSeek 管文本对话与工具调用；截屏感知用同一账号的**图像输入模型**（不是「文本模型能看图」）。

## 快速开始（Windows）

需要 Node.js 18+。

```powershell
cd C:\Users\Administrator\Projects\desktop-pet-custom\app
npm install
npm start
```

API Key 任选其一：

1. 托盘 → **设置…** 里填写（保存在本机 userData）
2. 仓库根目录 `secrets.local.json`（已 gitignore，模板见 `secrets.local.json.example`）
3. 环境变量 `DEEPSEEK_API_KEY`

第一次启动会检测 **Node / FFmpeg / sherpa-onnx / SenseVoice-Small**。缺什么点「一键安装缺失项」（下载到仓库 `.deps/`，不改系统）。以后新功能依赖：在 `app/lib/deps/items/` 新增一个文件调用 `registerDep()`，启动页和 `node scripts/install-deps.js` 会自动带上。

出现透明小窗后：

- **悬停小人**：在角色正下方弹出对话药丸（展开输入 / 按住说话），移开后延迟 400ms 自动收起；预热窗口秒开且不抢输入焦点；语音录入时药丸自动亮红麦（热键发起也会出现），结束自动收起
- **单击小人**：挥手（或角色包里的点击动作）
- **按住并移出 4px**：拖动位置（Win32 `SM_CXDRAG`，不是长按）
- **双击**：打开对话输入框（与单击互斥，间隔 500ms）
- **右键小人**：在点击处弹出菜单（碎碎念 / 对话 / 动作）。对话是锚在角色正下方的胶囊输入坞；长回复显示在头顶气泡里
- **托盘「聊天记录…」**：独立聊天记录窗口，位置自己定，不跟着小人走
- **空白处**：点击穿透
- **快捷键（可在设置里改）**：默认 `Ctrl+Shift+空格` 语音（再按一次发送）；`Ctrl+Shift+H` 隐藏/显示小人

桌面快捷方式「桌宠」会在首次启动时尝试创建。换角：托盘选角色，或导入加密包，或把文件夹放到 `packs/<id>/`。

**小杏**（`packs/sample-human`）已示范人设 + 本地规则 + DeepSeek 工具驱动动画。  
像素喵 / 水滴球示范最小包。格式见 [docs/pack-format.md](docs/pack-format.md)。

### 作者出包工具（与桌宠分开）

代码在 `app/packer/`。这是**独立 Electron 进程**，不会打开桌宠。

双击仓库根目录 `run-packer.cmd`，或：

```powershell
cd C:\Users\Administrator\Projects\desktop-pet-custom
node scripts/run-packer.js
```

也可以 `cd app` 后 `npm run packer`。首次运行会在桌面放「桌宠出包.lnk」。

界面是动作列表：可添加/删除行，每行一个动作名 + 视频。必须包含 `idle`。导出 `.dpet` 后，在桌宠托盘选「导入角色包」。需要 FFmpeg。

### 校验

```powershell
node scripts/check-packs.js
node scripts/verify_dialogue.js
node scripts/verify_dpet.js
node scripts/verify_memory.js
node scripts/verify_tools.js
node scripts/verify_packer_roundtrip.js
node scripts/verify_hotkeys.js
node scripts/install-deps.js
node scripts/verify_stt.js
cd app
node_modules\electron\dist\electron.exe ..\scripts\verify_pet_display.js sample-human
```

## 角色包

| 形态 | 说明 |
|--|--|
| `packs/<id>/` | 开发用明文文件夹（`pack.json` + PNG） |
| `*.dpet` | 加密分发包，托盘导入后进用户目录 |

自带示例（原创 / CC0）：

| id | 名称 |
|--|--|
| `blob` | 水滴球 |
| `pixel` | 像素喵 |
| `sample-human` | 小杏（人设+对话样例） |

关注领包（文案草稿）：安装本开源桌宠后，关注作者账号，按笔记下载 `.dpet`（或 zip 文件夹），托盘「导入角色包」或解压进 `packs/`，切换即可。

## 功能分层

| 阶段 | 内容 | 默认 |
|--|--|--|
| **P0** | 置顶桌宠、拖动/点击、换包、≥2 示例、导入 `.dpet`、开源说明 | 开 |
| **P1** | 本地长期记忆 + DeepSeek 文本 + 白名单工具 + **sherpa-onnx + SenseVoice-Small 语音** | 记忆关；有 Key 时首次启动会打开对话 |
| **P2** | 截屏感知：另接图像模型（`deepseek-flash` 图像输入）。无 Key 或未开开关则降级 | **关**（须明示同意） |

模型自主改状态：只允许 `play_action` / `move_pet` / `remember` / `forget` / `glance_screen`。主进程校验后再执行。没有任意 shell。

## 声明

- 不提供、不鼓励侵权的明星/正版漫角分发包
- 截屏功能若开启，涉及桌面内容，须用户明示同意并可关闭；图像会发往你配置的视觉接口
- DeepSeek **文本模型**不能看图；看图必须走图像输入型号（当前默认与 Flash 图像能力对齐）
- 本项目用户侧不依赖 Cursor
- 不要把 API Key 提交进 git

## License

代码 MIT（见 `LICENSE`）。示例角色包 CC0。加密包格式是分发封装，不能当成对素材的绝对防盗。
