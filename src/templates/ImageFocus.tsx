import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {FONT_FAMILY} from '../fonts';
import {AMBER, INK} from '../theme';
import type {ImageFocusProps, Region} from '../types';

// 补丁外扩边距：允许小幅度位移/浮动而不露出底图
const PAD = 24;

export const imageFocusDuration = (props: ImageFocusProps): number => {
  const end = props.regions.reduce(
    (max, r) => Math.max(max, r.startFrame + (r.durationFrames ?? 20)),
    0,
  );
  return Math.max(120, end + 36);
};

const clampOps = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const RegionView: React.FC<{region: Region; image: string; width: number; height: number}> = ({
  region,
  image,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const url = staticFile(image);
  const start = region.startFrame;
  const dur = region.durationFrames ?? 20;
  const local = frame - start;

  const t = interpolate(frame, [start, start + dur], [0, 1], clampOps);
  const pulse = spring({
    frame: local,
    fps,
    config: {damping: 9, mass: 0.5, stiffness: 170},
  });

  // drawLine：叠加一条被「画出来」的线，不需要区域补丁
  if (region.effect === 'drawLine' && region.line) {
    const {x1, y1, x2, y2} = region.line;
    const len = Math.hypot(x2 - x1, y2 - y1);
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{position: 'absolute', top: 0, left: 0}}
      >
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={region.line.color ?? AMBER}
          strokeWidth={region.line.width ?? 8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - t)}
        />
      </svg>
    );
  }

  const box = region.box;
  if (!box) {
    return null;
  }

  const px = box.x - PAD;
  const py = box.y - PAD;
  const pw = box.w + PAD * 2;
  const ph = box.h + PAD * 2;

  let opacity = 1;
  let scale = 1;
  let dx = 0;
  let dy = 0;

  if (region.effect === 'appear') {
    opacity = t;
    scale = 0.88 + 0.12 * pulse;
  } else if (region.effect === 'slideUp') {
    opacity = t;
    dy = (1 - pulse) * 36;
  } else if (region.effect === 'pop') {
    scale = 1 + (region.scale ?? 0.14) * pulse;
  } else if (region.effect === 'float') {
    const phase = (local / dur) * Math.PI * 2;
    scale = 1 + 0.018 * Math.sin(phase);
    dy = -7 * Math.sin(phase);
  } else if (region.effect === 'highlight') {
    scale = 1 + (region.scale ?? 0.08) * pulse;
  }

  const patchStyle: React.CSSProperties = {
    position: 'absolute',
    left: px,
    top: py,
    width: pw,
    height: ph,
    backgroundImage: `url("${url}")`,
    backgroundSize: `${width}px ${height}px`,
    backgroundPosition: `${-px}px ${-py}px`,
    transformOrigin: 'center center',
    transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
    opacity,
  };

  return (
    <>
      {region.cover ? (
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            backgroundColor: region.cover,
          }}
        />
      ) : null}
      {region.effect === 'highlight' ? (
        <div
          style={{
            position: 'absolute',
            left: box.x - 14,
            top: box.y - 14,
            width: box.w + 28,
            height: box.h + 28,
            borderRadius: 22,
            border: `6px solid ${AMBER}`,
            opacity: t * 0.85,
          }}
        />
      ) : null}
      <div style={patchStyle} />
    </>
  );
};

export const ImageFocus: React.FC<ImageFocusProps> = ({image, width, height, regions}) => {
  return (
    <AbsoluteFill style={{backgroundColor: INK, fontFamily: FONT_FAMILY}}>
      <Img
        src={staticFile(image)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
      {regions.map((r) => (
        <RegionView key={r.id} region={r} image={image} width={width} height={height} />
      ))}
    </AbsoluteFill>
  );
};
