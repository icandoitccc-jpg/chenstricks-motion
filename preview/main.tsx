import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import chainA from '../jobs/chain-a-image.json';
import chainB from '../jobs/chain-b-compare.json';
import {ImageFocus, imageFocusDuration} from '../src/templates/ImageFocus';
import {InfoCompare, infoCompareDuration} from '../src/templates/InfoCompare';
import type {ImageFocusProps, InfoCompareProps} from '../src/types';

const aProps = chainA.inputProps as unknown as ImageFocusProps;
const bProps = chainB.inputProps as unknown as InfoCompareProps;

const playerStyle: React.CSSProperties = {width: '100%'};

const mount = (id: string, node: React.ReactElement) => {
  const el = document.getElementById(id);
  if (el) {
    createRoot(el).render(node);
  }
};

mount(
  'player-a',
  <Player
    component={ImageFocus}
    inputProps={aProps}
    durationInFrames={imageFocusDuration(aProps)}
    compositionWidth={1920}
    compositionHeight={1080}
    fps={30}
    style={playerStyle}
    controls
    autoPlay
    loop
  />,
);

mount(
  'player-b',
  <Player
    component={InfoCompare}
    inputProps={bProps}
    durationInFrames={infoCompareDuration(bProps)}
    compositionWidth={1920}
    compositionHeight={1080}
    fps={30}
    style={playerStyle}
    controls
    autoPlay
    loop
  />,
);
