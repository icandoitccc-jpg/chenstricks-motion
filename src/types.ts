export type RegionEffect =
  | 'appear'
  | 'slideUp'
  | 'pop'
  | 'float'
  | 'highlight'
  | 'drawLine';

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Line = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
};

export type Region = {
  id: string;
  effect: RegionEffect;
  box?: Box;
  line?: Line;
  startFrame: number;
  durationFrames?: number;
  scale?: number;
  cover?: string;
};

export type ImageFocusProps = {
  image: string;
  width: number;
  height: number;
  regions: Region[];
};

export type Side = {
  title: string;
  steps: string[];
};

export type InfoCompareProps = {
  kind: 'comparison';
  title?: string;
  left: Side;
  right: Side;
  emphasis?: string[];
  outro?: string;
};
