# 在 ComfyUI 界面打开小杏 I2V 工作流

脚本排队用的是 API JSON，**不会自动出现在 Comfy 画布**。界面版已导出：

| 位置 | 文件 |
|------|------|
| 仓库 | `comfy/wan22_i2v_pet_ui.json` |
| Comfy 工作流目录 | `L:\ai\comfy\ComfyUI-aki-v2\ComfyUI\user\default\workflows\pet_wan22_i2v.json` |
| 同目录中文名 | `pet_wan22_i2v_小杏.json` |

## 打开方式

1. 浏览器打开 http://127.0.0.1:8188  
2. 菜单 **Workflow → Open**（或 Load），选上面任一 JSON  
   - 若列表里已有：Workflows 里找 `pet_wan22_i2v`  
3. 确认 `Load Image` = `pet_pipeline/ref/ref_idle.png`（在 Comfy 的 `input` 下）  
4. 改正向提示里的**动作句**，点 Queue  

## 本机注意

- 文本必须走 **CLIPLoader(type=wan) + WanVideoTextEmbedBridge**  
- 左侧旧 T5 节点已设为 **Never**（fp8 scaled 会报错）  
- `end_image` 已接到同一张 ref（首尾锁）  
- 批量脚本：`python batch_action_clips.py`

重新导出：

```powershell
cd comfy
python export_ui_workflow.py
```
