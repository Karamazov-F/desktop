# 编译 Windows 安装包

最终用户不需要这些步骤。安装包在 GitHub Actions 的 `Windows installer` 工作流里生成。

本机编译需要 Node.js 18+。解压模型需要 Python 3，命令会依次尝试 `python3`、`python` 和 `py -3`。Python 只在打包时使用，不会打进安装包。`npm test` 用 Node 18 也能跑（`test/run.js` 列出测试文件，不依赖 Node 21 的 glob）。

```powershell
node scripts/fetch-vendor.js
cd app
npm ci
npm run dist
```

`scripts/fetch-vendor.js` 会按固定版本和 sha256 下载：

- Node.js 22.19.0 的 `node.exe`（只给语音识别 sidecar 用）
- `sherpa-onnx-node` 1.13.4 和 `sherpa-onnx-win-x64` 1.13.4
- SenseVoice-Small int8（`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09`）

语音在安装包里用这份 Node sidecar 跑，因为 sherpa 的原生模块不加载进 Electron 进程。录音在界面里直接收成 16 kHz 单声道 WAV，不再依赖 FFmpeg。

只读资源（角色包、模型、语音运行时）放在 `resources/`。设置、聊天和导入的角色包放在 `%APPDATA%\desktop-pet`。

安装包输出在 `app/dist/桌宠-Setup-*.exe`。没有证书时不签名。要签名，设置 `CSC_LINK` 和 `CSC_KEY_PASSWORD`（工作流里对应同名 Actions secrets）。没有这两个变量时，`CSC_IDENTITY_AUTO_DISCOVERY=false`，生成未签名安装包。

应用图标是 `app/build/icon.ico`（electron-builder 的 `win.icon`）。现在放的是占位图，换成正式图标后重新 `npm run dist` 即可。需要包含 256×256。

开发时可以 `cd app && npm start`。没有先执行 `fetch-vendor.js` 时，文字和动画仍然可用，语音会提示组件未随包提供。
