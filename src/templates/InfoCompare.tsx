import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {FONT_FAMILY} from '../fonts';
import {AMBER, CREAM, INK, MUTED, PANEL, PANEL_STROKE} from '../theme';
import type {InfoCompareProps, Side} from '../types';

const PANEL_W = 700;
const PANEL_H = 560;
const PANEL_Y = 260;
const LEFT_X = 200;
const RIGHT_X = 1020;

export const infoCompareDuration = (props: InfoCompareProps): number => {
  const maxSteps = Math.max(props.left.steps.length, props.right.steps.length);
  const stepsEnd = 82 + (maxSteps - 1) * 14 + 12;
  const emphasisAt = stepsEnd + 30;
  const outroAt = emphasisAt + 52;
  return outroAt + 40;
};

const clampOps = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const Panel: React.FC<{
  side: Side;
  x: number;
  enterFrame: number;
  stepBase: number;
  emphasis?: string;
  emphasisFrame: number;
}> = ({side, x, enterFrame, stepBase, emphasis, emphasisFrame}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: frame - enterFrame,
    fps,
    config: {damping: 16, mass: 0.7, stiffness: 110},
  });

  const ePulse = spring({
    frame: frame - emphasisFrame,
    fps,
    config: {damping: 10, mass: 0.5, stiffness: 150},
  });
  const eT = interpolate(frame, [emphasisFrame, emphasisFrame + 10], [0, 1], clampOps);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: PANEL_Y,
        width: PANEL_W,
        height: PANEL_H,
        borderRadius: 36,
        backgroundColor: PANEL,
        border: `2px solid ${PANEL_STROKE}`,
        opacity: interpolate(frame, [enterFrame, enterFrame + 14], [0, 1], clampOps),
        transform: `translateX(${(1 - enter) * (x === LEFT_X ? -70 : 70)}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 52,
          top: 44,
          fontSize: 72,
          fontWeight: 700,
          color: CREAM,
        }}
      >
        {side.title}
      </div>

      {emphasis ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 52 + side.title.length * 76 + 30,
              top: 20,
              width: 150,
              height: 150,
              borderRadius: 75,
              border: `5px solid ${AMBER}`,
              opacity: eT * 0.45,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 52 + side.title.length * 76 + 30,
              top: 20,
              width: 150,
              height: 150,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 92,
              fontWeight: 700,
              color: AMBER,
              transform: `scale(${0.4 + 0.6 * ePulse})`,
              opacity: eT,
            }}
          >
            {emphasis}
          </div>
        </>
      ) : null}

      {side.steps.map((step, i) => {
        const s = stepBase + i * 14;
        const p = spring({
          frame: frame - s,
          fps,
          config: {damping: 15, mass: 0.6, stiffness: 120},
        });
        const o = interpolate(frame, [s, s + 12], [0, 1], clampOps);
        const rowY = 250 + i * 74;
        return (
          <React.Fragment key={step + i}>
            {i > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 68,
                  top: rowY - 46,
                  width: 2,
                  height: 34,
                  backgroundColor: PANEL_STROKE,
                  opacity: o * 0.9,
                }}
              />
            ) : null}
            <div
              style={{
                position: 'absolute',
                left: 52,
                top: rowY,
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                opacity: o,
                transform: `translateX(${(1 - p) * -18}px)`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  border: `3px solid ${AMBER}`,
                }}
              />
              <div style={{fontSize: 42, fontWeight: 500, color: CREAM}}>{step}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const InfoCompare: React.FC<InfoCompareProps> = ({
  title,
  left,
  right,
  emphasis,
  outro,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const maxSteps = Math.max(left.steps.length, right.steps.length);
  const emphasisFrame = 82 + (maxSteps - 1) * 14 + 12 + 30;
  const outroFrame = emphasisFrame + 52;

  const titleP = spring({frame: frame - 4, fps, config: {damping: 15}});
  const titleO = interpolate(frame, [4, 18], [0, 1], clampOps);
  const vsP = spring({frame: frame - 46, fps, config: {damping: 9, mass: 0.5, stiffness: 160}});
  const outroO = interpolate(frame, [outroFrame, outroFrame + 16], [0, 1], clampOps);

  return (
    <AbsoluteFill style={{backgroundColor: INK, fontFamily: FONT_FAMILY}}>
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 58,
          fontWeight: 700,
          color: CREAM,
          opacity: titleO,
          transform: `translateY(${(1 - titleP) * 24}px)`,
        }}
      >
        {title}
      </div>

      <Panel
        side={left}
        x={LEFT_X}
        enterFrame={16}
        stepBase={70}
        emphasis={emphasis?.[0]}
        emphasisFrame={emphasisFrame}
      />
      <Panel
        side={right}
        x={RIGHT_X}
        enterFrame={26}
        stepBase={82}
        emphasis={emphasis?.[1]}
        emphasisFrame={emphasisFrame}
      />

      <div
        style={{
          position: 'absolute',
          left: 912,
          top: PANEL_Y + PANEL_H / 2 - 48,
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: AMBER,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 40,
          fontWeight: 700,
          color: INK,
          transform: `scale(${vsP})`,
        }}
      >
        vs
      </div>

      {outro ? (
        <div
          style={{
            position: 'absolute',
            top: 940,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 44,
            fontWeight: 500,
            color: MUTED,
            opacity: outroO,
          }}
        >
          {outro}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
