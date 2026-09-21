import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

export const FONT_FAMILY = 'NotoSansSC';

// 预览（浏览器）与云端渲染（Chromium）加载同一个字体文件，
// 保证文字排版在两边完全一致 —— 这是「预览 = 成品」的前提之一。
loadFont({
  family: FONT_FAMILY,
  url: staticFile('fonts/NotoSansSC-VF.ttf'),
  weight: '100 900',
});
