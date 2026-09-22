#!/usr/bin/env node
/**
 * chenstricks Motion — PoC 渲染脚本
 *
 * 用法: JOB=chain-a-image node scripts/render.mjs
 *
 * 读取 jobs/<JOB>.json → bundle → selectComposition → renderMedia(MP4) → 输出关键帧 PNG
 * 并记录真实指标（耗时 / 峰值内存 / CPU 占用 / 文件大小）到 out/<JOB>/metrics.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const JOB = process.env.JOB;
if (!JOB) {
  console.error('缺少环境变量 JOB，例如: JOB=chain-a-image node scripts/render.mjs');
  process.exit(1);
}

const root = process.cwd();
const jobPath = path.join(root, 'jobs', `${JOB}.json`);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const outDir = path.join(root, 'out', JOB);
fs.mkdirSync(outDir, {recursive: true});

const concurrency = Number(job.concurrency ?? process.env.REMOTION_CONCURRENCY ?? 2);
const stills = Array.isArray(job.stills) ? job.stills : [];

// 编码参数（可被 job.encode 覆盖；默认值与 PoC 首轮一致）
const enc = job.encode ?? {};
const crf = enc.crf ?? 18;
const imageFormat = enc.imageFormat ?? 'jpeg';
const jpegQuality = enc.jpegQuality ?? 92;
const x264Preset = enc.x264Preset ?? 'medium';
const pixelFormat = enc.pixelFormat ?? 'yuv420p';

const summaryLines = [];
const say = (line) => {
  summaryLines.push(line);
  console.log(line);
  const s = process.env.GITHUB_STEP_SUMMARY;
  if (s) fs.appendFileSync(s, line + '\n');
};

const cpuTimes = () =>
  os.cpus().reduce(
    (acc, c) => {
      acc.busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
      acc.idle += c.times.idle;
      return acc;
    },
    {busy: 0, idle: 0},
  );

let peakRssKB = 0;
let sampler = null;
const startSampler = () => {
  sampler = setInterval(() => {
    try {
      const kb = Number(
        execSync(
          "ps -eo rss=,args= | grep -Ei 'chrome|headless|node' | grep -v grep | awk '{s+=$1} END{print s+0}'",
          {encoding: 'utf8'},
        ).trim() || 0,
      );
      if (kb > peakRssKB) peakRssKB = kb;
    } catch {
      /* 采样失败不影响渲染 */
    }
  }, 800);
};

const startedAt = new Date().toISOString();
const cpuStart = cpuTimes();
const wallStart = Date.now();
startSampler();

say(`## ${JOB}`);
say('');
say(`- 任务: ${job.description ?? ''}`);
say(`- Runner: ${os.platform()} ${os.arch()}, ${os.cpus().length} vCPU, ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB RAM`);
say(`- concurrency: ${concurrency}`);
say(`- 编码: h264 CRF ${crf} / 中间帧 ${imageFormat}${imageFormat === 'jpeg' ? ' q' + jpegQuality : ' (无损)'} / x264 preset ${x264Preset} / 像素格式 ${pixelFormat}`);

const bundleStart = Date.now();
const serveUrl = await bundle({
  entryPoint: path.join(root, 'src', 'index.ts'),
  onProgress: (p) => {
    if (p % 25 === 0) console.log(`bundle ${p}%`);
  },
});
const bundleMs = Date.now() - bundleStart;
say(`- bundle: ${(bundleMs / 1000).toFixed(1)}s`);

const composition = await selectComposition({
  serveUrl,
  id: job.composition,
  inputProps: job.composition === 'Spec' ? {spec: job.spec} : job.inputProps,
});
const selectMs = Date.now() - bundleStart - bundleMs;
say(
  `- composition: ${composition.width}x${composition.height} @${composition.fps}fps, ${composition.durationInFrames} 帧 (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`,
);

