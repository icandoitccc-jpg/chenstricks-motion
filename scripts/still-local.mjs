// 本地 still 渲染（用系统 Chrome，PNG，不需要 ffmpeg）。
// 把 bundle 输出和 webpack temp 都搬进 workspace，避开 macOS tmp 目录的 shim 拦截。
// 用法：
//   JOB=v2-quality FRAMES=30,70,100,130,160 node scripts/still-local.mjs
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// 把所有临时目录钉在 workspace 里（Remotion 的 webpack 中间目录、Remotion bundle 都用 os.tmpdir）
const localTmp = path.join('/Users/chenchen/WorkBuddy AI/2026-09-22-14-42-39', '.workbuddy-ai', 'remotion-tmp');
fs.mkdirSync(localTmp, { recursive: true });
process.env.TMPDIR = localTmp;
process.env.TMP = localTmp;
process.env.TEMP = localTmp;
// 触发 os.tmpdir 重新读取（部分平台缓存）
os.tmpdir();

const JOB = process.env.JOB;
if (!JOB) { console.error('missing JOB'); process.exit(1); }
const FRAMES = (process.env.FRAMES || '').split(',').filter(Boolean).map(Number);
const SUFFIX = process.env.SUFFIX ? '-' + process.env.SUFFIX : '';

const root = '/Users/chenchen/Workbuddy/2026-09-21-14-17-03/chenstricks-motion';
const job = JSON.parse(fs.readFileSync(path.join(root, 'jobs', JOB + '.json'), 'utf8'));
const outDir = path.join(root, 'out', JOB + SUFFIX);
const bundleOutDir = path.join(root, 'out', '.bundle-' + JOB);
// bundleOutDir 由 Remotion 自己 mkdir；必须先清掉旧目录，
// 否则 Remotion 的 mkdir 撞上已存在目录会被 shim 判成 EEXIST 拒绝
if (fs.existsSync(bundleOutDir)) fs.rmSync(bundleOutDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const { bundle } = await import('@remotion/bundler');
const { renderStill, selectComposition } = await import('@remotion/renderer');

const browserExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const logLevel = 'warn';

const t0 = Date.now();
const serveUrl = await bundle({
  entryPoint: path.join(root, 'src', 'index.ts'),
  outDir: bundleOutDir,
  enableCaching: false,
  onProgress: () => {},
  logLevel,
});
console.log('[bundle]', serveUrl, (Date.now() - t0) + 'ms');

const inputProps = job.composition === 'Spec' ? { spec: job.spec } : job.inputProps;
const composition = await selectComposition({
  serveUrl,
  id: job.composition,
  inputProps,
  browserExecutable,
  logLevel,
});
console.log('[select]', composition.id, composition.width + 'x' + composition.height,
  'dur=' + composition.durationInFrames);

const frames = FRAMES.length ? FRAMES : (job.stills ?? []);
for (const f of frames) {
  const out = path.join(outDir, 'still-' + String(f).padStart(4, '0') + '.png');
  await renderStill({
    composition,
    serveUrl,
    inputProps,
    frame: f,
    output: out,
    imageFormat: 'png',
    browserExecutable,
    logLevel,
  });
  console.log('[renderStill] frame', f, '→', path.relative(root, out));
}
console.log('[done] total', Date.now() - t0, 'ms');