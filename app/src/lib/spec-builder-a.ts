// 功能A spec 构建：画布框选区域 + 动作序列 → AnimSpec
// 坐标约定：区域以原图像素记录；画布尺寸按输出比例；底图 contain 居中（完整显示不裁切，不足区域留背景）→ 区域副本按同一 scale/offset 映射。
//
// V2 数据模型：
//   Region = 一个 imageRegion 元素 + 一串 Action（AItem.actions[]）
//   每条 Action 是 V1 24 个封闭动作之一，可独立设置 intensity / direction / hold
//   "hold" = 动画结束态停留时长（让动作不像特效集合，而像一段编排）
//   "gap"  = 链内相邻 action 之间的过渡间距
//   region 之间的先后关系仍走 同时 / 接着 / 稍后
//
// 引擎层（SpecComposition + compile.ts）不需改：每条 SpecAction 独立 at/duration，按 at 排序即可。
import type { ActionName, AnimSpec, Region, SpecAction, SpecElement } from '../../../src/spec/types';

export type AspectKey = '16:9' | '9:16' | '3:4';
export const ASPECTS: Record<AspectKey, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '3:4': { w: 1440, h: 1920 },
};

export type AEffectCategory = '出现' | '强调' | '标记' | '镜头' | '消失';

// 功能A 对光栅图开放的效果
export const A_EFFECTS: Record<AEffectCategory, { label: string; action: ActionName; needsDir?: boolean; camera?: boolean }[]> = {
  出现: [
    { label: '淡入', action: 'fadeIn' },
    { label: '弹出', action: 'popIn' },
    { label: '展开', action: 'reveal', needsDir: true },
  ],
  强调: [
    { label: '弹一下', action: 'pulse' },
    { label: '放大一下', action: 'scaleEmphasis' },
    { label: '轻震', action: 'shake' },
    { label: '高亮', action: 'highlight' },
  ],
  标记: [
    { label: '划线', action: 'underlineDraw' },
    { label: '圈出来', action: 'circleMark' },
  ],
  镜头: [
    { label: '推近', action: 'cameraPush', camera: true },
    { label: '拉远', action: 'cameraPull', camera: true },
    { label: '聚焦', action: 'focus', camera: true },
  ],
  消失: [{ label: '淡出', action: 'fadeOut' }],
};

// ---------- V2 类型 ----------
export type Speed = 'slow' | 'normal' | 'fast';
export type Intensity = 'light' | 'normal' | 'strong';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Relation = 'same' | 'after' | 'later';
export type Hold = 'none' | 'short' | 'long';

// hold → 帧数（30fps 基准）
export const HOLD_FRAMES: Record<Hold, number> = { none: 0, short: 12, long: 30 };
// 链内相邻 action 默认间隔帧
export const CHAIN_GAP_FRAMES = 6;
// "稍后" 跨区间隔帧（0.6s）
export const RELATION_LATER_GAP = 18;
// 开场留白（0.4s）+ 结尾留白（1.2s）
const HEAD_PADDING_FRAMES = 12;
const TAIL_PADDING_FRAMES = 36;

export interface AAction {
  id: string;                       // UI key
  action: ActionName;
  intensity?: Intensity;            // 不设则用 item 默认
  direction?: Direction;            // 不设则用 item 默认
  hold?: Hold;                      // 默认 'short'
}

export interface AItem {
  id: string;
  region: Region;                   // 原图坐标
  speed: Speed;
  intensity: Intensity;
  direction: Direction;
  relation: Relation;               // 与上一项的关系
  actions: AAction[];               // 动作序列
}

// 预设序列（一键加入）：未来智能编排可以在这里挂载自动生成的序列
export interface APreset {
  name: string;
  actions: Omit<AAction, 'id'>[];
}
// 主路径「感觉」卡片：用户只选感觉，系统按 recipe 自动编排动作序列。
// 数据写死、无 AI/API/Token，符合免费运行原则。buildSpecA 引擎逻辑不依赖这里的具体内容。
export const PRESETS: APreset[] = [
  {
    name: '关键词强调',
    actions: [
      { action: 'fadeIn', hold: 'short' },
      { action: 'scaleEmphasis', hold: 'short' },
      { action: 'circleMark', hold: 'long' },
    ],
  },
  {
    name: '轻轻出现',
    actions: [
      { action: 'fadeIn', hold: 'short' },
      { action: 'scaleEmphasis', hold: 'long' },
    ],
  },
  {
    name: '镜头靠近',
    actions: [
      { action: 'cameraPush', hold: 'short' },
      { action: 'scaleEmphasis', hold: 'long' },
    ],
  },
  {
    name: '标记一下',
    actions: [
      { action: 'circleMark', hold: 'long' },
    ],
  },
  {
    name: 'CTA 跳出',
    actions: [
      { action: 'popIn', hold: 'short' },
      { action: 'pulse', hold: 'long' },
    ],
  },
];

export interface FitMap { scale: number; offsetX: number; offsetY: number }

