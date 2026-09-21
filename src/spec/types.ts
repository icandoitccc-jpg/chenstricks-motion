// Animation Spec v1 — 统一动画描述协议
// 功能A（图片区域动画）与功能B（信息动画）共用；预览(Player)与云端渲染(renderMedia)同源。

// ---------- 24 个封闭 Action 枚举（docs/animation-capability-library-v1.md） ----------
export const ACTION_NAMES = [
  'fadeIn', 'popIn', 'slideIn', 'reveal',
  'pulse', 'scaleEmphasis', 'shake', 'highlight',
  'underlineDraw', 'circleMark', 'drawArrow',
  'connect', 'connectArrow', 'stagger',
  'move', 'converge', 'diverge',
  'typeIn',
  'cameraPush', 'cameraPull', 'cameraPan', 'focus',
  'fadeOut', 'slideOut',
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

// ---------- 语义档位（用户/AI 只给档位，系统换算数值） ----------
export type Speed = 'slow' | 'normal' | 'fast';
export type Intensity = 'light' | 'normal' | 'strong';
export type Direction = 'up' | 'down' | 'left' | 'right';

// ---------- 元素 ----------
export type ElementKind =
  | 'image'        // 整图（功能A底图 / 功能B插图）
  | 'imageRegion'  // 图片局部裁切叠加副本（功能A框选区域）
  | 'text'         // 文本
  | 'box'          // 卡片/色块（圆角、描边、底色）
  | 'chip'         // 小标签/胶囊
  | 'line'         // 直线/连接线
  | 'arrow'        // 箭头（线+箭头头）
  | 'icon';        // 简单图形标记（对勾/圆点/叉）

export interface Region { x: number; y: number; w: number; h: number }

export interface SpecElement {
  id: string;
  kind: ElementKind;
  x: number;            // 画布坐标（排版引擎或用户框选产出）
  y: number;
  w?: number;           // text 可不设（自适应），其余建议设
  h?: number;
  z?: number;           // 层叠顺序，默认按声明顺序
  opacity?: number;     // 初始透明度（默认1）
  rotate?: number;

  // text
  text?: string;
  fontSize?: number;
  fontWeight?: number;  // 100-900（可变字体）
  color?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;

  // box / chip
  bg?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;

  // line / arrow
  x2?: number;          // 终点坐标（绝对）
  y2?: number;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  curved?: boolean;     // 手绘感微曲

  // image
  src?: string;         // staticFile 相对路径或 http(s) URL
  imageW?: number;      // 原图尺寸（imageRegion 定位需要）
  imageH?: number;
  region?: Region;      // imageRegion：原图中的裁切区域
  fit?: 'cover' | 'contain' | 'none';

  // icon
  icon?: 'check' | 'dot' | 'cross';

  style?: Record<string, string | number>; // 额外 CSS（兜底，少用）
}

// ---------- Action ----------
export interface SpecAction {
  action: ActionName;
  target: string;            // 元素 id；camera 类为 'camera'
  // 时间：两种方式二选一——
  at?: number;               // 绝对开始帧
  duration?: number;         // 持续帧（默认按 action 语义）
  beat?: string;             // 所属 beat id（编译后填 at/duration）
  offset?: number;           // beat 内偏移帧

  speed?: Speed;
  intensity?: Intensity;
  direction?: Direction;     // slideIn/slideOut/reveal/move
  to?: { x: number; y: number };        // move 目标位置
  color?: string;            // highlight 颜色 / 标记颜色
  from?: Region;             // cameraPush/cameraPan 起点区域
  region?: Region;           // cameraPush/focus 目标区域
  dim?: number;              // focus 压暗程度 0-1（默认0.55）
  targets?: string[];        // stagger/converge/diverge 多目标
  staggerGap?: number;       // stagger 间隔帧
}

// ---------- Beat（叙事节拍层） ----------
export interface Beat {
  id: string;
  label?: string;            // 「建立主题」等，给用户看
  purpose?: 'establish' | 'expand' | 'turn' | 'compare' | 'emphasize' | 'close';
  after?: string;            // 在哪个 beat 之后（默认顺序衔接）
  withPrevious?: boolean;    // 与上一 beat 同时开始
  gapAfterPrev?: number;     // 与上一 beat 间隔帧（默认按节奏）
}

// ---------- Spec ----------
export interface AnimSpec {
  version: 1;
  meta: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    background?: string;     // 画布底色（功能B）
    title?: string;
  };
  elements: SpecElement[];
  beats?: Beat[];
  actions: SpecAction[];
}

// ---------- 排版引擎输入（功能B Director 输出，语义层，无坐标） ----------
export type StructureName =
  | 'Comparison' | 'Flow' | 'Progression'
  | 'Divergence' | 'Convergence' | 'Focus';

export interface DirectorOutput {
  meaning: string;
  primaryStructure: StructureName;
  title?: string;                 // 画面上屏标题（精简后）
  subtitle?: string;
  left?: { label: string; steps: string[] };    // Comparison
  right?: { label: string; steps: string[] };
  steps?: string[];               // Flow / Progression
  center?: string;                // Divergence / Convergence 中心
  items?: string[];               // Divergence / Convergence 分支 / Focus 列表
  conclusion?: string;            // Convergence 结论 / Focus 落点
  emphasis?: string[];            // 需要强调的文字（与上屏文字匹配）
  beats?: { label: string; purpose?: Beat['purpose'] }[];
  style?: { accent?: string };    // V1 仅 chenstricks 默认风格，accent 可覆盖
}
