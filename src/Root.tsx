import React from 'react';
import {Composition} from 'remotion';
import chainA from '../jobs/chain-a-image.json';
import chainB from '../jobs/chain-b-compare.json';
import {ImageFocus, imageFocusDuration} from './templates/ImageFocus';
import {InfoCompare, infoCompareDuration} from './templates/InfoCompare';
import type {ImageFocusProps, InfoCompareProps} from './types';
import {SpecComposition} from './engine/SpecComposition';
import type {AnimSpec} from './spec/types';
import demoSpec from '../jobs/spec-demo.json';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Spec"
        component={SpecComposition}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{spec: demoSpec as unknown as AnimSpec}}
        calculateMetadata={({props}) => ({
          durationInFrames: props.spec.meta.durationInFrames,
          width: props.spec.meta.width,
          height: props.spec.meta.height,
          fps: props.spec.meta.fps,
        })}
      />
      <Composition
        id="ImageFocus"
        component={ImageFocus}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={chainA.inputProps as unknown as ImageFocusProps}
        calculateMetadata={({props}) => ({
          durationInFrames: imageFocusDuration(props),
        })}
      />
      <Composition
        id="InfoCompare"
        component={InfoCompare}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={chainB.inputProps as unknown as InfoCompareProps}
        calculateMetadata={({props}) => ({
          durationInFrames: infoCompareDuration(props),
        })}
      />
    </>
  );
};
