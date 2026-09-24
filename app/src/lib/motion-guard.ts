// Motion Guard —— 确定性冲突守卫（V1）
//
// 定位：只处理「会坏 / 会看不到 / camera 或 state 冲突 / 明确 artifact 或 state leak」。
// 不判断「好不好看」「这个内容语义上该用什么动画」—— 那类判断需要理解内容，V1 不做。
//
// 处理优先级（锁定）：
//   正常允许 → 能自动修则隐形修复 → 无法可靠修复才禁止
// 自动修复（camera reset / pull / delay）完全隐形，不暴露给用户；
// 只有无法可靠自动修复时才 disable 对应选项，并给一句简短的人话原因。
//
// 兼容性判断不只按 Action 类型，还要看 target / Region 的位置：
// 例如 cameraPush 猫头时，同时强调猫头附近元素完全合理；但强调左上角 Logo 可能已在 viewport 外。
// V1 用现有 Region bounding box + camera viewport 做确定性判断，不做复杂视觉算法。
//
// 不是一个 plugin framework / 通用 rule engine：一张声明式 metadata 表 + 一个小 guard 函数。
import type { ActionName, Region } from '../../../src/spec/types';
import type { AItem } from './spec-builder-a';

// ---------- Action metadata registry ----------
// 新增 Action 时只需在这里登记它的性质，不要再往 if/else 里补分支。
export type ActionKind = 'appear' | 'emphasis' | 'mark' | 'camera' | 'exit';

export interface ActionMeta {
  kind: ActionKind;
  // 是否写入全局 camera state（cameraPush / cameraPull / cameraPan / focus）
  mutatesCamera: boolean;
  // 结束后是否需要把 camera 复位到 base，否则后续 Region 可能跑出画面
  needsCameraReset: boolean;
  // 是否留下会污染同元素后续动作的持久视觉状态（如 fadeOut/slideOut 的暗罩 veil）
  leakingState: boolean;
}

// 未登记动作的保守默认值（不写 camera、不留残留状态）
const DEFAULT_META: ActionMeta = {
  kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false,
};

