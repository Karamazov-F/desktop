# 编译 Windows 安装包

最终用户不需要这些步骤。安装包在 GitHub Actions 的 `Windows installer` 工作流里生成。

本机编译需要 Node.js 18+。解压模型用仓库根目录锁定的开发依赖（`unbzip2-stream`、`tar`、`yauzl`、`sharp`），不需要 Python。这些依赖只在打包时使用，不会打进安装包。`npm test` 用 Node 18 也能跑（`test/run.js` 列出测试文件，不依赖 Node 21 的 glob）。

`unbzip2-stream` 1.4.3 已无人维护，仍用它是因为它是纯 JavaScript、按流解码，能处理约 159MB 的模型 tar.bz2。npm 上的 `seek-bzip`、`compressjs` 同样停更，而且会把解压结果整段放进内存。仍在维护的 bzip2 包是 WebAssembly，不是纯 JavaScript。因此继续锁定 `unbzip2-stream@1.4.3`，并用 `test/fixtures/model-mini.tar.bz2` 覆盖解压。

```powershell
npm ci
node scripts/fetch-vendor.js
cd app
npm ci
npm test
npm run dist
```

`scripts/fetch-vendor.js` 会按固定版本和 sha256 下载：

- Node.js 22.19.0 的 `node.exe`（只给语音识别 sidecar 用）
- `sherpa-onnx-node` 1.13.4 和 `sherpa-onnx-win-x64` 1.13.4
- SenseVoice-Small int8（`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09`）

语音在安装包里用这份 Node sidecar 跑，因为 sherpa 的原生模块不加载进 Electron 进程。录音在界面里直接收成 16 kHz 单声道 WAV，不再依赖 FFmpeg。

只读资源（角色包、模型、语音运行时）放在 `resources/`。设置、聊天和导入的角色包放在 `%APPDATA%\desktop-pet`。

安装包输出在 `app/dist/桌宠-Setup-*.exe`。没有证书时不签名。要签名，设置 `CSC_LINK` 和 `CSC_KEY_PASSWORD`（工作流里对应同名 Actions secrets）。没有这两个变量时，`CSC_IDENTITY_AUTO_DISCOVERY=false`，生成未签名安装包。

应用图标和托盘图标由 `scripts/make-icons.js` 从一张正方形 PNG 生成。源图边长至少 1024。脚本写出 `app/build/icon.ico`（安装包和窗口图标）以及 `app/assets/tray/tray.ico`、`tray.png`、`tray@2x.png`。托盘文件放在 `assets/tray/`，不放在 `build/`，否则 electron-builder 会把 `build/` 当成 buildResources，不打进安装包。`tray.ico` 含 16、20、24、32、40、48、64、128、256，其中 20 和 40 对应 Windows 125% 与 150%。Windows 托盘只提交这枚多尺寸 ico。其他系统用 `tray.png`，Electron 会自行带上旁边的 `tray@2x.png`。显示器缩放变化时会重新设置托盘图。文件缺失时用一块中性灰的生成图，不是角色图。

```powershell
node scripts/make-icons.js --source path\to\icon.png
```

仓库里现在的图标是同一条流水线生成的占位图（灰底方块，不是角色或品牌），方便安装包在正式图到来之前也能清晰显示各个尺寸：

```powershell
node scripts/make-icons.js --placeholder
```

换成正式图后重新执行 `--source`，再 `npm run dist`。electron-builder 的 `win.icon` 指向 `app/build/icon.ico`。

开发时可以 `cd app && npm start`。没有先执行 `fetch-vendor.js` 时，文字和动画仍然可用，语音会提示组件未随包提供。
