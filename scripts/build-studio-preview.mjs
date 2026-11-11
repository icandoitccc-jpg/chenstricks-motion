import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const dir = await mkdtemp(path.join(tmpdir(), 'motion-preview-'));
try {
  await build({ entryPoints: ['app/src/studio-standalone.tsx'], bundle: true, minify: true, format: 'iife', platform: 'browser', outfile: path.join(dir, 'studio.js'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  const js = (await readFile(path.join(dir, 'studio.js'), 'utf8')).replace(/<\/script/gi, '<\\/script');
  const css = await readFile(path.join(dir, 'studio.css'), 'utf8');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion · 口播工作台测试版</title><style>html,body{margin:0;padding:0}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
  await mkdir('../outputs', { recursive: true });
  await writeFile('../outputs/Motion_Studio_Preview.html', html);
  console.log(`Standalone preview: ../outputs/Motion_Studio_Preview.html (${Math.round(Buffer.byteLength(html) / 1024)} KB). No server or model needed.`);
} finally { await rm(dir, { recursive: true, force: true }); }
