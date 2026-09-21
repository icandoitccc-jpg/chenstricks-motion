# chenstricks Motion — PoC

让「已完成构图的图片」局部动起来 / 把「一段信息」变成信息动画，输出可直接导入剪映的短视频 MP4。
渲染在云端完成，本机只负责预览与下载。

**当前阶段：技术验证（PoC）。目标只有一个——证明两条链路真的成立，并拿到真实资源消耗数据。**

## 两条链路

| 链路 | 输入 | 模板 | 输出 |
| --- | --- | --- | --- |
| A · 图片局部动画 | 一张完成构图的图 + 区域动画 JSON（`jobs/chain-a-image.json`） | `ImageFocus` | MP4 + 关键帧 PNG |
| B · 信息动画 | 信息结构 JSON（`jobs/chain-b-compare.json`） | `InfoCompare` | MP4 + 关键帧 PNG |

两条链路共用同一套组件、同一份 JSON、同一个字体文件（`public/fonts/NotoSansSC-VF.ttf`），
浏览器预览与云端渲染出自同一引擎——这是「预览 = 成品」的结构性保证。

## 功能A 现阶段支持的动画

- `appear`：区域按顺序出现（需要区域背后是干净背景，用 `cover` 色遮盖）
- `slideUp`：上滑出现（同上）
- `pop`：原地弹一下（对任意背景安全）
- `float`：持续轻微悬浮（对任意背景安全）
- `highlight`：描边强调（对任意背景安全）
- `drawLine`：一条线被画出来（叠加层，任意背景安全）

> 产品规则：**「出现类」动画要求干净背景；「强调类」动画对任意背景都安全。**
> 这条规则会进入后续的《动画导演规则》。

## 本地预览（轻量，不渲染视频）

```bash
npm install        # 首次
npm run preview    # 打开 http://localhost:4173
```

## 云端渲染（GitHub Actions，本机零负担）

push 到 `main`（改动 src/jobs/scripts/public）即自动渲染两个 job；
产物（MP4 + 关键帧 PNG + metrics.json）在 Actions 的 Artifacts 里下载，保留 7 天自动删除。

每个 job 会输出真实指标：bundle / 渲染耗时、峰值内存、整机 CPU 占用、输出大小、Runner 规格。

## 目录

```
src/templates/   动画模板（功能A：ImageFocus；功能B：InfoCompare）
jobs/            动画方案 JSON（唯一输入源，预览与渲染共用）
public/          字体与素材（staticFile 访问）
scripts/         render.mjs 云端渲染脚本；preview.mjs 本地预览
tools/           生成测试素材的辅助脚本
```

## PoC 明确不做

剪辑时间轴、TTS、字幕、用户系统、素材库、绿幕/透明输出、4K/60fps、生成式 image-to-video。