const mp4Path = path.join(outDir, `${JOB}.mp4`);
let lastLogged = 0;
const renderStart = Date.now();
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: mp4Path,
  inputProps: job.composition === 'Spec' ? {spec: job.spec} : job.inputProps,
  concurrency,
  imageFormat,
  jpegQuality,
  crf,
  x264Preset,
  pixelFormat,
  overwrite: true,
  onProgress: (p) => {
    const now = Date.now();
    if (now - lastLogged > 2500) {
      lastLogged = now;
      console.log(
        `render ${p.renderedFrames}/${composition.durationInFrames} 帧, encode ${p.encodedFrames}`,
      );
    }
  },
});
const renderMs = Date.now() - renderStart;
say(`- 渲染: ${(renderMs / 1000).toFixed(1)}s`);

const stillsStart = Date.now();
const stillFiles = [];
for (const f of stills) {
  const p = path.join(outDir, `still-${String(f).padStart(4, '0')}.png`);
  await renderStill({
    composition,
    serveUrl,
    inputProps: job.composition === 'Spec' ? {spec: job.spec} : job.inputProps,
    frame: f,
    output: p,
    imageFormat: 'png',
  });
  stillFiles.push(path.basename(p));
}
const stillsMs = Date.now() - stillsStart;

if (sampler) clearInterval(sampler);
const wallMs = Date.now() - wallStart;
const cpuEnd = cpuTimes();
const totalDelta = cpuEnd.busy + cpuEnd.idle - (cpuStart.busy + cpuStart.idle);
const busyDelta = cpuEnd.busy - cpuStart.busy;
const cpuBusyPercent = totalDelta > 0 ? (busyDelta / totalDelta) * 100 : 0;

const outputBytes = fs.statSync(mp4Path).size;
const bitrateKbps = +(((outputBytes * 8) / (composition.durationInFrames / composition.fps)) / 1000).toFixed(0);
const metrics = {
  job: JOB,
  composition: job.composition,
  description: job.description ?? '',
  encode: {codec: 'h264', crf, imageFormat, jpegQuality: imageFormat === 'jpeg' ? jpegQuality : null, x264Preset, pixelFormat},
  bitrateKbps,
  startedAt,
  finishedAt: new Date().toISOString(),
  bundleMs,
  selectMs,
  renderMs,
  stillsMs,
  totalMs: wallMs,
  frames: composition.durationInFrames,
  fps: composition.fps,
  width: composition.width,
  height: composition.height,
  videoSeconds: +(composition.durationInFrames / composition.fps).toFixed(2),
  concurrency,
  runner: {
    platform: `${os.platform()} ${os.arch()}`,
    vcpus: os.cpus().length,
    totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
  },
  peakRssMB: +(peakRssKB / 1024).toFixed(0),
  cpuBusyPercent: +cpuBusyPercent.toFixed(1),
  cpuCoreSeconds: +((os.cpus().length * (wallMs / 1000) * cpuBusyPercent) / 100).toFixed(1),
  outputBytes,
  outputMB: +(outputBytes / 1024 / 1024).toFixed(2),
  stills: stillFiles,
};

fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
say('');
say('| 指标 | 值 |');
say('| --- | --- |');
say(`| 输出时长 | ${metrics.videoSeconds}s (${metrics.frames} 帧 @${metrics.fps}) |`);
say(`| 渲染耗时 | ${(metrics.renderMs / 1000).toFixed(1)}s（bundle ${(bundleMs / 1000).toFixed(1)}s + 选区 ${(selectMs / 1000).toFixed(1)}s + 关键帧 ${(stillsMs / 1000).toFixed(1)}s） |`);
say(`| 整任务墙钟 | ${(metrics.totalMs / 1000).toFixed(1)}s |`);
say(`| 峰值内存(渲染进程树) | ${metrics.peakRssMB} MB |`);
say(`| 期间整机 CPU 占用 | ${metrics.cpuBusyPercent}% × ${metrics.runner.vcpus} vCPU（≈${metrics.cpuCoreSeconds} 核·秒） |`);
say(`| 输出大小 | ${metrics.outputMB} MB |`);
say(`| 编码参数 | h264 CRF ${crf} / 中间帧 ${imageFormat} / preset ${x264Preset} / 像素格式 ${pixelFormat} |`);
say(`| 实际码率 | ${bitrateKbps} kbps |`);
say(`| 关键帧 | ${stillFiles.join(', ') || '无'} |`);
say('');
console.log('metrics ->', path.join(outDir, 'metrics.json'));
