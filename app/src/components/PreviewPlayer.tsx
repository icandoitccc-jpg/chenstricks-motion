// 预览播放器：与云端渲染共用 SpecComposition + 同一份 spec（预览=成品的结构保证）
import React from 'react';
import { Player } from '@remotion/player';
import { SpecComposition } from '../../../src/engine/SpecComposition';
import type { AnimSpec } from '../../../src/spec/types';

export const PreviewPlayer: React.FC<{ spec: AnimSpec; autoPlay?: boolean; style?: React.CSSProperties }> = ({
  spec, autoPlay = true, style,
}) => {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--stroke)', background: '#000', ...style }}>
      <Player
        component={SpecComposition}
        inputProps={{ spec }}
        durationInFrames={spec.meta.durationInFrames}
        compositionWidth={spec.meta.width}
        compositionHeight={spec.meta.height}
        fps={spec.meta.fps}
        controls
        autoPlay={autoPlay}
        loop
        style={{ width: '100%', aspectRatio: `${spec.meta.width} / ${spec.meta.height}` }}
      />
    </div>
  );
};
