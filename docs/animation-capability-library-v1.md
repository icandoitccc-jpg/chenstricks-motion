# Animation Capability Library V1（正式规格）

> 来源：Chen + ChatGPT 定稿（2026-09-21）。文字规格优先级高于 UI 示意图。
> 原则：**用户看到的是「效果」，底层保存的是「Action」。** UI 不暴露 translateY、damping 等技术名词。

## Action Registry（24 个，封闭枚举）

| 类别 | 用户效果 | Internal Action | 功能A | 功能B |
|---|---|---|---|---|
| 出现 | 淡入 | `fadeIn` | ✅ | ✅ |
| 出现 | 弹出（轻微从小到大+自然回弹） | `popIn` | ✅ | ✅ |
| 出现 | 滑入（上/下/左/右） | `slideIn` | ⚠️ | ✅ |
| 出现 | 展开（像被揭开，非整体移动） | `reveal` | ✅ | ✅ |
| 强调 | 弹一下（已在画面，放大→回弹，"看这里"） | `pulse` | ✅ | ✅ |
| 强调 | 放大一下（100%→110%→100%，克制） | `scaleEmphasis` | ✅ | ✅ |
| 强调 | 轻震（短小幅左右晃；错误/注意/冲突/"等等？"；必须克制） | `shake` | ✅ | ✅ |
| 强调 | 高亮（背景色/文字色短暂变化） | `highlight` | ⚠️ | ✅ |
| 标记 | 划线（蓝色手绘线从左到右画出） | `underlineDraw` | ✅ | ✅ |
| 标记 | 圈出来（不规则手绘圈逐渐出现；固定几套 SVG 路径，非任意手绘） | `circleMark` | ✅ | ✅ |
| 标记 | 箭头画出（手绘箭头逐渐生长） | `drawArrow` | ✅ | ✅ |
| 关系 | 连线（A 与 B 之间连接线） | `connect` | — | ✅ |
| 关系 | 箭头连接（流程/因果/推进） | `connectArrow` | — | ✅ |
| 编排 | 依次出现（编排动作，非视觉特效） | `stagger` | ✅ | ✅ |
| 变化 | 移动（从当前位置到另一位置） | `move` | ⚠️ | ✅ |
| 变化 | 聚拢（多元素汇向中心） | `converge` | — | ✅ |
| 变化 | 散开（中心概念向多方向） | `diverge` | — | ✅ |
| 文字 | 逐字出现（短标题/问题/关键词，不打整段字幕） | `typeIn` | ❌ | ✅ |
| 镜头 | 推近（画布放大到一个区域） | `cameraPush` | ✅ | ✅ |
| 镜头 | 拉远（从局部回到整体） | `cameraPull` | ✅ | ✅ |
| 镜头 | 平移（从一个区域移到另一区域） | `cameraPan` | ✅ | ✅ |
| 镜头 | 聚焦（目标清晰/突出，其他压暗） | `focus` | ✅ | ✅ |
| 离场 | 淡出 | `fadeOut` | ✅ | ✅ |
| 离场 | 滑出 | `slideOut` | ⚠️ | ✅ |

⚠️ = 功能 A 中光栅图片元素原本已存在，真实"入场/移出/移位"需遮蔽原区域，仅在适合场景开放；高亮在 A 中通过叠加色块/区域实现。
— = 该功能不暴露。

## 实现原则

- 这**不是 24 套独立动画系统**。slideIn/move/converge/diverge 都是 translate；circleMark/drawArrow/underlineDraw 都是路径 reveal。产品语义不同，技术复用同一批稳定原语（transform / opacity / clip-path / SVG path reveal / color）。
- 标记组继承 chenstricks 现有**蓝色手绘记号视觉语言**，不做企业 PPT 箭头。
- 逐项出现（listReveal）产品层可单独表现，底层本质仍是 stagger。
- 参数对用户只暴露语义档位：速度 `慢/正常/快`、强度 `轻/正常/明显`、方向 `上/下/左/右`。系统换算实际数值。

## 功能 A UI 层级

一级菜单只显示：**出现 / 强调 / 移动 / 标记 / 镜头 / 消失**；点进分类后才看到具体效果。不展示 24 个平铺按钮。

功能 A 对光栅图片采用「原图 base + 框选区域 duplicate overlay」。涉及元素真正离开原位置的效果注意原图残留；必要时限制可用效果，**不引入复杂图像分割系统**。

## Structure Registry（6 种，与 Action 分离）

`Comparison` 对比 ｜ `Flow` 流程 ｜ `Progression` 递进 ｜ `Divergence` 发散 ｜ `Convergence` 汇聚 ｜ `Focus` 重点

- Structure 不是 Action。一个 Structure 调用多个 Action（如 对比 → slideIn+stagger+connectArrow+highlight；发散 → popIn+diverge+connect；重点 → cameraPush+pulse+underlineDraw）。
- 一个场景 = **1 个 Primary Structure + 必要 Secondary Relationships**；UI 默认只展示主结构。
- 刻意不含「关键词」——关键词不是信息关系。无复杂关系时用 Focus。
- 逻辑链：**Meaning → Beats → Structure → Actions**。

## V1 明确排除

3D、粒子、毛玻璃、大面积动态模糊、复杂 morph、任意 SVG 手写、音频驱动、花哨离场（飞走/旋转消失/爆炸/粉碎/翻页等）。