export const ACTION_META: Record<ActionName, ActionMeta> = {
  // 出现
  fadeIn: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  popIn: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  slideIn: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  reveal: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  typeIn: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  stagger: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  diverge: { kind: 'appear', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  // 强调
  pulse: { kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  scaleEmphasis: { kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  shake: { kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  move: { kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  converge: { kind: 'emphasis', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  // 标记（高亮/圈划的结果本就应该留在原地，与 circleMark 同性质，不算 leak）
  highlight: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  underlineDraw: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  circleMark: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  drawArrow: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  connect: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  connectArrow: { kind: 'mark', mutatesCamera: false, needsCameraReset: false, leakingState: false },
  // 镜头
  cameraPush: { kind: 'camera', mutatesCamera: true, needsCameraReset: true, leakingState: false },
  cameraPan: { kind: 'camera', mutatesCamera: true, needsCameraReset: true, leakingState: false },
  // focus 的 dim 会残留，但它是 camera state，由自动复位一并清掉
  focus: { kind: 'camera', mutatesCamera: true, needsCameraReset: true, leakingState: true },
  cameraPull: { kind: 'camera', mutatesCamera: true, needsCameraReset: false, leakingState: false },
  // 消失（veil 会残留且污染后续动作 → V1 在 action lifecycle 层释放）
  fadeOut: { kind: 'exit', mutatesCamera: false, needsCameraReset: false, leakingState: true },
  slideOut: { kind: 'exit', mutatesCamera: false, needsCameraReset: false, leakingState: true },
};

export function actionMeta(a: ActionName): ActionMeta {
  return ACTION_META[a] ?? DEFAULT_META;
}

export function itemMutatesCamera(it: AItem): boolean {
  return it.actions.some((a) => actionMeta(a.action).mutatesCamera);
}

// ---------- 常量 ----------
// 跨 Region 镜头复位时长：拉回全图所需帧数（不与 push 重叠，保证不会互相打架）
export const CAMERA_RESET_FRAMES = 10;
// 「同时」时，另一个 Region 在镜头视野里至少要有这么大比例可见，否则判定为「跑出画面」
const MIN_VISIBLE_FRACTION = 0.25;

// 与引擎共用同一套 camera 数学（保证 Guard 的预测 === 引擎的渲染结果）
const MAX_PUSH_SCALE = 1.45;
function camTransformFor(region: Region, W: number, H: number) {
  const scale = Math.min(Math.min(W / region.w, H / region.h) * 0.78, MAX_PUSH_SCALE);
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
  return { scale, tx: W / 2 - cx * scale, ty: H / 2 - cy * scale };
}

// 某 Region 在给定 camera transform 下的可见面积占比（0~1）
function visibleFraction(region: Region, cam: { scale: number; tx: number; ty: number }, W: number, H: number): number {
  const x = region.x * cam.scale + cam.tx;
  const y = region.y * cam.scale + cam.ty;
  const w = region.w * cam.scale;
  const h = region.h * cam.scale;
  const ix0 = Math.max(x, 0), iy0 = Math.max(y, 0);
  const ix1 = Math.min(x + w, W), iy1 = Math.min(y + h, H);
  const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
  const area = Math.max(1, w * h);
  return (iw * ih) / area;
}

// ---------- 计划输入 ----------
export interface GuardInput {
  items: AItem[];                 // 仅含「有 actions」的 Region（已过滤）
  canvasRegions: Region[];        // 每个 item 的 region（画布坐标）
  chainFrames: number[];          // 每个 item 链的总帧数
  camEndOffset: number[];         // 链内最后一个改 camera 的动作的结束偏移；无则 -1
  canvasW: number;
  canvasH: number;
  headPadding: number;
  laterGap: number;
}

export interface GuardPlan {
  startAt: number[];                                  // 每个 item 的安全起始帧
  pulls: { at: number; duration: number }[];          // 自动插入的镜头复位（隐形）
  sameBlocked: (string | null)[];                     // 「同时」被禁的原因；null = 允许
}

// 「同时」是否被禁 + 原因。只在这两种情况禁用：
//   1) 两个动作确实争夺同一个 camera state（都是镜头动作）
//   2) 镜头 transform 让另一个 target 无法合理可见（跑出画面）
// 其余情况（含「镜头 + 附近元素同时」）一律允许。
export function sameBlockReasons(inp: GuardInput): (string | null)[] {
  const out: (string | null)[] = inp.items.map(() => null);
  for (let i = 1; i < inp.items.length; i++) {
    if (inp.items[i].relation !== 'same') continue;
    // 找到这个「同时」并发组的锚点，组内所有会改 camera 的 Region 都要检查
    let g = i - 1;
    while (g > 0 && inp.items[g].relation === 'same') g--;
    const camIdx: number[] = [];
    for (let k = g; k < i; k++) if (inp.camEndOffset[k] >= 0) camIdx.push(k);

    if (inp.camEndOffset[i] >= 0 && camIdx.length > 0) {
      out[i] = '两个镜头动作不能同时（一台镜头只能对准一个位置），已按「接着」播放';
      continue;
    }
    for (const k of camIdx) {
      const cam = camTransformFor(inp.canvasRegions[k], inp.canvasW, inp.canvasH);
      const frac = visibleFraction(inp.canvasRegions[i], cam, inp.canvasW, inp.canvasH);
      if (frac < MIN_VISIBLE_FRACTION) {
        out[i] = '此区域会在当前镜头画面外（看不见），已按「接着」播放';
        break;
      }
    }
  }
  return out;
}

// 主 Guard：产出安全起始帧 + 自动复位动作 + 禁用原因。
export function guardPlan(inp: GuardInput): GuardPlan {
  const sameBlocked = sameBlockReasons(inp);
  const startAt: number[] = [];
  const pulls: { at: number; duration: number }[] = [];
  let prevStart = inp.headPadding;
  let prevEnd = inp.headPadding;

  for (let i = 0; i < inp.items.length; i++) {
    const it = inp.items[i];
    // 被禁的「同时」在构建层静默回退为「接着」，保证永远不会产出坏片子
    const relation = (i > 0 && it.relation === 'same' && sameBlocked[i]) ? 'after' : it.relation;

    let start: number;
    if (i === 0) start = inp.headPadding;
    else if (relation === 'same') start = prevStart;
    else if (relation === 'later') start = prevStart + inp.laterGap;
    else start = prevEnd;

    // —— 自动修复（隐形）：上一个 Region 改过 camera → 必须先把镜头拉回全图再进入本 Region。
    // 「稍后」的产品语义不变（用户选的仍是「稍后」），Guard 只是把实际 start 延后到安全位置，
    // 避免 camera push / pull 在同一段时间里互相打架。
    if (i > 0 && relation !== 'same' && inp.camEndOffset[i - 1] >= 0) {
      const prevCamEndAbs = prevStart + inp.camEndOffset[i - 1];
      const safeStart = prevCamEndAbs + CAMERA_RESET_FRAMES;
      if (start < safeStart) start = safeStart;
      // 复位永远在 start 那一刻收尾，且整段都在 push 结束之后 → 不会重叠
      pulls.push({ at: start - CAMERA_RESET_FRAMES, duration: CAMERA_RESET_FRAMES });
    }

    startAt[i] = start;
    prevStart = start;
    prevEnd = start + inp.chainFrames[i];
  }

  return { startAt, pulls, sameBlocked };
}

// UI 便捷入口：给定完整 items + 图像/画布尺寸，算出每个 item 的「同时」禁用原因。
export function sameBlockReasonsForUI(opts: {
  items: AItem[]; imageW: number; imageH: number; canvasW: number; canvasH: number;
}): (string | null)[] {
  const { items, imageW, imageH, canvasW, canvasH } = opts;
  const scale = Math.min(canvasW / imageW, canvasH / imageH);
  const offsetX = (canvasW - imageW * scale) / 2;
  const offsetY = (canvasH - imageH * scale) / 2;
  const toCanvas = (r: Region): Region => ({
    x: Math.round(r.x * scale + offsetX),
    y: Math.round(r.y * scale + offsetY),
    w: Math.round(r.w * scale),
    h: Math.round(r.h * scale),
  });
  const active = items.filter((i) => i.actions.length > 0);
  const inp: GuardInput = {
    items: active,
    canvasRegions: active.map((i) => toCanvas(i.region)),
    chainFrames: active.map(() => 0),      // 禁用判断不需要时长
    camEndOffset: active.map((i) => (itemMutatesCamera(i) ? 0 : -1)),
    canvasW, canvasH, headPadding: 0, laterGap: 0,
  };
  const blocked = sameBlockReasons(inp);
  // 映射回原始 items 下标（空 Region 一律不禁用）
  const out: (string | null)[] = items.map(() => null);
  let k = 0;
  items.forEach((it, idx) => {
    if (it.actions.length > 0) { out[idx] = blocked[k]; k++; }
  });
  return out;
}