// contain：完整显示原图，不裁切，不足区域留在画布背景中
export function fitMap(iw: number, ih: number, cw: number, ch: number): FitMap {
  const scale = Math.min(cw / iw, ch / ih);
  return { scale, offsetX: (cw - iw * scale) / 2, offsetY: (ch - ih * scale) / 2 };
}

const SPEED_FRAMES: Record<Speed, number> = { slow: 27, normal: 18, fast: 11 };
const CAMERA_FRAMES: Record<Speed, number> = { slow: 30, normal: 22, fast: 14 };

// 单条 action 实际占用帧数 = 动画本身 + hold
function actionTotalFrames(a: AAction, item: AItem): number {
  const isCam = a.action.startsWith('camera') || a.action === 'focus';
  const base = (isCam ? CAMERA_FRAMES : SPEED_FRAMES)[item.speed];
  return base + HOLD_FRAMES[a.hold ?? 'short'];
}

// 把一条 AAction 展开成 SpecAction（不加 at，调用方计算）
function emitSpecAction(
  a: AAction, item: AItem, target: string, at: number, dur: number,
): SpecAction {
  const intensity = a.intensity ?? item.intensity;
  const direction = a.direction ?? item.direction;
  const speed = item.speed;
  if (a.action === 'cameraPush' || a.action === 'focus') {
    return { action: a.action, target: 'camera', at, duration: dur, region: undefined, dim: a.action === 'focus' ? 0.5 : undefined, speed, intensity };
  }
  if (a.action === 'cameraPull') {
    return { action: 'cameraPull', target: 'camera', at, duration: dur, speed, intensity };
  }
  return {
    action: a.action, target, at, duration: dur,
    speed, intensity,
    direction,
    ...(a.action === 'highlight' ? { color: 'rgba(232,163,61,0.55)' } : {}),
    ...(a.action === 'underlineDraw' || a.action === 'circleMark' ? { color: '#5EA8FF' } : {}),
  };
}

export function buildSpecA(opts: {
  imageSrc: string;
  imageW: number;
  imageH: number;
  aspect: AspectKey;
  items: AItem[];
  fps?: number;
}): AnimSpec {
  const { imageSrc, imageW, imageH, aspect, items } = opts;
  const fps = opts.fps ?? 30;
  const { w: cw, h: ch } = ASPECTS[aspect];
  const map = fitMap(imageW, imageH, cw, ch);

  const elements: SpecElement[] = [
    { id: 'base', kind: 'image', x: 0, y: 0, w: cw, h: ch, src: imageSrc, imageW, imageH, fit: 'contain', z: 0 },
  ];
  const actions: SpecAction[] = [];

  const toCanvas = (r: Region) => ({
    x: Math.round(r.x * map.scale + map.offsetX),
    y: Math.round(r.y * map.scale + map.offsetY),
    w: Math.round(r.w * map.scale),
    h: Math.round(r.h * map.scale),
  });

  let cursor = HEAD_PADDING_FRAMES;
  let prevChainStart = cursor;
  let prevChainEnd = cursor;

  items.forEach((it, idx) => {
    if (it.actions.length === 0) return;
    const elId = `r${idx}`;
    const cr = toCanvas(it.region);
    const hasNonCameraAction = it.actions.some((a) => !a.action.startsWith('camera') && a.action !== 'focus');
    if (hasNonCameraAction) {
      elements.push({
        id: elId, kind: 'imageRegion',
        x: cr.x, y: cr.y, w: cr.w, h: cr.h,
        src: imageSrc, imageW, imageH, region: it.region, z: 2,
      });
    }

    let chainStart: number;
    if (idx === 0) chainStart = cursor;
    else if (it.relation === 'same') chainStart = prevChainStart;
    else if (it.relation === 'later') chainStart = prevChainStart + RELATION_LATER_GAP;
    else chainStart = prevChainEnd;

    let t = chainStart;
    it.actions.forEach((a, i) => {
      const dur = actionTotalFrames(a, it);
      const target = a.action.startsWith('camera') || a.action === 'focus' ? 'camera' : elId;
      if (a.action === 'cameraPush' || a.action === 'focus') {
        const sp = emitSpecAction(a, it, target, t, dur);
        sp.region = cr;
        actions.push(sp);
      } else {
        actions.push(emitSpecAction(a, it, target, t, dur));
      }
      t += dur;
      if (i < it.actions.length - 1) t += CHAIN_GAP_FRAMES;
    });

    prevChainStart = chainStart;
    prevChainEnd = t;
    cursor = Math.max(cursor, t);
  });

  const durationInFrames = cursor + TAIL_PADDING_FRAMES;
  return {
    version: 1,
    meta: { width: cw, height: ch, fps, durationInFrames, title: '让图片动起来' },
    elements,
    actions,
  };
}

// ---------- 工具 ----------
export function effectByName(name: ActionName): { label: string; category: AEffectCategory; camera: boolean; needsDir: boolean } | null {
  for (const [cat, list] of Object.entries(A_EFFECTS) as [AEffectCategory, typeof A_EFFECTS[AEffectCategory]][]) {
    const found = list.find((e) => e.action === name);
    if (found) return { label: found.label, category: cat, camera: !!found.camera, needsDir: !!found.needsDir };
  }
  return null;
}
