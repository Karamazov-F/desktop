# 小杏 · 动作设定

## 嘴部规则（硬约束）

| 动作 | 可否动嘴 | 说明 |
|------|----------|------|
| idle | **否** | 站立呼吸/轻微，嘴唇闭合全程 |
| blink | **否** | 只眨眼 |
| stretch | **否** | 伸懒腰，不张嘴说话 |
| sleep | **否** | 闭眼打盹，嘴闭合 |
| meow（挥手） | **是**（克制） | 对话/打招呼：短暂友好笑意即可，禁止不停张合 |
| happy | **是**（克制） | 对话开心：微笑，禁止说话式口型连动 |

## 约定动作（与 `pack.json` states 对齐）

| id | 托盘文案 | 帧要求 | 循环 | 触发 |
|----|----------|--------|------|------|
| idle | （默认） | 全帧 @16fps，pingpong | 是 | 默认 |
| blink | — | 短片全帧 | 否 | 闲置自动 |
| meow | 挥手 | 全帧 @16fps，首尾 contact | 否 | 单击 / 对话打招呼 |
| stretch | 伸懒腰 | 全帧 @16fps | 否 | 双击 / 「累了」 |
| sleep | 睡觉 | 全帧，pingpong | 是 | 闲置 / 「困了」 |
| happy | 开心 | 全帧 | 否 | 「开心」类对话 |

## 制作标准（不可妥协）

1. 所有动作视频：`start_image` = `end_image` = 同一张 `ref_idle`
2. 非对话动作 negative 必须含：talking / lip sync / mouth opening…
3. 非对话动作抽帧后跑 `freeze_mouth.py`（口型冻结）
4. idle 只钉 `idle_0`=contact；用 pingpong，禁止尾帧硬贴 contact
5. meow 首尾钉 contact；切帧后跑验证脚本
6. 命令：`python batch_action_clips.py` → `python assemble_action_pack.py`

## 对话 → 动作映射

| 用户意图 | action |
|----------|--------|
| 你好 / 在吗 / 嗨 | meow |
| 困 / 睡 | sleep |
| 累 / 懒腰 | stretch |
| 开心 / 高兴 | happy |
